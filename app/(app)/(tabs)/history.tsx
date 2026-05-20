import React, { useCallback, useEffect, useState } from 'react';
import {
  type LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Dumbbell } from 'lucide-react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import {
  getAllTimeStats,
  getCompletedSessions,
  getExerciseMaxes,
  getLatestCheckins,
  todayDateString,
  type AllTimeStats,
  type DailyCheckin,
  type ExerciseMax,
  type TrainingSession,
} from '@/lib/firestore';
import { getZoneLevel } from '@/lib/zoneScore';
import { getExerciseById } from '@/data/exercises';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Skeleton } from '@/components/ui/Skeleton';
import { ZoneSparkline } from '@/components/ZoneSparkline';
import { frenchShortDate } from '@/lib/frenchDate';

interface ZoneBanner {
  border: string;
  message: string;
}

function bannerForScore(score: number | null): ZoneBanner {
  if (score === null) {
    return { border: colors.border, message: 'Chaque séance te rapproche de la zone.' };
  }
  if (score <= 30) {
    return {
      border: colors.orbe.red,
      message:
        "🔴 Aujourd'hui n'est pas le jour. Ton corps a besoin de repos, pas d'effort.",
    };
  }
  if (score <= 50) {
    return {
      border: colors.orbe.amber,
      message:
        "🟡 Conditions limitées. Un entraînement léger peut aider — évite l'intensité.",
    };
  }
  if (score <= 75) {
    return {
      border: colors.orbe.blue,
      message:
        '🔵 Les conditions sont réunies. La zone est à portée si tu t’en donnes les moyens.',
    };
  }
  return {
    border: colors.orbe.green,
    message: '🟢 Tu es dedans. C’est maintenant. Ne laisse pas passer ça.',
  };
}

function formatVolume(kg: number): string {
  if (!Number.isFinite(kg)) return '0 kg';
  const rounded = Math.round(kg);
  return `${rounded.toLocaleString('fr-FR')} kg`;
}

export default function HistoryScreen(): React.ReactElement {
  const router = useRouter();
  const [todayScore, setTodayScore] = useState<number | null>(null);
  const [checkins, setCheckins] = useState<DailyCheckin[] | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[] | null>(null);
  const [maxes, setMaxes] = useState<ExerciseMax[] | null>(null);
  const [stats, setStats] = useState<AllTimeStats | null>(null);
  const [chartWidth, setChartWidth] = useState<number>(0);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid, 'checkins', todayDateString()),
      (snap) => {
        setTodayScore(snap.exists() ? (snap.data() as DailyCheckin).zone_score : null);
      },
      () => setTodayScore(null),
    );
    return unsubscribe;
  }, []);

  const loadAll = useCallback(async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    const [c, s, m, st] = await Promise.all([
      getLatestCheckins(user.uid, 14).catch(() => [] as DailyCheckin[]),
      getCompletedSessions(user.uid).catch(() => [] as TrainingSession[]),
      getExerciseMaxes(user.uid).catch(() => [] as ExerciseMax[]),
      getAllTimeStats(user.uid).catch(
        () =>
          ({ totalSessions: 0, totalVolume: 0, bestStreak: 0, avgZoneScore: 0 }) as AllTimeStats,
      ),
    ]);
    setCheckins(c);
    setSessions(s);
    setMaxes(m);
    setStats(st);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadAll();
    }, [loadAll]),
  );

  const banner = bannerForScore(todayScore);
  const onChartLayout = (e: LayoutChangeEvent): void => {
    setChartWidth(e.nativeEvent.layout.width);
  };

  return (
    <SafeScreen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ZoneText variant="heading" style={styles.title}>
            HISTORIQUE
          </ZoneText>
        </View>

        <View style={[styles.banner, { borderLeftColor: banner.border }]}>
          <ZoneText variant="caption" style={styles.bannerText}>
            {banner.message}
          </ZoneText>
        </View>

        <View style={styles.section}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
            SCORE ZONE — 7 JOURS
          </ZoneText>
          <View style={styles.chartCard} onLayout={onChartLayout}>
            {chartWidth > 0 && checkins ? (
              <ZoneSparkline checkins={checkins} width={chartWidth} />
            ) : (
              <Skeleton width="100%" height={140} borderRadius={12} />
            )}
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsRow}
        >
          <StatCard label="Séances" value={stats ? String(stats.totalSessions) : '—'} loading={!stats} />
          <StatCard label="Volume total" value={stats ? formatVolume(stats.totalVolume) : '—'} loading={!stats} />
          <StatCard label="Meilleur streak" value={stats ? `${stats.bestStreak} j` : '—'} loading={!stats} />
          <StatCard label="Score moyen" value={stats ? String(stats.avgZoneScore || '—') : '—'} loading={!stats} />
        </ScrollView>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ZoneText variant="heading" style={styles.sectionTitle}>
              MES SÉANCES
            </ZoneText>
            <ZoneText variant="caption" color={colors.text.muted}>
              {sessions ? `${sessions.length}` : ''}
            </ZoneText>
          </View>
          {!sessions ? (
            <Skeleton width="100%" height={80} borderRadius={12} />
          ) : sessions.length === 0 ? (
            <EmptyHint text="Tu n’as pas encore terminé de séance." />
          ) : (
            sessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                onPress={() => router.push(`/(app)/session-detail/${s.id}`)}
              />
            ))
          )}
        </View>

        <View style={styles.section}>
          <ZoneText variant="heading" style={styles.sectionTitle}>
            MES RECORDS
          </ZoneText>
          {!maxes ? (
            <Skeleton width="100%" height={70} borderRadius={12} />
          ) : maxes.length === 0 ? (
            <EmptyHint text="Commence une séance pour établir tes premiers records." />
          ) : (
            maxes.map((m) => <PRCard key={m.exercise_id} max={m} />)
          )}
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading: boolean;
}): React.ReactElement {
  return (
    <View style={styles.statCard}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.statLabel}>
        {label}
      </ZoneText>
      {loading ? (
        <Skeleton width={56} height={22} borderRadius={6} style={styles.statSkeleton} />
      ) : (
        <ZoneText variant="heading" style={styles.statValue}>
          {value}
        </ZoneText>
      )}
    </View>
  );
}

function SessionRow({
  session,
  onPress,
}: {
  session: TrainingSession;
  onPress: () => void;
}): React.ReactElement {
  const zone = session.zone_score_at_start ?? null;
  const level = zone !== null ? getZoneLevel(zone) : null;
  const border = level?.color ?? colors.border;
  const sets = (session.completed_sets ?? []).length;
  const sport = session.sport_key === 'running' ? 'Course' : 'Haltérophilie';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.sessionCard, { borderLeftColor: border }]}
    >
      <View style={styles.sessionMain}>
        <View style={styles.sessionRow}>
          <ZoneText variant="label" color={colors.accent.gold} style={styles.sessionDate}>
            {frenchShortDate(session.date)}
          </ZoneText>
          {zone !== null ? (
            <View style={[styles.scoreBubble, { backgroundColor: border }]}>
              <ZoneText style={styles.scoreBubbleText}>{zone}</ZoneText>
            </View>
          ) : null}
        </View>
        <View style={styles.sessionMetaRow}>
          <Dumbbell size={12} color={colors.text.muted} />
          <ZoneText variant="caption" color={colors.text.muted} style={styles.sessionMetaText}>
            {sport} · {session.duration_minutes ?? 0} min · {formatVolume(session.total_volume_kg ?? 0)} · {sets} séries
          </ZoneText>
        </View>
      </View>
      <ChevronRight size={16} color={colors.text.muted} />
    </TouchableOpacity>
  );
}

function PRCard({ max }: { max: ExerciseMax }): React.ReactElement {
  const ex = getExerciseById(max.exercise_id);
  return (
    <View style={styles.prCard}>
      <View style={styles.prMain}>
        <ZoneText variant="label" style={styles.prName}>
          {ex?.name ?? max.exercise_id}
        </ZoneText>
        <ZoneText variant="caption" color={colors.text.muted}>
          {max.reps === 1
            ? `1 rep · ${frenchShortDate(max.date)}`
            : `${max.reps} reps · 1RM est. ${max.estimated_1rm} kg · ${frenchShortDate(max.date)}`}
        </ZoneText>
      </View>
      <ZoneText variant="heading" style={styles.prWeight}>
        {max.weight_kg} kg
      </ZoneText>
    </View>
  );
}

function EmptyHint({ text }: { text: string }): React.ReactElement {
  return (
    <View style={styles.empty}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.emptyText}>
        {text}
      </ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8 },
  title: { fontSize: 28, letterSpacing: 2 },
  banner: {
    marginHorizontal: 24,
    marginTop: 4,
    marginBottom: 4,
    backgroundColor: colors.bg.card,
    borderLeftWidth: 3,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bannerText: { color: colors.text.primary, fontSize: 12, lineHeight: 16 },
  section: { paddingHorizontal: 24, marginTop: 18 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, letterSpacing: 2, color: colors.text.primary },
  eyebrow: { letterSpacing: 2, fontSize: 12, marginBottom: 8 },
  chartCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  statsRow: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 4 },
  statCard: {
    width: 116,
    marginRight: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 22, color: colors.text.primary, marginTop: 4, lineHeight: 26 },
  statSkeleton: { marginTop: 6 },
  sessionCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sessionMain: { flex: 1 },
  sessionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sessionDate: { fontSize: 13 },
  scoreBubble: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  scoreBubbleText: { color: colors.bg.primary, fontFamily: 'Inter-Bold', fontSize: 11 },
  sessionMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  sessionMetaText: { fontSize: 11, marginLeft: 4 },
  prCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
  },
  prMain: { flex: 1 },
  prName: { fontSize: 14, color: colors.text.primary },
  prWeight: { fontSize: 24, color: colors.accent.gold, lineHeight: 26 },
  empty: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  emptyText: { textAlign: 'center' },
});
