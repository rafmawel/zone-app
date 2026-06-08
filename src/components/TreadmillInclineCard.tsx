/**
 * Treadmill incline explainer.
 *
 * Surfaced before treadmill-mode runs and the running test so the
 * athlete understands why the 1 % rule matters. A flat-belt run
 * underestimates the energetic cost of outdoor running, so without
 * the incline the resulting VDOT is too high and the programme that
 * uses it will be too aggressive.
 *
 * Source: Jones and Doust 1996, "A 1% treadmill grade most
 * accurately reflects the energetic cost of outdoor running",
 * British Journal of Sports Medicine.
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';

export function TreadmillInclineCard(): React.ReactElement {
  return (
    <View style={styles.card}>
      <ZoneText variant="caption" color={colors.accent.gold} style={styles.eyebrow}>
        TAPIS ROULANT · RÉGLAGE IMPORTANT
      </ZoneText>
      <ZoneText variant="label" color={colors.text.primary} style={styles.headline}>
        Règle ton tapis à 1 % d&apos;inclinaison.
      </ZoneText>
      <ZoneText variant="body" color={colors.text.secondary} style={styles.body}>
        En extérieur, tu résistes à l&apos;air en avançant. Sur tapis, la bande défile sous toi sans cette résistance. 1 % d&apos;inclinaison compense exactement cette différence et rend l&apos;effort équivalent à la course en extérieur.
      </ZoneText>
      <ZoneText variant="body" color={colors.text.primary} style={styles.warn}>
        Sans inclinaison, tu surestimes ton niveau et ton programme sera trop difficile.
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.source}>
        Source : Jones &amp; Doust (1996) · British Journal of Sports Medicine.
      </ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: `${colors.accent.gold}12`,
    borderWidth: 1,
    borderColor: colors.accent.gold,
    borderLeftWidth: 3,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  eyebrow: { letterSpacing: 2, fontFamily: 'Inter-Bold', fontSize: 11 },
  headline: { fontSize: 14, marginTop: 10, lineHeight: 19 },
  body: { marginTop: 10, lineHeight: 21 },
  warn: { marginTop: 10, lineHeight: 21 },
  source: { marginTop: 10, fontStyle: 'italic', lineHeight: 16 },
});
