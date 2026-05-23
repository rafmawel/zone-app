import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AlertTriangle, ArrowLeft } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import { saveExerciseMax, todayDateString, type ExerciseMax } from '@/lib/firestore';
import { estimateOneRepMax } from '@/lib/programEngine';
import { getExerciseById } from '@/data/exercises';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';

type Phase = 'briefing' | 'warmup' | 'working' | 'result';
type WorkingOutcome = 'easy' | 'good' | 'hard' | 'failure';

interface WarmupSet {
  index: 1 | 2 | 3;
  percent: number;
  reps: number;
  label: string;
}

interface WorkingSet {
  weight: number;
  reps: number;
  outcome: WorkingOutcome | null;
  succeeded: boolean;
}

const WARMUP_REST_SECONDS = 90;
const WORKING_REST_SECONDS = 180;
const MAX_WORKING_SETS = 5;

function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

function warmupSets(estimatedMax: number): WarmupSet[] {
  return [
    { index: 1, percent: 0.4, reps: 10, label: 'Échauffement léger' },
    { index: 2, percent: 0.6, reps: 5, label: 'Activation' },
    { index: 3, percent: 0.75, reps: 3, label: 'Préparation' },
  ].map((s) => ({
    ...s,
    index: s.index as 1 | 2 | 3,
  }));
}

function bumpFor(outcome: WorkingOutcome): number {
  switch (outcome) {
    case 'easy':
      return 5;
    case 'good':
      return 2.5;
    case 'hard':
      return 1.25;
    case 'failure':
    default:
      return 0;
  }
}

/**
 * Format mm:ss for the rest timer.
 *
 * @param seconds remaining seconds
 * @returns "mm:ss"
 */
function formatRest(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function StrengthTestScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ exerciseId?: string; estimatedMax?: string }>();
  const exerciseId = params.exerciseId ?? '';
  const initialMax = Math.max(20, parseFloat(params.estimatedMax ?? '0') || 60);

  const exercise = useMemo(() => getExerciseById(exerciseId), [exerciseId]);
  const warmups = useMemo(() => warmupSets(initialMax), [initialMax]);

  const [phase, setPhase] = useState<Phase>('briefing');
  const [warmupIndex, setWarmupIndex] = useState<number>(0);
  const [workingSets, setWorkingSets] = useState<WorkingSet[]>([]);
  const [currentWeight, setCurrentWeight] = useState<number>(
    roundToHalf(initialMax * 0.85),
  );
  const [currentReps, setCurrentReps] = useState<number>(3);
  const [resting, setResting] = useState<boolean>(false);
  const [restRemaining, setRestRemaining] = useState<number>(0);
  const [saving, setSaving] = useState<boolean>(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restCallbackRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const fireRestDone = (): void => {
    const cb = restCallbackRef.current;
    restCallbackRef.current = null;
    setResting(false);
    setRestRemaining(0);
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (cb) cb();
  };

  const startRest = (seconds: number, onDone: () => void): void => {
    if (tickRef.current) clearInterval(tickRef.current);
    restCallbackRef.current = onDone;
    setRestRemaining(seconds);
    setResting(true);
    tickRef.current = setInterval(() => {
      setRestRemaining((r) => {
        const next = r - 1;
        if (next <= 0) {
          fireRestDone();
          return 0;
        }
        return next;
      });
    }, 1000);
  };

  const skipRest = (): void => {
    fireRestDone();
  };

  const beginTest = (): void => {
    setPhase('warmup');
    setWarmupIndex(0);
  };

  const completeWarmup = (): void => {
    if (warmupIndex < warmups.length - 1) {
      startRest(WARMUP_REST_SECONDS, () => setWarmupIndex((i) => i + 1));
      // optimistic UI: rest timer drives transition
      // when timer ends we advance; if user skips rest, we also advance via setWarmupIndex below
    } else {
      // Last warmup done — move to first working set
      startRest(WARMUP_REST_SECONDS, () => setPhase('working'));
    }
  };

  const recordWorkingSet = (outcome: WorkingOutcome): void => {
    const succeeded = outcome !== 'failure';
    const updated: WorkingSet = {
      weight: currentWeight,
      reps: currentReps,
      outcome,
      succeeded,
    };
    const nextList = [...workingSets, updated];
    setWorkingSets(nextList);

    const reachedFailure = outcome === 'failure';
    const reachedMax = nextList.length >= MAX_WORKING_SETS;

    if (reachedFailure || reachedMax) {
      setPhase('result');
      return;
    }

    const bump = bumpFor(outcome);
    const nextWeight = roundToHalf(currentWeight + bump);
    setCurrentWeight(nextWeight);
    setCurrentReps(outcome === 'hard' ? 1 : currentReps);
    startRest(WORKING_REST_SECONDS, () => undefined);
  };

  const bestWorkingMax = useMemo(() => {
    const successful = workingSets.filter((s) => s.succeeded);
    if (successful.length === 0) return null;
    return successful.reduce((acc, s) =>
      estimateOneRepMax(s.weight, s.reps) > estimateOneRepMax(acc.weight, acc.reps)
        ? s
        : acc,
    );
  }, [workingSets]);

  const estimatedOneRm = bestWorkingMax
    ? estimateOneRepMax(bestWorkingMax.weight, bestWorkingMax.reps)
    : 0;

  const onSave = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !bestWorkingMax) return;
    setSaving(true);
    try {
      const max: ExerciseMax = {
        exercise_id: exerciseId,
        weight_kg: bestWorkingMax.weight,
        reps: bestWorkingMax.reps,
        estimated_1rm: estimatedOneRm,
        date: todayDateString(),
        is_pr: true,
      };
      await saveExerciseMax(user.uid, max);
      router.back();
    } catch {
      setSaving(false);
    }
  };

  const headerTitle = exercise ? exercise.name : 'Test de force';

  return (
    <SafeScreen>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={16}>
          <ArrowLeft size={22} color={colors.text.primary} />
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <ZoneText variant="caption" color={colors.accent.gold} style={styles.eyebrow}>
          TEST DE FORCE
        </ZoneText>
        <ZoneText variant="heading" style={styles.title}>
          {headerTitle.toUpperCase()}
        </ZoneText>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.subtitle}>
          Protocole de montée en charge progressive
        </ZoneText>

        {phase === 'briefing' ? (
          <BriefingView estimatedMax={initialMax} onStart={beginTest} />
        ) : null}

        {phase === 'warmup' ? (
          <WarmupView
            estimatedMax={initialMax}
            warmups={warmups}
            currentIndex={warmupIndex}
            resting={resting}
            restRemaining={restRemaining}
            onAdvance={completeWarmup}
            onSkipRest={skipRest}
          />
        ) : null}

        {phase === 'working' ? (
          <WorkingView
            currentWeight={currentWeight}
            currentReps={currentReps}
            onAdjustWeight={(delta) =>
              setCurrentWeight((w) => Math.max(20, roundToHalf(w + delta)))
            }
            onAdjustReps={(delta) =>
              setCurrentReps((r) => Math.max(1, Math.min(10, r + delta)))
            }
            onOutcome={recordWorkingSet}
            workingSets={workingSets}
            resting={resting}
            restRemaining={restRemaining}
            onSkipRest={skipRest}
          />
        ) : null}

        {phase === 'result' ? (
          <ResultView
            workingSets={workingSets}
            bestWeight={bestWorkingMax?.weight ?? 0}
            bestReps={bestWorkingMax?.reps ?? 0}
            estimatedOneRm={estimatedOneRm}
            saving={saving}
            onSave={onSave}
          />
        ) : null}
      </ScrollView>
    </SafeScreen>
  );
}

function BriefingView({
  estimatedMax,
  onStart,
}: {
  estimatedMax: number;
  onStart: () => void;
}): React.ReactElement {
  return (
    <View style={styles.body}>
      <View style={styles.warningCard}>
        <AlertTriangle size={18} color={colors.orbe.amber} />
        <View style={styles.warningBody}>
          <ZoneText variant="label" color={colors.orbe.amber} style={styles.warningTitle}>
            Avant de commencer
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.primary} style={styles.warningLine}>
            N'effectue ce test que si tu as dormi correctement.
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.primary} style={styles.warningLine}>
            Toujours avec un partenaire d'entraînement ou dans un rack avec des barres de sécurité.
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.primary} style={styles.warningLine}>
            Arrête immédiatement si tu ressens une douleur.
          </ZoneText>
        </View>
      </View>

      <View style={styles.infoCard}>
        <ZoneText variant="caption" color={colors.text.muted}>
          Estimation de départ
        </ZoneText>
        <ZoneText variant="heading" style={styles.bigValue}>
          {Math.round(estimatedMax)} kg
        </ZoneText>
        <ZoneText variant="caption" color={colors.text.muted}>
          Le test va monter par paliers à partir d'ici.
        </ZoneText>
      </View>

      <Button title="Commencer l'échauffement" onPress={onStart} />
    </View>
  );
}

function WarmupView({
  estimatedMax,
  warmups,
  currentIndex,
  resting,
  restRemaining,
  onAdvance,
  onSkipRest,
}: {
  estimatedMax: number;
  warmups: WarmupSet[];
  currentIndex: number;
  resting: boolean;
  restRemaining: number;
  onAdvance: () => void;
  onSkipRest: () => void;
}): React.ReactElement {
  const current = warmups[currentIndex];
  const weight = roundToHalf(estimatedMax * current.percent);
  return (
    <View style={styles.body}>
      <ZoneText variant="caption" color={colors.accent.gold} style={styles.stepLabel}>
        Échauffement {currentIndex + 1}/{warmups.length}
      </ZoneText>
      <ZoneText variant="label" color={colors.text.primary} style={styles.stepName}>
        {current.label}
      </ZoneText>

      <View style={styles.setCard}>
        <View style={styles.setRow}>
          <View style={styles.setCol}>
            <ZoneText variant="caption" color={colors.text.muted}>
              Charge
            </ZoneText>
            <ZoneText variant="heading" style={styles.bigValue}>
              {weight} kg
            </ZoneText>
          </View>
          <View style={styles.setCol}>
            <ZoneText variant="caption" color={colors.text.muted}>
              Répétitions
            </ZoneText>
            <ZoneText variant="heading" style={styles.bigValue}>
              {current.reps}
            </ZoneText>
          </View>
        </View>
        <ZoneText variant="caption" color={colors.text.muted}>
          {Math.round(current.percent * 100)}% du max estimé. Ces séries ne sont pas enregistrées.
        </ZoneText>
      </View>

      {resting ? (
        <RestPanel
          remaining={restRemaining}
          total={WARMUP_REST_SECONDS}
          onSkip={onSkipRest}
        />
      ) : (
        <Button title="Prêt pour le prochain set" onPress={onAdvance} />
      )}
    </View>
  );
}

function WorkingView({
  currentWeight,
  currentReps,
  onAdjustWeight,
  onAdjustReps,
  onOutcome,
  workingSets,
  resting,
  restRemaining,
  onSkipRest,
}: {
  currentWeight: number;
  currentReps: number;
  onAdjustWeight: (delta: number) => void;
  onAdjustReps: (delta: number) => void;
  onOutcome: (outcome: WorkingOutcome) => void;
  workingSets: WorkingSet[];
  resting: boolean;
  restRemaining: number;
  onSkipRest: () => void;
}): React.ReactElement {
  return (
    <View style={styles.body}>
      <ZoneText variant="caption" color={colors.accent.gold} style={styles.stepLabel}>
        Série de travail {workingSets.length + 1}/{MAX_WORKING_SETS}
      </ZoneText>

      <View style={styles.setCard}>
        <View style={styles.setRow}>
          <View style={styles.setCol}>
            <ZoneText variant="caption" color={colors.text.muted}>
              Charge
            </ZoneText>
            <ZoneText variant="heading" style={styles.bigValue}>
              {currentWeight} kg
            </ZoneText>
            <View style={styles.adjustRow}>
              <AdjustBtn label="-2,5" onPress={() => onAdjustWeight(-2.5)} />
              <AdjustBtn label="+2,5" onPress={() => onAdjustWeight(2.5)} />
            </View>
          </View>
          <View style={styles.setCol}>
            <ZoneText variant="caption" color={colors.text.muted}>
              Répétitions
            </ZoneText>
            <ZoneText variant="heading" style={styles.bigValue}>
              {currentReps}
            </ZoneText>
            <View style={styles.adjustRow}>
              <AdjustBtn label="-1" onPress={() => onAdjustReps(-1)} />
              <AdjustBtn label="+1" onPress={() => onAdjustReps(1)} />
            </View>
          </View>
        </View>
      </View>

      {resting ? (
        <RestPanel
          remaining={restRemaining}
          total={WORKING_REST_SECONDS}
          onSkip={onSkipRest}
        />
      ) : (
        <View style={styles.outcomeCol}>
          <OutcomeBtn
            label="Trop facile (RIR 3+)"
            sublabel="+5 kg la prochaine série"
            color={colors.success}
            onPress={() => onOutcome('easy')}
          />
          <OutcomeBtn
            label="Bien (RIR 1-2)"
            sublabel="+2,5 kg la prochaine série"
            color={colors.orbe.blue}
            onPress={() => onOutcome('good')}
          />
          <OutcomeBtn
            label="Très dur (RIR 0)"
            sublabel="On tente une dernière série"
            color={colors.orbe.amber}
            onPress={() => onOutcome('hard')}
          />
          <OutcomeBtn
            label="Échec"
            sublabel="On garde le dernier set réussi"
            color={colors.danger}
            onPress={() => onOutcome('failure')}
          />
        </View>
      )}

      {workingSets.length > 0 ? (
        <View style={styles.history}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.historyTitle}>
            HISTORIQUE
          </ZoneText>
          {workingSets.map((s, i) => (
            <ZoneText
              key={`${s.weight}-${i}`}
              variant="caption"
              color={s.succeeded ? colors.text.primary : colors.danger}
            >
              {i + 1}. {s.weight} kg × {s.reps} reps
              {s.succeeded ? '' : ' (échec)'}
            </ZoneText>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ResultView({
  workingSets,
  bestWeight,
  bestReps,
  estimatedOneRm,
  saving,
  onSave,
}: {
  workingSets: WorkingSet[];
  bestWeight: number;
  bestReps: number;
  estimatedOneRm: number;
  saving: boolean;
  onSave: () => Promise<void>;
}): React.ReactElement {
  const hasResult = estimatedOneRm > 0;
  return (
    <View style={styles.body}>
      <ZoneText variant="caption" color={colors.accent.gold} style={styles.stepLabel}>
        Résultat
      </ZoneText>
      <View style={styles.resultCard}>
        {hasResult ? (
          <>
            <ZoneText variant="caption" color={colors.text.muted}>
              1RM estimé
            </ZoneText>
            <ZoneText variant="heading" style={styles.resultValue}>
              {estimatedOneRm} kg
            </ZoneText>
            <ZoneText variant="caption" color={colors.text.muted}>
              Meilleure série : {bestWeight} kg × {bestReps} reps
            </ZoneText>
          </>
        ) : (
          <ZoneText variant="body" color={colors.text.primary}>
            Aucune série réussie pendant le test. Réessaie avec une charge plus basse.
          </ZoneText>
        )}
      </View>

      {workingSets.length > 0 ? (
        <View style={styles.history}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.historyTitle}>
            DÉROULÉ
          </ZoneText>
          {workingSets.map((s, i) => (
            <ZoneText
              key={`${s.weight}-${i}`}
              variant="caption"
              color={s.succeeded ? colors.text.primary : colors.danger}
            >
              {i + 1}. {s.weight} kg × {s.reps} reps
              {s.succeeded ? '' : ' (échec)'}
            </ZoneText>
          ))}
        </View>
      ) : null}

      {hasResult ? (
        <Button title="Utiliser cette valeur" loading={saving} onPress={onSave} />
      ) : null}
    </View>
  );
}

function RestPanel({
  remaining,
  total,
  onSkip,
}: {
  remaining: number;
  total: number;
  onSkip: () => void;
}): React.ReactElement {
  const pct = total > 0 ? Math.max(0, Math.min(1, 1 - remaining / total)) : 0;
  return (
    <View style={styles.restCard}>
      <ZoneText variant="caption" color={colors.text.muted}>
        Repos
      </ZoneText>
      <ZoneText variant="heading" style={styles.restValue}>
        {formatRest(remaining)}
      </ZoneText>
      <View style={styles.restTrack}>
        <View style={[styles.restFill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
      <TouchableOpacity onPress={onSkip} hitSlop={10} style={styles.restSkip}>
        <ZoneText variant="caption" color={colors.accent.gold}>
          Passer le repos
        </ZoneText>
      </TouchableOpacity>
    </View>
  );
}

function AdjustBtn({ label, onPress }: { label: string; onPress: () => void }): React.ReactElement {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.adjustBtn}>
      <ZoneText variant="label" color={colors.text.primary} style={styles.adjustText}>
        {label}
      </ZoneText>
    </TouchableOpacity>
  );
}

function OutcomeBtn({
  label,
  sublabel,
  color,
  onPress,
}: {
  label: string;
  sublabel: string;
  color: string;
  onPress: () => void;
}): React.ReactElement {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.outcomeBtn, { borderColor: color }]}
    >
      <ZoneText variant="label" color={color} style={styles.outcomeLabel}>
        {label}
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.muted}>
        {sublabel}
      </ZoneText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  headerRow: { paddingHorizontal: 20, paddingVertical: 12 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  eyebrow: { letterSpacing: 2 },
  title: { fontSize: 30, letterSpacing: 1.5, marginTop: 4 },
  subtitle: { marginTop: 4, marginBottom: 24 },
  body: { gap: 16 },
  warningCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.orbe.amber,
    backgroundColor: colors.bg.card,
  },
  warningBody: { flex: 1 },
  warningTitle: { marginBottom: 6, letterSpacing: 1 },
  warningLine: { marginBottom: 4, lineHeight: 16 },
  infoCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'flex-start',
  },
  bigValue: { fontSize: 36, lineHeight: 40, color: colors.accent.gold, marginVertical: 4 },
  stepLabel: { letterSpacing: 1.4 },
  stepName: { marginTop: 4 },
  setCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  setRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  setCol: { flex: 1, alignItems: 'flex-start' },
  adjustRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  adjustBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  adjustText: { fontSize: 13 },
  outcomeCol: { gap: 8 },
  outcomeBtn: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: colors.bg.card,
    alignItems: 'flex-start',
  },
  outcomeLabel: { marginBottom: 2 },
  restCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'flex-start',
    gap: 6,
  },
  restValue: { fontSize: 36, lineHeight: 40, color: colors.accent.gold },
  restTrack: {
    width: '100%',
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  restFill: { height: '100%', backgroundColor: colors.accent.gold },
  restSkip: { marginTop: 4 },
  history: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.bg.elevated,
    gap: 4,
  },
  historyTitle: { letterSpacing: 1.2, marginBottom: 4 },
  resultCard: {
    padding: 18,
    borderRadius: 14,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.accent.gold,
    alignItems: 'flex-start',
  },
  resultValue: { fontSize: 56, lineHeight: 64, color: colors.accent.gold, marginVertical: 6 },
});
