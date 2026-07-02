"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatPhoneForWhatsApp = formatPhoneForWhatsApp;
exports.generateMessage = generateMessage;
exports.sendWhatsAppMessage = sendWhatsAppMessage;
const node_fetch_1 = __importDefault(require("node-fetch"));
/**
 * Format a 10-digit Indian phone number to E.164 format for WhatsApp.
 * e.g., 9876543210 -> 919876543210
 */
function formatPhoneForWhatsApp(phone) {
    let digits = phone.replace(/\D/g, '');
    if (digits.startsWith('0'))
        digits = digits.substring(1);
    if (digits.length === 10)
        digits = '91' + digits;
    return digits;
}
/**
 * Replace template variables with actual values.
 * e.g., "Hello {{member_name}}" -> "Hello Azar"
 */
function generateMessage(template, memberName) {
    return template.replace(/\{\{member_name\}\}/gi, memberName);
}
/**
 * Send a text message via WhatsApp Business Cloud API
 */
async function sendWhatsAppMessage(phoneNumberId, accessToken, recipientPhone, messageBody) {
    try {
        const formattedPhone = formatPhoneForWhatsApp(recipientPhone);
        const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
        const response = await (0, node_fetch_1.default)(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: formattedPhone,
                type: 'text',
                text: { body: messageBody },
            }),
        });
        const data = await response.json();
        if (!response.ok) {
            console.error('WhatsApp API Error Response:', JSON.stringify(data));
            return {
                success: false,
                error: data.error?.message || 'Unknown WhatsApp API error'
            };
        }
        return {
            success: true,
            messageId: data.messages?.[0]?.id
        };
    }
    catch (error) {
        console.error('Error sending WhatsApp message:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
}
//# sourceMappingURL=whatsappApi.js.map