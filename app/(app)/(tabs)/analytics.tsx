import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Lock } from 'lucide-react-native';
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
import { useProSports } from '@/hooks/useProSports';
import { SPORT_LABELS, SPORT_PRICES, type ProSport } from '@/types/subscription';
import { EXERCISES } from '@/data/exercises';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';
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
  const router = useRouter();
  const { hasProBase, isProSport, loading: proLoading } = useProSports();
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
    if (!hasProBase) return;
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
  }, [hasProBase]);

  if (proLoading) {
    return (
      <SafeScreen>
        <AnalyticsSkeleton />
      </SafeScreen>
    );
  }

  if (!hasProBase) {
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
  // Sport progression and predictions are gated per-sport module.
  const subscribedSports = computed.activeSports.filter((s) =>
    isProSport(s as ProSport),
  );
  const lockedSports = computed.activeSports.filter(
    (s) => !isProSport(s as ProSport),
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
        {subscribedSports.length > 0 ? (
          <>
            <View style={styles.gap} />
            <SportProgressionCard
              activeSports={subscribedSports}
              workloadHistory={state.workloadHistory}
              exerciseMaxes={state.maxes}
              completedSessions={state.completedSessions}
              runningProfile={state.runningProfile}
              muscleVolumeStatus={computed.muscleVolume}
            />
            <View style={styles.gap} />
            <PredictionsCard
              activeSports={subscribedSports}
              metrics={computed.metrics}
              runningProfile={state.runningProfile}
              exerciseMaxes={state.maxes}
            />
          </>
        ) : null}
        {lockedSports.map((sport) => (
          <View key={sport}>
            <View style={styles.gap} />
            <LockedSportSection
              sport={sport as ProSport}
              onUnlock={() => router.push('/(app)/paywall')}
            />
          </View>
        ))}
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

function LockedSportSection({
  sport,
  onUnlock,
}: {
  sport: ProSport;
  onUnlock: () => void;
}): React.ReactElement {
  return (
    <View style={styles.lockedSport}>
      <View style={styles.lockedSportHeader}>
        <Lock size={16} color={colors.accent.gold} />
        <ZoneText variant="label" color={colors.text.primary}>
          Zone Pro {SPORT_LABELS[sport]}
        </ZoneText>
      </View>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.lockedSportBody}>
        Débloquez Zone Pro {SPORT_LABELS[sport]} pour accéder à cette analyse.
      </ZoneText>
      <TouchableOpacity onPress={onUnlock} activeOpacity={0.85} style={styles.lockedSportCta}>
        <ZoneText variant="label" size={13} color={colors.bg.primary} style={styles.lockedSportCtaText}>
          {SPORT_PRICES[sport]}/mois · AJOUTER CE SPORT
        </ZoneText>
      </TouchableOpacity>
    </View>
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
  lockedSport: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
  lockedSportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lockedSportBody: {
    marginTop: 8,
    lineHeight: 17,
  },
  lockedSportCta: {
    marginTop: 14,
    backgroundColor: colors.accent.gold,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  lockedSportCtaText: {
    letterSpacing: 0.5,
  },
});
