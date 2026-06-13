import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  getCompletedRuns,
  getCompletedSessions,
  getExerciseMaxes,
  getHyroxSessionHistory,
  getLatestCheckins,
  todayDateString,
  type AllTimeStats,
  type DailyCheckin,
  type ExerciseMax,
  type HyroxSessionRecord,
  type RunSession,
  type TrainingSession,
} from '@/lib/firestore';
import { formatPaceShort, sessionName, type RunningSessionType } from '@/lib/runningEngine';
import { HYROX_SESSION_LABELS } from '@/lib/hyroxEngine';
import { formatDuration } from '@/lib/hyroxScience';
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

type FeedItem =
  | { kind: 'session'; id: string; date: string; session: TrainingSession }
  | { kind: 'run'; id: string; date: string; run: RunSession }
  | { kind: 'hyrox'; id: string; date: string; hyrox: HyroxSessionRecord };

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
        "🟡 Conditions limitées. Un entraînement léger peut aider, mais évite l'intensité.",
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
  const [runs, setRuns] = useState<RunSession[] | null>(null);
  const [hyrox, setHyrox] = useState<HyroxSessionRecord[] | null>(null);
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
    const [c, s, m, st, r, h] = await Promise.all([
      getLatestCheckins(user.uid, 14).catch(() => [] as DailyCheckin[]),
      getCompletedSessions(user.uid).catch(() => [] as TrainingSession[]),
      getExerciseMaxes(user.uid).catch(() => [] as ExerciseMax[]),
      getAllTimeStats(user.uid).catch(
        () =>
          ({ totalSessions: 0, totalVolume: 0, bestStreak: 0, avgZoneScore: 0 }) as AllTimeStats,
      ),
      getCompletedRuns(user.uid, 30).catch(() => [] as RunSession[]),
      getHyroxSessionHistory(user.uid, 20).catch(() => [] as HyroxSessionRecord[]),
    ]);
    setCheckins(c);
    setSessions(s);
    setMaxes(m);
    setStats(st);
    setRuns(r);
    setHyrox(h);
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

  // Unified, most-recent-first feed of every completed session type.
  const feed = useMemo<FeedItem[] | null>(() => {
    if (sessions === null && runs === null && hyrox === null) return null;
    const items: FeedItem[] = [];
    for (const s of sessions ?? []) items.push({ kind: 'session', id: `s-${s.id}`, date: s.date, session: s });
    for (const r of runs ?? []) items.push({ kind: 'run', id: `r-${r.id}`, date: r.date, run: r });
    for (const h of hyrox ?? []) items.push({ kind: 'hyrox', id: `h-${h.id}`, date: h.date, hyrox: h });
    items.sort((a, b) => b.date.localeCompare(a.date));
    return items;
  }, [sessions, runs, hyrox]);

  return (
    <SafeScreen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ZoneText variant="heading" style={styles.title}>
            HISTORIQUE
          </ZoneText>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statsRow}
        >
          <StatCard label="Séances" value={stats ? String(stats.totalSessions) : '-'} loading={!stats} />
          <StatCard label="Volume total" value={stats ? formatVolume(stats.totalVolume) : '-'} loading={!stats} />
          <StatCard label="Meilleur streak" value={stats ? `${stats.bestStreak} j` : '-'} loading={!stats} />
          <StatCard label="Score moyen" value={stats ? String(stats.avgZoneScore || '-') : '-'} loading={!stats} />
          {runs && runs.length > 0 ? (
            <>
              <StatCard
                label="Distance totale"
                value={`${runs.reduce((acc, r) => acc + (r.actual_distance_km ?? 0), 0).toFixed(1)} km`}
                loading={false}
              />
              <StatCard
                label="Allure moy."
                value={formatPaceShort(
                  runs.reduce((acc, r) => acc + (r.avg_pace_sec_per_km ?? 0), 0) /
                    Math.max(1, runs.length),
                )}
                loading={false}
              />
            </>
          ) : null}
        </ScrollView>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ZoneText variant="heading" style={styles.sectionTitle}>
              MES SÉANCES
            </ZoneText>
            <ZoneText variant="caption" color={colors.text.muted}>
              {feed ? `${feed.length}` : ''}
            </ZoneText>
          </View>
          {!feed ? (
            <Skeleton width="100%" height={80} borderRadius={12} />
          ) : feed.length === 0 ? (
            <EmptyHint text="Tu n’as pas encore terminé de séance." />
          ) : (
            feed.map((item) => {
              if (item.kind === 'session') {
                return (
                  <SessionRow
                    key={item.id}
                    session={item.session}
                    onPress={() => router.push(`/(app)/session-detail/${item.session.id}`)}
                  />
                );
              }
              if (item.kind === 'run') {
                return <RunRow key={item.id} run={item.run} />;
              }
              return <HyroxRow key={item.id} record={item.hyrox} />;
            })
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
  const sport =
    session.discipline === 'musculation'
      ? 'Musculation'
      : session.sport_key === 'running'
        ? 'Course'
        : 'Haltérophilie';
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.sessionCard, { borderLeftColor: border }]}
    >
      <View style={styles.sessionMain}>
        <View style={styles.sessionRow}>
          <ZoneText variant="label" color={colors.scoreGreen} style={styles.sessionDate}>
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

function runTypeColor(t: RunningSessionType): string {
  switch (t) {
    case 'EF':
      return colors.text.muted;
    case 'SL':
      return colors.orbe.blue;
    case 'TC':
    case 'TB':
    case 'AS':
      return colors.orbe.amber;
    case 'IV':
    case 'CO':
      return colors.orbe.red;
    case 'RV':
      return '#B074F0';
    case 'RA':
      return colors.success;
  }
}

function RunRow({ run }: { run: RunSession }): React.ReactElement {
  const color = runTypeColor(run.session_type);
  return (
    <View style={[styles.sessionCard, { borderLeftColor: color }]}>
      <View style={styles.sessionMain}>
        <View style={styles.sessionRow}>
          <ZoneText variant="label" color={colors.scoreGreen} style={styles.sessionDate}>
            {frenchShortDate(run.date)}
          </ZoneText>
          <View style={[styles.scoreBubble, { backgroundColor: color }]}>
            <ZoneText style={styles.scoreBubbleText}>{run.session_type}</ZoneText>
          </View>
        </View>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.runMeta}>
          {sessionName(run.session_type)} · {(run.actual_distance_km ?? 0).toFixed(2)} km · {formatPaceShort(run.avg_pace_sec_per_km ?? 0)} /km · {Math.round((run.actual_duration_seconds ?? 0) / 60)} min
        </ZoneText>
      </View>
    </View>
  );
}

function HyroxRow({ record }: { record: HyroxSessionRecord }): React.ReactElement {
  const label = HYROX_SESSION_LABELS[record.session_type];
  const stationCount = record.stations?.length ?? 0;
  const isRace = record.session_type === 'race_simulation';
  const stationsLabel = `${stationCount} station${stationCount > 1 ? 's' : ''}`;
  const meta =
    isRace && record.total_time_sec
      ? `${label} · ${formatDuration(record.total_time_sec)} · ${stationsLabel}`
      : `${label} · ${stationsLabel}`;
  return (
    <View style={[styles.sessionCard, { borderLeftColor: colors.orbe.amber }]}>
      <View style={styles.sessionMain}>
        <View style={styles.sessionRow}>
          <ZoneText variant="label" color={colors.scoreGreen} style={styles.sessionDate}>
            {frenchShortDate(record.date)}
          </ZoneText>
          <View style={styles.hyroxBadge}>
            <ZoneText style={styles.hyroxBadgeText}>HYROX</ZoneText>
          </View>
        </View>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.runMeta}>
          {meta}
        </ZoneText>
      </View>
    </View>
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
  hyroxBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.orbe.amber,
  },
  hyroxBadgeText: { color: colors.bg.primary, fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  scoreBubbleText: { color: colors.bg.primary, fontFamily: 'Inter_700Bold', fontSize: 11 },
  sessionMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  sessionMetaText: { fontSize: 11, marginLeft: 4 },
  runMeta: { fontSize: 11, marginTop: 4 },
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
  prWeight: { fontSize: 24, color: colors.scoreGreen, lineHeight: 26 },
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
