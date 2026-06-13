import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius } from '@/theme/colors';
import { ZoneText } from './ZoneText';

export interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  /** Delta line, e.g. "+2kg ce mois" or "Stable". Coloured by leading sign. */
  delta?: string;
  /** Overrides the value colour (e.g. a sport accent). */
  color?: string;
  style?: ViewStyle;
}

function deltaColor(delta: string): string {
  const t = delta.trim();
  if (t.startsWith('+')) return colors.scoreGreen;
  if (t.startsWith('-') || t.startsWith('−')) return colors.danger;
  return colors.textMuted;
}

/** Compact metric card: muted label, large value, optional delta. */
export function StatCard({
  label,
  value,
  unit,
  delta,
  color,
  style,
}: StatCardProps): React.ReactElement {
  return (
    <View style={[styles.card, style]}>
      <ZoneText style={styles.label}>{label.toUpperCase()}</ZoneText>
      <View style={styles.valueRow}>
        <ZoneText style={[styles.value, color ? { color } : null]}>{value}</ZoneText>
        {unit ? <ZoneText style={styles.unit}>{unit}</ZoneText> : null}
      </View>
      {delta ? (
        <ZoneText style={[styles.delta, { color: deltaColor(delta) }]}>{delta}</ZoneText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.8,
    color: colors.textMuted,
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 8 },
  value: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: colors.textPrimary,
  },
  unit: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  delta: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    marginTop: 4,
  },
});
