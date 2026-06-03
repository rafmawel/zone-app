import {
  createPlannedSession,
  todayDateString,
  type ExerciseMax,
  type UserProgram,
} from './firestore';
import { generateWeeklySession, rirIntensityDelta } from './programEngine';

export interface CreateWeightliftingOptions {
  uid: string;
  program: UserProgram;
  maxes: ExerciseMax[];
  zoneScore: number | null;
  recentRir: number[];
  /** 1-based session of the week (A/B/C). Defaults to the programme's day. */
  dayOfWeek?: number;
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
  });
}
