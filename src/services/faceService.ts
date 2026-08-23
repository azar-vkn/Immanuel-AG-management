// Face Service — Firestore storage for member face templates and the live
// recognition log.
//
// Privacy note: the 128-D descriptor is a mathematical embedding, not an image.
// No photograph or video frame is ever stored. The raw per-frame samples are
// kept in a `samples` subcollection so they are NOT downloaded by the live
// attendance page, which only needs the averaged template.
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  Timestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  FaceProfileDoc,
  FaceTemplate,
  RecognitionEvent,
  RecognitionEventDoc,
} from '@/types/face';
import { DESCRIPTOR_SIZE, meanDescriptor, selectDiverse } from '@/vision/faceMath';

const FACE_PROFILES = 'face_profiles';
const RECOGNITION_EVENTS = 'recognition_events';
const SAMPLES_SUBCOLLECTION = 'samples';
const SAMPLES_DOC = 'data';

// ==================== REGISTRATION ====================

/**
 * Register (or re-register) a member's face.
 *
 * Uses the prototype's registration pipeline unchanged: drop near-duplicate
 * frames with selectDiverse(), then average into a single template. Only the
 * storage target differs — Firestore instead of localStorage.
 */
export const saveFaceProfile = async (
  member: { id: string; memberId: string; name: string },
  collectedDescriptors: Float32Array[],
  registeredBy: string,
): Promise<void> => {
  if (collectedDescriptors.length === 0) {
    throw new Error('No face data collected');
  }

  const diverse = selectDiverse(collectedDescriptors, 16);
  const template = meanDescriptor(diverse);
  const now = new Date().toISOString();

  const existing = await getDoc(doc(db, FACE_PROFILES, member.id));

  const profile: FaceProfileDoc = {
    memberDocId: member.id,
    memberId: member.memberId,
    memberName: member.name,
    template: Array.from(template),
    sampleCount: diverse.length,
    registeredAt: existing.exists() ? (existing.data().registeredAt ?? now) : now,
    updatedAt: now,
    registeredBy,
  };

  await setDoc(doc(db, FACE_PROFILES, member.id), profile);

  // Raw samples live in a subcollection: retained for future re-tuning, but
  // never pulled down by the live recognition page.
  const flattened: number[] = [];
  diverse.forEach((d) => d.forEach((v) => flattened.push(v)));
  await setDoc(
    doc(db, FACE_PROFILES, member.id, SAMPLES_SUBCOLLECTION, SAMPLES_DOC),
    { descriptors: flattened, count: diverse.length, updatedAt: now },
  );
};

/** Whether a single member has a registered face. */
export const getFaceProfile = async (memberDocId: string): Promise<FaceProfileDoc | null> => {
  const snap = await getDoc(doc(db, FACE_PROFILES, memberDocId));
  return snap.exists() ? (snap.data() as FaceProfileDoc) : null;
};

/** Remove a member's face data entirely (profile + raw samples). */
export const deleteFaceProfile = async (memberDocId: string): Promise<void> => {
  await deleteDoc(doc(db, FACE_PROFILES, memberDocId, SAMPLES_SUBCOLLECTION, SAMPLES_DOC)).catch(
    () => undefined, // samples doc may not exist on older profiles
  );
  await deleteDoc(doc(db, FACE_PROFILES, memberDocId));
};

/** All member doc IDs that have a registered face — for status badges in lists. */
export const getRegisteredFaceIds = async (): Promise<Set<string>> => {
  const snap = await getDocs(collection(db, FACE_PROFILES));
  return new Set(snap.docs.map((d) => d.id));
};

// ==================== RECOGNITION ====================

/**
 * Load every registered face template for the recogniser.
 * Only the averaged 128-D template is fetched — raw samples stay server-side.
 */
export const getFaceTemplates = async (): Promise<FaceTemplate[]> => {
  const snap = await getDocs(collection(db, FACE_PROFILES));
  return snap.docs
    .map((d) => {
      const data = d.data() as FaceProfileDoc;
      if (!Array.isArray(data.template) || data.template.length !== DESCRIPTOR_SIZE) {
        return null;
      }
      return {
        memberDocId: data.memberDocId ?? d.id,
        memberId: data.memberId,
        memberName: data.memberName,
        descriptor: new Float32Array(data.template),
      } as FaceTemplate;
    })
    .filter((t): t is FaceTemplate => t !== null);
};

// ==================== LIVE EVENT LOG ====================

/**
 * Append a recognition event to the shared live log.
 *
 * UNKNOWN events deliberately carry no biometric data — just a timestamp — so
 * an unregistered visitor leaves no identifying trace.
 */
export const logRecognitionEvent = async (
  churchEventId: string,
  event: RecognitionEvent,
  recordedBy: string,
): Promise<void> => {
  const payload: Record<string, unknown> = {
    eventId: churchEventId,
    type: event.type,
    at: new Date(event.timestamp).toISOString(),
    recordedBy,
  };

  if (event.type === 'RECOGNIZED' || event.type === 'ALREADY_MARKED') {
    payload.memberDocId = event.memberDocId;
    payload.memberId = event.memberId;
    payload.memberName = event.memberName;
    if (event.confidence !== undefined) {
      payload.confidence = Math.round(event.confidence * 100) / 100;
    }
  }

  await addDoc(collection(db, RECOGNITION_EVENTS), {
    ...payload,
    createdAt: Timestamp.now(),
  });
};

/**
 * Subscribe to the live recognition log for one church event.
 * Powers the dashboard's auto-updating table without any page refresh, and
 * lets an admin watch the entrance from a different machine.
 */
export const subscribeToRecognitionEvents = (
  churchEventId: string,
  onUpdate: (events: RecognitionEventDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe => {
  const q = query(collection(db, RECOGNITION_EVENTS), where('eventId', '==', churchEventId));

  return onSnapshot(
    q,
    (snap) => {
      const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as RecognitionEventDoc);
      // Sort client-side (newest first) to avoid needing a composite index.
      events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      onUpdate(events);
    },
    (error) => {
      console.error('Recognition event subscription error:', error);
      onError?.(error);
    },
  );
};
