import React from 'react';
import { Attendance, ChurchEvent } from '@/types';
import {
  GRACE_MINUTES,
  PunctualityStats,
  calculatePunctuality,
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

const Bands: React.FC<{ stats: PunctualityStats }> = ({ stats }) => (
  <div className="space-y-3">
    {BANDS.map((band) => {
      const count = stats[band.key];
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
);

/**
 * Arrival breakdown for one event.
 *
 * An event can cover two back-to-back services, so each service gets its own
 * bars — a single combined figure would hide one service running later than
 * the other, and measuring everyone against one start time would count the
 * whole second congregation as late.
 *
 * Members with no usable timestamp are shown separately rather than folded
 * into the percentages, so the figures always describe a group whose size the
 * reader can see.
 */
export const PunctualityCard: React.FC<PunctualityCardProps> = ({ event, attendance }) => {
  const breakdown = calculatePunctuality(event, attendance);
  if (!breakdown || breakdown.services.length === 0) return null;

  const { services, unknownTime, totalMarked } = breakdown;
  const measuredTotal = services.reduce((sum, s) => sum + s.stats.measured, 0);
  const multi = services.length > 1;

  return (
    <div className="glass rounded-xl p-6 animate-fade-in">
      <div className="mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Timer className="w-5 h-5 text-primary" />
          Arrival Times
        </h3>
        <p className="text-sm text-muted-foreground truncate mt-0.5">{event.name}</p>
      </div>

      {measuredTotal === 0 ? (
        <p className="text-sm text-muted-foreground italic py-4">
          No arrival times recorded for this event yet.
        </p>
      ) : (
        <div className={multi ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : ''}>
          {services.map((service) => (
            <div key={service.start.toISOString()} className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium">
                  {service.label || 'Service'} · starts {format(service.start, 'hh:mm a')}
                </p>
                <span className="text-xs text-muted-foreground">
                  {service.stats.measured} marked
                </span>
              </div>

              {service.stats.measured === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">
                  Nobody marked for this service.
                </p>
              ) : (
                <Bands stats={service.stats} />
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-4 pt-3 border-t border-border/40">
        {measuredTotal} of {totalMarked} marked
        {unknownTime > 0 && (
          <span className="text-amber-500"> · {unknownTime} with no recorded time</span>
        )}
      </p>

      <p className="text-[11px] text-muted-foreground mt-2 flex items-start gap-1.5">
        <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />
        Based on when each member was marked, which matches arrival closely for
        the entrance camera and less so for barcode or search.
        {multi && ' Members are assigned to the nearer service start.'}
      </p>
    </div>
  );
};

export default PunctualityCard;
