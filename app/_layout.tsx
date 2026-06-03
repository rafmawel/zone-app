import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import { Syne_600SemiBold, Syne_700Bold } from '@expo-google-fonts/syne';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { doc, onSnapshot } from 'firebase/firestore';
import '../global.css';

import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { initializePurchases } from '@/lib/subscriptions';
import { getTodayHealthData } from '@/lib/healthConnect';
import * as Notifications from 'expo-notifications';
import {
  getTodayCheckin,
  getUserProfile,
  saveHealthSync,
  todayDateString,
  updateUserProfile,
} from '@/lib/firestore';
import {
  cancelCheckinReminder,
  parseTime,
  requestNotificationPermissions,
  scheduleDailyCheckinReminder,
  skipTodayReminderIfCheckedIn,
} from '@/lib/notifications';
import { colors } from '@/theme/colors';
import { ZoneOrbeSplash } from '@/components/ZoneOrbeSplash';
import { ZoneText } from '@/components/ui/ZoneText';
import { OnboardingProvider } from '@/context/OnboardingContext';
import { SessionProvider } from '@/context/SessionContext';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

function SplashView(): React.ReactElement {
  return (
    <View style={styles.splash}>
      <ZoneOrbeSplash />
      <ZoneText
        variant="heading"
        style={{ marginTop: 28, fontSize: 32, color: colors.accent.gold, letterSpacing: 4 }}
      >
        ZONE
      </ZoneText>
    </View>
  );
}

async function setupCheckinReminder(uid: string): Promise<void> {
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return;
    const profile = await getUserProfile(uid);
    if (profile?.notifications_enabled === false) {
      await cancelCheckinReminder();
      return;
    }
    // No preference yet: schedule the default 08:00 reminder and persist it.
    if (!profile?.notification_time) {
      await scheduleDailyCheckinReminder(8, 0);
      await updateUserProfile(uid, {
        notifications_enabled: true,
        notification_time: '08:00',
      });
      return;
    }
    const { hour, minute } = parseTime(profile.notification_time);
    await scheduleDailyCheckinReminder(hour, minute);
    const todayCheckin = await getTodayCheckin(uid);
    if (todayCheckin) await skipTodayReminderIfCheckedIn(hour, minute, true);
  } catch {
    // notifications are best-effort
  }
}

async function syncHealthData(uid: string): Promise<void> {
  try {
    const profile = await getUserProfile(uid);
    if (
      profile?.health_data_source !== 'health_connect' &&
      profile?.health_data_source !== 'both'
    ) {
      return;
    }
    const data = await getTodayHealthData();
    const hasAny =
      data.sleepDurationHours !== null ||
      data.avgHeartRate !== null ||
      data.steps !== null ||
      data.weight !== null;
    if (!hasAny) return;
    await saveHealthSync(uid, {
      date: todayDateString(),
      source: 'health_connect',
      sleep_duration_hours: data.sleepDurationHours,
      sleep_quality: data.sleepQuality,
      avg_heart_rate: data.avgHeartRate,
      resting_heart_rate: data.restingHeartRate,
      hrv_ms: data.hrv,
      steps: data.steps,
      active_calories: data.activeCalories,
      weight_kg: data.weight,
    });
  } catch {
    // background sync is best-effort
  }
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
    void syncHealthData(user.uid);
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

  // Set up the daily check-in reminder once the user is onboarded.
  useEffect(() => {
    if (!user || onboardingCompleted !== true) return;
    void setupCheckinReminder(user.uid);
  }, [user, onboardingCompleted]);

  // Tapping the reminder opens the check-in screen.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen;
      if (screen === 'checkin') router.push('/(app)/checkin');
    });
    return () => sub.remove();
  }, [router]);

  if (loading || !onboardingChecked) return <SplashView />;

  return <Slot />;
}

export default function RootLayout(): React.ReactElement | null {
  const [fontsLoaded, fontError] = useFonts({
    BebasNeue: require('../assets/fonts/BebasNeue-Regular.ttf'),
    'BebasNeue-Regular': require('../assets/fonts/BebasNeue-Regular.ttf'),
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
    'Inter-Bold': require('../assets/fonts/Inter-Bold.ttf'),
    'Syne-Bold': Syne_700Bold,
    'Syne-SemiBold': Syne_600SemiBold,
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
