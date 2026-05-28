/**
 * Real-time hypertrophy session science.
 *
 * Pure helpers used by the musculation session executor to deliver
 * live, set-by-set coaching that no set/rep tracker offers:
 *   - SRA zone positioning (Israetel 2019)
 *   - intra-session performance decay (Loenneke 2014)
 *   - velocity estimation from RIR (Gonzalez-Badillo 2014)
 *   - MEV/MAV/MRV live volume counters (Israetel 2019)
 *   - fatigue-aware rest optimisation (Schoenfeld 2016)
 *   - post-session hypertrophy scoring
 *
 * All numbers are deliberately conservative midpoints from the cited
 * literature; the engine never invents data it does not have.
 */

import { EXERCISES, getExerciseById } from '@/data/exercises';
import {
  selectDeloadProtocol,
  VOLUME_LANDMARKS,
  type DeloadProtocol,
  type VolumeLandmark,
} from '@/lib/pro/hypertrophyProEngine';
import { genderVolumeBonus } from '@/lib/genderProfiles';
import type { Gender } from '@/lib/firestore';
import { colors } from '@/theme/colors';

/** Volume landmarks for a muscle, shifted up by the gender volume bonus. */
function landmarkForGender(muscle: string, gender: Gender | null | undefined): VolumeLandmark | null {
  const base = VOLUME_LANDMARKS[muscle];
  if (!base) return null;
  const bonus = genderVolumeBonus(muscle, gender);
  if (bonus === 0) return base;
  return {
    MEV: base.MEV + bonus,
    MAV: base.MAV + bonus,
    MRV: base.MRV + bonus,
    SRAhours: base.SRAhours,
  };
}

export const MUSCLE_LABELS_FR: Record<string, string> = {
  quadriceps: 'Quadriceps',
  hamstrings: 'Ischios',
  glutes: 'Fessiers',
  chest: 'Pectoraux',
  upper_back: 'Haut du dos',
  lats: 'Dorsaux',
  shoulders: 'Épaules',
  biceps: 'Biceps',
  triceps: 'Triceps',
  core: 'Gainage',
  lower_back: 'Lombaires',
  traps: 'Trapèzes',
  calves: 'Mollets',
};

export function muscleLabel(muscle: string): string {
  return MUSCLE_LABELS_FR[muscle] ?? muscle;
}

/**
 * Map every exercise to the trackable muscle groups it primarily loads.
 * Only muscles with volume landmarks are kept so downstream counters
 * always have MEV/MAV/MRV references.
 */
export function buildExerciseMuscleMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const ex of EXERCISES) {
    const tracked = ex.muscles_primary.filter((m) => VOLUME_LANDMARKS[m]);
    if (tracked.length > 0) map[ex.id] = tracked;
  }
  return map;
}

/** Primary trackable muscles for one exercise. */
export function primaryMusclesFor(exerciseId: string): string[] {
  const ex = getExerciseById(exerciseId);
  if (!ex) return [];
  return ex.muscles_primary.filter((m) => VOLUME_LANDMARKS[m]);
}

const COMPOUND_CATEGORIES = new Set(['olympic_lift', 'squat', 'hinge', 'push', 'pull']);

export function isCompoundExercise(exerciseId: string): boolean {
  const ex = getExerciseById(exerciseId);
  return ex ? COMPOUND_CATEGORIES.has(ex.category) : false;
}

// ---------------------------------------------------------------------------
// 1. SRA / volume zone
// ---------------------------------------------------------------------------

export type SRAZoneKind = 'recovery' | 'stimulus' | 'fatigue' | 'overreach';

export interface SRAZoneInfo {
  zone: SRAZoneKind;
  color: string;
  /** Short tag shown next to the muscle. */
  tag: string;
  /** One-line coaching sentence. */
  message: string;
}

/**
 * Classify a muscle's accumulated weekly sets onto the SRA curve.
 *
 * < MEV   -> recovery (grey)   : not enough to grow
 * MEV-MAV -> stimulus (gold)   : building
 * MAV-MRV -> fatigue (orange)  : recovery required
 * >= MRV  -> overreach (red)   : counter-productive
 */
export function sraZoneForSets(sets: number, landmark: VolumeLandmark): SRAZoneInfo {
  if (sets < landmark.MEV) {
    return {
      zone: 'recovery',
      color: colors.text.secondary,
      tag: 'RÉCUPÉRATION',
      message: 'Pas assez de volume pour progresser.',
    };
  }
  if (sets < landmark.MAV) {
    return {
      zone: 'stimulus',
      color: colors.accent.gold,
      tag: 'STIMULUS',
      message: 'Tu construis.',
    };
  }
  if (sets < landmark.MRV) {
    return {
      zone: 'fatigue',
      color: colors.orbe.amber,
      tag: 'FATIGUE',
      message: 'Récupération requise.',
    };
  }
  return {
    zone: 'overreach',
    color: colors.orbe.red,
    tag: 'SURMENAGE',
    message: 'Stop — contre-productif.',
  };
}

export interface MuscleVolumeLive {
  muscle: string;
  label: string;
  /** Weekly sets so far including this session. */
  sets: number;
  mev: number;
  mav: number;
  mrv: number;
  /** 0-1 fill of the bar, capped at MRV. */
  fill: number;
  zone: SRAZoneInfo;
  phaseLabel: string;
  reachedMrv: boolean;
}

/**
 * Live MEV/MAV/MRV counter for one muscle.
 *
 * @param muscle muscle key (must have a landmark)
 * @param baselineWeeklySets sets already logged this week before today
 * @param sessionSets sets completed for this muscle in the current session
 */
export function liveMuscleVolume(
  muscle: string,
  baselineWeeklySets: number,
  sessionSets: number,
  gender?: Gender | null,
): MuscleVolumeLive | null {
  const landmark = landmarkForGender(muscle, gender);
  if (!landmark) return null;
  const sets = Math.max(0, baselineWeeklySets) + Math.max(0, sessionSets);
  const zone = sraZoneForSets(sets, landmark);
  const fill = Math.max(0, Math.min(1, sets / landmark.MRV));
  const phaseLabel =
    zone.zone === 'recovery'
      ? 'SOUS MEV'
      : zone.zone === 'stimulus'
        ? 'PHASE MEV→MAV'
        : zone.zone === 'fatigue'
          ? 'PHASE MAV→MRV'
          : 'AU-DELÀ MRV';
  return {
    muscle,
    label: muscleLabel(muscle),
    sets,
    mev: landmark.MEV,
    mav: landmark.MAV,
    mrv: landmark.MRV,
    fill,
    zone,
    phaseLabel,
    reachedMrv: sets >= landmark.MRV,
  };
}

// ---------------------------------------------------------------------------
// 2. Intra-session performance decay (Loenneke 2014)
// ---------------------------------------------------------------------------

export type DecaySeverity = 'ok' | 'amber' | 'red';

export interface PerformanceDecay {
  /** Performance index vs the first set (1.0 = no drop). */
  pi: number;
  dropPercent: number;
  severity: DecaySeverity;
  message: string;
}

/**
 * Compare the current set against the exercise's first set.
 *
 * PI = (reps_n x weight_n) / (reps_1 x weight_1)
 * A drop beyond 15% / 25% flags accumulating fatigue and junk volume.
 */
export function computePerformanceDecay(
  firstSet: { reps: number; weight: number },
  currentSet: { reps: number; weight: number },
): PerformanceDecay {
  const base = firstSet.reps * Math.max(0, firstSet.weight || 1);
  const now = currentSet.reps * Math.max(0, currentSet.weight || 1);
  if (base <= 0) {
    return { pi: 1, dropPercent: 0, severity: 'ok', message: '' };
  }
  const pi = now / base;
  const dropPercent = Math.round((1 - pi) * 100);
  if (dropPercent > 25) {
    return {
      pi,
      dropPercent,
      severity: 'red',
      message:
        'Fatigue musculaire élevée. Cette série ne génère plus de stimulus. Arrête ou réduis la charge.',
    };
  }
  if (dropPercent > 15) {
    return {
      pi,
      dropPercent,
      severity: 'amber',
      message: 'Performance en baisse. Vérifie ta récupération.',
    };
  }
  return { pi, dropPercent: Math.max(0, dropPercent), severity: 'ok', message: '' };
}

// ---------------------------------------------------------------------------
// 3. Velocity estimation from RIR (Gonzalez-Badillo 2014)
// ---------------------------------------------------------------------------

export interface VelocityEstimate {
  rir: number;
  minMs: number;
  maxMs: number;
  /** Representative midpoint string, e.g. "~0.40 m/s". */
  label: string;
  inOptimalZone: boolean;
  tooLight: boolean;
  message: string;
}

/**
 * Estimate bar velocity from reported RIR.
 *
 * Optimal hypertrophy force-velocity window: 0.20-0.45 m/s.
 */
export function estimateVelocityFromRIR(rir: number): VelocityEstimate {
  const clamped = Math.max(0, Math.min(5, Math.round(rir)));
  let minMs: number;
  let maxMs: number;
  if (clamped === 0) {
    minMs = 0.15;
    maxMs = 0.2;
  } else if (clamped === 1) {
    minMs = 0.25;
    maxMs = 0.3;
  } else if (clamped === 2) {
    minMs = 0.35;
    maxMs = 0.45;
  } else {
    minMs = 0.5;
    maxMs = 0.6;
  }
  const mid = (minMs + maxMs) / 2;
  const tooLight = mid > 0.5;
  const inOptimalZone = mid >= 0.2 && mid <= 0.45;
  const message = tooLight
    ? 'Charge trop légère pour la croissance. Monte de 5 kg.'
    : inOptimalZone
      ? 'Zone hypertrophie optimale.'
      : 'Proche de l’échec. Tension mécanique maximale.';
  return {
    rir: clamped,
    minMs,
    maxMs,
    label: `~${mid.toFixed(2)} m/s`,
    inOptimalZone,
    tooLight,
    message,
  };
}

// ---------------------------------------------------------------------------
// 4. Smart rest optimisation (Schoenfeld 2016)
// ---------------------------------------------------------------------------

export interface SmartRest {
  seconds: number;
  rationale: string;
}

/**
 * Scale a base rest by fatigue, readiness and set position.
 *
 * @param baseSeconds programmed rest for the exercise
 * @param zoneScore today's Zone readiness (0-100) or null
 * @param setIndex 0-based index of the set just completed
 * @param totalSets total sets for the exercise
 * @param performanceDropPercent decay vs set 1 for the set just completed
 */
export function computeSmartRest(params: {
  baseSeconds: number;
  zoneScore: number | null;
  setIndex: number;
  totalSets: number;
  performanceDropPercent: number;
}): SmartRest {
  const { baseSeconds, zoneScore, setIndex, totalSets, performanceDropPercent } = params;
  let mult = 1;
  if (performanceDropPercent > 25) mult *= 1.3;
  else if (performanceDropPercent > 15) mult *= 1.15;
  if (zoneScore !== null && zoneScore < 60) mult *= 1.2;
  const isLastSets = setIndex >= totalSets - 2;
  if (isLastSets) mult *= 1.15;
  const seconds = Math.round((baseSeconds * mult) / 5) * 5;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const human = m > 0 ? `${m}min${s > 0 ? String(s).padStart(2, '0') : ''}` : `${s}s`;
  return {
    seconds,
    rationale: `Récupération optimale : ${human} · Basée sur ton état actuel`,
  };
}

// ---------------------------------------------------------------------------
// 5. Post-session hypertrophy score
// ---------------------------------------------------------------------------

export interface HypertrophyScoreComponent {
  label: string;
  earned: number;
  max: number;
}

export interface HypertrophyScore {
  score: number;
  grade: string;
  color: string;
  components: HypertrophyScoreComponent[];
}

interface ScoredSet {
  exerciseId: string;
  reps: number;
  weight: number;
  rir: number | null;
}

/**
 * Score a finished session 0-100 from volume adequacy, proximity to
 * failure, exercise selection and Zone readiness.
 */
export function computeHypertrophyScore(params: {
  sets: ScoredSet[];
  baselineWeeklySetsByMuscle: Record<string, number>;
  zoneScore: number | null;
  gender?: Gender | null;
}): HypertrophyScore {
  const { sets, baselineWeeklySetsByMuscle, zoneScore, gender } = params;

  // Volume adequacy (40): share of trained muscles landing in MEV..MAV.
  const sessionSetsByMuscle: Record<string, number> = {};
  let hasCompound = false;
  let hasIsolation = false;
  for (const s of sets) {
    if (s.reps <= 0) continue;
    if (isCompoundExercise(s.exerciseId)) hasCompound = true;
    else hasIsolation = true;
    for (const m of primaryMusclesFor(s.exerciseId)) {
      sessionSetsByMuscle[m] = (sessionSetsByMuscle[m] ?? 0) + 1;
    }
  }
  const trainedMuscles = Object.keys(sessionSetsByMuscle);
  let inBand = 0;
  for (const m of trainedMuscles) {
    const landmark = landmarkForGender(m, gender);
    if (!landmark) continue;
    const total = (baselineWeeklySetsByMuscle[m] ?? 0) + sessionSetsByMuscle[m];
    if (total >= landmark.MEV && total <= landmark.MAV) inBand += 1;
    else if (total > landmark.MAV && total < landmark.MRV) inBand += 0.6;
    else if (total >= landmark.MRV) inBand += 0.2;
  }
  const volumeEarned =
    trainedMuscles.length > 0 ? Math.round((inBand / trainedMuscles.length) * 40) : 0;

  // Proximity to failure (30): average RIR closest to 1-2 scores best.
  const rirs = sets.map((s) => s.rir).filter((r): r is number => r !== null);
  let proximityEarned = 0;
  if (rirs.length > 0) {
    const avg = rirs.reduce((a, b) => a + b, 0) / rirs.length;
    const distance = avg <= 2 ? Math.abs(avg - 1.5) : avg - 2;
    proximityEarned = Math.round(Math.max(0, 1 - distance / 3) * 30);
  }

  // Exercise selection (15): both compound and isolation present.
  const selectionEarned = hasCompound && hasIsolation ? 15 : hasCompound || hasIsolation ? 9 : 0;

  // Zone readiness (15).
  const readinessEarned =
    zoneScore === null
      ? 8
      : zoneScore >= 80
        ? 15
        : zoneScore >= 60
          ? 12
          : zoneScore >= 40
            ? 7
            : 3;

  const score = Math.max(
    0,
    Math.min(100, volumeEarned + proximityEarned + selectionEarned + readinessEarned),
  );

  let grade: string;
  let color: string;
  if (score < 50) {
    grade = 'SÉANCE À AMÉLIORER';
    color = colors.orbe.red;
  } else if (score < 70) {
    grade = 'SÉANCE CORRECTE';
    color = colors.orbe.amber;
  } else if (score < 85) {
    grade = 'SÉANCE PRODUCTIVE';
    color = colors.accent.gold;
  } else {
    grade = 'SÉANCE OPTIMALE';
    color = colors.orbe.green;
  }

  return {
    score,
    grade,
    color,
    components: [
      { label: 'Volume (MEV→MAV)', earned: volumeEarned, max: 40 },
      { label: 'Proximité de l’échec', earned: proximityEarned, max: 30 },
      { label: 'Sélection d’exercices', earned: selectionEarned, max: 15 },
      { label: 'État Zone', earned: readinessEarned, max: 15 },
    ],
  };
}

// ---------------------------------------------------------------------------
// 6. Weekly baseline volume + last-trained from completed session history
// ---------------------------------------------------------------------------

interface CompletedSessionLike {
  date: string;
  completed_sets?: {
    exercise_id: string;
    actual_reps: number;
    actual_weight_kg: number;
    rpe?: number | null;
  }[];
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Count this week's working sets per muscle from completed sessions
 * (excluding the in-progress session, which the UI adds live).
 */
export function weeklyBaselineSetsByMuscle(
  completedSessions: CompletedSessionLike[],
  now: Date = new Date(),
): Record<string, number> {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const cutoff = today.getTime() - 6 * MS_PER_DAY;
  const out: Record<string, number> = {};
  for (const session of completedSessions) {
    const d = parseISO(session.date);
    if (!d || d.getTime() < cutoff) continue;
    const perMuscle: Record<string, number> = {};
    for (const cs of session.completed_sets ?? []) {
      if (cs.actual_reps <= 0) continue;
      for (const m of primaryMusclesFor(cs.exercise_id)) {
        perMuscle[m] = (perMuscle[m] ?? 0) + 1;
      }
    }
    for (const [m, n] of Object.entries(perMuscle)) {
      out[m] = (out[m] ?? 0) + n;
    }
  }
  return out;
}

/** Hours since a muscle was last trained, by muscle. */
export function hoursSinceLastTrained(
  completedSessions: CompletedSessionLike[],
  now: Date = new Date(),
): Record<string, number> {
  const latest: Record<string, number> = {};
  for (const session of completedSessions) {
    const d = parseISO(session.date);
    if (!d) continue;
    const hasSet = (session.completed_sets ?? []).some((cs) => cs.actual_reps > 0);
    if (!hasSet) continue;
    for (const cs of session.completed_sets ?? []) {
      for (const m of primaryMusclesFor(cs.exercise_id)) {
        latest[m] = Math.max(latest[m] ?? 0, d.getTime());
      }
    }
  }
  const out: Record<string, number> = {};
  for (const [m, t] of Object.entries(latest)) {
    out[m] = Math.max(0, (now.getTime() - t) / (1000 * 60 * 60));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 7. Deload prediction from recent session history
// ---------------------------------------------------------------------------

export interface DeloadRecommendation {
  recommended: boolean;
  protocol: DeloadProtocol | null;
  reason: string;
}

/**
 * Decide whether a deload is warranted from the last weeks of training.
 *
 * Signals (Israetel 2019, Helms 2014):
 *   - average RIR declining 3+ weeks in a row (effort creeping toward
 *     failure = accumulating fatigue)
 *   - weekly volume-load plateauing (< 3% change) for 3+ weeks
 */
export function evaluateDeloadNeed(
  sessions: CompletedSessionLike[],
  userLevel: string,
  now: Date = new Date(),
): DeloadRecommendation {
  const weeks = 5;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const rirSum = new Array<number>(weeks).fill(0);
  const rirCount = new Array<number>(weeks).fill(0);
  const volume = new Array<number>(weeks).fill(0);

  for (const session of sessions) {
    const d = parseISO(session.date);
    if (!d) continue;
    const diffDays = Math.floor((today.getTime() - d.getTime()) / MS_PER_DAY);
    if (diffDays < 0 || diffDays >= weeks * 7) continue;
    const weekIdx = weeks - 1 - Math.floor(diffDays / 7);
    for (const cs of session.completed_sets ?? []) {
      if (cs.actual_reps <= 0 || cs.actual_weight_kg <= 0) continue;
      volume[weekIdx] += cs.actual_reps * cs.actual_weight_kg;
      if (cs.rpe !== null && cs.rpe !== undefined) {
        rirSum[weekIdx] += Math.max(0, 10 - cs.rpe);
        rirCount[weekIdx] += 1;
      }
    }
  }

  const rirByWeek: number[] = [];
  const volByWeek: number[] = [];
  for (let i = 0; i < weeks; i += 1) {
    if (rirCount[i] > 0) rirByWeek.push(rirSum[i] / rirCount[i]);
    if (volume[i] > 0) volByWeek.push(volume[i]);
  }

  if (rirByWeek.length < 3 && volByWeek.length < 3) {
    return { recommended: false, protocol: null, reason: '' };
  }

  const rirDeclining = strictlyDeclining(rirByWeek.slice(-3));
  const volumePlateau = plateauing(volByWeek.slice(-3));
  const consecutiveHardWeeks = rirByWeek.filter((r) => r <= 1.5).length;

  if (!rirDeclining && !volumePlateau) {
    return { recommended: false, protocol: null, reason: '' };
  }

  const protocol = selectDeloadProtocol({
    userLevel,
    consecutiveHardWeeks,
    recentRIRTrend: rirByWeek.slice(-3),
    volumeLoadTrend: volByWeek.slice(-3),
    sleepDebtHours: 0,
  });
  const reason = rirDeclining
    ? 'Ton RIR baisse semaine après semaine : la fatigue s’accumule.'
    : 'Ton volume stagne depuis plusieurs semaines.';
  return { recommended: true, protocol, reason };
}

function strictlyDeclining(values: number[]): boolean {
  if (values.length < 3) return false;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] >= values[i - 1]) return false;
  }
  return true;
}

function plateauing(values: number[]): boolean {
  if (values.length < 3) return false;
  const first = values[0];
  if (first <= 0) return false;
  return values.every((v) => Math.abs(((v - first) / first) * 100) <= 3);
}

function parseISO(iso: string): Date | null {
  if (!iso) return null;
  const parts = iso.split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}
