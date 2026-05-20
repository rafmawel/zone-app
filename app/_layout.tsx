import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { doc, onSnapshot } from 'firebase/firestore';
import '../global.css';

import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { initializePurchases } from '@/lib/subscriptions';
import { colors } from '@/theme/colors';
import { PulsingOrb } from '@/components/PulsingOrb';
import { ZoneText } from '@/components/ui/ZoneText';
import { OnboardingProvider } from '@/context/OnboardingContext';
import { SessionProvider } from '@/context/SessionContext';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function SplashView(): React.ReactElement {
  return (
    <View style={styles.splash}>
      <PulsingOrb size={120} />
      <ZoneText
        variant="heading"
        style={{ marginTop: 28, fontSize: 32, color: colors.accent.gold, letterSpacing: 4 }}
      >
        ZONE
      </ZoneText>
    </View>
  );
}

function RootNavigator(): React.ReactElement {
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const [onboardingChecked, setOnboardingChecked] = useState<boolean>(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setOnboardingCompleted(null);
      setOnboardingChecked(true);
      return;
    }
    void initializePurchases(user.uid);
    setOnboardingChecked(false);
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        const data = snap.data();
        setOnboardingCompleted(Boolean(data?.onboarding_completed));
        setOnboardingChecked(true);
      },
      () => {
        setOnboardingCompleted(false);
        setOnboardingChecked(true);
      },
    );
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (loading || !onboardingChecked) return;
    const inAuth = segments[0] === '(auth)';
    const inApp = segments[0] === '(app)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!user) {
      if (!inAuth) router.replace('/(auth)/login');
      return;
    }
    if (onboardingCompleted === false) {
      if (!inOnboarding) router.replace('/onboarding/step-1');
      return;
    }
    if (onboardingCompleted === true && !inApp) {
      router.replace('/(app)');
    }
  }, [loading, onboardingChecked, onboardingCompleted, segments, user, router]);

  if (loading || !onboardingChecked) return <SplashView />;

  return <Slot />;
}

export default function RootLayout(): React.ReactElement | null {
  const [fontsLoaded, fontError] = useFonts({
    BebasNeue: require('../assets/fonts/BebasNeue-Regular.ttf'),
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
    'Inter-Bold': require('../assets/fonts/Inter-Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <OnboardingProvider>
          <SessionProvider>
            <StatusBar style="light" />
            <RootNavigator />
          </SessionProvider>
        </OnboardingProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg.primary },
  splash: {
    flex: 1,
    backgroundColor: colors.bg.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
