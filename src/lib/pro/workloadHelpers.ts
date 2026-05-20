/**
 * Workload entry helpers
 *
 * Compute TSS from a finished session and persist it to Firestore so
 * the ACWR / Banister engines can read it back.
 */

import {
  saveDailyTSS,
  type WorkloadEntry,
} from '../firestore';
import {
  calculateHyroxTSS,
  calculateMuscuTSS,
  calculateRunningTSS,
  calculateWeightliftingTSS,
  getIntensityFactor,
  type WorkloadSport,
} from './tssCalculator';

export type WorkloadComputeInput =
  | {
      sport: 'weightlifting';
      date: string;
      sessionType: string;
      durationMinutes: number;
      totalVolumeTonnage: number;
      bodyweightKg: number;
      avgIntensityPercent: number;
    }
  | {
      sport: 'running';
      date: string;
      sessionType: string;
      durationSeconds: number;
      avgPaceSecPerKm: number;
      thresholdPaceSecPerKm: number;
    }
  | {
      sport: 'musculation';
      date: string;
      sessionType: string;
      durationMinutes: number;
      completedSets: { reps: number; weightKg: number; rpe: number }[];
      bodyweightKg: number;
    }
  | {
      sport: 'hyrox';
      date: string;
      sessionType: string;
      durationMinutes: number;
      completionPercent: number;
      rpe: number;
    };

/**
 * Compute a workload entry from a session input.
 *
 * @param input session details by sport
 * @returns workload entry ready to persist
 */
export function buildWorkloadEntry(input: WorkloadComputeInput): WorkloadEntry {
  switch (input.sport) {
    case 'weightlifting': {
      const tss = calculateWeightliftingTSS({
        totalVolumeTonnage: input.totalVolumeTonnage,
        bodyweightKg: input.bodyweightKg,
        avgIntensityPercent: input.avgIntensityPercent,
        durationMinutes: input.durationMinutes,
      });
      return {
        date: input.date,
        sport: 'weightlifting',
        sessionType: input.sessionType,
        durationMinutes: input.durationMinutes,
        tss,
        intensityFactor: getIntensityFactor(input.avgIntensityPercent),
      };
    }
    case 'running': {
      const tss = calculateRunningTSS({
        durationSeconds: input.durationSeconds,
        avgPaceSecPerKm: input.avgPaceSecPerKm,
        thresholdPaceSecPerKm: input.thresholdPaceSecPerKm,
      });
      const intensityFactor =
        input.avgPaceSecPerKm > 0
          ? Math.min(1.15, input.thresholdPaceSecPerKm / input.avgPaceSecPerKm)
          : 0.7;
      return {
        date: input.date,
        sport: 'running',
        sessionType: input.sessionType,
        durationMinutes: Math.round(input.durationSeconds / 60),
        tss,
        intensityFactor,
      };
    }
    case 'musculation': {
      const tss = calculateMuscuTSS({
        completedSets: input.completedSets,
        bodyweightKg: input.bodyweightKg,
        durationMinutes: input.durationMinutes,
      });
      const rpes = input.completedSets
        .map((s) => s.rpe)
        .filter((r) => Number.isFinite(r) && r > 0);
      const avgRPE = rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : 7;
      const intensityFactor = Math.max(0.55, Math.min(1.05, avgRPE / 10));
      return {
        date: input.date,
        sport: 'musculation',
        sessionType: input.sessionType,
        durationMinutes: input.durationMinutes,
        tss,
        intensityFactor,
      };
    }
    case 'hyrox':
    default: {
      const hx = input as Extract<WorkloadComputeInput, { sport: 'hyrox' }>;
      const tss = calculateHyroxTSS({
        durationMinutes: hx.durationMinutes,
        completionPercent: hx.completionPercent,
        rpe: hx.rpe,
      });
      const intensityFactor = Math.max(0.55, Math.min(1.05, hx.rpe / 10));
      return {
        date: hx.date,
        sport: 'hyrox',
        sessionType: hx.sessionType,
        durationMinutes: hx.durationMinutes,
        tss,
        intensityFactor,
      };
    }
  }
}

/**
 * Compute and persist a workload entry for a completed session.
 *
 * @param uid user id
 * @param input session details
 * @returns the persisted workload entry
 */
export async function computeAndSaveWorkloadEntry(
  uid: string,
  input: WorkloadComputeInput,
): Promise<WorkloadEntry> {
  const entry = buildWorkloadEntry(input);
  if (entry.tss > 0) {
    await saveDailyTSS(uid, entry);
  }
  return entry;
}

/**
 * Aggregate sports active for the user from their sport collection.
 *
 * @param sportKeys raw sport_key values from `users/{uid}/sports`
 * @returns deduplicated workload sport set
 */
export function mapUserSportsToWorkloadSports(
  sportKeys: string[],
): WorkloadSport[] {
  const out = new Set<WorkloadSport>();
  for (const key of sportKeys) {
    switch (key) {
      case 'halterophilie':
        out.add('weightlifting');
        break;
      case 'course':
        out.add('running');
        break;
      case 'musculation':
        out.add('musculation');
        break;
      case 'hyrox':
        out.add('hyrox');
        break;
      default:
        break;
    }
  }
  return Array.from(out);
}
