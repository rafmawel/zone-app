import React from 'react';
import { StyleSheet, TouchableOpacity, View, type ViewStyle } from 'react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from './ui/ZoneText';

export interface SelectableCardProps {
  title: string;
  emoji?: string;
  subtitle?: string;
  badge?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export function SelectableCard({
  title,
  emoji,
  subtitle,
  badge,
  selected = false,
  disabled = false,
  onPress,
  style,
}: SelectableCardProps): React.ReactElement {
  return (
    <TouchableOpacity
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[
        styles.card,
        {
          borderColor: selected ? colors.accent.gold : colors.border,
          backgroundColor: selected ? colors.bg.elevated : colors.bg.card,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <View style={styles.row}>
        {emoji ? (
          <ZoneText variant="body" style={styles.emoji}>
            {emoji}
          </ZoneText>
        ) : null}
        <View style={styles.textCol}>
          <ZoneText
            variant="label"
            style={{
              color: selected ? colors.accent.gold : colors.text.primary,
              fontFamily: 'Inter-Medium',
              fontSize: 16,
            }}
          >
            {title}
          </ZoneText>
          {subtitle ? (
            <ZoneText variant="caption" style={styles.subtitle}>
              {subtitle}
            </ZoneText>
          ) : null}
        </View>
        {badge ? (
          <View style={styles.badge}>
            <ZoneText variant="caption" color={colors.bg.primary} style={styles.badgeText}>
              {badge}
            </ZoneText>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  emoji: { fontSize: 22, marginRight: 12 },
  textCol: { flex: 1 },
  subtitle: { marginTop: 4 },
  badge: {
    backgroundColor: colors.accent.goldDark,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 12,
  },
  badgeText: { fontFamily: 'Inter-Medium', fontSize: 11 },
});
