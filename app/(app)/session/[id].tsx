import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { Minus, Plus, X } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import {
  completeSession,
  countCompletedSessionsSince,
  getExerciseMaxes,
  getSession,
  getUserProgram,
  saveCompletedSet,
  saveExerciseMax,
  saveUserProgram,
  todayDateString,
  type CompletedSet,
  type ExerciseMax,
  type PlannedSet,
  type SessionExercise,
  type TrainingSession,
  type UserProgram,
} from '@/lib/firestore';
import { checkAndAdvanceProgram, computeRestSeconds, estimateOneRepMax } from '@/lib/programEngine';
import { getZoneLevel } from '@/lib/zoneScore';
import { getExerciseById } from '@/data/exercises';
import { useSession, formatRestMS } from '@/context/SessionContext';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';

const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

interface ResultPR {
  exercise_id: string;
  previous: number;
  next: number;
}

interface SessionState {
  loading: boolean;
  session: TrainingSession | null;
  error: string | null;
}

interface SessionSummary {
  duration: number;
  volume: number;
  prs: ResultPR[];
}

export default function SessionScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const sessionId = params.id ?? '';
  const { activeSession, startSession, updateSessionProgress, endSession } = useSession();

  const [state, setState] = useState<SessionState>({ loading: true, session: null, error: null });
  const [maxes, setMaxes] = useState<ExerciseMax[]>([]);
  const [program, setProgram] = useState<UserProgram | null>(null);
  const [actualReps, setActualReps] = useState<number>(0);
  const [actualWeight, setActualWeight] = useState<number>(0);
  const [setRpe, setSetRpe] = useState<number | null>(null);
  const [completedSets, setCompletedSets] = useState<CompletedSet[]>([]);
  const [pr, setPr] = useState<ResultPR | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const ringProgress = useSharedValue(0);
  const prsRef = useRef<ResultPR[]>([]);

  // Register session with context on mount (idempotent across remounts)
  useEffect(() => {
    if (sessionId) startSession(sessionId);
  }, [sessionId, startSession]);

  // Load session document + maxes + program from Firestore
  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      const user = auth.currentUser;
      if (!user || !sessionId) {
        setState({ loading: false, session: null, error: 'Session introuvable.' });
        return;
      }
      try {
        const [session, m, p] = await Promise.all([
          getSession(user.uid, sessionId),
          getExerciseMaxes(user.uid),
          getUserProgram(user.uid),
        ]);
        if (cancelled) return;
        if (!session) {
          setState({ loading: false, session: null, error: 'Session introuvable.' });
          return;
        }
        setMaxes(m);
        setProgram(p);
        setState({ loading: false, session, error: null });
        setCompletedSets(session.completed_sets ?? []);
      } catch {
        if (!cancelled) setState({ loading: false, session: null, error: 'Erreur de chargement.' });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const exercises: SessionExercise[] = state.session?.planned_exercises ?? [];
  const totalSetsCount = useMemo(
    () => exercises.reduce((acc, ex) => acc + ex.sets.length, 0),
    [exercises],
  );
  const zoneScore = state.session?.zone_score_at_start ?? null;
  const zoneLevel = useMemo(() => (zoneScore !== null ? getZoneLevel(zoneScore) : null), [zoneScore]);
  const accentColor = zoneLevel?.color ?? colors.accent.gold;

  const exerciseIdx = activeSession?.currentExerciseIndex ?? 0;
  const setIdx = activeSession?.currentSetIndex ?? 0;
  const currentExercise: SessionExercise | undefined = exercises[exerciseIdx];
  const currentSet: PlannedSet | undefined = currentExercise?.sets[setIdx];
  const exerciseMeta = currentExercise ? getExerciseById(currentExercise.exercise_id) : undefined;
  const isResting = activeSession?.isResting === true;

  // Push session metadata into context once loaded
  useEffect(() => {
    if (!state.session || !activeSession) return;
    updateSessionProgress({
      totalExercises: exercises.length,
      totalSets: totalSetsCount,
      zoneColor: accentColor,
      currentExerciseName: exerciseMeta?.name ?? '',
    });
    // intentional: only run when the loaded session document changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.session, exerciseMeta?.name]);

  // Initialize input targets when cursor moves
  useEffect(() => {
    if (!currentSet) return;
    setActualWeight((prev) =>
      currentSet.target_weight_kg !== null && currentSet.target_weight_kg !== undefined
        ? currentSet.target_weight_kg
        : prev,
    );
    setActualReps(parseTargetReps(currentSet.target_reps));
    setSetRpe(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseIdx, setIdx]);

  // Animate the rest ring whenever rest state changes
  useEffect(() => {
    if (!isResting || !activeSession) {
      ringProgress.value = 0;
      return;
    }
    const total = activeSession.restTotalSeconds;
    const remaining = activeSession.restSecondsRemaining;
    const startProgress = total > 0 ? Math.max(0, Math.min(1, 1 - remaining / total)) : 0;
    ringProgress.value = startProgress;
    if (remaining > 0) {
      ringProgress.value = withTiming(1, {
        duration: remaining * 1000,
        easing: Easing.linear,
      });
    } else {
      ringProgress.value = 1;
    }
  }, [isResting, activeSession?.restTotalSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetDone = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !state.session || !currentExercise || !currentSet) return;

    const completed: CompletedSet = {
      exercise_id: currentExercise.exercise_id,
      set_number: currentSet.set_number,
      actual_reps: actualReps,
      actual_weight_kg: actualWeight,
      rpe: setRpe,
      completed_at: null,
    };
    setCompletedSets((c) => [...c, completed]);
    saveCompletedSet(user.uid, sessionId, completed).catch(() => undefined);

    const detected = await detectAndApplyPR(
      user.uid,
      currentExercise.exercise_id,
      actualWeight,
      actualReps,
      maxes,
    );
    if (detected) {
      setPr(detected);
      prsRef.current = [...prsRef.current, detected];
      setMaxes((current) => {
        const next = current.filter((m) => m.exercise_id !== detected.exercise_id);
        return [
          ...next,
          {
            exercise_id: detected.exercise_id,
            weight_kg: actualWeight,
            reps: actualReps,
            estimated_1rm: detected.next,
            date: todayDateString(),
            is_pr: true,
          },
        ];
      });
      setTimeout(() => setPr(null), 2000);
    }

    const lastSetOfExercise = setIdx === currentExercise.sets.length - 1;
    const lastExercise = exerciseIdx === exercises.length - 1;

    if (lastSetOfExercise && lastExercise) {
      await finish();
      return;
    }

    let nextEx = exerciseIdx;
    let nextSet = setIdx + 1;
    if (lastSetOfExercise) {
      nextEx = exerciseIdx + 1;
      nextSet = 0;
    }
    const nextExerciseMeta = exercises[nextEx]
      ? getExerciseById(exercises[nextEx].exercise_id)
      : null;
    const rest = computeRestSeconds(currentExercise.exercise_id, { zoneScore, rpe: setRpe });
    const completedCount = (activeSession?.setsCompleted ?? 0) + 1;

    updateSessionProgress({
      currentExerciseIndex: nextEx,
      currentSetIndex: nextSet,
      currentExerciseName: nextExerciseMeta?.name ?? '',
      setsCompleted: completedCount,
      isResting: true,
      restSecondsRemaining: rest,
      restTotalSeconds: rest,
    });
  };

  const handleSkipRest = (): void => {
    updateSessionProgress({ isResting: false, restSecondsRemaining: 0 });
  };

  const handleAdjustRest = (delta: number): void => {
    if (!activeSession) return;
    const next = Math.max(10, activeSession.restSecondsRemaining + delta);
    updateSessionProgress({ restSecondsRemaining: next, restTotalSeconds: next });
  };

  const finish = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !state.session) return;
    const duration = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 60000));
    const allSets = [...completedSets];
    const volume = computeVolume(allSets);
    setSummary({ duration, volume, prs: prsRef.current });

    updateSessionProgress({ isResting: false, restSecondsRemaining: 0 });

    try {
      await completeSession(user.uid, sessionId, {
        duration_minutes: duration,
        total_volume_kg: volume,
      });
      if (program) {
        const completedSince = await countCompletedSessionsSince(user.uid, program.mesocycle_start);
        const sortedSessions: TrainingSession[] = Array.from(
          { length: completedSince },
          () => ({ id: '', date: '', sport_key: 'weightlifting', status: 'completed', created_at: null }),
        );
        const advanced = checkAndAdvanceProgram(program, sortedSessions);
        await saveUserProgram(user.uid, advanced);
      }
    } catch {
      // surfaced via summary; user can retry navigating
    }
  };

  const onReturnToDashboard = (): void => {
    endSession();
    router.replace('/(app)/');
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
            {state.error ?? 'Session introuvable'}
          </ZoneText>
          <View style={styles.errorAction}>
            <Button title="Retour" onPress={() => router.back()} />
          </View>
        </View>
      </SafeScreen>
    );
  }

  if (summary) {
    return (
      <SummaryView
        accentColor={accentColor}
        zoneScore={zoneScore}
        zoneLabel={zoneLevel?.label ?? '-'}
        duration={summary.duration}
        volume={summary.volume}
        prs={summary.prs}
        completedSets={completedSets}
        onClose={onReturnToDashboard}
      />
    );
  }

  const totalSets = currentExercise.sets.length;

  return (
    <SafeScreen edges={['top', 'left', 'right']}>
      {pr ? <PRFlash pr={pr} /> : null}
      <View
        style={[styles.zoneStrip, { backgroundColor: zoneLevel ? zoneLevel.color : colors.bg.elevated }]}
      >
        <ZoneText variant="caption" numberOfLines={2} style={styles.zoneStripText}>
          {state.session.zone_message ?? 'En route.'}
        </ZoneText>
        {zoneScore !== null ? (
          <View style={styles.zoneScoreBubble}>
            <ZoneText style={styles.zoneScoreText}>{zoneScore}</ZoneText>
          </View>
        ) : null}
      </View>

      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Quitter la séance et revenir en arrière"
          style={styles.closeBtn}
        >
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
          cue={exerciseMeta?.cues[0] ?? null}
          onSkip={handleSkipRest}
          onAdjust={handleAdjustRest}
        />
      ) : (
        <WorkView
          exerciseName={exerciseMeta?.name.toUpperCase() ?? currentExercise.exercise_id}
          setIdx={setIdx}
          totalSets={totalSets}
          plannedSet={currentSet}
          actualReps={actualReps}
          actualWeight={actualWeight}
          setRpe={setRpe}
          onChangeReps={setActualReps}
          onChangeWeight={setActualWeight}
          onChangeRpe={setSetRpe}
          onDone={handleSetDone}
        />
      )}
    </SafeScreen>
  );
}

function parseTargetReps(target: string): number {
  if (!target) return 1;
  if (target.includes('s')) return 1;
  if (target.includes('-')) {
    const [a, b] = target.split('-').map((x) => parseInt(x, 10));
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.round((a + b) / 2);
  }
  const n = parseInt(target, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function computeVolume(sets: CompletedSet[]): number {
  let total = 0;
  for (const s of sets) total += s.actual_weight_kg * s.actual_reps;
  return Math.round(total);
}

async function detectAndApplyPR(
  uid: string,
  exerciseId: string,
  weight: number,
  reps: number,
  maxes: ExerciseMax[],
): Promise<ResultPR | null> {
  if (weight <= 0 || reps <= 0) return null;
  const newEstimate = estimateOneRepMax(weight, reps);
  const existing = maxes.find((m) => m.exercise_id === exerciseId);
  const previous = existing?.estimated_1rm ?? 0;
  if (newEstimate <= previous) return null;
  await saveExerciseMax(uid, {
    exercise_id: exerciseId,
    weight_kg: weight,
    reps,
    estimated_1rm: newEstimate,
    date: todayDateString(),
    is_pr: true,
  });
  return { exercise_id: exerciseId, previous, next: newEstimate };
}

function PRFlash({ pr }: { pr: ResultPR }): React.ReactElement {
  const exercise = getExerciseById(pr.exercise_id);
  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(150)}
      pointerEvents="none"
      style={styles.prOverlay}
    >
      <ZoneText variant="heading" style={styles.prTitle}>
        🏆 NOUVEAU PR !
      </ZoneText>
      <ZoneText variant="body" color={colors.text.primary} style={styles.prExercise}>
        {exercise?.name ?? pr.exercise_id}
      </ZoneText>
      <View style={styles.prRow}>
        <ZoneText variant="caption" color={colors.text.muted}>
          Ancien {pr.previous} kg
        </ZoneText>
        <ZoneText variant="caption" color={colors.text.muted} style={{ marginHorizontal: 8 }}>
          ·
        </ZoneText>
        <ZoneText variant="caption" color={colors.accent.gold} style={{ fontFamily: 'Inter-Bold' }}>
          Nouveau {pr.next} kg
        </ZoneText>
      </View>
    </Animated.View>
  );
}

function WorkView({
  exerciseName,
  setIdx,
  totalSets,
  plannedSet,
  actualReps,
  actualWeight,
  setRpe,
  onChangeReps,
  onChangeWeight,
  onChangeRpe,
  onDone,
}: {
  exerciseName: string;
  setIdx: number;
  totalSets: number;
  plannedSet: PlannedSet;
  actualReps: number;
  actualWeight: number;
  setRpe: number | null;
  onChangeReps: (n: number) => void;
  onChangeWeight: (n: number) => void;
  onChangeRpe: (n: number) => void;
  onDone: () => void;
}): React.ReactElement {
  return (
    <View style={styles.workWrap}>
      <ZoneText variant="heading" style={styles.exerciseName}>
        {exerciseName}
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.setProgress}>
        Série {setIdx + 1}/{totalSets}
      </ZoneText>

      <View style={styles.targetCard}>
        <View style={styles.targetRow}>
          <ZoneText variant="caption" color={colors.text.muted}>
            CIBLE
          </ZoneText>
          {plannedSet.target_rpe ? (
            <View style={styles.rpeBadge}>
              <ZoneText style={styles.rpeBadgeText}>RPE {plannedSet.target_rpe}</ZoneText>
            </View>
          ) : null}
        </View>
        <View style={styles.targetMain}>
          <ZoneText variant="heading" style={styles.targetWeight}>
            {plannedSet.target_weight_kg ?? '-'}
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.muted}>
            kg
          </ZoneText>
          <ZoneText variant="heading" style={styles.targetReps}>
            × {plannedSet.target_reps}
          </ZoneText>
        </View>
      </View>

      <View style={styles.inputCard}>
        <NumberStepper label="POIDS (kg)" value={actualWeight} step={2.5} min={0} onChange={onChangeWeight} />
        <NumberStepper label="REPS RÉALISÉES" value={actualReps} step={1} min={0} onChange={onChangeReps} />
        <View style={styles.rpeRow}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.rpeLabel}>
            RPE RESSENTI
          </ZoneText>
          <View style={styles.rpeScale}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const active = setRpe === n;
              return (
                <TouchableOpacity
                  key={n}
                  onPress={() => onChangeRpe(n)}
                  activeOpacity={0.8}
                  style={[
                    styles.rpeCell,
                    {
                      backgroundColor: active ? colors.accent.gold : colors.bg.card,
                      borderColor: active ? colors.accent.gold : colors.border,
                    },
                  ]}
                >
                  <ZoneText
                    style={{
                      color: active ? colors.bg.primary : colors.text.secondary,
                      fontFamily: 'Inter-Bold',
                      fontSize: 12,
                    }}
                  >
                    {n}
                  </ZoneText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      <View style={styles.workFooter}>
        <Button title="Série terminée" onPress={onDone} />
      </View>
    </View>
  );
}

function NumberStepper({
  label,
  value,
  step,
  min,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  onChange: (n: number) => void;
}): React.ReactElement {
  return (
    <View style={styles.stepperRow}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.stepperLabel}>
        {label}
      </ZoneText>
      <View style={styles.stepperControl}>
        <TouchableOpacity
          onPress={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.stepperBtn}
        >
          <Minus size={18} color={colors.accent.gold} />
        </TouchableOpacity>
        <ZoneText variant="heading" style={styles.stepperValue}>
          {Number.isInteger(value) ? value : value.toFixed(1)}
        </ZoneText>
        <TouchableOpacity
          onPress={() => onChange(+(value + step).toFixed(2))}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.stepperBtn}
        >
          <Plus size={18} color={colors.accent.gold} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function RestView({
  accentColor,
  remaining,
  total,
  ringProgress,
  cue,
  onSkip,
  onAdjust,
}: {
  accentColor: string;
  remaining: number;
  total: number;
  ringProgress: ReturnType<typeof useSharedValue<number>>;
  cue: string | null;
  onSkip: () => void;
  onAdjust: (delta: number) => void;
}): React.ReactElement {
  const size = 220;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const contentStyle = useAnimatedStyle(() => ({ opacity: 1 - ringProgress.value * 0.2 }));
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * ringProgress.value,
  }));

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
        <Animated.View style={[styles.ringContent, contentStyle]}>
          <ZoneText variant="heading" style={[styles.ringValue, { color: accentColor }]}>
            {formatRestMS(remaining)}
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.muted}>
            sur {total}s
          </ZoneText>
        </Animated.View>
      </View>
      {cue ? (
        <ZoneText variant="body" color={colors.text.secondary} style={styles.cueText}>
          {cue}
        </ZoneText>
      ) : null}
      <View style={styles.restControls}>
        <TouchableOpacity onPress={() => onAdjust(-30)} activeOpacity={0.8} style={styles.restAdjust}>
          <ZoneText style={styles.restAdjustText}>-30s</ZoneText>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSkip} activeOpacity={0.85} style={styles.restSkip}>
          <ZoneText style={styles.restSkipText}>PASSER</ZoneText>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onAdjust(30)} activeOpacity={0.8} style={styles.restAdjust}>
          <ZoneText style={styles.restAdjustText}>+30s</ZoneText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SummaryView({
  accentColor,
  zoneScore,
  zoneLabel,
  duration,
  volume,
  prs,
  completedSets,
  onClose,
}: {
  accentColor: string;
  zoneScore: number | null;
  zoneLabel: string;
  duration: number;
  volume: number;
  prs: ResultPR[];
  completedSets: CompletedSet[];
  onClose: () => void;
}): React.ReactElement {
  return (
    <SafeScreen>
      <View style={styles.summaryWrap}>
        <ZoneText variant="heading" style={[styles.summaryTitle, { color: accentColor }]}>
          SÉANCE TERMINÉE
        </ZoneText>
        <View style={styles.summaryStatsRow}>
          <SummaryStat label="DURÉE" value={`${duration}`} unit="min" />
          <SummaryStat label="VOLUME" value={`${volume}`} unit="kg" />
          <SummaryStat label="SÉRIES" value={`${completedSets.length}`} unit="" />
        </View>
        {prs.length > 0 ? (
          <View style={styles.prsCard}>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.prsLabel}>
              PR DE LA SÉANCE
            </ZoneText>
            {prs.map((p, i) => {
              const ex = getExerciseById(p.exercise_id);
              return (
                <View key={`${p.exercise_id}-${i}`} style={styles.prsRow}>
                  <ZoneText variant="label" style={styles.prsExercise}>
                    🏆 {ex?.name ?? p.exercise_id}
                  </ZoneText>
                  <ZoneText variant="caption" color={colors.accent.gold} style={styles.prsValue}>
                    {p.previous} → {p.next} kg
                  </ZoneText>
                </View>
              );
            })}
          </View>
        ) : null}
        {zoneScore !== null ? (
          <View style={styles.zoneSummaryCard}>
            <ZoneText variant="caption" color={colors.text.muted}>
              Tu étais à
            </ZoneText>
            <ZoneText variant="heading" style={[styles.zoneSummaryScore, { color: accentColor }]}>
              {zoneScore}
            </ZoneText>
            <ZoneText variant="label" style={{ letterSpacing: 2, color: colors.text.primary }}>
              {zoneLabel}
            </ZoneText>
          </View>
        ) : null}
      </View>
      <View style={styles.summaryFooter}>
        <Button title="Retour au dashboard" onPress={onClose} />
      </View>
    </SafeScreen>
  );
}

function SummaryStat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}): React.ReactElement {
  return (
    <View style={styles.summaryStatCell}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.summaryStatLabel}>
        {label}
      </ZoneText>
      <View style={styles.summaryStatValueRow}>
        <ZoneText variant="heading" style={styles.summaryStatValue}>
          {value}
        </ZoneText>
        {unit ? (
          <ZoneText variant="caption" color={colors.text.muted} style={styles.summaryStatUnit}>
            {unit}
          </ZoneText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorTitle: { fontSize: 22, color: colors.text.muted, textAlign: 'center' },
  errorAction: { marginTop: 24, alignSelf: 'stretch' },
  zoneStrip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  zoneStripText: {
    flex: 1,
    color: colors.bg.primary,
    fontFamily: 'Inter-Bold',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  zoneScoreBubble: {
    minWidth: 40,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.bg.primary,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  zoneScoreText: { color: colors.text.primary, fontFamily: 'Inter-Bold', fontSize: 13 },
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  workWrap: { flex: 1, paddingHorizontal: 24 },
  exerciseName: { fontSize: 24, marginTop: 8, letterSpacing: 1, color: colors.text.primary },
  setProgress: { marginTop: 2 },
  targetCard: {
    marginTop: 16,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 18,
  },
  targetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rpeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.accent.gold,
    borderRadius: 999,
  },
  rpeBadgeText: { color: colors.accent.gold, fontFamily: 'Inter-Bold', fontSize: 11 },
  targetMain: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginTop: 8 },
  targetWeight: { fontSize: 64, color: colors.accent.gold, lineHeight: 70 },
  targetReps: { fontSize: 28, color: colors.text.primary, marginLeft: 18, lineHeight: 36 },
  inputCard: {
    marginTop: 16,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  stepperLabel: { letterSpacing: 1, fontSize: 11 },
  stepperControl: { flexDirection: 'row', alignItems: 'center' },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { fontSize: 24, color: colors.text.primary, minWidth: 70, textAlign: 'center', lineHeight: 28 },
  rpeRow: { marginTop: 8 },
  rpeLabel: { letterSpacing: 1, fontSize: 11, marginBottom: 6 },
  rpeScale: { flexDirection: 'row', justifyContent: 'space-between' },
  rpeCell: {
    flex: 1,
    height: 32,
    marginHorizontal: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workFooter: { marginTop: 20, marginBottom: 16 },
  restWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  restEyebrow: { letterSpacing: 3, fontFamily: 'Inter-Bold', marginBottom: 16 },
  ringWrap: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
  ringContent: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringValue: { fontSize: 56, lineHeight: 60 },
  cueText: { textAlign: 'center', marginTop: 18, marginHorizontal: 12 },
  restControls: { flexDirection: 'row', alignItems: 'center', marginTop: 28 },
  restAdjust: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    marginHorizontal: 6,
  },
  restAdjustText: { color: colors.text.secondary, fontFamily: 'Inter-Medium' },
  restSkip: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.accent.gold,
    borderRadius: 12,
    marginHorizontal: 6,
  },
  restSkipText: { color: colors.bg.primary, fontFamily: 'Inter-Bold', letterSpacing: 1 },
  prOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    backgroundColor: 'rgba(201,168,76,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  prTitle: { fontSize: 48, color: colors.bg.primary, letterSpacing: 2 },
  prExercise: { marginTop: 8, color: colors.bg.primary, fontFamily: 'Inter-Bold' },
  prRow: { flexDirection: 'row', marginTop: 12, alignItems: 'center' },
  summaryWrap: { flex: 1, padding: 24 },
  summaryTitle: { fontSize: 40, marginTop: 24, letterSpacing: 2 },
  summaryStatsRow: { flexDirection: 'row', marginTop: 28 },
  summaryStatCell: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  summaryStatLabel: { letterSpacing: 1, fontSize: 10 },
  summaryStatValueRow: { flexDirection: 'row', alignItems: 'baseline' },
  summaryStatValue: { fontSize: 32, color: colors.text.primary, lineHeight: 36 },
  summaryStatUnit: { marginLeft: 4 },
  prsCard: {
    marginTop: 20,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.accent.gold,
    borderRadius: 16,
    padding: 14,
  },
  prsLabel: { letterSpacing: 2, fontSize: 11, marginBottom: 8 },
  prsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 2 },
  prsExercise: { color: colors.text.primary, fontSize: 14 },
  prsValue: { fontFamily: 'Inter-Bold' },
  zoneSummaryCard: {
    marginTop: 24,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  zoneSummaryScore: { fontSize: 72, marginTop: 4, lineHeight: 76 },
  summaryFooter: { padding: 24, paddingTop: 8 },
});
