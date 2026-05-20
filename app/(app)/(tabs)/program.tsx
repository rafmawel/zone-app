import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Dumbbell, RotateCcw } from 'lucide-react-native';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import {
  createPlannedSession,
  createRunSession,
  getExerciseMaxes,
  todayDateString,
  type DailyCheckin,
  type RunningProfile,
  type TrainingSession,
  type UserProgram,
} from '@/lib/firestore';
import { generateWeeklySession, getBlockName } from '@/lib/programEngine';
import {
  buildSessionPlan,
  calculateVDOTPaces,
  formatPace,
  getWeeklyDistribution,
  sessionName,
  type ProgramBlockRunning,
  type RunningSessionType,
  type WeekIndexRunning,
} from '@/lib/runningEngine';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';

interface ZoneBanner {
  border: string;
  message: string;
}

function bannerForScore(score: number | null): ZoneBanner | null {
  if (score === null) return null;
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

export default function ProgramScreen(): React.ReactElement {
  const router = useRouter();
  const [score, setScore] = useState<number | null>(null);
  const [program, setProgram] = useState<UserProgram | null>(null);
  const [programLoaded, setProgramLoaded] = useState<boolean>(false);
  const [upcoming, setUpcoming] = useState<TrainingSession[]>([]);
  const [generating, setGenerating] = useState<boolean>(false);
  const [runningProfile, setRunningProfile] = useState<RunningProfile | null>(null);
  const [runningLoaded, setRunningLoaded] = useState<boolean>(false);
  const [generatingRun, setGeneratingRun] = useState<boolean>(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid, 'checkins', todayDateString()),
      (snap) => {
        setScore(snap.exists() ? (snap.data() as DailyCheckin).zone_score : null);
      },
      () => setScore(null),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setProgramLoaded(true);
      return;
    }
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid, 'state', 'program'),
      (snap) => {
        setProgram(snap.exists() ? (snap.data() as UserProgram) : null);
        setProgramLoaded(true);
      },
      () => setProgramLoaded(true),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const q = query(
      collection(db, 'users', user.uid, 'sessions'),
      orderBy('date', 'asc'),
      limit(20),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const today = todayDateString();
        const rows = snap.docs
          .map((d) => d.data() as TrainingSession)
          .filter((s) => s.status === 'planned' && s.date >= today);
        setUpcoming(rows.slice(0, 5));
      },
      () => setUpcoming([]),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setRunningLoaded(true);
      return;
    }
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid, 'state', 'running_profile'),
      (snap) => {
        setRunningProfile(snap.exists() ? (snap.data() as RunningProfile) : null);
        setRunningLoaded(true);
      },
      () => setRunningLoaded(true),
    );
    return unsubscribe;
  }, []);

  const onStartRun = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !runningProfile) return;
    setGeneratingRun(true);
    try {
      const paces = calculateVDOTPaces(runningProfile.vdot);
      const block: ProgramBlockRunning = 1;
      const week: WeekIndexRunning = 1;
      const today = new Date();
      const dayIdx = (today.getDay() + 6) % 7;
      const weeklyPlan = getWeeklyDistribution(runningProfile.sessions_per_week, block, week);
      const todayItem = weeklyPlan.items.find((i) => i.dayIndex === dayIdx);
      let type: RunningSessionType =
        todayItem && todayItem.type !== 'REST' ? todayItem.type : 'EF';
      if (score !== null && score <= 30) type = 'RA';
      const level =
        runningProfile.vdot < 35
          ? 'beginner'
          : runningProfile.vdot < 55
            ? 'intermediate'
            : 'advanced';
      const plan = buildSessionPlan({ type, paces, level, block, week });
      const id = await createRunSession(user.uid, {
        date: todayDateString(),
        session_type: plan.type,
        steps: plan.steps.map((s) => ({
          kind: s.kind,
          label: s.label,
          duration_seconds: s.durationSeconds,
          target_pace_sec_per_km: s.targetPaceSecPerKm,
          distance_meters: s.distanceMeters,
        })),
        estimated_duration_min: plan.estimatedDurationMin,
        estimated_distance_km: plan.estimatedDistanceKm,
        zone_score_at_start: score,
        zone_message: plan.message,
      });
      router.push(`/(app)/run-session/${id}`);
    } catch {
      // surfaced via no-op
    } finally {
      setGeneratingRun(false);
    }
  };

  const banner = bannerForScore(score);
  const todayPlanned = useMemo(
    () => upcoming.find((s) => s.date === todayDateString()) ?? null,
    [upcoming],
  );

  const onGenerateToday = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !program) return;
    if (todayPlanned) {
      router.push(`/(app)/session/${todayPlanned.id}`);
      return;
    }
    setGenerating(true);
    try {
      const maxes = await getExerciseMaxes(user.uid);
      const generated = generateWeeklySession({
        program,
        maxes,
        dayOfWeek: program.current_day,
        zoneScore: score,
      });
      const id = await createPlannedSession(user.uid, {
        date: todayDateString(),
        sport_key: program.sport_key,
        planned_exercises: generated.exercises,
        zone_score_at_start: score,
        zone_message: generated.message,
      });
      router.push(`/(app)/session/${id}`);
    } catch {
      // surfaced via no-op
    } finally {
      setGenerating(false);
    }
  };

  return (
    <SafeScreen>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <ZoneText variant="heading" style={styles.title}>
            PROGRAMME
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.muted}>
            Périodisation en 12 semaines
          </ZoneText>
        </View>

        {banner ? (
          <View style={[styles.banner, { borderLeftColor: banner.border }]}>
            <ZoneText variant="caption" style={styles.bannerText}>
              {banner.message}
            </ZoneText>
          </View>
        ) : null}

        {!programLoaded ? null : program ? (
          <View style={styles.programCard}>
            <View style={styles.programHeader}>
              <ZoneText variant="caption" color={colors.text.muted} style={styles.programEyebrow}>
                MON PROGRAMME
              </ZoneText>
              <ZoneText variant="caption" color={colors.accent.gold}>
                Semaine {Math.min(4, program.current_week)}/4
              </ZoneText>
            </View>
            <ZoneText variant="heading" style={styles.programBlock}>
              BLOC {program.current_block} — {getBlockName(program.current_block)}
            </ZoneText>
            <View style={styles.weekDots}>
              {[1, 2, 3, 4].map((w) => (
                <View
                  key={w}
                  style={[
                    styles.weekDot,
                    {
                      backgroundColor:
                        w <= program.current_week ? colors.accent.gold : colors.border,
                    },
                  ]}
                />
              ))}
            </View>
            <View style={styles.programMetaRow}>
              <Dumbbell size={16} color={colors.text.muted} />
              <ZoneText variant="caption" color={colors.text.muted} style={styles.programMetaText}>
                {program.sessions_per_week}× / semaine · niveau {program.level}
              </ZoneText>
            </View>
            <View style={styles.programCta}>
              <Button
                title={todayPlanned ? 'Reprendre ma séance' : 'Voir ma séance'}
                loading={generating}
                onPress={onGenerateToday}
              />
            </View>
            <TouchableOpacity
              onPress={() => router.push('/(app)/maxes')}
              activeOpacity={0.7}
              style={styles.recalcRow}
            >
              <RotateCcw size={14} color={colors.text.muted} />
              <ZoneText variant="caption" color={colors.text.muted} style={styles.recalcText}>
                Recalculer mes maxes
              </ZoneText>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.programCard}>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.programEyebrow}>
              MON PROGRAMME
            </ZoneText>
            <ZoneText variant="heading" style={styles.programBlock}>
              DÉMARRE TON PROGRAMME
            </ZoneText>
            <ZoneText variant="body" color={colors.text.secondary} style={styles.programIntro}>
              Estime tes maxes pour générer ton premier cycle de 12 semaines.
            </ZoneText>
            <View style={styles.programCta}>
              <Button title="Commencer" onPress={() => router.push('/(app)/maxes')} />
            </View>
          </View>
        )}

        {runningLoaded ? (
          <View style={styles.runningCard}>
            <View style={styles.programHeader}>
              <ZoneText
                variant="caption"
                color={colors.text.muted}
                style={styles.programEyebrow}
              >
                PROGRAMME COURSE
              </ZoneText>
              {runningProfile ? (
                <ZoneText variant="caption" color={colors.accent.gold}>
                  VDOT {runningProfile.vdot}
                </ZoneText>
              ) : null}
            </View>
            {runningProfile ? (
              <RunningProgramBody
                profile={runningProfile}
                loading={generatingRun}
                onStart={onStartRun}
              />
            ) : (
              <>
                <ZoneText variant="heading" style={styles.programBlock}>
                  ACTIVER LE MODULE COURSE
                </ZoneText>
                <ZoneText
                  variant="body"
                  color={colors.text.secondary}
                  style={styles.programIntro}
                >
                  Estime ton allure de référence pour générer un plan
                  scientifiquement structuré (VDOT + 80/20).
                </ZoneText>
                <View style={styles.programCta}>
                  <Button
                    title="Configurer la course"
                    variant="secondary"
                    onPress={() => router.push('/(app)/running-setup')}
                  />
                </View>
              </>
            )}
          </View>
        ) : null}

        <View style={styles.upcomingHeader}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.upcomingEyebrow}>
            PROCHAINES SÉANCES
          </ZoneText>
        </View>
        {upcoming.length === 0 ? (
          <View style={styles.upcomingEmpty}>
            <ZoneText variant="caption" color={colors.text.muted}>
              {program
                ? 'Aucune séance planifiée pour le moment.'
                : 'Démarre ton programme pour générer ta première séance.'}
            </ZoneText>
          </View>
        ) : (
          upcoming.map((s) => (
            <TouchableOpacity
              key={s.id}
              activeOpacity={0.85}
              onPress={() => router.push(`/(app)/session/${s.id}`)}
              style={styles.sessionRow}
            >
              <View style={styles.sessionMain}>
                <ZoneText variant="label" style={styles.sessionTitle}>
                  {formatSessionDate(s.date)}
                </ZoneText>
                <ZoneText variant="caption" color={colors.text.muted}>
                  {(s.planned_exercises ?? []).length} exercices
                </ZoneText>
              </View>
              <ChevronRight size={16} color={colors.text.muted} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeScreen>
  );
}

function RunningProgramBody({
  profile,
  loading,
  onStart,
}: {
  profile: RunningProfile;
  loading: boolean;
  onStart: () => void;
}): React.ReactElement {
  const router = useRouter();
  const paces = useMemo(() => calculateVDOTPaces(profile.vdot), [profile.vdot]);
  const today = new Date();
  const dayIdx = (today.getDay() + 6) % 7;
  const weekly = getWeeklyDistribution(profile.sessions_per_week, 1, 1);
  const todayItem = weekly.items.find((i) => i.dayIndex === dayIdx);
  const todayType: RunningSessionType | 'REST' = todayItem ? todayItem.type : 'EF';

  return (
    <>
      <ZoneText variant="heading" style={styles.programBlock}>
        BLOC 1 — ACCUMULATION
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.programIntro}>
        {profile.sessions_per_week}× / semaine · objectif {profile.goal}
      </ZoneText>

      <View style={styles.weekDotsRow}>
        {weekly.items.map((item) => {
          const isToday = item.dayIndex === dayIdx;
          const color =
            item.type === 'REST'
              ? colors.border
              : item.type === 'EF' || item.type === 'SL' || item.type === 'RA'
                ? colors.orbe.blue
                : colors.accent.gold;
          return (
            <View
              key={item.dayIndex}
              style={[
                styles.weekDay,
                {
                  backgroundColor: color,
                  borderColor: isToday ? colors.accent.gold : 'transparent',
                  borderWidth: isToday ? 2 : 0,
                },
              ]}
            />
          );
        })}
      </View>

      <View style={styles.todayBox}>
        <ZoneText
          variant="caption"
          color={colors.text.muted}
          style={styles.programEyebrow}
        >
          AUJOURD’HUI
        </ZoneText>
        <ZoneText variant="label" style={styles.todayName}>
          {todayType === 'REST' ? 'REPOS' : sessionName(todayType)}
        </ZoneText>
        {todayType !== 'REST' ? (
          <ZoneText variant="caption" color={colors.text.secondary} style={styles.todayMeta}>
            Cible E {formatPace(paces.E_fast)} · T {formatPace(paces.T)}
          </ZoneText>
        ) : null}
      </View>

      <View style={styles.programCta}>
        <Button
          title={todayType === 'REST' ? 'Sortie facultative' : 'Voir ma sortie'}
          loading={loading}
          onPress={onStart}
        />
      </View>
      <TouchableOpacity
        onPress={() => router.push('/(app)/running-setup')}
        activeOpacity={0.7}
        style={styles.recalcRow}
      >
        <ZoneText variant="caption" color={colors.text.muted} style={styles.recalcText}>
          Recalibrer ma course
        </ZoneText>
      </TouchableOpacity>
    </>
  );
}

function formatSessionDate(date: string): string {
  try {
    const [y, m, d] = date.split('-').map((p) => parseInt(p, 10));
    const dt = new Date(y, m - 1, d);
    const formatted = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(dt);
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  } catch {
    return date;
  }
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
  programCard: {
    marginHorizontal: 24,
    marginTop: 8,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
  },
  programHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  programEyebrow: { letterSpacing: 1, fontSize: 11 },
  programBlock: { fontSize: 22, marginTop: 2, color: colors.text.primary, letterSpacing: 1 },
  programIntro: { marginTop: 6, lineHeight: 20 },
  weekDots: { flexDirection: 'row', marginTop: 10 },
  weekDot: { width: 22, height: 4, borderRadius: 2, marginRight: 6 },
  programMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  programMetaText: { marginLeft: 6, fontSize: 12 },
  programCta: { marginTop: 14 },
  recalcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 8,
  },
  recalcText: { marginLeft: 6, fontSize: 12 },
  runningCard: {
    marginHorizontal: 24,
    marginTop: 12,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
  },
  weekDotsRow: { flexDirection: 'row', marginTop: 12 },
  weekDay: { width: 24, height: 8, borderRadius: 4, marginRight: 4 },
  todayBox: { marginTop: 14 },
  todayName: { color: colors.text.primary, fontSize: 16, marginTop: 4 },
  todayMeta: { fontSize: 12, marginTop: 2 },
  upcomingHeader: { paddingHorizontal: 24, marginTop: 20, marginBottom: 8 },
  upcomingEyebrow: { letterSpacing: 2, fontSize: 11 },
  upcomingEmpty: {
    marginHorizontal: 24,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  sessionRow: {
    marginHorizontal: 24,
    marginBottom: 6,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sessionMain: { flex: 1 },
  sessionTitle: { color: colors.text.primary, fontSize: 14 },
});
