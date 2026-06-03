import React from 'react';
import { View, type ViewProps, type ViewStyle, StyleSheet } from 'react-native';
import { colors } from '@/theme/colors';

export interface CardProps extends ViewProps {
  style?: ViewStyle | ViewStyle[];
}

export function Card({ style, children, ...rest }: CardProps): React.ReactElement {
  return (
    <View {...rest} style={[styles.base, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 20,
  },
});
