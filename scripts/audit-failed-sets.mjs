/**
 * Read-only audit: are any stored 1RM records built on failure sets (RIR 0)?
 *
 * The problem this looks for
 * -------------------------
 * When a session finishes, `reconcileMaxesFromSession` (app/(app)/session/[id].tsx,
 * and its twin in app/(app)/muscle-session/[id].tsx) walks every completed set,
 * computes an Epley estimate and overwrites `maxes/{exercise_id}` whenever that
 * estimate beats the stored one. It never looks at the set's RPE/RIR, so a set
 * taken to failure feeds the max exactly like a clean one — and every later
 * working weight is derived from that record.
 *
 * This script reports where that happened. It writes NOTHING, ever.
 *
 * How failure sets are recognised
 * -------------------------------
 * `CompletedSet.rpe` is the stored field; RIR is derived as `10 - rpe`
 * (see the rirOptions table in app/(app)/session/[id].tsx and the hypertrophy
 * scoring in app/(app)/muscle-session/[id].tsx). So a set taken to failure is
 * normally written as `rpe: 10` → RIR 0. A literal `rpe: 0` is not a valid
 * value from any UI path and usually means a raw RIR leaked into the field —
 * also RIR 0. Both are flagged by default; narrow with --rule if needed:
 *
 *   --rule=rpe10   only rpe === 10   (RIR 0 as the UI writes it)
 *   --rule=rpe0    only rpe === 0    (raw/likely-buggy zero)
 *   --rule=both    both              (default)
 *
 * Provenance matching
 * -------------------
 * `maxes/{id}` keeps weight_kg + reps but no pointer back to the set it came
 * from, and its `date` is the day the max was written (todayDateString()),
 * not the session date. So provenance is matched on exercise_id + weight_kg +
 * reps. When a non-failure set matches the same weight × reps, the record
 * could have come from either and is reported as ambiguous rather than tainted.
 *
 * Firestore rules only let an account read its own data, so sign in as the
 * user being audited.
 *
 * Usage (Node 18+, from the repo root):
 *   ZONE_EMAIL="…" ZONE_PASSWORD="…" node scripts/audit-failed-sets.mjs
 *   ZONE_EMAIL="…" ZONE_PASSWORD="…" node scripts/audit-failed-sets.mjs --rule=rpe10
 *   ZONE_EMAIL="…" ZONE_PASSWORD="…" node scripts/audit-failed-sets.mjs --all
 *
 * --all also lists exercises whose max is clean (default: only the suspect ones).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyB3qb-HWBYcf-bYmt8vOyzHVCx5Nc7W0Wo',
  authDomain: 'zone-app-cc098.firebaseapp.com',
  projectId: 'zone-app-cc098',
  storageBucket: 'zone-app-cc098.firebasestorage.app',
  messagingSenderId: '771528959241',
  appId: '1:771528959241:web:f1154cb4f5b62d73309fd8',
};

const TARGET_UID = 'lKVIeyKxWQPvhWMah6JbQjvZoD52';

const args = process.argv.slice(2);
const SHOW_ALL = args.includes('--all');
const ruleArg = args.find((a) => a.startsWith('--rule='))?.slice('--rule='.length) ?? 'both';
if (!['both', 'rpe10', 'rpe0'].includes(ruleArg)) {
  console.error(`Unknown --rule=${ruleArg}. Use both | rpe10 | rpe0.`);
  process.exit(1);
}

const email = process.env.ZONE_EMAIL;
const password = process.env.ZONE_PASSWORD;
if (!email || !password) {
  console.error('Set ZONE_EMAIL and ZONE_PASSWORD env vars (the account to audit).');
  process.exit(1);
}

/** Epley, identical to estimateOneRepMax in src/lib/programEngine.ts. */
function estimateOneRepMax(weight, reps) {
  if (reps <= 1) return Math.round(weight);
  return Math.round(weight * (1 + reps / 30));
}

/**
 * Classify a set's RPE against the selected rule.
 *
 * @returns 'rpe10' | 'rpe0' when the set counts as RIR 0, else null.
 */
function failureKind(rpe) {
  if (rpe === null || rpe === undefined) return null;
  if (rpe === 10 && ruleArg !== 'rpe0') return 'rpe10';
  if (rpe === 0 && ruleArg !== 'rpe10') return 'rpe0';
  return null;
}

function rirOf(rpe) {
  if (rpe === null || rpe === undefined) return null;
  // A literal 0 in the rpe field is a raw RIR that never went through the
  // 10 - rir mapping, so it is already the RIR.
  return rpe === 0 ? 0 : 10 - rpe;
}

/** Exercise id → display name, scraped from the TS catalogue (not importable here). */
function loadExerciseNames() {
  const names = new Map();
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, '..', 'src', 'data', 'exercises.ts'), 'utf8');
    const re = /id:\s*'([^']+)',\s*\n\s*name:\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(src)) !== null) names.set(m[1], m[2]);
  } catch {
    // Names are cosmetic; ids alone still make the report usable.
  }
  return names;
}

const exerciseNames = loadExerciseNames();
const label = (id) => (exerciseNames.has(id) ? `${exerciseNames.get(id)} (${id})` : id);

function tsToDate(ts) {
  if (ts && typeof ts.seconds === 'number') return new Date(ts.seconds * 1000).toISOString().slice(0, 10);
  return null;
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const cred = await signInWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  console.log(`Connecté. uid=${uid}`);
  if (uid !== TARGET_UID) {
    console.warn(
      `\n⚠️  uid connecté (${uid}) ≠ uid ciblé (${TARGET_UID}). Les règles Firestore ne ` +
        `laissent lire que ses propres données : ce rapport porte sur ${uid}.`,
    );
  }
  console.log(`Règle « échec » : ${ruleArg}  (rpe10 = rpe 10/RIR 0 · rpe0 = rpe 0 brut)\n`);

  // ---- Load everything (read-only) -------------------------------------
  const [sessionsSnap, maxesSnap] = await Promise.all([
    getDocs(collection(db, 'users', uid, 'sessions')),
    getDocs(collection(db, 'users', uid, 'maxes')),
  ]);

  /** Flattened set list across the whole history. */
  const allSets = [];
  sessionsSnap.docs.forEach((d) => {
    const s = d.data();
    const date = s.date ?? tsToDate(s.completed_at) ?? '????-??-??';
    (s.completed_sets ?? []).forEach((cs, i) => {
      allSets.push({
        exercise_id: cs.exercise_id,
        weight: cs.actual_weight_kg ?? 0,
        reps: cs.actual_reps ?? 0,
        rpe: cs.rpe ?? null,
        rir: rirOf(cs.rpe ?? null),
        failure: failureKind(cs.rpe ?? null),
        est: estimateOneRepMax(cs.actual_weight_kg ?? 0, cs.actual_reps ?? 0),
        date,
        set_number: cs.set_number ?? i + 1,
        session_id: d.id,
        session_status: s.status ?? '?',
        discipline: s.discipline ?? s.sport_key ?? '?',
      });
    });
  });

  const usable = allSets.filter((s) => s.weight > 0 && s.reps > 0);
  const failed = usable.filter((s) => s.failure !== null);

  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  ${sessionsSnap.size} séance(s) · ${allSets.length} série(s) enregistrée(s)`);
  console.log(`  ${usable.length} série(s) exploitable(s) (poids > 0 et reps > 0)`);
  console.log(`  ${failed.length} série(s) à RIR 0 (échec)`);
  console.log(`  ${maxesSnap.size} max stocké(s) dans maxes/`);
  console.log('══════════════════════════════════════════════════════════════');

  // ---- 1. Every RIR 0 set ----------------------------------------------
  console.log('\n\n### 1. Séries à RIR 0 (échec)\n');
  if (failed.length === 0) {
    console.log('Aucune série à RIR 0 trouvée avec cette règle.');
  } else {
    const byExercise = new Map();
    for (const s of failed) {
      if (!byExercise.has(s.exercise_id)) byExercise.set(s.exercise_id, []);
      byExercise.get(s.exercise_id).push(s);
    }
    for (const [exerciseId, sets] of [...byExercise].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`${label(exerciseId)} — ${sets.length} série(s)`);
      sets
        .sort((a, b) => a.date.localeCompare(b.date))
        .forEach((s) => {
          console.log(
            `   ${s.date}  ${String(s.weight).padStart(6)} kg × ${String(s.reps).padStart(2)}` +
              `  rpe=${s.rpe}  →  1RM Epley ${String(s.est).padStart(4)} kg` +
              `   [${s.discipline}, série ${s.set_number}, session ${s.session_id}]`,
          );
        });
      console.log('');
    }
  }

  // ---- 2 & 3. Provenance of each stored max ----------------------------
  console.log('\n### 2-3. Origine du max actuel et max corrigé (hors RIR 0)\n');

  const rows = [];
  for (const d of maxesSnap.docs) {
    const max = d.data();
    const exerciseId = max.exercise_id ?? d.id;
    const sets = usable.filter((s) => s.exercise_id === exerciseId);
    const clean = sets.filter((s) => s.failure === null);

    // Provenance: maxes/ keeps no back-pointer, so match on weight × reps.
    const sameLoad = sets.filter((s) => s.weight === max.weight_kg && s.reps === max.reps);
    const failedMatches = sameLoad.filter((s) => s.failure !== null);
    const cleanMatches = sameLoad.filter((s) => s.failure === null);

    let origin;
    if (sameLoad.length === 0) origin = 'MANUEL / INCONNU';
    else if (failedMatches.length > 0 && cleanMatches.length === 0) origin = 'SÉRIE EN ÉCHEC';
    else if (failedMatches.length > 0) origin = 'AMBIGU';
    else origin = 'SÉRIE PROPRE';

    // Best Epley over non-failure sets only.
    let bestClean = null;
    for (const s of clean) if (!bestClean || s.est > bestClean.est) bestClean = s;

    rows.push({
      exerciseId,
      max,
      origin,
      failedMatches,
      bestClean,
      cleanCount: clean.length,
      failedCount: sets.length - clean.length,
    });
  }

  const suspect = rows.filter((r) => r.origin === 'SÉRIE EN ÉCHEC' || r.origin === 'AMBIGU');
  const shown = SHOW_ALL ? rows : suspect;

  if (rows.length === 0) {
    console.log('Aucun document dans maxes/.');
  } else if (shown.length === 0) {
    console.log('Aucun max ne provient d’une série à RIR 0. ✅  (--all pour tout lister)');
  } else {
    if (!SHOW_ALL) console.log(`(${suspect.length}/${rows.length} max suspects — --all pour tout lister)\n`);
    for (const r of shown.sort((a, b) => a.exerciseId.localeCompare(b.exerciseId))) {
      const m = r.max;
      console.log(`── ${label(r.exerciseId)}`);
      console.log(
        `   Max actuel      : ${m.estimated_1rm} kg  (depuis ${m.weight_kg} kg × ${m.reps}` +
          `, écrit le ${m.date ?? '?'}${m.is_pr ? ', is_pr' : ''})`,
      );
      console.log(`   Origine         : ${r.origin}`);
      if (r.failedMatches.length > 0) {
        r.failedMatches.forEach((s) => {
          console.log(
            `      ↳ série en échec du ${s.date} : ${s.weight} kg × ${s.reps}, rpe=${s.rpe} (RIR ${s.rir})` +
              ` [session ${s.session_id}]`,
          );
        });
      }
      if (r.origin === 'AMBIGU') {
        console.log('      ↳ le même poids × reps existe aussi hors échec : origine indécidable.');
      }
      if (r.origin === 'MANUEL / INCONNU') {
        console.log('      ↳ aucune série ne correspond : saisie manuelle (maxes/strength-test) ou série effacée.');
      }
      console.log(`   Historique      : ${r.cleanCount} série(s) hors échec · ${r.failedCount} en échec`);
      if (r.bestClean) {
        const delta = m.estimated_1rm - r.bestClean.est;
        console.log(
          `   Max hors RIR 0  : ${r.bestClean.est} kg  (${r.bestClean.weight} kg × ${r.bestClean.reps}` +
            `, ${r.bestClean.date}, rpe=${r.bestClean.rpe ?? '—'})`,
        );
        console.log(
          `   Écart           : ${delta > 0 ? '-' : delta < 0 ? '+' : ''}${Math.abs(delta)} kg` +
            `${delta > 0 ? ' (le max stocké est surévalué)' : delta < 0 ? ' (le max stocké est sous le meilleur set propre)' : ' (identique)'}`,
        );
      } else {
        console.log('   Max hors RIR 0  : aucune série exploitable hors échec dans l’historique.');
      }
      console.log('');
    }
  }

  // ---- Summary ---------------------------------------------------------
  console.log('\n### Résumé\n');
  const tainted = rows.filter((r) => r.origin === 'SÉRIE EN ÉCHEC');
  const ambiguous = rows.filter((r) => r.origin === 'AMBIGU');
  console.log(`Max issus d’une série en échec : ${tainted.length}`);
  console.log(`Max ambigus                    : ${ambiguous.length}`);
  console.log(`Max propres / manuels          : ${rows.length - tainted.length - ambiguous.length}`);
  if (tainted.length > 0) {
    console.log('\nCorrections proposées (aucune écriture effectuée) :');
    for (const r of tainted) {
      const target = r.bestClean ? `${r.bestClean.est} kg` : 'à ressaisir (aucune série propre)';
      console.log(`   ${label(r.exerciseId)} : ${r.max.estimated_1rm} kg → ${target}`);
    }
  }
  console.log('\nLecture seule : ce script n’a rien modifié.');

  process.exit(0);
}

main().catch((err) => {
  console.error('\nÉchec :', err?.message ?? err);
  process.exit(1);
});
