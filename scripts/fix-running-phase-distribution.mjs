/**
 * Compute and store `running_profile.phase_distribution` for the affected user,
 * using the SAME adaptive algorithm as src/lib/runningEngine.ts
 * (calculatePhaseDistribution / estimateVDOT — replicated verbatim below so the
 * script stays standalone). It also writes the coherent goal fields the split
 * is derived from, so queue generation matches the stored plan.
 *
 * Inputs (edit the CONFIG block to change them):
 *   current VDOT       = 35
 *   goal               = 5 km in 20:00 (1200 s)  → target VDOT ~50 (Δ~15)
 *   target race date   = May 2027 (weeks counted from today at run time)
 *   sessions_per_week  = 2
 *
 * Writes (merge) into users/{uid}/state/running_profile:
 *   vdot, goal, goal_time_seconds, race_distance, target_race_date,
 *   sessions_per_week, goal_vdot, programme_weeks, phase_distribution.
 *
 * DRY RUN by default; --apply to write.
 *
 * Usage:
 *   ZONE_EMAIL="…" ZONE_PASSWORD="…" node scripts/fix-running-phase-distribution.mjs
 *   ZONE_EMAIL="…" ZONE_PASSWORD="…" node scripts/fix-running-phase-distribution.mjs --apply
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

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

// ── Inputs ──────────────────────────────────────────────────────────────────
const CONFIG = {
  currentVdot: 35,
  goalTimeSeconds: 1200, // 5 km in 20:00
  raceDistance: '5km',
  targetRaceDate: '2027-05-11', // 11 May 2027; weeks counted from today at run time
  sessionsPerWeek: 2,
};

// ── Engine logic, replicated verbatim from src/lib/runningEngine.ts ──────────
const RACE_METERS = { '5km': 5000, '10km': 10000, semi: 21097, marathon: 42195 };
function raceMeters(d) {
  return RACE_METERS[d] ?? 5000;
}

function estimateVDOT(distanceMeters, timeSeconds) {
  if (distanceMeters <= 0 || timeSeconds <= 0) return 30;
  const timeMin = timeSeconds / 60;
  const speedMperMin = distanceMeters / timeMin;
  const vo2 = -4.6 + 0.182258 * speedMperMin + 0.000104 * speedMperMin * speedMperMin;
  const drop =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * timeMin) +
    0.2989558 * Math.exp(-0.1932605 * timeMin);
  return Math.max(20, Math.min(90, Math.round(vo2 / drop)));
}

function getTargetVdot(goalTimeSeconds, raceDistance) {
  if (goalTimeSeconds <= 0) return 0;
  return estimateVDOT(raceMeters(raceDistance), goalTimeSeconds);
}

function calculatePhaseDistribution(totalWeeks, vdotDelta, currentVdot, raceDistance) {
  const total = Math.max(4, Math.round(totalWeeks));
  const BASE_RATIO = {
    '5km': { base: 0.25, dev: 0.45, spec: 0.2, affutage: 0.1 },
    '10km': { base: 0.3, dev: 0.4, spec: 0.2, affutage: 0.1 },
    semi: { base: 0.35, dev: 0.35, spec: 0.2, affutage: 0.1 },
    marathon: { base: 0.4, dev: 0.35, spec: 0.15, affutage: 0.1 },
  };
  const r = BASE_RATIO[raceDistance] ?? BASE_RATIO['5km'];
  let base = r.base;
  let dev = r.dev;
  let spec = r.spec;
  if (vdotDelta > 10) {
    base += 0.05;
    dev -= 0.05;
  } else if (vdotDelta < 5) {
    spec += 0.05;
    dev -= 0.05;
  }
  if (currentVdot < 35) {
    base += 0.05;
    dev -= 0.05;
  } else if (currentVdot > 45) {
    spec += 0.05;
    dev -= 0.05;
  }
  const affutage = Math.max(2, Math.min(total - 3, Math.round(total * r.affutage)));
  const remaining = total - affutage;
  const sum = base + dev + spec;
  const baseWeeks = Math.max(1, Math.round((remaining * base) / sum));
  const devWeeks = Math.max(1, Math.round((remaining * dev) / sum));
  const specWeeks = Math.max(1, remaining - baseWeeks - devWeeks);
  return { base: baseWeeks, developpement: devWeeks, specifique: specWeeks, affutage, total };
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function weeksUntil(isoDate) {
  const today = new Date(`${isoToday()}T00:00:00Z`).getTime();
  const target = new Date(`${isoDate}T00:00:00Z`).getTime();
  if (!Number.isFinite(target)) return 0;
  return Math.max(4, Math.round((target - today) / (7 * 24 * 3600 * 1000)));
}

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

  const ref = doc(db, 'users', uid, 'state', 'running_profile');
  const snap = await getDoc(ref);

  const targetVdot = getTargetVdot(CONFIG.goalTimeSeconds, CONFIG.raceDistance);
  const delta = targetVdot - CONFIG.currentVdot;
  const totalWeeks = weeksUntil(CONFIG.targetRaceDate);
  const distribution = calculatePhaseDistribution(
    totalWeeks,
    delta,
    CONFIG.currentVdot,
    CONFIG.raceDistance,
  );
  const today = isoToday();

  console.log('\n=== Current running_profile (relevant fields) ===');
  if (snap.exists()) {
    const d = snap.data();
    for (const k of [
      'vdot',
      'goal',
      'goal_time_seconds',
      'race_distance',
      'target_race_date',
      'sessions_per_week',
      'programme_weeks',
      'phase_distribution',
    ]) {
      console.log(`  ${k} = ${JSON.stringify(d[k])}`);
    }
  } else {
    console.log('  (running_profile does not exist)');
  }

  console.log('\n=== Computation ===');
  console.log(`  today = ${today}, target race = ${CONFIG.targetRaceDate} → totalWeeks = ${totalWeeks}`);
  console.log(`  current VDOT = ${CONFIG.currentVdot}, target VDOT = ${targetVdot} (Δ ${delta})`);
  console.log(`  phase_distribution = ${JSON.stringify(distribution)}`);

  const update = {
    vdot: CONFIG.currentVdot,
    goal: CONFIG.raceDistance,
    goal_time_seconds: CONFIG.goalTimeSeconds,
    race_distance: CONFIG.raceDistance,
    target_race_date: CONFIG.targetRaceDate,
    sessions_per_week: CONFIG.sessionsPerWeek,
    goal_vdot: targetVdot,
    programme_weeks: totalWeeks,
    phase_distribution: { ...distribution, calculated_at: today },
    updated_at: serverTimestamp(),
  };

  console.log('\n=== Target (fields to write) ===');
  for (const [k, v] of Object.entries(update)) {
    if (k === 'updated_at') continue;
    console.log(`  ${k} = ${JSON.stringify(v)}`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to persist.');
    process.exit(0);
  }

  if (!snap.exists()) {
    console.error('\nrunning_profile does not exist — configure the running sport first. Aborting.');
    process.exit(2);
  }

  await updateDoc(ref, update);
  console.log('\n✓ running_profile updated with phase_distribution + goal fields.');
  console.log('Done.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFailed:', err?.message ?? err);
  process.exit(1);
});
