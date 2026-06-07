import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronDown, ChevronLeft, ChevronUp } from 'lucide-react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { getUserProgram, saveUserProgram } from '@/lib/firestore';
import { resetSportWeek } from '@/lib/weekTracking';
import type {
  HyroxProfile,
  MuscleProfile,
  RunningProfile,
  UserProgram,
} from '@/lib/firestore';
import {
  emojiForSport,
  getProgrammeDescription,
  type ProgrammeBlock,
  type ProgrammeDescription,
  type ProgrammeFaq,
  type ProgrammeProgressionStep,
} from '@/data/programmeDescriptions';
import { getSportConfig, type ProSport } from '@/lib/weekProgression';
import { labelForSport } from '@/lib/weekBilan';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';

const PROFILE_DOC_BY_SPORT: Record<string, string> = {
  weightlifting: 'program',
  running: 'running_profile',
  musculation: 'muscle_profile',
  hyrox: 'hyrox_profile',
};

const FALLBACK_INTRO =
  'Ce programme est en cours de rédaction détaillée. Voici ce que tu peux déjà savoir sur sa structure.';

interface ProfileSnapshot {
  hasProfile: boolean;
}

export default function ProgrammeOverviewScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ sport?: string }>();
  const sportParam = (params.sport ?? '').trim();
  const sport: ProSport = sportParam.length > 0 ? sportParam : 'weightlifting';

  const description = getProgrammeDescription(sport);
  const fallback = useMemo(() => buildFallbackDescription(sport), [sport]);
  const data = description ?? fallback;

  const [profile, setProfile] = useState<ProfileSnapshot>({ hasProfile: false });

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setProfile({ hasProfile: false });
      return;
    }
    const docName = PROFILE_DOC_BY_SPORT[sport];
    if (!docName) {
      setProfile({ hasProfile: false });
      return;
    }
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid, 'state', docName),
      (snap) => setProfile({ hasProfile: snap.exists() }),
      () => setProfile({ hasProfile: false }),
    );
    return unsubscribe;
  }, [sport]);

  const onRestartProgramme = (): void => {
    const user = auth.currentUser;
    if (!user) return;
    Alert.alert(
      `Recommencer le programme ${labelForSport(sport)} ?`,
      'Tu repartiras de la semaine 1. Tes maxes et ton historique sont conservés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Recommencer',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetSportWeek(user.uid, sport);
              if (sport === 'weightlifting') {
                const existing = await getUserProgram(user.uid);
                if (existing) {
                  await saveUserProgram(user.uid, {
                    ...existing,
                    current_block: 1,
                    current_week: 1,
                    current_day: 1,
                    mesocycle_start: new Date().toISOString().slice(0, 10),
                  });
                }
              }
              Alert.alert(
                'Programme réinitialisé',
                `Programme ${labelForSport(sport)} réinitialisé. Bonne reprise !`,
              );
            } catch {
              Alert.alert('Erreur', 'Impossible de réinitialiser le programme.');
            }
          },
        },
      ],
    );
  };

  const onPrimaryAction = (): void => {
    if (profile.hasProfile) {
      router.replace('/(app)/(tabs)');
      return;
    }
    const setupRoute = setupRouteForSport(sport);
    if (setupRoute) router.push(setupRoute);
    else router.replace('/(app)/(tabs)');
  };

  const primaryLabel = profile.hasProfile
    ? 'Voir mes séances'
    : 'Commencer le programme';

  return (
    <SafeScreen>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={16}
          style={styles.back}
        >
          <ChevronLeft size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.headerEyebrow}>
            PROGRAMME · {data.duration.toUpperCase()}
          </ZoneText>
        </View>
        <View style={styles.back}>
          <ZoneText variant="heading" style={styles.headerEmoji}>
            {emojiForSport(sport)}
          </ZoneText>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <HeroCard data={data} />
        <ScienceCard data={data} />
        <BlocksSection blocks={data.blocks} />
        <ProgressionSection steps={data.progression} />
        <BenefitsSection items={data.benefits} />
        <WarningsSection items={data.warnings} />
        <FaqSection items={data.faq} />
        {profile.hasProfile ? (
          <TouchableOpacity
            onPress={onRestartProgramme}
            activeOpacity={0.7}
            style={styles.restartLink}
          >
            <ZoneText variant="caption" color={colors.text.muted} style={styles.restartText}>
              Recommencer ce programme
            </ZoneText>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button title={primaryLabel} onPress={onPrimaryAction} />
      </View>
    </SafeScreen>
  );
}

function HeroCard({ data }: { data: ProgrammeDescription }): React.ReactElement {
  return (
    <View style={styles.hero}>
      <ZoneText variant="heading" style={styles.heroTitle}>
        {data.title.toUpperCase()}
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.secondary} style={styles.heroSubtitle}>
        {data.subtitle}
      </ZoneText>
      <View style={styles.pillRow}>
        <View style={styles.pill}>
          <ZoneText variant="caption" color={colors.accent.gold} style={styles.pillText}>
            {data.duration}
          </ZoneText>
        </View>
        <View style={styles.pill}>
          <ZoneText variant="caption" color={colors.accent.gold} style={styles.pillText}>
            {data.sessionsPerWeek}
          </ZoneText>
        </View>
      </View>
      <ZoneText variant="body" color={colors.text.primary} style={styles.heroObjective}>
        {data.objective}
      </ZoneText>
    </View>
  );
}

function ScienceCard({
  data,
}: {
  data: ProgrammeDescription;
}): React.ReactElement {
  return (
    <View style={styles.scienceCard}>
      <ZoneText variant="caption" color={colors.accent.gold} style={styles.sectionEyebrow}>
        LA SCIENCE DERRIÈRE
      </ZoneText>
      <ZoneText variant="heading" style={styles.scienceMethod}>
        {data.science.method.toUpperCase()}
      </ZoneText>
      <ZoneText
        variant="caption"
        color={colors.text.muted}
        style={styles.scienceReference}
      >
        {data.science.reference}
      </ZoneText>
      <ZoneText variant="body" color={colors.text.primary} style={styles.sciencePrinciple}>
        {data.science.principle}
      </ZoneText>
    </View>
  );
}

function BlocksSection({
  blocks,
}: {
  blocks: ProgrammeBlock[];
}): React.ReactElement {
  return (
    <View style={styles.section}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.sectionEyebrow}>
        COMMENT ÇA SE CONSTRUIT
      </ZoneText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.blocksScroll}
      >
        {blocks.map((b, i) => (
          <BlockCard key={`${b.name}-${i}`} block={b} />
        ))}
      </ScrollView>
    </View>
  );
}

function BlockCard({ block }: { block: ProgrammeBlock }): React.ReactElement {
  return (
    <View style={[styles.blockCard, { borderTopColor: block.color }]}>
      <ZoneText variant="caption" color={block.color} style={styles.blockEyebrow}>
        {block.name}
      </ZoneText>
      <ZoneText variant="label" style={styles.blockWeeks}>
        {block.weeks}
      </ZoneText>
      <Row label="Intensité" value={block.intensity} />
      <Row label="Volume" value={block.volume} />
      <Row label="Séance" value={block.sessionDuration} />
      <ZoneText
        variant="caption"
        color={colors.text.secondary}
        style={styles.blockGoal}
      >
        {block.goal}
      </ZoneText>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.blockRow}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.blockRowLabel}>
        {label}
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.primary} style={styles.blockRowValue}>
        {value}
      </ZoneText>
    </View>
  );
}

function ProgressionSection({
  steps,
}: {
  steps: ProgrammeProgressionStep[];
}): React.ReactElement | null {
  if (steps.length === 0) return null;
  return (
    <View style={styles.section}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.sectionEyebrow}>
        CE QUE TU VAS RESSENTIR
      </ZoneText>
      <View style={styles.timeline}>
        {steps.map((s, i) => (
          <View key={`${s.week}-${i}`} style={styles.timelineRow}>
            <View style={styles.timelineDotCol}>
              <View style={styles.timelineDot} />
              {i < steps.length - 1 ? <View style={styles.timelineLine} /> : null}
            </View>
            <View style={styles.timelineContent}>
              <ZoneText variant="label" style={styles.timelineWeek}>
                {s.week}
              </ZoneText>
              <ZoneText
                variant="body"
                color={colors.text.secondary}
                style={styles.timelineDesc}
              >
                {s.description}
              </ZoneText>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function BenefitsSection({ items }: { items: string[] }): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.sectionEyebrow}>
        CE QUE TU VAS GAGNER
      </ZoneText>
      <View style={styles.listBlock}>
        {items.map((it, i) => (
          <View key={`${it}-${i}`} style={styles.listRow}>
            <ZoneText
              variant="label"
              color={colors.accent.gold}
              style={styles.benefitMark}
            >
              ✓
            </ZoneText>
            <ZoneText
              variant="body"
              color={colors.text.primary}
              style={styles.listText}
            >
              {it}
            </ZoneText>
          </View>
        ))}
      </View>
    </View>
  );
}

function WarningsSection({ items }: { items: string[] }): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.sectionEyebrow}>
        À NE PAS FAIRE
      </ZoneText>
      <View style={[styles.listBlock, styles.warningBlock]}>
        {items.map((it, i) => (
          <View key={`${it}-${i}`} style={styles.listRow}>
            <ZoneText
              variant="label"
              color={colors.orbe.amber}
              style={styles.warningMark}
            >
              !
            </ZoneText>
            <ZoneText
              variant="body"
              color={colors.text.primary}
              style={styles.listText}
            >
              {it}
            </ZoneText>
          </View>
        ))}
      </View>
    </View>
  );
}

function FaqSection({ items }: { items: ProgrammeFaq[] }): React.ReactElement | null {
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.sectionEyebrow}>
        QUESTIONS FRÉQUENTES
      </ZoneText>
      <View style={styles.faqList}>
        {items.map((q, i) => (
          <FaqRow key={`${q.question}-${i}`} item={q} />
        ))}
      </View>
    </View>
  );
}

function FaqRow({ item }: { item: ProgrammeFaq }): React.ReactElement {
  const [open, setOpen] = useState<boolean>(false);
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => setOpen((o) => !o)}
      style={styles.faqRow}
    >
      <View style={styles.faqHeader}>
        <ZoneText
          variant="label"
          color={colors.text.primary}
          style={styles.faqQuestion}
        >
          {item.question}
        </ZoneText>
        {open ? (
          <ChevronUp size={18} color={colors.text.muted} />
        ) : (
          <ChevronDown size={18} color={colors.text.muted} />
        )}
      </View>
      {open ? (
        <ZoneText
          variant="body"
          color={colors.text.secondary}
          style={styles.faqAnswer}
        >
          {item.answer}
        </ZoneText>
      ) : null}
    </TouchableOpacity>
  );
}

function setupRouteForSport(sport: ProSport): string | null {
  switch (sport) {
    case 'weightlifting':
      return '/(app)/maxes';
    case 'running':
      return '/(app)/running-setup';
    case 'musculation':
      return '/(app)/muscle-setup';
    case 'hyrox':
      return '/(app)/hyrox-setup';
    default:
      return null;
  }
}

function buildFallbackDescription(sport: ProSport): ProgrammeDescription {
  const cfg = getSportConfig(sport);
  const label = labelForSport(sport);
  return {
    sport,
    title: `Programme ${label}`,
    subtitle: 'Aperçu générique',
    duration: '12 semaines',
    sessionsPerWeek: 'Adapté à ta fréquence',
    objective: FALLBACK_INTRO,
    science: {
      method: cfg.progressionType.toUpperCase(),
      reference:
        'Description détaillée à venir. La structure du programme suit le moteur de progression hebdomadaire.',
      principle: `Progression de type ${cfg.progressionType}, avec un seuil de complétion optimale à ${Math.round(cfg.completionThresholds.optimal * 100)} %.`,
    },
    blocks: [
      {
        name: 'BLOC 1 · BASE',
        weeks: 'Semaines 1-4',
        intensity: 'Modérée',
        volume: 'Progressif',
        goal: "Installer la routine, calibrer ton niveau réel.",
        sessionDuration: '45 à 60 min',
        color: '#64B5F6',
      },
      {
        name: 'BLOC 2 · DÉVELOPPEMENT',
        weeks: 'Semaines 5-8',
        intensity: 'Élevée',
        volume: 'Optimal',
        goal: 'Pousser le stimulus pour générer des adaptations.',
        sessionDuration: '50 à 70 min',
        color: '#C9A84C',
      },
      {
        name: 'BLOC 3 · PIC',
        weeks: 'Semaines 9-12',
        intensity: 'Maximale puis affûtage',
        volume: 'Réduit',
        goal: 'Convertir le travail en performance puis récupérer.',
        sessionDuration: '40 à 60 min',
        color: '#E57373',
      },
    ],
    progression: [],
    benefits: [
      "Sport reconnu par l'engine de progression Zone",
      'Adapté automatiquement à ta fréquence hebdomadaire',
      'Bilan de semaine intégré avec ajustements',
    ],
    warnings: [
      "Respecte les jours de repos prévus par l'engine.",
    ],
    faq: [],
  };
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
  },
  back: { padding: 8, minWidth: 44, alignItems: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerEyebrow: { letterSpacing: 2, fontSize: 11 },
  headerEmoji: { fontSize: 22, lineHeight: 26 },
  scrollContent: { paddingBottom: 32 },
  hero: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 16 },
  heroTitle: { fontSize: 28, letterSpacing: 1 },
  heroSubtitle: { marginTop: 4, fontSize: 13 },
  pillRow: { flexDirection: 'row', marginTop: 14, gap: 8 },
  pill: {
    backgroundColor: colors.bg.card,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.accent.goldDark,
  },
  pillText: { fontSize: 11, fontFamily: 'Inter-Medium' },
  heroObjective: { marginTop: 16, lineHeight: 22, fontSize: 15 },
  scienceCard: {
    marginHorizontal: 24,
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.gold,
    borderRadius: 14,
    padding: 16,
  },
  sectionEyebrow: { letterSpacing: 2, fontSize: 11, fontFamily: 'Inter-Bold' },
  scienceMethod: {
    fontSize: 20,
    marginTop: 8,
    letterSpacing: 1,
    lineHeight: 24,
  },
  scienceReference: { marginTop: 8, fontStyle: 'italic', lineHeight: 16 },
  sciencePrinciple: { marginTop: 12, lineHeight: 22, fontSize: 15 },
  section: { marginTop: 24, paddingHorizontal: 24 },
  blocksScroll: { paddingTop: 12, paddingRight: 24, gap: 12 },
  blockCard: {
    width: 240,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopWidth: 3,
    borderRadius: 14,
    padding: 14,
  },
  blockEyebrow: { letterSpacing: 1, fontSize: 11, fontFamily: 'Inter-Bold' },
  blockWeeks: { marginTop: 4, fontSize: 13 },
  blockRow: { flexDirection: 'row', marginTop: 8 },
  blockRowLabel: { width: 72, fontSize: 11 },
  blockRowValue: { flex: 1, fontSize: 12, lineHeight: 16 },
  blockGoal: { marginTop: 12, lineHeight: 17 },
  timeline: { marginTop: 12 },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start' },
  timelineDotCol: { width: 16, alignItems: 'center', paddingTop: 4 },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent.gold,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginTop: 4,
    minHeight: 18,
  },
  timelineContent: { flex: 1, marginLeft: 8, paddingBottom: 18 },
  timelineWeek: { fontSize: 13 },
  timelineDesc: { marginTop: 4, lineHeight: 20 },
  listBlock: {
    marginTop: 12,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
  },
  warningBlock: { borderLeftWidth: 3, borderLeftColor: colors.orbe.amber },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: 6 },
  listText: { flex: 1, lineHeight: 20, fontSize: 14 },
  benefitMark: {
    width: 22,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'Inter-Bold',
  },
  warningMark: {
    width: 22,
    fontSize: 16,
    lineHeight: 20,
    fontFamily: 'Inter-Bold',
  },
  faqList: { marginTop: 12 },
  faqRow: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  faqHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  faqQuestion: { flex: 1, fontSize: 14, lineHeight: 18 },
  faqAnswer: { marginTop: 10, lineHeight: 20, fontSize: 14 },
  restartLink: { alignSelf: 'center', marginTop: 28, paddingVertical: 12 },
  restartText: { fontSize: 12, fontFamily: 'Inter-Medium', textDecorationLine: 'underline' },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: colors.bg.primary,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});

