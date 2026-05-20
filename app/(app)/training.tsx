import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight, Search } from 'lucide-react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { todayDateString, type DailyCheckin } from '@/lib/firestore';
import {
  EXERCISES,
  EXERCISE_CATEGORIES,
  type Exercise,
  type ExerciseCategory,
  type ExerciseSport,
  type MuscleGroup,
} from '@/data/exercises';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';

type FilterKey = ExerciseCategory | 'all' | ExerciseSport;

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

const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  quadriceps: 'Quadriceps',
  hamstrings: 'Ischios',
  glutes: 'Fessiers',
  calves: 'Mollets',
  lower_back: 'Lombaires',
  upper_back: 'Dos haut',
  lats: 'Dorsaux',
  traps: 'Trapèzes',
  shoulders: 'Épaules',
  chest: 'Pectoraux',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Avant-bras',
  core: 'Abdos',
  hip_flexors: 'Psoas',
};

const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  olympic_lift: 'Haltéro',
  squat: 'Squat',
  hinge: 'Charnière',
  push: 'Poussée',
  pull: 'Tirage',
  core: 'Gainage',
  accessory: 'Accessoire',
};

const DIFFICULTY_COLORS = {
  beginner: colors.success,
  intermediate: colors.orbe.amber,
  advanced: colors.danger,
} as const;

const DIFFICULTY_LABELS = {
  beginner: 'Débutant',
  intermediate: 'Inter.',
  advanced: 'Avancé',
} as const;

function matchesFilter(exercise: Exercise, filter: FilterKey): boolean {
  if (filter === 'all') return true;
  if (filter === 'weightlifting' || filter === 'strength' || filter === 'both') {
    return exercise.sport === filter || exercise.sport === 'both';
  }
  return exercise.category === filter;
}

export default function TrainingScreen(): React.ReactElement {
  const router = useRouter();
  const [search, setSearch] = useState<string>('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid, 'checkins', todayDateString()),
      (snap) => {
        if (!snap.exists()) {
          setScore(null);
          return;
        }
        const data = snap.data() as DailyCheckin;
        setScore(data.zone_score);
      },
      () => setScore(null),
    );
    return unsubscribe;
  }, []);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return EXERCISES.filter((e) => matchesFilter(e, filter)).filter((e) => {
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.name_en.toLowerCase().includes(q)
      );
    });
  }, [search, filter]);

  const banner = bannerForScore(score);

  return (
    <SafeScreen>
      <View style={styles.header}>
        <ZoneText variant="heading" style={styles.title}>
          BIBLIOTHÈQUE
        </ZoneText>
        <ZoneText variant="caption" color={colors.text.muted}>
          {EXERCISES.length} exercices
        </ZoneText>
      </View>

      {banner ? (
        <View style={[styles.banner, { borderLeftColor: banner.border }]}>
          <ZoneText variant="caption" style={styles.bannerText}>
            {banner.message}
          </ZoneText>
        </View>
      ) : null}

      <View style={styles.searchRow}>
        <Search size={18} color={colors.text.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un exercice"
          placeholderTextColor={colors.text.muted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {EXERCISE_CATEGORIES.map((c) => {
          const active = filter === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              activeOpacity={0.8}
              onPress={() => setFilter(c.key)}
              style={[
                styles.chip,
                {
                  borderColor: active ? colors.accent.gold : colors.border,
                  backgroundColor: active ? colors.bg.elevated : colors.bg.card,
                },
              ]}
            >
              <ZoneText
                variant="label"
                color={active ? colors.accent.gold : colors.text.secondary}
                style={styles.chipText}
              >
                {c.label}
              </ZoneText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }: ListRenderItemInfo<Exercise>) => (
          <ExerciseRow
            exercise={item}
            onPress={() => router.push(`/(app)/exercise/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ZoneText variant="caption" color={colors.text.muted}>
              Aucun exercice ne correspond.
            </ZoneText>
          </View>
        }
      />
    </SafeScreen>
  );
}

function ExerciseRow({
  exercise,
  onPress,
}: {
  exercise: Exercise;
  onPress: () => void;
}): React.ReactElement {
  const primary = exercise.muscles_primary.slice(0, 3);
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.row}>
      <View style={styles.rowMain}>
        <View style={styles.rowHeader}>
          <View
            style={[
              styles.difficultyDot,
              { backgroundColor: DIFFICULTY_COLORS[exercise.difficulty] },
            ]}
          />
          <ZoneText variant="label" style={styles.rowName}>
            {exercise.name}
          </ZoneText>
        </View>
        <View style={styles.rowMeta}>
          <View style={styles.categoryBadge}>
            <ZoneText variant="caption" color={colors.text.secondary} style={styles.badgeText}>
              {CATEGORY_LABELS[exercise.category]}
            </ZoneText>
          </View>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.difficultyText}>
            {DIFFICULTY_LABELS[exercise.difficulty]}
          </ZoneText>
        </View>
        <View style={styles.muscleRow}>
          {primary.map((m) => (
            <View key={m} style={styles.musclePill}>
              <ZoneText variant="caption" color={colors.accent.gold} style={styles.musclePillText}>
                {MUSCLE_LABELS[m]}
              </ZoneText>
            </View>
          ))}
        </View>
      </View>
      <ChevronRight size={18} color={colors.text.muted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 28, letterSpacing: 2 },
  banner: {
    marginHorizontal: 24,
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: colors.bg.card,
    borderLeftWidth: 3,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bannerText: { color: colors.text.primary, fontSize: 13, lineHeight: 18 },
  searchRow: {
    marginHorizontal: 24,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    color: colors.text.primary,
    fontFamily: 'Inter-Regular',
    fontSize: 15,
    paddingVertical: 0,
  },
  chipsRow: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
  },
  chipText: { fontSize: 13, letterSpacing: 0.5 },
  listContent: { paddingHorizontal: 24, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  rowMain: { flex: 1 },
  rowHeader: { flexDirection: 'row', alignItems: 'center' },
  difficultyDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  rowName: { color: colors.text.primary, fontSize: 16 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.bg.elevated,
    borderRadius: 999,
    marginRight: 8,
  },
  badgeText: { fontSize: 11 },
  difficultyText: { fontSize: 11 },
  muscleRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  musclePill: {
    backgroundColor: 'rgba(201,168,76,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.4)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 6,
    marginBottom: 4,
  },
  musclePillText: { fontSize: 11 },
  empty: { padding: 24, alignItems: 'center' },
});
