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
exports.testWhatsAppConnection = exports.triggerAutomation = exports.sendDailyAnniversaryWishes = exports.sendDailyBirthdayWishes = void 0;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const https_1 = require("firebase-functions/v2/https");
const automations_1 = require("./automations");
const whatsappApi_1 = require("./whatsappApi");
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
    timeZone: "UTC", // Cloud Scheduler uses UTC by default if not specified
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
exports.triggerAutomation = (0, https_1.onCall)(async (request) => {
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
        throw new https_1.HttpsError('internal', error instanceof Error ? error.message : 'Unknown error during manual trigger');
    }
});
/**
 * Test the WhatsApp API connection credentials
 */
exports.testWhatsAppConnection = (0, https_1.onCall)(async (request) => {
    // Ensure user is authenticated
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'You must be logged in to test connections.');
    }
    const { phoneNumberId, accessToken, testPhone } = request.data;
    if (!phoneNumberId || !accessToken || !testPhone) {
        throw new https_1.HttpsError('invalid-argument', 'Missing required parameters: phoneNumberId, accessToken, testPhone');
    }
    console.log(`Testing WhatsApp connection to ${testPhone}`);
    try {
        const testMessage = '✅ Test message from Immanuel AG Church Management System.\n\nIf you received this, your WhatsApp Business API connection is working correctly! 🙏';
        const result = await (0, whatsappApi_1.sendWhatsAppMessage)(phoneNumberId, accessToken, testPhone, testMessage);
        if (!result.success) {
            throw new https_1.HttpsError('unknown', result.error || 'Failed to send test message');
        }
        return { success: true, messageId: result.messageId };
    }
    catch (error) {
        console.error('Test connection failed:', error);
        throw new https_1.HttpsError('internal', error instanceof Error ? error.message : 'Unknown error during test connection');
    }
});
//# sourceMappingURL=index.js.map