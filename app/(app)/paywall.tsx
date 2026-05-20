import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Sparkles, X } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';

export default function PaywallScreen(): React.ReactElement {
  const router = useRouter();
  return (
    <SafeScreen>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <X size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>
      <View style={styles.center}>
        <Sparkles size={56} color={colors.accent.gold} />
        <ZoneText
          variant="heading"
          size={48}
          color={colors.accent.gold}
          style={styles.title}
        >
          ZONE PRO
        </ZoneText>
        <ZoneText variant="body" color={colors.text.muted} style={styles.subtitle}>
          Bientôt
        </ZoneText>
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 16,
    letterSpacing: 3,
  },
  subtitle: {
    marginTop: 8,
  },
});
