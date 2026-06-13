import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';
import { LineChart } from './charts';

export interface FormFatigueCardProps {
  /** Up to 8 weekly average Zone scores (oldest first). NaN = no data that week. */
  weeklyScores: number[];
  average: number;
  /** Points difference between the most recent and earliest weeks. */
  trend: number;
}

// Screen padding (16×2) + card padding (16×2).
const CHART_W = Dimensions.get('window').width - 64;

/** Section 3 — "Ta forme du moment" : single Zone-score line + avg & trend. */
export function FormFatigueCard({
  weeklyScores,
  average,
  trend,
}: FormFatigueCardProps): React.ReactElement {
  const labels = weeklyScores.map((_, i) => `S${i + 1}`);
  const trendColor =
    trend > 0 ? colors.scoreGreen : trend < 0 ? colors.danger : 'rgba(255,255,255,0.6)';
  const trendStr = trend === 0 ? '–' : `${trend > 0 ? '↑ +' : '↓ −'}${Math.abs(trend)} pts`;
  const hasData = weeklyScores.some((v) => Number.isFinite(v));

  return (
    <View style={styles.card}>
      <ZoneText style={styles.title}>Ta forme du moment</ZoneText>
      {hasData ? (
        <>
          <View style={styles.chart}>
            <LineChart
              width={CHART_W}
              height={160}
              yMin={0}
              yMax={100}
              xLabels={labels}
              series={[{ values: weeklyScores, color: colors.scoreGreen, strokeWidth: 2 }]}
              guides={[
                { y: 0, color: 'rgba(255,255,255,0.05)' },
                { y: 50, color: 'rgba(255,255,255,0.05)' },
                { y: 100, color: 'rgba(255,255,255,0.05)' },
              ]}
            />
          </View>
          <View style={styles.metrics}>
            <View style={styles.metric}>
              <ZoneText style={styles.metricLabel}>Moyenne</ZoneText>
              <ZoneText style={styles.metricValue}>
                {Number.isFinite(average) ? average : '—'}
              </ZoneText>
            </View>
            <View style={styles.metric}>
              <ZoneText style={styles.metricLabel}>Tendance</ZoneText>
              <ZoneText style={[styles.metricValue, { color: trendColor }]}>{trendStr}</ZoneText>
            </View>
          </View>
        </>
      ) : (
        <ZoneText style={styles.empty} numberOfLines={2}>
          Fais quelques check-ins pour voir ta forme évoluer.
        </ZoneText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 16 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 16, color: colors.textPrimary },
  chart: { marginTop: 12, alignItems: 'center' },
  metrics: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  metric: { flex: 1 },
  metricLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  metricValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: colors.textPrimary,
    marginTop: 2,
  },
  empty: {
    fontFamily: 'Inter_400Regular',
    fontStyle: 'italic',
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 12,
    lineHeight: 18,
  },
});
