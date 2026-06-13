import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';
import type { ProSport } from '@/lib/weekProgression';
import { labelForSport } from '@/lib/weekBilan';

export interface ProgrammeCompleteCardProps {
  sport: ProSport;
  totalSessions: number;
  totalVolume: number;
  volumeUnit?: string;
  onNewCycle: () => void;
  onMaintenance: () => void;
}

export function ProgrammeCompleteCard({
  sport,
  totalSessions,
  totalVolume,
  volumeUnit,
  onNewCycle,
  onMaintenance,
}: ProgrammeCompleteCardProps): React.ReactElement {
  const unit = volumeUnit ?? 'kg';
  return (
    <View style={styles.card}>
      <ZoneText variant="caption" color={colors.scoreGreen} style={styles.trophy}>
        PROGRAMME TERMINÉ · {labelForSport(sport).toUpperCase()}
      </ZoneText>
      <ZoneText variant="body" color={colors.text.primary} style={styles.line}>
        12 semaines · {totalSessions} séances · {Math.round(totalVolume)} {unit}
      </ZoneText>
      <View style={styles.actions}>
        <View style={styles.actionHalf}>
          <Button title="Nouveau cycle" onPress={onNewCycle} />
        </View>
        <View style={styles.actionHalf}>
          <Button title="Maintenance" variant="secondary" onPress={onMaintenance} />
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
    borderColor: colors.scoreGreen,
    borderRadius: 14,
    padding: 16,
  },
  trophy: { letterSpacing: 1, fontSize: 12, fontFamily: 'Inter_700Bold' },
  line: { fontSize: 14, marginTop: 8 },
  actions: { flexDirection: 'row', marginTop: 14, gap: 10 },
  actionHalf: { flex: 1 },
});
