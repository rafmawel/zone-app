/**
 * Banister Impulse-Response Performance Model
 *
 * PRIMARY REFERENCE:
 *   Banister EW et al. (1975) "A systems model of training for athletic
 *   performance" Australian Journal of Sports Medicine, 7(3), 57-61.
 *
 * VALIDATED BY:
 *   Coggan AR & Allen H (2010) "Training and Racing with a Power Meter"
 *   VeloPress.
 *
 * Concepts:
 *   CTL (Chronic Training Load)    = fitness proxy, tau = 42 days
 *   ATL (Acute Training Load)      = fatigue proxy, tau =  7 days
 *   TSB (Training Stress Balance)  = form = CTL(t-1) - ATL(t-1)
 *
 * Optimal performance window: TSB +5 to +25.
 */

import type { WorkloadDataPoint } from './tssCalculator';

export interface DailyPerformanceMetrics {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  tss: number;
}

const CTL_TAU = 42;
const ATL_TAU = 7;
const CTL_K = 1 - Math.exp(-1 / CTL_TAU); // ~0.0235
const ATL_K = 1 - Math.exp(-1 / ATL_TAU); // ~0.1331
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Compute the day-by-day Banister model over a sliding window ending
 * on today's date.
 *
 * Recurrence:
 *   CTL(t) = CTL(t-1) + (TSS(t) - CTL(t-1)) * CTL_K
 *   ATL(t) = ATL(t-1) + (TSS(t) - ATL(t-1)) * ATL_K
 *   TSB(t) = CTL(t-1) - ATL(t-1)
 *
 * @param workloadHistory raw workload entries
 * @param daysToCalculate length of the output window (default 180)
 * @returns daily metrics, oldest first
 */
export function calculatePerformanceModel(
  workloadHistory: WorkloadDataPoint[],
  daysToCalculate: number = 180,
): DailyPerformanceMetrics[] {
  const days = Math.max(1, Math.floor(daysToCalculate));
  const endDate = new Date();
  endDate.setUTCHours(0, 0, 0, 0);
  const startDate = new Date(endDate.getTime() - (days - 1) * MS_PER_DAY);

  const tssByDate = new Map<string, number>();
  for (const e of workloadHistory) {
    if (!Number.isFinite(e.tss) || e.tss <= 0) continue;
    tssByDate.set(e.date, (tssByDate.get(e.date) ?? 0) + e.tss);
  }

  const out: DailyPerformanceMetrics[] = [];
  let ctl = 0;
  let atl = 0;
  for (let i = 0; i < days; i += 1) {
    const d = new Date(startDate.getTime() + i * MS_PER_DAY);
    const iso = toISODate(d);
    const tss = tssByDate.get(iso) ?? 0;
    const tsb = ctl - atl; // form uses previous-day values
    const nextCTL = ctl + (tss - ctl) * CTL_K;
    const nextATL = atl + (tss - atl) * ATL_K;
    out.push({
      date: iso,
      ctl: round2(nextCTL),
      atl: round2(nextATL),
      tsb: round2(tsb),
      tss: round2(tss),
    });
    ctl = nextCTL;
    atl = nextATL;
  }
  return out;
}

export interface FormStatus {
  label: string;
  color: string;
  message: string;
  trainingAdvice: string;
}

/**
 * Translate TSB into a categorical form status with French guidance.
 *
 * @param tsb training stress balance value
 * @returns form status
 */
export function getFormStatus(tsb: number): FormStatus {
  if (tsb <= -30) {
    return {
      label: 'SURMENAGE',
      color: '#E57373',
      message:
        "Tu accumules plus de fatigue que ton corps ne peut absorber.",
      trainingAdvice:
        "Réduis le volume de 40%. Privilégie la récupération active.",
    };
  }
  if (tsb <= -10) {
    return {
      label: 'FATIGUE PRODUCTIVE',
      color: '#FFB74D',
      message:
        "Tu construis du fitness. La fatigue est normale et voulue.",
      trainingAdvice: "Continue le programme. Ne change rien.",
    };
  }
  if (tsb <= 5) {
    return {
      label: 'NEUTRE',
      color: '#888888',
      message: "Équilibre entre charge et récupération.",
      trainingAdvice:
        "Bonne journée pour une séance de qualité modérée.",
    };
  }
  if (tsb <= 25) {
    return {
      label: 'FORME OPTIMALE',
      color: '#4CAF50',
      message:
        "Fenêtre de performance ouverte. Tu es frais et en forme.",
      trainingAdvice:
        "Profite. C'est le moment pour les efforts de qualité et les records.",
    };
  }
  return {
    label: 'DÉSENTRAÎNÉ',
    color: '#64B5F6',
    message:
      "Trop de repos. Ton fitness commence à diminuer doucement.",
    trainingAdvice:
      "Reprends progressivement. Augmente le volume cette semaine.",
  };
}

/**
 * Project the model forward at a constant daily TSS load.
 *
 * @param currentMetrics latest known daily metrics (today)
 * @param plannedTSSPerDay assumed TSS for each projected day
 * @param daysToProject number of future days to simulate
 * @returns projected daily metrics, oldest first (does not include today)
 */
export function projectTSB(
  currentMetrics: DailyPerformanceMetrics,
  plannedTSSPerDay: number,
  daysToProject: number,
): DailyPerformanceMetrics[] {
  const out: DailyPerformanceMetrics[] = [];
  const days = Math.max(0, Math.floor(daysToProject));
  if (days === 0) return out;
  const baseDate = parseISODate(currentMetrics.date) ?? new Date();
  let ctl = currentMetrics.ctl;
  let atl = currentMetrics.atl;
  const dailyTSS = Math.max(0, plannedTSSPerDay);

  for (let i = 1; i <= days; i += 1) {
    const date = new Date(baseDate.getTime() + i * MS_PER_DAY);
    const tsb = ctl - atl;
    const nextCTL = ctl + (dailyTSS - ctl) * CTL_K;
    const nextATL = atl + (dailyTSS - atl) * ATL_K;
    out.push({
      date: toISODate(date),
      ctl: round2(nextCTL),
      atl: round2(nextATL),
      tsb: round2(tsb),
      tss: round2(dailyTSS),
    });
    ctl = nextCTL;
    atl = nextATL;
  }
  return out;
}

export interface TaperWeekProtocol {
  volumeReduction: number;
  intensityMaintain: boolean;
}

export interface OptimalPeakPlan {
  optimalPeakDate: string;
  recommendedTaperStart: string;
  projectedTSBOnRaceDay: number;
  projectedCTLOnRaceDay: number;
  taperProtocol: {
    week_minus_3: TaperWeekProtocol;
    week_minus_2: TaperWeekProtocol;
    week_minus_1: TaperWeekProtocol;
  };
}

/**
 * Plan a peak around a target date (or generate one automatically).
 *
 * Standard 3-week taper validated across endurance and strength sports:
 *   W-3: -20% volume, intensity maintained
 *   W-2: -30% volume, one race-pace session
 *   W-1: -50% volume, two short quality sessions
 *
 * @param currentMetrics latest daily metrics
 * @param workloadHistory raw workload entries (used to derive a baseline)
 * @param targetDate optional ISO date of the target event
 * @returns peaking plan
 */
export function findOptimalPeakDate(
  currentMetrics: DailyPerformanceMetrics,
  workloadHistory: WorkloadDataPoint[],
  targetDate?: string,
): OptimalPeakPlan {
  const today = parseISODate(currentMetrics.date) ?? new Date();
  const peakDate = targetDate
    ? (parseISODate(targetDate) ?? new Date(today.getTime() + 28 * MS_PER_DAY))
    : new Date(today.getTime() + 28 * MS_PER_DAY);
  const taperStart = new Date(peakDate.getTime() - 21 * MS_PER_DAY);

  // Estimate baseline daily TSS from the last 28 days of history.
  const last28 = recentTSS(workloadHistory, 28);
  const baselineDailyTSS = last28 / 28;

  // Simulate 3-week taper from taperStart to peakDate.
  const daysUntilTaper = Math.max(
    0,
    Math.round((taperStart.getTime() - today.getTime()) / MS_PER_DAY),
  );
  const preTaper = projectTSB(currentMetrics, baselineDailyTSS, daysUntilTaper);
  const afterPreTaper =
    preTaper.length > 0
      ? preTaper[preTaper.length - 1]
      : currentMetrics;

  const w3 = projectTSB(afterPreTaper, baselineDailyTSS * 0.8, 7);
  const w2 = projectTSB(w3[w3.length - 1] ?? afterPreTaper, baselineDailyTSS * 0.7, 7);
  const w1 = projectTSB(w2[w2.length - 1] ?? afterPreTaper, baselineDailyTSS * 0.5, 7);
  const finalDay = w1[w1.length - 1] ?? afterPreTaper;

  return {
    optimalPeakDate: toISODate(peakDate),
    recommendedTaperStart: toISODate(taperStart),
    projectedTSBOnRaceDay: finalDay.tsb,
    projectedCTLOnRaceDay: finalDay.ctl,
    taperProtocol: {
      week_minus_3: { volumeReduction: 0.2, intensityMaintain: true },
      week_minus_2: { volumeReduction: 0.3, intensityMaintain: true },
      week_minus_1: { volumeReduction: 0.5, intensityMaintain: true },
    },
  };
}

function recentTSS(history: WorkloadDataPoint[], daysBack: number): number {
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  const cutoffMs = cutoff.getTime() - (daysBack - 1) * MS_PER_DAY;
  let total = 0;
  for (const h of history) {
    const d = parseISODate(h.date);
    if (!d) continue;
    if (d.getTime() >= cutoffMs) total += Math.max(0, h.tss);
  }
  return total;
}

function toISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

function round2(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}
