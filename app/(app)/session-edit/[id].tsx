import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import {
  getExerciseMaxes,
  getSession,
  saveExerciseMax,
  todayDateString,
  updateSessionCompletedSets,
  type CompletedSet,
  type ExerciseMax,
  type TrainingSession,
} from '@/lib/firestore';
import { estimateOneRepMax } from '@/lib/programEngine';
import { getExerciseById } from '@/data/exercises';
import { frenchShortDate } from '@/lib/frenchDate';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';

interface EditSet {
  setNumber: number;
  weight: number;
  reps: number;
  rpe: number | null;
}
interface ExRow {
  exerciseId: string;
  name: string;
  sets: EditSet[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function blockWeekLabel(queueKey?: string): string | null {
  if (!queueKey) return null;
  const m = queueKey.match(/_b(\d+)_w(\d+)_/);
  return m ? `Bloc ${m[1]} · Semaine ${m[2]}` : null;
}

function buildRows(session: TrainingSession): ExRow[] {
  const planned = session.planned_exercises ?? [];
  const completed = session.completed_sets ?? [];
  if (planned.length > 0) {
    return planned.map((ex) => ({
      exerciseId: ex.exercise_id,
      name: getExerciseById(ex.exercise_id)?.name ?? ex.exercise_id,
      sets: ex.sets.map((ps) => {
        const cs = completed.find(
          (c) => c.exercise_id === ex.exercise_id && c.set_number === ps.set_number,
        );
        return {
          setNumber: ps.set_number,
          weight: cs?.actual_weight_kg ?? ps.target_weight_kg ?? 0,
          reps: cs?.actual_reps ?? (parseInt(ps.target_reps, 10) || 0),
          rpe: cs?.rpe ?? null,
        };
      }),
    }));
  }
  // Fallback: rebuild from completed sets grouped by exercise.
  const byEx = new Map<string, CompletedSet[]>();
  for (const c of completed) {
    const arr = byEx.get(c.exercise_id) ?? [];
    arr.push(c);
    byEx.set(c.exercise_id, arr);
  }
  return [...byEx.entries()].map(([exId, cs]) => ({
    exerciseId: exId,
    name: getExerciseById(exId)?.name ?? exId,
    sets: cs
      .slice()
      .sort((a, b) => a.set_number - b.set_number)
      .map((c) => ({
        setNumber: c.set_number,
        weight: c.actual_weight_kg,
        reps: c.actual_reps,
        rpe: c.rpe ?? null,
      })),
  }));
}

export default function SessionEditScreen(): React.ReactElement {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = id ?? '';
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [rows, setRows] = useState<ExRow[]>([]);
  const [maxes, setMaxes] = useState<ExerciseMax[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = auth.currentUser;
      if (!user || !sessionId) {
        setLoading(false);
        return;
      }
      try {
        const [s, m] = await Promise.all([
          getSession(user.uid, sessionId),
          getExerciseMaxes(user.uid).catch(() => [] as ExerciseMax[]),
        ]);
        if (cancelled) return;
        setSession(s);
        setRows(s ? buildRows(s) : []);
        setMaxes(m);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const headerMeta = useMemo(() => {
    if (!session) return '';
    return [blockWeekLabel(session.queue_key), frenchShortDate(session.date)]
      .filter(Boolean)
      .join(' · ');
  }, [session]);

  const updateSet = (exIdx: number, setIdx: number, patch: Partial<EditSet>): void => {
    setRows((prev) =>
      prev.map((ex, i) =>
        i !== exIdx
          ? ex
          : { ...ex, sets: ex.sets.map((s, j) => (j !== setIdx ? s : { ...s, ...patch })) },
      ),
    );
  };

  const onSave = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !session) return;
    setSaving(true);
    try {
      const completed: CompletedSet[] = [];
      let volume = 0;
      for (const ex of rows) {
        for (const s of ex.sets) {
          completed.push({
            exercise_id: ex.exerciseId,
            set_number: s.setNumber,
            actual_reps: s.reps,
            actual_weight_kg: s.weight,
            rpe: s.rpe,
            completed_at: null,
          });
          volume += s.weight * s.reps;
        }
      }
      await updateSessionCompletedSets(user.uid, sessionId, completed, volume);

      // Bump maxes when an edited weight beats the current record.
      for (const ex of rows) {
        let best: EditSet | null = null;
        for (const s of ex.sets) if (s.weight > 0 && (!best || s.weight > best.weight)) best = s;
        if (!best) continue;
        const cur = maxes.find((m) => m.exercise_id === ex.exerciseId);
        if (!cur || best.weight > cur.weight_kg) {
          await saveExerciseMax(user.uid, {
            exercise_id: ex.exerciseId,
            weight_kg: best.weight,
            reps: best.reps,
            estimated_1rm: estimateOneRepMax(best.weight, best.reps),
            date: session.date ?? todayDateString(),
            is_pr: true,
          }).catch(() => undefined);
        }
      }
      router.back();
    } catch {
      setSaving(false);
    }
  };

  return (
    <SafeScreen>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={16} style={styles.backBtn} activeOpacity={0.7}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerMain}>
          <ZoneText variant="heading" style={styles.title}>
            Modifier la séance
          </ZoneText>
          {headerMeta ? (
            <ZoneText variant="caption" color={colors.textSecondary} style={styles.meta}>
              {headerMeta}
            </ZoneText>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ZoneText variant="body" color={colors.textMuted}>
            Chargement…
          </ZoneText>
        </View>
      ) : !session || rows.length === 0 ? (
        <View style={styles.center}>
          <ZoneText variant="body" color={colors.textMuted}>
            Séance introuvable ou sans séries.
          </ZoneText>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {rows.map((ex, exIdx) => (
              <View key={`${ex.exerciseId}-${exIdx}`} style={styles.exBlock}>
                <ZoneText style={styles.exName}>{ex.name.toUpperCase()}</ZoneText>
                {ex.sets.map((s, setIdx) => (
                  <View key={s.setNumber} style={styles.setRow}>
                    <ZoneText style={styles.setLabel}>Série {s.setNumber}</ZoneText>
                    <NumStepper
                      value={s.weight}
                      decimals
                      onChange={(v) => updateSet(exIdx, setIdx, { weight: v })}
                      step={2.5}
                      unit="kg"
                    />
                    <NumStepper
                      value={s.reps}
                      onChange={(v) => updateSet(exIdx, setIdx, { reps: v })}
                      step={1}
                      unit="reps"
                    />
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <TouchableOpacity
              onPress={() => void onSave()}
              activeOpacity={0.85}
              disabled={saving}
              style={[styles.saveBtn, saving ? styles.saveBtnDisabled : null]}
            >
              <ZoneText style={styles.saveText}>
                {saving ? '...' : 'ENREGISTRER LES MODIFICATIONS'}
              </ZoneText>
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeScreen>
  );
}

function NumStepper({
  value,
  onChange,
  step,
  unit,
  decimals = false,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  unit: string;
  decimals?: boolean;
}): React.ReactElement {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        onPress={() => onChange(Math.max(0, round1(value - step)))}
        hitSlop={6}
        activeOpacity={0.7}
        style={styles.stepBtn}
      >
        <ZoneText style={styles.stepSign}>−</ZoneText>
      </TouchableOpacity>
      <ZoneText style={styles.stepValue}>{decimals ? value.toFixed(1) : String(value)}</ZoneText>
      <TouchableOpacity
        onPress={() => onChange(round1(value + step))}
        hitSlop={6}
        activeOpacity={0.7}
        style={styles.stepBtn}
      >
        <ZoneText style={styles.stepSign}>+</ZoneText>
      </TouchableOpacity>
      <ZoneText style={styles.stepUnit}>{unit}</ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 8 },
  backBtn: { padding: 4, marginTop: 2 },
  headerMain: { flex: 1 },
  title: { fontSize: 22 },
  meta: { marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  exBlock: { marginBottom: 20 },
  exName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    letterSpacing: 1,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 10,
  },
  setLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 13, color: colors.textPrimary, flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepSign: { fontFamily: 'Inter_700Bold', fontSize: 15, color: colors.textPrimary, lineHeight: 18 },
  stepValue: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: colors.textPrimary,
    minWidth: 42,
    textAlign: 'center',
  },
  stepUnit: { fontFamily: 'Inter_500Medium', fontSize: 12, color: colors.textMuted, minWidth: 30 },
  footer: { paddingHorizontal: 20, paddingVertical: 14 },
  saveBtn: {
    backgroundColor: colors.scoreGreen,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: colors.background, letterSpacing: 0.5 },
});
