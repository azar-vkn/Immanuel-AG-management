
/**
 * Format a 10-digit Indian phone number to Green API format.
 * e.g., 9876543210 -> 919876543210@c.us
 */
export function formatPhoneForWhatsApp(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.substring(1);
  if (digits.length === 10) digits = '91' + digits;
  return digits + '@c.us';
}

/**
 * Replace template variables with actual values.
 * e.g., "Hello {{member_name}}" -> "Hello Azar"
 */
export function generateMessage(template: string, memberName: string): string {
  return template.replace(/\{\{member_name\}\}/gi, memberName);
}

/**
 * Send a text message via Green API
 */
export async function sendWhatsAppMessage(
  idInstance: string,
  apiTokenInstance: string,
  recipientPhone: string,
  messageBody: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const formattedPhone = formatPhoneForWhatsApp(recipientPhone);
    const url = `https://api.green-api.com/waInstance${idInstance}/sendMessage/${apiTokenInstance}`;
    
    const payload = {
      chatId: formattedPhone,
      message: messageBody,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json() as any;

    if (!response.ok || !data.idMessage) {
      console.error('Green API Error Response:', JSON.stringify(data));
      return { 
        success: false, 
        error: data.message || 'Unknown Green API error' 
      };
    }

    return { 
      success: true, 
      messageId: data.idMessage 
    };
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
