import React from 'react';
import { cn } from '@/lib/utils';
import { MessageCircle, HelpCircle } from 'lucide-react';

interface ConnectionStatusProps {
  status: 'connected' | 'not_configured';
  className?: string;
  showLabel?: boolean;
}

const statusConfig = {
  connected: {
    icon: MessageCircle,
    label: 'wa.me Active',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    dotColor: 'bg-emerald-500',
    pulse: true,
  },
  not_configured: {
    icon: HelpCircle,
    label: 'Not Configured',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    dotColor: 'bg-amber-500',
    pulse: false,
  },
};

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  status,
  className,
  showLabel = true,
}) => {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn('relative flex items-center justify-center p-1.5 rounded-lg', config.bgColor)}>
        <Icon className={cn('w-4 h-4', config.color)} />
        <span
          className={cn(
            'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full',
            config.dotColor,
            config.pulse && 'animate-pulse'
          )}
        />
      </div>
      {showLabel && (
        <div className="flex flex-col">
          <span className={cn('text-sm font-medium', config.color)}>{config.label}</span>
          <span className="text-[10px] text-muted-foreground">wa.me Deep Links</span>
        </div>
      )}
    </div>
  );
};
