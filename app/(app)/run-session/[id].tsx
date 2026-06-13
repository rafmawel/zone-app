import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { X } from 'lucide-react-native';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { TreadmillInclineCard } from '@/components/TreadmillInclineCard';
import {
  completeRunSession,
  updateQueueItem,
  getRunningProfile,
  getRunSession,
  type RunSession,
  type RunningProfile,
  type RunConditions,
  type RunLocation,
  type RunningSessionStepPlanned,
} from '@/lib/firestore';
import {
  calculateVDOTPaces,
  formatPace,
  paceAdjustmentForConditions,
  paceFromDistanceTime,
  sessionName,
  sessionPurpose,
  sessionRpe,
  type RunningSessionType,
} from '@/lib/runningEngine';
import { computeAndSaveWorkloadEntry } from '@/lib/pro';
import { readCurrentWeek, readProgrammeQueue, recordSessionComplete, startWeek } from '@/lib/weekTracking';
import { ZoneOrbe } from '@/components/ZoneOrbe';
import { getZoneLevel } from '@/lib/zoneScore';
import { useSession } from '@/context/SessionContext';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';

const TREADMILL_INTRO_KEY = '@zone/run/treadmill-intro-seen';

function mmss(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function parseMmss(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (t.includes(':')) {
    const [mPart, sPart = '0'] = t.split(':');
    const m = parseInt(mPart, 10);
    const s = parseInt(sPart, 10);
    if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
    return Math.max(0, m * 60 + Math.min(59, Math.max(0, s)));
  }
  const m = parseInt(t, 10);
  return Number.isFinite(m) ? Math.max(0, m * 60) : null;
}

function stepDurationSeconds(step: RunningSessionStepPlanned): number {
  if (step.duration_seconds) return step.duration_seconds;
  if (step.distance_meters && step.target_pace_sec_per_km) {
    return (step.distance_meters / 1000) * step.target_pace_sec_per_km;
  }
  return 0;
}

function dotColor(kind: RunningSessionStepPlanned['kind'], accent: string): string {
  switch (kind) {
    case 'work':
      return accent;
    case 'recovery':
      return colors.text.muted;
    case 'warmup':
    case 'cooldown':
      return colors.orbe.blue;
    default:
      return colors.run;
  }
}

export default function RunSessionScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const runId = params.id ?? '';
  const { startSession, updateSessionProgress, endSession } = useSession();

  const [run, setRun] = useState<RunSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'pre' | 'active' | 'done'>('pre');
  const [elapsed, setElapsed] = useState<number>(0);
  const [rpe, setRpe] = useState<number | null>(null);
  const [savingComplete, setSavingComplete] = useState<boolean>(false);
  const [location, setLocation] = useState<RunLocation>('outdoor');
  const [conditions, setConditions] = useState<RunConditions>('normal');
  // Post-run recap inputs.
  const [finalDurationSec, setFinalDurationSec] = useState<number>(0);
  const [durationText, setDurationText] = useState<string>('');
  const [distanceText, setDistanceText] = useState<string>('');
  const [efAdjustVisible, setEfAdjustVisible] = useState<boolean>(false);
  const [treadmillIntroVisible, setTreadmillIntroVisible] = useState<boolean>(false);
  const treadmillIntroSeenRef = useRef<boolean>(false);
  const [runningProfile, setRunningProfile] = useState<RunningProfile | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const warned10Ref = useRef<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      const user = auth.currentUser;
      if (!user || !runId) {
        setError('Sortie introuvable.');
        setLoading(false);
        return;
      }
      try {
        const [r, profile] = await Promise.all([
          getRunSession(user.uid, runId),
          getRunningProfile(user.uid),
        ]);
        if (cancelled) return;
        if (!r) {
          setError('Sortie introuvable.');
        } else {
          setRun(r);
          if (r.location) setLocation(r.location);
          if (r.conditions) setConditions(r.conditions);
        }
        setRunningProfile(profile);
      } catch {
        if (!cancelled) setError('Erreur de chargement.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  // Cleanup timer on unmount.
  useEffect(() => {
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    void AsyncStorage.getItem(TREADMILL_INTRO_KEY).then((v) => {
      treadmillIntroSeenRef.current = v === 'seen';
    });
  }, []);

  const onPickTreadmill = (): void => {
    setLocation('treadmill');
    if (!treadmillIntroSeenRef.current) setTreadmillIntroVisible(true);
  };

  const dismissTreadmillIntro = (): void => {
    setTreadmillIntroVisible(false);
    treadmillIntroSeenRef.current = true;
    void AsyncStorage.setItem(TREADMILL_INTRO_KEY, 'seen').catch(() => undefined);
  };

  const steps = run?.steps ?? [];
  const sessionType = run?.session_type ?? 'EF';
  const zoneScore = run?.zone_score_at_start ?? null;
  const zoneLevel = useMemo(() => (zoneScore !== null ? getZoneLevel(zoneScore) : null), [zoneScore]);
  const accentColor = zoneLevel?.color ?? colors.run;

  // Target duration: the planned session length. Falls back to the sum of
  // step durations, then to 30 min.
  const targetDurationSec = useMemo(() => {
    if (run?.estimated_duration_min && run.estimated_duration_min > 0) {
      return Math.round(run.estimated_duration_min * 60);
    }
    const sum = steps.reduce((acc, s) => acc + stepDurationSeconds(s), 0);
    return sum > 0 ? Math.round(sum) : 1800;
  }, [run, steps]);

  // Representative target pace for the on-screen reminder (no live GPS).
  const repPace = useMemo(() => {
    const rep =
      steps.find((s) => s.kind === 'steady' && s.target_pace_sec_per_km) ??
      steps.find((s) => s.kind === 'work' && s.target_pace_sec_per_km) ??
      steps.find((s) => s.target_pace_sec_per_km);
    if (!rep?.target_pace_sec_per_km) return null;
    const condOffset = paceAdjustmentForConditions(conditions);
    const efOffset =
      rep.kind === 'steady' && sessionType === 'EF' && Number.isFinite(runningProfile?.ef_pace_adjustment ?? NaN)
        ? (runningProfile?.ef_pace_adjustment ?? 0)
        : 0;
    return rep.target_pace_sec_per_km + condOffset + efOffset;
  }, [steps, conditions, sessionType, runningProfile]);

  const stopTick = (): void => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const finish = useCallback(
    (finalElapsed: number): void => {
      stopTick();
      const dur = finalElapsed > 0 ? finalElapsed : targetDurationSec;
      setFinalDurationSec(dur);
      setDurationText(mmss(dur));
      setPhase('done');
      updateSessionProgress({ isResting: false });
    },
    [targetDurationSec, updateSessionProgress],
  );

  // Auto-stop: when the elapsed time reaches the planned duration, stop the
  // chrono and open the recap. A light haptic fires 10 s before the end.
  useEffect(() => {
    if (phase !== 'active') return;
    if (!warned10Ref.current && targetDurationSec - elapsed <= 10 && targetDurationSec - elapsed > 0) {
      warned10Ref.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
    if (elapsed >= targetDurationSec) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      finish(targetDurationSec);
    }
  }, [phase, elapsed, targetDurationSec, finish]);

  const onStart = (): void => {
    if (!run) return;
    const user = auth.currentUser;
    if (user) {
      void setDoc(
        doc(db, 'users', user.uid, 'runs', runId),
        { location, conditions },
        { merge: true },
      ).catch(() => undefined);
    }
    startSession(runId);
    startedAtRef.current = Date.now();
    warned10Ref.current = false;
    setElapsed(0);
    setPhase('active');
    updateSessionProgress({
      totalExercises: 1,
      totalSets: 1,
      currentExerciseName: sessionName(sessionType),
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      isResting: false,
      setsCompleted: 0,
      zoneColor: accentColor,
    });
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
  };

  const enteredDistanceKm = useMemo(() => {
    const cleaned = distanceText.replace(',', '.').trim();
    if (!cleaned) return 0;
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n < 30 ? n : n / 1000; // accept metres if a large value is typed
  }, [distanceText]);

  const adjustDuration = (deltaSec: number): void => {
    setFinalDurationSec((prev) => {
      const next = Math.max(0, prev + deltaSec);
      setDurationText(mmss(next));
      return next;
    });
  };

  const onDurationText = (t: string): void => {
    setDurationText(t);
    const parsed = parseMmss(t);
    if (parsed != null) setFinalDurationSec(parsed);
  };

  const livePace = useMemo(() => {
    if (enteredDistanceKm <= 0 || finalDurationSec <= 0) return null;
    return Math.round(finalDurationSec / enteredDistanceKm);
  }, [enteredDistanceKm, finalDurationSec]);

  const submitCompletion = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !run || rpe === null) return;
    setSavingComplete(true);
    try {
      const finalDur = finalDurationSec > 0 ? finalDurationSec : targetDurationSec;
      const finalDistance = enteredDistanceKm > 0 ? enteredDistanceKm : run.estimated_distance_km;
      const avg = paceFromDistanceTime(finalDistance * 1000, finalDur);
      await completeRunSession(user.uid, runId, {
        duration_seconds: finalDur,
        distance_km: Math.round(finalDistance * 100) / 100,
        avg_pace_sec_per_km: Math.round(avg),
        rpe,
        location,
        conditions,
      });
      if (run.queue_key) {
        await updateQueueItem(user.uid, run.queue_key, 'completed').catch(() => undefined);
      }
      try {
        const profile = await getRunningProfile(user.uid);
        const thresholdPace = profile && profile.vdot > 0 ? calculateVDOTPaces(profile.vdot).T : 300;
        await computeAndSaveWorkloadEntry(user.uid, {
          sport: 'running',
          date: run.date,
          sessionType: run.session_type,
          durationSeconds: finalDur,
          avgPaceSecPerKm: Math.round(avg),
          thresholdPaceSecPerKm: thresholdPace,
        });
      } catch {
        // workload save is best-effort
      }
      try {
        const profile = await getRunningProfile(user.uid);
        const queue = await readProgrammeQueue(user.uid);
        const week = readCurrentWeek(queue, 'running');
        const sessionsPerWeek = profile?.sessions_per_week ?? 3;
        await startWeek(user.uid, 'running', week, { sessions: sessionsPerWeek });
        await recordSessionComplete(user.uid, 'running', week, {
          km: Math.round(finalDistance * 100) / 100,
        });
      } catch {
        // tracking is best-effort
      }
      if (run.session_type === 'EF' && rpe >= 7) {
        setSavingComplete(false);
        setEfAdjustVisible(true);
        return;
      }
      endSession();
      router.replace('/(app)/');
    } catch {
      setSavingComplete(false);
    }
  };

  const onEfNoteAck = (): void => {
    setEfAdjustVisible(false);
    endSession();
    router.replace('/(app)/');
  };

  if (loading) {
    return (
      <SafeScreen>
        <View style={styles.center}>
          <ZoneText variant="body" color={colors.text.muted}>
            Chargement en cours
          </ZoneText>
        </View>
      </SafeScreen>
    );
  }

  if (error || !run) {
    return (
      <SafeScreen>
        <View style={styles.center}>
          <ZoneText variant="heading" style={styles.errorTitle}>
            {error ?? 'Sortie introuvable'}
          </ZoneText>
          <View style={styles.errorAction}>
            <Button title="Retour" onPress={() => router.back()} />
          </View>
        </View>
      </SafeScreen>
    );
  }

  // ── DONE / recap ──────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <SafeScreen>
        <ScrollView contentContainerStyle={styles.doneWrap} showsVerticalScrollIndicator={false}>
          <ZoneText variant="heading" style={styles.doneTitle}>
            Séance terminée ! 🎉
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.secondary} style={styles.doneSubtitle}>
            {sessionName(sessionType)}
          </ZoneText>

          <ZoneText style={styles.sectionLabel}>DURÉE</ZoneText>
          <View style={styles.durationRow}>
            <TouchableOpacity onPress={() => adjustDuration(-60)} activeOpacity={0.8} style={styles.durationBtn}>
              <ZoneText style={styles.durationBtnText}>−1 min</ZoneText>
            </TouchableOpacity>
            <TextInput
              value={durationText}
              onChangeText={onDurationText}
              keyboardType="numbers-and-punctuation"
              placeholder="MM:SS"
              placeholderTextColor={colors.text.muted}
              style={styles.durationInput}
            />
            <TouchableOpacity onPress={() => adjustDuration(60)} activeOpacity={0.8} style={styles.durationBtn}>
              <ZoneText style={styles.durationBtnText}>+1 min</ZoneText>
            </TouchableOpacity>
          </View>

          <ZoneText style={styles.sectionLabel}>DISTANCE</ZoneText>
          <View style={styles.distanceRow}>
            <TextInput
              value={distanceText}
              onChangeText={setDistanceText}
              keyboardType="decimal-pad"
              placeholder="0.0"
              placeholderTextColor={colors.text.muted}
              style={styles.distanceInput}
            />
            <ZoneText style={styles.distanceUnit}>km</ZoneText>
          </View>
          {livePace != null ? (
            <ZoneText style={styles.paceHint}>Rythme moyen : {mmss(livePace)} /km</ZoneText>
          ) : null}

          <ZoneText style={styles.sectionLabel}>COMMENT C'ÉTAIT ? (RPE)</ZoneText>
          <View style={styles.rpeRow}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const active = rpe === n;
              return (
                <TouchableOpacity
                  key={n}
                  onPress={() => setRpe(n)}
                  activeOpacity={0.8}
                  style={[styles.rpeCell, active ? styles.rpeCellActive : null]}
                >
                  <ZoneText style={[styles.rpeCellText, active ? styles.rpeCellTextActive : null]}>
                    {n}
                  </ZoneText>
                </TouchableOpacity>
              );
            })}
          </View>
          <ZoneText style={styles.rpeLegend}>
            1-3 : Facile · 4-6 : Modéré · 7-8 : Difficile · 9-10 : Maximum
          </ZoneText>

          <TouchableOpacity
            onPress={() => void submitCompletion()}
            activeOpacity={0.85}
            disabled={rpe === null || savingComplete}
            style={[styles.validateBtn, rpe === null ? styles.validateBtnDisabled : null]}
          >
            <ZoneText style={styles.validateText}>
              {savingComplete ? '...' : 'VALIDER LA SÉANCE'}
            </ZoneText>
          </TouchableOpacity>
        </ScrollView>

        <Modal visible={efAdjustVisible} transparent animationType="fade" onRequestClose={onEfNoteAck}>
          <View style={styles.efBackdrop}>
            <View style={styles.efCard}>
              <ZoneText variant="heading" style={styles.efTitle}>
                RPE élevé pour une sortie facile
              </ZoneText>
              <ZoneText variant="body" color={colors.text.secondary} style={styles.efBody}>
                Causes possibles : chaleur, fatigue, mauvaise nuit. Ce n&apos;est pas ton niveau réel.
              </ZoneText>
              <ZoneText variant="body" color={colors.text.primary} style={styles.efBody}>
                Ton programme reste inchangé.
              </ZoneText>
              <View style={styles.efActions}>
                <TouchableOpacity onPress={onEfNoteAck} activeOpacity={0.85} style={styles.efBtn}>
                  <ZoneText style={styles.efBtnText}>C&apos;est noté</ZoneText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeScreen>
    );
  }

  // ── PRE ───────────────────────────────────────────────────────────────────
  if (phase === 'pre') {
    return (
      <SafeScreen>
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
            activeOpacity={0.7}
            style={styles.closeBtn}
          >
            <X size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.preContent} showsVerticalScrollIndicator={false}>
          <View style={[styles.zoneStrip, { backgroundColor: accentColor }]}>
            <ZoneText style={styles.zoneStripText}>{run.zone_message ?? 'En route.'}</ZoneText>
            {zoneScore !== null ? <ZoneOrbe score={zoneScore} size={40} animated={false} /> : null}
          </View>
          <View style={styles.typeBadge}>
            <ZoneText style={styles.typeBadgeText}>{sessionType}</ZoneText>
          </View>
          <ZoneText variant="heading" style={styles.sessionTitle}>
            {sessionName(sessionType)}
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.secondary} style={styles.sessionPurpose}>
            {sessionPurpose(sessionType)} · {sessionRpe(sessionType)}
          </ZoneText>

          <View style={styles.structureCard}>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.cardLabel}>
              STRUCTURE
            </ZoneText>
            {steps.map((s, i) => (
              <View key={i} style={styles.structureRow}>
                <View style={[styles.structureDot, { backgroundColor: dotColor(s.kind, accentColor) }]} />
                <ZoneText variant="caption" color={colors.text.secondary} style={styles.structureText}>
                  {s.label}
                  {s.target_pace_sec_per_km ? ` · ${formatPace(s.target_pace_sec_per_km)}` : ''}
                </ZoneText>
              </View>
            ))}
          </View>

          <View style={styles.estimateRow}>
            <EstCell label="DURÉE" value={`${run.estimated_duration_min} min`} />
            <EstCell label="DISTANCE" value={`${run.estimated_distance_km} km`} />
          </View>

          <ZoneText variant="caption" color={colors.text.muted} style={styles.preEyebrow}>
            OÙ COURS-TU AUJOURD&apos;HUI ?
          </ZoneText>
          <View style={styles.preChoiceRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setLocation('outdoor')}
              style={[styles.preChoice, location === 'outdoor' ? styles.preChoiceActive : null]}
            >
              <ZoneText
                variant="label"
                color={location === 'outdoor' ? colors.background : colors.text.primary}
                style={styles.preChoiceText}
              >
                🏃 Extérieur
              </ZoneText>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onPickTreadmill}
              style={[styles.preChoice, location === 'treadmill' ? styles.preChoiceActive : null]}
            >
              <ZoneText
                variant="label"
                color={location === 'treadmill' ? colors.background : colors.text.primary}
                style={styles.preChoiceText}
              >
                ⚙️ Tapis roulant
              </ZoneText>
            </TouchableOpacity>
          </View>
          {location === 'treadmill' ? <TreadmillInclineCard /> : null}

          <ZoneText variant="caption" color={colors.text.muted} style={styles.preEyebrow}>
            CONDITIONS
          </ZoneText>
          <View style={styles.preCondRow}>
            {(
              [
                { key: 'heat' as const, label: '☀️ Chaleur' },
                { key: 'wind' as const, label: '💨 Vent fort' },
                { key: 'rain' as const, label: '🌧️ Pluie' },
                { key: 'normal' as const, label: '✓ Normales' },
              ]
            ).map((o) => {
              const active = conditions === o.key;
              return (
                <TouchableOpacity
                  key={o.key}
                  activeOpacity={0.85}
                  onPress={() => setConditions(o.key)}
                  style={[styles.preCond, active ? styles.preCondActive : null]}
                >
                  <ZoneText
                    variant="caption"
                    color={active ? colors.background : colors.text.primary}
                    style={styles.preCondText}
                  >
                    {o.label}
                  </ZoneText>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <Button title="Démarrer la séance" onPress={onStart} />
        </View>

        <Modal
          visible={treadmillIntroVisible}
          transparent
          animationType="fade"
          onRequestClose={dismissTreadmillIntro}
        >
          <View style={styles.efBackdrop}>
            <View style={styles.treadmillIntroCard}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <TreadmillInclineCard />
              </ScrollView>
              <Button title="J'ai compris, inclinaison à 1 %" onPress={dismissTreadmillIntro} />
            </View>
          </View>
        </Modal>
      </SafeScreen>
    );
  }

  // ── ACTIVE ──────────────────────────────────────────────────────────────
  const progress = targetDurationSec > 0 ? Math.min(1, elapsed / targetDurationSec) : 0;
  const remainingMin = Math.max(0, Math.ceil((targetDurationSec - elapsed) / 60));
  return (
    <SafeScreen edges={['top', 'left', 'right']}>
      <View style={styles.activeHeader}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          activeOpacity={0.7}
          style={styles.closeBtn}
        >
          <X size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <ZoneText variant="label" color={colors.text.primary} style={styles.activeName} numberOfLines={1}>
          {sessionName(sessionType)}
        </ZoneText>
        <View style={styles.modeBadge}>
          <ZoneText style={styles.modeBadgeText}>
            {location === 'treadmill' ? 'Tapis' : 'Extérieur'}
          </ZoneText>
        </View>
      </View>

      <View style={styles.activeWrap}>
        <ZoneText style={styles.bigTimer}>{mmss(elapsed)}</ZoneText>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <ZoneText style={styles.remainingText}>Il reste {remainingMin} min</ZoneText>

        {repPace != null ? (
          <View style={styles.targetCard}>
            <ZoneText style={styles.targetLabel}>ALLURE CIBLE</ZoneText>
            <ZoneText style={styles.targetValue}>
              {formatPace(repPace)} /km · {sessionName(sessionType)}
            </ZoneText>
          </View>
        ) : null}

        {location === 'treadmill' ? (
          <View style={styles.treadmillBanner}>
            <ZoneText style={styles.treadmillBannerText}>⚙️ Tapis · Inclinaison 1 % recommandée</ZoneText>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity onPress={() => finish(elapsed)} activeOpacity={0.85} style={styles.terminateBtn}>
          <ZoneText style={styles.terminateText}>TERMINER</ZoneText>
        </TouchableOpacity>
      </View>
    </SafeScreen>
  );
}

function EstCell({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.estCell}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.estLabel}>
        {label}
      </ZoneText>
      <ZoneText variant="heading" style={styles.estValue}>
        {value}
      </ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorTitle: { fontSize: 20, textAlign: 'center' },
  errorAction: { marginTop: 16, alignSelf: 'stretch' },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  closeBtn: { padding: 4 },

  // Pre
  preContent: { paddingHorizontal: 20, paddingBottom: 24 },
  zoneStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    padding: 16,
    marginTop: 4,
  },
  zoneStripText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14, color: '#FFFFFF', paddingRight: 12 },
  typeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 16,
  },
  typeBadgeText: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1, color: colors.run },
  sessionTitle: { fontSize: 24, marginTop: 10 },
  sessionPurpose: { marginTop: 4, lineHeight: 17 },
  structureCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    marginTop: 16,
  },
  cardLabel: { letterSpacing: 1, fontFamily: 'Inter_700Bold', fontSize: 11, marginBottom: 10 },
  structureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  structureDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  structureText: { flex: 1 },
  estimateRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  estCell: { flex: 1, backgroundColor: colors.surface, borderRadius: 14, padding: 14 },
  estLabel: { letterSpacing: 0.5, fontSize: 10 },
  estValue: { fontSize: 22, marginTop: 4 },
  preEyebrow: { letterSpacing: 1, fontFamily: 'Inter_700Bold', fontSize: 11, marginTop: 20, marginBottom: 10 },
  preChoiceRow: { flexDirection: 'row', gap: 12 },
  preChoice: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  preChoiceActive: { backgroundColor: colors.run },
  preChoiceText: { fontSize: 14 },
  preCondRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preCond: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  preCondActive: { backgroundColor: colors.run },
  preCondText: { fontFamily: 'Inter_600SemiBold' },
  footer: { paddingHorizontal: 20, paddingVertical: 14 },

  // Active
  activeHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  activeName: { flex: 1, fontSize: 15 },
  modeBadge: { backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  modeBadgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 11, color: colors.text.secondary },
  activeWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  bigTimer: { fontFamily: 'Inter_700Bold', fontSize: 64, color: colors.run, letterSpacing: 1 },
  progressTrack: {
    alignSelf: 'stretch',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginTop: 24,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: colors.run },
  remainingText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 10 },
  targetCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginTop: 28,
    alignItems: 'center',
  },
  targetLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1, color: 'rgba(255,255,255,0.4)' },
  targetValue: { fontFamily: 'Inter_700Bold', fontSize: 16, color: colors.textPrimary, marginTop: 6 },
  treadmillBanner: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    alignItems: 'center',
  },
  treadmillBannerText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: colors.text.secondary },
  terminateBtn: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  terminateText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: colors.textPrimary, letterSpacing: 0.5 },

  // Done
  doneWrap: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  doneTitle: { fontSize: 24 },
  doneSubtitle: { marginTop: 4, marginBottom: 8 },
  sectionLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 22,
    marginBottom: 10,
  },
  durationRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  durationBtn: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  durationBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.textPrimary },
  durationInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    textAlign: 'center',
    color: colors.textPrimary,
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  distanceInput: {
    flex: 1,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
  },
  distanceUnit: { fontFamily: 'Inter_600SemiBold', fontSize: 15, color: colors.text.secondary },
  paceHint: {
    fontFamily: 'Inter_400Regular',
    fontStyle: 'italic',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 8,
  },
  rpeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rpeCell: {
    width: 30,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  rpeCellActive: { backgroundColor: colors.run },
  rpeCellText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: 'rgba(255,255,255,0.5)' },
  rpeCellTextActive: { color: '#FFFFFF' },
  rpeLegend: { fontFamily: 'Inter_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 10 },
  validateBtn: {
    backgroundColor: colors.run,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
  },
  validateBtnDisabled: { opacity: 0.4 },
  validateText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#FFFFFF', letterSpacing: 0.5 },

  // EF note + treadmill intro modals
  efBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  efCard: { backgroundColor: colors.surfaceAlt, borderRadius: 18, padding: 20, alignSelf: 'stretch' },
  efTitle: { fontSize: 18, marginBottom: 10 },
  efBody: { lineHeight: 20, marginBottom: 8 },
  efActions: { marginTop: 8 },
  efBtn: { backgroundColor: colors.run, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  efBtnText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#FFFFFF' },
  treadmillIntroCard: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: 18,
    padding: 16,
    maxHeight: '80%',
    alignSelf: 'stretch',
  },
});
