import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';
import { Card } from '@/components/ui/Card';
import type { WorkloadSport } from '@/lib/pro';
import type { DailyPerformanceMetrics } from '@/lib/pro';
import type { ExerciseMax, RunningProfile } from '@/lib/firestore';
import { calculateVDOTPaces, raceLabel } from '@/lib/runningEngine';
import { getExerciseById } from '@/data/exercises';

export interface PredictionsCardProps {
  activeSports: WorkloadSport[];
  metrics: DailyPerformanceMetrics[];
  runningProfile: RunningProfile | null;
  exerciseMaxes: ExerciseMax[];
}

export function PredictionsCard({
  activeSports,
  metrics,
  runningProfile,
  exerciseMaxes,
}: PredictionsCardProps): React.ReactElement {
  const peakWindow = findUpcomingPeakWindow(metrics);

  return (
    <Card style={styles.card}>
      <ZoneText variant="heading" size={22} color={colors.text.primary} style={styles.title}>
        TES OBJECTIFS DANS 8 SEMAINES
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.subtitle}>
        Si tu maintiens ce rythme...
      </ZoneText>

      {activeSports.includes('running') ? (
        <RunningPrediction runningProfile={runningProfile} />
      ) : null}
      {activeSports.includes('weightlifting') ? (
        <WeightliftingPrediction exerciseMaxes={exerciseMaxes} />
      ) : null}
      {activeSports.includes('musculation') ? <MusculationPrediction /> : null}

      <View style={styles.window}>
        <View style={styles.windowHeader}>
          <Calendar size={16} color={colors.scoreGreen} />
          <ZoneText variant="label" color={colors.scoreGreen}>
            Ta prochaine fenêtre de forme
          </ZoneText>
        </View>
        <ZoneText variant="body" size={13} color={colors.text.primary} style={styles.windowBody}>
          {peakWindow.description}
        </ZoneText>
        <ZoneText variant="caption" color={colors.text.muted}>
          {peakWindow.detail}
        </ZoneText>
      </View>
    </Card>
  );
}

function RunningPrediction({
  runningProfile,
}: {
  runningProfile: RunningProfile | null;
}): React.ReactElement {
  const currentVDOT = runningProfile?.vdot ?? 0;
  const targetDistance = runningProfile?.reference_distance ?? '10km';
  const projectedVDOT = currentVDOT > 0 ? currentVDOT + 1.2 : 0;

  let currentTime = '—';
  let projectedTime = '—';
  let improvement = '—';
  if (currentVDOT > 0) {
    const paces = calculateVDOTPaces(currentVDOT);
    const projPaces = calculateVDOTPaces(projectedVDOT);
    const distMeters = distanceMeters(targetDistance);
    const currentSec = (paces.T * distMeters) / 1000;
    const projSec = (projPaces.T * distMeters) / 1000;
    currentTime = formatHMS(currentSec);
    projectedTime = formatHMS(projSec);
    improvement = `-${formatHMS(currentSec - projSec)}`;
  }

  if (currentVDOT <= 0) {
    return (
      <View style={[styles.predictionCard, styles.predictionBand, { borderLeftColor: colors.run }]}>
        <ZoneText variant="body" size={13} color={colors.text.primary}>
          Renseigne ton allure de référence pour activer ta projection course.
        </ZoneText>
      </View>
    );
  }

  return (
    <View style={[styles.predictionCard, styles.predictionBand, { borderLeftColor: colors.run }]}>
      <ZoneText variant="body" size={14} color={colors.text.primary} style={styles.predSentence}>
        Dans 8 semaines, tu pourrais courir un {raceLabel(targetDistance)} en{' '}
        <ZoneText variant="body" size={14} color={colors.scoreGreen}>
          {projectedTime}
        </ZoneText>
        .
      </ZoneText>
      <ZoneText variant="caption" color={colors.success}>
        Soit {improvement} de mieux qu’aujourd’hui ({currentTime}).
      </ZoneText>
    </View>
  );
}

function WeightliftingPrediction({
  exerciseMaxes,
}: {
  exerciseMaxes: ExerciseMax[];
}): React.ReactElement {
  const mainLift =
    exerciseMaxes.find((m) => m.exercise_id === 'clean_and_jerk') ??
    exerciseMaxes.find((m) => m.exercise_id === 'snatch') ??
    exerciseMaxes[0];

  if (!mainLift) {
    return (
      <View style={[styles.predictionCard, styles.predictionBand, { borderLeftColor: colors.haltero }]}>
        <ZoneText variant="caption" color={colors.text.muted}>
          Dans 4 semaines · Haltérophilie
        </ZoneText>
        <ZoneText variant="body" color={colors.text.primary}>
          Renseigne tes maxes pour activer la projection.
        </ZoneText>
      </View>
    );
  }
  const projected = Math.round(mainLift.estimated_1rm + 5);
  const delta = projected - Math.round(mainLift.estimated_1rm);
  const liftName = (getExerciseById(mainLift.exercise_id)?.name ?? mainLift.exercise_id).toLowerCase();

  return (
    <View style={[styles.predictionCard, styles.predictionBand, { borderLeftColor: colors.haltero }]}>
      <ZoneText variant="body" size={14} color={colors.text.primary} style={styles.predSentence}>
        Dans 4 semaines, ton {liftName} pourrait atteindre{' '}
        <ZoneText variant="body" size={14} color={colors.scoreGreen}>
          {projected} kg
        </ZoneText>
        .
      </ZoneText>
      <ZoneText variant="caption" color={colors.success}>
        +{delta} kg estimé.
      </ZoneText>
    </View>
  );
}

function MusculationPrediction(): React.ReactElement {
  return (
    <View style={[styles.predictionCard, styles.predictionBand, { borderLeftColor: colors.muscu }]}>
      <ZoneText variant="caption" color={colors.text.muted}>
        Pic de volume dans 3 semaines · Musculation
      </ZoneText>
      <ZoneText variant="body" color={colors.text.primary}>
        Tu atteindras un volume d’entraînement optimal sur tes principaux groupes musculaires.
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.predDetail}>
        Premiers changements visibles attendus à partir de la semaine prochaine.
      </ZoneText>
    </View>
  );
}

interface PeakWindow {
  description: string;
  detail: string;
}

function findUpcomingPeakWindow(metrics: DailyPerformanceMetrics[]): PeakWindow {
  if (metrics.length === 0) {
    return {
      description: 'Continue à enregistrer tes séances pour activer la projection.',
      detail: 'Ta fenêtre de forme apparaît après quelques semaines de données.',
    };
  }
  const last = metrics[metrics.length - 1];
  if (last.tsb >= 5 && last.tsb <= 25) {
    return {
      description: 'Ton corps est au sommet en ce moment.',
      detail: 'C’est le meilleur moment pour te dépasser.',
    };
  }
  const daysAway = Math.max(1, Math.min(28, Math.round((10 - last.tsb) / 1.3)));
  return {
    description: `Dans ${daysAway} jours, ton corps sera au sommet.`,
    detail: 'C’est le meilleur moment pour te dépasser.',
  };
}

function distanceMeters(d: RunningProfile['reference_distance']): number {
  switch (d) {
    case '5km':
      return 5000;
    case '10km':
      return 10000;
    case 'semi':
      return 21097;
    case 'marathon':
      return 42195;
    default:
      return 10000;
  }
}

function formatHMS(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
  },
  title: {
    letterSpacing: 1.2,
  },
  subtitle: {
    marginTop: 2,
    marginBottom: 12,
  },
  predictionCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.bg.elevated,
  },
  predictionBand: {
    borderLeftWidth: 4,
  },
  predDetail: {
    marginTop: 6,
  },
  predSentence: {
    lineHeight: 20,
    marginBottom: 4,
  },
  window: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.bg.elevated,
  },
  windowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  windowBody: {
    marginTop: 6,
  },
});
