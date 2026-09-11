import {
  createPlannedSession,
  getExerciseMaxes,
  getUserProgram,
  getUserSports,
  saveUserProgram,
  todayDateString,
} from './firestore';
import type { ProgramSport, UserProgram, UserSport } from './firestore';
import { generateWeeklySession } from './programEngine';

const SPORT_KEY_MAP: Record<string, ProgramSport> = {
  halterophilie: 'weightlifting',
  course: 'running',
};

export async function initializeUserProgram(uid: string): Promise<UserProgram> {
  const existing = await getUserProgram(uid);
  if (existing) return existing;

  let sports: UserSport[] = [];
  try {
    sports = await getUserSports(uid);
  } catch {
    sports = [];
  }
  const first = sports.find((s) => s.sport_key === 'halterophilie') ?? sports[0];

  const sportKey: ProgramSport = first
    ? (SPORT_KEY_MAP[first.sport_key] ?? 'weightlifting')
    : 'weightlifting';
  const level = first?.level ?? 'debutant';
  const goal = first?.goal ?? 'forme_generale';
  const equipment = first?.equipment ?? 'barre_disques';
  const sessions = first?.sessions_per_week ?? 3;

  // Snapshot the athlete's known 1RMs so the first end-of-mesocycle bilan can
  // show progression (best-effort — empty when no maxes are set yet).
  const startMaxes: Record<string, number> = {};
  try {
    const maxes = await getExerciseMaxes(uid);
    for (const m of maxes) startMaxes[m.exercise_id] = m.estimated_1rm;
  } catch {
    // best effort — leave the snapshot empty
  }

  const program: UserProgram = {
    uid,
    sport_key: sportKey,
    current_block: 1,
    current_week: 1,
    current_day: 1,
    mesocycle_start: todayDateString(),
    mesocycle_start_block: 1,
    mesocycles_completed: 0,
    mesocycle_start_maxes: startMaxes,
    sessions_per_week: sessions,
    level,
    goal,
    equipment,
    created_at: null,
    updated_at: null,
  };

  await saveUserProgram(uid, program);
  return program;
}

export async function ensureFirstPlannedSession(
  uid: string,
  program: UserProgram,
  zoneScore: number | null,
): Promise<void> {
  const maxes = await getExerciseMaxes(uid);
  const generated = generateWeeklySession({
    program,
    maxes,
    dayOfWeek: program.current_day,
    zoneScore,
  });
  await createPlannedSession(uid, {
    date: todayDateString(),
    sport_key: program.sport_key,
    planned_exercises: generated.exercises,
    zone_score_at_start: zoneScore,
    zone_message: generated.message,
  });
}
