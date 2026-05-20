import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { frenchAuthError } from '@/lib/authErrors';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Input } from '@/components/ui/Input';
import { ZoneText } from '@/components/ui/ZoneText';
import { AuthLogo } from '@/components/AuthLogo';

export default function RegisterScreen(): React.ReactElement {
  const router = useRouter();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirm, setConfirm] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    if (!email.trim() || !password || !confirm) {
      setError('Tous les champs sont requis.');
      return;
    }
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        onboarding_completed: false,
        created_at: serverTimestamp(),
        zone_score: 50,
      });
      router.replace('/onboarding/step-1');
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
            CRÉER UN COMPTE
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
              secureTextEntry
              togglePassword
              value={password}
              onChangeText={setPassword}
            />
          </View>
          <View style={styles.field}>
            <Input
              placeholder="Confirmer le mot de passe"
              autoCapitalize="none"
              secureTextEntry
              togglePassword
              value={confirm}
              onChangeText={setConfirm}
            />
          </View>

          {error ? (
            <ZoneText variant="caption" color={colors.danger} style={styles.error}>
              {error}
            </ZoneText>
          ) : null}

          <TouchableOpacity
            disabled={loading}
            style={{
              backgroundColor: '#C9A84C',
              padding: 16,
              borderRadius: 12,
              alignItems: 'center',
              marginBottom: 12,
              opacity: loading ? 0.6 : 1,
            }}
            onPress={handleSubmit}
          >
            <Text style={{ color: '#0A0A0A', fontWeight: 'bold', fontSize: 16 }}>
              {loading ? 'CRÉATION…' : 'CRÉER MON COMPTE'}
            </Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={{ color: '#888888', fontSize: 12 }}>Déjà un compte ? </Text>
            <Text
              style={{ color: '#C9A84C', fontSize: 12, fontWeight: '500' }}
              onPress={() => router.push('/(auth)/login')}
            >
              Se connecter
            </Text>
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
    alignItems: 'center',
  },
});
