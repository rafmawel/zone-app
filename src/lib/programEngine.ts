import type {
  ExerciseMax,
  PlannedSet,
  ProgramBlock,
  ProgramSport,
  SessionExercise,
  TrainingSession,
  UserProgram,
} from './firestore';

export type WeekIndex = 1 | 2 | 3 | 4;
export type LevelKey = 'debutant' | 'intermediaire' | 'avance' | 'confirme';

export function estimateOneRepMax(weight: number, reps: number): number {
  if (reps <= 1) return Math.round(weight);
  return Math.round(weight * (1 + reps / 30));
}

/**
 * Was this set taken to failure (RIR 0)?
 *
 * A failed set is not a performance: the athlete did not own the weight, so it
 * must never establish a 1RM, be written to `maxes/` or be announced as a PR.
 *
 * RIR is stored in `CompletedSet.rpe` as `10 - rir` (see the RIR picker in the
 * session screen), so failure is normally written as `rpe: 10`. A literal
 * `rpe: 0` is not produced by any picker and means a raw RIR reached the field
 * unconverted — it denotes the same thing, so both count as failure.
 */
export function isFailedSet(rpe: number | null | undefined): boolean {
  return rpe === 10 || rpe === 0;
}

/**
 * Round a target weight to a loadable barbell value.
 *
 * Plates come in 2.5 kg pairs, so round to the nearest 2.5 kg and never
 * go below the 20 kg empty barbell.
 *
 * @param weightKg raw computed weight
 * @returns nearest loadable weight, minimum 20 kg
 */
export function roundToBar(weightKg: number): number {
  if (!Number.isFinite(weightKg)) return 20;
  return Math.max(20, Math.round(weightKg / 2.5) * 2.5);
}

export function getBlockName(block: ProgramBlock): string {
  if (block === 1) return 'ACCUMULATION';
  if (block === 2) return 'INTENSIFICATION';
  return 'RÉALISATION';
}

export type WeightliftingLevelTier = 'beginner' | 'intermediate' | 'advanced';

/** Map the French onboarding level onto a coarse training tier. */
export function levelTier(level: string): WeightliftingLevelTier {
  if (level === 'avance' || level === 'confirme') return 'advanced';
  if (level === 'intermediaire') return 'intermediate';
  return 'beginner';
}

// Working sets per exercise, scaled by block and level. Volume peaks in
// block 2 (intensification) and tapers in block 3 (realisation).
const SETS_BY_BLOCK_LEVEL: Record<ProgramBlock, Record<WeightliftingLevelTier, number>> = {
  1: { beginner: 3, intermediate: 4, advanced: 5 },
  2: { beginner: 4, intermediate: 5, advanced: 6 },
  3: { beginner: 3, intermediate: 4, advanced: 5 },
};

/** Working set count per exercise for a given block and level. */
export function setsForBlockLevel(block: ProgramBlock, level: string): number {
  return SETS_BY_BLOCK_LEVEL[block][levelTier(level)];
}

const EXERCISES_BY_LEVEL: Record<WeightliftingLevelTier, number> = {
  beginner: 3,
  intermediate: 4,
  advanced: 5,
};

/** Number of exercises per session for a given level. */
export function exerciseCountForLevel(level: string): number {
  return EXERCISES_BY_LEVEL[levelTier(level)];
}

/** Fallback body weight (kg) when the athlete's is unknown. */
export const DEFAULT_BODYWEIGHT_KG = 75;

/**
 * Detect the athlete's training level from the Snatch/bodyweight ratio and the
 * number of completed mesocycles (weightlifting strength standards).
 *
 * - Débutant : ratio < 0.65× BW, or fewer than 3 mesocycles completed
 * - Intermédiaire : 0.65–0.95× BW
 * - Avancé : > 0.95× BW
 */
export function detectLevel(
  snatchMax: number,
  bodyweightKg: number,
  mesocyclesCompleted: number,
): LevelKey {
  const bw = bodyweightKg > 0 ? bodyweightKg : DEFAULT_BODYWEIGHT_KG;
  const ratio = snatchMax / bw;
  if (ratio < 0.65 || mesocyclesCompleted < 3) return 'debutant';
  if (ratio < 0.95) return 'intermediaire';
  return 'avance';
}

const LEVEL_RANK: Record<string, number> = {
  debutant: 0,
  intermediaire: 1,
  avance: 2,
  confirme: 3,
};

/**
 * The higher of two levels by rank. Used so a re-detected level never
 * *downgrades* the athlete — e.g. the `< 3 mesocycles → débutant` rule in
 * `detectLevel` must not demote someone who onboarded as intermediate/advanced.
 */
export function higherLevel(a: string, b: string): string {
  return (LEVEL_RANK[a] ?? 0) >= (LEVEL_RANK[b] ?? 0) ? a : b;
}

// Reference strength ratios in weightlifting — used to spot lagging qualities.
export const REFERENCE_RATIOS = {
  snatch_to_clean: 0.8, // Snatch ≈ 80% of the C&J
  front_squat_to_clean: 1.1, // Front Squat ≈ 110% of the C&J
  back_squat_to_clean: 1.35, // Back Squat ≈ 135% of the C&J
  snatch_pull_to_snatch: 1.1, // Snatch Pull ≈ 110% of the Snatch
  clean_pull_to_clean: 1.1, // Clean Pull ≈ 110% of the C&J
  strict_press_to_jerk: 0.6, // Strict Press ≈ 60% of the Jerk
} as const;

export type WeakPoint = 'legs' | 'snatch_technique' | 'pull_strength' | 'overhead_strength';

/** A max older than this many days is treated as stale for weak-point analysis. */
export const WEAKPOINT_STALE_DAYS = 42; // 6 weeks

const WEAK_POINTS: WeakPoint[] = ['legs', 'snatch_technique', 'pull_strength', 'overhead_strength'];

/** The two lifts each weak-point ratio needs — both must be usable to evaluate it. */
const WEAK_POINT_LIFTS: Record<WeakPoint, string[]> = {
  legs: ['clean_and_jerk', 'front_squat'],
  snatch_technique: ['clean_and_jerk', 'snatch'],
  pull_strength: ['snatch', 'snatch_pull'],
  overhead_strength: ['clean_and_jerk', 'strict_press'],
};

function daysSince(dateStr: string, now: number): number {
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

function weakPointPresent(key: WeakPoint, maxes: Record<string, number>): boolean {
  const clean = maxes.clean_and_jerk ?? 0;
  const snatch = maxes.snatch ?? 0;
  const frontSquat = maxes.front_squat ?? 0;
  const snatchPull = maxes.snatch_pull ?? 0;
  const strictPress = maxes.strict_press ?? 0;
  switch (key) {
    case 'legs': // squat too low relative to the C&J
      return frontSquat / clean < 1.0;
    case 'snatch_technique': // snatch too low relative to the C&J
      return snatch / clean < 0.75;
    case 'pull_strength': // snatch pull barely above the snatch
      return snatchPull / snatch < 1.05;
    case 'overhead_strength': // strict press too low relative to the C&J
      return strictPress / clean < 0.55;
  }
}

/**
 * Detect the athlete's weak points from a map of usable 1RMs (keyed by exercise
 * id). A ratio is evaluated when both of its lifts are present (>0). Staleness
 * is handled upstream by {@link analyzeWeakPoints} (a stale max is estimated
 * from progression or omitted), so this stays a pure presence check.
 */
export function detectWeakPoints(maxes: Record<string, number>): WeakPoint[] {
  const weak: WeakPoint[] = [];
  for (const key of WEAK_POINTS) {
    const usable = WEAK_POINT_LIFTS[key].every((id) => (maxes[id] ?? 0) > 0);
    if (usable && weakPointPresent(key, maxes)) weak.push(key);
  }
  return weak;
}

export interface UnevaluatedWeakPoint {
  weak_point: WeakPoint;
  /** The stale lift that blocked evaluation. */
  exercise_id: string;
  weeks_ago: number;
}

// Competition lifts whose recent progress drives the global progression rate.
const RATE_LIFTS = ['snatch', 'clean_and_jerk', 'front_squat', 'back_squat_high'];
// Lifts referenced by the weak-point ratios (candidates for stale estimation).
const RATIO_LIFTS = ['clean_and_jerk', 'front_squat', 'snatch', 'snatch_pull', 'strict_press'];

/**
 * Global daily progression rate (fractional gain per day) inferred from the
 * recently-tested competition lifts: for each fresh lift, its growth since the
 * baseline snapshot (`baselineMaxes` recorded at `baselineDate`) divided by the
 * days elapsed, averaged. Returns null when no fresh competition lift has a
 * baseline to compare against — the caller then leaves stale ratios unevaluated.
 */
export function progressionRatePerDay(
  maxes: Record<string, number>,
  maxesWithDates: Record<string, string>,
  baselineMaxes: Record<string, number>,
  baselineDate: string | undefined,
  now: number = Date.now(),
): number | null {
  if (!baselineDate) return null;
  const baseTime = new Date(baselineDate).getTime();
  if (!Number.isFinite(baseTime)) return null;
  const rates: number[] = [];
  for (const id of RATE_LIFTS) {
    const cur = maxes[id] ?? 0;
    const base = baselineMaxes[id] ?? 0;
    const d = maxesWithDates[id];
    if (cur <= 0 || base <= 0 || !d) continue;
    if (daysSince(d, now) > WEAKPOINT_STALE_DAYS) continue; // must be recently tested
    const elapsedDays = (new Date(d).getTime() - baseTime) / 86400000;
    if (elapsedDays <= 0) continue;
    rates.push((cur / base - 1) / elapsedDays);
  }
  if (rates.length === 0) return null;
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

export interface EstimatedMax {
  exercise_id: string;
  /** Current value estimated from the global progression rate. */
  estimated: number;
  weeks_ago: number;
}

export interface WeakPointAnalysis {
  weak_points: WeakPoint[];
  /** Stale maxes whose current value was estimated from progression. */
  estimated_maxes: EstimatedMax[];
  /** Weak points still unevaluable — a required max is stale and no rate exists. */
  unevaluated_weak_points: UnevaluatedWeakPoint[];
}

/**
 * Analyse weak points, estimating any stale (> {@link WEAKPOINT_STALE_DAYS})
 * ratio max from the athlete's global progression rate rather than ignoring it:
 * `estimated = staleValue × (1 + ratePerDay × ageInDays)`. When no rate can be
 * computed (no fresh competition lift with a baseline), a stale max stays
 * unevaluated and its ratio is reported as such.
 */
export function analyzeWeakPoints(
  maxes: Record<string, number>,
  maxesWithDates: Record<string, string>,
  baselineMaxes: Record<string, number>,
  baselineDate: string | undefined,
): WeakPointAnalysis {
  const now = Date.now();
  const rate = progressionRatePerDay(maxes, maxesWithDates, baselineMaxes, baselineDate, now);

  const effective: Record<string, number> = {};
  const estimated: EstimatedMax[] = [];
  const staleUnevaluable: Record<string, number> = {}; // exercise id → weeks ago

  for (const id of RATIO_LIFTS) {
    const value = maxes[id] ?? 0;
    if (value <= 0) continue; // missing → omit (silent; ratio simply not evaluated)
    const d = maxesWithDates[id];
    const ageDays = d ? daysSince(d, now) : 0;
    if (!d || ageDays <= WEAKPOINT_STALE_DAYS) {
      effective[id] = value; // fresh (or undated → trusted)
      continue;
    }
    // Stale: estimate from the global rate, else mark unevaluable.
    if (rate !== null) {
      const est = Math.max(0, Math.round(value * (1 + rate * ageDays)));
      effective[id] = est;
      estimated.push({ exercise_id: id, estimated: est, weeks_ago: Math.floor(ageDays / 7) });
    } else {
      staleUnevaluable[id] = Math.floor(ageDays / 7);
    }
  }

  const weak_points = detectWeakPoints(effective);

  const unevaluated_weak_points: UnevaluatedWeakPoint[] = [];
  for (const key of WEAK_POINTS) {
    if (WEAK_POINT_LIFTS[key].every((id) => (effective[id] ?? 0) > 0)) continue; // evaluated
    const blockingId = WEAK_POINT_LIFTS[key].find((id) => id in staleUnevaluable);
    if (blockingId) {
      unevaluated_weak_points.push({
        weak_point: key,
        exercise_id: blockingId,
        weeks_ago: staleUnevaluable[blockingId],
      });
    }
  }

  return { weak_points, estimated_maxes: estimated, unevaluated_weak_points };
}

// Targeted assistance work for each weak point, most-specific first.
const ASSISTANCE_BY_WEAKPOINT: Record<WeakPoint, string[]> = {
  legs: ['front_squat', 'back_squat_high', 'pause_squat'],
  snatch_technique: ['snatch_balance', 'overhead_squat', 'hang_snatch'],
  pull_strength: ['snatch_pull', 'clean_pull', 'romanian_deadlift'],
  overhead_strength: ['strict_press', 'push_press', 'jerk_recovery'],
};

export interface ZoneAdaptation {
  weightMultiplier: number;
  setsDelta: number;
  message: string;
  canPush: boolean;
}

export function adaptToZoneScore(zoneScore: number | null): ZoneAdaptation {
  if (zoneScore === null) {
    return {
      weightMultiplier: 1,
      setsDelta: 0,
      message: 'Pas de check-in aujourd’hui. On reste sur la cible.',
      canPush: false,
    };
  }
  if (zoneScore <= 30) {
    return {
      weightMultiplier: 0.8,
      setsDelta: -1,
      message: 'Ton corps est en récupération. Charge réduite automatiquement.',
      canPush: false,
    };
  }
  if (zoneScore <= 50) {
    return {
      weightMultiplier: 0.9,
      setsDelta: 0,
      message:
        'Conditions limitées. On adapte pour que tu puisses quand même t’entraîner.',
      canPush: false,
    };
  }
  if (zoneScore <= 75) {
    return {
      weightMultiplier: 1,
      setsDelta: 0,
      message: 'Les conditions sont réunies. La zone est à portée.',
      canPush: false,
    };
  }
  return {
    weightMultiplier: 1,
    setsDelta: 0,
    message: 'Tu es dans la zone. Conditions optimales. On peut pousser.',
    canPush: true,
  };
}

export function restBaseForExercise(exerciseId: string): number {
  const OLYMPIC = new Set([
    'snatch',
    'clean_and_jerk',
    'power_clean',
    'power_snatch',
    'hang_clean',
    'hang_snatch',
    'snatch_pull',
    'clean_pull',
    'push_jerk',
    'split_jerk',
    'snatch_balance',
    'jerk_from_rack',
    'jerk_from_blocks',
    'snatch_from_blocks',
    'pause_snatch',
    'clean_from_blocks',
    'pause_clean',
    'jerk_recovery',
  ]);
  const HEAVY = new Set([
    'back_squat_high',
    'back_squat_low',
    'front_squat',
    'overhead_squat',
    'pause_squat',
    'deadlift',
  ]);
  const MEDIUM = new Set([
    'strict_press',
    'push_press',
    'bench_press',
    'incline_press',
    'barbell_row',
    'romanian_deadlift',
    'good_morning',
    'pullup_pronation',
    'pullup_supination',
  ]);
  if (OLYMPIC.has(exerciseId)) return 180;
  if (HEAVY.has(exerciseId)) return 150;
  if (MEDIUM.has(exerciseId)) return 120;
  return 60;
}

export interface RestModifiers {
  zoneScore: number | null;
  rpe: number | null;
}

export function computeRestSeconds(exerciseId: string, mod: RestModifiers): number {
  let rest = restBaseForExercise(exerciseId);
  if (mod.zoneScore !== null) {
    if (mod.zoneScore <= 30) rest += 30;
    else if (mod.zoneScore <= 50) rest += 15;
    else if (mod.zoneScore > 75) rest -= 15;
  }
  if (mod.rpe !== null) {
    if (mod.rpe >= 9) rest += 30;
    else if (mod.rpe >= 8) rest += 15;
    else if (mod.rpe <= 6) rest -= 15;
  }
  return Math.max(20, rest);
}

// ── Prilepin's table (1975) ────────────────────────────────────────────────
// Optimal total reps and per-set reps for each intensity zone. The classic
// competition lifts (and squats) are validated against these ranges so the
// generated session always sits in Prilepin's productive window.
export type PrilepinZone = '55-65' | '70-75' | '80-85' | '90+';

interface PrilepinRule {
  minTotal: number;
  maxTotal: number;
  minPerSet: number;
  maxPerSet: number;
}

const PRILEPIN: Record<PrilepinZone, PrilepinRule> = {
  '55-65': { minTotal: 18, maxTotal: 24, minPerSet: 3, maxPerSet: 6 },
  '70-75': { minTotal: 12, maxTotal: 24, minPerSet: 3, maxPerSet: 6 },
  '80-85': { minTotal: 10, maxTotal: 20, minPerSet: 2, maxPerSet: 4 },
  '90+': { minTotal: 4, maxTotal: 10, minPerSet: 1, maxPerSet: 2 },
};

/** Map an intensity percentage to its Prilepin zone. */
export function prilepinZoneForPct(pct: number): PrilepinZone {
  if (pct >= 88) return '90+';
  if (pct >= 80) return '80-85';
  if (pct >= 68) return '70-75';
  return '55-65';
}

/**
 * Clamp a set count so total reps land inside Prilepin's optimal range for
 * the movement's intensity zone. Per-set reps are held; only sets move.
 *
 * @param sets authored set count
 * @param reps reps per set
 * @param pct working intensity (% of 1RM)
 */
export function prilepinAdjustSets(sets: number, reps: number, pct: number): number {
  const zone = PRILEPIN[prilepinZoneForPct(pct)];
  let s = Math.max(1, sets);
  while (s * reps > zone.maxTotal && s > 1) s -= 1;
  while (s * reps < zone.minTotal) s += 1;
  return s;
}

/**
 * Sum the parts of a complex notation ("2+1" → 3 movements per complex).
 * Used to convert "complexes per set" into "movement reps per set" for
 * Prilepin volume checks.
 */
function complexMovements(label: string): number {
  const parts = label.split('+').map((p) => parseInt(p, 10));
  if (parts.some((n) => !Number.isFinite(n))) return 1;
  return parts.reduce((a, b) => a + b, 0);
}

type MovementRole = 'main' | 'pull' | 'squat' | 'accessory';

interface MovementBlueprint {
  exercise_id: string;
  sets: number;
  reps: number;
  repsLabel?: string;
  pct: number;
  role: MovementRole;
  toMax?: boolean;
  /** Optional display override (e.g. "montée à la max du jour"). */
  display?: string;
}

interface SessionBlueprint {
  name: string;
  movements: MovementBlueprint[];
}

// Prilepin's table is enforced only on the competition lifts and squats.
// Power, hang, and balance variants are technical work; their authored
// 2-rep prescriptions at 70-75% intentionally sit below Prilepin's per-set
// minimum and must not be auto-adjusted upward.
const PRILEPIN_ENFORCED = new Set([
  'snatch',
  'clean_and_jerk',
  'front_squat',
  'back_squat_high',
  'back_squat_low',
]);

// ── Evolutive exercise selection ───────────────────────────────────────────
// Which lifts appear per training tier, block (1/2/3) and session (A/B/C).
// Index 0 is the session's focus. Movement parameters (sets/reps/%/role) come
// from the volume tables below: competition lifts follow the per-level volume
// (PARTIE 4); variants / pulls / squats / accessories use block defaults.
const LEVEL_BLOCK_EXERCISES: Record<
  WeightliftingLevelTier,
  Record<ProgramBlock, string[][]>
> = {
  beginner: {
    1: [
      ['snatch', 'overhead_squat', 'snatch_pull', 'front_squat'],
      ['clean_and_jerk', 'clean_pull', 'back_squat_high'],
      ['power_snatch', 'power_clean', 'strict_press'],
    ],
    2: [
      ['snatch', 'snatch_pull', 'front_squat'],
      ['clean_and_jerk', 'jerk_from_rack', 'back_squat_high'],
      ['power_snatch', 'power_clean', 'push_press'],
    ],
    3: [
      ['snatch', 'front_squat'],
      ['clean_and_jerk', 'back_squat_high'],
      ['power_snatch', 'power_clean'],
    ],
  },
  intermediate: {
    1: [
      ['snatch', 'hang_snatch', 'snatch_pull', 'overhead_squat', 'front_squat'],
      ['clean_and_jerk', 'hang_clean', 'clean_pull', 'back_squat_high'],
      ['snatch_balance', 'power_clean', 'push_press', 'romanian_deadlift'],
    ],
    2: [
      ['snatch', 'snatch_from_blocks', 'snatch_pull', 'front_squat'],
      ['clean_and_jerk', 'jerk_from_rack', 'clean_pull', 'back_squat_high'],
      ['power_snatch', 'power_clean', 'push_press'],
    ],
    3: [
      ['snatch', 'snatch_pull', 'front_squat'],
      ['clean_and_jerk', 'back_squat_high'],
      ['power_snatch', 'power_clean'],
    ],
  },
  advanced: {
    1: [
      ['snatch', 'snatch_from_blocks', 'pause_snatch', 'snatch_pull', 'overhead_squat'],
      ['clean_and_jerk', 'clean_from_blocks', 'pause_clean', 'clean_pull', 'front_squat'],
      ['snatch_balance', 'jerk_recovery', 'back_squat_high', 'romanian_deadlift'],
    ],
    2: [
      ['snatch', 'snatch_from_blocks', 'snatch_pull', 'front_squat'],
      ['clean_and_jerk', 'jerk_from_rack', 'clean_pull', 'back_squat_high'],
      ['power_snatch', 'power_clean', 'push_press'],
    ],
    3: [
      ['snatch', 'front_squat'],
      ['clean_and_jerk', 'back_squat_high'],
      ['snatch', 'clean_and_jerk'],
    ],
  },
};

const SESSION_NAMES = ['Arraché', 'Épaulé-Jeté', 'Technique & Force'];

interface LiftVolume {
  pct: number;
  sets: number;
  reps: number;
}

// Competition lifts (snatch, clean & jerk): week-1 %, sets and reps per level
// and block (PARTIE 4). The week ramp (+2.5%/wk) and Prilepin refine these.
const COMP_VOLUME: Record<WeightliftingLevelTier, Record<ProgramBlock, LiftVolume>> = {
  beginner: {
    1: { pct: 70, sets: 5, reps: 3 },
    2: { pct: 80, sets: 5, reps: 2 },
    3: { pct: 88, sets: 4, reps: 2 },
  },
  intermediate: {
    1: { pct: 72, sets: 6, reps: 3 },
    2: { pct: 82, sets: 6, reps: 2 },
    3: { pct: 90, sets: 5, reps: 1 },
  },
  advanced: {
    1: { pct: 75, sets: 7, reps: 3 },
    2: { pct: 85, sets: 7, reps: 2 },
    3: { pct: 92, sets: 6, reps: 1 },
  },
};

// Technical / speed variants (power, hang, blocks, pause): block defaults.
const VARIANT_VOLUME: Record<ProgramBlock, LiftVolume> = {
  1: { pct: 68, sets: 4, reps: 3 },
  2: { pct: 75, sets: 4, reps: 2 },
  3: { pct: 78, sets: 4, reps: 2 },
};
// Pulls above the lift (snatch / clean pull), % of the lift's own max.
const PULL_VOLUME: Record<ProgramBlock, LiftVolume> = {
  1: { pct: 90, sets: 4, reps: 3 },
  2: { pct: 97, sets: 5, reps: 2 },
  3: { pct: 95, sets: 4, reps: 2 },
};
// Squats (front / back / pause).
const SQUAT_VOLUME: Record<ProgramBlock, LiftVolume> = {
  1: { pct: 76, sets: 4, reps: 4 },
  2: { pct: 83, sets: 5, reps: 3 },
  3: { pct: 89, sets: 3, reps: 2 },
};
// Everything else (presses, overhead squat, snatch balance, RDL, recovery).
const ACCESSORY_VOLUME: Record<ProgramBlock, LiftVolume> = {
  1: { pct: 65, sets: 3, reps: 5 },
  2: { pct: 72, sets: 4, reps: 3 },
  3: { pct: 78, sets: 3, reps: 3 },
};

const COMPETITION_LIFTS = new Set(['snatch', 'clean_and_jerk']);
const VARIANT_MAINS = new Set([
  'power_snatch',
  'power_clean',
  'hang_snatch',
  'hang_clean',
  'snatch_from_blocks',
  'clean_from_blocks',
  'pause_snatch',
  'pause_clean',
]);
const PULL_LIFTS = new Set(['snatch_pull', 'clean_pull']);
const SQUAT_LIFTS = new Set(['front_squat', 'back_squat_high', 'back_squat_low', 'pause_squat']);

/** Assemble one movement (params + role) for an exercise at a tier and block. */
function movementFor(
  exerciseId: string,
  tier: WeightliftingLevelTier,
  block: ProgramBlock,
): MovementBlueprint {
  let vol: LiftVolume;
  let role: MovementRole;
  if (COMPETITION_LIFTS.has(exerciseId)) {
    vol = COMP_VOLUME[tier][block];
    role = 'main';
  } else if (VARIANT_MAINS.has(exerciseId)) {
    vol = VARIANT_VOLUME[block];
    role = 'main';
  } else if (PULL_LIFTS.has(exerciseId)) {
    vol = PULL_VOLUME[block];
    role = 'pull';
  } else if (SQUAT_LIFTS.has(exerciseId)) {
    vol = SQUAT_VOLUME[block];
    role = 'squat';
  } else {
    vol = ACCESSORY_VOLUME[block];
    role = 'accessory';
  }
  // Volume nudge on supporting work by tier (competition lifts are already
  // tier-scaled via COMP_VOLUME): advanced adds a set on squats / pulls,
  // beginners drop one on the rest.
  let sets = vol.sets;
  if (role !== 'main') {
    if (tier === 'advanced' && (role === 'squat' || role === 'pull')) sets += 1;
    else if (tier === 'beginner') sets = Math.max(2, sets - 1);
  }
  return { exercise_id: exerciseId, sets, reps: vol.reps, pct: vol.pct, role };
}

/**
 * Build the session blueprint for a tier / block / session index, injecting up
 * to two weak-point assistance movements into block 1's third session (C).
 */
function buildLevelBlueprint(
  tier: WeightliftingLevelTier,
  block: ProgramBlock,
  sessionIdx: number,
  weakPoints: WeakPoint[],
): SessionBlueprint {
  const ids = LEVEL_BLOCK_EXERCISES[tier][block][sessionIdx] ?? [];
  const movements = ids.map((id) => movementFor(id, tier, block));

  if (block === 1 && sessionIdx === 2 && weakPoints.length > 0) {
    const present = new Set(ids);
    const extra: string[] = [];
    for (const wp of weakPoints) {
      const pick = ASSISTANCE_BY_WEAKPOINT[wp].find(
        (id) => !present.has(id) && !extra.includes(id),
      );
      if (pick) extra.push(pick);
      if (extra.length >= 2) break;
    }
    for (const id of extra) {
      const m = movementFor(id, tier, block);
      // Assistance is supplementary volume: accessory rest, one set fewer than
      // its primary prescription. (Squats stay under Prilepin downstream, so a
      // front/back squat added here is still clamped to its productive range.)
      movements.push({ ...m, role: 'accessory', sets: Math.max(2, m.sets - 1) });
    }
  }

  return { name: SESSION_NAMES[sessionIdx] ?? `Séance ${sessionIdx + 1}`, movements };
}

// Deload week: three differentiated A/B/C sessions, 60-65% intensity, -50%
// volume. Pattern is preserved (squat + technique) but fatigue is dropped.
const DELOAD_SESSIONS: SessionBlueprint[] = [
  {
    name: 'Snatch Deload',
    movements: [
      { exercise_id: 'snatch', sets: 3, reps: 3, pct: 65, role: 'main' },
      { exercise_id: 'overhead_squat', sets: 3, reps: 3, pct: 60, role: 'accessory' },
      { exercise_id: 'front_squat', sets: 3, reps: 3, pct: 65, role: 'squat' },
    ],
  },
  {
    name: 'Clean & Jerk Deload',
    movements: [
      { exercise_id: 'clean_and_jerk', sets: 3, reps: 3, pct: 65, role: 'main' },
      { exercise_id: 'back_squat_high', sets: 3, reps: 3, pct: 65, role: 'squat' },
    ],
  },
  {
    name: 'Technique Deload',
    movements: [
      { exercise_id: 'power_snatch', sets: 3, reps: 2, pct: 60, role: 'main' },
      { exercise_id: 'power_clean', sets: 3, reps: 2, pct: 60, role: 'main' },
    ],
  },
];

// Resolve which stored 1RM a movement's percentage is based on. We measure
// snatch, clean & jerk, front squat and strict press; the rest are derived
// from the closest competition lift (back squat ≈ 1.18× front squat;
// push press ≈ 1.25× strict press; jerks ≈ a fraction of the clean).
function resolveBaseMax(exerciseId: string, lookup: Map<string, number>): number {
  const snatch = lookup.get('snatch') ?? 0;
  const clean = lookup.get('clean_and_jerk') ?? 0;
  const front = lookup.get('front_squat') ?? 0;
  const press = lookup.get('strict_press') ?? 0;
  switch (exerciseId) {
    case 'snatch':
    case 'snatch_pull':
    case 'hang_snatch':
    case 'power_snatch':
    case 'overhead_squat':
    case 'snatch_balance':
    case 'snatch_from_blocks':
    case 'pause_snatch':
      return snatch;
    case 'clean_and_jerk':
    case 'clean_pull':
    case 'hang_clean':
    case 'power_clean':
    case 'clean_from_blocks':
    case 'pause_clean':
      return clean;
    case 'front_squat':
    case 'pause_squat':
      return front;
    case 'back_squat_high':
      return front > 0 ? front * 1.18 : 0;
    case 'romanian_deadlift':
    case 'good_morning':
      return clean > 0 ? clean * 1.1 : 0;
    case 'strict_press':
      return press;
    case 'push_press':
      // Push press is roughly 25% stronger than a strict press for a
      // trained athlete. Falls back to ~55% of the clean if press is unset.
      if (press > 0) return press * 1.25;
      return clean > 0 ? clean * 0.55 : 0;
    case 'push_jerk':
      // A push jerk is taken from the front rack; capped by jerk capacity.
      return clean > 0 ? clean * 0.9 : 0;
    case 'split_jerk':
      return clean > 0 ? clean * 1.0 : 0;
    case 'jerk_from_rack':
    case 'jerk_from_blocks':
    case 'jerk_recovery':
      return clean > 0 ? clean * 0.95 : 0;
    default:
      return 0;
  }
}

/** Week-over-week intensity ramp inside a block: +2.5% per week (wk1..3). */
function weekIntensityDelta(week: number): number {
  const w = Math.min(3, Math.max(1, week));
  return (w - 1) * 2.5;
}

/**
 * Autoregulation from recent reps-in-reserve. Two easy sessions (RIR >= 3)
 * bump intensity; two grinder sessions (RIR 0) pull it back.
 *
 * @param recentRir most recent RIR values, oldest first
 */
export function rirIntensityDelta(recentRir: number[]): number {
  if (recentRir.length < 2) return 0;
  const last2 = recentRir.slice(-2);
  if (last2.every((r) => r >= 3)) return 2.5;
  if (last2.every((r) => r === 0)) return -2.5;
  return 0;
}

function clampPct(pct: number): number {
  return Math.max(40, Math.min(100, Math.round(pct * 10) / 10));
}

function rpeForPct(pct: number): number {
  if (pct >= 88) return 9;
  if (pct >= 80) return 8;
  if (pct >= 70) return 7;
  return 6;
}

function sessionLetter(dayOfWeek: number): string {
  const idx = Math.max(1, dayOfWeek) - 1;
  return String.fromCharCode(65 + (idx % 26));
}

// Session duration model: 10 min warm-up, 45 s of work per set, and the
// movement's rest after every set (compound 180 s, accessory 120 s).
const WARMUP_SEC = 600;
const WORK_PER_SET_SEC = 45;
const REST_COMPOUND_SEC = 180;
const REST_ACCESSORY_SEC = 120;

function restForRole(role: MovementRole): number {
  return role === 'accessory' ? REST_ACCESSORY_SEC : REST_COMPOUND_SEC;
}

/**
 * Estimate a session's wall-clock duration in minutes.
 *
 * Warm-up + 45 s of work per set + rest only *between* sets of an exercise
 * (no rest after the final set before moving on). Counting a rest after every
 * set inflated high-volume sessions well past their target windows.
 *
 * @param exercises planned exercises with their sets
 */
export function estimateSessionDurationMin(exercises: SessionExercise[]): number {
  let seconds = WARMUP_SEC;
  for (const ex of exercises) {
    const n = ex.sets.length;
    if (n === 0) continue;
    seconds += n * WORK_PER_SET_SEC;
    const rest = ex.sets[0].rest_seconds ?? 0;
    seconds += Math.max(0, n - 1) * rest;
  }
  return Math.round(seconds / 60);
}

export interface GenerateParams {
  program: UserProgram;
  maxes: ExerciseMax[];
  dayOfWeek: number;
  zoneScore: number | null;
  /** Recent reps-in-reserve for autoregulation, oldest first. */
  recentRir?: number[];
}

export interface GeneratedSession {
  exercises: SessionExercise[];
  message: string;
  appliedAdaptation: ZoneAdaptation;
  durationMin: number;
}

/** One line of a session preview: the prescription for a single exercise. */
export interface SessionExercisePreview {
  exerciseId: string;
  sets: number;
  reps: string;
  pct: number | null;
  weightKg: number | null;
  rpe: number | null;
  /** When `reps` is a complex notation (e.g. "2+1"), how many complexes are
   *  performed per set. Drives the "N × (X+Y)" render. */
  complexes?: number;
  /** When set, replaces the "N séries × R reps" rendering (complexes, max-out). */
  display?: string;
}

export interface WeightliftingSessionPreview {
  title: string;
  block: ProgramBlock;
  week: WeekIndex;
  durationMin: number;
  exercises: SessionExercisePreview[];
}

interface BuiltWeightliftingSession {
  exercises: SessionExercise[];
  preview: SessionExercisePreview[];
  durationMin: number;
  title: string;
  block: ProgramBlock;
  week: WeekIndex;
  adaptation: ZoneAdaptation;
}

function buildWeightliftingSession(params: GenerateParams): BuiltWeightliftingSession {
  const { program, maxes, dayOfWeek, zoneScore } = params;
  const recentRir = params.recentRir ?? [];
  const week = Math.min(4, Math.max(1, program.current_week)) as WeekIndex;
  const block = program.current_block;
  const tier = levelTier(program.level);
  const adaptation = adaptToZoneScore(zoneScore);

  const maxLookup = new Map<string, number>();
  for (const m of maxes) maxLookup.set(m.exercise_id, m.estimated_1rm);

  const isDeload = week >= 4;
  let movements: MovementBlueprint[];
  if (isDeload) {
    const idx = (Math.max(1, dayOfWeek) - 1) % DELOAD_SESSIONS.length;
    movements = DELOAD_SESSIONS[idx].movements;
  } else {
    const oneRms: Record<string, number> = {};
    for (const [id, oneRm] of maxLookup) oneRms[id] = oneRm;
    const idx = (Math.max(1, dayOfWeek) - 1) % 3;
    movements = buildLevelBlueprint(tier, block, idx, detectWeakPoints(oneRms)).movements;
  }
  const intensityDelta = isDeload
    ? 0
    : weekIntensityDelta(week) + rirIntensityDelta(recentRir);

  const exercises: SessionExercise[] = [];
  const preview: SessionExercisePreview[] = [];

  for (const m of movements) {
    const pct = clampPct(m.pct + intensityDelta);
    let reps = m.reps;
    let sets = m.sets;

    // Strict Prilepin applies to the classic competition lifts (snatch,
    // clean & jerk) and squats. Power, hang, and balance variants are
    // technical work where 2-rep sets at 70-75% are coach-standard, so we
    // trust the blueprint. Pulls and accessories also keep their volume.
    // Deload weeks bypass Prilepin so the intended -50% volume is preserved.
    if (PRILEPIN_ENFORCED.has(m.exercise_id) && !m.toMax && !isDeload) {
      const zone = PRILEPIN[prilepinZoneForPct(pct)];
      if (m.repsLabel) {
        // For a complex prescription, `reps` is the number of complexes
        // performed per set. The Prilepin total range counts movement reps,
        // so multiply by the complex's movement count (e.g. "2+1" = 3).
        // Skip per-set clamping — the structure is fixed by the complex.
        const movementsPerSet = reps * complexMovements(m.repsLabel);
        sets = prilepinAdjustSets(sets, movementsPerSet, pct);
      } else {
        reps = Math.min(zone.maxPerSet, Math.max(zone.minPerSet, m.reps));
        sets = prilepinAdjustSets(sets, reps, pct);
      }
    }
    if (m.toMax) {
      reps = 1;
      sets = Math.min(10, Math.max(4, sets)); // singles within the 90%+ window
    }
    sets = Math.max(1, sets + adaptation.setsDelta);

    const baseMax = resolveBaseMax(m.exercise_id, maxLookup);
    const targetWeight =
      baseMax > 0
        ? roundToBar(baseMax * (pct / 100) * adaptation.weightMultiplier)
        : null;
    const rest = restForRole(m.role);
    const rpe = rpeForPct(pct);
    const repsLabel = m.toMax ? '1' : (m.repsLabel ?? String(reps));
    // For complex prescriptions ("2+1") the integer rep count is the number
    // of times the complex is performed per set — the multiplier in
    // "N × (X+Y)". Plain numeric prescriptions don't carry a complex count.
    const complexes = m.repsLabel && !m.toMax ? reps : undefined;

    const setList: PlannedSet[] = [];
    for (let i = 1; i <= sets; i += 1) {
      setList.push({
        exercise_id: m.exercise_id,
        set_number: i,
        target_reps: repsLabel,
        target_weight_kg: targetWeight,
        target_rpe: rpe,
        rest_seconds: rest,
        ...(complexes !== undefined ? { target_complexes: complexes } : {}),
      });
    }
    exercises.push({ exercise_id: m.exercise_id, sets: setList });
    preview.push({
      exerciseId: m.exercise_id,
      sets,
      reps: repsLabel,
      pct,
      weightKg: targetWeight,
      rpe,
      complexes,
      display: m.display ?? (m.toMax ? 'montée à la max du jour' : undefined),
    });
  }

  const title = isDeload
    ? `SÉANCE ${sessionLetter(dayOfWeek)} · DÉCHARGE`
    : `SÉANCE ${sessionLetter(dayOfWeek)} · BLOC ${block} SEMAINE ${week}`;

  return {
    exercises,
    preview,
    durationMin: estimateSessionDurationMin(exercises),
    title,
    block,
    week,
    adaptation,
  };
}

export function generateWeeklySession(params: GenerateParams): GeneratedSession {
  const built = buildWeightliftingSession(params);
  return {
    exercises: built.exercises,
    message: built.adaptation.message,
    appliedAdaptation: built.adaptation,
    durationMin: built.durationMin,
  };
}

/**
 * Build a read-only preview of a weightlifting session (no Zone adaptation),
 * for calendar previews and the programme intro screen.
 *
 * @param program user programme state (block/week/day)
 * @param maxes known 1RMs, used to fill target weights
 * @param dayOfWeek 1-based day index used to pick the session template
 */
export function previewWeightliftingSession(
  program: UserProgram,
  maxes: ExerciseMax[],
  dayOfWeek: number,
  recentRir: number[] = [],
): WeightliftingSessionPreview {
  const built = buildWeightliftingSession({ program, maxes, dayOfWeek, zoneScore: null, recentRir });
  return {
    title: built.title,
    block: built.block,
    week: built.week,
    durationMin: built.durationMin,
    exercises: built.preview,
  };
}

/**
 * Project a programme forward by a number of whole weeks, rolling the
 * week counter (1..4) and advancing the block (1..3) as needed.
 *
 * @param program current programme state
 * @param weeksForward number of weeks to advance (negative clamps to now)
 */
export function projectProgram(
  program: UserProgram,
  weeksForward: number,
): UserProgram {
  if (weeksForward <= 0) return program;
  let week = program.current_week + weeksForward;
  let block = program.current_block;
  while (week > 4) {
    week -= 4;
    block = ((block % 3) + 1) as ProgramBlock;
  }
  return { ...program, current_week: week, current_block: block };
}

export function getNextSessionDate(
  program: UserProgram,
  completedThisWeek: number,
): string {
  const today = new Date();
  const spacing = Math.max(1, Math.floor(7 / program.sessions_per_week));
  const next = new Date(today);
  next.setDate(today.getDate() + (completedThisWeek === 0 ? 0 : spacing));
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, '0');
  const d = String(next.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Recompute block/week/day from the total number of completed weightlifting
 * sessions since the mesocycle started.
 *
 * Idempotent: the block is derived from the FIXED `mesocycle_start_block`
 * (default 1) plus the number of finished 4-week blocks — never from the live
 * `current_block`, so calling this on every completion can't double-advance.
 *
 * @param program current programme state
 * @param totalCompleted completed weightlifting sessions since mesocycle_start
 */
export function checkAndAdvanceProgram(
  program: UserProgram,
  totalCompleted: number,
): UserProgram {
  const total = Math.max(0, Math.floor(totalCompleted));
  const sessionsPerWeek = Math.max(1, program.sessions_per_week);
  const weeksDone = Math.floor(total / sessionsPerWeek);
  const dayInWeek = (total % sessionsPerWeek) + 1;

  const startBlock = program.mesocycle_start_block ?? 1;
  const blocksFinished = Math.floor(weeksDone / 4);
  const week = (weeksDone % 4) + 1;
  const block = ((((startBlock - 1) + blocksFinished) % 3) + 1) as ProgramBlock;

  return {
    ...program,
    current_block: block,
    current_week: week,
    current_day: dayInWeek,
  };
}

/** Weeks in a full mesocycle: 3 blocks × 4 weeks. */
export const MESOCYCLE_WEEKS = 12;

/**
 * Has the athlete finished the current mesocycle? True once every session of
 * the 12-week cycle (3 blocks × 4 weeks × sessions/week) has been completed
 * since `mesocycle_start`.
 */
export function isMesocycleComplete(program: UserProgram, completedSince: number): boolean {
  const spw = Math.max(1, program.sessions_per_week);
  return completedSince >= MESOCYCLE_WEEKS * spw;
}

/**
 * Roll the programme into a fresh mesocycle: reset to block 1 / week 1 / day 1,
 * re-anchor `mesocycle_start`, bump the completed counter, and store the new
 * level plus the start-of-cycle 1RM snapshot (for the next bilan).
 */
export function startNextMesocycle(
  program: UserProgram,
  newLevel: string,
  todayStr: string,
  startMaxes: Record<string, number>,
): UserProgram {
  return {
    ...program,
    level: newLevel,
    current_block: 1,
    current_week: 1,
    current_day: 1,
    mesocycle_start: todayStr,
    mesocycle_start_block: 1,
    mesocycles_completed: (program.mesocycles_completed ?? 0) + 1,
    mesocycle_start_maxes: startMaxes,
  };
}

/** Every distinct exercise id offered at a given level across all blocks. */
export function exercisesForLevel(level: string): string[] {
  const tier = levelTier(level);
  const out = new Set<string>();
  for (const block of [1, 2, 3] as ProgramBlock[]) {
    for (const session of LEVEL_BLOCK_EXERCISES[tier][block]) {
      for (const id of session) out.add(id);
    }
  }
  return [...out];
}
