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

const BLOCK_PERCENTAGES: Record<ProgramBlock, Record<WeekIndex, number>> = {
  1: { 1: 65, 2: 70, 3: 75, 4: 55 },
  2: { 1: 75, 2: 80, 3: 85, 4: 60 },
  3: { 1: 82, 2: 88, 3: 93, 4: 65 },
};

export function getTrainingPercentage(
  block: ProgramBlock,
  week: WeekIndex,
  level: string,
): number {
  const base = BLOCK_PERCENTAGES[block][week];
  if (level === 'avance' || level === 'confirme') return base + 5;
  return base;
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
  ]);
  const HEAVY = new Set([
    'back_squat_high',
    'back_squat_low',
    'front_squat',
    'overhead_squat',
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

// Catalyst Athletics intermediate baseline (Greg Everett / Bompa & Haff Soviet
// block model). Each session lists five movements: main + (pull|technique) +
// squat + (accessory|press). Beginners are filtered down to 3 by role
// priority; advanced upgrade press variants. Percentages are the week-1 value
// for the block; weeks ramp +2.5%/week (see weekIntensityDelta).
const BLOCK_SESSIONS: Record<ProgramBlock, SessionBlueprint[]> = {
  1: [
    {
      name: 'Arraché',
      movements: [
        { exercise_id: 'snatch', sets: 5, reps: 3, pct: 70, role: 'main' },
        { exercise_id: 'overhead_squat', sets: 4, reps: 3, pct: 65, role: 'accessory' },
        { exercise_id: 'snatch_pull', sets: 4, reps: 3, pct: 90, role: 'pull' },
        { exercise_id: 'front_squat', sets: 4, reps: 4, pct: 75, role: 'squat' },
        { exercise_id: 'strict_press', sets: 3, reps: 5, pct: 65, role: 'accessory' },
      ],
    },
    {
      name: 'Épaulé-jeté',
      movements: [
        { exercise_id: 'clean_and_jerk', sets: 5, reps: 2, repsLabel: '2+1', pct: 70, role: 'main' },
        { exercise_id: 'clean_pull', sets: 4, reps: 3, pct: 90, role: 'pull' },
        { exercise_id: 'back_squat_high', sets: 4, reps: 4, pct: 78, role: 'squat' },
        { exercise_id: 'snatch_balance', sets: 3, reps: 3, pct: 60, role: 'accessory' },
        { exercise_id: 'push_press', sets: 3, reps: 5, pct: 70, role: 'accessory' },
      ],
    },
    {
      name: 'Technique et force',
      movements: [
        { exercise_id: 'hang_snatch', sets: 4, reps: 3, pct: 65, role: 'main' },
        { exercise_id: 'power_clean', sets: 4, reps: 3, pct: 70, role: 'main' },
        { exercise_id: 'overhead_squat', sets: 3, reps: 5, pct: 60, role: 'accessory' },
        { exercise_id: 'romanian_deadlift', sets: 3, reps: 5, pct: 70, role: 'accessory' },
        { exercise_id: 'back_squat_high', sets: 3, reps: 5, pct: 75, role: 'squat' },
      ],
    },
  ],
  2: [
    {
      name: 'Arraché lourd',
      movements: [
        { exercise_id: 'snatch', sets: 6, reps: 2, pct: 80, role: 'main' },
        { exercise_id: 'snatch_balance', sets: 4, reps: 3, pct: 70, role: 'accessory' },
        { exercise_id: 'snatch_pull', sets: 5, reps: 2, pct: 97, role: 'pull' },
        { exercise_id: 'front_squat', sets: 5, reps: 3, pct: 83, role: 'squat' },
        { exercise_id: 'jerk_from_rack', sets: 4, reps: 2, pct: 80, role: 'accessory' },
      ],
    },
    {
      name: 'Épaulé-jeté lourd',
      movements: [
        { exercise_id: 'clean_and_jerk', sets: 6, reps: 1, repsLabel: '1+1', pct: 82, role: 'main' },
        { exercise_id: 'clean_pull', sets: 5, reps: 2, pct: 100, role: 'pull' },
        { exercise_id: 'back_squat_high', sets: 5, reps: 3, pct: 83, role: 'squat' },
        { exercise_id: 'power_snatch', sets: 4, reps: 2, pct: 70, role: 'main' },
        { exercise_id: 'strict_press', sets: 4, reps: 3, pct: 72, role: 'accessory' },
      ],
    },
    {
      name: 'Puissance',
      movements: [
        { exercise_id: 'hang_clean', sets: 4, reps: 2, pct: 78, role: 'main' },
        { exercise_id: 'overhead_squat', sets: 4, reps: 3, pct: 72, role: 'accessory' },
        { exercise_id: 'snatch_pull', sets: 4, reps: 2, pct: 95, role: 'pull' },
        { exercise_id: 'front_squat', sets: 4, reps: 3, pct: 82, role: 'squat' },
        { exercise_id: 'push_jerk', sets: 3, reps: 3, pct: 75, role: 'accessory' },
      ],
    },
  ],
  3: [
    {
      name: 'Réalisation arraché',
      movements: [
        {
          exercise_id: 'snatch',
          sets: 6,
          reps: 1,
          pct: 92,
          role: 'main',
          toMax: true,
          display: 'montée à la max du jour + 2×1 @ 90%',
        },
        {
          exercise_id: 'clean_and_jerk',
          sets: 5,
          reps: 1,
          pct: 90,
          role: 'main',
          toMax: true,
          display: 'montée à la max du jour',
        },
        { exercise_id: 'front_squat', sets: 3, reps: 2, pct: 90, role: 'squat' },
        { exercise_id: 'snatch_balance', sets: 3, reps: 2, pct: 80, role: 'accessory' },
      ],
    },
    {
      name: 'Réalisation épaulé',
      movements: [
        { exercise_id: 'clean_and_jerk', sets: 5, reps: 1, pct: 90, role: 'main' },
        { exercise_id: 'snatch', sets: 5, reps: 1, pct: 90, role: 'main' },
        { exercise_id: 'back_squat_high', sets: 4, reps: 2, pct: 89, role: 'squat' },
        { exercise_id: 'jerk_from_rack', sets: 3, reps: 2, pct: 85, role: 'accessory' },
      ],
    },
    {
      name: 'Puissance et pics',
      movements: [
        { exercise_id: 'power_snatch', sets: 4, reps: 2, pct: 75, role: 'main' },
        { exercise_id: 'power_clean', sets: 4, reps: 2, pct: 75, role: 'main' },
        { exercise_id: 'front_squat', sets: 3, reps: 3, pct: 85, role: 'squat' },
        { exercise_id: 'overhead_squat', sets: 3, reps: 3, pct: 75, role: 'accessory' },
      ],
    },
  ],
};

// Deload week: three differentiated A/B/C sessions, 60-65% intensity, -50%
// volume. Pattern is preserved (squat + technique) but fatigue is dropped.
const DELOAD_SESSIONS: SessionBlueprint[] = [
  {
    name: 'Décharge arraché',
    movements: [
      { exercise_id: 'snatch', sets: 3, reps: 3, pct: 65, role: 'main' },
      { exercise_id: 'overhead_squat', sets: 3, reps: 3, pct: 60, role: 'accessory' },
      { exercise_id: 'front_squat', sets: 3, reps: 3, pct: 65, role: 'squat' },
    ],
  },
  {
    name: 'Décharge épaulé',
    movements: [
      { exercise_id: 'clean_and_jerk', sets: 3, reps: 3, pct: 65, role: 'main' },
      { exercise_id: 'back_squat_high', sets: 3, reps: 3, pct: 65, role: 'squat' },
    ],
  },
  {
    name: 'Décharge technique',
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
      return snatch;
    case 'clean_and_jerk':
    case 'clean_pull':
    case 'hang_clean':
    case 'power_clean':
      return clean;
    case 'front_squat':
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
      return clean > 0 ? clean * 0.95 : 0;
    default:
      return 0;
  }
}

// Beginners skip hang variations and snatch balance until they've built a
// base in Block 1 (motor pattern safety). Push press / jerk_from_rack require
// overhead competency and are also excluded; the engine substitutes strict
// press for them so the press slot is preserved.
const BEGINNER_BLOCK_1_FORBIDDEN = new Set([
  'hang_snatch',
  'hang_clean',
  'snatch_balance',
]);

function substituteForBeginner(m: MovementBlueprint): MovementBlueprint {
  if (m.exercise_id === 'push_press') {
    return { ...m, exercise_id: 'strict_press', pct: m.pct - 5 };
  }
  if (m.exercise_id === 'jerk_from_rack' || m.exercise_id === 'push_jerk') {
    return { ...m, exercise_id: 'strict_press', pct: Math.max(50, m.pct - 15), role: 'accessory' };
  }
  return m;
}

// Advanced lifters upgrade the press slot: strict press → push press,
// push press → jerk from rack (in Block 2+, when overhead intensity is
// already high). Block 1 keeps push press to lay technical foundation.
function upgradeForAdvanced(m: MovementBlueprint, block: ProgramBlock): MovementBlueprint {
  if (m.exercise_id === 'strict_press') {
    return { ...m, exercise_id: 'push_press', pct: m.pct + 5 };
  }
  if (m.exercise_id === 'push_press' && block !== 1) {
    return { ...m, exercise_id: 'jerk_from_rack', pct: m.pct + 5 };
  }
  return m;
}

// Beginner sessions reduce to 3 movements in role priority order:
// main → pull → squat, then accessory fills if a role is missing.
function pickBeginnerMovements(movements: MovementBlueprint[]): MovementBlueprint[] {
  const picked: MovementBlueprint[] = [];
  const used = new Set<number>();
  const priorities: MovementRole[] = ['main', 'pull', 'squat'];
  for (const role of priorities) {
    const idx = movements.findIndex((m, i) => !used.has(i) && m.role === role);
    if (idx >= 0) {
      picked.push(movements[idx]);
      used.add(idx);
      if (picked.length === 3) return picked;
    }
  }
  for (let i = 0; i < movements.length && picked.length < 3; i += 1) {
    if (!used.has(i)) picked.push(movements[i]);
  }
  return picked;
}

function levelizeSession(
  session: SessionBlueprint,
  tier: WeightliftingLevelTier,
  block: ProgramBlock,
): MovementBlueprint[] {
  if (tier === 'beginner') {
    const filtered = session.movements
      .filter((m) => !(block === 1 && BEGINNER_BLOCK_1_FORBIDDEN.has(m.exercise_id)))
      .map(substituteForBeginner);
    return pickBeginnerMovements(filtered).map((m) => ({
      ...m,
      sets: Math.max(2, m.sets - 1),
    }));
  }
  if (tier === 'advanced') {
    return session.movements
      .map((m) => upgradeForAdvanced(m, block))
      .map((m) =>
        m.role === 'main' || m.role === 'squat'
          ? { ...m, sets: m.sets + 1 }
          : m,
      );
  }
  return session.movements.slice();
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

function selectBlueprint(
  block: ProgramBlock,
  week: number,
  dayOfWeek: number,
): { blueprint: SessionBlueprint; isDeload: boolean } {
  if (week >= 4) {
    const idx = (Math.max(1, dayOfWeek) - 1) % DELOAD_SESSIONS.length;
    return { blueprint: DELOAD_SESSIONS[idx], isDeload: true };
  }
  const sessions = BLOCK_SESSIONS[block];
  const idx = (Math.max(1, dayOfWeek) - 1) % sessions.length;
  return { blueprint: sessions[idx], isDeload: false };
}

function buildWeightliftingSession(params: GenerateParams): BuiltWeightliftingSession {
  const { program, maxes, dayOfWeek, zoneScore } = params;
  const recentRir = params.recentRir ?? [];
  const week = Math.min(4, Math.max(1, program.current_week)) as WeekIndex;
  const block = program.current_block;
  const tier = levelTier(program.level);
  const adaptation = adaptToZoneScore(zoneScore);

  const { blueprint, isDeload } = selectBlueprint(block, week, dayOfWeek);
  const movements = isDeload
    ? blueprint.movements
    : levelizeSession(blueprint, tier, block);
  const intensityDelta = isDeload
    ? 0
    : weekIntensityDelta(week) + rirIntensityDelta(recentRir);

  const maxLookup = new Map<string, number>();
  for (const m of maxes) maxLookup.set(m.exercise_id, m.estimated_1rm);

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
      reps = Math.min(zone.maxPerSet, Math.max(zone.minPerSet, m.reps));
      sets = prilepinAdjustSets(sets, reps, pct);
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

    const setList: PlannedSet[] = [];
    for (let i = 1; i <= sets; i += 1) {
      setList.push({
        exercise_id: m.exercise_id,
        set_number: i,
        target_reps: repsLabel,
        target_weight_kg: targetWeight,
        target_rpe: rpe,
        rest_seconds: rest,
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

export function checkAndAdvanceProgram(
  program: UserProgram,
  completedSessions: TrainingSession[],
): UserProgram {
  const sortedCompleted = completedSessions
    .filter((s) => s.status === 'completed')
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalCompleted = sortedCompleted.length;
  const sessionsPerWeek = Math.max(1, program.sessions_per_week);
  const weeksDone = Math.floor(totalCompleted / sessionsPerWeek);
  const dayInWeek = (totalCompleted % sessionsPerWeek) + 1;

  let block = program.current_block;
  let week = (weeksDone % 4) + 1;
  const blocksFinished = Math.floor(weeksDone / 4);
  block = ((((program.current_block - 1) + blocksFinished) % 3) + 1) as ProgramBlock;

  return {
    ...program,
    current_block: block,
    current_week: week,
    current_day: dayInWeek,
  };
}
