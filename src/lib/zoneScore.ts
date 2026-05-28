import { colors } from '@/theme/colors';

export interface ScoreInputs {
  sleep_duration: number;
  sleep_quality: number;
  feeling: number;
  muscle_soreness: number;
  stress: number;
  days_since_last_session: number;
}

/**
 * Optional Health Connect signals. When present, Health Connect sleep
 * overrides the manual sleep inputs and a heart-rate / HRV component is
 * added to the score.
 */
export interface HealthScoreInputs {
  sleep_duration_hours?: number | null;
  sleep_quality?: number | null;
  resting_heart_rate?: number | null;
  resting_heart_rate_baseline?: number | null;
  hrv_ms?: number | null;
  hrv_baseline?: number | null;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function sleepDurationScore(hours: number): number {
  return Math.min(
    100,
    hours < 5 ? hours * 10 : hours <= 9 ? 50 + (hours - 5) * 12.5 : 100 - (hours - 9) * 10,
  );
}

/**
 * Derive a 0-100 heart-rate readiness component.
 *
 * Lower resting HR vs baseline and higher HRV vs baseline both raise the
 * score. Falls back to a neutral 60 when no baseline is available.
 *
 * @param health Health Connect inputs
 * @returns 0-100 component, or null when no HR/HRV data
 */
function heartRateComponent(health: HealthScoreInputs): number | null {
  const parts: number[] = [];

  if (health.resting_heart_rate != null && health.resting_heart_rate > 0) {
    const baseline = health.resting_heart_rate_baseline ?? null;
    if (baseline && baseline > 0) {
      // 0 bpm delta = 70; resting 8 bpm below baseline = 100; above = lower.
      const delta = baseline - health.resting_heart_rate;
      parts.push(clamp(70 + delta * 3.75, 0, 100));
    } else {
      // No baseline: map absolute resting HR (40 great, 80 poor).
      parts.push(clamp(100 - (health.resting_heart_rate - 40) * 1.5, 0, 100));
    }
  }

  if (health.hrv_ms != null && health.hrv_ms > 0) {
    const baseline = health.hrv_baseline ?? null;
    if (baseline && baseline > 0) {
      const ratio = health.hrv_ms / baseline;
      parts.push(clamp(50 + (ratio - 1) * 200, 0, 100));
    } else {
      // No baseline: map absolute HRV (20ms low, 80ms high).
      parts.push(clamp((health.hrv_ms - 20) * 1.6, 0, 100));
    }
  }

  if (parts.length === 0) return null;
  return parts.reduce((acc, v) => acc + v, 0) / parts.length;
}

export function calculateZoneScore(
  inputs: ScoreInputs,
  health?: HealthScoreInputs,
): number {
  const effectiveSleepHours =
    health?.sleep_duration_hours != null && health.sleep_duration_hours > 0
      ? health.sleep_duration_hours
      : inputs.sleep_duration;
  const effectiveSleepQuality =
    health?.sleep_quality != null && health.sleep_quality > 0
      ? health.sleep_quality
      : inputs.sleep_quality;

  const sleepScore =
    (sleepDurationScore(effectiveSleepHours) + (effectiveSleepQuality / 5) * 100) / 2;

  const feelingScore = (inputs.feeling / 10) * 100;

  const sorenessScore = ((5 - inputs.muscle_soreness) / 4) * 100;
  const stressScore = ((5 - inputs.stress) / 4) * 100;
  const restScore =
    inputs.days_since_last_session === 0
      ? 60
      : inputs.days_since_last_session === 1
        ? 100
        : inputs.days_since_last_session === 2
          ? 90
          : inputs.days_since_last_session === 3
            ? 75
            : inputs.days_since_last_session >= 4
              ? 50
              : 70;
  const recoveryScore = (sorenessScore + stressScore + restScore) / 3;

  const hrComponent = health ? heartRateComponent(health) : null;

  if (hrComponent !== null) {
    // Health Connect weights: sleep 30, feeling 30, recovery 25, HR/HRV 15.
    const raw =
      sleepScore * 0.3 +
      feelingScore * 0.3 +
      recoveryScore * 0.25 +
      hrComponent * 0.15;
    return Math.round(clamp(raw, 0, 100));
  }

  const raw = sleepScore * 0.35 + feelingScore * 0.35 + recoveryScore * 0.3;
  return Math.round(clamp(raw, 0, 100));
}

export interface ZoneLevel {
  label: string;
  color: string;
  message: string;
}

export function getZoneLevel(score: number): ZoneLevel {
  if (score < 40) {
    return {
      label: 'ÉCOUTE TON CORPS',
      color: colors.orbe.red,
      message: 'Les plus grands athlètes savent aussi s’arrêter.',
    };
  }
  if (score < 60) {
    return {
      label: 'RÉCUPÉRATION EN COURS',
      color: colors.orbe.amber,
      message: 'La Zone se mérite. Récupère pour mieux revenir.',
    };
  }
  if (score <= 75) {
    return {
      label: 'PRÊT À PERFORMER',
      color: colors.orbe.blue,
      message: 'Les conditions sont réunies. Donne-toi les moyens.',
    };
  }
  return {
    label: 'LA ZONE EST À PORTÉE',
    color: colors.orbe.green,
    message: 'Ton corps et ton esprit sont alignés. C’est maintenant.',
  };
}
