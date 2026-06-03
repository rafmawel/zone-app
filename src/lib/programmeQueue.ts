import { previewWeightliftingSession, projectProgram } from './programEngine';
import {
  buildSessionPlan,
  calculateVDOTPaces,
  getWeeklyDistribution,
  sessionName,
  type RunningSessionType,
} from './runningEngine';
import { generateMuscleSession } from './muscleEngine';
import { generateHyroxSession, type HyroxSessionType } from './hyroxEngine';
import { hyroxWeeklyPlan, type HyroxBlockPhase } from './hyroxScience';
import { getExerciseById } from '@/data/exercises';
import type {
  ExerciseMax,
  HyroxProfile,
  MuscleProfile,
  QueueState,
  RunningProfile,
  UserProgram,
} from './firestore';

export type QueueSport = 'weightlifting' | 'running' | 'musculation' | 'hyrox';
export type QueueStatus = 'completed' | 'skipped' | 'available' | 'locked';

export interface QueueItem {
  key: string;
  sport: QueueSport;
  weekNumber: number;
  sessionIndex: number;
  name: string;
  exercises: string[];
  estimatedMinutes: number;
  status: QueueStatus;
  /** Launch parameters. */
  day: number;
  block: number;
  week: number;
  runningType?: RunningSessionType;
  hyroxType?: HyroxSessionType;
}

export interface BuildQueueInputs {
  program: UserProgram | null;
  maxes: ExerciseMax[];
  runningProfile: RunningProfile | null;
  muscleProfile: MuscleProfile | null;
  hyroxProfile: HyroxProfile | null;
  hyroxBlock: HyroxBlockPhase;
  state: QueueState;
  weeks?: number;
}

const SPORT_ORDER: QueueSport[] = ['weightlifting', 'running', 'musculation', 'hyrox'];
const SQUAT_IDS = new Set(['front_squat', 'back_squat_high', 'back_squat_low', 'overhead_squat']);

export function queueKey(sport: QueueSport, week: number, sessionIndex: number): string {
  return `${sport}_w${week}_s${sessionIndex}`;
}

function exName(id: string): string {
  return getExerciseById(id)?.name ?? id;
}

function weightliftingName(exerciseIds: string[]): string {
  if (exerciseIds.length === 0) return 'Séance haltérophilie';
  const main = exName(exerciseIds[0]);
  const squat = exerciseIds.find((id) => SQUAT_IDS.has(id));
  if (squat && squat !== exerciseIds[0]) return `${main} · ${exName(squat)}`;
  if (exerciseIds[1]) return `${main} · ${exName(exerciseIds[1])}`;
  return main;
}

const HYROX_NAME: Record<HyroxSessionType, string> = {
  station_work: 'Stations · travail technique',
  running_base: 'Course base · endurance',
  strength_base: 'Renforcement · force fonctionnelle',
  race_simulation: 'Simulation de course',
};

function runningLevel(vdot: number): 'beginner' | 'intermediate' | 'advanced' {
  return vdot < 35 ? 'beginner' : vdot < 55 ? 'intermediate' : 'advanced';
}

/**
 * Build the unified multi-sport queue, grouped by week. Each sport's sessions
 * are sequential; status is derived from saved completion/skip state.
 *
 * @returns array indexed by (weekNumber - 1), each holding that week's items
 */
export function buildProgrammeQueue(inputs: BuildQueueInputs): QueueItem[][] {
  const weeks = inputs.weeks ?? 3;
  const perSport: Record<QueueSport, QueueItem[]> = {
    weightlifting: [],
    running: [],
    musculation: [],
    hyrox: [],
  };

  const { program, maxes, runningProfile, muscleProfile, hyroxProfile, state } = inputs;

  // Weightlifting
  if (program && program.sport_key === 'weightlifting') {
    const perWeek = Math.max(1, Math.min(6, program.sessions_per_week));
    for (let w = 1; w <= weeks; w += 1) {
      const projected = projectProgram(program, w - 1);
      for (let s = 1; s <= perWeek; s += 1) {
        try {
          const p = previewWeightliftingSession(projected, maxes, s);
          const ids = p.exercises.map((e) => e.exerciseId);
          perSport.weightlifting.push({
            // Stable across completion-driven advancement (block/week, not the
            // relative display week) so a key is never reused for a new session.
            key: `weightlifting_b${projected.current_block}_w${projected.current_week}_s${s}`,
            sport: 'weightlifting',
            weekNumber: w,
            sessionIndex: s,
            name: weightliftingName(ids),
            exercises: ids.slice(0, 3).map(exName),
            estimatedMinutes: p.durationMin,
            status: 'locked',
            day: s,
            block: projected.current_block,
            week: projected.current_week,
          });
        } catch {
          // skip
        }
      }
    }
  }

  // Running
  if (runningProfile) {
    const paces = calculateVDOTPaces(runningProfile.vdot);
    const level = runningLevel(runningProfile.vdot);
    const dist = getWeeklyDistribution(runningProfile.sessions_per_week, 1, 1);
    const types = dist.items
      .filter((i) => i.type !== 'REST')
      .map((i) => i.type as RunningSessionType);
    for (let w = 1; w <= weeks; w += 1) {
      types.forEach((t, idx) => {
        const s = idx + 1;
        const plan = buildSessionPlan({ type: t, paces, level, block: 1, week: 1 });
        perSport.running.push({
          key: queueKey('running', w, s),
          sport: 'running',
          weekNumber: w,
          sessionIndex: s,
          name: `${sessionName(t)} · ${plan.estimatedDistanceKm} km`,
          exercises: [`${plan.estimatedDistanceKm} km`, sessionName(t)],
          estimatedMinutes: plan.estimatedDurationMin,
          status: 'locked',
          day: s,
          block: 1,
          week: 1,
          runningType: t,
        });
      });
    }
  }

  // Musculation
  if (muscleProfile) {
    const perWeek = Math.max(1, Math.min(6, muscleProfile.sessions_per_week));
    for (let w = 1; w <= weeks; w += 1) {
      for (let s = 1; s <= perWeek; s += 1) {
        try {
          const gen = generateMuscleSession({
            sessionsPerWeek: muscleProfile.sessions_per_week,
            dayOfWeek: s,
            goal: muscleProfile.goal,
            weakPoints: [],
            zoneScore: null,
            recentRir: [],
          });
          perSport.musculation.push({
            key: queueKey('musculation', w, s),
            sport: 'musculation',
            weekNumber: w,
            sessionIndex: s,
            name: gen.split_day,
            exercises: gen.exercises.slice(0, 3).map((e) => exName(e.exercise_id)),
            estimatedMinutes: gen.estimated_duration_min,
            status: 'locked',
            day: s,
            block: 1,
            week: 1,
          });
        } catch {
          // skip
        }
      }
    }
  }

  // Hyrox
  if (hyroxProfile) {
    const plan = hyroxWeeklyPlan(hyroxProfile.sessions_per_week, inputs.hyroxBlock);
    const types = plan.filter((t): t is HyroxSessionType => t !== 'rest');
    for (let w = 1; w <= weeks; w += 1) {
      types.forEach((t, idx) => {
        const s = idx + 1;
        const gen = generateHyroxSession({
          type: t,
          level: hyroxProfile.level,
          weakStations: [],
          zoneScore: 60,
        });
        perSport.hyrox.push({
          key: queueKey('hyrox', w, s),
          sport: 'hyrox',
          weekNumber: w,
          sessionIndex: s,
          name: HYROX_NAME[t],
          exercises: gen.rounds.slice(0, 3).map((r) => r.station_target_label ?? 'Course'),
          estimatedMinutes: gen.estimated_duration_min,
          status: 'locked',
          day: s,
          block: inputs.hyroxBlock,
          week: 1,
          hyroxType: t,
        });
      });
    }
  }

  // Status: each sport's list is sequential. The first not-done item is
  // 'available', everything after it 'locked'.
  for (const sport of SPORT_ORDER) {
    let blocked = false;
    for (const item of perSport[sport]) {
      const saved = state[item.key];
      if (saved?.status === 'completed') item.status = 'completed';
      else if (saved?.status === 'skipped') item.status = 'skipped';
      else if (!blocked) {
        item.status = 'available';
        blocked = true;
      } else {
        item.status = 'locked';
      }
    }
  }

  // Group by week.
  const grouped: QueueItem[][] = [];
  for (let w = 1; w <= weeks; w += 1) {
    const items: QueueItem[] = [];
    for (const sport of SPORT_ORDER) {
      for (const item of perSport[sport]) {
        if (item.weekNumber === w) items.push(item);
      }
    }
    grouped.push(items);
  }
  return grouped;
}
