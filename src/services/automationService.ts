// Automation Service — Firestore CRUD + business logic for the Automations module
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  Automation,
  AutomationTemplate,
  AutomationLog,
  AutomationType,
  DeliveryStatus,
  WhatsAppSettings,
  AutomationDashboardStats,
  Member,
} from '@/types';

// Collection names
const COLLECTIONS = {
  AUTOMATIONS: 'automations',
  TEMPLATES: 'automation_templates',
  LOGS: 'automation_logs',
  WHATSAPP_SETTINGS: 'whatsapp_settings',
  MEMBERS: 'members',
} as const;

// Helper: convert Firestore timestamp to string
const timestampToString = (ts: Timestamp | string | null | undefined): string => {
  if (!ts) return '';
  if (ts instanceof Timestamp) return ts.toDate().toISOString();
  if (typeof ts === 'string') return ts;
  if (typeof ts === 'object' && 'seconds' in (ts as { seconds: number })) {
    return new Date((ts as { seconds: number }).seconds * 1000).toISOString();
  }
  return '';
};

// ==================== DEFAULT AUTOMATION CONFIGS ====================

const DEFAULT_BIRTHDAY_TEMPLATE = `🎉 இனிய பிறந்தநாள் வாழ்த்துக்கள்!

கர்த்தர் உங்களை சந்தோஷம், சமாதானம், ஆரோக்கியம் மற்றும் ஆசீர்வாதங்களால் நிரப்புவாராக.

"கர்த்தர் உன்னை ஆசீர்வதித்து உன்னைக் காக்கக்கடவர்."
— எண்ணாகமம் 6:24

— இம்மானுவேல் AG திருச்சபை 🙏🏻`;

const DEFAULT_ANNIVERSARY_TEMPLATE = `💍 இனிய திருமண நாள் வாழ்த்துக்கள்!

தேவன் உங்கள் குடும்பத்தை அன்பு, சந்தோஷம், சமாதானம் மற்றும் கிருபையால் நிரப்பி தொடர்ந்து ஆசீர்வதிப்பாராக.

"அன்பு நீடிய சாந்தமும் தயவும் உடையது; அன்பு ஒருகாலும் ஒழியாது."
— 1 கொரிந்தியர் 13:4,8

— இம்மானுவேல் AG திருச்சபை 🙏🏻`;

interface DefaultAutomation {
  type: AutomationType;
  name: string;
  description: string;
  scheduleTime: string;
  template: {
    name: string;
    body: string;
    variables: string[];
  };
}

const DEFAULT_AUTOMATIONS: DefaultAutomation[] = [
  {
    type: 'birthday',
    name: 'Birthday Wishes',
    description: 'Send automated birthday wishes to members via WhatsApp',
    scheduleTime: '08:00',
    template: {
      name: 'Birthday Wish Template',
      body: DEFAULT_BIRTHDAY_TEMPLATE,
      variables: ['member_name'],
    },
  },
  {
    type: 'anniversary',
    name: 'Wedding Anniversary Wishes',
    description: 'Send automated wedding anniversary wishes to members via WhatsApp',
    scheduleTime: '08:00',
    template: {
      name: 'Anniversary Wish Template',
      body: DEFAULT_ANNIVERSARY_TEMPLATE,
      variables: ['member_name'],
    },
  },
];

// ==================== AUTOMATIONS CRUD ====================

export const getAutomations = async (): Promise<Automation[]> => {
  const querySnapshot = await getDocs(collection(db, COLLECTIONS.AUTOMATIONS));
  return querySnapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
    createdAt: timestampToString(docSnap.data().createdAt),
    updatedAt: timestampToString(docSnap.data().updatedAt),
    lastRunAt: timestampToString(docSnap.data().lastRunAt),
  })) as Automation[];
};

export const getAutomation = async (automationId: string): Promise<Automation | null> => {
  const docRef = doc(db, COLLECTIONS.AUTOMATIONS, automationId);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    createdAt: timestampToString(data.createdAt),
    updatedAt: timestampToString(data.updatedAt),
    lastRunAt: timestampToString(data.lastRunAt),
  } as Automation;
};

export const getAutomationByType = async (type: AutomationType): Promise<Automation | null> => {
  const q = query(collection(db, COLLECTIONS.AUTOMATIONS), where('type', '==', type));
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) return null;
  const docSnap = querySnapshot.docs[0];
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    createdAt: timestampToString(data.createdAt),
    updatedAt: timestampToString(data.updatedAt),
    lastRunAt: timestampToString(data.lastRunAt),
  } as Automation;
};

export const updateAutomation = async (id: string, data: Partial<Automation>): Promise<void> => {
  const docRef = doc(db, COLLECTIONS.AUTOMATIONS, id);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  } as DocumentData);
};

// ==================== TEMPLATES CRUD ====================

export const getAutomationTemplates = async (): Promise<AutomationTemplate[]> => {
  const querySnapshot = await getDocs(collection(db, COLLECTIONS.TEMPLATES));
  return querySnapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
    createdAt: timestampToString(docSnap.data().createdAt),
    updatedAt: timestampToString(docSnap.data().updatedAt),
  })) as AutomationTemplate[];
};

export const getTemplateByType = async (type: AutomationType): Promise<AutomationTemplate | null> => {
  const q = query(collection(db, COLLECTIONS.TEMPLATES), where('automationType', '==', type));
  const querySnapshot = await getDocs(q);
  if (querySnapshot.empty) return null;
  const docSnap = querySnapshot.docs[0];
  return {
    id: docSnap.id,
    ...docSnap.data(),
    createdAt: timestampToString(docSnap.data().createdAt),
    updatedAt: timestampToString(docSnap.data().updatedAt),
  } as AutomationTemplate;
};

export const updateTemplate = async (id: string, data: Partial<AutomationTemplate>): Promise<void> => {
  const docRef = doc(db, COLLECTIONS.TEMPLATES, id);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  } as DocumentData);
};

// ==================== LOGS CRUD ====================

export const getAutomationLogs = async (filters?: {
  automationType?: AutomationType;
  status?: DeliveryStatus;
  limitCount?: number;
}): Promise<AutomationLog[]> => {
  let q;
  const constraints: Parameters<typeof query>[1][] = [];

  // We intentionally remove `orderBy` here to prevent Firestore from requiring
  // a composite index when paired with equality filters (`where`).
  // Instead, we will sort the results client-side below.
  if (filters?.automationType) {
    constraints.push(where('automationType', '==', filters.automationType));
  }
  if (filters?.status) {
    constraints.push(where('status', '==', filters.status));
  }

  q = query(collection(db, COLLECTIONS.LOGS), ...constraints);
  const querySnapshot = await getDocs(q);
  
  let logs = querySnapshot.docs.map((docSnap) => {
    const data = docSnap.data() as any;
    return {
      id: docSnap.id,
      ...data,
      sentAt: timestampToString(data.sentAt),
      deliveredAt: timestampToString(data.deliveredAt),
      createdAt: timestampToString(data.createdAt),
    } as AutomationLog;
  });

  // Client-side sort by createdAt descending
  logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Client-side limit
  if (filters?.limitCount) {
    logs = logs.slice(0, filters.limitCount);
  }

  return logs;
};

export const getTodayLogs = async (): Promise<AutomationLog[]> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTimestamp = Timestamp.fromDate(today);

  const q = query(
    collection(db, COLLECTIONS.LOGS),
    where('createdAt', '>=', todayTimestamp),
    orderBy('createdAt', 'desc')
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((docSnap) => {
    const data = docSnap.data() as any;
    return {
      id: docSnap.id,
      ...data,
      sentAt: timestampToString(data.sentAt),
      deliveredAt: timestampToString(data.deliveredAt),
      createdAt: timestampToString(data.createdAt),
    } as AutomationLog;
  });
};

export const createAutomationLog = async (
  logData: Omit<AutomationLog, 'id' | 'createdAt'>
): Promise<string> => {
  const docRef = await addDoc(collection(db, COLLECTIONS.LOGS), {
    ...logData,
    createdAt: Timestamp.now(),
    sentAt: Timestamp.now(),
  });
  return docRef.id;
};

/**
 * Check if a message was already sent today for a specific member and automation type.
 * Prevents duplicate sends.
 */
export const hasAlreadySentToday = async (
  memberId: string,
  automationType: AutomationType
): Promise<boolean> => {
  const logs = await getTodayLogs();
  return logs.some(
    (log) => log.memberId === memberId && log.automationType === automationType
  );
};

// ==================== WHATSAPP SETTINGS ====================

const SETTINGS_DOC_ID = 'default';

export const getWhatsAppSettings = async (): Promise<WhatsAppSettings | null> => {
  const docRef = doc(db, COLLECTIONS.WHATSAPP_SETTINGS, SETTINGS_DOC_ID);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    updatedAt: timestampToString(data.updatedAt),
    lastSuccessfulCall: timestampToString(data.lastSuccessfulCall),
  } as WhatsAppSettings;
};

export const saveWhatsAppSettings = async (
  settings: Partial<WhatsAppSettings>
): Promise<void> => {
  const docRef = doc(db, COLLECTIONS.WHATSAPP_SETTINGS, SETTINGS_DOC_ID);
  await setDoc(docRef, {
    ...settings,
    updatedAt: Timestamp.now(),
  }, { merge: true });
};

// ==================== MEMBER QUERIES ====================

/**
 * Find members whose birthday is today (matching month and day).
 */
export const getTodaysBirthdays = (members: Member[]): Member[] => {
  const today = new Date();
  const month = today.getMonth();
  const day = today.getDate();

  return members.filter((m) => {
    if (m.status === 'expired' || m.status === 'left') return false;
    if (!m.dob) return false;
    const dob = new Date(m.dob);
    return dob.getMonth() === month && dob.getDate() === day;
  });
};

/**
 * Find members whose wedding anniversary is today.
 */
export const getTodaysAnniversaries = (members: Member[]): Member[] => {
  const today = new Date();
  const month = today.getMonth();
  const day = today.getDate();

  return members.filter((m) => {
    if (m.status === 'expired' || m.status === 'left') return false;
    if (!m.anniversaryDate) return false;
    const anniv = new Date(m.anniversaryDate);
    return anniv.getMonth() === month && anniv.getDate() === day;
  });
};

/**
 * Find members with birthdays in the next N days.
 */
export const getUpcomingBirthdays = (members: Member[], days: number = 7): Member[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return members.filter((m) => {
    if (m.status === 'expired' || m.status === 'left') return false;
    if (!m.dob) return false;
    const dob = new Date(m.dob);

    // Create this year's birthday
    const thisYearBirthday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());

    // If birthday already passed this year, check next year
    if (thisYearBirthday < today) {
      thisYearBirthday.setFullYear(today.getFullYear() + 1);
    }

    const diffTime = thisYearBirthday.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= days;
  });
};

/**
 * Find members with anniversaries in the next N days.
 */
export const getUpcomingAnniversaries = (members: Member[], days: number = 7): Member[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return members.filter((m) => {
    if (m.status === 'expired' || m.status === 'left') return false;
    if (!m.anniversaryDate) return false;
    const anniv = new Date(m.anniversaryDate);

    const thisYearAnniv = new Date(today.getFullYear(), anniv.getMonth(), anniv.getDate());
    if (thisYearAnniv < today) {
      thisYearAnniv.setFullYear(today.getFullYear() + 1);
    }

    const diffTime = thisYearAnniv.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= days;
  });
};

// ==================== INITIALIZATION ====================

/**
 * Initialize default automations and templates if they don't exist.
 * Called on first load of the Automations module.
 */
export const initializeDefaults = async (): Promise<void> => {
  const [existingAutomations, existingTemplates] = await Promise.all([
    getAutomations(),
    getAutomationTemplates()
  ]);

  for (const defaults of DEFAULT_AUTOMATIONS) {
    const existingAuto = existingAutomations.find((a) => a.type === defaults.type);
    const existingTemp = existingTemplates.find((t) => t.automationType === defaults.type);

    let templateId = existingTemp?.id;

    if (!existingTemp) {
      // Create template if missing
      const templateRef = await addDoc(collection(db, COLLECTIONS.TEMPLATES), {
        automationType: defaults.type,
        name: defaults.template.name,
        body: defaults.template.body,
        variables: defaults.template.variables,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      templateId = templateRef.id;
    }

    if (!existingAuto) {
      // Create automation config if missing
      await addDoc(collection(db, COLLECTIONS.AUTOMATIONS), {
        type: defaults.type,
        name: defaults.name,
        description: defaults.description,
        enabled: false, // Disabled by default — admin enables manually
        scheduleTime: defaults.scheduleTime,
        templateId: templateId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    } else if (!existingAuto.templateId && templateId) {
      // Repair automation if it has no templateId
      await updateAutomation(existingAuto.id, { templateId });
    }
  }

  // Initialize WhatsApp settings if not exist
  const settings = await getWhatsAppSettings();
  if (!settings) {
    await saveWhatsAppSettings({
      mode: 'wa_me',
      connectionStatus: 'connected',
    });
  }
};

// ==================== DASHBOARD STATS ====================

export const getAutomationDashboardStats = async (
  members: Member[]
): Promise<AutomationDashboardStats> => {
  const todayLogs = await getTodayLogs();

  const messagesSentToday = todayLogs.filter((l) => l.status === 'sent' || l.status === 'delivered').length;
  const upcomingBirthdays = getUpcomingBirthdays(members, 7).length;
  const upcomingAnniversaries = getUpcomingAnniversaries(members, 7).length;
  const todayBirthdays = getTodaysBirthdays(members).length;
  const todayAnniversaries = getTodaysAnniversaries(members).length;

  // For pending analytics, we'd need to query analytics_email_logs
  // but that's in a separate service, so we return 0 and let the hub page handle it
  return {
    upcomingBirthdays,
    upcomingAnniversaries,
    todayBirthdays,
    todayAnniversaries,
    messagesSentToday,
    pendingAnalyticsEmails: 0,
  };
};

