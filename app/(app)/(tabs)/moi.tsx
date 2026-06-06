import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { Check, ChevronRight, Sparkles } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import { showManageSubscriptions } from '@/lib/subscriptions';
import {
  connectHealthConnect,
  openHealthConnect,
  type HealthConnectStatus,
} from '@/lib/healthConnect';
import { useProSports } from '@/hooks/useProSports';
import {
  ALL_PRO_SPORTS,
  SPORT_LABELS,
  type ProSport,
} from '@/types/subscription';
import {
  deleteAllUserData,
  updateUserProfile,
  saveSubscription,
  getAllTimeStats,
  getExerciseMaxes,
  getHyroxProfile,
  getMuscleProfile,
  getRunningProfile,
  getUserProfile,
  getUserProgram,
  getUserSports,
  resetSportProfile,
  type AllTimeStats,
  type ExerciseMax,
  type HyroxProfile,
  type MuscleProfile,
  type ResettableSport,
  type RunningProfile,
  type UserProfile,
  type UserProgram,
  type UserSport,
} from '@/lib/firestore';
import { getBlockName } from '@/lib/programEngine';
import { readCurrentWeek, readProgrammeQueue } from '@/lib/weekTracking';
import type { ProSport as ProSportKey } from '@/lib/weekProgression';
import { MUSCLE_GOAL_LABELS } from '@/lib/muscleEngine';
import { HYROX_LEVEL_LABELS } from '@/lib/hyroxEngine';
import { vdotLevelLabel } from '@/lib/runningEngine';
import { getExerciseById } from '@/data/exercises';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
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


const VALID_PROMO_CODES: string[] = ['ZONE-DEV', 'ZONE-BETA', 'ZONE-PRO-2026', 'RAPHAEL'];

function formatVolume(kg: number): string {
  if (!Number.isFinite(kg)) return '0 kg';
  return `${Math.round(kg).toLocaleString('fr-FR')} kg`;
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
  const { subscription, hasProBase, proSports, refresh } = useProSports();
  const [promoVisible, setPromoVisible] = useState<boolean>(false);
  const [promoCode, setPromoCode] = useState<string>('');
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoSaving, setPromoSaving] = useState<boolean>(false);
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
      const [p, pr, sp, m, st, rp, mp, hp] = await Promise.all([
        getUserProfile(user.uid),
        getUserProgram(user.uid),
        getUserSports(user.uid),
        getExerciseMaxes(user.uid),
        getAllTimeStats(user.uid),
        getRunningProfile(user.uid),
        getMuscleProfile(user.uid),
        getHyroxProfile(user.uid),
      ]);
      setProfile(p);
      setProgram(pr);
      setSports(sp);
      setMaxes(m);
      setStats(st);
      setRunningProfile(rp);
      setMuscleProfile(mp);
      setHyroxProfile(hp);
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

  useFocusEffect(
    useCallback(() => {
      void loadAll();
    }, [loadAll]),
  );

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

  const onSubmitPromo = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    const normalized = promoCode.trim().toUpperCase();
    if (!VALID_PROMO_CODES.includes(normalized)) {
      setPromoError('Code invalide.');
      return;
    }
    setPromoSaving(true);
    setPromoError(null);
    try {
      await saveSubscription(user.uid, {
        hasProBase: true,
        proSports: [...ALL_PRO_SPORTS],
        plan: 'bundle',
        expiresAt: '2099-12-31',
        source: 'promo',
      });
      await refresh();
      setPromoVisible(false);
      setPromoCode('');
      Alert.alert('Zone Pro', 'Accès Pro activé. Bienvenue dans la zone.');
    } catch {
      setPromoError("Activation impossible. Réessaie.");
    } finally {
      setPromoSaving(false);
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

  // Sports the user has actually configured in the app.
  const configuredSports: ProSport[] = [
    program ? ('weightlifting' as const) : null,
    runningProfile ? ('running' as const) : null,
    muscleProfile ? ('musculation' as const) : null,
    hyroxProfile ? ('hyrox' as const) : null,
  ].filter((s): s is ProSport => s !== null);

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
            MON ABONNEMENT
          </ZoneText>
          {hasProBase ? (
            <View style={styles.subscriptionCardPro}>
              <View style={styles.subscriptionHeader}>
                <View style={styles.subscriptionTitleRow}>
                  <Sparkles size={18} color={colors.accent.gold} />
                  <ZoneText variant="heading" style={styles.subscriptionTitleGold}>
                    ZONE PRO · ACTIF
                  </ZoneText>
                </View>
                <Check size={18} color={colors.accent.gold} />
              </View>

              <View style={styles.sportPills}>
                {proSports.map((sport) => (
                  <View key={sport} style={styles.sportPill}>
                    <Check size={12} color={colors.success} />
                    <ZoneText variant="caption" color={colors.success} style={styles.sportPillText}>
                      {SPORT_LABELS[sport]}
                    </ZoneText>
                  </View>
                ))}
              </View>

              <ZoneText variant="caption" color={colors.text.muted} style={styles.baseIncluded}>
                Base incluse : ✦ Risque blessure · Readiness · Coach Zone
              </ZoneText>

              {subscription.expiresAt && subscription.expiresAt !== '2099-12-31' ? (
                <ZoneText variant="caption" color={colors.text.muted} style={styles.subscriptionMeta}>
                  Renouvellement le {frenchShortDate(subscription.expiresAt)}
                </ZoneText>
              ) : null}

              <View style={styles.proLinksRow}>
                {proSports.length < ALL_PRO_SPORTS.length ? (
                  <TouchableOpacity
                    onPress={() => router.push('/(app)/paywall')}
                    hitSlop={8}
                  >
                    <ZoneText variant="caption" color={colors.accent.gold}>
                      Ajouter un sport
                    </ZoneText>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => {
                    void showManageSubscriptions();
                  }}
                  hitSlop={8}
                >
                  <ZoneText variant="caption" color={colors.text.secondary}>
                    Gérer l'abonnement
                  </ZoneText>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.subscriptionCard}>
              <ZoneText variant="heading" style={styles.subscriptionTitleMuted}>
                Zone Gratuit
              </ZoneText>
              <ZoneText variant="caption" color={colors.text.muted} style={styles.subscriptionMeta}>
                Débloque l'analyse complète et le coach hebdomadaire.
              </ZoneText>
              {configuredSports.length > 0 ? (
                <View style={styles.sportPills}>
                  {configuredSports.map((sport) => (
                    <View key={sport} style={styles.sportChip}>
                      <ZoneText variant="caption" color={colors.text.secondary}>
                        {SPORT_LABELS[sport]}
                      </ZoneText>
                    </View>
                  ))}
                </View>
              ) : null}
              <Button
                title="PASSER À PRO"
                variant="primary"
                onPress={() => router.push('/(app)/paywall')}
                fullWidth={false}
                style={styles.upgradeBtn}
              />
            </View>
          )}

          {!hasProBase ? (
            <TouchableOpacity
              onPress={() => {
                setPromoError(null);
                setPromoCode('');
                setPromoVisible(true);
              }}
              hitSlop={8}
              style={styles.promoLink}
            >
              <ZoneText variant="caption" color={colors.accent.gold}>
                J'ai un code promo
              </ZoneText>
            </TouchableOpacity>
          ) : null}
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
                  block={program.current_block}
                  blockName={getBlockName(program.current_block)}
                  weekInBlock={Math.min(4, Math.max(1, program.current_week))}
                  totalWeek={currentWeeks.weightlifting}
                />
              ) : null}
              {runningProfile ? (
                <SportProgressRow
                  icon="🏃"
                  label="Course"
                  block={blockFromWeek(currentWeeks.running)}
                  blockName={runningBlockName(currentWeeks.running)}
                  weekInBlock={weekInBlock(currentWeeks.running)}
                  totalWeek={currentWeeks.running}
                />
              ) : null}
              {muscleProfile ? (
                <SportProgressRow
                  icon="💪"
                  label="Musculation"
                  block={blockFromWeek(currentWeeks.musculation)}
                  blockName={muscleBlockName(currentWeeks.musculation)}
                  weekInBlock={weekInBlock(currentWeeks.musculation)}
                  totalWeek={currentWeeks.musculation}
                />
              ) : null}
              {hyroxProfile ? (
                <SportProgressRow
                  icon="🔥"
                  label="Hyrox"
                  block={blockFromWeek(currentWeeks.hyrox)}
                  blockName={hyroxBlockName(currentWeeks.hyrox)}
                  weekInBlock={weekInBlock(currentWeeks.hyrox)}
                  totalWeek={currentWeeks.hyrox}
                />
              ) : null}
            </View>
          ) : (
            <EmptyHint text="Pas de programme actif." />
          )}
        </View>

        <View style={styles.section}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
            MES STATISTIQUES
          </ZoneText>
          <View style={styles.statsGrid}>
            <StatTile label="Total séances" value={stats ? String(stats.totalSessions) : '-'} loading={!stats} />
            <StatTile label="Volume total" value={stats ? formatVolume(stats.totalVolume) : '-'} loading={!stats} />
            <StatTile label="Meilleur streak" value={stats ? `${stats.bestStreak} j` : '-'} loading={!stats} />
            <StatTile label="Score moyen" value={stats ? String(stats.avgZoneScore || '-') : '-'} loading={!stats} />
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
                color={colors.accent.gold}
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
          />
          <InfoRow label="Objectif" value={primarySport?.goal ?? '-'} />
          <InfoRow
            label="Séances par semaine"
            value={primarySport ? `${primarySport.sessions_per_week}` : '-'}
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
                <ZoneText variant="caption" color={colors.accent.gold}>
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
              summary={`Niveau ${program.level} · ${program.sessions_per_week}× / sem`}
              loading={resettingSport === 'weightlifting'}
              onPress={() => onReconfigure('weightlifting')}
            />
          ) : null}
          {runningProfile ? (
            <SportRow
              emoji="🏃"
              name="Course à pied"
              summary={`VDOT ${runningProfile.vdot} · ${vdotLevelLabel(runningProfile.vdot)} · ${runningProfile.sessions_per_week}× / sem`}
              loading={resettingSport === 'running'}
              onPress={() => onReconfigure('running')}
            />
          ) : null}
          {muscleProfile ? (
            <SportRow
              emoji="💪"
              name="Musculation"
              summary={`${MUSCLE_GOAL_LABELS[muscleProfile.goal]} · ${muscleProfile.sessions_per_week}× / sem`}
              loading={resettingSport === 'musculation'}
              onPress={() => onReconfigure('musculation')}
            />
          ) : null}
          {hyroxProfile ? (
            <SportRow
              emoji="🔥"
              name="Hyrox"
              summary={`${HYROX_LEVEL_LABELS[hyroxProfile.level]} · ${hyroxProfile.sessions_per_week}× / sem`}
              loading={resettingSport === 'hyrox'}
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
                  { backgroundColor: notifEnabled ? colors.accent.gold : colors.border },
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
          <Sparkles size={14} color={colors.accent.gold} />
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
        visible={promoVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPromoVisible(false)}
      >
        <View style={styles.promoBackdrop}>
          <View style={styles.promoCard}>
            <ZoneText variant="heading" style={styles.promoTitle}>
              Entre ton code d'accès
            </ZoneText>
            <TextInput
              value={promoCode}
              onChangeText={(t) => {
                setPromoCode(t);
                if (promoError) setPromoError(null);
              }}
              placeholder="ZONE-..."
              placeholderTextColor={colors.text.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.promoInput}
            />
            {promoError ? (
              <ZoneText variant="caption" color={colors.danger} style={styles.promoErrorText}>
                {promoError}
              </ZoneText>
            ) : null}
            <View style={styles.promoActions}>
              <TouchableOpacity
                onPress={() => setPromoVisible(false)}
                style={styles.promoCancel}
                hitSlop={8}
              >
                <ZoneText variant="label" color={colors.text.muted}>
                  Annuler
                </ZoneText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  void onSubmitPromo();
                }}
                disabled={promoSaving}
                style={styles.promoSubmit}
                hitSlop={8}
              >
                <ZoneText variant="label" color={colors.bg.primary} style={styles.promoSubmitText}>
                  {promoSaving ? '...' : 'Valider'}
                </ZoneText>
              </TouchableOpacity>
            </View>
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
}: {
  label: string;
  value: string;
  loading: boolean;
}): React.ReactElement {
  return (
    <View style={styles.statTile}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.statLabel}>
        {label}
      </ZoneText>
      {loading ? (
        <Skeleton width={64} height={22} borderRadius={6} style={styles.statSkeleton} />
      ) : (
        <ZoneText variant="number" style={styles.statValue}>
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
  onPress,
}: {
  emoji: string;
  name: string;
  summary: string;
  loading: boolean;
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
      </View>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        disabled={loading}
      >
        <ZoneText
          color={loading ? colors.text.muted : colors.accent.gold}
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

function InfoRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.infoRow}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.infoLabel}>
        {label}
      </ZoneText>
      <View style={styles.infoValueRow}>
        <ZoneText style={styles.infoValue}>{value}</ZoneText>
        <ChevronRight size={14} color={colors.text.muted} />
      </View>
    </View>
  );
}

function SportProgressRow({
  icon,
  label,
  block,
  blockName,
  weekInBlock,
  totalWeek,
}: {
  icon: string;
  label: string;
  block: number;
  blockName: string;
  weekInBlock: number;
  totalWeek: number;
}): React.ReactElement {
  // 12 segments total — 4 weeks per block × 3 blocks.
  const TOTAL = 12;
  return (
    <View style={styles.sportProg}>
      <View style={styles.sportProgMain}>
        <ZoneText variant="label" color={colors.text.primary} style={styles.sportProgTitle}>
          {icon} {label.toUpperCase()} · Bloc {block} · {blockName} · S{weekInBlock}/4
        </ZoneText>
      </View>
      <View style={styles.sportProgBar}>
        {Array.from({ length: TOTAL }).map((_, i) => {
          const idx = i + 1;
          return (
            <View
              key={i}
              style={[
                styles.sportProgSeg,
                {
                  backgroundColor:
                    idx <= totalWeek ? colors.accent.gold : colors.border,
                },
              ]}
            />
          );
        })}
      </View>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.sportProgMeta}>
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
    borderColor: colors.accent.gold,
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
  subscriptionTitleGold: {
    fontSize: 18,
    color: colors.accent.gold,
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
  sportPillText: { fontFamily: 'Inter-Medium' },
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
    fontFamily: 'Inter-Regular',
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
    backgroundColor: colors.accent.gold,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  promoSubmitText: { fontSize: 14 },
  headerWrap: { alignItems: 'center', marginBottom: 8 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.bg.primary, fontSize: 22, lineHeight: 26 },
  displayName: { marginTop: 10, fontSize: 22, color: colors.text.primary, letterSpacing: 1 },
  email: { marginTop: 4, color: colors.text.secondary, fontSize: 13 },
  memberSince: { marginTop: 2 },
  section: { marginTop: 22 },
  eyebrow: { letterSpacing: 2, fontSize: 11, marginBottom: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modifyLink: { fontFamily: 'Inter-Medium', fontSize: 12 },
  programCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.gold,
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
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.gold,
    borderRadius: 12,
    padding: 12,
  },
  sportProgMain: { marginBottom: 8 },
  sportProgTitle: { fontSize: 13, letterSpacing: 0.5 },
  sportProgBar: { flexDirection: 'row', gap: 2 },
  sportProgSeg: { flex: 1, height: 6, borderRadius: 2 },
  sportProgMeta: { marginTop: 6, fontSize: 11 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  statTile: {
    width: '48%',
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 22, color: colors.text.primary, marginTop: 4, lineHeight: 26 },
  statSkeleton: { marginTop: 6 },
  maxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  maxMain: { flex: 1 },
  maxName: { fontSize: 14, color: colors.text.primary },
  maxWeight: { fontSize: 22, color: colors.accent.gold, lineHeight: 26 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
  },
  infoLabel: { fontSize: 12 },
  subEyebrow: { letterSpacing: 2, fontSize: 11, marginTop: 18, marginBottom: 8 },
  sportRow: {
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
  sportEmoji: { fontSize: 22, marginRight: 12 },
  sportMain: { flex: 1 },
  sportName: { color: colors.text.primary, fontSize: 14 },
  sportSummary: { fontSize: 11, marginTop: 2 },
  reconfigureLink: { fontFamily: 'Inter-Medium', fontSize: 12 },
  infoValueRow: { flexDirection: 'row', alignItems: 'center' },
  infoValue: { color: colors.text.primary, fontFamily: 'Inter-Medium', fontSize: 13, marginRight: 6 },
  empty: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
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
  zoneInfoText: { color: colors.accent.gold, fontFamily: 'Inter-Medium', fontSize: 14 },
  notifCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
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
    borderTopColor: colors.border,
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
  stepperSign: { color: colors.accent.gold, fontFamily: 'Inter-Bold', fontSize: 16 },
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
    fontFamily: 'Inter-Medium',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  logoutText: { color: colors.danger, fontFamily: 'Inter-Medium', fontSize: 14 },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  healthRowMain: { flex: 1 },
  healthRowTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  healthDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  healthConnectBtn: {
    marginTop: 12,
    backgroundColor: colors.accent.gold,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  healthConnectText: { fontSize: 14 },
});
