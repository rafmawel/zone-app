import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Lock, Sparkles } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';

const FEATURES: string[] = [
  'Forme · Fatigue · Fraîcheur (CTL/ATL/TSB)',
  'Ratio charge/récupération (ACWR · Gabbett 2016)',
  'Autoregulation RIR intelligente',
  'Prédictions de performance',
  'Risque blessure en temps réel',
  'Coach Zone · Analyse hebdomadaire',
];

export function LockedAnalytics(): React.ReactElement {
  const router = useRouter();

  const openPaywall = (): void => {
    router.push('/(app)/paywall');
  };

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Sparkles size={48} color={colors.accent.gold} />
        <ZoneText
          variant="heading"
          size={48}
          color={colors.accent.gold}
          style={styles.title}
        >
          ZONE PRO
        </ZoneText>
        <ZoneText variant="label" size={16} color={colors.text.primary}>
          L'analyse que les coachs utilisent.
        </ZoneText>
        <ZoneText
          variant="caption"
          size={14}
          color={colors.text.muted}
          style={styles.subline}
        >
          Basé sur la recherche scientifique.
        </ZoneText>
      </View>

      <View style={styles.features}>
        {FEATURES.map((label) => (
          <View key={label} style={styles.feature}>
            <Lock size={16} color={colors.accent.gold} />
            <ZoneText
              variant="body"
              size={14}
              color={colors.text.primary}
              style={styles.featureText}
            >
              {label}
            </ZoneText>
          </View>
        ))}
      </View>

      <View style={styles.cta}>
        <Button title="DÉCOUVRIR ZONE PRO" variant="primary" onPress={openPaywall} />
        <View style={styles.spacer} />
        <Button title="En savoir plus" variant="ghost" onPress={openPaywall} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 48,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 36,
  },
  title: {
    marginTop: 16,
    letterSpacing: 3,
  },
  subline: {
    marginTop: 6,
  },
  features: {
    backgroundColor: colors.bg.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 32,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  featureText: {
    flex: 1,
  },
  cta: {
    marginTop: 8,
  },
  spacer: {
    height: 12,
  },
});
