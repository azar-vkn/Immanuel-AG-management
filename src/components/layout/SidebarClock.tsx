import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface SidebarClockProps {
  collapsed: boolean;
  /**
   * 'card'   — the original boxed clock.
   * 'inline' — a single muted line, for the compact footer.
   */
  variant?: 'card' | 'inline';
}

export const SidebarClock: React.FC<SidebarClockProps> = ({ collapsed, variant = 'card' }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedTime = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formattedDate = time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex flex-col items-center justify-center py-2 text-muted-foreground cursor-default">
            <Clock className="w-5 h-5" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="font-medium">
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{formattedTime}</span>
            <span className="text-xs text-muted-foreground">{formattedDate}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (variant === 'inline') {
    return (
      <span className="text-xs text-muted-foreground truncate" title={formattedDate}>
        {formattedTime} · {formattedDate}
      </span>
    );
  }

  return (
    <div className="px-3 py-2 rounded-lg bg-sidebar-accent/20 flex flex-col justify-center">
      <div className="flex items-center gap-2 text-foreground">
        <Clock className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium">{formattedTime}</span>
      </div>
      <span className="text-xs text-muted-foreground pl-6">{formattedDate}</span>
    </div>
  );
};
