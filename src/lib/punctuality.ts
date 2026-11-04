// Punctuality — how many members were marked before a service started, and
// how far after.
//
// Important about what this measures: `markedAt` is when the volunteer (or the
// camera) marked someone, NOT when they physically arrived. Those are close
// when the entrance camera is doing the work, and can be minutes apart when
// someone is marked by barcode or name search. That is why the breakdown is
// opt-in per event rather than shown everywhere.

import { Attendance, ChurchEvent } from '@/types';

/** Minutes after the start still counted as "slightly late" rather than late. */
export const GRACE_MINUTES = 15;

export interface PunctualityStats {
  /** Marked before the start time. */
  onTime: number;
  /** Marked within GRACE_MINUTES after the start. */
  slightlyLate: number;
  /** Marked more than GRACE_MINUTES after the start. */
  late: number;
  /** Counted in the percentages: onTime + slightlyLate + late. */
  measured: number;
  /** Marked, but with no usable timestamp — excluded from the percentages. */
  unknownTime: number;
  /** Everyone marked present, measured or not. */
  totalMarked: number;
}

/**
 * The moment a service starts, as a Date.
 *
 * `date` is "YYYY-MM-DD" and `time` is "HH:mm", both local to the church.
 * Joining them without a timezone suffix makes the browser read them as local
 * time, which is what we want — `markedAt` is a real instant, so comparing the
 * two is correct regardless of the machine's timezone.
 */
export const getEventStart = (event: ChurchEvent): Date | null => {
  if (!event.date || !event.time) return null;
  const start = new Date(`${event.date}T${event.time}`);
  return Number.isNaN(start.getTime()) ? null : start;
};

/** Whether this event should show a punctuality breakdown at all. */
export const isPunctualityTracked = (event: ChurchEvent): boolean =>
  !!event.trackPunctuality && getEventStart(event) !== null;

/**
 * Bucket one event's attendance by how late it was marked.
 *
 * Duplicate records for the same member are collapsed to their earliest mark,
 * matching the Reports column: if someone was caught by both entrance PCs, the
 * first sighting is the one that reflects when they arrived.
 */
export const calculatePunctuality = (
  event: ChurchEvent,
  attendance: Attendance[],
): PunctualityStats | null => {
  const start = getEventStart(event);
  if (!start) return null;

  const earliestByMember = new Map<string, number | null>();

  attendance
    .filter((a) => a.eventId === event.id)
    .forEach((a) => {
      const stamp = a.markedAt ? new Date(a.markedAt).getTime() : Number.NaN;
      const usable = Number.isNaN(stamp) ? null : stamp;

      if (!earliestByMember.has(a.memberId)) {
        earliestByMember.set(a.memberId, usable);
        return;
      }
      const existing = earliestByMember.get(a.memberId) ?? null;
      // A real timestamp always beats a missing one; otherwise keep the earlier.
      if (existing === null || (usable !== null && usable < existing)) {
        earliestByMember.set(a.memberId, usable);
      }
    });

  const startMs = start.getTime();
  const graceMs = GRACE_MINUTES * 60 * 1000;
  const stats: PunctualityStats = {
    onTime: 0,
    slightlyLate: 0,
    late: 0,
    measured: 0,
    unknownTime: 0,
    totalMarked: earliestByMember.size,
  };

  earliestByMember.forEach((stamp) => {
    if (stamp === null) {
      stats.unknownTime++;
      return;
    }
    stats.measured++;
    if (stamp < startMs) stats.onTime++;
    else if (stamp <= startMs + graceMs) stats.slightlyLate++;
    else stats.late++;
  });

  return stats;
};

/** Share of the measured members in a bucket, 0-100. Zero when none measured. */
export const percentOf = (count: number, measured: number): number =>
  measured > 0 ? Math.round((count / measured) * 100) : 0;
