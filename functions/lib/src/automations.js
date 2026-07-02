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
exports.sendWishes = sendWishes;
const admin = __importStar(require("firebase-admin"));
const whatsappApi_1 = require("./whatsappApi");
const db = admin.firestore();
/**
 * Common logic to send wishes for a specific type (birthday/anniversary).
 */
async function sendWishes(type, manualMemberId) {
    const result = { success: 0, failed: 0, total: 0, skipped: 0, logs: [] };
    try {
        // 1. Get WhatsApp Settings
        const settingsDoc = await db.collection('whatsapp_settings').doc('default').get();
        if (!settingsDoc.exists)
            throw new Error('WhatsApp settings not configured');
        const settings = settingsDoc.data();
        if (settings.mode !== 'business_api' || !settings.phoneNumberId || !settings.accessToken) {
            throw new Error('WhatsApp Business API is not fully configured');
        }
        // 2. Get Automation Config
        const automationsSnapshot = await db.collection('automations').where('type', '==', type).limit(1).get();
        if (automationsSnapshot.empty)
            throw new Error(`Automation config for ${type} not found`);
        const automation = { id: automationsSnapshot.docs[0].id, ...automationsSnapshot.docs[0].data() };
        if (!automation.enabled && !manualMemberId) {
            console.log(`${type} automation is disabled. Skipping scheduled run.`);
            return result;
        }
        // 3. Get Template
        const templatesSnapshot = await db.collection('automation_templates').where('type', '==', type).limit(1).get();
        if (templatesSnapshot.empty)
            throw new Error(`Template for ${type} not found`);
        const template = { id: templatesSnapshot.docs[0].id, ...templatesSnapshot.docs[0].data() };
        // 4. Get Eligible Members
        const membersSnapshot = await db.collection('members').get();
        const allMembers = membersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const today = new Date();
        const todayMonth = String(today.getMonth() + 1).padStart(2, '0');
        const todayDay = String(today.getDate()).padStart(2, '0');
        const todayMatch = `${todayMonth}-${todayDay}`;
        const eligibleMembers = allMembers.filter(m => {
            // Must have valid phone and not disabled
            if (!m.phone || m.phone.trim().length < 10)
                return false;
            if (m.whatsappEnabled === false)
                return false;
            if (m.status === 'expired' || m.status === 'left' || m.status === 'do_not_disturb')
                return false;
            // If manual trigger, only check this specific member
            if (manualMemberId) {
                return m.id === manualMemberId;
            }
            // Check date match based on type
            const dateToCheck = type === 'birthday' ? m.dob : m.anniversaryDate;
            if (!dateToCheck)
                return false;
            // Match MM-DD
            const memberMatch = dateToCheck.substring(5, 10);
            return memberMatch === todayMatch;
        });
        result.total = eligibleMembers.length;
        console.log(`Found ${eligibleMembers.length} eligible members for ${type} wishes today.`);
        if (eligibleMembers.length === 0)
            return result;
        // 5. Send Messages and Log
        const batch = db.batch();
        const logsRef = db.collection('automation_logs');
        const nowStr = new Date().toISOString();
        for (const member of eligibleMembers) {
            // Check if already sent today to avoid duplicates
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const existingLogs = await logsRef
                .where('memberId', '==', member.id)
                .where('automationType', '==', type)
                .where('sentAt', '>=', startOfDay.toISOString())
                .limit(1)
                .get();
            if (!existingLogs.empty) {
                console.log(`Already sent ${type} wish to ${member.name} today. Skipping.`);
                result.skipped++;
                continue;
            }
            const messageBody = (0, whatsappApi_1.generateMessage)(template.body, member.name);
            const response = await (0, whatsappApi_1.sendWhatsAppMessage)(settings.phoneNumberId, settings.accessToken, member.phone, messageBody);
            // Create log entry
            const logRef = logsRef.doc();
            const logData = {
                memberId: member.id,
                memberName: member.name,
                phone: member.phone,
                automationType: type,
                status: response.success ? 'delivered' : 'failed',
                sentAt: nowStr,
                createdAt: nowStr, // Using string instead of FieldValue.serverTimestamp() for simplicity
                errorReason: response.error || null,
                messageId: response.messageId || null
            };
            batch.set(logRef, logData);
            result.logs.push(logData);
            if (response.success) {
                result.success++;
            }
            else {
                result.failed++;
                console.error(`Failed to send to ${member.name}: ${response.error}`);
            }
            // Respect API limits (small delay)
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        // Update automation last run time
        const automationRef = db.collection('automations').doc(automation.id);
        batch.update(automationRef, { lastRunAt: nowStr });
        // Update WhatsApp settings last successful call if we had successes
        if (result.success > 0) {
            batch.update(db.collection('whatsapp_settings').doc('default'), {
                lastSuccessfulCall: nowStr,
                connectionStatus: 'connected',
                lastError: null
            });
        }
        else if (result.failed > 0 && result.logs.length > 0) {
            batch.update(db.collection('whatsapp_settings').doc('default'), {
                connectionStatus: 'error',
                lastError: result.logs[0].errorReason || 'Failed to send'
            });
        }
        await batch.commit();
    }
    catch (error) {
        console.error(`Error in sendWishes for ${type}:`, error);
        // Attempt to log error in settings
        try {
            await db.collection('whatsapp_settings').doc('default').update({
                connectionStatus: 'error',
                lastError: error instanceof Error ? error.message : 'Unknown error in sendWishes'
            });
        }
        catch (e) {
            // Ignore
        }
        throw error;
    }
    return result;
}
//# sourceMappingURL=automations.js.map