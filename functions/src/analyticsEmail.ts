import * as admin from 'firebase-admin';

const db = admin.firestore();

// ==================== EMAIL TRANSPORT ====================

const createTransport = () => {
  // Lazy import to avoid deployment timeout
  const nodemailer = require('nodemailer');
  
  const email = process.env.GMAIL_EMAIL || '';
  const password = process.env.GMAIL_PASSWORD || '';
  
  if (!email || !password) {
    throw new Error('Gmail credentials not configured. Set GMAIL_EMAIL and GMAIL_PASSWORD environment variables.');
  }
  
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: email, pass: password },
  });
};

// ==================== ANALYTICS DATA COLLECTION ====================

interface EventAnalytics {
  eventName: string;
  eventDate: string;
  eventTime?: string;
  eventDescription?: string;
  totalRegistered: number;
  totalAttendees: number;
  attendancePercentage: number;
  maleCount: number;
  femaleCount: number;
  volunteerCount: number;
  fellowshipBreakdown: Record<string, { registered: number; present: number }>;
  /** Null unless the event opted into punctuality tracking. */
  punctuality: PunctualityBreakdown | null;
}

/** Minutes after a start still counted as "slightly late". Matches the app. */
const GRACE_MINUTES = 15;

interface ServicePunctuality {
  label: string;
  startLabel: string;
  onTime: number;
  slightlyLate: number;
  late: number;
  measured: number;
}

interface PunctualityBreakdown {
  services: ServicePunctuality[];
  unknownTime: number;
  totalMarked: number;
}

/**
 * Punctuality, deliberately duplicated from src/lib/punctuality.ts.
 *
 * Cloud Functions build separately from the browser app and cannot import
 * across that boundary. The rules must stay in step with that file: measured
 * against each service start, GRACE_MINUTES window, duplicates collapsed to
 * the earliest mark, members assigned to the nearer service start.
 */
const toLocalDate = (date?: string, time?: string): Date | null => {
  if (!date || !time) return null;
  const when = new Date(`${date}T${time}`);
  return isNaN(when.getTime()) ? null : when;
};

const getServiceStarts = (event: any): Date[] => {
  const first = toLocalDate(event.date, event.time);
  if (!first) return [];
  const second = toLocalDate(event.date, event.secondServiceTime);
  return second && second > first ? [first, second] : [first];
};

const formatStart = (d: Date): string =>
  d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

const buildPunctuality = (
  event: any,
  attendanceDocs: { memberId: string; markedAt?: string }[],
): PunctualityBreakdown | null => {
  if (!event.trackPunctuality) return null;
  const starts = getServiceStarts(event);
  if (starts.length === 0) return null;

  // Earliest usable mark per member: someone caught by both entrance PCs is
  // counted once, at the time they actually arrived.
  const earliest = new Map<string, number | null>();
  for (const a of attendanceDocs) {
    const raw = a.markedAt ? new Date(a.markedAt).getTime() : NaN;
    const usable = isNaN(raw) ? null : raw;
    if (!earliest.has(a.memberId)) {
      earliest.set(a.memberId, usable);
      continue;
    }
    const existing = earliest.get(a.memberId) ?? null;
    if (existing === null || (usable !== null && usable < existing)) {
      earliest.set(a.memberId, usable);
    }
  }

  const multi = starts.length > 1;
  const services: ServicePunctuality[] = starts.map((start, i) => ({
    label: multi ? `${i + 1}${i === 0 ? 'st' : 'nd'} service` : 'Service',
    startLabel: formatStart(start),
    onTime: 0,
    slightlyLate: 0,
    late: 0,
    measured: 0,
  }));

  const graceMs = GRACE_MINUTES * 60 * 1000;
  let unknownTime = 0;

  earliest.forEach((stamp) => {
    if (stamp === null) {
      unknownTime++;
      return;
    }
    let idx = 0;
    let bestGap = Math.abs(stamp - starts[0].getTime());
    for (let i = 1; i < starts.length; i++) {
      const gap = Math.abs(stamp - starts[i].getTime());
      if (gap < bestGap) {
        bestGap = gap;
        idx = i;
      }
    }
    const svc = services[idx];
    const startMs = starts[idx].getTime();
    svc.measured++;
    if (stamp < startMs) svc.onTime++;
    else if (stamp <= startMs + graceMs) svc.slightlyLate++;
    else svc.late++;
  });

  return { services, unknownTime, totalMarked: earliest.size };
};

export const collectEventAnalytics = async (eventId: string): Promise<EventAnalytics> => {
  // Get event
  const eventDoc = await db.collection('events').doc(eventId).get();
  if (!eventDoc.exists) throw new Error(`Event ${eventId} not found`);
  const event = eventDoc.data()!;

  // Get all members
  const membersSnap = await db.collection('members').get();
  const allMembers = membersSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

  // Get attendance for this event
  const attendanceSnap = await db.collection('attendance')
    .where('eventId', '==', eventId)
    .get();
  const attendanceRecords = attendanceSnap.docs.map(d => d.data() as { memberId: string; markedAt?: string });
  const attendeeIds = new Set(attendanceRecords.map(a => a.memberId));

  // Filter eligible members
  const eventFellowships: string[] = event.fellowships || [];
  const eligibleMembers = allMembers.filter(m => {
    if (m.status === 'expired') return false;
    if (eventFellowships.length === 0) return true;
    const fellowship = m.fellowship || '';
    return eventFellowships.includes(fellowship);
  });

  const totalRegistered = eligibleMembers.length;
  const totalAttendees = attendeeIds.size;
  const attendancePercentage = totalRegistered > 0
    ? Math.round((totalAttendees / totalRegistered) * 100)
    : 0;

  // Gender breakdown (from attendees)
  let maleCount = 0;
  let femaleCount = 0;
  let volunteerCount = 0;
  
  for (const member of allMembers) {
    if (attendeeIds.has(member.id)) {
      if (member.gender === 'male') maleCount++;
      else if (member.gender === 'female') femaleCount++;
      if (member.churchRole === 'volunteer') volunteerCount++;
    }
  }

  // Fellowship breakdown
  const fellowshipBreakdown: Record<string, { registered: number; present: number }> = {};
  for (const member of eligibleMembers) {
    const f = member.fellowship || 'Uncategorized';
    if (!fellowshipBreakdown[f]) fellowshipBreakdown[f] = { registered: 0, present: 0 };
    fellowshipBreakdown[f].registered++;
    if (attendeeIds.has(member.id)) fellowshipBreakdown[f].present++;
  }

  return {
    eventName: event.name,
    eventDate: event.date,
    eventTime: event.time,
    eventDescription: event.description,
    totalRegistered,
    totalAttendees,
    attendancePercentage,
    maleCount,
    femaleCount,
    volunteerCount,
    fellowshipBreakdown,
    punctuality: buildPunctuality(event, attendanceRecords),
  };
};

// ==================== HTML EMAIL TEMPLATE ====================
// Multi-platform compatible: Gmail, Outlook, Apple Mail, Yahoo, mobile clients
// Uses table-based layout, inline styles, MSO conditionals, white & gold color scheme

export const generateAnalyticsHTML = (data: EventAnalytics): string => {
  const GOLD = '#C8A951';
  const GOLD_LIGHT = '#F5EDD6';
  const GOLD_DARK = '#A8872E';
  const WHITE = '#FFFFFF';
  const TEXT_PRIMARY = '#1A1A2E';
  const TEXT_SECONDARY = '#555555';
  const TEXT_MUTED = '#888888';
  const BG_PAGE = '#F4F1EB';
  const BORDER = '#E8E0D0';
  const GREEN = '#2E7D32';
  const GREEN_BG = '#E8F5E9';
  const BLUE = '#1565C0';
  const BLUE_BG = '#E3F2FD';

  const fellowshipRows = Object.entries(data.fellowshipBreakdown)
    .map(([name, stats], idx) => {
      const pct = stats.registered > 0 ? Math.round((stats.present / stats.registered) * 100) : 0;
      const bgColor = idx % 2 === 0 ? '#FAFAF7' : WHITE;
      return `
                          <tr>
                            <td style="padding:12px 16px;border-bottom:1px solid ${BORDER};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:${TEXT_PRIMARY};background-color:${bgColor};">${name}</td>
                            <td style="padding:12px 16px;border-bottom:1px solid ${BORDER};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:${TEXT_SECONDARY};text-align:center;background-color:${bgColor};">${stats.registered}</td>
                            <td style="padding:12px 16px;border-bottom:1px solid ${BORDER};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:${TEXT_SECONDARY};text-align:center;background-color:${bgColor};">${stats.present}</td>
                            <td style="padding:12px 16px;border-bottom:1px solid ${BORDER};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:${GOLD_DARK};text-align:center;background-color:${bgColor};">${pct}%</td>
                          </tr>`;
    })
    .join('');

  // Arrival-time rows, one block per service.
  const AMBER = '#B26A00';
  const RED = '#C62828';
  const punctualityRows = (data.punctuality?.services ?? [])
    .filter((svc) => svc.measured > 0)
    .map((svc) => {
      const pct = (n: number) => (svc.measured > 0 ? Math.round((n / svc.measured) * 100) : 0);
      const cell = (text: string, color: string, weight: string, align: string, bg: string) =>
        `<td style="padding:12px 16px;border-bottom:1px solid ${BORDER};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:${weight};color:${color};text-align:${align};background-color:${bg};">${text}</td>`;
      const band = (label: string, count: number, color: string, bg: string) => `
                          <tr>
                            ${cell(label, TEXT_PRIMARY, '400', 'left', bg)}
                            ${cell(String(count), TEXT_SECONDARY, '400', 'center', bg)}
                            ${cell(pct(count) + '%', color, '600', 'center', bg)}
                          </tr>`;
      return `
                          <tr>
                            <td colspan="3" style="padding:14px 16px 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:${TEXT_PRIMARY};background-color:${WHITE};">
                              ${svc.label} &mdash; starts ${svc.startLabel} &middot; ${svc.measured} marked
                            </td>
                          </tr>
                          ${band('On time', svc.onTime, GREEN, '#FAFAF7')}
                          ${band('Within ' + GRACE_MINUTES + ' min', svc.slightlyLate, AMBER, WHITE)}
                          ${band('Late', svc.late, RED, '#FAFAF7')}`;
    })
    .join('');

  const generatedTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no" />
  <title>Event Analytics Report - ${data.eventName}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:AllowPNG/>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    /* Reset */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    /* Mobile responsive */
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; }
      .fluid { width: 100% !important; max-width: 100% !important; height: auto !important; }
      .stack-column { display: block !important; width: 100% !important; max-width: 100% !important; }
      .stack-column-center { text-align: center !important; }
      .mobile-padding { padding-left: 16px !important; padding-right: 16px !important; }
      .metric-cell { display: block !important; width: 100% !important; padding: 8px 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BG_PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <!-- Preheader (hidden preview text) -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${data.eventName} &mdash; ${data.totalAttendees}/${data.totalRegistered} attendees (${data.attendancePercentage}% attendance)
  </div>

  <!-- Background wrapper -->
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${BG_PAGE};">
    <tr>
      <td align="center" style="padding:24px 8px;">
        <!--[if mso]>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" align="center"><tr><td>
        <![endif]-->
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;" class="email-container">

          <!-- ============ HEADER ============ -->
          <tr>
            <td style="background-color:${GOLD};padding:32px 24px;text-align:center;">
              <!--[if gte mso 9]>
              <v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:100px;">
                <v:fill type="tile" color="${GOLD}" />
                <v:textbox inset="0,0,0,0" style="mso-fit-shape-to-text:true">
              <![endif]-->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding:0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="font-family:Georgia,'Times New Roman',Times,serif;font-size:26px;font-weight:700;color:${WHITE};letter-spacing:0.5px;padding-bottom:6px;">
                          &#10013; Immanuel AG Church
                        </td>
                      </tr>
                      <tr>
                        <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:${WHITE};letter-spacing:1px;text-transform:uppercase;">
                          Event Analytics Report
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <!--[if gte mso 9]>
                </v:textbox>
              </v:rect>
              <![endif]-->
            </td>
          </tr>

          <!-- ============ GOLD ACCENT LINE ============ -->
          <tr>
            <td style="background-color:${GOLD_DARK};height:3px;font-size:1px;line-height:1px;">&nbsp;</td>
          </tr>

          <!-- ============ EVENT INFO ============ -->
          <tr>
            <td style="background-color:${WHITE};padding:28px 32px;" class="mobile-padding">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-family:Georgia,'Times New Roman',Times,serif;font-size:22px;font-weight:700;color:${TEXT_PRIMARY};padding-bottom:10px;line-height:1.3;">
                    ${data.eventName}
                  </td>
                </tr>
                <tr>
                  <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:${TEXT_SECONDARY};padding-bottom:${data.eventDescription ? '12' : '0'}px;">
                    &#128197; ${data.eventDate}${data.eventTime ? ` &nbsp;&bull;&nbsp; &#128336; ${data.eventTime}` : ''}
                  </td>
                </tr>
                ${data.eventDescription ? `
                <tr>
                  <td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:${TEXT_SECONDARY};line-height:1.5;font-style:italic;">
                    ${data.eventDescription}
                  </td>
                </tr>` : ''}
              </table>
            </td>
          </tr>

          <!-- ============ DIVIDER ============ -->
          <tr>
            <td style="background-color:${WHITE};padding:0 32px;" class="mobile-padding">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr><td style="border-top:1px solid ${BORDER};font-size:1px;line-height:1px;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- ============ KEY METRICS ============ -->
          <tr>
            <td style="background-color:${WHITE};padding:24px 32px;" class="mobile-padding">
              <!-- Section title -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-family:Georgia,'Times New Roman',Times,serif;font-size:17px;font-weight:700;color:${TEXT_PRIMARY};padding-bottom:6px;">
                    Key Metrics
                  </td>
                </tr>
                <tr>
                  <td style="border-bottom:2px solid ${GOLD};width:50px;font-size:1px;line-height:1px;padding-bottom:16px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-bottom:2px solid ${GOLD};width:50px;font-size:1px;line-height:1px;">&nbsp;</td></tr></table>
                  </td>
                </tr>
              </table>

              <!-- Metrics cards -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td class="metric-cell" width="32%" style="padding:0 4px 0 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${GREEN_BG};border:1px solid #C8E6C9;">
                      <tr>
                        <td align="center" style="padding:16px 8px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:30px;font-weight:700;color:${GREEN};line-height:1;">
                                ${data.totalAttendees}
                              </td>
                            </tr>
                            <tr>
                              <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:${TEXT_MUTED};padding-top:6px;text-transform:uppercase;letter-spacing:0.5px;">
                                Attendees
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td class="metric-cell" width="32%" style="padding:0 4px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${BLUE_BG};border:1px solid #BBDEFB;">
                      <tr>
                        <td align="center" style="padding:16px 8px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:30px;font-weight:700;color:${BLUE};line-height:1;">
                                ${data.totalRegistered}
                              </td>
                            </tr>
                            <tr>
                              <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:${TEXT_MUTED};padding-top:6px;text-transform:uppercase;letter-spacing:0.5px;">
                                Registered
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td class="metric-cell" width="32%" style="padding:0 0 0 4px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${GOLD_LIGHT};border:1px solid ${GOLD};">
                      <tr>
                        <td align="center" style="padding:16px 8px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:30px;font-weight:700;color:${GOLD_DARK};line-height:1;">
                                ${data.attendancePercentage}%
                              </td>
                            </tr>
                            <tr>
                              <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:${TEXT_MUTED};padding-top:6px;text-transform:uppercase;letter-spacing:0.5px;">
                                Attendance
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ============ DIVIDER ============ -->
          <tr>
            <td style="background-color:${WHITE};padding:0 32px;" class="mobile-padding">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr><td style="border-top:1px solid ${BORDER};font-size:1px;line-height:1px;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>

          <!-- ============ DEMOGRAPHICS ============ -->
          <tr>
            <td style="background-color:${WHITE};padding:24px 32px;" class="mobile-padding">
              <!-- Section title -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-family:Georgia,'Times New Roman',Times,serif;font-size:17px;font-weight:700;color:${TEXT_PRIMARY};padding-bottom:6px;">
                    Demographics
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:16px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-bottom:2px solid ${GOLD};width:50px;font-size:1px;line-height:1px;">&nbsp;</td></tr></table>
                  </td>
                </tr>
              </table>

              <!-- Demographics cards -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td class="metric-cell" width="32%" style="padding:0 4px 0 0;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#F5F5F5;border:1px solid #E0E0E0;">
                      <tr>
                        <td align="center" style="padding:14px 8px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;color:${BLUE};line-height:1;">
                                ${data.maleCount}
                              </td>
                            </tr>
                            <tr>
                              <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:${TEXT_MUTED};padding-top:5px;text-transform:uppercase;letter-spacing:0.5px;">
                                Male
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td class="metric-cell" width="32%" style="padding:0 4px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#FFF3F8;border:1px solid #F8BBD0;">
                      <tr>
                        <td align="center" style="padding:14px 8px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;color:#AD1457;line-height:1;">
                                ${data.femaleCount}
                              </td>
                            </tr>
                            <tr>
                              <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:${TEXT_MUTED};padding-top:5px;text-transform:uppercase;letter-spacing:0.5px;">
                                Female
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td class="metric-cell" width="32%" style="padding:0 0 0 4px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${GREEN_BG};border:1px solid #C8E6C9;">
                      <tr>
                        <td align="center" style="padding:14px 8px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:26px;font-weight:700;color:${GREEN};line-height:1;">
                                ${data.volunteerCount}
                              </td>
                            </tr>
                            <tr>
                              <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:${TEXT_MUTED};padding-top:5px;text-transform:uppercase;letter-spacing:0.5px;">
                                Volunteers
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ============ ARRIVAL TIMES ============ -->
          ${punctualityRows ? `
          <!-- Divider -->
          <tr>
            <td style="background-color:${WHITE};padding:0 32px;" class="mobile-padding">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr><td style="border-top:1px solid ${BORDER};font-size:1px;line-height:1px;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:${WHITE};padding:24px 32px;" class="mobile-padding">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-family:Georgia,'Times New Roman',Times,serif;font-size:17px;font-weight:700;color:${TEXT_PRIMARY};padding-bottom:6px;">
                    Arrival Times
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:16px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-bottom:2px solid ${GOLD};width:50px;font-size:1px;line-height:1px;">&nbsp;</td></tr></table>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid ${BORDER};">
                <tr>
                  <td style="padding:10px 16px;background-color:${BG_PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:${TEXT_SECONDARY};text-transform:uppercase;letter-spacing:0.5px;">When marked</td>
                  <td style="padding:10px 16px;background-color:${BG_PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:${TEXT_SECONDARY};text-align:center;text-transform:uppercase;letter-spacing:0.5px;">Members</td>
                  <td style="padding:10px 16px;background-color:${BG_PAGE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;color:${TEXT_SECONDARY};text-align:center;text-transform:uppercase;letter-spacing:0.5px;">Share</td>
                </tr>
                ${punctualityRows}
              </table>

              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="padding-top:10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:${TEXT_MUTED};line-height:1.5;">
                    ${data.punctuality && data.punctuality.unknownTime > 0 ? `${data.punctuality.unknownTime} marked without a recorded time, excluded from the shares above. ` : ''}Based on when each member was marked, which matches arrival closely for the entrance camera and less so for barcode or search.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- ============ FELLOWSHIP BREAKDOWN ============ -->
          ${Object.keys(data.fellowshipBreakdown).length > 0 ? `
          <!-- Divider -->
          <tr>
            <td style="background-color:${WHITE};padding:0 32px;" class="mobile-padding">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr><td style="border-top:1px solid ${BORDER};font-size:1px;line-height:1px;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:${WHITE};padding:24px 32px;" class="mobile-padding">
              <!-- Section title -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td style="font-family:Georgia,'Times New Roman',Times,serif;font-size:17px;font-weight:700;color:${TEXT_PRIMARY};padding-bottom:6px;">
                    Fellowship Breakdown
                  </td>
                </tr>
                <tr>
                  <td style="padding-bottom:16px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-bottom:2px solid ${GOLD};width:50px;font-size:1px;line-height:1px;">&nbsp;</td></tr></table>
                  </td>
                </tr>
              </table>

              <!-- Fellowship table -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid ${BORDER};">
                <thead>
                  <tr>
                    <th style="padding:12px 16px;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:${GOLD_DARK};text-transform:uppercase;letter-spacing:0.8px;background-color:${GOLD_LIGHT};border-bottom:2px solid ${GOLD};">Fellowship</th>
                    <th style="padding:12px 16px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:${GOLD_DARK};text-transform:uppercase;letter-spacing:0.8px;background-color:${GOLD_LIGHT};border-bottom:2px solid ${GOLD};">Registered</th>
                    <th style="padding:12px 16px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:${GOLD_DARK};text-transform:uppercase;letter-spacing:0.8px;background-color:${GOLD_LIGHT};border-bottom:2px solid ${GOLD};">Present</th>
                    <th style="padding:12px 16px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:${GOLD_DARK};text-transform:uppercase;letter-spacing:0.8px;background-color:${GOLD_LIGHT};border-bottom:2px solid ${GOLD};">%</th>
                  </tr>
                </thead>
                <tbody>
                  ${fellowshipRows}
                </tbody>
              </table>
            </td>
          </tr>
          ` : ''}

          <!-- ============ FOOTER ============ -->
          <tr>
            <td style="background-color:${GOLD};padding:24px 32px;text-align:center;" class="mobile-padding">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:${WHITE};line-height:1.5;">
                    Generated automatically by<br />
                    <strong>Immanuel AG Church Management System</strong>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.75);padding-top:8px;">
                    ${generatedTime}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!--[if mso]>
        </td></tr></table>
        <![endif]-->
      </td>
    </tr>
  </table>
</body>
</html>`;
};

// ==================== SEND EMAIL ====================

export const sendAnalyticsEmail = async (
  eventId: string,
  maxRetries: number = 3
): Promise<{ success: boolean; error?: string }> => {
  // Check if already sent
  const eventDoc = await db.collection('events').doc(eventId).get();
  if (!eventDoc.exists) return { success: false, error: 'Event not found' };
  
  const eventData = eventDoc.data()!;
  if (eventData.analyticsSent) {
    console.log(`Analytics already sent for event ${eventId}, skipping.`);
    return { success: true };
  }

  // Check settings
  const settingsDoc = await db.collection('analytics_email_settings').doc('default').get();
  if (!settingsDoc.exists) return { success: false, error: 'Analytics email not configured' };
  
  const settings = settingsDoc.data()!;
  if (!settings.enabled) {
    console.log('Analytics email disabled, skipping.');
    return { success: false, error: 'Analytics email is disabled' };
  }

  const recipients: string[] = settings.recipients || [];
  if (recipients.length === 0) return { success: false, error: 'No recipients configured' };

  // Collect analytics
  const analytics = await collectEventAnalytics(eventId);
  const html = generateAnalyticsHTML(analytics);

  // Create log entry
  const logRef = await db.collection('analytics_email_logs').add({
    eventId,
    eventName: analytics.eventName,
    eventDate: analytics.eventDate,
    recipients,
    status: 'pending',
    retryCount: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    totalRegistered: analytics.totalRegistered,
    totalAttendees: analytics.totalAttendees,
    attendancePercentage: analytics.attendancePercentage,
    maleCount: analytics.maleCount,
    femaleCount: analytics.femaleCount,
  });

  // Send with retries
  let lastError = '';
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const transport = createTransport();
      const senderName = settings.senderName || 'Immanuel AG Church';
      const senderEmail = process.env.GMAIL_EMAIL || '';

      await transport.sendMail({
        from: `"${senderName}" <${senderEmail}>`,
        to: recipients.join(', '),
        subject: `📊 Event Analytics: ${analytics.eventName} — ${analytics.attendancePercentage}% Attendance`,
        html,
      });

      // Mark success
      await logRef.update({
        status: 'sent',
        retryCount: attempt,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Mark event as analytics sent
      await db.collection('events').doc(eventId).update({
        analyticsSent: true,
        analyticsSentAt: new Date().toISOString(),
      });

      console.log(`Analytics email sent for event ${eventId} on attempt ${attempt}`);
      return { success: true };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Attempt ${attempt}/${maxRetries} failed:`, lastError);
      
      // Update retry count
      await logRef.update({ retryCount: attempt });

      // Exponential backoff
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }

  // All retries failed
  await logRef.update({
    status: 'failed',
    errorMessage: lastError,
  });

  return { success: false, error: lastError };
};

// ==================== TEST EMAIL ====================

export const sendTestEmail = async (recipientEmail: string): Promise<{ success: boolean; error?: string }> => {
  const testData: EventAnalytics = {
    eventName: 'Sunday Service (Test)',
    eventDate: new Date().toISOString().split('T')[0],
    eventTime: '10:00 AM',
    eventDescription: 'This is a test analytics email to verify your email configuration.',
    totalRegistered: 120,
    totalAttendees: 95,
    attendancePercentage: 79,
    maleCount: 42,
    femaleCount: 53,
    volunteerCount: 12,
    fellowshipBreakdown: {
      'Youth Boys Fellowship': { registered: 25, present: 20 },
      'Youth Girls Fellowship': { registered: 22, present: 18 },
      "Men's Fellowship": { registered: 30, present: 25 },
      "Women's Fellowship": { registered: 28, present: 22 },
      'Children': { registered: 15, present: 10 },
    },
    // Two services, so the test email previews the layout the church
    // actually gets rather than a simpler single-service one.
    punctuality: {
      services: [
        { label: '1st service', startLabel: '07:00 AM', onTime: 31, slightlyLate: 9, late: 5, measured: 45 },
        { label: '2nd service', startLabel: '09:00 AM', onTime: 28, slightlyLate: 12, late: 7, measured: 47 },
      ],
      unknownTime: 3,
      totalMarked: 95,
    },
  };

  const html = generateAnalyticsHTML(testData);

  try {
    const transport = createTransport();
    const settingsDoc = await db.collection('analytics_email_settings').doc('default').get();
    const senderName = settingsDoc.exists ? settingsDoc.data()?.senderName || 'Immanuel AG Church' : 'Immanuel AG Church';
    const senderEmail = process.env.GMAIL_EMAIL || '';

    await transport.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: recipientEmail,
      subject: '📊 [TEST] Event Analytics: Sunday Service — 79% Attendance',
      html,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};
