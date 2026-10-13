/**
 * The notice board: schemes that matter to THIS citizen and are worth acting on now — first the ones whose
 * usual yearly window is about to close, then the ones many people are applying for. Pure, so the same
 * list can be drawn on the office wall and in the chat.
 *
 * Dates are the USUAL closing dates, not promises: windows move, so every notice says "usual" and the UI
 * tells the citizen to confirm on the portal.
 */
import type { CitizenProfile } from './profile';
import { evaluate } from './eligibility';
import { SCHEMES, type Scheme } from './schemes';
import type { L } from './text';

export interface Notice {
  scheme: Scheme;
  kind: 'closing' | 'trending';
  /** Whole days from `today` to the usual closing date (closing notices only). */
  daysLeft?: number;
  /** ISO date of the next usual closing date. */
  closes?: string;
  label?: L;
  /** Open questions still to answer — fewer means a clearer fit. */
  pending: number;
}

const DAY = 86_400_000;
const CLOSING_WINDOW_DAYS = 75;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Days until the next occurrence of month/day on or after `today`. */
export function daysUntil(month: number, day: number, today: Date): { days: number; date: Date } {
  const t = startOfDay(today);
  let d = new Date(t.getFullYear(), month - 1, day);
  if (d < t) d = new Date(t.getFullYear() + 1, month - 1, day);
  return { days: Math.round((d.getTime() - t.getTime()) / DAY), date: d };
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function computeNotices(profile: CitizenProfile, today: Date = new Date(), limit = 4): Notice[] {
  const closing: Notice[] = [];
  const trending: Notice[] = [];
  for (const scheme of SCHEMES) {
    const v = evaluate(scheme, profile);
    if (v.status === 'ineligible') continue;
    const pending = v.pending.length;
    const soonest = (scheme.deadlines ?? [])
      .map((d) => ({ ...daysUntil(d.month, d.day, today), label: d.label }))
      .sort((a, b) => a.days - b.days)[0];
    if (soonest && soonest.days <= CLOSING_WINDOW_DAYS) {
      closing.push({ scheme, kind: 'closing', daysLeft: soonest.days, closes: iso(soonest.date), label: soonest.label, pending });
    } else if (scheme.trending) {
      trending.push({ scheme, kind: 'trending', pending });
    }
  }
  closing.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0) || a.pending - b.pending);
  trending.sort((a, b) => a.pending - b.pending);
  return [...closing, ...trending].slice(0, limit);
}
