import type { Exercise, MuscleGroup } from '@/data/exercises';

export interface MuscleVolumeLandmarks {
  MEV: number;
  MAV: number;
  MRV: number;
}

export const MUSCLE_VOLUME_LANDMARKS: Partial<Record<MuscleGroup, MuscleVolumeLandmarks>> = {
  quadriceps: { MEV: 8, MAV: 16, MRV: 22 },
  hamstrings: { MEV: 6, MAV: 12, MRV: 20 },
  glutes: { MEV: 4, MAV: 12, MRV: 16 },
  chest: { MEV: 8, MAV: 16, MRV: 22 },
  upper_back: { MEV: 10, MAV: 18, MRV: 25 },
  lats: { MEV: 8, MAV: 14, MRV: 20 },
  shoulders: { MEV: 6, MAV: 16, MRV: 22 },
  biceps: { MEV: 6, MAV: 14, MRV: 20 },
  triceps: { MEV: 6, MAV: 14, MRV: 20 },
  core: { MEV: 4, MAV: 10, MRV: 16 },
  lower_back: { MEV: 4, MAV: 8, MRV: 12 },
  traps: { MEV: 4, MAV: 12, MRV: 18 },
  calves: { MEV: 6, MAV: 14, MRV: 20 },
};

export const SRA_HOURS = {
  large_compound: 72,
  medium_compound: 48,
  isolation: 24,
} as const;

export type RepRange = 'strength' | 'hypertrophy' | 'endurance';

export const REP_RANGES: Record<RepRange, { min: number; max: number; restSeconds: number }> = {
  strength: { min: 1, max: 5, restSeconds: 180 },
  hypertrophy: { min: 6, max: 20, restSeconds: 90 },
  endurance: { min: 20, max: 30, restSeconds: 45 },
};

export type DeloadType = 'volume' | 'intensity' | 'full';

export function selectDeloadType(level: string, consecutiveHardWeeks: number): DeloadType {
  if (level === 'debutant' || level === 'beginner') return 'volume';
  if (level === 'avance' || level === 'confirme' || level === 'advanced' || level === 'elite') {
    const cycle = ['volume', 'intensity', 'full'] as const;
    return cycle[consecutiveHardWeeks % 3];
  }
  return consecutiveHardWeeks % 2 === 0 ? 'volume' : 'intensity';
}

export type MuscleSplit = 'full_body' | 'upper_lower' | 'push_pull_legs' | 'ppl_plus';

export function getSplitForFrequency(sessionsPerWeek: number): MuscleSplit {
  if (sessionsPerWeek <= 2) return 'full_body';
  if (sessionsPerWeek === 3) return 'full_body';
  if (sessionsPerWeek === 4) return 'upper_lower';
  if (sessionsPerWeek === 5) return 'push_pull_legs';
  return 'ppl_plus';
}

export type MuscleGoal = 'hypertrophy' | 'strength' | 'mixed' | 'fitness';

export const MUSCLE_GOAL_LABELS: Record<MuscleGoal, string> = {
  hypertrophy: 'Prise de masse',
  strength: 'Force',
  mixed: 'Mixte force / masse',
  fitness: 'Remise en forme',
};

export interface PlannedMuscleSet {
  exercise_id: string;
  set_number: number;
  target_reps: string;
  target_weight_kg: number | null;
  target_rpe: number | null;
  rest_seconds: number;
}

export interface PlannedMuscleExercise {
  exercise_id: string;
  sets: PlannedMuscleSet[];
  rep_range: RepRange;
}

export interface PlannedMuscleSession {
  block_label: string;
  split_day: string;
  exercises: PlannedMuscleExercise[];
  message: string;
  estimated_duration_min: number;
}

export interface MuscleZoneAdaptation {
  message: string;
  setsDelta: number;
  weightMultiplier: number;
  capRpe: number | null;
  allowExtraSet: boolean;
}

export function adaptMuscleSessionToZone(zoneScore: number | null): MuscleZoneAdaptation {
  if (zoneScore === null) {
    return {
      message: 'Pas de check-in aujourd’hui. Reste à l’écoute pendant la séance.',
      setsDelta: 0,
      weightMultiplier: 1,
      capRpe: null,
      allowExtraSet: false,
    };
  }
  if (zoneScore <= 30) {
    return {
      message:
        'Aujourd’hui on maintient, pas on progresse. Deux exercices, sans douleur.',
      setsDelta: -2,
      weightMultiplier: 0.7,
      capRpe: 6,
      allowExtraSet: false,
    };
  }
  if (zoneScore <= 50) {
    return {
      message: 'Volume réduit. Tu stimules sans te briser.',
      setsDelta: -1,
      weightMultiplier: 0.9,
      capRpe: 8,
      allowExtraSet: false,
    };
  }
  if (zoneScore <= 75) {
    return {
      message: 'Bonne séance en vue. Respecte le plan, écoute ton corps.',
      setsDelta: 0,
      weightMultiplier: 1,
      capRpe: null,
      allowExtraSet: false,
    };
  }
  return {
    message: 'Fenêtre de croissance ouverte. Pousse si le corps répond.',
    setsDelta: 0,
    weightMultiplier: 1,
    capRpe: null,
    allowExtraSet: true,
  };
}

export interface ProgressionTarget {
  weight: number;
  targetReps: string;
}

export function getProgressionTarget(
  lastWeight: number,
  lastReps: number,
  range: RepRange,
): ProgressionTarget {
  const { min, max } = REP_RANGES[range];
  if (lastReps >= max) {
    return { weight: lastWeight + 2.5, targetReps: `${min}-${max}` };
  }
  if (lastReps < min) {
    return {
      weight: Math.max(0, Math.round((lastWeight * 0.95) / 2.5) * 2.5),
      targetReps: `${min}-${max}`,
    };
  }
  return { weight: lastWeight, targetReps: `${min}-${max}` };
}

interface SplitTemplate {
  label: string;
  exercises: { id: string; sets: number; range: RepRange }[];
}

const TEMPLATES: Record<MuscleSplit, SplitTemplate[]> = {
  full_body: [
    {
      label: 'Full body A',
      exercises: [
        { id: 'back_squat_high', sets: 3, range: 'strength' },
        { id: 'bench_press', sets: 3, range: 'hypertrophy' },
        { id: 'barbell_row', sets: 3, range: 'hypertrophy' },
        { id: 'strict_press', sets: 3, range: 'hypertrophy' },
        { id: 'plank', sets: 3, range: 'endurance' },
      ],
    },
    {
      label: 'Full body B',
      exercises: [
        { id: 'deadlift', sets: 3, range: 'strength' },
        { id: 'pullup_pronation', sets: 3, range: 'hypertrophy' },
        { id: 'incline_press', sets: 3, range: 'hypertrophy' },
        { id: 'bulgarian_split_squat', sets: 3, range: 'hypertrophy' },
        { id: 'russian_twist', sets: 3, range: 'endurance' },
      ],
    },
  ],
  upper_lower: [
    {
      label: 'Upper A',
      exercises: [
        { id: 'bench_press', sets: 4, range: 'hypertrophy' },
        { id: 'barbell_row', sets: 4, range: 'hypertrophy' },
        { id: 'strict_press', sets: 3, range: 'hypertrophy' },
        { id: 'pullup_supination', sets: 3, range: 'hypertrophy' },
        { id: 'lateral_raises', sets: 3, range: 'hypertrophy' },
      ],
    },
    {
      label: 'Lower A',
      exercises: [
        { id: 'back_squat_high', sets: 4, range: 'strength' },
        { id: 'romanian_deadlift', sets: 3, range: 'hypertrophy' },
        { id: 'leg_press', sets: 3, range: 'hypertrophy' },
        { id: 'leg_curl', sets: 3, range: 'hypertrophy' },
        { id: 'plank', sets: 3, range: 'endurance' },
      ],
    },
    {
      label: 'Upper B',
      exercises: [
        { id: 'incline_press', sets: 4, range: 'hypertrophy' },
        { id: 'dumbbell_row', sets: 4, range: 'hypertrophy' },
        { id: 'dips', sets: 3, range: 'hypertrophy' },
        { id: 'lat_pulldown', sets: 3, range: 'hypertrophy' },
        { id: 'barbell_curl', sets: 3, range: 'hypertrophy' },
      ],
    },
    {
      label: 'Lower B',
      exercises: [
        { id: 'deadlift', sets: 4, range: 'strength' },
        { id: 'front_squat', sets: 3, range: 'hypertrophy' },
        { id: 'hip_thrust', sets: 3, range: 'hypertrophy' },
        { id: 'leg_extension', sets: 3, range: 'hypertrophy' },
        { id: 'russian_twist', sets: 3, range: 'endurance' },
      ],
    },
  ],
  push_pull_legs: [
    {
      label: 'Push',
      exercises: [
        { id: 'bench_press', sets: 4, range: 'hypertrophy' },
        { id: 'strict_press', sets: 4, range: 'hypertrophy' },
        { id: 'incline_press', sets: 3, range: 'hypertrophy' },
        { id: 'lateral_raises', sets: 3, range: 'hypertrophy' },
        { id: 'tricep_extension', sets: 3, range: 'hypertrophy' },
      ],
    },
    {
      label: 'Pull',
      exercises: [
        { id: 'deadlift', sets: 3, range: 'strength' },
        { id: 'pullup_pronation', sets: 4, range: 'hypertrophy' },
        { id: 'barbell_row', sets: 4, range: 'hypertrophy' },
        { id: 'face_pull', sets: 3, range: 'hypertrophy' },
        { id: 'barbell_curl', sets: 3, range: 'hypertrophy' },
      ],
    },
    {
      label: 'Legs',
      exercises: [
        { id: 'back_squat_high', sets: 4, range: 'strength' },
        { id: 'romanian_deadlift', sets: 3, range: 'hypertrophy' },
        { id: 'leg_press', sets: 3, range: 'hypertrophy' },
        { id: 'hip_thrust', sets: 3, range: 'hypertrophy' },
        { id: 'leg_curl', sets: 3, range: 'hypertrophy' },
      ],
    },
  ],
  ppl_plus: [
    {
      label: 'Push',
      exercises: [
        { id: 'bench_press', sets: 4, range: 'hypertrophy' },
        { id: 'strict_press', sets: 4, range: 'hypertrophy' },
        { id: 'incline_press', sets: 3, range: 'hypertrophy' },
        { id: 'lateral_raises', sets: 3, range: 'hypertrophy' },
        { id: 'tricep_extension', sets: 3, range: 'hypertrophy' },
      ],
    },
    {
      label: 'Pull',
      exercises: [
        { id: 'pullup_pronation', sets: 4, range: 'hypertrophy' },
        { id: 'barbell_row', sets: 4, range: 'hypertrophy' },
        { id: 'lat_pulldown', sets: 3, range: 'hypertrophy' },
        { id: 'face_pull', sets: 3, range: 'hypertrophy' },
        { id: 'barbell_curl', sets: 3, range: 'hypertrophy' },
      ],
    },
    {
      label: 'Legs',
      exercises: [
        { id: 'back_squat_high', sets: 4, range: 'strength' },
        { id: 'romanian_deadlift', sets: 3, range: 'hypertrophy' },
        { id: 'leg_press', sets: 3, range: 'hypertrophy' },
        { id: 'hip_thrust', sets: 3, range: 'hypertrophy' },
        { id: 'leg_curl', sets: 3, range: 'hypertrophy' },
      ],
    },
    {
      label: 'Upper',
      exercises: [
        { id: 'incline_press', sets: 3, range: 'hypertrophy' },
        { id: 'dumbbell_row', sets: 4, range: 'hypertrophy' },
        { id: 'lateral_raises', sets: 3, range: 'hypertrophy' },
        { id: 'barbell_curl', sets: 3, range: 'hypertrophy' },
        { id: 'tricep_extension', sets: 3, range: 'hypertrophy' },
      ],
    },
  ],
};

export interface GenerateMuscleSessionParams {
  sessionsPerWeek: number;
  dayOfWeek: number;
  goal: MuscleGoal;
  weakPoints: MuscleGroup[];
  zoneScore: number | null;
}

export function generateMuscleSession(params: GenerateMuscleSessionParams): PlannedMuscleSession {
  const split = getSplitForFrequency(params.sessionsPerWeek);
  const templates = TEMPLATES[split];
  const tpl = templates[(params.dayOfWeek - 1) % templates.length];
  const adaptation = adaptMuscleSessionToZone(params.zoneScore);

  let working = tpl.exercises;
  if (params.zoneScore !== null && params.zoneScore <= 30) {
    working = working.slice(0, 2);
  }

  const exercises: PlannedMuscleExercise[] = working.map((ex) => {
    const range = params.goal === 'strength'
      ? 'strength'
      : params.goal === 'fitness'
        ? 'endurance'
        : ex.range;
    const adjustedSets = Math.max(1, ex.sets + adaptation.setsDelta);
    const repsTxt = `${REP_RANGES[range].min}-${REP_RANGES[range].max}`;
    const sets: PlannedMuscleSet[] = [];
    for (let i = 1; i <= adjustedSets; i += 1) {
      sets.push({
        exercise_id: ex.id,
        set_number: i,
        target_reps: repsTxt,
        target_weight_kg: null,
        target_rpe:
          adaptation.capRpe !== null
            ? adaptation.capRpe
            : range === 'strength'
              ? 8
              : range === 'hypertrophy'
                ? 8
                : 7,
        rest_seconds: REP_RANGES[range].restSeconds,
      });
    }
    return { exercise_id: ex.id, sets, rep_range: range };
  });

  const totalSets = exercises.reduce((acc, e) => acc + e.sets.length, 0);
  const estDur = Math.round(totalSets * 3.2);
  return {
    block_label: tpl.label,
    split_day: tpl.label,
    exercises,
    message: adaptation.message,
    estimated_duration_min: estDur,
  };
}

export function muscleGroupVolumeFor(
  exercises: Pick<Exercise, 'muscles_primary' | 'muscles_secondary'>[],
  setsPerExercise: number,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of exercises) {
    for (const m of e.muscles_primary) {
      counts[m] = (counts[m] ?? 0) + setsPerExercise;
    }
    for (const m of e.muscles_secondary) {
      counts[m] = (counts[m] ?? 0) + setsPerExercise * 0.5;
    }
  }
  return counts;
}
