import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { SelectableCard } from '@/components/SelectableCard';
import { ZoneText } from '@/components/ui/ZoneText';
import { useOnboarding } from '@/context/OnboardingContext';
import { colors } from '@/theme/colors';
import type { SessionsOrganization } from '@/lib/firestore';

interface Option {
  key: NonNullable<SessionsOrganization>;
  label: string;
  subtitle: string;
}

const OPTIONS: Option[] = [
  {
    key: 'separees',
    label: 'Séances séparées par sport',
    subtitle: 'Une séance par sport, jamais combinées.',
  },
  {
    key: 'combinees',
    label: 'Combinées en une seule séance',
    subtitle: 'Plusieurs sports dans la même séance.',
  },
  {
    key: 'mixte',
    label: 'Les deux selon les jours',
    subtitle: 'Tu alternes selon ton emploi du temps.',
  },
];

export default function Step4Screen(): React.ReactElement {
  const router = useRouter();
  const {
    selectedSports,
    sessions_organization,
    setSessionsOrganization,
    optimize_global_progression,
    setOptimizeGlobal,
  } = useOnboarding();

  const activeSports = useMemo(
    () => selectedSports.filter((s) => s === 'halterophilie' || s === 'course'),
    [selectedSports],
  );

  useEffect(() => {
    if (activeSports.length < 2) {
      router.replace('/onboarding/step-5');
    }
  }, [activeSports.length, router]);

  const ready =
    sessions_organization !== null &&
    (sessions_organization !== 'combinees' || optimize_global_progression !== null);

  return (
    <OnboardingFrame
      step={4}
      title="Comment organiser tes entraînements ?"
      onContinue={() => router.push('/onboarding/step-5')}
      continueDisabled={!ready}
    >
      {OPTIONS.map((opt) => (
        <SelectableCard
          key={opt.key}
          title={opt.label}
          subtitle={opt.subtitle}
          selected={sessions_organization === opt.key}
          onPress={() => setSessionsOrganization(opt.key)}
        />
      ))}

      {sessions_organization === 'combinees' ? (
        <View style={styles.followUp}>
          <ZoneText variant="label" color={colors.text.secondary} style={styles.followLabel}>
            Veux-tu optimiser ta progression globale ?
          </ZoneText>
          <SelectableCard
            title="Oui"
            selected={optimize_global_progression === true}
            onPress={() => setOptimizeGlobal(true)}
          />
          <SelectableCard
            title="Non"
            selected={optimize_global_progression === false}
            onPress={() => setOptimizeGlobal(false)}
          />
        </View>
      ) : null}
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  followUp: { marginTop: 16 },
  followLabel: { marginBottom: 12 },
});
