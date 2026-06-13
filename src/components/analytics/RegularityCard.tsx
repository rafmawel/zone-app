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
}

/** Section 2 — "Ta régularité" : an 8×7 dot grid of completed sessions. */
export function RegularityCard({
  weeks,
  totalSessions,
  streakDays,
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
                  {
                    backgroundColor:
                      day.done && day.sport ? colors[day.sport] : 'rgba(255,255,255,0.08)',
                  },
                  day.isToday ? styles.today : null,
                ]}
              />
            ))}
          </View>
        ))}
      </View>
      <ZoneText style={styles.footer}>
        {totalSessions} séance{totalSessions > 1 ? 's' : ''} en 8 semaines · {streakDays} jour
        {streakDays > 1 ? 's' : ''} consécutif{streakDays > 1 ? 's' : ''}
      </ZoneText>
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
  footer: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 14,
  },
});
