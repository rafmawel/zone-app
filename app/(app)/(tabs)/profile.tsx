import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { ChevronRight } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import {
  getAllTimeStats,
  getExerciseMaxes,
  getUserProfile,
  getUserProgram,
  getUserSports,
  type AllTimeStats,
  type ExerciseMax,
  type UserProfile,
  type UserProgram,
  type UserSport,
} from '@/lib/firestore';
import { getBlockName } from '@/lib/programEngine';
import { getExerciseById } from '@/data/exercises';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Skeleton } from '@/components/ui/Skeleton';
import { frenchMonthYear, frenchShortDate } from '@/lib/frenchDate';

const LEVEL_LABEL: Record<string, string> = {
  debutant: 'Débutant',
  intermediaire: 'Intermédiaire',
  avance: 'Avancé',
  confirme: 'Confirmé',
};

const HEALTH_SOURCE_LABEL: Record<string, string> = {
  health_connect: 'Health Connect',
  manual: 'Manuel',
  both: 'Health Connect + Manuel',
};

function formatVolume(kg: number): string {
  if (!Number.isFinite(kg)) return '0 kg';
  return `${Math.round(kg).toLocaleString('fr-FR')} kg`;
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
  const [loading, setLoading] = useState<boolean>(true);

  const loadAll = useCallback(async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      const [p, pr, sp, m, st] = await Promise.all([
        getUserProfile(user.uid),
        getUserProgram(user.uid),
        getUserSports(user.uid),
        getExerciseMaxes(user.uid),
        getAllTimeStats(user.uid),
      ]);
      setProfile(p);
      setProgram(pr);
      setSports(sp);
      setMaxes(m);
      setStats(st);
    } catch {
      // keep nulls
    } finally {
      setLoading(false);
    }
  }, []);

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
          <InfoRow
            label="Source de données santé"
            value={
              profile?.health_data_source
                ? (HEALTH_SOURCE_LABEL[profile.health_data_source] ?? profile.health_data_source)
                : '-'
            }
          />
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
  logoutText: { color: colors.danger, fontFamily: 'Inter-Medium', fontSize: 14 },
});
