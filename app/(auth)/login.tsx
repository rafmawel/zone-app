import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { frenchAuthError } from '@/lib/authErrors';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ZoneText } from '@/components/ui/ZoneText';
import { AuthLogo } from '@/components/AuthLogo';

export default function LoginScreen(): React.ReactElement {
  const router = useRouter();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (): Promise<void> => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Renseigne ton email et ton mot de passe.');
      return;
    }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
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
          showsVerticalScrollIndicator={false}
        >
          <AuthLogo />
          <ZoneText variant="heading" style={styles.title}>
            CONNEXION
          </ZoneText>

          <View style={styles.field}>
            <Input
              placeholder="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>
          <View style={styles.field}>
            <Input
              placeholder="Mot de passe"
              autoCapitalize="none"
              autoComplete="password"
              secureTextEntry
              togglePassword
              value={password}
              onChangeText={setPassword}
            />
          </View>

          {error ? (
            <ZoneText variant="caption" color={colors.danger} style={styles.error}>
              {error}
            </ZoneText>
          ) : null}

          <View style={styles.submit}>
            <Button title="Se connecter" loading={loading} onPress={onSubmit} />
          </View>

          <View style={styles.linkRow}>
            <Button
              title="Mot de passe oublié ?"
              variant="ghost"
              onPress={() => router.push('/(auth)/forgot-password')}
            />
          </View>

          <View style={styles.footer}>
            <ZoneText variant="caption" color={colors.text.secondary}>
              Pas encore de compte ?{' '}
            </ZoneText>
            <ZoneText
              variant="caption"
              color={colors.accent.gold}
              style={styles.footerLink}
              onPress={() => router.push('/(auth)/register')}
            >
              S&apos;inscrire
            </ZoneText>
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
    marginBottom: 24,
    letterSpacing: 3,
  },
  field: { marginBottom: 12 },
  error: { marginTop: 4, marginBottom: 8, textAlign: 'center' },
  submit: { marginTop: 8 },
  linkRow: { marginTop: 8 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
    alignItems: 'center',
  },
  footerLink: { fontFamily: 'Inter-Medium' },
});
