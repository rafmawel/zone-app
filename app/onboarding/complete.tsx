import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import { auth } from '@/lib/firebase';
import { setUserSport, updateUserProfile, type UserSport } from '@/lib/firestore';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';
import { ZoneOrbe } from '@/components/ZoneOrbe';
import { useOnboarding } from '@/context/OnboardingContext';
import { colors } from '@/theme/colors';

type LineKind = 'muted' | 'gold' | 'big';

interface IntroLine {
  text: string;
  kind: LineKind;
  /** Appear time in ms, including the dramatic pauses. */
  at: number;
}

const LINES: IntroLine[] = [
  { text: 'Dans le sport de haut niveau,', kind: 'muted', at: 300 },
  { text: 'il existe un état que tout athlète recherche.', kind: 'muted', at: 600 },
  { text: 'Un moment où chaque geste devient instinctif.', kind: 'muted', at: 1300 },
  { text: 'Où la fatigue s’efface.', kind: 'muted', at: 1600 },
  { text: 'Où ton corps et ton esprit ne font plus qu’un.', kind: 'muted', at: 1900 },
  { text: 'Les basketteurs l’appellent la Zone.', kind: 'gold', at: 2600 },
  { text: 'Les haltérophiles le cherchent sur chaque arraché.', kind: 'gold', at: 2900 },
  { text: 'Les coureurs le ressentent sur certaines sorties.', kind: 'gold', at: 3200 },
  { text: 'Zone mesure ta capacité', kind: 'big', at: 4000 },
  { text: 'à l’atteindre aujourd’hui.', kind: 'big', at: 4300 },
];

const BUTTON_AT = 4900;

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
  const [visibleCount, setVisibleCount] = useState<number>(0);
  const [showButton, setShowButton] = useState<boolean>(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    LINES.forEach((line, i) => {
      timers.current.push(setTimeout(() => setVisibleCount(i + 1), line.at));
    });
    timers.current.push(setTimeout(() => setShowButton(true), BUTTON_AT));
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

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
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.orbWrap}>
          <ZoneOrbe size={160} score={50} animated />
        </View>

        <View style={styles.textWrap}>
          {LINES.map((line, i) =>
            i < visibleCount ? (
              <Animated.View key={i} entering={FadeIn.duration(500)}>
                <ZoneText
                  variant={line.kind === 'big' ? 'label' : 'body'}
                  style={[
                    styles.line,
                    line.kind === 'muted' ? styles.lineMuted : null,
                    line.kind === 'gold' ? styles.lineGold : null,
                    line.kind === 'big' ? styles.lineBig : null,
                  ]}
                >
                  {line.text}
                </ZoneText>
              </Animated.View>
            ) : null,
          )}
          {error ? (
            <ZoneText variant="caption" color={colors.danger} style={styles.error}>
              {error}
            </ZoneText>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        {showButton ? (
          <Animated.View entering={FadeIn.duration(600)}>
            <Button title="ENTRER DANS LA ZONE" loading={saving} onPress={handleStart} />
          </Animated.View>
        ) : null}
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 28, paddingTop: 24 },
  orbWrap: { height: 220, alignItems: 'center', justifyContent: 'center' },
  textWrap: { alignItems: 'center', paddingBottom: 24 },
  line: { textAlign: 'center', marginTop: 6, lineHeight: 22 },
  lineMuted: { color: colors.text.muted },
  lineGold: { color: colors.accent.gold, fontFamily: 'Inter-Medium' },
  lineBig: { color: colors.text.primary, fontSize: 20, fontFamily: 'Inter-Bold', marginTop: 10, lineHeight: 26 },
  error: { marginTop: 16, textAlign: 'center' },
  footer: { padding: 24, paddingTop: 8 },
});
