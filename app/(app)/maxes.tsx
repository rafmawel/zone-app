import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import { ArrowLeft, Minus, Plus } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import { saveExerciseMax, todayDateString, type ExerciseMax } from '@/lib/firestore';
import { initializeUserProgram } from '@/lib/programInit';
import { estimateOneRepMax } from '@/lib/programEngine';
import { getExerciseById } from '@/data/exercises';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Button } from '@/components/ui/Button';
import { ZoneText } from '@/components/ui/ZoneText';

const KEY_LIFTS = ['snatch', 'clean_and_jerk', 'front_squat', 'strict_press'] as const;
type KeyLift = (typeof KEY_LIFTS)[number];

const LEVEL_BASELINES: Record<string, Record<KeyLift, number>> = {
  debutant: { snatch: 30, clean_and_jerk: 40, front_squat: 50, strict_press: 30 },
  intermediaire: { snatch: 60, clean_and_jerk: 75, front_squat: 90, strict_press: 50 },
  avance: { snatch: 85, clean_and_jerk: 110, front_squat: 130, strict_press: 70 },
  confirme: { snatch: 110, clean_and_jerk: 140, front_squat: 170, strict_press: 90 },
};

interface DraftMax {
  knows: boolean;
  weight: number;
  reps: number;
}

export default function MaxesScreen(): React.ReactElement {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [drafts, setDrafts] = useState<Record<KeyLift, DraftMax>>(() => ({
    snatch: { knows: true, weight: 60, reps: 1 },
    clean_and_jerk: { knows: true, weight: 75, reps: 1 },
    front_squat: { knows: true, weight: 90, reps: 1 },
    strict_press: { knows: true, weight: 50, reps: 1 },
  }));
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const lift = KEY_LIFTS[stepIdx];
  const exercise = getExerciseById(lift);
  const draft = drafts[lift];
  const oneRm = useMemo(
    () => estimateOneRepMax(draft.weight, draft.reps),
    [draft.weight, draft.reps],
  );

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
    await persist();
  };

  const persist = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user) {
      setError('Session expirée.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      for (const id of KEY_LIFTS) {
        const d = drafts[id];
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
      await initializeUserProgram(user.uid);
      router.replace('/(app)/(tabs)/training');
    } catch {
      setError('Enregistrement impossible. Réessaie.');
    } finally {
      setSaving(false);
    }
  };

  const baseline = LEVEL_BASELINES.intermediaire[lift];

  return (
    <SafeScreen>
      <View style={styles.header}>
        <TouchableOpacity onPress={goPrev} hitSlop={12} activeOpacity={0.7}>
          <ArrowLeft size={24} color={colors.text.primary} />
        </TouchableOpacity>
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
        <View style={styles.headerSpacer} />
      </View>

      <Animated.View
        key={stepIdx}
        entering={SlideInRight.duration(200)}
        exiting={SlideOutLeft.duration(160)}
        style={styles.body}
      >
        <ZoneText variant="caption" color={colors.accent.gold} style={styles.eyebrow}>
          Mouvement {stepIdx + 1}/{KEY_LIFTS.length}
        </ZoneText>
        <ZoneText variant="heading" style={styles.title}>
          {exercise ? exercise.name.toUpperCase() : ''}
        </ZoneText>
        <ZoneText variant="body" color={colors.text.secondary} style={styles.subtitle}>
          Quel est ton max actuel ?
        </ZoneText>

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

        <View style={styles.pickerCard}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.pickerLabel}>
            CHARGE
          </ZoneText>
          <View style={styles.pickerRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setDraft({ weight: Math.max(20, draft.weight - 2.5) })}
              style={styles.pickerBtn}
            >
              <Minus size={22} color={colors.accent.gold} />
            </TouchableOpacity>
            <View style={styles.pickerValueWrap}>
              <ZoneText variant="heading" style={styles.pickerValue}>
                {draft.weight}
              </ZoneText>
              <ZoneText variant="caption" color={colors.text.muted} style={styles.pickerUnit}>
                kg
              </ZoneText>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setDraft({ weight: draft.weight + 2.5 })}
              style={styles.pickerBtn}
            >
              <Plus size={22} color={colors.accent.gold} />
            </TouchableOpacity>
          </View>

          {draft.knows ? (
            <View style={styles.repsRow}>
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
        </View>

        {error ? (
          <ZoneText variant="caption" color={colors.danger} style={styles.error}>
            {error}
          </ZoneText>
        ) : null}
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
  header: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSpacer: { width: 24 },
  dotsRow: { flexDirection: 'row' },
  dot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 4 },
  body: { flex: 1, paddingHorizontal: 24 },
  eyebrow: { letterSpacing: 2, fontFamily: 'Inter-Medium' },
  title: { fontSize: 28, marginTop: 6, letterSpacing: 1 },
  subtitle: { marginTop: 8, marginBottom: 16 },
  toggleRow: { flexDirection: 'row', marginBottom: 16 },
  toggleChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  pickerCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 20,
  },
  pickerLabel: { letterSpacing: 1, fontSize: 11, marginBottom: 8 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pickerBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerValueWrap: { flex: 1, alignItems: 'center' },
  pickerValue: { fontSize: 64, color: colors.accent.gold, lineHeight: 70 },
  pickerUnit: { marginTop: -4 },
  repsRow: { marginTop: 18 },
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
  error: { marginTop: 12, textAlign: 'center' },
  footer: { padding: 24, paddingTop: 8 },
});
