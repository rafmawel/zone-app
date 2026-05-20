import { colors } from '@/theme/colors';

export interface ScoreInputs {
  sleep_duration: number;
  sleep_quality: number;
  feeling: number;
  muscle_soreness: number;
  stress: number;
  days_since_last_session: number;
}

export function calculateZoneScore(inputs: ScoreInputs): number {
  const sleepDurationScore = Math.min(
    100,
    inputs.sleep_duration < 5
      ? inputs.sleep_duration * 10
      : inputs.sleep_duration <= 9
        ? 50 + (inputs.sleep_duration - 5) * 12.5
        : 100 - (inputs.sleep_duration - 9) * 10,
  );
  const sleepQualityScore = (inputs.sleep_quality / 5) * 100;
  const sleepScore = (sleepDurationScore + sleepQualityScore) / 2;

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

  const raw = sleepScore * 0.35 + feelingScore * 0.35 + recoveryScore * 0.3;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

export interface ZoneLevel {
  label: string;
  color: string;
  message: string;
}

export function getZoneLevel(score: number): ZoneLevel {
  if (score <= 30) {
    return {
      label: 'RÉCUPÉRATION',
      color: colors.orbe.red,
      message: 'Ton corps a besoin de repos.',
    };
  }
  if (score <= 50) {
    return {
      label: 'CORRECT',
      color: colors.orbe.amber,
      message: 'Entraînement léger recommandé.',
    };
  }
  if (score <= 75) {
    return {
      label: 'PRÊT',
      color: colors.orbe.blue,
      message: 'Tu es prêt à performer.',
    };
  }
  return {
    label: 'DANS LA ZONE',
    color: colors.orbe.green,
    message: 'Conditions optimales. Donne tout.',
  };
}
