import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Minus, Plus } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import {
  getRunningProfile,
  saveRunningProfile,
  todayDateString,
  type RunningProfile,
  type RunningRaceDistance,
} from '@/lib/firestore';
import {
  calculateVDOTPaces,
  estimateVDOT,
  formatPace,
  raceLabel,
  raceMeters,
  vdotLevelLabel,
} from '@/lib/runningEngine';
import { planPhases, weeksUntilRace } from '@/lib/programmePhases';
import { resetSportWeek } from '@/lib/weekTracking';
import { frenchLongDate } from '@/lib/frenchDate';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { Button } from '@/components/ui/Button';
import { ZoneText } from '@/components/ui/ZoneText';
import { MonthCalendar } from '@/components/MonthCalendar';

type DistanceChoice = RunningRaceDistance | 'other';

const DISTANCES: { id: DistanceChoice; label: string }[] = [
  { id: '5km', label: '5 km' },
  { id: '10km', label: '10 km' },
  { id: 'semi', label: 'Semi' },
  { id: 'marathon', label: 'Marathon' },
  { id: 'other', label: 'Autre' },
];

function secondsToParts(total: number): [number, number, number] {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s];
}

function formatHHMMSS(total: number, withHours: boolean): string {
  const [h, m, s] = secondsToParts(total);
  if (withHours) return `${h}h${m.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface PaceLine {
  label: string;
  value: string;
}

function ratePace(distance: RunningRaceDistance | null, secondsPerKm: number): PaceLine[] {
  if (!distance || secondsPerKm <= 0) return [];
  const semiSec = secondsPerKm * 21.097;
  const tenkSec = secondsPerKm * 10;
  const fivekSec = secondsPerKm * 5;
  return [
    { label: 'Semi estimé', value: formatHHMMSS(semiSec, true) },
    { label: '10 km estimé', value: formatHHMMSS(tenkSec, false) },
    { label: '5 km estimé', value: formatHHMMSS(fivekSec, false) },
  ];
}

export default function RaceGoalScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string }>();

  const [loaded, setLoaded] = useState<boolean>(false);
  const [profile, setProfile] = useState<RunningProfile | null>(null);

  const [distance, setDistance] = useState<DistanceChoice>('10km');
  const [raceDate, setRaceDate] = useState<string>('');
  const [goalSeconds, setGoalSeconds] = useState<number>(0);
  const [currentVdot, setCurrentVdot] = useState<number>(40);
  const [calendarOpen, setCalendarOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const prefilledVdot = useRef<boolean>(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const existing = await getRunningProfile(user.uid);
        if (cancelled) return;
        if (existing) {
          setProfile(existing);
          // Pre-fill from saved goal fields first, then fall back to the
          // legacy reference fields so an athlete who configured a goal
          // before this screen existed finds their data here too.
          const savedDistance = (existing.race_distance ??
            existing.reference_distance ??
            null) as RunningRaceDistance | null;
          if (savedDistance) setDistance(savedDistance);
          setRaceDate(existing.target_race_date ?? '');
          setGoalSeconds(existing.goal_time_seconds ?? 0);
          if (typeof existing.vdot === 'number' && existing.vdot > 0) {
            setCurrentVdot(existing.vdot);
            prefilledVdot.current = true;
          }
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const numericDistance = (distance === 'other' ? null : distance) as RunningRaceDistance | null;
  const showHours = numericDistance === 'semi' || numericDistance === 'marathon';

  const weeksAvailable = useMemo(() => weeksUntilRace(raceDate), [raceDate]);
  const phasePlan = useMemo(
    () => (weeksAvailable !== null ? planPhases(weeksAvailable) : null),
    [weeksAvailable],
  );

  const targetVdot = useMemo(() => {
    if (!numericDistance || goalSeconds <= 0) return null;
    return estimateVDOT(raceMeters(numericDistance), goalSeconds);
  }, [numericDistance, goalSeconds]);

  const paces = useMemo(() => calculateVDOTPaces(currentVdot), [currentVdot]);

  const vdotGap = targetVdot !== null ? targetVdot - currentVdot : null;
  const goalRating: { color: string; message: string } | null = useMemo(() => {
    if (vdotGap === null || targetVdot === null) return null;
    if (vdotGap > 15) {
      return { color: colors.orbe.amber, message: 'Objectif très ambitieux pour ce délai' };
    }
    if (vdotGap > 8) {
      return { color: colors.accent.gold, message: 'Objectif ambitieux mais atteignable' };
    }
    return { color: colors.orbe.green, message: 'Objectif réaliste' };
  }, [vdotGap, targetVdot]);

  const timelineRating: { color: string; message: string } | null = useMemo(() => {
    if (weeksAvailable === null) return null;
    if (weeksAvailable < 8) {
      return { color: colors.orbe.amber, message: 'Peu de temps — objectif ajusté' };
    }
    if (weeksAvailable <= 16) {
      return { color: colors.accent.gold, message: 'Bon timing' };
    }
    if (weeksAvailable <= 32) {
      return { color: colors.orbe.green, message: 'Excellent — programme complet' };
    }
    return { color: colors.orbe.green, message: 'Largement le temps de te préparer' };
  }, [weeksAvailable]);

  const [gh, gm, gs] = secondsToParts(goalSeconds);
  const setGoal = (h: number, m: number, s: number): void => {
    const total = Math.max(0, h * 3600 + m * 60 + s);
    setGoalSeconds(total);
  };

  const canSave = numericDistance !== null && raceDate.length > 0;

  const onSave = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user) {
      setError('Session expirée.');
      return;
    }
    if (!numericDistance || !raceDate) {
      setError('Choisis une distance et une date.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const goalVdot = goalSeconds > 0 ? estimateVDOT(raceMeters(numericDistance), goalSeconds) : null;
      const weeks = weeksUntilRace(raceDate) ?? 0;
      const totalWeeks = planPhases(weeks).totalWeeks;
      const next: Omit<RunningProfile, 'updated_at'> = {
        vdot: currentVdot,
        easy_pace_sec_per_km: profile?.easy_pace_sec_per_km ?? paces.E_slow,
        goal: profile?.goal ?? 'forme',
        reference_distance: profile?.reference_distance ?? numericDistance,
        reference_time_seconds: profile?.reference_time_seconds ?? null,
        sessions_per_week: profile?.sessions_per_week ?? 3,
        target_race_date: raceDate,
        long_run_pref: profile?.long_run_pref ?? 'dimanche',
        goal_time_seconds: goalSeconds > 0 ? goalSeconds : null,
        race_distance: numericDistance,
        goal_vdot: goalVdot,
        programme_weeks: totalWeeks,
        programme_start_date: profile?.programme_start_date ?? todayDateString(),
        ef_pace_adjustment: profile?.ef_pace_adjustment ?? null,
      };
      await saveRunningProfile(user.uid, next);
      // Changing the goal restructures the programme phases, so the queue
      // must restart from the new week 1 — otherwise stale completed/skipped
      // flags carry over from the previous goal.
      await resetSportWeek(user.uid, 'running').catch(() => undefined);
      if (params.returnTo) {
        router.replace(params.returnTo as never);
      } else {
        router.back();
      }
    } catch {
      setError('Enregistrement impossible. Réessaie.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeScreen>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
        >
          <ArrowLeft size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <ZoneText variant="caption" color={colors.accent.gold} style={styles.eyebrow}>
          MON OBJECTIF DE COURSE
        </ZoneText>
        <View style={{ width: 24 }} />
      </View>

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 1. DISTANCE */}
          <ZoneText variant="caption" color={colors.text.muted} style={styles.sectionLabel}>
            DISTANCE DE COMPÉTITION
          </ZoneText>
          <View style={styles.chipRow}>
            {DISTANCES.map((d) => {
              const active = distance === d.id;
              return (
                <TouchableOpacity
                  key={d.id}
                  onPress={() => setDistance(d.id)}
                  activeOpacity={0.85}
                  style={[
                    styles.chip,
                    active
                      ? { backgroundColor: colors.accent.gold, borderColor: colors.accent.gold }
                      : { backgroundColor: 'transparent', borderColor: colors.border },
                  ]}
                >
                  <ZoneText
                    style={{
                      color: active ? colors.bg.primary : colors.text.secondary,
                      fontFamily: 'Inter-Bold',
                      fontSize: 13,
                    }}
                  >
                    {d.label}
                  </ZoneText>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 2. DATE */}
          <ZoneText variant="caption" color={colors.text.muted} style={styles.sectionLabel}>
            DATE DE COMPÉTITION
          </ZoneText>
          <TouchableOpacity
            onPress={() => setCalendarOpen((o) => !o)}
            activeOpacity={0.8}
            style={styles.dateButton}
          >
            <ZoneText variant="titleSm" color={raceDate ? colors.text.primary : colors.text.muted}>
              {raceDate ? frenchLongDate(raceDate) : 'Choisir une date'}
            </ZoneText>
          </TouchableOpacity>
          {calendarOpen ? (
            <View style={{ marginTop: 8 }}>
              <MonthCalendar
                value={raceDate}
                onChange={(iso) => {
                  setRaceDate(iso);
                  setCalendarOpen(false);
                }}
              />
            </View>
          ) : null}
          {weeksAvailable !== null ? (
            <View
              style={[
                styles.hintBox,
                { borderColor: timelineRating?.color ?? colors.border },
              ]}
            >
              <ZoneText variant="label" color={colors.text.primary}>
                Ta course est dans {weeksAvailable} semaine{weeksAvailable > 1 ? 's' : ''}
              </ZoneText>
              {timelineRating ? (
                <ZoneText
                  variant="caption"
                  color={timelineRating.color}
                  style={styles.hintCaption}
                >
                  {timelineRating.message}
                </ZoneText>
              ) : null}
              {phasePlan ? (
                <ZoneText variant="caption" color={colors.text.muted} style={styles.hintBody}>
                  {phasePlan.summary}
                </ZoneText>
              ) : null}
            </View>
          ) : null}

          {/* 3. OBJECTIF DE TEMPS */}
          <ZoneText variant="caption" color={colors.text.muted} style={styles.sectionLabel}>
            OBJECTIF DE TEMPS{numericDistance ? ` · ${raceLabel(numericDistance)}` : ''}
          </ZoneText>
          <View style={styles.timeRow}>
            {showHours ? (
              <TimePiece value={gh} onChange={(h) => setGoal(h, gm, gs)} max={9} suffix="h" />
            ) : null}
            <TimePiece value={gm} onChange={(m) => setGoal(gh, m, gs)} max={59} suffix="min" />
            <TimePiece value={gs} onChange={(s) => setGoal(gh, gm, s)} max={59} suffix="sec" />
            {goalSeconds > 0 ? (
              <TouchableOpacity
                onPress={() => setGoalSeconds(0)}
                activeOpacity={0.7}
                hitSlop={8}
                style={styles.goalClear}
              >
                <ZoneText variant="caption" color={colors.text.muted}>
                  Effacer
                </ZoneText>
              </TouchableOpacity>
            ) : null}
          </View>
          {targetVdot !== null ? (
            <View
              style={[
                styles.hintBox,
                { borderColor: goalRating?.color ?? colors.border },
              ]}
            >
              <View style={styles.vdotRow}>
                <ZoneText variant="label" color={colors.text.primary}>
                  VDOT requis :
                </ZoneText>
                <ZoneText style={styles.vdotValue}>{targetVdot}</ZoneText>
              </View>
              <View style={styles.vdotRow}>
                <ZoneText variant="caption" color={colors.text.muted}>
                  Ton VDOT actuel :
                </ZoneText>
                <ZoneText variant="caption" color={colors.text.secondary}>
                  {currentVdot}
                </ZoneText>
              </View>
              {goalRating ? (
                <ZoneText
                  variant="caption"
                  color={goalRating.color}
                  style={styles.hintCaption}
                >
                  {goalRating.message}
                </ZoneText>
              ) : null}
            </View>
          ) : null}

          {/* 4. VDOT ACTUEL */}
          <ZoneText variant="caption" color={colors.text.muted} style={styles.sectionLabel}>
            MON NIVEAU ACTUEL
          </ZoneText>
          <View style={styles.vdotPickerCard}>
            <View style={styles.vdotPickerRow}>
              <TouchableOpacity
                onPress={() => setCurrentVdot((v) => Math.max(25, v - 1))}
                activeOpacity={0.7}
                hitSlop={12}
                style={styles.vdotStep}
              >
                <Minus size={20} color={colors.accent.gold} />
              </TouchableOpacity>
              <View style={styles.vdotPickerCenter}>
                <ZoneText style={styles.vdotPickerValue}>{currentVdot}</ZoneText>
                <ZoneText variant="caption" color={colors.text.muted} style={styles.vdotPickerLevel}>
                  Niveau {vdotLevelLabel(currentVdot).toLowerCase()}
                </ZoneText>
              </View>
              <TouchableOpacity
                onPress={() => setCurrentVdot((v) => Math.min(75, v + 1))}
                activeOpacity={0.7}
                hitSlop={12}
                style={styles.vdotStep}
              >
                <Plus size={20} color={colors.accent.gold} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => router.push('/(app)/running-test')}
              activeOpacity={0.7}
              style={styles.testLink}
            >
              <ZoneText variant="caption" color={colors.accent.gold}>
                Utiliser un test de niveau →
              </ZoneText>
            </TouchableOpacity>
            <View style={styles.paceList}>
              <PaceLineRow label="Allure facile" value={`${formatPace(paces.E_slow)} → ${formatPace(paces.E_fast)}`} />
              {ratePace(numericDistance ?? '10km', paces.M).map((line) => (
                <PaceLineRow key={line.label} label={line.label} value={line.value} />
              ))}
            </View>
          </View>

          {error ? (
            <ZoneText variant="caption" color={colors.danger} style={styles.error}>
              {error}
            </ZoneText>
          ) : null}

          {!loaded ? (
            <ZoneText variant="caption" color={colors.text.muted} style={styles.loading}>
              Chargement...
            </ZoneText>
          ) : null}
        </ScrollView>
      </TouchableWithoutFeedback>

      <View style={styles.footer}>
        <Button
          title="Enregistrer mon objectif"
          loading={saving}
          disabled={!canSave}
          onPress={onSave}
        />
      </View>
    </SafeScreen>
  );
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
    <View style={styles.timePiece}>
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

function PaceLineRow({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.paceRow}>
      <ZoneText variant="caption" color={colors.text.secondary}>
        {label}
      </ZoneText>
      <ZoneText style={styles.paceValue}>{value}</ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  eyebrow: { letterSpacing: 2, fontFamily: 'Inter-Bold' },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 },
  sectionLabel: {
    letterSpacing: 1,
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    marginTop: 24,
    marginBottom: 10,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  dateButton: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  hintBox: {
    marginTop: 10,
    borderWidth: 1,
    backgroundColor: colors.bg.card,
    borderRadius: 14,
    padding: 12,
  },
  hintCaption: { marginTop: 6, fontFamily: 'Inter-Bold' },
  hintBody: { marginTop: 6, lineHeight: 16 },
  timeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  timePiece: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
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
  goalClear: { marginLeft: 8, paddingVertical: 8, paddingHorizontal: 6 },
  vdotRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  vdotValue: { color: colors.accent.gold, fontFamily: 'Inter-Bold', fontSize: 22 },
  vdotPickerCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
  },
  vdotPickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  vdotStep: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vdotPickerCenter: { alignItems: 'center', flex: 1 },
  vdotPickerValue: {
    fontSize: 52,
    fontFamily: 'BebasNeue',
    color: colors.accent.gold,
    lineHeight: 58,
  },
  vdotPickerLevel: { marginTop: 4 },
  testLink: { alignSelf: 'center', marginTop: 10, paddingVertical: 6 },
  paceList: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  paceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  paceValue: { color: colors.accent.gold, fontFamily: 'Inter-Bold', fontSize: 13 },
  error: { marginTop: 12, textAlign: 'center' },
  loading: { marginTop: 12, textAlign: 'center' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: colors.bg.primary,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
});
