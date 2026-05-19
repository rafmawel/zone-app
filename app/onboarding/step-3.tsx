import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { SelectableCard } from '@/components/SelectableCard';
import { Slider } from '@/components/Slider';
import { ZoneText } from '@/components/ui/ZoneText';
import { useOnboarding } from '@/context/OnboardingContext';
import { colors } from '@/theme/colors';
import type { Level, SportKey } from '@/lib/firestore';

const LEVELS: { key: Level; label: string }[] = [
  { key: 'debutant', label: 'Débutant' },
  { key: 'intermediaire', label: 'Intermédiaire' },
  { key: 'avance', label: 'Avancé' },
  { key: 'confirme', label: 'Confirmé' },
];

const HALTERO_GOALS = [
  { key: 'force_pure', label: 'Force pure' },
  { key: 'perf_competition', label: 'Performance compétition' },
  { key: 'remise_en_forme', label: 'Remise en forme' },
];

const HALTERO_EQUIPMENT = [
  { key: 'barre_disques', label: 'Barre + disques' },
  { key: 'salle_complete', label: 'Salle complète' },
  { key: 'halteres', label: 'Haltères uniquement' },
];

const COURSE_GOALS = [
  { key: '5km', label: '5 km' },
  { key: '10km', label: '10 km' },
  { key: 'semi_marathon', label: 'Semi-marathon' },
  { key: 'marathon', label: 'Marathon' },
  { key: 'trail', label: 'Trail' },
  { key: 'forme_generale', label: 'Forme générale' },
];

function SportConfigBlock({ sport }: { sport: SportKey }): React.ReactElement | null {
  const { sportConfigs, setSportConfig } = useOnboarding();
  const cfg = sportConfigs[sport];

  if (sport === 'halterophilie') {
    return (
      <View style={styles.block}>
        <ZoneText variant="heading" style={styles.blockTitle}>
          Haltérophilie 🏋️
        </ZoneText>

        <ZoneText variant="label" color={colors.text.secondary} style={styles.fieldLabel}>
          Niveau
        </ZoneText>
        {LEVELS.map((lvl) => (
          <SelectableCard
            key={lvl.key}
            title={lvl.label}
            selected={cfg?.level === lvl.key}
            onPress={() => setSportConfig(sport, { level: lvl.key })}
          />
        ))}

        <ZoneText variant="label" color={colors.text.secondary} style={styles.fieldLabel}>
          Objectif
        </ZoneText>
        {HALTERO_GOALS.map((g) => (
          <SelectableCard
            key={g.key}
            title={g.label}
            selected={cfg?.goal === g.key}
            onPress={() => setSportConfig(sport, { goal: g.key })}
          />
        ))}

        <ZoneText variant="label" color={colors.text.secondary} style={styles.fieldLabel}>
          Matériel
        </ZoneText>
        {HALTERO_EQUIPMENT.map((eq) => (
          <SelectableCard
            key={eq.key}
            title={eq.label}
            selected={cfg?.equipment === eq.key}
            onPress={() => setSportConfig(sport, { equipment: eq.key })}
          />
        ))}

        <View style={styles.sliderWrap}>
          <Slider
            min={1}
            max={6}
            value={cfg?.sessions_per_week ?? 3}
            onChange={(n) => setSportConfig(sport, { sessions_per_week: n })}
            label="Séances par semaine"
          />
        </View>
      </View>
    );
  }

  if (sport === 'course') {
    return (
      <View style={styles.block}>
        <ZoneText variant="heading" style={styles.blockTitle}>
          Course à pied 🏃
        </ZoneText>

        <ZoneText variant="label" color={colors.text.secondary} style={styles.fieldLabel}>
          Niveau
        </ZoneText>
        {LEVELS.map((lvl) => (
          <SelectableCard
            key={lvl.key}
            title={lvl.label}
            selected={cfg?.level === lvl.key}
            onPress={() => setSportConfig(sport, { level: lvl.key })}
          />
        ))}

        <ZoneText variant="label" color={colors.text.secondary} style={styles.fieldLabel}>
          Objectif
        </ZoneText>
        {COURSE_GOALS.map((g) => (
          <SelectableCard
            key={g.key}
            title={g.label}
            selected={cfg?.goal === g.key}
            onPress={() => setSportConfig(sport, { goal: g.key })}
          />
        ))}

        <View style={styles.sliderWrap}>
          <Slider
            min={1}
            max={6}
            value={cfg?.sessions_per_week ?? 3}
            onChange={(n) => setSportConfig(sport, { sessions_per_week: n })}
            label="Séances par semaine"
          />
        </View>
      </View>
    );
  }

  return null;
}

export default function Step3Screen(): React.ReactElement {
  const router = useRouter();
  const { selectedSports, sportConfigs } = useOnboarding();

  const activeSports = useMemo(
    () => selectedSports.filter((s) => s === 'halterophilie' || s === 'course'),
    [selectedSports],
  );

  const allConfigured = useMemo(
    () =>
      activeSports.every((sport) => {
        const cfg = sportConfigs[sport];
        if (!cfg) return false;
        if (!cfg.level || !cfg.goal) return false;
        if (sport === 'halterophilie' && !cfg.equipment) return false;
        if (!cfg.sessions_per_week) return false;
        return true;
      }),
    [activeSports, sportConfigs],
  );

  const onContinue = (): void => {
    if (activeSports.length >= 2) {
      router.push('/onboarding/step-4');
    } else {
      router.push('/onboarding/step-5');
    }
  };

  return (
    <OnboardingFrame
      step={3}
      title="Configure tes sports"
      subtitle="Précise ton niveau et tes objectifs pour chaque sport."
      onContinue={onContinue}
      continueDisabled={!allConfigured || activeSports.length === 0}
    >
      {activeSports.map((sport) => (
        <SportConfigBlock key={sport} sport={sport} />
      ))}
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: 24 },
  blockTitle: { fontSize: 26, marginBottom: 12, color: colors.accent.gold },
  fieldLabel: { marginTop: 16, marginBottom: 8 },
  sliderWrap: { marginTop: 16 },
});
