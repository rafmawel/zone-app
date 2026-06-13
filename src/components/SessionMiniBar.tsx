import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { colors } from '@/theme/colors';
import { useSession, formatRestMS } from '@/context/SessionContext';
import { ZoneText } from './ui/ZoneText';

export const SESSION_MINI_BAR_HEIGHT = 64;

export function SessionMiniBar(): React.ReactElement | null {
  const { activeSession } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  if (!activeSession) return null;
  if (pathname && pathname.includes('/session/')) return null;

  const accent = activeSession.zoneColor || colors.scoreGreen;

  return (
    <View style={[styles.bar, { borderTopColor: accent }]}>
      <View style={styles.leftCol}>
        <View style={styles.leftHeader}>
          <View style={[styles.dot, { backgroundColor: accent }]} />
          <ZoneText
            numberOfLines={1}
            style={styles.exerciseName}
          >
            {activeSession.currentExerciseName || 'Séance en cours'}
          </ZoneText>
        </View>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.setLine}>
          Série {activeSession.setsCompleted + (activeSession.isResting ? 0 : 1)}/{activeSession.totalSets}
        </ZoneText>
      </View>

      <View style={styles.centerCol}>
        {activeSession.isResting ? (
          <>
            <ZoneText
              variant="heading"
              style={[styles.countdown, { color: accent }]}
            >
              {formatRestMS(activeSession.restSecondsRemaining)}
            </ZoneText>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.restLabel}>
              REPOS
            </ZoneText>
          </>
        ) : (
          <View style={styles.inProgressBadge}>
            <ZoneText style={styles.inProgressText}>EN COURS</ZoneText>
          </View>
        )}
      </View>

      <TouchableOpacity
        onPress={() => router.push(`/(app)/session/${activeSession.sessionId}`)}
        activeOpacity={0.8}
        style={styles.resumeBtn}
      >
        <ZoneText style={styles.resumeText}>REPRENDRE</ZoneText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: SESSION_MINI_BAR_HEIGHT,
    backgroundColor: colors.bg.card,
    borderTopWidth: 0.5,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftCol: { flex: 1 },
  leftHeader: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  exerciseName: {
    color: colors.text.primary,
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    flexShrink: 1,
  },
  setLine: { fontSize: 11, marginTop: 2 },
  centerCol: { alignItems: 'center', minWidth: 64, marginHorizontal: 8 },
  countdown: { fontSize: 20, lineHeight: 22 },
  restLabel: { fontSize: 10, letterSpacing: 1, marginTop: 2 },
  inProgressBadge: {
    borderWidth: 1,
    borderColor: colors.scoreGreen,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  inProgressText: {
    color: colors.scoreGreen,
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  resumeBtn: {
    borderWidth: 1,
    borderColor: colors.scoreGreen,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginLeft: 4,
  },
  resumeText: {
    color: colors.scoreGreen,
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    letterSpacing: 1,
  },
});
