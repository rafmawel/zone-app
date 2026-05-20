import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeScreen } from './ui/SafeScreen';
import { ZoneText } from './ui/ZoneText';
import { Button } from './ui/Button';
import { ProgressBar } from './ProgressBar';
import { colors } from '@/theme/colors';

export interface OnboardingFrameProps {
  step: number;
  total?: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onContinue: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  continueLoading?: boolean;
}

export function OnboardingFrame({
  step,
  total = 5,
  title,
  subtitle,
  children,
  onContinue,
  continueLabel = 'Continuer',
  continueDisabled = false,
  continueLoading = false,
}: OnboardingFrameProps): React.ReactElement {
  return (
    <SafeScreen>
      <View style={styles.header}>
        <ProgressBar current={step} total={total} />
        <ZoneText variant="label" color={colors.accent.gold} style={styles.stepLabel}>
          Étape {step}/{total}
        </ZoneText>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ZoneText variant="heading" style={styles.title}>
          {title}
        </ZoneText>
        {subtitle ? (
          <ZoneText variant="body" color={colors.text.secondary} style={styles.subtitle}>
            {subtitle}
          </ZoneText>
        ) : null}
        <View style={styles.body}>{children}</View>
      </ScrollView>
      <View style={styles.footer}>
        <Button
          title={continueLabel}
          onPress={onContinue}
          disabled={continueDisabled}
          loading={continueLoading}
        />
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingTop: 16 },
  stepLabel: { fontFamily: 'Inter-Medium', letterSpacing: 1, marginTop: 8 },
  scroll: { flex: 1 },
  content: { padding: 24, paddingBottom: 24 },
  title: { fontSize: 30, marginTop: 16, marginBottom: 8, color: colors.text.primary },
  subtitle: { marginBottom: 16 },
  body: { marginTop: 12 },
  footer: { padding: 24, paddingTop: 8 },
});
