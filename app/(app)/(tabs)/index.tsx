import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Info } from 'lucide-react-native';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import {
  countCompletedSessionsSince,
  getAllTimeStats,
  todayDateString,
  type AllTimeStats,
  type DailyCheckin,
  type HyroxProfile,
  type MuscleProfile,
  type RunningProfile,
  type TrainingSession,
  type UserProfile,
  type UserProgram,
} from '@/lib/firestore';
import { getZoneLevel } from '@/lib/zoneScore';
import { useWeekBilans } from '@/hooks/useWeekBilans';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ZoneOrbe } from '@/components/ZoneOrbe';
import { BilanCard } from '@/components/BilanCard';
import { ProgrammeCompleteCard } from '@/components/ProgrammeCompleteCard';
import type { ProSport } from '@/lib/weekProgression';

function frenchDate(): string {
  try {
    const f = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date());
    return f.charAt(0).toUpperCase() + f.slice(1);
  } catch {
    return '';
  }
}

function sportOf(s: TrainingSession): { label: string; icon: string; color: string } {
  if (s.discipline === 'musculation')
    return { label: 'Musculation', icon: '💪', color: colors.orbe.blue };
  if (s.sport_key === 'running')
    return { label: 'Course', icon: '🏃', color: colors.orbe.green };
  return { label: 'Haltérophilie', icon: '🏋️', color: colors.accent.gold };
}

function proSportFromSession(session: TrainingSession): ProSport {
  if (session.discipline === 'musculation') return 'musculation';
  if (session.sport_key === 'running') return 'running';
  return 'weightlifting';
}

function sessionMeta(s: TrainingSession): string {
  const sets = (s.planned_exercises ?? []).reduce((a, e) => a + e.sets.length, 0);
  const ex = s.planned_exercises?.length ?? 0;
  const minutes = Math.max(20, 10 + Math.round(sets * 3));
  return `${ex} exercice${ex > 1 ? 's' : ''} · ~${minutes} min`;
}

export default function DashboardScreen(): React.ReactElement {
  const router = useRouter();
  const [checkin, setCheckin] = useState<DailyCheckin | null>(null);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [todaySession, setTodaySession] = useState<TrainingSession | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [stats, setStats] = useState<AllTimeStats | null>(null);
  const [weekCount, setWeekCount] = useState<number>(0);
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

  const { bilans, advance, repeat, startNewCycle } = useWeekBilans({
    program,
    runningProfile,
    muscleProfile,
    hyroxProfile,
  });

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoaded(true);
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'users', user.uid, 'checkins', todayDateString()),
      (snap) => {
        setCheckin(snap.exists() ? (snap.data() as DailyCheckin) : null);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    return unsub;
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(
      collection(db, 'users', user.uid, 'sessions'),
      orderBy('date', 'asc'),
      limit(20),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const today = todayDateString();
        const rows = snap.docs.map((d) => d.data() as TrainingSession);
        setTodaySession(
          rows.find((s) => s.status === 'planned' && s.date === today) ?? null,
        );
      },
      () => setTodaySession(null),
    );
    return unsub;
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!cancelled && snap.exists()) {
          const data = snap.data() as Partial<UserProfile>;
          setProfileName(data.name ?? data.first_name ?? null);
        }
        const all = await getAllTimeStats(user.uid).catch(() => null);
        if (!cancelled && all) setStats(all);
        const completed = await countCompletedSessionsSince(user.uid, mondayISO());
        if (!cancelled) setWeekCount(completed);
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const score = checkin?.zone_score ?? 50;
  const level = checkin ? getZoneLevel(score) : null;
  const date = frenchDate();
  const name = auth.currentUser?.displayName?.trim() || profileName || 'Athlète';
  const hasCheckin = Boolean(checkin);

  return (
    <SafeScreen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <ZoneText variant="body" size={16} color={colors.text.secondary}>
            Bonjour, {name}
          </ZoneText>
          {date ? (
            <ZoneText variant="caption" size={14} color={colors.text.muted} style={styles.headerDate}>
              {date}
            </ZoneText>
          ) : null}
        </View>

        {/* HERO — Zone score */}
        <TouchableOpacity
          activeOpacity={hasCheckin ? 1 : 0.85}
          disabled={hasCheckin}
          onPress={() => router.push('/(app)/checkin')}
          style={[styles.hero, !hasCheckin ? styles.heroPrompt : null]}
        >
          {!loaded ? (
            <Skeleton width={120} height={120} borderRadius={60} />
          ) : (
            <>
              <ZoneOrbe
                score={hasCheckin ? score : 50}
                size={120}
                animated
                overlayText={!hasCheckin ? '?' : undefined}
              />
              {hasCheckin ? (
                <>
                  <ZoneText
                    variant="number"
                    style={[styles.score, { color: level ? level.color : colors.accent.gold }]}
                  >
                    {score}
                  </ZoneText>
                  {level ? (
                    <ZoneText variant="title" size={18} style={{ color: level.color }}>
                      {level.label}
                    </ZoneText>
                  ) : null}
                  {level ? (
                    <ZoneText variant="caption" color={colors.text.muted} style={styles.heroMsg}>
                      {level.message ?? ''}
                    </ZoneText>
                  ) : null}
                </>
              ) : (
                <ZoneText variant="titleSm" color={colors.accent.gold} style={styles.heroPromptText}>
                  Fais ton check-in
                </ZoneText>
              )}
            </>
          )}
        </TouchableOpacity>

        {/* Bilans hebdomadaires par sport */}
        {bilans.length > 0 ? (
          <View style={styles.bilansBlock}>
            {bilans.map((b) =>
              b.isComplete ? (
                <ProgrammeCompleteCard
                  key={b.sport}
                  sport={b.sport}
                  totalSessions={b.summary.completedSessions}
                  totalVolume={b.summary.actualKm ?? 0}
                  volumeUnit={b.sport === 'running' ? 'km' : 'séances'}
                  onNewCycle={() => {
                    void startNewCycle(b.sport).then(() => router.push('/(app)/maxes'));
                  }}
                  onMaintenance={() => {
                    void startNewCycle(b.sport);
                  }}
                />
              ) : (
                <BilanCard
                  key={b.sport}
                  summary={b.summary}
                  onAdvance={() => {
                    void advance(b.sport);
                  }}
                  onRepeat={
                    b.summary.result.shouldRepeat
                      ? () => {
                          void repeat(b.sport);
                        }
                      : undefined
                  }
                  onInfoPress={() =>
                    router.push({
                      pathname: '/(app)/programme-overview',
                      params: { sport: b.sport },
                    })
                  }
                />
              ),
            )}
          </View>
        ) : null}

        {/* Today's session */}
        {todaySession ? (
          <View style={styles.sessionCard}>
            <View style={styles.sessionHeaderRow}>
              <View style={[styles.sportPill, { backgroundColor: `${sportOf(todaySession).color}22`, borderColor: sportOf(todaySession).color }]}>
                <ZoneText variant="caption" color={sportOf(todaySession).color} style={styles.sportPillText}>
                  {sportOf(todaySession).icon} {sportOf(todaySession).label.toUpperCase()}
                </ZoneText>
              </View>
              <TouchableOpacity
                hitSlop={12}
                onPress={() =>
                  router.push({
                    pathname: '/(app)/programme-overview',
                    params: { sport: proSportFromSession(todaySession) },
                  })
                }
                accessibilityLabel="Voir le programme en détail"
                style={styles.sessionInfoBtn}
              >
                <Info size={16} color={colors.text.muted} />
              </TouchableOpacity>
            </View>
            <ZoneText variant="title" size={18} color={colors.text.primary} style={styles.sessionName}>
              Séance du jour
            </ZoneText>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.sessionMeta}>
              {sessionMeta(todaySession)}
            </ZoneText>
            <Button
              title="COMMENCER"
              onPress={() => router.push(`/(app)/session/${todaySession.id}`)}
              style={styles.sessionBtn}
            />
          </View>
        ) : (
          <View style={styles.restCard}>
            <ZoneText variant="titleSm" color={colors.text.primary}>
              Repos
            </ZoneText>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.sessionMeta}>
              Récupération active possible.
            </ZoneText>
            <TouchableOpacity
              onPress={() => router.push('/(app)/(tabs)/aujourd-hui')}
              activeOpacity={0.8}
              style={styles.bonusGhost}
            >
              <ZoneText variant="label" color={colors.accent.gold}>
                Séance bonus
              </ZoneText>
            </TouchableOpacity>
          </View>
        )}

        {/* Weekly stats */}
        <View style={styles.statsRow}>
          <StatCard label="Cette semaine" value={String(weekCount)} suffix="séances" />
          <StatCard label="Streak" value={stats ? String(stats.bestStreak) : '0'} suffix="jours" />
          <StatCard
            label="Score moyen"
            value={stats && stats.avgZoneScore ? String(stats.avgZoneScore) : '--'}
            suffix="pts"
          />
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

function mondayISO(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return todayDateString(d);
}

function StatCard({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string;
  suffix: string;
}): React.ReactElement {
  return (
    <View style={styles.statCard}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.statLabel}>
        {label}
      </ZoneText>
      <ZoneText variant="number" style={styles.statValue}>
        {value}
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.muted}>
        {suffix}
      </ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },
  header: { marginBottom: 20 },
  headerDate: { marginTop: 4 },
  hero: {
    alignItems: 'center',
    backgroundColor: colors.bg.cardTop,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  heroPrompt: { borderColor: colors.accent.gold, borderWidth: 1.5 },
  heroPromptText: { marginTop: 16 },
  score: { fontSize: 80, lineHeight: 86, marginTop: 16 },
  heroMsg: { marginTop: 6, textAlign: 'center', lineHeight: 17, paddingHorizontal: 12 },
  bilansBlock: { marginTop: 16, marginHorizontal: -20 },
  sessionCard: {
    marginTop: 16,
    backgroundColor: colors.bg.card,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.gold,
    borderRadius: 16,
    padding: 20,
  },
  sessionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sportPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sportPillText: { fontFamily: 'Inter-Bold', letterSpacing: 0.5 },
  sessionInfoBtn: { padding: 4 },
  sessionName: { marginTop: 2 },
  sessionMeta: { marginTop: 4 },
  sessionBtn: { marginTop: 16 },
  restCard: {
    marginTop: 16,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 20,
  },
  bonusGhost: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.accent.gold,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  statsRow: { flexDirection: 'row', marginTop: 20, gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statLabel: { fontSize: 11, textAlign: 'center' },
  statValue: { fontSize: 34, color: colors.text.primary, marginTop: 6, lineHeight: 38 },
});
