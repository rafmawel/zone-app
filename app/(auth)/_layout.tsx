import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '@/theme/colors';

export default function AuthLayout(): React.ReactElement {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg.primary },
        animation: 'fade',
      }}
    />
  );
}
