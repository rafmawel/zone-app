import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { frenchAuthError } from '@/lib/authErrors';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ZoneText } from '@/components/ui/ZoneText';
import { AuthLogo } from '@/components/AuthLogo';

export default function ForgotPasswordScreen(): React.ReactElement {
  const [email, setEmail] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<boolean>(false);

  const onSubmit = async (): Promise<void> => {
    setError(null);
    setSent(false);
    if (!email.trim()) {
      setError('Renseigne ton email.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(frenchAuthError(code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeScreen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <AuthLogo />
          <ZoneText variant="heading" style={styles.title}>
            MOT DE PASSE OUBLIÉ
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.secondary} style={styles.subtitle}>
            Entre ton email pour recevoir un lien de réinitialisation.
          </ZoneText>

          <View style={styles.form}>
            <Input
              placeholder="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />

            {error ? (
              <ZoneText variant="caption" color={colors.danger} style={styles.message}>
                {error}
              </ZoneText>
            ) : null}
            {sent ? (
              <ZoneText variant="caption" color={colors.success} style={styles.message}>
                Lien envoyé. Vérifie ta boîte mail.
              </ZoneText>
            ) : null}

            <Button title="Envoyer le lien" loading={loading} onPress={onSubmit} />
          </View>

          <View style={styles.footer}>
            <Link href="/(auth)/login">
              <ZoneText
                variant="caption"
                color={colors.accent.gold}
                style={{ fontFamily: 'Inter-Medium' }}
              >
                Retour à la connexion
              </ZoneText>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 24, paddingBottom: 48 },
  title: {
    fontSize: 28,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 3,
  },
  subtitle: { textAlign: 'center', marginBottom: 24 },
  form: { gap: 12 },
  message: { marginTop: 4, textAlign: 'center' },
  footer: { alignItems: 'center', marginTop: 24 },
});
