import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { auth } from '@/lib/firebase';
import { setUserSport, updateUserProfile, type UserSport } from '@/lib/firestore';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';
import { PulsingOrb } from '@/components/PulsingOrb';
import { useOnboarding } from '@/context/OnboardingContext';
import { colors } from '@/theme/colors';

export default function CompleteScreen(): React.ReactElement {
  const router = useRouter();
  const {
    level,
    selectedSports,
    sportConfigs,
    sessions_organization,
    optimize_global_progression,
    health_data_source,
  } = useOnboarding();
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    async function persist(): Promise<void> {
      const user = auth.currentUser;
      if (!user) return;
      setSaving(true);
      try {
        await updateUserProfile(user.uid, {
          level,
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
        if (!cancelled) setSaved(true);
      } catch {
        if (!cancelled) setError("Une erreur est survenue lors de l'enregistrement.");
      } finally {
        if (!cancelled) setSaving(false);
      }
    }
    void persist();
    return () => {
      cancelled = true;
    };
  }, [

    level,
    selectedSports,
    sportConfigs,
    sessions_organization,
    optimize_global_progression,
    health_data_source,
  ]);

  return (
    <SafeScreen>
      <View style={styles.center}>
        <PulsingOrb size={120} />
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
        <Button
          title="Commencer"
          loading={saving}
          disabled={!saved && !error}
          onPress={() => router.replace('/(app)')}
        />
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
