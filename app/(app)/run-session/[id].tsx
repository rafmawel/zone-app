import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { X } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
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
  type RunningSessionGPSPoint,
  type RunningSessionStepPlanned,
} from '@/lib/firestore';
import {
  calculateVDOTPaces,
  formatElapsed,
  formatPace,
  formatPaceShort,
  paceAdjustmentForConditions,
  paceFeedback,
  paceFromDistanceTime,
  sessionName,
  sessionPurpose,
  sessionRpe,
  type RunningSessionType,
} from '@/lib/runningEngine';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { computeAndSaveWorkloadEntry } from '@/lib/pro';
import { readCurrentWeek, readProgrammeQueue, recordSessionComplete, startWeek } from '@/lib/weekTracking';
import { usePro } from '@/hooks/usePro';
import { ZoneOrbe } from '@/components/ZoneOrbe';
import { getZoneLevel } from '@/lib/zoneScore';
import { useSession, formatRestMS } from '@/context/SessionContext';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';

const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);

interface GpsState {
  permission: 'granted' | 'denied' | 'unknown';
  positions: RunningSessionGPSPoint[];
  distance_km: number;
  current_pace: number;
  avg_pace: number;
}

const TREADMILL_INTRO_KEY = '@zone/run/treadmill-intro-seen';

const EMPTY_GPS: GpsState = {
  permission: 'unknown',
  positions: [],
  distance_km: 0,
  current_pace: 0,
  avg_pace: 0,
};

function haversine(a: RunningSessionGPSPoint, b: RunningSessionGPSPoint): number {
  const R = 6371000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function isIntervalSession(type: RunningSessionType): boolean {
  return type === 'IV' || type === 'RV' || type === 'TB';
}

function stepDurationSeconds(step: RunningSessionStepPlanned): number {
  if (step.duration_seconds) return step.duration_seconds;
  if (step.distance_meters && step.target_pace_sec_per_km) {
    return (step.distance_meters / 1000) * step.target_pace_sec_per_km;
  }
  return 0;
}

export default function RunSessionScreen(): React.ReactElement {
  const router = useRouter();
  const { isPro } = usePro();
  const params = useLocalSearchParams<{ id: string }>();
  const runId = params.id ?? '';
  const { startSession, updateSessionProgress, endSession } = useSession();

  const [run, setRun] = useState<RunSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'pre' | 'active' | 'done'>('pre');
  const [elapsed, setElapsed] = useState<number>(0);
  const [stepIdx, setStepIdx] = useState<number>(0);
  const [stepRemaining, setStepRemaining] = useState<number>(0);
  const [stepTotal, setStepTotal] = useState<number>(0);
  const [gps, setGps] = useState<GpsState>(EMPTY_GPS);
  const [feedback, setFeedback] = useState<string>('');
  const [rpe, setRpe] = useState<number | null>(null);
  const [savingComplete, setSavingComplete] = useState<boolean>(false);
  // Pre-run context — picked once before the first step starts.
  const [location, setLocation] = useState<RunLocation>('outdoor');
  const [conditions, setConditions] = useState<RunConditions>('normal');
  const [treadmillDistanceText, setTreadmillDistanceText] = useState<string>('');
  // EF-recalibration prompt shown on the done screen.
  const [efAdjustVisible, setEfAdjustVisible] = useState<boolean>(false);
  // First-time treadmill explainer modal (one-shot, persisted via
  // AsyncStorage). Fires when the athlete first picks treadmill mode
  // on the pre-run screen.
  const [treadmillIntroVisible, setTreadmillIntroVisible] = useState<boolean>(false);
  const treadmillIntroSeenRef = useRef<boolean>(false);
  const [runningProfile, setRunningProfile] = useState<RunningProfile | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const startedAtRef = useRef<number>(0);
  const stepStartedAtRef = useRef<number>(0);
  const ringProgress = useSharedValue(0);

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

  // Cleanup
  useEffect(() => {
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      if (watchRef.current) {
        watchRef.current.remove();
        watchRef.current = null;
      }
    };
  }, []);

  // Has the athlete already seen the treadmill explainer? Loaded once
  // on mount; if they've already dismissed it before we won't fire it
  // again, but the persistent in-session banner still surfaces.
  useEffect(() => {
    void AsyncStorage.getItem(TREADMILL_INTRO_KEY).then((v) => {
      treadmillIntroSeenRef.current = v === 'seen';
    });
  }, []);

  const onPickTreadmill = (): void => {
    setLocation('treadmill');
    if (!treadmillIntroSeenRef.current) {
      setTreadmillIntroVisible(true);
    }
  };

  const dismissTreadmillIntro = (): void => {
    setTreadmillIntroVisible(false);
    treadmillIntroSeenRef.current = true;
    void AsyncStorage.setItem(TREADMILL_INTRO_KEY, 'seen').catch(() => undefined);
  };

  const steps = run?.steps ?? [];
  const currentStep = steps[stepIdx];

  const sessionType = run?.session_type ?? 'EF';
  const isInterval = isIntervalSession(sessionType);
  const zoneScore = run?.zone_score_at_start ?? null;
  const zoneLevel = useMemo(() => (zoneScore !== null ? getZoneLevel(zoneScore) : null), [zoneScore]);
  const accentColor = zoneLevel?.color ?? colors.accent.gold;

  const startTick = useCallback((): void => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      const now = Date.now();
      setElapsed(Math.floor((now - startedAtRef.current) / 1000));
      setStepRemaining((r) => {
        const next = r - 1;
        if (next <= 0) {
          handleStepAdvance();
          return 0;
        }
        return next;
      });
    }, 1000);
  }, []);

  const stopTick = (): void => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const startGps = useCallback(async (): Promise<void> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setGps((g) => ({ ...g, permission: 'denied' }));
        return;
      }
      setGps((g) => ({ ...g, permission: 'granted' }));
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (loc) => {
          const point: RunningSessionGPSPoint = {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            ts: loc.timestamp,
          };
          setGps((current) => {
            const positions = [...current.positions, point];
            let distance = current.distance_km;
            if (positions.length >= 2) {
              const last = positions[positions.length - 2];
              distance += haversine(last, point) / 1000;
            }
            const cutoff = point.ts - 30000;
            const recent = positions.filter((p) => p.ts >= cutoff);
            let recentDist = 0;
            for (let i = 1; i < recent.length; i += 1) {
              recentDist += haversine(recent[i - 1], recent[i]);
            }
            const recentSec = recent.length > 1 ? (recent[recent.length - 1].ts - recent[0].ts) / 1000 : 0;
            const current_pace = paceFromDistanceTime(recentDist, recentSec);
            const elapsedSec = (point.ts - startedAtRef.current) / 1000;
            const avg_pace = paceFromDistanceTime(distance * 1000, elapsedSec);
            return {
              permission: 'granted',
              positions,
              distance_km: distance,
              current_pace,
              avg_pace,
            };
          });
        },
      );
    } catch {
      setGps((g) => ({ ...g, permission: 'denied' }));
    }
  }, []);

  const handleStepAdvance = useCallback((): void => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setStepIdx((idx) => {
      const next = idx + 1;
      if (next >= steps.length) {
        finishRun();
        return idx;
      }
      const ns = steps[next];
      const dur = stepDurationSeconds(ns);
      stepStartedAtRef.current = Date.now();
      setStepTotal(dur);
      setStepRemaining(dur);
      updateSessionProgress({
        currentExerciseIndex: 0,
        currentSetIndex: next,
        currentExerciseName: ns.label,
        isResting: ns.kind === 'recovery',
        restSecondsRemaining: dur,
        restTotalSeconds: dur,
        setsCompleted: next,
        totalSets: steps.length,
      });
      return next;
    });
  }, [steps, updateSessionProgress]);

  const onStart = async (): Promise<void> => {
    if (!run || !currentStep) return;
    const user = auth.currentUser;
    // Persist the location and conditions before starting so a crash
    // mid-run doesn't lose them. Best-effort; the run still launches.
    if (user) {
      void setDoc(
        doc(db, 'users', user.uid, 'runs', runId),
        { location, conditions },
        { merge: true },
      ).catch(() => undefined);
    }
    startSession(runId);
    startedAtRef.current = Date.now();
    stepStartedAtRef.current = Date.now();
    const dur = stepDurationSeconds(currentStep);
    setStepTotal(dur);
    setStepRemaining(dur);
    setPhase('active');
    updateSessionProgress({
      totalExercises: steps.length,
      totalSets: steps.length,
      currentExerciseName: currentStep.label,
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      isResting: currentStep.kind === 'recovery',
      restSecondsRemaining: dur,
      restTotalSeconds: dur,
      zoneColor: accentColor,
    });
    startTick();
    // Treadmill mode skips GPS entirely; distance comes from the
    // athlete entering the value at the end of the session.
    if (location === 'outdoor') {
      void startGps();
    }
  };

  const finishRun = useCallback((): void => {
    stopTick();
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    setPhase('done');
    updateSessionProgress({ isResting: false });
  }, [updateSessionProgress]);

  // Animate ring
  useEffect(() => {
    if (phase !== 'active' || stepTotal <= 0) {
      ringProgress.value = 0;
      return;
    }
    const start = Math.max(0, Math.min(1, 1 - stepRemaining / stepTotal));
    ringProgress.value = start;
    ringProgress.value = withTiming(1, {
      duration: Math.max(0, stepRemaining) * 1000,
      easing: Easing.linear,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, stepIdx, stepTotal]);

  // Pace feedback when current step changes or GPS updates
  // Combined pace offset for the currently displayed step: conditions
  // (heat/wind/rain) push every target slower, and EF steps inherit
  // the athlete's personal ef_pace_adjustment.
  const stepPaceOffset = useMemo(() => {
    const condOffset = paceAdjustmentForConditions(conditions);
    const isEf = currentStep?.kind === 'steady' && sessionType === 'EF';
    const efOffset =
      isEf && Number.isFinite(runningProfile?.ef_pace_adjustment ?? NaN)
        ? (runningProfile?.ef_pace_adjustment ?? 0)
        : 0;
    return condOffset + efOffset;
  }, [conditions, currentStep, sessionType, runningProfile]);

  useEffect(() => {
    if (phase !== 'active' || !currentStep) return;
    const target = currentStep.target_pace_sec_per_km;
    if (!target) {
      setFeedback('');
      return;
    }
    const context = currentStep.kind === 'work' ? 'work' : 'easy';
    setFeedback(paceFeedback(gps.current_pace, target + stepPaceOffset, context));
  }, [phase, currentStep, gps.current_pace, stepPaceOffset]);

  const treadmillDistanceKm = useMemo(() => {
    const cleaned = treadmillDistanceText.replace(',', '.').trim();
    if (!cleaned) return 0;
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n < 30 ? n : n / 1000;
  }, [treadmillDistanceText]);

  const submitCompletion = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !run) return;
    setSavingComplete(true);
    try {
      // Treadmill mode: GPS distance is always 0, so we use the
      // athlete-entered value (km or m). Outdoor mode keeps the GPS
      // measurement, falling back to the planned distance.
      const finalDistance =
        location === 'treadmill'
          ? (treadmillDistanceKm > 0
              ? treadmillDistanceKm
              : run.estimated_distance_km)
          : (gps.distance_km > 0
              ? gps.distance_km
              : run.estimated_distance_km);
      const finalDur = elapsed > 0 ? elapsed : run.estimated_duration_min * 60;
      const avg = paceFromDistanceTime(finalDistance * 1000, finalDur);
      await completeRunSession(user.uid, runId, {
        duration_seconds: finalDur,
        distance_km: Math.round(finalDistance * 100) / 100,
        avg_pace_sec_per_km: Math.round(avg),
        positions:
          location === 'outdoor' && gps.positions.length ? gps.positions : undefined,
        ...(rpe !== null ? { rpe } : {}),
        location,
        conditions,
      });
      if (run?.queue_key) {
        await updateQueueItem(user.uid, run.queue_key, 'completed').catch(() => undefined);
      }
      try {
        const profile = await getRunningProfile(user.uid);
        const thresholdPace =
          profile && profile.vdot > 0 ? calculateVDOTPaces(profile.vdot).T : 300;
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
        // tracking is best effort
      }
      // VDOT recalibration suggestion: when an EF session feels hard
      // (RPE >= 7) the planned easy pace is likely too aggressive for
      // today. We surface the prompt before leaving the screen so the
      // athlete can apply +10 / +20 sec/km right away.
      if (run.session_type === 'EF' && rpe !== null && rpe >= 7) {
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

  // Informational dismiss for the post-run EF / RPE note. The note
  // intentionally does NOT change the programme; one hard easy run is
  // explained by chaleur / fatigue / mauvaise nuit and is not a
  // calibration signal.
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

  if (error || !run || !currentStep) {
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

  if (phase === 'done') {
    const displayedDistance =
      location === 'treadmill'
        ? treadmillDistanceKm > 0
          ? treadmillDistanceKm
          : 0
        : gps.distance_km || run.estimated_distance_km;
    return (
      <SafeScreen>
        <ScrollView contentContainerStyle={styles.doneWrap}>
          <ZoneText variant="heading" style={[styles.doneTitle, { color: accentColor }]}>
            SORTIE TERMINÉE
          </ZoneText>
          <View style={styles.doneStatsRow}>
            <DoneStat label="DURÉE" value={formatElapsed(elapsed)} />
            <DoneStat
              label="DISTANCE"
              value={`${displayedDistance.toFixed(2)} km`}
            />
            <DoneStat
              label="ALLURE"
              value={
                gps.avg_pace > 0
                  ? formatPaceShort(gps.avg_pace)
                  : displayedDistance > 0 && elapsed > 0
                    ? formatPaceShort(paceFromDistanceTime(displayedDistance * 1000, elapsed))
                    : formatPaceShort(currentStep.target_pace_sec_per_km ?? 0)
              }
            />
          </View>

          {location === 'treadmill' ? (
            <View style={styles.doneTreadmillBlock}>
              <ZoneText variant="caption" color={colors.text.muted} style={styles.rpeLabel}>
                DISTANCE AFFICHÉE PAR LE TAPIS (km)
              </ZoneText>
              <TextInput
                value={treadmillDistanceText}
                onChangeText={setTreadmillDistanceText}
                placeholder="ex: 8,5"
                placeholderTextColor={colors.text.muted}
                keyboardType="numbers-and-punctuation"
                style={styles.treadmillInput}
              />
            </View>
          ) : null}

          <ZoneText variant="caption" color={colors.text.muted} style={styles.rpeLabel}>
            RESSENTI GLOBAL (RPE)
          </ZoneText>
          <View style={styles.rpeRow}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const active = rpe === n;
              return (
                <TouchableOpacity
                  key={n}
                  onPress={() => setRpe(n)}
                  activeOpacity={0.8}
                  style={[
                    styles.rpeCell,
                    {
                      backgroundColor: active ? colors.accent.gold : colors.bg.card,
                      borderColor: active ? colors.accent.gold : colors.border,
                    },
                  ]}
                >
                  <ZoneText
                    style={{
                      color: active ? colors.bg.primary : colors.text.secondary,
                      fontFamily: 'Inter-Bold',
                      fontSize: 12,
                    }}
                  >
                    {n}
                  </ZoneText>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.doneFooter}>
            <Button title="Enregistrer" loading={savingComplete} onPress={submitCompletion} />
          </View>
        </ScrollView>

        {/* Post-run EF / RPE note — informational only. RPE 7+ on an
            easy run is usually heat / fatigue / poor sleep, not a
            real fitness signal, so the programme stays as-is. */}
        <Modal
          visible={efAdjustVisible}
          transparent
          animationType="fade"
          onRequestClose={onEfNoteAck}
        >
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
                <TouchableOpacity
                  onPress={onEfNoteAck}
                  activeOpacity={0.85}
                  style={styles.efBtn}
                >
                  <ZoneText variant="label" color={colors.bg.primary} style={styles.efBtnText}>
                    C&apos;est noté
                  </ZoneText>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeScreen>
    );
  }

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
            <ZoneText style={styles.zoneStripText}>
              {run.zone_message ?? 'En route.'}
            </ZoneText>
            {isPro ? (
              <View style={styles.proBadge}>
                <ZoneText style={styles.proBadgeText}>PRO</ZoneText>
              </View>
            ) : null}
            {zoneScore !== null ? (
              <ZoneOrbe score={zoneScore} size={40} animated={false} />
            ) : null}
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
                  {s.target_pace_sec_per_km
                    ? ` · ${formatPace(s.target_pace_sec_per_km)}`
                    : ''}
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
              style={[
                styles.preChoice,
                location === 'outdoor' ? styles.preChoiceActive : null,
              ]}
            >
              <ZoneText
                variant="label"
                color={location === 'outdoor' ? colors.bg.primary : colors.text.primary}
                style={styles.preChoiceText}
              >
                🏃 Extérieur
              </ZoneText>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onPickTreadmill}
              style={[
                styles.preChoice,
                location === 'treadmill' ? styles.preChoiceActive : null,
              ]}
            >
              <ZoneText
                variant="label"
                color={location === 'treadmill' ? colors.bg.primary : colors.text.primary}
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
                    color={active ? colors.bg.primary : colors.text.primary}
                    style={styles.preCondText}
                  >
                    {o.label}
                  </ZoneText>
                </TouchableOpacity>
              );
            })}
          </View>
          {conditions === 'heat' ? (
            <>
              <View style={styles.preHint}>
                <ZoneText variant="label" color={colors.text.primary} style={styles.preHintTitle}>
                  Adapte-toi à la chaleur
                </ZoneText>
                <ZoneText variant="caption" color={colors.text.muted} style={styles.preHintBody}>
                  Guide-toi sur ta FC, pas ton allure. Allure cible ajustée : +15 sec/km. La chaleur augmente la FC de 10 à 20 bpm. C&apos;est normal de courir plus lentement.
                </ZoneText>
                {sessionType === 'EF' ? (
                  <ZoneText variant="caption" color={colors.accent.gold} style={styles.preHintHr}>
                    FC cible EF : 140 à 155 bpm
                  </ZoneText>
                ) : null}
              </View>
              <View style={styles.preHint}>
                <ZoneText variant="label" color={colors.text.primary} style={styles.preHintTitle}>
                  Et ton test de niveau ?
                </ZoneText>
                <ZoneText variant="caption" color={colors.text.muted} style={styles.preHintBody}>
                  La chaleur et la fatigue peuvent augmenter ta FC de 15 à 25 bpm. Si ton test a été fait dans ces conditions, ton VDOT est peut-être sous-estimé. Refais le test dans 3 à 4 semaines à jeun le matin pour calibrer précisément.
                </ZoneText>
              </View>
            </>
          ) : null}
        </ScrollView>
        <View style={styles.footer}>
          <Button title="Démarrer la séance" onPress={onStart} />
        </View>

        {/* First-time treadmill explainer. Fires on the first pick
            of treadmill mode; subsequent runs see only the persistent
            in-session "Inclinaison : 1 %" banner. */}
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

  // ACTIVE
  return (
    <SafeScreen edges={['top', 'left', 'right']}>
      <View style={[styles.zoneStrip, { backgroundColor: accentColor }]}>
        <ZoneText style={styles.zoneStripText}>{run.zone_message ?? 'En route.'}</ZoneText>
        {isPro ? (
          <View style={styles.proBadge}>
            <ZoneText style={styles.proBadgeText}>PRO</ZoneText>
          </View>
        ) : null}
        {zoneScore !== null ? (
          <ZoneOrbe score={zoneScore} size={40} animated={false} />
        ) : null}
      </View>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          activeOpacity={0.7}
          style={styles.closeBtn}
        >
          <X size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <ZoneText variant="caption" color={colors.text.muted}>
          {sessionType} · {stepIdx + 1}/{steps.length}
        </ZoneText>
      </View>

      {isInterval ? (
        <IntervalView
          step={currentStep}
          stepIdx={stepIdx}
          totalSteps={steps.length}
          accentColor={accentColor}
          remaining={stepRemaining}
          total={stepTotal}
          ringProgress={ringProgress}
          currentPace={gps.current_pace}
          feedback={feedback}
          paceOffsetSecPerKm={stepPaceOffset}
          onAdvance={handleStepAdvance}
          elapsed={elapsed}
          distance={gps.distance_km}
        />
      ) : (
        <SteadyView
          accentColor={accentColor}
          step={currentStep}
          elapsed={elapsed}
          distance={gps.distance_km}
          currentPace={gps.current_pace}
          avgPace={gps.avg_pace}
          remaining={stepRemaining}
          total={stepTotal}
          feedback={feedback}
          paceOffsetSecPerKm={stepPaceOffset}
          onFinish={finishRun}
        />
      )}

      {location === 'treadmill' ? (
        <View style={styles.gpsBanner}>
          <ZoneText style={styles.gpsBannerText}>
            ⚙️ Tapis · Inclinaison 1 % recommandée
          </ZoneText>
        </View>
      ) : gps.permission === 'denied' ? (
        <View style={styles.gpsBanner}>
          <ZoneText style={styles.gpsBannerText}>
            GPS désactivé · mode manuel. La distance sera demandée à la fin.
          </ZoneText>
        </View>
      ) : null}
    </SafeScreen>
  );
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
      return colors.accent.gold;
  }
}

function SteadyView({
  accentColor,
  step,
  elapsed,
  distance,
  currentPace,
  avgPace,
  remaining,
  total,
  feedback,
  paceOffsetSecPerKm,
  onFinish,
}: {
  accentColor: string;
  step: RunningSessionStepPlanned;
  elapsed: number;
  distance: number;
  currentPace: number;
  avgPace: number;
  remaining: number;
  total: number;
  feedback: string;
  paceOffsetSecPerKm: number;
  onFinish: () => void;
}): React.ReactElement {
  const progress = total > 0 ? Math.max(0, Math.min(1, 1 - remaining / total)) : 0;
  return (
    <View style={styles.activeWrap}>
      <ZoneText variant="heading" style={styles.bigTimer}>
        {formatElapsed(elapsed)}
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.muted}>
        {step.label}
      </ZoneText>

      <View style={styles.metricsRow}>
        <MetricCell label="DISTANCE" value={`${distance.toFixed(2)} km`} />
        <MetricCell
          label="ALLURE"
          value={currentPace > 0 ? formatPaceShort(currentPace) : '-'}
        />
        <MetricCell
          label="MOY"
          value={avgPace > 0 ? formatPaceShort(avgPace) : '-'}
        />
      </View>

      {step.target_pace_sec_per_km ? (
        <ZoneText variant="caption" color={colors.text.muted} style={styles.targetLine}>
          Cible {formatPace(step.target_pace_sec_per_km + paceOffsetSecPerKm)}
          {paceOffsetSecPerKm > 0 ? ` · +${paceOffsetSecPerKm}s ajusté` : ''}
        </ZoneText>
      ) : null}
      {feedback ? (
        <ZoneText style={[styles.feedback, { color: accentColor }]}>{feedback}</ZoneText>
      ) : null}

      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${progress * 100}%`, backgroundColor: accentColor },
          ]}
        />
      </View>

      <View style={styles.activeFooter}>
        <Button title="Terminer la séance" variant="secondary" onPress={onFinish} />
      </View>
    </View>
  );
}

function IntervalView({
  step,
  stepIdx,
  totalSteps,
  accentColor,
  remaining,
  total,
  ringProgress,
  currentPace,
  feedback,
  paceOffsetSecPerKm,
  onAdvance,
  elapsed,
  distance,
}: {
  step: RunningSessionStepPlanned;
  stepIdx: number;
  totalSteps: number;
  accentColor: string;
  remaining: number;
  total: number;
  ringProgress: SharedValue<number>;
  currentPace: number;
  feedback: string;
  paceOffsetSecPerKm: number;
  onAdvance: () => void;
  elapsed: number;
  distance: number;
}): React.ReactElement {
  const size = 220;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * ringProgress.value,
  }));
  const contentStyle = useAnimatedStyle(() => ({ opacity: 1 - ringProgress.value * 0.15 }));

  const phaseLabel =
    step.kind === 'work'
      ? `TRAVAIL ${stepIdx + 1}/${totalSteps}`
      : step.kind === 'recovery'
        ? 'RÉCUPÉRATION'
        : step.kind === 'warmup'
          ? 'ÉCHAUFFEMENT'
          : step.kind === 'cooldown'
            ? 'RETOUR AU CALME'
            : 'EN COURS';

  return (
    <View style={styles.activeWrap}>
      <View
        style={[
          styles.intervalCard,
          { borderColor: step.kind === 'work' ? accentColor : colors.border },
        ]}
      >
        <ZoneText
          style={[
            styles.intervalPhase,
            { color: step.kind === 'work' ? accentColor : colors.text.secondary },
          ]}
        >
          {phaseLabel}
        </ZoneText>
        {step.target_pace_sec_per_km ? (
          <ZoneText variant="heading" style={styles.intervalPace}>
            {formatPace(step.target_pace_sec_per_km + paceOffsetSecPerKm)}
            {paceOffsetSecPerKm > 0 ? (
              <ZoneText variant="caption" color={colors.text.muted}>
                {' '}· +{paceOffsetSecPerKm}s
              </ZoneText>
            ) : null}
          </ZoneText>
        ) : null}
      </View>

      <View style={styles.ringWrap}>
        <Svg width={size} height={size}>
          <SvgCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.border}
            strokeWidth={stroke}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={accentColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            animatedProps={ringProps}
            fill="none"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </Svg>
        <Animated.View style={[styles.ringContent, contentStyle]}>
          <ZoneText variant="heading" style={[styles.ringValue, { color: accentColor }]}>
            {formatRestMS(remaining)}
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.muted}>
            sur {total}s
          </ZoneText>
        </Animated.View>
      </View>

      <ZoneText variant="caption" color={colors.text.muted} style={styles.currentPaceLine}>
        Allure actuelle : {currentPace > 0 ? formatPaceShort(currentPace) : '-'}
      </ZoneText>
      {feedback ? (
        <ZoneText style={[styles.feedback, { color: accentColor }]}>{feedback}</ZoneText>
      ) : null}

      <View style={styles.bottomMetrics}>
        <ZoneText variant="caption" color={colors.text.muted}>
          {formatElapsed(elapsed)} · {distance.toFixed(2)} km
        </ZoneText>
      </View>

      <View style={styles.activeFooter}>
        <Button title="Suivant" variant="secondary" onPress={onAdvance} />
      </View>
    </View>
  );
}

function MetricCell({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.metricCell}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.metricLabel}>
        {label}
      </ZoneText>
      <ZoneText variant="heading" style={styles.metricValue}>
        {value}
      </ZoneText>
    </View>
  );
}

function EstCell({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.estCell}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.metricLabel}>
        {label}
      </ZoneText>
      <ZoneText variant="heading" style={styles.metricValue}>
        {value}
      </ZoneText>
    </View>
  );
}

function DoneStat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.doneStatCell}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.metricLabel}>
        {label}
      </ZoneText>
      <ZoneText variant="heading" style={styles.doneStatValue}>
        {value}
      </ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorTitle: { fontSize: 22, color: colors.text.muted, textAlign: 'center' },
  errorAction: { marginTop: 24, alignSelf: 'stretch' },
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  zoneStrip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  zoneStripText: {
    flex: 1,
    color: colors.bg.primary,
    fontFamily: 'Inter-Bold',
    fontSize: 12,
    letterSpacing: 0.3,
  },
  proBadge: {
    borderColor: colors.accent.gold,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    marginLeft: 8,
  },
  proBadgeText: {
    color: colors.accent.gold,
    fontFamily: 'Inter-Bold',
    fontSize: 8,
    letterSpacing: 1,
  },
  preContent: { paddingHorizontal: 24, paddingBottom: 24 },
  typeBadge: {
    alignSelf: 'flex-start',
    marginTop: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.bg.elevated,
    borderRadius: 999,
  },
  typeBadgeText: { color: colors.accent.gold, fontFamily: 'Inter-Bold', fontSize: 11, letterSpacing: 1 },
  sessionTitle: { fontSize: 26, marginTop: 6, color: colors.text.primary, letterSpacing: 1 },
  sessionPurpose: { marginTop: 6, lineHeight: 18 },
  structureCard: {
    marginTop: 16,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
  },
  cardLabel: { letterSpacing: 1, fontSize: 11, marginBottom: 8 },
  structureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  structureDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  structureText: { flex: 1, fontSize: 12 },
  estimateRow: { flexDirection: 'row', marginTop: 14 },
  estCell: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeWrap: { flex: 1, padding: 24, alignItems: 'center' },
  bigTimer: { fontSize: 72, color: colors.text.primary, lineHeight: 76 },
  metricsRow: { flexDirection: 'row', marginTop: 16, alignSelf: 'stretch' },
  metricCell: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  metricLabel: { letterSpacing: 1, fontSize: 10 },
  metricValue: { fontSize: 22, color: colors.text.primary, marginTop: 2, lineHeight: 26 },
  targetLine: { marginTop: 12 },
  feedback: { marginTop: 10, fontFamily: 'Inter-Bold', fontSize: 14 },
  progressTrack: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 18,
  },
  progressFill: { height: '100%', borderRadius: 2 },
  activeFooter: { alignSelf: 'stretch', marginTop: 20 },
  intervalCard: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    backgroundColor: colors.bg.card,
    alignItems: 'center',
  },
  intervalPhase: { fontFamily: 'Inter-Bold', letterSpacing: 2, fontSize: 12 },
  intervalPace: { fontSize: 32, marginTop: 4, color: colors.text.primary, lineHeight: 36 },
  ringWrap: { marginTop: 18, width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
  ringContent: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringValue: { fontSize: 56, lineHeight: 60 },
  currentPaceLine: { marginTop: 16 },
  bottomMetrics: { marginTop: 12 },
  gpsBanner: {
    marginHorizontal: 24,
    marginBottom: 16,
    padding: 10,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  gpsBannerText: { color: colors.text.secondary, fontSize: 11, fontFamily: 'Inter-Medium' },
  footer: { padding: 24, paddingTop: 8 },
  doneWrap: { padding: 24, paddingBottom: 32 },
  doneTitle: { fontSize: 40, marginTop: 24, letterSpacing: 2 },
  doneStatsRow: { flexDirection: 'row', marginTop: 18 },
  doneStatCell: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneStatValue: { fontSize: 22, color: colors.text.primary, marginTop: 2, lineHeight: 26 },
  rpeLabel: { letterSpacing: 1, fontSize: 11, marginTop: 22, marginBottom: 8 },
  rpeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  rpeCell: {
    flex: 1,
    height: 36,
    marginHorizontal: 1.5,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneFooter: { marginTop: 28 },
  preEyebrow: {
    letterSpacing: 2,
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    marginTop: 22,
    marginBottom: 10,
  },
  preChoiceRow: { flexDirection: 'row', gap: 10 },
  preChoice: {
    flex: 1,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  preChoiceActive: { backgroundColor: colors.accent.gold, borderColor: colors.accent.gold },
  preChoiceText: { fontSize: 14 },
  preHint: {
    marginTop: 10,
    backgroundColor: `${colors.accent.gold}15`,
    borderRadius: 12,
    padding: 12,
  },
  preHintTitle: { fontSize: 13 },
  preHintBody: { marginTop: 6, lineHeight: 17 },
  preHintHr: { marginTop: 8, fontFamily: 'Inter-Bold', fontSize: 12 },
  preCondRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preCond: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  preCondActive: { backgroundColor: colors.accent.gold, borderColor: colors.accent.gold },
  preCondText: { fontFamily: 'Inter-Medium', fontSize: 12 },
  doneTreadmillBlock: { marginTop: 8 },
  treadmillInput: {
    color: colors.text.primary,
    fontFamily: 'Inter-Regular',
    fontSize: 18,
    backgroundColor: colors.bg.elevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  efBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  efCard: {
    width: '100%',
    backgroundColor: colors.bg.elevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.accent.gold,
    padding: 20,
  },
  treadmillIntroCard: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: colors.bg.elevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  efTitle: { fontSize: 22, letterSpacing: 1 },
  efBody: { marginTop: 10, lineHeight: 20 },
  efActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  efBtn: {
    flex: 1,
    backgroundColor: colors.accent.gold,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  efBtnText: { fontFamily: 'Inter-Bold' },
  efGhost: { alignSelf: 'center', marginTop: 12, paddingVertical: 8 },
});
