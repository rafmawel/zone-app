import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Check } from 'lucide-react-native';
import { colors, radius, type SportColorKey } from '@/theme/colors';
import { ZoneText } from './ZoneText';

export type WeekDayStatus = 'done' | 'rest' | 'today' | 'scheduled';

export interface WeekDay {
  label: string;
  status: WeekDayStatus;
  /** Sport accent for `scheduled` days. */
  sport?: SportColorKey;
}

export interface WeekTimelineProps {
  days: WeekDay[];
  style?: ViewStyle;
}

const DOT = 28;

function dotColor(day: WeekDay): string {
  switch (day.status) {
    case 'done':
      return colors.scoreGreen;
    case 'today':
      return colors.textPrimary;
    case 'scheduled':
      return day.sport ? colors[day.sport] : colors.surfaceAlt;
    case 'rest':
    default:
      return colors.surfaceAlt;
  }
}

/** Seven-day strip of status dots inside a surface card. */
export function WeekTimeline({ days, style }: WeekTimelineProps): React.ReactElement {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.row}>
        {days.map((day, i) => (
          <View key={`${day.label}-${i}`} style={styles.col}>
            <View style={[styles.dot, { backgroundColor: dotColor(day) }]}>
              {day.status === 'done' ? (
                <Check size={14} color={colors.background} strokeWidth={3} />
              ) : day.status === 'today' ? (
                <View style={styles.todayInner} />
              ) : null}
            </View>
            <ZoneText style={styles.label}>{day.label}</ZoneText>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { alignItems: 'center', gap: 8 },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.background,
  },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9,
    color: colors.textMuted,
  },
});
