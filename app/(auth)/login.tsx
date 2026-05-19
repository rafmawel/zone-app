import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
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
        >
          <AuthLogo />
          <ZoneText variant="heading" style={styles.title}>
            CONNEXION
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
            <Input
              placeholder="Mot de passe"
              autoCapitalize="none"
              autoComplete="password"
              secureTextEntry
              togglePassword
              value={password}
              onChangeText={setPassword}
            />

            {error ? (
              <ZoneText variant="caption" color={colors.danger} style={styles.error}>
                {error}
              </ZoneText>
            ) : null}

            <Button title="Se connecter" loading={loading} onPress={onSubmit} />

            <Link href="/(auth)/forgot-password" asChild>
              <Button title="Mot de passe oublié ?" variant="ghost" />
            </Link>
          </View>

          <View style={styles.footer}>
            <ZoneText variant="caption" color={colors.text.secondary}>
              Pas encore de compte ?{' '}
            </ZoneText>
            <Link href="/(auth)/register" onPress={() => router.push('/(auth)/register')}>
              <ZoneText
                variant="caption"
                color={colors.accent.gold}
                style={{ fontFamily: 'Inter-Medium' }}
              >
                S&apos;inscrire
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
    marginBottom: 24,
    letterSpacing: 3,
  },
  form: { gap: 12 },
  error: { marginTop: 4, textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
    alignItems: 'center',
  },
});
