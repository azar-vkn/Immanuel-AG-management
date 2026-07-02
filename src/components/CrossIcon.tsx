import React from 'react';
import { cn } from '@/lib/utils';

interface CrossIconProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  glow?: boolean;
}

const sizeClasses = {
  sm: 'w-6 h-8',
  md: 'w-8 h-12',
  lg: 'w-12 h-16',
  xl: 'w-20 h-28'
};

export const CrossIcon: React.FC<CrossIconProps> = ({ 
  className, 
  size = 'md',
  glow = false 
}) => {
  return (
    <div className={cn(
      'relative flex items-center justify-center',
      sizeClasses[size],
      className
    )}>
      {/* Glow effect */}
      {glow && (
        <div className="absolute inset-0 blur-xl bg-primary/30 rounded-full animate-pulse-gold" />
      )}
      
      {/* Cross SVG */}
      <svg
        viewBox="0 0 24 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn(
          'relative z-10 w-full h-full',
          glow && 'drop-shadow-[0_0_10px_hsl(var(--gold)/0.5)]'
        )}
      >
        {/* Vertical beam */}
        <rect
          x="9"
          y="0"
          width="6"
          height="32"
          rx="1"
          fill="url(#goldGradient)"
        />
        {/* Horizontal beam */}
        <rect
          x="2"
          y="6"
          width="20"
          height="5"
          rx="1"
          fill="url(#goldGradient)"
        />
        {/* Gradient definition */}
        <defs>
          <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="hsl(43, 80%, 60%)" />
            <stop offset="50%" stopColor="hsl(43, 74%, 49%)" />
            <stop offset="100%" stopColor="hsl(43, 80%, 55%)" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};
