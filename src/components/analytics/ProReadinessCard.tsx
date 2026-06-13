import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';

export interface ProReadinessCardProps {
  /** Today's (or latest) Zone score, or null when there is no check-in. */
  score: number | null;
  sleepHours: number | null;
  energyLabel: string;
  recoveryLabel: string;
}

function scoreColor(s: number): string {
  if (s >= 70) return colors.scoreGreen;
  if (s >= 40) return colors.warning;
  return colors.danger;
}

function stateLabel(s: number): string {
  if (s >= 70) return 'Prêt à performer';
  if (s >= 50) return 'En bonne forme';
  if (s >= 30) return 'Récupération';
  return 'Repos conseillé';
}

function humanMessage(s: number): string {
  if (s >= 70) return 'Tu es en forme, vas-y !';
  if (s >= 50) return "Bonne journée pour t'entraîner.";
  if (s >= 30) return "Écoute ton corps aujourd'hui.";
  return 'Récupération prioritaire.';
}

/** Section 1 — "Comment tu te sens" : score, 3 simple metrics, human message. */
export function ProReadinessCard({
  score,
  sleepHours,
  energyLabel,
  recoveryLabel,
}: ProReadinessCardProps): React.ReactElement {
  const has = typeof score === 'number';
  const color = has ? scoreColor(score) : colors.textSecondary;
  return (
    <View style={styles.card}>
      <ZoneText style={styles.title}>Score Zone aujourd'hui</ZoneText>
      <View style={styles.scoreRow}>
        <ZoneText style={[styles.score, { color }]}>{has ? score : '—'}</ZoneText>
        <ZoneText style={[styles.state, { color }]} numberOfLines={2}>
          {has ? stateLabel(score) : 'Pas de check-in'}
        </ZoneText>
      </View>
      <View style={styles.metrics}>
        <MetricRow icon="😴" label="Sommeil" value={sleepHours != null ? `${sleepHours.toFixed(1)}h` : '—'} />
        <MetricRow icon="⚡" label="Énergie" value={energyLabel} />
        <MetricRow icon="💪" label="Récup." value={recoveryLabel} />
      </View>
      <ZoneText style={styles.message} numberOfLines={2}>
        {has
          ? `« ${humanMessage(score)} »`
          : 'Fais ton check-in du jour pour voir ton score.'}
      </ZoneText>
    </View>
  );
}

function MetricRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}): React.ReactElement {
  return (
    <View style={styles.metricRow}>
      <ZoneText style={styles.metricIcon}>{icon}</ZoneText>
      <ZoneText style={styles.metricLabel}>{label}</ZoneText>
      <ZoneText style={styles.metricValue} numberOfLines={1}>
        {value}
      </ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 20 },
  title: { fontFamily: 'Inter_500Medium', fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  score: { fontFamily: 'Inter_700Bold', fontSize: 48, lineHeight: 52 },
  state: { fontFamily: 'Inter_600SemiBold', fontSize: 14, flex: 1 },
  metrics: { marginTop: 16, gap: 10 },
  metricRow: { flexDirection: 'row', alignItems: 'center' },
  metricIcon: { fontSize: 14, width: 26 },
  metricLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.5)', flex: 1 },
  metricValue: { fontFamily: 'Inter_700Bold', fontSize: 13, color: 'rgba(255,255,255,0.9)' },
  message: {
    fontFamily: 'Inter_400Regular',
    fontStyle: 'italic',
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 16,
    lineHeight: 18,
  },
});
