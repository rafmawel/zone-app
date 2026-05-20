import React from 'react';
import { StyleSheet, View } from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';

export default function ProfileScreen(): React.ReactElement {
  const onSignOut = async (): Promise<void> => {
    try {
      await signOut(auth);
    } catch {
      // surfaced silently — full profile screen comes in a later prompt
    }
  };

  return (
    <SafeScreen>
      <View style={styles.center}>
        <ZoneText variant="heading" size={42} style={styles.title}>
          PROFIL
        </ZoneText>
        <View style={styles.actions}>
          <Button title="Se déconnecter" variant="secondary" onPress={onSignOut} />
        </View>
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { marginBottom: 32 },
  actions: { alignSelf: 'stretch' },
});
