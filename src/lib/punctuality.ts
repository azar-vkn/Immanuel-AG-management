// Punctuality — how many members were marked before a service started, and
// how far after.
//
// Two things make this less obvious than it looks:
//
// 1. `markedAt` is when the volunteer (or the camera) marked someone, NOT when
//    they physically arrived. Those are close when the entrance camera is
//    doing the work, and minutes apart when someone is marked by barcode or
//    name search. That is why the breakdown is opt-in per event.
//
// 2. A single event can cover two back-to-back services, with attendance for
//    both marked under it. Measuring everyone against one start time would
//    count the whole second congregation as hopelessly late, so each member is
//    judged against the service they actually came to.

import { Attendance, ChurchEvent } from '@/types';

/** Minutes after the start still counted as "slightly late" rather than late. */
export const GRACE_MINUTES = 15;

export interface PunctualityStats {
  /** Marked before the start time. */
  onTime: number;
  /** Marked within GRACE_MINUTES after the start. */
  slightlyLate: number;
  /** Marked more than GRACE_MINUTES after the start. */
  late: number;
  /** Counted in the percentages: onTime + slightlyLate + late. */
  measured: number;
}

export interface ServicePunctuality {
  /** "1st service" / "2nd service", or empty when the event has only one. */
  label: string;
  start: Date;
  stats: PunctualityStats;
}

export interface PunctualityBreakdown {
  services: ServicePunctuality[];
  /** Marked, but with no usable timestamp — cannot be assigned to a service. */
  unknownTime: number;
  /** Everyone marked present, assigned or not. */
  totalMarked: number;
}

/**
 * Turn a "YYYY-MM-DD" date and "HH:mm" time into a Date.
 *
 * Joining them without a timezone suffix makes the browser read them as local
 * time, which is what we want — `markedAt` is a real instant, so comparing the
 * two is correct regardless of the machine's timezone.
 */
const toLocalDate = (date?: string, time?: string): Date | null => {
  if (!date || !time) return null;
  const when = new Date(`${date}T${time}`);
  return Number.isNaN(when.getTime()) ? null : when;
};

/**
 * Every service start on this event, earliest first.
 *
 * One entry for a normal event, two when a second service time is set. The
 * second is ignored if it is not after the first, since that is a typo rather
 * than a meaningful ordering.
 */
export const getServiceStarts = (event: ChurchEvent): Date[] => {
  const first = toLocalDate(event.date, event.time);
  if (!first) return [];
  const second = toLocalDate(event.date, event.secondServiceTime);
  return second && second > first ? [first, second] : [first];
};

/** Backwards-compatible: the first (or only) service start. */
export const getEventStart = (event: ChurchEvent): Date | null =>
  getServiceStarts(event)[0] ?? null;

/** Whether this event should show a punctuality breakdown at all. */
export const isPunctualityTracked = (event: ChurchEvent): boolean =>
  !!event.trackPunctuality && getServiceStarts(event).length > 0;

const emptyStats = (): PunctualityStats => ({
  onTime: 0,
  slightlyLate: 0,
  late: 0,
  measured: 0,
});

/**
 * Which service a given mark belongs to: whichever start it is nearest to.
 *
 * For two services that is the midpoint between them — with services at 08:00
 * and 10:30, anything before 09:15 belongs to the first. That splits cleanly
 * when there is a real gap, which is the case for back-to-back services.
 */
const nearestServiceIndex = (stamp: number, starts: Date[]): number => {
  let best = 0;
  let bestGap = Math.abs(stamp - starts[0].getTime());
  for (let i = 1; i < starts.length; i++) {
    const gap = Math.abs(stamp - starts[i].getTime());
    if (gap < bestGap) {
      bestGap = gap;
      best = i;
    }
  }
  return best;
};

/**
 * Bucket one event's attendance by how late each member was marked, split by
 * service.
 *
 * Duplicate records for the same member collapse to their earliest mark,
 * matching the Reports column: if someone was caught by both entrance PCs, the
 * first sighting is the one that reflects when they arrived.
 */
export const calculatePunctuality = (
  event: ChurchEvent,
  attendance: Attendance[],
): PunctualityBreakdown | null => {
  const starts = getServiceStarts(event);
  if (starts.length === 0) return null;

  const earliestByMember = new Map<string, number | null>();

  attendance
    .filter((a) => a.eventId === event.id)
    .forEach((a) => {
      const stamp = a.markedAt ? new Date(a.markedAt).getTime() : Number.NaN;
      const usable = Number.isNaN(stamp) ? null : stamp;

      if (!earliestByMember.has(a.memberId)) {
        earliestByMember.set(a.memberId, usable);
        return;
      }
      const existing = earliestByMember.get(a.memberId) ?? null;
      // A real timestamp always beats a missing one; otherwise keep the earlier.
      if (existing === null || (usable !== null && usable < existing)) {
        earliestByMember.set(a.memberId, usable);
      }
    });

  const multi = starts.length > 1;
  const services: ServicePunctuality[] = starts.map((start, i) => ({
    label: multi ? `${i + 1}${i === 0 ? 'st' : 'nd'} service` : '',
    start,
    stats: emptyStats(),
  }));

  const graceMs = GRACE_MINUTES * 60 * 1000;
  let unknownTime = 0;

  earliestByMember.forEach((stamp) => {
    if (stamp === null) {
      unknownTime++;
      return;
    }
    const service = services[nearestServiceIndex(stamp, starts)];
    const startMs = service.start.getTime();
    service.stats.measured++;
    if (stamp < startMs) service.stats.onTime++;
    else if (stamp <= startMs + graceMs) service.stats.slightlyLate++;
    else service.stats.late++;
  });

  return { services, unknownTime, totalMarked: earliestByMember.size };
};

/** Share of the measured members in a bucket, 0-100. Zero when none measured. */
export const percentOf = (count: number, measured: number): number =>
  measured > 0 ? Math.round((count / measured) * 100) : 0;
