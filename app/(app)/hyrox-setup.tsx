import React, { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import { ArrowLeft } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import { saveHyroxProfile, type HyroxLevel } from '@/lib/firestore';
import {
  HYROX_LEVEL_FINISH,
  HYROX_LEVEL_LABELS,
  HYROX_STATIONS,
  type HyroxStationId,
} from '@/lib/hyroxEngine';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Button } from '@/components/ui/Button';
import { ZoneText } from '@/components/ui/ZoneText';
import { SelectableCard } from '@/components/SelectableCard';
import { Slider } from '@/components/Slider';

const TOTAL_STEPS = 3;

const LEVEL_OPTIONS: { key: HyroxLevel; emoji: string; subtitle: string }[] = [
  { key: 'debutant', emoji: '🆕', subtitle: 'Jamais fait' },
  { key: 'regulier', emoji: '🔄', subtitle: 'Quelques compétitions' },
  { key: 'competiteur', emoji: '⚡', subtitle: 'Objectif podium' },
  { key: 'pro', emoji: '🏆', subtitle: 'Élite' },
];

export default function HyroxSetupScreen(): React.ReactElement {
  const router = useRouter();
  const [step, setStep] = useState<number>(0);
  const [level, setLevel] = useState<HyroxLevel | null>(null);
  const [weakStations, setWeakStations] = useState<HyroxStationId[]>([]);
  const [hasRace, setHasRace] = useState<boolean>(false);
  const [raceDate, setRaceDate] = useState<string>('');
  const [sessions, setSessions] = useState<number>(3);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const canContinue = (): boolean => {
    if (step === 0) return level !== null;
    return true;
  };

  const goPrev = (): void => {
    if (step === 0) {
      router.back();
      return;
    }
    setStep((s) => s - 1);
  };

  const toggleStation = (id: HyroxStationId): void => {
    setWeakStations((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
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
    if (!user || !level) {
      setError('Session expirée.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await saveHyroxProfile(user.uid, {
        level,
        weak_stations: weakStations,
        has_target_race: hasRace,
        target_race_date: hasRace && raceDate ? raceDate : null,
        sessions_per_week: sessions,
      });
      if (level === 'debutant') {
        router.replace('/(app)/(tabs)/aujourd-hui');
      } else {
        router.replace('/(app)/hyrox-baseline');
      }
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
        <ZoneText variant="caption" color={colors.accent.gold} style={styles.eyebrow}>
          Étape {step + 1}/{TOTAL_STEPS}
        </ZoneText>
        <View style={styles.dotsRow}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i <= step ? colors.accent.gold : colors.border },
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
                QUEL EST TON NIVEAU HYROX ?
              </ZoneText>
              <View style={styles.cards}>
                {LEVEL_OPTIONS.map((o) => (
                  <SelectableCard
                    key={o.key}
                    title={HYROX_LEVEL_LABELS[o.key]}
                    subtitle={o.subtitle}
                    emoji={o.emoji}
                    selected={level === o.key}
                    onPress={() => setLevel(o.key)}
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
            level === 'debutant' ? (
              <>
                <ZoneText variant="heading" style={styles.title}>
                  PREMIER HYROX ?
                </ZoneText>
                <View style={styles.infoCard}>
                  <ZoneText variant="body" color={colors.text.primary} style={styles.infoText}>
                    Tu découvres le Hyrox. On couvrira toutes les stations de
                    façon équilibrée.
                  </ZoneText>
                  <ZoneText
                    variant="caption"
                    color={colors.text.muted}
                    style={styles.infoTextMuted}
                  >
                    L’app identifiera tes points faibles après tes premières
                    séances.
                  </ZoneText>
                </View>
              </>
            ) : (
              <>
                <ZoneText variant="heading" style={styles.title}>
                  TES POINTS FAIBLES ?
                </ZoneText>
                <ZoneText
                  variant="body"
                  color={colors.text.secondary}
                  style={styles.subtitle}
                >
                  On priorisera ces stations. Trois choix maximum.
                </ZoneText>
                <View style={styles.cards}>
                  {HYROX_STATIONS.map((s) => {
                    const selected = weakStations.includes(s.id);
                    const disabled = !selected && weakStations.length >= 3;
                    return (
                      <SelectableCard
                        key={s.id}
                        title={s.label}
                        selected={selected}
                        disabled={disabled}
                        onPress={() => toggleStation(s.id)}
                      />
                    );
                  })}
                </View>
                <ZoneText
                  variant="caption"
                  color={colors.text.muted}
                  style={styles.weakNote}
                >
                  {weakStations.length}/3 sélectionnés
                </ZoneText>
              </>
            )
          ) : null}

          {step === 2 ? (
            <>
              <ZoneText variant="heading" style={styles.title}>
                AS-TU UNE COMPÉTITION EN VUE ?
              </ZoneText>
              <View style={styles.cards}>
                <SelectableCard
                  title="Oui, j’ai une course planifiée"
                  selected={hasRace}
                  onPress={() => setHasRace(true)}
                />
                <SelectableCard
                  title="Pas pour l’instant"
                  selected={!hasRace}
                  onPress={() => setHasRace(false)}
                />
              </View>
              {hasRace ? (
                <View style={styles.raceBlock}>
                  <ZoneText variant="caption" color={colors.text.muted} style={styles.sectionLabel}>
                    DATE DE COURSE (AAAA-MM-JJ)
                  </ZoneText>
                  <TextInput
                    value={raceDate}
                    onChangeText={setRaceDate}
                    placeholder="2026-09-21"
                    placeholderTextColor={colors.text.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.raceInput}
                    selectionColor={colors.accent.gold}
                  />
                </View>
              ) : null}
              {level ? (
                <View style={styles.finishCard}>
                  <ZoneText variant="caption" color={colors.text.muted} style={styles.sectionLabel}>
                    OBJECTIF DE TEMPS
                  </ZoneText>
                  <ZoneText variant="heading" style={styles.finishValue}>
                    {HYROX_LEVEL_FINISH[level]}
                  </ZoneText>
                  <ZoneText variant="caption" color={colors.text.muted}>
                    Estimation basée sur ton niveau {HYROX_LEVEL_LABELS[level].toLowerCase()}.
                  </ZoneText>
                </View>
              ) : null}
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
  eyebrow: { letterSpacing: 2, fontFamily: 'Inter-Medium' },
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
  infoCard: {
    marginTop: 16,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.gold,
    borderRadius: 14,
    padding: 16,
  },
  infoText: { lineHeight: 22 },
  infoTextMuted: { marginTop: 10, lineHeight: 18 },
  raceBlock: { marginTop: 12 },
  raceInput: {
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text.primary,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
  },
  finishCard: {
    marginTop: 18,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
  },
  finishValue: { fontSize: 36, color: colors.accent.gold, marginVertical: 4, lineHeight: 40 },
  error: { marginTop: 12, textAlign: 'center' },
  footer: { padding: 24, paddingTop: 8 },
});
