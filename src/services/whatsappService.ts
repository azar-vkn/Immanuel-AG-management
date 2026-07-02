// WhatsApp Service — wa.me deep link sender
// Future: Replace with WhatsApp Business Cloud API calls via Cloud Functions

import { Member, AutomationType } from '@/types';
import { differenceInYears } from 'date-fns';

/**
 * Normalize an Indian phone number to WhatsApp international format.
 * Handles: 9876543210, 09876543210, +919876543210, 919876543210
 * Returns: 919876543210
 */
export const formatPhoneForWhatsApp = (phone: string): string => {
  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '');

  // Remove leading 0 (Indian trunk prefix)
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }

  // If 10 digits, assume Indian and prepend 91
  if (digits.length === 10) {
    digits = '91' + digits;
  }

  // If already starts with 91 and is 12 digits, it's good
  if (digits.startsWith('91') && digits.length === 12) {
    return digits;
  }

  // Fallback: return as-is (might be an international number)
  return digits;
};

/**
 * Generate a personalized Tamil church-friendly greeting prefix based on
 * the member's age and gender.
 *
 * - Children (age < 13): "Dear {{name}},"
 * - Male (age >= 13): "Dear Brother {{name}},"
 * - Female (age >= 13): "Dear Sister {{name}},"
 */
export const generatePersonalizedGreeting = (
  member: Member,
  automationType?: AutomationType
): string => {
  const name = member.tamilName || member.name;

  // Anniversary is only for married adults — always use Brother/Sister
  if (automationType === 'anniversary') {
    return member.gender === 'male'
      ? `Dear Brother ${name},`
      : `Dear Sister ${name},`;
  }

  // Birthday: check age
  const age = member.dob ? differenceInYears(new Date(), new Date(member.dob)) : 0;

  if (age < 13) {
    return `Dear ${name},`;
  }

  return member.gender === 'male'
    ? `Dear Brother ${name},`
    : `Dear Sister ${name},`;
};

/**
 * Replace template variables with actual values and prepend the personalized
 * Tamil greeting.
 *
 * Overloads:
 *  - (template, memberName)          — legacy, simple replacement
 *  - (template, member, automationType) — personalized greeting
 */
export function generateMessage(template: string, memberName: string): string;
export function generateMessage(template: string, member: Member, automationType: AutomationType): string;
export function generateMessage(
  template: string,
  memberOrName: string | Member,
  automationType?: AutomationType
): string {
  if (typeof memberOrName === 'string') {
    // Legacy path: simple {{member_name}} replacement
    return template.replace(/\{\{member_name\}\}/gi, memberOrName);
  }

  const member = memberOrName;
  const displayName = member.tamilName || member.name;

  // Build the greeting line
  const greeting = generatePersonalizedGreeting(member, automationType);

  // Replace {{member_name}} in the template body
  const body = template.replace(/\{\{member_name\}\}/gi, displayName);

  // Prepend the greeting to the message body
  return `${greeting}\n\n${body}`;
}

/**
 * Open WhatsApp with a pre-filled message via wa.me deep link.
 * Opens in a new tab/window.
 */
export const openWhatsApp = (phone: string, message: string): boolean => {
  try {
    const formattedPhone = formatPhoneForWhatsApp(phone);
    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  } catch (error) {
    console.error('Error opening WhatsApp:', error);
    return false;
  }
};

/**
 * Check if a member is eligible for WhatsApp messaging.
 * Must have: valid phone number, whatsappEnabled not explicitly false, not expired/left.
 */
export const isEligibleForWhatsApp = (member: Member): boolean => {
  // Must have a phone number
  if (!member.phone || member.phone.trim().length < 10) return false;

  // Must not be explicitly disabled
  if (member.whatsappEnabled === false) return false;

  // Must not be expired or left
  if (member.status === 'expired' || member.status === 'left') return false;

  // Must not be do_not_disturb
  if (member.status === 'do_not_disturb') return false;

  return true;
};

/**
 * Send bulk wishes via wa.me. Opens WhatsApp for each member sequentially
 * with a delay between each to avoid popup blocking.
 *
 * Returns an array of results for each member.
 */
export const sendBulkWishes = async (
  members: Member[],
  template: string,
  onProgress?: (memberName: string, index: number, total: number, success: boolean) => void,
  automationType?: AutomationType
): Promise<{ memberId: string; memberName: string; phone: string; success: boolean }[]> => {
  const results: { memberId: string; memberName: string; phone: string; success: boolean }[] = [];

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    const message = automationType
      ? generateMessage(template, member, automationType)
      : generateMessage(template, member.name);
    const success = openWhatsApp(member.phone, message);

    results.push({
      memberId: member.id,
      memberName: member.name,
      phone: member.phone,
      success,
    });

    onProgress?.(member.name, i + 1, members.length, success);

    // Delay between sends to avoid popup blocking (1.5 seconds)
    if (i < members.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  return results;
};
