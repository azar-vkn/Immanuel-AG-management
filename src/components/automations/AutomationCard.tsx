import React from 'react';
import { Automation } from '@/types';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Cake, Heart, Clock, Play, Settings, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface AutomationCardProps {
  automation: Automation;
  onToggle: (id: string, enabled: boolean) => void;
  onConfigure: (type: string) => void;
  onRunNow: (type: string) => void;
  isRunning?: boolean;
}

const typeIcons: Record<string, React.ElementType> = {
  birthday: Cake,
  anniversary: Heart,
};

const typeColors: Record<string, string> = {
  birthday: 'from-pink-500/20 to-purple-500/20 border-pink-500/30',
  anniversary: 'from-rose-500/20 to-amber-500/20 border-rose-500/30',
};

const typeIconColors: Record<string, string> = {
  birthday: 'bg-pink-500/10 text-pink-400',
  anniversary: 'bg-rose-500/10 text-rose-400',
};

export const AutomationCard: React.FC<AutomationCardProps> = ({
  automation,
  onToggle,
  onConfigure,
  onRunNow,
  isRunning = false,
}) => {
  const Icon = typeIcons[automation.type] || Settings;
  const gradientClass = typeColors[automation.type] || 'from-primary/20 to-primary/10 border-primary/30';
  const iconColorClass = typeIconColors[automation.type] || 'bg-primary/10 text-primary';

  const statusBadge = () => {
    if (!automation.lastRunStatus) return null;
    const statusMap: Record<string, { label: string; className: string }> = {
      success: { label: 'Last Run: Success', className: 'badge-success' },
      partial: { label: 'Last Run: Partial', className: 'badge-warning' },
      failed: { label: 'Last Run: Failed', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
      no_recipients: { label: 'No Recipients', className: 'badge-info' },
    };
    const status = statusMap[automation.lastRunStatus];
    if (!status) return null;
    return <Badge variant="outline" className={cn('text-xs', status.className)}>{status.label}</Badge>;
  };

  return (
    <div
      className={cn(
        'rounded-xl p-5 border backdrop-blur-xl transition-all duration-300',
        'bg-gradient-to-br',
        gradientClass,
        'hover:-translate-y-0.5 hover:shadow-lg'
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn('p-2.5 rounded-xl', iconColorClass)}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{automation.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{automation.description}</p>
          </div>
        </div>
        <Switch
          checked={automation.enabled}
          onCheckedChange={(checked) => onToggle(automation.id, checked)}
        />
      </div>

      {/* Info */}
      <div className="flex items-center gap-3 mb-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          <span>Schedule: {automation.scheduleTime || '08:00'}</span>
        </div>
        {automation.lastRunAt && (
          <span>
            Last run: {formatDistanceToNow(new Date(automation.lastRunAt), { addSuffix: true })}
          </span>
        )}
      </div>

      {/* Status & Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {statusBadge()}
          {automation.lastRunSentCount !== undefined && automation.lastRunSentCount > 0 && (
            <Badge variant="outline" className="text-xs badge-info">
              {automation.lastRunSentCount} sent
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRunNow(automation.type)}
            disabled={isRunning}
            className="text-xs gap-1 h-8"
          >
            <Play className="w-3.5 h-3.5" />
            Run Now
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onConfigure(automation.type)}
            className="text-xs gap-1 h-8"
          >
            Configure
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
