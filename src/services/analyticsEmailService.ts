// Analytics Email Service — Firestore CRUD for analytics email settings and logs
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp,
  DocumentData,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { AnalyticsEmailSettings, AnalyticsEmailLog, EmailDeliveryStatus } from '@/types';

const COLLECTIONS = {
  SETTINGS: 'analytics_email_settings',
  LOGS: 'analytics_email_logs',
} as const;

const SETTINGS_DOC_ID = 'default';

// Helper
const timestampToString = (ts: Timestamp | string | null | undefined): string => {
  if (!ts) return '';
  if (ts instanceof Timestamp) return ts.toDate().toISOString();
  if (typeof ts === 'string') return ts;
  if (typeof ts === 'object' && 'seconds' in (ts as { seconds: number })) {
    return new Date((ts as { seconds: number }).seconds * 1000).toISOString();
  }
  return '';
};

// ==================== SETTINGS ====================

export const getAnalyticsEmailSettings = async (): Promise<AnalyticsEmailSettings | null> => {
  const docRef = doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC_ID);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  const data = docSnap.data();
  return {
    id: docSnap.id,
    ...data,
    updatedAt: timestampToString(data.updatedAt),
  } as AnalyticsEmailSettings;
};

export const saveAnalyticsEmailSettings = async (
  settings: Partial<AnalyticsEmailSettings>
): Promise<void> => {
  const docRef = doc(db, COLLECTIONS.SETTINGS, SETTINGS_DOC_ID);
  await setDoc(docRef, {
    ...settings,
    updatedAt: Timestamp.now(),
  }, { merge: true });
};

export const initializeAnalyticsEmailSettings = async (): Promise<void> => {
  const existing = await getAnalyticsEmailSettings();
  if (!existing) {
    await saveAnalyticsEmailSettings({
      enabled: false,
      recipients: [],
      senderName: 'Immanuel AG Church',
    });
  }
};

// ==================== LOGS ====================

export const getAnalyticsEmailLogs = async (filters?: {
  status?: EmailDeliveryStatus;
  limitCount?: number;
}): Promise<AnalyticsEmailLog[]> => {
  const constraints: any[] = [];

  if (filters?.status) {
    constraints.push(where('status', '==', filters.status));
  }

  const q = query(collection(db, COLLECTIONS.LOGS), ...constraints);
  const querySnapshot = await getDocs(q);

  let logs = querySnapshot.docs.map((docSnap) => {
    const data = docSnap.data() as any;
    return {
      id: docSnap.id,
      ...data,
      sentAt: timestampToString(data.sentAt),
      createdAt: timestampToString(data.createdAt),
    } as AnalyticsEmailLog;
  });

  // Client-side sort by createdAt descending
  logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (filters?.limitCount) {
    logs = logs.slice(0, filters.limitCount);
  }

  return logs;
};

// ==================== CLOUD FUNCTION CALLABLES ====================

export const sendTestAnalyticsEmail = async (recipientEmail: string) => {
  const fn = httpsCallable<{ recipientEmail: string }, { success: boolean; error?: string }>(
    functions,
    'sendTestAnalyticsEmail'
  );
  const result = await fn({ recipientEmail });
  return result.data;
};

export const resendAnalyticsEmail = async (logId: string) => {
  const fn = httpsCallable<{ logId: string }, { success: boolean; error?: string }>(
    functions,
    'resendAnalyticsEmail'
  );
  const result = await fn({ logId });
  return result.data;
};
