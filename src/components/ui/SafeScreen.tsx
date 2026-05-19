import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';

export interface SafeScreenProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  edges?: Edge[];
}

export function SafeScreen({
  children,
  style,
  edges = ['top', 'bottom', 'left', 'right'],
}: SafeScreenProps): React.ReactElement {
  return (
    <SafeAreaView edges={edges} style={styles.safe}>
      <View style={[styles.inner, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg.primary },
  inner: { flex: 1, backgroundColor: colors.bg.primary },
});
