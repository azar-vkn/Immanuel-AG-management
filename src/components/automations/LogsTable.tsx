import React from 'react';
import { AutomationLog, DeliveryStatus } from '@/types';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, Clock, Send } from 'lucide-react';

interface LogsTableProps {
  logs: AutomationLog[];
  showType?: boolean;
  compact?: boolean;
  maxRows?: number;
}

const statusConfig: Record<DeliveryStatus, { label: string; className: string; icon: React.ElementType }> = {
  queued: {
    label: 'Queued',
    className: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    icon: Clock,
  },
  sent: {
    label: 'Sent',
    className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    icon: Send,
  },
  delivered: {
    label: 'Delivered',
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    icon: CheckCircle2,
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
    icon: XCircle,
  },
};

const typeLabels: Record<string, string> = {
  birthday: 'Birthday',
  anniversary: 'Anniversary',
  service_reminder: 'Service Reminder',
  youth_meeting: 'Youth Meeting',
  volunteer_gathering: 'Volunteer',
  visitor_followup: 'Visitor F/U',
  absent_followup: 'Absent F/U',
  prayer_request: 'Prayer Request',
};

const safeFormatDate = (dateStr: string | undefined, fmt: string): string => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return isValid(d) ? format(d, fmt) : '—';
  } catch {
    return '—';
  }
};

export const LogsTable: React.FC<LogsTableProps> = ({
  logs,
  showType = true,
  compact = false,
  maxRows,
}) => {
  const displayLogs = maxRows ? logs.slice(0, maxRows) : logs;

  if (displayLogs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No automation logs found
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-border/50 hover:bg-transparent">
            <TableHead className="text-muted-foreground">Date & Time</TableHead>
            <TableHead className="text-muted-foreground">Member</TableHead>
            {!compact && <TableHead className="text-muted-foreground">Phone</TableHead>}
            {showType && <TableHead className="text-muted-foreground">Type</TableHead>}
            <TableHead className="text-muted-foreground">Status</TableHead>
            {!compact && <TableHead className="text-muted-foreground">Error</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayLogs.map((log) => {
            const status = statusConfig[log.status];
            const StatusIcon = status.icon;
            return (
              <TableRow key={log.id} className="border-border/30 hover:bg-secondary/30">
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {safeFormatDate(log.sentAt || log.createdAt, compact ? 'MMM dd, HH:mm' : 'MMM dd, yyyy HH:mm')}
                </TableCell>
                <TableCell className="font-medium text-sm">{log.memberName}</TableCell>
                {!compact && (
                  <TableCell className="text-sm text-muted-foreground">{log.phone}</TableCell>
                )}
                {showType && (
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {typeLabels[log.automationType] || log.automationType}
                    </Badge>
                  </TableCell>
                )}
                <TableCell>
                  <Badge variant="outline" className={cn('text-xs gap-1', status.className)}>
                    <StatusIcon className="w-3 h-3" />
                    {status.label}
                  </Badge>
                </TableCell>
                {!compact && (
                  <TableCell className="text-sm text-red-400 max-w-[200px] truncate">
                    {log.errorMessage || '—'}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
