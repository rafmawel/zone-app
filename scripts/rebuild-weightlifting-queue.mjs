/**
 * One-off recovery: rebuild the weightlifting programme queue from the
 * user's session history after a programme restart wiped the queue state.
 *
 * Why this is safe: a programme restart only edits `users/{uid}/state/*`.
 * It NEVER deletes `users/{uid}/sessions` (only the full "Réinitialiser
 * toutes mes données" action does). So the completed-session history is the
 * source of truth and we can rebuild the queue from it.
 *
 * What it does:
 *   1. Reads users/{uid}/sessions, keeps completed WEIGHTLIFTING sessions
 *      that carry a programme `queue_key`.
 *   2. Marks each corresponding queue item as `completed` under
 *      state/programme_queue.items (canonical key format, legacy migrated).
 *   3. Restores state/program.current_block / current_week to the furthest
 *      week the athlete had reached, and rebuilds that week's tracking
 *      counters + the `weightlifting_current_week` pointer.
 *
 * It is a DRY RUN by default — it prints what it found and would write, and
 * changes nothing. Pass `--apply` to actually write.
 *
 * Usage (from the repo root, Node 18+):
 *   ZONE_EMAIL="you@example.com" ZONE_PASSWORD="…" node scripts/rebuild-weightlifting-queue.mjs
 *   ZONE_EMAIL="…" ZONE_PASSWORD="…" node scripts/rebuild-weightlifting-queue.mjs --apply
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
} from 'firebase/firestore';

// Same public web config as src/lib/firebase.ts.
const firebaseConfig = {
  apiKey: 'AIzaSyB3qb-HWBYcf-bYmt8vOyzHVCx5Nc7W0Wo',
  authDomain: 'zone-app-cc098.firebaseapp.com',
  projectId: 'zone-app-cc098',
  storageBucket: 'zone-app-cc098.firebasestorage.app',
  messagingSenderId: '771528959241',
  appId: '1:771528959241:web:f1154cb4f5b62d73309fd8',
};

const APPLY = process.argv.includes('--apply');
const email = process.env.ZONE_EMAIL;
const password = process.env.ZONE_PASSWORD;

if (!email || !password) {
  console.error('Set ZONE_EMAIL and ZONE_PASSWORD env vars (the account to repair).');
  process.exit(1);
}

const CANONICAL = /^weightlifting_b(\d+)_w(\d+)_s(\d+)$/;
const LEGACY = /^weightlifting_w(\d+)_s(\d+)$/;

/** Parse a weightlifting queue_key into {block, week, session, key} (canonical). */
function parseKey(raw) {
  if (typeof raw !== 'string') return null;
  let m = raw.match(CANONICAL);
  if (m) {
    const [block, week, session] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return { block, week, session, key: raw };
  }
  m = raw.match(LEGACY);
  if (m) {
    const [week, session] = [Number(m[1]), Number(m[2])];
    return { block: 1, week, session, key: `weightlifting_b1_w${week}_s${session}` };
  }
  return null;
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  console.log(`Signing in as ${email}…`);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  console.log(`Signed in. uid=${uid}`);

  // 1. Read session history.
  const sessSnap = await getDocs(collection(db, 'users', uid, 'sessions'));
  const all = sessSnap.docs.map((d) => d.data());
  console.log(`\nHistory check: users/${uid}/sessions = ${all.length} document(s).`);
  if (all.length === 0) {
    console.error('No sessions found — history is empty, cannot rebuild. Aborting.');
    process.exit(2);
  }

  const wl = all.filter(
    (s) =>
      s.status === 'completed' &&
      s.sport_key === 'weightlifting' &&
      s.discipline !== 'musculation',
  );
  const withKey = wl.filter((s) => typeof s.queue_key === 'string' && s.queue_key);
  console.log(
    `Completed weightlifting sessions: ${wl.length} (with a programme queue_key: ${withKey.length}).`,
  );
  if (withKey.length === 0) {
    console.error(
      'No completed weightlifting sessions carry a queue_key — nothing to restore. Aborting.',
    );
    process.exit(3);
  }

  // 2. Build the completed items map + find the furthest (block, week).
  const items = {};
  const perWeekCount = new Map(); // `${block}_${week}` -> count
  let furthest = { block: 1, week: 1, rank: 0 };
  for (const s of withKey) {
    const parsed = parseKey(s.queue_key);
    if (!parsed) {
      console.warn(`  Skipping unrecognised queue_key: ${s.queue_key}`);
      continue;
    }
    items[parsed.key] = {
      status: 'completed',
      completedAt: s.completed_at ?? s.created_at ?? null,
    };
    const bw = `${parsed.block}_${parsed.week}`;
    perWeekCount.set(bw, (perWeekCount.get(bw) ?? 0) + 1);
    const rank = parsed.block * 1000 + parsed.week;
    if (rank >= furthest.rank) furthest = { block: parsed.block, week: parsed.week, rank };
  }

  // 3. Read current program to preserve fields + planned sessions/week.
  const programRef = doc(db, 'users', uid, 'state', 'program');
  const programSnap = await getDoc(programRef);
  const program = programSnap.exists() ? programSnap.data() : null;
  const plannedSessions =
    program && typeof program.sessions_per_week === 'number' ? program.sessions_per_week : 3;
  const furthestCount = perWeekCount.get(`${furthest.block}_${furthest.week}`) ?? 0;

  // ── Report ────────────────────────────────────────────────────────────────
  console.log('\n=== Reconstruction plan ===');
  console.log(`Completed queue items to restore: ${Object.keys(items).length}`);
  Object.keys(items)
    .sort()
    .forEach((k) => console.log(`  ✓ ${k}`));
  console.log(
    `\nResume position: block ${furthest.block}, week ${furthest.week} ` +
      `(${furthestCount}/${plannedSessions} sessions done that week).`,
  );
  console.log(
    program
      ? `state/program will be set to current_block=${furthest.block}, current_week=${furthest.week}.`
      : 'state/program is missing — it will NOT be created (reconfigure the sport in-app first if needed).',
  );

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to persist.');
    process.exit(0);
  }

  // 4. Write (merge — other sports and existing fields are preserved).
  const queueUpdate = {
    items,
    weightlifting_current_week: furthest.week,
    [`weightlifting_week_${furthest.week}_completed_sessions`]: furthestCount,
    [`weightlifting_week_${furthest.week}_planned_sessions`]: plannedSessions,
  };
  await setDoc(doc(db, 'users', uid, 'state', 'programme_queue'), queueUpdate, { merge: true });
  console.log('\n✓ state/programme_queue updated (items + week pointer + counters).');

  if (program) {
    await setDoc(
      programRef,
      { ...program, current_block: furthest.block, current_week: furthest.week },
      { merge: true },
    );
    console.log('✓ state/program restored to the resume position.');
  }

  console.log('\nDone. Open the app — your weightlifting progression should be back.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFailed:', err?.message ?? err);
  process.exit(1);
});
