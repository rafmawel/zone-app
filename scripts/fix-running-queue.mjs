/**
 * One-off fix for the affected user's RUNNING queue after switching to
 * 2 sessions/week. The old 3-session structure left stale completed/skipped
 * item flags and week counters that no longer match, so the Programme tab
 * showed sessions out of sync. Reset running to a clean "week 1, 1 of 2 done":
 *
 *   running_profile.sessions_per_week     = 2   (align config with the target)
 *   items.running_b1_w1_s1                = completed   (EF + foulées done)
 *   items.running_b1_w1_s2                = (removed → available, the SL 60 min)
 *   every other items.running*            = (removed — stale 3-session leftovers)
 *   running_current_week                  = 1
 *   running_week_1_planned_sessions       = 2
 *   running_week_1_completed_sessions     = 1
 *   every other running_week_*            = (removed — stale counters)
 *
 * Weightlifting / other sports are untouched. DRY RUN by default; --apply to write.
 *
 * Usage:
 *   ZONE_EMAIL="…" ZONE_PASSWORD="…" node scripts/fix-running-queue.mjs
 *   ZONE_EMAIL="…" ZONE_PASSWORD="…" node scripts/fix-running-queue.mjs --apply
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

// The single running item to keep, marked completed (the EF + strides done).
const KEEP_COMPLETED = 'running_b1_w1_s1';
// Desired weekly frequency. Drives queue regeneration (2 sessions: EF_strides + SL).
const SESSIONS_PER_WEEK = 2;
const QUEUE_SCALARS = {
  running_current_week: 1,
  running_week_1_planned_sessions: 2,
  running_week_1_completed_sessions: 1,
};

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
  // Every running item flag currently persisted (the 3-session leftovers).
  const runningItemKeys = Object.keys(items)
    .filter((k) => k.startsWith('running'))
    .sort();
  // Stale top-level week counters (any running_week_N_* not in the target set).
  const staleWeekKeys = Object.keys(data)
    .filter((k) => /^running_week_\d+_/.test(k) && !(k in QUEUE_SCALARS))
    .sort();

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
  console.log('\n=== Current running_profile.sessions_per_week ===');
  console.log(runSnap.exists() ? `  ${JSON.stringify(runSnap.data().sessions_per_week)}` : '  (running_profile does not exist)');

  console.log('\n=== Target ===');
  console.log(`  items.${KEEP_COMPLETED} -> completed`);
  runningItemKeys
    .filter((k) => k !== KEEP_COMPLETED)
    .forEach((k) => console.log(`  items.${k} -> (removed → available/locked at runtime)`));
  Object.entries(QUEUE_SCALARS).forEach(([k, v]) => console.log(`  ${k} = ${v}`));
  staleWeekKeys.forEach((k) => console.log(`  ${k} -> (removed)`));
  console.log(`  running_profile.sessions_per_week = ${SESSIONS_PER_WEEK}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to persist.');
    process.exit(0);
  }

  if (!queueSnap.exists()) {
    console.error('\nprogramme_queue missing — cannot patch queue. Aborting.');
    process.exit(2);
  }

  const queueUpdate = { updated_at: serverTimestamp(), ...QUEUE_SCALARS };
  queueUpdate[`items.${KEEP_COMPLETED}`] = { status: 'completed', completedAt: serverTimestamp() };
  for (const k of runningItemKeys) {
    if (k !== KEEP_COMPLETED) queueUpdate[`items.${k}`] = deleteField();
  }
  for (const k of staleWeekKeys) queueUpdate[k] = deleteField();
  await updateDoc(queueRef, queueUpdate);
  console.log('\n✓ programme_queue running state reset (week 1 · 1/2 done).');

  if (runSnap.exists()) {
    await updateDoc(runRef, { sessions_per_week: SESSIONS_PER_WEEK, updated_at: serverTimestamp() });
    console.log('✓ running_profile.sessions_per_week = 2.');
  } else {
    console.warn('running_profile missing — sessions_per_week not set. Configure the sport first.');
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFailed:', err?.message ?? err);
  process.exit(1);
});
