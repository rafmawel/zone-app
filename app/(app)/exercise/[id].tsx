import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, RotateCcw } from 'lucide-react-native';
import { getExerciseById, type Exercise, type MuscleGroup } from '@/data/exercises';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { MuscleDiagram } from '@/components/MuscleDiagram';

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  quadriceps: 'Quadriceps',
  hamstrings: 'Ischio-jambiers',
  glutes: 'Fessiers',
  calves: 'Mollets',
  lower_back: 'Lombaires',
  upper_back: 'Dos haut',
  lats: 'Dorsaux',
  traps: 'Trapèzes',
  shoulders: 'Épaules',
  chest: 'Pectoraux',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Avant-bras',
  core: 'Abdominaux',
  hip_flexors: 'Psoas',
};

const CATEGORY_LABELS = {
  olympic_lift: 'Haltérophilie',
  squat: 'Squat',
  hinge: 'Charnière',
  push: 'Poussée',
  pull: 'Tirage',
  core: 'Gainage',
  accessory: 'Accessoire',
} as const;

const DIFFICULTY_LABELS = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  advanced: 'Avancé',
} as const;

const DIFFICULTY_COLORS = {
  beginner: colors.success,
  intermediate: colors.orbe.amber,
  advanced: colors.danger,
} as const;

function splitSteps(text: string): string[] {
  return text
    .split(/(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export default function ExerciseDetailScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const exercise: Exercise | undefined = getExerciseById(params.id ?? '');

  if (!exercise) {
    return (
      <SafeScreen>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} activeOpacity={0.7}>
            <ArrowLeft size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.notFound}>
          <ZoneText variant="heading" style={styles.notFoundTitle}>
            EXERCICE INTROUVABLE
          </ZoneText>
        </View>
      </SafeScreen>
    );
  }

  const steps = splitSteps(exercise.execution);

  return (
    <SafeScreen>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} activeOpacity={0.7}>
          <ArrowLeft size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ZoneText variant="heading" style={styles.title}>
          {exercise.name.toUpperCase()}
        </ZoneText>
        <View style={styles.metaRow}>
          <View style={styles.metaBadge}>
            <ZoneText variant="caption" color={colors.text.secondary} style={styles.metaBadgeText}>
              {CATEGORY_LABELS[exercise.category]}
            </ZoneText>
          </View>
          <View style={styles.metaInline}>
            <View
              style={[
                styles.difficultyDot,
                { backgroundColor: DIFFICULTY_COLORS[exercise.difficulty] },
              ]}
            />
            <ZoneText variant="caption" color={colors.text.muted}>
              {DIFFICULTY_LABELS[exercise.difficulty]}
            </ZoneText>
          </View>
        </View>

        <ZoneText variant="body" color={colors.text.secondary} style={styles.description}>
          {exercise.description}
        </ZoneText>

        <View style={styles.diagramCard}>
          <MuscleDiagram
            primary={exercise.muscles_primary}
            secondary={exercise.muscles_secondary}
          />
          <View style={styles.muscleSummary}>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.muscleSummaryLabel}>
              MUSCLES SOLLICITÉS
            </ZoneText>
            <View style={styles.muscleTagsRow}>
              {exercise.muscles_primary.map((m) => (
                <View key={`p-${m}`} style={[styles.muscleTag, styles.musclePrimary]}>
                  <ZoneText variant="caption" color={colors.accent.gold} style={styles.muscleTagText}>
                    {MUSCLE_LABELS[m]}
                  </ZoneText>
                </View>
              ))}
              {exercise.muscles_secondary.map((m) => (
                <View key={`s-${m}`} style={[styles.muscleTag, styles.muscleSecondary]}>
                  <ZoneText variant="caption" color={colors.orbe.blue} style={styles.muscleTagText}>
                    {MUSCLE_LABELS[m]}
                  </ZoneText>
                </View>
              ))}
            </View>
          </View>
        </View>

        <SectionCard title="MISE EN PLACE">
          <ZoneText variant="body" color={colors.text.primary} style={styles.sectionBody}>
            {exercise.setup}
          </ZoneText>
        </SectionCard>

        <SectionCard title="EXÉCUTION">
          {steps.map((s, i) => (
            <View key={i} style={styles.numberedRow}>
              <ZoneText variant="label" color={colors.accent.gold} style={styles.stepNumber}>
                {i + 1}
              </ZoneText>
              <ZoneText variant="body" color={colors.text.primary} style={styles.stepText}>
                {s}
              </ZoneText>
            </View>
          ))}
        </SectionCard>

        <SectionCard title="POINTS CLÉS">
          {exercise.cues.map((c, i) => (
            <View key={i} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <ZoneText variant="body" color={colors.text.primary} style={styles.bulletText}>
                {c}
              </ZoneText>
            </View>
          ))}
        </SectionCard>

        <SectionCard title="RESSENTI ATTENDU">
          <ZoneText
            variant="body"
            color={colors.accent.goldLight}
            style={styles.feelingText}
          >
            {exercise.feeling}
          </ZoneText>
        </SectionCard>

        <SectionCard title="ERREURS FRÉQUENTES">
          {exercise.common_errors.map((e, i) => (
            <View key={i} style={styles.warningRow}>
              <ZoneText variant="body" style={styles.warningIcon}>
                ⚠️
              </ZoneText>
              <ZoneText variant="body" color={colors.text.primary} style={styles.warningText}>
                {e}
              </ZoneText>
            </View>
          ))}
        </SectionCard>

        <View style={styles.paramsRow}>
          <ParamCell label="SÉRIES" value={`${exercise.default_sets}`} />
          <ParamCell label="REPS" value={exercise.default_reps} />
          <ParamCell
            label="REPOS"
            value={formatRest(exercise.default_rest_seconds)}
          />
        </View>

        <View style={styles.repeatRow}>
          <RotateCcw size={14} color={colors.text.muted} />
          <ZoneText variant="caption" color={colors.text.muted} style={styles.repeatText}>
            Valeurs par défaut · adaptables à ton programme
          </ZoneText>
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

function formatRest(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.round((seconds / 60) * 10) / 10;
  return Number.isInteger(min) ? `${min}min` : `${min}min`;
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <View style={styles.section}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.sectionEyebrow}>
        {title}
      </ZoneText>
      <View style={styles.sectionBodyWrap}>{children}</View>
    </View>
  );
}

function ParamCell({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.paramCell}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.paramLabel}>
        {label}
      </ZoneText>
      <ZoneText variant="heading" style={styles.paramValue}>
        {value}
      </ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSpacer: { width: 24 },
  content: { paddingHorizontal: 24, paddingBottom: 48 },
  title: { fontSize: 32, color: colors.text.primary, marginTop: 8, letterSpacing: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  metaBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.bg.elevated,
    borderRadius: 999,
    marginRight: 12,
  },
  metaBadgeText: { fontSize: 12 },
  metaInline: { flexDirection: 'row', alignItems: 'center' },
  difficultyDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  description: { marginTop: 16, lineHeight: 22 },
  diagramCard: {
    marginTop: 20,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  muscleSummary: { alignSelf: 'stretch', marginTop: 12 },
  muscleSummaryLabel: { letterSpacing: 1, marginBottom: 8 },
  muscleTagsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  muscleTag: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginRight: 6,
    marginBottom: 6,
  },
  musclePrimary: {
    backgroundColor: 'rgba(201,168,76,0.12)',
    borderColor: 'rgba(201,168,76,0.4)',
  },
  muscleSecondary: {
    backgroundColor: 'rgba(100,181,246,0.10)',
    borderColor: 'rgba(100,181,246,0.4)',
  },
  muscleTagText: { fontSize: 11 },
  section: {
    marginTop: 18,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
  sectionEyebrow: { letterSpacing: 1, fontSize: 12, marginBottom: 10 },
  sectionBodyWrap: {},
  sectionBody: { lineHeight: 22 },
  numberedRow: { flexDirection: 'row', marginBottom: 10 },
  stepNumber: {
    width: 22,
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    marginRight: 8,
    lineHeight: 22,
  },
  stepText: { flex: 1, lineHeight: 22 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent.gold,
    marginRight: 10,
  },
  bulletText: { flex: 1, lineHeight: 22 },
  feelingText: { fontStyle: 'italic', lineHeight: 22 },
  warningRow: { flexDirection: 'row', marginBottom: 8 },
  warningIcon: { marginRight: 8, fontSize: 14 },
  warningText: { flex: 1, lineHeight: 22 },
  paramsRow: { flexDirection: 'row', marginTop: 18 },
  paramCell: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  paramLabel: { fontSize: 11, letterSpacing: 1 },
  paramValue: { fontSize: 28, color: colors.accent.gold, marginTop: 2, lineHeight: 32 },
  repeatRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  repeatText: { marginLeft: 6, fontSize: 11 },
  notFound: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFoundTitle: { fontSize: 22, color: colors.text.muted },
});
