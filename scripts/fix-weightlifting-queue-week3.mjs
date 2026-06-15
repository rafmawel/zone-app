/**
 * One-off fix: set the weightlifting queue to the exact week-3 state for the
 * affected user. The week-1/week-2 items keep their completed/skipped record,
 * and the week-3 items are REMOVED from the items map so the queue recomputes
 * them as `available` (only `completed`/`skipped` are ever stored; the runtime
 * derives available/locked).
 *
 * Target state:
 *   w1: skipped / completed / skipped
 *   w2: completed / completed / skipped
 *   w3: (no item)  -> available
 *   weightlifting_current_week = 3
 *   weightlifting_week_3_planned_sessions = 3
 *   weightlifting_week_3_completed_sessions = 0
 *
 * Every other field (running, etc.) is left untouched. DRY RUN by default;
 * pass `--apply` to write.
 *
 * Usage (Node 18+, from repo root):
 *   ZONE_EMAIL="…" ZONE_PASSWORD="…" node scripts/fix-weightlifting-queue-week3.mjs
 *   ZONE_EMAIL="…" ZONE_PASSWORD="…" node scripts/fix-weightlifting-queue-week3.mjs --apply
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

// status for the stored items (only completed/skipped are persisted).
const ITEMS = {
  weightlifting_b1_w1_s1: 'skipped',
  weightlifting_b1_w1_s2: 'completed',
  weightlifting_b1_w1_s3: 'skipped',
  weightlifting_b1_w2_s1: 'completed',
  weightlifting_b1_w2_s2: 'completed',
  weightlifting_b1_w2_s3: 'skipped',
};
const REMOVE_KEYS = ['weightlifting_b1_w3_s1', 'weightlifting_b1_w3_s2', 'weightlifting_b1_w3_s3'];
const SCALARS = {
  weightlifting_current_week: 3,
  weightlifting_week_3_planned_sessions: 3,
  weightlifting_week_3_completed_sessions: 0,
};

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const cred = await signInWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  console.log(`Signed in. uid=${uid}`);
  if (uid !== TARGET_UID) {
    console.warn(`\n⚠️  Signed-in uid ≠ target ${TARGET_UID}. Firestore rules only allow editing your own data; this will act on ${uid}.`);
  }

  const ref = doc(db, 'users', uid, 'state', 'programme_queue');
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    console.error('state/programme_queue does not exist. Aborting.');
    process.exit(2);
  }
  const data = snap.data();

  console.log('\n=== Current weightlifting queue ===');
  const curItems = data.items ?? {};
  Object.keys(curItems)
    .filter((k) => k.startsWith('weightlifting'))
    .sort()
    .forEach((k) => console.log(`  items.${k} -> ${curItems[k]?.status ?? '?'}`));
  Object.keys(data)
    .filter((k) => k.startsWith('weightlifting_'))
    .sort()
    .forEach((k) => console.log(`  ${k} = ${JSON.stringify(data[k])}`));

  console.log('\n=== Target ===');
  Object.entries(ITEMS).forEach(([k, v]) => console.log(`  items.${k} -> ${v}`));
  REMOVE_KEYS.forEach((k) => console.log(`  items.${k} -> (removed → available)`));
  Object.entries(SCALARS).forEach(([k, v]) => console.log(`  ${k} = ${v}`));

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to persist.');
    process.exit(0);
  }

  const update = {};
  for (const [k, status] of Object.entries(ITEMS)) {
    update[`items.${k}`] =
      status === 'completed'
        ? { status: 'completed', completedAt: serverTimestamp() }
        : { status: 'skipped', skippedAt: serverTimestamp() };
  }
  for (const k of REMOVE_KEYS) update[`items.${k}`] = deleteField();
  Object.assign(update, SCALARS);
  update.updated_at = serverTimestamp();

  await updateDoc(ref, update);
  console.log('\n✓ Weightlifting queue set to the week-3 state. Other fields untouched.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFailed:', err?.message ?? err);
  process.exit(1);
});
