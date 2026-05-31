import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
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
  getHyroxStationAverages,
  getUpcomingRuns,
  getUpcomingSessions,
  getUserSchedule,
  setMuscleDeloadActive,
  todayDateString,
  type DailyCheckin,
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
import { generateWeeklySession } from '@/lib/programEngine';
import { generateMuscleSession } from '@/lib/muscleEngine';
import { evaluateDeloadNeed, type DeloadRecommendation } from '@/lib/muscleSessionScience';
import {
  blockFromWeeksToRace,
  computeRacePrediction,
  formatDuration,
  hyroxWeeklyPlan,
  HYROX_BLOCKS,
  HYROX_DAY_LABELS,
  type HyroxBlockPhase,
  type HyroxDayPlan,
  type RacePrediction,
} from '@/lib/hyroxScience';
import type { MuscleGroup } from '@/data/exercises';
import {
  buildSessionPlan,
  calculateVDOTPaces,
  getWeeklyDistribution,
  type ProgramBlockRunning,
  type RunningSessionType,
  type WeekIndexRunning,
} from '@/lib/runningEngine';
import { MUSCLE_GOAL_LABELS } from '@/lib/muscleEngine';
import { HYROX_LEVEL_LABELS, type HyroxLevel } from '@/lib/hyroxEngine';
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

// Projected race km pace (sec/km) by Hyrox level, for race prediction.
const HYROX_RUN_PACE: Record<HyroxLevel, number> = {
  debutant: 390,
  regulier: 330,
  competiteur: 285,
  pro: 240,
};

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
  const [hyroxPrediction, setHyroxPrediction] = useState<RacePrediction | null>(null);
  const [schedule, setSchedule] = useState<UserSchedule | null>(null);
  const [calendarSessions, setCalendarSessions] = useState<CalendarSession[]>([]);

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
        setUpcoming(rows.slice(0, 5));
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
      const [completed, runs, hyrox, plannedSessions, plannedRuns] =
        await Promise.all([
          getCompletedSessions(user.uid).catch(() => []),
          getCompletedRuns(user.uid, 60).catch(() => []),
          getHyroxSessionHistory(user.uid, 60).catch(() => []),
          getUpcomingSessions(user.uid, 40).catch(() => []),
          getUpcomingRuns(user.uid, 40).catch(() => []),
        ]);
      if (cancelled) return;
      setCalendarSessions(
        buildCalendarSessions({ completed, runs, hyrox, plannedSessions, plannedRuns }),
      );
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
      const plan = buildSessionPlan({ type, paces, level, block, week });
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
      const maxes = await getExerciseMaxes(user.uid);
      const generated = generateWeeklySession({
        program,
        maxes,
        dayOfWeek: program.current_day,
        zoneScore: score,
      });
      const id = await createPlannedSession(user.uid, {
        date: todayDateString(),
        sport_key: program.sport_key,
        planned_exercises: generated.exercises,
        zone_score_at_start: score,
        zone_message: generated.message,
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

  // Race-time projection from running pace and recent station averages.
  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !hyroxProfile) {
      setHyroxPrediction(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const averages = await getHyroxStationAverages(user.uid);
        if (cancelled) return;
        const pace = HYROX_RUN_PACE[hyroxProfile.level];
        setHyroxPrediction(computeRacePrediction(pace, averages, null));
      } catch {
        if (!cancelled) setHyroxPrediction(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hyroxProfile]);

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

  const configuredSports: ScheduleSport[] = [
    ...(program ? (['weightlifting'] as const) : []),
    ...(runningProfile ? (['running'] as const) : []),
    ...(muscleProfile ? (['musculation'] as const) : []),
    ...(hyroxProfile ? (['hyrox'] as const) : []),
  ];
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
          <ZoneText variant="caption" color={colors.text.muted}>
            Périodisation en 12 semaines
          </ZoneText>
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
            generatingWeightlifting={generating}
            generatingRun={generatingRun}
            generatingMuscle={generatingMuscle}
            onStartSport={onStartSport}
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

        {!program || !runningProfile || !muscleProfile || !hyroxProfile ? (
          <View style={styles.addSportHeader}>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.upcomingEyebrow}>
              AJOUTER UN SPORT
            </ZoneText>
          </View>
        ) : null}

        {!programLoaded || program ? null : (
          <View style={styles.programCard}>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.programEyebrow}>
              MON PROGRAMME
            </ZoneText>
            <ZoneText variant="heading" style={styles.programBlock}>
              DÉMARRE TON PROGRAMME
            </ZoneText>
            <ZoneText variant="body" color={colors.text.secondary} style={styles.programIntro}>
              Estime tes maxes pour générer ton premier cycle de 12 semaines.
            </ZoneText>
            <View style={styles.programCta}>
              <Button title="Commencer" onPress={() => router.push('/(app)/maxes')} />
            </View>
          </View>
        )}

        {runningLoaded && !runningProfile ? (
          <View style={styles.runningCard}>
            <View style={styles.programHeader}>
              <ZoneText
                variant="caption"
                color={colors.text.muted}
                style={styles.programEyebrow}
              >
                PROGRAMME COURSE
              </ZoneText>
            </View>
            <ZoneText variant="heading" style={styles.programBlock}>
              ACTIVER LE MODULE COURSE
            </ZoneText>
            <ZoneText variant="body" color={colors.text.secondary} style={styles.programIntro}>
              Estime ton allure de référence pour générer un plan scientifiquement structuré
              (VDOT + 80/20).
            </ZoneText>
            <View style={styles.programCta}>
              <Button
                title="Configurer la course"
                variant="secondary"
                onPress={() => router.push('/(app)/running-setup')}
              />
            </View>
          </View>
        ) : null}

        {!muscleProfile ? (
          <MuscleCard
            profile={null}
            generating={generatingMuscle}
            onSetup={() => router.push('/(app)/muscle-setup')}
            onStart={onStartMuscle}
          />
        ) : null}
        {muscleProfile ? (
          <DeloadCard
            deload={deload}
            active={muscleProfile.deload_active === true}
            onActivate={() => onToggleDeload(true)}
            onExit={() => onToggleDeload(false)}
          />
        ) : null}
        {!hyroxProfile ? (
          <HyroxCard
            profile={null}
            block={hyroxBlock}
            weeksToRace={hyroxWeeksToRace}
            prediction={hyroxPrediction}
            onSetup={() => router.push('/(app)/hyrox-setup')}
            onStart={onStartHyrox}
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
                  {(s.planned_exercises ?? []).length} exercices
                </ZoneText>
              </View>
              <ChevronRight size={16} color={colors.text.muted} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
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

function MuscleCard({
  profile,
  generating,
  onSetup,
  onStart,
}: {
  profile: MuscleProfile | null;
  generating: boolean;
  onSetup: () => void;
  onStart: () => void;
}): React.ReactElement {
  return (
    <View style={styles.runningCard}>
      <View style={styles.programHeader}>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.programEyebrow}>
          PROGRAMME MUSCULATION
        </ZoneText>
        {profile ? (
          <ZoneText variant="caption" color={colors.accent.gold}>
            {profile.sessions_per_week}×/sem
          </ZoneText>
        ) : null}
      </View>
      {profile ? (
        <>
          <ZoneText variant="heading" style={styles.programBlock}>
            BLOC 1 · ACCUMULATION
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.programIntro}>
            Objectif {MUSCLE_GOAL_LABELS[profile.goal].toLowerCase()} · science temps réel MEV/MAV/MRV
          </ZoneText>
          <View style={styles.programCta}>
            <Button
              title={generating ? 'Génération…' : 'Commencer la séance'}
              disabled={generating}
              onPress={onStart}
            />
          </View>
        </>
      ) : (
        <>
          <ZoneText variant="heading" style={styles.programBlock}>
            ACTIVER LA MUSCULATION
          </ZoneText>
          <ZoneText variant="body" color={colors.text.secondary} style={styles.programIntro}>
            Volume MEV / MAV / MRV personnalisé, splits choisis automatiquement.
          </ZoneText>
          <View style={styles.programCta}>
            <Button title="Configurer la muscu" variant="secondary" onPress={onSetup} />
          </View>
        </>
      )}
    </View>
  );
}

function HyroxCard({
  profile,
  block,
  weeksToRace,
  prediction,
  onSetup,
  onStart,
}: {
  profile: HyroxProfile | null;
  block: HyroxBlockPhase;
  weeksToRace: number | null;
  prediction: RacePrediction | null;
  onSetup: () => void;
  onStart: () => void;
}): React.ReactElement {
  const blockInfo = HYROX_BLOCKS[block];
  const plan = profile ? hyroxWeeklyPlan(profile.sessions_per_week, block) : [];
  const todayIdx = (new Date().getDay() + 6) % 7;
  return (
    <View style={styles.runningCard}>
      <View style={styles.programHeader}>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.programEyebrow}>
          PROGRAMME HYROX
        </ZoneText>
        {profile ? (
          <ZoneText variant="caption" color={colors.accent.gold}>
            {HYROX_LEVEL_LABELS[profile.level]}
          </ZoneText>
        ) : null}
      </View>
      {profile ? (
        <>
          <ZoneText variant="heading" style={styles.programBlock}>
            BLOC {block} · {blockInfo.name.toUpperCase()}
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.programIntro}>
            {weeksToRace !== null ? `${weeksToRace} sem. avant la course · ` : ''}
            {blockInfo.priority}
          </ZoneText>

          <View style={styles.hyroxWeekRow}>
            {plan.map((d, i) => (
              <View key={i} style={styles.hyroxDay}>
                <View
                  style={[
                    styles.hyroxDot,
                    {
                      backgroundColor: d === 'rest' ? colors.border : colors.accent.gold,
                      opacity: i === todayIdx ? 1 : 0.5,
                    },
                  ]}
                />
                <ZoneText variant="caption" color={i === todayIdx ? colors.text.primary : colors.text.muted} style={styles.hyroxDayLabel}>
                  {FR_DAYS[i]}
                </ZoneText>
              </View>
            ))}
          </View>

          {prediction ? (
            <View style={styles.hyroxPredictionRow}>
              <ZoneText variant="caption" color={colors.text.muted}>
                Projection course
              </ZoneText>
              <ZoneText variant="label" color={colors.accent.gold}>
                {formatDuration(prediction.totalSec)}
              </ZoneText>
            </View>
          ) : null}

          <ZoneText variant="caption" color={colors.text.muted} style={styles.hyroxTodayLabel}>
            Aujourd’hui : {HYROX_DAY_LABELS[plan[todayIdx] ?? 'station_work']}
          </ZoneText>
          <View style={styles.programCta}>
            <Button title="Commencer la séance" onPress={onStart} />
          </View>
        </>
      ) : (
        <>
          <ZoneText variant="heading" style={styles.programBlock}>
            ACTIVER LE MODULE HYROX
          </ZoneText>
          <ZoneText variant="body" color={colors.text.secondary} style={styles.programIntro}>
            Course + 8 stations. Énergie ciblée, périodisation 3 blocs.
          </ZoneText>
          <View style={styles.programCta}>
            <Button title="Configurer Hyrox" variant="secondary" onPress={onSetup} />
          </View>
        </>
      )}
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
  generatingWeightlifting,
  generatingRun,
  generatingMuscle,
  onStartSport,
  onModifyPlanning,
}: {
  schedule: UserSchedule | null;
  program: UserProgram | null;
  runningProfile: RunningProfile | null;
  muscleProfile: MuscleProfile | null;
  hyroxProfile: HyroxProfile | null;
  configuredSports: ScheduleSport[];
  calendarSessions: CalendarSession[];
  generatingWeightlifting: boolean;
  generatingRun: boolean;
  generatingMuscle: boolean;
  onStartSport: (sport: ScheduleSport) => void;
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

  const todayPills = weekPills[todayIdx] ?? [];
  const notes = compatibilityNotes(todayPills.map((p) => p.sport));
  const busyGen: Record<ScheduleSport, boolean> = {
    weightlifting: generatingWeightlifting,
    running: generatingRun,
    musculation: generatingMuscle,
    hyrox: false,
  };

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
            {preview ? (
              <>
                <ZoneText variant="heading" style={styles.modalTitle}>
                  {statusLabel(preview.status)}
                </ZoneText>
                <ZoneText variant="label" color={colors.accent.gold} style={styles.modalSport}>
                  {SPORT_LABEL[preview.sport]}
                </ZoneText>
                {preview.session?.sessionType ? (
                  <ModalRow label="Type" value={preview.session.sessionType} />
                ) : null}
                {preview.session?.exerciseCount ? (
                  <ModalRow label="Exercices" value={`${preview.session.exerciseCount}`} />
                ) : null}
                {preview.session?.durationMin ? (
                  <ModalRow label="Durée estimée" value={`${preview.session.durationMin} min`} />
                ) : null}
                {preview.session?.distanceKm ? (
                  <ModalRow label="Distance" value={`${preview.session.distanceKm.toFixed(1)} km`} />
                ) : null}
                {preview.session?.rpe ? (
                  <ModalRow label="RPE" value={`${preview.session.rpe}`} />
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
    </View>
  );
}

function ModalRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.modalRow}>
      <ZoneText variant="caption" color={colors.text.muted}>
        {label}
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.primary}>
        {value}
      </ZoneText>
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
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8 },
  title: { fontSize: 28, letterSpacing: 2 },
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
  modalTitle: { fontSize: 22, letterSpacing: 0.5, color: colors.text.primary },
  modalSport: { marginTop: 2, marginBottom: 10 },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  modalDate: { marginTop: 12, lineHeight: 16 },
  modalCta: { marginTop: 16 },
});
