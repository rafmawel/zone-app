import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { SelectableCard } from '@/components/SelectableCard';
import { useOnboarding } from '@/context/OnboardingContext';
import { connectHealthConnect, type HealthConnectStatus } from '@/lib/healthConnect';
import type { HealthDataSource } from '@/lib/firestore';

function healthConnectErrorMessage(status: HealthConnectStatus): string {
  switch (status) {
    case 'not_installed':
      return "Health Connect doit être installé ou mis à jour. Ouvre le Play Store puis réessaie.";
    case 'unsupported':
      return "Health Connect n'est pas disponible sur cet appareil.";
    case 'denied':
      return "Permissions refusées. Autorise l'accès à tes données pour activer la synchronisation.";
    case 'error':
    default:
      return "Health Connect n'est pas disponible sur cet appareil.";
  }
}

export default function Step5Screen(): React.ReactElement {
  const router = useRouter();
  const { setHealthDataSource } = useOnboarding();
  const [healthConnect, setHealthConnect] = useState<boolean>(false);
  const [manual, setManual] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);

  const onToggleHealthConnect = async (): Promise<void> => {
    if (healthConnect) {
      setHealthConnect(false);
      return;
    }
    setConnecting(true);
    try {
      const status = await connectHealthConnect();
      if (status === 'connected') {
        setHealthConnect(true);
      } else {
        setHealthConnect(false);
        Alert.alert('Health Connect', healthConnectErrorMessage(status));
      }
    } catch {
      setHealthConnect(false);
      Alert.alert(
        'Health Connect',
        "Health Connect n'est pas disponible sur cet appareil.",
      );
    } finally {
      setConnecting(false);
    }
  };

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
              ? 'Health Connect connecté'
              : connecting
                ? 'Connexion en cours'
                : 'Connecter Android Health Connect'
          }
          subtitle={
            healthConnect
              ? 'Synchronisation automatique active.'
              : 'Synchronisation automatique.'
          }
          selected={healthConnect}
          onPress={() => {
            void onToggleHealthConnect();
          }}
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
