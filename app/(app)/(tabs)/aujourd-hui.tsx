import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronDown, ChevronUp, Plus } from 'lucide-react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import {
  createRunSession,
  createPlannedSession,
  getCompletedRuns,
  getCompletedSessions,
  getExerciseMaxes,
  getProgrammeQueue,
  getWorkloadHistory,
  setMuscleDeloadActive,
  updateQueueItem,
  todayDateString,
  type DailyCheckin,
  type ExerciseMax,
  type HyroxProfile,
  type MuscleProfile,
  type QueueState,
  type RunSession,
  type RunningProfile,
  type ScheduleSport,
  type SessionExercise,
  type TrainingSession,
  type UserProgram,
} from '@/lib/firestore';
import { getBlockName, projectProgram } from '@/lib/programEngine';
import { createWeightliftingSession } from '@/lib/sessionLaunch';
import {
  buildProgrammeQueue,
  nextAvailableForSport,
  type QueueItem,
  type QueueStatus,
} from '@/lib/programmeQueue';
import {
  buildRecoveryWarning,
  loadRecoveryContext,
  EMPTY_RECOVERY_CONTEXT,
  type RecoveryContext,
  type RecoveryWarning,
  type WarnLevel,
} from '@/lib/recovery';
import { calculateACWR, type WorkloadDataPoint, type WorkloadSport } from '@/lib/pro';
import {
  readCurrentWeek,
  readProgrammeQueue,
  recordSessionSkip,
  startWeek,
} from '@/lib/weekTracking';
import type { ProSport } from '@/lib/weekProgression';
import { generateMuscleSession } from '@/lib/muscleEngine';
import { evaluateDeloadNeed, type DeloadRecommendation } from '@/lib/muscleSessionScience';
import { blockFromWeeksToRace, type HyroxBlockPhase } from '@/lib/hyroxScience';
import type { MuscleGroup } from '@/data/exercises';
import { buildSessionPlan, calculateVDOTPaces, runningPaceFactor } from '@/lib/runningEngine';
import { type SchedulerSport, sportColor } from '@/lib/multiSportScheduler';
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
  { id: 'recovery', title: 'RÉCUPÉRATION ACTIVE · 20 min', description: 'Mobilité + étirements dynamiques', detail: "N'impacte pas ta récupération" },
  { id: 'technique', title: 'TRAVAIL TECHNIQUE · 25 min', description: 'Répétitions légères pour graver les patterns', detail: 'Charge: 50-60% de ton max' },
  { id: 'cardio', title: 'CARDIO LÉGER · 25 min', description: 'Zone 2 uniquement, hors programme', detail: 'FC max 130-140 bpm' },
];

const QUEUE_WEEKS = 2;

function weeksUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  return Math.max(0, Math.round((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)));
}

const VALID_WORKLOAD_SPORTS: ReadonlySet<WorkloadSport> = new Set([
  'weightlifting', 'running', 'musculation', 'hyrox',
]);

function toWorkloadPoints(
  entries: { date: string; tss: number; sport: string; sessionType: string; durationMinutes: number; intensityFactor: number }[],
): WorkloadDataPoint[] {
  const out: WorkloadDataPoint[] = [];
  for (const e of entries) {
    if (!VALID_WORKLOAD_SPORTS.has(e.sport as WorkloadSport)) continue;
    out.push({
      date: e.date, tss: e.tss, sport: e.sport as WorkloadSport,
      sessionType: e.sessionType, durationMinutes: e.durationMinutes, intensityFactor: e.intensityFactor,
    });
  }
  return out;
}

function warnColor(level: WarnLevel): string {
  if (level === 'danger') return colors.orbe.red;
  if (level === 'warn') return colors.orbe.amber;
  return colors.orbe.blue;
}

function statusMeta(status: QueueStatus): { icon: string; label: string } {
  switch (status) {
    case 'completed': return { icon: '✅', label: 'FAIT' };
    case 'skipped': return { icon: '⏭️', label: 'PASSÉE' };
    case 'available': return { icon: '▶️', label: '' };
    default: return { icon: '🔒', label: 'ATTEND' };
  }
}

export default function AujourdhuiScreen(): React.ReactElement {
  const router = useRouter();
  const [score, setScore] = useState<number | null>(null);
  const [program, setProgram] = useState<UserProgram | null>(null);
  const [runningProfile, setRunningProfile] = useState<RunningProfile | null>(null);
  const [muscleProfile, setMuscleProfile] = useState<MuscleProfile | null>(null);
  const [hyroxProfile, setHyroxProfile] = useState<HyroxProfile | null>(null);
  const [maxes, setMaxes] = useState<ExerciseMax[]>([]);
  const [recentRir, setRecentRir] = useState<number[]>([]);
  const [recentMuscleRir, setRecentMuscleRir] = useState<number[]>([]);
  const [recentRunRir, setRecentRunRir] = useState<number[]>([]);
  const [acwrHigh, setAcwrHigh] = useState<boolean>(false);
  const [deload, setDeload] = useState<DeloadRecommendation | null>(null);
  const [recovery, setRecovery] = useState<RecoveryContext>(EMPTY_RECOVERY_CONTEXT);
  const [expanded, setExpanded] = useState<boolean>(false);
  const [queueState, setQueueState] = useState<QueueState>({});

  const [pending, setPending] = useState<{ item: QueueItem; warning: RecoveryWarning } | null>(null);
  const [previewItem, setPreviewItem] = useState<QueueItem | null>(null);
  const [bonusVisible, setBonusVisible] = useState<boolean>(false);
  const [busy, setBusy] = useState<ScheduleSport | 'bonus' | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const subs = [
      onSnapshot(doc(db, 'users', user.uid, 'checkins', todayDateString()), (s) =>
        setScore(s.exists() ? (s.data() as DailyCheckin).zone_score : null), () => setScore(null)),
      onSnapshot(doc(db, 'users', user.uid, 'state', 'program'), (s) =>
        setProgram(s.exists() ? (s.data() as UserProgram) : null), () => undefined),
      onSnapshot(doc(db, 'users', user.uid, 'state', 'running_profile'), (s) =>
        setRunningProfile(s.exists() ? (s.data() as RunningProfile) : null), () => undefined),
      onSnapshot(doc(db, 'users', user.uid, 'state', 'muscle_profile'), (s) =>
        setMuscleProfile(s.exists() ? (s.data() as MuscleProfile) : null), () => undefined),
      onSnapshot(doc(db, 'users', user.uid, 'state', 'hyrox_profile'), (s) =>
        setHyroxProfile(s.exists() ? (s.data() as HyroxProfile) : null), () => undefined),
      onSnapshot(doc(db, 'users', user.uid, 'state', 'programme_queue'), (s) =>
        setQueueState(s.exists() ? ((s.data() as { items?: QueueState }).items ?? {}) : {}), () => undefined),
    ];
    return () => subs.forEach((u) => u());
  }, []);

  const loadHistory = useCallback(async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    const [sessions, runs, exMaxes, workload, ctx, qstate] = await Promise.all([
      getCompletedSessions(user.uid).catch(() => [] as TrainingSession[]),
      getCompletedRuns(user.uid, 60).catch(() => [] as RunSession[]),
      getExerciseMaxes(user.uid).catch(() => [] as ExerciseMax[]),
      getWorkloadHistory(user.uid, 35).catch(() => []),
      loadRecoveryContext(user.uid).catch(() => EMPTY_RECOVERY_CONTEXT),
      getProgrammeQueue(user.uid).catch(() => ({}) as QueueState),
    ]);
    setMaxes(exMaxes);
    setRecentRir(
      sessions.filter((s) => s.sport_key === 'weightlifting' && s.discipline !== 'musculation' && typeof s.rpe === 'number')
        .sort((a, b) => a.date.localeCompare(b.date)).slice(-2).map((s) => Math.max(0, 10 - (s.rpe as number))),
    );
    setRecentMuscleRir(
      sessions.filter((s) => s.discipline === 'musculation' && typeof s.rpe === 'number')
        .sort((a, b) => a.date.localeCompare(b.date)).slice(-2).map((s) => Math.max(0, 10 - (s.rpe as number))),
    );
    setRecentRunRir(
      runs.filter((r) => typeof r.rpe === 'number')
        .sort((a, b) => a.date.localeCompare(b.date)).slice(-2).map((r) => Math.max(0, 10 - (r.rpe as number))),
    );
    setAcwrHigh(calculateACWR(toWorkloadPoints(workload), todayDateString()).riskLevel === 'danger');
    setRecovery(ctx);
    setQueueState(qstate);
    setDeload(evaluateDeloadNeed(sessions.filter((s) => s.discipline === 'musculation'), 'intermediaire'));
  }, []);

  useFocusEffect(useCallback(() => { void loadHistory(); }, [loadHistory]));

  const hyroxBlock: HyroxBlockPhase = blockFromWeeksToRace(weeksUntil(hyroxProfile?.target_race_date ?? null));

  const queueWeeks = useMemo(
    () => buildProgrammeQueue({
      program, maxes, runningProfile, muscleProfile, hyroxProfile, hyroxBlock, state: queueState, weeks: QUEUE_WEEKS,
    }),
    [program, maxes, runningProfile, muscleProfile, hyroxProfile, hyroxBlock, queueState],
  );

  // First available item per sport across the visible queue window. Each
  // sport is resolved in complete isolation through nextAvailableForSport;
  // a stalled running week never holds the weightlifting card back, and
  // vice-versa. Returns 'complete' when a sport has items but none are
  // available (every visible week is done/skipped), and undefined when
  // the sport isn't configured at all.
  const nextBySport = useMemo(() => {
    const out: Partial<Record<ScheduleSport, QueueItem | 'complete'>> = {};
    for (const sport of ALL_SPORTS) {
      const slot = nextAvailableForSport(queueWeeks, sport);
      if (slot) out[sport] = slot;
    }
    return out;
  }, [queueWeeks]);

  const launchQueueItem = async (item: QueueItem): Promise<void> => {
    const user = auth.currentUser;
    if (!user || busy) return;
    setBusy(item.sport);
    try {
      if (item.sport === 'weightlifting' && program) {
        const projected: UserProgram = {
          ...program,
          current_block: item.block as UserProgram['current_block'],
          current_week: item.week,
        };
        const id = await createWeightliftingSession({
          uid: user.uid, program: projected, maxes, zoneScore: score, recentRir, dayOfWeek: item.day, queueKey: item.key,
        });
        router.push(`/(app)/session/${id}`);
      } else if (item.sport === 'running' && runningProfile && item.runningType) {
        const paces = calculateVDOTPaces(runningProfile.vdot);
        const level = runningProfile.vdot < 35 ? 'beginner' : runningProfile.vdot < 55 ? 'intermediate' : 'advanced';
        const plan = buildSessionPlan({
          type: item.runningType,
          paces,
          level,
          block: 1,
          week: 1,
          paceFactor: runningPaceFactor(recentRunRir),
          withStrides: item.runningWithStrides,
          recovery: item.runningRecovery,
          goalDistance: runningProfile.reference_distance ?? undefined,
          goalTimeSeconds: runningProfile.goal_time_seconds ?? undefined,
        });
        const id = await createRunSession(user.uid, {
          date: todayDateString(),
          session_type: plan.type,
          steps: plan.steps.map((s) => ({
            kind: s.kind, label: s.label, duration_seconds: s.durationSeconds,
            target_pace_sec_per_km: s.targetPaceSecPerKm, distance_meters: s.distanceMeters,
          })),
          estimated_duration_min: plan.estimatedDurationMin,
          estimated_distance_km: plan.estimatedDistanceKm,
          zone_score_at_start: score,
          zone_message: plan.message,
          queue_key: item.key,
        });
        router.push(`/(app)/run-session/${id}`);
      } else if (item.sport === 'musculation' && muscleProfile) {
        const generated = generateMuscleSession({
          sessionsPerWeek: muscleProfile.sessions_per_week,
          dayOfWeek: item.day,
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
          zone_message: deloadActive ? 'Semaine de décharge · volume réduit, charges maintenues.' : generated.message,
          queue_key: item.key,
        });
        router.push(`/(app)/muscle-session/${id}`);
      } else if (item.sport === 'hyrox' && hyroxProfile && item.hyroxType) {
        router.push(`/(app)/hyrox-session/new?type=${item.hyroxType}&block=${item.block}&queueKey=${encodeURIComponent(item.key)}`);
      }
    } catch {
      // no-op
    } finally {
      setBusy(null);
    }
  };

  const pickItem = (item: QueueItem): void => {
    const warning = buildRecoveryWarning(item.sport, recovery, new Date());
    if (warning) setPending({ item, warning });
    else void launchQueueItem(item);
  };

  const onSkip = (item: QueueItem): void => {
    Alert.alert(
      'Passer cette séance ?',
      'Cette séance sera marquée comme passée. La suivante se débloquera.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Passer la séance',
          style: 'destructive',
          onPress: async () => {
            const user = auth.currentUser;
            if (!user) return;
            await updateQueueItem(user.uid, item.key, 'skipped').catch(() => undefined);
            // Also book-keep the skip in week tracking so the bilan
            // can advance once every planned slot is accounted for.
            try {
              const sport = item.sport as ProSport;
              const queue = await readProgrammeQueue(user.uid);
              const week = readCurrentWeek(queue, sport);
              const sessionsPerWeek =
                sport === 'weightlifting'
                  ? (program?.sessions_per_week ?? 3)
                  : sport === 'running'
                    ? (runningProfile?.sessions_per_week ?? 3)
                    : sport === 'musculation'
                      ? (muscleProfile?.sessions_per_week ?? 3)
                      : (hyroxProfile?.sessions_per_week ?? 3);
              await startWeek(user.uid, sport, week, { sessions: sessionsPerWeek });
              await recordSessionSkip(user.uid, sport, week);
            } catch {
              // tracking is best effort
            }
            await loadHistory();
          },
        },
      ],
    );
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
      if (option === 'cardio') {
        // Bonus cardio is a standalone Zone 2 timer that must NEVER
        // touch the programme queue. Send the user to the lightweight
        // bonus-cardio screen instead of creating a planned run.
        router.push('/(app)/bonus-cardio?duration=25');
        return;
      }
      if (runningProfile && option === 'recovery') {
        const paces = calculateVDOTPaces(runningProfile.vdot);
        const level = runningProfile.vdot < 35 ? 'beginner' : runningProfile.vdot < 55 ? 'intermediate' : 'advanced';
        const plan = buildSessionPlan({ type: 'RA', paces, level, block: 1, week: 1, paceFactor: runningPaceFactor(recentRunRir) });
        const id = await createRunSession(user.uid, {
          date: todayDateString(),
          session_type: plan.type,
          steps: plan.steps.map((s) => ({
            kind: s.kind, label: s.label, duration_seconds: s.durationSeconds,
            target_pace_sec_per_km: s.targetPaceSecPerKm, distance_meters: s.distanceMeters,
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
        const id = await createWeightliftingSession({
          uid: user.uid, program: { ...program, current_block: 1, current_week: 4 }, maxes, zoneScore: 60, recentRir,
        });
        router.push(`/(app)/session/${id}`);
        return;
      }
      if (muscleProfile) {
        const generated = generateMuscleSession({
          sessionsPerWeek: muscleProfile.sessions_per_week,
          dayOfWeek: 1, goal: muscleProfile.goal,
          weakPoints: (muscleProfile.weak_points ?? []) as MuscleGroup[],
          zoneScore: 30, recentRir: recentMuscleRir,
        });
        const id = await createPlannedSession(user.uid, {
          date: todayDateString(), sport_key: 'weightlifting', discipline: 'musculation',
          planned_exercises: generated.exercises.map((ex) => ({ exercise_id: ex.exercise_id, sets: ex.sets })),
          zone_score_at_start: score, zone_message: 'Séance bonus · travail léger.',
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
    s === 'weightlifting' ? !!program : s === 'running' ? !!runningProfile : s === 'musculation' ? !!muscleProfile : !!hyroxProfile,
  );
  const unconfiguredSports = ALL_SPORTS.filter((s) => !configuredSports.includes(s));
  const bonusAvailable = Boolean(program || runningProfile || muscleProfile);
  const zoneLevel = score !== null ? getZoneLevel(score) : null;
  const raceWeeks = weeksUntil(hyroxProfile?.target_race_date ?? null);
  const runningRaceWeeks = weeksUntil(runningProfile?.target_race_date ?? null);

  const cardSubtitle = useCallback(
    (item: QueueItem): string => {
      if (item.sport === 'weightlifting' && program) {
        const projected = projectProgram(program, item.weekNumber - 1);
        return `Bloc ${projected.current_block} · ${getBlockName(projected.current_block)} · Semaine ${Math.min(4, projected.current_week)} · ~${item.estimatedMinutes} min`;
      }
      return `Semaine ${item.weekNumber} · ~${item.estimatedMinutes} min`;
    },
    [program],
  );

  return (
    <SafeScreen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ZoneText variant="heading" style={styles.title}>MON PROGRAMME</ZoneText>
          {program ? (
            <View style={styles.blockBadge}>
              <ZoneText variant="caption" color={colors.bg.primary} style={styles.blockBadgeText}>
                Bloc {program.current_block} · S{Math.min(4, program.current_week)}
              </ZoneText>
            </View>
          ) : null}
        </View>

        <View style={styles.zoneStrip}>
          <View style={[styles.zoneStripOrb, { backgroundColor: zoneLevel ? zoneLevel.color : colors.border }]} />
          <ZoneText variant="number" size={18} style={styles.zoneStripScore}>{score ?? '--'}</ZoneText>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.zoneStripStatus}>
            {zoneLevel ? zoneLevel.label : 'Pas de check-in aujourd’hui'}
          </ZoneText>
        </View>

        {raceWeeks !== null ? (
          <ZoneText variant="caption" color={colors.accent.gold} style={styles.raceLineTop}>
            🏁 Course dans {raceWeeks} semaine{raceWeeks > 1 ? 's' : ''} · pense à alléger en fin de cycle
          </ZoneText>
        ) : null}

        {/* Next session per sport */}
        {configuredSports.length === 0 ? (
          <View style={styles.emptyCard}>
            <ZoneText variant="caption" color={colors.text.muted}>
              Configure un sport pour commencer à t'entraîner.
            </ZoneText>
          </View>
        ) : (
          <>
            <ZoneText variant="caption" style={styles.sectionHeader}>
              PROCHAINE SÉANCE
            </ZoneText>
            {configuredSports.map((sport) => {
              const slot = nextBySport[sport];
              if (slot === 'complete') {
                return (
                  <View
                    key={sport}
                    style={[
                      styles.qCard,
                      styles.qCardDone,
                      { borderLeftColor: sportColor(sport as SchedulerSport) },
                    ]}
                  >
                    <View style={styles.qCardHead}>
                      <ZoneText style={styles.qIcon}>✅</ZoneText>
                      <View style={styles.qMain}>
                        <ZoneText variant="titleSm" color={colors.text.muted}>
                          {SPORT_ICON[sport]} {SPORT_LABEL[sport]} · Semaine complète
                        </ZoneText>
                      </View>
                    </View>
                  </View>
                );
              }
              if (!slot) return null;
              const item = slot;
              const urgentRunning =
                sport === 'running' &&
                runningRaceWeeks !== null &&
                runningRaceWeeks > 0 &&
                runningRaceWeeks < 8;
              return (
                <View
                  key={sport}
                  style={[
                    styles.qCard,
                    styles.qCardAvailable,
                    { borderLeftColor: sportColor(sport as SchedulerSport) },
                  ]}
                >
                  <TouchableOpacity activeOpacity={0.7} onPress={() => setPreviewItem(item)}>
                    <View style={styles.qCardHead}>
                      <ZoneText style={styles.qIcon}>{SPORT_ICON[sport]}</ZoneText>
                      <View style={styles.qMain}>
                        <ZoneText variant="titleSm" color={colors.text.primary}>
                          {item.name}
                        </ZoneText>
                        <ZoneText variant="caption" color={colors.text.muted}>
                          {cardSubtitle(item)}
                        </ZoneText>
                        {urgentRunning ? (
                          <ZoneText
                            variant="caption"
                            color={colors.orbe.amber}
                            style={styles.urgencyNote}
                          >
                            🏁 Course dans {runningRaceWeeks} semaine
                            {runningRaceWeeks > 1 ? 's' : ''} · ne lâche pas
                          </ZoneText>
                        ) : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                  <View style={styles.qActions}>
                    <TouchableOpacity
                      onPress={() => pickItem(item)}
                      disabled={busy === item.sport}
                      activeOpacity={0.85}
                      style={styles.qStartBtn}
                    >
                      <ZoneText variant="label" size={13} color={colors.bg.primary}>
                        {busy === item.sport ? '...' : 'COMMENCER'}
                      </ZoneText>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => onSkip(item)} activeOpacity={0.7} style={styles.qSkipBtn}>
                      <ZoneText variant="caption" color={colors.text.muted}>
                        Passer
                      </ZoneText>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setExpanded((e) => !e)}
              style={styles.expandLink}
            >
              <ZoneText variant="caption" color={colors.accent.gold} style={styles.expandLinkText}>
                {expanded ? 'MASQUER MES SÉANCES' : 'VOIR TOUTES MES SÉANCES'}
              </ZoneText>
              {expanded ? (
                <ChevronUp size={14} color={colors.accent.gold} />
              ) : (
                <ChevronDown size={14} color={colors.accent.gold} />
              )}
            </TouchableOpacity>

            {expanded ? (
              <View style={styles.fullQueue}>
                {queueWeeks.map((week, wi) =>
                  week.length === 0 ? null : (
                    <View key={`w-${wi}`}>
                      <ZoneText variant="caption" style={styles.weekHeader}>
                        SEMAINE {wi + 1}
                      </ZoneText>
                      {week.map((item) => {
                        const meta = statusMeta(item.status);
                        const done = item.status === 'completed' || item.status === 'skipped';
                        const available = item.status === 'available';
                        return (
                          <View
                            key={item.key}
                            style={[
                              styles.qCard,
                              available ? styles.qCardAvailable : null,
                              done ? styles.qCardDone : null,
                              { borderLeftColor: sportColor(item.sport as SchedulerSport) },
                            ]}
                          >
                            <TouchableOpacity
                              activeOpacity={available ? 0.7 : 1}
                              disabled={!available}
                              onPress={() => available && setPreviewItem(item)}
                            >
                              <View style={styles.qCardHead}>
                                <ZoneText style={styles.qIcon}>{meta.icon}</ZoneText>
                                <View style={styles.qMain}>
                                  <ZoneText
                                    variant="titleSm"
                                    color={done ? colors.text.muted : colors.text.primary}
                                  >
                                    {SPORT_ICON[item.sport]} {item.name}
                                  </ZoneText>
                                  <ZoneText variant="caption" color={colors.text.muted}>
                                    ~{item.estimatedMinutes} min
                                    {item.exercises.length ? ` · ${item.exercises.join(' · ')}` : ''}
                                  </ZoneText>
                                </View>
                                {meta.label ? (
                                  <ZoneText
                                    variant="caption"
                                    color={item.status === 'completed' ? colors.success : colors.text.muted}
                                    style={styles.qStatusLabel}
                                  >
                                    {meta.label}
                                  </ZoneText>
                                ) : null}
                              </View>
                            </TouchableOpacity>
                            {available ? (
                              <View style={styles.qActions}>
                                <TouchableOpacity
                                  onPress={() => pickItem(item)}
                                  disabled={busy === item.sport}
                                  activeOpacity={0.85}
                                  style={styles.qStartBtn}
                                >
                                  <ZoneText variant="label" size={13} color={colors.bg.primary}>
                                    {busy === item.sport ? '...' : 'COMMENCER'}
                                  </ZoneText>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => onSkip(item)} activeOpacity={0.7} style={styles.qSkipBtn}>
                                  <ZoneText variant="caption" color={colors.text.muted}>
                                    Passer
                                  </ZoneText>
                                </TouchableOpacity>
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  ),
                )}
              </View>
            ) : null}
          </>
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
            <ZoneText variant="titleSm" color={colors.text.primary}>Envie de bouger ?</ZoneText>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.bonusSub}>
              Une séance courte et complémentaire à ton programme.
            </ZoneText>
            <TouchableOpacity onPress={() => setBonusVisible(true)} activeOpacity={0.8} style={styles.bonusBtn}>
              <ZoneText variant="label" color={colors.accent.gold}>SÉANCE BONUS</ZoneText>
            </TouchableOpacity>
          </View>
        ) : null}

        {unconfiguredSports.length > 0 ? (
          <View style={styles.addLinks}>
            {unconfiguredSports.map((sport) => (
              <TouchableOpacity
                key={sport}
                onPress={() => router.push(ADD_SPORT_ROUTE[sport])}
                activeOpacity={0.7}
                style={styles.addLink}
              >
                <Plus size={14} color={colors.text.secondary} />
                <ZoneText variant="caption" color={colors.text.secondary} style={styles.addLinkText}>
                  Ajouter {SPORT_LABEL[sport]}
                </ZoneText>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* Recovery sheet */}
      <Modal visible={pending !== null} transparent animationType="slide" onRequestClose={() => setPending(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            {pending ? (
              <>
                <View style={[styles.warnBar, { backgroundColor: warnColor(pending.warning.level) }]} />
                <ZoneText variant="title" size={20} style={styles.sheetTitle}>
                  {SPORT_LABEL[pending.item.sport].toUpperCase()}
                </ZoneText>
                <ZoneText variant="body" size={14} color={colors.text.primary} style={styles.sheetBody}>
                  {pending.warning.message}
                </ZoneText>
                {pending.warning.canContinue && pending.warning.level === 'info' ? (
                  <Button title="CONTINUER" onPress={() => { const p = pending; setPending(null); void launchQueueItem(p.item); }} />
                ) : pending.warning.canContinue ? (
                  <>
                    <Button title="REPORTER" onPress={() => setPending(null)} />
                    <TouchableOpacity
                      onPress={() => { const p = pending; setPending(null); void launchQueueItem(p.item); }}
                      style={styles.ghostBtn}
                      activeOpacity={0.7}
                    >
                      <ZoneText variant="label" color={colors.text.muted}>Continuer quand même</ZoneText>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Button title="REPORTER" onPress={() => setPending(null)} />
                )}
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Session preview sheet — tap on a queue card opens this
          so the user can review the session before committing. */}
      <Modal
        visible={previewItem !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPreviewItem(null)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setPreviewItem(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            {previewItem ? (
              <>
                <ZoneText variant="caption" color={colors.accent.gold} style={styles.previewEyebrow}>
                  APERÇU · {SPORT_LABEL[previewItem.sport].toUpperCase()}
                </ZoneText>
                <ZoneText variant="title" size={20} style={styles.sheetTitle}>
                  {previewItem.name}
                </ZoneText>
                <ZoneText variant="body" color={colors.text.muted} style={styles.previewMeta}>
                  ~{previewItem.estimatedMinutes} min · semaine {previewItem.weekNumber}
                </ZoneText>
                {previewItem.exercises.length > 0 ? (
                  <View style={styles.previewExList}>
                    {previewItem.exercises.map((ex, i) => (
                      <View key={`${ex}-${i}`} style={styles.previewExRow}>
                        <ZoneText variant="label" color={colors.text.muted} style={styles.previewExBullet}>
                          {i + 1}.
                        </ZoneText>
                        <ZoneText variant="body" color={colors.text.primary} style={styles.previewExText}>
                          {ex}
                        </ZoneText>
                      </View>
                    ))}
                  </View>
                ) : null}
                <View style={styles.previewActions}>
                  <Button
                    title="LANCER LA SÉANCE  →"
                    onPress={() => {
                      const it = previewItem;
                      setPreviewItem(null);
                      void pickItem(it);
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => setPreviewItem(null)}
                    activeOpacity={0.7}
                    style={styles.previewBack}
                  >
                    <ZoneText variant="label" color={colors.text.muted}>
                      ← Retour
                    </ZoneText>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Bonus sheet */}
      <Modal visible={bonusVisible} transparent animationType="slide" onRequestClose={() => setBonusVisible(false)}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setBonusVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <ZoneText variant="title" size={20} style={styles.sheetTitle}>SÉANCE BONUS</ZoneText>
            {acwrHigh ? (
              <View style={styles.bonusWarn}>
                <ZoneText variant="caption" color={colors.orbe.amber}>
                  ⚠️ Charge élevée cette semaine, privilégie la récupération.
                </ZoneText>
              </View>
            ) : null}
            {BONUS_OPTIONS.map((opt) => (
              <View key={opt.id} style={styles.bonusOption}>
                <ZoneText variant="label" color={colors.text.primary}>{opt.title}</ZoneText>
                <ZoneText variant="caption" color={colors.text.secondary} style={styles.bonusOptDesc}>{opt.description}</ZoneText>
                <ZoneText variant="caption" color={colors.text.muted}>{opt.detail}</ZoneText>
                <TouchableOpacity onPress={() => onStartBonus(opt.id)} disabled={busy === 'bonus'} activeOpacity={0.85} style={styles.bonusOptBtn}>
                  <ZoneText variant="label" size={13} color={colors.bg.primary}>Commencer</ZoneText>
                </TouchableOpacity>
              </View>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeScreen>
  );
}

function DeloadCard({
  deload, active, onActivate, onExit,
}: {
  deload: DeloadRecommendation | null;
  active: boolean;
  onActivate: () => void;
  onExit: () => void;
}): React.ReactElement | null {
  if (active) {
    return (
      <View style={[styles.deloadCard, { borderColor: colors.orbe.blue }]}>
        <ZoneText variant="caption" color={colors.orbe.blue} style={styles.deloadEyebrow}>MODE DÉCHARGE ACTIF</ZoneText>
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
      <ZoneText variant="caption" color={colors.orbe.amber} style={styles.deloadEyebrow}>DÉCHARGE RECOMMANDÉE CETTE SEMAINE</ZoneText>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 8 },
  title: { fontSize: 24, letterSpacing: 0.5 },
  blockBadge: { backgroundColor: colors.accent.gold, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  blockBadgeText: { fontFamily: 'Inter-Bold', letterSpacing: 0.3 },
  zoneStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 16 },
  zoneStripOrb: { width: 22, height: 22, borderRadius: 11 },
  zoneStripScore: { color: colors.text.primary },
  zoneStripStatus: { flex: 1 },
  raceLineTop: { marginTop: 2, marginBottom: 16, lineHeight: 16 },
  urgencyNote: { marginTop: 4, fontFamily: 'Inter-Bold' },
  sectionHeader: {
    fontFamily: 'Syne-Bold',
    fontSize: 13,
    letterSpacing: 1.5,
    color: colors.text.muted,
    marginBottom: 12,
  },
  weekHeader: {
    fontFamily: 'Syne-Bold',
    fontSize: 13,
    letterSpacing: 1.5,
    color: colors.text.muted,
    marginTop: 16,
    marginBottom: 12,
  },
  expandLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  expandLinkText: { fontFamily: 'Inter-Bold', fontSize: 12, letterSpacing: 1 },
  fullQueue: { marginTop: 4 },
  qCard: {
    backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 3,
    borderRadius: 16, padding: 16, marginBottom: 10,
  },
  qCardAvailable: { borderColor: colors.accent.gold },
  qCardDone: { opacity: 0.55 },
  qCardHead: { flexDirection: 'row', alignItems: 'center' },
  qIcon: { fontSize: 16, marginRight: 10 },
  qMain: { flex: 1 },
  qStatusLabel: { fontFamily: 'Inter-Bold', letterSpacing: 0.5, marginLeft: 8 },
  qActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  qStartBtn: { flex: 1, backgroundColor: colors.accent.gold, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  qSkipBtn: { paddingHorizontal: 14, paddingVertical: 10 },
  deloadCard: { marginTop: 16, marginBottom: 4, backgroundColor: colors.bg.card, borderWidth: 1, borderRadius: 16, padding: 16 },
  deloadEyebrow: { letterSpacing: 1, fontSize: 11, fontFamily: 'Inter-Bold' },
  deloadBody: { marginTop: 8, lineHeight: 19 },
  deloadCta: { marginTop: 14 },
  bonusCard: { marginTop: 16, backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16 },
  bonusSub: { marginTop: 4, lineHeight: 16 },
  bonusBtn: { marginTop: 12, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.accent.gold, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  emptyCard: { backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 20, alignItems: 'center', marginTop: 16 },
  addLinks: { marginTop: 24, gap: 4, alignItems: 'center' },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  addLinkText: { fontFamily: 'Inter-Medium' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg.elevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, overflow: 'hidden' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
  warnBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  sheetTitle: { letterSpacing: 1, marginBottom: 12, color: colors.text.primary },
  sheetBody: { lineHeight: 21, marginBottom: 18 },
  ghostBtn: { alignSelf: 'center', marginTop: 12, paddingVertical: 8 },
  bonusWarn: { backgroundColor: 'rgba(255,183,77,0.10)', borderRadius: 10, padding: 10, marginBottom: 12 },
  bonusOption: { backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 10 },
  bonusOptDesc: { marginTop: 4, lineHeight: 16 },
  bonusOptBtn: { marginTop: 12, backgroundColor: colors.accent.gold, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  previewEyebrow: { letterSpacing: 2, fontFamily: 'Inter-Bold', fontSize: 11, marginBottom: 6 },
  previewMeta: { marginBottom: 14, fontSize: 13 },
  previewExList: {
    backgroundColor: colors.bg.elevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  previewExRow: { flexDirection: 'row', paddingVertical: 6 },
  previewExBullet: { width: 22, fontSize: 13 },
  previewExText: { flex: 1, fontSize: 14, lineHeight: 18 },
  previewActions: { marginTop: 4 },
  previewBack: { alignSelf: 'center', marginTop: 12, paddingVertical: 8 },
});
