/**
 * Running level test.
 *
 * Two protocols:
 *   - Cooper 12 min: run as far as possible in 12 min. VDOT is computed
 *     from the distance covered (Cooper 1968: VDOT = (m - 504.9) / 44.73).
 *   - Time trial: 1 km, 2 km, 5 km, or 10 km as fast as possible.
 *     VDOT is computed from the Daniels-Gilbert polynomial via
 *     {@link estimateVDOT}.
 *
 * The result calibrates the runningProfile (`vdot` and `easy_pace_sec_per_km`).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { auth } from '@/lib/firebase';
import {
  getRunningProfile,
  saveRunningProfile,
  type LongRunPreference,
  type RunningRaceDistance,
} from '@/lib/firestore';
import {
  calculateVDOTPaces,
  estimateVDOT,
  formatElapsed,
  formatPace,
  vdotLevelLabel,
  type VDOTPaces,
} from '@/lib/runningEngine';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';

type TestType = 'cooper' | 'time_trial';
type TrialDistance = 1000 | 2000 | 5000 | 10000;
type Step = 'choose' | 'warmup' | 'test' | 'result';

interface CooperResult {
  type: 'cooper';
  distanceMeters: number;
}

interface TrialResult {
  type: 'time_trial';
  distanceMeters: number;
  timeSeconds: number;
}

type TestResult = CooperResult | TrialResult;

const WARMUP_SECONDS = 10 * 60;
const COOPER_SECONDS = 12 * 60;
const TRIAL_OPTIONS: { meters: TrialDistance; label: string }[] = [
  { meters: 1000, label: '1 km' },
  { meters: 2000, label: '2 km' },
  { meters: 5000, label: '5 km' },
  { meters: 10000, label: '10 km' },
];

export default function RunningTestScreen(): React.ReactElement {
  const router = useRouter();
  const [step, setStep] = useState<Step>('choose');
  const [testType, setTestType] = useState<TestType>('cooper');
  const [trialDistance, setTrialDistance] = useState<TrialDistance>(5000);
  const [result, setResult] = useState<TestResult | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const onTestComplete = (r: TestResult): void => {
    setResult(r);
    setStep('result');
  };

  const onSave = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !result) return;
    const vdot = vdotFromResult(result);
    const paces = calculateVDOTPaces(vdot);
    setSaving(true);
    try {
      const existing = await getRunningProfile(user.uid);
      await saveRunningProfile(user.uid, {
        vdot,
        easy_pace_sec_per_km: paces.E_slow,
        goal: existing?.goal ?? 'forme',
        reference_distance: existing?.reference_distance ?? null,
        reference_time_seconds: existing?.reference_time_seconds ?? null,
        sessions_per_week: existing?.sessions_per_week ?? 3,
        target_race_date: existing?.target_race_date ?? null,
        long_run_pref:
          existing?.long_run_pref ?? ('dimanche' as LongRunPreference),
      });
      router.replace('/(app)/');
    } catch {
      Alert.alert('Erreur', 'Enregistrement impossible. Réessaie.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeScreen>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={16}
          style={styles.back}
        >
          <ArrowLeft size={22} color={colors.text.primary} />
        </TouchableOpacity>
        <ZoneText variant="heading" style={styles.title}>
          TEST DE NIVEAU
        </ZoneText>
        <View style={styles.back} />
      </View>

      {step === 'choose' ? (
        <ChooseStep
          testType={testType}
          onSelect={setTestType}
          trialDistance={trialDistance}
          onSelectTrial={setTrialDistance}
          onContinue={() => setStep('warmup')}
        />
      ) : null}

      {step === 'warmup' ? (
        <WarmupStep onDone={() => setStep('test')} />
      ) : null}

      {step === 'test' && testType === 'cooper' ? (
        <CooperStep onComplete={onTestComplete} />
      ) : null}

      {step === 'test' && testType === 'time_trial' ? (
        <TimeTrialStep
          targetMeters={trialDistance}
          onComplete={onTestComplete}
        />
      ) : null}

      {step === 'result' && result ? (
        <ResultStep result={result} onSave={onSave} saving={saving} />
      ) : null}
    </SafeScreen>
  );
}

function vdotFromResult(result: TestResult): number {
  if (result.type === 'cooper') {
    const raw = (result.distanceMeters - 504.9) / 44.73;
    return Math.max(20, Math.min(85, Math.round(raw)));
  }
  return estimateVDOT(result.distanceMeters, result.timeSeconds);
}

function ChooseStep({
  testType,
  onSelect,
  trialDistance,
  onSelectTrial,
  onContinue,
}: {
  testType: TestType;
  onSelect: (t: TestType) => void;
  trialDistance: TrialDistance;
  onSelectTrial: (d: TrialDistance) => void;
  onContinue: () => void;
}): React.ReactElement {
  return (
    <ScrollView contentContainerStyle={styles.body}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
        CHOISIR MON TEST
      </ZoneText>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => onSelect('cooper')}
        style={[styles.card, testType === 'cooper' ? styles.cardActive : null]}
      >
        <ZoneText variant="heading" style={styles.cardTitle}>
          TEST COOPER · 12 MIN
        </ZoneText>
        <ZoneText variant="body" color={colors.text.secondary} style={styles.cardBody}>
          Cours aussi loin que possible en 12 minutes. Le grand classique
          pour mesurer ta VMA et ton VDOT.
        </ZoneText>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => onSelect('time_trial')}
        style={[styles.card, testType === 'time_trial' ? styles.cardActive : null]}
      >
        <ZoneText variant="heading" style={styles.cardTitle}>
          CONTRE-LA-MONTRE
        </ZoneText>
        <ZoneText variant="body" color={colors.text.secondary} style={styles.cardBody}>
          Cours une distance fixe aussi vite que possible. Plus précis si
          tu as déjà un peu d&apos;expérience.
        </ZoneText>

        {testType === 'time_trial' ? (
          <View style={styles.pillRow}>
            {TRIAL_OPTIONS.map((o) => (
              <TouchableOpacity
                key={o.meters}
                onPress={() => onSelectTrial(o.meters)}
                activeOpacity={0.7}
                style={[
                  styles.pill,
                  o.meters === trialDistance ? styles.pillActive : null,
                ]}
              >
                <ZoneText
                  variant="caption"
                  color={
                    o.meters === trialDistance ? colors.bg.primary : colors.text.primary
                  }
                  style={styles.pillText}
                >
                  {o.label}
                </ZoneText>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </TouchableOpacity>

      <View style={styles.cta}>
        <Button title="Continuer" onPress={onContinue} />
      </View>
    </ScrollView>
  );
}

function WarmupStep({ onDone }: { onDone: () => void }): React.ReactElement {
  const [remaining, setRemaining] = useState<number>(WARMUP_SECONDS);
  const [running, setRunning] = useState<boolean>(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (remaining === 0 && running) {
      setRunning(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [remaining, running]);

  const elapsed = WARMUP_SECONDS - remaining;
  const inFirstHalf = elapsed < 5 * 60;

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
        ÉCHAUFFEMENT · 10 MIN
      </ZoneText>

      <View style={styles.timerCard}>
        <ZoneText variant="heading" style={styles.bigTimer}>
          {formatElapsed(remaining)}
        </ZoneText>
        <ZoneText
          variant="body"
          color={inFirstHalf ? colors.accent.gold : colors.orbe.green}
          style={styles.warmupPhase}
        >
          {inFirstHalf ? '🚶 5 min marche rapide' : '🏃 5 min footing très léger'}
        </ZoneText>
      </View>

      <View style={styles.instructions}>
        <Bullet text="Garde une intensité progressive, pas de sprint." />
        <Bullet text="Si tu peux parler, tu es à la bonne allure." />
        <Bullet text="Termine bien hydraté avant de lancer le test." />
      </View>

      <View style={styles.cta}>
        {!running && remaining === WARMUP_SECONDS ? (
          <Button title="Démarrer l'échauffement" onPress={() => setRunning(true)} />
        ) : null}
        {running ? (
          <Button title="Pause" variant="secondary" onPress={() => setRunning(false)} />
        ) : null}
        {!running && remaining > 0 && remaining < WARMUP_SECONDS ? (
          <Button title="Reprendre" onPress={() => setRunning(true)} />
        ) : null}
        <View style={styles.skipRow}>
          <TouchableOpacity onPress={onDone} hitSlop={8} activeOpacity={0.7}>
            <ZoneText variant="caption" color={colors.accent.gold}>
              {remaining === 0 ? "J'ai fini l'échauffement →" : 'Passer (déconseillé) →'}
            </ZoneText>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

function CooperStep({
  onComplete,
}: {
  onComplete: (r: CooperResult) => void;
}): React.ReactElement {
  const [remaining, setRemaining] = useState<number>(COOPER_SECONDS);
  const [running, setRunning] = useState<boolean>(false);
  const [done, setDone] = useState<boolean>(false);
  const [distanceText, setDistanceText] = useState<string>('');
  const lastMinuteRef = useRef<number>(12);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    const minute = Math.ceil(remaining / 60);
    if (running && minute !== lastMinuteRef.current && remaining > 0) {
      lastMinuteRef.current = minute;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (remaining === 0 && running) {
      setRunning(false);
      setDone(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [remaining, running]);

  const onSubmit = (): void => {
    const meters = parseDistanceMeters(distanceText);
    if (meters <= 0) {
      Alert.alert(
        'Distance invalide',
        'Entre la distance parcourue (en mètres, ex: 2400).',
      );
      return;
    }
    onComplete({ type: 'cooper', distanceMeters: meters });
  };

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
        TEST COOPER · 12 MIN
      </ZoneText>

      <View style={styles.timerCard}>
        <ZoneText variant="heading" style={styles.bigTimer}>
          {formatElapsed(remaining)}
        </ZoneText>
        <ZoneText
          variant="body"
          color={done ? colors.orbe.green : colors.accent.gold}
          style={styles.warmupPhase}
        >
          {done ? 'STOP — note ta distance' : 'Cours aussi loin que possible'}
        </ZoneText>
      </View>

      {done ? (
        <View style={styles.instructions}>
          <ZoneText variant="label" style={styles.label}>
            Distance parcourue (mètres)
          </ZoneText>
          <TextInput
            value={distanceText}
            onChangeText={setDistanceText}
            placeholder="ex: 2400"
            placeholderTextColor={colors.text.muted}
            keyboardType="number-pad"
            style={styles.input}
          />
          <ZoneText variant="caption" color={colors.text.muted} style={styles.hint}>
            Mesure depuis un GPS, une piste d'athlétisme (400m par tour),
            ou Google Maps après coup.
          </ZoneText>
        </View>
      ) : (
        <View style={styles.instructions}>
          <Bullet text="Rythme régulier dès le départ, n'explose pas en 2 min." />
          <Bullet text="Vibration courte à chaque minute écoulée." />
          <Bullet text="À 0:00, note ta distance avec précision." />
        </View>
      )}

      <View style={styles.cta}>
        {!running && !done && remaining === COOPER_SECONDS ? (
          <Button title="Démarrer le test" onPress={() => setRunning(true)} />
        ) : null}
        {running ? (
          <Button
            title="Arrêter"
            variant="secondary"
            onPress={() => {
              setRunning(false);
              setDone(true);
            }}
          />
        ) : null}
        {done ? (
          <Button title="Calculer mon VDOT" onPress={onSubmit} />
        ) : null}
      </View>
    </ScrollView>
  );
}

function TimeTrialStep({
  targetMeters,
  onComplete,
}: {
  targetMeters: TrialDistance;
  onComplete: (r: TrialResult) => void;
}): React.ReactElement {
  const [elapsed, setElapsed] = useState<number>(0);
  const [running, setRunning] = useState<boolean>(false);
  const [done, setDone] = useState<boolean>(false);
  const [distanceM, setDistanceM] = useState<number>(0);
  const [useGps, setUseGps] = useState<boolean>(true);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'unknown'>('unknown');
  const [manualTimeText, setManualTimeText] = useState<string>('');
  const [confirming, setConfirming] = useState<boolean>(false);
  const startedAtRef = useRef<number>(0);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const lastPosRef = useRef<{ lat: number; lng: number } | null>(null);

  const targetKm = (targetMeters / 1000).toFixed(0);
  // Treadmill / indoor mode: no GPS, manual stop, then a one-tap
  // confirmation of the distance the athlete actually covered.
  const treadmillMode = !useGps;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 200);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    return () => {
      if (watchRef.current) {
        watchRef.current.remove();
        watchRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (running && useGps && distanceM >= targetMeters) {
      finishRun();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distanceM, running, targetMeters, useGps]);

  const startGps = async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermission('denied');
        return false;
      }
      setPermission('granted');
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (loc) => {
          const here = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          const prev = lastPosRef.current;
          if (prev) {
            const d = haversine(prev, here);
            setDistanceM((m) => m + d);
          }
          lastPosRef.current = here;
        },
      );
      return true;
    } catch {
      setPermission('denied');
      return false;
    }
  };

  const start = async (): Promise<void> => {
    startedAtRef.current = Date.now();
    setElapsed(0);
    setDistanceM(0);
    setRunning(true);
    if (useGps) {
      const ok = await startGps();
      if (!ok) {
        Alert.alert(
          'GPS indisponible',
          "Le test se lance quand même. Tu pourras renseigner ton temps manuellement à l'arrivée.",
        );
      }
    }
  };

  const finishRun = (): void => {
    if (watchRef.current) {
      watchRef.current.remove();
      watchRef.current = null;
    }
    setRunning(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (treadmillMode) {
      // Ask the athlete to confirm the distance actually covered before
      // we commit the result.
      setConfirming(true);
    } else {
      setDone(true);
    }
  };

  const onStop = (): void => {
    finishRun();
  };

  const onConfirmTreadmillDistance = (): void => {
    setConfirming(false);
    setDone(true);
  };

  const onSubmit = (): void => {
    let timeSec = elapsed;
    // Manual time entry is only needed when GPS was requested but
    // denied. In treadmill mode the timer drives the time directly.
    if (useGps && permission !== 'granted') {
      timeSec = parseTimeToSeconds(manualTimeText);
      if (timeSec <= 0) {
        Alert.alert(
          'Temps invalide',
          'Entre ton temps au format MM:SS ou HH:MM:SS.',
        );
        return;
      }
    }
    onComplete({
      type: 'time_trial',
      distanceMeters: targetMeters,
      timeSeconds: timeSec,
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
        CONTRE-LA-MONTRE · {targetKm} KM
      </ZoneText>

      {!running && !done && !confirming ? (
        <View style={styles.gpsToggleRow}>
          <View style={styles.gpsToggleText}>
            <ZoneText variant="label" color={colors.text.primary}>
              Utiliser le GPS
            </ZoneText>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.gpsToggleHint}>
              {useGps
                ? 'Distance mesurée par GPS, arrêt automatique.'
                : 'Mode tapis / piste indoor : timer manuel.'}
            </ZoneText>
          </View>
          <Switch
            value={useGps}
            onValueChange={setUseGps}
            trackColor={{ false: colors.border, true: colors.accent.gold }}
            thumbColor={colors.bg.primary}
          />
        </View>
      ) : null}

      <View style={styles.timerCard}>
        <ZoneText variant="heading" style={styles.bigTimer}>
          {formatElapsed(elapsed)}
        </ZoneText>
        {useGps && permission === 'granted' && running ? (
          <ZoneText variant="body" color={colors.text.secondary} style={styles.warmupPhase}>
            {Math.round(distanceM)} / {targetMeters} m
          </ZoneText>
        ) : (
          <ZoneText
            variant="body"
            color={done ? colors.orbe.green : colors.accent.gold}
            style={styles.warmupPhase}
          >
            {done
              ? 'TERMINÉ'
              : confirming
                ? `Distance réalisée : ${targetKm} km ?`
                : treadmillMode
                  ? `Cours ${targetKm} km sur ton tapis`
                  : `Cours ${targetKm} km aussi vite que possible`}
          </ZoneText>
        )}
      </View>

      {!done && !confirming ? (
        <View style={styles.instructions}>
          <Bullet text="Pars sur un rythme tenable, pas de sprint initial." />
          {useGps && permission === 'granted' ? (
            <Bullet text="Arrêt automatique à l'arrivée." />
          ) : treadmillMode ? (
            <Bullet text={`Touche "J'ai terminé mes ${targetKm} km" en arrivant.`} />
          ) : (
            <Bullet text="Sans GPS : arrête le timer à la ligne d'arrivée." />
          )}
          <Bullet text="Garde-toi un peu pour finir fort sur le dernier 25 %." />
        </View>
      ) : null}

      {confirming ? (
        <View style={styles.confirmCard}>
          <ZoneText variant="label" color={colors.text.primary} style={styles.confirmTitle}>
            Distance réalisée : {targetKm} km ✓
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.confirmHint}>
            Confirme si tu as bien couvert {targetKm} km au compteur du tapis.
            Sinon, reprends le test sur une distance plus adaptée.
          </ZoneText>
        </View>
      ) : null}

      {done && useGps && permission !== 'granted' ? (
        <View style={styles.instructions}>
          <ZoneText variant="label" style={styles.label}>
            Ton temps (MM:SS ou HH:MM:SS)
          </ZoneText>
          <TextInput
            value={manualTimeText}
            onChangeText={setManualTimeText}
            placeholder="ex: 22:30"
            placeholderTextColor={colors.text.muted}
            keyboardType="numbers-and-punctuation"
            style={styles.input}
          />
        </View>
      ) : null}

      <View style={styles.cta}>
        {!running && !done && !confirming ? (
          <Button title="Démarrer le test" onPress={() => void start()} />
        ) : null}
        {running && treadmillMode ? (
          <Button title={`J'ai terminé mes ${targetKm} km`} onPress={onStop} />
        ) : null}
        {running && !treadmillMode ? (
          <Button title="Arrêter" variant="secondary" onPress={onStop} />
        ) : null}
        {confirming ? (
          <Button title={`Oui, j'ai bien fait ${targetKm} km`} onPress={onConfirmTreadmillDistance} />
        ) : null}
        {done ? <Button title="Calculer mon VDOT" onPress={onSubmit} /> : null}
      </View>
    </ScrollView>
  );
}

function ResultStep({
  result,
  onSave,
  saving,
}: {
  result: TestResult;
  onSave: () => void;
  saving: boolean;
}): React.ReactElement {
  const vdot = useMemo(() => vdotFromResult(result), [result]);
  const paces = useMemo(() => calculateVDOTPaces(vdot), [vdot]);
  const label = vdotLevelLabel(vdot);
  const friendlyLabel = friendlyLevel(vdot);

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
        TON NIVEAU
      </ZoneText>

      <View style={styles.resultCard}>
        <ZoneText variant="heading" style={styles.vdotNumber}>
          {vdot}
        </ZoneText>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.vdotLabel}>
          VDOT
        </ZoneText>
        <ZoneText variant="body" color={colors.accent.gold} style={styles.levelLabel}>
          {friendlyLabel} · {label}
        </ZoneText>
      </View>

      <View style={styles.paceCard}>
        <PaceRow label="Allure facile" pace={paces.E_slow} />
        <PaceRow label="Allure footing" pace={paces.E_fast} />
        <PaceRow label="Allure marathon" pace={paces.M} />
        <PaceRow label="Allure tempo" pace={paces.T} />
        <PaceRow label="Allure VO2max" pace={paces.I} />
      </View>

      <View style={styles.paceCard}>
        <Estimate label="10 km estimé" raceMeters={10000} paces={paces} />
        <Estimate label="Semi estimé" raceMeters={21097} paces={paces} />
        <Estimate label="Marathon estimé" raceMeters={42195} paces={paces} />
      </View>

      <View style={styles.cta}>
        <Button
          title={saving ? 'Enregistrement…' : 'Enregistrer et calibrer mon programme'}
          disabled={saving}
          onPress={onSave}
        />
        <ZoneText variant="caption" color={colors.text.muted} style={styles.recoveryHint}>
          Prends 48 h de récupération avant ta prochaine séance de qualité.
          L&apos;endurance fondamentale est possible dès demain.
        </ZoneText>
      </View>
    </ScrollView>
  );
}

function PaceRow({ label, pace }: { label: string; pace: number }): React.ReactElement {
  return (
    <View style={styles.paceRow}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.paceLabel}>
        {label}
      </ZoneText>
      <ZoneText variant="label" color={colors.text.primary}>
        {formatPace(pace)}
      </ZoneText>
    </View>
  );
}

function Estimate({
  label,
  raceMeters,
  paces,
}: {
  label: string;
  raceMeters: number;
  paces: VDOTPaces;
}): React.ReactElement {
  // Estimate race time using the marathon pace as the long-distance
  // anchor and adjusting up/down for shorter races.
  let pace = paces.M;
  if (raceMeters <= 10000) pace = paces.T;
  else if (raceMeters <= 21097) pace = Math.round((paces.M + paces.T) / 2);
  const seconds = Math.round((raceMeters / 1000) * pace);
  return (
    <View style={styles.paceRow}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.paceLabel}>
        {label}
      </ZoneText>
      <ZoneText variant="label" color={colors.text.primary}>
        {formatElapsed(seconds)}
      </ZoneText>
    </View>
  );
}

function Bullet({ text }: { text: string }): React.ReactElement {
  return (
    <View style={styles.bulletRow}>
      <ZoneText variant="label" color={colors.accent.gold} style={styles.bulletDot}>
        •
      </ZoneText>
      <ZoneText
        variant="body"
        color={colors.text.secondary}
        style={styles.bulletText}
      >
        {text}
      </ZoneText>
    </View>
  );
}

function friendlyLevel(vdot: number): string {
  if (vdot < 30) return 'Débutant';
  if (vdot < 40) return 'Intermédiaire';
  if (vdot < 50) return 'Bon niveau';
  if (vdot < 60) return 'Avancé';
  return 'Élite';
}

function parseDistanceMeters(text: string): number {
  const cleaned = text.replace(',', '.').trim();
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Accept both kilometres and metres; under 30 means km.
  return n < 30 ? Math.round(n * 1000) : Math.round(n);
}

function parseTimeToSeconds(text: string): number {
  const parts = text.split(':').map((p) => p.trim());
  if (parts.length === 0) return 0;
  let h = 0;
  let m = 0;
  let s = 0;
  if (parts.length === 3) {
    h = Number(parts[0]);
    m = Number(parts[1]);
    s = Number(parts[2]);
  } else if (parts.length === 2) {
    m = Number(parts[0]);
    s = Number(parts[1]);
  } else {
    return 0;
  }
  if (![h, m, s].every((n) => Number.isFinite(n) && n >= 0)) return 0;
  return h * 3600 + m * 60 + s;
}

function haversine(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
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

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
  },
  back: { padding: 8, minWidth: 44 },
  title: { fontSize: 22, flex: 1, textAlign: 'center', letterSpacing: 1 },
  body: { paddingHorizontal: 24, paddingBottom: 40, paddingTop: 4 },
  eyebrow: { letterSpacing: 2, fontSize: 11, fontFamily: 'Inter-Bold', marginBottom: 12 },
  card: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardActive: { borderColor: colors.accent.gold, borderWidth: 2 },
  cardTitle: { fontSize: 18, letterSpacing: 1 },
  cardBody: { marginTop: 8, lineHeight: 21 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  pill: {
    backgroundColor: colors.bg.elevated,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.accent.gold, borderColor: colors.accent.gold },
  pillText: { fontFamily: 'Inter-Medium', fontSize: 13 },
  cta: { marginTop: 22 },
  gpsToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    gap: 12,
  },
  gpsToggleText: { flex: 1 },
  gpsToggleHint: { marginTop: 2, lineHeight: 16 },
  confirmCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.accent.gold,
    borderLeftWidth: 3,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
  },
  confirmTitle: { fontSize: 15 },
  confirmHint: { marginTop: 8, lineHeight: 17 },
  timerCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    marginBottom: 18,
  },
  bigTimer: { fontSize: 64, letterSpacing: 2, lineHeight: 68 },
  warmupPhase: { marginTop: 10, fontFamily: 'Inter-Medium', fontSize: 14 },
  instructions: { marginTop: 4 },
  bulletRow: { flexDirection: 'row', marginVertical: 4, alignItems: 'flex-start' },
  bulletDot: { width: 16, fontSize: 16, lineHeight: 22 },
  bulletText: { flex: 1, lineHeight: 22, fontSize: 14 },
  skipRow: { marginTop: 14, alignItems: 'center' },
  label: { fontSize: 13, marginTop: 8, marginBottom: 6 },
  input: {
    color: colors.text.primary,
    fontFamily: 'Inter-Regular',
    fontSize: 18,
    backgroundColor: colors.bg.elevated,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  hint: { marginTop: 8, lineHeight: 16 },
  resultCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.accent.gold,
    borderLeftWidth: 3,
    borderRadius: 14,
    padding: 22,
    alignItems: 'center',
    marginBottom: 14,
  },
  vdotNumber: { fontSize: 72, lineHeight: 80, letterSpacing: 1 },
  vdotLabel: { fontFamily: 'Inter-Bold', letterSpacing: 2 },
  levelLabel: { marginTop: 6, fontSize: 16 },
  paceCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 12,
  },
  paceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  paceLabel: { fontSize: 13 },
  recoveryHint: { marginTop: 14, lineHeight: 18, textAlign: 'center' },
});
