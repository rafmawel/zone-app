import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { getZoneLevel } from '@/lib/zoneScore';
import { colors } from '@/theme/colors';

export interface ZoneOrbeProps {
  score: number;
  size?: number;
  animated?: boolean;
}

/**
 * The Zone orb: a glowing circle whose colour reflects the readiness
 * score. Gently pulses when `animated` so it feels alive on the screens
 * where it is the focal point (onboarding, check-in).
 */
export function ZoneOrbe({
  score,
  size = 120,
  animated = false,
}: ZoneOrbeProps): React.ReactElement {
  const color = getZoneLevel(score).color;
  const scale = useSharedValue(1);

  useEffect(() => {
    if (!animated) {
      scale.value = 1;
      return;
    }
    scale.value = withRepeat(
      withTiming(1.06, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [animated, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.orb,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          shadowColor: color,
          shadowRadius: size * 0.25,
        },
        animatedStyle,
      ]}
    >
      <View
        style={[
          styles.core,
          {
            width: size * 0.55,
            height: size * 0.55,
            borderRadius: size * 0.275,
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  orb: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    elevation: 10,
  },
  core: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
});
