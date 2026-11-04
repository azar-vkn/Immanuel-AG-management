import React from 'react';
import { Attendance, ChurchEvent } from '@/types';
import {
  GRACE_MINUTES,
  calculatePunctuality,
  getEventStart,
  percentOf,
} from '@/lib/punctuality';
import { Timer, Info } from 'lucide-react';
import { format } from 'date-fns';

interface PunctualityCardProps {
  /** The tracked event being summarised. */
  event: ChurchEvent;
  attendance: Attendance[];
}

const BANDS = [
  { key: 'onTime', label: 'On time', bar: 'bg-emerald-500', text: 'text-emerald-500' },
  { key: 'slightlyLate', label: `Within ${GRACE_MINUTES}m`, bar: 'bg-amber-500', text: 'text-amber-500' },
  { key: 'late', label: 'Late', bar: 'bg-red-500', text: 'text-red-500' },
] as const;

/**
 * Arrival breakdown for one service.
 *
 * Shows the count of members with no usable timestamp separately rather than
 * folding them into the percentages, so the figures always describe a group
 * the reader can see the size of.
 */
export const PunctualityCard: React.FC<PunctualityCardProps> = ({ event, attendance }) => {
  const stats = calculatePunctuality(event, attendance);
  const start = getEventStart(event);
  if (!stats || !start) return null;

  const counts = {
    onTime: stats.onTime,
    slightlyLate: stats.slightlyLate,
    late: stats.late,
  };

  return (
    <div className="glass rounded-xl p-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="font-semibold flex items-center gap-2">
            <Timer className="w-5 h-5 text-primary" />
            Arrival Times
          </h3>
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {event.name} · starts {format(start, 'hh:mm a')}
          </p>
        </div>
      </div>

      {stats.measured === 0 ? (
        <p className="text-sm text-muted-foreground italic py-4">
          No arrival times recorded for this event yet.
        </p>
      ) : (
        <div className="space-y-3">
          {BANDS.map((band) => {
            const count = counts[band.key];
            const pct = percentOf(count, stats.measured);
            return (
              <div key={band.key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">{band.label}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="font-medium">{count}</span>
                    <span className={`font-semibold tabular-nums ${band.text}`}>{pct}%</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-secondary/60 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${band.bar} transition-all`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border/40">
        {stats.measured} of {stats.totalMarked} marked
        {stats.unknownTime > 0 && (
          <span className="text-amber-500"> · {stats.unknownTime} with no recorded time</span>
        )}
      </p>

      <p className="text-[11px] text-muted-foreground mt-2 flex items-start gap-1.5">
        <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
        Based on when each member was marked, which matches arrival closely for
        the entrance camera and less so for barcode or search.
      </p>
    </div>
  );
};

export default PunctualityCard;
