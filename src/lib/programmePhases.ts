/**
 * Programme phase planning for running.
 *
 * Maps the number of weeks available between today and race day onto a
 * Lydiard-style phase split (base → development → specificity → taper).
 * Used both by the race-goal screen (to show the athlete what their
 * timeline buys them) and by anything downstream that needs to know
 * which phase of the cycle a given session belongs to.
 */

export type RunningPhaseId = 'base' | 'development' | 'specificity' | 'taper' | 'extra_base';

export interface RunningPhase {
  id: RunningPhaseId;
  label: string;
  weeks: number;
}

export interface RunningPhasePlan {
  /** Total weeks the plan spans (sum of phase weeks). */
  totalWeeks: number;
  /** Phases in chronological order. */
  phases: RunningPhase[];
  /** Tone bucket for messaging. */
  tone: 'short' | 'tight' | 'normal' | 'extended';
  /** One-line summary for the athlete. */
  summary: string;
}

const LABELS: Record<RunningPhaseId, string> = {
  base: 'Base aérobie',
  development: 'Développement',
  specificity: 'Spécificité',
  taper: 'Affûtage',
  extra_base: 'Base prolongée',
};

function phase(id: RunningPhaseId, weeks: number): RunningPhase {
  return { id, label: LABELS[id], weeks };
}

/**
 * Plan the phase breakdown for `weeksAvailable` weeks until race day.
 *
 *   ≥ 20: full programme + remainder added to base.
 *   12-19: base 3 + dev 3 + spec 3 + taper 2 (+ extras to base).
 *   8-11: base 2 + dev 2 + spec 2 + taper 2.
 *   < 8:  compressed — specificity + taper, athlete is warned.
 */
export function planPhases(weeksAvailable: number): RunningPhasePlan {
  const w = Math.max(0, Math.floor(weeksAvailable));
  if (w >= 20) {
    const extra = w - 14;
    return {
      totalWeeks: w,
      phases: [
        phase('base', 4 + extra),
        phase('development', 4),
        phase('specificity', 4),
        phase('taper', 2),
      ],
      tone: 'extended',
      summary: `Tu as ${w} semaines. Programme optimal possible. On commence par ${4 + extra} semaines de base solide, puis développement et spécificité.`,
    };
  }
  if (w >= 12) {
    const extra = w - 11;
    return {
      totalWeeks: w,
      phases: [
        phase('base', 3 + extra),
        phase('development', 3),
        phase('specificity', 3),
        phase('taper', 2),
      ],
      tone: 'normal',
      summary: `Tu as ${w} semaines : programme complet · base ${3 + extra}, développement 3, spécificité 3, affûtage 2.`,
    };
  }
  if (w >= 8) {
    const extra = w - 8;
    return {
      totalWeeks: w,
      phases: [
        phase('base', 2 + extra),
        phase('development', 2),
        phase('specificity', 2),
        phase('taper', 2),
      ],
      tone: 'tight',
      summary: `Tu as ${w} semaines : programme resserré · base ${2 + extra}, développement 2, spécificité 2, affûtage 2.`,
    };
  }
  const taperWeeks = Math.min(2, Math.max(1, w - 1));
  const specWeeks = Math.max(0, w - taperWeeks);
  return {
    totalWeeks: w,
    phases: [
      phase('specificity', specWeeks),
      phase('taper', taperWeeks),
    ].filter((p) => p.weeks > 0),
    tone: 'short',
    summary:
      w === 0
        ? "La course est aujourd'hui ou passée — choisis une nouvelle date."
        : `Seulement ${w} semaines. Pas assez de temps pour un programme complet. On maximise ta préparation sur les semaines restantes.`,
  };
}

/**
 * Compute integer weeks between `today` and `raceDateIso`. Returns null when
 * the date is missing or invalid; negative numbers when the race is past.
 */
export function weeksUntilRace(raceDateIso: string | null | undefined, today: Date = new Date()): number | null {
  if (!raceDateIso) return null;
  const m = raceDateIso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const race = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.floor((race.getTime() - t.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, Math.round(days / 7));
}
