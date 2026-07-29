import React, { useMemo, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Polyline, Text as SvgText } from 'react-native-svg';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';
import { getExerciseById } from '@/data/exercises';
import { parseISODate } from '@/lib/frenchDate';
import type { ExerciseMax, TrainingSession } from '@/lib/firestore';

const INDIGO = '#4F46E5';
const CHART_HEIGHT = 160;
/** Weightlifting lifts offered in the picker (Firestore exercise ids). */
const CHART_EXERCISES = [
  'snatch',
  'clean_and_jerk',
  'front_squat',
  'back_squat_high',
  'snatch_pull',
  'clean_pull',
];

export interface MaxPoint {
  date: Date;
  estimated1rm: number;
}

function sessionDate(s: TrainingSession): Date {
  const ts = s.completed_at as { toDate?: () => Date } | null | undefined;
  if (ts && typeof ts.toDate === 'function') return ts.toDate();
  return parseISODate(s.date);
}

/**
 * Reconstruct the estimated-1RM progression for one lift from the completed
 * session history (Epley: weight × (1 + reps/30)), keeping only new maxima so
 * the curve is a monotonically increasing PR line.
 */
export function buildMaxHistory(sessions: TrainingSession[], exerciseId: string): MaxPoint[] {
  const points = sessions
    .filter((s) => s.sport_key === 'weightlifting' || s.discipline === 'weightlifting')
    .flatMap((s) => {
      const when = sessionDate(s);
      return (s.completed_sets ?? [])
        .filter((set) => set.exercise_id === exerciseId && set.actual_weight_kg > 0 && set.actual_reps > 0)
        .map((set) => ({
          date: when,
          estimated1rm: Math.round(set.actual_weight_kg * (1 + set.actual_reps / 30)),
        }));
    })
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const out: MaxPoint[] = [];
  let lastMax = 0;
  for (const p of points) {
    if (p.estimated1rm > lastMax) {
      out.push(p);
      lastMax = p.estimated1rm;
    }
  }
  return out;
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
function shortDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()] ?? ''}`;
}

export function Max1RMChart({
  sessions,
  maxes,
}: {
  sessions: TrainingSession[];
  maxes: ExerciseMax[];
}): React.ReactElement | null {
  // Current max from maxes/ (a 1-rep max IS a true 1RM) — the fallback when the
  // session history has no completed sets yet.
  const maxOf = (id: string): number => {
    const m = maxes.find((x) => x.exercise_id === id);
    return m ? (m.reps === 1 ? m.weight_kg : m.estimated_1rm) : 0;
  };
  // Offer lifts with a PR history OR at least a stored current max.
  const available = useMemo(
    () =>
      CHART_EXERCISES.filter(
        (id) =>
          buildMaxHistory(sessions, id).length > 0 ||
          (maxes.find((x) => x.exercise_id === id)?.estimated_1rm ?? 0) > 0,
      ),
    [sessions, maxes],
  );
  const [selected, setSelected] = useState<string>('');
  const activeId = available.includes(selected) ? selected : available[0] ?? '';
  const history = useMemo(
    () => (activeId ? buildMaxHistory(sessions, activeId) : []),
    [sessions, activeId],
  );

  if (available.length === 0) return null;

  const width = Dimensions.get('window').width - 64; // scroll (16) + card (16) paddings
  const chartW = Math.max(220, width);
  const pad = 26;
  const innerW = chartW - pad * 2;
  const innerH = CHART_HEIGHT - pad * 2;

  const current = history.length > 0 ? history[history.length - 1].estimated1rm : maxOf(activeId);
  const first = history.length > 0 ? history[0].estimated1rm : current;
  const deltaKg = current - first;
  const deltaPct = first > 0 ? Math.round((deltaKg / first) * 1000) / 10 : 0;

  const ests = history.map((p) => p.estimated1rm);
  const minEst = Math.min(...ests);
  const maxEst = Math.max(...ests);
  const span = Math.max(1, maxEst - minEst);
  const tMin = history.length > 0 ? history[0].date.getTime() : 0;
  const tMax = history.length > 0 ? history[history.length - 1].date.getTime() : 1;
  const tSpan = Math.max(1, tMax - tMin);
  const xOf = (d: Date): number => pad + ((d.getTime() - tMin) / tSpan) * innerW;
  const yOf = (est: number): number => pad + (1 - (est - minEst) / span) * innerH;
  const polyPoints = history.map((p) => `${xOf(p.date)},${yOf(p.estimated1rm)}`).join(' ');

  const activeName = getExerciseById(activeId)?.name ?? activeId;

  return (
    <View style={styles.card}>
      <ZoneText style={styles.sectionTitle}>Évolution des 1RM</ZoneText>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pills}
      >
        {CHART_EXERCISES.map((id) => {
          const name = getExerciseById(id)?.name ?? id;
          const isSel = id === activeId;
          const hasData = available.includes(id);
          return (
            <TouchableOpacity
              key={id}
              onPress={() => {
                if (hasData) setSelected(id);
              }}
              activeOpacity={hasData ? 0.7 : 1}
              style={[styles.pill, isSel ? styles.pillActive : null, !hasData ? styles.pillDisabled : null]}
            >
              <ZoneText
                variant="caption"
                color={isSel ? '#FFFFFF' : colors.textMuted}
                style={styles.pillText}
              >
                {name}
              </ZoneText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.chartBox}>
        <ZoneText variant="label" color={colors.textPrimary}>
          {activeName}
        </ZoneText>

        {history.length >= 2 ? (
          <>
            <Svg width={chartW} height={CHART_HEIGHT} style={styles.svg}>
              <Polyline points={polyPoints} fill="none" stroke={INDIGO} strokeWidth={2} />
              {history.map((p, i) => (
                <Circle key={`c${i}`} cx={xOf(p.date)} cy={yOf(p.estimated1rm)} r={3.5} fill={INDIGO} />
              ))}
              {history.map((p, i) => (
                <SvgText
                  key={`t${i}`}
                  x={xOf(p.date)}
                  y={yOf(p.estimated1rm) - 8}
                  fontSize={9}
                  fill={colors.textSecondary}
                  textAnchor="middle"
                >
                  {p.estimated1rm}
                </SvgText>
              ))}
            </Svg>
            <View style={styles.axisRow}>
              <ZoneText variant="caption" color={colors.textMuted}>
                {shortDate(history[0].date)}
              </ZoneText>
              <ZoneText variant="caption" color={colors.textMuted}>
                {shortDate(history[history.length - 1].date)}
              </ZoneText>
            </View>
          </>
        ) : (
          <ZoneText variant="caption" color={colors.textMuted} style={styles.singlePoint}>
            {current} kg — encore un PR et la courbe apparaît.
          </ZoneText>
        )}

        <View style={styles.footer}>
          <ZoneText style={styles.currentValue}>{current} kg</ZoneText>
          {deltaKg !== 0 ? (
            <ZoneText
              variant="label"
              color={deltaKg > 0 ? colors.scoreGreen : colors.danger}
              style={styles.delta}
            >
              {deltaKg > 0 ? '+' : ''}
              {deltaKg} kg · {deltaKg > 0 ? '+' : ''}
              {deltaPct}%
            </ZoneText>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 12,
  },
  pills: { gap: 8, paddingBottom: 4 },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: { backgroundColor: INDIGO, borderColor: INDIGO },
  pillDisabled: { opacity: 0.4 },
  pillText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  chartBox: { marginTop: 14 },
  svg: { marginTop: 8, alignSelf: 'center' },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  singlePoint: { marginTop: 12 },
  footer: { marginTop: 12, flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  currentValue: { fontFamily: 'Inter_700Bold', fontSize: 28, color: colors.textPrimary },
  delta: { fontFamily: 'Inter_700Bold' },
});
