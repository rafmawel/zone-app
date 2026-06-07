/**
 * Week progression engine.
 *
 * Sport-agnostic decision layer that evaluates whether a training week
 * should advance, repeat, or carry adjustments forward. Each sport
 * registers a {@link WeekProgressionConfig} declaring its progression
 * style (calendar, volume, MEV, station); the engine itself stays free
 * of sport-specific branches once configs are in place.
 *
 * References:
 *   - Soviet calendar periodization (Medvedyev, Verkhoshansky)
 *   - Daniels' Running Formula 2005 (10 percent rule)
 *   - Israetel MEV / MAV / MRV 2019
 *   - Tschakert and Hofmann 2013 (Hyrox energy systems)
 */

import type { Gender } from './firestore';

export type ProSport = 'weightlifting' | 'running' | 'musculation' | 'hyrox' | string;

export type ProgressionType = 'calendar' | 'volume' | 'mev' | 'station';

export interface CompletionThresholds {
  optimal: number;
  partial: number;
  insufficient: number;
}

export interface WeekProgressionConfig {
  sport: ProSport;
  progressionType: ProgressionType;
  daysBeforeForceAdvance: number;
  completionThresholds: CompletionThresholds;
}

export interface WeekProgressionAdjustments {
  intensityDelta?: number;
  volumeMultiplier?: number;
  priorityMuscles?: string[];
  priorityStations?: string[];
  extraSets?: Record<string, number>;
}

export interface WeekProgressionResult {
  canAdvance: boolean;
  shouldRepeat: boolean;
  advanceWithWarning: boolean;
  note: string;
  adjustments: WeekProgressionAdjustments;
}

export interface MuscleVolumeTarget {
  MEV: number;
  MAV: number;
}

export interface SportProfile {
  sessionsPerWeek: number;
  plannedKmPerWeek?: number;
  muscleTargets?: Record<string, MuscleVolumeTarget>;
  stationsTracked?: string[];
  muscleLabels?: Record<string, string>;
  stationLabels?: Record<string, string>;
}

export interface WeekData {
  sport: ProSport;
  weekNumber: number;
  plannedSessions: number;
  completedSessions: number;
  /** Sessions the athlete deliberately skipped this week. */
  skippedSessions?: number;
  plannedKm?: number;
  actualKm?: number;
  muscleSets?: Record<string, number>;
  stationsWorked?: string[];
  startedAt: Date;
}

export type ProgressionTrigger = 'session_complete' | 'skip' | 'timeout' | 'manual';

const DEFAULT_THRESHOLDS: CompletionThresholds = {
  optimal: 1.0,
  partial: 0.7,
  insufficient: 0.5,
};

/**
 * Registry of every sport's progression configuration.
 *
 * Add a new entry to teach the engine about a new sport. No other code
 * changes are needed: progression engines are picked by `progressionType`.
 */
export const SPORT_CONFIGS: Record<string, WeekProgressionConfig> = {
  weightlifting: {
    sport: 'weightlifting',
    progressionType: 'calendar',
    daysBeforeForceAdvance: 10,
    completionThresholds: DEFAULT_THRESHOLDS,
  },
  running: {
    sport: 'running',
    progressionType: 'volume',
    daysBeforeForceAdvance: 10,
    completionThresholds: DEFAULT_THRESHOLDS,
  },
  musculation: {
    sport: 'musculation',
    progressionType: 'mev',
    daysBeforeForceAdvance: 10,
    completionThresholds: DEFAULT_THRESHOLDS,
  },
  hyrox: {
    sport: 'hyrox',
    progressionType: 'station',
    daysBeforeForceAdvance: 10,
    completionThresholds: DEFAULT_THRESHOLDS,
  },
};

/**
 * Read a sport's configuration, falling back to a calendar-based default
 * for sports that have not been registered yet.
 */
export function getSportConfig(sport: ProSport): WeekProgressionConfig {
  return (
    SPORT_CONFIGS[sport] ?? {
      sport,
      progressionType: 'calendar',
      daysBeforeForceAdvance: 10,
      completionThresholds: DEFAULT_THRESHOLDS,
    }
  );
}

/**
 * Register or override a sport configuration at runtime. Useful for
 * unit tests and future sports that need to be wired without a code
 * change to the engine.
 */
export function registerSportConfig(config: WeekProgressionConfig): void {
  SPORT_CONFIGS[config.sport] = config;
}

export function daysSince(start: Date, now: Date = new Date()): number {
  const ms = now.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function completionRate(week: WeekData): number {
  if (week.plannedSessions <= 0) return 0;
  // Skipped sessions count as "handled": once every planned slot is
  // either completed or skipped, the week is done.
  const done = week.completedSessions + (week.skippedSessions ?? 0);
  return done / week.plannedSessions;
}

function calendarProgression(
  week: WeekData,
  config: WeekProgressionConfig,
  forceAdvance: boolean,
): WeekProgressionResult {
  const rate = completionRate(week);
  const next = week.weekNumber + 1;
  const t = config.completionThresholds;

  if (rate >= t.optimal) {
    return {
      canAdvance: true,
      shouldRepeat: false,
      advanceWithWarning: false,
      note: `Semaine complète. Progression optimale. +2,5 % semaine ${next}.`,
      adjustments: { intensityDelta: 0.025 },
    };
  }
  if (rate >= t.partial) {
    return {
      canAdvance: true,
      shouldRepeat: false,
      advanceWithWarning: false,
      note: 'Bonne semaine. Légère dette de stimulus. Intensité maintenue.',
      adjustments: { intensityDelta: 0 },
    };
  }
  if (rate >= t.insufficient) {
    return {
      canAdvance: true,
      shouldRepeat: false,
      advanceWithWarning: true,
      note: `Semaine partielle. Progression suspendue. Même intensité semaine ${next}.`,
      adjustments: { intensityDelta: 0 },
    };
  }
  if (forceAdvance) {
    return {
      canAdvance: true,
      shouldRepeat: false,
      advanceWithWarning: true,
      note: `Semaine ${week.weekNumber} non réalisée. Ton SNC n'a pas reçu le stimulus nécessaire. Intensité réduite de 5 % pour reprendre progressivement.`,
      adjustments: { intensityDelta: -0.05 },
    };
  }
  return {
    canAdvance: true,
    shouldRepeat: false,
    advanceWithWarning: true,
    note: `Semaine ${week.weekNumber} non réalisée. Ton SNC n'a pas reçu le stimulus nécessaire. Intensité réduite de 5 % pour reprendre progressivement.`,
    adjustments: { intensityDelta: -0.05 },
  };
}

function volumeProgression(
  week: WeekData,
  config: WeekProgressionConfig,
  forceAdvance: boolean,
): WeekProgressionResult {
  const planned = week.plannedKm ?? 0;
  const actual = week.actualKm ?? 0;
  const ratio = planned > 0 ? actual / planned : 0;
  const t = config.completionThresholds;
  const next = week.weekNumber + 1;
  const km = (n: number): string => `${Math.round(n * 10) / 10}km`;

  if (ratio >= t.partial) {
    const note =
      ratio >= t.optimal
        ? `Volume hebdomadaire atteint. Progression maintenue.`
        : `Tu as couru ${km(actual)} sur ${km(planned)} prévus. Progression maintenue.`;
    return {
      canAdvance: true,
      shouldRepeat: false,
      advanceWithWarning: false,
      note,
      adjustments: { volumeMultiplier: 1 },
    };
  }
  if (ratio >= t.insufficient) {
    return {
      canAdvance: true,
      shouldRepeat: false,
      advanceWithWarning: true,
      note: `Volume insuffisant cette semaine (${km(actual)}/${km(planned)}). Semaine ${next} légèrement réduite pour respecter la règle des 10 % et éviter les blessures.`,
      adjustments: { volumeMultiplier: 0.9 },
    };
  }
  if (forceAdvance) {
    return {
      canAdvance: true,
      shouldRepeat: false,
      advanceWithWarning: true,
      note: `Volume très faible (${km(actual)}/${km(planned)}). Semaine ${next} réduite de 15 %, sois prudent à la reprise.`,
      adjustments: { volumeMultiplier: 0.85 },
    };
  }
  return {
    canAdvance: false,
    shouldRepeat: true,
    advanceWithWarning: false,
    note: `Volume très faible (${km(actual)}/${km(planned)}). On te recommande de reprendre la semaine ${week.weekNumber} ou de continuer avec un volume réduit.`,
    adjustments: { volumeMultiplier: 0.85 },
  };
}

function mevProgression(
  week: WeekData,
  config: WeekProgressionConfig,
  profile: SportProfile,
  forceAdvance: boolean,
): WeekProgressionResult {
  const sets = week.muscleSets ?? {};
  const targets = profile.muscleTargets ?? {};
  const next = week.weekNumber + 1;

  const tracked = Object.keys(targets);
  if (tracked.length === 0) {
    return {
      canAdvance: true,
      shouldRepeat: false,
      advanceWithWarning: false,
      note: 'Progression maintenue.',
      adjustments: {},
    };
  }

  const under: { muscle: string; done: number; mev: number }[] = [];
  for (const muscle of tracked) {
    const done = sets[muscle] ?? 0;
    const mev = targets[muscle].MEV;
    if (done < mev) under.push({ muscle, done, mev });
  }

  const underRatio = under.length / tracked.length;
  const labelMap = profile.muscleLabels ?? {};
  const muscleLabel = (m: string): string => labelMap[m] ?? capitalize(m);

  if (under.length === 0) {
    return {
      canAdvance: true,
      shouldRepeat: false,
      advanceWithWarning: false,
      note: 'Tous les groupes musculaires ont reçu le volume minimum. Progression optimale.',
      adjustments: {},
    };
  }

  const labels = under
    .map((u) => `${muscleLabel(u.muscle)}: ${u.done}/${u.mev} séries min`)
    .join(' · ');

  if (underRatio <= 1 - config.completionThresholds.insufficient) {
    const extraSets: Record<string, number> = {};
    for (const u of under) {
      const gap = u.mev - u.done;
      const cap = Math.max(1, Math.min(2, gap));
      const mav = profile.muscleTargets?.[u.muscle]?.MAV ?? u.mev + 2;
      const target = Math.min(mav, u.mev + cap);
      extraSets[u.muscle] = target - u.mev;
    }
    return {
      canAdvance: true,
      shouldRepeat: false,
      advanceWithWarning: false,
      note: `Groupes sous-stimulés cette semaine: ${labels}. En semaine ${next}, ces muscles seront priorisés.`,
      adjustments: {
        priorityMuscles: under.map((u) => u.muscle),
        extraSets,
      },
    };
  }

  if (forceAdvance) {
    return {
      canAdvance: true,
      shouldRepeat: false,
      advanceWithWarning: true,
      note: `Volume insuffisant sur ${under.length}/${tracked.length} groupes. Semaine ${next} forcée: ${labels}. Ces muscles seront priorisés.`,
      adjustments: {
        priorityMuscles: under.map((u) => u.muscle),
      },
    };
  }

  return {
    canAdvance: false,
    shouldRepeat: true,
    advanceWithWarning: false,
    note: `Volume insuffisant sur ${under.length}/${tracked.length} groupes. Tu peux reprendre la semaine ${week.weekNumber} ou continuer quand même: ${labels}.`,
    adjustments: {
      priorityMuscles: under.map((u) => u.muscle),
    },
  };
}

function stationProgression(
  week: WeekData,
  _config: WeekProgressionConfig,
  profile: SportProfile,
  forceAdvance: boolean,
): WeekProgressionResult {
  const tracked = profile.stationsTracked ?? [];
  const worked = week.stationsWorked ?? [];
  const counts = new Map<string, number>();
  for (const s of worked) counts.set(s, (counts.get(s) ?? 0) + 1);

  const missing = tracked.filter((s) => (counts.get(s) ?? 0) === 0);
  const minimal = tracked.filter((s) => (counts.get(s) ?? 0) === 1);
  const next = week.weekNumber + 1;
  const rate = completionRate(week);

  if (tracked.length === 0) {
    const note = rate >= 1
      ? `Bonne répétition. Progresse en semaine ${next}.`
      : 'Stimulus reçu. Progression maintenue.';
    return {
      canAdvance: true,
      shouldRepeat: false,
      advanceWithWarning: false,
      note,
      adjustments: {},
    };
  }

  if (missing.length === 0 && minimal.length === 0) {
    return {
      canAdvance: true,
      shouldRepeat: false,
      advanceWithWarning: false,
      note: `Toutes les stations couvertes au moins deux fois. Progression optimale.`,
      adjustments: {},
    };
  }

  const stationLabel = (s: string): string => profile.stationLabels?.[s] ?? capitalize(s);
  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`Stations non travaillées cette semaine: ${missing.map(stationLabel).join(', ')}.`);
  }
  if (minimal.length > 0) {
    parts.push(`Stimulus minimal sur: ${minimal.map(stationLabel).join(', ')}.`);
  }
  parts.push(`Ces stations seront prioritaires en semaine ${next}.`);

  if (rate < 0.5 && !forceAdvance) {
    return {
      canAdvance: false,
      shouldRepeat: true,
      advanceWithWarning: false,
      note: `Semaine ${week.weekNumber} très incomplète. Reprends-la ou continue avec une session station ajustée. ${parts.join(' ')}`,
      adjustments: {
        priorityStations: [...missing, ...minimal],
      },
    };
  }

  return {
    canAdvance: true,
    shouldRepeat: false,
    advanceWithWarning: missing.length > 0,
    note: parts.join(' '),
    adjustments: {
      priorityStations: [...missing, ...minimal],
    },
  };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Evaluate whether the user's current week should advance.
 *
 * Returns a {@link WeekProgressionResult} that the queue can use to
 * advance, repeat, or carry adjustments into the next week. The result
 * never blocks the user: even insufficient weeks can be force-advanced
 * via the `force` flag (used by the seven and ten day timeouts).
 *
 * @param sport       sport key (must have a registered config or fall back to calendar)
 * @param weekData    measured week data, including sessions and start date
 * @param profile     sport-specific profile data (per-muscle targets, station list, etc.)
 * @param gender      currently unused but reserved for future MEV / VDOT skew
 */
export function checkWeekProgression(
  sport: ProSport,
  weekData: WeekData,
  profile: SportProfile,
  gender: Gender,
  trigger: ProgressionTrigger = 'manual',
  onVacation: boolean = false,
): WeekProgressionResult {
  void gender;
  const config = getSportConfig(sport);
  const days = daysSince(weekData.startedAt);

  // Vacation mode freezes every progression check: the bilan stays
  // hidden, the 10-day timeout does not trigger, and the queue does
  // not advance. Sessions remain available — the athlete just sees
  // the "Mode vacances actif" state on the home tab.
  if (onVacation) {
    return {
      canAdvance: false,
      shouldRepeat: false,
      advanceWithWarning: false,
      note: 'Vacances actives. La progression reprend à ton retour.',
      adjustments: {},
    };
  }

  const forceAdvance = days >= config.daysBeforeForceAdvance || trigger === 'timeout';
  const rate = completionRate(weekData);
  const allDone = rate >= 1;

  // The primary advance trigger is "all planned sessions are either
  // completed or skipped". The 7-day calendar rule is no longer the
  // gate; the only fallback is a 10-day safety timeout.
  if (!allDone && !forceAdvance) {
    const done =
      weekData.completedSessions + (weekData.skippedSessions ?? 0);
    return {
      canAdvance: false,
      shouldRepeat: false,
      advanceWithWarning: false,
      note: `Semaine ${weekData.weekNumber} en cours. ${done}/${weekData.plannedSessions} séances faites.`,
      adjustments: {},
    };
  }

  let result: WeekProgressionResult;
  switch (config.progressionType) {
    case 'volume':
      result = volumeProgression(weekData, config, forceAdvance);
      break;
    case 'mev':
      result = mevProgression(weekData, config, profile, forceAdvance);
      break;
    case 'station':
      result = stationProgression(weekData, config, profile, forceAdvance);
      break;
    case 'calendar':
    default:
      result = calendarProgression(weekData, config, forceAdvance);
      break;
  }

  // Timeout fallback gets a dedicated user-facing note so it's clear
  // why the bilan surfaced without the week being completed.
  if (forceAdvance && !allDone) {
    result = {
      ...result,
      canAdvance: true,
      advanceWithWarning: true,
      note: `Semaine ${weekData.weekNumber} expirée. ${weekData.completedSessions + (weekData.skippedSessions ?? 0)}/${weekData.plannedSessions} séances faites. ${result.note}`,
    };
  }
  return result;
}
