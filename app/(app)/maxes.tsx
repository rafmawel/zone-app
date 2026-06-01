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
import {
  getTodayCheckin,
  saveExerciseMax,
  todayDateString,
  type ExerciseMax,
  type Gender,
  type UserProfile,
} from '@/lib/firestore';
import { ensureFirstPlannedSession, initializeUserProgram } from '@/lib/programInit';
import { estimateOneRepMax } from '@/lib/programEngine';
import { olympicLiftGenderFactor } from '@/lib/genderProfiles';
import { getExerciseById } from '@/data/exercises';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Button } from '@/components/ui/Button';
import { ZoneText } from '@/components/ui/ZoneText';

const KEY_LIFTS = ['snatch', 'clean_and_jerk', 'front_squat', 'strict_press'] as const;
type KeyLift = (typeof KEY_LIFTS)[number];

type LevelKey = 'beginner' | 'intermediate' | 'advanced' | 'elite';

const LEVEL_BASELINES: Record<LevelKey, Record<KeyLift, number>> = {
  beginner: { snatch: 30, clean_and_jerk: 40, front_squat: 50, strict_press: 30 },
  intermediate: { snatch: 60, clean_and_jerk: 80, front_squat: 80, strict_press: 50 },
  advanced: { snatch: 90, clean_and_jerk: 110, front_squat: 110, strict_press: 70 },
  elite: { snatch: 120, clean_and_jerk: 150, front_squat: 140, strict_press: 90 },
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

function defaultDrafts(levelKey: LevelKey, gender: Gender | null): Record<KeyLift, DraftMax> {
  const base = LEVEL_BASELINES[levelKey];
  const snatch = roundTo2_5(base.snatch * olympicLiftGenderFactor('snatch', gender));
  const cleanJerk = roundTo2_5(base.clean_and_jerk * olympicLiftGenderFactor('clean_and_jerk', gender));
  return {
    snatch: { knows: true, weight: snatch, reps: 1 },
    clean_and_jerk: { knows: true, weight: cleanJerk, reps: 1 },
    front_squat: { knows: true, weight: base.front_squat, reps: 1 },
    strict_press: { knows: true, weight: base.strict_press, reps: 1 },
  };
}

function roundTo2_5(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n / 2.5) * 2.5);
}

export default function MaxesScreen(): React.ReactElement {
  const router = useRouter();
  const [levelKey, setLevelKey] = useState<LevelKey>('intermediate');
  const [gender, setGender] = useState<Gender | null>(null);
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [drafts, setDrafts] = useState<Record<KeyLift, DraftMax>>(() =>
    defaultDrafts('intermediate', null),
  );
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
        const g = profile.gender ?? null;
        setGender(g);
        const mapped = profile.level ? ONBOARDING_TO_LEVEL_KEY[profile.level] : undefined;
        if (mapped) {
          setLevelKey(mapped);
          setDrafts(defaultDrafts(mapped, g));
        } else {
          setDrafts(defaultDrafts('intermediate', g));
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
  const oneRm = useMemo(
    () => estimateOneRepMax(draft.weight, draft.reps),
    [draft.weight, draft.reps],
  );
  // The raw estimate can land on any value; suggest it on the 2.5kg grid.
  const oneRmSuggested = useMemo(() => roundTo2_5(oneRm), [oneRm]);
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
    const seeded = defaultDrafts(levelKey, gender);
    const filled: Record<KeyLift, DraftMax> = {
      snatch: { ...seeded.snatch, knows: false },
      clean_and_jerk: { ...seeded.clean_and_jerk, knows: false },
      front_squat: { ...seeded.front_squat, knows: false },
      strict_press: { ...seeded.strict_press, knows: false },
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
      const program = await initializeUserProgram(user.uid);
      const ci = await getTodayCheckin(user.uid).catch(() => null);
      const zoneScore = ci?.zone_score ?? null;
      try {
        await ensureFirstPlannedSession(user.uid, program, zoneScore);
      } catch {
        // non-blocking: dashboard will show "no session" until next manual generate
      }
      router.replace('/(app)/program-intro');
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
          Mouvement {stepIdx + 1}/{KEY_LIFTS.length}
        </ZoneText>
        <ZoneText variant="heading" style={styles.title}>
          {exercise ? exercise.name.toUpperCase() : ''}
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
                label="Je connais mon max"
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
              <ZoneText
                variant="caption"
                color={colors.text.muted}
                style={styles.estimateHint}
              >
                Estimation basée sur ton niveau, ajuste si besoin
              </ZoneText>
            ) : null}

            <WeightPicker
              value={draft.weight}
              onChange={(v) => setDraft({ weight: v })}
            />

            {draft.knows ? (
              <View style={styles.repsBlock}>
                <ZoneText
                  variant="caption"
                  color={colors.text.muted}
                  style={styles.pickerLabel}
                >
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
                <ZoneText
                  variant="caption"
                  color={colors.text.muted}
                  style={styles.repsHint}
                >
                  reps
                </ZoneText>
              </View>
            ) : null}

            <View style={styles.estimateRow}>
              <ZoneText variant="caption" color={colors.text.muted}>
                1RM estimé
              </ZoneText>
              <ZoneText variant="heading" style={styles.estimateValue}>
                {formatPickerValue(oneRmSuggested)} kg
              </ZoneText>
            </View>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/(app)/strength-test',
                  params: {
                    exerciseId: KEY_LIFTS[stepIdx],
                    estimatedMax: String(oneRmSuggested),
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
                        params: { mode: 'guided', sport: 'weightlifting', session: '1' },
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
                        params: { mode: 'guided', sport: 'weightlifting', session: '2' },
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
                    Commencer sans mes maxes
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
  const [text, setText] = useState<string>(String(value));

  useEffect(() => {
    setText(formatPickerValue(value));
  }, [value]);

  const commitText = (): void => {
    const parsed = parseFloat(text.replace(',', '.'));
    const next = Number.isFinite(parsed) ? roundTo2_5(parsed) : value;
    onChange(next);
    setText(formatPickerValue(next));
  };

  const dec = (): void => onChange(Math.max(0, +(value - 2.5).toFixed(2)));
  const inc = (): void => onChange(+(value + 2.5).toFixed(2));

  return (
    <View style={styles.pickerCard}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.pickerLabel}>
        CHARGE (kg)
      </ZoneText>
      <View style={styles.pickerRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={dec}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          style={styles.pickerBtn}
        >
          <Minus size={26} color={colors.accent.gold} />
        </TouchableOpacity>
        <View style={styles.pickerValueWrap}>
          <TextInput
            value={text}
            onChangeText={setText}
            onBlur={commitText}
            onSubmitEditing={commitText}
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
          onPress={inc}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          style={styles.pickerBtn}
        >
          <Plus size={26} color={colors.accent.gold} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function formatPickerValue(v: number): string {
  return Number.isInteger(v) ? `${v}` : v.toFixed(1);
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
  heroRow: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16 },
  eyebrow: { letterSpacing: 2, fontFamily: 'Inter-Medium' },
  title: { fontSize: 36, marginTop: 4, letterSpacing: 1 },
  dotsRow: { flexDirection: 'row', marginTop: 12 },
  dot: { width: 28, height: 4, borderRadius: 2, marginRight: 6 },
  body: { flex: 1, paddingHorizontal: 24 },
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
