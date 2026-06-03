import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Info } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';
import type { ProSport, WeekProgressionResult } from '@/lib/weekProgression';

export type BilanStatus = 'full' | 'partial' | 'insufficient';

export interface BilanSummary {
  sport: ProSport;
  sportLabel: string;
  weekNumber: number;
  plannedSessions: number;
  completedSessions: number;
  plannedKm?: number | null;
  actualKm?: number | null;
  status: BilanStatus;
  result: WeekProgressionResult;
}

export interface BilanCardProps {
  summary: BilanSummary;
  onAdvance: () => void;
  onRepeat?: () => void;
  onInfoPress?: () => void;
}

const STATUS_COLOR: Record<BilanStatus, string> = {
  full: colors.orbe.green,
  partial: colors.orbe.amber,
  insufficient: colors.orbe.red,
};

const STATUS_ICON: Record<BilanStatus, string> = {
  full: 'OK',
  partial: 'PARTIEL',
  insufficient: 'INSUFFISANT',
};

function formatKm(n: number | null | undefined): string {
  if (n === null || n === undefined) return '0';
  return `${Math.round(n * 10) / 10}`;
}

function buildPrimaryLine(s: BilanSummary): string {
  if (s.sport === 'running' && (s.plannedKm ?? 0) > 0) {
    const planned = s.plannedKm ?? 0;
    const actual = s.actualKm ?? 0;
    const pct = planned > 0 ? Math.round((actual / planned) * 100) : 0;
    return `${formatKm(actual)}/${formatKm(planned)}km (${pct} %)`;
  }
  return `${s.completedSessions}/${s.plannedSessions} séances`;
}

function buildAdjustmentLine(s: BilanSummary): string | null {
  const adj = s.result.adjustments;
  if (adj.intensityDelta !== undefined && adj.intensityDelta !== 0) {
    const sign = adj.intensityDelta > 0 ? '+' : '';
    return `Progression: ${sign}${Math.round(adj.intensityDelta * 1000) / 10} %`;
  }
  if (adj.volumeMultiplier !== undefined && adj.volumeMultiplier !== 1) {
    const planned = s.plannedKm ?? 0;
    if (planned > 0) {
      const next = Math.round(planned * adj.volumeMultiplier * 10) / 10;
      return `Semaine ${s.weekNumber + 1}: ${next}km prévus`;
    }
    const pct = Math.round(adj.volumeMultiplier * 100);
    return `Volume semaine ${s.weekNumber + 1}: ${pct} %`;
  }
  if (adj.priorityMuscles && adj.priorityMuscles.length > 0) {
    return `Priorité semaine ${s.weekNumber + 1}: ${adj.priorityMuscles.join(', ')}`;
  }
  if (adj.priorityStations && adj.priorityStations.length > 0) {
    return `Priorité semaine ${s.weekNumber + 1}: ${adj.priorityStations.join(', ')}`;
  }
  return null;
}

export function BilanCard({
  summary,
  onAdvance,
  onRepeat,
  onInfoPress,
}: BilanCardProps): React.ReactElement {
  const statusColor = STATUS_COLOR[summary.status];
  const tag = STATUS_ICON[summary.status];
  const primary = buildPrimaryLine(summary);
  const adjustment = buildAdjustmentLine(summary);
  const showRepeat = summary.result.shouldRepeat && !!onRepeat;

  return (
    <View style={[styles.card, { borderLeftColor: statusColor }]}>
      <View style={styles.headerRow}>
        <View style={styles.eyebrowGroup}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
            BILAN SEMAINE {summary.weekNumber} · {summary.sportLabel.toUpperCase()}
          </ZoneText>
          {onInfoPress ? (
            <TouchableOpacity
              onPress={onInfoPress}
              hitSlop={10}
              style={styles.infoBtn}
              accessibilityLabel="Voir les détails du programme"
            >
              <Info size={14} color={colors.text.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <ZoneText variant="caption" color={statusColor} style={styles.tag}>
          {tag}
        </ZoneText>
      </View>

      <ZoneText variant="body" color={colors.text.primary} style={styles.primary}>
        {primary}
      </ZoneText>

      {adjustment ? (
        <ZoneText variant="caption" color={colors.text.secondary} style={styles.adjustment}>
          {adjustment}
        </ZoneText>
      ) : null}

      <ZoneText variant="caption" color={colors.text.secondary} style={styles.note}>
        {summary.result.note}
      </ZoneText>

      <View style={styles.actions}>
        {showRepeat ? (
          <View style={styles.actionHalf}>
            <Button title={`Reprendre S${summary.weekNumber}`} variant="secondary" onPress={onRepeat} />
          </View>
        ) : null}
        <View style={showRepeat ? styles.actionHalf : styles.actionFull}>
          <Button title={`Semaine ${summary.weekNumber + 1}`} onPress={onAdvance} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 24,
    marginTop: 12,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderRadius: 14,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: { letterSpacing: 1, fontSize: 11 },
  eyebrowGroup: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  infoBtn: { marginLeft: 6, padding: 2 },
  tag: { letterSpacing: 1, fontSize: 11, fontFamily: 'Inter-Bold' },
  primary: { fontSize: 16, marginTop: 8 },
  adjustment: { marginTop: 6, lineHeight: 17 },
  note: { marginTop: 10, lineHeight: 17 },
  actions: { flexDirection: 'row', marginTop: 14, gap: 10 },
  actionHalf: { flex: 1 },
  actionFull: { flex: 1 },
});
