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
  saveRunningProfile,
  type LongRunPreference,
  type RunningRaceDistance,
} from '@/lib/firestore';
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
}

const SECOND_OPTIONS = [0, 10, 20, 30, 40, 50];

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
  });
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
      await saveRunningProfile(user.uid, {
        vdot: calibratedVdot,
        easy_pace_sec_per_km: state.easyPaceSec,
        goal: state.goal ?? 'forme',
        reference_distance: state.hasReference ? state.refDistance : null,
        reference_time_seconds: state.hasReference ? state.refTimeSeconds : null,
        sessions_per_week: state.sessionsPerWeek,
        target_race_date: state.raceDate || null,
        long_run_pref: state.longRunPref,
      });
      router.replace('/(app)/(tabs)/program');
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
  const seconds = paceSec % 60;
  const setMinutes = (m: number): void => {
    const clamped = Math.max(4, Math.min(12, m));
    onChange(clamped * 60 + seconds);
  };
  const setSeconds = (s: number): void => {
    onChange(minutes * 60 + s);
  };
  return (
    <View>
      <ZoneText variant="heading" style={styles.title}>
        QUELLE EST TON ALLURE DE RÉFÉRENCE ?
      </ZoneText>
      <ZoneText variant="body" color={colors.text.secondary} style={styles.subtitle}>
        L’allure où tu peux tenir une conversation complète — pas juste 3 mots.
      </ZoneText>

      <View style={styles.pacePickerCard}>
        <View style={styles.pacePickerRow}>
          <View style={styles.paceColumn}>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.paceColLabel}>
              MIN
            </ZoneText>
            <View style={styles.stepperWrap}>
              <TouchableOpacity
                onPress={() => setMinutes(minutes - 1)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.7}
                style={styles.stepperBtn}
              >
                <Minus size={18} color={colors.accent.gold} />
              </TouchableOpacity>
              <ZoneText variant="heading" style={styles.paceValue}>
                {minutes}
              </ZoneText>
              <TouchableOpacity
                onPress={() => setMinutes(minutes + 1)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                activeOpacity={0.7}
                style={styles.stepperBtn}
              >
                <Plus size={18} color={colors.accent.gold} />
              </TouchableOpacity>
            </View>
          </View>
          <ZoneText variant="heading" style={styles.paceColon}>
            :
          </ZoneText>
          <View style={styles.paceColumn}>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.paceColLabel}>
              SEC
            </ZoneText>
            <View style={styles.secondsRow}>
              {SECOND_OPTIONS.map((s) => {
                const active = s === roundTo10(seconds);
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => setSeconds(s)}
                    activeOpacity={0.8}
                    style={[
                      styles.secondsCell,
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
                        fontSize: 12,
                      }}
                    >
                      {s.toString().padStart(2, '0')}
                    </ZoneText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
        <ZoneText variant="heading" style={styles.paceBig}>
          {formatPace(paceSec)}
        </ZoneText>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.vdotLine}>
          VDOT estimé : {vdot} — Niveau {vdotLevelLabel(vdot).toLowerCase()}
        </ZoneText>
      </View>

      <View style={styles.presetsRow}>
        <PresetChip label="Je débute (>8:00)" onPress={() => onChange(8 * 60 + 30)} />
        <PresetChip label="Inter. (5:30-7:30)" onPress={() => onChange(6 * 60 + 30)} />
        <PresetChip label="Avancé (<5:30)" onPress={() => onChange(5 * 60)} />
      </View>
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
        Optionnel — ça nous permet de calibrer ton VDOT plus précisément.
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
  paces,
  vdot,
}: {
  sessions: number;
  onSessions: (v: number) => void;
  longRunPref: LongRunPreference;
  onLongRunPref: (v: LongRunPreference) => void;
  raceDate: string;
  onRaceDate: (v: string) => void;
  paces: ReturnType<typeof calculateVDOTPaces>;
  vdot: number;
}): React.ReactElement {
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
      <View style={styles.distRow}>
        {(['samedi', 'dimanche', 'flexible'] as LongRunPreference[]).map((opt) => {
          const active = longRunPref === opt;
          return (
            <TouchableOpacity
              key={opt}
              onPress={() => onLongRunPref(opt)}
              activeOpacity={0.8}
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
                {opt === 'samedi' ? 'Samedi' : opt === 'dimanche' ? 'Dimanche' : 'Peu importe'}
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
  pacePickerRow: { flexDirection: 'row', alignItems: 'flex-end' },
  paceColumn: { alignItems: 'center' },
  paceColLabel: { letterSpacing: 1, fontSize: 10, marginBottom: 6 },
  stepperWrap: { flexDirection: 'row', alignItems: 'center' },
  stepperBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paceValue: { fontSize: 36, color: colors.text.primary, minWidth: 60, textAlign: 'center', lineHeight: 40 },
  paceColon: { fontSize: 36, color: colors.text.primary, marginHorizontal: 6, lineHeight: 40 },
  secondsRow: { flexDirection: 'row' },
  secondsCell: {
    width: 36,
    height: 36,
    marginHorizontal: 2,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paceBig: { fontSize: 56, color: colors.accent.gold, marginTop: 16, lineHeight: 60 },
  vdotLine: { marginTop: 6, fontSize: 12 },
  presetsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 16 },
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
