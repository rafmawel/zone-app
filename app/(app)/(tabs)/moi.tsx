import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { ChevronRight, Sparkles } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import {
  connectHealthConnect,
  openHealthConnect,
  type HealthConnectStatus,
} from '@/lib/healthConnect';
import {
  deleteAllUserData,
  getAllTimeStats,
  getExerciseMaxes,
  getHyroxProfile,
  getMuscleProfile,
  getRunningProfile,
  getUserProfile,
  getUserProgram,
  getUserSports,
  getVacationState,
  resetSportProfile,
  saveUserProgram,
  setUserSport,
  updateSessionsPerWeek,
  updateUserProfile,
  type AllTimeStats,
  type ExerciseMax,
  type HyroxProfile,
  type Level,
  type MuscleProfile,
  type ResettableSport,
  type RunningProfile,
  type SportKey,
  type UserProfile,
  type UserProgram,
  type UserSport,
  type VacationState,
} from '@/lib/firestore';
import { getBlockName } from '@/lib/programEngine';
import { readCurrentWeek, readProgrammeQueue, resetSportWeek } from '@/lib/weekTracking';
import type { ProSport as ProSportKey } from '@/lib/weekProgression';
import {
  acknowledgeReturn,
  cancelVacation,
  daysUntilReturn,
  hasReturnedFromVacation,
  isOnVacation,
  startVacation,
  type DeconditioningPlan,
} from '@/lib/vacation';
import { MUSCLE_GOAL_LABELS } from '@/lib/muscleEngine';
import { HYROX_LEVEL_LABELS } from '@/lib/hyroxEngine';
import { vdotLevelLabel } from '@/lib/runningEngine';
import { getExerciseById } from '@/data/exercises';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Skeleton } from '@/components/ui/Skeleton';
import { ZoneExplainerModal } from '@/components/ZoneExplainerModal';
import {
  cancelCheckinReminder,
  formatTime,
  parseTime,
  requestNotificationPermissions,
  scheduleDailyCheckinReminder,
} from '@/lib/notifications';
import { frenchMonthYear, frenchShortDate } from '@/lib/frenchDate';

const LEVEL_LABEL: Record<string, string> = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  avance: 'Avancé',
  confirme: 'Confirmé',
};

const LEVEL_OPTIONS: { key: string; label: string }[] = [
  { key: 'debutant', label: 'Débutant' },
  { key: 'intermediaire', label: 'Intermédiaire' },
  { key: 'avance', label: 'Avancé' },
  { key: 'confirme', label: 'Confirmé' },
];

const HALTERO_GOALS: { key: string; label: string }[] = [
  { key: 'force_pure', label: 'Force pure' },
  { key: 'perf_competition', label: 'Performance compétition' },
  { key: 'remise_en_forme', label: 'Remise en forme' },
];

const COURSE_GOALS: { key: string; label: string }[] = [
  { key: '5km', label: '5 km' },
  { key: '10km', label: '10 km' },
  { key: 'semi_marathon', label: 'Semi-marathon' },
  { key: 'marathon', label: 'Marathon' },
  { key: 'trail', label: 'Trail' },
  { key: 'forme_generale', label: 'Forme générale' },
];

/** Goal option lists per sport (mirrors the onboarding choices). */
const GOAL_OPTIONS_BY_SPORT: Partial<Record<SportKey, { key: string; label: string }[]>> = {
  halterophilie: HALTERO_GOALS,
  course: COURSE_GOALS,
};

/** Flat goal-key → human label map for display. */
const GOAL_LABELS: Record<string, string> = Object.fromEntries(
  [...HALTERO_GOALS, ...COURSE_GOALS].map((o) => [o.key, o.label]),
);

const SESSIONS_OPTIONS: { key: string; label: string }[] = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  key: String(n),
  label: `${n} séance${n > 1 ? 's' : ''} / semaine`,
}));

/** Map the sports/{id} key onto the programme sport used by the queue/profile. */
const SPORTKEY_TO_RESETTABLE: Partial<Record<SportKey, ResettableSport>> = {
  halterophilie: 'weightlifting',
  course: 'running',
  musculation: 'musculation',
  hyrox: 'hyrox',
};

interface PickerConfig {
  title: string;
  options: { key: string; label: string }[];
  current: string;
  onSelect: (key: string) => void;
}

function formatVolume(kg: number): string {
  if (!Number.isFinite(kg)) return '0 kg';
  return `${Math.round(kg).toLocaleString('fr-FR')} kg`;
}

/** Colour a Zone score by tier: >70 green, 40–70 amber, <40 red. */
function scoreColor(score: number | null | undefined): string {
  if (!score || !Number.isFinite(score)) return colors.textPrimary;
  if (score > 70) return colors.scoreGreen;
  if (score >= 40) return colors.warning;
  return colors.danger;
}

const TOTAL_WEEKS_PER_BLOCK = 4;
const TOTAL_BLOCKS = 3;

function blockFromWeek(week: number): number {
  const safe = Math.max(1, Math.min(TOTAL_WEEKS_PER_BLOCK * TOTAL_BLOCKS, week));
  return Math.min(TOTAL_BLOCKS, Math.ceil(safe / TOTAL_WEEKS_PER_BLOCK));
}

function weekInBlock(week: number): number {
  const safe = Math.max(1, Math.min(TOTAL_WEEKS_PER_BLOCK * TOTAL_BLOCKS, week));
  return ((safe - 1) % TOTAL_WEEKS_PER_BLOCK) + 1;
}

function runningBlockName(week: number): string {
  const b = blockFromWeek(week);
  if (b === 1) return 'BASE AÉROBIE';
  if (b === 2) return 'DÉVELOPPEMENT';
  return 'SPÉCIFICITÉ';
}

function muscleBlockName(week: number): string {
  const b = blockFromWeek(week);
  if (b === 1) return 'CONSTRUCTION';
  if (b === 2) return 'CROISSANCE';
  return 'ACCUMULATION';
}

function hyroxBlockName(week: number): string {
  const b = blockFromWeek(week);
  if (b === 1) return 'BASE ET STATIONS';
  if (b === 2) return 'ENDURANCE-FORCE';
  return 'SPÉCIFICITÉ COURSE';
}

function formatVacReturn(date: Date): string {
  try {
    const f = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(date);
    return f.charAt(0).toUpperCase() + f.slice(1);
  } catch {
    return date.toLocaleDateString('fr-FR');
  }
}

function healthConnectErrorMessage(status: HealthConnectStatus): string {
  switch (status) {
    case 'not_installed':
      return "Health Connect doit être installé ou mis à jour. Ouvre le Play Store puis réessaie.";
    case 'unsupported':
      return "Health Connect n'est pas disponible sur cet appareil.";
    case 'denied':
      return "Permissions refusées. Autorise l'accès à tes données pour activer la synchronisation.";
    case 'error':
    default:
      return "Health Connect n'est pas disponible sur cet appareil.";
  }
}

function avatarInitials(email: string | null | undefined): string {
  if (!email) return 'Z';
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length === 0) return (email[0] ?? 'Z').toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export default function ProfileScreen(): React.ReactElement {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [program, setProgram] = useState<UserProgram | null>(null);
  const [sports, setSports] = useState<UserSport[]>([]);
  const [maxes, setMaxes] = useState<ExerciseMax[]>([]);
  const [stats, setStats] = useState<AllTimeStats | null>(null);
  const [runningProfile, setRunningProfile] = useState<RunningProfile | null>(null);
  const [muscleProfile, setMuscleProfile] = useState<MuscleProfile | null>(null);
  const [hyroxProfile, setHyroxProfile] = useState<HyroxProfile | null>(null);
  const [currentWeeks, setCurrentWeeks] = useState<Record<ProSportKey, number>>({
    weightlifting: 1,
    running: 1,
    musculation: 1,
    hyrox: 1,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [resettingSport, setResettingSport] = useState<ResettableSport | null>(null);
  const [zoneInfoVisible, setZoneInfoVisible] = useState<boolean>(false);
  const [picker, setPicker] = useState<PickerConfig | null>(null);
  const [vacation, setVacation] = useState<VacationState | null>(null);
  const [vacationSheetVisible, setVacationSheetVisible] = useState<boolean>(false);
  const [vacationDays, setVacationDays] = useState<number>(7);
  const [returnPlan, setReturnPlan] = useState<DeconditioningPlan | null>(null);
  const [notifEnabled, setNotifEnabled] = useState<boolean>(true);
  const [notifHour, setNotifHour] = useState<number>(7);
  const [notifMinute, setNotifMinute] = useState<number>(0);

  const loadAll = useCallback(async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const [p, pr, sp, m, st, rp, mp, hp, vc] = await Promise.all([
        getUserProfile(user.uid),
        getUserProgram(user.uid),
        getUserSports(user.uid),
        getExerciseMaxes(user.uid),
        getAllTimeStats(user.uid),
        getRunningProfile(user.uid),
        getMuscleProfile(user.uid),
        getHyroxProfile(user.uid),
        getVacationState(user.uid).catch(() => null),
      ]);
      setProfile(p);
      setProgram(pr);
      setSports(sp);
      setMaxes(m);
      setStats(st);
      setRunningProfile(rp);
      setMuscleProfile(mp);
      setHyroxProfile(hp);
      setVacation(vc);
      try {
        const queue = await readProgrammeQueue(user.uid);
        setCurrentWeeks({
          weightlifting: readCurrentWeek(queue, 'weightlifting'),
          running: readCurrentWeek(queue, 'running'),
          musculation: readCurrentWeek(queue, 'musculation'),
          hyrox: readCurrentWeek(queue, 'hyrox'),
        });
      } catch {
        // keep defaults
      }
      // If the athlete's return date has passed since the last app
      // open, surface the "Bon retour" deconditioning sheet and
      // persist the recovery factor for upcoming sessions.
      if (vc && hasReturnedFromVacation(vc)) {
        const configured: ProSportKey[] = [];
        if (pr) configured.push('weightlifting');
        if (rp) configured.push('running');
        if (mp) configured.push('musculation');
        if (hp) configured.push('hyrox');
        try {
          const plan = await acknowledgeReturn({
            uid: user.uid,
            state: vc,
            sports: configured,
          });
          setReturnPlan(plan);
          setVacation(null);
        } catch {
          // best-effort
        }
      }
    } catch {
      // keep nulls
    } finally {
      setLoading(false);
    }
  }, []);

  const SPORT_ROUTES: Record<ResettableSport, '/(app)/maxes' | '/(app)/running-setup' | '/(app)/muscle-setup' | '/(app)/hyrox-setup'> = {
    weightlifting: '/(app)/maxes',
    running: '/(app)/running-setup',
    musculation: '/(app)/muscle-setup',
    hyrox: '/(app)/hyrox-setup',
  };

  const onReconfigure = async (sport: ResettableSport): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    setResettingSport(sport);
    try {
      await resetSportProfile(user.uid, sport);
    } catch {
      // even on failure we still navigate; the setup will overwrite
    } finally {
      setResettingSport(null);
      router.push(SPORT_ROUTES[sport]);
    }
  };

  // Change only the weekly session count — no programme reset, progression
  // and completed sessions are preserved.
  const onChangeSessions = async (sport: ResettableSport, next: number): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    const clamped = Math.max(1, Math.min(7, next));
    if (sport === 'weightlifting') setProgram((p) => (p ? { ...p, sessions_per_week: clamped } : p));
    else if (sport === 'running') setRunningProfile((p) => (p ? { ...p, sessions_per_week: clamped } : p));
    else if (sport === 'musculation') setMuscleProfile((p) => (p ? { ...p, sessions_per_week: clamped } : p));
    else setHyroxProfile((p) => (p ? { ...p, sessions_per_week: clamped } : p));
    await updateSessionsPerWeek(user.uid, sport, clamped).catch(() => undefined);
  };

  // ── MON PROFIL editors (open a picker, then persist) ───────────────────────
  const onSelectLevel = async (key: string): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    setProfile((p) => (p ? { ...p, level: key as Level } : p));
    await updateUserProfile(user.uid, { level: key as Level }).catch(() => undefined);
  };

  const onSelectGoal = async (key: string): Promise<void> => {
    const user = auth.currentUser;
    const sp = sports[0];
    if (!user || !sp) return;
    setSports((arr) => arr.map((s, i) => (i === 0 ? { ...s, goal: key } : s)));
    await setUserSport(user.uid, sp.sport_key, { ...sp, goal: key }).catch(() => undefined);
  };

  const onSelectPrimarySessions = async (n: number): Promise<void> => {
    const sp = sports[0];
    if (!sp) return;
    setSports((arr) => arr.map((s, i) => (i === 0 ? { ...s, sessions_per_week: n } : s)));
    const mapped = SPORTKEY_TO_RESETTABLE[sp.sport_key];
    if (mapped) await onChangeSessions(mapped, n);
  };

  const openLevelPicker = (): void =>
    setPicker({
      title: 'Niveau',
      options: LEVEL_OPTIONS,
      current: profile?.level ?? '',
      onSelect: (k) => void onSelectLevel(k),
    });

  const openGoalPicker = (): void => {
    const sp = sports[0];
    if (!sp) return;
    const options = GOAL_OPTIONS_BY_SPORT[sp.sport_key] ?? [];
    if (options.length === 0) return;
    setPicker({
      title: 'Objectif',
      options,
      current: sp.goal ?? '',
      onSelect: (k) => void onSelectGoal(k),
    });
  };

  const openSessionsPicker = (): void => {
    const sp = sports[0];
    if (!sp) return;
    setPicker({
      title: 'Séances par semaine',
      options: SESSIONS_OPTIONS,
      current: String(sp.sessions_per_week),
      onSelect: (k) => void onSelectPrimarySessions(Number(k)),
    });
  };

  const onRestartProgramme = (sport: ProSportKey): void => {
    const user = auth.currentUser;
    if (!user) return;
    const label =
      sport === 'weightlifting'
        ? 'Haltérophilie'
        : sport === 'running'
          ? 'Course'
          : sport === 'musculation'
            ? 'Musculation'
            : 'Hyrox';
    Alert.alert(
      `Recommencer le programme ${label} ?`,
      'Cela supprime ta progression pour ce sport (retour à la semaine 1). Tes 1RM et l’historique des séances sont conservés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Recommencer',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetSportWeek(user.uid, sport);
              if (sport === 'weightlifting' && program) {
                await saveUserProgram(user.uid, {
                  ...program,
                  current_block: 1,
                  current_week: 1,
                  current_day: 1,
                  mesocycle_start: new Date().toISOString().slice(0, 10),
                });
              }
              setCurrentWeeks((c) => ({ ...c, [sport]: 1 }));
              Alert.alert('Programme réinitialisé', `Programme ${label} réinitialisé. Bonne reprise !`);
            } catch {
              Alert.alert('Erreur', 'Impossible de réinitialiser le programme.');
            }
          },
        },
      ],
    );
  };

  useFocusEffect(
    useCallback(() => {
      void loadAll();
    }, [loadAll]),
  );

  const onActivateVacation = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const next = await startVacation(user.uid, vacationDays);
      setVacation(next);
      setVacationSheetVisible(false);
    } catch {
      Alert.alert('Erreur', 'Impossible de démarrer le mode vacances.');
    }
  };

  const onCancelVacation = (): void => {
    const user = auth.currentUser;
    if (!user) return;
    Alert.alert('Annuler les vacances ?', 'Le programme reprend immédiatement.', [
      { text: 'Garder', style: 'cancel' },
      {
        text: 'Annuler les vacances',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelVacation(user.uid);
            setVacation(null);
          } catch {
            // surfaced silently
          }
        },
      },
    ]);
  };

  const onSignOut = async (): Promise<void> => {
    try {
      await signOut(auth);
      router.replace('/(auth)/login');
    } catch {
      // surfaced silently
    }
  };

  // Sync the reminder controls from the loaded profile.
  useEffect(() => {
    if (!profile) return;
    setNotifEnabled(profile.notifications_enabled !== false);
    const { hour, minute } = parseTime(profile.notification_time ?? '07:00');
    setNotifHour(hour);
    setNotifMinute(minute);
  }, [profile]);

  const persistReminder = async (
    enabled: boolean,
    hour: number,
    minute: number,
  ): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    await updateUserProfile(user.uid, {
      notifications_enabled: enabled,
      notification_time: formatTime(hour, minute),
    }).catch(() => undefined);
    if (enabled) {
      await scheduleDailyCheckinReminder(hour, minute).catch(() => undefined);
    } else {
      await cancelCheckinReminder().catch(() => undefined);
    }
  };

  const onToggleReminder = (): void => {
    const next = !notifEnabled;
    setNotifEnabled(next);
    if (next) void requestNotificationPermissions();
    void persistReminder(next, notifHour, notifMinute);
  };

  const onShiftHour = (delta: number): void => {
    const hour = (notifHour + delta + 24) % 24;
    setNotifHour(hour);
    if (notifEnabled) void persistReminder(true, hour, notifMinute);
  };

  const onShiftMinute = (delta: number): void => {
    const minute = (notifMinute + delta + 60) % 60;
    setNotifMinute(minute);
    if (notifEnabled) void persistReminder(true, notifHour, minute);
  };

  const [resetting, setResetting] = useState<boolean>(false);
  const [connectingHealth, setConnectingHealth] = useState<boolean>(false);

  const onConnectHealth = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    setConnectingHealth(true);
    try {
      const status = await connectHealthConnect();
      if (status === 'connected') {
        await updateUserProfile(user.uid, { health_data_source: 'health_connect' });
        await loadAll();
      } else {
        Alert.alert('Health Connect', healthConnectErrorMessage(status));
      }
    } catch {
      Alert.alert(
        'Health Connect',
        "Health Connect n'est pas disponible sur cet appareil.",
      );
    } finally {
      setConnectingHealth(false);
    }
  };

  const onResetAll = (): void => {
    Alert.alert(
      'Réinitialiser mes données',
      "Es-tu sûr ? Cette action supprimera toutes tes séances, ton programme, tes maxes et tes données de santé. Ton compte restera actif.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          style: 'destructive',
          onPress: async () => {
            const user = auth.currentUser;
            if (!user) return;
            setResetting(true);
            try {
              await deleteAllUserData(user.uid);
              await signOut(auth);
              router.replace('/onboarding/step-1');
            } catch {
              setResetting(false);
              Alert.alert(
                'Erreur',
                "La réinitialisation a échoué. Vérifie ta connexion et réessaie.",
              );
            }
          },
        },
      ],
    );
  };

  const user = auth.currentUser;
  const email = user?.email ?? '';
  const displayName = user?.displayName?.trim() || profile?.name || profile?.first_name || null;
  const memberSince = user?.metadata.creationTime
    ? frenchMonthYear(new Date(user.metadata.creationTime))
    : '-';
  const primarySport = sports[0];

  return (
    <SafeScreen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerWrap}>
          <View style={styles.avatar}>
            <ZoneText variant="heading" style={styles.avatarText}>
              {avatarInitials(email)}
            </ZoneText>
          </View>
          {displayName ? (
            <ZoneText variant="heading" style={styles.displayName}>
              {displayName}
            </ZoneText>
          ) : null}
          <ZoneText variant="label" style={styles.email}>
            {email || 'Compte inconnu'}
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.memberSince}>
            Membre depuis {memberSince}
          </ZoneText>
        </View>

        <View style={styles.section}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
            PROGRAMME ACTUEL
          </ZoneText>
          {loading ? (
            <Skeleton width="100%" height={110} borderRadius={12} />
          ) : program || runningProfile || muscleProfile || hyroxProfile ? (
            <View style={styles.programList}>
              {program ? (
                <SportProgressRow
                  icon="🏋️"
                  label="Haltérophilie"
                  color={colors.haltero}
                  block={program.current_block}
                  blockName={getBlockName(program.current_block)}
                  weekInBlock={Math.min(4, Math.max(1, program.current_week))}
                  totalWeek={currentWeeks.weightlifting}
                  onRestart={() => onRestartProgramme('weightlifting')}
                />
              ) : null}
              {runningProfile ? (
                <SportProgressRow
                  icon="🏃"
                  label="Course"
                  color={colors.run}
                  block={blockFromWeek(currentWeeks.running)}
                  blockName={runningBlockName(currentWeeks.running)}
                  weekInBlock={weekInBlock(currentWeeks.running)}
                  totalWeek={currentWeeks.running}
                  onRestart={() => onRestartProgramme('running')}
                />
              ) : null}
              {muscleProfile ? (
                <SportProgressRow
                  icon="💪"
                  label="Musculation"
                  color={colors.muscu}
                  block={blockFromWeek(currentWeeks.musculation)}
                  blockName={muscleBlockName(currentWeeks.musculation)}
                  weekInBlock={weekInBlock(currentWeeks.musculation)}
                  totalWeek={currentWeeks.musculation}
                  onRestart={() => onRestartProgramme('musculation')}
                />
              ) : null}
              {hyroxProfile ? (
                <SportProgressRow
                  icon="🔥"
                  label="Hyrox"
                  color={colors.hyrox}
                  block={blockFromWeek(currentWeeks.hyrox)}
                  blockName={hyroxBlockName(currentWeeks.hyrox)}
                  weekInBlock={weekInBlock(currentWeeks.hyrox)}
                  totalWeek={currentWeeks.hyrox}
                  onRestart={() => onRestartProgramme('hyrox')}
                />
              ) : null}
            </View>
          ) : (
            <EmptyHint text="Pas de programme actif." />
          )}
        </View>

        <View style={styles.section}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
            MODE VACANCES
          </ZoneText>
          {isOnVacation(vacation) && vacation ? (
            <View style={styles.vacationActive}>
              <ZoneText variant="label" color={colors.text.primary} style={styles.vacationTitle}>
                MODE VACANCES ACTIF ✈️
              </ZoneText>
              <ZoneText variant="caption" color={colors.text.secondary} style={styles.vacationBody}>
                Retour le {vacation.returnDate ? formatVacReturn(vacation.returnDate.toDate()) : '-'} · Dans {daysUntilReturn(vacation)} jour{daysUntilReturn(vacation) > 1 ? 's' : ''}.
              </ZoneText>
              <TouchableOpacity onPress={onCancelVacation} activeOpacity={0.7} style={styles.vacationCancel}>
                <ZoneText variant="caption" color={colors.text.muted} style={styles.vacationCancelText}>
                  Annuler les vacances
                </ZoneText>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.vacationCard}>
              <ZoneText variant="label" color={colors.text.primary} style={styles.vacationTitle}>
                Partir en vacances ? ✈️
              </ZoneText>
              <ZoneText variant="caption" color={colors.text.secondary} style={styles.vacationBody}>
                Ton programme s&apos;adapte à ton retour. Le compteur de progression est gelé pendant ton absence.
              </ZoneText>
              <TouchableOpacity
                onPress={() => setVacationSheetVisible(true)}
                activeOpacity={0.85}
                style={styles.vacationCta}
              >
                <ZoneText variant="label" color={colors.scoreGreen} style={styles.vacationCtaText}>
                  ACTIVER LE MODE VACANCES
                </ZoneText>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
            MES STATISTIQUES
          </ZoneText>
          <View style={styles.statsGrid}>
            <StatTile
              label="Total séances"
              value={stats ? String(stats.totalSessions) : '-'}
              loading={!stats}
              valueColor={colors.textPrimary}
            />
            <StatTile
              label="Volume total"
              value={stats ? formatVolume(stats.totalVolume) : '-'}
              loading={!stats}
              valueColor={colors.scoreGreen}
            />
            <StatTile
              label="Meilleur streak"
              value={stats ? `${stats.bestStreak} j` : '-'}
              loading={!stats}
              valueColor={colors.run}
            />
            <StatTile
              label="Score moyen"
              value={stats ? String(stats.avgZoneScore || '-') : '-'}
              loading={!stats}
              valueColor={scoreColor(stats?.avgZoneScore)}
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
              MES MAXES
            </ZoneText>
            <TouchableOpacity
              onPress={() => router.push('/(app)/maxes')}
              activeOpacity={0.7}
              hitSlop={8}
            >
              <ZoneText
                color={colors.scoreGreen}
                style={styles.modifyLink}
              >
                Modifier
              </ZoneText>
            </TouchableOpacity>
          </View>
          {loading ? (
            <Skeleton width="100%" height={70} borderRadius={12} />
          ) : maxes.length === 0 ? (
            <EmptyHint text="Aucun max enregistré." />
          ) : (
            maxes.map((m) => {
              const ex = getExerciseById(m.exercise_id);
              return (
                <View key={m.exercise_id} style={styles.maxRow}>
                  <View style={styles.maxMain}>
                    <ZoneText variant="label" style={styles.maxName}>
                      {ex?.name ?? m.exercise_id}
                    </ZoneText>
                    <ZoneText variant="caption" color={colors.text.muted}>
                      {frenchShortDate(m.date)}
                    </ZoneText>
                  </View>
                  <ZoneText variant="number" style={styles.maxWeight}>
                    {m.weight_kg} kg
                  </ZoneText>
                </View>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
            MON PROFIL
          </ZoneText>
          <InfoRow
            label="Niveau"
            value={profile?.level ? (LEVEL_LABEL[profile.level] ?? profile.level) : '-'}
            onPress={openLevelPicker}
          />
          <InfoRow
            label="Objectif"
            value={primarySport ? (GOAL_LABELS[primarySport.goal] ?? primarySport.goal) : '-'}
            onPress={primarySport ? openGoalPicker : undefined}
          />
          <InfoRow
            label="Séances par semaine"
            value={primarySport ? `${primarySport.sessions_per_week}` : '-'}
            onPress={primarySport ? openSessionsPicker : undefined}
          />
          {profile?.health_data_source === 'health_connect' ||
          profile?.health_data_source === 'both' ? (
            <View style={styles.healthRow}>
              <View style={styles.healthRowMain}>
                <View style={styles.healthRowTitle}>
                  <View style={styles.healthDot} />
                  <ZoneText variant="label" color={colors.text.primary}>
                    Health Connect · Connecté
                  </ZoneText>
                </View>
                <ZoneText variant="caption" color={colors.text.muted}>
                  Données synchronisées
                </ZoneText>
              </View>
              <TouchableOpacity onPress={() => openHealthConnect()} hitSlop={8}>
                <ZoneText variant="caption" color={colors.scoreGreen}>
                  Gérer
                </ZoneText>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => {
                void onConnectHealth();
              }}
              activeOpacity={0.85}
              disabled={connectingHealth}
              style={styles.healthConnectBtn}
            >
              <ZoneText
                variant="label"
                color={colors.bg.primary}
                style={styles.healthConnectText}
              >
                {connectingHealth ? 'Connexion en cours' : 'Connecter Health Connect'}
              </ZoneText>
            </TouchableOpacity>
          )}

          <ZoneText
            variant="caption"
            color={colors.text.muted}
            style={styles.subEyebrow}
          >
            MES SPORTS
          </ZoneText>
          {program ? (
            <SportRow
              emoji="🏋️"
              name="Haltérophilie"
              summary={`Niveau ${program.level}`}
              loading={resettingSport === 'weightlifting'}
              sessions={program.sessions_per_week}
              onChangeSessions={(n) => void onChangeSessions('weightlifting', n)}
              onPress={() => onReconfigure('weightlifting')}
            />
          ) : null}
          {runningProfile ? (
            <SportRow
              emoji="🏃"
              name="Course à pied"
              summary={`VDOT ${runningProfile.vdot} · ${vdotLevelLabel(runningProfile.vdot)}`}
              loading={resettingSport === 'running'}
              sessions={runningProfile.sessions_per_week}
              onChangeSessions={(n) => void onChangeSessions('running', n)}
              onPress={() => onReconfigure('running')}
            />
          ) : null}
          {muscleProfile ? (
            <SportRow
              emoji="💪"
              name="Musculation"
              summary={`${MUSCLE_GOAL_LABELS[muscleProfile.goal]}`}
              loading={resettingSport === 'musculation'}
              sessions={muscleProfile.sessions_per_week}
              onChangeSessions={(n) => void onChangeSessions('musculation', n)}
              onPress={() => onReconfigure('musculation')}
            />
          ) : null}
          {hyroxProfile ? (
            <SportRow
              emoji="🔥"
              name="Hyrox"
              summary={`${HYROX_LEVEL_LABELS[hyroxProfile.level]}`}
              loading={resettingSport === 'hyrox'}
              sessions={hyroxProfile.sessions_per_week}
              onChangeSessions={(n) => void onChangeSessions('hyrox', n)}
              onPress={() => onReconfigure('hyrox')}
            />
          ) : null}
          {!program && !runningProfile && !muscleProfile && !hyroxProfile ? (
            <EmptyHint text="Aucun sport activé. Démarre depuis l’onglet Programme." />
          ) : null}

          <TouchableOpacity
            onPress={onResetAll}
            activeOpacity={0.7}
            disabled={resetting}
            style={styles.resetBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ZoneText style={styles.resetText}>
              {resetting ? 'Réinitialisation en cours' : 'Réinitialiser toutes mes données'}
            </ZoneText>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
            RAPPEL QUOTIDIEN
          </ZoneText>
          <View style={styles.notifCard}>
            <TouchableOpacity
              style={styles.notifToggleRow}
              activeOpacity={0.8}
              onPress={onToggleReminder}
            >
              <View style={styles.notifToggleMain}>
                <ZoneText variant="label" color={colors.text.primary}>
                  Rappel de check-in
                </ZoneText>
                <ZoneText variant="caption" color={colors.text.muted}>
                  Une notification chaque jour pour calibrer ta séance.
                </ZoneText>
              </View>
              <View
                style={[
                  styles.switchTrack,
                  { backgroundColor: notifEnabled ? colors.scoreGreen : colors.border },
                ]}
              >
                <View
                  style={[
                    styles.switchThumb,
                    notifEnabled ? styles.switchThumbOn : styles.switchThumbOff,
                  ]}
                />
              </View>
            </TouchableOpacity>

            {notifEnabled ? (
              <View style={styles.timeRow}>
                <ZoneText variant="caption" color={colors.text.muted}>
                  Heure du rappel
                </ZoneText>
                <View style={styles.timeSteppers}>
                  <TimeStepper
                    value={notifHour}
                    onUp={() => onShiftHour(1)}
                    onDown={() => onShiftHour(-1)}
                  />
                  <ZoneText variant="heading" style={styles.timeColon}>
                    :
                  </ZoneText>
                  <TimeStepper
                    value={notifMinute}
                    onUp={() => onShiftMinute(5)}
                    onDown={() => onShiftMinute(-5)}
                  />
                </View>
              </View>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          onPress={() => setZoneInfoVisible(true)}
          activeOpacity={0.7}
          style={styles.zoneInfoLink}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Sparkles size={14} color={colors.scoreGreen} />
          <ZoneText style={styles.zoneInfoText}>Qu’est-ce que la Zone ?</ZoneText>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onSignOut}
          activeOpacity={0.7}
          style={styles.logoutBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ZoneText style={styles.logoutText}>Se déconnecter</ZoneText>
        </TouchableOpacity>
      </ScrollView>
      <ZoneExplainerModal visible={zoneInfoVisible} onClose={() => setZoneInfoVisible(false)} />

      <Modal
        visible={picker !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPicker(null)}
      >
        <TouchableOpacity
          style={styles.pickerBackdrop}
          activeOpacity={1}
          onPress={() => setPicker(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.pickerSheet}>
            <View style={styles.sheetHandleBar} />
            <ZoneText variant="heading" style={styles.pickerTitle}>
              {picker?.title}
            </ZoneText>
            {picker?.options.map((o) => {
              const active = o.key === picker.current;
              return (
                <TouchableOpacity
                  key={o.key}
                  onPress={() => {
                    picker.onSelect(o.key);
                    setPicker(null);
                  }}
                  activeOpacity={0.8}
                  style={[styles.pickerOption, active ? styles.pickerOptionActive : null]}
                >
                  <ZoneText
                    style={[styles.pickerOptionText, active ? styles.pickerOptionTextActive : null]}
                  >
                    {o.label}
                  </ZoneText>
                </TouchableOpacity>
              );
            })}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Vacation duration sheet */}
      <Modal
        visible={vacationSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setVacationSheetVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setVacationSheetVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <ZoneText variant="heading" style={styles.vacSheetTitle}>
              MODE VACANCES ✈️
            </ZoneText>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.vacSheetLabel}>
              DURÉE DE L&apos;ABSENCE
            </ZoneText>
            <View style={styles.vacPresetRow}>
              {[7, 14, 21, 28].map((n) => {
                const active = vacationDays === n;
                return (
                  <TouchableOpacity
                    key={n}
                    onPress={() => setVacationDays(n)}
                    activeOpacity={0.85}
                    style={[styles.vacPreset, active ? styles.vacPresetActive : null]}
                  >
                    <ZoneText
                      variant="label"
                      color={active ? colors.bg.primary : colors.text.primary}
                      style={styles.vacPresetText}
                    >
                      {n / 7} sem
                    </ZoneText>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.vacCustomRow}>
              <TouchableOpacity
                onPress={() => setVacationDays((d) => Math.max(1, d - 1))}
                activeOpacity={0.7}
                style={styles.vacStepBtn}
              >
                <ZoneText variant="label" color={colors.scoreGreen}>
                  −
                </ZoneText>
              </TouchableOpacity>
              <View style={styles.vacCustomBox}>
                <ZoneText variant="caption" color={colors.text.muted} style={styles.vacCustomLabel}>
                  PERSONNALISÉ
                </ZoneText>
                <ZoneText variant="heading" style={styles.vacCustomValue}>
                  {vacationDays} jour{vacationDays > 1 ? 's' : ''}
                </ZoneText>
              </View>
              <TouchableOpacity
                onPress={() => setVacationDays((d) => Math.min(180, d + 1))}
                activeOpacity={0.7}
                style={styles.vacStepBtn}
              >
                <ZoneText variant="label" color={colors.scoreGreen}>
                  +
                </ZoneText>
              </TouchableOpacity>
            </View>
            <View style={styles.vacReturnRow}>
              <ZoneText variant="caption" color={colors.text.muted}>
                Date de retour
              </ZoneText>
              <ZoneText variant="label" color={colors.text.primary} style={styles.vacReturnDate}>
                {formatVacReturn(new Date(Date.now() + vacationDays * 24 * 60 * 60 * 1000))}
              </ZoneText>
            </View>
            <TouchableOpacity
              onPress={() => void onActivateVacation()}
              activeOpacity={0.85}
              style={styles.vacActivateBtn}
            >
              <ZoneText variant="label" color={colors.bg.primary} style={styles.vacActivateText}>
                ACTIVER
              </ZoneText>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Welcome back sheet — shown when the user opens the app
          on or after the planned return date. */}
      <Modal
        visible={returnPlan !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setReturnPlan(null)}
      >
        <View style={styles.promoBackdrop}>
          <View style={styles.welcomeCard}>
            <ZoneText variant="heading" style={styles.welcomeTitle}>
              BON RETOUR ! 💪
            </ZoneText>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.welcomeAway}>
              {returnPlan ? `${returnPlan.awayDays} jour${returnPlan.awayDays > 1 ? 's' : ''} d'absence` : ''}
            </ZoneText>
            <ZoneText variant="body" color={colors.text.primary} style={styles.welcomeBody}>
              {returnPlan?.message ?? ''}
            </ZoneText>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.welcomeBody}>
              Référence : Mujika et Padilla 2000.
            </ZoneText>
            {returnPlan?.recommendRestart ? (
              <View style={styles.welcomeActions}>
                <TouchableOpacity
                  onPress={() => {
                    const user = auth.currentUser;
                    if (!user) return;
                    void (async () => {
                      try {
                        if (program) {
                          await saveUserProgram(user.uid, {
                            ...program,
                            current_block: 1,
                            current_week: 1,
                            current_day: 1,
                            mesocycle_start: new Date().toISOString().slice(0, 10),
                          });
                        }
                        for (const s of ['weightlifting', 'running', 'musculation', 'hyrox'] as ProSportKey[]) {
                          await resetSportWeek(user.uid, s).catch(() => undefined);
                        }
                      } finally {
                        setReturnPlan(null);
                      }
                    })();
                  }}
                  activeOpacity={0.85}
                  style={styles.vacActivateBtn}
                >
                  <ZoneText variant="label" color={colors.bg.primary} style={styles.vacActivateText}>
                    REPRENDRE AU BLOC 1
                  </ZoneText>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setReturnPlan(null)}
                  activeOpacity={0.7}
                  style={styles.welcomeGhost}
                >
                  <ZoneText variant="caption" color={colors.text.muted}>
                    Continuer quand même
                  </ZoneText>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setReturnPlan(null)}
                activeOpacity={0.85}
                style={styles.vacActivateBtn}
              >
                <ZoneText variant="label" color={colors.bg.primary} style={styles.vacActivateText}>
                  C&apos;EST PARTI
                </ZoneText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </SafeScreen>
  );
}

function StatTile({
  label,
  value,
  loading,
  valueColor,
}: {
  label: string;
  value: string;
  loading: boolean;
  valueColor?: string;
}): React.ReactElement {
  return (
    <View style={styles.statTile}>
      <ZoneText style={styles.statLabel}>{label}</ZoneText>
      {loading ? (
        <Skeleton width={64} height={22} borderRadius={6} style={styles.statSkeleton} />
      ) : (
        <ZoneText
          style={[styles.statValue, valueColor ? { color: valueColor } : null]}
        >
          {value}
        </ZoneText>
      )}
    </View>
  );
}

function SportRow({
  emoji,
  name,
  summary,
  loading,
  sessions,
  onChangeSessions,
  onPress,
}: {
  emoji: string;
  name: string;
  summary: string;
  loading: boolean;
  sessions: number;
  onChangeSessions: (n: number) => void;
  onPress: () => void;
}): React.ReactElement {
  return (
    <View style={styles.sportRow}>
      <ZoneText style={styles.sportEmoji}>{emoji}</ZoneText>
      <View style={styles.sportMain}>
        <ZoneText variant="label" style={styles.sportName}>
          {name}
        </ZoneText>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.sportSummary}>
          {summary}
        </ZoneText>
        <View style={styles.freqRow}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.freqLabel}>
            Séances/sem
          </ZoneText>
          <TouchableOpacity
            onPress={() => onChangeSessions(sessions - 1)}
            disabled={sessions <= 1}
            hitSlop={8}
            activeOpacity={0.7}
            style={[styles.freqBtn, sessions <= 1 ? styles.freqBtnDisabled : null]}
          >
            <ZoneText style={styles.freqSign}>−</ZoneText>
          </TouchableOpacity>
          <ZoneText style={styles.freqValue}>{sessions}</ZoneText>
          <TouchableOpacity
            onPress={() => onChangeSessions(sessions + 1)}
            disabled={sessions >= 7}
            hitSlop={8}
            activeOpacity={0.7}
            style={[styles.freqBtn, sessions >= 7 ? styles.freqBtnDisabled : null]}
          >
            <ZoneText style={styles.freqSign}>+</ZoneText>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        disabled={loading}
      >
        <ZoneText
          color={loading ? colors.text.muted : colors.scoreGreen}
          style={styles.reconfigureLink}
        >
          {loading ? 'En cours' : 'Reconfigurer'}
        </ZoneText>
      </TouchableOpacity>
    </View>
  );
}

function TimeStepper({
  value,
  onUp,
  onDown,
}: {
  value: number;
  onUp: () => void;
  onDown: () => void;
}): React.ReactElement {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity onPress={onDown} hitSlop={10} style={styles.stepperBtn} activeOpacity={0.7}>
        <ZoneText style={styles.stepperSign}>−</ZoneText>
      </TouchableOpacity>
      <ZoneText variant="number" style={styles.stepperValue}>
        {String(value).padStart(2, '0')}
      </ZoneText>
      <TouchableOpacity onPress={onUp} hitSlop={10} style={styles.stepperBtn} activeOpacity={0.7}>
        <ZoneText style={styles.stepperSign}>+</ZoneText>
      </TouchableOpacity>
    </View>
  );
}

function InfoRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}): React.ReactElement {
  const content = (
    <View style={styles.infoRow}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.infoLabel}>
        {label}
      </ZoneText>
      <View style={styles.infoValueRow}>
        <ZoneText style={styles.infoValue}>{value}</ZoneText>
        <ChevronRight size={14} color="rgba(255,255,255,0.3)" />
      </View>
    </View>
  );
  if (!onPress) return content;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      {content}
    </TouchableOpacity>
  );
}

function SportProgressRow({
  icon,
  label,
  color,
  block,
  blockName,
  weekInBlock,
  totalWeek,
  onRestart,
}: {
  icon: string;
  label: string;
  color: string;
  block: number;
  blockName: string;
  weekInBlock: number;
  totalWeek: number;
  onRestart?: () => void;
}): React.ReactElement {
  // 12 segments total — 4 weeks per block × 3 blocks.
  const TOTAL = 12;
  return (
    <View style={[styles.sportProg, { borderLeftColor: color }]}>
      <View style={styles.sportProgHead}>
        <View style={styles.sportProgHeadMain}>
          <ZoneText style={styles.sportProgTitle}>
            {icon} {label}
          </ZoneText>
          <ZoneText style={styles.sportProgSub}>
            Bloc {block} · {blockName} · Semaine {weekInBlock}/4
          </ZoneText>
        </View>
        {onRestart ? (
          <TouchableOpacity onPress={onRestart} hitSlop={8} activeOpacity={0.7}>
            <ZoneText style={[styles.sportProgRestart, { color }]}>
              Recommencer
            </ZoneText>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={styles.sportProgBar}>
        {Array.from({ length: TOTAL }).map((_, i) => {
          const idx = i + 1;
          return (
            <View
              key={i}
              style={[
                styles.sportProgSeg,
                { backgroundColor: idx <= totalWeek ? color : 'rgba(255,255,255,0.1)' },
              ]}
            />
          );
        })}
      </View>
      <ZoneText style={styles.sportProgMeta}>
        Semaine {Math.min(TOTAL, totalWeek)}/{TOTAL}
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
  content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 48 },
  subscriptionCard: {
    marginTop: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subscriptionCardPro: {
    marginTop: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.scoreGreen,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subscriptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subscriptionTitleAccent: {
    fontSize: 18,
    color: colors.scoreGreen,
    letterSpacing: 1.2,
  },
  subscriptionTitleMuted: {
    fontSize: 18,
    color: colors.text.primary,
    letterSpacing: 1.2,
  },
  subscriptionMeta: {
    marginTop: 6,
  },
  manageLink: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  sportPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  sportPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.success,
    backgroundColor: 'rgba(76,175,80,0.10)',
  },
  sportPillText: { fontFamily: 'Inter_500Medium' },
  sportChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg.elevated,
  },
  baseIncluded: { marginTop: 12, lineHeight: 16 },
  proLinksRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 14,
  },
  upgradeBtn: {
    marginTop: 12,
    paddingHorizontal: 18,
    alignSelf: 'flex-start',
  },
  promoLink: { marginTop: 12, alignSelf: 'flex-start', paddingVertical: 4 },
  promoBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  vacationCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
  },
  vacationActive: {
    backgroundColor: colors.surface,
    borderLeftWidth: 4,
    borderLeftColor: colors.scoreGreen,
    borderRadius: 18,
    padding: 16,
  },
  vacationTitle: {
    fontSize: 15,
    color: colors.textPrimary,
    fontFamily: 'Inter_700Bold',
  },
  vacationBody: {
    marginTop: 8,
    lineHeight: 18,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },
  vacationCta: {
    marginTop: 14,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.scoreGreen,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  vacationCtaText: { color: colors.scoreGreen, letterSpacing: 1, fontFamily: 'Inter_700Bold', fontSize: 12 },
  vacationCancel: { marginTop: 12, alignSelf: 'flex-start' },
  vacationCancelText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.bg.elevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  vacSheetTitle: { fontSize: 22, marginBottom: 16, letterSpacing: 1 },
  vacSheetLabel: { letterSpacing: 2, fontFamily: 'Inter_700Bold', fontSize: 11, marginBottom: 8 },
  vacPresetRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  vacPreset: {
    flex: 1,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  vacPresetActive: { backgroundColor: colors.scoreGreen, borderColor: colors.scoreGreen },
  vacPresetText: { fontFamily: 'Inter_700Bold' },
  vacCustomRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  vacStepBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vacCustomBox: {
    flex: 1,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  vacCustomLabel: { letterSpacing: 2, fontFamily: 'Inter_700Bold', fontSize: 10 },
  vacCustomValue: { fontSize: 22, lineHeight: 26, marginTop: 2 },
  vacReturnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginBottom: 16,
  },
  vacReturnDate: { fontSize: 14 },
  vacActivateBtn: {
    backgroundColor: colors.scoreGreen,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  vacActivateText: { letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  welcomeCard: {
    width: '100%',
    backgroundColor: colors.bg.elevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.scoreGreen,
    padding: 22,
  },
  welcomeTitle: { fontSize: 24, letterSpacing: 1, textAlign: 'center' },
  welcomeAway: { textAlign: 'center', marginTop: 4, fontSize: 12 },
  welcomeBody: { marginTop: 14, lineHeight: 21 },
  welcomeActions: { marginTop: 18, gap: 12 },
  welcomeGhost: { alignSelf: 'center', paddingVertical: 8 },
  promoCard: {
    width: '100%',
    backgroundColor: colors.bg.elevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  promoTitle: { fontSize: 20, letterSpacing: 0.5, marginBottom: 14, color: colors.text.primary },
  promoInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text.primary,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    letterSpacing: 1,
  },
  promoErrorText: { marginTop: 8 },
  promoActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
    marginTop: 18,
  },
  promoCancel: { paddingVertical: 10, paddingHorizontal: 8 },
  promoSubmit: {
    backgroundColor: colors.scoreGreen,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  promoSubmitText: { fontSize: 14 },
  headerWrap: { alignItems: 'center', marginBottom: 8 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.scoreGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.background,
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    textAlign: 'center',
  },
  displayName: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textPrimary,
    fontFamily: 'Inter_700Bold',
  },
  email: {
    marginTop: 4,
    color: colors.textPrimary,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  memberSince: { marginTop: 4, color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  section: { marginTop: 22 },
  eyebrow: {
    letterSpacing: 2,
    fontSize: 11,
    marginBottom: 8,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modifyLink: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  programCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.scoreGreen,
    borderRadius: 12,
    padding: 14,
  },
  programBlock: { fontSize: 16, color: colors.text.primary, letterSpacing: 1 },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  weekDots: { flexDirection: 'row' },
  weekDot: { width: 18, height: 4, borderRadius: 2, marginLeft: 4 },
  programMeta: { marginTop: 8, fontSize: 12 },
  programList: { gap: 10 },
  sportProg: {
    backgroundColor: colors.surface,
    borderLeftWidth: 4,
    borderLeftColor: colors.scoreGreen,
    borderRadius: 18,
    padding: 16,
  },
  sportProgHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sportProgHeadMain: { flex: 1, paddingRight: 12 },
  sportProgRestart: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  sportProgTitle: {
    fontSize: 14,
    color: colors.textPrimary,
    fontFamily: 'Inter_700Bold',
  },
  sportProgSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 3,
  },
  sportProgBar: { flexDirection: 'row', gap: 3 },
  sportProgSeg: { flex: 1, height: 6, borderRadius: 3 },
  sportProgMeta: {
    marginTop: 8,
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statTile: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  statValue: {
    fontSize: 26,
    color: colors.textPrimary,
    fontFamily: 'Inter_700Bold',
    marginTop: 6,
    lineHeight: 30,
  },
  statSkeleton: { marginTop: 6 },
  maxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  maxMain: { flex: 1 },
  maxName: { fontSize: 14, color: colors.text.primary },
  maxWeight: { fontSize: 22, color: colors.scoreGreen, lineHeight: 26 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 6,
  },
  infoLabel: { fontSize: 12 },
  subEyebrow: {
    letterSpacing: 2,
    fontSize: 11,
    marginTop: 18,
    marginBottom: 8,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
  },
  sportRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 6,
  },
  sportEmoji: { fontSize: 22, marginRight: 12 },
  sportMain: { flex: 1 },
  sportName: { color: colors.text.primary, fontSize: 14 },
  sportSummary: { fontSize: 11, marginTop: 2 },
  reconfigureLink: { fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 2 },
  freqRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  freqLabel: { fontSize: 11, marginRight: 2 },
  freqBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  freqBtnDisabled: { opacity: 0.4 },
  freqSign: { fontFamily: 'Inter_700Bold', fontSize: 15, color: colors.textPrimary, lineHeight: 18 },
  freqValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: colors.textPrimary,
    minWidth: 16,
    textAlign: 'center',
  },
  pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: colors.surfaceAlt,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  sheetHandleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  pickerTitle: { fontSize: 18, marginBottom: 14 },
  pickerOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.surface,
    marginBottom: 8,
  },
  pickerOptionActive: { backgroundColor: colors.scoreGreen },
  pickerOptionText: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.textPrimary },
  pickerOptionTextActive: { color: colors.background },
  infoValueRow: { flexDirection: 'row', alignItems: 'center' },
  infoValue: { color: colors.text.primary, fontFamily: 'Inter_500Medium', fontSize: 13, marginRight: 6 },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  emptyText: { textAlign: 'center' },
  zoneInfoLink: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  zoneInfoText: { color: colors.scoreGreen, fontFamily: 'Inter_500Medium', fontSize: 14 },
  notifCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
  },
  notifToggleRow: { flexDirection: 'row', alignItems: 'center' },
  notifToggleMain: { flex: 1, paddingRight: 12 },
  switchTrack: { width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.bg.primary },
  switchThumbOn: { alignSelf: 'flex-end' },
  switchThumbOff: { alignSelf: 'flex-start' },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  timeSteppers: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeColon: { fontSize: 22, color: colors.text.primary },
  stepper: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  stepperBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperSign: { color: colors.scoreGreen, fontFamily: 'Inter_700Bold', fontSize: 16 },
  stepperValue: { fontSize: 22, color: colors.text.primary, minWidth: 32, textAlign: 'center' },
  logoutBtn: { marginTop: 12, alignItems: 'center', paddingVertical: 14 },
  resetBtn: {
    marginTop: 24,
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 12,
  },
  resetText: {
    color: colors.danger,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  logoutText: { color: colors.danger, fontFamily: 'Inter_500Medium', fontSize: 14 },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  healthRowMain: { flex: 1 },
  healthRowTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  healthDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  healthConnectBtn: {
    marginTop: 12,
    backgroundColor: colors.scoreGreen,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  healthConnectText: { fontSize: 14 },
});
