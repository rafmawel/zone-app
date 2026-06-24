/**
 * One-off fix for the affected user's weightlifting state: the 1st session of
 * week 4 was wrongly counted into week 3 (4/3). Set the correct week-4 state.
 *
 * Queue (state/programme_queue):
 *   items.weightlifting_b1_w3_s1..s3 = completed
 *   items.weightlifting_b1_w4_s1/s2  = completed
 *   items.weightlifting_b1_w4_s3     = removed -> available
 *   weightlifting_current_week                = 4
 *   weightlifting_week_3_completed_sessions   = 3   (was 4)
 *   weightlifting_week_3_planned_sessions     = 3
 *   weightlifting_week_4_completed_sessions   = 2
 *   weightlifting_week_4_planned_sessions     = 3
 *
 * Program (state/program) — single source of truth post-fix:
 *   current_block = 1, current_week = 4, mesocycle_start_block = 1
 *
 * Other fields (running, etc.) untouched. DRY RUN by default; --apply to write.
 *
 * Usage:
 *   ZONE_EMAIL="…" ZONE_PASSWORD="…" node scripts/fix-weightlifting-week4.mjs
 *   ZONE_EMAIL="…" ZONE_PASSWORD="…" node scripts/fix-weightlifting-week4.mjs --apply
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

const COMPLETED_ITEMS = [
  'weightlifting_b1_w3_s1',
  'weightlifting_b1_w3_s2',
  'weightlifting_b1_w3_s3',
  'weightlifting_b1_w4_s1',
  'weightlifting_b1_w4_s2',
];
const REMOVE_ITEMS = ['weightlifting_b1_w4_s3'];
const QUEUE_SCALARS = {
  weightlifting_current_week: 4,
  weightlifting_week_3_completed_sessions: 3,
  weightlifting_week_3_planned_sessions: 3,
  weightlifting_week_4_completed_sessions: 2,
  weightlifting_week_4_planned_sessions: 3,
};
const PROGRAM_PATCH = { current_block: 1, current_week: 4, mesocycle_start_block: 1 };

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
  const programRef = doc(db, 'users', uid, 'state', 'program');
  const [queueSnap, programSnap] = await Promise.all([getDoc(queueRef), getDoc(programRef)]);

  console.log('\n=== Current weightlifting queue ===');
  if (queueSnap.exists()) {
    const data = queueSnap.data();
    const items = data.items ?? {};
    Object.keys(items).filter((k) => k.startsWith('weightlifting')).sort()
      .forEach((k) => console.log(`  items.${k} -> ${items[k]?.status ?? '?'}`));
    Object.keys(data).filter((k) => k.startsWith('weightlifting_')).sort()
      .forEach((k) => console.log(`  ${k} = ${JSON.stringify(data[k])}`));
  } else {
    console.log('  (programme_queue does not exist)');
  }
  console.log('\n=== Current state/program ===');
  console.log(programSnap.exists() ? JSON.stringify({
    current_block: programSnap.data().current_block,
    current_week: programSnap.data().current_week,
    mesocycle_start_block: programSnap.data().mesocycle_start_block,
  }) : '  (state/program does not exist)');

  console.log('\n=== Target ===');
  COMPLETED_ITEMS.forEach((k) => console.log(`  items.${k} -> completed`));
  REMOVE_ITEMS.forEach((k) => console.log(`  items.${k} -> (removed → available)`));
  Object.entries(QUEUE_SCALARS).forEach(([k, v]) => console.log(`  ${k} = ${v}`));
  Object.entries(PROGRAM_PATCH).forEach(([k, v]) => console.log(`  program.${k} = ${v}`));

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
  for (const k of REMOVE_ITEMS) queueUpdate[`items.${k}`] = deleteField();
  await updateDoc(queueRef, queueUpdate);
  console.log('\n✓ programme_queue patched.');

  if (programSnap.exists()) {
    await updateDoc(programRef, { ...PROGRAM_PATCH, updated_at: serverTimestamp() });
    console.log('✓ state/program aligned (block 1 · week 4).');
  } else {
    console.warn('state/program missing — run recreate-weightlifting-program.mjs first.');
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFailed:', err?.message ?? err);
  process.exit(1);
});
