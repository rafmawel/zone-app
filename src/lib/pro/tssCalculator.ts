/**
 * Training Stress Score (TSS) Calculator
 *
 * Universal currency for all sports, used as the fundamental unit of
 * training load across the Pro engine suite.
 *
 * Adapted from:
 *   Coggan AR & Allen H (2010)
 *   "Training and Racing with a Power Meter" 2nd edition, VeloPress.
 *
 * Applied to all sports using sport-specific intensity factors.
 */

export type WorkloadSport =
  | 'weightlifting'
  | 'running'
  | 'musculation'
  | 'hyrox';

export interface WorkloadDataPoint {
  /** ISO date (YYYY-MM-DD) */
  date: string;
  /** Training Stress Score (0-300+ per session) */
  tss: number;
  sport: WorkloadSport;
  sessionType: string;
  durationMinutes: number;
  /** Intensity factor 0.5-1.05 */
  intensityFactor: number;
}

/**
 * Map an average intensity percentage (of 1RM or threshold) to an
 * intensity factor (IF), bounded between 0.55 and 1.05.
 *
 * Source: Coggan & Allen (2010) intensity factor framework.
 *
 * @param avgIntensityPercent average intensity as %1RM or %threshold
 * @returns intensity factor in [0.55, 1.05]
 */
export function getIntensityFactor(avgIntensityPercent: number): number {
  if (!Number.isFinite(avgIntensityPercent) || avgIntensityPercent <= 0) {
    return 0.55;
  }
  if (avgIntensityPercent < 60) return 0.55;
  if (avgIntensityPercent < 70) return 0.65;
  if (avgIntensityPercent < 80) return 0.75;
  if (avgIntensityPercent < 90) return 0.85;
  if (avgIntensityPercent <= 100) return 0.95;
  return 1.05;
}

/**
 * Compute TSS for a weightlifting session.
 *
 * Based on: Haff GG & Triplett NT (2015)
 *   "Essentials of Strength Training and Conditioning" 4th ed.
 *
 * Formula:
 *   TSS = (totalVolumeTonnage / bodyweight) * IF^2 * (duration/60) * 100
 *
 * @param params session totals
 * @returns TSS, clamped to [0, 400]
 */
export function calculateWeightliftingTSS(params: {
  totalVolumeTonnage: number;
  bodyweightKg: number;
  avgIntensityPercent: number;
  durationMinutes: number;
}): number {
  const {
    totalVolumeTonnage,
    bodyweightKg,
    avgIntensityPercent,
    durationMinutes,
  } = params;

  if (bodyweightKg <= 0 || durationMinutes <= 0 || totalVolumeTonnage <= 0) {
    return 0;
  }

  const intensityFactor = getIntensityFactor(avgIntensityPercent);
  const relativeVolume = totalVolumeTonnage / bodyweightKg;
  const tss =
    relativeVolume * intensityFactor * intensityFactor * (durationMinutes / 60) * 100;
  return clamp(tss, 0, 400);
}

/**
 * Compute TSS for a running session.
 *
 * Direct Coggan formula adapted for pace:
 *   TSS = (durationSec * NP * IF) / (FTP * 3600) * 100
 * For running NP and FTP are expressed as pace (sec/km), so the
 * equation simplifies via the identity (NP/FTP) = IF, giving:
 *   TSS = (durationSec * IF^2) / 3600 * 100
 * where IF = thresholdPaceSecPerKm / avgPaceSecPerKm.
 *
 * @param params running session
 * @returns TSS, clamped to [0, 400]
 */
export function calculateRunningTSS(params: {
  durationSeconds: number;
  avgPaceSecPerKm: number;
  thresholdPaceSecPerKm: number;
}): number {
  const { durationSeconds, avgPaceSecPerKm, thresholdPaceSecPerKm } = params;
  if (
    durationSeconds <= 0 ||
    avgPaceSecPerKm <= 0 ||
    thresholdPaceSecPerKm <= 0
  ) {
    return 0;
  }
  const intensityFactor = Math.min(
    1.15,
    thresholdPaceSecPerKm / avgPaceSecPerKm,
  );
  const tss = (durationSeconds * intensityFactor * intensityFactor) / 3600 * 100;
  return clamp(tss, 0, 400);
}

/**
 * Compute TSS for a musculation (bodybuilding) session.
 *
 * Based on volume-load research:
 *   Raastad T et al. — total volume-load is the primary driver of
 *   chronic adaptation; RPE refines the systemic stress estimate.
 *
 * Formula:
 *   TSS = (sumOf(reps * weight)) / (bodyweight * 100) * rpeFactor * 100
 *   rpeFactor = clamp(avgRPE / 7, 0.6, 1.3)
 *
 * @param params completed sets and bodyweight
 * @returns TSS, clamped to [0, 400]
 */
export function calculateMuscuTSS(params: {
  completedSets: { reps: number; weightKg: number; rpe: number }[];
  bodyweightKg: number;
  durationMinutes: number;
}): number {
  const { completedSets, bodyweightKg, durationMinutes } = params;
  if (bodyweightKg <= 0 || completedSets.length === 0 || durationMinutes <= 0) {
    return 0;
  }

  let volumeLoad = 0;
  let rpeSum = 0;
  let rpeCount = 0;
  for (const s of completedSets) {
    if (s.reps > 0 && s.weightKg > 0) {
      volumeLoad += s.reps * s.weightKg;
    }
    if (Number.isFinite(s.rpe) && s.rpe > 0) {
      rpeSum += s.rpe;
      rpeCount += 1;
    }
  }
  if (volumeLoad <= 0) return 0;
  const avgRPE = rpeCount > 0 ? rpeSum / rpeCount : 7;
  const rpeFactor = clamp(avgRPE / 7, 0.6, 1.3);
  const tss = (volumeLoad / (bodyweightKg * 100)) * rpeFactor * 100;
  return clamp(tss, 0, 400);
}

/**
 * Compute TSS for a Hyrox-style hybrid session.
 *
 * Hybrid coefficient 1.4 from:
 *   Laursen P & Buchheit M (2019) "Science and Application of High
 *   Intensity Interval Training", Human Kinetics.
 *
 * Formula:
 *   TSS = (duration/60) * 100 * 1.4 * (completionPercent/100) * rpeFactor
 *   rpeFactor = clamp(rpe / 7, 0.6, 1.3)
 *
 * @param params session totals
 * @returns TSS, clamped to [0, 400]
 */
export function calculateHyroxTSS(params: {
  durationMinutes: number;
  completionPercent: number;
  rpe: number;
}): number {
  const { durationMinutes, completionPercent, rpe } = params;
  if (durationMinutes <= 0 || completionPercent <= 0) return 0;
  const completion = clamp(completionPercent, 0, 110) / 100;
  const rpeSafe = Number.isFinite(rpe) && rpe > 0 ? rpe : 7;
  const rpeFactor = clamp(rpeSafe / 7, 0.6, 1.3);
  const tss = (durationMinutes / 60) * 100 * 1.4 * completion * rpeFactor;
  return clamp(tss, 0, 400);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}
