import {
  getExerciseMaxes,
  getUserProfile,
  saveMesocycleBilan,
  saveUserProgram,
  todayDateString,
  type MesocycleBilan,
  type UserProgram,
} from './firestore';
import { resetSportWeek } from './weekTracking';
import {
  DEFAULT_BODYWEIGHT_KG,
  detectLevel,
  detectWeakPoints,
  exercisesForLevel,
  higherLevel,
  startNextMesocycle,
} from './programEngine';

/** Lifts shown in the bilan's progression section (the ones we measure). */
const PROGRESSION_LIFTS = ['snatch', 'clean_and_jerk', 'front_squat', 'strict_press'];

/**
 * Finalize a completed mesocycle:
 *  1. compute the bilan (progression vs. the start-of-cycle snapshot, the new
 *     detected level, weak points, and exercises newly unlocked by that level),
 *  2. persist the bilan for the summary screen,
 *  3. roll the programme into the next mesocycle (re-anchored to tomorrow so the
 *     session that just closed the cycle isn't recounted into the new one),
 *  4. clear the weightlifting queue so block-1 / week-1 unlocks (its keys reuse
 *     the same block/week numbers, so stale "completed" statuses must be wiped).
 *
 * Returns the bilan for immediate display.
 */
export async function finalizeMesocycle(
  uid: string,
  program: UserProgram,
): Promise<Omit<MesocycleBilan, 'created_at'>> {
  // Read the freshest maxes so any PRs reconciled during the closing session
  // are reflected in the "after" values.
  const after: Record<string, number> = {};
  try {
    const maxes = await getExerciseMaxes(uid);
    for (const m of maxes) after[m.exercise_id] = m.estimated_1rm;
  } catch {
    // best effort — an empty "after" degrades the bilan gracefully
  }
  const before = program.mesocycle_start_maxes ?? {};

  let bodyweight = DEFAULT_BODYWEIGHT_KG;
  try {
    const profile = await getUserProfile(uid);
    if (profile?.bodyweight_kg && profile.bodyweight_kg > 0) bodyweight = profile.bodyweight_kg;
  } catch {
    // best effort — fall back to the default bodyweight
  }

  const snatch1RM = after.snatch ?? 0;
  const mesocycleNumber = (program.mesocycles_completed ?? 0) + 1;
  // Never downgrade: the "< 3 mesocycles → débutant" gate must not demote an
  // athlete who onboarded (or was already detected) at a higher level.
  const newLevel = higherLevel(
    detectLevel(snatch1RM, bodyweight, mesocycleNumber),
    program.level,
  );
  const weakPoints = detectWeakPoints(after);

  const oldPool = new Set(exercisesForLevel(program.level));
  const newExercises = exercisesForLevel(newLevel).filter((id) => !oldPool.has(id));

  const progression = PROGRESSION_LIFTS.filter((id) => (after[id] ?? 0) > 0).map((id) => ({
    exercise_id: id,
    before: before[id] ?? 0,
    after: after[id] ?? 0,
  }));

  const bilan: Omit<MesocycleBilan, 'created_at'> = {
    mesocycle_number: mesocycleNumber,
    level: newLevel,
    snatch_ratio: bodyweight > 0 ? Math.round((snatch1RM / bodyweight) * 100) / 100 : 0,
    bodyweight_kg: bodyweight,
    weak_points: weakPoints,
    progression,
    new_exercises: newExercises,
  };

  // Order matters for crash-safety. Roll the programme LAST: it re-anchors
  // `mesocycle_start` (to tomorrow, so today's closing session isn't recounted),
  // the only write that stops `isMesocycleComplete` from firing again. If an
  // earlier step throws, the rollover simply re-fires on the next session finish
  // and retries — rather than leaving the queue cleared but never rolled, or
  // rolled while the old completed keys still block the new cycle.

  // 1. Clear the weightlifting queue so the new cycle's block-1 sessions unlock
  //    (canonical keys reuse the same block/week numbers → they'd stay
  //    "completed"). Not swallowed: a failure must re-fire, not silently strand.
  await resetSportWeek(uid, 'weightlifting');

  // 2. Persist the bilan for the summary screen.
  await saveMesocycleBilan(uid, bilan);

  // 3. Commit the rollover.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const next = startNextMesocycle(program, newLevel, todayDateString(tomorrow), after);
  await saveUserProgram(uid, next);

  return bilan;
}
