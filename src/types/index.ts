export type UserRole = 'admin' | 'marker' | 'area_leader';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export type MemberStatus = 'regular' | 'long_absent' | 'occasional_visitor' | 'expired' | 'out_of_station' | 'do_not_disturb' | 'left';

export type RelationshipType = 'Head' | 'Wife' | 'Husband' | 'Son' | 'Daughter' | 'Father' | 'Mother' | 'Brother' | 'Sister' | 'Grandson' | 'Granddaughter' | 'Grandfather' | 'Grandmother' | 'Son-In-Law' | 'Daughter-In-Law' | 'Father-In-Law' | 'Mother-In-Law' | 'Dependent' | 'Other';

export interface Member {
  id: string;
  memberId: string; // IAG00001 (head) or IAG00001-1 (family member) format
  name: string;
  tamilName?: string; // Name in Tamil script
  dob: string;
  gender: 'male' | 'female';
  phone: string;
  additionalPhones?: string[];
  address: {
    place: string;
    city: string;
    district: string;
    state: string;
    country: string;
    pincode: string;
  };
  tamilAddress?: {
    place?: string;
    city?: string;
    district?: string;
    state?: string;
  };
  // Family-related fields
  familyId: string; // Base family ID (e.g., IAG00001)
  isHeadOfFamily: boolean;
  relationship: RelationshipType;
  // Legacy field for backward compatibility
  memberType?: 'individual' | 'family';
  familyRole?: 'head' | 'spouse' | 'child' | 'other';
  maritalStatus: 'single' | 'married' | 'widowed' | 'divorced';
  anniversaryDate?: string;
  baptismStatus: 'baptized' | 'not_baptized';
  baptismDate?: string;
  churchRole: 'attendee' | 'volunteer' | 'host' | 'operator';
  fellowship?: FellowshipType;
  team?: string;
  status: MemberStatus;
  expiredDate?: string;
  whatsappEnabled?: boolean; // Whether member receives WhatsApp automations
  remarks?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Family {
  id: string;
  headMemberId: string;
  name: string;
  members: string[]; // Member IDs
  createdAt: string;
}

export type FellowshipType = 
  | 'Children'
  | 'Youth Boys Fellowship'
  | 'Youth Girls Fellowship'
  | "Men's Fellowship"
  | "Women's Fellowship";

export const FELLOWSHIP_OPTIONS: FellowshipType[] = [
  'Children',
  'Youth Boys Fellowship',
  'Youth Girls Fellowship',
  "Men's Fellowship",
  "Women's Fellowship",
];

export type EventStatus = 'upcoming' | 'active' | 'ended';

export interface ChurchEvent {
  id: string;
  name: string;
  date: string;
  time?: string;
  description?: string;
  fellowships?: FellowshipType[];
  status: EventStatus;
  analyticsSent?: boolean;
  analyticsSentAt?: string;
  createdAt: string;
}

export interface Attendance {
  id: string;
  eventId: string;
  memberId: string;
  markedAt: string;
  markedBy: string;
}

export interface FollowUp {
  id: string;
  memberId: string;
  eventId: string;
  status: 'pending' | 'contacted' | 'unreachable';
  remarks?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface DashboardStats {
  totalMembers: number;
  presentLastEvent: number;
  birthdaysThisWeek: Member[];
  anniversariesThisWeek: Member[];
}

// ==================== AUTOMATIONS ====================

export type AutomationType =
  | 'birthday'
  | 'anniversary'
  | 'service_reminder'
  | 'youth_meeting'
  | 'volunteer_gathering'
  | 'visitor_followup'
  | 'absent_followup'
  | 'prayer_request';

export type DeliveryStatus = 'queued' | 'sent' | 'delivered' | 'failed';

export interface Automation {
  id: string;
  type: AutomationType;
  name: string;
  description: string;
  enabled: boolean;
  scheduleTime: string; // HH:mm format (e.g., "08:00")
  templateId?: string; // Reference to automation_templates
  lastRunAt?: string;
  lastRunStatus?: 'success' | 'partial' | 'failed' | 'no_recipients';
  lastRunSentCount?: number;
  lastRunFailedCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationTemplate {
  id: string;
  automationType: AutomationType;
  name: string;
  body: string; // Message template with {{member_name}} placeholders
  variables: string[]; // Available placeholder names
  createdAt: string;
  updatedAt: string;
}

export interface AutomationLog {
  id: string;
  automationId?: string;
  automationType: AutomationType;
  memberId: string;
  memberName: string;
  phone: string;
  status: DeliveryStatus;
  errorMessage?: string;
  whatsappMessageId?: string;
  sentAt: string;
  deliveredAt?: string;
  createdAt: string;
}

export interface WhatsAppSettings {
  id: string;
  mode: 'wa_me'; // wa.me deep-link mode only
  connectionStatus: 'connected' | 'not_configured';
  lastSuccessfulCall?: string;
  lastError?: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface AutomationDashboardStats {
  upcomingBirthdays: number;
  upcomingAnniversaries: number;
  todayBirthdays: number;
  todayAnniversaries: number;
  messagesSentToday: number;
  pendingAnalyticsEmails: number;
}

// ==================== ANALYTICS EMAIL ====================

export interface AnalyticsEmailSettings {
  id: string;
  enabled: boolean;
  recipients: string[];
  senderName: string;
  updatedAt: string;
}

export type EmailDeliveryStatus = 'pending' | 'sent' | 'failed';

export interface AnalyticsEmailLog {
  id: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  recipients: string[];
  status: EmailDeliveryStatus;
  errorMessage?: string;
  retryCount: number;
  sentAt?: string;
  createdAt: string;
  totalRegistered: number;
  totalAttendees: number;
  attendancePercentage: number;
  maleCount?: number;
  femaleCount?: number;
}
