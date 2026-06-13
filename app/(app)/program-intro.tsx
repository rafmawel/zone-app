import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { auth } from '@/lib/firebase';
import {
  getExerciseMaxes,
  getUserProgram,
  type ExerciseMax,
  type UserProgram,
} from '@/lib/firestore';
import {
  previewWeightliftingSession,
  type SessionExercisePreview,
  type WeightliftingSessionPreview,
} from '@/lib/programEngine';
import { getExerciseById } from '@/data/exercises';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';

interface BlockOverview {
  icon: string;
  title: string;
  weeks: string;
  summary: string;
  intensity: string;
  duration: string;
  goal: string;
}

const BLOCKS: BlockOverview[] = [
  {
    icon: '📈',
    title: 'BLOC 1 · ACCUMULATION',
    weeks: 'Semaines 1 à 3',
    summary: 'Construction des bases neurales',
    intensity: 'Intensité: 65-75% · Volume modéré',
    duration: 'Séances: ~35-45 min',
    goal: 'Objectif: apprendre les patterns de mouvement',
  },
  {
    icon: '💪',
    title: 'BLOC 2 · INTENSIFICATION',
    weeks: 'Semaines 4 à 6',
    summary: 'Montée en charge progressive',
    intensity: 'Intensité: 75-85% · Volume élevé',
    duration: 'Séances: ~50-60 min',
    goal: 'Objectif: développer la force maximale',
  },
  {
    icon: '🎯',
    title: 'BLOC 3 · RÉALISATION',
    weeks: 'Semaines 7 à 9',
    summary: 'Pics de performance',
    intensity: 'Intensité: 85-95% · Volume réduit',
    duration: 'Séances: ~45-55 min',
    goal: 'Objectif: atteindre tes nouveaux maxes',
  },
  {
    icon: '🔄',
    title: 'DÉCHARGE · ADAPTATION',
    weeks: 'Semaines 10 à 12',
    summary: 'Récupération et consolidation',
    intensity: 'Intensité: 60-70% · Volume faible',
    duration: 'Séances: ~30-40 min',
    goal: "Objectif: laisser le corps s'adapter",
  },
];

function previewLine(ex: SessionExercisePreview): string {
  const name = getExerciseById(ex.exerciseId)?.name ?? ex.exerciseId;
  if (ex.display) return `${name} — ${ex.display}`;
  const pct = ex.pct != null ? ` @ ${ex.pct}%` : '';
  return `${name} — ${ex.sets} séries × ${ex.reps} reps${pct}`;
}

export default function ProgramIntroScreen(): React.ReactElement {
  const router = useRouter();
  const [firstSession, setFirstSession] = useState<WeightliftingSessionPreview | null>(
    null,
  );

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const [program, maxes]: [UserProgram | null, ExerciseMax[]] = await Promise.all([
          getUserProgram(user.uid),
          getExerciseMaxes(user.uid),
        ]);
        if (cancelled) return;
        const base: UserProgram =
          program ??
          ({
            current_block: 1,
            current_week: 1,
            current_day: 1,
            sessions_per_week: 3,
            level: 'intermediaire',
          } as UserProgram);
        setFirstSession(previewWeightliftingSession(base, maxes, 1));
      } catch {
        if (!cancelled) setFirstSession(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeScreen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ZoneText variant="heading" size={36} color={colors.scoreGreen} style={styles.title}>
          TON PROGRAMME · 12 SEMAINES
        </ZoneText>
        <ZoneText variant="label" color={colors.text.secondary} style={styles.subtitle}>
          Voici comment tu vas progresser
        </ZoneText>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.blocksRow}
        >
          {BLOCKS.map((b) => (
            <View key={b.title} style={styles.blockCard}>
              <ZoneText style={styles.blockIcon}>{b.icon}</ZoneText>
              <ZoneText variant="heading" size={18} color={colors.scoreGreen} style={styles.blockTitle}>
                {b.title}
              </ZoneText>
              <ZoneText variant="caption" color={colors.text.muted} style={styles.blockWeeks}>
                {b.weeks}
              </ZoneText>
              <ZoneText variant="body" size={13} color={colors.text.primary} style={styles.blockSummary}>
                {b.summary}
              </ZoneText>
              <ZoneText variant="caption" color={colors.text.secondary} style={styles.blockMeta}>
                {b.intensity}
              </ZoneText>
              <ZoneText variant="caption" color={colors.text.secondary} style={styles.blockMeta}>
                {b.duration}
              </ZoneText>
              <ZoneText variant="caption" color={colors.text.muted} style={styles.blockGoal}>
                {b.goal}
              </ZoneText>
            </View>
          ))}
        </ScrollView>

        <View style={styles.infoCard}>
          <ZoneText variant="label" color={colors.scoreGreen} style={styles.infoTitle}>
            Pourquoi ma première séance est courte ?
          </ZoneText>
          <ZoneText variant="body" size={13} color={colors.text.primary} style={styles.infoBody}>
            Le Bloc 1 est intentionnellement modéré. Ton système nerveux doit
            d'abord apprendre les patterns de mouvement avant d'augmenter la
            charge. C'est la base de toute progression en haltérophilie.
          </ZoneText>
        </View>

        {firstSession ? (
          <View style={styles.sessionCard}>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.sessionEyebrow}>
              PREMIÈRE SÉANCE
            </ZoneText>
            <ZoneText variant="heading" size={20} color={colors.text.primary} style={styles.sessionTitle}>
              {firstSession.title}
            </ZoneText>
            {firstSession.exercises.map((ex) => (
              <View key={ex.exerciseId} style={styles.exerciseRow}>
                <ZoneText variant="body" size={13} color={colors.scoreGreen}>
                  •
                </ZoneText>
                <ZoneText variant="body" size={13} color={colors.text.primary} style={styles.exerciseText}>
                  {previewLine(ex)}
                </ZoneText>
              </View>
            ))}
            <ZoneText variant="caption" color={colors.text.muted} style={styles.sessionDuration}>
              Durée estimée: ~{firstSession.durationMin} min
            </ZoneText>
          </View>
        ) : null}

        <View style={styles.cta}>
          <Button
            title="COMMENCER MON PROGRAMME"
            onPress={() => router.replace('/(app)/(tabs)/aujourd-hui')}
          />
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  title: { letterSpacing: 1.5, lineHeight: 40 },
  subtitle: { marginTop: 6, marginBottom: 20 },
  blocksRow: { paddingRight: 8, gap: 12 },
  blockCard: {
    width: 220,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
  blockIcon: { fontSize: 28 },
  blockTitle: { marginTop: 8, letterSpacing: 0.5 },
  blockWeeks: { marginTop: 2 },
  blockSummary: { marginTop: 10, lineHeight: 18 },
  blockMeta: { marginTop: 6, lineHeight: 16 },
  blockGoal: { marginTop: 10, lineHeight: 16, fontStyle: 'italic' },
  infoCard: {
    marginTop: 24,
    backgroundColor: 'rgba(201,168,76,0.08)',
    borderWidth: 1,
    borderColor: colors.scoreGreen,
    borderRadius: 16,
    padding: 16,
  },
  infoTitle: { marginBottom: 8 },
  infoBody: { lineHeight: 20 },
  sessionCard: {
    marginTop: 20,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
  sessionEyebrow: { letterSpacing: 2, fontSize: 11 },
  sessionTitle: { marginTop: 4, marginBottom: 12, letterSpacing: 1 },
  exerciseRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5 },
  exerciseText: { flex: 1, lineHeight: 18 },
  sessionDuration: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cta: { marginTop: 28 },
});
