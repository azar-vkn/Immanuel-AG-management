"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.resendAnalyticsEmail = exports.sendTestAnalyticsEmail = exports.onEventStatusChange = exports.testWhatsAppConnection = exports.triggerAutomation = exports.sendDailyAnniversaryWishes = exports.sendDailyBirthdayWishes = void 0;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const automations_1 = require("./automations");
const whatsappApi_1 = require("./whatsappApi");
const analyticsEmail_1 = require("./analyticsEmail");
// Initialize Firebase Admin
admin.initializeApp();
// ============================================================================
// SCHEDULED FUNCTIONS (Cron Jobs)
// ============================================================================
/**
 * Runs every day at 08:00 AM IST (02:30 AM UTC) to send birthday wishes.
 */
exports.sendDailyBirthdayWishes = (0, scheduler_1.onSchedule)({
    schedule: "30 2 * * *", // 02:30 UTC = 08:00 IST
    timeZone: "UTC",
    retryCount: 3,
}, async (event) => {
    console.log('Starting scheduled daily birthday wishes...');
    try {
        const result = await (0, automations_1.sendWishes)('birthday');
        console.log(`Finished birthday wishes: ${result.success} sent, ${result.failed} failed, ${result.skipped} skipped.`);
    }
    catch (error) {
        console.error('Scheduled birthday wishes failed:', error);
    }
});
/**
 * Runs every day at 08:05 AM IST (02:35 AM UTC) to send anniversary wishes.
 */
exports.sendDailyAnniversaryWishes = (0, scheduler_1.onSchedule)({
    schedule: "35 2 * * *", // 02:35 UTC = 08:05 IST
    timeZone: "UTC",
    retryCount: 3,
}, async (event) => {
    console.log('Starting scheduled daily anniversary wishes...');
    try {
        const result = await (0, automations_1.sendWishes)('anniversary');
        console.log(`Finished anniversary wishes: ${result.success} sent, ${result.failed} failed, ${result.skipped} skipped.`);
    }
    catch (error) {
        console.error('Scheduled anniversary wishes failed:', error);
    }
});
// ============================================================================
// HTTPS CALLABLE FUNCTIONS (Triggered from Frontend)
// ============================================================================
/**
 * Trigger an automation run manually (e.g., from the dashboard "Run Now" button)
 */
exports.triggerAutomation = (0, https_1.onCall)({ invoker: 'public' }, async (request) => {
    // Ensure user is authenticated
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be logged in to trigger automations.');
    }
    const { type, memberId } = request.data;
    if (type !== 'birthday' && type !== 'anniversary') {
        throw new https_1.HttpsError('invalid-argument', 'Invalid automation type. Must be birthday or anniversary.');
    }
    console.log(`Manual trigger requested for ${type}${memberId ? ` for member ${memberId}` : ''} by user ${request.auth.uid}`);
    try {
        const result = await (0, automations_1.sendWishes)(type, memberId);
        return {
            success: true,
            data: result
        };
    }
    catch (error) {
        console.error(`Manual trigger failed for ${type}:`, error);
        throw new https_1.HttpsError('invalid-argument', error instanceof Error ? error.message : 'Unknown error during manual trigger');
    }
});
/**
 * Test the WhatsApp API connection credentials
 */
exports.testWhatsAppConnection = (0, https_1.onCall)({ invoker: 'public' }, async (request) => {
    // Ensure user is authenticated
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be logged in to test connections.');
    }
    const { idInstance, apiTokenInstance, testPhone } = request.data;
    if (!idInstance || !apiTokenInstance || !testPhone) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required parameters: idInstance, apiTokenInstance, testPhone');
    }
    console.log(`Testing WhatsApp connection to ${testPhone}`);
    try {
        const testMessage = '✅ Test message from Immanuel AG Church Management System.';
        const result = await (0, whatsappApi_1.sendWhatsAppMessage)(idInstance, apiTokenInstance, testPhone, testMessage);
        if (!result.success) {
            throw new https_1.HttpsError('invalid-argument', result.error || 'Failed to send test message');
        }
        return { success: true, messageId: result.messageId };
    }
    catch (error) {
        console.error('Test connection failed:', error);
        throw new https_1.HttpsError('invalid-argument', error instanceof Error ? error.message : 'Unknown error during test connection');
    }
});
// ============================================================================
// ANALYTICS EMAIL FUNCTIONS
// ============================================================================
/**
 * Firestore Trigger: When an event's status changes to 'ended',
 * automatically send analytics email.
 */
exports.onEventStatusChange = (0, firestore_1.onDocumentUpdated)({
    document: 'events/{eventId}',
    region: 'us-central1',
}, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after)
        return;
    // Only trigger when status changes TO 'ended'
    if (before.status !== 'ended' && after.status === 'ended') {
        const eventId = event.params.eventId;
        console.log(`Event ${eventId} marked as ended. Sending analytics email...`);
        try {
            const result = await (0, analyticsEmail_1.sendAnalyticsEmail)(eventId);
            if (result.success) {
                console.log(`Analytics email sent successfully for event ${eventId}`);
            }
            else {
                console.error(`Analytics email failed for event ${eventId}:`, result.error);
            }
        }
        catch (error) {
            console.error(`Error sending analytics email for event ${eventId}:`, error);
        }
    }
});
/**
 * Callable: Send a test analytics email to verify SMTP configuration
 */
exports.sendTestAnalyticsEmail = (0, https_1.onCall)({ invoker: 'public' }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be logged in.');
    }
    const { recipientEmail } = request.data;
    if (!recipientEmail) {
        throw new https_1.HttpsError('invalid-argument', 'Missing recipientEmail parameter.');
    }
    console.log(`Sending test analytics email to ${recipientEmail}`);
    try {
        const result = await (0, analyticsEmail_1.sendTestEmail)(recipientEmail);
        return result;
    }
    catch (error) {
        console.error('Test analytics email failed:', error);
        throw new https_1.HttpsError('internal', error instanceof Error ? error.message : 'Unknown error');
    }
});
/**
 * Callable: Resend a failed analytics email by log ID
 */
exports.resendAnalyticsEmail = (0, https_1.onCall)({ invoker: 'public' }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be logged in.');
    }
    const { logId } = request.data;
    if (!logId) {
        throw new https_1.HttpsError('invalid-argument', 'Missing logId parameter.');
    }
    console.log(`Resending analytics email for log ${logId}`);
    const db = admin.firestore();
    const logDoc = await db.collection('analytics_email_logs').doc(logId).get();
    if (!logDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Email log not found.');
    }
    const logData = logDoc.data();
    const eventId = logData.eventId;
    // Reset the analyticsSent flag to allow resend
    await db.collection('events').doc(eventId).update({
        analyticsSent: false,
    });
    try {
        const result = await (0, analyticsEmail_1.sendAnalyticsEmail)(eventId);
        return result;
    }
    catch (error) {
        console.error('Resend failed:', error);
        throw new https_1.HttpsError('internal', error instanceof Error ? error.message : 'Unknown error');
    }
});
//# sourceMappingURL=index.js.map