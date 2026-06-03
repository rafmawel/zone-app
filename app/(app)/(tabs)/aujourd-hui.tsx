import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import {
  createPlannedSession,
  createRunSession,
  getCompletedRuns,
  getCompletedSessions,
  getExerciseMaxes,
  getHyroxSessionHistory,
  getLastSessionBySport,
  getLastSessionsByDate,
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
} from '@/lib/firestore';
import {
  generateWeeklySession,
  previewWeightliftingSession,
  rirIntensityDelta,
} from '@/lib/programEngine';
import { calculateACWR, type WorkloadDataPoint, type WorkloadSport } from '@/lib/pro';
import { generateMuscleSession } from '@/lib/muscleEngine';
import { evaluateDeloadNeed, type DeloadRecommendation } from '@/lib/muscleSessionScience';
import { blockFromWeeksToRace, hyroxWeeklyPlan, type HyroxBlockPhase } from '@/lib/hyroxScience';
import type { MuscleGroup } from '@/data/exercises';
import {
  buildSessionPlan,
  calculateVDOTPaces,
  getWeeklyDistribution,
  runningPaceFactor,
  type ProgramBlockRunning,
  type RunningSessionType,
  type WeekIndexRunning,
} from '@/lib/runningEngine';
import { sportColor, type SchedulerSport } from '@/lib/multiSportScheduler';
import { getZoneLevel } from '@/lib/zoneScore';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';

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

const ALL_SPORTS: ScheduleSport[] = ['weightlifting', 'running', 'musculation', 'hyrox'];

type BonusOption = 'recovery' | 'technique' | 'cardio';

const BONUS_OPTIONS: { id: BonusOption; title: string; description: string; detail: string }[] = [
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

const FR_DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const WEEK_RANGE = 4;

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
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(date);
  } catch {
    return '';
  }
}

function weeksUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  return Math.max(0, Math.round((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)));
}

interface CompletedSessionLite {
  sport: ScheduleSport;
  date: string;
}

function sessionSport(s: TrainingSession): ScheduleSport {
  if (s.discipline === 'musculation') return 'musculation';
  if (s.sport_key === 'running') return 'running';
  return 'weightlifting';
}

function computeRir(values: number[]): number[] {
  return values.slice(-2);
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

type WarnLevel = 'info' | 'warn' | 'danger';
interface RecoveryWarning {
  level: WarnLevel;
  message: string;
}

function hoursBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 3_600_000;
}

/**
 * Smart recovery guidance before launching a session. Cross-sport same-day
 * checks take priority, then per-sport recovery since the last session.
 */
function buildRecoveryWarning(
  sport: ScheduleSport,
  lastBySport: Record<ScheduleSport, Date | null>,
  todaySports: ScheduleSport[],
  now: Date,
): RecoveryWarning | null {
  // Same-day cross-sport.
  if (sport === 'weightlifting' && todaySports.includes('weightlifting')) {
    return {
      level: 'danger',
      message:
        "🔴 Deux séances d'haltéro le même jour, ce n'est pas recommandé. Ton système nerveux ne peut pas récupérer en quelques heures.",
    };
  }
  if (sport === 'weightlifting' && todaySports.includes('running')) {
    return {
      level: 'warn',
      message:
        "⚠️ Course avant l'haltéro, ce n'est pas idéal. La fatigue cardiovasculaire nuit aux performances techniques.",
    };
  }
  if (sport === 'running' && todaySports.includes('weightlifting')) {
    return {
      level: 'info',
      message:
        '💡 Bon choix. Laisse 4 à 6h entre les deux séances. Tu as fait l\'haltéro en premier, c\'est le bon ordre.',
    };
  }

  const last = lastBySport[sport];
  if (sport === 'weightlifting' && last) {
    const h = hoursBetween(now, last);
    if (h < 24) {
      return {
        level: 'warn',
        message: `⚠️ Tu as fait de l'haltéro il y a moins de 24h (${Math.round(h)}h). Ton SNC n'est pas complètement récupéré. Performance réduite probable.`,
      };
    }
    if (h <= 48) {
      return {
        level: 'info',
        message: `✓ Récupération correcte (${Math.round(h)}h depuis la dernière séance).`,
      };
    }
    return null;
  }
  if (sport === 'musculation' && last) {
    const h = hoursBetween(now, last);
    if (h < 48) {
      return {
        level: 'warn',
        message: `⚠️ Tu as fait de la muscu il y a ${Math.round(h)}h. Pour éviter le surentraînement, varie les groupes musculaires ou attends ${Math.max(1, Math.round(48 - h))}h.`,
      };
    }
    return null;
  }
  if (sport === 'running' && last) {
    const h = hoursBetween(now, last);
    if (h < 12) {
      return {
        level: 'warn',
        message: `⚠️ Sortie course il y a moins de 12h (${Math.round(h)}h). Privilégie une sortie facile.`,
      };
    }
  }
  if (sport === 'running' && lastBySport.weightlifting) {
    const hw = hoursBetween(now, lastBySport.weightlifting);
    if (hw < 24) {
      return {
        level: 'info',
        message:
          "💡 Tu as fait de l'haltéro récemment. Course possible mais évite le tempo ou les intervalles aujourd'hui.",
      };
    }
  }
  return null;
}

function warnColor(level: WarnLevel): string {
  if (level === 'danger') return colors.orbe.red;
  if (level === 'warn') return colors.orbe.amber;
  return colors.orbe.blue;
}

const EMPTY_LAST: Record<ScheduleSport, Date | null> = {
  weightlifting: null,
  running: null,
  musculation: null,
  hyrox: null,
};

export default function AujourdhuiScreen(): React.ReactElement {
  const router = useRouter();
  const [score, setScore] = useState<number | null>(null);
  const [program, setProgram] = useState<UserProgram | null>(null);
  const [runningProfile, setRunningProfile] = useState<RunningProfile | null>(null);
  const [muscleProfile, setMuscleProfile] = useState<MuscleProfile | null>(null);
  const [hyroxProfile, setHyroxProfile] = useState<HyroxProfile | null>(null);
  const [maxes, setMaxes] = useState<ExerciseMax[]>([]);
  const [completed, setCompleted] = useState<CompletedSessionLite[]>([]);
  const [recentRir, setRecentRir] = useState<number[]>([]);
  const [recentMuscleRir, setRecentMuscleRir] = useState<number[]>([]);
  const [recentRunRir, setRecentRunRir] = useState<number[]>([]);
  const [acwrHigh, setAcwrHigh] = useState<boolean>(false);
  const [deload, setDeload] = useState<DeloadRecommendation | null>(null);
  const [lastBySport, setLastBySport] = useState<Record<ScheduleSport, Date | null>>(EMPTY_LAST);
  const [todaySports, setTodaySports] = useState<ScheduleSport[]>([]);

  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [pending, setPending] = useState<{ sport: ScheduleSport; warning: RecoveryWarning } | null>(null);
  const [bonusVisible, setBonusVisible] = useState<boolean>(false);
  const [addSportVisible, setAddSportVisible] = useState<boolean>(false);
  const [busy, setBusy] = useState<ScheduleSport | 'bonus' | null>(null);

  // Live profile + score documents.
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const subs = [
      onSnapshot(doc(db, 'users', user.uid, 'checkins', todayDateString()), (s) =>
        setScore(s.exists() ? (s.data() as DailyCheckin).zone_score : null),
        () => setScore(null),
      ),
      onSnapshot(doc(db, 'users', user.uid, 'state', 'program'), (s) =>
        setProgram(s.exists() ? (s.data() as UserProgram) : null), () => undefined,
      ),
      onSnapshot(doc(db, 'users', user.uid, 'state', 'running_profile'), (s) =>
        setRunningProfile(s.exists() ? (s.data() as RunningProfile) : null), () => undefined,
      ),
      onSnapshot(doc(db, 'users', user.uid, 'state', 'muscle_profile'), (s) =>
        setMuscleProfile(s.exists() ? (s.data() as MuscleProfile) : null), () => undefined,
      ),
      onSnapshot(doc(db, 'users', user.uid, 'state', 'hyrox_profile'), (s) =>
        setHyroxProfile(s.exists() ? (s.data() as HyroxProfile) : null), () => undefined,
      ),
    ];
    return () => subs.forEach((u) => u());
  }, []);

  // History + recovery data; reloaded whenever the screen regains focus.
  const loadHistory = useCallback(async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    const [sessions, runs, hyrox, exMaxes, workload, wl, ru, mu, hy, today] = await Promise.all([
      getCompletedSessions(user.uid).catch(() => [] as TrainingSession[]),
      getCompletedRuns(user.uid, 60).catch(() => [] as RunSession[]),
      getHyroxSessionHistory(user.uid, 60).catch(() => [] as HyroxSessionRecord[]),
      getExerciseMaxes(user.uid).catch(() => [] as ExerciseMax[]),
      getWorkloadHistory(user.uid, 35).catch(() => []),
      getLastSessionBySport(user.uid, 'weightlifting').catch(() => null),
      getLastSessionBySport(user.uid, 'running').catch(() => null),
      getLastSessionBySport(user.uid, 'musculation').catch(() => null),
      getLastSessionBySport(user.uid, 'hyrox').catch(() => null),
      getLastSessionsByDate(user.uid, todayDateString()).catch(() => []),
    ]);
    const lite: CompletedSessionLite[] = [
      ...sessions.map((s) => ({ sport: sessionSport(s), date: s.date })),
      ...runs.map((r) => ({ sport: 'running' as ScheduleSport, date: r.date })),
      ...hyrox.map((h) => ({ sport: 'hyrox' as ScheduleSport, date: h.date })),
    ];
    setCompleted(lite);
    setMaxes(exMaxes);
    setRecentRir(
      computeRir(
        sessions
          .filter((s) => s.sport_key === 'weightlifting' && s.discipline !== 'musculation' && typeof s.rpe === 'number')
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((s) => Math.max(0, 10 - (s.rpe as number))),
      ),
    );
    setRecentMuscleRir(
      computeRir(
        sessions
          .filter((s) => s.discipline === 'musculation' && typeof s.rpe === 'number')
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((s) => Math.max(0, 10 - (s.rpe as number))),
      ),
    );
    setRecentRunRir(
      computeRir(
        runs
          .filter((r) => typeof r.rpe === 'number')
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((r) => Math.max(0, 10 - (r.rpe as number))),
      ),
    );
    const acwr = calculateACWR(toWorkloadPoints(workload), todayDateString());
    setAcwrHigh(acwr.riskLevel === 'danger');
    setLastBySport({ weightlifting: wl, running: ru, musculation: mu, hyrox: hy });
    setTodaySports(today.map((t) => t.sport));
    setDeload(
      evaluateDeloadNeed(
        sessions.filter((s) => s.discipline === 'musculation'),
        'intermediaire',
      ),
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
    }, [loadHistory]),
  );

  // ── Session generators (with autoregulation) ──────────────────────────────
  const onStartRun = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !runningProfile) return;
    setBusy('running');
    try {
      const paces = calculateVDOTPaces(runningProfile.vdot);
      const block: ProgramBlockRunning = 1;
      const week: WeekIndexRunning = 1;
      const dayIdx = (new Date().getDay() + 6) % 7;
      const weeklyPlan = getWeeklyDistribution(runningProfile.sessions_per_week, block, week);
      const todayItem = weeklyPlan.items.find((i) => i.dayIndex === dayIdx);
      let type: RunningSessionType = todayItem && todayItem.type !== 'REST' ? todayItem.type : 'EF';
      if (score !== null && score <= 30) type = 'RA';
      const level = runningProfile.vdot < 35 ? 'beginner' : runningProfile.vdot < 55 ? 'intermediate' : 'advanced';
      const plan = buildSessionPlan({ type, paces, level, block, week, paceFactor: runningPaceFactor(recentRunRir) });
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
      // no-op
    } finally {
      setBusy(null);
    }
  };

  const onStartWeightlifting = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !program) return;
    setBusy('weightlifting');
    try {
      const generated = generateWeeklySession({
        program,
        maxes,
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
      // no-op
    } finally {
      setBusy(null);
    }
  };

  const onStartMuscle = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !muscleProfile) return;
    setBusy('musculation');
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
        sets: deloadActive ? ex.sets.slice(0, Math.max(1, Math.ceil(ex.sets.length / 2))) : ex.sets,
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
      // no-op
    } finally {
      setBusy(null);
    }
  };

  const hyroxBlock: HyroxBlockPhase = blockFromWeeksToRace(
    weeksUntil(hyroxProfile?.target_race_date ?? null),
  );

  const onStartHyrox = (): void => {
    if (!hyroxProfile) return;
    const plan = hyroxWeeklyPlan(hyroxProfile.sessions_per_week, hyroxBlock);
    const weekday = (new Date().getDay() + 6) % 7;
    const today = plan[weekday];
    const type = today === 'rest' ? 'station_work' : today;
    router.push(`/(app)/hyrox-session/new?type=${type}&block=${hyroxBlock}`);
  };

  const launchSport = (sport: ScheduleSport): void => {
    if (sport === 'weightlifting') void onStartWeightlifting();
    else if (sport === 'running') void onStartRun();
    else if (sport === 'musculation') void onStartMuscle();
    else if (sport === 'hyrox') onStartHyrox();
  };

  const onPickSport = (sport: ScheduleSport): void => {
    const warning = buildRecoveryWarning(sport, lastBySport, todaySports, new Date());
    if (warning) setPending({ sport, warning });
    else launchSport(sport);
  };

  const onToggleDeload = async (active: boolean): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    setMuscleProfile((p) => (p ? { ...p, deload_active: active } : p));
    await setMuscleDeloadActive(user.uid, active).catch(() => undefined);
  };

  const onStartBonus = async (option: BonusOption): Promise<void> => {
    const user = auth.currentUser;
    if (!user || busy === 'bonus') return;
    setBusy('bonus');
    setBonusVisible(false);
    try {
      if (runningProfile && (option === 'cardio' || option === 'recovery')) {
        const paces = calculateVDOTPaces(runningProfile.vdot);
        const level = runningProfile.vdot < 35 ? 'beginner' : runningProfile.vdot < 55 ? 'intermediate' : 'advanced';
        const type: RunningSessionType = option === 'recovery' ? 'RA' : 'EF';
        const plan = buildSessionPlan({ type, paces, level, block: 1, week: 1, paceFactor: runningPaceFactor(recentRunRir) });
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
      if (program) {
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
      // no-op
    } finally {
      setBusy(null);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const configuredSports = ALL_SPORTS.filter((s) =>
    s === 'weightlifting'
      ? !!program
      : s === 'running'
        ? !!runningProfile
        : s === 'musculation'
          ? !!muscleProfile
          : !!hyroxProfile,
  );
  const unconfiguredSports = ALL_SPORTS.filter((s) => !configuredSports.includes(s));
  const bonusAvailable = Boolean(program || runningProfile || muscleProfile);
  const zoneLevel = score !== null ? getZoneLevel(score) : null;

  const durations = useMemo<Partial<Record<ScheduleSport, number>>>(() => {
    const d: Partial<Record<ScheduleSport, number>> = {};
    if (program) {
      try {
        d.weightlifting = previewWeightliftingSession(program, maxes, program.current_day).durationMin;
      } catch {
        d.weightlifting = undefined;
      }
    }
    if (muscleProfile) {
      try {
        d.musculation = generateMuscleSession({
          sessionsPerWeek: muscleProfile.sessions_per_week,
          dayOfWeek: ((new Date().getDay() + 6) % 7) + 1,
          goal: muscleProfile.goal,
          weakPoints: (muscleProfile.weak_points ?? []) as MuscleGroup[],
          zoneScore: null,
          recentRir: recentMuscleRir,
        }).estimated_duration_min;
      } catch {
        d.musculation = undefined;
      }
    }
    if (runningProfile) d.running = 50;
    if (hyroxProfile) d.hyrox = 45;
    return d;
  }, [program, maxes, muscleProfile, runningProfile, hyroxProfile, recentMuscleRir]);

  const completedByDate = useMemo(() => {
    const map: Record<string, ScheduleSport[]> = {};
    for (const c of completed) (map[c.date] ??= []).push(c.sport);
    return map;
  }, [completed]);

  const weekDates = useMemo(() => weekDateStrings(weekOffset), [weekOffset]);
  const todayStr = todayDateString();
  const isCurrentWeek = weekOffset === 0;
  const weekLabel = frenchDayMonth(weekMondayDate(weekOffset));
  const raceWeeks = weeksUntil(hyroxProfile?.target_race_date ?? null);

  return (
    <SafeScreen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
            style={[styles.zoneStripOrb, { backgroundColor: zoneLevel ? zoneLevel.color : colors.border }]}
          />
          <ZoneText variant="number" size={18} style={styles.zoneStripScore}>
            {score ?? '--'}
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.zoneStripStatus}>
            {zoneLevel ? zoneLevel.label : 'Pas de check-in aujourd’hui'}
          </ZoneText>
        </View>

        {/* Weekly calendar — completed history, today highlighted, future open */}
        <View style={styles.calendarCard}>
          <View style={styles.weekNavRow}>
            <TouchableOpacity
              onPress={() => setWeekOffset((w) => Math.max(-WEEK_RANGE, w - 1))}
              disabled={weekOffset <= -WEEK_RANGE}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.weekNavBtn}
            >
              <ChevronLeft size={20} color={weekOffset <= -WEEK_RANGE ? colors.text.muted : colors.accent.gold} />
            </TouchableOpacity>
            <ZoneText variant="titleSm" color={colors.text.primary}>
              {isCurrentWeek ? 'Cette semaine' : `Semaine du ${weekLabel}`}
            </ZoneText>
            <TouchableOpacity
              onPress={() => setWeekOffset((w) => Math.min(WEEK_RANGE, w + 1))}
              disabled={weekOffset >= WEEK_RANGE}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.weekNavBtn}
            >
              <ChevronRight size={20} color={weekOffset >= WEEK_RANGE ? colors.text.muted : colors.accent.gold} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {weekDates.map((date, i) => {
              const isToday = date === todayStr;
              const isFuture = date > todayStr;
              const sports = completedByDate[date] ?? [];
              return (
                <View key={date} style={[styles.dayCol, isToday ? styles.dayColToday : null]}>
                  <ZoneText
                    variant="caption"
                    color={isToday ? colors.accent.gold : colors.text.muted}
                    style={styles.dayLetter}
                  >
                    {FR_DAYS[i]}
                  </ZoneText>
                  <View style={styles.pillStack}>
                    {sports.length > 0 ? (
                      sports.map((sp, j) => (
                        <View
                          key={j}
                          style={[styles.calPill, { backgroundColor: sportColor(sp as SchedulerSport) }]}
                        />
                      ))
                    ) : isFuture ? (
                      <View style={styles.futureDot} />
                    ) : (
                      <View style={styles.restDot} />
                    )}
                  </View>
                </View>
              );
            })}
          </View>

          {raceWeeks !== null ? (
            <ZoneText variant="caption" color={colors.accent.gold} style={styles.raceLine}>
              🏁 Course dans {raceWeeks} semaine{raceWeeks > 1 ? 's' : ''} · pense à alléger en fin de cycle
            </ZoneText>
          ) : null}
        </View>

        {/* Today: pick a sport on demand */}
        {isCurrentWeek ? (
          <>
            <ZoneText variant="caption" style={styles.section}>
              AUJOURD'HUI
            </ZoneText>
            {configuredSports.length === 0 ? (
              <View style={styles.emptyCard}>
                <ZoneText variant="caption" color={colors.text.muted}>
                  Configure un sport pour commencer à t'entraîner.
                </ZoneText>
              </View>
            ) : (
              configuredSports.map((sport) => {
                const isBusy = busy === sport;
                const min = durations[sport];
                return (
                  <TouchableOpacity
                    key={sport}
                    activeOpacity={0.85}
                    disabled={isBusy}
                    onPress={() => onPickSport(sport)}
                    style={[styles.sportStart, { borderLeftColor: sportColor(sport as SchedulerSport) }]}
                  >
                    <ZoneText style={styles.sportStartIcon}>{SPORT_ICON[sport]}</ZoneText>
                    <View style={styles.sportStartMain}>
                      <ZoneText variant="titleSm" color={colors.text.primary}>
                        {SPORT_LABEL[sport]}
                      </ZoneText>
                      <ZoneText variant="caption" color={colors.text.muted}>
                        {isBusy ? 'Génération…' : `Prêt${min ? ` · ~${min} min` : ''}`}
                      </ZoneText>
                    </View>
                    <ChevronRight size={20} color={colors.accent.gold} />
                  </TouchableOpacity>
                );
              })
            )}

            {muscleProfile ? (
              <DeloadCard
                deload={deload}
                active={muscleProfile.deload_active === true}
                onActivate={() => onToggleDeload(true)}
                onExit={() => onToggleDeload(false)}
              />
            ) : null}

            {bonusAvailable ? (
              <View style={styles.bonusCard}>
                <ZoneText variant="titleSm" color={colors.text.primary}>
                  Envie de bouger ?
                </ZoneText>
                <ZoneText variant="caption" color={colors.text.muted} style={styles.bonusSub}>
                  Une séance courte et complémentaire à ton programme.
                </ZoneText>
                <TouchableOpacity onPress={() => setBonusVisible(true)} activeOpacity={0.8} style={styles.bonusBtn}>
                  <ZoneText variant="label" color={colors.accent.gold}>
                    SÉANCE BONUS
                  </ZoneText>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.emptyCard}>
            <ZoneText variant="caption" color={colors.text.muted}>
              {weekOffset < 0
                ? 'Historique de la semaine ci-dessus.'
                : 'Pas de jours fixes : tu décideras au jour le jour.'}
            </ZoneText>
          </View>
        )}

        {unconfiguredSports.length > 0 ? (
          <TouchableOpacity onPress={() => setAddSportVisible(true)} activeOpacity={0.7} style={styles.addSportBtn}>
            <Plus size={16} color={colors.text.secondary} />
            <ZoneText variant="caption" color={colors.text.secondary} style={styles.addSportText}>
              Ajouter un sport
            </ZoneText>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {/* Recovery warning */}
      <Modal visible={pending !== null} transparent animationType="fade" onRequestClose={() => setPending(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {pending ? (
              <>
                <View style={[styles.warnBar, { backgroundColor: warnColor(pending.warning.level) }]} />
                <ZoneText variant="titleSm" color={colors.text.primary} style={styles.modalTitle}>
                  {SPORT_LABEL[pending.sport]}
                </ZoneText>
                <ZoneText variant="body" size={14} color={colors.text.primary} style={styles.modalBody}>
                  {pending.warning.message}
                </ZoneText>
                <Button
                  title={pending.warning.level === 'info' ? 'Continuer' : 'Continuer quand même'}
                  onPress={() => {
                    const s = pending.sport;
                    setPending(null);
                    launchSport(s);
                  }}
                />
                <TouchableOpacity onPress={() => setPending(null)} style={styles.modalCancel} hitSlop={8}>
                  <ZoneText variant="label" color={colors.text.muted}>
                    Annuler
                  </ZoneText>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Bonus sheet */}
      <Modal visible={bonusVisible} transparent animationType="slide" onRequestClose={() => setBonusVisible(false)}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setBonusVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <ZoneText variant="title" size={20} style={styles.sheetTitle}>
              SÉANCE BONUS
            </ZoneText>
            {acwrHigh ? (
              <View style={styles.bonusWarn}>
                <ZoneText variant="caption" color={colors.orbe.amber}>
                  ⚠️ Charge élevée cette semaine, privilégie la récupération.
                </ZoneText>
              </View>
            ) : null}
            {BONUS_OPTIONS.map((opt) => (
              <View key={opt.id} style={styles.bonusOption}>
                <ZoneText variant="label" color={colors.text.primary}>
                  {opt.title}
                </ZoneText>
                <ZoneText variant="caption" color={colors.text.secondary} style={styles.bonusOptDesc}>
                  {opt.description}
                </ZoneText>
                <ZoneText variant="caption" color={colors.text.muted}>
                  {opt.detail}
                </ZoneText>
                <TouchableOpacity
                  onPress={() => onStartBonus(opt.id)}
                  disabled={busy === 'bonus'}
                  activeOpacity={0.85}
                  style={styles.bonusOptBtn}
                >
                  <ZoneText variant="label" size={13} color={colors.bg.primary}>
                    Commencer
                  </ZoneText>
                </TouchableOpacity>
              </View>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Add a sport */}
      <Modal visible={addSportVisible} transparent animationType="slide" onRequestClose={() => setAddSportVisible(false)}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setAddSportVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <ZoneText variant="title" size={20} style={styles.sheetTitle}>
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
        <ZoneText variant="body" size={13} color={colors.text.secondary} style={styles.deloadBody}>
          Volume réduit à 50 %, charges maintenues. Tes prochaines séances muscu sont allégées.
        </ZoneText>
        <View style={styles.deloadCta}>
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
      <ZoneText variant="body" size={13} color={colors.text.primary} style={styles.deloadBody}>
        {deload.reason} {deload.protocol.description}
      </ZoneText>
      <View style={styles.deloadCta}>
        <Button title="Passer en mode décharge" onPress={onActivate} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 8,
  },
  title: { fontSize: 24, letterSpacing: 0.5 },
  blockBadge: { backgroundColor: colors.accent.gold, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  blockBadgeText: { fontFamily: 'Inter-Bold', letterSpacing: 0.3 },
  zoneStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 16 },
  zoneStripOrb: { width: 22, height: 22, borderRadius: 11 },
  zoneStripScore: { color: colors.text.primary },
  zoneStripStatus: { flex: 1 },
  section: { fontFamily: 'Syne-Bold', fontSize: 13, letterSpacing: 1.5, color: colors.text.muted, marginTop: 8, marginBottom: 12 },
  calendarCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
  weekNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  dayCol: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 12 },
  dayColToday: { backgroundColor: 'rgba(201,168,76,0.12)' },
  dayLetter: { fontFamily: 'Inter-Bold', fontSize: 11, letterSpacing: 1 },
  pillStack: { marginTop: 8, alignItems: 'center', gap: 3, minHeight: 16 },
  calPill: { width: 18, height: 7, borderRadius: 4 },
  restDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  futureDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'transparent' },
  raceLine: { marginTop: 14, lineHeight: 16 },
  emptyCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  sportStart: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 10,
  },
  sportStartIcon: { fontSize: 24, marginRight: 14 },
  sportStartMain: { flex: 1 },
  deloadCard: {
    marginTop: 6,
    marginBottom: 10,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  deloadEyebrow: { letterSpacing: 1, fontSize: 11, fontFamily: 'Inter-Bold' },
  deloadBody: { marginTop: 8, lineHeight: 19 },
  deloadCta: { marginTop: 14 },
  bonusCard: {
    marginTop: 6,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
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
  addSportText: { fontFamily: 'Inter-Medium' },
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
    overflow: 'hidden',
  },
  warnBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  modalTitle: { marginTop: 4, marginBottom: 8 },
  modalBody: { lineHeight: 20, marginBottom: 18 },
  modalCancel: { alignSelf: 'center', marginTop: 12, paddingVertical: 8 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg.elevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
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
  bonusWarn: { backgroundColor: 'rgba(255,183,77,0.10)', borderRadius: 10, padding: 10, marginBottom: 12 },
  bonusOption: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  bonusOptDesc: { marginTop: 4, lineHeight: 16 },
  bonusOptBtn: { marginTop: 12, backgroundColor: colors.accent.gold, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
});
