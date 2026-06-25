import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Lock, Plus } from 'lucide-react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import {
  createPlannedSession,
  createRunSession,
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
  type TrainingSession,
  type UserProgram,
} from '@/lib/firestore';
import { getBlockName } from '@/lib/programEngine';
import type { ProgramBlock } from '@/lib/firestore';
import { createWeightliftingSession } from '@/lib/sessionLaunch';
import {
  buildProgrammeQueue,
  type QueueItem,
  type QueueStatus,
} from '@/lib/programmeQueue';
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

function statusMeta(status: QueueStatus): { icon: string; label: string } {
  switch (status) {
    case 'completed': return { icon: '✅', label: 'FAIT' };
    case 'skipped': return { icon: '⏭️', label: 'PASSÉE' };
    case 'available': return { icon: '▶️', label: '' };
    default: return { icon: '🔒', label: 'ATTEND' };
  }
}

export default function ProgrammeScreen(): React.ReactElement {
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
  const [queueState, setQueueState] = useState<QueueState>({});

  const [previewItem, setPreviewItem] = useState<QueueItem | null>(null);
  const [bonusVisible, setBonusVisible] = useState<boolean>(false);
  const [busy, setBusy] = useState<'bonus' | null>(null);

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
    const [sessions, runs, exMaxes, workload, qstate] = await Promise.all([
      getCompletedSessions(user.uid).catch(() => [] as TrainingSession[]),
      getCompletedRuns(user.uid, 60).catch(() => [] as RunSession[]),
      getExerciseMaxes(user.uid).catch(() => [] as ExerciseMax[]),
      getWorkloadHistory(user.uid, 35).catch(() => []),
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
        // Bonus cardio is a standalone Zone 2 timer that must NEVER touch the
        // programme queue. Send the user to the lightweight bonus-cardio
        // screen instead of creating a planned run.
        router.push('/(app)/bonus-cardio?duration=25');
        return;
      }
      if (runningProfile && option === 'recovery') {
        const paces = calculateVDOTPaces(runningProfile.vdot);
        const level = runningProfile.vdot < 35 ? 'beginner' : runningProfile.vdot < 55 ? 'intermediate' : 'advanced';
        const plan = buildSessionPlan({ type: 'RA', paces, level, block: 1, week: 1, vdot: runningProfile.vdot, paceFactor: runningPaceFactor(recentRunRir) });
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

  const cardSubtitle = useCallback((item: QueueItem): string => {
    if (item.sport === 'weightlifting') {
      const block = (item.block || 1) as ProgramBlock;
      return `Bloc ${block} · ${getBlockName(block)} · Semaine ${Math.min(4, item.week)} · ~${item.estimatedMinutes} min`;
    }
    return `Semaine ${item.week} · ~${item.estimatedMinutes} min`;
  }, []);

  // Group queue items per sport and per display week. Each sport has its own
  // dynamic window inside the queue (week 1 / week 2 of THAT sport's first
  // incomplete week), so the rendering follows: section per sport → section
  // per week → cards inside.
  const sportSections = useMemo(() => {
    const sections: { sport: ScheduleSport; weeks: { weekNumber: number; items: QueueItem[] }[] }[] = [];
    for (const sport of configuredSports) {
      const weeks: { weekNumber: number; items: QueueItem[] }[] = [];
      queueWeeks.forEach((week, wi) => {
        const items = week.filter((it) => it.sport === sport);
        if (items.length > 0) weeks.push({ weekNumber: wi + 1, items });
      });
      if (weeks.length > 0) sections.push({ sport, weeks });
    }
    return sections;
  }, [queueWeeks, configuredSports]);

  return (
    <SafeScreen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ZoneText variant="heading" style={styles.title}>PROGRAMME</ZoneText>
          {program ? (
            <View style={styles.blockBadge}>
              <ZoneText variant="caption" color={colors.bg.primary} style={styles.blockBadgeText}>
                Bloc {program.current_block} · S{Math.min(4, program.current_week)}
              </ZoneText>
            </View>
          ) : null}
        </View>

        {/* Compact Zone strip — small orbe + score + status label. */}
        <View style={styles.zoneStrip}>
          <View style={[styles.zoneStripOrb, { backgroundColor: zoneLevel ? zoneLevel.color : colors.border }]} />
          <ZoneText variant="number" size={18} style={styles.zoneStripScore}>{score ?? '--'}</ZoneText>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.zoneStripStatus}>
            {zoneLevel ? zoneLevel.label : 'Pas de check-in aujourd’hui'}
          </ZoneText>
        </View>

        {raceWeeks !== null ? (
          <ZoneText variant="caption" color={colors.scoreGreen} style={styles.raceLineTop}>
            🏁 Course dans {raceWeeks} semaine{raceWeeks > 1 ? 's' : ''} · pense à alléger en fin de cycle
          </ZoneText>
        ) : null}

        {/* Full queue, grouped by sport, then by display week. The
            "COMMENCER" action lives in the Entraîner tab; here we surface a
            read-only overview with a Passer escape hatch on available items. */}
        {sportSections.length === 0 ? (
          <View style={styles.emptyCard}>
            <ZoneText variant="caption" color={colors.text.muted}>
              Configure un sport dans Entraîner pour voir ton programme.
            </ZoneText>
          </View>
        ) : (
          sportSections.map(({ sport, weeks }) => (
            <View key={sport} style={styles.sportBlock}>
              <View style={styles.sportHeaderRow}>
                <ZoneText style={styles.sportHeaderIcon}>{SPORT_ICON[sport]}</ZoneText>
                <ZoneText style={[styles.sportHeaderLabel, { color: sportColor(sport as SchedulerSport) }]}>
                  {SPORT_LABEL[sport].toUpperCase()}
                </ZoneText>
              </View>
              {weeks.map((week) => (
                <View key={`${sport}-w${week.weekNumber}`} style={styles.weekBlock}>
                  <ZoneText variant="caption" style={styles.weekHeader}>
                    {week.weekNumber === 1 ? 'CETTE SEMAINE' : 'SEMAINE PROCHAINE'}
                  </ZoneText>
                  {week.items.map((item) => {
                    const meta = statusMeta(item.status);
                    const sc = sportColor(item.sport as SchedulerSport);
                    const available = item.status === 'available';
                    const completed = item.status === 'completed';
                    const skipped = item.status === 'skipped';
                    const locked = !available && !completed && !skipped;
                    const done = completed || skipped;
                    return (
                      <View
                        key={item.key}
                        style={[
                          styles.qCardBase,
                          available ? { backgroundColor: sc } : styles.qCardSurface,
                          completed ? { borderLeftWidth: 4, borderLeftColor: colors.scoreGreen } : null,
                          locked ? styles.qCardLocked : null,
                          skipped ? styles.qCardMuted : null,
                        ]}
                      >
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => setPreviewItem(item)}
                        >
                          <View style={styles.qCardHead}>
                            {locked ? (
                              <Lock size={16} color={`${sc}66`} style={styles.qIconLock} />
                            ) : (
                              <ZoneText style={styles.qIcon}>{meta.icon}</ZoneText>
                            )}
                            <View style={styles.qMain}>
                              <ZoneText
                                variant="titleSm"
                                color={available ? '#FFFFFF' : done ? colors.text.muted : colors.text.primary}
                                style={skipped ? styles.qTitleStrike : undefined}
                              >
                                {item.name}
                              </ZoneText>
                              <ZoneText
                                variant="caption"
                                color={available ? 'rgba(255,255,255,0.7)' : colors.text.muted}
                              >
                                {cardSubtitle(item)}
                              </ZoneText>
                            </View>
                            {completed ? (
                              <View style={styles.completedBadge}>
                                <ZoneText style={styles.completedBadgeText}>COMPLÉTÉ</ZoneText>
                              </View>
                            ) : meta.label ? (
                              <ZoneText
                                variant="caption"
                                color={available ? 'rgba(255,255,255,0.85)' : colors.text.muted}
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
                              onPress={() => onSkip(item)}
                              activeOpacity={0.7}
                              style={styles.qSkipFullBtn}
                            >
                              <ZoneText variant="label" size={13} color="#FFFFFF">
                                Passer cette séance
                              </ZoneText>
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          ))
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
              <ZoneText variant="label" color={colors.scoreGreen}>SÉANCE BONUS</ZoneText>
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

      {/* Read-only preview — no LANCER. The launch flow lives in the
          Entraîner tab; this view is purely informational. */}
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
                <ZoneText variant="caption" color={colors.text.muted} style={styles.previewHint}>
                  Tu lances la séance depuis l'onglet Entraîner.
                </ZoneText>
                <TouchableOpacity
                  onPress={() => setPreviewItem(null)}
                  activeOpacity={0.7}
                  style={styles.previewBack}
                >
                  <ZoneText variant="label" color={colors.text.muted}>
                    ← Retour
                  </ZoneText>
                </TouchableOpacity>
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
  blockBadge: { backgroundColor: colors.scoreGreen, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  blockBadgeText: { fontFamily: 'Inter_700Bold', letterSpacing: 0.3 },
  zoneStrip: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, marginBottom: 16 },
  zoneStripOrb: { width: 22, height: 22, borderRadius: 11 },
  zoneStripScore: { color: colors.text.primary },
  zoneStripStatus: { flex: 1 },
  raceLineTop: { marginTop: 2, marginBottom: 16, lineHeight: 16 },
  sportBlock: { marginTop: 8, marginBottom: 16 },
  sportHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sportHeaderIcon: { fontSize: 20 },
  sportHeaderLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    letterSpacing: 1,
  },
  weekBlock: { marginTop: 8 },
  weekHeader: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.text.muted,
    marginBottom: 8,
  },
  qCardBase: { borderRadius: 18, padding: 16, marginBottom: 10 },
  qCardSurface: { backgroundColor: colors.surface },
  qCardLocked: { opacity: 0.5 },
  qCardMuted: { opacity: 0.7 },
  qCardHead: { flexDirection: 'row', alignItems: 'center' },
  qIcon: { fontSize: 16, marginRight: 10 },
  qIconLock: { marginRight: 10 },
  qMain: { flex: 1 },
  qTitleStrike: { textDecorationLine: 'line-through' },
  qStatusLabel: { fontFamily: 'Inter_700Bold', letterSpacing: 0.5, marginLeft: 8 },
  completedBadge: {
    marginLeft: 8,
    backgroundColor: 'rgba(27,202,130,0.15)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  completedBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 0.5,
    color: colors.scoreGreen,
  },
  qActions: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  qSkipFullBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  deloadCard: { marginTop: 16, marginBottom: 4, backgroundColor: colors.bg.card, borderWidth: 1, borderRadius: 16, padding: 16 },
  deloadEyebrow: { letterSpacing: 1, fontSize: 11, fontFamily: 'Inter_700Bold' },
  deloadBody: { marginTop: 8, lineHeight: 19 },
  deloadCta: { marginTop: 14 },
  bonusCard: { marginTop: 16, backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16 },
  bonusSub: { marginTop: 4, lineHeight: 16 },
  bonusBtn: { marginTop: 12, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.scoreGreen, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  emptyCard: { backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 20, alignItems: 'center', marginTop: 16 },
  addLinks: { marginTop: 24, gap: 4, alignItems: 'center' },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  addLinkText: { fontFamily: 'Inter_500Medium' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg.elevated, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, overflow: 'hidden' },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 14 },
  sheetTitle: { letterSpacing: 1, marginBottom: 12, color: colors.text.primary },
  bonusWarn: { backgroundColor: 'rgba(255,183,77,0.10)', borderRadius: 10, padding: 10, marginBottom: 12 },
  bonusOption: { backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, marginBottom: 10 },
  bonusOptDesc: { marginTop: 4, lineHeight: 16 },
  bonusOptBtn: { marginTop: 12, backgroundColor: colors.scoreGreen, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
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
  previewHint: { fontStyle: 'italic', marginBottom: 12 },
  previewBack: { alignSelf: 'center', marginTop: 4, paddingVertical: 8 },
});
