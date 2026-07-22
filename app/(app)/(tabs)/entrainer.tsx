import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Play, Plus, Search } from 'lucide-react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import {
  createPlannedSession,
  createRunSession,
  getCompletedRuns,
  getCompletedSessions,
  getExerciseMaxes,
  getHyroxProfile,
  getMuscleProfile,
  getProgrammeQueue,
  getRunningProfile,
  getUserProgram,
  todayDateString,
  updateQueueItem,
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
import { getBlockName } from '@/lib/programEngine';
import type { ProgramBlock } from '@/lib/firestore';
import { launchSessionForItem } from '@/lib/sessionLaunch';
import {
  buildProgrammeQueue,
  nextAvailableForSport,
  type QueueItem,
} from '@/lib/programmeQueue';
import {
  buildRecoveryWarning,
  loadRecoveryContext,
  EMPTY_RECOVERY_CONTEXT,
  type RecoveryContext,
  type RecoveryWarning,
  type WarnLevel,
} from '@/lib/recovery';
import {
  readCurrentWeek,
  readProgrammeQueue,
  recordSessionSkip,
  startWeek,
} from '@/lib/weekTracking';
import type { ProSport } from '@/lib/weekProgression';
import { generateMuscleSession } from '@/lib/muscleEngine';
import { blockFromWeeksToRace, type HyroxBlockPhase } from '@/lib/hyroxScience';
import type { MuscleGroup } from '@/data/exercises';
import {
  blockWeekForAbsoluteWeek,
  buildSessionPlan,
  calculateVDOTPaces,
  formatPace,
  raceLabel,
  runningPaceFactor,
} from '@/lib/runningEngine';
import { formatSpeed } from '@/utils/paceUtils';
import {
  getRunningPhaseNote,
  getRunningSessionNote,
  getWeightliftingBlockNote,
} from '@/data/coachingContext';
import { weeksUntilRace } from '@/lib/programmePhases';
import { sportColor, type SchedulerSport } from '@/lib/multiSportScheduler';
import { frenchShortDate } from '@/lib/frenchDate';
import type { RunningRaceDistance } from '@/lib/firestore';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/context/SessionContext';

type Sport = 'weightlifting' | 'running' | 'musculation' | 'hyrox';

const ALL_SPORTS: Sport[] = ['weightlifting', 'running', 'musculation', 'hyrox'];
const QUEUE_WEEKS = 2;

const SPORT_LABEL: Record<Sport, string> = {
  weightlifting: 'Haltérophilie',
  running: 'Course',
  musculation: 'Musculation',
  hyrox: 'Hyrox',
};

const SPORT_ICON: Record<Sport, string> = {
  weightlifting: '🏋️',
  running: '🏃',
  musculation: '💪',
  hyrox: '🔥',
};

const SETUP_ROUTE: Record<Sport, '/(app)/maxes' | '/(app)/running-setup' | '/(app)/muscle-setup' | '/(app)/hyrox-setup'> = {
  weightlifting: '/(app)/maxes',
  running: '/(app)/running-setup',
  musculation: '/(app)/muscle-setup',
  hyrox: '/(app)/hyrox-setup',
};

const CATEGORIES: { label: string; query: string }[] = [
  { label: 'Haltérophilie', query: 'weightlifting' },
  { label: 'Course', query: 'running' },
  { label: 'Musculation', query: 'musculation' },
  { label: 'Hyrox', query: 'hyrox' },
];

const QUICK_EXERCISES: { id: string; name: string }[] = [
  { id: 'snatch', name: 'Snatch' },
  { id: 'clean_and_jerk', name: 'Clean & Jerk' },
  { id: 'front_squat', name: 'Front Squat' },
];

function weeksUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  return Math.max(0, Math.round((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)));
}

function warnColor(level: WarnLevel): string {
  if (level === 'danger') return colors.orbe.red;
  if (level === 'warn') return colors.orbe.amber;
  return colors.orbe.blue;
}

function sportOf(s: TrainingSession): { label: string; icon: string } {
  if (s.discipline === 'musculation') return { label: 'Muscu', icon: '💪' };
  if (s.sport_key === 'running') return { label: 'Course', icon: '🏃' };
  return { label: 'Haltéro', icon: '🏋️' };
}

function formatGoal(seconds: number, withHours: boolean): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (withHours) return `${h}h${m.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function EntrainerScreen(): React.ReactElement {
  const router = useRouter();
  const { activeSession } = useSession();

  // Profile + queue state
  const [program, setProgram] = useState<UserProgram | null>(null);
  const [runningProfile, setRunningProfile] = useState<RunningProfile | null>(null);
  const [muscleProfile, setMuscleProfile] = useState<MuscleProfile | null>(null);
  const [hyroxProfile, setHyroxProfile] = useState<HyroxProfile | null>(null);
  const [maxes, setMaxes] = useState<ExerciseMax[]>([]);
  const [queueState, setQueueState] = useState<QueueState>({});
  const [score, setScore] = useState<number | null>(null);
  const [recovery, setRecovery] = useState<RecoveryContext>(EMPTY_RECOVERY_CONTEXT);
  const [recentRir, setRecentRir] = useState<number[]>([]);
  const [recentMuscleRir, setRecentMuscleRir] = useState<number[]>([]);
  const [recentRunRir, setRecentRunRir] = useState<number[]>([]);

  // UI state
  const [recent, setRecent] = useState<TrainingSession[]>([]);
  const [search, setSearch] = useState<string>('');
  const [pending, setPending] = useState<{ item: QueueItem; warning: RecoveryWarning } | null>(null);
  const [previewItem, setPreviewItem] = useState<QueueItem | null>(null);
  const [busy, setBusy] = useState<Sport | null>(null);

  // ── Firestore subscriptions ─────────────────────────────────────────────────
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
    const [sessions, runs, exMaxes, ctx, qstate] = await Promise.all([
      getCompletedSessions(user.uid).catch(() => [] as TrainingSession[]),
      getCompletedRuns(user.uid, 60).catch(() => [] as RunSession[]),
      getExerciseMaxes(user.uid).catch(() => [] as ExerciseMax[]),
      loadRecoveryContext(user.uid).catch(() => EMPTY_RECOVERY_CONTEXT),
      getProgrammeQueue(user.uid).catch(() => ({}) as QueueState),
    ]);
    setMaxes(exMaxes);
    setRecentRir(
      sessions
        .filter((s) => s.sport_key === 'weightlifting' && s.discipline !== 'musculation' && typeof s.rpe === 'number')
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-2)
        .map((s) => Math.max(0, 10 - (s.rpe as number))),
    );
    setRecentMuscleRir(
      sessions
        .filter((s) => s.discipline === 'musculation' && typeof s.rpe === 'number')
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-2)
        .map((s) => Math.max(0, 10 - (s.rpe as number))),
    );
    setRecentRunRir(
      runs
        .filter((r) => typeof r.rpe === 'number')
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-2)
        .map((r) => Math.max(0, 10 - (r.rpe as number))),
    );
    setRecovery(ctx);
    setQueueState(qstate);
    setRecent(sessions.slice(0, 5));
  }, []);

  useFocusEffect(useCallback(() => { void loadHistory(); }, [loadHistory]));

  // ── Queue + next-by-sport ───────────────────────────────────────────────────
  const hyroxBlock: HyroxBlockPhase = blockFromWeeksToRace(weeksUntil(hyroxProfile?.target_race_date ?? null));

  const queueWeeks = useMemo(
    () => buildProgrammeQueue({
      program, maxes, runningProfile, muscleProfile, hyroxProfile, hyroxBlock, state: queueState, weeks: QUEUE_WEEKS,
    }),
    [program, maxes, runningProfile, muscleProfile, hyroxProfile, hyroxBlock, queueState],
  );

  const nextBySport = useMemo(() => {
    const out: Partial<Record<Sport, QueueItem | 'complete'>> = {};
    for (const sport of ALL_SPORTS) {
      const slot = nextAvailableForSport(queueWeeks, sport);
      if (slot) out[sport] = slot;
    }
    return out;
  }, [queueWeeks]);

  const configuredSports = ALL_SPORTS.filter((s) =>
    s === 'weightlifting' ? !!program : s === 'running' ? !!runningProfile : s === 'musculation' ? !!muscleProfile : !!hyroxProfile,
  );
  const unconfiguredSports = ALL_SPORTS.filter((s) => !configuredSports.includes(s));
  const runningRaceWeeks = weeksUntil(runningProfile?.target_race_date ?? null);

  const cardSubtitle = useCallback((item: QueueItem): string => {
    if (item.sport === 'weightlifting') {
      const block = (item.block || 1) as ProgramBlock;
      return `Bloc ${block} · ${getBlockName(block)} · Semaine ${Math.min(4, item.week)} · ~${item.estimatedMinutes} min`;
    }
    if (item.sport === 'running') {
      const { block, week } = blockWeekForAbsoluteWeek(item.week);
      const phase = getRunningPhaseNote(block);
      return `Bloc ${block}${phase ? ` · ${phase.name}` : ''} · Semaine ${week}/4 · ~${item.estimatedMinutes} min`;
    }
    return `Semaine ${item.week} · ~${item.estimatedMinutes} min`;
  }, []);

  // Deload = week 4 of a block (both sports). Running items carry the absolute
  // pool week, so recover the week-in-block first.
  const isDeloadItem = useCallback((item: QueueItem): boolean => {
    if (item.sport === 'running') return blockWeekForAbsoluteWeek(item.week).week === 4;
    if (item.sport === 'weightlifting') return Math.min(4, Math.max(1, item.week)) === 4;
    return false;
  }, []);

  // Pedagogical context for the running preview sheet (phase + session note).
  const previewCtx = (() => {
    if (!previewItem || previewItem.sport !== 'running') return null;
    const bw = blockWeekForAbsoluteWeek(previewItem.week);
    return {
      block: bw.block,
      phase: getRunningPhaseNote(bw.block),
      note: getRunningSessionNote(previewItem.runningType ?? 'EF', {
        withStrides: previewItem.runningWithStrides,
        isDeload: bw.week === 4,
      }),
    };
  })();

  // Pedagogical context for the weightlifting preview sheet (block note).
  const wlPreviewCtx = (() => {
    if (!previewItem || previewItem.sport !== 'weightlifting') return null;
    const note = getWeightliftingBlockNote(previewItem.block);
    if (!note) return null;
    return { block: previewItem.block, week: Math.min(4, Math.max(1, previewItem.week)), note };
  })();

  // Weightlifting opens the full detailed preview SCREEN (per-set charges + reps,
  // % 1RM, rest, CONTEXTE); the other sports use the bottom-sheet modal.
  const openPreview = useCallback(
    (item: QueueItem): void => {
      if (item.sport === 'weightlifting') {
        router.push(
          `/(app)/session-preview?day=${item.day}&block=${item.block}&week=${Math.min(4, Math.max(1, item.week))}`,
        );
      } else {
        setPreviewItem(item);
      }
    },
    [router],
  );

  // ── Launch + skip ───────────────────────────────────────────────────────────
  const launchQueueItem = async (item: QueueItem): Promise<void> => {
    const user = auth.currentUser;
    if (!user || busy) return;
    setBusy(item.sport);
    try {
      const href = await launchSessionForItem({
        uid: user.uid,
        item,
        program,
        runningProfile,
        muscleProfile,
        hyroxProfile,
        maxes,
        zoneScore: score,
        recentRir,
        recentMuscleRir,
        recentRunRir,
      });
      if (href) router.push(href);
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

  // Optional running-card-tail surface lives below the card; keep the race
  // pill + goal-edit link available so the athlete can adjust their objective
  // from within the launching tab.
  const renderRunningTail = (sport: Sport): React.ReactElement | null => {
    if (sport !== 'running' || !runningProfile) return null;
    const raceDate = runningProfile.target_race_date ?? null;
    const distance = (runningProfile.race_distance ?? runningProfile.reference_distance ?? null) as
      | RunningRaceDistance
      | null;
    const goalSeconds = runningProfile.goal_time_seconds ?? 0;
    const weeks = weeksUntilRace(raceDate);
    const showHours = distance === 'semi' || distance === 'marathon';
    return (
      <View style={styles.runningTail}>
        {distance && raceDate && weeks !== null ? (
          <View style={styles.racePill}>
            <ZoneText variant="caption" color={colors.scoreGreen} style={styles.racePillText}>
              🏁 {raceLabel(distance)} · Dans {weeks} sem
              {goalSeconds > 0 ? ` · Objectif ${formatGoal(goalSeconds, showHours)}` : ''}
            </ZoneText>
          </View>
        ) : null}
        <TouchableOpacity
          onPress={() => router.push('/(app)/race-goal')}
          hitSlop={6}
          activeOpacity={0.7}
          style={styles.goalLink}
        >
          <ZoneText variant="caption" color={colors.scoreGreen} style={styles.goalLinkText}>
            {raceDate ? 'Modifier mon objectif →' : 'Configurer mon objectif →'}
          </ZoneText>
        </TouchableOpacity>
      </View>
    );
  };

  const onSearch = (): void => {
    router.push('/(app)/library');
  };

  return (
    <SafeScreen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ZoneText variant="heading" style={styles.screenTitle}>
          ENTRAÎNER
        </ZoneText>

        {activeSession ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push(`/(app)/session/${activeSession.sessionId}`)}
            style={styles.resumeBanner}
          >
            <View style={styles.resumeMain}>
              <ZoneText variant="caption" color={colors.bg.primary} style={styles.resumeEyebrow}>
                SÉANCE EN COURS
              </ZoneText>
              <ZoneText variant="titleSm" color={colors.bg.primary} style={styles.resumeTitle}>
                {activeSession.currentExerciseName || 'Séance'} · Série{' '}
                {activeSession.setsCompleted + 1}/{activeSession.totalSets}
              </ZoneText>
            </View>
            <View style={styles.resumeBtn}>
              <Play size={16} color={colors.scoreGreen} fill={colors.scoreGreen} />
              <ZoneText variant="caption" color={colors.scoreGreen} style={styles.resumeBtnText}>
                REPRENDRE
              </ZoneText>
            </View>
          </TouchableOpacity>
        ) : null}

        {/* PROCHAINE SÉANCE — one card per configured sport. This is the
            primary action surface for the tab. */}
        {configuredSports.length === 0 ? (
          <View style={styles.emptyCard}>
            <ZoneText variant="caption" color={colors.text.muted}>
              Configure un sport pour commencer à t'entraîner.
            </ZoneText>
          </View>
        ) : (
          <>
            <ZoneText variant="caption" style={styles.section}>
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
                    {renderRunningTail(sport)}
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
                  style={[styles.qCardColored, { backgroundColor: sportColor(sport as SchedulerSport) }]}
                >
                  <TouchableOpacity activeOpacity={0.85} onPress={() => openPreview(item)}>
                    <View style={styles.qCardHead}>
                      <ZoneText style={styles.qIcon}>{SPORT_ICON[sport]}</ZoneText>
                      <View style={styles.qMain}>
                        <ZoneText variant="title" size={18} color="#FFFFFF" style={styles.qTitle}>
                          {item.name}
                        </ZoneText>
                        <ZoneText variant="caption" color="rgba(255,255,255,0.7)" style={styles.qSubtitle}>
                          {cardSubtitle(item)}
                        </ZoneText>
                        {isDeloadItem(item) ? (
                          <View style={styles.deloadBadge}>
                            <ZoneText style={styles.deloadBadgeText}>DÉCHARGE</ZoneText>
                          </View>
                        ) : null}
                        {urgentRunning ? (
                          <ZoneText
                            variant="caption"
                            color="rgba(255,255,255,0.9)"
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
                      style={styles.qLaunchBtn}
                    >
                      <ZoneText style={styles.qLaunchText}>
                        {busy === item.sport ? '...' : 'LANCER  →'}
                      </ZoneText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => openPreview(item)}
                      activeOpacity={0.85}
                      style={styles.qApercuBtn}
                    >
                      <ZoneText style={styles.qApercuText}>Aperçu</ZoneText>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => onSkip(item)} activeOpacity={0.7} style={styles.qSkipBtn}>
                    <ZoneText style={styles.qSkipText}>Passer cette séance</ZoneText>
                  </TouchableOpacity>
                  {renderRunningTail(sport)}
                </View>
              );
            })}
          </>
        )}

        {unconfiguredSports.length > 0 ? (
          <View style={styles.addLinks}>
            {unconfiguredSports.map((sport) => (
              <TouchableOpacity
                key={sport}
                onPress={() => router.push(SETUP_ROUTE[sport])}
                activeOpacity={0.7}
                style={styles.addLink}
              >
                <Plus size={14} color="rgba(255,255,255,0.4)" />
                <ZoneText variant="caption" color="rgba(255,255,255,0.4)" style={styles.addLinkText}>
                  Ajouter {SPORT_LABEL[sport]}
                </ZoneText>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {/* RÉCENT */}
        <View style={styles.sectionRow}>
          <ZoneText variant="caption" style={styles.section}>
            RÉCENT
          </ZoneText>
          <TouchableOpacity onPress={() => router.push('/(app)/history')} hitSlop={8}>
            <ZoneText variant="caption" color={colors.scoreGreen}>
              Voir tout l'historique →
            </ZoneText>
          </TouchableOpacity>
        </View>
        {recent.length === 0 ? (
          <View style={styles.emptyCard}>
            <ZoneText variant="caption" color={colors.text.muted}>
              Aucune séance terminée pour le moment.
            </ZoneText>
          </View>
        ) : (
          recent.map((s) => {
            const sp = sportOf(s);
            const sportSched: SchedulerSport =
              s.discipline === 'musculation'
                ? 'musculation'
                : s.sport_key === 'running'
                  ? 'running'
                  : 'weightlifting';
            const sets = (s.planned_exercises ?? []).reduce((a, e) => a + e.sets.length, 0);
            return (
              <TouchableOpacity
                key={s.id}
                activeOpacity={0.8}
                onPress={() => router.push(`/(app)/session-preview?id=${s.id}`)}
                style={[styles.recentRow, { borderLeftWidth: 3, borderLeftColor: sportColor(sportSched) }]}
              >
                <ZoneText style={styles.recentIcon}>{sp.icon}</ZoneText>
                <View style={styles.recentMain}>
                  <ZoneText variant="label" color={colors.text.primary}>
                    {sp.label} · {frenchShortDate(s.date)}
                  </ZoneText>
                  <ZoneText variant="caption" color={colors.text.muted}>
                    {s.duration_minutes ? `${s.duration_minutes} min · ` : ''}
                    {sets} séries
                  </ZoneText>
                </View>
                <ChevronRight size={16} color={colors.text.muted} />
              </TouchableOpacity>
            );
          })
        )}

        {/* BIBLIOTHÈQUE */}
        <View style={styles.sectionRow}>
          <ZoneText variant="caption" style={styles.section}>
            BIBLIOTHÈQUE
          </ZoneText>
          <TouchableOpacity onPress={() => router.push('/(app)/library')} hitSlop={8}>
            <ZoneText variant="caption" color={colors.scoreGreen}>
              Voir tout →
            </ZoneText>
          </TouchableOpacity>
        </View>
        <TouchableOpacity activeOpacity={1} onPress={onSearch} style={styles.searchBar}>
          <Search size={16} color={colors.text.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={onSearch}
            placeholder="Rechercher un exercice"
            placeholderTextColor={colors.text.muted}
            style={styles.searchInput}
            returnKeyType="search"
          />
        </TouchableOpacity>
        <View style={styles.pillRow}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.query}
              onPress={() => router.push('/(app)/library')}
              activeOpacity={0.8}
              style={styles.catPill}
            >
              <ZoneText variant="caption" color={colors.text.secondary}>
                {c.label}
              </ZoneText>
            </TouchableOpacity>
          ))}
        </View>
        {QUICK_EXERCISES.map((ex) => (
          <TouchableOpacity
            key={ex.id}
            activeOpacity={0.8}
            onPress={() => router.push(`/(app)/exercise/${ex.id}`)}
            style={styles.exRow}
          >
            <ZoneText variant="label" color={colors.text.primary}>
              {ex.name}
            </ZoneText>
            <ChevronRight size={16} color={colors.text.muted} />
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Recovery sheet — gates launching when ACWR / soreness is elevated. */}
      <Modal visible={pending !== null} transparent animationType="slide" onRequestClose={() => setPending(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            {pending ? (
              <>
                <View style={[styles.warnBar, { backgroundColor: warnColor(pending.warning.level) }]} />
                <ZoneText variant="title" size={20} style={styles.sheetTitle}>
                  {SPORT_LABEL[pending.item.sport as Sport].toUpperCase()}
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

      {/* Preview sheet with LANCER. Tapping the card body opens this so the
          athlete can review the session before committing. */}
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
                <ZoneText variant="caption" color={colors.scoreGreen} style={styles.previewEyebrow}>
                  APERÇU · {SPORT_LABEL[previewItem.sport as Sport].toUpperCase()}
                </ZoneText>
                <ZoneText variant="title" size={20} style={styles.sheetTitle}>
                  {previewItem.name}
                </ZoneText>
                <ZoneText variant="body" color={colors.text.muted} style={styles.previewMeta}>
                  ~{previewItem.estimatedMinutes} min · semaine {previewItem.weekNumber}
                </ZoneText>
                {previewCtx?.phase ? (
                  <View style={styles.previewContext}>
                    <ZoneText variant="caption" color={colors.text.muted} style={styles.previewContextEyebrow}>
                      CONTEXTE
                    </ZoneText>
                    <ZoneText variant="label" color={colors.text.primary} style={styles.previewContextTitle}>
                      Bloc {previewCtx.block} · {previewCtx.phase.name}
                    </ZoneText>
                    <ZoneText variant="caption" color={colors.text.secondary} style={styles.previewContextBody}>
                      {previewCtx.phase.short}
                    </ZoneText>
                    {previewCtx.note ? (
                      <ZoneText variant="caption" color={colors.text.secondary} style={styles.previewContextBody}>
                        {previewCtx.note.name ? `${previewCtx.note.name} — ` : ''}
                        {previewCtx.note.short}
                      </ZoneText>
                    ) : null}
                  </View>
                ) : null}
                {wlPreviewCtx ? (
                  <View style={styles.previewContext}>
                    <ZoneText variant="caption" color={colors.text.muted} style={styles.previewContextEyebrow}>
                      CONTEXTE
                    </ZoneText>
                    <ZoneText variant="label" color={colors.text.primary} style={styles.previewContextTitle}>
                      💪 Bloc {wlPreviewCtx.block} · {wlPreviewCtx.note.name} · Semaine {wlPreviewCtx.week}/4
                    </ZoneText>
                    <ZoneText variant="caption" color={colors.text.secondary} style={styles.previewContextBody}>
                      {wlPreviewCtx.note.short}
                    </ZoneText>
                  </View>
                ) : null}
                {previewItem.sport === 'running' &&
                previewItem.runningSteps &&
                previewItem.runningSteps.length > 0 ? (
                  <View style={styles.previewStructure}>
                    <ZoneText variant="caption" color={colors.text.muted} style={styles.previewContextEyebrow}>
                      STRUCTURE
                    </ZoneText>
                    {previewItem.runningSteps.map((st, i) => {
                      const dur = st.durationSeconds
                        ? `${Math.round(st.durationSeconds / 60)} min`
                        : st.distanceMeters
                          ? `${st.distanceMeters} m`
                          : '';
                      const pace = st.targetPaceSecPerKm
                        ? `${formatPace(st.targetPaceSecPerKm)} · ${formatSpeed(st.targetPaceSecPerKm)}`
                        : '';
                      return (
                        <View key={i} style={styles.structRow}>
                          <ZoneText
                            variant="caption"
                            color={colors.text.primary}
                            style={styles.structLabel}
                            numberOfLines={1}
                          >
                            {st.label}
                          </ZoneText>
                          <ZoneText variant="caption" color={colors.text.secondary} style={styles.structMeta}>
                            {[dur, pace].filter(Boolean).join(' · ')}
                          </ZoneText>
                        </View>
                      );
                    })}
                    <ZoneText variant="caption" color={colors.text.muted} style={styles.structTotal}>
                      DURÉE TOTALE : ~{previewItem.estimatedMinutes} min
                    </ZoneText>
                  </View>
                ) : previewItem.exercises.length > 0 ? (
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
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  screenTitle: { fontSize: 26, letterSpacing: 0.5, marginBottom: 16 },
  section: { fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 1.5, color: colors.text.muted },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 12,
  },
  resumeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.scoreGreen,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  resumeMain: { flex: 1 },
  resumeEyebrow: { fontFamily: 'Inter_700Bold', letterSpacing: 1, opacity: 0.8 },
  resumeTitle: { marginTop: 2 },
  resumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bg.primary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resumeBtnText: { fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  emptyCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 12,
  },
  qCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
  },
  qCardAvailable: { borderColor: colors.scoreGreen },
  qCardDone: { opacity: 0.55 },
  qCardHead: { flexDirection: 'row', alignItems: 'center' },
  qIcon: { fontSize: 16, marginRight: 10 },
  qMain: { flex: 1 },
  urgencyNote: { marginTop: 4, fontFamily: 'Inter_700Bold' },
  qCardColored: { borderRadius: 22, padding: 20, marginBottom: 10 },
  qTitle: { marginBottom: 2 },
  qSubtitle: { marginTop: 4 },
  deloadBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: colors.orbe.amber,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  deloadBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1,
    color: colors.bg.primary,
  },
  previewContext: {
    backgroundColor: colors.bg.elevated,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.scoreGreen,
    padding: 12,
    marginBottom: 14,
  },
  previewContextEyebrow: { letterSpacing: 1.5, fontFamily: 'Inter_700Bold', fontSize: 10 },
  previewContextTitle: { marginTop: 6 },
  previewContextBody: { marginTop: 4, lineHeight: 17 },
  previewStructure: {
    backgroundColor: colors.bg.elevated,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  structRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 8,
  },
  structLabel: { flex: 1 },
  structMeta: { flexShrink: 0 },
  structTotal: { marginTop: 8, fontFamily: 'Inter_700Bold', letterSpacing: 0.3 },
  qActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  qLaunchBtn: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
  qLaunchText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: colors.background },
  qApercuBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: 'center',
  },
  qApercuText: { fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFFFFF' },
  qSkipBtn: { marginTop: 10, alignSelf: 'flex-start', paddingVertical: 6 },
  qSkipText: { fontFamily: 'Inter_500Medium', fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  runningTail: { marginTop: 12 },
  racePill: {
    borderWidth: 1,
    borderColor: colors.scoreGreen,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  racePillText: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  goalLink: { marginTop: 8, paddingVertical: 2 },
  goalLinkText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  addLinks: { marginTop: 12, gap: 8 },
  addLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderStyle: 'dashed',
    paddingVertical: 16,
  },
  addLinkText: { fontFamily: 'Inter_500Medium' },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  recentIcon: { fontSize: 22, marginRight: 12 },
  recentMain: { flex: 1 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    paddingVertical: 0,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 8 },
  catPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.bg.elevated,
  },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg.elevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, overflow: 'hidden' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
  warnBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  sheetTitle: { letterSpacing: 1, marginBottom: 12, color: colors.text.primary },
  sheetBody: { lineHeight: 21, marginBottom: 18 },
  ghostBtn: { alignSelf: 'center', marginTop: 12, paddingVertical: 8 },
  previewEyebrow: { letterSpacing: 2, fontFamily: 'Inter_700Bold', fontSize: 11, marginBottom: 6 },
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
