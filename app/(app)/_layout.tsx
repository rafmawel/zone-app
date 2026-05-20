import React from 'react';
import { Stack } from 'expo-router';
import { colors } from '@/theme/colors';

export default function AppLayout(): React.ReactElement {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg.primary },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="checkin" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="exercise/[id]" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
