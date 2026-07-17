export type RaceDistance = '5km' | '10km' | 'semi' | 'marathon';

/**
 * Canonical training goal driving session-type selection and durations.
 * `running_profile.goal` is a free string set by two different screens with
 * inconsistent spellings (`5km`/`5k`, `semi`/`semi_marathon`,
 * `forme`/`forme_generale`, `trail`), so callers normalise it through
 * `resolveRunningGoal` (falling back to the race distance) before reaching the
 * engine.
 */
export type RunningGoal = '5k' | '10k' | 'semi_marathon' | 'marathon' | 'forme';

export function resolveRunningGoal(
  rawGoal: string | null | undefined,
  raceDistance?: RaceDistance | null,
): RunningGoal {
  const g = (rawGoal ?? '').trim().toLowerCase();
  if (g === '5k' || g === '5km') return '5k';
  if (g === '10k' || g === '10km') return '10k';
  if (g === 'semi' || g === 'semi_marathon' || g === 'half' || g === 'half_marathon') return 'semi_marathon';
  if (g === 'marathon') return 'marathon';
  if (g === 'forme' || g === 'forme_generale' || g === 'fitness') return 'forme';
  // `trail` and anything unknown fall back to the race distance; a trail with no
  // distance leans marathon (endurance, keep the long run), otherwise the
  // endurance-oriented default keeps the existing SL-based programme.
  switch (raceDistance) {
    case '5km':
      return '5k';
    case '10km':
      return '10k';
    case 'semi':
      return 'semi_marathon';
    case 'marathon':
      return 'marathon';
    default:
      return g === 'trail' ? 'marathon' : 'semi_marathon';
  }
}

// Codes line up with Jack Daniels' VDOT zones (E/T/I/R) plus French shorthand
// for the supporting work that doesn't sit on a Daniels zone:
//   CO = Côtes (hill repeats, Block 1 strength work)
//   AS = Allure spécifique (race-pace work, Block 3)
//   RA = Récupération active (kept for compatibility, used by bonus cardio)
export type RunningSessionType =
  | 'EF'
  | 'SL'
  | 'TC'
  | 'TB'
  | 'IV'
  | 'RV'
  | 'RA'
  | 'CO'
  | 'AS';

export interface VDOTPaces {
  E_slow: number;
  E_fast: number;
  M: number;
  T: number;
  I: number;
  R: number;
}

export interface RunningSessionStep {
  kind: 'warmup' | 'cooldown' | 'work' | 'recovery' | 'steady';
  label: string;
  durationSeconds: number | null;
  targetPaceSecPerKm: number | null;
  distanceMeters: number | null;
}

export interface RunningSessionPlan {
  type: RunningSessionType;
  name: string;
  purpose: string;
  rpe: string;
  steps: RunningSessionStep[];
  estimatedDurationMin: number;
  estimatedDistanceKm: number;
  message: string;
}

export type ProgramBlockRunning = 1 | 2 | 3;
export type WeekIndexRunning = 1 | 2 | 3 | 4;

const RACE_METERS: Record<RaceDistance, number> = {
  '5km': 5000,
  '10km': 10000,
  semi: 21097,
  marathon: 42195,
};

const RACE_LABEL: Record<RaceDistance, string> = {
  '5km': '5 km',
  '10km': '10 km',
  semi: 'Semi-marathon',
  marathon: 'Marathon',
};

export function raceLabel(d: RaceDistance): string {
  return RACE_LABEL[d];
}

export function raceMeters(d: RaceDistance): number {
  return RACE_METERS[d];
}

export function estimateVDOT(distanceMeters: number, timeSeconds: number): number {
  if (distanceMeters <= 0 || timeSeconds <= 0) return 30;
  const timeMin = timeSeconds / 60;
  const speedMperMin = distanceMeters / timeMin;
  const vo2 = -4.6 + 0.182258 * speedMperMin + 0.000104 * speedMperMin * speedMperMin;
  const drop =
    0.8 +
    0.1894393 * Math.exp(-0.012778 * timeMin) +
    0.2989558 * Math.exp(-0.1932605 * timeMin);
  const vdot = vo2 / drop;
  return Math.max(20, Math.min(90, Math.round(vdot)));
}

/**
 * Inverse of {@link estimateVDOT}: predict the race time (seconds) an athlete
 * of the given VDOT would run over `meters`. Binary-searches the monotonic
 * estimateVDOT curve (faster time → higher VDOT). Returns 0 for invalid input.
 */
export function raceTimeForVdot(vdot: number, meters: number): number {
  if (vdot <= 0 || meters <= 0) return 0;
  let lo = 60; // fast bound (s)
  let hi = meters; // ~1 m/s slow bound (s)
  for (let i = 0; i < 50; i += 1) {
    const mid = (lo + hi) / 2;
    if (estimateVDOT(meters, mid) > vdot) lo = mid;
    else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

export function vdotFromEasyPace(easyPaceSecPerKm: number): number {
  if (easyPaceSecPerKm <= 0) return 30;
  const easyPaceMin = easyPaceSecPerKm / 60;
  const vdot = (480 - easyPaceMin * 60) / 3;
  return Math.max(20, Math.min(90, Math.round(vdot)));
}

export function calculateVDOTPaces(vdot: number): VDOTPaces {
  const safe = Math.max(20, Math.min(90, vdot));
  // Daniels VDOT paces: invert the Daniels-Gilbert VO2 polynomial
  //   VO2 = -4.6 + 0.182258 v + 0.000104 v^2
  // to get the velocity v (m/min) for a target oxygen uptake. Pace at
  // each training zone is expressed as a percentage of VDOT.
  const E_fast = paceForVdotFraction(safe, 0.7);
  const E_slow = paceForVdotFraction(safe, 0.65);
  const M = paceForVdotFraction(safe, 0.84);
  const T = paceForVdotFraction(safe, 0.88);
  const I = paceForVdotFraction(safe, 0.98);
  const R = paceForVdotFraction(safe, 1.05);
  return { E_slow, E_fast, M, T, I, R };
}

/**
 * Solve the Daniels-Gilbert VO2 polynomial for velocity and return the
 * pace per kilometre in seconds. `fraction` is the share of the
 * athlete's VDOT used as the target VO2 (0.7 for easy, 0.88 for
 * threshold, etc.).
 */
function paceForVdotFraction(vdot: number, fraction: number): number {
  const targetVO2 = vdot * fraction;
  // 0.000104 v^2 + 0.182258 v - (4.6 + VO2) = 0
  const a = 0.000104;
  const b = 0.182258;
  const c = -(4.6 + targetVO2);
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return 0;
  const v = (-b + Math.sqrt(disc)) / (2 * a); // m/min
  if (v <= 0) return 0;
  return Math.round((1000 / v) * 60); // sec per km
}

export function vdotLevelLabel(vdot: number): string {
  if (vdot < 35) return 'Débutant';
  if (vdot < 45) return 'Intermédiaire';
  if (vdot < 55) return 'Avancé';
  if (vdot < 65) return 'Élite amateur';
  return 'Élite';
}

export function formatPace(secPerKm: number | null | undefined): string {
  if (secPerKm === null || secPerKm === undefined || !Number.isFinite(secPerKm)) return '-';
  const total = Math.max(0, Math.round(secPerKm));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')} /km`;
}

export function formatPaceShort(secPerKm: number | null | undefined): string {
  if (secPerKm === null || secPerKm === undefined || !Number.isFinite(secPerKm)) return '-';
  const total = Math.max(0, Math.round(secPerKm));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

export function paceFromDistanceTime(distanceMeters: number, timeSeconds: number): number {
  if (distanceMeters <= 0 || timeSeconds <= 0) return 0;
  return timeSeconds / (distanceMeters / 1000);
}

const SESSION_NAMES: Record<RunningSessionType, string> = {
  EF: 'ENDURANCE FONDAMENTALE',
  SL: 'SORTIE LONGUE',
  TC: 'TEMPO CONTINU',
  TB: 'TEMPO EN BLOCS',
  IV: 'INTERVALLES VO2MAX',
  RV: 'RÉPÉTITIONS VITESSE',
  RA: 'RÉCUPÉRATION ACTIVE',
  CO: 'CÔTES',
  AS: 'ALLURE SPÉCIFIQUE',
};

const SESSION_PURPOSES: Record<RunningSessionType, string> = {
  EF: 'Base aérobie, densité mitochondriale, oxydation des graisses.',
  SL: 'Endurance fondamentale longue, économie de course, mental.',
  TC: 'Élévation du seuil lactique en continu.',
  TB: 'Travail au seuil fractionné, plus accessible.',
  IV: 'VO2max. Adaptation cardiaque maximale.',
  RV: 'Économie de course, vitesse et neuromusculaire.',
  RA: 'Récupération active, circulation, élimination lactique.',
  CO: 'Force, puissance et économie de foulée par le travail en côte.',
  AS: 'Spécificité d’allure de course, neuromusculaire et mental.',
};

const SESSION_RPE: Record<RunningSessionType, string> = {
  EF: 'RPE 3-4/10',
  SL: 'RPE 3/10',
  TC: 'RPE 7/10',
  TB: 'RPE 7/10',
  IV: 'RPE 9/10',
  RV: 'RPE 10/10',
  RA: 'RPE 1-2/10',
  CO: 'RPE 8/10',
  AS: 'RPE 7-8/10',
};

export function sessionName(type: RunningSessionType): string {
  return SESSION_NAMES[type];
}

export function sessionPurpose(type: RunningSessionType): string {
  return SESSION_PURPOSES[type];
}

export function sessionRpe(type: RunningSessionType): string {
  return SESSION_RPE[type];
}

export interface BuildSessionParams {
  type: RunningSessionType;
  paces: VDOTPaces;
  level: 'beginner' | 'intermediate' | 'advanced';
  block: ProgramBlockRunning;
  week: WeekIndexRunning;
  /** Athlete's current VDOT. Drives the adaptive EF / long-run durations and
   *  the progressive introduction of quality work, so the programme follows
   *  the athlete's fitness without any manual reconfiguration. */
  vdot: number;
  /** Autoregulation multiplier on target paces (<1 faster, >1 slower). */
  paceFactor?: number;
  /** Append 4 × 20 s @ R + 60 s walk strides to the EF run. */
  withStrides?: boolean;
  /** Mark an EF as the recovery slot: shorter and slower than baseline. */
  recovery?: boolean;
  /** Goal race distance — drives race-pace selection for AS / Block 3 IV. */
  goalDistance?: RaceDistance;
  /** Goal finishing time in seconds; when set, race pace is derived from
   *  goal_time / distance instead of from VDOT zones. */
  goalTimeSeconds?: number;
  /** Training goal. Drives session-type selection (via getWeeklySessionTypes)
   *  and, for 5k, shorter easy runs / warm-ups. Defaults to `semi_marathon`
   *  (the existing SL-based behaviour) when omitted. */
  goal?: RunningGoal;
}

/**
 * Resolve the target race pace (sec / km) for race-specific work.
 *
 * Order of precedence:
 *   1. Explicit `goalTimeSeconds` + `goalDistance` (athlete's actual goal)
 *   2. Daniels zone matching the goal distance (M for marathon/semi,
 *      T for 10 km, I for 5 km)
 *   3. Threshold pace as a sensible fallback
 */
function racePace(
  paces: VDOTPaces,
  goalDistance: RaceDistance | undefined,
  goalTimeSeconds: number | undefined,
): number {
  if (
    goalTimeSeconds &&
    goalTimeSeconds > 0 &&
    goalDistance &&
    RACE_METERS[goalDistance]
  ) {
    return Math.round(goalTimeSeconds / (RACE_METERS[goalDistance] / 1000));
  }
  if (!goalDistance) return paces.T;
  if (goalDistance === '5km') return paces.I;
  if (goalDistance === '10km') return paces.T;
  return paces.M;
}

/**
 * Pace autoregulation from recent run RIR (10 - session RPE), oldest first.
 * Two easy runs nudge paces 1% faster; two maxed-out runs ease them 1.5%.
 *
 * @param recentRir recent run RIR values, oldest first
 */
export function runningPaceFactor(recentRir: number[]): number {
  if (recentRir.length < 2) return 1;
  const last2 = recentRir.slice(-2);
  if (last2.every((r) => r >= 3)) return 0.99;
  if (last2.every((r) => r === 0)) return 1.015;
  return 1;
}

export type RunConditionKey = 'normal' | 'heat' | 'wind' | 'rain';

/**
 * Seconds-per-kilometre added to every pace target to compensate for
 * environmental conditions. Heat is the most aggressive (cardiac drift
 * adds ~10-20 bpm at race pace), wind / rain a little less.
 */
export function paceAdjustmentForConditions(c: RunConditionKey): number {
  if (c === 'heat') return 15;
  if (c === 'wind') return 8;
  if (c === 'rain') return 5;
  return 0;
}

/**
 * Apply both the conditions-based offset and the athlete's manual EF
 * adjustment to a target pace. Returns null when the input itself is
 * null so steps without a pace (warm-ups, etc.) round-trip safely.
 */
export function adjustedTargetPace(
  basePaceSecPerKm: number | null,
  conditions: RunConditionKey | undefined,
  efAdjustment: number | undefined | null,
  isEfStep: boolean,
): number | null {
  if (basePaceSecPerKm === null || basePaceSecPerKm === undefined) return null;
  let pace = basePaceSecPerKm;
  pace += paceAdjustmentForConditions(conditions ?? 'normal');
  if (isEfStep && typeof efAdjustment === 'number' && Number.isFinite(efAdjustment)) {
    pace += efAdjustment;
  }
  return Math.round(pace);
}

/**
 * Heart-rate guide for an EF session under heat. Returns a target
 * range derived from a simple percentage of HRmax (208 - 0.7 * age
 * Tanaka formula), capped to a sensible aerobic band. The actual HR
 * monitor reading is not required by the UI — this is informational
 * so the athlete can self-regulate when pace lies.
 */
export interface HeatHrTarget {
  lower: number;
  upper: number;
}
export function heatHrTargetForEf(ageYears: number = 35): HeatHrTarget {
  const hrMax = Math.max(160, Math.min(220, 208 - 0.7 * ageYears));
  // EF sits around 65-75 % HRmax. In the heat we suggest the lower
  // half of the band so the athlete keeps the same internal load.
  return {
    lower: Math.round(hrMax * 0.65),
    upper: Math.round(hrMax * 0.72),
  };
}

function steady(label: string, minutes: number, pace: number | null): RunningSessionStep {
  return {
    kind: 'steady',
    label,
    durationSeconds: minutes * 60,
    targetPaceSecPerKm: pace,
    distanceMeters: null,
  };
}

function warmup(paces: VDOTPaces, minutes: number = 12): RunningSessionStep {
  return {
    kind: 'warmup',
    label: 'Échauffement',
    durationSeconds: minutes * 60,
    targetPaceSecPerKm: paces.E_slow,
    distanceMeters: null,
  };
}

function cooldown(paces: VDOTPaces, minutes: number = 10): RunningSessionStep {
  return {
    kind: 'cooldown',
    label: 'Retour au calme',
    durationSeconds: minutes * 60,
    targetPaceSecPerKm: paces.E_slow,
    distanceMeters: null,
  };
}

/**
 * 4 × 20 s @ R pace + 60 s walk between, smooth acceleration. Used as the
 * tail of an EF (Block 1 strides) and inside the quality warm-up.
 */
function stridesBlock(paces: VDOTPaces, reps: number = 4): RunningSessionStep[] {
  const steps: RunningSessionStep[] = [];
  for (let i = 1; i <= reps; i += 1) {
    steps.push({
      kind: 'work',
      label: `Foulée ${i}/${reps} · 20 s`,
      durationSeconds: 20,
      targetPaceSecPerKm: paces.R,
      distanceMeters: null,
    });
    if (i < reps) {
      steps.push({
        kind: 'recovery',
        label: 'Marche 60 s',
        durationSeconds: 60,
        targetPaceSecPerKm: paces.E_slow + 120,
        distanceMeters: null,
      });
    }
  }
  return steps;
}

/**
 * Daniels' canonical quality warm-up: 15 min easy + 4 strides. Strides
 * activate neuromuscular pathways before the main set without piling
 * fatigue, so the first interval doesn't feel like cold-start work.
 */
function qualityWarmup(paces: VDOTPaces): RunningSessionStep[] {
  return [warmup(paces, 15), ...stridesBlock(paces, 4)];
}

function workStep(label: string, minutes: number, pace: number): RunningSessionStep {
  return {
    kind: 'work',
    label,
    durationSeconds: minutes * 60,
    targetPaceSecPerKm: pace,
    distanceMeters: null,
  };
}

function workDistance(label: string, meters: number, pace: number): RunningSessionStep {
  return {
    kind: 'work',
    label,
    durationSeconds: null,
    targetPaceSecPerKm: pace,
    distanceMeters: meters,
  };
}

function recoveryStep(minutes: number, pace: number): RunningSessionStep {
  return {
    kind: 'recovery',
    label: 'Récupération',
    durationSeconds: minutes * 60,
    targetPaceSecPerKm: pace,
    distanceMeters: null,
  };
}

/**
 * Equal work-to-rest interval recovery (1:1) — Daniels' rule for VO2max
 * reps. For 1000 m at I pace ≈ rep duration in minutes.
 */
function intervalRest(repMeters: number, pace: number, paces: VDOTPaces): RunningSessionStep {
  const repSec = (repMeters / 1000) * pace;
  return recoveryStep(Math.max(1, Math.round(repSec / 60)), paces.E_slow);
}

function durationOfSteps(steps: RunningSessionStep[]): number {
  let total = 0;
  for (const s of steps) {
    if (s.durationSeconds) {
      total += s.durationSeconds;
      continue;
    }
    if (s.distanceMeters && s.targetPaceSecPerKm) {
      total += (s.distanceMeters / 1000) * s.targetPaceSecPerKm;
    }
  }
  return total;
}

function distanceOfSteps(steps: RunningSessionStep[]): number {
  let total = 0;
  for (const s of steps) {
    if (s.distanceMeters) {
      total += s.distanceMeters;
      continue;
    }
    if (s.durationSeconds && s.targetPaceSecPerKm && s.targetPaceSecPerKm > 0) {
      total += (s.durationSeconds / s.targetPaceSecPerKm) * 1000;
    }
  }
  return total / 1000;
}

/**
 * Long-run duration (minutes), derived from the athlete's VDOT at generation
 * time so it tracks fitness automatically. Daniels' guidance: ~25-30 % of
 * weekly volume, capped by absorption capacity per level. The base steps up
 * with VDOT, then +5 min per week within a block and +10 min per block; week 4
 * is the deload (~70 % of base). Bounded 55-120 min.
 */
export function getLongRunDuration(vdot: number, block: number, week: number): number {
  // Tiers set so the worked examples hold: VDOT 35 → 60 (débutant), 42 → 70.
  const baseByVdot =
    vdot < 40 ? 60 : // débutant
    vdot < 45 ? 70 : // intermédiaire bas
    vdot < 50 ? 80 : // intermédiaire
    vdot < 55 ? 90 : // intermédiaire haut
    100;             // avancé

  const blockDelta = (block - 1) * 10;

  // Week-4 deload: 70 % of THIS block's baseline, so it scales per block
  // (B1/B2/B3 → 40/50/55 at VDOT 35) rather than being flat.
  if (week === 4) return Math.round(((baseByVdot + blockDelta) * 0.70) / 5) * 5;

  const weekDelta = (week - 1) * 5;
  return Math.min(120, Math.max(55, baseByVdot + weekDelta + blockDelta));
}

/**
 * Easy-run (EF) duration (minutes) from VDOT — a lighter progression than the
 * long run: +3 min per week within a block, +5 min per block; week 4 deload
 * (~75 % of base). Bounded 30-75 min.
 */
export function getEFDuration(
  vdot: number,
  block: number,
  week: number,
  goal: RunningGoal = 'semi_marathon',
): number {
  // 5k: easy runs stay deliberately short — they are recovery between the hard
  // quality sessions, not volume builders. Week 4 trims further.
  if (goal === '5k') return week === 4 ? 20 : 25;

  // Same VDOT tiers as the long run (shifted so VDOT 35 is the débutant tier).
  const baseByVdot =
    vdot < 40 ? 35 :
    vdot < 45 ? 45 :
    vdot < 50 ? 50 :
    vdot < 55 ? 55 :
    60;

  const blockDelta = (block - 1) * 5;

  // Week-4 deload: 75 % of this block's baseline (per block, like the long run).
  if (week === 4) return Math.round(((baseByVdot + blockDelta) * 0.75) / 5) * 5;

  const weekDelta = (week - 1) * 3;
  return Math.min(75, Math.max(30, baseByVdot + weekDelta + blockDelta));
}

/**
 * Map a 1-based absolute programme week onto the 3-block × 4-week meso-cycle:
 * weeks 1-4 → block 1, 5-8 → block 2, 9-12 → block 3, then it wraps. Running
 * queue items carry the absolute week, so this recovers the block / week-in-block
 * the session engine needs (long-run progression, block-specific work).
 */
export function blockWeekForAbsoluteWeek(absoluteWeek: number): {
  block: ProgramBlockRunning;
  week: WeekIndexRunning;
} {
  const w = Math.max(1, Math.floor(absoluteWeek));
  const zeroBased = (w - 1) % 12;
  const block = (Math.floor(zeroBased / 4) + 1) as ProgramBlockRunning;
  const week = ((zeroBased % 4) + 1) as WeekIndexRunning;
  return { block, week };
}

export function buildSessionPlan(params: BuildSessionParams): RunningSessionPlan {
  const { type, paces, level, block, week, vdot } = params;
  const goal = params.goal ?? 'semi_marathon';
  // 5k sessions stay short (≤ ~40 min): lighter quality warm-up / cool-down and
  // a capped tempo, so the athlete can absorb frequent hard work.
  const short5k = goal === '5k';
  const qWarm = short5k ? [warmup(paces, 8), ...stridesBlock(paces, 3)] : qualityWarmup(paces);
  const cdMin = short5k ? 6 : 10;
  let steps: RunningSessionStep[] = [];
  let message = '';

  switch (type) {
    case 'EF': {
      const isRecovery = params.recovery === true;
      // Duration scales with VDOT (and block/week); week 4 is the deload.
      const baseMinutes = getEFDuration(vdot, block, week, goal);
      const efPace = isRecovery ? paces.E_slow : paces.E_fast;
      steps = [
        steady(
          isRecovery ? 'Endurance · récupération' : 'Endurance fondamentale',
          baseMinutes,
          efPace,
        ),
      ];
      if (params.withStrides && !isRecovery) {
        steps.push(...stridesBlock(paces, 4));
      }
      if (isRecovery) {
        message =
          'Récupération sur jambes. Plus lent que ton EF classique, le corps absorbe la séance d’hier.';
      } else if (params.withStrides) {
        message =
          'Allure conversationnelle. Termine par 4 × 20 s de foulées vives mais relâchées : pas un sprint, une accélération propre.';
      } else {
        message = 'Allure conversationnelle. Tu peux tenir un dialogue complet.';
      }
      break;
    }
    case 'SL': {
      // Long-run duration scales with the athlete's VDOT and builds across the
      // block (see getLongRunDuration); week 4 is the deload. The last quarter
      // (capped at 20 min) drops to E_slow so fatigue accumulates without
      // breaking form. Distance is derived from duration × easy pace below.
      const minutes = getLongRunDuration(vdot, block, week);
      const slowMinutes = Math.min(20, Math.round(minutes / 4));
      const fastMinutes = Math.max(10, minutes - slowMinutes);
      steps = [
        steady('Sortie longue · allure facile', fastMinutes, paces.E_fast),
        steady('Sortie longue · dernière partie', slowMinutes, paces.E_slow),
      ];
      message =
        week === 4
          ? 'Sortie longue allégée. On garde la routine sans casser les jambes.'
          : 'Reste sur le pied gauche du couloir. Les 20 dernières minutes, lâche un peu l’allure : la fatigue se construit sans casser la foulée.';
      break;
    }
    case 'TC': {
      // 10-min warm-up + 20-40 min tempo + 10-min cool-down (Daniels T pace).
      // Quality warm-up includes 4 strides to pre-activate the legs.
      const minutes = short5k
        ? 20
        : level === 'beginner' ? 20 : level === 'intermediate' ? 30 : 40;
      steps = [
        ...qWarm,
        workStep(`Tempo continu · ${minutes} min`, minutes, paces.T),
        cooldown(paces, cdMin),
      ];
      message =
        'Comfortably hard. Trois mots, pas une phrase complète. Tiens la même allure du début à la fin.';
      break;
    }
    case 'TB': {
      // Cruise intervals: 3-4 × 8-10 min @ T with 1-min rest (Daniels).
      const blocks = level === 'beginner' ? 3 : 4;
      const blockMin = level === 'beginner' ? 8 : 10;
      steps = [...qWarm];
      for (let i = 1; i <= blocks; i += 1) {
        steps.push(
          workStep(`Bloc tempo ${i}/${blocks} · ${blockMin} min`, blockMin, paces.T),
        );
        if (i < blocks) steps.push(recoveryStep(1, paces.E_slow));
      }
      steps.push(cooldown(paces, cdMin));
      message = 'Le seuil par paliers. Garde la même allure sur chaque bloc, 1 min de jog entre.';
      break;
    }
    case 'IV': {
      // Block 3: race-pace 800 m intervals (5-6 × 800 m, 2 min rest).
      // Block 1/2: classic VO2max 1000 m reps at I pace, 1:1 rest.
      if (short5k) {
        // 5k VO2max: short 800 m reps with a fixed 2-min recovery, rep count
        // capped so the whole session stays ≲ 40 min even at low VDOT (where
        // reps run slow). Block 3 uses race pace, earlier blocks I pace.
        const reps = level === 'beginner' ? 3 : level === 'intermediate' ? 4 : 5;
        const pace5k =
          block === 3 ? racePace(paces, params.goalDistance, params.goalTimeSeconds) : paces.I;
        steps = [...qWarm];
        for (let i = 1; i <= reps; i += 1) {
          steps.push(workDistance(`Intervalle ${i}/${reps} · 800 m`, 800, pace5k));
          if (i < reps) steps.push(recoveryStep(1.5, paces.E_slow));
        }
        steps.push(cooldown(paces, cdMin));
        message =
          'VO2max format 5 km : reps courts et vifs, récup complète entre chaque. Régularité, pas héroïsme.';
        break;
      }
      if (block === 3) {
        const reps =
          level === 'beginner' ? 4 : level === 'intermediate' ? 5 : 6;
        const pace = racePace(paces, params.goalDistance, params.goalTimeSeconds);
        steps = [...qWarm];
        for (let i = 1; i <= reps; i += 1) {
          steps.push(
            workDistance(`Intervalle ${i}/${reps} · 800 m allure course`, 800, pace),
          );
          if (i < reps) steps.push(recoveryStep(2, paces.E_slow));
        }
        steps.push(cooldown(paces, cdMin));
        message =
          'Intervalles à l’allure visée. Sens la cadence et la position du corps, pas la souffrance.';
      } else {
        const reps =
          level === 'beginner' ? 3 : level === 'intermediate' ? 4 : 5;
        steps = [...qWarm];
        for (let i = 1; i <= reps; i += 1) {
          steps.push(workDistance(`Intervalle ${i}/${reps} · 1000 m`, 1000, paces.I));
          if (i < reps) steps.push(intervalRest(1000, paces.I, paces));
        }
        steps.push(cooldown(paces, cdMin));
        message = 'VO2max. Les premiers intervalles paraissent faciles, ne te grille pas.';
      }
      break;
    }
    case 'RV': {
      // 6-10 × 200 m or 4-6 × 400 m @ R, with 2-3 min rest between reps.
      if (short5k) {
        // 5k speed reps: compact 200 m at R with 90 s recovery — economy and
        // top-end speed, kept ≲ 35 min total.
        const reps5k = level === 'advanced' ? 8 : 6;
        steps = [...qWarm];
        for (let i = 1; i <= reps5k; i += 1) {
          steps.push(workDistance(`Répétition ${i}/${reps5k} · 200 m`, 200, paces.R));
          if (i < reps5k) steps.push(recoveryStep(1.5, paces.E_slow + 90));
        }
        steps.push(cooldown(paces, cdMin));
        message =
          'Vitesse pure sur 200 m : foulée vive et relâchée, récup complète. On travaille l’économie, pas le lactique.';
        break;
      }
      const distance = level === 'advanced' ? 400 : 200;
      const reps =
        level === 'beginner' ? 6 : level === 'intermediate' ? 8 : 5;
      const restMin = level === 'beginner' ? 2 : 3;
      steps = [...qWarm];
      for (let i = 1; i <= reps; i += 1) {
        steps.push(workDistance(`Répétition ${i}/${reps} · ${distance} m`, distance, paces.R));
        if (i < reps) steps.push(recoveryStep(restMin, paces.E_slow + 90));
      }
      steps.push(cooldown(paces, cdMin));
      message = 'Court mais sec. Récupère complètement entre chaque répétition, allure vive mais détendue.';
      break;
    }
    case 'RA': {
      const minutes = 25;
      steps = [steady('Récupération active', minutes, paces.E_slow + 45)];
      message = 'Plus lent que ton allure facile. Si ça ressemble à un effort, ralentis.';
      break;
    }
    case 'CO': {
      // Block 1 strength session. 60-90 s uphill at ~I effort, walk down
      // recovery. Builds running-specific strength and stride power without
      // the impact cost of flat speed work.
      const reps =
        level === 'beginner' ? 6 : level === 'intermediate' ? 8 : 10;
      steps = [...qWarm];
      for (let i = 1; i <= reps; i += 1) {
        steps.push({
          kind: 'work',
          label: `Côte ${i}/${reps} · 75 s en montée`,
          durationSeconds: 75,
          targetPaceSecPerKm: paces.I,
          distanceMeters: null,
        });
        steps.push({
          kind: 'recovery',
          label: 'Marche descente · 90 s',
          durationSeconds: 90,
          targetPaceSecPerKm: paces.E_slow + 120,
          distanceMeters: null,
        });
      }
      steps.push(cooldown(paces, cdMin));
      message =
        'Pousse contre la pente avec une foulée courte et active. Récupère complètement à la descente.';
      break;
    }
    case 'AS': {
      // Race-pace continuous block. Pace comes from goal time when set,
      // otherwise from the Daniels zone matching the goal distance.
      const minutes =
        level === 'beginner' ? 20 : level === 'intermediate' ? 25 : 30;
      const pace = racePace(paces, params.goalDistance, params.goalTimeSeconds);
      steps = [
        ...qWarm,
        workStep(`Allure spécifique · ${minutes} min`, minutes, pace),
        cooldown(paces, cdMin),
      ];
      message =
        'Ancre l’allure de course dans le corps. Cadence stable, foulée économique, respiration maîtrisée.';
      break;
    }
  }

  // Weave the athlete's goal target into the session message so each
  // workout is explicitly framed against the race they're preparing for.
  if (
    params.goalTimeSeconds &&
    params.goalTimeSeconds > 0 &&
    params.goalDistance
  ) {
    const goalLabel = RACE_LABEL[params.goalDistance];
    const goalTime = formatElapsed(params.goalTimeSeconds);
    message += ` Cette sortie te prépare pour ${goalTime} au ${goalLabel.toLowerCase()}.`;
  }

  const factor = params.paceFactor ?? 1;
  const adjustedSteps =
    factor === 1
      ? steps
      : steps.map((s) => ({
          ...s,
          targetPaceSecPerKm:
            s.targetPaceSecPerKm != null
              ? Math.round(s.targetPaceSecPerKm * factor)
              : null,
        }));

  if (factor < 1) {
    message += ' Tes 2 dernières sorties étaient faciles : allures légèrement accélérées.';
  } else if (factor > 1) {
    message += ' Tes 2 dernières sorties étaient très dures : allures assouplies pour récupérer.';
  }

  const dur = durationOfSteps(adjustedSteps);
  const dist = distanceOfSteps(adjustedSteps);
  return {
    type,
    name: sessionName(type),
    purpose: sessionPurpose(type),
    rpe: sessionRpe(type),
    steps: adjustedSteps,
    estimatedDurationMin: Math.round(dur / 60),
    estimatedDistanceKm: Math.round(dist * 10) / 10,
    message,
  };
}

export interface WeeklyPlanItem {
  dayIndex: number;
  type: RunningSessionType | 'REST';
  /** Append 4 × 20 s strides at R pace after the EF run. */
  withStrides?: boolean;
  /** EF / SL slot used as a deliberate recovery day (shorter, slower). */
  recovery?: boolean;
}

export interface WeeklyPlan {
  items: WeeklyPlanItem[];
}

// Per-block weekly templates. Each entry can carry strides / recovery
// flags that propagate into the build call so the session label and pace
// match what the athlete actually opens.
type TemplateSlot = {
  type: RunningSessionType;
  withStrides?: boolean;
  recovery?: boolean;
};

/** EF / SL plus the `EF_strides` shorthand (an easy run finished with 4
 *  strides). Quality codes (CO/IV/RA/…) map straight to their session type. */
type WeeklySessionType = RunningSessionType | 'EF_strides';

/**
 * Choose the week's session types from the athlete's VDOT and the block,
 * introducing quality work progressively while keeping the Seiler 80/20 easy
 * bias. Low VDOT = pure aerobic base; tempo/hills then intervals appear as VDOT
 * climbs.
 *
 * Invariants:
 *   - returns EXACTLY `sessionsPerWeek` sessions (2-6), never more,
 *   - the long run (SL) is always the last session (except on a deload week),
 *   - a deload week is easy-only (all EF, no long run).
 *
 * The hand-tuned patterns target 2-3 sessions/week; 4-6 reuse the same quality
 * core and pad easy volume (one strides day, then plain EF) ahead of the long
 * run, so higher frequencies never collapse back to 3 sessions.
 */
/**
 * Pad a base weekly pattern up to `n` sessions, keeping a trailing SL last and
 * adding easy volume (one strides day first, then plain EF) so higher
 * frequencies never collapse back to the 2-3 session core.
 */
function padToCount(base: WeeklySessionType[], n: number): WeeklySessionType[] {
  if (n <= base.length) return base;
  const hasSL = base[base.length - 1] === 'SL';
  const core = hasSL ? base.slice(0, base.length - 1) : base;
  const filler: WeeklySessionType[] = [];
  for (let i = 0; i < n - base.length; i += 1) filler.push(i === 0 ? 'EF_strides' : 'EF');
  return hasSL ? [...core, ...filler, 'SL'] : [...core, ...filler];
}

/**
 * 5k: no long run. Short tempo (TC), VO2max intervals (IV) and speed reps (RV)
 * carry the work; the aerobic base still comes from EF / EF+strides. NB: the
 * task brief's "CO"/"RA" shorthand map to TC / RV here — in this codebase CO is
 * hill repeats and RA is active recovery, so using them literally would give a
 * hills + active-recovery week instead of the intended tempo + speed reps.
 */
function fiveKBase(vdot: number, block: number, n: number): WeeklySessionType[] {
  if (vdot < 35) {
    return n === 2 ? ['EF_strides', 'IV'] : ['EF', 'EF_strides', 'IV'];
  }
  if (vdot < 40) {
    if (block === 1) return n === 2 ? ['EF_strides', 'IV'] : ['EF', 'EF_strides', 'IV'];
    return n === 2 ? ['TC', 'IV'] : ['EF_strides', 'TC', 'IV'];
  }
  if (vdot < 45) {
    if (block === 1) return n === 2 ? ['TC', 'IV'] : ['EF', 'TC', 'IV'];
    return n === 2 ? ['IV', 'RV'] : ['TC', 'IV', 'RV'];
  }
  return n === 2 ? ['IV', 'RV'] : ['TC', 'IV', 'RV'];
}

/** 10k: threshold (TC) + VO2max, with a medium long run (SL) from block 2. */
function tenKBase(vdot: number, block: number, n: number): WeeklySessionType[] {
  if (vdot < 40) {
    return n === 2 ? ['EF_strides', 'TC'] : ['EF', 'EF_strides', 'TC'];
  }
  if (block === 1) {
    return n === 2 ? ['TC', 'IV'] : ['EF', 'TC', 'IV'];
  }
  return n === 2 ? ['TC', 'SL'] : ['EF', 'TC', 'SL'];
}

/** Forme (stay fit): mostly easy, at most one light tempo. */
function formeBase(n: number): WeeklySessionType[] {
  return n === 2 ? ['EF', 'EF_strides'] : ['EF', 'EF_strides', 'TC'];
}

export function getWeeklySessionTypes(
  vdot: number,
  block: number,
  sessionsPerWeek: number,
  isDeload: boolean,
  goal: RunningGoal = 'semi_marathon',
): WeeklySessionType[] {
  const n = Math.max(2, Math.min(6, Math.round(sessionsPerWeek)));

  // Deload week: easy only, no long run — exactly n easy runs.
  if (isDeload) return Array<WeeklySessionType>(n).fill('EF');

  // Goal-specific vocabularies. 5k drops the long run entirely; 10k keeps a
  // medium SL; forme stays almost all easy. Semi/marathon fall through to the
  // original SL-based periodisation below.
  if (goal === '5k') return padToCount(fiveKBase(vdot, block, n), n);
  if (goal === '10k') return padToCount(tenKBase(vdot, block, n), n);
  if (goal === 'forme') return padToCount(formeBase(n), n);

  // VDOT < 40 — pure aerobic base: (n-1) easy runs (last carries strides) + SL.
  if (vdot < 40) {
    const easy: WeeklySessionType[] = Array<WeeklySessionType>(Math.max(1, n - 1)).fill('EF');
    easy[easy.length - 1] = 'EF_strides';
    return [...easy, 'SL'];
  }

  // Higher VDOT: a quality core that grows with VDOT and block. The n=2 week
  // drops the plain EF and keeps [quality, SL]; n>=3 keeps an easy day too.
  let base: WeeklySessionType[];
  if (vdot < 45) {
    if (block === 1) base = n === 2 ? ['EF_strides', 'SL'] : ['EF', 'CO', 'SL'];
    else base = n === 2 ? ['CO', 'SL'] : ['EF', 'CO', 'SL'];
  } else if (block === 1) {
    base = n === 2 ? ['CO', 'SL'] : ['EF', 'CO', 'SL'];
  } else if (block === 2) {
    base = n === 2 ? ['IV', 'SL'] : ['CO', 'IV', 'SL'];
  } else {
    base = n === 2 ? ['IV', 'SL'] : ['IV', 'RA', 'SL'];
  }

  if (n <= base.length) return base;

  // 4-6 sessions: keep the quality core, pad easy volume (one strides day first)
  // before the long run, so the total always equals n.
  const head = base.slice(0, base.length - 1);
  const filler: WeeklySessionType[] = [];
  for (let i = 0; i < n - base.length; i += 1) {
    filler.push(i === 0 ? 'EF_strides' : 'EF');
  }
  return [...head, ...filler, 'SL'];
}

/** Expand a WeeklySessionType into a build slot (EF_strides → EF + strides). */
function toTemplateSlot(t: WeeklySessionType): TemplateSlot {
  if (t === 'EF_strides') return { type: 'EF', withStrides: true };
  return { type: t };
}

const DAY_LAYOUT: Record<number, number[]> = {
  2: [1, 5],
  3: [1, 3, 5],
  4: [0, 2, 4, 6],
  5: [0, 1, 3, 4, 6],
  6: [0, 1, 2, 3, 5, 6],
};

export function getWeeklyDistribution(
  sessionsPerWeek: number,
  block: ProgramBlockRunning,
  week: WeekIndexRunning,
  vdot: number,
  goal: RunningGoal = 'semi_marathon',
): WeeklyPlan {
  const sessions = Math.max(2, Math.min(6, sessionsPerWeek));
  const deload = week === 4;
  const seq: TemplateSlot[] = getWeeklySessionTypes(vdot, block, sessions, deload, goal).map(toTemplateSlot);
  const days = DAY_LAYOUT[sessions] ?? [0, 2, 4, 6];
  // On deload, getWeeklySessionTypes already returns easy-only (no long run);
  // mark every slot recovery so the pace eases (E_slow) and the duration uses
  // getEFDuration's week-4 branch.
  const adjusted: TemplateSlot[] = deload
    ? seq.map((slot) => ({ type: slot.type, recovery: true }))
    : seq;
  const items: WeeklyPlanItem[] = [];
  for (let d = 0; d < 7; d += 1) {
    const slotIdx = days.indexOf(d);
    if (slotIdx === -1) {
      items.push({ dayIndex: d, type: 'REST' });
      continue;
    }
    const slot = adjusted[slotIdx] ?? { type: 'EF' };
    items.push({
      dayIndex: d,
      type: slot.type,
      withStrides: slot.withStrides,
      recovery: slot.recovery,
    });
  }
  return { items };
}

export interface RunningZoneAdaptation {
  shouldReplaceWithRA: boolean;
  shouldDowngradeIntensity: boolean;
  canExtend: boolean;
  message: string;
}

export function adaptRunningSessionToZone(
  type: RunningSessionType,
  zoneScore: number | null,
): RunningZoneAdaptation {
  if (zoneScore === null) {
    return {
      shouldReplaceWithRA: false,
      shouldDowngradeIntensity: false,
      canExtend: false,
      message: 'Pas de check-in aujourd’hui. On exécute le plan en restant à l’écoute.',
    };
  }
  if (zoneScore <= 30) {
    return {
      shouldReplaceWithRA: true,
      shouldDowngradeIntensity: false,
      canExtend: false,
      message:
        'Ton corps est en récupération profonde. Une marche active vaut mieux qu’une séance ratée.',
    };
  }
  if (zoneScore <= 50) {
    const intense = type === 'IV' || type === 'RV' || type === 'TC' || type === 'TB';
    return {
      shouldReplaceWithRA: false,
      shouldDowngradeIntensity: intense,
      canExtend: false,
      message:
        'Pas le jour pour l’intensité. Tu construis en restant dans la zone verte.',
    };
  }
  if (zoneScore <= 75) {
    return {
      shouldReplaceWithRA: false,
      shouldDowngradeIntensity: false,
      canExtend: false,
      message:
        'Les jambes sont disponibles. Exécute le plan, pas de sur-régime.',
    };
  }
  return {
    shouldReplaceWithRA: false,
    shouldDowngradeIntensity: false,
    canExtend: true,
    message: 'Tu es dans la zone. Si les jambes s’envolent, laisse-les.',
  };
}

export function paceFeedback(
  currentPaceSecPerKm: number,
  targetPaceSecPerKm: number,
  context: 'work' | 'easy',
): string {
  if (!Number.isFinite(currentPaceSecPerKm) || currentPaceSecPerKm <= 0) return '';
  const delta = currentPaceSecPerKm - targetPaceSecPerKm;
  if (context === 'work') {
    if (delta < -10) return '⬇️ Tu peux accélérer';
    if (delta <= 10) return '✓ Parfait';
    if (delta <= 30) return '⬆️ Ralentis, préserve le prochain interval';
    return '⚠️ Trop vite, tu hypothèques la séance';
  }
  if (delta < -30) return '⬇️ Ralentis, tu grilles de l’énergie précieuse';
  if (delta <= 20) return '✓ Bonne allure';
  return '⬆️ Accélère légèrement';
}
