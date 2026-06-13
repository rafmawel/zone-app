import { type Href } from 'expo-router';
import {
  createPlannedSession,
  createRunSession,
  todayDateString,
  type ExerciseMax,
  type HyroxProfile,
  type MuscleProfile,
  type RunningProfile,
  type SessionExercise,
  type UserProgram,
} from './firestore';
import { generateWeeklySession, rirIntensityDelta } from './programEngine';
import { buildSessionPlan, calculateVDOTPaces, runningPaceFactor } from './runningEngine';
import { generateMuscleSession } from './muscleEngine';
import type { QueueItem } from './programmeQueue';
import type { MuscleGroup } from '@/data/exercises';

export interface CreateWeightliftingOptions {
  uid: string;
  program: UserProgram;
  maxes: ExerciseMax[];
  zoneScore: number | null;
  recentRir: number[];
  /** 1-based session of the week (A/B/C). Defaults to the programme's day. */
  dayOfWeek?: number;
  /** Programme-queue item key, stored on the session for unlock-on-complete. */
  queueKey?: string;
}

/**
 * Generate a weightlifting session (with RIR autoregulation), persist it as a
 * planned session, and return its id. Shared by the programme queue and the
 * session preview so launch behaviour stays identical.
 */
export async function createWeightliftingSession(
  opts: CreateWeightliftingOptions,
): Promise<string> {
  const { uid, program, maxes, zoneScore, recentRir } = opts;
  const dayOfWeek = opts.dayOfWeek ?? program.current_day;
  const generated = generateWeeklySession({ program, maxes, dayOfWeek, zoneScore, recentRir });
  const rirDelta = rirIntensityDelta(recentRir);
  const autoNote =
    rirDelta > 0
      ? 'Tes 2 dernières séances étaient faciles (RIR élevé) : intensité augmentée de 2,5%. '
      : rirDelta < 0
        ? 'Tes 2 dernières séances étaient très dures (RIR 0) : intensité réduite. '
        : '';
  return createPlannedSession(uid, {
    date: todayDateString(),
    sport_key: program.sport_key,
    planned_exercises: generated.exercises,
    zone_score_at_start: zoneScore,
    zone_message: autoNote + generated.message,
    queue_key: opts.queueKey,
  });
}

export interface LaunchSessionInputs {
  uid: string;
  item: QueueItem;
  program: UserProgram | null;
  runningProfile: RunningProfile | null;
  muscleProfile: MuscleProfile | null;
  hyroxProfile: HyroxProfile | null;
  maxes: ExerciseMax[];
  zoneScore: number | null;
  recentRir: number[];
  recentMuscleRir: number[];
  recentRunRir: number[];
}

/**
 * Create the session document(s) for a programme-queue item and return the
 * route to navigate to (or `null` if the item's sport isn't configured).
 *
 * Shared by the Entraîner tab and the Home screen so a session launched from
 * either place is created identically. This is a pure relocation of the launch
 * logic — no behavioural change.
 */
export async function launchSessionForItem(
  inputs: LaunchSessionInputs,
): Promise<Href | null> {
  const {
    uid,
    item,
    program,
    runningProfile,
    muscleProfile,
    hyroxProfile,
    maxes,
    zoneScore,
    recentRir,
    recentMuscleRir,
    recentRunRir,
  } = inputs;

  if (item.sport === 'weightlifting' && program) {
    const projected: UserProgram = {
      ...program,
      current_block: item.block as UserProgram['current_block'],
      current_week: item.week,
    };
    const id = await createWeightliftingSession({
      uid,
      program: projected,
      maxes,
      zoneScore,
      recentRir,
      dayOfWeek: item.day,
      queueKey: item.key,
    });
    return { pathname: '/(app)/session/[id]', params: { id } };
  }

  if (item.sport === 'running' && runningProfile && item.runningType) {
    const paces = calculateVDOTPaces(runningProfile.vdot);
    const level =
      runningProfile.vdot < 35 ? 'beginner' : runningProfile.vdot < 55 ? 'intermediate' : 'advanced';
    const plan = buildSessionPlan({
      type: item.runningType,
      paces,
      level,
      block: 1,
      week: 1,
      paceFactor: runningPaceFactor(recentRunRir),
      withStrides: item.runningWithStrides,
      recovery: item.runningRecovery,
      goalDistance: runningProfile.reference_distance ?? undefined,
      goalTimeSeconds: runningProfile.goal_time_seconds ?? undefined,
    });
    const id = await createRunSession(uid, {
      date: todayDateString(),
      session_type: plan.type,
      steps: plan.steps.map((s) => ({
        kind: s.kind,
        label: s.label,
        duration_seconds: s.durationSeconds,
        target_pace_sec_per_km: s.targetPaceSecPerKm,
        distance_meters: s.distanceMeters,
      })),
      estimated_duration_min: plan.estimatedDurationMin,
      estimated_distance_km: plan.estimatedDistanceKm,
      zone_score_at_start: zoneScore,
      zone_message: plan.message,
      queue_key: item.key,
    });
    return { pathname: '/(app)/run-session/[id]', params: { id } };
  }

  if (item.sport === 'musculation' && muscleProfile) {
    const generated = generateMuscleSession({
      sessionsPerWeek: muscleProfile.sessions_per_week,
      dayOfWeek: item.day,
      goal: muscleProfile.goal,
      weakPoints: (muscleProfile.weak_points ?? []) as MuscleGroup[],
      zoneScore,
      recentRir: recentMuscleRir,
    });
    const deloadActive = muscleProfile.deload_active === true;
    const planned: SessionExercise[] = generated.exercises.map((ex) => ({
      exercise_id: ex.exercise_id,
      sets: deloadActive ? ex.sets.slice(0, Math.max(1, Math.ceil(ex.sets.length / 2))) : ex.sets,
    }));
    const id = await createPlannedSession(uid, {
      date: todayDateString(),
      sport_key: 'weightlifting',
      discipline: 'musculation',
      planned_exercises: planned,
      zone_score_at_start: zoneScore,
      zone_message: deloadActive
        ? 'Semaine de décharge · volume réduit, charges maintenues.'
        : generated.message,
      queue_key: item.key,
    });
    return { pathname: '/(app)/muscle-session/[id]', params: { id } };
  }

  if (item.sport === 'hyrox' && hyroxProfile && item.hyroxType) {
    return {
      pathname: '/(app)/hyrox-session/[id]',
      params: {
        id: 'new',
        type: item.hyroxType,
        block: String(item.block),
        queueKey: item.key,
      },
    };
  }

  return null;
}
