import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';

export default function TrainingScreen(): React.ReactElement {
  return (
    <SafeScreen>
      <View style={styles.center}>
        <ZoneText variant="heading" size={42}>
          ENTRAÎNEMENT
        </ZoneText>
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
