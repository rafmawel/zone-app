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

interface TemplateExercise {
  exercise_id: string;
  sets: number;
  reps: string;
  uses_main_pct: boolean;
  pct_of_max?: number;
  rpe?: number;
}

type TemplateMap = Record<number, TemplateExercise[]>;

const BEGINNER: TemplateMap = {
  1: [
    { exercise_id: 'snatch', sets: 5, reps: '3', uses_main_pct: true },
    { exercise_id: 'back_squat_high', sets: 4, reps: '5', uses_main_pct: true },
    { exercise_id: 'strict_press', sets: 3, reps: '8', uses_main_pct: false, pct_of_max: 60 },
    { exercise_id: 'pullup_pronation', sets: 3, reps: '6-10', uses_main_pct: false },
  ],
  2: [
    { exercise_id: 'clean_and_jerk', sets: 5, reps: '3', uses_main_pct: true },
    { exercise_id: 'front_squat', sets: 4, reps: '5', uses_main_pct: true },
    { exercise_id: 'romanian_deadlift', sets: 3, reps: '8', uses_main_pct: false, pct_of_max: 60 },
    { exercise_id: 'barbell_row', sets: 3, reps: '8', uses_main_pct: false, pct_of_max: 60 },
  ],
};

const INTERMEDIATE: TemplateMap = {
  1: [
    { exercise_id: 'snatch', sets: 6, reps: '2', uses_main_pct: true },
    { exercise_id: 'snatch_pull', sets: 4, reps: '3', uses_main_pct: false, pct_of_max: 90 },
    { exercise_id: 'overhead_squat', sets: 3, reps: '3', uses_main_pct: false, pct_of_max: 70 },
    { exercise_id: 'pullup_pronation', sets: 3, reps: '8', uses_main_pct: false },
  ],
  2: [
    { exercise_id: 'clean_and_jerk', sets: 5, reps: '2', uses_main_pct: true },
    { exercise_id: 'front_squat', sets: 4, reps: '3', uses_main_pct: true },
    { exercise_id: 'strict_press', sets: 4, reps: '5', uses_main_pct: false, pct_of_max: 70 },
    { exercise_id: 'romanian_deadlift', sets: 3, reps: '6', uses_main_pct: false, pct_of_max: 70 },
  ],
  3: [
    { exercise_id: 'back_squat_high', sets: 5, reps: '3', uses_main_pct: true },
    { exercise_id: 'deadlift', sets: 4, reps: '3', uses_main_pct: false, pct_of_max: 80 },
    { exercise_id: 'bench_press', sets: 4, reps: '5', uses_main_pct: false, pct_of_max: 75 },
    { exercise_id: 'barbell_row', sets: 4, reps: '6', uses_main_pct: false, pct_of_max: 65 },
  ],
  4: [
    { exercise_id: 'power_snatch', sets: 5, reps: '2', uses_main_pct: false, pct_of_max: 65 },
    { exercise_id: 'power_clean', sets: 5, reps: '2', uses_main_pct: false, pct_of_max: 65 },
    { exercise_id: 'front_squat', sets: 3, reps: '5', uses_main_pct: false, pct_of_max: 65 },
    { exercise_id: 'plank', sets: 3, reps: '45s', uses_main_pct: false },
  ],
};

const ADVANCED: TemplateMap = {
  1: [
    { exercise_id: 'snatch', sets: 6, reps: '1', uses_main_pct: true },
    { exercise_id: 'hang_snatch', sets: 4, reps: '2', uses_main_pct: false, pct_of_max: 80 },
    { exercise_id: 'snatch_pull', sets: 4, reps: '3', uses_main_pct: false, pct_of_max: 95 },
    { exercise_id: 'overhead_squat', sets: 3, reps: '3', uses_main_pct: false, pct_of_max: 75 },
  ],
  2: [
    { exercise_id: 'clean_and_jerk', sets: 5, reps: '1', uses_main_pct: true },
    { exercise_id: 'hang_clean', sets: 4, reps: '2', uses_main_pct: false, pct_of_max: 80 },
    { exercise_id: 'clean_pull', sets: 4, reps: '3', uses_main_pct: false, pct_of_max: 95 },
    { exercise_id: 'split_jerk', sets: 4, reps: '2', uses_main_pct: false, pct_of_max: 85 },
  ],
  3: [
    { exercise_id: 'back_squat_high', sets: 6, reps: '3', uses_main_pct: true },
    { exercise_id: 'front_squat', sets: 4, reps: '3', uses_main_pct: false, pct_of_max: 85 },
    { exercise_id: 'romanian_deadlift', sets: 3, reps: '5', uses_main_pct: false, pct_of_max: 75 },
    { exercise_id: 'side_plank', sets: 3, reps: '30s', uses_main_pct: false },
  ],
  4: [
    { exercise_id: 'power_snatch', sets: 5, reps: '2', uses_main_pct: false, pct_of_max: 70 },
    { exercise_id: 'overhead_squat', sets: 3, reps: '3', uses_main_pct: false, pct_of_max: 65 },
    { exercise_id: 'pullup_pronation', sets: 3, reps: '6', uses_main_pct: false },
  ],
  5: [
    { exercise_id: 'power_clean', sets: 5, reps: '2', uses_main_pct: false, pct_of_max: 70 },
    { exercise_id: 'push_jerk', sets: 4, reps: '2', uses_main_pct: false, pct_of_max: 70 },
    { exercise_id: 'strict_press', sets: 4, reps: '5', uses_main_pct: false, pct_of_max: 70 },
    { exercise_id: 'face_pull', sets: 3, reps: '12', uses_main_pct: false },
  ],
  6: [
    { exercise_id: 'kb_swing', sets: 5, reps: '15', uses_main_pct: false },
    { exercise_id: 'bulgarian_split_squat', sets: 3, reps: '10', uses_main_pct: false },
    { exercise_id: 'plank', sets: 3, reps: '60s', uses_main_pct: false },
    { exercise_id: 'pushups', sets: 3, reps: '15', uses_main_pct: false },
  ],
};

function pickTemplate(level: string, dayOfWeek: number, sessionsPerWeek: number): TemplateExercise[] {
  const map =
    level === 'avance' || level === 'confirme'
      ? ADVANCED
      : level === 'intermediaire'
        ? INTERMEDIATE
        : BEGINNER;
  const total = Math.max(1, Math.min(sessionsPerWeek, Object.keys(map).length));
  const dayKey = ((dayOfWeek - 1) % total) + 1;
  return map[dayKey] ?? map[1];
}

function roundToBarbellPlate(kg: number): number {
  if (kg <= 0) return 0;
  return roundToBar(kg);
}

function rpeForBlock(block: ProgramBlock, week: WeekIndex): number {
  if (week === 4) return 6;
  if (block === 1) return 7;
  if (block === 2) return 8;
  return 9;
}

export interface GenerateParams {
  program: UserProgram;
  maxes: ExerciseMax[];
  dayOfWeek: number;
  zoneScore: number | null;
}

export interface GeneratedSession {
  exercises: SessionExercise[];
  message: string;
  appliedAdaptation: ZoneAdaptation;
}

export function generateWeeklySession(params: GenerateParams): GeneratedSession {
  const { program, maxes, dayOfWeek, zoneScore } = params;
  const week = Math.min(4, Math.max(1, program.current_week)) as WeekIndex;
  const block = program.current_block;
  const mainPct = getTrainingPercentage(block, week, program.level);
  const adaptation = adaptToZoneScore(zoneScore);
  const targetRpe = rpeForBlock(block, week);

  const template = pickTemplate(program.level, dayOfWeek, program.sessions_per_week);

  const maxLookup = new Map<string, number>();
  for (const m of maxes) maxLookup.set(m.exercise_id, m.estimated_1rm);

  const exercises: SessionExercise[] = template.map((t) => {
    const adjustedSets = Math.max(2, t.sets + adaptation.setsDelta);
    const oneRm = maxLookup.get(t.exercise_id) ?? 0;
    const pct = t.uses_main_pct ? mainPct : (t.pct_of_max ?? null);
    const targetWeight =
      pct !== null && oneRm > 0
        ? roundToBarbellPlate(oneRm * (pct / 100) * adaptation.weightMultiplier)
        : null;
    const baseRest = restBaseForExercise(t.exercise_id);

    const sets: PlannedSet[] = [];
    for (let i = 1; i <= adjustedSets; i += 1) {
      sets.push({
        exercise_id: t.exercise_id,
        set_number: i,
        target_reps: t.reps,
        target_weight_kg: targetWeight,
        target_rpe: t.rpe ?? (t.uses_main_pct ? targetRpe : null),
        rest_seconds: baseRest,
      });
    }
    return { exercise_id: t.exercise_id, sets };
  });

  return {
    exercises,
    message: adaptation.message,
    appliedAdaptation: adaptation,
  };
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
