import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from './ui/ZoneText';

export function AuthLogo(): React.ReactElement {
  return (
    <View style={styles.wrapper}>
      <ZoneText
        variant="heading"
        style={{ fontSize: 56, color: colors.accent.gold, letterSpacing: 6 }}
      >
        ZONE
      </ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', marginTop: 12, marginBottom: 40 },
});
