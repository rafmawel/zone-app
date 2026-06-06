/**
 * Bonus cardio screen.
 *
 * Standalone Zone 2 timer that does NOT touch the programme queue.
 * Runners see a pace target (E_slow + 30 s/km, very easy);
 * everyone else gets a brisk-walk / light-bike prompt.
 *
 * The session is logged as a workload entry only (for ACWR / TSS) so
 * the engine still "sees" the volume without advancing or repeating
 * any planned week.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { auth } from '@/lib/firebase';
import {
  getRunningProfile,
  todayDateString,
  type RunningProfile,
} from '@/lib/firestore';
import {
  calculateVDOTPaces,
  formatElapsed,
  formatPace,
} from '@/lib/runningEngine';
import { computeAndSaveWorkloadEntry } from '@/lib/pro';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';

const DEFAULT_DURATION_SEC = 25 * 60;

type Phase = 'pre' | 'running' | 'done';

export default function BonusCardioScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ duration?: string }>();
  const initial = (() => {
    const n = params.duration ? parseInt(params.duration, 10) : NaN;
    if (Number.isFinite(n) && n >= 5 && n <= 60) return n * 60;
    return DEFAULT_DURATION_SEC;
  })();

  const [phase, setPhase] = useState<Phase>('pre');
  const [remaining, setRemaining] = useState<number>(initial);
  const [elapsed, setElapsed] = useState<number>(0);
  const [runningProfile, setRunningProfile] = useState<RunningProfile | null>(null);
  const startedAtRef = useRef<number>(0);
  const lastMinuteRef = useRef<number>(Math.ceil(initial / 60));

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const p = await getRunningProfile(user.uid);
        if (!cancelled) setRunningProfile(p);
      } catch {
        // fallback to non-runner mode
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'running') return;
    const minute = Math.ceil(remaining / 60);
    if (minute !== lastMinuteRef.current && remaining > 0) {
      lastMinuteRef.current = minute;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    if (remaining === 0) {
      setPhase('done');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [remaining, phase]);

  const paces = useMemo(
    () => (runningProfile ? calculateVDOTPaces(runningProfile.vdot) : null),
    [runningProfile],
  );
  // Zone 2 target: 30 s/km slower than the athlete's easy pace, to
  // sit comfortably in conversational territory.
  const targetPaceSecPerKm = paces ? paces.E_slow + 30 : null;

  const onStart = (): void => {
    startedAtRef.current = Date.now();
    setElapsed(0);
    setPhase('running');
  };

  const onFinish = async (): Promise<void> => {
    setPhase('done');
    const user = auth.currentUser;
    if (!user) return;
    const totalMinutes = Math.max(1, Math.round(elapsed / 60));
    try {
      if (runningProfile && targetPaceSecPerKm) {
        const thresholdPace = paces?.T ?? 300;
        await computeAndSaveWorkloadEntry(user.uid, {
          sport: 'running',
          date: todayDateString(),
          // Tag the workload as bonus so the queue never picks it up
          // as a programme session.
          sessionType: 'bonus_easy',
          durationSeconds: totalMinutes * 60,
          avgPaceSecPerKm: targetPaceSecPerKm,
          thresholdPaceSecPerKm: thresholdPace,
        });
      } else {
        await computeAndSaveWorkloadEntry(user.uid, {
          sport: 'running',
          date: todayDateString(),
          sessionType: 'bonus_walk',
          durationSeconds: totalMinutes * 60,
          avgPaceSecPerKm: 540,
          thresholdPaceSecPerKm: 360,
        });
      }
    } catch {
      // workload save is best-effort; never blocks the bonus session
    }
  };

  const onClose = (): void => {
    if (phase === 'running') {
      Alert.alert(
        'Quitter la séance ?',
        'Le temps déjà couru ne sera pas comptabilisé.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Quitter', style: 'destructive', onPress: () => router.back() },
        ],
      );
      return;
    }
    router.back();
  };

  const totalLabel = `${Math.round(initial / 60)} min`;
  const targetPaceLabel = targetPaceSecPerKm ? formatPace(targetPaceSecPerKm) : null;

  return (
    <SafeScreen>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} hitSlop={16} style={styles.back}>
          <ArrowLeft size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <ZoneText variant="heading" style={styles.title}>
          CARDIO LÉGER · ZONE 2
        </ZoneText>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.timerCard}>
          <ZoneText variant="heading" style={styles.bigTimer}>
            {formatElapsed(phase === 'pre' ? initial : remaining)}
          </ZoneText>
          <ZoneText variant="body" color={colors.text.secondary} style={styles.timerSub}>
            {phase === 'pre' ? `Durée prévue : ${totalLabel}` : null}
            {phase === 'running' ? `Couru : ${formatElapsed(elapsed)}` : null}
            {phase === 'done' ? `Total : ${formatElapsed(elapsed || initial)}` : null}
          </ZoneText>
        </View>

        {targetPaceLabel ? (
          <View style={styles.suggestCard}>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.suggestEyebrow}>
              ALLURE CIBLE
            </ZoneText>
            <ZoneText variant="heading" style={styles.suggestPace}>
              {targetPaceLabel}
            </ZoneText>
            <ZoneText variant="body" color={colors.text.secondary} style={styles.suggestText}>
              Footing léger {Math.round(initial / 60)} min · allure très facile. FC max 130-140 bpm.
              Conversation possible.
            </ZoneText>
          </View>
        ) : (
          <View style={styles.suggestCard}>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.suggestEyebrow}>
              FORMAT
            </ZoneText>
            <ZoneText variant="heading" style={styles.suggestPace}>
              MARCHE OU VÉLO
            </ZoneText>
            <ZoneText variant="body" color={colors.text.secondary} style={styles.suggestText}>
              Marche soutenue ou vélo léger {Math.round(initial / 60)} min. Reste sous 70 % FCmax.
              Tu dois pouvoir tenir une conversation complète.
            </ZoneText>
          </View>
        )}

        <View style={styles.instructions}>
          <Bullet text="Pas de zone rouge : si tu ne peux plus parler, ralentis." />
          <Bullet text="Cette séance n'impacte pas ton programme principal." />
          <Bullet text="Tu peux terminer plus tôt avec le bouton ci-dessous." />
        </View>

        <View style={styles.cta}>
          {phase === 'pre' ? (
            <Button title="Démarrer" onPress={onStart} />
          ) : null}
          {phase === 'running' ? (
            <Button title="Terminer" variant="secondary" onPress={() => void onFinish()} />
          ) : null}
          {phase === 'done' ? (
            <Button title="Retour à l'accueil" onPress={() => router.back()} />
          ) : null}
        </View>
      </ScrollView>
    </SafeScreen>
  );
}

function Bullet({ text }: { text: string }): React.ReactElement {
  return (
    <View style={styles.bulletRow}>
      <ZoneText variant="label" color={colors.accent.gold} style={styles.bulletDot}>
        •
      </ZoneText>
      <ZoneText variant="body" color={colors.text.secondary} style={styles.bulletText}>
        {text}
      </ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
  },
  back: { padding: 8, minWidth: 44 },
  title: { fontSize: 20, flex: 1, textAlign: 'center', letterSpacing: 1 },
  body: { paddingHorizontal: 24, paddingBottom: 32 },
  timerCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    marginBottom: 16,
  },
  bigTimer: { fontSize: 64, letterSpacing: 2, lineHeight: 68 },
  timerSub: { marginTop: 10, fontFamily: 'Inter-Medium' },
  suggestCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.gold,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  suggestEyebrow: { letterSpacing: 2, fontFamily: 'Inter-Bold', fontSize: 11 },
  suggestPace: { fontSize: 28, marginTop: 6, letterSpacing: 1, lineHeight: 32 },
  suggestText: { marginTop: 10, lineHeight: 20 },
  instructions: { marginTop: 6 },
  bulletRow: { flexDirection: 'row', marginVertical: 4, alignItems: 'flex-start' },
  bulletDot: { width: 16, fontSize: 16, lineHeight: 22 },
  bulletText: { flex: 1, lineHeight: 22, fontSize: 14 },
  cta: { marginTop: 22 },
});
