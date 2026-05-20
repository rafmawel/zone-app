import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Skeleton } from '@/components/ui/Skeleton';

export function AnalyticsSkeleton(): React.ReactElement {
  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <Skeleton height={160} borderRadius={16} style={styles.block} />
      <Skeleton height={240} borderRadius={16} style={styles.block} />
      <Skeleton height={220} borderRadius={16} style={styles.block} />
      <Skeleton height={280} borderRadius={16} style={styles.block} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    padding: 16,
    gap: 16,
  },
  block: {
    width: '100%',
  },
});
