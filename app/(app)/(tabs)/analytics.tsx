import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { auth } from '@/lib/firebase';
import {
  getCompletedSessions,
  getExerciseMaxes,
  getLatestCheckins,
  getMuscleProfile,
  getRunningProfile,
  getUserProgram,
  getUserSports,
  getWorkloadHistory,
  todayDateString,
  type DailyCheckin,
  type ExerciseMax,
  type RunningProfile,
  type TrainingSession,
  type UserSport,
  type WorkloadEntry,
} from '@/lib/firestore';
import {
  analyzeSleepDebt,
  calculateACWR,
  calculatePerformanceModel,
  calculateProReadiness,
  getFormStatus,
  getWeeklyLoadBudget,
  mapUserSportsToWorkloadSports,
  trackMuscleVolumeStatus,
  type ACWRResult,
  type DailyPerformanceMetrics,
  type MuscleVolumeStatus,
  type ProReadinessScore,
  type SleepDebtAnalysis,
  type WeeklyLoadBudget,
  type WorkloadDataPoint,
  type WorkloadSport,
} from '@/lib/pro';
import { usePro } from '@/hooks/usePro';
import { EXERCISES } from '@/data/exercises';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { LockedAnalytics } from '@/components/analytics/LockedAnalytics';
import { AnalyticsSkeleton } from '@/components/analytics/AnalyticsSkeleton';
import { CheckinBanner } from '@/components/CheckinBanner';
import { ProReadinessCard } from '@/components/analytics/ProReadinessCard';
import { FormFatigueCard } from '@/components/analytics/FormFatigueCard';
import { ACWRCard } from '@/components/analytics/ACWRCard';
import { SportProgressionCard } from '@/components/analytics/SportProgressionCard';
import { PredictionsCard } from '@/components/analytics/PredictionsCard';
import { CoachZoneCard } from '@/components/analytics/CoachZoneCard';

interface AnalyticsState {
  loaded: boolean;
  workloadHistory: WorkloadDataPoint[];
  checkins: DailyCheckin[];
  maxes: ExerciseMax[];
  runningProfile: RunningProfile | null;
  completedSessions: TrainingSession[];
  userSports: UserSport[];
  zoneScore: number;
}

interface ComputedState {
  metrics: DailyPerformanceMetrics[];
  acwr: ACWRResult;
  budget: WeeklyLoadBudget;
  sleepDebt: SleepDebtAnalysis;
  readiness: ProReadinessScore;
  muscleVolume: MuscleVolumeStatus[];
  activeSports: WorkloadSport[];
}

export default function AnalyticsScreen(): React.ReactElement {
  const { isPro, loading: proLoading } = usePro();
  const [state, setState] = useState<AnalyticsState>({
    loaded: false,
    workloadHistory: [],
    checkins: [],
    maxes: [],
    runningProfile: null,
    completedSessions: [],
    userSports: [],
    zoneScore: 50,
  });

  useEffect(() => {
    if (!isPro) return;
    const user = auth.currentUser;
    if (!user) {
      setState((prev) => ({ ...prev, loaded: true }));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [workload, checkins, maxes, runningProfile, sessions, sports] = await Promise.all([
          getWorkloadHistory(user.uid, 60),
          getLatestCheckins(user.uid, 14),
          getExerciseMaxes(user.uid),
          getRunningProfile(user.uid),
          getCompletedSessions(user.uid),
          getUserSports(user.uid),
        ]);
        await Promise.all([getMuscleProfile(user.uid), getUserProgram(user.uid)]);
        if (cancelled) return;
        const todayCheckin = checkins.find((c) => c.date === todayDateString());
        setState({
          loaded: true,
          workloadHistory: toWorkloadDataPoints(workload),
          checkins,
          maxes,
          runningProfile,
          completedSessions: sessions,
          userSports: sports,
          zoneScore: todayCheckin?.zone_score ?? checkins[0]?.zone_score ?? 50,
        });
      } catch {
        if (cancelled) return;
        setState((prev) => ({ ...prev, loaded: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPro]);

  if (proLoading) {
    return (
      <SafeScreen>
        <AnalyticsSkeleton />
      </SafeScreen>
    );
  }

  if (!isPro) {
    return (
      <SafeScreen>
        <LockedAnalytics />
      </SafeScreen>
    );
  }

  if (!state.loaded) {
    return (
      <SafeScreen>
        <AnalyticsSkeleton />
      </SafeScreen>
    );
  }

  const computed = computeAnalytics(state);
  const hasCheckinToday = state.checkins.some(
    (c) => c.date === todayDateString(),
  );

  return (
    <SafeScreen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {!hasCheckinToday ? <CheckinBanner /> : null}
        <ProReadinessCard
          readiness={computed.readiness}
          zoneScore={state.zoneScore}
          acwr={computed.acwr.acwr}
          acwrRiskLabel={frenchRiskLabel(computed.acwr.riskLevel)}
          avgSleepHours={computed.sleepDebt.avgHoursLast7Days}
          tsb={computed.metrics[computed.metrics.length - 1]?.tsb ?? 0}
          tsbLabel={getFormStatus(
            computed.metrics[computed.metrics.length - 1]?.tsb ?? 0,
          ).label}
        />
        <View style={styles.gap} />
        <FormFatigueCard
          metrics={computed.metrics}
          formStatus={getFormStatus(
            computed.metrics[computed.metrics.length - 1]?.tsb ?? 0,
          )}
        />
        <View style={styles.gap} />
        <ACWRCard
          acwrResult={computed.acwr}
          budget={computed.budget}
          workloadHistory={state.workloadHistory}
        />
        <View style={styles.gap} />
        <SportProgressionCard
          activeSports={computed.activeSports}
          workloadHistory={state.workloadHistory}
          exerciseMaxes={state.maxes}
          completedSessions={state.completedSessions}
          runningProfile={state.runningProfile}
          muscleVolumeStatus={computed.muscleVolume}
        />
        <View style={styles.gap} />
        <PredictionsCard
          activeSports={computed.activeSports}
          metrics={computed.metrics}
          runningProfile={state.runningProfile}
          exerciseMaxes={state.maxes}
        />
        <View style={styles.gap} />
        <CoachZoneCard
          acwr={computed.acwr}
          sleepDebt={computed.sleepDebt}
          metrics={computed.metrics}
          budget={computed.budget}
        />
      </ScrollView>
    </SafeScreen>
  );
}

function computeAnalytics(state: AnalyticsState): ComputedState {
  const today = todayDateString();
  const metrics = calculatePerformanceModel(state.workloadHistory, 120);
  const acwr = calculateACWR(state.workloadHistory, today);
  const budget = getWeeklyLoadBudget(acwr);
  const sleepDebt = analyzeSleepDebt(
    state.checkins.map((c) => ({
      date: c.date,
      sleep_duration: c.sleep_duration,
      sleep_quality: c.sleep_quality,
    })),
  );
  const activeSports = mapUserSportsToWorkloadSports(
    state.userSports.map((s) => s.sport_key),
  );
  const exerciseToMuscleMap = buildExerciseMuscleMap();
  const muscleVolume = trackMuscleVolumeStatus(
    state.completedSessions.map((session) => ({
      date: session.date,
      exercises:
        session.planned_exercises?.map((ex) => ({
          exerciseId: ex.exercise_id,
          sets: ex.sets.map((s) => ({
            reps: parseInt(s.target_reps, 10) || 0,
            weightKg: s.target_weight_kg ?? 0,
          })),
        })) ?? [],
    })),
    exerciseToMuscleMap,
    4,
  );
  const lastTSB = metrics[metrics.length - 1]?.tsb ?? 0;
  const readiness = calculateProReadiness({
    zoneScore: state.zoneScore,
    acwr,
    sleepDebt,
    tsb: lastTSB,
    activeSports: activeSports.length > 0 ? activeSports : ['weightlifting'],
  });
  return {
    metrics,
    acwr,
    budget,
    sleepDebt,
    readiness,
    muscleVolume,
    activeSports,
  };
}

const VALID_WORKLOAD_SPORTS: ReadonlySet<WorkloadSport> = new Set([
  'weightlifting',
  'running',
  'musculation',
  'hyrox',
]);

function toWorkloadDataPoints(entries: WorkloadEntry[]): WorkloadDataPoint[] {
  const out: WorkloadDataPoint[] = [];
  for (const e of entries) {
    if (!VALID_WORKLOAD_SPORTS.has(e.sport as WorkloadSport)) continue;
    out.push({
      date: e.date,
      tss: e.tss,
      sport: e.sport as WorkloadSport,
      sessionType: e.sessionType,
      durationMinutes: e.durationMinutes,
      intensityFactor: e.intensityFactor,
    });
  }
  return out;
}

function buildExerciseMuscleMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const ex of EXERCISES) {
    map[ex.id] = [...ex.muscles_primary, ...ex.muscles_secondary];
  }
  return map;
}

function frenchRiskLabel(riskLevel: ACWRResult['riskLevel']): string {
  switch (riskLevel) {
    case 'optimal':
      return 'optimal';
    case 'caution':
      return 'prudence';
    case 'danger':
      return 'danger';
    case 'undertraining':
    default:
      return 'sous-charge';
  }
}

const styles = StyleSheet.create({
  scroll: {
    padding: 16,
    paddingBottom: 32,
  },
  gap: {
    height: 16,
  },
});
