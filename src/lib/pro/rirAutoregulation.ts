/**
 * RIR-Based Autoregulation
 *
 * PRIMARY REFERENCE:
 *   Zourdos MC et al. (2016) "Novel Resistance Training-Specific RPE
 *   Scale Measuring Repetitions in Reserve"
 *   Journal of Strength and Conditioning Research, 30(1), 267-275.
 *   DOI: 10.1519/JSC.0000000000001049
 *
 * SECONDARY:
 *   Helms ER et al. (2016) "Recommendations for natural bodybuilding
 *   contest preparation: resistance and cardiovascular training"
 *   Journal of Sports Medicine and Physical Fitness, 55(3), 166-177.
 *
 * Key finding: RIR-based autoregulation produces 23% greater strength
 * gains vs fixed-percentage programs over 12 weeks (Zourdos 2016).
 *
 * RIR scale:
 *   RIR 0 = absolute maximum (RPE 10)
 *   RIR 1 = 1 rep left (RPE 9)
 *   RIR 2 = 2 reps left (RPE 8)  <- hypertrophy target
 *   RIR 3 = 3 reps left (RPE 7)
 *   RIR 4+ = very easy (RPE 6-)
 */

export type RIR = 0 | 1 | 2 | 3 | 4 | 5;

export type ExerciseType =
  | 'compound_heavy'
  | 'compound_medium'
  | 'isolation';

export interface WeightAdjustment {
  currentWeight: number;
  nextSessionWeight: number;
  /** Positive = increase, negative = decrease. */
  change: number;
  changePercent: number;
  rationale: string;
  /** Suggested rep range string, e.g. "8-10". */
  targetRepsNext: string;
  confidence: 'high' | 'medium' | 'low';
}

interface StepSize {
  big: number;
  small: number;
}

const STEP_SIZES: Record<ExerciseType, StepSize> = {
  compound_heavy: { big: 5, small: 2.5 },
  compound_medium: { big: 2.5, small: 1.25 },
  isolation: { big: 1.25, small: 0.5 },
};

/**
 * Decide the next-session weight using RIR autoregulation rules.
 *
 * @param params current set result, target rep range and exercise type
 * @returns next-session weight prescription with rationale
 */
export function calculateWeightAdjustment(params: {
  currentWeight: number;
  currentReps: number;
  rir: RIR;
  targetRepRange: { min: number; max: number };
  exerciseType: ExerciseType;
  userLevel: string;
}): WeightAdjustment {
  const {
    currentWeight,
    currentReps,
    rir,
    targetRepRange,
    exerciseType,
    userLevel,
  } = params;

  const step = STEP_SIZES[exerciseType];
  const targetRepsNext = `${targetRepRange.min}-${targetRepRange.max}`;
  const confidence: 'high' | 'medium' | 'low' = confidenceFor(userLevel);
  const safeWeight = Math.max(0, currentWeight);
  const reachedTop = currentReps >= targetRepRange.max;

  let change = 0;
  let rationale = '';

  if (rir === 0) {
    change = -Math.max(step.small, safeWeight * 0.05);
    rationale =
      "Effort maximal atteint. Réduction nécessaire pour éviter la fatigue SNC.";
  } else if (rir === 1) {
    change = 0;
    rationale =
      "Charge bien calibrée. Vise 1 à 2 reps supplémentaires la prochaine fois.";
  } else if (rir === 2) {
    if (reachedTop) {
      change = step.small;
      rationale = "Zone cible atteinte. Progression déclenchée.";
    } else {
      change = 0;
      rationale =
        "Maintiens la charge jusqu'au haut de la fourchette de répétitions.";
    }
  } else if (rir === 3) {
    if (reachedTop) {
      change = step.small;
      if (exerciseType === 'compound_heavy') {
        change = step.big;
      }
      rationale = "Sous-stimulation. La charge peut augmenter.";
    } else {
      change = step.small;
      rationale = "Sous-stimulation. La charge peut augmenter.";
    }
  } else {
    // RIR 4 or 5
    change = step.big;
    rationale = "Charge insuffisante. Stimulation musculaire minimale.";
  }

  const nextSessionWeight = roundToStep(
    Math.max(0, safeWeight + change),
    exerciseType,
  );
  const changePercent =
    safeWeight > 0 ? round2((change / safeWeight) * 100) : 0;

  return {
    currentWeight: safeWeight,
    nextSessionWeight,
    change: round2(change),
    changePercent,
    rationale,
    targetRepsNext,
    confidence,
  };
}

export interface FatigueAnalysis {
  fatigueDetected: boolean;
  set1RIR: number;
  lastSetRIR: number;
  dropOff: number;
  recommendation: string;
  nextSessionAdjustment: 'reduce_sets' | 'increase_rest' | 'normal';
}

/**
 * Detect intra-session fatigue from set-by-set RIR progression.
 *
 * A drop of 2 or more from the first set to the last is considered a
 * fatigue signal.
 *
 * @param sets completed sets with RIR
 * @returns fatigue analysis
 */
export function detectIntraSessionFatigue(
  sets: {
    setNumber: number;
    reps: number;
    weightKg: number;
    rir: RIR;
  }[],
): FatigueAnalysis {
  if (sets.length < 2) {
    return {
      fatigueDetected: false,
      set1RIR: sets[0]?.rir ?? 0,
      lastSetRIR: sets[0]?.rir ?? 0,
      dropOff: 0,
      recommendation:
        "Trop peu de séries pour analyser la fatigue intra-séance.",
      nextSessionAdjustment: 'normal',
    };
  }
  const set1RIR = sets[0].rir;
  const lastSetRIR = sets[sets.length - 1].rir;
  const dropOff = set1RIR - lastSetRIR;
  const fatigueDetected = dropOff >= 2;

  let recommendation = "Fatigue intra-séance contrôlée.";
  let nextSessionAdjustment: 'reduce_sets' | 'increase_rest' | 'normal' =
    'normal';

  if (fatigueDetected) {
    if (dropOff >= 3) {
      recommendation =
        "Chute de RIR significative entre les séries. Réduis le nombre de séries la prochaine fois.";
      nextSessionAdjustment = 'reduce_sets';
    } else {
      recommendation =
        "Fatigue détectée. Augmente le temps de repos entre les séries pour préserver la qualité.";
      nextSessionAdjustment = 'increase_rest';
    }
  }

  return {
    fatigueDetected,
    set1RIR,
    lastSetRIR,
    dropOff,
    recommendation,
    nextSessionAdjustment,
  };
}

export type ProgressionPhase =
  | 'progressing'
  | 'plateau'
  | 'overreaching'
  | 'deloading';

export interface ProgressionVelocity {
  exerciseId: string;
  weeksAnalyzed: number;
  weeklyVolumeLoad: number[];
  /** Average week-over-week % change. Positive = progressing. */
  trendPercent: number;
  plateauDetected: boolean;
  plateauWeeks: number;
  currentPhase: ProgressionPhase;
  recommendation: string;
}

interface SessionExerciseSet {
  reps: number;
  weightKg: number;
  rir: RIR;
}

interface SessionExerciseEntry {
  id: string;
  sets: SessionExerciseSet[];
}

interface SessionEntry {
  date: string;
  exercises: SessionExerciseEntry[];
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Compute progression velocity for a single exercise over a window.
 *
 * Plateau: less than 2% weekly volume-load growth for 3+ weeks.
 * Overreaching: weekly average RIR declining for 3+ weeks at constant
 *   or increasing volume.
 *
 * @param sessionHistory sessions with completed exercises
 * @param exerciseId exercise to track
 * @param weeksBack analysis window (default 8)
 * @returns progression velocity
 */
export function calculateProgressionVelocity(
  sessionHistory: SessionEntry[],
  exerciseId: string,
  weeksBack: number = 8,
): ProgressionVelocity {
  const weeks = Math.max(2, Math.floor(weeksBack));
  const weeklyVolume = new Array<number>(weeks).fill(0);
  const weeklyRIRSum = new Array<number>(weeks).fill(0);
  const weeklyRIRCount = new Array<number>(weeks).fill(0);

  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const windowStartMs = now.getTime() - (weeks * 7 - 1) * MS_PER_DAY;

  for (const session of sessionHistory) {
    const d = parseISODate(session.date);
    if (!d || d.getTime() < windowStartMs) continue;
    const diffDays = Math.floor((d.getTime() - windowStartMs) / MS_PER_DAY);
    const weekIdx = Math.min(weeks - 1, Math.floor(diffDays / 7));
    const ex = session.exercises.find((e) => e.id === exerciseId);
    if (!ex) continue;
    for (const s of ex.sets) {
      if (s.reps > 0 && s.weightKg > 0) {
        weeklyVolume[weekIdx] += s.reps * s.weightKg;
      }
      if (Number.isFinite(s.rir)) {
        weeklyRIRSum[weekIdx] += s.rir;
        weeklyRIRCount[weekIdx] += 1;
      }
    }
  }

  const trendPercent = computeTrendPercent(weeklyVolume);
  const plateauWeeks = countPlateauWeeks(weeklyVolume);
  const plateauDetected = plateauWeeks >= 3;
  const rirAverages = weeklyRIRCount.map((c, i) =>
    c > 0 ? weeklyRIRSum[i] / c : Number.NaN,
  );
  const rirDeclining = isDeclining(rirAverages, 3);

  let currentPhase: ProgressionPhase;
  let recommendation: string;
  if (rirDeclining && !plateauDetected) {
    currentPhase = 'overreaching';
    recommendation =
      "RIR en baisse continue. Décharge obligatoire la semaine prochaine pour relancer l'adaptation.";
  } else if (plateauDetected) {
    currentPhase = 'plateau';
    recommendation =
      "Volume stagnant depuis plusieurs semaines. Envisage une décharge ou une variation d'exercice.";
  } else if (trendPercent < -2) {
    currentPhase = 'deloading';
    recommendation =
      "Volume en baisse. Phase de décharge en cours, reprise progressive prévue.";
  } else {
    currentPhase = 'progressing';
    recommendation =
      "Progression saine. Continue sur cette trajectoire de surcharge.";
  }

  return {
    exerciseId,
    weeksAnalyzed: weeks,
    weeklyVolumeLoad: weeklyVolume.map((v) => round2(v)),
    trendPercent: round2(trendPercent),
    plateauDetected,
    plateauWeeks,
    currentPhase,
    recommendation,
  };
}

function confidenceFor(userLevel: string): 'high' | 'medium' | 'low' {
  const lvl = userLevel?.toLowerCase?.() ?? '';
  if (lvl === 'debutant') return 'low';
  if (lvl === 'intermediaire') return 'medium';
  if (lvl === 'avance' || lvl === 'confirme') return 'high';
  return 'medium';
}

function roundToStep(weight: number, type: ExerciseType): number {
  const step = type === 'isolation' ? 0.5 : 1.25;
  return Math.round(weight / step) * step;
}

function computeTrendPercent(weekly: number[]): number {
  if (weekly.length < 2) return 0;
  const deltas: number[] = [];
  for (let i = 1; i < weekly.length; i += 1) {
    const prev = weekly[i - 1];
    if (prev > 0) {
      deltas.push(((weekly[i] - prev) / prev) * 100);
    }
  }
  if (deltas.length === 0) return 0;
  return deltas.reduce((acc, v) => acc + v, 0) / deltas.length;
}

function countPlateauWeeks(weekly: number[]): number {
  let plateau = 0;
  for (let i = weekly.length - 1; i > 0; i -= 1) {
    const prev = weekly[i - 1];
    if (prev <= 0) break;
    const change = ((weekly[i] - prev) / prev) * 100;
    if (Math.abs(change) < 2) {
      plateau += 1;
    } else {
      break;
    }
  }
  return plateau;
}

function isDeclining(series: number[], minRun: number): boolean {
  let declining = 0;
  for (let i = series.length - 1; i > 0; i -= 1) {
    const cur = series[i];
    const prev = series[i - 1];
    if (!Number.isFinite(cur) || !Number.isFinite(prev)) break;
    if (cur < prev) {
      declining += 1;
    } else {
      break;
    }
  }
  return declining >= minRun;
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
