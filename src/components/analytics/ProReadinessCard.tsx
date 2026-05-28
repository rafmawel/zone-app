import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Activity, Brain, Moon, TrendingUp } from 'lucide-react-native';
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

function hex(color: string, alphaHex: string): string {
  if (!color.startsWith('#')) return color;
  return `${color}${alphaHex}`;
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
  const tint = readiness.color;
  return (
    <View
      style={[
        styles.card,
        { borderColor: tint, backgroundColor: hex(tint, '26') },
      ]}
    >
      <View style={[styles.leftStrip, { backgroundColor: tint }]} />
      <ZoneText variant="label" size={13} color={colors.text.primary} style={styles.cardTitle}>
        Comment tu te sens aujourd’hui
      </ZoneText>
      <View style={styles.row}>
        <View style={styles.left}>
          <ZoneText
            variant="heading"
            size={72}
            color={tint}
            style={styles.scoreText}
          >
            {readiness.score}
          </ZoneText>
          <ZoneText
            variant="label"
            size={12}
            color={colors.accent.gold}
            style={styles.label}
          >
            {readiness.label}
          </ZoneText>
        </View>
        <View style={styles.indicators}>
          <Indicator
            icon={<Activity size={14} color={colors.text.muted} />}
            label="Ton niveau d’énergie"
            value={`${Math.round(zoneScore)}/100`}
            dotColor={colorForScore(zoneScore)}
          />
          <Indicator
            icon={<TrendingUp size={14} color={colors.text.muted} />}
            label="Ton rythme d’entraînement"
            value={acwrRiskLabel}
            dotColor={colorForACWR(acwr)}
          />
          <Indicator
            icon={<Moon size={14} color={colors.text.muted} />}
            label="Ton sommeil cette semaine"
            value={`${avgSleepHours.toFixed(1)} h`}
            dotColor={colorForSleep(avgSleepHours)}
          />
          <Indicator
            icon={<Brain size={14} color={colors.text.muted} />}
            label="Ta forme du moment"
            value={tsbLabel}
            dotColor={colorForTSB(tsb)}
          />
        </View>
      </View>
      <ZoneText
        variant="body"
        size={13}
        color={colors.text.primary}
        style={styles.headline}
      >
        {readiness.headline}
      </ZoneText>
    </View>
  );
}

interface IndicatorProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  dotColor: string;
}

function Indicator({ icon, label, value, dotColor }: IndicatorProps): React.ReactElement {
  return (
    <View style={styles.indicator}>
      <View style={styles.indicatorHeader}>
        {icon}
        <ZoneText variant="caption" color={colors.text.muted}>
          {label}
        </ZoneText>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
      </View>
      <ZoneText variant="label" size={13} color={colors.text.primary}>
        {value}
      </ZoneText>
    </View>
  );
}

function colorForScore(score: number): string {
  if (score >= 75) return colors.success;
  if (score >= 55) return colors.accent.gold;
  if (score >= 35) return colors.orbe.amber;
  return colors.danger;
}

function colorForACWR(acwr: number): string {
  if (acwr >= 0.8 && acwr <= 1.3) return colors.success;
  if (acwr < 0.6 || (acwr > 1.3 && acwr <= 1.5)) return colors.orbe.amber;
  if (acwr > 1.5) return colors.danger;
  return colors.orbe.blue;
}

function colorForSleep(hours: number): string {
  if (hours >= 7.5) return colors.success;
  if (hours >= 6.5) return colors.orbe.amber;
  return colors.danger;
}

function colorForTSB(tsb: number): string {
  if (tsb >= 5 && tsb <= 25) return colors.success;
  if (tsb < -30) return colors.danger;
  if (tsb < -10 || tsb > 25) return colors.orbe.amber;
  return colors.text.muted;
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    paddingLeft: 20,
    overflow: 'hidden',
  },
  leftStrip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
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
  indicatorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 'auto',
  },
  headline: {
    marginTop: 12,
  },
});
