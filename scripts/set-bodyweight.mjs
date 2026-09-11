/**
 * Set a user's body weight (kg) on their profile document.
 *
 * The app stores body weight at `users/{uid}.bodyweight_kg` (read by
 * `getUserProfile`, written by `updateUserProfile`) — the "profile" is the user
 * document itself, there is no separate `users/{uid}/profile` doc. Body weight
 * feeds the Snatch/bodyweight ratio used for level detection.
 *
 * Firestore security rules only allow a user to write their OWN data, so you
 * must sign in AS the target account. The script refuses to write if the
 * signed-in uid doesn't match the hard-coded target.
 *
 * Dry run by default (prints the intended change, writes nothing); pass
 * `--apply` to perform the write.
 *
 * Usage (Node 18+, from the repo root):
 *   ZONE_EMAIL="you@example.com" ZONE_PASSWORD="…" node scripts/set-bodyweight.mjs
 *   ZONE_EMAIL="you@example.com" ZONE_PASSWORD="…" node scripts/set-bodyweight.mjs --apply
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

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

  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  const current = snap.exists() ? (snap.data().bodyweight_kg ?? null) : null;
  console.log(`Current bodyweight_kg: ${current === null ? '(unset)' : current}`);
  console.log(`Target  bodyweight_kg: ${BODYWEIGHT_KG}`);

  if (!apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to write.');
    process.exit(0);
  }

  // Merge so only bodyweight_kg is touched; the rest of the profile is kept.
  await setDoc(ref, { bodyweight_kg: BODYWEIGHT_KG }, { merge: true });
  console.log(`\n✅ Wrote bodyweight_kg=${BODYWEIGHT_KG} to users/${uid}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFailed:', err?.message ?? err);
  process.exit(1);
});
