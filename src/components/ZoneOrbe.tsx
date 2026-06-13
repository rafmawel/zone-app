import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';

export interface ZoneOrbeProps {
  /** Score 0-100, drives the colour tier. */
  score: number;
  /** Diameter in px. Defaults to 140. */
  size?: number;
  /** Accepted for API compatibility — rendering is now static (no Skia). */
  animated?: boolean;
  /** Render the score number centered in the orbe. */
  showScore?: boolean;
  /** Optional text rendered centered in the orbe (e.g. "?" when no check-in). */
  overlayText?: string;
  style?: ViewStyle;
}

/**
 * Tier-colour mapping, aligned with the Zone score tiers.
 *
 * @param score numeric score
 * @returns hex colour string for the tier
 */
export function colorForScore(score: number): string {
  const s = Number.isFinite(score) ? score : 50;
  if (s <= 30) return colors.danger;
  if (s <= 50) return colors.warning;
  if (s <= 75) return colors.hyrox;
  return colors.scoreGreen;
}

function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${a}`;
}

function ZoneOrbeImpl({
  score,
  size = 140,
  showScore = false,
  overlayText,
  style,
}: ZoneOrbeProps): React.ReactElement {
  const base = colorForScore(score);
  const core = size * 0.74;
  return (
    <View style={[styles.wrap, { width: size, height: size }, style]}>
      {/* Outer halo */}
      <View
        style={[
          StyleSheet.absoluteFillObject,
          { borderRadius: size / 2, backgroundColor: withAlpha(base, 0.16) },
        ]}
      />
      {/* Core */}
      <View
        style={{
          width: core,
          height: core,
          borderRadius: core / 2,
          backgroundColor: base,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: withAlpha('#FFFFFF', 0.22),
        }}
      >
        {overlayText ? (
          <ZoneText variant="title" size={Math.round(size * 0.3)} color={colors.background}>
            {overlayText}
          </ZoneText>
        ) : showScore ? (
          <ZoneText variant="title" size={Math.round(size * 0.3)} color={colors.textPrimary}>
            {Math.round(score)}
          </ZoneText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** Static score orbe — a colour-tiered circle with an optional centered value. */
export const ZoneOrbe = React.memo(ZoneOrbeImpl);
