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
      <Stack.Screen name="maxes" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="session/[id]" options={{ animation: 'slide_from_bottom' }} />
      <Stack.Screen name="session-detail/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="running-setup" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="run-session/[id]" options={{ animation: 'none', gestureEnabled: true }} />
      <Stack.Screen name="muscle-setup" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="hyrox-setup" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
