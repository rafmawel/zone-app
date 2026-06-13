import React, { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import { ArrowLeft } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import {
  saveMuscleProfile,
  type MuscleEquipment,
  type MuscleGoal,
} from '@/lib/firestore';
import { resetSportWeek } from '@/lib/weekTracking';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Button } from '@/components/ui/Button';
import { ZoneText } from '@/components/ui/ZoneText';
import { SelectableCard } from '@/components/SelectableCard';
import { Slider } from '@/components/Slider';

const TOTAL_STEPS = 3;

const GOAL_OPTIONS: { key: MuscleGoal; emoji: string; label: string; subtitle: string }[] = [
  { key: 'hypertrophy', emoji: '💪', label: 'Prise de masse', subtitle: 'Hypertrophie, séries 8-15.' },
  { key: 'strength', emoji: '🏋️', label: 'Force', subtitle: 'Charges lourdes, séries 3-6.' },
  { key: 'mixed', emoji: '⚖️', label: 'Mixte force / masse', subtitle: 'Alternance des deux.' },
  { key: 'fitness', emoji: '🔥', label: 'Remise en forme', subtitle: 'Full body, repos courts.' },
];

const EQUIPMENT_OPTIONS: { key: MuscleEquipment; emoji: string; label: string }[] = [
  { key: 'barbell_plates', emoji: '🏗️', label: 'Barre + disques' },
  { key: 'dumbbells', emoji: '🏋️', label: 'Haltères' },
  { key: 'full_gym', emoji: '🏢', label: 'Salle complète' },
];

const WEAK_POINT_OPTIONS: { key: string; label: string }[] = [
  { key: 'chest', label: 'Pectoraux' },
  { key: 'back', label: 'Dos' },
  { key: 'shoulders', label: 'Épaules' },
  { key: 'arms', label: 'Bras' },
  { key: 'legs', label: 'Jambes' },
  { key: 'glutes', label: 'Fessiers' },
  { key: 'core', label: 'Abdos' },
  { key: 'calves', label: 'Mollets' },
];

export default function MuscleSetupScreen(): React.ReactElement {
  const router = useRouter();
  const [step, setStep] = useState<number>(0);
  const [goal, setGoal] = useState<MuscleGoal | null>(null);
  const [equipment, setEquipment] = useState<MuscleEquipment[]>([]);
  const [weakPoints, setWeakPoints] = useState<string[]>([]);
  const [sessions, setSessions] = useState<number>(3);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = (): boolean => {
    if (step === 0) return goal !== null;
    if (step === 1) return equipment.length > 0;
    return true;
  };

  const goPrev = (): void => {
    if (step === 0) {
      router.back();
      return;
    }
    setStep((s) => s - 1);
  };

  const toggleEquipment = (k: MuscleEquipment): void => {
    setEquipment((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  };

  const toggleWeakPoint = (k: string): void => {
    setWeakPoints((prev) => {
      if (prev.includes(k)) return prev.filter((x) => x !== k);
      if (prev.length >= 3) return prev;
      return [...prev, k];
    });
  };

  const goNext = async (): Promise<void> => {
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
      return;
    }
    await persist();
  };

  const persist = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !goal) {
      setError('Session expirée.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await saveMuscleProfile(user.uid, {
        goal,
        equipment,
        weak_points: weakPoints,
        sessions_per_week: sessions,
      });
      await resetSportWeek(user.uid, 'musculation').catch(() => undefined);
      router.replace('/(app)/muscle-maxes');
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
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          style={styles.closeBtn}
        >
          <ArrowLeft size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>
      <View style={styles.heroRow}>
        <ZoneText variant="caption" color={colors.scoreGreen} style={styles.eyebrow}>
          Étape {step + 1}/{TOTAL_STEPS}
        </ZoneText>
        <View style={styles.dotsRow}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
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
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {step === 0 ? (
            <>
              <ZoneText variant="heading" style={styles.title}>
                QUEL EST TON OBJECTIF ?
              </ZoneText>
              <View style={styles.cards}>
                {GOAL_OPTIONS.map((o) => (
                  <SelectableCard
                    key={o.key}
                    title={o.label}
                    subtitle={o.subtitle}
                    emoji={o.emoji}
                    selected={goal === o.key}
                    onPress={() => setGoal(o.key)}
                  />
                ))}
              </View>
              <View style={styles.sessionsBlock}>
                <ZoneText variant="caption" color={colors.text.muted} style={styles.sectionLabel}>
                  SÉANCES PAR SEMAINE
                </ZoneText>
                <Slider min={2} max={6} value={sessions} onChange={setSessions} />
              </View>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <ZoneText variant="heading" style={styles.title}>
                QUEL MATÉRIEL AS-TU ?
              </ZoneText>
              <ZoneText variant="body" color={colors.text.secondary} style={styles.subtitle}>
                Choisis tout ce que tu peux utiliser.
              </ZoneText>
              <View style={styles.cards}>
                {EQUIPMENT_OPTIONS.map((o) => (
                  <SelectableCard
                    key={o.key}
                    title={o.label}
                    emoji={o.emoji}
                    selected={equipment.includes(o.key)}
                    onPress={() => toggleEquipment(o.key)}
                  />
                ))}
              </View>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <ZoneText variant="heading" style={styles.title}>
                QUELS SONT TES POINTS FAIBLES ?
              </ZoneText>
              <ZoneText variant="body" color={colors.text.secondary} style={styles.subtitle}>
                Optionnel, passe si tu veux équilibré. Trois choix maximum.
              </ZoneText>
              <View style={styles.cards}>
                {WEAK_POINT_OPTIONS.map((o) => {
                  const selected = weakPoints.includes(o.key);
                  const disabled = !selected && weakPoints.length >= 3;
                  return (
                    <SelectableCard
                      key={o.key}
                      title={o.label}
                      selected={selected}
                      disabled={disabled}
                      onPress={() => toggleWeakPoint(o.key)}
                    />
                  );
                })}
              </View>
              <ZoneText
                variant="caption"
                color={colors.text.muted}
                style={styles.weakNote}
              >
                {weakPoints.length}/3 sélectionnés
              </ZoneText>
            </>
          ) : null}

          {error ? (
            <ZoneText variant="caption" color={colors.danger} style={styles.error}>
              {error}
            </ZoneText>
          ) : null}
        </ScrollView>
      </Animated.View>

      <View style={styles.footer}>
        <Button
          title={step === TOTAL_STEPS - 1 ? 'Démarrer mon programme' : 'Suivant'}
          loading={saving}
          disabled={!canContinue()}
          onPress={goNext}
        />
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  backRow: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  heroRow: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 12 },
  eyebrow: { letterSpacing: 2, fontFamily: 'Inter_500Medium' },
  dotsRow: { flexDirection: 'row', marginTop: 8 },
  dot: { width: 30, height: 4, borderRadius: 2, marginRight: 6 },
  body: { flex: 1, paddingHorizontal: 24 },
  scrollContent: { paddingBottom: 32 },
  title: { fontSize: 24, color: colors.text.primary, letterSpacing: 1 },
  subtitle: { marginTop: 8, lineHeight: 20 },
  cards: { marginTop: 16 },
  sessionsBlock: { marginTop: 18 },
  sectionLabel: { letterSpacing: 1, fontSize: 11, marginBottom: 8 },
  weakNote: { textAlign: 'center', marginTop: 6 },
  error: { marginTop: 12, textAlign: 'center' },
  footer: { padding: 24, paddingTop: 8 },
});
