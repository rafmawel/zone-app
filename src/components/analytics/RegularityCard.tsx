import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, type SportColorKey } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';

export interface RegularityDay {
  done: boolean;
  sport?: SportColorKey;
  isToday: boolean;
}

export interface RegularityCardProps {
  /** 8 weeks (rows) × 7 days (columns), oldest week first. */
  weeks: RegularityDay[][];
  totalSessions: number;
  streakDays: number;
  weightliftingCount: number;
  runningCount: number;
}

const HALTERO_COLOR = '#4F46E5'; // violet / indigo — weightlifting
const COURSE_COLOR = '#F97316'; // orange — running
const REST_COLOR = 'rgba(255,255,255,0.08)';

/** Dot colour by sport, so the grid matches the legend below it. */
function sportDot(sport: SportColorKey | undefined): string {
  if (sport === 'haltero' || sport === 'muscu') return HALTERO_COLOR;
  if (sport === 'run') return COURSE_COLOR;
  if (sport === 'hyrox') return colors.orbe.amber;
  return REST_COLOR;
}

/** Section 2 — "Ta régularité" : an 8×7 dot grid of completed sessions. */
export function RegularityCard({
  weeks,
  totalSessions,
  streakDays,
  weightliftingCount,
  runningCount,
}: RegularityCardProps): React.ReactElement {
  return (
    <View style={styles.card}>
      <ZoneText style={styles.title}>Ta régularité</ZoneText>
      <ZoneText style={styles.subtitle}>Séances complétées ces 8 dernières semaines</ZoneText>
      <View style={styles.grid}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((day, di) => (
              <View
                key={di}
                style={[
                  styles.dot,
                  { backgroundColor: day.done ? sportDot(day.sport) : REST_COLOR },
                  day.isToday ? styles.today : null,
                ]}
              />
            ))}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        <LegendItem color={HALTERO_COLOR} label="Haltérophilie" />
        <LegendItem color={COURSE_COLOR} label="Course" />
        <LegendItem color={REST_COLOR} label="Repos" />
      </View>

      <ZoneText style={styles.footer}>
        {totalSessions} séance{totalSessions > 1 ? 's' : ''} · {weightliftingCount} haltéro ·{' '}
        {runningCount} course · {streakDays} jour{streakDays > 1 ? 's' : ''} consécutif
        {streakDays > 1 ? 's' : ''}
      </ZoneText>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }): React.ReactElement {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <ZoneText style={styles.legendLabel}>{label}</ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 16 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 16, color: colors.textPrimary },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  grid: { marginTop: 14, gap: 7 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  today: { borderWidth: 1.5, borderColor: '#FFFFFF' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  footer: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 14,
  },
});
