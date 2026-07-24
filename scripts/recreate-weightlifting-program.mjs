/**
 * Recreate users/{uid}/state/program after it was deleted by a reset.
 *
 * The 1RM are NOT stored in this document — they live in users/{uid}/maxes/
 * and are read at session-generation time. This script only rebuilds the
 * programme config so the weightlifting queue works again; your existing
 * maxes are used automatically once the program exists. The script reads &
 * displays the maxes so you can confirm they're present.
 *
 * IMPORTANT: in state/program the weightlifting sport is keyed
 * `weightlifting` (the `halterophilie` spelling is only used in the
 * `sports/` collection). The app reads `program.sport_key === 'weightlifting'`,
 * so this writes `weightlifting`.
 *
 * DRY RUN by default — prints the document it would create and changes
 * nothing. Pass `--apply` to write. Refuses to overwrite an existing
 * state/program unless `--force` is also given.
 *
 * Usage (Node 18+, from repo root):
 *   ZONE_EMAIL="…" ZONE_PASSWORD="…" node scripts/recreate-weightlifting-program.mjs
 *   ZONE_EMAIL="…" ZONE_PASSWORD="…" node scripts/recreate-weightlifting-program.mjs --apply
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  getDoc,
  setDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyB3qb-HWBYcf-bYmt8vOyzHVCx5Nc7W0Wo',
  authDomain: 'zone-app-cc098.firebaseapp.com',
  projectId: 'zone-app-cc098',
  storageBucket: 'zone-app-cc098.firebasestorage.app',
  messagingSenderId: '771528959241',
  appId: '1:771528959241:web:f1154cb4f5b62d73309fd8',
};

// ── Target programme values (as requested) ─────────────────────────────────
const CONFIG = {
  sport_key: 'weightlifting', // canonical key for state/program (= halterophilie)
  level: 'debutant',
  goal: 'force_pure',
  sessions_per_week: 3,
  current_block: 3,
  current_week: 1,
  current_day: 1,
  mesocycle_start_block: 3,
  equipment: 'salle_complete',
};

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const email = process.env.ZONE_EMAIL;
const password = process.env.ZONE_PASSWORD;

if (!email || !password) {
  console.error('Set ZONE_EMAIL and ZONE_PASSWORD env vars (the account to repair).');
  process.exit(1);
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const cred = await signInWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  console.log(`Signed in. uid=${uid}`);

  // Guard: don't clobber an existing program unless --force.
  const programRef = doc(db, 'users', uid, 'state', 'program');
  const existing = await getDoc(programRef);
  if (existing.exists()) {
    console.log('\nstate/program ALREADY EXISTS:');
    console.log(JSON.stringify(existing.data(), null, 2));
    if (!FORCE) {
      console.error('\nRefusing to overwrite. Re-run with --force to replace it. Aborting.');
      process.exit(2);
    }
    console.warn('\n--force given: the existing document will be overwritten.');
  } else {
    console.log('\nstate/program does not exist — it will be created.');
  }

  // Confirm the 1RM are present (used at session-generation time).
  const maxesSnap = await getDocs(collection(db, 'users', uid, 'maxes'));
  console.log(`\nmaxes/ contains ${maxesSnap.size} document(s):`);
  maxesSnap.docs.forEach((d) => {
    const m = d.data();
    console.log(`  ${d.id}: ${m.weight_kg ?? '?'} kg (est. 1RM ${m.estimated_1rm ?? '?'})`);
  });
  if (maxesSnap.empty) {
    console.warn('  ⚠️  No maxes found — sessions cannot be generated until 1RM exist.');
  }

  // Equipment is the explicit target value; the sports/halterophilie config is
  // read only for reference so any mismatch is visible before applying.
  const equipment = CONFIG.equipment;
  const sportSnap = await getDoc(doc(db, 'users', uid, 'sports', 'halterophilie'));
  if (sportSnap.exists() && typeof sportSnap.data().equipment === 'string') {
    console.log(`\nsports/halterophilie equipment = ${sportSnap.data().equipment}; writing ${equipment} (per target).`);
  } else {
    console.log(`\nWriting equipment: ${equipment}.`);
  }

  // mesocycle_start backdated so it's consistent with being in week N.
  const mesocycleStart = isoDaysAgo((CONFIG.current_week - 1) * 7);

  const program = {
    uid,
    sport_key: CONFIG.sport_key,
    current_block: CONFIG.current_block,
    current_week: CONFIG.current_week,
    current_day: CONFIG.current_day,
    mesocycle_start: mesocycleStart,
    mesocycle_start_block: CONFIG.mesocycle_start_block,
    sessions_per_week: CONFIG.sessions_per_week,
    level: CONFIG.level,
    goal: CONFIG.goal,
    equipment,
  };

  console.log('\n=== state/program to write ===');
  console.log(JSON.stringify(program, null, 2));

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to create the document.');
    process.exit(0);
  }

  await setDoc(
    programRef,
    { ...program, created_at: serverTimestamp(), updated_at: serverTimestamp() },
    { merge: true },
  );
  console.log('\n✓ state/program created. Open the app — your weightlifting programme is back.');
  console.log('  (If progression/queue is still empty, run rebuild-weightlifting-queue.mjs next.)');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFailed:', err?.message ?? err);
  process.exit(1);
});
