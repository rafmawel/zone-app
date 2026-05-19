import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { colors } from '@/theme/colors';

export type ZoneTextVariant = 'heading' | 'body' | 'label' | 'caption';

export interface ZoneTextProps extends TextProps {
  variant?: ZoneTextVariant;
  color?: string;
  size?: number;
}

const variantStyles: Record<ZoneTextVariant, TextStyle> = {
  heading: {
    fontFamily: 'BebasNeue',
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
