import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius } from '@/theme/colors';
import { ZoneText } from './ZoneText';

export interface SectionCardProps {
  /** Uppercase eyebrow rendered above the content. */
  title?: string;
  /** Overrides the title colour. */
  color?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

/** Surface-wrapped section with a small uppercase header. */
export function SectionCard({
  title,
  color,
  children,
  style,
}: SectionCardProps): React.ReactElement {
  return (
    <View style={[styles.card, style]}>
      {title ? (
        <ZoneText style={[styles.title, color ? { color } : null]}>
          {title.toUpperCase()}
        </ZoneText>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
  },
  title: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 1,
    color: colors.textMuted,
    marginBottom: 12,
  },
});
