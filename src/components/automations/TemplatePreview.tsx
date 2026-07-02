import React from 'react';
import { cn } from '@/lib/utils';
import { CheckCheck } from 'lucide-react';

interface TemplatePreviewProps {
  message: string;
  sampleName?: string;
  greetingPrefix?: string;
  className?: string;
}

export const TemplatePreview: React.FC<TemplatePreviewProps> = ({
  message,
  sampleName = 'சரவணன்',
  greetingPrefix,
  className,
}) => {
  // Replace variables with sample values
  const bodyMessage = message.replace(/\{\{member_name\}\}/gi, sampleName);
  // Prepend greeting prefix if provided (simulates the personalized greeting)
  const previewMessage = greetingPrefix 
    ? `${greetingPrefix}\n\n${bodyMessage}` 
    : bodyMessage;

  return (
    <div className={cn('flex flex-col items-center', className)}>
      {/* Phone Frame */}
      <div className="w-full max-w-[320px]">
        {/* WhatsApp Header */}
        <div className="bg-[#075E54] rounded-t-xl px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <span className="text-white text-xs font-bold">IAG</span>
          </div>
          <div>
            <p className="text-white text-sm font-medium">Immanuel AG Church</p>
            <p className="text-white/60 text-xs">online</p>
          </div>
        </div>

        {/* Chat Area */}
        <div
          className="p-4 min-h-[200px]"
          style={{
            backgroundColor: '#0B141A',
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5 L35 15 L30 25 L25 15Z' fill='%23ffffff05'/%3E%3C/svg%3E")`,
          }}
        >
          {/* Message Bubble */}
          <div className="max-w-[85%] ml-auto">
            <div className="bg-[#005C4B] rounded-lg rounded-tr-none p-3 shadow-lg relative">
              <p
                className="text-[#E9EDEF] text-sm whitespace-pre-wrap leading-relaxed break-words"
                dir="auto"
              >
                {previewMessage || 'Preview will appear here...'}
              </p>
              <div className="flex items-center justify-end gap-1 mt-1">
                <span className="text-[10px] text-[#E9EDEF]/50">
                  {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </span>
                <CheckCheck className="w-3.5 h-3.5 text-[#53BDEB]" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="bg-[#1F2C33] rounded-b-xl px-4 py-3 flex items-center gap-2">
          <div className="flex-1 bg-[#2A3942] rounded-full px-4 py-2">
            <p className="text-[#8696A0] text-xs">Type a message</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-[#00A884] flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M1.101 21.757L23.8 12.028 1.101 2.3l.011 7.912 13.239 1.816-13.239 1.817-.011 7.912z" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};
