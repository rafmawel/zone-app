import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { auth } from '@/lib/firebase';
import {
  getCompletedRuns,
  getCompletedSessions,
  getExerciseMaxes,
  getHyroxProfile,
  getHyroxSessionHistory,
  getLatestCheckins,
  getMuscleProfile,
  getRunningProfile,
  getUserProgram,
  todayDateString,
  type DailyCheckin,
  type ExerciseMax,
  type HyroxProfile,
  type HyroxSessionRecord,
  type MuscleProfile,
  type RunSession,
  type RunningProfile,
  type RunningRaceDistance,
  type TrainingSession,
  type UserProgram,
} from '@/lib/firestore';
import { formatElapsed, raceLabel, raceMeters, raceTimeForVdot } from '@/lib/runningEngine';
import { colors, type SportColorKey } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { AnalyticsSkeleton } from '@/components/analytics/AnalyticsSkeleton';
import { CheckinBanner } from '@/components/CheckinBanner';
import { ProReadinessCard } from '@/components/analytics/ProReadinessCard';
import { RegularityCard, type RegularityDay } from '@/components/analytics/RegularityCard';
import { FormFatigueCard } from '@/components/analytics/FormFatigueCard';
import {
  SportProgressionCard,
  type ProgressionItem,
} from '@/components/analytics/SportProgressionCard';

interface AnalyticsData {
  loaded: boolean;
  checkins: DailyCheckin[];
  sessions: TrainingSession[];
  runs: RunSession[];
  hyrox: HyroxSessionRecord[];
  maxes: ExerciseMax[];
  runningProfile: RunningProfile | null;
  muscleProfile: MuscleProfile | null;
  hyroxProfile: HyroxProfile | null;
  program: UserProgram | null;
}

const EMPTY: AnalyticsData = {
  loaded: false,
  checkins: [],
  sessions: [],
  runs: [],
  hyrox: [],
  maxes: [],
  runningProfile: null,
  muscleProfile: null,
  hyroxProfile: null,
  program: null,
};

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() + n);
  return x;
}

function energyFromFeeling(f: number | undefined): string {
  if (f == null) return '—';
  if (f >= 7) return 'Bonne';
  if (f >= 4) return 'Moyenne';
  return 'Basse';
}

function recoveryFromSoreness(s: number | undefined): string {
  if (s == null) return '—';
  if (s <= 2) return 'Bonne';
  if (s === 3) return 'En cours';
  return 'Courbatures';
}

function formatRaceTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  return `${m} min`;
}

export default function AnalyticsScreen(): React.ReactElement {
  const [data, setData] = useState<AnalyticsData>(EMPTY);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setData((p) => ({ ...p, loaded: true }));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [checkins, sessions, runs, hyrox, maxes, runningProfile, muscleProfile, hyroxProfile, program] =
          await Promise.all([
            getLatestCheckins(user.uid, 90),
            getCompletedSessions(user.uid),
            getCompletedRuns(user.uid, 80),
            getHyroxSessionHistory(user.uid, 40),
            getExerciseMaxes(user.uid),
            getRunningProfile(user.uid),
            getMuscleProfile(user.uid),
            getHyroxProfile(user.uid),
            getUserProgram(user.uid),
          ]);
        if (cancelled) return;
        setData({
          loaded: true,
          checkins,
          sessions,
          runs,
          hyrox,
          maxes,
          runningProfile,
          muscleProfile,
          hyroxProfile,
          program,
        });
      } catch {
        if (!cancelled) setData((p) => ({ ...p, loaded: true }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data.loaded) {
    return (
      <SafeScreen>
        <AnalyticsSkeleton />
      </SafeScreen>
    );
  }

  const today = addDays(new Date(), 0);
  const todayStr = todayDateString(today);
  const start = addDays(today, -55); // 8 weeks × 7 days, ending today

  // ── Section 1: today's check-in ──────────────────────────────────────────
  const todayCheckin = data.checkins.find((c) => c.date === todayStr) ?? null;
  const score = todayCheckin ? todayCheckin.zone_score : null;
  const sleepHours = todayCheckin ? todayCheckin.sleep_duration : null;
  const energyLabel = energyFromFeeling(todayCheckin?.feeling);
  const recoveryLabel = recoveryFromSoreness(todayCheckin?.muscle_soreness);

  // ── Section 2: regularity grid (8×7) ─────────────────────────────────────
  const activities: { date: string; sport: SportColorKey }[] = [
    ...data.sessions.map((s) => ({
      date: s.date,
      sport: (s.discipline === 'musculation' ? 'muscu' : 'haltero') as SportColorKey,
    })),
    ...data.runs.map((r) => ({ date: r.date, sport: 'run' as SportColorKey })),
    ...data.hyrox.map((h) => ({ date: h.date, sport: 'hyrox' as SportColorKey })),
  ];
  const doneMap = new Map<string, SportColorKey>();
  const doneSet = new Set<string>();
  for (const a of activities) {
    doneSet.add(a.date);
    if (!doneMap.has(a.date)) doneMap.set(a.date, a.sport);
  }
  const weeks: RegularityDay[][] = [];
  for (let w = 0; w < 8; w += 1) {
    const row: RegularityDay[] = [];
    for (let dy = 0; dy < 7; dy += 1) {
      const ds = todayDateString(addDays(start, w * 7 + dy));
      const sport = doneMap.get(ds);
      row.push({ done: sport != null, sport, isToday: ds === todayStr });
    }
    weeks.push(row);
  }
  const totalSessions = activities.filter((a) => a.date >= todayDateString(start) && a.date <= todayStr).length;
  let streakDays = 0;
  let cursor = doneSet.has(todayStr) ? today : addDays(today, -1);
  while (doneSet.has(todayDateString(cursor))) {
    streakDays += 1;
    cursor = addDays(cursor, -1);
  }

  // ── Section 3: weekly Zone score ─────────────────────────────────────────
  const weeklyScores: number[] = [];
  for (let w = 0; w < 8; w += 1) {
    const wStart = todayDateString(addDays(start, w * 7));
    const wEnd = todayDateString(addDays(start, w * 7 + 6));
    const inWeek = data.checkins.filter((c) => c.date >= wStart && c.date <= wEnd);
    weeklyScores.push(
      inWeek.length === 0
        ? NaN
        : Math.round(inWeek.reduce((acc, c) => acc + (c.zone_score ?? 0), 0) / inWeek.length),
    );
  }
  const finite = weeklyScores.filter((v) => Number.isFinite(v));
  const average = finite.length ? Math.round(finite.reduce((a, b) => a + b, 0) / finite.length) : NaN;
  const firstFinite = weeklyScores.find((v) => Number.isFinite(v));
  const lastFinite = [...weeklyScores].reverse().find((v) => Number.isFinite(v));
  const trend =
    finite.length >= 2 && firstFinite != null && lastFinite != null
      ? Math.round(lastFinite - firstFinite)
      : 0;

  // ── Section 4: per-sport progression ─────────────────────────────────────
  const items: ProgressionItem[] = [];
  if (data.program) {
    const snatch = data.maxes.find((m) => m.exercise_id === 'snatch');
    const squat = data.maxes.find((m) => m.exercise_id === 'front_squat');
    items.push({
      sport: 'haltero',
      emoji: '🏋️',
      name: 'Haltérophilie',
      enoughData: Boolean(snatch || squat),
      primary: snatch
        ? { label: 'Snatch', value: `${snatch.weight_kg} kg` }
        : squat
          ? { label: 'Front Squat', value: `${squat.weight_kg} kg` }
          : undefined,
      secondary: snatch && squat ? { label: 'Front Squat', value: `${squat.weight_kg} kg` } : undefined,
      phrase: 'Continue comme ça, tu progresses semaine après semaine.',
    });
  }
  if (data.runningProfile) {
    const vdot = Math.round(data.runningProfile.vdot);
    const projected = Math.min(85, vdot + 2);
    const dist = (data.runningProfile.race_distance ??
      data.runningProfile.reference_distance ??
      '10km') as RunningRaceDistance;
    const meters = raceMeters(dist);
    const distLabel = raceLabel(dist);
    const goalSeconds = data.runningProfile.goal_time_seconds ?? 0;
    if (goalSeconds > 0) {
      // Goal time set: show the current estimated time on that distance, the
      // target, and how much is left to shave off.
      const currentTime = raceTimeForVdot(vdot, meters);
      const remaining = Math.max(0, currentTime - goalSeconds);
      items.push({
        sport: 'run',
        emoji: '🏃',
        name: 'Course',
        enoughData: data.runs.length >= 3,
        primary: { label: `${distLabel} estimé`, value: formatElapsed(currentTime) },
        secondary: { label: 'Objectif', value: formatElapsed(goalSeconds), color: colors.scoreGreen },
        phrase:
          remaining > 0
            ? `Il te reste ${formatElapsed(remaining)} à gagner sur ${distLabel.toLowerCase()} pour atteindre ton objectif.`
            : `Objectif déjà à portée sur ${distLabel.toLowerCase()} — continue pour le sécuriser.`,
      });
    } else {
      const predicted = formatRaceTime(raceTimeForVdot(projected, meters));
      items.push({
        sport: 'run',
        emoji: '🏃',
        name: 'Course',
        enoughData: data.runs.length >= 3,
        primary: { label: 'VDOT actuel', value: String(vdot) },
        secondary: { label: 'Dans 8 semaines', value: `→ ${projected}`, color: colors.scoreGreen },
        phrase: `Tu pourrais courir le ${distLabel.toLowerCase()} en ${predicted} dans 8 semaines.`,
      });
    }
  }
  if (data.muscleProfile) {
    const count = data.sessions.filter((s) => s.discipline === 'musculation').length;
    items.push({
      sport: 'muscu',
      emoji: '💪',
      name: 'Musculation',
      enoughData: count >= 3,
      primary: { label: 'Séances totales', value: String(count) },
      phrase: 'Tes séances s’enchaînent, beau travail.',
    });
  }
  if (data.hyroxProfile) {
    items.push({
      sport: 'hyrox',
      emoji: '🔥',
      name: 'Hyrox',
      enoughData: data.hyrox.length >= 3,
      primary: { label: 'Séances totales', value: String(data.hyrox.length) },
      phrase: 'Ta condition Hyrox progresse, continue.',
    });
  }

  const hasCheckinToday = todayCheckin != null;

  return (
    <SafeScreen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ZoneText variant="heading" style={styles.title}>
          Analyse
        </ZoneText>

        {!hasCheckinToday ? (
          <>
            <CheckinBanner />
            <View style={styles.gap} />
          </>
        ) : null}

        <ProReadinessCard
          score={score}
          sleepHours={sleepHours}
          energyLabel={energyLabel}
          recoveryLabel={recoveryLabel}
        />

        <View style={styles.gap} />
        <RegularityCard weeks={weeks} totalSessions={totalSessions} streakDays={streakDays} />

        <View style={styles.gap} />
        <FormFatigueCard weeklyScores={weeklyScores} average={average} trend={trend} />

        {items.length > 0 ? (
          <>
            <View style={styles.gap} />
            <ZoneText style={styles.sectionTitle}>Ta progression</ZoneText>
            {items.map((item) => (
              <View key={item.sport} style={styles.progressionItem}>
                <SportProgressionCard item={item} />
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 24, marginBottom: 16, marginLeft: 2 },
  gap: { height: 12 },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  progressionItem: { marginBottom: 12 },
});
