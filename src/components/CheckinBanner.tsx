import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';

/**
 * Prominent banner prompting the user to do today's check-in.
 *
 * Renders a gold pulsing border, French copy and a primary CTA that
 * routes to the check-in flow. Hidden by the parent when a check-in is
 * already saved for today.
 */
export function CheckinBanner(): React.ReactElement {
  const router = useRouter();
  const pulse = useSharedValue<number>(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.4, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [pulse]);

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: colors.accent.gold,
    opacity: pulse.value,
  }));

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.pulse, borderStyle]} pointerEvents="none" />
      <View style={styles.card}>
        <ZoneText variant="label" size={16} color={colors.accent.gold} style={styles.title}>
          🌅 Check-in du jour
        </ZoneText>
        <ZoneText variant="body" size={13} color={colors.text.primary} style={styles.body}>
          Comment tu te sens aujourd'hui ? Ton score Zone t'attend.
        </ZoneText>
        <Button
          title="ÉVALUER MON ÉTAT"
          variant="primary"
          onPress={() => router.push('/(app)/checkin')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    marginBottom: 16,
  },
  pulse: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 16,
    borderWidth: 2,
  },
  card: {
    backgroundColor: colors.bg.card,
    borderColor: colors.accent.gold,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
  },
  title: {
    letterSpacing: 1,
    marginBottom: 6,
  },
  body: {
    marginBottom: 12,
    lineHeight: 18,
  },
});
