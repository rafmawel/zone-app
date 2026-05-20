/**
 * Sleep Debt and Performance Impact Engine
 *
 * PRIMARY REFERENCE:
 *   Belenky G et al. (2003) "Patterns of performance degradation and
 *   restoration during sleep restriction and subsequent recovery: a
 *   sleep dose-response study"
 *   Journal of Sleep Research, 12(1), 1-12.
 *   DOI: 10.1046/j.1365-2869.2003.00337.x
 *
 * SECONDARY:
 *   Van Dongen HPA et al. (2003) "The cumulative cost of additional
 *   wakefulness: dose-response effects on neurobehavioral functions
 *   and sleep physiology" Sleep, 26(2), 117-126.
 *   Walker M (2017) "Why We Sleep" Penguin.
 *
 * Per-night degradation (significant debt):
 *   Strength      : ~-8%
 *   Aerobic/VO2   : ~-10%
 *   Skill/technique: ~-12%
 *
 * Recovery: each full 8h night clears ~2.5h of debt.
 */

export const OPTIMAL_SLEEP_HOURS = 8;

export interface SleepCheckin {
  date: string;
  /** Hours slept. */
  sleep_duration: number;
  /** Subjective quality 1-5. */
  sleep_quality: number;
}

export type SleepDebtLevel =
  | 'none'
  | 'mild'
  | 'moderate'
  | 'severe'
  | 'critical';

export interface SleepDebtAnalysis {
  last7DaysData: { date: string; hours: number; quality: number }[];
  avgHoursLast7Days: number;
  avgQualityLast7Days: number;
  cumulativeDebtHours: number;
  performanceImpactPercent: number;
  strengthImpactPercent: number;
  aerobicImpactPercent: number;
  skillImpactPercent: number;
  debtLevel: SleepDebtLevel;
  recoveryNightsNeeded: number;
  message: string;
  recommendation: string;
}

/**
 * Analyse the last 7 nights of sleep data and compute performance
 * impact estimates.
 *
 * @param checkins ordered or unordered checkins (any number)
 * @returns sleep debt analysis
 */
export function analyzeSleepDebt(checkins: SleepCheckin[]): SleepDebtAnalysis {
  const sorted = [...checkins]
    .filter((c) => !!c.date)
    .sort((a, b) => b.date.localeCompare(a.date));
  const last7 = sorted.slice(0, 7);
  const last7DaysData = last7
    .map((c) => ({
      date: c.date,
      hours: clamp(c.sleep_duration, 0, 14),
      quality: clamp(c.sleep_quality, 1, 5),
    }))
    .reverse();

  if (last7DaysData.length === 0) {
    return {
      last7DaysData: [],
      avgHoursLast7Days: 0,
      avgQualityLast7Days: 0,
      cumulativeDebtHours: 0,
      performanceImpactPercent: 0,
      strengthImpactPercent: 0,
      aerobicImpactPercent: 0,
      skillImpactPercent: 0,
      debtLevel: 'none',
      recoveryNightsNeeded: 0,
      message:
        "Pas encore de données de sommeil. Ajoute tes nuits pour évaluer ta récupération.",
      recommendation: "Lance un check-in quotidien dès cette semaine.",
    };
  }

  const avgHours =
    last7DaysData.reduce((acc, c) => acc + c.hours, 0) / last7DaysData.length;
  const avgQuality =
    last7DaysData.reduce((acc, c) => acc + c.quality, 0) / last7DaysData.length;

  let cumulativeDebt = 0;
  for (const c of last7DaysData) {
    cumulativeDebt += Math.max(0, OPTIMAL_SLEEP_HOURS - c.hours);
  }
  const qualityMultiplier = 1 + (3 - avgQuality) * 0.1;
  const effectiveDebt = Math.max(0, cumulativeDebt * qualityMultiplier);

  const performanceImpact = Math.min(40, effectiveDebt * 2.8);
  const strengthImpact = Math.min(35, effectiveDebt * 2.5);
  const aerobicImpact = Math.min(45, effectiveDebt * 3.2);
  const skillImpact = Math.min(50, effectiveDebt * 3.8);

  const debtLevel: SleepDebtLevel = classifyDebt(effectiveDebt);
  const recoveryNightsNeeded = Math.ceil(effectiveDebt / 2.5);
  const { message, recommendation } = describeDebt(debtLevel, effectiveDebt);

  return {
    last7DaysData,
    avgHoursLast7Days: round2(avgHours),
    avgQualityLast7Days: round2(avgQuality),
    cumulativeDebtHours: round2(effectiveDebt),
    performanceImpactPercent: round2(performanceImpact),
    strengthImpactPercent: round2(strengthImpact),
    aerobicImpactPercent: round2(aerobicImpact),
    skillImpactPercent: round2(skillImpact),
    debtLevel,
    recoveryNightsNeeded,
    message,
    recommendation,
  };
}

function classifyDebt(effectiveDebt: number): SleepDebtLevel {
  if (effectiveDebt < 2) return 'none';
  if (effectiveDebt < 5) return 'mild';
  if (effectiveDebt < 10) return 'moderate';
  if (effectiveDebt < 15) return 'severe';
  return 'critical';
}

function describeDebt(
  level: SleepDebtLevel,
  debt: number,
): { message: string; recommendation: string } {
  switch (level) {
    case 'none':
      return {
        message:
          "Sommeil suffisant cette semaine. Récupération bien engagée.",
        recommendation:
          "Maintiens tes horaires. C'est ta meilleure assurance performance.",
      };
    case 'mild':
      return {
        message:
          "Léger déficit de sommeil. Performance encore préservée mais en alerte.",
        recommendation:
          "Vise au moins 8h cette nuit. Évite les écrans 1h avant le coucher.",
      };
    case 'moderate':
      return {
        message:
          "Déficit notable. Force et endurance commencent à se dégrader.",
        recommendation:
          "Couche-toi 1h plus tôt pendant 3 nuits. Réduis l'intensité des séances.",
      };
    case 'severe':
      return {
        message:
          "Dette importante. Performance et coordination significativement diminuées.",
        recommendation:
          "Priorité absolue à la récupération. Annule toute séance maximale jusqu'à remontée.",
      };
    case 'critical':
    default:
      return {
        message: `Dette critique (${round2(debt)}h). Équivalent à 48h d'éveil continu en termes de performance.`,
        recommendation:
          "Stop séances dures. 9 à 10h de sommeil par nuit pendant 5 nuits.",
      };
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function round2(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}
