import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ZoneOrbe } from './ZoneOrbe';

export interface ZoneOrbeSplashProps {
  /** Score to settle on after the intro animation. */
  finalScore?: number;
  /** Called once the colour sequence has settled. */
  onAnimationComplete?: () => void;
}

type Phase = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Splash variant of the orbe: walks through every tier colour before
 * settling on the supplied final score (or neutral if none provided).
 *
 * Phases (cumulative ms):
 *  0-600   fade in
 *  600-1000  red
 *  1000-1400 amber
 *  1400-1800 blue
 *  1800-2200 green
 *  2200-2800 settle on final color
 */
export function ZoneOrbeSplash({
  finalScore,
  onAnimationComplete,
}: ZoneOrbeSplashProps): React.ReactElement {
  const [phase, setPhase] = useState<Phase>(0);
  const [scoreOverride, setScoreOverride] = useState<number>(15);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => { setPhase(1); setScoreOverride(15); }, 600));
    timers.push(setTimeout(() => { setPhase(2); setScoreOverride(45); }, 1000));
    timers.push(setTimeout(() => { setPhase(3); setScoreOverride(70); }, 1400));
    timers.push(setTimeout(() => { setPhase(4); setScoreOverride(85); }, 1800));
    timers.push(
      setTimeout(() => {
        setPhase(5);
        setScoreOverride(
          typeof finalScore === 'number' && Number.isFinite(finalScore)
            ? finalScore
            : 50,
        );
      }, 2200),
    );
    timers.push(
      setTimeout(() => {
        if (onAnimationComplete) onAnimationComplete();
      }, 2800),
    );
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, [finalScore, onAnimationComplete]);

  // If finalScore is undefined and we've reached phase 5, fall back to neutral tint by overriding the score band
  const useNeutralFallback = phase === 5 && typeof finalScore !== 'number';

  return (
    <View style={styles.wrap}>
      <ZoneOrbe
        score={useNeutralFallback ? 65 : scoreOverride}
        size={120}
        animated
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
