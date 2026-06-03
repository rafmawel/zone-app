import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { colors } from '@/theme/colors';

export type ZoneTextVariant =
  | 'heading'
  | 'title'
  | 'titleSm'
  | 'number'
  | 'body'
  | 'label'
  | 'caption';

export interface ZoneTextProps extends TextProps {
  variant?: ZoneTextVariant;
  color?: string;
  size?: number;
}

const variantStyles: Record<ZoneTextVariant, TextStyle> = {
  // Section titles / screen headers (Syne).
  heading: {
    fontFamily: 'Syne-Bold',
    fontSize: 24,
    color: colors.text.primary,
    letterSpacing: 0.3,
  },
  title: {
    fontFamily: 'Syne-Bold',
    fontSize: 20,
    color: colors.text.primary,
    letterSpacing: 0.3,
  },
  titleSm: {
    fontFamily: 'Syne-SemiBold',
    fontSize: 16,
    color: colors.text.primary,
    letterSpacing: 0.2,
  },
  // Large numbers only (score, weight, timer) — Bebas.
  number: {
    fontFamily: 'BebasNeue-Regular',
    fontSize: 32,
    color: colors.text.primary,
    letterSpacing: 1,
  },
  body: {
    fontFamily: 'Inter-Regular',
    fontSize: 16,
    color: colors.text.primary,
  },
  label: {
    fontFamily: 'Inter-Medium',
    fontSize: 14,
    color: colors.text.primary,
  },
  caption: {
    fontFamily: 'Inter-Regular',
    fontSize: 12,
    color: colors.text.muted,
  },
};

export function ZoneText({
  variant = 'body',
  color,
  size,
  style,
  children,
  ...rest
}: ZoneTextProps): React.ReactElement {
  const base = variantStyles[variant];
  return (
    <Text
      {...rest}
      style={[
        base,
        color ? { color } : null,
        size ? { fontSize: size } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}
