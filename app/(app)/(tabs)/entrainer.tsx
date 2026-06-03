import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, Lock, Play, Search } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import {
  getCompletedSessions,
  getHyroxProfile,
  getMuscleProfile,
  getRunningProfile,
  getUserProgram,
  type TrainingSession,
} from '@/lib/firestore';
import { frenchShortDate } from '@/lib/frenchDate';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { useSession } from '@/context/SessionContext';

type Sport = 'weightlifting' | 'running' | 'musculation' | 'hyrox';

const SPORTS: { key: Sport; label: string; icon: string }[] = [
  { key: 'weightlifting', label: 'Haltérophilie', icon: '🏋️' },
  { key: 'running', label: 'Course', icon: '🏃' },
  { key: 'musculation', label: 'Musculation', icon: '💪' },
  { key: 'hyrox', label: 'Hyrox', icon: '🔥' },
];

const SETUP_ROUTE: Record<Sport, '/(app)/maxes' | '/(app)/running-setup' | '/(app)/muscle-setup' | '/(app)/hyrox-setup'> = {
  weightlifting: '/(app)/maxes',
  running: '/(app)/running-setup',
  musculation: '/(app)/muscle-setup',
  hyrox: '/(app)/hyrox-setup',
};

const CATEGORIES: { label: string; query: string }[] = [
  { label: 'Haltérophilie', query: 'weightlifting' },
  { label: 'Course', query: 'running' },
  { label: 'Musculation', query: 'musculation' },
  { label: 'Hyrox', query: 'hyrox' },
];

const QUICK_EXERCISES: { id: string; name: string }[] = [
  { id: 'snatch', name: 'Arraché' },
  { id: 'clean_and_jerk', name: 'Épaulé-jeté' },
  { id: 'front_squat', name: 'Squat avant' },
];

function sportOf(s: TrainingSession): { label: string; icon: string } {
  if (s.discipline === 'musculation') return { label: 'Muscu', icon: '💪' };
  if (s.sport_key === 'running') return { label: 'Course', icon: '🏃' };
  return { label: 'Haltéro', icon: '🏋️' };
}

export default function EntrainerScreen(): React.ReactElement {
  const router = useRouter();
  const { activeSession } = useSession();
  const [configured, setConfigured] = useState<Set<Sport>>(new Set());
  const [recent, setRecent] = useState<TrainingSession[]>([]);
  const [search, setSearch] = useState<string>('');

  const load = useCallback(async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    const [program, running, muscle, hyrox, completed] = await Promise.all([
      getUserProgram(user.uid).catch(() => null),
      getRunningProfile(user.uid).catch(() => null),
      getMuscleProfile(user.uid).catch(() => null),
      getHyroxProfile(user.uid).catch(() => null),
      getCompletedSessions(user.uid).catch(() => [] as TrainingSession[]),
    ]);
    const set = new Set<Sport>();
    if (program) set.add('weightlifting');
    if (running) set.add('running');
    if (muscle) set.add('musculation');
    if (hyrox) set.add('hyrox');
    setConfigured(set);
    setRecent(completed.slice(0, 5));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onSport = (sport: Sport): void => {
    if (configured.has(sport)) router.push('/(app)/(tabs)/aujourd-hui');
    else router.push(SETUP_ROUTE[sport]);
  };

  const onSearch = (): void => {
    router.push('/(app)/library');
  };

  return (
    <SafeScreen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ZoneText variant="heading" style={styles.screenTitle}>
          ENTRAÎNER
        </ZoneText>

        {activeSession ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push(`/(app)/session/${activeSession.sessionId}`)}
            style={styles.resumeBanner}
          >
            <View style={styles.resumeMain}>
              <ZoneText variant="caption" color={colors.bg.primary} style={styles.resumeEyebrow}>
                SÉANCE EN COURS
              </ZoneText>
              <ZoneText variant="titleSm" color={colors.bg.primary} style={styles.resumeTitle}>
                {activeSession.currentExerciseName || 'Séance'} · Série{' '}
                {activeSession.setsCompleted + 1}/{activeSession.totalSets}
              </ZoneText>
            </View>
            <View style={styles.resumeBtn}>
              <Play size={16} color={colors.accent.gold} fill={colors.accent.gold} />
              <ZoneText variant="caption" color={colors.accent.gold} style={styles.resumeBtnText}>
                REPRENDRE
              </ZoneText>
            </View>
          </TouchableOpacity>
        ) : null}

        <ZoneText variant="caption" style={styles.section}>
          LANCER UNE SÉANCE
        </ZoneText>
        <View style={styles.grid}>
          {SPORTS.map((s) => {
            const isOn = configured.has(s.key);
            return (
              <TouchableOpacity
                key={s.key}
                activeOpacity={0.85}
                onPress={() => onSport(s.key)}
                style={[styles.sportBtn, isOn ? styles.sportBtnOn : null]}
              >
                <View style={styles.sportTop}>
                  <ZoneText style={styles.sportIcon}>{s.icon}</ZoneText>
                  {isOn ? (
                    <ChevronRight size={18} color={colors.accent.gold} />
                  ) : (
                    <Lock size={14} color={colors.text.muted} />
                  )}
                </View>
                <ZoneText
                  variant="titleSm"
                  color={isOn ? colors.text.primary : colors.text.secondary}
                  style={styles.sportName}
                >
                  {s.label}
                </ZoneText>
                <ZoneText variant="caption" color={colors.text.muted}>
                  {isOn ? 'Configuré' : 'À configurer'}
                </ZoneText>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.sectionRow}>
          <ZoneText variant="caption" style={styles.section}>
            RÉCENT
          </ZoneText>
          <TouchableOpacity onPress={() => router.push('/(app)/history')} hitSlop={8}>
            <ZoneText variant="caption" color={colors.accent.gold}>
              Voir tout l'historique →
            </ZoneText>
          </TouchableOpacity>
        </View>
        {recent.length === 0 ? (
          <View style={styles.emptyCard}>
            <ZoneText variant="caption" color={colors.text.muted}>
              Aucune séance terminée pour le moment.
            </ZoneText>
          </View>
        ) : (
          recent.map((s) => {
            const sp = sportOf(s);
            const sets = (s.planned_exercises ?? []).reduce((a, e) => a + e.sets.length, 0);
            return (
              <TouchableOpacity
                key={s.id}
                activeOpacity={0.8}
                onPress={() => router.push(`/(app)/session-detail/${s.id}`)}
                style={styles.recentRow}
              >
                <ZoneText style={styles.recentIcon}>{sp.icon}</ZoneText>
                <View style={styles.recentMain}>
                  <ZoneText variant="label" color={colors.text.primary}>
                    {sp.label} · {frenchShortDate(s.date)}
                  </ZoneText>
                  <ZoneText variant="caption" color={colors.text.muted}>
                    {s.duration_minutes ? `${s.duration_minutes} min · ` : ''}
                    {sets} séries
                  </ZoneText>
                </View>
                <ChevronRight size={16} color={colors.text.muted} />
              </TouchableOpacity>
            );
          })
        )}

        <View style={styles.sectionRow}>
          <ZoneText variant="caption" style={styles.section}>
            BIBLIOTHÈQUE
          </ZoneText>
          <TouchableOpacity onPress={() => router.push('/(app)/library')} hitSlop={8}>
            <ZoneText variant="caption" color={colors.accent.gold}>
              Voir tout →
            </ZoneText>
          </TouchableOpacity>
        </View>
        <TouchableOpacity activeOpacity={1} onPress={onSearch} style={styles.searchBar}>
          <Search size={16} color={colors.text.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={onSearch}
            placeholder="Rechercher un exercice"
            placeholderTextColor={colors.text.muted}
            style={styles.searchInput}
            returnKeyType="search"
          />
        </TouchableOpacity>
        <View style={styles.pillRow}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.query}
              onPress={() => router.push('/(app)/library')}
              activeOpacity={0.8}
              style={styles.catPill}
            >
              <ZoneText variant="caption" color={colors.text.secondary}>
                {c.label}
              </ZoneText>
            </TouchableOpacity>
          ))}
        </View>
        {QUICK_EXERCISES.map((ex) => (
          <TouchableOpacity
            key={ex.id}
            activeOpacity={0.8}
            onPress={() => router.push(`/(app)/exercise/${ex.id}`)}
            style={styles.exRow}
          >
            <ZoneText variant="label" color={colors.text.primary}>
              {ex.name}
            </ZoneText>
            <ChevronRight size={16} color={colors.text.muted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  screenTitle: { fontSize: 26, letterSpacing: 0.5, marginBottom: 16 },
  section: { fontFamily: 'Syne-Bold', fontSize: 13, letterSpacing: 1.5, color: colors.text.muted },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 28,
    marginBottom: 12,
  },
  resumeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent.gold,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  resumeMain: { flex: 1 },
  resumeEyebrow: { fontFamily: 'Inter-Bold', letterSpacing: 1, opacity: 0.8 },
  resumeTitle: { marginTop: 2 },
  resumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bg.primary,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  resumeBtnText: { fontFamily: 'Inter-Bold', letterSpacing: 0.5 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  sportBtn: {
    width: '48.5%',
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  sportBtnOn: { borderColor: colors.accent.gold },
  sportTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sportIcon: { fontSize: 26 },
  sportName: { marginTop: 10 },
  emptyCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  recentIcon: { fontSize: 22, marginRight: 12 },
  recentMain: { flex: 1 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
  },
  searchInput: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    paddingVertical: 0,
  },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 8 },
  catPill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.bg.elevated,
  },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
});
