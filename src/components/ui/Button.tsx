import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  type ViewStyle,
} from 'react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from './ZoneText';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
  onPress?: () => void;
}

export function Button({
  title,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  fullWidth = true,
  onPress,
}: ButtonProps): React.ReactElement {
  const isDisabled = disabled || loading;
  const textColor = variant === 'primary' ? colors.bg.primary : colors.accent.gold;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      style={[
        styles.base,
        fullWidth && styles.fullWidth,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <ZoneText variant="label" style={{ color: textColor, fontSize: 16 }}>
          {title}
        </ZoneText>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },
  primary: { backgroundColor: colors.accent.gold },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.accent.gold,
  },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.4 },
});
