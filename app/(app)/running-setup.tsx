import React, { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { SlideInRight, SlideOutLeft } from 'react-native-reanimated';
import { ArrowLeft, Minus, Plus } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import {
  getRunningProfile,
  getUserProfile,
  saveRunningProfile,
  type Gender,
  type LongRunPreference,
  type RunningRaceDistance,
} from '@/lib/firestore';
import { vdotGenderDelta } from '@/lib/genderProfiles';
import { resetSportWeek } from '@/lib/weekTracking';
import {
  calculateVDOTPaces,
  estimateVDOT,
  formatPace,
  raceLabel,
  raceMeters,
  vdotFromEasyPace,
  vdotLevelLabel,
} from '@/lib/runningEngine';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Button } from '@/components/ui/Button';
import { ZoneText } from '@/components/ui/ZoneText';
import { SelectableCard } from '@/components/SelectableCard';

const TOTAL_STEPS = 4;

const LONG_RUN_OPTIONS: { key: LongRunPreference; label: string }[] = [
  { key: 'lundi', label: 'Lun' },
  { key: 'mardi', label: 'Mar' },
  { key: 'mercredi', label: 'Mer' },
  { key: 'jeudi', label: 'Jeu' },
  { key: 'vendredi', label: 'Ven' },
  { key: 'samedi', label: 'Sam' },
  { key: 'dimanche', label: 'Dim' },
  { key: 'flexible', label: 'Peu importe' },
];

interface Goal {
  key: string;
  emoji: string;
  label: string;
}

const GOALS: Goal[] = [
  { key: '5km', emoji: '🏃', label: '5 km' },
  { key: '10km', emoji: '🏃', label: '10 km' },
  { key: 'semi', emoji: '🏅', label: 'Semi-marathon' },
  { key: 'marathon', emoji: '🏆', label: 'Marathon' },
  { key: 'trail', emoji: '🏔️', label: 'Trail' },
  { key: 'forme', emoji: '❤️', label: 'Forme générale' },
];

interface State {
  goal: string | null;
  easyPaceSec: number;
  hasReference: boolean;
  refDistance: RunningRaceDistance;
  refTimeSeconds: number;
  sessionsPerWeek: number;
  longRunPref: LongRunPreference;
  raceDate: string;
  goalTimeSeconds: number;
}

function roundTo10(n: number): number {
  return Math.max(0, Math.round(n / 10) * 10) % 60;
}

export default function RunningSetupScreen(): React.ReactElement {
  const router = useRouter();
  const [step, setStep] = useState<number>(0);
  const [state, setState] = useState<State>({
    goal: null,
    easyPaceSec: 6 * 60 + 30,
    hasReference: false,
    refDistance: '5km',
    refTimeSeconds: 28 * 60,
    sessionsPerWeek: 3,
    longRunPref: 'dimanche',
    raceDate: '',
    goalTimeSeconds: 0,
  });
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [gender, setGender] = useState<Gender | null>(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const profile = await getUserProfile(user.uid);
        if (!cancelled) setGender(profile?.gender ?? null);
      } catch {
        // keep null
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Pre-fill the form from any existing running profile so a
  // reconfiguration doesn't silently reset sessions_per_week, long-run
  // preference, goal time, etc.
  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const existing = await getRunningProfile(user.uid);
        if (cancelled || !existing) return;
        setState((s) => ({
          ...s,
          goal: existing.goal || s.goal,
          easyPaceSec: existing.easy_pace_sec_per_km || s.easyPaceSec,
          hasReference: existing.reference_distance !== null,
          refDistance: existing.reference_distance ?? s.refDistance,
          refTimeSeconds: existing.reference_time_seconds ?? s.refTimeSeconds,
          sessionsPerWeek: existing.sessions_per_week || s.sessionsPerWeek,
          longRunPref: existing.long_run_pref ?? s.longRunPref,
          raceDate: existing.target_race_date ?? s.raceDate,
          goalTimeSeconds: existing.goal_time_seconds ?? 0,
        }));
      } catch {
        // best effort: keep defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const baseVdot = useMemo(
    () => vdotFromEasyPace(state.easyPaceSec),
    [state.easyPaceSec],
  );

  const calibratedVdot = useMemo(() => {
    if (!state.hasReference) return baseVdot;
    return estimateVDOT(raceMeters(state.refDistance), state.refTimeSeconds);
  }, [baseVdot, state.hasReference, state.refDistance, state.refTimeSeconds]);

  const paces = useMemo(() => calculateVDOTPaces(calibratedVdot), [calibratedVdot]);

  const canContinue = (): boolean => {
    if (step === 0) return state.goal !== null;
    return true;
  };

  const goPrev = (): void => {
    if (step === 0) {
      router.back();
      return;
    }
    setStep((s) => s - 1);
  };

  const goNext = async (): Promise<void> => {
    if (step < TOTAL_STEPS - 1) {
      setStep((s) => s + 1);
      return;
    }
    await persist();
  };

  const persist = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user) {
      setError('Session expirée.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const adjustedVdot = Math.max(20, calibratedVdot + vdotGenderDelta(gender));
      await saveRunningProfile(user.uid, {
        vdot: adjustedVdot,
        easy_pace_sec_per_km: state.easyPaceSec,
        goal: state.goal ?? 'forme',
        reference_distance: state.hasReference ? state.refDistance : null,
        reference_time_seconds: state.hasReference ? state.refTimeSeconds : null,
        sessions_per_week: state.sessionsPerWeek,
        target_race_date: state.raceDate || null,
        long_run_pref: state.longRunPref,
        goal_time_seconds: state.goalTimeSeconds > 0 ? state.goalTimeSeconds : null,
      });
      // Reconfiguring the sport restarts the programme queue from week 1.
      await resetSportWeek(user.uid, 'running').catch(() => undefined);
      router.replace({
        pathname: '/(app)/programme-overview',
        params: { sport: 'running' },
      });
    } catch {
      setError('Enregistrement impossible. Réessaie.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeScreen>
      <View style={styles.backRow}>
        <TouchableOpacity
          onPress={goPrev}
          activeOpacity={0.7}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          style={styles.closeBtn}
        >
          <ArrowLeft size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>
      <View style={styles.heroRow}>
        <ZoneText variant="caption" color={colors.accent.gold} style={styles.eyebrow}>
          Étape {step + 1}/{TOTAL_STEPS}
        </ZoneText>
        <View style={styles.dotsRow}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i <= step ? colors.accent.gold : colors.border },
              ]}
            />
          ))}
        </View>
      </View>

      <Animated.View
        key={step}
        entering={SlideInRight.duration(200)}
        exiting={SlideOutLeft.duration(160)}
        style={styles.body}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            {step === 0 ? (
              <GoalStep
                value={state.goal}
                onChange={(v) => setState((s) => ({ ...s, goal: v }))}
              />
            ) : null}
            {step === 1 ? (
              <PaceStep
                paceSec={state.easyPaceSec}
                onChange={(v) => setState((s) => ({ ...s, easyPaceSec: v }))}
                vdot={baseVdot}
              />
            ) : null}
            {step === 2 ? (
              <ReferenceStep
                hasReference={state.hasReference}
                refDistance={state.refDistance}
                refTimeSeconds={state.refTimeSeconds}
                onChangeHas={(v) => setState((s) => ({ ...s, hasReference: v }))}
                onChangeDistance={(v) => setState((s) => ({ ...s, refDistance: v }))}
                onChangeTime={(v) => setState((s) => ({ ...s, refTimeSeconds: v }))}
                calibratedVdot={calibratedVdot}
                baseVdot={baseVdot}
              />
            ) : null}
            {step === 3 ? (
              <OrganizeStep
                sessions={state.sessionsPerWeek}
                onSessions={(v) => setState((s) => ({ ...s, sessionsPerWeek: v }))}
                longRunPref={state.longRunPref}
                onLongRunPref={(v) => setState((s) => ({ ...s, longRunPref: v }))}
                raceDate={state.raceDate}
                onRaceDate={(v) => setState((s) => ({ ...s, raceDate: v }))}
                refDistance={state.refDistance}
                goalTimeSeconds={state.goalTimeSeconds}
                onGoalTime={(v) => setState((s) => ({ ...s, goalTimeSeconds: v }))}
                paces={paces}
                vdot={calibratedVdot}
              />
            ) : null}

            {error ? (
              <ZoneText variant="caption" color={colors.danger} style={styles.error}>
                {error}
              </ZoneText>
            ) : null}
          </ScrollView>
        </TouchableWithoutFeedback>
      </Animated.View>

      <View style={styles.footer}>
        <Button
          title={step === TOTAL_STEPS - 1 ? 'Démarrer mon programme' : 'Suivant'}
          loading={saving}
          disabled={!canContinue()}
          onPress={goNext}
        />
      </View>
    </SafeScreen>
  );
}

function GoalStep({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string) => void;
}): React.ReactElement {
  return (
    <View>
      <ZoneText variant="heading" style={styles.title}>
        QUEL EST TON OBJECTIF ?
      </ZoneText>
      <View style={{ marginTop: 16 }}>
        {GOALS.map((g) => (
          <SelectableCard
            key={g.key}
            title={g.label}
            emoji={g.emoji}
            selected={value === g.key}
            onPress={() => onChange(g.key)}
          />
        ))}
      </View>
    </View>
  );
}

function PaceStep({
  paceSec,
  onChange,
  vdot,
}: {
  paceSec: number;
  onChange: (v: number) => void;
  vdot: number;
}): React.ReactElement {
  const minutes = Math.floor(paceSec / 60);
  const seconds = roundTo10(paceSec % 60);
  const [editing, setEditing] = useState<boolean>(false);
  const [editText, setEditText] = useState<string>('');

  const setMinutes = (m: number): void => {
    const clamped = Math.max(4, Math.min(12, m));
    onChange(clamped * 60 + seconds);
  };
  const setSeconds = (s: number): void => {
    const wrapped = ((s % 60) + 60) % 60;
    onChange(minutes * 60 + wrapped);
  };

  const openEdit = (): void => {
    setEditText(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    setEditing(true);
  };

  const commitEdit = (): void => {
    const match = editText.replace(/\s+/g, '').match(/^(\d{1,2}):(\d{1,2})$/);
    if (match) {
      const m = Math.max(4, Math.min(12, parseInt(match[1], 10)));
      const sParsed = parseInt(match[2], 10);
      const s = Math.max(0, Math.min(59, Number.isFinite(sParsed) ? sParsed : 0));
      const rounded = Math.round(s / 10) * 10 % 60;
      onChange(m * 60 + rounded);
    }
    setEditing(false);
  };

  return (
    <View>
      <ZoneText variant="heading" style={styles.title}>
        QUELLE EST TON ALLURE DE RÉFÉRENCE ?
      </ZoneText>
      <ZoneText variant="body" color={colors.text.secondary} style={styles.subtitle}>
        L’allure où tu peux tenir une conversation complète, pas juste 3 mots.
      </ZoneText>

      <View style={styles.pacePickerCard}>
        <View style={styles.paceBlocksRow}>
          <PaceBlock
            value={minutes}
            label="MIN"
            onIncrement={() => setMinutes(minutes + 1)}
            onDecrement={() => setMinutes(minutes - 1)}
          />
          <ZoneText variant="heading" style={styles.paceColon}>
            :
          </ZoneText>
          <PaceBlock
            value={seconds}
            label="SEC"
            format={(n) => n.toString().padStart(2, '0')}
            onIncrement={() => setSeconds(seconds + 10)}
            onDecrement={() => setSeconds(seconds - 10)}
          />
        </View>

        {editing ? (
          <TextInput
            value={editText}
            onChangeText={setEditText}
            onBlur={commitEdit}
            onSubmitEditing={commitEdit}
            autoFocus
            keyboardType="numbers-and-punctuation"
            returnKeyType="done"
            placeholder="MM:SS"
            placeholderTextColor={colors.text.muted}
            selectionColor={colors.accent.gold}
            maxLength={5}
            style={styles.paceBigInput}
          />
        ) : (
          <TouchableOpacity onPress={openEdit} activeOpacity={0.7}>
            <ZoneText variant="heading" style={styles.paceBig}>
              {formatPace(paceSec)}
            </ZoneText>
          </TouchableOpacity>
        )}
        <ZoneText variant="caption" color={colors.text.muted} style={styles.vdotLine}>
          VDOT estimé : {vdot} · Niveau {vdotLevelLabel(vdot).toLowerCase()}
        </ZoneText>
      </View>

      <View style={styles.presetsRow}>
        <PresetChip label="Je débute (>8:00)" onPress={() => onChange(8 * 60 + 30)} />
        <PresetChip label="Inter. (5:30-7:30)" onPress={() => onChange(6 * 60 + 30)} />
        <PresetChip label="Avancé (<5:30)" onPress={() => onChange(5 * 60)} />
      </View>

      <TestNivLink />
    </View>
  );
}

function TestNivLink(): React.ReactElement {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => router.push('/(app)/running-test')}
      activeOpacity={0.7}
      style={styles.testNivLink}
    >
      <ZoneText variant="caption" color={colors.accent.gold} style={styles.testNivText}>
        Je veux faire un test de niveau →
      </ZoneText>
    </TouchableOpacity>
  );
}

function PaceBlock({
  value,
  label,
  onIncrement,
  onDecrement,
  format,
}: {
  value: number;
  label: string;
  onIncrement: () => void;
  onDecrement: () => void;
  format?: (n: number) => string;
}): React.ReactElement {
  return (
    <View style={styles.paceBlock}>
      <TouchableOpacity
        onPress={onIncrement}
        activeOpacity={0.7}
        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        style={styles.paceBlockBtn}
      >
        <Plus size={26} color={colors.accent.gold} />
      </TouchableOpacity>
      <ZoneText variant="heading" style={styles.paceBlockValue}>
        {format ? format(value) : value}
      </ZoneText>
      <TouchableOpacity
        onPress={onDecrement}
        activeOpacity={0.7}
        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        style={styles.paceBlockBtn}
      >
        <Minus size={26} color={colors.accent.gold} />
      </TouchableOpacity>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.paceBlockLabel}>
        {label}
      </ZoneText>
    </View>
  );
}

function PresetChip({ label, onPress }: { label: string; onPress: () => void }): React.ReactElement {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={styles.presetChip}
    >
      <ZoneText style={styles.presetText}>{label}</ZoneText>
    </TouchableOpacity>
  );
}

function ReferenceStep({
  hasReference,
  refDistance,
  refTimeSeconds,
  onChangeHas,
  onChangeDistance,
  onChangeTime,
  calibratedVdot,
  baseVdot,
}: {
  hasReference: boolean;
  refDistance: RunningRaceDistance;
  refTimeSeconds: number;
  onChangeHas: (v: boolean) => void;
  onChangeDistance: (v: RunningRaceDistance) => void;
  onChangeTime: (v: number) => void;
  calibratedVdot: number;
  baseVdot: number;
}): React.ReactElement {
  const [hh, mm, ss] = secondsToParts(refTimeSeconds);
  const updateTime = (h: number, m: number, s: number): void => {
    const total = Math.max(60, h * 3600 + m * 60 + s);
    onChangeTime(total);
  };

  return (
    <View>
      <ZoneText variant="heading" style={styles.title}>
        AS-TU UNE PERFORMANCE RÉCENTE ?
      </ZoneText>
      <ZoneText variant="body" color={colors.text.secondary} style={styles.subtitle}>
        Optionnel. Ça nous permet de calibrer ton VDOT plus précisément.
      </ZoneText>

      <View style={styles.toggleRow}>
        <SmallChip
          label="Oui"
          active={hasReference}
          onPress={() => onChangeHas(true)}
        />
        <SmallChip
          label="Passer"
          active={!hasReference}
          onPress={() => onChangeHas(false)}
        />
      </View>

      {hasReference ? (
        <View style={styles.refCard}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.refLabel}>
            DISTANCE
          </ZoneText>
          <View style={styles.distRow}>
            {(['5km', '10km', 'semi', 'marathon'] as RunningRaceDistance[]).map((d) => {
              const active = refDistance === d;
              return (
                <TouchableOpacity
                  key={d}
                  activeOpacity={0.8}
                  onPress={() => onChangeDistance(d)}
                  style={[
                    styles.distChip,
                    active
                      ? { backgroundColor: colors.accent.gold, borderColor: colors.accent.gold }
                      : { backgroundColor: 'transparent', borderColor: colors.border },
                  ]}
                >
                  <ZoneText
                    style={{
                      color: active ? colors.bg.primary : colors.text.secondary,
                      fontFamily: 'Inter-Bold',
                      fontSize: 12,
                    }}
                  >
                    {raceLabel(d)}
                  </ZoneText>
                </TouchableOpacity>
              );
            })}
          </View>

          <ZoneText
            variant="caption"
            color={colors.text.muted}
            style={[styles.refLabel, { marginTop: 16 }]}
          >
            TEMPS
          </ZoneText>
          <View style={styles.timeRow}>
            <TimePiece
              value={hh}
              onChange={(v) => updateTime(v, mm, ss)}
              max={4}
              suffix="h"
            />
            <TimePiece
              value={mm}
              onChange={(v) => updateTime(hh, v, ss)}
              max={59}
              suffix="min"
            />
            <TimePiece
              value={ss}
              onChange={(v) => updateTime(hh, mm, v)}
              max={59}
              suffix="s"
            />
          </View>

          <View style={styles.calibrationRow}>
            <ZoneText variant="caption" color={colors.text.muted}>
              VDOT recalibré
            </ZoneText>
            <ZoneText style={styles.calibrationValue}>
              {calibratedVdot} {calibratedVdot !== baseVdot ? '✓' : ''}
            </ZoneText>
          </View>
        </View>
      ) : (
        <View style={styles.refCard}>
          <ZoneText variant="caption" color={colors.text.muted}>
            On reste sur ton allure conversationnelle. Tu pourras affiner ton VDOT plus tard depuis le profil.
          </ZoneText>
        </View>
      )}
    </View>
  );
}

function secondsToParts(total: number): [number, number, number] {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s];
}

function formatGoalTime(total: number, showHours: boolean): string {
  const [h, m, s] = secondsToParts(total);
  if (showHours) return `${h}h${m.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function TimePiece({
  value,
  onChange,
  max,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  max: number;
  suffix: string;
}): React.ReactElement {
  const [text, setText] = useState<string>(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
  const commit = (): void => {
    const parsed = parseInt(text, 10);
    const next = Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : value;
    onChange(next);
    setText(String(next));
  };
  return (
    <View style={styles.timePieceWrap}>
      <TextInput
        value={text}
        onChangeText={setText}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="number-pad"
        returnKeyType="done"
        maxLength={2}
        style={styles.timeInput}
        selectionColor={colors.accent.gold}
      />
      <ZoneText variant="caption" color={colors.text.muted} style={styles.timeSuffix}>
        {suffix}
      </ZoneText>
    </View>
  );
}

function OrganizeStep({
  sessions,
  onSessions,
  longRunPref,
  onLongRunPref,
  raceDate,
  onRaceDate,
  refDistance,
  goalTimeSeconds,
  onGoalTime,
  paces,
  vdot,
}: {
  sessions: number;
  onSessions: (v: number) => void;
  longRunPref: LongRunPreference;
  onLongRunPref: (v: LongRunPreference) => void;
  raceDate: string;
  onRaceDate: (v: string) => void;
  refDistance: RunningRaceDistance;
  goalTimeSeconds: number;
  onGoalTime: (v: number) => void;
  paces: ReturnType<typeof calculateVDOTPaces>;
  vdot: number;
}): React.ReactElement {
  const goalVdot = useMemo(
    () =>
      goalTimeSeconds > 0
        ? estimateVDOT(raceMeters(refDistance), goalTimeSeconds)
        : null,
    [goalTimeSeconds, refDistance],
  );
  const [gh, gm, gs] = secondsToParts(goalTimeSeconds);
  const setGoal = (h: number, m: number, s: number): void => {
    const total = Math.max(0, h * 3600 + m * 60 + s);
    onGoalTime(total);
  };
  const showHours = refDistance === 'semi' || refDistance === 'marathon';
  return (
    <View>
      <ZoneText variant="heading" style={styles.title}>
        ORGANISE TES SORTIES
      </ZoneText>

      <ZoneText variant="caption" color={colors.text.muted} style={styles.sectionLabel}>
        SÉANCES PAR SEMAINE
      </ZoneText>
      <View style={styles.sessionsRow}>
        {[2, 3, 4, 5, 6].map((n) => {
          const active = sessions === n;
          return (
            <TouchableOpacity
              key={n}
              onPress={() => onSessions(n)}
              activeOpacity={0.8}
              style={[
                styles.sessionsCell,
                {
                  backgroundColor: active ? colors.accent.gold : colors.bg.elevated,
                  borderColor: active ? colors.accent.gold : colors.border,
                },
              ]}
            >
              <ZoneText
                style={{
                  color: active ? colors.bg.primary : colors.text.secondary,
                  fontFamily: 'Inter-Bold',
                  fontSize: 16,
                }}
              >
                {n}
              </ZoneText>
            </TouchableOpacity>
          );
        })}
      </View>

      <ZoneText variant="caption" color={colors.text.muted} style={styles.sectionLabel}>
        PRÉFÉRENCE DE SORTIE LONGUE
      </ZoneText>
      <View style={styles.longRunRow}>
        {LONG_RUN_OPTIONS.map((opt) => {
          const active = longRunPref === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => onLongRunPref(opt.key)}
              activeOpacity={0.8}
              style={[
                styles.longRunChip,
                active
                  ? { backgroundColor: colors.accent.gold, borderColor: colors.accent.gold }
                  : { backgroundColor: 'transparent', borderColor: colors.border },
              ]}
            >
              <ZoneText
                style={{
                  color: active ? colors.bg.primary : colors.text.secondary,
                  fontFamily: 'Inter-Bold',
                  fontSize: 12,
                }}
              >
                {opt.label}
              </ZoneText>
            </TouchableOpacity>
          );
        })}
      </View>

      <ZoneText variant="caption" color={colors.text.muted} style={styles.sectionLabel}>
        DATE DE COURSE OBJECTIF (optionnel)
      </ZoneText>
      <TextInput
        value={raceDate}
        onChangeText={onRaceDate}
        placeholder="AAAA-MM-JJ"
        placeholderTextColor={colors.text.muted}
        autoCapitalize="none"
        autoCorrect={false}
        style={styles.raceInput}
        selectionColor={colors.accent.gold}
      />

      <ZoneText variant="caption" color={colors.text.muted} style={styles.sectionLabel}>
        OBJECTIF DE TEMPS · {raceLabel(refDistance)} (optionnel)
      </ZoneText>
      <View style={styles.timeRow}>
        {showHours ? (
          <TimePiece
            value={gh}
            onChange={(h) => setGoal(h, gm, gs)}
            max={9}
            suffix="h"
          />
        ) : null}
        <TimePiece
          value={gm}
          onChange={(m) => setGoal(gh, m, gs)}
          max={59}
          suffix="min"
        />
        <TimePiece
          value={gs}
          onChange={(s) => setGoal(gh, gm, s)}
          max={59}
          suffix="sec"
        />
        {goalTimeSeconds > 0 ? (
          <TouchableOpacity
            onPress={() => onGoalTime(0)}
            activeOpacity={0.7}
            hitSlop={8}
            style={styles.goalClear}
          >
            <ZoneText variant="caption" color={colors.text.muted}>
              Je ne sais pas encore
            </ZoneText>
          </TouchableOpacity>
        ) : null}
      </View>

      {goalVdot !== null && goalVdot > vdot ? (
        <ZoneText
          variant="caption"
          color={colors.text.secondary}
          style={styles.goalHint}
        >
          Pour courir {raceLabel(refDistance).toLowerCase()} en {formatGoalTime(goalTimeSeconds, showHours)}, il te faudra un VDOT d&apos;environ {goalVdot}. Ton VDOT actuel : {vdot}. Ton programme est calibré pour t&apos;amener à VDOT {goalVdot} en 12 semaines.
        </ZoneText>
      ) : null}
      {goalVdot !== null && goalVdot <= vdot ? (
        <ZoneText
          variant="caption"
          color={colors.text.secondary}
          style={styles.goalHint}
        >
          Cet objectif est déjà à portée (VDOT cible {goalVdot}, ton VDOT actuel {vdot}). Le programme va te permettre de le confirmer en course.
        </ZoneText>
      ) : null}

      <View style={styles.pacesPreview}>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.refLabel}>
          TES ALLURES CIBLES (VDOT {vdot})
        </ZoneText>
        <PaceRow label="Facile (E)" value={`${formatPace(paces.E_slow)} → ${formatPace(paces.E_fast)}`} />
        <PaceRow label="Marathon (M)" value={formatPace(paces.M)} />
        <PaceRow label="Seuil (T)" value={formatPace(paces.T)} />
        <PaceRow label="VO2max (I)" value={formatPace(paces.I)} />
        <PaceRow label="Vitesse (R)" value={formatPace(paces.R)} />
      </View>
    </View>
  );
}

function PaceRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.paceRow}>
      <ZoneText variant="caption" color={colors.text.secondary}>
        {label}
      </ZoneText>
      <ZoneText style={styles.paceRowValue}>{value}</ZoneText>
    </View>
  );
}

function SmallChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}): React.ReactElement {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.smallChip,
        active
          ? { backgroundColor: colors.accent.gold, borderColor: colors.accent.gold }
          : { backgroundColor: 'transparent', borderColor: colors.border },
      ]}
    >
      <ZoneText
        style={{
          color: active ? colors.bg.primary : colors.text.secondary,
          fontFamily: active ? 'Inter-Bold' : 'Inter-Medium',
          fontSize: 13,
        }}
      >
        {label}
      </ZoneText>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backRow: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  heroRow: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 12 },
  eyebrow: { letterSpacing: 2, fontFamily: 'Inter-Medium' },
  dotsRow: { flexDirection: 'row', marginTop: 8 },
  dot: { width: 30, height: 4, borderRadius: 2, marginRight: 6 },
  body: { flex: 1, paddingHorizontal: 24 },
  scrollContent: { paddingBottom: 32 },
  title: { fontSize: 26, color: colors.text.primary, letterSpacing: 1 },
  subtitle: { marginTop: 8, lineHeight: 20 },
  pacePickerCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 18,
    marginTop: 16,
    alignItems: 'center',
  },
  paceBlocksRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  paceBlock: { alignItems: 'center', marginHorizontal: 4 },
  paceBlockBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paceBlockValue: {
    fontSize: 64,
    color: colors.accent.gold,
    minWidth: 90,
    textAlign: 'center',
    lineHeight: 70,
    marginVertical: 6,
  },
  paceBlockLabel: { letterSpacing: 1, fontSize: 10, marginTop: 6 },
  paceColon: { fontSize: 48, color: colors.text.muted, marginHorizontal: 6, lineHeight: 52 },
  paceBig: {
    fontSize: 48,
    color: colors.accent.gold,
    marginTop: 20,
    lineHeight: 52,
    textAlign: 'center',
  },
  paceBigInput: {
    fontSize: 48,
    lineHeight: 52,
    marginTop: 20,
    color: colors.accent.gold,
    fontFamily: 'BebasNeue',
    textAlign: 'center',
    paddingVertical: 0,
    minWidth: 200,
    alignSelf: 'center',
  },
  vdotLine: { marginTop: 6, fontSize: 12 },
  presetsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 },
  testNivLink: { marginTop: 20, alignItems: 'center' },
  testNivText: { fontSize: 13, fontFamily: 'Inter-Medium' },
  presetChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
    marginBottom: 6,
  },
  presetText: { color: colors.text.secondary, fontSize: 11, fontFamily: 'Inter-Medium' },
  toggleRow: { flexDirection: 'row', marginTop: 16, marginBottom: 12 },
  smallChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  refCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
  refLabel: { letterSpacing: 1, fontSize: 11, marginBottom: 8 },
  distRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  longRunRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  longRunChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 6,
    marginBottom: 6,
  },
  distChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
    marginBottom: 6,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  timePieceWrap: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  timeInput: {
    width: 56,
    color: colors.accent.gold,
    fontFamily: 'BebasNeue',
    fontSize: 38,
    lineHeight: 42,
    textAlign: 'center',
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 4,
  },
  timeSuffix: { marginLeft: 4, fontSize: 12 },
  calibrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  calibrationValue: { color: colors.accent.gold, fontFamily: 'Inter-Bold', fontSize: 18 },
  sectionLabel: { letterSpacing: 1, fontSize: 11, marginTop: 16, marginBottom: 8 },
  sessionsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sessionsCell: {
    flex: 1,
    marginHorizontal: 4,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  raceInput: {
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text.primary,
    fontFamily: 'Inter-Regular',
    fontSize: 14,
  },
  goalClear: { marginLeft: 12, paddingVertical: 8 },
  goalHint: {
    marginTop: 12,
    backgroundColor: `${colors.accent.gold}10`,
    borderRadius: 10,
    padding: 12,
    lineHeight: 18,
  },
  pacesPreview: {
    marginTop: 18,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
  },
  paceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  paceRowValue: { color: colors.accent.gold, fontFamily: 'Inter-Bold', fontSize: 13 },
  error: { marginTop: 12, textAlign: 'center' },
  footer: { padding: 24, paddingTop: 8 },
});
