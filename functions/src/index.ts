import * as admin from 'firebase-admin';

// Initialize Firebase Admin first
admin.initializeApp();

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { sendAnalyticsEmail, sendTestEmail } from './analyticsEmail';

// ============================================================================
// Birthday and anniversary wishes are NOT sent from here.
//
// They are sent by hand from the Celebration Wishes page, which opens a wa.me
// link per member in the operator's browser. The Green API automation that
// used to live here could never run: it required a 'green_api' WhatsApp mode
// that the app never writes, so both scheduled jobs threw every morning and
// the error was swallowed. Removed rather than left failing silently.
// ============================================================================

// ============================================================================
// ANALYTICS EMAIL
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
