import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { Lock, Minus, Plus, X } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import {
  completeSession,
  getCompletedSessions,
  getExerciseMaxes,
  getSession,
  getUserProfile,
  saveCompletedSet,
  saveExerciseMax,
  todayDateString,
  type CompletedSet,
  type ExerciseMax,
  type Gender,
  type PlannedSet,
  type SessionExercise,
  type TrainingSession,
} from '@/lib/firestore';
import { estimateOneRepMax } from '@/lib/programEngine';
import { getMuscleProfile } from '@/lib/firestore';
import { readCurrentWeek, readProgrammeQueue, recordSessionComplete, startWeek } from '@/lib/weekTracking';
import { usePro } from '@/hooks/usePro';
import { getZoneLevel } from '@/lib/zoneScore';
import { getExerciseById } from '@/data/exercises';
import { useSession, formatRestMS } from '@/context/SessionContext';
import {
  computeHypertrophyScore,
  computePerformanceDecay,
  computeSmartRest,
  estimateVelocityFromRIR,
  hoursSinceLastTrained,
  liveMuscleVolume,
  muscleLabel,
  primaryMusclesFor,
  weeklyBaselineSetsByMuscle,
  type HypertrophyScore,
  type MuscleVolumeLive,
  type PerformanceDecay,
} from '@/lib/muscleSessionScience';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';

const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

const RIR_VALUES = [0, 1, 2, 3, 4, 5] as const;
const FATIGUE_DEBT_HOURS = 48;

interface LoadState {
  loading: boolean;
  session: TrainingSession | null;
  error: string | null;
}

function roundTo2_5(n: number): number {
  return Math.max(0, Math.round(n / 2.5) * 2.5);
}

function parseTargetReps(target: string): number {
  if (!target) return 8;
  if (target.includes('-')) {
    const [a, b] = target.split('-').map((x) => parseInt(x, 10));
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.round((a + b) / 2);
  }
  const n = parseInt(target, 10);
  return Number.isFinite(n) && n > 0 ? n : 8;
}

export default function MuscleSessionScreen(): React.ReactElement {
  const router = useRouter();
  const { isPro } = usePro();
  const params = useLocalSearchParams<{ id: string }>();
  const sessionId = params.id ?? '';
  const { activeSession, startSession, updateSessionProgress, endSession } = useSession();

  const [state, setState] = useState<LoadState>({ loading: true, session: null, error: null });
  const [maxes, setMaxes] = useState<ExerciseMax[]>([]);
  const [gender, setGender] = useState<Gender | null>(null);
  const [history, setHistory] = useState<TrainingSession[]>([]);
  const [completedSets, setCompletedSets] = useState<CompletedSet[]>([]);
  const [actualReps, setActualReps] = useState<number>(8);
  const [actualWeight, setActualWeight] = useState<number>(20);
  const [rir, setRir] = useState<number | null>(null);
  const [gate, setGate] = useState<'pending' | 'open'>('open');
  const [lightMode, setLightMode] = useState<boolean>(false);
  const [summary, setSummary] = useState<HypertrophyScore | null>(null);

  const startedAtRef = useRef<number>(Date.now());
  const ringProgress = useSharedValue(0);

  useEffect(() => {
    if (sessionId) startSession(sessionId);
  }, [sessionId, startSession]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = auth.currentUser;
      if (!user || !sessionId) {
        setState({ loading: false, session: null, error: 'Séance introuvable.' });
        return;
      }
      try {
        const [session, m, completed, profile] = await Promise.all([
          getSession(user.uid, sessionId),
          getExerciseMaxes(user.uid),
          getCompletedSessions(user.uid),
          getUserProfile(user.uid),
        ]);
        if (cancelled) return;
        setGender(profile?.gender ?? null);
        if (!session) {
          setState({ loading: false, session: null, error: 'Séance introuvable.' });
          return;
        }
        setMaxes(m);
        setHistory(completed);
        setCompletedSets(session.completed_sets ?? []);
        const z = session.zone_score_at_start ?? null;
        setGate(z !== null && z < 40 ? 'pending' : 'open');
        setState({ loading: false, session, error: null });
      } catch {
        if (!cancelled) setState({ loading: false, session: null, error: 'Erreur de chargement.' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const zoneScore = state.session?.zone_score_at_start ?? null;
  const zoneLevel = useMemo(() => (zoneScore !== null ? getZoneLevel(zoneScore) : null), [zoneScore]);
  const accentColor = zoneLevel?.color ?? colors.accent.gold;

  // In light mode, trim the final set of each exercise.
  const exercises: SessionExercise[] = useMemo(() => {
    const planned = state.session?.planned_exercises ?? [];
    if (!lightMode) return planned;
    return planned.map((ex) => ({
      ...ex,
      sets: ex.sets.length > 1 ? ex.sets.slice(0, -1) : ex.sets,
    }));
  }, [state.session, lightMode]);

  const totalSets = useMemo(
    () => exercises.reduce((acc, ex) => acc + ex.sets.length, 0),
    [exercises],
  );

  const exerciseIdx = activeSession?.currentExerciseIndex ?? 0;
  const setIdx = activeSession?.currentSetIndex ?? 0;
  const currentExercise: SessionExercise | undefined = exercises[exerciseIdx];
  const currentSet: PlannedSet | undefined = currentExercise?.sets[setIdx];
  const exerciseMeta = currentExercise ? getExerciseById(currentExercise.exercise_id) : undefined;
  const isResting = activeSession?.isResting === true;

  const baselineByMuscle = useMemo(
    () => weeklyBaselineSetsByMuscle(history),
    [history],
  );
  const lastTrainedHours = useMemo(() => hoursSinceLastTrained(history), [history]);

  // Working sets completed in THIS session, per muscle.
  const sessionSetsByMuscle = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of completedSets) {
      if (s.actual_reps <= 0) continue;
      for (const m of primaryMusclesFor(s.exercise_id)) {
        out[m] = (out[m] ?? 0) + 1;
      }
    }
    return out;
  }, [completedSets]);

  useEffect(() => {
    if (!state.session || !activeSession) return;
    updateSessionProgress({
      totalExercises: exercises.length,
      totalSets,
      zoneColor: accentColor,
      currentExerciseName: exerciseMeta?.name ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.session, exerciseMeta?.name, lightMode]);

  // Seed inputs when the cursor moves.
  useEffect(() => {
    if (!currentExercise || !currentSet) return;
    setActualReps(parseTargetReps(currentSet.target_reps));
    setRir(null);
    const seeded = seedWeight(currentExercise.exercise_id, history, maxes);
    setActualWeight(lightMode ? roundTo2_5(seeded * 0.6) : seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseIdx, setIdx, lightMode]);

  // Rest ring animation.
  useEffect(() => {
    if (!isResting || !activeSession) {
      ringProgress.value = 0;
      return;
    }
    const total = activeSession.restTotalSeconds;
    const remaining = activeSession.restSecondsRemaining;
    ringProgress.value = total > 0 ? Math.max(0, Math.min(1, 1 - remaining / total)) : 0;
    if (remaining > 0) {
      ringProgress.value = withTiming(1, { duration: remaining * 1000, easing: Easing.linear });
    } else {
      ringProgress.value = 1;
    }
  }, [isResting, activeSession?.restTotalSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  const firstSetOfCurrent = useMemo(() => {
    if (!currentExercise) return null;
    const first = completedSets.find((s) => s.exercise_id === currentExercise.exercise_id);
    return first ? { reps: first.actual_reps, weight: first.actual_weight_kg } : null;
  }, [completedSets, currentExercise]);

  // Live performance decay preview from the current inputs vs set 1.
  const decay: PerformanceDecay | null = useMemo(() => {
    if (!firstSetOfCurrent || setIdx === 0) return null;
    return computePerformanceDecay(firstSetOfCurrent, { reps: actualReps, weight: actualWeight });
  }, [firstSetOfCurrent, setIdx, actualReps, actualWeight]);

  const velocity = rir !== null ? estimateVelocityFromRIR(rir) : null;

  // Live volume counters for the current exercise's primary muscles.
  const liveVolumes: MuscleVolumeLive[] = useMemo(() => {
    if (!currentExercise) return [];
    return primaryMusclesFor(currentExercise.exercise_id)
      .map((m) => liveMuscleVolume(m, baselineByMuscle[m] ?? 0, sessionSetsByMuscle[m] ?? 0, gender))
      .filter((v): v is MuscleVolumeLive => v !== null);
  }, [currentExercise, baselineByMuscle, sessionSetsByMuscle, gender]);

  const mrvHit = liveVolumes.find((v) => v.reachedMrv) ?? null;

  const fatigueDebt = useMemo(() => {
    if (!currentExercise) return null;
    for (const m of primaryMusclesFor(currentExercise.exercise_id)) {
      const h = lastTrainedHours[m];
      if (h !== undefined && h < FATIGUE_DEBT_HOURS) {
        return { muscle: m, hours: Math.round(h) };
      }
    }
    return null;
  }, [currentExercise, lastTrainedHours]);

  const handleSetDone = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !currentExercise || !currentSet) return;

    const rpe = rir !== null ? Math.max(1, Math.min(10, 10 - rir)) : null;
    const completed: CompletedSet = {
      exercise_id: currentExercise.exercise_id,
      set_number: currentSet.set_number,
      actual_reps: actualReps,
      actual_weight_kg: actualWeight,
      rpe,
      completed_at: null,
    };
    const nextSets = [...completedSets, completed];
    setCompletedSets(nextSets);
    saveCompletedSet(user.uid, sessionId, completed).catch(() => undefined);

    const lastSetOfExercise = setIdx === currentExercise.sets.length - 1;
    const lastExercise = exerciseIdx === exercises.length - 1;
    if (lastSetOfExercise && lastExercise) {
      await finish(nextSets);
      return;
    }

    let nextEx = exerciseIdx;
    let nextSet = setIdx + 1;
    if (lastSetOfExercise) {
      nextEx = exerciseIdx + 1;
      nextSet = 0;
    }
    const nextMeta = exercises[nextEx] ? getExerciseById(exercises[nextEx].exercise_id) : null;
    const base = currentSet.rest_seconds || 90;
    const rest = computeSmartRest({
      baseSeconds: base,
      zoneScore,
      setIndex: setIdx,
      totalSets: currentExercise.sets.length,
      performanceDropPercent: decay?.dropPercent ?? 0,
    });
    updateSessionProgress({
      currentExerciseIndex: nextEx,
      currentSetIndex: nextSet,
      currentExerciseName: nextMeta?.name ?? '',
      setsCompleted: (activeSession?.setsCompleted ?? 0) + 1,
      isResting: true,
      restSecondsRemaining: rest.seconds,
      restTotalSeconds: rest.seconds,
    });
  };

  const skipToNextExercise = (): void => {
    const nextEx = exerciseIdx + 1;
    if (nextEx >= exercises.length) {
      void finish(completedSets);
      return;
    }
    const nextMeta = getExerciseById(exercises[nextEx].exercise_id);
    updateSessionProgress({
      currentExerciseIndex: nextEx,
      currentSetIndex: 0,
      currentExerciseName: nextMeta?.name ?? '',
      isResting: false,
      restSecondsRemaining: 0,
    });
  };

  const finish = async (allSets: CompletedSet[]): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !state.session) return;
    const duration = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 60000));
    const volume = allSets.reduce((acc, s) => acc + s.actual_weight_kg * s.actual_reps, 0);
    updateSessionProgress({ isResting: false, restSecondsRemaining: 0 });

    const score = computeHypertrophyScore({
      sets: allSets.map((s) => ({
        exerciseId: s.exercise_id,
        reps: s.actual_reps,
        weight: s.actual_weight_kg,
        rir: s.rpe !== null && s.rpe !== undefined ? 10 - s.rpe : null,
      })),
      baselineWeeklySetsByMuscle: baselineByMuscle,
      zoneScore,
      gender,
    });
    setSummary(score);

    try {
      await completeSession(user.uid, sessionId, {
        duration_minutes: duration,
        total_volume_kg: Math.round(volume),
      });
      await reconcileMaxes(user.uid, allSets, maxes);
    } catch {
      // surfaced via summary
    }
    try {
      const profile = await getMuscleProfile(user.uid);
      const queue = await readProgrammeQueue(user.uid);
      const week = readCurrentWeek(queue, 'musculation');
      const sessionsPerWeek = profile?.sessions_per_week ?? 3;
      const setsByMuscle: Record<string, number> = {};
      for (const set of allSets) {
        const muscles = primaryMusclesFor(set.exercise_id);
        for (const m of muscles) setsByMuscle[m] = (setsByMuscle[m] ?? 0) + 1;
      }
      await startWeek(user.uid, 'musculation', week, { sessions: sessionsPerWeek });
      await recordSessionComplete(user.uid, 'musculation', week, {
        muscleSets: setsByMuscle,
      });
    } catch {
      // tracking is best effort
    }
  };

  const onClose = (): void => {
    endSession();
    router.replace('/(app)/(tabs)/program');
  };

  if (state.loading) {
    return (
      <SafeScreen>
        <View style={styles.center}>
          <ZoneText variant="body" color={colors.text.muted}>
            Chargement en cours
          </ZoneText>
        </View>
      </SafeScreen>
    );
  }

  if (state.error || !state.session || !currentExercise || !currentSet) {
    return (
      <SafeScreen>
        <View style={styles.center}>
          <ZoneText variant="heading" style={styles.errorTitle}>
            {state.error ?? 'Séance introuvable'}
          </ZoneText>
          <View style={styles.errorAction}>
            <Button title="Retour" onPress={() => router.back()} />
          </View>
        </View>
      </SafeScreen>
    );
  }

  if (summary) {
    return <SummaryView score={summary} onClose={onClose} />;
  }

  if (gate === 'pending') {
    return (
      <ZoneGateView
        zoneScore={zoneScore ?? 0}
        onContinue={() => setGate('open')}
        onLight={() => {
          setLightMode(true);
          setGate('open');
        }}
        onCancel={() => router.back()}
      />
    );
  }

  return (
    <SafeScreen edges={['top', 'left', 'right']}>
      <View style={[styles.zoneStrip, { backgroundColor: accentColor }]}>
        <ZoneText variant="caption" numberOfLines={2} style={styles.zoneStripText}>
          {lightMode ? 'SÉANCE LÉGÈRE · 60 % charge, sans échec' : state.session.zone_message ?? 'En route.'}
        </ZoneText>
        <View style={[styles.proBadge, { borderColor: isPro ? colors.accent.gold : colors.bg.primary }]}>
          <ZoneText style={[styles.proBadgeText, { color: isPro ? colors.accent.gold : colors.bg.primary }]}>
            {isPro ? 'PRO' : 'FREE'}
          </ZoneText>
        </View>
      </View>

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={16} style={styles.closeBtn}>
          <X size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <ZoneText variant="caption" color={colors.text.muted}>
          Exercice {exerciseIdx + 1}/{exercises.length}
        </ZoneText>
      </View>

      {isResting ? (
        <RestView
          accentColor={accentColor}
          remaining={activeSession?.restSecondsRemaining ?? 0}
          total={activeSession?.restTotalSeconds ?? 0}
          ringProgress={ringProgress}
          isPro={isPro}
          onSkip={() => updateSessionProgress({ isResting: false, restSecondsRemaining: 0 })}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.exerciseNameRow}>
            <ZoneText variant="heading" style={styles.exerciseName}>
              {(exerciseMeta?.name ?? currentExercise.exercise_id).toUpperCase()}
            </ZoneText>
            {liveVolumes[0] ? <SRADot color={liveVolumes[0].zone.color} /> : null}
          </View>
          <ZoneText variant="caption" color={colors.text.muted}>
            Série {setIdx + 1}/{currentExercise.sets.length} · cible {currentSet.target_reps} reps
            {currentSet.target_rpe ? ` · RPE ${currentSet.target_rpe}` : ''}
          </ZoneText>

          {fatigueDebt ? (
            <View style={[styles.banner, { borderLeftColor: colors.orbe.amber }]}>
              <ZoneText variant="caption" style={styles.bannerStrong}>
                {muscleLabel(fatigueDebt.muscle)} entraîné il y a {fatigueDebt.hours}h
              </ZoneText>
              {isPro ? (
                <ZoneText variant="caption" color={colors.text.secondary} style={styles.bannerBody}>
                  Stimulus possible mais récupération incomplète. Suggéré : -1 série, arrête à RIR 2 minimum.
                </ZoneText>
              ) : (
                <LockedHint />
              )}
            </View>
          ) : null}

          {mrvHit ? (
            <View style={[styles.banner, { borderLeftColor: colors.orbe.red, backgroundColor: 'rgba(229,115,115,0.08)' }]}>
              <ZoneText variant="caption" style={[styles.bannerStrong, { color: colors.orbe.red }]}>
                Volume maximum atteint · {muscleLabel(mrvHit.muscle)}
              </ZoneText>
              {isPro ? (
                <ZoneText variant="caption" color={colors.text.secondary} style={styles.bannerBody}>
                  Continuer ne génèrera plus de croissance aujourd’hui, uniquement de la fatigue.
                </ZoneText>
              ) : (
                <LockedHint />
              )}
              <TouchableOpacity onPress={skipToNextExercise} style={styles.skipExerciseBtn} activeOpacity={0.8}>
                <ZoneText variant="caption" color={colors.orbe.red} style={{ fontFamily: 'Inter-Bold' }}>
                  Passer au groupe suivant
                </ZoneText>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.inputCard}>
            <Stepper label="POIDS (kg)" value={actualWeight} step={2.5} onChange={(n) => setActualWeight(Math.max(0, n))} />
            <Stepper label="REPS RÉALISÉES" value={actualReps} step={1} onChange={(n) => setActualReps(Math.max(0, n))} />
            <View style={styles.rirRow}>
              <ZoneText variant="caption" color={colors.text.muted} style={styles.rirLabel}>
                RIR (reps en réserve)
              </ZoneText>
              <View style={styles.rirScale}>
                {RIR_VALUES.map((n) => {
                  const active = rir === n;
                  return (
                    <TouchableOpacity
                      key={n}
                      onPress={() => setRir(n)}
                      activeOpacity={0.8}
                      style={[
                        styles.rirCell,
                        {
                          backgroundColor: active ? colors.accent.gold : colors.bg.card,
                          borderColor: active ? colors.accent.gold : colors.border,
                        },
                      ]}
                    >
                      <ZoneText style={{ color: active ? colors.bg.primary : colors.text.secondary, fontFamily: 'Inter-Bold', fontSize: 13 }}>
                        {n}
                      </ZoneText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {velocity ? (
            <View style={styles.feedbackCard}>
              <View style={styles.feedbackRow}>
                <ZoneText variant="caption" color={colors.text.muted}>
                  VÉLOCITÉ ESTIMÉE
                </ZoneText>
                <ZoneText
                  variant="label"
                  color={velocity.inOptimalZone ? colors.orbe.green : velocity.tooLight ? colors.orbe.amber : colors.accent.gold}
                >
                  {velocity.label}
                </ZoneText>
              </View>
              {isPro ? (
                <ZoneText variant="caption" color={colors.text.secondary} style={styles.feedbackBody}>
                  {velocity.message}
                </ZoneText>
              ) : (
                <LockedHint />
              )}
            </View>
          ) : null}

          {decay && decay.severity !== 'ok' ? (
            <View
              style={[
                styles.feedbackCard,
                { borderColor: decay.severity === 'red' ? colors.orbe.red : colors.orbe.amber },
              ]}
            >
              <View style={styles.feedbackRow}>
                <ZoneText variant="caption" color={colors.text.muted}>
                  PERF. VS SÉRIE 1
                </ZoneText>
                <ZoneText
                  variant="label"
                  color={decay.severity === 'red' ? colors.orbe.red : colors.orbe.amber}
                >
                  −{decay.dropPercent}%
                </ZoneText>
              </View>
              {isPro ? (
                <ZoneText variant="caption" color={colors.text.secondary} style={styles.feedbackBody}>
                  {decay.message}
                </ZoneText>
              ) : (
                <LockedHint />
              )}
            </View>
          ) : null}

          {liveVolumes.length > 0 ? (
            <View style={styles.volumeCard}>
              <ZoneText variant="caption" color={colors.text.muted} style={styles.volumeTitle}>
                VOLUME HEBDO · MEV / MAV / MRV
              </ZoneText>
              {liveVolumes.map((v) => (
                <VolumeRow key={v.muscle} v={v} />
              ))}
            </View>
          ) : null}

          <View style={styles.workFooter}>
            <Button title="Série terminée" onPress={handleSetDone} />
          </View>
        </ScrollView>
      )}
    </SafeScreen>
  );
}

function seedWeight(exerciseId: string, history: TrainingSession[], maxes: ExerciseMax[]): number {
  for (const s of history) {
    const sets = (s.completed_sets ?? []).filter((c) => c.exercise_id === exerciseId && c.actual_weight_kg > 0);
    if (sets.length > 0) return roundTo2_5(sets[sets.length - 1].actual_weight_kg);
  }
  const max = maxes.find((m) => m.exercise_id === exerciseId);
  if (max && max.estimated_1rm > 0) return roundTo2_5(max.estimated_1rm * 0.65);
  return 20;
}

async function reconcileMaxes(uid: string, sets: CompletedSet[], maxes: ExerciseMax[]): Promise<void> {
  const best = new Map<string, { weight: number; reps: number; est: number }>();
  for (const s of sets) {
    if (s.actual_weight_kg <= 0 || s.actual_reps <= 0) continue;
    const est = estimateOneRepMax(s.actual_weight_kg, s.actual_reps);
    const cur = best.get(s.exercise_id);
    if (!cur || est > cur.est) best.set(s.exercise_id, { weight: s.actual_weight_kg, reps: s.actual_reps, est });
  }
  for (const [exerciseId, b] of best) {
    const existing = maxes.find((m) => m.exercise_id === exerciseId);
    const previous = existing?.estimated_1rm ?? 0;
    if (existing && b.est <= previous) continue;
    await saveExerciseMax(uid, {
      exercise_id: exerciseId,
      weight_kg: b.weight,
      reps: b.reps,
      estimated_1rm: b.est,
      date: todayDateString(),
      is_pr: b.est > previous,
    }).catch(() => undefined);
  }
}

function LockedHint(): React.ReactElement {
  return (
    <View style={styles.lockedRow}>
      <Lock size={11} color={colors.accent.gold} />
      <ZoneText variant="caption" color={colors.accent.gold} style={styles.lockedText}>
        Coaching Pro
      </ZoneText>
    </View>
  );
}

function SRADot({ color }: { color: string }): React.ReactElement {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withTiming(0.4, { duration: 800, easing: Easing.inOut(Easing.ease) });
    const id = setInterval(() => {
      pulse.value = pulse.value > 0.7 ? withTiming(0.4, { duration: 800 }) : withTiming(1, { duration: 800 });
    }, 850);
    return () => clearInterval(id);
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[styles.sraDot, { backgroundColor: color }, style]} />;
}

function VolumeRow({ v }: { v: MuscleVolumeLive }): React.ReactElement {
  return (
    <View style={styles.volRow}>
      <ZoneText variant="caption" color={colors.text.primary} style={styles.volMuscle}>
        {v.label}
      </ZoneText>
      <View style={styles.volBarTrack}>
        <View style={[styles.volBarFill, { width: `${Math.round(v.fill * 100)}%`, backgroundColor: v.zone.color }]} />
      </View>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.volCount}>
        {v.sets}/{v.mrv} · {v.phaseLabel}
      </ZoneText>
    </View>
  );
}

function Stepper({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (n: number) => void;
}): React.ReactElement {
  return (
    <View style={styles.stepperRow}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.stepperLabel}>
        {label}
      </ZoneText>
      <View style={styles.stepperControl}>
        <TouchableOpacity onPress={() => onChange(+(value - step).toFixed(2))} hitSlop={12} style={styles.stepperBtn}>
          <Minus size={18} color={colors.accent.gold} />
        </TouchableOpacity>
        <ZoneText variant="heading" style={styles.stepperValue}>
          {Number.isInteger(value) ? value : value.toFixed(1)}
        </ZoneText>
        <TouchableOpacity onPress={() => onChange(+(value + step).toFixed(2))} hitSlop={12} style={styles.stepperBtn}>
          <Plus size={18} color={colors.accent.gold} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ZoneGateView({
  zoneScore,
  onContinue,
  onLight,
  onCancel,
}: {
  zoneScore: number;
  onContinue: () => void;
  onLight: () => void;
  onCancel: () => void;
}): React.ReactElement {
  return (
    <SafeScreen>
      <View style={styles.gateWrap}>
        <TouchableOpacity onPress={onCancel} hitSlop={16} style={styles.closeBtn}>
          <X size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.gateCard}>
          <ZoneText variant="caption" color={colors.orbe.red} style={styles.gateEyebrow}>
            ZONE {zoneScore} · ÉPUISÉ
          </ZoneText>
          <ZoneText variant="heading" style={styles.gateTitle}>
            Récupération insuffisante
          </ZoneText>
          <ZoneText variant="body" color={colors.text.secondary} style={styles.gateBody}>
            Ton score Zone indique une récupération insuffisante. La séance d’aujourd’hui risque
            d’augmenter ta fatigue chronique sans générer de stimulus utile. Recommandation :
            séance de récupération active ou repos.
          </ZoneText>
          <View style={styles.gateActions}>
            <Button title="Séance légère" onPress={onLight} />
            <View style={{ height: 10 }} />
            <Button title="Continuer quand même" variant="secondary" onPress={onContinue} />
          </View>
        </View>
      </View>
    </SafeScreen>
  );
}

function RestView({
  accentColor,
  remaining,
  total,
  ringProgress,
  isPro,
  onSkip,
}: {
  accentColor: string;
  remaining: number;
  total: number;
  ringProgress: ReturnType<typeof useSharedValue<number>>;
  isPro: boolean;
  onSkip: () => void;
}): React.ReactElement {
  const size = 220;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: circumference * ringProgress.value }));
  return (
    <View style={styles.restWrap}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.restEyebrow}>
        REPOS
      </ZoneText>
      <View style={styles.ringWrap}>
        <Svg width={size} height={size}>
          <SvgCircle cx={size / 2} cy={size / 2} r={radius} stroke={colors.border} strokeWidth={stroke} fill="none" />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={accentColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            animatedProps={ringProps}
            fill="none"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <View style={styles.ringContent}>
          <ZoneText variant="heading" style={[styles.ringValue, { color: accentColor }]}>
            {formatRestMS(remaining)}
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.muted}>
            sur {total}s
          </ZoneText>
        </View>
      </View>
      <ZoneText variant="caption" color={isPro ? colors.text.secondary : colors.text.muted} style={styles.restNote}>
        {isPro ? 'Repos calculé selon ta fatigue et ton état Zone' : 'Repos standard'}
      </ZoneText>
      <TouchableOpacity onPress={onSkip} activeOpacity={0.85} style={styles.restSkip}>
        <ZoneText style={styles.restSkipText}>PASSER</ZoneText>
      </TouchableOpacity>
    </View>
  );
}

function SummaryView({ score, onClose }: { score: HypertrophyScore; onClose: () => void }): React.ReactElement {
  return (
    <SafeScreen>
      <ScrollView contentContainerStyle={styles.summaryScroll} showsVerticalScrollIndicator={false}>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.summaryEyebrow}>
          SCORE HYPERTROPHIE
        </ZoneText>
        <ZoneText variant="heading" style={[styles.summaryScore, { color: score.color }]}>
          {score.score}
        </ZoneText>
        <ZoneText variant="label" style={{ color: score.color, letterSpacing: 2 }}>
          {score.grade}
        </ZoneText>
        <View style={styles.summaryCard}>
          {score.components.map((c) => (
            <View key={c.label} style={styles.compRow}>
              <ZoneText variant="caption" color={colors.text.secondary} style={styles.compLabel}>
                {c.label}
              </ZoneText>
              <View style={styles.compBarTrack}>
                <View
                  style={[styles.compBarFill, { width: `${Math.round((c.earned / c.max) * 100)}%`, backgroundColor: score.color }]}
                />
              </View>
              <ZoneText variant="caption" color={colors.text.primary} style={styles.compValue}>
                {c.earned}/{c.max}
              </ZoneText>
            </View>
          ))}
        </View>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.refs}>
          Israetel (2019) · Schoenfeld (2016) · Gonzalez-Badillo (2014) · Loenneke (2014)
        </ZoneText>
      </ScrollView>
      <View style={styles.summaryFooter}>
        <Button title="Retour au programme" onPress={onClose} />
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorTitle: { fontSize: 22, color: colors.text.muted, textAlign: 'center' },
  errorAction: { marginTop: 24, alignSelf: 'stretch' },
  zoneStrip: { paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  zoneStripText: { flex: 1, color: colors.bg.primary, fontFamily: 'Inter-Bold', fontSize: 12, letterSpacing: 0.3 },
  proBadge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3, marginLeft: 8 },
  proBadgeText: { fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1 },
  headerRow: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  exerciseNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  exerciseName: { fontSize: 24, letterSpacing: 1, color: colors.text.primary },
  sraDot: { width: 12, height: 12, borderRadius: 6 },
  banner: { marginTop: 14, padding: 12, borderRadius: 12, borderLeftWidth: 3, backgroundColor: colors.bg.card },
  bannerStrong: { fontFamily: 'Inter-Bold', color: colors.text.primary, fontSize: 12 },
  bannerBody: { marginTop: 4, lineHeight: 16 },
  skipExerciseBtn: { marginTop: 10, alignSelf: 'flex-start' },
  inputCard: { marginTop: 16, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  stepperLabel: { letterSpacing: 1, fontSize: 11 },
  stepperControl: { flexDirection: 'row', alignItems: 'center' },
  stepperBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { fontSize: 24, color: colors.text.primary, minWidth: 70, textAlign: 'center', lineHeight: 28 },
  rirRow: { marginTop: 10 },
  rirLabel: { letterSpacing: 1, fontSize: 11, marginBottom: 6 },
  rirScale: { flexDirection: 'row', justifyContent: 'space-between' },
  rirCell: { flex: 1, height: 36, marginHorizontal: 2, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  feedbackCard: { marginTop: 12, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14 },
  feedbackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  feedbackBody: { marginTop: 6, lineHeight: 16 },
  volumeCard: { marginTop: 12, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14 },
  volumeTitle: { letterSpacing: 1, fontSize: 10, marginBottom: 10 },
  volRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 4 },
  volMuscle: { width: 84, fontSize: 12 },
  volBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.bg.elevated, overflow: 'hidden', marginHorizontal: 8 },
  volBarFill: { height: 8, borderRadius: 4 },
  volCount: { width: 118, textAlign: 'right', fontSize: 10 },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  lockedText: { fontFamily: 'Inter-Bold', fontSize: 11, letterSpacing: 0.5 },
  workFooter: { marginTop: 22 },
  restWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  restEyebrow: { letterSpacing: 3, fontFamily: 'Inter-Bold', marginBottom: 16 },
  ringWrap: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
  ringContent: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringValue: { fontSize: 56, lineHeight: 60 },
  restNote: { textAlign: 'center', marginTop: 18, marginHorizontal: 20, lineHeight: 16 },
  restSkip: { marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.accent.gold, borderRadius: 12 },
  restSkipText: { color: colors.bg.primary, fontFamily: 'Inter-Bold', letterSpacing: 1 },
  gateWrap: { flex: 1, padding: 20 },
  gateCard: { marginTop: 12, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.orbe.red, borderRadius: 16, padding: 20 },
  gateEyebrow: { letterSpacing: 2, fontFamily: 'Inter-Bold' },
  gateTitle: { fontSize: 26, color: colors.text.primary, marginTop: 8 },
  gateBody: { marginTop: 12, lineHeight: 20 },
  gateActions: { marginTop: 22 },
  summaryScroll: { padding: 24, alignItems: 'center' },
  summaryEyebrow: { letterSpacing: 2, marginTop: 24 },
  summaryScore: { fontSize: 80, lineHeight: 84, marginTop: 4 },
  summaryCard: { alignSelf: 'stretch', marginTop: 28, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 16 },
  compRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
  compLabel: { width: 120, fontSize: 11 },
  compBarTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.bg.elevated, overflow: 'hidden', marginHorizontal: 8 },
  compBarFill: { height: 8, borderRadius: 4 },
  compValue: { width: 44, textAlign: 'right', fontSize: 11, fontFamily: 'Inter-Bold' },
  refs: { marginTop: 24, textAlign: 'center', fontSize: 10, lineHeight: 15 },
  summaryFooter: { padding: 24, paddingTop: 8 },
});
