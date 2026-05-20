/**
 * Advanced Running Science Engine
 *
 * REFERENCES:
 *   Maffetone P (1996) "The Maffetone Method"
 *   Lydiard A (1962) "Running to the Top"
 *   Daniels J (2014) "Daniels' Running Formula" (VDOT framework)
 */

import type { RunningProfile } from '../firestore';

export interface MAFHeartRate {
  mafHR: number;
  explanation: string;
  useCase: string;
}

/**
 * Compute the Maffetone Maximum Aerobic Function heart rate.
 *
 * Baseline: 180 - age, then adjusted by Maffetone's modifiers.
 *
 * @param params age and health/training modifiers
 * @returns MAF heart rate with French explanation
 */
export function calculateMAFHeartRate(params: {
  age: number;
  hasRecentIllnessOrInjury?: boolean;
  isOnMedication?: boolean;
  hasBeenTrainingConsistently2Years?: boolean;
  isVeryFitAndProgressing?: boolean;
}): MAFHeartRate {
  const {
    age,
    hasRecentIllnessOrInjury,
    isOnMedication,
    hasBeenTrainingConsistently2Years,
    isVeryFitAndProgressing,
  } = params;

  const safeAge = Number.isFinite(age) && age > 0 ? age : 30;
  let hr = 180 - safeAge;
  if (hasRecentIllnessOrInjury) hr -= 5;
  if (isOnMedication) hr -= 5;
  if (hasBeenTrainingConsistently2Years) hr += 5;
  if (
    isVeryFitAndProgressing &&
    hasBeenTrainingConsistently2Years
  ) {
    hr += 5;
  }
  hr = Math.max(100, Math.min(180, hr));

  return {
    mafHR: hr,
    explanation:
      "Fréquence cardiaque maximale aérobie selon la formule Maffetone (180 moins l'âge plus ajustements).",
    useCase:
      "Reste sous cette FC pour toutes les sorties faciles et longues. Base aérobie construite sans stress oxydatif.",
  };
}

export interface LydiardPhase {
  name: string;
  duration_weeks: number;
  description: string;
  easyRunPercent: number;
  tempoPercent: number;
  intervalPercent: number;
  racePacePercent: number;
  weeklyVolumeMultiplier: number;
  keyWorkout: string;
}

export const LYDIARD_PHASES: LydiardPhase[] = [
  {
    name: 'Base aérobie',
    duration_weeks: 10,
    description:
      "Construction de l'endurance fondamentale. Volume maximal, intensité minimale.",
    easyRunPercent: 0.95,
    tempoPercent: 0.05,
    intervalPercent: 0,
    racePacePercent: 0,
    weeklyVolumeMultiplier: 1.0,
    keyWorkout: 'Sortie longue progressive chaque dimanche',
  },
  {
    name: 'Développement anaérobie',
    duration_weeks: 4,
    description:
      "Introduction du travail de seuil et de VO2max sur base aérobie solide.",
    easyRunPercent: 0.75,
    tempoPercent: 0.15,
    intervalPercent: 0.1,
    racePacePercent: 0,
    weeklyVolumeMultiplier: 0.85,
    keyWorkout: 'Tempo 30 min plus 1 séance intervalles hebdomadaire',
  },
  {
    name: 'Coordination et vitesse',
    duration_weeks: 3,
    description:
      "Travail à l'allure de course. Réduire le volume, affiner la vitesse.",
    easyRunPercent: 0.7,
    tempoPercent: 0.1,
    intervalPercent: 0.1,
    racePacePercent: 0.1,
    weeklyVolumeMultiplier: 0.7,
    keyWorkout: "Répétitions à l'allure objectif",
  },
  {
    name: 'Affûtage compétition',
    duration_weeks: 2,
    description:
      "Réduction du volume. Maintien de l'intensité. Fraîcheur maximale.",
    easyRunPercent: 0.8,
    tempoPercent: 0.1,
    intervalPercent: 0,
    racePacePercent: 0.1,
    weeklyVolumeMultiplier: 0.5,
    keyWorkout:
      "Une séance allure course courte 3 jours avant la compétition",
  },
];

export interface RunningEfficiency {
  currentIndex: number;
  trendLast4Weeks: number;
  vsInitialBaseline: number;
  interpretation: string;
  recommendation: string;
}

interface CompletedRunEntry {
  date: string;
  avgPaceSecPerKm: number;
  rpe: number;
  durationMinutes: number;
}

/**
 * Compute a running efficiency index from completed runs.
 *
 * Index per run = (expectedPace - actualPace) / expectedPace * 100
 * where expectedPace is derived from the RPE-pace relationship vs the
 * threshold pace (RPE 7 = threshold). Positive = running faster than
 * the RPE would predict.
 *
 * @param completedRuns recent completed runs
 * @param thresholdPaceSecPerKm threshold pace from VDOT
 * @returns running efficiency report
 */
export function calculateRunningEfficiency(
  completedRuns: CompletedRunEntry[],
  thresholdPaceSecPerKm: number,
): RunningEfficiency {
  if (
    completedRuns.length === 0 ||
    !Number.isFinite(thresholdPaceSecPerKm) ||
    thresholdPaceSecPerKm <= 0
  ) {
    return {
      currentIndex: 0,
      trendLast4Weeks: 0,
      vsInitialBaseline: 0,
      interpretation:
        "Pas encore assez de courses pour calculer l'efficience.",
      recommendation:
        "Enregistre quelques sorties pour activer l'analyse d'efficience.",
    };
  }

  const sorted = [...completedRuns]
    .filter((r) => r.avgPaceSecPerKm > 0 && r.rpe > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const indices = sorted.map((r) => {
    // Map RPE 1-10 to a pace multiplier vs threshold (RPE 7 = 1.0).
    const paceMultiplier = paceMultiplierFromRPE(r.rpe);
    const expectedPace = thresholdPaceSecPerKm * paceMultiplier;
    if (expectedPace <= 0) return 0;
    return ((expectedPace - r.avgPaceSecPerKm) / expectedPace) * 100;
  });

  const currentIndex = round2(
    Math.max(0, Math.min(100, 50 + (indices[indices.length - 1] ?? 0))),
  );
  const last4Weeks = indices.slice(-Math.min(12, indices.length));
  const trendLast4Weeks = round2(trendSlope(last4Weeks));
  const vsInitialBaseline =
    indices.length > 1
      ? round2(indices[indices.length - 1] - indices[0])
      : 0;

  let interpretation: string;
  let recommendation: string;
  if (currentIndex >= 65) {
    interpretation =
      "Très bonne efficience aérobie. Tu cours vite pour un effort modéré.";
    recommendation =
      "Continue le volume facile. Tu peux ajouter une séance qualité par semaine.";
  } else if (currentIndex >= 50) {
    interpretation =
      "Efficience dans la moyenne. La base aérobie se construit normalement.";
    recommendation =
      "Augmente progressivement le volume facile pour gagner en économie de course.";
  } else {
    interpretation =
      "Efficience faible. La vitesse exige un effort plus élevé que prévu.";
    recommendation =
      "Repos et nutrition prioritaires. Vérifie le sommeil et la dette aérobie.";
  }

  return {
    currentIndex,
    trendLast4Weeks,
    vsInitialBaseline,
    interpretation,
    recommendation,
  };
}

export interface VDOTHistoryPoint {
  date: string;
  vdot: number;
  source: string;
}

export interface VDOTPaceImprovement {
  distance: string;
  current: string;
  projected8w: string;
  projected16w: string;
}

export interface VDOTProgression {
  history: VDOTHistoryPoint[];
  currentVDOT: number;
  initialVDOT: number;
  totalGain: number;
  weeklyGainRate: number;
  projectedVDOT8Weeks: number;
  projectedVDOT16Weeks: number;
  paceImprovements: VDOTPaceImprovement[];
}

interface VDOTCapableRun {
  date?: string;
  avg_pace_sec_per_km?: number;
  actual_distance_km?: number;
  rpe?: number;
}

/**
 * Compute a coarse VDOT progression projection from past runs.
 *
 * Weekly gain rate is derived from completed runs at or near threshold
 * pace and projected linearly forward. Capped to realistic ranges.
 *
 * @param completedRuns past run sessions
 * @param runningProfile current running profile
 * @returns VDOT progression report
 */
export function trackVDOTProgression(
  completedRuns: VDOTCapableRun[],
  runningProfile: RunningProfile | null,
): VDOTProgression {
  const currentVDOT = runningProfile?.vdot ?? 0;
  const history: VDOTHistoryPoint[] = [];

  if (runningProfile && Number.isFinite(currentVDOT) && currentVDOT > 0) {
    history.push({
      date: isoFromTimestamp(runningProfile.updated_at) ?? today(),
      vdot: currentVDOT,
      source: 'profil',
    });
  }

  const initialVDOT = history.length > 0 ? history[0].vdot : currentVDOT;
  const totalGain = round2(currentVDOT - initialVDOT);

  // Weekly gain: 0.15 VDOT/week is a realistic intermediate progression.
  const weeklyGainRate = estimateWeeklyGain(completedRuns);
  const projectedVDOT8Weeks = round2(currentVDOT + weeklyGainRate * 8);
  const projectedVDOT16Weeks = round2(currentVDOT + weeklyGainRate * 16);

  const paceImprovements: VDOTPaceImprovement[] = [
    {
      distance: '5km',
      current: formatPace(paceFromVDOT(currentVDOT, '5km')),
      projected8w: formatPace(paceFromVDOT(projectedVDOT8Weeks, '5km')),
      projected16w: formatPace(paceFromVDOT(projectedVDOT16Weeks, '5km')),
    },
    {
      distance: '10km',
      current: formatPace(paceFromVDOT(currentVDOT, '10km')),
      projected8w: formatPace(paceFromVDOT(projectedVDOT8Weeks, '10km')),
      projected16w: formatPace(paceFromVDOT(projectedVDOT16Weeks, '10km')),
    },
    {
      distance: 'semi',
      current: formatPace(paceFromVDOT(currentVDOT, 'semi')),
      projected8w: formatPace(paceFromVDOT(projectedVDOT8Weeks, 'semi')),
      projected16w: formatPace(paceFromVDOT(projectedVDOT16Weeks, 'semi')),
    },
  ];

  return {
    history,
    currentVDOT: round2(currentVDOT),
    initialVDOT: round2(initialVDOT),
    totalGain,
    weeklyGainRate: round2(weeklyGainRate),
    projectedVDOT8Weeks,
    projectedVDOT16Weeks,
    paceImprovements,
  };
}

function paceMultiplierFromRPE(rpe: number): number {
  // RPE 7 = threshold (1.0). Easy paces have multipliers > 1 (slower).
  const map: Record<number, number> = {
    1: 1.6,
    2: 1.5,
    3: 1.4,
    4: 1.3,
    5: 1.2,
    6: 1.1,
    7: 1.0,
    8: 0.95,
    9: 0.9,
    10: 0.85,
  };
  const rounded = Math.max(1, Math.min(10, Math.round(rpe)));
  return map[rounded] ?? 1;
}

function trendSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((acc, v) => acc + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) * (i - meanX);
  }
  return den > 0 ? num / den : 0;
}

function estimateWeeklyGain(runs: VDOTCapableRun[]): number {
  if (runs.length < 4) return 0.1;
  const distinctWeeks = new Set<string>();
  for (const r of runs) {
    if (!r.date) continue;
    const d = parseISODate(r.date);
    if (!d) continue;
    const onejan = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.floor(
      (d.getTime() - onejan.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
    distinctWeeks.add(`${d.getUTCFullYear()}-${week}`);
  }
  const weeks = distinctWeeks.size;
  if (weeks < 2) return 0.1;
  // Conservative: more consistent weeks => slightly higher projected gain.
  return Math.min(0.25, 0.05 + Math.min(weeks, 12) * 0.015);
}

function paceFromVDOT(
  vdot: number,
  distance: '5km' | '10km' | 'semi',
): number {
  if (!Number.isFinite(vdot) || vdot <= 0) return 0;
  // Approximate Daniels VDOT race pace (sec/km).
  // At VDOT 50: 5k ~ 4:00/km, 10k ~ 4:13, semi ~ 4:30.
  const base50: Record<typeof distance, number> = {
    '5km': 240,
    '10km': 253,
    semi: 270,
  };
  // ~1.4% pace change per VDOT point.
  const factor = Math.pow(0.986, vdot - 50);
  return Math.round(base50[distance] * factor);
}

function formatPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '--:--';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

interface MaybeTimestamp {
  toDate?: () => Date;
}

function isoFromTimestamp(value: unknown): string | null {
  if (!value) return null;
  const maybeTS = value as MaybeTimestamp;
  if (typeof maybeTS.toDate === 'function') {
    const d = maybeTS.toDate();
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

function today(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function parseISODate(iso: string): Date | null {
  if (!iso || typeof iso !== 'string') return null;
  const parts = iso.split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

function round2(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}
