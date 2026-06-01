export type RaceDistance = '5km' | '10km' | 'semi' | 'marathon';

export type RunningSessionType = 'EF' | 'SL' | 'TC' | 'TB' | 'IV' | 'RV' | 'RA';

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

export function vdotFromEasyPace(easyPaceSecPerKm: number): number {
  if (easyPaceSecPerKm <= 0) return 30;
  const easyPaceMin = easyPaceSecPerKm / 60;
  const vdot = (480 - easyPaceMin * 60) / 3;
  return Math.max(20, Math.min(90, Math.round(vdot)));
}

export function calculateVDOTPaces(vdot: number): VDOTPaces {
  const safe = Math.max(20, Math.min(90, vdot));
  const E_fastPer400 = 29.54 + 5.000663 * safe - 0.007546 * safe * safe;
  const E_fast = Math.max(180, Math.round(E_fastPer400 * 2.5));
  const E_slow = Math.round(E_fast + safe * 0.3 + 25);
  const T = Math.max(150, Math.round(E_fast - safe * 2.1));
  const I = Math.max(140, Math.round(T - safe * 1.8));
  const R = Math.max(120, Math.round(I - safe * 1.2));
  const M = Math.round(T + 25);
  return { E_slow, E_fast, M, T, I, R };
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
};

const SESSION_PURPOSES: Record<RunningSessionType, string> = {
  EF: 'Base aérobie, densité mitochondriale, oxydation des graisses.',
  SL: 'Endurance fondamentale longue, économie de course, mental.',
  TC: 'Élévation du seuil lactique en continu.',
  TB: 'Travail au seuil fractionné, plus accessible.',
  IV: 'VO2max. Adaptation cardiaque maximale.',
  RV: 'Économie de course, vitesse et neuromusculaire.',
  RA: 'Récupération active, circulation, élimination lactique.',
};

const SESSION_RPE: Record<RunningSessionType, string> = {
  EF: 'RPE 3-4/10',
  SL: 'RPE 3/10',
  TC: 'RPE 7/10',
  TB: 'RPE 7/10',
  IV: 'RPE 9/10',
  RV: 'RPE 10/10',
  RA: 'RPE 1-2/10',
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
  /** Autoregulation multiplier on target paces (<1 faster, >1 slower). */
  paceFactor?: number;
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

function steady(label: string, minutes: number, pace: number | null): RunningSessionStep {
  return {
    kind: 'steady',
    label,
    durationSeconds: minutes * 60,
    targetPaceSecPerKm: pace,
    distanceMeters: null,
  };
}

function warmup(paces: VDOTPaces): RunningSessionStep {
  return {
    kind: 'warmup',
    label: 'Échauffement',
    durationSeconds: 15 * 60,
    targetPaceSecPerKm: paces.E_slow,
    distanceMeters: null,
  };
}

function cooldown(paces: VDOTPaces): RunningSessionStep {
  return {
    kind: 'cooldown',
    label: 'Retour au calme',
    durationSeconds: 10 * 60,
    targetPaceSecPerKm: paces.E_slow,
    distanceMeters: null,
  };
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

function recoveryStep(minutes: number, pace: number): RunningSessionStep {
  return {
    kind: 'recovery',
    label: 'Récupération',
    durationSeconds: minutes * 60,
    targetPaceSecPerKm: pace,
    distanceMeters: null,
  };
}

function reps200(count: number, pace: number, paces: VDOTPaces): RunningSessionStep[] {
  const steps: RunningSessionStep[] = [];
  for (let i = 1; i <= count; i += 1) {
    steps.push({
      kind: 'work',
      label: `Répétition ${i}/${count} · 200 m`,
      durationSeconds: null,
      targetPaceSecPerKm: pace,
      distanceMeters: 200,
    });
    steps.push({
      kind: 'recovery',
      label: 'Récupération marchée 200 m',
      durationSeconds: null,
      targetPaceSecPerKm: paces.E_slow + 60,
      distanceMeters: 200,
    });
  }
  return steps;
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

export function buildSessionPlan(params: BuildSessionParams): RunningSessionPlan {
  const { type, paces, level } = params;
  let steps: RunningSessionStep[] = [];
  let message = '';

  switch (type) {
    case 'EF': {
      const minutes = level === 'beginner' ? 35 : level === 'intermediate' ? 50 : 60;
      steps = [steady('Endurance fondamentale', minutes, paces.E_fast)];
      message = 'Allure conversationnelle. Tu peux tenir un dialogue complet.';
      break;
    }
    case 'SL': {
      const minutes = level === 'beginner' ? 60 : level === 'intermediate' ? 80 : 100;
      steps = [steady('Sortie longue', minutes, paces.E_slow)];
      message = 'Reste sur le pied gauche du couloir. La distance se construit dans la patience.';
      break;
    }
    case 'TC': {
      const minutes = level === 'beginner' ? 20 : level === 'intermediate' ? 25 : 30;
      steps = [warmup(paces), workStep(`Tempo continu ${minutes} min`, minutes, paces.T), cooldown(paces)];
      message = 'Comfortably hard. Trois mots, pas une phrase complète.';
      break;
    }
    case 'TB': {
      const blocks = level === 'beginner' ? 3 : level === 'intermediate' ? 4 : 4;
      const blockMin = level === 'beginner' ? 8 : level === 'intermediate' ? 10 : 12;
      steps = [warmup(paces)];
      for (let i = 1; i <= blocks; i += 1) {
        steps.push(workStep(`Bloc tempo ${i}/${blocks} · ${blockMin} min`, blockMin, paces.T));
        if (i < blocks) steps.push(recoveryStep(3, paces.E_slow));
      }
      steps.push(cooldown(paces));
      message = 'Le seuil par paliers. Garde la même allure sur chaque bloc.';
      break;
    }
    case 'IV': {
      const reps = level === 'beginner' ? 4 : level === 'intermediate' ? 6 : 8;
      const workMin = level === 'beginner' ? 2 : 3;
      steps = [warmup(paces)];
      for (let i = 1; i <= reps; i += 1) {
        steps.push(workStep(`Intervalle ${i}/${reps} · ${workMin} min`, workMin, paces.I));
        steps.push(recoveryStep(workMin, paces.E_slow));
      }
      steps.push(cooldown(paces));
      message = 'VO2max. Les premiers intervalles paraissent faciles, ne te grille pas.';
      break;
    }
    case 'RV': {
      const reps = level === 'beginner' ? 8 : level === 'intermediate' ? 10 : 12;
      steps = [warmup(paces), ...reps200(reps, paces.R, paces), cooldown(paces)];
      message = 'Court mais sec. Récupère complètement entre chaque répétition.';
      break;
    }
    case 'RA': {
      const minutes = 25;
      steps = [
        steady('Récupération active', minutes, paces.E_slow + 45),
      ];
      message = 'Plus lent que ton allure facile. Si ça ressemble à un effort, ralentis.';
      break;
    }
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
}

export interface WeeklyPlan {
  items: WeeklyPlanItem[];
}

function templateForBlock(block: ProgramBlockRunning, sessions: number): RunningSessionType[] {
  const s = Math.max(2, Math.min(6, sessions));
  if (block === 1) {
    const map: Record<number, RunningSessionType[]> = {
      2: ['EF', 'SL'],
      3: ['EF', 'EF', 'SL'],
      4: ['EF', 'EF', 'TC', 'SL'],
      5: ['EF', 'EF', 'TC', 'EF', 'SL'],
      6: ['EF', 'EF', 'TC', 'EF', 'RA', 'SL'],
    };
    return map[s];
  }
  if (block === 2) {
    const map: Record<number, RunningSessionType[]> = {
      2: ['IV', 'SL'],
      3: ['EF', 'IV', 'SL'],
      4: ['EF', 'IV', 'TC', 'SL'],
      5: ['EF', 'IV', 'EF', 'TC', 'SL'],
      6: ['EF', 'IV', 'EF', 'TC', 'RA', 'SL'],
    };
    return map[s];
  }
  const map: Record<number, RunningSessionType[]> = {
    2: ['TC', 'SL'],
    3: ['EF', 'TC', 'SL'],
    4: ['EF', 'IV', 'RV', 'SL'],
    5: ['EF', 'IV', 'EF', 'RV', 'SL'],
    6: ['EF', 'IV', 'EF', 'TC', 'RV', 'SL'],
  };
  return map[s];
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
): WeeklyPlan {
  const sessions = Math.max(2, Math.min(6, sessionsPerWeek));
  const seq = templateForBlock(block, sessions);
  const days = DAY_LAYOUT[sessions] ?? [0, 2, 4, 6];
  // Deload: turn one quality session into EF
  const deload = week === 4;
  const adjusted = deload
    ? seq.map((s) => (s === 'IV' || s === 'RV' || s === 'TC' || s === 'TB' ? 'EF' : s))
    : seq;
  const items: WeeklyPlanItem[] = [];
  for (let d = 0; d < 7; d += 1) {
    const slot = days.indexOf(d);
    items.push({ dayIndex: d, type: slot === -1 ? 'REST' : (adjusted[slot] ?? 'EF') });
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
