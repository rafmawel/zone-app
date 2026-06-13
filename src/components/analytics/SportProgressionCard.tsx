import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, type SportColorKey } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';

export interface ProgressionMetric {
  label: string;
  value: string;
  color?: string;
}

export interface ProgressionItem {
  sport: SportColorKey;
  emoji: string;
  name: string;
  /** When false, show the "pas assez de données" fallback instead of metrics. */
  enoughData: boolean;
  primary?: ProgressionMetric;
  secondary?: ProgressionMetric;
  phrase: string;
}

/** Section 4 — "Ta progression" : one card per active sport. */
export function SportProgressionCard({ item }: { item: ProgressionItem }): React.ReactElement {
  return (
    <View style={[styles.card, { borderLeftColor: colors[item.sport] }]}>
      <ZoneText style={styles.name}>
        {item.emoji}  {item.name}
      </ZoneText>
      {item.enoughData ? (
        <>
          <View style={styles.metrics}>
            {item.primary ? (
              <View style={styles.metric}>
                <ZoneText style={styles.metricLabel} numberOfLines={1}>
                  {item.primary.label}
                </ZoneText>
                <ZoneText
                  style={[styles.metricValue, item.primary.color ? { color: item.primary.color } : null]}
                  numberOfLines={1}
                >
                  {item.primary.value}
                </ZoneText>
              </View>
            ) : null}
            {item.secondary ? (
              <View style={styles.metric}>
                <ZoneText style={styles.metricLabel} numberOfLines={1}>
                  {item.secondary.label}
                </ZoneText>
                <ZoneText
                  style={[
                    styles.metricValueSm,
                    item.secondary.color ? { color: item.secondary.color } : null,
                  ]}
                  numberOfLines={1}
                >
                  {item.secondary.value}
                </ZoneText>
              </View>
            ) : null}
          </View>
          <ZoneText style={styles.phrase} numberOfLines={3}>
            « {item.phrase} »
          </ZoneText>
        </>
      ) : (
        <ZoneText style={styles.phrase} numberOfLines={2}>
          Encore quelques séances pour voir ta progression !
        </ZoneText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    borderLeftWidth: 4,
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
  },
  name: { fontFamily: 'Inter_700Bold', fontSize: 14, color: colors.textPrimary },
  metrics: { flexDirection: 'row', marginTop: 14, gap: 12 },
  metric: { flex: 1 },
  metricLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  metricValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: colors.textPrimary,
    marginTop: 3,
  },
  metricValueSm: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: colors.textPrimary,
    marginTop: 5,
  },
  phrase: {
    fontFamily: 'Inter_400Regular',
    fontStyle: 'italic',
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 14,
    lineHeight: 18,
  },
});
