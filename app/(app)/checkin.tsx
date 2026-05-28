import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import { ArrowLeft, Minus, Plus } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import {
  getDaysSinceLastSession,
  saveCheckin,
  todayDateString,
  type SaveCheckinInput,
} from '@/lib/firestore';
import { calculateZoneScore, getZoneLevel, type ZoneLevel } from '@/lib/zoneScore';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Button } from '@/components/ui/Button';
import { ZoneText } from '@/components/ui/ZoneText';
import { PulsingOrb } from '@/components/PulsingOrb';
import { ZoneOrbe } from '@/components/ZoneOrbe';

const TOTAL_STEPS = 5;

interface CheckinInputs {
  sleep_duration: number;
  sleep_quality: number;
  feeling: number;
  muscle_soreness: number;
  stress: number;
}

const SLEEP_QUALITY_OPTIONS: { emoji: string; label: string; value: number }[] = [
  { emoji: '😴', label: 'Très mal', value: 1 },
  { emoji: '😕', label: 'Mal', value: 2 },
  { emoji: '😐', label: 'Moyen', value: 3 },
  { emoji: '🙂', label: 'Bien', value: 4 },
  { emoji: '😄', label: 'Très bien', value: 5 },
];

const SORENESS_OPTIONS: { label: string; value: number }[] = [
  { label: 'Aucune', value: 1 },
  { label: 'Légères', value: 2 },
  { label: 'Modérées', value: 3 },
  { label: 'Fortes', value: 4 },
  { label: 'Intenses', value: 5 },
];

const STRESS_OPTIONS: { label: string; value: number }[] = [
  { label: 'Zen', value: 1 },
  { label: 'Calme', value: 2 },
  { label: 'Normal', value: 3 },
  { label: 'Tendu', value: 4 },
  { label: 'Sous pression', value: 5 },
];

interface ResultState {
  score: number;
  level: ZoneLevel;
}

export default function CheckinScreen(): React.ReactElement {
  const router = useRouter();
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [inputs, setInputs] = useState<CheckinInputs>({
    sleep_duration: 7.5,
    sleep_quality: 3,
    feeling: 7,
    muscle_soreness: 2,
    stress: 2,
  });
  const [result, setResult] = useState<ResultState | null>(null);

  const goPrev = (): void => {
    if (stepIdx === 0) {
      router.back();
      return;
    }
    setStepIdx((s) => s - 1);
  };

  const goNext = (): void => {
    if (stepIdx < TOTAL_STEPS - 1) {
      setStepIdx((s) => s + 1);
      return;
    }
    void finalize();
  };

  const finalize = async (): Promise<void> => {
    const user = auth.currentUser;
    let days = 2;
    if (user) {
      try {
        days = await getDaysSinceLastSession(user.uid);
      } catch {
        days = 2;
      }
    }
    const score = calculateZoneScore({ ...inputs, days_since_last_session: days });
    const level = getZoneLevel(score);
    setResult({ score, level });

    if (user) {
      const payload: SaveCheckinInput = {
        date: todayDateString(),
        ...inputs,
        zone_score: score,
      };
      saveCheckin(user.uid, payload).catch(() => undefined);
    }
  };

  if (result) {
    return (
      <SafeScreen>
        <View style={styles.resultRoot}>
          <PulsingOrb size={120} color={result.level.color} />
          <ZoneText
            variant="heading"
            style={[styles.resultScore, { color: result.level.color }]}
          >
            {result.score}
          </ZoneText>
          <ZoneText variant="label" style={styles.resultLabel}>
            {result.level.label}
          </ZoneText>
          <ZoneText variant="body" color={colors.text.secondary} style={styles.resultMessage}>
            {result.level.message}
          </ZoneText>
        </View>
        <View style={styles.footer}>
          <Button title="Voir mon dashboard" onPress={() => router.replace('/(app)/')} />
        </View>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen>
      <View style={styles.header}>
        <TouchableOpacity onPress={goPrev} hitSlop={12} activeOpacity={0.7}>
          <ArrowLeft size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.dotsRow}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    i <= stepIdx ? colors.accent.gold : colors.border,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {stepIdx === 0 ? (
        <View style={styles.intro}>
          <ZoneOrbe size={40} score={50} />
          <ZoneText variant="label" style={styles.introTitle}>
            La Zone ne se commande pas.{'\n'}Mais elle se prépare.
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.introSubtitle}>
            Dis-nous comment tu vas aujourd’hui.
          </ZoneText>
        </View>
      ) : null}

      <Animated.View
        key={stepIdx}
        entering={SlideInRight.duration(220)}
        exiting={SlideOutLeft.duration(180)}
        style={styles.stepContainer}
      >
        {stepIdx === 0 ? (
          <SleepDurationStep
            value={inputs.sleep_duration}
            onChange={(v) => setInputs((s) => ({ ...s, sleep_duration: v }))}
          />
        ) : null}
        {stepIdx === 1 ? (
          <EmojiStep
            title="Comment as-tu dormi ?"
            options={SLEEP_QUALITY_OPTIONS}
            value={inputs.sleep_quality}
            onChange={(v) => setInputs((s) => ({ ...s, sleep_quality: v }))}
          />
        ) : null}
        {stepIdx === 2 ? (
          <FeelingStep
            value={inputs.feeling}
            onChange={(v) => setInputs((s) => ({ ...s, feeling: v }))}
          />
        ) : null}
        {stepIdx === 3 ? (
          <CardStep
            title="Tu as des courbatures ?"
            options={SORENESS_OPTIONS}
            value={inputs.muscle_soreness}
            onChange={(v) => setInputs((s) => ({ ...s, muscle_soreness: v }))}
          />
        ) : null}
        {stepIdx === 4 ? (
          <CardStep
            title="Ton niveau de stress ?"
            options={STRESS_OPTIONS}
            value={inputs.stress}
            onChange={(v) => setInputs((s) => ({ ...s, stress: v }))}
          />
        ) : null}
      </Animated.View>

      <View style={styles.footer}>
        <Button
          title={stepIdx === TOTAL_STEPS - 1 ? 'Terminer' : 'Continuer'}
          onPress={goNext}
        />
      </View>
    </SafeScreen>
  );
}

function SleepDurationStep({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}): React.ReactElement {
  const dec = (): void => onChange(Math.max(3, Math.round((value - 0.5) * 2) / 2));
  const inc = (): void => onChange(Math.min(12, Math.round((value + 0.5) * 2) / 2));
  return (
    <View style={styles.stepInner}>
      <ZoneText variant="heading" style={styles.stepTitle}>
        Combien d&apos;heures as-tu dormi ?
      </ZoneText>
      <View style={styles.pickerRow}>
        <TouchableOpacity onPress={dec} activeOpacity={0.7} style={styles.pickerButton}>
          <Minus size={28} color={colors.accent.gold} />
        </TouchableOpacity>
        <View style={styles.pickerValueWrap}>
          <ZoneText variant="heading" style={styles.pickerValue}>
            {formatHours(value)}
          </ZoneText>
        </View>
        <TouchableOpacity onPress={inc} activeOpacity={0.7} style={styles.pickerButton}>
          <Plus size={28} color={colors.accent.gold} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function formatHours(v: number): string {
  return Number.isInteger(v) ? `${v}h` : `${v}h`;
}

function EmojiStep({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: { emoji: string; label: string; value: number }[];
  value: number;
  onChange: (v: number) => void;
}): React.ReactElement {
  return (
    <View style={styles.stepInner}>
      <ZoneText variant="heading" style={styles.stepTitle}>
        {title}
      </ZoneText>
      <View style={styles.emojiRow}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onChange(opt.value)}
              activeOpacity={0.8}
              style={[
                styles.emojiCard,
                {
                  borderColor: active ? colors.accent.gold : colors.border,
                  backgroundColor: active ? colors.bg.elevated : colors.bg.card,
                },
              ]}
            >
              <ZoneText variant="body" style={styles.emojiGlyph}>
                {opt.emoji}
              </ZoneText>
              <ZoneText
                variant="caption"
                color={active ? colors.accent.gold : colors.text.secondary}
                style={styles.emojiLabel}
              >
                {opt.label}
              </ZoneText>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function FeelingStep({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}): React.ReactElement {
  const cells = useMemo(() => Array.from({ length: 10 }, (_, i) => i + 1), []);
  return (
    <View style={styles.stepInner}>
      <ZoneText variant="heading" style={styles.stepTitle}>
        Comment tu te sens ?
      </ZoneText>
      <ZoneText variant="heading" style={styles.feelingValue}>
        {value}
      </ZoneText>
      <View style={styles.feelingRow}>
        {cells.map((n) => {
          const active = n === value;
          return (
            <TouchableOpacity
              key={n}
              onPress={() => onChange(n)}
              activeOpacity={0.7}
              style={[
                styles.feelingCell,
                {
                  backgroundColor: active ? colors.accent.gold : colors.bg.card,
                  borderColor: active ? colors.accent.gold : colors.border,
                },
              ]}
            />
          );
        })}
      </View>
      <View style={styles.feelingLabels}>
        <ZoneText variant="caption" color={colors.text.muted}>
          Épuisé
        </ZoneText>
        <ZoneText variant="caption" color={colors.text.muted}>
          En feu 🔥
        </ZoneText>
      </View>
    </View>
  );
}

function CardStep({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: { label: string; value: number }[];
  value: number;
  onChange: (v: number) => void;
}): React.ReactElement {
  return (
    <View style={styles.stepInner}>
      <ZoneText variant="heading" style={styles.stepTitle}>
        {title}
      </ZoneText>
      <View style={styles.cardColumn}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onChange(opt.value)}
              activeOpacity={0.85}
              style={[
                styles.optionCard,
                {
                  borderColor: active ? colors.accent.gold : colors.border,
                  backgroundColor: active ? colors.bg.elevated : colors.bg.card,
                },
              ]}
            >
              <ZoneText
                variant="label"
                style={{
                  color: active ? colors.accent.gold : colors.text.primary,
                  fontSize: 16,
                }}
              >
                {opt.label}
              </ZoneText>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSpacer: { width: 24 },
  dotsRow: { flexDirection: 'row', alignItems: 'center' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  intro: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 },
  introTitle: {
    color: colors.text.primary,
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
  introSubtitle: { textAlign: 'center', marginTop: 8 },
  stepContainer: { flex: 1 },
  stepInner: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { fontSize: 26, textAlign: 'center', marginBottom: 40, color: colors.text.primary },
  pickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pickerButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerValueWrap: { minWidth: 160, alignItems: 'center' },
  pickerValue: { fontSize: 72, color: colors.accent.gold, lineHeight: 80 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch' },
  emojiCard: {
    flex: 1,
    marginHorizontal: 4,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  emojiGlyph: { fontSize: 32, marginBottom: 8 },
  emojiLabel: { textAlign: 'center', fontSize: 11 },
  feelingValue: { fontSize: 96, color: colors.accent.gold, marginBottom: 24, lineHeight: 100 },
  feelingRow: { flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-between' },
  feelingCell: {
    flex: 1,
    height: 36,
    marginHorizontal: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  feelingLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginTop: 12,
  },
  cardColumn: { alignSelf: 'stretch' },
  optionCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 12,
    alignItems: 'center',
  },
  footer: { padding: 24, paddingTop: 8 },
  resultRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  resultScore: { fontSize: 96, marginTop: 32, lineHeight: 100 },
  resultLabel: { fontFamily: 'Inter-Bold', fontSize: 14, letterSpacing: 3, marginTop: 4 },
  resultMessage: { marginTop: 16, textAlign: 'center', maxWidth: 320 },
});
