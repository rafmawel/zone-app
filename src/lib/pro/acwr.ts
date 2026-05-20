/**
 * Acute:Chronic Workload Ratio (ACWR) with Exponentially Weighted
 * Moving Averages.
 *
 * PRIMARY REFERENCE:
 *   Gabbett TJ (2016) "The training-injury prevention paradox: should
 *   athletes be training smarter and harder?"
 *   British Journal of Sports Medicine, 50(5), 273-280.
 *   DOI: 10.1136/bjsports-2015-095788
 *
 * KEY FINDINGS:
 *  - ACWR 0.8 to 1.3 is the "sweet spot" with lowest injury risk.
 *  - ACWR above 1.5 increases injury risk by 2 to 4 times.
 *  - EWMA is more sensitive than simple rolling averages.
 *
 * SECONDARY REFERENCE:
 *   Murray NB et al. (2017) "Calculating Acute:Chronic Workload Ratios
 *   using Exponentially Weighted Moving Averages"
 *   British Journal of Sports Medicine, 51(23), 1665-1666.
 */

import type { WorkloadDataPoint, WorkloadSport } from './tssCalculator';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const ACUTE_DAYS = 7;
const CHRONIC_DAYS = 28;

/**
 * Build a contiguous daily TSS array ending on currentDate.
 *
 * Days without entries are filled with 0 TSS. The array is ordered
 * oldest first (index 0 is `daysBack - 1` days before currentDate).
 *
 * @param workloadHistory raw workload entries
 * @param currentDate ISO date the array should end on
 * @param daysBack length of the array
 * @returns daily TSS values, length === daysBack
 */
export function buildDailyTSSArray(
  workloadHistory: WorkloadDataPoint[],
  currentDate: string,
  daysBack: number,
): number[] {
  const safeDays = Math.max(1, Math.floor(daysBack));
  const daily = new Array<number>(safeDays).fill(0);
  const end = parseISODate(currentDate);
  if (!end) return daily;

  const startMs = end.getTime() - (safeDays - 1) * MS_PER_DAY;
  for (const entry of workloadHistory) {
    if (!Number.isFinite(entry.tss) || entry.tss <= 0) continue;
    const d = parseISODate(entry.date);
    if (!d) continue;
    const idx = Math.round((d.getTime() - startMs) / MS_PER_DAY);
    if (idx >= 0 && idx < safeDays) {
      daily[idx] += entry.tss;
    }
  }
  return daily;
}

/**
 * Calculate the exponentially weighted moving average of daily TSS.
 *
 * λ = 2 / (N + 1), where N is the time constant in days.
 *   EWMA(t) = TSS(t) * λ + EWMA(t-1) * (1 - λ)
 *
 * @param workloadHistory raw workload entries
 * @param currentDate ISO date marking the latest day
 * @param timeConstantDays N in the formula
 * @returns the most recent EWMA value
 */
export function calculateEWMA(
  workloadHistory: WorkloadDataPoint[],
  currentDate: string,
  timeConstantDays: number,
): number {
  const N = Math.max(1, Math.floor(timeConstantDays));
  // Use ~4x the time constant of history for the EWMA to settle.
  const window = Math.max(N * 4, N + 7);
  const daily = buildDailyTSSArray(workloadHistory, currentDate, window);
  const lambda = 2 / (N + 1);
  let ewma = 0;
  for (let i = 0; i < daily.length; i += 1) {
    ewma = daily[i] * lambda + ewma * (1 - lambda);
  }
  return ewma;
}

export type ACWRRiskLevel =
  | 'undertraining'
  | 'optimal'
  | 'caution'
  | 'danger';

export interface ACWRResult {
  acwr: number;
  acuteLoad: number;
  chronicLoad: number;
  riskLevel: ACWRRiskLevel;
  /** Injury risk probability (0-100). */
  riskScore: number;
  message: string;
  recommendation: string;
  /** Safe weekly TSS cap to remain within the sweet spot. */
  maxSafeTSSThisWeek: number;
}

/**
 * Compute the ACWR for the supplied workload history.
 *
 * @param workloadHistory raw workload entries (any number of sports)
 * @param currentDate ISO date marking "today"
 * @returns ACWR result with risk level and French guidance
 */
export function calculateACWR(
  workloadHistory: WorkloadDataPoint[],
  currentDate: string,
): ACWRResult {
  const acuteLoad = calculateEWMA(workloadHistory, currentDate, ACUTE_DAYS);
  const chronicLoad = calculateEWMA(workloadHistory, currentDate, CHRONIC_DAYS);
  const acwr = chronicLoad > 0 ? acuteLoad / chronicLoad : 0;
  const zone = interpretACWR(acwr, chronicLoad);
  // Sweet spot cap: ACWR 1.3 implies acute load = 1.3 * chronic load.
  const maxSafeTSSThisWeek = Math.max(0, Math.round(1.3 * chronicLoad * 7));

  return {
    acwr: round2(acwr),
    acuteLoad: round2(acuteLoad),
    chronicLoad: round2(chronicLoad),
    riskLevel: zone.riskLevel,
    riskScore: zone.riskScore,
    message: zone.message,
    recommendation: zone.recommendation,
    maxSafeTSSThisWeek,
  };
}

interface ACWRZone {
  riskLevel: ACWRRiskLevel;
  riskScore: number;
  message: string;
  recommendation: string;
}

function interpretACWR(acwr: number, chronicLoad: number): ACWRZone {
  if (chronicLoad <= 0) {
    return {
      riskLevel: 'undertraining',
      riskScore: 5,
      message: "Pas encore assez de données pour évaluer ta charge chronique.",
      recommendation:
        "Continue à enregistrer tes séances. L'analyse devient fiable après 4 semaines.",
    };
  }
  if (acwr < 0.6) {
    return {
      riskLevel: 'undertraining',
      riskScore: 5,
      message:
        "Charge aiguë trop basse. Tu perds en fitness sans le sentir encore.",
      recommendation:
        "Reprends progressivement le volume cette semaine pour préserver les acquis.",
    };
  }
  if (acwr < 0.8) {
    return {
      riskLevel: 'caution',
      riskScore: 10,
      message: "Charge légère. Tu es sous le seuil optimal d'adaptation.",
      recommendation:
        "Tu peux remonter le volume sans risque. Vise un ACWR autour de 1,0.",
    };
  }
  if (acwr <= 1.3) {
    return {
      riskLevel: 'optimal',
      riskScore: 8,
      message:
        "Tu es dans le sweet spot. Charge aiguë et chronique parfaitement équilibrées.",
      recommendation:
        "Continue sur cette trajectoire. C'est la zone de progression la plus sûre.",
    };
  }
  if (acwr <= 1.5) {
    return {
      riskLevel: 'caution',
      riskScore: 35,
      message:
        "Charge aiguë élevée par rapport à ton fitness. Vigilance accrue requise.",
      recommendation:
        "Évite d'ajouter une séance dure cette semaine. Privilégie qualité plutôt que volume.",
    };
  }
  if (acwr <= 2.0) {
    return {
      riskLevel: 'danger',
      riskScore: 65,
      message:
        "Surcharge confirmée. Le risque de blessure est multiplié par 2 à 4.",
      recommendation:
        "Coupe le volume de 30 à 40% cette semaine. Garde 1 séance technique courte.",
    };
  }
  return {
    riskLevel: 'danger',
    riskScore: 90,
    message:
      "Charge critique. Tu es très au-dessus de ce que ton corps peut absorber.",
    recommendation:
      "Repos quasi complet pendant 4 à 7 jours. Reprise progressive obligatoire.",
  };
}

/**
 * Compute the ACWR per sport, partitioning the workload history.
 *
 * @param workloadHistory raw workload entries
 * @param currentDate ISO date marking "today"
 * @returns record keyed by sport with each ACWR result
 */
export function calculateACWRPerSport(
  workloadHistory: WorkloadDataPoint[],
  currentDate: string,
): Record<WorkloadSport, ACWRResult> {
  const sports: WorkloadSport[] = [
    'weightlifting',
    'running',
    'musculation',
    'hyrox',
  ];
  const out = {} as Record<WorkloadSport, ACWRResult>;
  for (const sport of sports) {
    const subset = workloadHistory.filter((w) => w.sport === sport);
    out[sport] = calculateACWR(subset, currentDate);
  }
  return out;
}

export interface WeeklyLoadBudget {
  currentWeekTSS: number;
  remainingBudget: number;
  recommendedDailyTSS: number;
  daysLeftInWeek: number;
}

/**
 * Derive a daily TSS budget for the remaining days of the current
 * ISO-week (Monday = day 0) to stay below ACWR 1.3.
 *
 * @param acwrResult result from {@link calculateACWR}
 * @returns weekly load budget breakdown
 */
export function getWeeklyLoadBudget(
  acwrResult: ACWRResult,
): WeeklyLoadBudget {
  const now = new Date();
  // ISO week: Monday = 0 .. Sunday = 6
  const dayIndex = (now.getDay() + 6) % 7;
  const daysLeftInWeek = Math.max(1, 7 - dayIndex);

  // Estimate the load already done in this ISO week from acuteLoad.
  // acuteLoad ~ EWMA(7d). Multiply by dayIndex to estimate week-to-date.
  const currentWeekTSS = Math.round(acwrResult.acuteLoad * Math.max(1, dayIndex));
  const remainingBudget = Math.max(
    0,
    acwrResult.maxSafeTSSThisWeek - currentWeekTSS,
  );
  const recommendedDailyTSS = Math.round(remainingBudget / daysLeftInWeek);

  return {
    currentWeekTSS,
    remainingBudget,
    recommendedDailyTSS,
    daysLeftInWeek,
  };
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

function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}
