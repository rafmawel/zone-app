import React, { useEffect, useState } from 'react';
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
import { auth } from '@/lib/firebase';
import { getHyroxProfile, saveHyroxBaseline, type HyroxLevel } from '@/lib/firestore';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Button } from '@/components/ui/Button';
import { ZoneText } from '@/components/ui/ZoneText';

type StepKey = 'skierg' | 'rowing' | 'wall_balls';
const STEPS: StepKey[] = ['skierg', 'rowing', 'wall_balls'];

const SKIERG_DEFAULTS: Record<HyroxLevel, number> = {
  debutant: 2 * 60 + 30,
  regulier: 2 * 60 + 15,
  competiteur: 1 * 60 + 50,
  pro: 1 * 60 + 30,
};

const ROWING_DEFAULTS: Record<HyroxLevel, number> = {
  debutant: 2 * 60 + 10,
  regulier: 2 * 60 + 0,
  competiteur: 1 * 60 + 45,
  pro: 1 * 60 + 35,
};

const WALL_BALLS_DEFAULTS: Record<HyroxLevel, number> = {
  debutant: 30,
  regulier: 40,
  competiteur: 60,
  pro: 80,
};

interface Drafts {
  skierg_500m_sec: number;
  rowing_500m_sec: number;
  wall_balls_2min: number;
}

export default function HyroxBaselineScreen(): React.ReactElement {
  const router = useRouter();
  const [level, setLevel] = useState<HyroxLevel>('regulier');
  const [step, setStep] = useState<number>(0);
  const [drafts, setDrafts] = useState<Drafts>({
    skierg_500m_sec: SKIERG_DEFAULTS.regulier,
    rowing_500m_sec: ROWING_DEFAULTS.regulier,
    wall_balls_2min: WALL_BALLS_DEFAULTS.regulier,
  });
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const profile = await getHyroxProfile(user.uid);
        if (cancelled || !profile) return;
        setLevel(profile.level);
        setDrafts({
          skierg_500m_sec: profile.baseline_skierg_500m_sec ?? SKIERG_DEFAULTS[profile.level],
          rowing_500m_sec: profile.baseline_rowing_500m_sec ?? ROWING_DEFAULTS[profile.level],
          wall_balls_2min: profile.baseline_wall_balls_2min ?? WALL_BALLS_DEFAULTS[profile.level],
        });
      } catch {
        // keep defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const current = STEPS[step];

  const goPrev = (): void => {
    if (step === 0) {
      router.back();
      return;
    }
    setStep((s) => s - 1);
  };

  const goNext = async (): Promise<void> => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
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
      await saveHyroxBaseline(user.uid, {
        baseline_skierg_500m_sec: drafts.skierg_500m_sec,
        baseline_rowing_500m_sec: drafts.rowing_500m_sec,
        baseline_wall_balls_2min: drafts.wall_balls_2min,
      });
      router.replace({
        pathname: '/(app)/programme-overview',
        params: { sport: 'hyrox' },
      });
    } catch {
      setError('Enregistrement impossible. Réessaie.');
    } finally {
      setSaving(false);
    }
  };

  const resetCurrent = (): void => {
    setDrafts((d) => {
      if (current === 'skierg') return { ...d, skierg_500m_sec: SKIERG_DEFAULTS[level] };
      if (current === 'rowing') return { ...d, rowing_500m_sec: ROWING_DEFAULTS[level] };
      return { ...d, wall_balls_2min: WALL_BALLS_DEFAULTS[level] };
    });
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
        <ZoneText variant="caption" color={colors.scoreGreen} style={styles.eyebrow}>
          Station {step + 1}/{STEPS.length}
        </ZoneText>
        <ZoneText variant="heading" style={styles.heroTitle}>
          TES TEMPS DE RÉFÉRENCE
        </ZoneText>
        <ZoneText variant="caption" color={colors.text.secondary} style={styles.heroSubtitle}>
          Tes temps aux stations clés nous permettront de calibrer ton programme.
        </ZoneText>
        <View style={styles.dotsRow}>
          {STEPS.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i <= step ? colors.scoreGreen : colors.border },
              ]}
            />
          ))}
        </View>
      </View>

      <Animated.View
        key={step}
        entering={SlideInRight.duration(200)}
        exiting={SlideOutLeft.duration(160)}
        style={styles.body}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1 }}>
            {current === 'skierg' ? (
              <TimeStep
                title="SKIERG 500 M"
                question="Quel est ton temps sur 500 m SkiErg ?"
                value={drafts.skierg_500m_sec}
                onChange={(v) => setDrafts((d) => ({ ...d, skierg_500m_sec: v }))}
                defaultValue={SKIERG_DEFAULTS[level]}
                onReset={resetCurrent}
              />
            ) : null}
            {current === 'rowing' ? (
              <TimeStep
                title="RAMEUR 500 M"
                question="Quel est ton temps sur 500 m Rameur ?"
                value={drafts.rowing_500m_sec}
                onChange={(v) => setDrafts((d) => ({ ...d, rowing_500m_sec: v }))}
                defaultValue={ROWING_DEFAULTS[level]}
                onReset={resetCurrent}
              />
            ) : null}
            {current === 'wall_balls' ? (
              <RepsStep
                title="WALL BALLS · 2 MIN"
                question="Combien de Wall Balls en 2 minutes ?"
                value={drafts.wall_balls_2min}
                onChange={(v) => setDrafts((d) => ({ ...d, wall_balls_2min: v }))}
                defaultValue={WALL_BALLS_DEFAULTS[level]}
                onReset={resetCurrent}
              />
            ) : null}

            {error ? (
              <ZoneText variant="caption" color={colors.danger} style={styles.error}>
                {error}
              </ZoneText>
            ) : null}
          </View>
        </TouchableWithoutFeedback>
      </Animated.View>

      <View style={styles.footer}>
        <Button
          title={step === STEPS.length - 1 ? 'Démarrer mon programme' : 'Suivant'}
          loading={saving}
          onPress={goNext}
        />
      </View>
    </SafeScreen>
  );
}

function TimeStep({
  title,
  question,
  value,
  onChange,
  defaultValue,
  onReset,
}: {
  title: string;
  question: string;
  value: number;
  onChange: (v: number) => void;
  defaultValue: number;
  onReset: () => void;
}): React.ReactElement {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  const setMinutes = (m: number): void => {
    const clamped = Math.max(1, Math.min(5, m));
    onChange(clamped * 60 + seconds);
  };
  const setSeconds = (s: number): void => {
    const wrapped = ((s % 60) + 60) % 60;
    onChange(minutes * 60 + wrapped);
  };
  const usedDefault = value === defaultValue;
  return (
    <>
      <ZoneText variant="heading" style={styles.liftName}>
        {title}
      </ZoneText>
      <ZoneText variant="body" color={colors.text.secondary} style={styles.question}>
        {question}
      </ZoneText>

      <View style={styles.pickerCard}>
        <View style={styles.paceBlocksRow}>
          <PaceBlock
            value={minutes}
            label="MIN"
            onIncrement={() => setMinutes(minutes + 1)}
            onDecrement={() => setMinutes(minutes - 1)}
          />
          <ZoneText variant="heading" style={styles.paceColon}>
            :
          </ZoneText>
          <PaceBlock
            value={seconds}
            label="SEC"
            format={(n) => n.toString().padStart(2, '0')}
            onIncrement={() => setSeconds(seconds + 10)}
            onDecrement={() => setSeconds(seconds - 10)}
          />
        </View>
        <ZoneText variant="heading" style={styles.paceBig}>
          {`${minutes}:${seconds.toString().padStart(2, '0')}`}
        </ZoneText>
        {usedDefault ? (
          <ZoneText variant="caption" color={colors.text.muted} style={styles.defaultNote}>
            Estimation basée sur ton niveau
          </ZoneText>
        ) : null}
      </View>

      <TouchableOpacity onPress={onReset} activeOpacity={0.7} style={styles.skipRow}>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.skipText}>
          Je ne sais pas, utilise l’estimation
        </ZoneText>
      </TouchableOpacity>
    </>
  );
}

function RepsStep({
  title,
  question,
  value,
  onChange,
  defaultValue,
  onReset,
}: {
  title: string;
  question: string;
  value: number;
  onChange: (v: number) => void;
  defaultValue: number;
  onReset: () => void;
}): React.ReactElement {
  const [text, setText] = useState<string>(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
  const commit = (): void => {
    const parsed = parseInt(text, 10);
    const next = Number.isFinite(parsed) ? Math.max(0, Math.min(200, parsed)) : value;
    onChange(next);
    setText(String(next));
  };
  const usedDefault = value === defaultValue;
  return (
    <>
      <ZoneText variant="heading" style={styles.liftName}>
        {title}
      </ZoneText>
      <ZoneText variant="body" color={colors.text.secondary} style={styles.question}>
        {question}
      </ZoneText>

      <View style={styles.pickerCard}>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.pickerLabel}>
          RÉPÉTITIONS
        </ZoneText>
        <View style={styles.repsRow}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onChange(Math.max(0, value - 5))}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            style={styles.pickerBtn}
          >
            <Minus size={26} color={colors.scoreGreen} />
          </TouchableOpacity>
          <View style={styles.pickerValueWrap}>
            <TextInput
              value={text}
              onChangeText={setText}
              onBlur={commit}
              onSubmitEditing={commit}
              keyboardType="number-pad"
              returnKeyType="done"
              selectionColor={colors.scoreGreen}
              cursorColor={colors.scoreGreen}
              style={styles.pickerInput}
              maxLength={3}
            />
          </View>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => onChange(value + 5)}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            style={styles.pickerBtn}
          >
            <Plus size={26} color={colors.scoreGreen} />
          </TouchableOpacity>
        </View>
        {usedDefault ? (
          <ZoneText variant="caption" color={colors.text.muted} style={styles.defaultNote}>
            Estimation basée sur ton niveau
          </ZoneText>
        ) : null}
      </View>

      <TouchableOpacity onPress={onReset} activeOpacity={0.7} style={styles.skipRow}>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.skipText}>
          Je ne sais pas, utilise l’estimation
        </ZoneText>
      </TouchableOpacity>
    </>
  );
}

function PaceBlock({
  value,
  label,
  onIncrement,
  onDecrement,
  format,
}: {
  value: number;
  label: string;
  onIncrement: () => void;
  onDecrement: () => void;
  format?: (n: number) => string;
}): React.ReactElement {
  return (
    <View style={styles.paceBlock}>
      <TouchableOpacity
        onPress={onIncrement}
        activeOpacity={0.7}
        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        style={styles.paceBlockBtn}
      >
        <Plus size={26} color={colors.scoreGreen} />
      </TouchableOpacity>
      <ZoneText variant="heading" style={styles.paceBlockValue}>
        {format ? format(value) : value}
      </ZoneText>
      <TouchableOpacity
        onPress={onDecrement}
        activeOpacity={0.7}
        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        style={styles.paceBlockBtn}
      >
        <Minus size={26} color={colors.scoreGreen} />
      </TouchableOpacity>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.paceBlockLabel}>
        {label}
      </ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4 },
  heroRow: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 12 },
  eyebrow: { letterSpacing: 2, fontFamily: 'Inter_500Medium' },
  heroTitle: { fontSize: 24, marginTop: 4, letterSpacing: 1 },
  heroSubtitle: { marginTop: 6, lineHeight: 18 },
  dotsRow: { flexDirection: 'row', marginTop: 12 },
  dot: { width: 30, height: 4, borderRadius: 2, marginRight: 6 },
  body: { flex: 1, paddingHorizontal: 24 },
  liftName: { fontSize: 30, marginBottom: 6, color: colors.text.primary, letterSpacing: 1 },
  question: { marginBottom: 16, lineHeight: 20 },
  pickerCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
  },
  pickerLabel: { letterSpacing: 1, fontSize: 11, marginBottom: 12 },
  paceBlocksRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  paceBlock: { alignItems: 'center', marginHorizontal: 4 },
  paceBlockBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paceBlockValue: {
    fontSize: 64,
    color: colors.scoreGreen,
    minWidth: 90,
    textAlign: 'center',
    lineHeight: 70,
    marginVertical: 6,
  },
  paceBlockLabel: { letterSpacing: 1, fontSize: 10, marginTop: 6 },
  paceColon: { fontSize: 48, color: colors.text.muted, marginHorizontal: 6, lineHeight: 52 },
  paceBig: {
    fontSize: 48,
    color: colors.scoreGreen,
    marginTop: 16,
    lineHeight: 52,
    textAlign: 'center',
  },
  defaultNote: { marginTop: 6, fontStyle: 'italic' },
  repsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
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
    minWidth: 120,
    textAlign: 'center',
    color: colors.scoreGreen,
    fontFamily: 'Inter_700Bold',
    fontSize: 64,
    lineHeight: 70,
    paddingVertical: 0,
  },
  skipRow: { alignItems: 'center', marginTop: 16, paddingVertical: 10 },
  skipText: { textDecorationLine: 'underline', fontSize: 12 },
  error: { marginTop: 12, textAlign: 'center' },
  footer: { padding: 24, paddingTop: 8 },
});
