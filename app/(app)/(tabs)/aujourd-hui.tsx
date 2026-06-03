import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import {
  createPlannedSession,
  createRunSession,
  getCompletedRuns,
  getCompletedSessions,
  getExerciseMaxes,
  getHyroxSessionHistory,
  getUpcomingRuns,
  getUpcomingSessions,
  getUserSchedule,
  getWorkloadHistory,
  setMuscleDeloadActive,
  todayDateString,
  type DailyCheckin,
  type ExerciseMax,
  type HyroxProfile,
  type HyroxSessionRecord,
  type MuscleProfile,
  type RunSession,
  type RunningProfile,
  type ScheduleSport,
  type SessionExercise,
  type TrainingSession,
  type UserProgram,
  type UserSchedule,
  type Weekday,
} from '@/lib/firestore';
import {
  estimateSessionDurationMin,
  generateWeeklySession,
  previewWeightliftingSession,
  projectProgram,
  rirIntensityDelta,
  type SessionExercisePreview,
} from '@/lib/programEngine';
import { calculateACWR, type WorkloadDataPoint, type WorkloadSport } from '@/lib/pro';
import { getExerciseById } from '@/data/exercises';
import { generateMuscleSession } from '@/lib/muscleEngine';
import { evaluateDeloadNeed, type DeloadRecommendation } from '@/lib/muscleSessionScience';
import {
  blockFromWeeksToRace,
  hyroxWeeklyPlan,
  type HyroxBlockPhase,
} from '@/lib/hyroxScience';
import type { MuscleGroup } from '@/data/exercises';
import {
  buildSessionPlan,
  calculateVDOTPaces,
  formatPace,
  getWeeklyDistribution,
  runningPaceFactor,
  sessionName,
  type ProgramBlockRunning,
  type RunningSessionType,
  type WeekIndexRunning,
} from '@/lib/runningEngine';
import {
  generateOptimalWeek,
  sportColor,
  type SchedulerSport,
} from '@/lib/multiSportScheduler';
import { getZoneLevel } from '@/lib/zoneScore';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';

interface ZoneBanner {
  border: string;
  message: string;
}

/** A dated session (completed or planned) used by the weekly calendar. */
interface CalendarSession {
  id: string;
  date: string;
  sport: ScheduleSport;
  status: 'completed' | 'planned';
  sessionType?: string;
  exerciseCount?: number;
  durationMin?: number | null;
  distanceKm?: number | null;
  rpe?: number | null;
}

function sessionSport(s: TrainingSession): ScheduleSport {
  if (s.discipline === 'musculation') return 'musculation';
  if (s.sport_key === 'running') return 'running';
  return 'weightlifting';
}

// Reps-in-reserve (RIR = 10 - session RPE) for the last two completed
// weightlifting sessions, oldest first, used to autoregulate intensity.
function computeRecentRir(completed: TrainingSession[]): number[] {
  return completed
    .filter(
      (s) =>
        s.status === 'completed' &&
        s.sport_key === 'weightlifting' &&
        s.discipline !== 'musculation' &&
        typeof s.rpe === 'number',
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-2)
    .map((s) => Math.max(0, 10 - (s.rpe as number)));
}

function computeMuscleRir(completed: TrainingSession[]): number[] {
  return completed
    .filter(
      (s) =>
        s.status === 'completed' &&
        s.discipline === 'musculation' &&
        typeof s.rpe === 'number',
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-2)
    .map((s) => Math.max(0, 10 - (s.rpe as number)));
}

function computeRunRir(runs: RunSession[]): number[] {
  return runs
    .filter((r) => r.status === 'completed' && typeof r.rpe === 'number')
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-2)
    .map((r) => Math.max(0, 10 - (r.rpe as number)));
}

const VALID_WORKLOAD_SPORTS: ReadonlySet<WorkloadSport> = new Set([
  'weightlifting',
  'running',
  'musculation',
  'hyrox',
]);

function toWorkloadPoints(
  entries: {
    date: string;
    tss: number;
    sport: string;
    sessionType: string;
    durationMinutes: number;
    intensityFactor: number;
  }[],
): WorkloadDataPoint[] {
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

function buildCalendarSessions(input: {
  completed: TrainingSession[];
  runs: RunSession[];
  hyrox: HyroxSessionRecord[];
  plannedSessions: TrainingSession[];
  plannedRuns: RunSession[];
}): CalendarSession[] {
  const out: CalendarSession[] = [];
  for (const s of input.completed) {
    out.push({
      id: s.id,
      date: s.date,
      sport: sessionSport(s),
      status: 'completed',
      sessionType: s.discipline ?? s.sport_key,
      exerciseCount: (s.planned_exercises ?? []).length,
      durationMin: s.duration_minutes ?? null,
      rpe: s.rpe ?? null,
    });
  }
  for (const r of input.runs) {
    out.push({
      id: r.id,
      date: r.date,
      sport: 'running',
      status: 'completed',
      sessionType: r.session_type,
      durationMin: r.actual_duration_seconds
        ? Math.round(r.actual_duration_seconds / 60)
        : r.estimated_duration_min,
      distanceKm: r.actual_distance_km ?? r.estimated_distance_km,
    });
  }
  for (const h of input.hyrox) {
    out.push({
      id: h.id,
      date: h.date,
      sport: 'hyrox',
      status: 'completed',
      sessionType: h.session_type,
      durationMin: h.total_time_sec ? Math.round(h.total_time_sec / 60) : null,
    });
  }
  for (const s of input.plannedSessions) {
    out.push({
      id: s.id,
      date: s.date,
      sport: sessionSport(s),
      status: 'planned',
      sessionType: s.discipline ?? s.sport_key,
      exerciseCount: (s.planned_exercises ?? []).length,
      durationMin: s.duration_minutes ?? null,
    });
  }
  for (const r of input.plannedRuns) {
    out.push({
      id: r.id,
      date: r.date,
      sport: 'running',
      status: 'planned',
      sessionType: r.session_type,
      durationMin: r.estimated_duration_min,
      distanceKm: r.estimated_distance_km,
    });
  }
  return out;
}

function weeksUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const diffMs = target.getTime() - Date.now();
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24 * 7)));
}

function bannerForScore(score: number | null): ZoneBanner | null {
  if (score === null) return null;
  if (score <= 30) {
    return {
      border: colors.orbe.red,
      message:
        "🔴 Aujourd'hui n'est pas le jour. Ton corps a besoin de repos, pas d'effort.",
    };
  }
  if (score <= 50) {
    return {
      border: colors.orbe.amber,
      message:
        "🟡 Conditions limitées. Un entraînement léger peut aider, mais évite l'intensité.",
    };
  }
  if (score <= 75) {
    return {
      border: colors.orbe.blue,
      message:
        '🔵 Les conditions sont réunies. La zone est à portée si tu t’en donnes les moyens.',
    };
  }
  return {
    border: colors.orbe.green,
    message: '🟢 Tu es dedans. C’est maintenant. Ne laisse pas passer ça.',
  };
}

export default function ProgramScreen(): React.ReactElement {
  const router = useRouter();
  const [score, setScore] = useState<number | null>(null);
  const [program, setProgram] = useState<UserProgram | null>(null);
  const [programLoaded, setProgramLoaded] = useState<boolean>(false);
  const [upcoming, setUpcoming] = useState<TrainingSession[]>([]);
  const [generating, setGenerating] = useState<boolean>(false);
  const [runningProfile, setRunningProfile] = useState<RunningProfile | null>(null);
  const [runningLoaded, setRunningLoaded] = useState<boolean>(false);
  const [generatingRun, setGeneratingRun] = useState<boolean>(false);
  const [muscleProfile, setMuscleProfile] = useState<MuscleProfile | null>(null);
  const [generatingMuscle, setGeneratingMuscle] = useState<boolean>(false);
  const [deload, setDeload] = useState<DeloadRecommendation | null>(null);
  const [hyroxProfile, setHyroxProfile] = useState<HyroxProfile | null>(null);
  const [schedule, setSchedule] = useState<UserSchedule | null>(null);
  const [calendarSessions, setCalendarSessions] = useState<CalendarSession[]>([]);
  const [maxes, setMaxes] = useState<ExerciseMax[]>([]);
  const [recentRir, setRecentRir] = useState<number[]>([]);
  const [recentMuscleRir, setRecentMuscleRir] = useState<number[]>([]);
  const [recentRunRir, setRecentRunRir] = useState<number[]>([]);
  const [acwrHigh, setAcwrHigh] = useState<boolean>(false);
  const [addSportVisible, setAddSportVisible] = useState<boolean>(false);
  const [startingBonus, setStartingBonus] = useState<boolean>(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid, 'checkins', todayDateString()),
      (snap) => {
        setScore(snap.exists() ? (snap.data() as DailyCheckin).zone_score : null);
      },
      () => setScore(null),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setProgramLoaded(true);
      return;
    }
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid, 'state', 'program'),
      (snap) => {
        setProgram(snap.exists() ? (snap.data() as UserProgram) : null);
        setProgramLoaded(true);
      },
      () => setProgramLoaded(true),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid, 'state', 'schedule'),
      (snap) => setSchedule(snap.exists() ? (snap.data() as UserSchedule) : null),
      () => setSchedule(null),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(
      collection(db, 'users', user.uid, 'sessions'),
      orderBy('date', 'asc'),
      limit(20),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const today = todayDateString();
        const rows = snap.docs
          .map((d) => d.data() as TrainingSession)
          .filter((s) => s.status === 'planned' && s.date >= today);
        // Deduplicate by date + sport so a day never lists the same
        // session twice (regeneration can leave stale planned docs).
        const seen = new Set<string>();
        const deduped: TrainingSession[] = [];
        for (const s of rows) {
          const key = `${s.date}_${s.discipline ?? s.sport_key}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(s);
        }
        setUpcoming(deduped.slice(0, 5));
      },
      () => setUpcoming([]),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setRunningLoaded(true);
      return;
    }
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid, 'state', 'running_profile'),
      (snap) => {
        setRunningProfile(snap.exists() ? (snap.data() as RunningProfile) : null);
        setRunningLoaded(true);
      },
      () => setRunningLoaded(true),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsubM = onSnapshot(
      doc(db, 'users', user.uid, 'state', 'muscle_profile'),
      (snap) => setMuscleProfile(snap.exists() ? (snap.data() as MuscleProfile) : null),
      () => undefined,
    );
    const unsubH = onSnapshot(
      doc(db, 'users', user.uid, 'state', 'hyrox_profile'),
      (snap) => setHyroxProfile(snap.exists() ? (snap.data() as HyroxProfile) : null),
      () => undefined,
    );
    return () => {
      unsubM();
      unsubH();
    };
  }, []);

  // Load dated sessions (completed + planned) for the multi-week calendar.
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const [completed, runs, hyrox, plannedSessions, plannedRuns, exMaxes, workload] =
        await Promise.all([
          getCompletedSessions(user.uid).catch(() => []),
          getCompletedRuns(user.uid, 60).catch(() => []),
          getHyroxSessionHistory(user.uid, 60).catch(() => []),
          getUpcomingSessions(user.uid, 40).catch(() => []),
          getUpcomingRuns(user.uid, 40).catch(() => []),
          getExerciseMaxes(user.uid).catch(() => [] as ExerciseMax[]),
          getWorkloadHistory(user.uid, 35).catch(() => []),
        ]);
      if (cancelled) return;
      setCalendarSessions(
        buildCalendarSessions({ completed, runs, hyrox, plannedSessions, plannedRuns }),
      );
      setMaxes(exMaxes);
      setRecentRir(computeRecentRir(completed));
      setRecentMuscleRir(computeMuscleRir(completed));
      setRecentRunRir(computeRunRir(runs));
      const acwr = calculateACWR(toWorkloadPoints(workload), todayDateString());
      setAcwrHigh(acwr.riskLevel === 'danger');
    })();
    return () => {
      cancelled = true;
    };
  }, [program, runningProfile, muscleProfile, hyroxProfile, upcoming]);

  const onStartRun = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !runningProfile) return;
    setGeneratingRun(true);
    try {
      const paces = calculateVDOTPaces(runningProfile.vdot);
      const block: ProgramBlockRunning = 1;
      const week: WeekIndexRunning = 1;
      const today = new Date();
      const dayIdx = (today.getDay() + 6) % 7;
      const weeklyPlan = getWeeklyDistribution(runningProfile.sessions_per_week, block, week);
      const todayItem = weeklyPlan.items.find((i) => i.dayIndex === dayIdx);
      let type: RunningSessionType =
        todayItem && todayItem.type !== 'REST' ? todayItem.type : 'EF';
      if (score !== null && score <= 30) type = 'RA';
      const level =
        runningProfile.vdot < 35
          ? 'beginner'
          : runningProfile.vdot < 55
            ? 'intermediate'
            : 'advanced';
      const plan = buildSessionPlan({
        type,
        paces,
        level,
        block,
        week,
        paceFactor: runningPaceFactor(recentRunRir),
      });
      const id = await createRunSession(user.uid, {
        date: todayDateString(),
        session_type: plan.type,
        steps: plan.steps.map((s) => ({
          kind: s.kind,
          label: s.label,
          duration_seconds: s.durationSeconds,
          target_pace_sec_per_km: s.targetPaceSecPerKm,
          distance_meters: s.distanceMeters,
        })),
        estimated_duration_min: plan.estimatedDurationMin,
        estimated_distance_km: plan.estimatedDistanceKm,
        zone_score_at_start: score,
        zone_message: plan.message,
      });
      router.push(`/(app)/run-session/${id}`);
    } catch {
      // surfaced via no-op
    } finally {
      setGeneratingRun(false);
    }
  };

  const banner = bannerForScore(score);
  const todayPlanned = useMemo(
    () => upcoming.find((s) => s.date === todayDateString()) ?? null,
    [upcoming],
  );

  const onGenerateToday = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !program) return;
    if (todayPlanned) {
      router.push(`/(app)/session/${todayPlanned.id}`);
      return;
    }
    setGenerating(true);
    try {
      const sessionMaxes = await getExerciseMaxes(user.uid);
      const generated = generateWeeklySession({
        program,
        maxes: sessionMaxes,
        dayOfWeek: program.current_day,
        zoneScore: score,
        recentRir,
      });
      const rirDelta = rirIntensityDelta(recentRir);
      const autoNote =
        rirDelta > 0
          ? 'Tes 2 dernières séances étaient faciles (RIR élevé) : intensité augmentée de 2,5%. '
          : rirDelta < 0
            ? 'Tes 2 dernières séances étaient très dures (RIR 0) : intensité réduite. '
            : '';
      const id = await createPlannedSession(user.uid, {
        date: todayDateString(),
        sport_key: program.sport_key,
        planned_exercises: generated.exercises,
        zone_score_at_start: score,
        zone_message: autoNote + generated.message,
      });
      router.push(`/(app)/session/${id}`);
    } catch {
      // surfaced via no-op
    } finally {
      setGenerating(false);
    }
  };

  // Evaluate the deload signal from recent musculation history.
  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !muscleProfile) {
      setDeload(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const completed = await getCompletedSessions(user.uid);
        const muscleSessions = completed.filter(
          (s) => s.discipline === 'musculation',
        );
        if (!cancelled) setDeload(evaluateDeloadNeed(muscleSessions, 'intermediaire'));
      } catch {
        if (!cancelled) setDeload(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [muscleProfile]);

  const onStartMuscle = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !muscleProfile) return;
    setGeneratingMuscle(true);
    try {
      const weekday = ((new Date().getDay() + 6) % 7) + 1;
      const generated = generateMuscleSession({
        sessionsPerWeek: muscleProfile.sessions_per_week,
        dayOfWeek: weekday,
        goal: muscleProfile.goal,
        weakPoints: (muscleProfile.weak_points ?? []) as MuscleGroup[],
        zoneScore: score,
        recentRir: recentMuscleRir,
      });
      const deloadActive = muscleProfile.deload_active === true;
      const planned: SessionExercise[] = generated.exercises.map((ex) => ({
        exercise_id: ex.exercise_id,
        sets: deloadActive
          ? ex.sets.slice(0, Math.max(1, Math.ceil(ex.sets.length / 2)))
          : ex.sets,
      }));
      const id = await createPlannedSession(user.uid, {
        date: todayDateString(),
        sport_key: 'weightlifting',
        discipline: 'musculation',
        planned_exercises: planned,
        zone_score_at_start: score,
        zone_message: deloadActive
          ? 'Semaine de décharge · volume réduit, charges maintenues.'
          : generated.message,
      });
      router.push(`/(app)/muscle-session/${id}`);
    } catch {
      // surfaced via no-op
    } finally {
      setGeneratingMuscle(false);
    }
  };

  const onToggleDeload = async (active: boolean): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    setMuscleProfile((p) => (p ? { ...p, deload_active: active } : p));
    await setMuscleDeloadActive(user.uid, active).catch(() => undefined);
  };

  const hyroxWeeksToRace = useMemo(() => weeksUntil(hyroxProfile?.target_race_date ?? null), [hyroxProfile]);
  const hyroxBlock: HyroxBlockPhase = blockFromWeeksToRace(hyroxWeeksToRace);

  const onStartHyrox = (): void => {
    if (!hyroxProfile) return;
    const plan = hyroxWeeklyPlan(hyroxProfile.sessions_per_week, hyroxBlock);
    const weekday = (new Date().getDay() + 6) % 7;
    const today = plan[weekday];
    const type = today === 'rest' ? 'station_work' : today;
    router.push(`/(app)/hyrox-session/new?type=${type}&block=${hyroxBlock}`);
  };

  const onStartSport = (sport: ScheduleSport): void => {
    if (sport === 'weightlifting') void onGenerateToday();
    else if (sport === 'running') void onStartRun();
    else if (sport === 'musculation') void onStartMuscle();
    else if (sport === 'hyrox') onStartHyrox();
  };

  // Generate a short complementary session and open its execution screen.
  const onStartBonus = async (option: BonusOption): Promise<void> => {
    const user = auth.currentUser;
    if (!user || startingBonus) return;
    setStartingBonus(true);
    try {
      // Running-based bonus when the runner profile is available.
      if (runningProfile && (option === 'cardio' || option === 'recovery')) {
        const paces = calculateVDOTPaces(runningProfile.vdot);
        const level =
          runningProfile.vdot < 35
            ? 'beginner'
            : runningProfile.vdot < 55
              ? 'intermediate'
              : 'advanced';
        const type: RunningSessionType = option === 'recovery' ? 'RA' : 'EF';
        const plan = buildSessionPlan({
          type,
          paces,
          level,
          block: 1,
          week: 1,
          paceFactor: runningPaceFactor(recentRunRir),
        });
        const id = await createRunSession(user.uid, {
          date: todayDateString(),
          session_type: plan.type,
          steps: plan.steps.map((s) => ({
            kind: s.kind,
            label: s.label,
            duration_seconds: s.durationSeconds,
            target_pace_sec_per_km: s.targetPaceSecPerKm,
            distance_meters: s.distanceMeters,
          })),
          estimated_duration_min: plan.estimatedDurationMin,
          estimated_distance_km: plan.estimatedDistanceKm,
          zone_score_at_start: score,
          zone_message: `Séance bonus · ${plan.message}`,
        });
        router.push(`/(app)/run-session/${id}`);
        return;
      }
      // Light technique work on the barbell (~55%, fewer movements).
      if (program && (option === 'technique' || option === 'recovery' || option === 'cardio')) {
        const lightProgram: UserProgram = { ...program, current_block: 1, current_week: 4 };
        const generated = generateWeeklySession({
          program: lightProgram,
          maxes,
          dayOfWeek: program.current_day,
          zoneScore: 60,
          recentRir,
        });
        const id = await createPlannedSession(user.uid, {
          date: todayDateString(),
          sport_key: 'weightlifting',
          planned_exercises: generated.exercises.slice(0, 3),
          zone_score_at_start: score,
          zone_message: 'Séance bonus technique · charge légère.',
        });
        router.push(`/(app)/session/${id}`);
        return;
      }
      // Musculation fallback: light, low-volume form work.
      if (muscleProfile) {
        const weekday = ((new Date().getDay() + 6) % 7) + 1;
        const generated = generateMuscleSession({
          sessionsPerWeek: muscleProfile.sessions_per_week,
          dayOfWeek: weekday,
          goal: muscleProfile.goal,
          weakPoints: (muscleProfile.weak_points ?? []) as MuscleGroup[],
          zoneScore: 30,
          recentRir: recentMuscleRir,
        });
        const planned: SessionExercise[] = generated.exercises.map((ex) => ({
          exercise_id: ex.exercise_id,
          sets: ex.sets,
        }));
        const id = await createPlannedSession(user.uid, {
          date: todayDateString(),
          sport_key: 'weightlifting',
          discipline: 'musculation',
          planned_exercises: planned,
          zone_score_at_start: score,
          zone_message: 'Séance bonus · travail léger.',
        });
        router.push(`/(app)/muscle-session/${id}`);
      }
    } catch {
      // surfaced via no-op
    } finally {
      setStartingBonus(false);
    }
  };

  const configuredSports: ScheduleSport[] = [
    ...(program ? (['weightlifting'] as const) : []),
    ...(runningProfile ? (['running'] as const) : []),
    ...(muscleProfile ? (['musculation'] as const) : []),
    ...(hyroxProfile ? (['hyrox'] as const) : []),
  ];
  const unconfiguredSports: ScheduleSport[] = (
    ['weightlifting', 'running', 'musculation', 'hyrox'] as ScheduleSport[]
  ).filter((s) => !configuredSports.includes(s));
  const bonusAvailable = Boolean(program || runningProfile || muscleProfile);
  const zoneLevel = score !== null ? getZoneLevel(score) : null;

  return (
    <SafeScreen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <ZoneText variant="heading" style={styles.title}>
            MON PROGRAMME
          </ZoneText>
          {program ? (
            <View style={styles.blockBadge}>
              <ZoneText variant="caption" color={colors.bg.primary} style={styles.blockBadgeText}>
                Bloc {program.current_block} · S{Math.min(4, program.current_week)}
              </ZoneText>
            </View>
          ) : null}
        </View>

        <View style={styles.zoneStrip}>
          <View
            style={[
              styles.zoneStripOrb,
              { backgroundColor: zoneLevel ? zoneLevel.color : colors.border },
            ]}
          />
          <ZoneText variant="label" style={styles.zoneStripScore}>
            {score ?? '--'}
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.zoneStripStatus}>
            {zoneLevel ? zoneLevel.label : 'Pas de check-in aujourd’hui'}
          </ZoneText>
        </View>

        {configuredSports.length > 0 ? (
          <MaSemaineSection
            schedule={schedule}
            program={program}
            runningProfile={runningProfile}
            muscleProfile={muscleProfile}
            hyroxProfile={hyroxProfile}
            configuredSports={configuredSports}
            calendarSessions={calendarSessions}
            maxes={maxes}
            recentRir={recentRir}
            recentMuscleRir={recentMuscleRir}
            recentRunRir={recentRunRir}
            acwrHigh={acwrHigh}
            bonusAvailable={bonusAvailable}
            startingBonus={startingBonus}
            generatingWeightlifting={generating}
            generatingRun={generatingRun}
            generatingMuscle={generatingMuscle}
            onStartSport={onStartSport}
            onStartBonus={onStartBonus}
            onModifyPlanning={() => router.push('/(app)/planner')}
          />
        ) : null}

        {banner ? (
          <View style={[styles.banner, { borderLeftColor: banner.border }]}>
            <ZoneText variant="caption" style={styles.bannerText}>
              {banner.message}
            </ZoneText>
          </View>
        ) : null}

        {muscleProfile ? (
          <DeloadCard
            deload={deload}
            active={muscleProfile.deload_active === true}
            onActivate={() => onToggleDeload(true)}
            onExit={() => onToggleDeload(false)}
          />
        ) : null}

        <View style={styles.upcomingHeader}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.upcomingEyebrow}>
            PROCHAINES SÉANCES
          </ZoneText>
        </View>
        {upcoming.length === 0 ? (
          <View style={styles.upcomingEmpty}>
            <ZoneText variant="caption" color={colors.text.muted}>
              {program
                ? 'Aucune séance planifiée pour le moment.'
                : 'Démarre ton programme pour générer ta première séance.'}
            </ZoneText>
          </View>
        ) : (
          upcoming.map((s) => (
            <TouchableOpacity
              key={s.id}
              activeOpacity={0.85}
              onPress={() => router.push(`/(app)/session/${s.id}`)}
              style={styles.sessionRow}
            >
              <View style={styles.sessionMain}>
                <ZoneText variant="label" style={styles.sessionTitle}>
                  {formatSessionDate(s.date)}
                </ZoneText>
                <ZoneText variant="caption" color={colors.text.muted}>
                  {(s.planned_exercises ?? []).length} exercices · ~
                  {estimateSessionDurationMin(s.planned_exercises ?? [])} min
                </ZoneText>
              </View>
              <ChevronRight size={16} color={colors.text.muted} />
            </TouchableOpacity>
          ))
        )}

        {unconfiguredSports.length > 0 ? (
          <TouchableOpacity
            onPress={() => setAddSportVisible(true)}
            activeOpacity={0.7}
            style={styles.addSportBtn}
          >
            <Plus size={16} color={colors.text.secondary} />
            <ZoneText variant="caption" color={colors.text.secondary} style={styles.addSportBtnText}>
              Ajouter un sport
            </ZoneText>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <Modal
        visible={addSportVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddSportVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setAddSportVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <ZoneText variant="heading" size={20} style={styles.sheetTitle}>
              AJOUTER UN SPORT
            </ZoneText>
            {unconfiguredSports.map((sport) => (
              <TouchableOpacity
                key={sport}
                activeOpacity={0.8}
                onPress={() => {
                  setAddSportVisible(false);
                  router.push(ADD_SPORT_ROUTE[sport]);
                }}
                style={styles.sheetSportRow}
              >
                <ZoneText style={styles.sheetSportIcon}>{SPORT_ICON[sport]}</ZoneText>
                <ZoneText variant="label" color={colors.text.primary} style={styles.sheetSportName}>
                  {SPORT_LABEL[sport]}
                </ZoneText>
                <ZoneText variant="caption" color={colors.accent.gold}>
                  Configurer
                </ZoneText>
              </TouchableOpacity>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeScreen>
  );
}


function DeloadCard({
  deload,
  active,
  onActivate,
  onExit,
}: {
  deload: DeloadRecommendation | null;
  active: boolean;
  onActivate: () => void;
  onExit: () => void;
}): React.ReactElement | null {
  if (active) {
    return (
      <View style={[styles.deloadCard, { borderColor: colors.orbe.blue }]}>
        <ZoneText variant="caption" color={colors.orbe.blue} style={styles.deloadEyebrow}>
          MODE DÉCHARGE ACTIF
        </ZoneText>
        <ZoneText variant="body" color={colors.text.secondary} style={styles.deloadBody}>
          Volume réduit à 50 %, charges maintenues. Tes prochaines séances muscu sont allégées.
        </ZoneText>
        <View style={styles.programCta}>
          <Button title="Terminer la décharge" variant="secondary" onPress={onExit} />
        </View>
      </View>
    );
  }
  if (!deload || !deload.recommended || !deload.protocol) return null;
  return (
    <View style={[styles.deloadCard, { borderColor: colors.orbe.amber }]}>
      <ZoneText variant="caption" color={colors.orbe.amber} style={styles.deloadEyebrow}>
        DÉCHARGE RECOMMANDÉE CETTE SEMAINE
      </ZoneText>
      <ZoneText variant="body" color={colors.text.primary} style={styles.deloadBody}>
        {deload.reason} {deload.protocol.description}
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.deloadRef}>
        {deload.protocol.scientificBasis}
      </ZoneText>
      <View style={styles.programCta}>
        <Button title="Passer en mode décharge" onPress={onActivate} />
      </View>
    </View>
  );
}

const FR_DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const FR_DAY_FULL = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
];

/** Number of weeks navigable on each side of the current week. */
const WEEK_RANGE = 4;

type PillStatus = 'completed' | 'missed' | 'planned';

interface CalPillStatus {
  sport: ScheduleSport;
  status: PillStatus;
  session?: CalendarSession;
  date: string;
  dayIdx: number;
}

function weekMondayDate(weekOffset: number): Date {
  const now = new Date();
  const dayIdx = (now.getDay() + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - dayIdx + weekOffset * 7);
  return monday;
}

function weekDateStrings(weekOffset: number): string[] {
  const monday = weekMondayDate(weekOffset);
  const out: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    out.push(todayDateString(d));
  }
  return out;
}

function frenchDayMonth(date: Date): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
    }).format(date);
  } catch {
    return '';
  }
}

function statusLabel(status: PillStatus): string {
  if (status === 'completed') return 'Séance complétée ✓';
  if (status === 'missed') return 'Séance manquée —';
  return 'Séance planifiée';
}

function statusColor(status: PillStatus): string {
  if (status === 'completed') return colors.success;
  if (status === 'missed') return colors.text.muted;
  return colors.accent.gold;
}

function formatWlLine(ex: SessionExercisePreview): string {
  const name = getExerciseById(ex.exerciseId)?.name ?? ex.exerciseId;
  if (ex.display) return `${name} — ${ex.display}`;
  const pct = ex.pct != null ? ` @ ${ex.pct}%` : '';
  return `${name} — ${ex.sets} séries × ${ex.reps} reps${pct}`;
}

const DAY_KEYS: Weekday[] = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
];

const SPORT_LABEL: Record<ScheduleSport, string> = {
  weightlifting: 'Haltérophilie',
  running: 'Course',
  musculation: 'Musculation',
  hyrox: 'Hyrox',
};

const SPORT_ICON: Record<ScheduleSport, string> = {
  weightlifting: '🏋️',
  running: '🏃',
  musculation: '💪',
  hyrox: '🔥',
};

const ADD_SPORT_ROUTE: Record<
  ScheduleSport,
  '/(app)/maxes' | '/(app)/running-setup' | '/(app)/muscle-setup' | '/(app)/hyrox-setup'
> = {
  weightlifting: '/(app)/maxes',
  running: '/(app)/running-setup',
  musculation: '/(app)/muscle-setup',
  hyrox: '/(app)/hyrox-setup',
};

type BonusOption = 'recovery' | 'technique' | 'cardio';

interface BonusDef {
  id: BonusOption;
  title: string;
  description: string;
  detail: string;
}

const BONUS_OPTIONS: BonusDef[] = [
  {
    id: 'recovery',
    title: 'RÉCUPÉRATION ACTIVE · 20 min',
    description: 'Mobilité + étirements dynamiques',
    detail: "N'impacte pas ta récupération",
  },
  {
    id: 'technique',
    title: 'TRAVAIL TECHNIQUE · 25 min',
    description: 'Répétitions légères pour graver les patterns',
    detail: 'Charge: 50-60% de ton max',
  },
  {
    id: 'cardio',
    title: 'CARDIO LÉGER · 30 min',
    description: 'Zone 2 uniquement, préserve ta récupération',
    detail: 'FC max 130-140 bpm',
  },
];

const SLOT_LABEL: Record<'matin' | 'apresmidi', string> = {
  matin: '🌅 Matin',
  apresmidi: '🌇 Après-midi',
};

interface DayPill {
  sport: ScheduleSport;
  slot: 'matin' | 'apresmidi';
}

function compatibilityNotes(sports: ScheduleSport[]): string[] {
  const set = new Set(sports);
  if (sports.length < 2) return [];
  if (set.has('weightlifting') && set.has('running')) {
    return [
      'Haltérophilie le matin + course en récup l’après-midi. Attends minimum 4h entre les deux.',
      'Évite la course avant l’haltéro, la fatigue cardiovasculaire nuit aux performances techniques.',
    ];
  }
  if (set.has('hyrox') && (set.has('weightlifting') || set.has('musculation'))) {
    return ['Jambes sollicitées deux fois aujourd’hui. Espace les séances d’au moins 6h.'];
  }
  if (set.has('musculation') && set.has('running')) {
    return ['Course en récupération après la muscu. Garde l’intensité basse.'];
  }
  return ['Deux séances aujourd’hui. Espace-les d’au moins 4h pour bien récupérer.'];
}

function MaSemaineSection({
  schedule,
  program,
  runningProfile,
  muscleProfile,
  hyroxProfile,
  configuredSports,
  calendarSessions,
  maxes,
  recentRir,
  recentMuscleRir,
  recentRunRir,
  acwrHigh,
  bonusAvailable,
  startingBonus,
  generatingWeightlifting,
  generatingRun,
  generatingMuscle,
  onStartSport,
  onStartBonus,
  onModifyPlanning,
}: {
  schedule: UserSchedule | null;
  program: UserProgram | null;
  runningProfile: RunningProfile | null;
  muscleProfile: MuscleProfile | null;
  hyroxProfile: HyroxProfile | null;
  configuredSports: ScheduleSport[];
  calendarSessions: CalendarSession[];
  maxes: ExerciseMax[];
  recentRir: number[];
  recentMuscleRir: number[];
  recentRunRir: number[];
  acwrHigh: boolean;
  bonusAvailable: boolean;
  startingBonus: boolean;
  generatingWeightlifting: boolean;
  generatingRun: boolean;
  generatingMuscle: boolean;
  onStartSport: (sport: ScheduleSport) => void;
  onStartBonus: (option: BonusOption) => void;
  onModifyPlanning: () => void;
}): React.ReactElement {
  const todayIdx = (new Date().getDay() + 6) % 7;

  // Build per-day pills from the saved schedule, else from the auto-planner.
  const weekPills: DayPill[][] = useMemo(() => {
    const out: DayPill[][] = DAY_KEYS.map(() => []);
    if (schedule && schedule.assignments.length > 0) {
      for (const a of schedule.assignments) {
        const idx = DAY_KEYS.indexOf(a.day);
        if (idx >= 0) out[idx].push({ sport: a.sport, slot: a.slot });
      }
      return out;
    }
    const activeSports: { sport: SchedulerSport; sessionsPerWeek: number }[] = [];
    if (program) activeSports.push({ sport: 'weightlifting', sessionsPerWeek: program.sessions_per_week });
    if (runningProfile)
      activeSports.push({ sport: 'running', sessionsPerWeek: runningProfile.sessions_per_week });
    if (muscleProfile)
      activeSports.push({ sport: 'musculation', sessionsPerWeek: muscleProfile.sessions_per_week });
    if (hyroxProfile)
      activeSports.push({ sport: 'hyrox', sessionsPerWeek: hyroxProfile.sessions_per_week });
    if (activeSports.length === 0) return out;
    const generated = generateOptimalWeek(activeSports, {
      long_run_day: runningProfile?.long_run_pref ?? 'dimanche',
    });
    generated.days.forEach((d, i) => {
      d.sessions.forEach((s, j) =>
        out[i].push({ sport: s.sport as ScheduleSport, slot: j === 0 ? 'matin' : 'apresmidi' }),
      );
    });
    return out;
  }, [schedule, program, runningProfile, muscleProfile, hyroxProfile]);

  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [preview, setPreview] = useState<CalPillStatus | null>(null);
  const [bonusVisible, setBonusVisible] = useState<boolean>(false);

  const todayPills = weekPills[todayIdx] ?? [];
  const notes = compatibilityNotes(todayPills.map((p) => p.sport));
  const busyGen: Record<ScheduleSport, boolean> = {
    weightlifting: generatingWeightlifting,
    running: generatingRun,
    musculation: generatingMuscle,
    hyrox: false,
  };

  // Bonus session is offered on rest days or once today's work is done.
  const todayCompleted = calendarSessions.some(
    (s) => s.date === todayDateString() && s.status === 'completed',
  );
  const isRestToday = todayPills.length === 0;
  const showBonus = bonusAvailable && (todayCompleted || isRestToday);
  const tomorrowPills = weekPills[(todayIdx + 1) % 7] ?? [];
  const heavyTomorrow = tomorrowPills.some(
    (p) => p.sport === 'weightlifting' || p.sport === 'hyrox',
  );

  // Build a detailed preview (title, lines, duration) for the tapped pill.
  const describePreview = (
    pill: CalPillStatus,
  ): { title: string; lines: string[]; durationMin: number | null } => {
    if (pill.status === 'completed' && pill.session) {
      const s = pill.session;
      const lines: string[] = [];
      if (s.sessionType) lines.push(`Type: ${s.sessionType}`);
      if (s.exerciseCount) lines.push(`${s.exerciseCount} exercices`);
      if (s.distanceKm) lines.push(`Distance: ${s.distanceKm.toFixed(1)} km`);
      if (s.rpe) lines.push(`RPE moyen: ${s.rpe}`);
      return { title: SPORT_LABEL[pill.sport], lines, durationMin: s.durationMin ?? null };
    }
    if (pill.sport === 'weightlifting' && program) {
      const projected = projectProgram(program, Math.max(0, weekOffset));
      const wl = previewWeightliftingSession(projected, maxes, pill.dayIdx + 1, recentRir);
      return { title: wl.title, lines: wl.exercises.map(formatWlLine), durationMin: wl.durationMin };
    }
    if (pill.sport === 'running' && runningProfile) {
      const paces = calculateVDOTPaces(runningProfile.vdot);
      const level =
        runningProfile.vdot < 35
          ? 'beginner'
          : runningProfile.vdot < 55
            ? 'intermediate'
            : 'advanced';
      const dist = getWeeklyDistribution(runningProfile.sessions_per_week, 1, 1);
      const item = dist.items.find((i) => i.dayIndex === pill.dayIdx);
      const type: RunningSessionType = item && item.type !== 'REST' ? item.type : 'EF';
      const plan = buildSessionPlan({
        type,
        paces,
        level,
        block: 1,
        week: 1,
        paceFactor: runningPaceFactor(recentRunRir),
      });
      const mainPace = plan.steps.find((s) => s.targetPaceSecPerKm)?.targetPaceSecPerKm ?? null;
      const lines = [
        `${plan.estimatedDistanceKm} km à allure ${type}`,
        mainPace ? `Allure cible: ${formatPace(mainPace)}/km` : '',
      ].filter((l): l is string => l.length > 0);
      return { title: sessionName(plan.type).toUpperCase(), lines, durationMin: plan.estimatedDurationMin };
    }
    if (pill.sport === 'musculation' && muscleProfile) {
      const gen = generateMuscleSession({
        sessionsPerWeek: muscleProfile.sessions_per_week,
        dayOfWeek: pill.dayIdx + 1,
        goal: muscleProfile.goal,
        weakPoints: (muscleProfile.weak_points ?? []) as MuscleGroup[],
        zoneScore: null,
        recentRir: recentMuscleRir,
      });
      const lines = gen.exercises.slice(0, 3).map((ex) => {
        const name = getExerciseById(ex.exercise_id)?.name ?? ex.exercise_id;
        const rpe = ex.sets[0]?.target_rpe;
        const reps = ex.sets[0]?.target_reps ?? '';
        const rir = rpe != null ? ` @ RIR ${Math.max(0, 10 - rpe)}` : '';
        return `${name} — ${ex.sets.length}×${reps}${rir}`;
      });
      const extra = gen.exercises.length - 3;
      if (extra > 0) lines.push(`+${extra} exercices`);
      return { title: `${gen.split_day.toUpperCase()} · ${gen.block_label}`, lines, durationMin: gen.estimated_duration_min };
    }
    return { title: SPORT_LABEL[pill.sport], lines: [], durationMin: pill.session?.durationMin ?? null };
  };

  const previewDetail = preview ? describePreview(preview) : null;

  // For past/future weeks, overlay actual dated sessions onto the template.
  const weekItems = useMemo<CalPillStatus[][]>(() => {
    if (weekOffset === 0) return [];
    const dates = weekDateStrings(weekOffset);
    const past = weekOffset < 0;
    return dates.map((date, i) => {
      const template = weekPills[i] ?? [];
      const actuals = calendarSessions.filter((s) => s.date === date);
      const used = new Set<string>();
      const pills: CalPillStatus[] = [];
      for (const t of template) {
        if (past) {
          const match = actuals.find(
            (a) => a.sport === t.sport && a.status === 'completed' && !used.has(a.id),
          );
          if (match) {
            used.add(match.id);
            pills.push({ sport: t.sport, status: 'completed', session: match, date, dayIdx: i });
          } else {
            pills.push({ sport: t.sport, status: 'missed', date, dayIdx: i });
          }
        } else {
          const match = actuals.find(
            (a) => a.sport === t.sport && a.status === 'planned' && !used.has(a.id),
          );
          if (match) used.add(match.id);
          pills.push({ sport: t.sport, status: 'planned', session: match, date, dayIdx: i });
        }
      }
      // Actual sessions with no matching template slot still appear.
      for (const a of actuals) {
        if (used.has(a.id)) continue;
        if (past && a.status === 'completed') {
          used.add(a.id);
          pills.push({ sport: a.sport, status: 'completed', session: a, date, dayIdx: i });
        } else if (!past && a.status === 'planned') {
          used.add(a.id);
          pills.push({ sport: a.sport, status: 'planned', session: a, date, dayIdx: i });
        }
      }
      return pills;
    });
  }, [weekOffset, weekPills, calendarSessions]);

  const weekSessionRows = useMemo(() => weekItems.flat(), [weekItems]);
  const weekLabel = frenchDayMonth(weekMondayDate(weekOffset));
  const isCurrentWeek = weekOffset === 0;

  return (
    <View style={styles.plannerWrap}>
      <View style={styles.programHeader}>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.programEyebrow}>
          MA SEMAINE
        </ZoneText>
        {program ? (
          <ZoneText variant="caption" color={colors.accent.gold}>
            Bloc {program.current_block} · S{Math.min(4, program.current_week)}
          </ZoneText>
        ) : null}
      </View>

      <View style={styles.weekNavRow}>
        <TouchableOpacity
          onPress={() => setWeekOffset((w) => Math.max(-WEEK_RANGE, w - 1))}
          disabled={weekOffset <= -WEEK_RANGE}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.weekNavBtn}
        >
          <ChevronLeft
            size={20}
            color={weekOffset <= -WEEK_RANGE ? colors.text.muted : colors.accent.gold}
          />
        </TouchableOpacity>
        <ZoneText variant="label" color={colors.text.primary} style={styles.weekNavLabel}>
          {isCurrentWeek ? 'Cette semaine' : `Semaine du ${weekLabel}`}
        </ZoneText>
        <TouchableOpacity
          onPress={() => setWeekOffset((w) => Math.min(WEEK_RANGE, w + 1))}
          disabled={weekOffset >= WEEK_RANGE}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.weekNavBtn}
        >
          <ChevronRight
            size={20}
            color={weekOffset >= WEEK_RANGE ? colors.text.muted : colors.accent.gold}
          />
        </TouchableOpacity>
      </View>

      {isCurrentWeek ? (
        <View style={styles.weekRowOuter}>
          {weekPills.map((pills, idx) => (
            <TouchableOpacity
              key={DAY_KEYS[idx]}
              activeOpacity={0.7}
              onPress={() => (pills.length > 0 ? onStartSport(pills[0].sport) : onModifyPlanning())}
              style={styles.dayColumn}
            >
              <ZoneText
                variant="caption"
                color={idx === todayIdx ? colors.accent.gold : colors.text.muted}
                style={styles.dayLetter}
              >
                {FR_DAYS[idx]}
              </ZoneText>
              <View style={styles.pillStack}>
                {pills.length === 0 ? (
                  <View style={[styles.sessionDot, { backgroundColor: colors.border }]} />
                ) : (
                  pills.map((p, i) => (
                    <View
                      key={i}
                      style={[styles.calPill, { backgroundColor: sportColor(p.sport as SchedulerSport) }]}
                    />
                  ))
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={styles.weekRowOuter}>
          {weekItems.map((pills, idx) => (
            <View key={DAY_KEYS[idx]} style={styles.dayColumn}>
              <ZoneText variant="caption" color={colors.text.muted} style={styles.dayLetter}>
                {FR_DAYS[idx]}
              </ZoneText>
              <View style={styles.pillStack}>
                {pills.length === 0 ? (
                  <View style={[styles.sessionDot, { backgroundColor: colors.border }]} />
                ) : (
                  pills.map((p, i) => (
                    <View
                      key={i}
                      style={[
                        styles.calPill,
                        {
                          backgroundColor:
                            p.status === 'missed'
                              ? colors.border
                              : sportColor(p.sport as SchedulerSport),
                          opacity: p.status === 'missed' ? 0.5 : 1,
                        },
                      ]}
                    />
                  ))
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {isCurrentWeek ? (
        <>
          <TouchableOpacity onPress={onModifyPlanning} activeOpacity={0.7} style={styles.modifyPlanning}>
            <ZoneText variant="caption" color={colors.accent.gold}>
              Modifier mon planning
            </ZoneText>
          </TouchableOpacity>

          <ZoneText variant="caption" color={colors.text.muted} style={styles.todayEyebrow}>
            AUJOURD’HUI
          </ZoneText>
          {todayPills.length === 0 ? (
            <View style={styles.todayRest}>
              <ZoneText variant="caption" color={colors.text.muted}>
                Repos aujourd’hui. Récupération active possible.
              </ZoneText>
            </View>
          ) : (
            <>
              {todayPills.map((p, i) => (
                <View key={i} style={[styles.todayCard, { borderLeftColor: sportColor(p.sport as SchedulerSport) }]}>
                  <ZoneText variant="caption" color={colors.text.muted} style={styles.todaySlot}>
                    {SLOT_LABEL[p.slot]} · {SPORT_LABEL[p.sport]}
                  </ZoneText>
                  <View style={styles.todayCta}>
                    <Button
                      title={busyGen[p.sport] ? 'Génération…' : 'Commencer'}
                      disabled={busyGen[p.sport]}
                      onPress={() => onStartSport(p.sport)}
                    />
                  </View>
                </View>
              ))}
              {notes.map((n, i) => (
                <View key={`note-${i}`} style={styles.compatNote}>
                  <ZoneText variant="caption" color={colors.text.secondary} style={styles.compatNoteText}>
                    {n}
                  </ZoneText>
                </View>
              ))}
            </>
          )}
          {showBonus ? (
            <View style={styles.bonusCard}>
              <ZoneText variant="label" color={colors.text.primary} style={styles.bonusTitle}>
                ENVIE DE BOUGER ?
              </ZoneText>
              <ZoneText variant="caption" color={colors.text.muted} style={styles.bonusSub}>
                Une séance courte et complémentaire à ton programme.
              </ZoneText>
              <TouchableOpacity
                onPress={() => setBonusVisible(true)}
                activeOpacity={0.8}
                style={styles.bonusBtn}
              >
                <ZoneText variant="label" color={colors.accent.gold}>
                  SÉANCE BONUS
                </ZoneText>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.weekListWrap}>
          {weekSessionRows.length === 0 ? (
            <View style={styles.todayRest}>
              <ZoneText variant="caption" color={colors.text.muted}>
                Aucune séance cette semaine.
              </ZoneText>
            </View>
          ) : (
            weekSessionRows.map((p, i) => (
              <TouchableOpacity
                key={`${p.date}-${i}`}
                activeOpacity={0.8}
                onPress={() => setPreview(p)}
                style={[
                  styles.weekCard,
                  {
                    borderLeftColor:
                      p.status === 'missed' ? colors.border : sportColor(p.sport as SchedulerSport),
                  },
                ]}
              >
                <View style={styles.weekCardMain}>
                  <ZoneText variant="caption" color={colors.text.primary} style={styles.todaySlot}>
                    {FR_DAY_FULL[p.dayIdx]} · {SPORT_LABEL[p.sport]}
                  </ZoneText>
                  <ZoneText variant="caption" color={statusColor(p.status)}>
                    {statusLabel(p.status)}
                  </ZoneText>
                </View>
                <ChevronRight size={16} color={colors.text.muted} />
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      <Modal
        visible={preview !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreview(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {preview && previewDetail ? (
              <>
                <ZoneText variant="caption" color={statusColor(preview.status)} style={styles.modalStatus}>
                  {statusLabel(preview.status)}
                </ZoneText>
                <ZoneText variant="heading" size={20} color={colors.text.primary} style={styles.modalTitle}>
                  {previewDetail.title}
                </ZoneText>
                {previewDetail.lines.map((line, i) => (
                  <View key={i} style={styles.modalLineRow}>
                    <ZoneText variant="body" size={13} color={colors.accent.gold}>
                      •
                    </ZoneText>
                    <ZoneText variant="body" size={13} color={colors.text.primary} style={styles.modalLineText}>
                      {line}
                    </ZoneText>
                  </View>
                ))}
                {previewDetail.durationMin ? (
                  <ZoneText variant="caption" color={colors.text.secondary} style={styles.modalDuration}>
                    Durée estimée: ~{previewDetail.durationMin} min
                  </ZoneText>
                ) : null}
                <ZoneText variant="caption" color={colors.text.muted} style={styles.modalDate}>
                  {preview.status === 'completed'
                    ? `Séance réalisée le ${formatSessionDate(preview.date)}`
                    : preview.status === 'planned'
                      ? `Cette séance aura lieu le ${formatSessionDate(preview.date)}`
                      : `Séance prévue le ${formatSessionDate(preview.date)}`}
                </ZoneText>
                <View style={styles.modalCta}>
                  <Button title="Fermer" variant="secondary" onPress={() => setPreview(null)} />
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={bonusVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setBonusVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setBonusVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <ZoneText variant="heading" size={20} style={styles.sheetTitle}>
              SÉANCE BONUS
            </ZoneText>
            {acwrHigh ? (
              <View style={styles.bonusWarn}>
                <ZoneText variant="caption" color={colors.orbe.amber} style={styles.bonusWarnText}>
                  ⚠️ Charge élevée cette semaine, repos recommandé.
                </ZoneText>
              </View>
            ) : heavyTomorrow ? (
              <View style={styles.bonusWarn}>
                <ZoneText variant="caption" color={colors.orbe.amber} style={styles.bonusWarnText}>
                  ⚠️ Séance lourde demain, privilégie la récupération active.
                </ZoneText>
              </View>
            ) : null}
            {BONUS_OPTIONS.map((opt) => {
              const blocked =
                (opt.id === 'technique' && (heavyTomorrow || acwrHigh)) ||
                (opt.id === 'cardio' && heavyTomorrow);
              const impact = opt.id === 'recovery' ? 'FAIBLE ✓' : opt.id === 'technique' ? 'MODÉRÉ' : 'FAIBLE ✓';
              return (
                <View key={opt.id} style={styles.bonusOption}>
                  <ZoneText variant="label" color={colors.text.primary} style={styles.bonusOptTitle}>
                    {opt.title}
                  </ZoneText>
                  <ZoneText variant="caption" color={colors.text.secondary} style={styles.bonusOptDesc}>
                    {opt.description}
                  </ZoneText>
                  <ZoneText variant="caption" color={colors.text.muted}>
                    {opt.detail}
                  </ZoneText>
                  <ZoneText variant="caption" color={colors.text.muted} style={styles.bonusImpact}>
                    Impact récupération: {impact}
                  </ZoneText>
                  <TouchableOpacity
                    onPress={() => {
                      setBonusVisible(false);
                      onStartBonus(opt.id);
                    }}
                    disabled={startingBonus || blocked}
                    activeOpacity={0.8}
                    style={[styles.bonusOptBtn, blocked ? styles.bonusOptBtnDisabled : null]}
                  >
                    <ZoneText
                      variant="label"
                      size={13}
                      color={blocked ? colors.text.muted : colors.bg.primary}
                    >
                      {blocked ? 'Déconseillé aujourd’hui' : 'Commencer'}
                    </ZoneText>
                  </TouchableOpacity>
                </View>
              );
            })}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function formatSessionDate(date: string): string {
  try {
    const [y, m, d] = date.split('-').map((p) => parseInt(p, 10));
    const dt = new Date(y, m - 1, d);
    const formatted = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(dt);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch {
    return date;
  }
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  header: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 24, letterSpacing: 0.5 },
  blockBadge: {
    backgroundColor: colors.accent.gold,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  blockBadgeText: { fontFamily: 'Inter-Bold', letterSpacing: 0.3 },
  banner: {
    marginHorizontal: 24,
    marginTop: 4,
    marginBottom: 4,
    backgroundColor: colors.bg.card,
    borderLeftWidth: 3,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bannerText: { color: colors.text.primary, fontSize: 12, lineHeight: 16 },
  programCard: {
    marginHorizontal: 24,
    marginTop: 8,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
  },
  programHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  programEyebrow: { letterSpacing: 1, fontSize: 11 },
  programBlock: { fontSize: 22, marginTop: 2, color: colors.text.primary, letterSpacing: 1 },
  programIntro: { marginTop: 6, lineHeight: 20 },
  weekDots: { flexDirection: 'row', marginTop: 10 },
  weekDot: { width: 22, height: 4, borderRadius: 2, marginRight: 6 },
  programMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  programMetaText: { marginLeft: 6, fontSize: 12 },
  programCta: { marginTop: 14 },
  recalcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 8,
  },
  recalcText: { marginLeft: 6, fontSize: 12 },
  runningCard: {
    marginHorizontal: 24,
    marginTop: 12,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
  },
  deloadCard: {
    marginHorizontal: 24,
    marginTop: 12,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  hyroxWeekRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  hyroxDay: { alignItems: 'center', flex: 1 },
  hyroxDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 4 },
  hyroxDayLabel: { fontSize: 10 },
  hyroxPredictionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  hyroxTodayLabel: { marginTop: 10 },
  deloadEyebrow: { letterSpacing: 1, fontSize: 11, fontFamily: 'Inter-Bold' },
  deloadBody: { marginTop: 8, lineHeight: 20 },
  deloadRef: { marginTop: 8, fontStyle: 'italic', lineHeight: 15 },
  weekDotsRow: { flexDirection: 'row', marginTop: 12 },
  weekDay: { width: 24, height: 8, borderRadius: 4, marginRight: 4 },
  todayBox: { marginTop: 14 },
  todayName: { color: colors.text.primary, fontSize: 16, marginTop: 4 },
  todayMeta: { fontSize: 12, marginTop: 2 },
  plannerWrap: {
    marginHorizontal: 24,
    marginTop: 18,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
  },
  plannerTitle: { fontSize: 18, color: colors.text.primary, letterSpacing: 2, marginTop: 2 },
  weekRowOuter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  dayColumn: { alignItems: 'center', flex: 1 },
  dayLetter: { fontFamily: 'Inter-Bold', fontSize: 11, letterSpacing: 1 },
  dayNumber: { fontSize: 12, marginTop: 2 },
  dotsStack: { marginTop: 6, alignItems: 'center' },
  sessionDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 3 },
  pillStack: { marginTop: 8, alignItems: 'center', gap: 3 },
  calPill: { width: 18, height: 7, borderRadius: 4 },
  warningDot: { color: colors.danger, fontFamily: 'Inter-Bold', fontSize: 12, marginTop: 2 },
  zoneStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 24,
    marginTop: 4,
    marginBottom: 4,
  },
  zoneStripOrb: { width: 24, height: 24, borderRadius: 12 },
  addSportHeader: { paddingHorizontal: 24, marginTop: 20, marginBottom: 2 },
  zoneStripScore: { color: colors.text.primary, fontSize: 16 },
  zoneStripStatus: { flex: 1 },
  modifyPlanning: { alignSelf: 'flex-start', marginTop: 12, paddingVertical: 6 },
  todayEyebrow: { letterSpacing: 1.5, fontSize: 11, marginTop: 14, marginBottom: 8 },
  todayRest: {
    backgroundColor: colors.bg.elevated,
    borderRadius: 10,
    padding: 12,
  },
  todayCard: {
    backgroundColor: colors.bg.elevated,
    borderLeftWidth: 3,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  todaySlot: { fontSize: 12, fontFamily: 'Inter-Bold', color: colors.text.primary },
  todayCta: { marginTop: 10 },
  compatNote: {
    backgroundColor: colors.bg.elevated,
    borderLeftWidth: 3,
    borderLeftColor: colors.orbe.amber,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  compatNoteText: { lineHeight: 16 },
  weekSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  upcomingHeader: { paddingHorizontal: 24, marginTop: 20, marginBottom: 8 },
  upcomingEyebrow: { letterSpacing: 2, fontSize: 11 },
  upcomingEmpty: {
    marginHorizontal: 24,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  sessionRow: {
    marginHorizontal: 24,
    marginBottom: 6,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sessionMain: { flex: 1 },
  sessionTitle: { color: colors.text.primary, fontSize: 14 },
  weekNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  weekNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekNavLabel: { fontSize: 14, letterSpacing: 0.5, textTransform: 'capitalize' },
  weekListWrap: { marginTop: 14 },
  weekCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.elevated,
    borderLeftWidth: 3,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  weekCardMain: { flex: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  modalCard: {
    width: '100%',
    backgroundColor: colors.bg.elevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  modalStatus: { letterSpacing: 1, fontFamily: 'Inter-Bold', marginBottom: 4 },
  modalTitle: { letterSpacing: 0.5, marginBottom: 10 },
  modalLineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  modalLineText: { flex: 1, lineHeight: 18 },
  modalDuration: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  modalDate: { marginTop: 8, lineHeight: 16 },
  modalCta: { marginTop: 16 },
  addSportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    marginTop: 24,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addSportBtnText: { fontFamily: 'Inter-Medium' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg.elevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetTitle: { letterSpacing: 1, marginBottom: 14, color: colors.text.primary },
  sheetSportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
  },
  sheetSportIcon: { fontSize: 22, marginRight: 12 },
  sheetSportName: { flex: 1 },
  bonusCard: {
    marginTop: 10,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
  },
  bonusTitle: { letterSpacing: 0.5 },
  bonusSub: { marginTop: 4, lineHeight: 16 },
  bonusBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.accent.gold,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  bonusWarn: {
    backgroundColor: 'rgba(255,183,77,0.10)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  bonusWarnText: { lineHeight: 16 },
  bonusOption: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  bonusOptTitle: { letterSpacing: 0.5 },
  bonusOptDesc: { marginTop: 4, lineHeight: 16 },
  bonusImpact: { marginTop: 6, fontFamily: 'Inter-Medium' },
  bonusOptBtn: {
    marginTop: 12,
    backgroundColor: colors.accent.gold,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  bonusOptBtnDisabled: { backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.border },
});
