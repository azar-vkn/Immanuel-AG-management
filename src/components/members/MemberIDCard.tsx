import React, { useRef } from 'react';
import { Member } from '@/types';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import Barcode from 'react-barcode';

interface MemberIDCardProps {
  member: Member;
}

// CR80 standard: 85.6mm × 53.98mm (aspect ratio ≈ 1.586:1)
// We'll use 342px × 216px for screen display (maintaining ratio)

export const MemberIDCard: React.FC<MemberIDCardProps> = ({ member }) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printContent = cardRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>ID Card - ${member.name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Inter:wght@400;500;600&display=swap');
            
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            
            body { 
              font-family: 'Inter', sans-serif;
              display: flex;
              justify-content: flex-start;
              align-items: flex-start;
              min-height: 100vh;
              background: #f5f5f5;
              padding: 20px;
            }
            
            .card {
              width: 342px;
              height: 216px;
              background: #f8f9fa;
              border-radius: 16px;
              color: #000;
              box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
              display: flex;
              overflow: hidden;
              position: relative;
              border: 1px solid #e5e7eb;
            }
            
            .left-section {
              width: 35%;
              background: transparent;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              padding: 16px;
              border-right: 2px solid #000;
            }
            
            .logo-wrapper {
              background: #f3f4f6;
              border-radius: 16px;
              width: 72px;
              height: 72px;
              overflow: hidden;
              margin-bottom: 12px;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);
            }
            
            .logo-wrapper img {
              width: 100%;
              height: 100%;
              object-fit: cover;
              display: block;
              filter: grayscale(100%);
              -webkit-filter: grayscale(100%);
            }
            
            .logo-wrapper svg {
              width: 40px;
              height: 40px;
              display: block;
            }
            
            .church-name {
              font-family: 'Cinzel', serif;
              font-size: 10px;
              color: #000;
              font-weight: 700;
              text-align: center;
              line-height: 1.2;
              text-transform: uppercase;
            }
            
            .church-location {
              font-family: 'Inter', sans-serif;
              font-size: 7px;
              color: #4b5563;
              font-weight: 600;
              text-align: center;
              margin-top: 4px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            
            .right-section {
              width: 65%;
              padding: 16px;
              display: flex;
              flex-direction: column;
            }
            
            .id-label {
              font-size: 9px;
              color: #374151;
              text-transform: uppercase;
              letter-spacing: 1.5px;
              font-weight: 600;
              margin-bottom: 4px;
            }
            
            .member-id {
              font-family: monospace;
              font-size: 15px;
              color: #000;
              font-weight: 700;
              letter-spacing: 2.5px;
            }
            
            .member-details {
              margin-top: 8px;
              margin-bottom: auto;
              display: flex;
              flex-direction: column;
              gap: 2px;
            }
            
            .name {
              font-family: 'Cinzel', serif;
              font-size: 18px;
              font-weight: 600;
              color: #000;
              word-wrap: break-word;
              line-height: 1.2;
            }
            
            .phone {
              font-size: 13px;
              font-weight: 500;
              color: #1f2937;
            }

            .address {
              font-size: 9px;
              color: #4b5563;
              line-height: 1.2;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
            }
            
            .barcode-container {
              background: #fff;
              padding: 8px 16px;
              border-radius: 12px;
              display: flex;
              flex-direction: column;
              align-items: center;
              margin-top: 8px;
              border: 1px solid #f3f4f6;
              box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
            }
            
            .barcode-container svg {
              width: 100%;
              max-width: 140px;
              height: 35px;
            }
            


            @media print {
              body {
                background: white;
                padding: 0;
                margin: 0;
              }
              .card {
                box-shadow: none;
                margin: 5mm;
                border: none;
              }
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="left-section">
              <div class="logo-wrapper">
                  ${cardRef.current?.querySelector('.logo-wrapper')?.innerHTML || `<img src="${window.location.origin}/logo.png" alt="Church Logo" />`}
              </div>
              <div class="church-name">Immanuel AG<br/>Church</div>
              <div class="church-location">Tirunelveli Town</div>
            </div>
            <div class="right-section">
              <div>
                <div class="id-label">Member ID</div>
                <div class="member-id">${member.memberId}</div>
              </div>
              <div class="member-details">
                <div class="name">${member.name}</div>
                <div class="phone">${member.phone}</div>
                <div class="address">${[member.address?.place, member.address?.city].filter(Boolean).join(', ')}</div>
              </div>
              <div class="barcode-container">
                ${cardRef.current?.querySelector('.barcode-wrapper')?.innerHTML || ''}
              </div>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    
    // Wait for fonts and images to load before printing
    printWindow.onload = () => {
      setTimeout(() => printWindow.print(), 300);
    };
    
    // Fallback if onload doesn't fire
    setTimeout(() => {
      if (printWindow.document.readyState === 'complete') {
        printWindow.print();
      }
    }, 1000);
  };

  return (
    <div className="space-y-4">
      {/* ID Card - CR80 Standard Ratio */}
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-2xl bg-[#f8f9fa] border border-gray-200 shadow-lg text-black"
        style={{
          width: '342px',
          height: '216px',
        }}
      >
        <div className="flex h-full">
          {/* Left Section - Cross / Logo */}
          <div 
            className="flex flex-col items-center justify-center px-4 border-r-2 border-black"
            style={{ width: '35%' }}
          >
            <div className="mb-3 logo-wrapper bg-gray-100 rounded-2xl w-[72px] h-[72px] flex items-center justify-center overflow-hidden shadow-inner">
              <img 
                src="/logo.png" 
                alt="Church Logo" 
                className="w-full h-full object-cover grayscale"
                onError={(e) => {
                  // Fallback to cross if logo is missing
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement!.innerHTML = `<svg viewBox="0 0 24 32" class="w-10 h-10 drop-shadow-sm"><rect x="9" y="0" width="6" height="32" rx="1" fill="#1f2937" /><rect x="2" y="6" width="20" height="5" rx="1" fill="#1f2937" /></svg>`;
                }}
              />
            </div>
            <div className="flex flex-col items-center">
              <p className="font-serif text-[10px] font-bold text-black text-center leading-tight uppercase">
                Immanuel AG<br />Church
              </p>
              <p className="text-[7px] text-gray-600 font-semibold text-center mt-1 uppercase tracking-wide font-sans">
                Tirunelveli Town
              </p>
            </div>
          </div>

          {/* Right Section - Member Details */}
          <div className="flex flex-col p-4" style={{ width: '65%' }}>
            <div>
              <p className="text-[9px] text-gray-700 uppercase tracking-widest font-semibold mb-1">
                Member ID
              </p>
              <p className="font-mono text-[15px] text-black font-bold tracking-[0.15em]">
                {member.memberId}
              </p>
            </div>
            
            <div className="mt-2 mb-auto flex flex-col gap-0.5">
              <p className="text-lg font-serif font-semibold text-black leading-tight">
                {member.name}
              </p>
              <p className="text-[13px] font-medium text-gray-800 leading-tight">
                {member.phone}
              </p>
              <p className="text-[9px] text-gray-600 leading-tight line-clamp-2 pr-2">
                {[member.address?.place, member.address?.city].filter(Boolean).join(', ')}
              </p>
            </div>

            {/* Barcode */}
            <div className="barcode-wrapper bg-white py-2 px-4 rounded-xl flex flex-col items-center mt-2 shadow-sm border border-gray-100">
              <Barcode
                value={member.memberId}
                width={1.2}
                height={35}
                fontSize={0}
                margin={0}
                background="transparent"
                displayValue={false}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Print Button */}
      <Button onClick={handlePrint} className="w-full gap-2 bg-primary hover:bg-primary/90">
        <Printer className="w-4 h-4" />
        Print ID Card
      </Button>
    </div>
  );
};
