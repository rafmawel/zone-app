import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from './ZoneText';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
}

export function Button({
  title,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  fullWidth = true,
  ...rest
}: ButtonProps): React.ReactElement {
  const isDisabled = disabled || loading;

  const containerStyle: ViewStyle[] = [
    styles.base,
    fullWidth ? styles.fullWidth : null,
    variant === 'primary' ? styles.primary : null,
    variant === 'secondary' ? styles.secondary : null,
    variant === 'ghost' ? styles.ghost : null,
    isDisabled ? styles.disabled : null,
    style ?? {},
  ].filter(Boolean) as ViewStyle[];

  const textColor =
    variant === 'primary'
      ? colors.bg.primary
      : variant === 'secondary'
        ? colors.accent.gold
        : colors.accent.gold;

  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      style={({ pressed }) => [
        ...containerStyle,
        pressed && !isDisabled ? { opacity: 0.85 } : null,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={textColor} size="small" />
        ) : (
          <ZoneText
            variant="label"
            style={{ color: textColor, fontFamily: 'Inter-Bold', fontSize: 16 }}
          >
            {title}
          </ZoneText>
        )}
      </View>
    </Pressable>
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
  primary: {
    backgroundColor: colors.accent.gold,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.accent.gold,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  disabled: { opacity: 0.4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
