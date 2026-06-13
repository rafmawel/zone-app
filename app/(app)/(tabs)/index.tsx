import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Bell } from 'lucide-react-native';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import {
  getCompletedRuns,
  getCompletedSessions,
  getExerciseMaxes,
  getHyroxSessionHistory,
  getUserSchedule,
  todayDateString,
  type DailyCheckin,
  type ExerciseMax,
  type HyroxProfile,
  type MuscleProfile,
  type QueueState,
  type RunningProfile,
  type UserProfile,
  type UserProgram,
  type Weekday,
} from '@/lib/firestore';
import { buildProgrammeQueue, type QueueItem } from '@/lib/programmeQueue';
import { launchSessionForItem } from '@/lib/sessionLaunch';
import { blockFromWeeksToRace, type HyroxBlockPhase } from '@/lib/hyroxScience';
import { getZoneLevel } from '@/lib/zoneScore';
import { useWeekBilans } from '@/hooks/useWeekBilans';
import { colors, radius, type SportColorKey } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { WeekTimeline, type WeekDay } from '@/components/ui/WeekTimeline';
import { BilanCard } from '@/components/BilanCard';
import { ProgrammeCompleteCard } from '@/components/ProgrammeCompleteCard';

const GAP = 12;
const H_PADDING = 20;
const CARD_W = (Dimensions.get('window').width - H_PADDING * 2 - GAP) / 2;
const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const SPORT_KEY: Record<string, SportColorKey> = {
  weightlifting: 'haltero',
  running: 'run',
  musculation: 'muscu',
  hyrox: 'hyrox',
};

const SPORT_NAME: Record<SportColorKey, string> = {
  haltero: 'Haltérophilie',
  run: 'Course',
  muscu: 'Musculation',
  hyrox: 'Hyrox',
};

const WEEKDAY_INDEX: Record<Weekday, number> = {
  lundi: 0,
  mardi: 1,
  mercredi: 2,
  jeudi: 3,
  vendredi: 4,
  samedi: 5,
  dimanche: 6,
};

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

function mondayDate(): Date {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

function buildWeek(
  doneDates: Set<string>,
  scheduled: Record<number, SportColorKey>,
): WeekDay[] {
  const monday = mondayDate();
  const today = todayDateString();
  const out: WeekDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const ds = todayDateString(d);
    if (ds === today) out.push({ label: DAY_LABELS[i], status: 'today' });
    else if (doneDates.has(ds)) out.push({ label: DAY_LABELS[i], status: 'done' });
    else if (ds > today && scheduled[i])
      out.push({ label: DAY_LABELS[i], status: 'scheduled', sport: scheduled[i] });
    else out.push({ label: DAY_LABELS[i], status: 'rest' });
  }
  return out;
}

interface RecentSession {
  date: string;
  sport: SportColorKey;
  label: string;
  meta: string;
}

export default function DashboardScreen(): React.ReactElement {
  const router = useRouter();
  const [checkin, setCheckin] = useState<DailyCheckin | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [program, setProgram] = useState<UserProgram | null>(null);
  const [runningProfile, setRunningProfile] = useState<RunningProfile | null>(null);
  const [muscleProfile, setMuscleProfile] = useState<MuscleProfile | null>(null);
  const [hyroxProfile, setHyroxProfile] = useState<HyroxProfile | null>(null);
  const [maxes, setMaxes] = useState<ExerciseMax[]>([]);
  const [queueState, setQueueState] = useState<QueueState>({});
  const [weekDays, setWeekDays] = useState<WeekDay[]>(() => buildWeek(new Set(), {}));
  const [lastSession, setLastSession] = useState<RecentSession | null>(null);
  const [recentRir, setRecentRir] = useState<number[]>([]);
  const [recentMuscleRir, setRecentMuscleRir] = useState<number[]>([]);
  const [recentRunRir, setRecentRunRir] = useState<number[]>([]);
  const [launching, setLaunching] = useState<boolean>(false);

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
    const unsubQueue = onSnapshot(
      doc(db, 'users', user.uid, 'state', 'programme_queue'),
      (snap) => {
        const data = snap.exists() ? (snap.data() as { items?: QueueState }) : null;
        setQueueState(data?.items ?? {});
      },
      () => setQueueState({}),
    );
    void getExerciseMaxes(user.uid)
      .then((m) => setMaxes(m))
      .catch(() => setMaxes([]));
    return () => {
      unsubProg();
      unsubRun();
      unsubMuscle();
      unsubHyrox();
      unsubQueue();
    };
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsub = onSnapshot(
      doc(db, 'users', user.uid, 'checkins', todayDateString()),
      (snap) => setCheckin(snap.exists() ? (snap.data() as DailyCheckin) : null),
      () => setCheckin(null),
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
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Weekly timeline + last completed session.
  const loadWeek = useCallback(async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    const [sessions, runs, hyrox, schedule] = await Promise.all([
      getCompletedSessions(user.uid).catch(() => []),
      getCompletedRuns(user.uid, 30).catch(() => []),
      getHyroxSessionHistory(user.uid, 20).catch(() => []),
      getUserSchedule(user.uid).catch(() => null),
    ]);

    const done = new Set<string>();
    sessions.forEach((s) => done.add(s.date));
    runs.forEach((r) => done.add(r.date));
    hyrox.forEach((h) => done.add(h.date));

    const scheduled: Record<number, SportColorKey> = {};
    schedule?.assignments?.forEach((a) => {
      const idx = WEEKDAY_INDEX[a.day];
      if (idx != null && scheduled[idx] == null) scheduled[idx] = SPORT_KEY[a.sport] ?? 'haltero';
    });
    setWeekDays(buildWeek(done, scheduled));

    const recent: RecentSession[] = [
      ...sessions.map((s) => ({
        date: s.date,
        sport: (s.discipline === 'musculation' ? 'muscu' : 'haltero') as SportColorKey,
        label: s.discipline === 'musculation' ? 'Musculation' : 'Haltérophilie',
        meta: s.duration_minutes ? `${s.duration_minutes} min` : 'Séance',
      })),
      ...runs.map((r) => ({
        date: r.date,
        sport: 'run' as SportColorKey,
        label: 'Course',
        meta: r.actual_distance_km ? `${r.actual_distance_km.toFixed(1)} km` : 'Course',
      })),
      ...hyrox.map((h) => ({
        date: h.date,
        sport: 'hyrox' as SportColorKey,
        label: 'Hyrox',
        meta: 'Séance Hyrox',
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    setLastSession(recent[0] ?? null);

    // RIR autoregulation inputs (mirrors the Entraîner tab) so a session
    // launched from Home is generated identically.
    setRecentRir(
      sessions
        .filter((s) => s.sport_key === 'weightlifting' && s.discipline !== 'musculation' && typeof s.rpe === 'number')
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-2)
        .map((s) => Math.max(0, 10 - (s.rpe as number))),
    );
    setRecentMuscleRir(
      sessions
        .filter((s) => s.discipline === 'musculation' && typeof s.rpe === 'number')
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-2)
        .map((s) => Math.max(0, 10 - (s.rpe as number))),
    );
    setRecentRunRir(
      runs
        .filter((r) => typeof r.rpe === 'number')
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-2)
        .map((r) => Math.max(0, 10 - (r.rpe as number))),
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadWeek();
    }, [loadWeek]),
  );

  const { bilans, advance, repeat, startNewCycle } = useWeekBilans({
    program,
    runningProfile,
    muscleProfile,
    hyroxProfile,
  });

  const availableItems = useMemo<QueueItem[]>(() => {
    if (!program && !runningProfile && !muscleProfile && !hyroxProfile) return [];
    const iso = hyroxProfile?.target_race_date ?? null;
    const weeksToRace = (() => {
      if (!iso) return null;
      const target = new Date(iso);
      if (Number.isNaN(target.getTime())) return null;
      return Math.max(0, Math.round((target.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)));
    })();
    const hyroxBlock: HyroxBlockPhase = blockFromWeeksToRace(weeksToRace);
    const queueWeeks = buildProgrammeQueue({
      program,
      maxes,
      runningProfile,
      muscleProfile,
      hyroxProfile,
      hyroxBlock,
      state: queueState,
      weeks: 1,
    });
    return (queueWeeks[0] ?? []).filter((i) => i.status === 'available').slice(0, 3);
  }, [program, runningProfile, muscleProfile, hyroxProfile, maxes, queueState]);

  // Launch a queue item directly (same flow as Entraîner → COMMENCER).
  const onLaunchItem = useCallback(
    async (item: QueueItem): Promise<void> => {
      const user = auth.currentUser;
      if (!user || launching) return;
      setLaunching(true);
      try {
        const href = await launchSessionForItem({
          uid: user.uid,
          item,
          program,
          runningProfile,
          muscleProfile,
          hyroxProfile,
          maxes,
          zoneScore: checkin?.zone_score ?? null,
          recentRir,
          recentMuscleRir,
          recentRunRir,
        });
        if (href) router.push(href);
      } catch {
        // no-op
      } finally {
        setLaunching(false);
      }
    },
    [
      launching,
      program,
      runningProfile,
      muscleProfile,
      hyroxProfile,
      maxes,
      checkin,
      recentRir,
      recentMuscleRir,
      recentRunRir,
      router,
    ],
  );

  const score = checkin?.zone_score ?? 0;
  const hasCheckin = Boolean(checkin);
  const level = hasCheckin ? getZoneLevel(score) : null;
  const date = frenchDate();
  const name = auth.currentUser?.displayName?.trim() || profileName || 'Athlète';

  const blockColor = hasCheckin ? level?.color ?? colors.scoreGreen : colors.surface;
  const onColor = hasCheckin;
  const eyebrowColor = onColor ? 'rgba(255,255,255,0.85)' : colors.textMuted;
  const valueColor = onColor ? '#FFFFFF' : colors.textPrimary;
  const labelColor = onColor ? 'rgba(255,255,255,0.92)' : colors.textSecondary;

  return (
    <SafeScreen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <ZoneText variant="caption" color={colors.textMuted}>
            {date}
          </ZoneText>
          <View style={styles.headerRight}>
            <ZoneText variant="label" color={colors.textPrimary} style={styles.greeting}>
              Bonjour, {name}
            </ZoneText>
            <Bell size={20} color={colors.textSecondary} />
          </View>
        </View>

        {/* Score Zone block */}
        <TouchableOpacity
          activeOpacity={hasCheckin ? 1 : 0.85}
          disabled={hasCheckin}
          onPress={() => router.push('/(app)/checkin')}
          style={[styles.scoreBlock, { backgroundColor: blockColor }]}
        >
          <ZoneText style={[styles.scoreEyebrow, { color: eyebrowColor }]}>SCORE ZONE</ZoneText>
          <View style={styles.scoreMain}>
            <ZoneText style={[styles.scoreValue, { color: valueColor }]}>
              {hasCheckin ? score : '—'}
            </ZoneText>
            <View style={styles.scoreLabelWrap}>
              <ZoneText style={[styles.scoreLabel, { color: labelColor }]} numberOfLines={3}>
                {hasCheckin ? level?.label ?? '' : 'Fais ton check-in du jour'}
              </ZoneText>
            </View>
          </View>
        </TouchableOpacity>

        {/* Cette semaine */}
        <ZoneText style={styles.sectionLabel}>CETTE SEMAINE</ZoneText>
        <WeekTimeline days={weekDays} />

        {/* Aujourd'hui */}
        <ZoneText style={[styles.sectionLabel, styles.sectionLabelSpaced]}>AUJOURD'HUI</ZoneText>
        <View style={styles.grid}>
          {availableItems.map((item) => {
            const sport = SPORT_KEY[item.sport] ?? 'haltero';
            return (
              <GridCard
                key={item.key}
                bg={colors[sport]}
                eyebrow={SPORT_NAME[sport]}
                eyebrowColor="rgba(255,255,255,0.85)"
                title={item.name}
                titleColor="#FFFFFF"
                meta={`~${item.estimatedMinutes} min`}
                metaBg="rgba(255,255,255,0.18)"
                metaColor="#FFFFFF"
                onPress={() => void onLaunchItem(item)}
              />
            );
          })}

          <GridCard
            bg={colors.checkin}
            eyebrow="Check-in"
            eyebrowColor="rgba(255,255,255,0.85)"
            title="Sommeil & ressenti"
            titleColor="#FFFFFF"
            meta={hasCheckin ? `Fait · ${score}` : 'À compléter'}
            metaBg="rgba(255,255,255,0.18)"
            metaColor="#FFFFFF"
            onPress={() => router.push('/(app)/checkin')}
          />

          {lastSession ? (
            <GridCard
              bg={colors.surface}
              eyebrow="Dernière séance"
              eyebrowColor={colors.textMuted}
              title={lastSession.label}
              titleColor={colors.textPrimary}
              meta={lastSession.meta}
              metaBg={colors.surfaceAlt}
              metaColor={colors.textSecondary}
              onPress={() => router.push('/(app)/history')}
            />
          ) : null}
        </View>

        {/* Bilans hebdomadaires (avancement de programme) */}
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
                  notStartedOnStart={
                    b.notStarted ? () => router.push('/(app)/(tabs)/aujourd-hui') : undefined
                  }
                />
              ),
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeScreen>
  );
}

function GridCard({
  bg,
  eyebrow,
  eyebrowColor,
  title,
  titleColor,
  meta,
  metaBg,
  metaColor,
  onPress,
}: {
  bg: string;
  eyebrow: string;
  eyebrowColor: string;
  title: string;
  titleColor: string;
  meta?: string;
  metaBg: string;
  metaColor: string;
  onPress: () => void;
}): React.ReactElement {
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.gridCard, { backgroundColor: bg }]}>
      <ZoneText style={[styles.gridEyebrow, { color: eyebrowColor }]}>{eyebrow.toUpperCase()}</ZoneText>
      <ZoneText style={[styles.gridTitle, { color: titleColor }]} numberOfLines={2}>
        {title}
      </ZoneText>
      {meta ? (
        <View style={[styles.gridBadge, { backgroundColor: metaBg }]}>
          <ZoneText style={[styles.gridBadgeText, { color: metaColor }]} numberOfLines={1}>
            {meta}
          </ZoneText>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: H_PADDING, paddingTop: 8, paddingBottom: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  greeting: { fontSize: 15 },
  scoreBlock: {
    borderRadius: radius.xl,
    padding: 20,
    marginBottom: 24,
  },
  scoreEyebrow: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    letterSpacing: 1.5,
  },
  scoreMain: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 18,
  },
  scoreValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 52,
    lineHeight: 56,
  },
  scoreLabelWrap: { flex: 1 },
  scoreLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 19,
  },
  sectionLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    letterSpacing: 1.5,
    color: colors.textMuted,
    marginBottom: 12,
  },
  sectionLabelSpaced: { marginTop: 24 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  gridCard: {
    width: CARD_W,
    minHeight: 124,
    borderRadius: radius.lg,
    padding: 16,
    justifyContent: 'space-between',
  },
  gridEyebrow: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.6,
  },
  gridTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    marginTop: 8,
    flex: 1,
  },
  gridBadge: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 10,
  },
  gridBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  bilansBlock: { marginTop: 24, marginHorizontal: -H_PADDING },
});
