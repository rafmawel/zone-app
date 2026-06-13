import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { SelectableCard } from '@/components/SelectableCard';
import { ZoneText } from '@/components/ui/ZoneText';
import { colors } from '@/theme/colors';
import { useOnboarding } from '@/context/OnboardingContext';
import type { Gender, Level } from '@/lib/firestore';

interface LevelOption {
  key: Level;
  label: string;
  subtitle: string;
}

const OPTIONS: LevelOption[] = [
  { key: 'debutant', label: 'Débutant', subtitle: 'Je commence ma pratique.' },
  { key: 'intermediaire', label: 'Intermédiaire', subtitle: 'Je m’entraîne régulièrement.' },
  { key: 'avance', label: 'Avancé', subtitle: 'Je connais mes capacités.' },
  { key: 'confirme', label: 'Confirmé', subtitle: 'Je vise la performance.' },
];

const GENDER_OPTIONS: { key: Gender; label: string }[] = [
  { key: 'homme', label: 'Homme' },
  { key: 'femme', label: 'Femme' },
  { key: 'non_precise', label: 'Non précisé' },
];

export default function Step1Screen(): React.ReactElement {
  const router = useRouter();
  const { level, setLevel, gender, setGender } = useOnboarding();

  return (
    <OnboardingFrame
      step={1}
      title="Quel est ton niveau général ?"
      onContinue={() => router.push('/onboarding/step-2')}
      continueDisabled={!level}
    >
      {OPTIONS.map((opt) => (
        <SelectableCard
          key={opt.key}
          title={opt.label}
          subtitle={opt.subtitle}
          selected={level === opt.key}
          onPress={() => setLevel(opt.key)}
        />
      ))}

      <ZoneText variant="caption" color={colors.text.muted} style={styles.genderLabel}>
        JE SUIS
      </ZoneText>
      <View style={styles.genderRow}>
        {GENDER_OPTIONS.map((opt) => {
          const active = gender === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setGender(opt.key)}
              activeOpacity={0.8}
              style={[
                styles.genderChip,
                active
                  ? { backgroundColor: colors.scoreGreen, borderColor: colors.scoreGreen }
                  : { backgroundColor: 'transparent', borderColor: colors.border },
              ]}
            >
              <ZoneText
                style={{
                  color: active ? colors.bg.primary : colors.text.secondary,
                  fontFamily: 'Inter_700Bold',
                  fontSize: 12,
                }}
              >
                {opt.label}
              </ZoneText>
            </TouchableOpacity>
          );
        })}
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  genderLabel: { letterSpacing: 1, marginTop: 20, marginBottom: 8, marginLeft: 2 },
  genderRow: { flexDirection: 'row', gap: 8 },
  genderChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
});
