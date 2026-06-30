/**
 * One-off fix for the affected user's RUNNING queue (2 sessions/week). The old
 * 3-session structure and out-of-order completions left stale item flags and
 * week counters that no longer match. Reset running to: weeks 1-2 done, now on
 * week 3 (fresh).
 *
 *   running_profile.sessions_per_week   = 2   (align config with the target)
 *
 *   items.running_b1_w1_s1              = completed
 *   items.running_b1_w1_s2             = completed
 *   items.running_b1_w2_s1             = completed
 *   items.running_b1_w2_s2             = skipped
 *   items.running_b1_w3_s1             = (removed → available, regenerated)
 *   items.running_b1_w3_s2             = (removed → available, regenerated)
 *   every other items.running*         = (removed — stale leftovers)
 *
 *   running_current_week               = 3
 *   running_week_1_completed_sessions  = 2
 *   running_week_1_planned_sessions    = 2
 *   running_week_2_completed_sessions  = 1
 *   running_week_2_planned_sessions    = 2
 *   running_week_2_skipped_sessions    = 1
 *   running_week_3_completed_sessions  = 0
 *   running_week_3_planned_sessions    = 2
 *   every other running_week_*         = (removed — stale counters)
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

// Desired weekly frequency. Drives queue regeneration (2 sessions: EF_strides + SL).
const SESSIONS_PER_WEEK = 2;
const COMPLETED_ITEMS = [
  'running_b1_w1_s1',
  'running_b1_w1_s2',
  'running_b1_w2_s1',
];
const SKIPPED_ITEMS = ['running_b1_w2_s2'];
// Explicitly cleared so they regenerate as available at runtime, even if no
// flag is currently persisted for them.
const AVAILABLE_ITEMS = ['running_b1_w3_s1', 'running_b1_w3_s2'];
const QUEUE_SCALARS = {
  running_current_week: 3,
  running_week_1_completed_sessions: 2,
  running_week_1_planned_sessions: 2,
  running_week_2_completed_sessions: 1,
  running_week_2_planned_sessions: 2,
  running_week_2_skipped_sessions: 1,
  running_week_3_completed_sessions: 0,
  running_week_3_planned_sessions: 2,
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

  // Keep the explicitly-set items; every other running item flag is stale.
  const keep = new Set([...COMPLETED_ITEMS, ...SKIPPED_ITEMS]);
  const removeSet = new Set(AVAILABLE_ITEMS);
  Object.keys(items)
    .filter((k) => k.startsWith('running') && !keep.has(k))
    .forEach((k) => removeSet.add(k));
  const removeItemKeys = [...removeSet].sort();

  // Stale top-level week counters (any running_week_N_* not in the target set).
  const staleWeekKeys = Object.keys(data)
    .filter((k) => /^running_week_\d+_/.test(k) && !(k in QUEUE_SCALARS))
    .sort();

  console.log('\n=== Current running queue items ===');
  const curRunningItems = Object.keys(items).filter((k) => k.startsWith('running')).sort();
  if (curRunningItems.length) {
    curRunningItems.forEach((k) => console.log(`  items.${k} -> ${items[k]?.status ?? '?'}`));
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
  COMPLETED_ITEMS.forEach((k) => console.log(`  items.${k} -> completed`));
  SKIPPED_ITEMS.forEach((k) => console.log(`  items.${k} -> skipped`));
  removeItemKeys.forEach((k) => console.log(`  items.${k} -> (removed → available/locked at runtime)`));
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
  for (const k of COMPLETED_ITEMS) queueUpdate[`items.${k}`] = { status: 'completed', completedAt: serverTimestamp() };
  for (const k of SKIPPED_ITEMS) queueUpdate[`items.${k}`] = { status: 'skipped', skippedAt: serverTimestamp() };
  for (const k of removeItemKeys) queueUpdate[`items.${k}`] = deleteField();
  for (const k of staleWeekKeys) queueUpdate[k] = deleteField();
  await updateDoc(queueRef, queueUpdate);
  console.log('\n✓ programme_queue running state reset (weeks 1-2 done · now on week 3).');

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
