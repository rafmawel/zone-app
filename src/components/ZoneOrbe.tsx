import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  RadialGradient,
  vec,
} from '@shopify/react-native-skia';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';

export interface ZoneOrbeProps {
  /** Score 0-100, drives the color tier. */
  score: number;
  /** Diameter in px. Defaults to 140. */
  size?: number;
  /** Continuous pulse + glow loop. Defaults to true. */
  animated?: boolean;
  /** Render the score number centered in the orbe. */
  showScore?: boolean;
  /** Optional text rendered above the orbe (e.g. "?" when no checkin). */
  overlayText?: string;
  style?: ViewStyle;
}

/**
 * Tier-color mapping. Exact values from the design system.
 *
 * @param score numeric score
 * @returns hex color string for the base tier
 */
export function colorForScore(score: number): string {
  const s = Number.isFinite(score) ? score : 50;
  if (s <= 30) return '#E57373';
  if (s <= 50) return '#FFB74D';
  if (s <= 75) return '#64B5F6';
  return '#4CAF50';
}

function parseHex(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [
    parseInt(v.substring(0, 2), 16),
    parseInt(v.substring(2, 4), 16),
    parseInt(v.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0'))
    .join('')}`;
}

function mix(a: string, b: string, t: number): string {
  const aRGB = parseHex(a);
  const bRGB = parseHex(b);
  return rgbToHex(
    Math.round(aRGB[0] * (1 - t) + bRGB[0] * t),
    Math.round(aRGB[1] * (1 - t) + bRGB[1] * t),
    Math.round(aRGB[2] * (1 - t) + bRGB[2] * t),
  );
}

function darken(color: string, t: number): string {
  return mix(color, '#000000', t);
}

function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

interface OrbePalette {
  base: string;
  highlight: string;
  edge: string;
  midHighOpacity: string;
  midLowOpacity: string;
  midZero: string;
  baseHighAlpha: string;
}

function paletteFor(target: string): OrbePalette {
  const highlight = mix('#FFFFFF', target, 0.3);
  const edge = darken(target, 0.25);
  return {
    base: target,
    highlight,
    edge,
    midHighOpacity: withAlpha(target, 0.35),
    midLowOpacity: withAlpha(target, 0.2),
    midZero: withAlpha(target, 0),
    baseHighAlpha: withAlpha(target, 0.95),
  };
}

function ZoneOrbeImpl({
  score,
  size = 140,
  animated = true,
  showScore = false,
  overlayText,
  style,
}: ZoneOrbeProps): React.ReactElement {
  const reducedMotion = useReducedMotion();
  const allowAnimation = animated && !reducedMotion;
  const target = colorForScore(score);
  const palette = useMemo(() => paletteFor(target), [target]);

  const scale = useSharedValue<number>(1);
  const glowOpacity = useSharedValue<number>(0.15);

  const prevScoreRef = useRef<number>(score);

  // Continuous pulse + glow loop
  useEffect(() => {
    cancelAnimation(scale);
    cancelAnimation(glowOpacity);
    if (!allowAnimation) {
      scale.value = 1;
      glowOpacity.value = 0.15;
      return;
    }
    scale.value = withRepeat(
      withTiming(1.06, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    glowOpacity.value = withRepeat(
      withTiming(0.28, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [allowAnimation, scale, glowOpacity]);

  // Burst when score changes
  useEffect(() => {
    if (score === prevScoreRef.current) return;
    prevScoreRef.current = score;
    if (!allowAnimation) return;
    scale.value = withSequence(
      withTiming(1.15, { duration: 150, easing: Easing.out(Easing.cubic) }),
      withTiming(1.0, { duration: 300, easing: Easing.inOut(Easing.cubic) }),
      withRepeat(
        withTiming(1.06, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
    glowOpacity.value = withSequence(
      withTiming(0.5, { duration: 150 }),
      withTiming(0.15, { duration: 300 }),
      withRepeat(
        withTiming(0.28, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
  }, [score, allowAnimation, scale, glowOpacity]);

  const center = size / 2;
  const coreRadius = size * 0.38;
  const midRadius = size * 0.46;
  const glowRadius = size * 0.52;
  const specularRadius = size * 0.1;
  const specularCx = center - size * 0.12;
  const specularCy = center - size * 0.14;

  const transform = useDerivedValue(() => [
    { translateX: center },
    { translateY: center },
    { scale: scale.value },
    { translateX: -center },
    { translateY: -center },
  ]);

  return (
    <View style={[styles.wrap, { width: size, height: size }, style]}>
      <Canvas style={{ width: size, height: size }}>
        <Group transform={transform}>
          {/* Layer 1 — outer glow (animated opacity via Group) */}
          <Group opacity={glowOpacity}>
            <Circle cx={center} cy={center} r={glowRadius}>
              <RadialGradient
                c={vec(center, center)}
                r={glowRadius}
                colors={[withAlpha(palette.base, 0.6), palette.midZero]}
                positions={[0, 1]}
              />
              <BlurMask blur={size * 0.25} style="normal" />
            </Circle>
          </Group>

          {/* Layer 2 — mid halo */}
          <Circle cx={center} cy={center} r={midRadius}>
            <RadialGradient
              c={vec(center, center)}
              r={midRadius}
              colors={[
                palette.midHighOpacity,
                palette.midLowOpacity,
                palette.midZero,
              ]}
              positions={[0, 0.6, 1]}
            />
            <BlurMask blur={size * 0.12} style="normal" />
          </Circle>

          {/* Layer 3 — core sphere with 3D lighting */}
          <Circle cx={center} cy={center} r={coreRadius}>
            <RadialGradient
              c={vec(center - coreRadius * 0.3, center - coreRadius * 0.3)}
              r={coreRadius * 1.6}
              colors={[
                withAlpha(palette.highlight, 0.9),
                palette.baseHighAlpha,
                palette.edge,
              ]}
              positions={[0, 0.55, 1]}
            />
          </Circle>

          {/* Layer 4 — inner specular highlight */}
          <Circle cx={specularCx} cy={specularCy} r={specularRadius}>
            <RadialGradient
              c={vec(specularCx, specularCy)}
              r={specularRadius}
              colors={['#FFFFFF99', '#FFFFFF00']}
              positions={[0, 1]}
            />
          </Circle>
        </Group>
      </Canvas>

      {showScore || overlayText ? (
        <Animated.View style={styles.overlay} pointerEvents="none">
          {overlayText ? (
            <ZoneText
              variant="heading"
              size={Math.round(size * 0.34)}
              color={colors.bg.primary}
            >
              {overlayText}
            </ZoneText>
          ) : null}
          {showScore && !overlayText ? (
            <ZoneText
              variant="heading"
              size={Math.round(size * 0.34)}
              color={colors.text.primary}
            >
              {Math.round(score)}
            </ZoneText>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/**
 * Memoised animated orbe — Skia-driven sphere with score-tier colour,
 * pulse / glow loop, and a score-change burst.
 */
export const ZoneOrbe = React.memo(ZoneOrbeImpl);
