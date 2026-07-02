// Firestore Service - CRUD operations for all collections
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where,
  orderBy,
  Timestamp,
  DocumentData
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Member, Family, ChurchEvent, Attendance, FollowUp, User } from '@/types';

// Collection names
const COLLECTIONS = {
  USERS: 'users',
  MEMBERS: 'members',
  FAMILIES: 'families',
  EVENTS: 'events',
  ATTENDANCE: 'attendance',
  FOLLOWUPS: 'followups',
  TEAMS: 'teams'
} as const;

// Helper to convert Firestore timestamp to string
const timestampToString = (timestamp: Timestamp | string | null | undefined): string => {
  if (!timestamp) return '';
  if (timestamp instanceof Timestamp) {
    return timestamp.toDate().toISOString().split('T')[0];
  }
  if (typeof timestamp === 'string') {
    return timestamp;
  }
  // Handle plain objects with seconds/nanoseconds (Firestore Timestamp-like)
  if (typeof timestamp === 'object') {
    const ts = timestamp as { seconds: number };
    if ('seconds' in ts) {
      return new Date(ts.seconds * 1000).toISOString().split('T')[0];
    }
  }
  return '';
};

// Helper to convert all date fields in member data
const convertMemberDates = (data: Record<string, unknown>): Record<string, unknown> => {
  const dateFields = ['dob', 'baptismDate', 'anniversaryDate', 'expiredDate', 'createdAt', 'updatedAt'];
  const converted = { ...data };
  dateFields.forEach(field => {
    if (converted[field]) {
      converted[field] = timestampToString(converted[field] as Timestamp | string);
    }
  });
  return converted;
};

// Firestore does not allow `undefined` values. This removes undefined recursively.
const stripUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stripUndefined).filter(v => v !== undefined);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const cleanedValue = stripUndefined(v);
      if (cleanedValue !== undefined) cleaned[k] = cleanedValue;
    }
    return cleaned;
  }
  return value === undefined ? undefined : value;
};

const toFirestoreData = (data: Record<string, unknown>) => stripUndefined(data) as DocumentData;

// ==================== USERS ====================
export const getUser = async (userId: string): Promise<User | null> => {
  const docRef = doc(db, COLLECTIONS.USERS, userId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as User;
  }
  return null;
};

export const createUser = async (userId: string, userData: Omit<User, 'id'>): Promise<void> => {
  const docRef = doc(db, COLLECTIONS.USERS, userId);
  await updateDoc(docRef, userData as DocumentData).catch(() => {
    // If document doesn't exist, create it
    addDoc(collection(db, COLLECTIONS.USERS), { ...userData, id: userId });
  });
};

// Helper to sort members by memberId (e.g. IAG00001, IAG00001-1, IAG00002)
const sortByMemberId = (a: Member, b: Member): number => {
  return a.memberId.localeCompare(b.memberId, undefined, { numeric: true });
};

// ==================== MEMBERS ====================
export const getMembers = async (): Promise<Member[]> => {
  const querySnapshot = await getDocs(collection(db, COLLECTIONS.MEMBERS));
  const members = querySnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    const converted = convertMemberDates(data);
    return {
      ...converted,
      id: docSnap.id, // Always use Firestore document ID, not any stored 'id' field
    } as Member;
  });
  return members.sort(sortByMemberId);
};

export const getMember = async (memberId: string): Promise<Member | null> => {
  const docRef = doc(db, COLLECTIONS.MEMBERS, memberId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    const converted = convertMemberDates(data);
    return {
      ...converted,
      id: docSnap.id, // Always use Firestore document ID
    } as Member;
  }
  return null;
};

export const getMemberByMemberId = async (memberId: string): Promise<Member | null> => {
  const q = query(collection(db, COLLECTIONS.MEMBERS), where('memberId', '==', memberId));
  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
    const docSnap = querySnapshot.docs[0];
    const data = docSnap.data();
    const converted = convertMemberDates(data);
    return {
      ...converted,
      id: docSnap.id, // Always use Firestore document ID
    } as Member;
  }
  return null;
};

export const createMember = async (memberData: Omit<Member, 'id'>): Promise<string> => {
  const docRef = await addDoc(
    collection(db, COLLECTIONS.MEMBERS),
    toFirestoreData({
      ...memberData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    })
  );
  return docRef.id;
};
export const updateMember = async (memberId: string, memberData: Partial<Member>): Promise<void> => {
  const docRef = doc(db, COLLECTIONS.MEMBERS, memberId);
  await updateDoc(
    docRef,
    toFirestoreData({
      ...memberData,
      updatedAt: Timestamp.now()
    })
  );
};

export const deleteMember = async (memberId: string): Promise<void> => {
  await deleteDoc(doc(db, COLLECTIONS.MEMBERS, memberId));
};

export const getMembersByTeam = async (team: string): Promise<Member[]> => {
  const q = query(collection(db, COLLECTIONS.MEMBERS), where('team', '==', team));
  const querySnapshot = await getDocs(q);
  const members = querySnapshot.docs.map(docSnap => {
    const data = docSnap.data();
    const converted = convertMemberDates(data);
    return {
      ...converted,
      id: docSnap.id, // Always use Firestore document ID
    } as Member;
  });
  return members.sort(sortByMemberId);
};

// ==================== FAMILIES ====================
export const getFamilies = async (): Promise<Family[]> => {
  const querySnapshot = await getDocs(collection(db, COLLECTIONS.FAMILIES));
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: timestampToString(doc.data().createdAt)
  })) as Family[];
};

export const getFamily = async (familyId: string): Promise<Family | null> => {
  const docRef = doc(db, COLLECTIONS.FAMILIES, familyId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: timestampToString(data.createdAt)
    } as Family;
  }
  return null;
};

export const createFamily = async (familyData: Omit<Family, 'id'>): Promise<string> => {
  const docRef = await addDoc(collection(db, COLLECTIONS.FAMILIES), {
    ...familyData,
    createdAt: Timestamp.now()
  });
  return docRef.id;
};

export const updateFamily = async (familyId: string, familyData: Partial<Family>): Promise<void> => {
  const docRef = doc(db, COLLECTIONS.FAMILIES, familyId);
  await updateDoc(docRef, familyData as DocumentData);
};

export const deleteFamily = async (familyId: string): Promise<void> => {
  await deleteDoc(doc(db, COLLECTIONS.FAMILIES, familyId));
};

// ==================== EVENTS ====================
export const getEvents = async (): Promise<ChurchEvent[]> => {
  const q = query(collection(db, COLLECTIONS.EVENTS), orderBy('date', 'desc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
    createdAt: timestampToString(doc.data().createdAt)
  })) as ChurchEvent[];
};

export const getEvent = async (eventId: string): Promise<ChurchEvent | null> => {
  const docRef = doc(db, COLLECTIONS.EVENTS, eventId);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: timestampToString(data.createdAt)
    } as ChurchEvent;
  }
  return null;
};

export const createEvent = async (eventData: Omit<ChurchEvent, 'id'>): Promise<string> => {
  const docRef = await addDoc(collection(db, COLLECTIONS.EVENTS), {
    ...eventData,
    createdAt: Timestamp.now()
  });
  return docRef.id;
};

export const updateEvent = async (eventId: string, eventData: Partial<ChurchEvent>): Promise<void> => {
  const docRef = doc(db, COLLECTIONS.EVENTS, eventId);
  await updateDoc(docRef, eventData as DocumentData);
};

export const deleteEvent = async (eventId: string): Promise<void> => {
  await deleteDoc(doc(db, COLLECTIONS.EVENTS, eventId));
};

// ==================== ATTENDANCE ====================
export const getAttendance = async (): Promise<Attendance[]> => {
  const querySnapshot = await getDocs(collection(db, COLLECTIONS.ATTENDANCE));
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as Attendance[];
};

export const getAttendanceByEvent = async (eventId: string): Promise<Attendance[]> => {
  const q = query(collection(db, COLLECTIONS.ATTENDANCE), where('eventId', '==', eventId));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as Attendance[];
};

export const getAttendanceByMember = async (memberId: string): Promise<Attendance[]> => {
  const q = query(collection(db, COLLECTIONS.ATTENDANCE), where('memberId', '==', memberId));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as Attendance[];
};

export const markAttendance = async (attendanceData: Omit<Attendance, 'id'>): Promise<string> => {
  const docRef = await addDoc(collection(db, COLLECTIONS.ATTENDANCE), attendanceData);
  return docRef.id;
};

export const deleteAttendance = async (attendanceId: string): Promise<void> => {
  await deleteDoc(doc(db, COLLECTIONS.ATTENDANCE, attendanceId));
};

// ==================== FOLLOW-UPS ====================
export const getFollowUps = async (): Promise<FollowUp[]> => {
  const querySnapshot = await getDocs(collection(db, COLLECTIONS.FOLLOWUPS));
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as FollowUp[];
};

export const getFollowUpsByEvent = async (eventId: string): Promise<FollowUp[]> => {
  const q = query(collection(db, COLLECTIONS.FOLLOWUPS), where('eventId', '==', eventId));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  })) as FollowUp[];
};

export const createFollowUp = async (followUpData: Omit<FollowUp, 'id'>): Promise<string> => {
  const docRef = await addDoc(collection(db, COLLECTIONS.FOLLOWUPS), followUpData);
  return docRef.id;
};

export const updateFollowUp = async (followUpId: string, followUpData: Partial<FollowUp>): Promise<void> => {
  const docRef = doc(db, COLLECTIONS.FOLLOWUPS, followUpId);
  await updateDoc(docRef, followUpData as DocumentData);
};

// ==================== TEAM GROUPS ====================
import { TeamGroupData } from '@/types/team';

const TEAM_GROUPS_COLLECTION = 'team_groups';

export const getTeamGroups = async (): Promise<TeamGroupData[]> => {
  const querySnapshot = await getDocs(collection(db, TEAM_GROUPS_COLLECTION));
  return querySnapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data(),
    createdAt: timestampToString(docSnap.data().createdAt),
    updatedAt: timestampToString(docSnap.data().updatedAt),
  })) as TeamGroupData[];
};

export const createTeamGroup = async (data: Omit<TeamGroupData, 'id'>): Promise<string> => {
  const docRef = await addDoc(collection(db, TEAM_GROUPS_COLLECTION), toFirestoreData({
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  }));
  return docRef.id;
};

export const updateTeamGroup = async (id: string, data: Partial<TeamGroupData>): Promise<void> => {
  const docRef = doc(db, TEAM_GROUPS_COLLECTION, id);
  await updateDoc(docRef, toFirestoreData({ ...data, updatedAt: Timestamp.now() }));
};

export const deleteTeamGroup = async (id: string): Promise<void> => {
  await deleteDoc(doc(db, TEAM_GROUPS_COLLECTION, id));
};
