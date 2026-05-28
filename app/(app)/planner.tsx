import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import {
  getHyroxProfile,
  getMuscleProfile,
  getRunningProfile,
  getUserProgram,
  getUserSchedule,
  saveUserSchedule,
  type ScheduleAssignment,
  type ScheduleSport,
  type Weekday,
} from '@/lib/firestore';
import {
  autoAssignSchedule,
  sportColor,
  type ActiveSport,
} from '@/lib/multiSportScheduler';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';

const DAYS: { key: Weekday; letter: string; label: string }[] = [
  { key: 'lundi', letter: 'L', label: 'Lundi' },
  { key: 'mardi', letter: 'M', label: 'Mardi' },
  { key: 'mercredi', letter: 'M', label: 'Mercredi' },
  { key: 'jeudi', letter: 'J', label: 'Jeudi' },
  { key: 'vendredi', letter: 'V', label: 'Vendredi' },
  { key: 'samedi', letter: 'S', label: 'Samedi' },
  { key: 'dimanche', letter: 'D', label: 'Dimanche' },
];

const SPORT_LABELS: Record<ScheduleSport, string> = {
  weightlifting: 'Haltérophilie',
  running: 'Course',
  musculation: 'Musculation',
  hyrox: 'Hyrox',
};

interface PlacedAssignment extends ScheduleAssignment {
  id: string;
}

type Step = 0 | 1 | 2 | 3;

function dayLabel(key: Weekday): string {
  return DAYS.find((d) => d.key === key)?.label ?? key;
}

function normalizeSlots(items: PlacedAssignment[], weekDays: Weekday[]): PlacedAssignment[] {
  const out: PlacedAssignment[] = [];
  for (const day of weekDays) {
    const inDay = items.filter((a) => a.day === day);
    inDay.forEach((a, i) => out.push({ ...a, slot: i === 0 ? 'matin' : 'apresmidi' }));
  }
  // Keep any assignment whose day is no longer selected on its first valid day.
  for (const a of items) {
    if (!weekDays.includes(a.day) && !out.find((o) => o.id === a.id)) {
      out.push(a);
    }
  }
  return out;
}

export default function PlannerScreen(): React.ReactElement {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);
  const [daysPerWeek, setDaysPerWeek] = useState<number>(4);
  const [weekDays, setWeekDays] = useState<Weekday[]>([]);
  const [doubleDays, setDoubleDays] = useState<Weekday[]>([]);
  const [active, setActive] = useState<ActiveSport[]>([]);
  const [assignments, setAssignments] = useState<PlacedAssignment[]>([]);
  const [saving, setSaving] = useState<boolean>(false);

  // Absolute Y range per selected day row, for drag-drop hit testing.
  const containerTop = useRef<number>(0);
  const rowRel = useRef<Record<string, { y: number; height: number }>>({});

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const [program, running, muscle, hyrox, existing] = await Promise.all([
        getUserProgram(user.uid).catch(() => null),
        getRunningProfile(user.uid).catch(() => null),
        getMuscleProfile(user.uid).catch(() => null),
        getHyroxProfile(user.uid).catch(() => null),
        getUserSchedule(user.uid).catch(() => null),
      ]);
      if (cancelled) return;
      const sports: ActiveSport[] = [];
      if (program) sports.push({ sport: 'weightlifting', sessionsPerWeek: program.sessions_per_week });
      if (running) sports.push({ sport: 'running', sessionsPerWeek: running.sessions_per_week });
      if (muscle) sports.push({ sport: 'musculation', sessionsPerWeek: muscle.sessions_per_week });
      if (hyrox) sports.push({ sport: 'hyrox', sessionsPerWeek: hyrox.sessions_per_week });
      setActive(sports);
      if (existing && existing.week_days.length > 0) {
        setWeekDays(existing.week_days);
        setDoubleDays(existing.double_days);
        setDaysPerWeek(existing.week_days.length);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleDay = (day: Weekday): void => {
    setWeekDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const toggleDouble = (day: Weekday): void => {
    setDoubleDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const orderedWeekDays = DAYS.map((d) => d.key).filter((k) => weekDays.includes(k));

  const goToAssign = (): void => {
    const generated = autoAssignSchedule(active, orderedWeekDays, doubleDays);
    const placed = generated.map((a, i) => ({ ...a, id: `a${i}` }));
    setAssignments(normalizeSlots(placed, orderedWeekDays));
    setStep(3);
  };

  const moveAssignment = (id: string, absoluteY: number): void => {
    let targetDay: Weekday | null = null;
    for (const day of orderedWeekDays) {
      const rel = rowRel.current[day];
      if (!rel) continue;
      const top = containerTop.current + rel.y;
      if (absoluteY >= top && absoluteY <= top + rel.height) {
        targetDay = day;
        break;
      }
    }
    if (!targetDay) return;
    setAssignments((prev) => {
      const moved = prev.map((a) => (a.id === id ? { ...a, day: targetDay as Weekday } : a));
      return normalizeSlots(moved, orderedWeekDays);
    });
  };

  const onSave = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    setSaving(true);
    try {
      await saveUserSchedule(user.uid, {
        week_days: orderedWeekDays,
        double_days: doubleDays.filter((d) => orderedWeekDays.includes(d)),
        assignments: assignments.map(({ id: _id, ...rest }) => rest),
      });
      router.back();
    } catch {
      setSaving(false);
    }
  };

  return (
    <SafeScreen>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={16} style={styles.closeBtn}>
          <X size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <ZoneText variant="caption" color={colors.text.muted}>
          MON PLANNING
        </ZoneText>
      </View>

      <View style={styles.body}>
        {step === 0 ? (
          <StepFrame title="Combien de jours par semaine t’entraînes-tu ?">
            <View style={styles.chipsRow}>
              {[2, 3, 4, 5, 6].map((n) => {
                const activeChip = daysPerWeek === n;
                return (
                  <TouchableOpacity
                    key={n}
                    onPress={() => setDaysPerWeek(n)}
                    activeOpacity={0.8}
                    style={[styles.numChip, activeChip ? styles.chipActive : styles.chipIdle]}
                  >
                    <ZoneText
                      style={{
                        color: activeChip ? colors.bg.primary : colors.text.secondary,
                        fontFamily: 'Inter-Bold',
                        fontSize: 18,
                      }}
                    >
                      {n}
                    </ZoneText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </StepFrame>
        ) : null}

        {step === 1 ? (
          <StepFrame
            title="Quels jours ?"
            subtitle={`Sélectionne ${daysPerWeek} jours (${weekDays.length}/${daysPerWeek})`}
          >
            <View style={styles.chipsRow}>
              {DAYS.map((d) => {
                const activeChip = weekDays.includes(d.key);
                return (
                  <TouchableOpacity
                    key={d.key}
                    onPress={() => toggleDay(d.key)}
                    activeOpacity={0.8}
                    style={[styles.dayChip, activeChip ? styles.chipActive : styles.chipIdle]}
                  >
                    <ZoneText
                      style={{
                        color: activeChip ? colors.bg.primary : colors.text.secondary,
                        fontFamily: 'Inter-Bold',
                        fontSize: 15,
                      }}
                    >
                      {d.letter}
                    </ZoneText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </StepFrame>
        ) : null}

        {step === 2 ? (
          <StepFrame
            title="As-tu des jours avec 2 séances ?"
            subtitle="Matin + après-midi. Optionnel."
          >
            <View style={styles.doubleList}>
              {orderedWeekDays.map((day) => {
                const activeChip = doubleDays.includes(day);
                return (
                  <TouchableOpacity
                    key={day}
                    onPress={() => toggleDouble(day)}
                    activeOpacity={0.8}
                    style={[styles.doubleRow, activeChip ? styles.doubleRowActive : null]}
                  >
                    <ZoneText variant="label" color={colors.text.primary}>
                      {dayLabel(day)}
                    </ZoneText>
                    <ZoneText
                      variant="caption"
                      color={activeChip ? colors.accent.gold : colors.text.muted}
                    >
                      {activeChip ? 'Matin + après-midi' : 'Une séance'}
                    </ZoneText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </StepFrame>
        ) : null}

        {step === 3 ? (
          <StepFrame title="Ton planning" subtitle="Glisse une séance pour la déplacer">
            <View
              style={styles.rowsWrap}
              onLayout={(e: LayoutChangeEvent) => {
                e.currentTarget.measureInWindow((_x, y) => {
                  containerTop.current = y;
                });
              }}
            >
              {orderedWeekDays.map((day) => {
                const dayAssignments = assignments.filter((a) => a.day === day);
                return (
                  <View
                    key={day}
                    style={styles.dayRow}
                    onLayout={(e: LayoutChangeEvent) => {
                      rowRel.current[day] = {
                        y: e.nativeEvent.layout.y,
                        height: e.nativeEvent.layout.height,
                      };
                    }}
                  >
                    <ZoneText variant="caption" color={colors.text.muted} style={styles.dayRowLabel}>
                      {dayLabel(day).slice(0, 3).toUpperCase()}
                    </ZoneText>
                    <View style={styles.pillsWrap}>
                      {dayAssignments.length === 0 ? (
                        <View style={styles.restDot} />
                      ) : (
                        dayAssignments.map((a) => (
                          <DraggablePill key={a.id} assignment={a} onDrop={moveAssignment} />
                        ))
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </StepFrame>
        ) : null}
      </View>

      <View style={styles.footer}>
        {step > 0 ? (
          <TouchableOpacity onPress={() => setStep((s) => (s - 1) as Step)} style={styles.backLink}>
            <ZoneText variant="caption" color={colors.text.muted}>
              Retour
            </ZoneText>
          </TouchableOpacity>
        ) : null}
        {step === 0 ? (
          <Button title="Continuer" onPress={() => setStep(1)} />
        ) : null}
        {step === 1 ? (
          <Button
            title="Continuer"
            disabled={weekDays.length !== daysPerWeek}
            onPress={() => setStep(2)}
          />
        ) : null}
        {step === 2 ? <Button title="Générer mon planning" onPress={goToAssign} /> : null}
        {step === 3 ? (
          <Button title={saving ? 'Enregistrement…' : 'Enregistrer'} disabled={saving} onPress={onSave} />
        ) : null}
      </View>
    </SafeScreen>
  );
}

function StepFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <View style={styles.stepFrame}>
      <ZoneText variant="heading" style={styles.stepTitle}>
        {title}
      </ZoneText>
      {subtitle ? (
        <ZoneText variant="caption" color={colors.text.muted} style={styles.stepSubtitle}>
          {subtitle}
        </ZoneText>
      ) : null}
      <View style={styles.stepContent}>{children}</View>
    </View>
  );
}

function DraggablePill({
  assignment,
  onDrop,
}: {
  assignment: PlacedAssignment;
  onDrop: (id: string, absoluteY: number) => void;
}): React.ReactElement {
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const dragging = useSharedValue(0);

  const pan = Gesture.Pan()
    .onStart(() => {
      dragging.value = 1;
    })
    .onUpdate((e) => {
      tx.value = e.translationX;
      ty.value = e.translationY;
    })
    .onEnd((e) => {
      runOnJS(onDrop)(assignment.id, e.absoluteY);
      tx.value = withSpring(0);
      ty.value = withSpring(0);
      dragging.value = 0;
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: dragging.value ? 1.06 : 1 }],
    zIndex: dragging.value ? 20 : 1,
    opacity: dragging.value ? 0.95 : 1,
  }));

  const color = sportColor(assignment.sport);
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.pill, { backgroundColor: color }, animStyle]}>
        <ZoneText style={styles.pillSlot}>{assignment.slot === 'matin' ? '🌅' : '🌇'}</ZoneText>
        <ZoneText style={styles.pillText} numberOfLines={1}>
          {SPORT_LABELS[assignment.sport]}
        </ZoneText>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  headerRow: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  body: { flex: 1, paddingHorizontal: 24 },
  stepFrame: { flex: 1, paddingTop: 12 },
  stepTitle: { fontSize: 24, color: colors.text.primary, lineHeight: 30 },
  stepSubtitle: { marginTop: 8 },
  stepContent: { marginTop: 24 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  numChip: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dayChip: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: colors.accent.gold, borderColor: colors.accent.gold },
  chipIdle: { backgroundColor: 'transparent', borderColor: colors.border },
  doubleList: { gap: 8 },
  doubleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg.card,
  },
  doubleRowActive: { borderColor: colors.accent.gold },
  rowsWrap: { gap: 8 },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg.card,
  },
  dayRowLabel: { width: 42, fontSize: 11, letterSpacing: 1 },
  pillsWrap: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 8 },
  restDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border, marginVertical: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  pillSlot: { fontSize: 11 },
  pillText: { color: colors.bg.primary, fontFamily: 'Inter-Bold', fontSize: 11, maxWidth: 110 },
  footer: { padding: 24, paddingTop: 8 },
  backLink: { alignSelf: 'center', paddingVertical: 8, marginBottom: 4 },
});
