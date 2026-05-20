import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { SelectableCard } from '@/components/SelectableCard';
import { useOnboarding } from '@/context/OnboardingContext';
import type { HealthDataSource } from '@/lib/firestore';

export default function Step5Screen(): React.ReactElement {
  const router = useRouter();
  const { setHealthDataSource } = useOnboarding();
  const [healthConnect, setHealthConnect] = useState<boolean>(false);
  const [manual, setManual] = useState<boolean>(false);

  const onContinue = (): void => {
    const source: HealthDataSource =
      healthConnect && manual
        ? 'both'
        : healthConnect
          ? 'health_connect'
          : manual
            ? 'manual'
            : null;
    setHealthDataSource(source);
    router.push('/onboarding/complete');
  };

  return (
    <OnboardingFrame
      step={5}
      title="Connecte tes données de santé"
      subtitle="Zone utilise ton sommeil et ton activité pour calculer ton score Zone."
      onContinue={onContinue}
      continueDisabled={!healthConnect && !manual}
    >
      <View style={styles.gap}>
        <SelectableCard
          title={
            healthConnect
              ? 'Android Health Connect · Connecté'
              : 'Connecter Android Health Connect'
          }
          subtitle="Synchronisation automatique."
          selected={healthConnect}
          onPress={() => setHealthConnect((v) => !v)}
        />
        <SelectableCard
          title="Saisie manuelle quotidienne"
          subtitle="Tu saisis tes données chaque jour."
          selected={manual}
          onPress={() => setManual((v) => !v)}
        />
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 0 },
});
