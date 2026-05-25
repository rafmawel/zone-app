import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { Check, ChevronRight, Sparkles } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import { showManageSubscriptions, getProExpiryDate } from '@/lib/subscriptions';
import {
  connectHealthConnect,
  openHealthConnect,
  type HealthConnectStatus,
} from '@/lib/healthConnect';
import { usePro } from '@/hooks/usePro';
import {
  deleteAllUserData,
  updateUserProfile,
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
import { MUSCLE_GOAL_LABELS } from '@/lib/muscleEngine';
import { HYROX_LEVEL_LABELS } from '@/lib/hyroxEngine';
import { vdotLevelLabel } from '@/lib/runningEngine';
import { getExerciseById } from '@/data/exercises';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { frenchMonthYear, frenchShortDate } from '@/lib/frenchDate';

const LEVEL_LABEL: Record<string, string> = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  avance: 'Avancé',
  confirme: 'Confirmé',
};


function formatVolume(kg: number): string {
  if (!Number.isFinite(kg)) return '0 kg';
  return `${Math.round(kg).toLocaleString('fr-FR')} kg`;
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
  const { isPro } = usePro();
  const [proExpiry, setProExpiry] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [program, setProgram] = useState<UserProgram | null>(null);
  const [sports, setSports] = useState<UserSport[]>([]);
  const [maxes, setMaxes] = useState<ExerciseMax[]>([]);
  const [stats, setStats] = useState<AllTimeStats | null>(null);
  const [runningProfile, setRunningProfile] = useState<RunningProfile | null>(null);
  const [muscleProfile, setMuscleProfile] = useState<MuscleProfile | null>(null);
  const [hyroxProfile, setHyroxProfile] = useState<HyroxProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [resettingSport, setResettingSport] = useState<ResettableSport | null>(null);

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

  useEffect(() => {
    if (!isPro) {
      setProExpiry(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const exp = await getProExpiryDate();
      if (!cancelled) setProExpiry(exp);
    })();
    return () => {
      cancelled = true;
    };
  }, [isPro]);

  const onSignOut = async (): Promise<void> => {
    try {
      await signOut(auth);
      router.replace('/(auth)/login');
    } catch {
      // surfaced silently
    }
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
          {isPro ? (
            <View style={styles.subscriptionCardPro}>
              <View style={styles.subscriptionHeader}>
                <View style={styles.subscriptionTitleRow}>
                  <Sparkles size={18} color={colors.accent.gold} />
                  <ZoneText variant="heading" style={styles.subscriptionTitleGold}>
                    ZONE PRO · Actif
                  </ZoneText>
                </View>
                <Check size={18} color={colors.accent.gold} />
              </View>
              <ZoneText variant="caption" color={colors.text.muted} style={styles.subscriptionMeta}>
                {proExpiry
                  ? `Renouvellement le ${frenchShortDate(proExpiry)}`
                  : 'Abonnement actif'}
              </ZoneText>
              <TouchableOpacity
                onPress={() => {
                  void showManageSubscriptions();
                }}
                hitSlop={8}
                style={styles.manageLink}
              >
                <ZoneText variant="caption" color={colors.accent.gold}>
                  Gérer l'abonnement
                </ZoneText>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.subscriptionCard}>
              <ZoneText variant="heading" style={styles.subscriptionTitleMuted}>
                Zone Gratuit
              </ZoneText>
              <ZoneText variant="caption" color={colors.text.muted} style={styles.subscriptionMeta}>
                Débloque l'analyse complète et le coach hebdomadaire.
              </ZoneText>
              <Button
                title="PASSER À PRO"
                variant="primary"
                onPress={() => router.push('/(app)/paywall')}
                fullWidth={false}
                style={styles.upgradeBtn}
              />
            </View>
          )}
        </View>

        <View style={styles.section}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
            PROGRAMME ACTUEL
          </ZoneText>
          {loading ? (
            <Skeleton width="100%" height={110} borderRadius={12} />
          ) : program ? (
            <View style={styles.programCard}>
              <ZoneText variant="heading" style={styles.programBlock}>
                BLOC {program.current_block} · {getBlockName(program.current_block)}
              </ZoneText>
              <View style={styles.weekRow}>
                <ZoneText variant="caption" color={colors.text.muted}>
                  Semaine {Math.min(4, program.current_week)}/4
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
              </View>
              <ZoneText variant="caption" color={colors.text.muted} style={styles.programMeta}>
                {program.sport_key === 'running' ? 'Course' : 'Haltérophilie'} ·{' '}
                {program.sessions_per_week}× / semaine
              </ZoneText>
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
                  <ZoneText variant="heading" style={styles.maxWeight}>
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

        <TouchableOpacity
          onPress={onSignOut}
          activeOpacity={0.7}
          style={styles.logoutBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ZoneText style={styles.logoutText}>Se déconnecter</ZoneText>
        </TouchableOpacity>
      </ScrollView>
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
        <ZoneText variant="heading" style={styles.statValue}>
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
  upgradeBtn: {
    marginTop: 12,
    paddingHorizontal: 18,
    alignSelf: 'flex-start',
  },
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
  email: { marginTop: 10, color: colors.text.primary, fontSize: 14 },
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
  logoutBtn: { marginTop: 32, alignItems: 'center', paddingVertical: 14 },
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
