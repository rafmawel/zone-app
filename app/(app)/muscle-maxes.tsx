import React, { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import { ArrowLeft, Minus, Plus } from 'lucide-react-native';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { saveExerciseMax, todayDateString, type ExerciseMax, type UserProfile } from '@/lib/firestore';
import { estimateOneRepMax } from '@/lib/programEngine';
import { getExerciseById } from '@/data/exercises';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Button } from '@/components/ui/Button';
import { ZoneText } from '@/components/ui/ZoneText';

const KEY_LIFTS = ['bench_press', 'back_squat_high', 'deadlift', 'strict_press', 'barbell_row'] as const;
type KeyLift = (typeof KEY_LIFTS)[number];

type LevelKey = 'beginner' | 'intermediate' | 'advanced' | 'elite';

const LEVEL_BASELINES: Record<LevelKey, Record<KeyLift, number>> = {
  beginner: { bench_press: 40, back_squat_high: 50, deadlift: 60, strict_press: 30, barbell_row: 40 },
  intermediate: { bench_press: 70, back_squat_high: 90, deadlift: 110, strict_press: 50, barbell_row: 65 },
  advanced: { bench_press: 100, back_squat_high: 130, deadlift: 160, strict_press: 70, barbell_row: 90 },
  elite: { bench_press: 130, back_squat_high: 170, deadlift: 200, strict_press: 90, barbell_row: 120 },
};

const ONBOARDING_TO_LEVEL_KEY: Record<string, LevelKey> = {
  debutant: 'beginner',
  intermediaire: 'intermediate',
  avance: 'advanced',
  confirme: 'elite',
};

interface DraftMax {
  knows: boolean;
  weight: number;
  reps: number;
}

function defaultDrafts(level: LevelKey): Record<KeyLift, DraftMax> {
  const base = LEVEL_BASELINES[level];
  return {
    bench_press: { knows: true, weight: base.bench_press, reps: 1 },
    back_squat_high: { knows: true, weight: base.back_squat_high, reps: 1 },
    deadlift: { knows: true, weight: base.deadlift, reps: 1 },
    strict_press: { knows: true, weight: base.strict_press, reps: 1 },
    barbell_row: { knows: true, weight: base.barbell_row, reps: 1 },
  };
}

function roundTo2_5(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n / 2.5) * 2.5);
}

function formatPickerValue(v: number): string {
  return Number.isInteger(v) ? `${v}` : v.toFixed(1);
}

export default function MuscleMaxesScreen(): React.ReactElement {
  const router = useRouter();
  const [levelKey, setLevelKey] = useState<LevelKey>('intermediate');
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [drafts, setDrafts] = useState<Record<KeyLift, DraftMax>>(() => defaultDrafts('intermediate'));
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (cancelled || !snap.exists()) return;
        const profile = snap.data() as Partial<UserProfile>;
        const mapped = profile.level ? ONBOARDING_TO_LEVEL_KEY[profile.level] : undefined;
        if (mapped) {
          setLevelKey(mapped);
          setDrafts(defaultDrafts(mapped));
        }
      } catch {
        // keep defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const lift = KEY_LIFTS[stepIdx];
  const exercise = getExerciseById(lift);
  const draft = drafts[lift];
  const oneRm = useMemo(() => estimateOneRepMax(draft.weight, draft.reps), [draft.weight, draft.reps]);
  const baseline = LEVEL_BASELINES[levelKey][lift];

  const setDraft = (patch: Partial<DraftMax>): void => {
    setDrafts((prev) => ({ ...prev, [lift]: { ...prev[lift], ...patch } }));
  };

  const goPrev = (): void => {
    if (stepIdx === 0) {
      router.back();
      return;
    }
    setStepIdx((s) => s - 1);
  };

  const goNext = async (): Promise<void> => {
    if (stepIdx < KEY_LIFTS.length - 1) {
      setStepIdx((s) => s + 1);
      return;
    }
    await persist(drafts);
  };

  const skipAll = async (): Promise<void> => {
    const base = LEVEL_BASELINES[levelKey];
    const filled: Record<KeyLift, DraftMax> = {
      bench_press: { knows: false, weight: base.bench_press, reps: 1 },
      back_squat_high: { knows: false, weight: base.back_squat_high, reps: 1 },
      deadlift: { knows: false, weight: base.deadlift, reps: 1 },
      strict_press: { knows: false, weight: base.strict_press, reps: 1 },
      barbell_row: { knows: false, weight: base.barbell_row, reps: 1 },
    };
    setDrafts(filled);
    await persist(filled);
  };

  const persist = async (source: Record<KeyLift, DraftMax>): Promise<void> => {
    const user = auth.currentUser;
    if (!user) {
      setError('Session expirée.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      for (const id of KEY_LIFTS) {
        const d = source[id];
        const est = estimateOneRepMax(d.weight, d.reps);
        const max: ExerciseMax = {
          exercise_id: id,
          weight_kg: d.weight,
          reps: d.reps,
          estimated_1rm: est,
          date: todayDateString(),
          is_pr: true,
        };
        await saveExerciseMax(user.uid, max);
      }
      router.replace('/(app)/(tabs)/aujourd-hui');
    } catch {
      setError('Enregistrement impossible. Réessaie.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeScreen>
      <View style={styles.backRow}>
        <TouchableOpacity
          onPress={goPrev}
          activeOpacity={0.7}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <ArrowLeft size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.heroRow}>
        <ZoneText variant="caption" color={colors.accent.gold} style={styles.eyebrow}>
          Exercice {stepIdx + 1}/{KEY_LIFTS.length}
        </ZoneText>
        <View style={styles.dotsRow}>
          {KEY_LIFTS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i <= stepIdx ? colors.accent.gold : colors.border },
              ]}
            />
          ))}
        </View>
        <ZoneText variant="heading" style={styles.liftName}>
          {exercise ? exercise.name.toUpperCase() : ''}
        </ZoneText>
        <ZoneText
          variant="caption"
          color={colors.text.muted}
          numberOfLines={2}
          style={styles.heroSubtitle}
        >
          Estime tes charges pour les exercices clés. On calculera ton programme à partir de là.
        </ZoneText>
      </View>

      <Animated.View
        key={stepIdx}
        entering={SlideInRight.duration(200)}
        exiting={SlideOutLeft.duration(160)}
        style={styles.body}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1 }}>
            <View style={styles.toggleRow}>
              <ToggleChip
                label="Je connais ma charge"
                active={draft.knows}
                onPress={() => setDraft({ knows: true })}
              />
              <ToggleChip
                label="Je ne sais pas"
                active={!draft.knows}
                onPress={() => setDraft({ knows: false, weight: baseline, reps: 1 })}
              />
            </View>

            {!draft.knows ? (
              <ZoneText variant="caption" color={colors.text.muted} style={styles.estimateHint}>
                Estimation basée sur ton niveau, ajuste si besoin
              </ZoneText>
            ) : null}

            <WeightPicker value={draft.weight} onChange={(v) => setDraft({ weight: v })} />

            {draft.knows ? (
              <View style={styles.repsBlock}>
                <ZoneText variant="caption" color={colors.text.muted} style={styles.pickerLabel}>
                  C&apos;ÉTAIT POUR
                </ZoneText>
                <View style={styles.repsPicker}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                    const active = n === draft.reps;
                    return (
                      <TouchableOpacity
                        key={n}
                        onPress={() => setDraft({ reps: n })}
                        activeOpacity={0.8}
                        style={[
                          styles.repsCell,
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
                            fontSize: 13,
                          }}
                        >
                          {n}
                        </ZoneText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <ZoneText variant="caption" color={colors.text.muted} style={styles.repsHint}>
                  reps
                </ZoneText>
              </View>
            ) : null}

            <View style={styles.estimateRow}>
              <ZoneText variant="caption" color={colors.text.muted}>
                1RM estimé
              </ZoneText>
              <ZoneText variant="heading" style={styles.estimateValue}>
                {oneRm} kg
              </ZoneText>
            </View>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/(app)/strength-test',
                  params: {
                    exerciseId: KEY_LIFTS[stepIdx],
                    estimatedMax: String(oneRm),
                  },
                })
              }
              activeOpacity={0.7}
              style={styles.testLinkRow}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ZoneText variant="caption" color={colors.accent.gold} style={styles.testLinkText}>
                Je veux faire un test
              </ZoneText>
            </TouchableOpacity>

            {error ? (
              <ZoneText variant="caption" color={colors.danger} style={styles.error}>
                {error}
              </ZoneText>
            ) : null}

            {stepIdx === 0 ? (
              <>
                <View style={styles.guidedRow}>
                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: '/(app)/strength-test',
                        params: { mode: 'guided', sport: 'musculation', session: '1' },
                      })
                    }
                    activeOpacity={0.7}
                    style={styles.guidedChip}
                  >
                    <ZoneText variant="caption" color={colors.accent.gold}>
                      Test guidé · Séance 1
                    </ZoneText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: '/(app)/strength-test',
                        params: { mode: 'guided', sport: 'musculation', session: '2' },
                      })
                    }
                    activeOpacity={0.7}
                    style={styles.guidedChip}
                  >
                    <ZoneText variant="caption" color={colors.accent.gold}>
                      Séance 2 · 48h après
                    </ZoneText>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  onPress={skipAll}
                  activeOpacity={0.7}
                  style={styles.skipRow}
                  disabled={saving}
                >
                  <ZoneText variant="caption" color={colors.text.muted} style={styles.skipText}>
                    Commencer sans mes charges
                  </ZoneText>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </TouchableWithoutFeedback>
      </Animated.View>

      <View style={styles.footer}>
        <Button
          title={stepIdx === KEY_LIFTS.length - 1 ? 'Démarrer mon programme' : 'Suivant'}
          loading={saving}
          onPress={goNext}
        />
      </View>
    </SafeScreen>
  );
}

function WeightPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}): React.ReactElement {
  const [text, setText] = useState<string>(formatPickerValue(value));

  useEffect(() => {
    setText(formatPickerValue(value));
  }, [value]);

  const commit = (): void => {
    const parsed = parseFloat(text.replace(',', '.'));
    const next = Number.isFinite(parsed) ? roundTo2_5(parsed) : value;
    onChange(next);
    setText(formatPickerValue(next));
  };

  return (
    <View style={styles.pickerCard}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.pickerLabel}>
        CHARGE (kg)
      </ZoneText>
      <View style={styles.pickerRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onChange(Math.max(0, +(value - 2.5).toFixed(2)))}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          style={styles.pickerBtn}
        >
          <Minus size={26} color={colors.accent.gold} />
        </TouchableOpacity>
        <View style={styles.pickerValueWrap}>
          <TextInput
            value={text}
            onChangeText={setText}
            onBlur={commit}
            onSubmitEditing={commit}
            keyboardType="decimal-pad"
            returnKeyType="done"
            selectionColor={colors.accent.gold}
            cursorColor={colors.accent.gold}
            style={styles.pickerInput}
            maxLength={6}
          />
        </View>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onChange(+(value + 2.5).toFixed(2))}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          style={styles.pickerBtn}
        >
          <Plus size={26} color={colors.accent.gold} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ToggleChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}): React.ReactElement {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.toggleChip,
        active
          ? { backgroundColor: colors.accent.gold, borderColor: colors.accent.gold }
          : { backgroundColor: 'transparent', borderColor: colors.border },
      ]}
    >
      <ZoneText
        style={{
          color: active ? colors.bg.primary : colors.text.secondary,
          fontFamily: active ? 'Inter-Bold' : 'Inter-Medium',
          fontSize: 13,
        }}
      >
        {label}
      </ZoneText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backRow: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4 },
  heroRow: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 16 },
  eyebrow: { letterSpacing: 2, fontFamily: 'Inter-Medium' },
  heroSubtitle: { marginTop: 8, fontSize: 13, lineHeight: 18 },
  dotsRow: { flexDirection: 'row', marginTop: 8 },
  dot: { width: 22, height: 4, borderRadius: 2, marginRight: 6 },
  body: { flex: 1, paddingHorizontal: 24 },
  liftName: { fontSize: 36, marginTop: 12, color: colors.text.primary, letterSpacing: 1 },
  toggleRow: { flexDirection: 'row', marginBottom: 12 },
  toggleChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
  },
  estimateHint: { marginBottom: 12, fontStyle: 'italic' },
  pickerCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 18,
  },
  pickerLabel: { letterSpacing: 1, fontSize: 11, marginBottom: 12 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pickerBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerValueWrap: { flex: 1, alignItems: 'center' },
  pickerInput: {
    minWidth: 140,
    textAlign: 'center',
    color: colors.accent.gold,
    fontFamily: 'BebasNeue',
    fontSize: 64,
    lineHeight: 70,
    paddingVertical: 0,
  },
  repsBlock: { marginTop: 18 },
  repsPicker: { flexDirection: 'row', justifyContent: 'space-between' },
  repsCell: {
    flex: 1,
    height: 36,
    marginHorizontal: 2,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repsHint: { marginTop: 4, textAlign: 'center' },
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  estimateValue: { fontSize: 28, color: colors.text.primary, lineHeight: 32 },
  testLinkRow: { alignItems: 'center', marginTop: 6, paddingVertical: 6 },
  testLinkText: { textDecorationLine: 'underline' },
  error: { marginTop: 12, textAlign: 'center' },
  guidedRow: { flexDirection: 'row', gap: 10, marginTop: 16, justifyContent: 'center' },
  guidedChip: {
    borderWidth: 1,
    borderColor: colors.accent.gold,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  skipRow: { alignItems: 'center', marginTop: 12, paddingVertical: 10 },
  skipText: { textDecorationLine: 'underline', fontSize: 12 },
  footer: { padding: 24, paddingTop: 8 },
});
