/**
 * Reset the affected user's RUNNING queue after an objective change
 * (e.g. semi-marathon → 5k). Wipes every running queue item and stale week
 * counter and puts the athlete back at week 1, so the engine regenerates the
 * whole queue with the NEW goal (read from running_profile.goal) on next load.
 *
 *   items.running_b*_w*_s*             -> (all removed → regenerated at runtime)
 *   running_current_week               = 1
 *   running_week_1_completed_sessions  = 0
 *   running_week_1_planned_sessions    = running_profile.sessions_per_week (2-6, fallback 3)
 *   every other running_week_*         -> (removed — stale counters)
 *
 * Weightlifting / other sports are untouched. This does NOT change the goal
 * itself — set running_profile.goal in the app first, then run this to clear
 * the old queue. DRY RUN by default; --apply to write.
 *
 * Usage:
 *   ZONE_EMAIL="…" ZONE_PASSWORD="…" node scripts/reset-running-queue.mjs
 *   ZONE_EMAIL="…" ZONE_PASSWORD="…" node scripts/reset-running-queue.mjs --apply
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, updateDoc, deleteField, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyB3qb-HWBYcf-bYmt8vOyzHVCx5Nc7W0Wo',
  authDomain: 'zone-app-cc098.firebaseapp.com',
  projectId: 'zone-app-cc098',
  storageBucket: 'zone-app-cc098.firebasestorage.app',
  messagingSenderId: '771528959241',
  appId: '1:771528959241:web:f1154cb4f5b62d73309fd8',
};

const TARGET_UID = 'lKVIeyKxWQPvhWMah6JbQjvZoD52';
const APPLY = process.argv.includes('--apply');
const email = process.env.ZONE_EMAIL;
const password = process.env.ZONE_PASSWORD;

if (!email || !password) {
  console.error('Set ZONE_EMAIL and ZONE_PASSWORD env vars (the account to repair).');
  process.exit(1);
}

const clampSessions = (v) => Math.max(2, Math.min(6, Number.isFinite(v) ? Math.round(v) : 3));

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const cred = await signInWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  console.log(`Signed in. uid=${uid}`);
  if (uid !== TARGET_UID) {
    console.warn(`\n⚠️  Signed-in uid ≠ target ${TARGET_UID}; acting on ${uid} (rules allow own data only).`);
  }

  const queueRef = doc(db, 'users', uid, 'state', 'programme_queue');
  const runRef = doc(db, 'users', uid, 'state', 'running_profile');
  const [queueSnap, runSnap] = await Promise.all([getDoc(queueRef), getDoc(runRef)]);

  const data = queueSnap.exists() ? queueSnap.data() : {};
  const items = data.items ?? {};

  const runningItemKeys = Object.keys(items).filter((k) => k.startsWith('running')).sort();
  const plannedKeep = new Set(['running_week_1_completed_sessions', 'running_week_1_planned_sessions']);
  const staleWeekKeys = Object.keys(data)
    .filter((k) => /^running_week_\d+_/.test(k) && !plannedKeep.has(k))
    .sort();

  const sessionsPerWeek = clampSessions(runSnap.exists() ? runSnap.data().sessions_per_week : undefined);
  const goal = runSnap.exists() ? runSnap.data().goal : '(running_profile missing)';

  console.log('\n=== Current running queue items ===');
  if (runningItemKeys.length) {
    runningItemKeys.forEach((k) => console.log(`  items.${k} -> ${items[k]?.status ?? '?'}`));
  } else {
    console.log('  (no running items)');
  }
  console.log('\n=== Current running_* scalars ===');
  Object.keys(data)
    .filter((k) => k.startsWith('running_'))
    .sort()
    .forEach((k) => console.log(`  ${k} = ${JSON.stringify(data[k])}`));
  console.log(`\nrunning_profile.goal = ${JSON.stringify(goal)}, sessions_per_week = ${sessionsPerWeek}`);

  console.log('\n=== Target ===');
  runningItemKeys.forEach((k) => console.log(`  items.${k} -> (removed → regenerated at runtime)`));
  console.log('  running_current_week = 1');
  console.log('  running_week_1_completed_sessions = 0');
  console.log(`  running_week_1_planned_sessions = ${sessionsPerWeek}`);
  staleWeekKeys.forEach((k) => console.log(`  ${k} -> (removed)`));

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to persist.');
    process.exit(0);
  }

  if (!queueSnap.exists()) {
    console.error('\nprogramme_queue missing — cannot patch queue. Aborting.');
    process.exit(2);
  }

  const update = {
    updated_at: serverTimestamp(),
    running_current_week: 1,
    running_week_1_completed_sessions: 0,
    running_week_1_planned_sessions: sessionsPerWeek,
  };
  for (const k of runningItemKeys) update[`items.${k}`] = deleteField();
  for (const k of staleWeekKeys) update[k] = deleteField();
  await updateDoc(queueRef, update);
  console.log('\n✓ programme_queue running state reset to week 1 (queue regenerates with the new goal).');
  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFailed:', err?.message ?? err);
  process.exit(1);
});
