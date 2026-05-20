/**
 * Advanced Hypertrophy Science
 *
 * PRIMARY REFERENCE:
 *   Schoenfeld BJ (2010) "The mechanisms of muscle hypertrophy and
 *   their application to resistance training"
 *   Journal of Strength and Conditioning Research, 24(10), 2857-2872.
 *
 * SECONDARY REFERENCES:
 *   Schoenfeld BJ et al. (2016) "Resistance Training Volume Enhances
 *   Muscle Hypertrophy but Not Strength in Trained Men"
 *   Medicine & Science in Sports & Exercise.
 *   Helms ER et al. (2014) "Recommendations for natural bodybuilding"
 *   Israetel M et al. (2019) "Scientific Principles of Hypertrophy
 *   Training" Renaissance Periodization.
 *   Haff GG & Triplett NT (2015) "Essentials of Strength Training and
 *   Conditioning" Human Kinetics.
 *
 * Three mechanisms (Schoenfeld 2010):
 *   1. Mechanical tension  - primary driver (heavy load, full ROM)
 *   2. Metabolic stress    - secondary (high reps, short rest, pump)
 *   3. Muscle damage       - tertiary (eccentric, stretch length)
 */

export type HypertrophyMechanism =
  | 'mechanical_tension'
  | 'metabolic_stress'
  | 'muscle_damage';

export const MECHANISM_PROFILES: Record<
  string,
  Record<HypertrophyMechanism, number>
> = {
  strength: {
    mechanical_tension: 0.8,
    metabolic_stress: 0.1,
    muscle_damage: 0.1,
  },
  hypertrophy: {
    mechanical_tension: 0.45,
    metabolic_stress: 0.35,
    muscle_damage: 0.2,
  },
  mixed: {
    mechanical_tension: 0.55,
    metabolic_stress: 0.3,
    muscle_damage: 0.15,
  },
  fitness: {
    mechanical_tension: 0.3,
    metabolic_stress: 0.5,
    muscle_damage: 0.2,
  },
};

export interface SRAHours {
  low: number;
  high: number;
}

export interface VolumeLandmark {
  MEV: number;
  MAV: number;
  MRV: number;
  SRAhours: SRAHours;
}

export const VOLUME_LANDMARKS: Record<string, VolumeLandmark> = {
  quadriceps: { MEV: 8, MAV: 16, MRV: 22, SRAhours: { low: 48, high: 72 } },
  hamstrings: { MEV: 6, MAV: 12, MRV: 20, SRAhours: { low: 48, high: 72 } },
  glutes: { MEV: 4, MAV: 12, MRV: 16, SRAhours: { low: 36, high: 60 } },
  chest: { MEV: 8, MAV: 16, MRV: 22, SRAhours: { low: 36, high: 60 } },
  upper_back: { MEV: 10, MAV: 18, MRV: 25, SRAhours: { low: 24, high: 48 } },
  lats: { MEV: 8, MAV: 14, MRV: 20, SRAhours: { low: 24, high: 48 } },
  shoulders: { MEV: 6, MAV: 16, MRV: 22, SRAhours: { low: 24, high: 48 } },
  biceps: { MEV: 6, MAV: 14, MRV: 20, SRAhours: { low: 24, high: 36 } },
  triceps: { MEV: 6, MAV: 14, MRV: 20, SRAhours: { low: 24, high: 36 } },
  core: { MEV: 4, MAV: 10, MRV: 16, SRAhours: { low: 12, high: 24 } },
  lower_back: { MEV: 4, MAV: 8, MRV: 12, SRAhours: { low: 48, high: 96 } },
  traps: { MEV: 4, MAV: 12, MRV: 18, SRAhours: { low: 24, high: 48 } },
  calves: { MEV: 6, MAV: 14, MRV: 20, SRAhours: { low: 12, high: 24 } },
};

export type MuscleVolumeStatusKind =
  | 'below_mev'
  | 'suboptimal'
  | 'optimal'
  | 'approaching_mrv'
  | 'at_mrv'
  | 'exceeded_mrv';

export interface MuscleVolumeStatus {
  muscle: string;
  currentWeeklySets: number;
  mev: number;
  mav: number;
  mrv: number;
  percentToMRV: number;
  status: MuscleVolumeStatusKind;
  statusColor: string;
  recommendation: string;
  nextWeekTarget: number;
  /** Which week of the volume progression we're in (1=MEV, 4=MRV). */
  volumeProgressionWeek: number;
}

interface SessionExerciseEntry {
  exerciseId: string;
  sets: { reps: number; weightKg: number }[];
}

interface SessionEntry {
  date: string;
  exercises: SessionExerciseEntry[];
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Track weekly working sets per muscle group across the analysis window.
 *
 * @param completedSessions sessions with completed sets
 * @param exerciseToMuscleMap mapping from exerciseId to muscle groups
 * @param weeksBack analysis window in weeks
 * @returns array of per-muscle status entries
 */
export function trackMuscleVolumeStatus(
  completedSessions: SessionEntry[],
  exerciseToMuscleMap: Record<string, string[]>,
  weeksBack: number,
): MuscleVolumeStatus[] {
  const weeks = Math.max(1, Math.floor(weeksBack));
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const cutoffMs = now.getTime() - weeks * 7 * MS_PER_DAY;

  const setsPerMusclePerWeek: Record<string, number[]> = {};
  for (const muscle of Object.keys(VOLUME_LANDMARKS)) {
    setsPerMusclePerWeek[muscle] = new Array<number>(weeks).fill(0);
  }

  for (const session of completedSessions) {
    const d = parseISODate(session.date);
    if (!d) continue;
    if (d.getTime() < cutoffMs) continue;
    const diffDays = Math.floor((now.getTime() - d.getTime()) / MS_PER_DAY);
    const weekIdx = Math.min(weeks - 1, Math.floor(diffDays / 7));
    for (const ex of session.exercises) {
      const muscles = exerciseToMuscleMap[ex.exerciseId];
      if (!muscles || muscles.length === 0) continue;
      const setCount = ex.sets.filter(
        (s) => s.reps > 0 && s.weightKg > 0,
      ).length;
      if (setCount === 0) continue;
      for (const muscle of muscles) {
        if (!setsPerMusclePerWeek[muscle]) continue;
        setsPerMusclePerWeek[muscle][weekIdx] += setCount;
      }
    }
  }

  const out: MuscleVolumeStatus[] = [];
  for (const muscle of Object.keys(VOLUME_LANDMARKS)) {
    const landmark = VOLUME_LANDMARKS[muscle];
    const perWeek = setsPerMusclePerWeek[muscle];
    const currentWeeklySets = perWeek[0] ?? 0;
    const percentToMRV =
      landmark.MRV > 0
        ? Math.round((currentWeeklySets / landmark.MRV) * 100)
        : 0;
    const status = classifyVolume(currentWeeklySets, landmark);
    const statusColor = colorFor(status);
    const recommendation = recommendationFor(status, landmark);
    const nextWeekTarget = nextTargetFor(currentWeeklySets, landmark);
    const volumeProgressionWeek = progressionWeek(
      currentWeeklySets,
      landmark,
    );
    out.push({
      muscle,
      currentWeeklySets,
      mev: landmark.MEV,
      mav: landmark.MAV,
      mrv: landmark.MRV,
      percentToMRV,
      status,
      statusColor,
      recommendation,
      nextWeekTarget,
      volumeProgressionWeek,
    });
  }
  return out;
}

function classifyVolume(
  sets: number,
  landmark: VolumeLandmark,
): MuscleVolumeStatusKind {
  if (sets <= 0) return 'below_mev';
  if (sets < landmark.MEV) return 'below_mev';
  if (sets < landmark.MAV) return 'suboptimal';
  if (sets < landmark.MRV - 2) return 'optimal';
  if (sets < landmark.MRV) return 'approaching_mrv';
  if (sets === landmark.MRV) return 'at_mrv';
  return 'exceeded_mrv';
}

function colorFor(status: MuscleVolumeStatusKind): string {
  switch (status) {
    case 'below_mev':
      return '#64B5F6';
    case 'suboptimal':
      return '#C9A84C';
    case 'optimal':
      return '#4CAF50';
    case 'approaching_mrv':
      return '#FFB74D';
    case 'at_mrv':
    case 'exceeded_mrv':
    default:
      return '#E57373';
  }
}

function recommendationFor(
  status: MuscleVolumeStatusKind,
  landmark: VolumeLandmark,
): string {
  switch (status) {
    case 'below_mev':
      return `Volume insuffisant. Vise au moins ${landmark.MEV} séries hebdomadaires pour stimuler la croissance.`;
    case 'suboptimal':
      return `Volume correct mais sous-optimal. Monte progressivement vers ${landmark.MAV} séries.`;
    case 'optimal':
      return "Zone d'adaptation maximale. Continue ainsi et progresse de 1 à 2 séries par semaine.";
    case 'approaching_mrv':
      return "Tu approches le plafond. Prépare une décharge dans 1 ou 2 semaines.";
    case 'at_mrv':
      return "Volume au maximum récupérable. Décharge nécessaire la semaine prochaine.";
    case 'exceeded_mrv':
    default:
      return "Volume au-dessus du seuil de récupération. Décharge obligatoire immédiatement.";
  }
}

function nextTargetFor(
  current: number,
  landmark: VolumeLandmark,
): number {
  if (current < landmark.MEV) return landmark.MEV;
  if (current < landmark.MAV) return Math.min(landmark.MAV, current + 2);
  if (current < landmark.MRV - 2) return Math.min(landmark.MRV - 2, current + 1);
  if (current < landmark.MRV) return landmark.MRV;
  return Math.max(landmark.MEV, Math.round(landmark.MEV));
}

function progressionWeek(
  current: number,
  landmark: VolumeLandmark,
): number {
  if (current <= landmark.MEV) return 1;
  if (current < landmark.MAV) return 2;
  if (current < landmark.MRV - 1) return 3;
  return 4;
}

export type SRAPhaseKind =
  | 'stimulus'
  | 'fatigue'
  | 'recovery'
  | 'adaptation'
  | 'supercompensation'
  | 'decay';

export interface SRAPhase {
  phase: SRAPhaseKind;
  hoursElapsed: number;
  readyToTrain: boolean;
  optimalTrainAt: string;
  supercompensationWindow: { start: string; end: string } | null;
  message: string;
}

/**
 * Determine the SRA phase for a muscle group at a point in time.
 *
 * Stimulus-Recovery-Adaptation timeline (Haff & Triplett 2015):
 *   0h                  : stimulus
 *   < SRA.low           : fatigue / recovery
 *   SRA.low - SRA.high  : adaptation / supercompensation window
 *   > SRA.high + 24h    : decay
 *
 * @param muscle muscle group key (must exist in VOLUME_LANDMARKS)
 * @param lastTrainedDate ISO date of the last session
 * @param currentDatetime ISO datetime "now"
 * @param lastSessionIntensity intensity of the last session
 * @returns SRA phase report
 */
export function getSRAPhase(
  muscle: string,
  lastTrainedDate: string,
  currentDatetime: string,
  lastSessionIntensity: 'low' | 'medium' | 'high',
): SRAPhase {
  const landmark = VOLUME_LANDMARKS[muscle];
  const low = landmark?.SRAhours.low ?? 36;
  const high = landmark?.SRAhours.high ?? 60;

  const intensityAdj =
    lastSessionIntensity === 'high'
      ? 1.1
      : lastSessionIntensity === 'low'
        ? 0.85
        : 1;
  const recoveryLow = low * intensityAdj;
  const recoveryHigh = high * intensityAdj;

  const last = parseISODateTime(lastTrainedDate) ?? new Date();
  const now = parseISODateTime(currentDatetime) ?? new Date();
  const hoursElapsed = Math.max(
    0,
    Math.round(((now.getTime() - last.getTime()) / (1000 * 60 * 60)) * 10) / 10,
  );

  let phase: SRAPhaseKind;
  let readyToTrain = false;
  let message: string;

  if (hoursElapsed < 4) {
    phase = 'stimulus';
    message =
      "Stimulus en cours. Le muscle vient d'être sollicité.";
  } else if (hoursElapsed < recoveryLow * 0.5) {
    phase = 'fatigue';
    message =
      "Phase de fatigue aiguë. Repos nécessaire pour amorcer la récupération.";
  } else if (hoursElapsed < recoveryLow) {
    phase = 'recovery';
    message =
      "Récupération active. Évite toute charge supplémentaire sur ce groupe musculaire.";
  } else if (hoursElapsed < recoveryHigh) {
    phase = 'adaptation';
    readyToTrain = true;
    message =
      "Adaptation en cours. Le muscle est prêt à supporter une nouvelle charge.";
  } else if (hoursElapsed < recoveryHigh + 24) {
    phase = 'supercompensation';
    readyToTrain = true;
    message =
      "Fenêtre de supercompensation ouverte. Moment optimal pour entraîner ce groupe.";
  } else {
    phase = 'decay';
    readyToTrain = true;
    message =
      "Décompensation amorcée. Reprends rapidement pour ne pas perdre les acquis.";
  }

  const optimalTrainAt = new Date(
    last.getTime() + ((recoveryLow + recoveryHigh) / 2) * 60 * 60 * 1000,
  );
  const supercompensationWindow = {
    start: new Date(last.getTime() + recoveryHigh * 60 * 60 * 1000).toISOString(),
    end: new Date(
      last.getTime() + (recoveryHigh + 24) * 60 * 60 * 1000,
    ).toISOString(),
  };

  return {
    phase,
    hoursElapsed,
    readyToTrain,
    optimalTrainAt: optimalTrainAt.toISOString(),
    supercompensationWindow,
    message,
  };
}

export type DeloadKind = 'volume' | 'intensity' | 'full';

export interface DeloadProtocol {
  type: DeloadKind;
  durationDays: number;
  volumeReductionPercent: number;
  intensityReductionPercent: number;
  sessionFrequency: number;
  description: string;
  scientificBasis: string;
}

/**
 * Pick a deload protocol from training and recovery signals.
 *
 * @param params training history signals
 * @returns deload protocol
 */
export function selectDeloadProtocol(params: {
  userLevel: string;
  consecutiveHardWeeks: number;
  recentRIRTrend: number[];
  volumeLoadTrend: number[];
  sleepDebtHours: number;
}): DeloadProtocol {
  const {
    userLevel,
    consecutiveHardWeeks,
    recentRIRTrend,
    volumeLoadTrend,
    sleepDebtHours,
  } = params;

  const rirDeclining = isStrictlyDeclining(recentRIRTrend);
  const volumePlateau = isPlateauing(volumeLoadTrend);
  const heavySleepDebt = sleepDebtHours >= 10;

  if (consecutiveHardWeeks >= 10 || (rirDeclining && heavySleepDebt)) {
    return {
      type: 'full',
      durationDays: 7,
      volumeReductionPercent: 70,
      intensityReductionPercent: 40,
      sessionFrequency: 2,
      description:
        "Décharge complète. Une à deux séances très légères, marche, mobilité. Récupération systémique totale.",
      scientificBasis:
        "Renaissance Periodization (Israetel 2019): décharge complète après 10+ semaines de surcharge.",
    };
  }

  if (userLevel === 'avance' || userLevel === 'confirme') {
    return {
      type: 'intensity',
      durationDays: 7,
      volumeReductionPercent: 0,
      intensityReductionPercent: 30,
      sessionFrequency: 3,
      description:
        "Décharge en intensité. Volume maintenu, charges réduites à 60-70%. Volume musculaire préservé.",
      scientificBasis:
        "Helms (2014): athlètes avancés bénéficient d'une décharge en intensité pour préserver la masse.",
    };
  }

  if (volumePlateau || rirDeclining) {
    return {
      type: 'volume',
      durationDays: 7,
      volumeReductionPercent: 50,
      intensityReductionPercent: 0,
      sessionFrequency: 3,
      description:
        "Décharge en volume. Séries divisées par deux, charges maintenues. Tissus conjonctifs et SNC se régénèrent.",
      scientificBasis:
        "Israetel (2019): décharge en volume toutes les 4 semaines pour intermédiaires en plateau.",
    };
  }

  return {
    type: 'volume',
    durationDays: 5,
    volumeReductionPercent: 40,
    intensityReductionPercent: 10,
    sessionFrequency: 3,
    description:
      "Décharge légère préventive. Volume réduit de 40%, intensité presque maintenue.",
    scientificBasis:
      "Haff & Triplett (2015): décharge préventive toutes les 4 semaines pour intermédiaires.",
  };
}

function isStrictlyDeclining(values: number[]): boolean {
  if (values.length < 3) return false;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] >= values[i - 1]) return false;
  }
  return true;
}

function isPlateauing(values: number[]): boolean {
  if (values.length < 3) return false;
  const recent = values.slice(-3);
  const first = recent[0];
  if (first <= 0) return false;
  for (const v of recent) {
    if (Math.abs(((v - first) / first) * 100) > 2) return false;
  }
  return true;
}

function parseISODate(iso: string): Date | null {
  if (!iso || typeof iso !== 'string') return null;
  const parts = iso.split('-');
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseISODateTime(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isNaN(d.getTime())) return d;
  return parseISODate(iso);
}
