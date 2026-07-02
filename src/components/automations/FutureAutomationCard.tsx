import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon, Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface FutureAutomationCardProps {
  name: string;
  description: string;
  icon: LucideIcon;
  className?: string;
}

export const FutureAutomationCard: React.FC<FutureAutomationCardProps> = ({
  name,
  description,
  icon: Icon,
  className,
}) => {
  return (
    <div
      className={cn(
        'rounded-xl p-4 border border-border/20 backdrop-blur-xl',
        'bg-secondary/20 opacity-60 cursor-not-allowed',
        'transition-all duration-300',
        className
      )}
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-muted/30 text-muted-foreground">
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-muted-foreground truncate">{name}</h4>
            <Badge variant="outline" className="text-[10px] h-5 gap-1 border-border/30 text-muted-foreground">
              <Lock className="w-2.5 h-2.5" />
              Coming Soon
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">{description}</p>
        </div>
      </div>
    </div>
  );
};
