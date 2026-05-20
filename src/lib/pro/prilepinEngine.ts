/**
 * Prilepin's Table for Olympic Weightlifting
 *
 * SOURCE:
 *   Prilepin AS (1975) Analysis of 1000+ elite Soviet weightlifters
 *   over 5 years. Weightlifting Yearbook, USSR.
 *   Reproduced in: Zatsiorsky VM & Kraemer WJ (2006)
 *   "Science and Practice of Strength Training" Human Kinetics.
 *
 * Wave loading reference:
 *   Sheiko B (2008) "Powerlifting" All-Russian Federation.
 *
 * Volume and intensity have an inverse optimal relationship. Excess
 * reps at high % cause CNS fatigue and injury risk; too few reps fail
 * to drive adaptation.
 */

export interface PrilepinZone {
  intensityMin: number;
  intensityMax: number;
  repsPerSetMin: number;
  repsPerSetMax: number;
  optimalTotalReps: number;
  totalRepsMin: number;
  totalRepsMax: number;
  optimalSets: number;
  rationale: string;
}

export const PRILEPIN_TABLE: PrilepinZone[] = [
  {
    intensityMin: 55,
    intensityMax: 65,
    repsPerSetMin: 3,
    repsPerSetMax: 6,
    optimalTotalReps: 24,
    totalRepsMin: 18,
    totalRepsMax: 30,
    optimalSets: 5,
    rationale:
      "Zone de volume. Charge légère permet haute fréquence et travail technique.",
  },
  {
    intensityMin: 70,
    intensityMax: 75,
    repsPerSetMin: 3,
    repsPerSetMax: 6,
    optimalTotalReps: 18,
    totalRepsMin: 12,
    totalRepsMax: 24,
    optimalSets: 4,
    rationale:
      "Zone de développement. Charge modérée avec volume suffisant pour l'adaptation.",
  },
  {
    intensityMin: 80,
    intensityMax: 85,
    repsPerSetMin: 2,
    repsPerSetMax: 4,
    optimalTotalReps: 15,
    totalRepsMin: 10,
    totalRepsMax: 20,
    optimalSets: 5,
    rationale:
      "Zone d'intensification. Le volume doit baisser pour préserver la qualité technique.",
  },
  {
    intensityMin: 90,
    intensityMax: 101,
    repsPerSetMin: 1,
    repsPerSetMax: 2,
    optimalTotalReps: 4,
    totalRepsMin: 4,
    totalRepsMax: 10,
    optimalSets: 4,
    rationale:
      "Zone maximale. Très peu de répétitions. Chaque levé doit être parfait.",
  },
];

/**
 * Return the Prilepin zone that contains the supplied intensity %.
 *
 * @param intensityPercent intensity expressed as %1RM
 * @returns the matching zone, or null if out of range
 */
export function getPrilepinZone(
  intensityPercent: number,
): PrilepinZone | null {
  if (!Number.isFinite(intensityPercent)) return null;
  for (const zone of PRILEPIN_TABLE) {
    if (
      intensityPercent >= zone.intensityMin &&
      intensityPercent < zone.intensityMax
    ) {
      return zone;
    }
  }
  if (intensityPercent >= 101) {
    return PRILEPIN_TABLE[PRILEPIN_TABLE.length - 1];
  }
  return null;
}

export interface PrilepinValidation {
  isOptimal: boolean;
  isWithinRange: boolean;
  totalReps: number;
  zone: PrilepinZone;
  status: 'under' | 'optimal' | 'over';
  /** Reps above (+) or below (-) the optimal total. */
  deviation: number;
  message: string;
  adjustedSetsRecommendation: number;
}

/**
 * Validate a planned weightlifting session against Prilepin's table.
 *
 * The average intensity of the planned sets is used to select the zone
 * (weighted by total reps per set).
 *
 * @param plannedSets sets with target reps and weight
 * @param oneRepMax 1RM of the lift in kg
 * @returns validation report
 */
export function validateSessionVolume(
  plannedSets: { reps: number; weightKg: number }[],
  oneRepMax: number,
): PrilepinValidation {
  if (oneRepMax <= 0 || plannedSets.length === 0) {
    const fallback = PRILEPIN_TABLE[1];
    return {
      isOptimal: false,
      isWithinRange: false,
      totalReps: 0,
      zone: fallback,
      status: 'under',
      deviation: -fallback.optimalTotalReps,
      message: "Aucune série planifiée à analyser.",
      adjustedSetsRecommendation: fallback.optimalSets,
    };
  }

  let weightedIntensity = 0;
  let totalReps = 0;
  for (const s of plannedSets) {
    const reps = Math.max(0, s.reps);
    const pct = (s.weightKg / oneRepMax) * 100;
    weightedIntensity += pct * reps;
    totalReps += reps;
  }
  const avgIntensity =
    totalReps > 0 ? weightedIntensity / totalReps : 0;
  const zone = getPrilepinZone(avgIntensity) ?? PRILEPIN_TABLE[1];

  const isWithinRange =
    totalReps >= zone.totalRepsMin && totalReps <= zone.totalRepsMax;
  const isOptimal = Math.abs(totalReps - zone.optimalTotalReps) <= 2;
  let status: 'under' | 'optimal' | 'over' = 'optimal';
  if (totalReps < zone.totalRepsMin) status = 'under';
  else if (totalReps > zone.totalRepsMax) status = 'over';

  const deviation = totalReps - zone.optimalTotalReps;
  const avgRepsPerSet =
    (zone.repsPerSetMin + zone.repsPerSetMax) / 2;
  const adjustedSetsRecommendation = Math.max(
    1,
    Math.round(zone.optimalTotalReps / avgRepsPerSet),
  );

  let message: string;
  if (status === 'under') {
    message =
      "Volume insuffisant pour cette zone d'intensité. Stimulation incomplète.";
  } else if (status === 'over') {
    message =
      "Volume excessif pour cette zone d'intensité. Risque de fatigue technique.";
  } else if (isOptimal) {
    message =
      "Volume optimal selon Prilepin. Séance équilibrée entre stimulus et qualité.";
  } else {
    message =
      "Volume acceptable selon Prilepin. Légère marge d'ajustement possible.";
  }

  return {
    isOptimal,
    isWithinRange,
    totalReps,
    zone,
    status,
    deviation,
    message,
    adjustedSetsRecommendation,
  };
}

export interface WaveSession {
  dayNumber: number;
  intensityPercent: number;
  prilepinZone: PrilepinZone;
  targetSets: number;
  targetReps: string;
  targetWeight: number;
}

export interface IntensityWave {
  sessions: WaveSession[];
  weekNotes: string;
}

/**
 * Generate a weekly intensity wave following Sheiko-style block periodisation.
 *
 * Block 1 = accumulation (lower %), block 2 = development, block 3 =
 * intensification. Within each block, weeks build then deload (week 4).
 *
 * @param params block, week, training max and weekly frequency
 * @returns the wave description for the week
 */
export function generateIntensityWave(params: {
  block: 1 | 2 | 3;
  week: 1 | 2 | 3 | 4;
  trainingMax: number;
  sessionsPerWeek: number;
}): IntensityWave {
  const { block, week, trainingMax, sessionsPerWeek } = params;
  const safeSessions = Math.max(1, Math.min(6, Math.floor(sessionsPerWeek)));

  const blockBase: Record<1 | 2 | 3, number[]> = {
    1: [70, 65, 72, 68],
    2: [78, 72, 82, 75],
    3: [85, 78, 90, 80],
  };
  const weekDelta: Record<1 | 2 | 3 | 4, number> = {
    1: 0,
    2: 2.5,
    3: 5,
    4: -10, // deload week
  };

  const sessions: WaveSession[] = [];
  const baseIntensities = blockBase[block];
  for (let i = 0; i < safeSessions; i += 1) {
    const base = baseIntensities[i % baseIntensities.length];
    const intensity = Math.max(50, Math.min(100, base + weekDelta[week]));
    const zone = getPrilepinZone(intensity) ?? PRILEPIN_TABLE[1];
    const reps = `${zone.repsPerSetMin}-${zone.repsPerSetMax}`;
    const weight = Math.round((trainingMax * intensity) / 100 * 2) / 2;
    sessions.push({
      dayNumber: i + 1,
      intensityPercent: Math.round(intensity * 10) / 10,
      prilepinZone: zone,
      targetSets: zone.optimalSets,
      targetReps: reps,
      targetWeight: weight,
    });
  }

  const weekNotes =
    week === 4
      ? "Semaine de décharge. Réduction de l'intensité pour favoriser la supercompensation."
      : `Semaine ${week} du bloc ${block}. Progression contrôlée selon Prilepin.`;

  return { sessions, weekNotes };
}

export interface CompetitionMaxInput {
  exerciseId: string;
  max: number;
}

export interface CompetitionPeakPlan {
  weekMinus3: { sessions: WaveSession[]; notes: string };
  weekMinus2: { sessions: WaveSession[]; notes: string };
  weekMinus1: { sessions: WaveSession[]; notes: string };
  competitionDayAdvice: string[];
}

/**
 * Produce a standard 3-week peaking protocol (Soviet/Bulgarian).
 *
 * @param params competition date, current maxes, level
 * @returns weekly peaking plan and day-of advice
 */
export function generateCompetitionPeak(params: {
  competitionDate: string;
  currentMaxes: CompetitionMaxInput[];
  level: string;
}): CompetitionPeakPlan {
  const trainingMax =
    params.currentMaxes.length > 0
      ? params.currentMaxes.reduce((acc, m) => acc + m.max, 0) /
        params.currentMaxes.length *
        0.9
      : 100;

  const weekMinus3 = generateIntensityWave({
    block: 3,
    week: 1,
    trainingMax,
    sessionsPerWeek: 4,
  });
  const weekMinus2 = generateIntensityWave({
    block: 3,
    week: 2,
    trainingMax,
    sessionsPerWeek: 3,
  });
  const weekMinus1 = generateIntensityWave({
    block: 3,
    week: 4,
    trainingMax,
    sessionsPerWeek: 2,
  });

  return {
    weekMinus3: {
      sessions: weekMinus3.sessions,
      notes:
        "Dernière semaine de charge. Volume soutenu, intensité élevée. Récupération critique.",
    },
    weekMinus2: {
      sessions: weekMinus2.sessions,
      notes:
        "Réduction du volume de 30%. Maintien de l'intensité. Une séance à allure de compétition.",
    },
    weekMinus1: {
      sessions: weekMinus1.sessions,
      notes:
        "Affûtage. Volume divisé par deux. Deux séances techniques courtes. Repos complet la veille.",
    },
    competitionDayAdvice: [
      "Réveil au moins 4 heures avant le premier essai.",
      "Échauffement progressif sur 30 à 40 minutes.",
      "Hydratation régulière par petites quantités.",
      "Visualisation des levés réussis avant chaque montée.",
      "Reste à l'écoute du corps. Garde de la marge sur le premier essai.",
    ],
  };
}
