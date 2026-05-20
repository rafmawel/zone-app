import { getUserProgram, getUserSports, saveUserProgram, todayDateString } from './firestore';
import type { ProgramSport, UserSport } from './firestore';

const SPORT_KEY_MAP: Record<string, ProgramSport> = {
  halterophilie: 'weightlifting',
  course: 'running',
};

export async function initializeUserProgram(uid: string): Promise<void> {
  const existing = await getUserProgram(uid);
  if (existing) return;

  let sports: UserSport[] = [];
  try {
    sports = await getUserSports(uid);
  } catch {
    sports = [];
  }
  const first = sports.find((s) => s.sport_key === 'halterophilie') ?? sports[0];

  const sportKey: ProgramSport = first ? (SPORT_KEY_MAP[first.sport_key] ?? 'weightlifting') : 'weightlifting';
  const level = first?.level ?? 'debutant';
  const goal = first?.goal ?? 'forme_generale';
  const equipment = first?.equipment ?? 'barre_disques';
  const sessions = first?.sessions_per_week ?? 3;

  await saveUserProgram(uid, {
    uid,
    sport_key: sportKey,
    current_block: 1,
    current_week: 1,
    current_day: 1,
    mesocycle_start: todayDateString(),
    sessions_per_week: sessions,
    level,
    goal,
    equipment,
  });
}
