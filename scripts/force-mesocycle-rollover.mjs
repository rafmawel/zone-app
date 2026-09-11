/**
 * Manually trigger a mesocycle rollover for a single user, replicating the
 * logic of `finalizeMesocycle` (src/lib/mesocycle.ts) in plain JS against the
 * Firebase client SDK.
 *
 * It:
 *   1. increments `mesocycles_completed`,
 *   2. re-detects the level via `detectLevel` (bodyweight 82 kg), never
 *      downgrading below the current level (`higherLevel`),
 *   3. detects weak points via `detectWeakPoints`,
 *   4. resets `state/program`: current_block=1, current_week=1, current_day=1,
 *      mesocycle_start = today, mesocycle_start_block=1, and stores the
 *      start-of-cycle 1RM snapshot,
 *   5. clears the `weightlifting_*` entries from `state/programme_queue`
 *      (per-week fields, the current-week pointer, and the item keys),
 *   6. saves the mesocycle bilan (`state/mesocycle_bilan`).
 *
 * NOTE — unlike the in-app rollover, `mesocycle_start` is set to TODAY (not
 * tomorrow): there is no session-just-finished to avoid recounting here.
 *
 * Firestore security rules only allow a user to write their OWN data, so sign
 * in AS the target account. The script refuses to write on a uid mismatch.
 *
 * Dry run by default (prints every intended change, writes nothing); pass
 * `--apply` to perform the writes.
 *
 * Usage (Node 18+, from the repo root):
 *   ZONE_EMAIL="you@example.com" ZONE_PASSWORD="…" node scripts/force-mesocycle-rollover.mjs
 *   ZONE_EMAIL="you@example.com" ZONE_PASSWORD="…" node scripts/force-mesocycle-rollover.mjs --apply
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyB3qb-HWBYcf-bYmt8vOyzHVCx5Nc7W0Wo',
  authDomain: 'zone-app-cc098.firebaseapp.com',
  projectId: 'zone-app-cc098',
  storageBucket: 'zone-app-cc098.firebasestorage.app',
  messagingSenderId: '771528959241',
  appId: '1:771528959241:web:f1154cb4f5b62d73309fd8',
};

const TARGET_UID = 'lKVIeyKxWQPvhWMah6JbQjvZoD52';
const BODYWEIGHT_KG = 82;
const PROGRESSION_LIFTS = ['snatch', 'clean_and_jerk', 'front_squat', 'strict_press'];

// ── Pure logic mirrored from src/lib/programEngine.ts ───────────────────────
const DEFAULT_BODYWEIGHT_KG = 75;

function levelTier(level) {
  if (level === 'avance' || level === 'confirme') return 'advanced';
  if (level === 'intermediaire') return 'intermediate';
  return 'beginner';
}

function detectLevel(snatchMax, bodyweightKg, mesocyclesCompleted) {
  const bw = bodyweightKg > 0 ? bodyweightKg : DEFAULT_BODYWEIGHT_KG;
  const ratio = snatchMax / bw;
  if (ratio < 0.65 || mesocyclesCompleted < 3) return 'debutant';
  if (ratio < 0.95) return 'intermediaire';
  return 'avance';
}

const LEVEL_RANK = { debutant: 0, intermediaire: 1, avance: 2, confirme: 3 };

/** Never downgrade a re-detected level below the athlete's current level. */
function higherLevel(a, b) {
  return (LEVEL_RANK[a] ?? 0) >= (LEVEL_RANK[b] ?? 0) ? a : b;
}

const WEAKPOINT_STALE_DAYS = 42; // 6 weeks
const WEAK_POINTS = ['legs', 'snatch_technique', 'pull_strength', 'overhead_strength'];
const WEAK_POINT_LIFTS = {
  legs: ['clean_and_jerk', 'front_squat'],
  snatch_technique: ['clean_and_jerk', 'snatch'],
  pull_strength: ['snatch', 'snatch_pull'],
  overhead_strength: ['clean_and_jerk', 'strict_press'],
};

function daysSince(dateStr, now) {
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 86400000));
}

/** Present (>0) and — when a date is known — not older than 6 weeks. */
function isMaxUsable(id, maxes, maxesWithDates, now) {
  if ((maxes[id] ?? 0) <= 0) return false;
  if (!maxesWithDates) return true;
  const d = maxesWithDates[id];
  if (!d) return true;
  return daysSince(d, now) <= WEAKPOINT_STALE_DAYS;
}

function weakPointPresent(key, maxes) {
  const clean = maxes.clean_and_jerk ?? 0;
  const snatch = maxes.snatch ?? 0;
  const frontSquat = maxes.front_squat ?? 0;
  const snatchPull = maxes.snatch_pull ?? 0;
  const strictPress = maxes.strict_press ?? 0;
  switch (key) {
    case 'legs':
      return frontSquat / clean < 1.0;
    case 'snatch_technique':
      return snatch / clean < 0.75;
    case 'pull_strength':
      return snatchPull / snatch < 1.05;
    case 'overhead_strength':
      return strictPress / clean < 0.55;
    default:
      return false;
  }
}

/** Stale-aware weak-point detection (a max older than 6 weeks is ignored). */
function detectWeakPoints(maxes, maxesWithDates) {
  const now = Date.now();
  const weak = [];
  for (const key of WEAK_POINTS) {
    const usable = WEAK_POINT_LIFTS[key].every((id) => isMaxUsable(id, maxes, maxesWithDates, now));
    if (usable && weakPointPresent(key, maxes)) weak.push(key);
  }
  return weak;
}

/** Weak points not evaluated because a required max is stale (present but old). */
function staleWeakPoints(maxes, maxesWithDates) {
  const now = Date.now();
  const out = [];
  for (const key of WEAK_POINTS) {
    const lifts = WEAK_POINT_LIFTS[key];
    if (lifts.every((id) => isMaxUsable(id, maxes, maxesWithDates, now))) continue;
    const staleId = lifts.find(
      (id) =>
        (maxes[id] ?? 0) > 0 &&
        maxesWithDates[id] &&
        daysSince(maxesWithDates[id], now) > WEAKPOINT_STALE_DAYS,
    );
    if (staleId) {
      out.push({
        weak_point: key,
        exercise_id: staleId,
        weeks_ago: Math.floor(daysSince(maxesWithDates[staleId], now) / 7),
      });
    }
  }
  return out;
}

const LEVEL_BLOCK_EXERCISES = {
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

function exercisesForLevel(level) {
  const tier = levelTier(level);
  const out = new Set();
  for (const block of [1, 2, 3]) {
    for (const session of LEVEL_BLOCK_EXERCISES[tier][block]) {
      for (const id of session) out.add(id);
    }
  }
  return [...out];
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Replicates weekTracking.resetSportWeek(uid, 'weightlifting') on a doc. */
function clearWeightliftingQueue(data) {
  const weekKeyPattern = /^weightlifting_week_\d+_/;
  const currentWeekKey = 'weightlifting_current_week';
  const itemKeyPattern = /^weightlifting_(?:b\d+_)?w\d+_s\d+$/;
  const remaining = {};
  const removedItems = [];
  for (const [k, v] of Object.entries(data)) {
    if (k === currentWeekKey || weekKeyPattern.test(k)) continue;
    if (k === 'items' && v && typeof v === 'object') {
      const filtered = {};
      for (const [ik, iv] of Object.entries(v)) {
        if (itemKeyPattern.test(ik)) removedItems.push(ik);
        else filtered[ik] = iv;
      }
      remaining[k] = filtered;
      continue;
    }
    remaining[k] = v;
  }
  return { remaining, removedItems };
}

const apply = process.argv.includes('--apply');
const email = process.env.ZONE_EMAIL;
const password = process.env.ZONE_PASSWORD;

if (!email || !password) {
  console.error('Set ZONE_EMAIL and ZONE_PASSWORD env vars (the target account).');
  process.exit(1);
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const cred = await signInWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  console.log(`Signed in. uid=${uid}`);
  if (uid !== TARGET_UID) {
    console.error(
      `\n✋ Signed-in uid (${uid}) ≠ target uid (${TARGET_UID}).\n` +
        'Firestore rules only allow writing your own data — sign in as the target account.',
    );
    process.exit(1);
  }

  // ── Read current state ────────────────────────────────────────────────────
  const programRef = doc(db, 'users', uid, 'state', 'program');
  const programSnap = await getDoc(programRef);
  if (!programSnap.exists()) {
    console.error('\n✋ No state/program document — nothing to roll over.');
    process.exit(1);
  }
  const program = programSnap.data();

  const profileSnap = await getDoc(doc(db, 'users', uid));
  const profileBw = profileSnap.exists() ? (profileSnap.data().bodyweight_kg ?? null) : null;

  const maxesSnap = await getDocs(collection(db, 'users', uid, 'maxes'));
  const after = {};
  const afterDates = {};
  for (const d of maxesSnap.docs) {
    const m = d.data();
    const id = m.exercise_id ?? d.id;
    if (typeof m.estimated_1rm === 'number') after[id] = m.estimated_1rm;
    if (m.date) afterDates[id] = m.date;
  }
  const before = program.mesocycle_start_maxes ?? {};

  const queueRef = doc(db, 'users', uid, 'state', 'programme_queue');
  const queueSnap = await getDoc(queueRef);
  const queueData = queueSnap.exists() ? queueSnap.data() : {};

  // ── Compute the rollover (mirror finalizeMesocycle) ───────────────────────
  const bodyweight = profileBw && profileBw > 0 ? profileBw : BODYWEIGHT_KG;
  const snatch1RM = after.snatch ?? 0;
  const mesocycleNumber = (program.mesocycles_completed ?? 0) + 1;
  const detected = detectLevel(snatch1RM, bodyweight, mesocycleNumber);
  const newLevel = higherLevel(detected, program.level);
  const weakPoints = detectWeakPoints(after, afterDates);
  const unevaluated = staleWeakPoints(after, afterDates);
  const oldPool = new Set(exercisesForLevel(program.level));
  const newExercises = exercisesForLevel(newLevel).filter((id) => !oldPool.has(id));
  const progression = PROGRESSION_LIFTS.filter((id) => (after[id] ?? 0) > 0).map((id) => ({
    exercise_id: id,
    before: before[id] ?? 0,
    after: after[id] ?? 0,
  }));

  const bilan = {
    mesocycle_number: mesocycleNumber,
    level: newLevel,
    snatch_ratio: bodyweight > 0 ? Math.round((snatch1RM / bodyweight) * 100) / 100 : 0,
    bodyweight_kg: bodyweight,
    weak_points: weakPoints,
    unevaluated_weak_points: unevaluated,
    progression,
    new_exercises: newExercises,
  };

  const nextProgram = {
    ...program,
    level: newLevel,
    current_block: 1,
    current_week: 1,
    current_day: 1,
    mesocycle_start: todayStr(),
    mesocycle_start_block: 1,
    mesocycles_completed: mesocycleNumber,
    mesocycle_start_maxes: after,
  };

  const { remaining: cleanedQueue, removedItems } = clearWeightliftingQueue(queueData);

  // ── Report ────────────────────────────────────────────────────────────────
  console.log('\n=== CURRENT state/program ===');
  console.log(
    JSON.stringify(
      {
        level: program.level,
        current_block: program.current_block,
        current_week: program.current_week,
        current_day: program.current_day,
        mesocycle_start: program.mesocycle_start,
        mesocycles_completed: program.mesocycles_completed ?? 0,
      },
      null,
      2,
    ),
  );
  console.log(`\nBodyweight used: ${bodyweight} kg${profileBw ? ' (from profile)' : ' (default 82)'}`);
  console.log(`Snatch 1RM: ${snatch1RM} kg · ratio ${bilan.snatch_ratio}`);
  console.log(`detectLevel → ${detected} · after no-downgrade → ${newLevel}`);
  console.log(`Weak points: ${weakPoints.length ? weakPoints.join(', ') : '(none)'}`);
  console.log(
    `Unevaluated (stale max): ${
      unevaluated.length
        ? unevaluated.map((u) => `${u.weak_point}←${u.exercise_id} (${u.weeks_ago}w)`).join(', ')
        : '(none)'
    }`,
  );
  console.log(`New exercises unlocked: ${newExercises.length ? newExercises.join(', ') : '(none)'}`);

  console.log('\n=== NEXT state/program (to write) ===');
  console.log(
    JSON.stringify(
      {
        level: nextProgram.level,
        current_block: nextProgram.current_block,
        current_week: nextProgram.current_week,
        current_day: nextProgram.current_day,
        mesocycle_start: nextProgram.mesocycle_start,
        mesocycle_start_block: nextProgram.mesocycle_start_block,
        mesocycles_completed: nextProgram.mesocycles_completed,
      },
      null,
      2,
    ),
  );

  console.log('\n=== state/mesocycle_bilan (to write) ===');
  console.log(JSON.stringify(bilan, null, 2));

  console.log('\n=== state/programme_queue cleanup ===');
  console.log(`Weightlifting item keys to remove: ${removedItems.length}`);
  removedItems.sort().forEach((k) => console.log(`  − ${k}`));

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write.');
    process.exit(0);
  }

  // ── Apply (queue → bilan → program, mirroring finalizeMesocycle order) ─────
  await setDoc(queueRef, cleanedQueue);
  console.log('\n✅ Cleared weightlifting entries from state/programme_queue.');

  await setDoc(doc(db, 'users', uid, 'state', 'mesocycle_bilan'), {
    ...bilan,
    created_at: serverTimestamp(),
  });
  console.log('✅ Wrote state/mesocycle_bilan.');

  await setDoc(programRef, {
    ...nextProgram,
    created_at: nextProgram.created_at ?? serverTimestamp(),
    updated_at: serverTimestamp(),
  });
  console.log('✅ Rolled state/program into the next mesocycle.');

  console.log(`\n✅ Done. Mesocycle ${mesocycleNumber} closed; level=${newLevel}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFailed:', err?.message ?? err);
  process.exit(1);
});
