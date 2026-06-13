import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';
import type { ProReadinessScore } from '@/lib/pro';

export interface ProReadinessCardProps {
  readiness: ProReadinessScore;
  zoneScore: number;
  acwr: number;
  acwrRiskLabel: string;
  avgSleepHours: number;
  tsb: number;
  tsbLabel: string;
}

/**
 * Soften harsh user-facing wording at display time without touching any
 * underlying enum values, risk levels or science function output.
 */
function softenLabel(text: string): string {
  return text
    .replace(/surmenage/gi, 'Fatigue élevée')
    .replace(/danger/gi, 'À surveiller');
}

/** Readiness score colour driven by the value, per design spec. */
function colorForReadiness(score: number): string {
  if (score > 70) return colors.scoreGreen;
  if (score >= 40) return colors.warning;
  return colors.danger;
}

export function ProReadinessCard({
  readiness,
  zoneScore,
  acwr,
  acwrRiskLabel,
  avgSleepHours,
  tsb,
  tsbLabel,
}: ProReadinessCardProps): React.ReactElement {
  const scoreColor = colorForReadiness(readiness.score);
  return (
    <View style={styles.card}>
      <ZoneText variant="label" size={13} color={colors.text.primary} style={styles.cardTitle}>
        Comment tu te sens aujourd’hui
      </ZoneText>
      <View style={styles.row}>
        <View style={styles.left}>
          <ZoneText
            variant="heading"
            size={48}
            color={scoreColor}
            style={styles.scoreText}
          >
            {readiness.score}
          </ZoneText>
          <ZoneText
            variant="label"
            size={12}
            color={scoreColor}
            style={styles.label}
          >
            {softenLabel(readiness.label)}
          </ZoneText>
        </View>
        <View style={styles.indicators}>
          <Indicator
            label="Énergie"
            value={`${Math.round(zoneScore)}/100`}
          />
          <Indicator
            label="Rythme"
            value={softenLabel(acwrRiskLabel)}
          />
          <Indicator
            label="Sommeil"
            value={`${avgSleepHours.toFixed(1)} h`}
          />
          <Indicator
            label="Forme"
            value={softenLabel(tsbLabel)}
          />
        </View>
      </View>
      <ZoneText
        variant="body"
        size={13}
        color="rgba(255,255,255,0.6)"
        style={styles.headline}
      >
        {softenLabel(readiness.headline)}
      </ZoneText>
    </View>
  );
}

interface IndicatorProps {
  label: string;
  value: string;
}

function Indicator({ label, value }: IndicatorProps): React.ReactElement {
  return (
    <View style={styles.indicator}>
      <ZoneText variant="caption" size={10} color="rgba(255,255,255,0.4)" style={styles.indicatorLabel}>
        {label}
      </ZoneText>
      <ZoneText variant="label" size={14} color="rgba(255,255,255,0.8)" style={styles.indicatorValue}>
        {value}
      </ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  left: {
    width: 120,
    alignItems: 'flex-start',
  },
  cardTitle: {
    letterSpacing: 1,
    marginBottom: 12,
  },
  scoreText: {
    letterSpacing: 1,
  },
  label: {
    letterSpacing: 1.4,
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
  },
  indicators: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  indicator: {
    width: '48%',
    paddingVertical: 6,
  },
  indicatorLabel: {
    marginBottom: 2,
  },
  indicatorValue: {
    fontFamily: 'Inter_700Bold',
  },
  headline: {
    marginTop: 12,
    fontStyle: 'italic',
  },
});
