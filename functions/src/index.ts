import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { sendWishes } from './automations';
import { sendWhatsAppMessage } from './whatsappApi';
import { sendAnalyticsEmail, sendTestEmail } from './analyticsEmail';

// Initialize Firebase Admin
admin.initializeApp();

// ============================================================================
// SCHEDULED FUNCTIONS (Cron Jobs)
// ============================================================================

/**
 * Runs every day at 08:00 AM IST (02:30 AM UTC) to send birthday wishes.
 */
export const sendDailyBirthdayWishes = onSchedule(
  {
    schedule: "30 2 * * *", // 02:30 UTC = 08:00 IST
    timeZone: "UTC",
    retryCount: 3,
  },
  async (event) => {
    console.log('Starting scheduled daily birthday wishes...');
    try {
      const result = await sendWishes('birthday');
      console.log(`Finished birthday wishes: ${result.success} sent, ${result.failed} failed, ${result.skipped} skipped.`);
    } catch (error) {
      console.error('Scheduled birthday wishes failed:', error);
    }
  }
);

/**
 * Runs every day at 08:05 AM IST (02:35 AM UTC) to send anniversary wishes.
 */
export const sendDailyAnniversaryWishes = onSchedule(
  {
    schedule: "35 2 * * *", // 02:35 UTC = 08:05 IST
    timeZone: "UTC",
    retryCount: 3,
  },
  async (event) => {
    console.log('Starting scheduled daily anniversary wishes...');
    try {
      const result = await sendWishes('anniversary');
      console.log(`Finished anniversary wishes: ${result.success} sent, ${result.failed} failed, ${result.skipped} skipped.`);
    } catch (error) {
      console.error('Scheduled anniversary wishes failed:', error);
    }
  }
);


// ============================================================================
// HTTPS CALLABLE FUNCTIONS (Triggered from Frontend)
// ============================================================================

/**
 * Trigger an automation run manually (e.g., from the dashboard "Run Now" button)
 */
export const triggerAutomation = onCall({ invoker: 'public' }, async (request) => {
  // Ensure user is authenticated
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be logged in to trigger automations.');
  }

  const { type, memberId } = request.data;

  if (type !== 'birthday' && type !== 'anniversary') {
    throw new HttpsError('invalid-argument', 'Invalid automation type. Must be birthday or anniversary.');
  }

  console.log(`Manual trigger requested for ${type}${memberId ? ` for member ${memberId}` : ''} by user ${request.auth.uid}`);

  try {
    const result = await sendWishes(type, memberId);
    return {
      success: true,
      data: result
    };
  } catch (error) {
    console.error(`Manual trigger failed for ${type}:`, error);
    throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Unknown error during manual trigger');
  }
});

/**
 * Test the WhatsApp API connection credentials
 */
export const testWhatsAppConnection = onCall({ invoker: 'public' }, async (request) => {
  // Ensure user is authenticated
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be logged in to test connections.');
  }

  const { idInstance, apiTokenInstance, testPhone } = request.data;

  if (!idInstance || !apiTokenInstance || !testPhone) {
    throw new HttpsError('invalid-argument', 'Missing required parameters: idInstance, apiTokenInstance, testPhone');
  }

  console.log(`Testing WhatsApp connection to ${testPhone}`);

  try {
    const testMessage = '✅ Test message from Immanuel AG Church Management System.';
    
    const result = await sendWhatsAppMessage(
      idInstance,
      apiTokenInstance,
      testPhone,
      testMessage
    );

    if (!result.success) {
      throw new HttpsError('invalid-argument', result.error || 'Failed to send test message');
    }

    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Test connection failed:', error);
    throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Unknown error during test connection');
  }
});


// ============================================================================
// ANALYTICS EMAIL FUNCTIONS
// ============================================================================

/**
 * Firestore Trigger: When an event's status changes to 'ended',
 * automatically send analytics email.
 */
export const onEventStatusChange = onDocumentUpdated(
  {
    document: 'events/{eventId}',
    region: 'us-central1',
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();

    if (!before || !after) return;

    // Only trigger when status changes TO 'ended'
    if (before.status !== 'ended' && after.status === 'ended') {
      const eventId = event.params.eventId;
      console.log(`Event ${eventId} marked as ended. Sending analytics email...`);

      try {
        const result = await sendAnalyticsEmail(eventId);
        if (result.success) {
          console.log(`Analytics email sent successfully for event ${eventId}`);
        } else {
          console.error(`Analytics email failed for event ${eventId}:`, result.error);
        }
      } catch (error) {
        console.error(`Error sending analytics email for event ${eventId}:`, error);
      }
    }
  }
);

/**
 * Callable: Send a test analytics email to verify SMTP configuration
 */
export const sendTestAnalyticsEmail = onCall({ invoker: 'public' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }

  const { recipientEmail } = request.data;
  if (!recipientEmail) {
    throw new HttpsError('invalid-argument', 'Missing recipientEmail parameter.');
  }

  console.log(`Sending test analytics email to ${recipientEmail}`);

  try {
    const result = await sendTestEmail(recipientEmail);
    return result;
  } catch (error) {
    console.error('Test analytics email failed:', error);
    throw new HttpsError('internal', error instanceof Error ? error.message : 'Unknown error');
  }
});

/**
 * Callable: Resend a failed analytics email by log ID
 */
export const resendAnalyticsEmail = onCall({ invoker: 'public' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be logged in.');
  }

  const { logId } = request.data;
  if (!logId) {
    throw new HttpsError('invalid-argument', 'Missing logId parameter.');
  }

  console.log(`Resending analytics email for log ${logId}`);

  const db = admin.firestore();
  const logDoc = await db.collection('analytics_email_logs').doc(logId).get();
  if (!logDoc.exists) {
    throw new HttpsError('not-found', 'Email log not found.');
  }

  const logData = logDoc.data()!;
  const eventId = logData.eventId;

  // Reset the analyticsSent flag to allow resend
  await db.collection('events').doc(eventId).update({
    analyticsSent: false,
  });

  try {
    const result = await sendAnalyticsEmail(eventId);
    return result;
  } catch (error) {
    console.error('Resend failed:', error);
    throw new HttpsError('internal', error instanceof Error ? error.message : 'Unknown error');
  }
});
