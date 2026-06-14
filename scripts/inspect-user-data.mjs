/**
 * Read-only inspection of a user's weightlifting-related Firestore data.
 *
 * Prints, for the signed-in account:
 *   - state/program            (weightlifting programme config)
 *   - sports/*                 (per-sport setup)
 *   - maxes/*                  (1RM values — one doc per exercise)
 *   - state/programme_queue    (queue keys summary)
 *
 * Firestore security rules only allow a user to read their OWN data, so you
 * must sign in as the account you want to inspect. Writes nothing, ever.
 *
 * Usage (Node 18+, from the repo root):
 *   ZONE_EMAIL="you@example.com" ZONE_PASSWORD="…" \
 *     node scripts/inspect-user-data.mjs [expectedUid]
 *
 * If `expectedUid` is given and doesn't match the signed-in uid, it warns
 * (you can only read the data of the account you logged in with).
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, getDoc, doc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyB3qb-HWBYcf-bYmt8vOyzHVCx5Nc7W0Wo',
  authDomain: 'zone-app-cc098.firebaseapp.com',
  projectId: 'zone-app-cc098',
  storageBucket: 'zone-app-cc098.firebasestorage.app',
  messagingSenderId: '771528959241',
  appId: '1:771528959241:web:f1154cb4f5b62d73309fd8',
};

const email = process.env.ZONE_EMAIL;
const password = process.env.ZONE_PASSWORD;
const expectedUid = process.argv[2];

if (!email || !password) {
  console.error('Set ZONE_EMAIL and ZONE_PASSWORD env vars.');
  process.exit(1);
}

/** Render Firestore Timestamps and other values readably. */
function replacer(_key, value) {
  if (value && typeof value === 'object' && typeof value.seconds === 'number' && typeof value.nanoseconds === 'number') {
    try {
      return new Date(value.seconds * 1000).toISOString();
    } catch {
      return `Timestamp(${value.seconds})`;
    }
  }
  return value;
}

function show(label, data) {
  console.log(`\n=== ${label} ===`);
  console.log(data === null ? '(document does not exist)' : JSON.stringify(data, replacer, 2));
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const cred = await signInWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  console.log(`Signed in. uid=${uid}`);
  if (expectedUid && expectedUid !== uid) {
    console.warn(
      `\n⚠️  Signed-in uid (${uid}) ≠ requested uid (${expectedUid}). ` +
        `Firestore rules only let you read your own data, so this will show ${uid}'s docs.`,
    );
  }

  // state/program
  const programSnap = await getDoc(doc(db, 'users', uid, 'state', 'program'));
  show('users/{uid}/state/program', programSnap.exists() ? programSnap.data() : null);

  // sports/*
  const sportsSnap = await getDocs(collection(db, 'users', uid, 'sports'));
  show(
    `users/{uid}/sports/  (${sportsSnap.size} doc(s))`,
    sportsSnap.empty ? null : Object.fromEntries(sportsSnap.docs.map((d) => [d.id, d.data()])),
  );

  // maxes/*  (the 1RM)
  const maxesSnap = await getDocs(collection(db, 'users', uid, 'maxes'));
  show(
    `users/{uid}/maxes/  (${maxesSnap.size} doc(s)) — your 1RM`,
    maxesSnap.empty ? null : Object.fromEntries(maxesSnap.docs.map((d) => [d.id, d.data()])),
  );

  // state/programme_queue (summary)
  const queueSnap = await getDoc(doc(db, 'users', uid, 'state', 'programme_queue'));
  if (!queueSnap.exists()) {
    show('users/{uid}/state/programme_queue', null);
  } else {
    const data = queueSnap.data();
    const itemKeys = data.items ? Object.keys(data.items) : [];
    console.log('\n=== users/{uid}/state/programme_queue (summary) ===');
    console.log(`items: ${itemKeys.length} key(s)`);
    itemKeys.sort().forEach((k) => console.log(`  ${k} -> ${data.items[k]?.status ?? '?'}`));
    const scalars = Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'items'));
    console.log('other fields:', JSON.stringify(scalars, replacer, 2));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\nFailed:', err?.message ?? err);
  process.exit(1);
});
