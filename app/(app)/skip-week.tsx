import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import {
  type HyroxProfile,
  type MuscleProfile,
  type RunningProfile,
  type UserProgram,
} from '@/lib/firestore';
import { useWeekBilans } from '@/hooks/useWeekBilans';
import { BilanCard } from '@/components/BilanCard';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';

export default function SkipWeekScreen(): React.ReactElement {
  const router = useRouter();
  const [program, setProgram] = useState<UserProgram | null>(null);
  const [runningProfile, setRunningProfile] = useState<RunningProfile | null>(null);
  const [muscleProfile, setMuscleProfile] = useState<MuscleProfile | null>(null);
  const [hyroxProfile, setHyroxProfile] = useState<HyroxProfile | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsubProg = onSnapshot(
      doc(db, 'users', user.uid, 'state', 'program'),
      (snap) => setProgram(snap.exists() ? (snap.data() as UserProgram) : null),
      () => setProgram(null),
    );
    const unsubRun = onSnapshot(
      doc(db, 'users', user.uid, 'state', 'running_profile'),
      (snap) => setRunningProfile(snap.exists() ? (snap.data() as RunningProfile) : null),
      () => setRunningProfile(null),
    );
    const unsubMuscle = onSnapshot(
      doc(db, 'users', user.uid, 'state', 'muscle_profile'),
      (snap) => setMuscleProfile(snap.exists() ? (snap.data() as MuscleProfile) : null),
      () => setMuscleProfile(null),
    );
    const unsubHyrox = onSnapshot(
      doc(db, 'users', user.uid, 'state', 'hyrox_profile'),
      (snap) => setHyroxProfile(snap.exists() ? (snap.data() as HyroxProfile) : null),
      () => setHyroxProfile(null),
    );
    return () => {
      unsubProg();
      unsubRun();
      unsubMuscle();
      unsubHyrox();
    };
  }, []);

  const { bilans, advance, repeat } = useWeekBilans({
    program,
    runningProfile,
    muscleProfile,
    hyroxProfile,
  });

  return (
    <SafeScreen>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={16} style={styles.back}>
          <ChevronLeft size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <ZoneText variant="heading" style={styles.title}>
          PASSER LA SEMAINE
        </ZoneText>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <ZoneText variant="body" color={colors.text.secondary} style={styles.intro}>
          Voici le bilan de tes sports avant d&apos;avancer. Tu peux confirmer le passage à la
          semaine suivante ou reprendre une semaine partielle.
        </ZoneText>
        {bilans.length === 0 ? (
          <View style={styles.empty}>
            <ZoneText variant="caption" color={colors.text.muted}>
              Aucun bilan disponible. Termine au moins une séance ou attends sept jours après
              le début de la semaine.
            </ZoneText>
          </View>
        ) : (
          bilans.map((b) => (
            <BilanCard
              key={b.sport}
              summary={b.summary}
              onAdvance={() => {
                void advance(b.sport).then(() => router.back());
              }}
              onRepeat={
                b.summary.result.shouldRepeat
                  ? () => {
                      void repeat(b.sport).then(() => router.back());
                    }
                  : undefined
              }
            />
          ))
        )}
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  back: { padding: 8 },
  title: { fontSize: 22, letterSpacing: 1, marginLeft: 4 },
  content: { paddingBottom: 32 },
  intro: { paddingHorizontal: 24, marginTop: 4, marginBottom: 12, lineHeight: 22 },
  empty: {
    marginHorizontal: 24,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
});
