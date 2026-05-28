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
