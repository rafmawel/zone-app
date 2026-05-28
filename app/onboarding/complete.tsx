import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { auth } from '@/lib/firebase';
import { setUserSport, updateUserProfile, type UserSport } from '@/lib/firestore';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';
import { ZoneOrbe } from '@/components/ZoneOrbe';
import { useOnboarding } from '@/context/OnboardingContext';
import { colors } from '@/theme/colors';

export default function CompleteScreen(): React.ReactElement {
  const router = useRouter();
  const {
    level,
    gender,
    selectedSports,
    sportConfigs,
    sessions_organization,
    optimize_global_progression,
    health_data_source,
  } = useOnboarding();
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user) {
      setError('Session expirée. Reconnecte-toi.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateUserProfile(user.uid, {
        level,
        ...(gender ? { gender } : {}),
        onboarding_completed: true,
        health_data_source,
        sessions_organization,
        ...(optimize_global_progression !== null
          ? { optimize_global_progression: optimize_global_progression ?? false }
          : {}),
        zone_score: 50,
      });

      const activeSports = selectedSports.filter(
        (s) => s === 'halterophilie' || s === 'course',
      );
      for (const sport of activeSports) {
        const cfg = sportConfigs[sport];
        if (!cfg || !cfg.level || !cfg.goal) continue;
        const payload: UserSport = {
          sport_key: sport,
          level: cfg.level,
          goal: cfg.goal,
          sessions_per_week: cfg.sessions_per_week,
          ...(cfg.equipment ? { equipment: cfg.equipment } : {}),
        };
        await setUserSport(user.uid, sport, payload);
      }

      router.replace('/(app)/');
    } catch {
      setError("Impossible d'enregistrer ton profil. Réessaie.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeScreen>
      <View style={styles.center}>
        <ZoneOrbe score={50} size={120} animated />
        <ZoneText variant="heading" style={styles.title}>
          TON PROFIL EST PRÊT
        </ZoneText>
        <ZoneText variant="body" color={colors.text.secondary} style={styles.subtitle}>
          Bienvenue dans la zone.
        </ZoneText>
        {error ? (
          <ZoneText variant="caption" color={colors.danger} style={styles.message}>
            {error}
          </ZoneText>
        ) : null}
      </View>
      <View style={styles.footer}>
        <Button title="Commencer" loading={saving} onPress={handleStart} />
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 36, marginTop: 40, textAlign: 'center', letterSpacing: 2 },
  subtitle: { marginTop: 12, textAlign: 'center' },
  message: { marginTop: 16, textAlign: 'center' },
  footer: { padding: 24, paddingTop: 8 },
});
