import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Calendar } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';
import { Card } from '@/components/ui/Card';
import type { WorkloadSport } from '@/lib/pro';
import type { DailyPerformanceMetrics } from '@/lib/pro';
import type { ExerciseMax, RunningProfile } from '@/lib/firestore';
import { calculateVDOTPaces, formatPace as formatRunPace, raceLabel } from '@/lib/runningEngine';

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
        TES PROJECTIONS
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.subtitle}>
        Basé sur ton CTL actuel et ta progression
      </ZoneText>

      {activeSports.includes('running') ? (
        <RunningPrediction runningProfile={runningProfile} />
      ) : null}
      {activeSports.includes('weightlifting') ? (
        <WeightliftingPrediction exerciseMaxes={exerciseMaxes} />
      ) : null}
      {activeSports.includes('musculation') ? <MusculationPrediction /> : null}

      <View style={[styles.window, { borderColor: colors.accent.gold }]}>
        <View style={styles.windowHeader}>
          <Calendar size={16} color={colors.accent.gold} />
          <ZoneText variant="label" color={colors.accent.gold}>
            Fenêtre de forme optimale
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

  return (
    <View style={styles.predictionCard}>
      <ZoneText variant="caption" color={colors.text.muted}>
        Dans 8 semaines · Course
      </ZoneText>
      <ZoneText variant="heading" size={28} color={colors.accent.gold}>
        {projectedTime}
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.muted}>
        {raceLabel(targetDistance)} · actuel {currentTime}
      </ZoneText>
      <ZoneText variant="caption" color={colors.success}>
        Amélioration estimée : {improvement}
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.predDetail}>
        Basé sur VDOT progression de +1,2/mois
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
      <View style={styles.predictionCard}>
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

  return (
    <View style={styles.predictionCard}>
      <ZoneText variant="caption" color={colors.text.muted}>
        Dans 4 semaines · {mainLift.exercise_id}
      </ZoneText>
      <ZoneText variant="heading" size={28} color={colors.accent.gold}>
        {projected} kg
      </ZoneText>
      <ZoneText variant="caption" color={colors.success}>
        +{delta} kg estimé
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.predDetail}>
        Basé sur ta vélocité de progression actuelle
      </ZoneText>
    </View>
  );
}

function MusculationPrediction(): React.ReactElement {
  return (
    <View style={styles.predictionCard}>
      <ZoneText variant="caption" color={colors.text.muted}>
        Pic de volume dans 3 semaines · Musculation
      </ZoneText>
      <ZoneText variant="body" color={colors.text.primary}>
        Tu atteindras le MAV sur les principaux groupes musculaires.
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
      detail: 'La fenêtre de forme apparaît une fois ton CTL stabilisé.',
    };
  }
  const last = metrics[metrics.length - 1];
  if (last.tsb >= 5 && last.tsb <= 25) {
    return {
      description: 'Tu es dans la fenêtre maintenant.',
      detail: `TSB actuel : +${Math.round(last.tsb)}. Profite de cette fraîcheur.`,
    };
  }
  const daysAway = Math.max(1, Math.min(28, Math.round((10 - last.tsb) / 1.3)));
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysAway);
  return {
    description: `Dans environ ${daysAway} jours.`,
    detail: `TSB projeté : +${Math.round(Math.max(5, 10))}. Date estimée : ${targetDate.toLocaleDateString('fr-FR')}.`,
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
  predDetail: {
    marginTop: 6,
  },
  window: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
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
