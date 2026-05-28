import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Lock, Sparkles } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import {
  ALL_PRO_SPORTS,
  SPORT_LABELS,
  SPORT_PRICES,
  type ProSport,
} from '@/types/subscription';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';
import {
  analyzeSleepDebt,
  calculateACWR,
  calculatePerformanceModel,
  calculateProReadiness,
  getFormStatus,
  getWeeklyLoadBudget,
  type WorkloadDataPoint,
  type WorkloadSport,
} from '@/lib/pro';
import type { ExerciseMax, RunningProfile, TrainingSession } from '@/lib/firestore';
import { ProReadinessCard } from './ProReadinessCard';
import { FormFatigueCard } from './FormFatigueCard';
import { ACWRCard } from './ACWRCard';
import { SportProgressionCard } from './SportProgressionCard';
import { PredictionsCard } from './PredictionsCard';
import { CoachZoneCard } from './CoachZoneCard';

const BENEFITS: string[] = [
  'Ton niveau de forme réel — pas une estimation',
  'Si tu pousses trop fort ou pas assez',
  'Quand est ton prochain pic de forme',
  'Ce que ton coach te dirait chaque semaine',
  'Tes projections sur 2 mois',
];

const DEMO_SPORTS: WorkloadSport[] = ['weightlifting', 'running'];

const SPORT_ICONS: Record<ProSport, string> = {
  running: '🏃',
  hyrox: '🔥',
  musculation: '💪',
  weightlifting: '🏋️',
};

const SPORT_UNLOCK_LABELS: Record<ProSport, string> = {
  running: 'DÉBLOQUER LA COURSE',
  hyrox: 'DÉBLOQUER HYROX',
  musculation: 'DÉBLOQUER LA MUSCULATION',
  weightlifting: "DÉBLOQUER L'HALTÉROPHILIE",
};

function isoFromOffset(offsetDays: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

/** 8 weeks of realistic training for the fictional athlete Antoine. */
function buildDemoWorkload(): WorkloadDataPoint[] {
  const out: WorkloadDataPoint[] = [];
  for (let day = 55; day >= 0; day -= 1) {
    const weekday = (new Date(isoFromOffset(day)).getUTCDay() + 6) % 7;
    const weekIdx = Math.floor((55 - day) / 7); // 0..7, load ramps up
    const ramp = 1 + weekIdx * 0.06;
    let tss = 0;
    let sport: WorkloadSport = 'running';
    let sessionType = 'easy';
    if (weekday === 0) {
      tss = 70 * ramp;
      sport = 'weightlifting';
      sessionType = 'strength';
    } else if (weekday === 1) {
      tss = 55 * ramp;
      sport = 'running';
      sessionType = 'tempo';
    } else if (weekday === 3) {
      tss = 75 * ramp;
      sport = 'weightlifting';
      sessionType = 'strength';
    } else if (weekday === 5) {
      tss = 90 * ramp;
      sport = 'running';
      sessionType = 'long';
    }
    if (tss > 0) {
      out.push({
        date: isoFromOffset(day),
        tss: Math.round(tss),
        sport,
        sessionType,
        durationMinutes: 60,
        intensityFactor: 0.8,
      });
    }
  }
  return out;
}

function buildDemoCheckins(): { date: string; sleep_duration: number; sleep_quality: number }[] {
  return Array.from({ length: 7 }, (_, i) => ({
    date: isoFromOffset(6 - i),
    sleep_duration: 6.2,
    sleep_quality: 3,
  }));
}

const DEMO_MAXES: ExerciseMax[] = [
  { exercise_id: 'snatch', weight_kg: 52, reps: 1, estimated_1rm: 52, date: isoFromOffset(40), is_pr: false },
  { exercise_id: 'clean_and_jerk', weight_kg: 65, reps: 1, estimated_1rm: 65, date: isoFromOffset(3), is_pr: true },
];

const DEMO_RUNNING_PROFILE: RunningProfile = {
  vdot: 47,
  easy_pace_sec_per_km: 330,
  goal: 'performance',
  reference_distance: '10km',
  reference_time_seconds: 49 * 60 + 20,
  sessions_per_week: 3,
  target_race_date: null,
  long_run_pref: 'dimanche',
  updated_at: null,
};

const DEMO_SESSIONS: TrainingSession[] = [];

function frenchRiskLabel(level: string): string {
  switch (level) {
    case 'optimal':
      return 'parfait';
    case 'caution':
      return 'à surveiller';
    case 'danger':
      return 'trop élevé';
    default:
      return 'sous-charge';
  }
}

export function LockedAnalytics(): React.ReactElement {
  const router = useRouter();
  const [tab, setTab] = useState<'demo' | 'mine'>('demo');

  const openPaywall = (): void => router.push('/(app)/paywall');

  const demo = useMemo(() => {
    const workload = buildDemoWorkload();
    const today = isoFromOffset(0);
    const metrics = calculatePerformanceModel(workload, 120);
    const acwr = calculateACWR(workload, today);
    const budget = getWeeklyLoadBudget(acwr);
    const sleepDebt = analyzeSleepDebt(buildDemoCheckins());
    const tsb = metrics[metrics.length - 1]?.tsb ?? 0;
    const readiness = calculateProReadiness({
      zoneScore: 71,
      acwr,
      sleepDebt,
      tsb,
      activeSports: DEMO_SPORTS,
    });
    return { workload, metrics, acwr, budget, sleepDebt, tsb, readiness };
  }, []);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Sparkles size={44} color={colors.accent.gold} />
          <ZoneText variant="heading" size={44} color={colors.accent.gold} style={styles.title}>
            ZONE PRO
          </ZoneText>
          <ZoneText variant="label" size={16} color={colors.text.primary} style={styles.pitch}>
            Avec Zone Pro, tu sais exactement quand entrer dans la Zone.
          </ZoneText>
        </View>

        <View style={styles.benefits}>
          {BENEFITS.map((b) => (
            <View key={b} style={styles.benefit}>
              <ZoneText variant="body" size={14} color={colors.accent.gold}>
                ✦
              </ZoneText>
              <ZoneText variant="body" size={14} color={colors.text.primary} style={styles.benefitText}>
                {b}
              </ZoneText>
            </View>
          ))}
        </View>

        <ZoneText variant="label" size={14} color={colors.text.primary} style={styles.sportsHeading}>
          Choisissez vos sports
        </ZoneText>
        <View style={styles.sportGrid}>
          {ALL_PRO_SPORTS.map((sport) => (
            <View key={sport} style={styles.sportUnlockCard}>
              <ZoneText style={styles.sportUnlockIcon}>{SPORT_ICONS[sport]}</ZoneText>
              <ZoneText variant="label" size={13} color={colors.text.primary} style={styles.sportUnlockName}>
                Zone Pro {SPORT_LABELS[sport]}
              </ZoneText>
              <ZoneText variant="caption" color={colors.accent.gold} style={styles.sportUnlockPrice}>
                {SPORT_PRICES[sport]}/mois
              </ZoneText>
              <TouchableOpacity onPress={openPaywall} activeOpacity={0.85} style={styles.sportUnlockBtn}>
                <ZoneText variant="caption" size={11} color={colors.accent.gold} style={styles.sportUnlockBtnText}>
                  {SPORT_UNLOCK_LABELS[sport]}
                </ZoneText>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <ZoneText variant="caption" color={colors.text.muted} style={styles.peek}>
          Regarde à quoi ça ressemble ↓
        </ZoneText>

        <View style={styles.tabs}>
          <TouchableOpacity
            onPress={() => setTab('demo')}
            activeOpacity={0.8}
            style={[styles.tab, tab === 'demo' ? styles.tabActive : styles.tabIdle]}
          >
            <ZoneText
              variant="caption"
              color={tab === 'demo' ? colors.bg.primary : colors.text.secondary}
              style={styles.tabText}
            >
              Démo Antoine ✦
            </ZoneText>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('mine')}
            activeOpacity={0.8}
            style={[styles.tab, tab === 'mine' ? styles.tabActive : styles.tabIdle]}
          >
            <Lock size={12} color={tab === 'mine' ? colors.bg.primary : colors.accent.gold} />
            <ZoneText
              variant="caption"
              color={tab === 'mine' ? colors.bg.primary : colors.text.secondary}
              style={styles.tabText}
            >
              Mes données
            </ZoneText>
          </TouchableOpacity>
        </View>

        {tab === 'demo' ? (
          <>
            <View style={styles.previewBanner}>
              <ZoneText variant="caption" color={colors.accent.gold} style={styles.previewText}>
                ✦ APERÇU · Données d’Antoine, athlète Zone Pro
              </ZoneText>
            </View>

            <View style={styles.demoCard}>
              <ProReadinessCard
                readiness={demo.readiness}
                zoneScore={71}
                acwr={demo.acwr.acwr}
                acwrRiskLabel={frenchRiskLabel(demo.acwr.riskLevel)}
                avgSleepHours={demo.sleepDebt.avgHoursLast7Days}
                tsb={demo.tsb}
                tsbLabel={getFormStatus(demo.tsb).label}
              />
            </View>
            <View style={styles.demoCard}>
              <FormFatigueCard metrics={demo.metrics} formStatus={getFormStatus(demo.tsb)} />
            </View>
            <View style={styles.demoCard}>
              <ACWRCard acwrResult={demo.acwr} budget={demo.budget} workloadHistory={demo.workload} />
            </View>
            <View style={styles.demoCard}>
              <SportProgressionCard
                activeSports={DEMO_SPORTS}
                workloadHistory={demo.workload}
                exerciseMaxes={DEMO_MAXES}
                completedSessions={DEMO_SESSIONS}
                runningProfile={DEMO_RUNNING_PROFILE}
                muscleVolumeStatus={[]}
              />
            </View>
            <View style={styles.demoCard}>
              <PredictionsCard
                activeSports={DEMO_SPORTS}
                metrics={demo.metrics}
                runningProfile={DEMO_RUNNING_PROFILE}
                exerciseMaxes={DEMO_MAXES}
              />
            </View>
            <View style={styles.demoCard}>
              <CoachZoneCard
                acwr={demo.acwr}
                sleepDebt={demo.sleepDebt}
                metrics={demo.metrics}
                budget={demo.budget}
              />
            </View>
          </>
        ) : (
          <View style={styles.mineLocked}>
            <Lock size={28} color={colors.accent.gold} />
            <ZoneText variant="label" color={colors.text.primary} style={styles.mineTitle}>
              Tes analyses t’attendent
            </ZoneText>
            <ZoneText variant="body" size={13} color={colors.text.muted} style={styles.mineBody}>
              Débloque Zone Pro pour voir tes propres données à la place de celles d’Antoine.
            </ZoneText>
          </View>
        )}
      </ScrollView>

      <View style={styles.floating}>
        <ZoneText variant="label" color={colors.text.primary} style={styles.floatTitle}>
          Ces analyses sont disponibles avec Zone Pro.
        </ZoneText>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.floatSub}>
          Essai gratuit 7 jours · Annulable à tout moment
        </ZoneText>
        <Button title="COMMENCER MON ESSAI GRATUIT" variant="primary" onPress={openPaywall} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 40, paddingBottom: 180 },
  hero: { alignItems: 'center', marginBottom: 24 },
  title: { marginTop: 12, letterSpacing: 3 },
  pitch: { marginTop: 10, textAlign: 'center', lineHeight: 22 },
  benefits: {
    backgroundColor: colors.bg.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  benefitText: { flex: 1, lineHeight: 19 },
  sportsHeading: { marginTop: 24, marginBottom: 12 },
  sportGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  sportUnlockCard: {
    width: '48.5%',
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    alignItems: 'center',
  },
  sportUnlockIcon: { fontSize: 26 },
  sportUnlockName: { marginTop: 6, textAlign: 'center' },
  sportUnlockPrice: { marginTop: 2, fontFamily: 'Inter-Medium' },
  sportUnlockBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.accent.gold,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  sportUnlockBtnText: { fontFamily: 'Inter-Bold', letterSpacing: 0.3, textAlign: 'center' },
  peek: { textAlign: 'center', marginTop: 20, marginBottom: 12 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  tabActive: { backgroundColor: colors.accent.gold, borderColor: colors.accent.gold },
  tabIdle: { backgroundColor: 'transparent', borderColor: colors.border },
  tabText: { fontFamily: 'Inter-Bold', fontSize: 12 },
  previewBanner: {
    borderWidth: 1,
    borderColor: colors.accent.gold,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    backgroundColor: 'rgba(201,168,76,0.10)',
  },
  previewText: { textAlign: 'center', fontFamily: 'Inter-Bold', letterSpacing: 0.3 },
  demoCard: {
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.35)',
    borderRadius: 18,
  },
  mineLocked: {
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 28,
  },
  mineTitle: { marginTop: 12 },
  mineBody: { marginTop: 8, textAlign: 'center', lineHeight: 19 },
  floating: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.accent.gold,
    borderRadius: 16,
    padding: 16,
  },
  floatTitle: { textAlign: 'center' },
  floatSub: { textAlign: 'center', marginTop: 4, marginBottom: 12 },
});
