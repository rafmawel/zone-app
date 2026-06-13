import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, type SportColorKey } from '@/theme/colors';
import { ZoneText } from './ZoneText';

const SPORT_LABELS: Record<SportColorKey, string> = {
  haltero: 'Haltérophilie',
  run: 'Course',
  muscu: 'Musculation',
  hyrox: 'Hyrox',
};

export interface SportBadgeProps {
  sport: SportColorKey;
  /** Overrides the default sport name. */
  label?: string;
  style?: ViewStyle;
}

/** Rounded pill filled with the sport accent colour. */
export function SportBadge({ sport, label, style }: SportBadgeProps): React.ReactElement {
  return (
    <View style={[styles.badge, { backgroundColor: colors[sport] }, style]}>
      <ZoneText style={styles.text}>
        {(label ?? SPORT_LABELS[sport]).toUpperCase()}
      </ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
