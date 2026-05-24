/**
 * Android Health Connect integration.
 *
 * Reads sleep, heart rate, HRV, steps, calories and weight from any app
 * that syncs to Health Connect (Samsung Health, Google Fit, Garmin,
 * Fitbit, Polar, etc).
 *
 * All calls are Android-only and wrapped defensively: any failure (SDK
 * missing, permission denied, no data) resolves to null rather than
 * throwing, so the UI never blocks on Health Connect.
 */

import { Platform } from 'react-native';
import {
  SdkAvailabilityStatus,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  readRecords,
  requestPermission,
} from 'react-native-health-connect';

const DEEP_STAGE = 5;
const REM_STAGE = 6;
const MS_PER_HOUR = 1000 * 60 * 60;

export interface HealthConnectData {
  sleepDurationHours: number | null;
  sleepQuality: number | null;
  avgHeartRate: number | null;
  restingHeartRate: number | null;
  hrv: number | null;
  steps: number | null;
  activeCalories: number | null;
  weight: number | null;
}

/**
 * Whether Health Connect is installed and usable on this device.
 *
 * @returns true only on Android when the SDK reports availability
 */
export async function isHealthConnectAvailable(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const status = await getSdkStatus();
    return status === SdkAvailabilityStatus.SDK_AVAILABLE;
  } catch {
    return false;
  }
}

/**
 * Initialize the SDK and request the read permissions Zone needs.
 *
 * @returns true if init succeeded and at least one permission granted
 */
export async function initializeHealthConnect(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const available = await isHealthConnectAvailable();
    if (!available) return false;
    const ok = await initialize();
    if (!ok) return false;
    const granted = await requestPermission([
      { accessType: 'read', recordType: 'SleepSession' },
      { accessType: 'read', recordType: 'HeartRate' },
      { accessType: 'read', recordType: 'RestingHeartRate' },
      { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'Distance' },
      { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
      { accessType: 'read', recordType: 'Weight' },
    ]);
    return Array.isArray(granted) && granted.length > 0;
  } catch {
    return false;
  }
}

/**
 * Open the Health Connect settings screen so the user can manage
 * connected apps and permissions.
 */
export function openHealthConnect(): void {
  if (Platform.OS !== 'android') return;
  try {
    openHealthConnectSettings();
  } catch {
    // ignore
  }
}

function last24hFilter(): { operator: 'between'; startTime: string; endTime: string } {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * MS_PER_HOUR);
  return { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() };
}

function todayFilter(): { operator: 'between'; startTime: string; endTime: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  return { operator: 'between', startTime: start.toISOString(), endTime: end.toISOString() };
}

function qualityFromStagePercent(deepRemPercent: number): number {
  if (deepRemPercent > 40) return 5;
  if (deepRemPercent >= 30) return 4;
  if (deepRemPercent >= 20) return 3;
  if (deepRemPercent >= 10) return 2;
  return 1;
}

export interface SleepSummary {
  durationHours: number;
  quality: number;
  deepSleepPercent: number;
  remSleepPercent: number;
}

/**
 * Read last night's sleep session and derive a 1-5 quality score from
 * the deep + REM proportion. Returns null if no session is found.
 *
 * @returns sleep summary or null
 */
export async function getLastNightSleep(): Promise<SleepSummary | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const result = await readRecords('SleepSession', {
      timeRangeFilter: last24hFilter(),
    });
    if (!result.records || result.records.length === 0) return null;
    // Pick the longest session in the window.
    let best: (typeof result.records)[number] | null = null;
    let bestDuration = 0;
    for (const rec of result.records) {
      const dur = new Date(rec.endTime).getTime() - new Date(rec.startTime).getTime();
      if (dur > bestDuration) {
        bestDuration = dur;
        best = rec;
      }
    }
    if (!best || bestDuration <= 0) return null;

    const durationHours = bestDuration / MS_PER_HOUR;
    const stages = best.stages ?? [];
    if (stages.length === 0) {
      return {
        durationHours: round1(durationHours),
        quality: 3,
        deepSleepPercent: 0,
        remSleepPercent: 0,
      };
    }

    let deepMs = 0;
    let remMs = 0;
    let totalStagedMs = 0;
    for (const stage of stages) {
      const dur = new Date(stage.endTime).getTime() - new Date(stage.startTime).getTime();
      if (dur <= 0) continue;
      totalStagedMs += dur;
      if (stage.stage === DEEP_STAGE) deepMs += dur;
      if (stage.stage === REM_STAGE) remMs += dur;
    }
    const deepPct = totalStagedMs > 0 ? (deepMs / totalStagedMs) * 100 : 0;
    const remPct = totalStagedMs > 0 ? (remMs / totalStagedMs) * 100 : 0;
    const quality = qualityFromStagePercent(deepPct + remPct);

    return {
      durationHours: round1(durationHours),
      quality,
      deepSleepPercent: Math.round(deepPct),
      remSleepPercent: Math.round(remPct),
    };
  } catch {
    return null;
  }
}

export interface HeartRateSummary {
  avg: number;
  resting: number | null;
  hrv: number | null;
}

/**
 * Read today's heart rate, resting heart rate and HRV.
 *
 * @returns heart-rate summary or null when no samples exist
 */
export async function getTodayHeartRate(): Promise<HeartRateSummary | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const [hrRes, restRes, hrvRes] = await Promise.allSettled([
      readRecords('HeartRate', { timeRangeFilter: todayFilter() }),
      readRecords('RestingHeartRate', { timeRangeFilter: todayFilter() }),
      readRecords('HeartRateVariabilityRmssd', { timeRangeFilter: todayFilter() }),
    ]);

    let avg = 0;
    let count = 0;
    if (hrRes.status === 'fulfilled') {
      for (const rec of hrRes.value.records) {
        for (const sample of rec.samples) {
          avg += sample.beatsPerMinute;
          count += 1;
        }
      }
    }
    if (count === 0) return null;
    const avgHr = Math.round(avg / count);

    let resting: number | null = null;
    if (restRes.status === 'fulfilled' && restRes.value.records.length > 0) {
      const last = restRes.value.records[restRes.value.records.length - 1];
      resting = Math.round(last.beatsPerMinute);
    }

    let hrv: number | null = null;
    if (hrvRes.status === 'fulfilled' && hrvRes.value.records.length > 0) {
      const last = hrvRes.value.records[hrvRes.value.records.length - 1];
      hrv = Math.round(last.heartRateVariabilityMillis);
    }

    return { avg: avgHr, resting, hrv };
  } catch {
    return null;
  }
}

/**
 * Sum today's step count across all step records.
 *
 * @returns total steps or null
 */
export async function getTodaySteps(): Promise<number | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const result = await readRecords('Steps', { timeRangeFilter: todayFilter() });
    if (result.records.length === 0) return null;
    return result.records.reduce((acc, rec) => acc + rec.count, 0);
  } catch {
    return null;
  }
}

/**
 * Sum today's active calories burned.
 *
 * @returns kilocalories or null
 */
export async function getTodayActiveCalories(): Promise<number | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const result = await readRecords('ActiveCaloriesBurned', {
      timeRangeFilter: todayFilter(),
    });
    if (result.records.length === 0) return null;
    const total = result.records.reduce((acc, rec) => acc + rec.energy.inKilocalories, 0);
    return Math.round(total);
  } catch {
    return null;
  }
}

/**
 * Read the most recent weight measurement (last 30 days).
 *
 * @returns weight in kg or null
 */
export async function getLatestWeight(): Promise<number | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 24 * MS_PER_HOUR);
    const result = await readRecords('Weight', {
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });
    if (result.records.length === 0) return null;
    const last = result.records[result.records.length - 1];
    return round1(last.weight.inKilograms);
  } catch {
    return null;
  }
}

/**
 * Read every health metric for today in parallel.
 *
 * @returns combined data with null for any unavailable metric
 */
export async function getTodayHealthData(): Promise<HealthConnectData> {
  const empty: HealthConnectData = {
    sleepDurationHours: null,
    sleepQuality: null,
    avgHeartRate: null,
    restingHeartRate: null,
    hrv: null,
    steps: null,
    activeCalories: null,
    weight: null,
  };
  if (Platform.OS !== 'android') return empty;

  const [sleep, hr, steps, calories, weight] = await Promise.allSettled([
    getLastNightSleep(),
    getTodayHeartRate(),
    getTodaySteps(),
    getTodayActiveCalories(),
    getLatestWeight(),
  ]);

  const sleepVal = sleep.status === 'fulfilled' ? sleep.value : null;
  const hrVal = hr.status === 'fulfilled' ? hr.value : null;

  return {
    sleepDurationHours: sleepVal?.durationHours ?? null,
    sleepQuality: sleepVal?.quality ?? null,
    avgHeartRate: hrVal?.avg ?? null,
    restingHeartRate: hrVal?.resting ?? null,
    hrv: hrVal?.hrv ?? null,
    steps: steps.status === 'fulfilled' ? steps.value : null,
    activeCalories: calories.status === 'fulfilled' ? calories.value : null,
    weight: weight.status === 'fulfilled' ? weight.value : null,
  };
}

export interface CheckinAutoFill {
  sleep_duration: number | null;
  sleep_quality: number | null;
  canAutoFill: boolean;
}

/**
 * Produce sleep values suitable for pre-filling the daily check-in.
 *
 * @returns auto-fill payload; `canAutoFill` is false when no sleep data
 */
export async function autoFillCheckinFromHealth(): Promise<CheckinAutoFill> {
  const sleep = await getLastNightSleep();
  if (!sleep) {
    return { sleep_duration: null, sleep_quality: null, canAutoFill: false };
  }
  return {
    sleep_duration: sleep.durationHours,
    sleep_quality: sleep.quality,
    canAutoFill: true,
  };
}

function round1(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10) / 10;
}
