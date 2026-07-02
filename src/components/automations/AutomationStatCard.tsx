import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface AutomationStatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  statusColor?: 'green' | 'red' | 'amber' | 'blue' | 'default';
  pulse?: boolean;
  className?: string;
}

const statusColorMap = {
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  blue: 'bg-blue-500',
  default: 'bg-primary',
};

const iconBgMap = {
  green: 'bg-emerald-500/10 text-emerald-400',
  red: 'bg-red-500/10 text-red-400',
  amber: 'bg-amber-500/10 text-amber-400',
  blue: 'bg-blue-500/10 text-blue-400',
  default: 'bg-primary/10 text-primary',
};

export const AutomationStatCard: React.FC<AutomationStatCardProps> = ({
  title,
  value,
  icon: Icon,
  description,
  statusColor = 'default',
  pulse = false,
  className,
}) => {
  return (
    <div
      className={cn(
        'glass rounded-xl p-6 card-hover animate-fade-in',
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {statusColor !== 'default' && (
              <span
                className={cn(
                  'w-2 h-2 rounded-full',
                  statusColorMap[statusColor],
                  pulse && 'animate-pulse'
                )}
              />
            )}
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
          </div>
          <p className={cn(
            "font-bold text-gold-gradient",
            typeof value === 'string' && value.length > 15 ? "text-lg" : 
            typeof value === 'string' && value.length > 5 ? "text-xl" : "text-3xl"
          )}>
            {value}
          </p>
          {description && (
            <p className="text-sm text-muted-foreground mt-2">{description}</p>
          )}
        </div>
        <div className={cn('p-3 rounded-xl', iconBgMap[statusColor])}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
};
