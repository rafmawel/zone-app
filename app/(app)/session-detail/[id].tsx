import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import {
  getExerciseMaxes,
  getSessionById,
  type CompletedSet,
  type ExerciseMax,
  type SessionExercise,
  type TrainingSession,
} from '@/lib/firestore';
import { estimateOneRepMax } from '@/lib/programEngine';
import { getZoneLevel } from '@/lib/zoneScore';
import { getExerciseById } from '@/data/exercises';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { frenchLongDate } from '@/lib/frenchDate';

interface ExerciseGroup {
  exercise_id: string;
  name: string;
  planned: SessionExercise | null;
  sets: CompletedSet[];
}

function groupSets(
  planned: SessionExercise[],
  completed: CompletedSet[],
): ExerciseGroup[] {
  const order: string[] = [];
  const byId = new Map<string, ExerciseGroup>();

  for (const p of planned) {
    if (!byId.has(p.exercise_id)) {
      const meta = getExerciseById(p.exercise_id);
      byId.set(p.exercise_id, {
        exercise_id: p.exercise_id,
        name: meta?.name ?? p.exercise_id,
        planned: p,
        sets: [],
      });
      order.push(p.exercise_id);
    }
  }
  for (const c of completed) {
    let group = byId.get(c.exercise_id);
    if (!group) {
      const meta = getExerciseById(c.exercise_id);
      group = {
        exercise_id: c.exercise_id,
        name: meta?.name ?? c.exercise_id,
        planned: null,
        sets: [],
      };
      byId.set(c.exercise_id, group);
      order.push(c.exercise_id);
    }
    group.sets.push(c);
  }
  for (const id of order) {
    const g = byId.get(id);
    if (g) g.sets.sort((a, b) => a.set_number - b.set_number);
  }
  return order.map((id) => byId.get(id) as ExerciseGroup);
}

export default function SessionDetailScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const sessionId = params.id ?? '';
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [maxes, setMaxes] = useState<ExerciseMax[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      const user = auth.currentUser;
      if (!user || !sessionId) {
        setError('Séance introuvable.');
        setLoading(false);
        return;
      }
      try {
        const [s, m] = await Promise.all([
          getSessionById(user.uid, sessionId),
          getExerciseMaxes(user.uid),
        ]);
        if (cancelled) return;
        setSession(s);
        setMaxes(m);
        setError(s ? null : 'Séance introuvable.');
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
  }, [sessionId]);

  const groups = useMemo<ExerciseGroup[]>(() => {
    if (!session) return [];
    return groupSets(
      session.planned_exercises ?? [],
      session.completed_sets ?? [],
    );
  }, [session]);

  const zoneScore = session?.zone_score_at_start ?? null;
  const zoneLevel = zoneScore !== null ? getZoneLevel(zoneScore) : null;
  const accentColor = zoneLevel?.color ?? colors.accent.gold;
  const sport = session?.sport_key === 'running' ? 'Course' : 'Haltérophilie';
  const totalSets = groups.reduce((acc, g) => acc + g.sets.length, 0);

  return (
    <SafeScreen>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          style={styles.closeBtn}
        >
          <ArrowLeft size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <Skeleton width="100%" height={28} borderRadius={8} />
            <Skeleton width="60%" height={14} borderRadius={6} style={styles.skelGap} />
            <Skeleton width="100%" height={70} borderRadius={12} style={styles.skelGap} />
            <Skeleton width="100%" height={140} borderRadius={12} style={styles.skelGap} />
          </View>
        ) : error || !session ? (
          <View style={styles.empty}>
            <ZoneText variant="heading" style={styles.errorTitle}>
              {error ?? 'Séance introuvable'}
            </ZoneText>
            <View style={styles.errorAction}>
              <Button title="Retour" onPress={() => router.back()} />
            </View>
          </View>
        ) : (
          <>
            <ZoneText variant="heading" style={styles.title}>
              {frenchLongDate(session.date)}
            </ZoneText>
            <View style={styles.metaRow}>
              <ZoneText variant="caption" color={colors.text.muted} style={styles.metaText}>
                {sport} · {session.duration_minutes ?? 0} min
              </ZoneText>
              {zoneScore !== null ? (
                <View style={[styles.scoreBubble, { backgroundColor: accentColor }]}>
                  <ZoneText style={styles.scoreBubbleText}>{zoneScore}</ZoneText>
                </View>
              ) : null}
            </View>

            {zoneLevel ? (
              <View style={[styles.zoneCard, { borderLeftColor: accentColor }]}>
                <ZoneText variant="label" style={[styles.zoneCardTitle, { color: accentColor }]}>
                  Score Zone au départ : {zoneScore} — {zoneLevel.label}
                </ZoneText>
                {session.zone_message ? (
                  <ZoneText variant="caption" color={colors.text.secondary} style={styles.zoneMessage}>
                    {session.zone_message}
                  </ZoneText>
                ) : null}
              </View>
            ) : null}

            <View style={styles.section}>
              <ZoneText variant="heading" style={styles.sectionTitle}>
                EXERCICES
              </ZoneText>
              {groups.map((group) => (
                <ExerciseSection key={group.exercise_id} group={group} maxes={maxes} />
              ))}
            </View>

            <View style={styles.summaryRow}>
              <SummaryCell label="VOLUME" value={`${session.total_volume_kg ?? 0} kg`} />
              <SummaryCell label="SÉRIES" value={`${totalSets}`} />
              <SummaryCell label="DURÉE" value={`${session.duration_minutes ?? 0} min`} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeScreen>
  );
}

function ExerciseSection({
  group,
  maxes,
}: {
  group: ExerciseGroup;
  maxes: ExerciseMax[];
}): React.ReactElement {
  const previousMax = maxes.find((m) => m.exercise_id === group.exercise_id)?.estimated_1rm ?? 0;
  return (
    <View style={styles.exerciseBlock}>
      <ZoneText variant="heading" style={styles.exerciseName}>
        {group.name}
      </ZoneText>
      <View style={styles.tableHeader}>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.colSet}>
          SÉRIE
        </ZoneText>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.colWeight}>
          CHARGE
        </ZoneText>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.colReps}>
          REPS
        </ZoneText>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.colRpe}>
          RPE
        </ZoneText>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.colFlag}>
          {' '}
        </ZoneText>
      </View>
      {group.sets.length === 0 ? (
        <ZoneText variant="caption" color={colors.text.muted} style={styles.noSetsRow}>
          Aucune série enregistrée.
        </ZoneText>
      ) : (
        group.sets.map((s, i) => {
          const est = estimateOneRepMax(s.actual_weight_kg, s.actual_reps);
          const isPR = previousMax > 0 && est > previousMax;
          return (
            <View key={`${s.set_number}-${i}`} style={styles.tableRow}>
              <ZoneText
                style={[styles.cell, styles.colSet, { color: colors.text.muted }]}
              >
                {s.set_number}
              </ZoneText>
              <ZoneText
                style={[
                  styles.cell,
                  styles.colWeight,
                  isPR ? styles.cellPR : { color: colors.text.primary },
                ]}
              >
                {s.actual_weight_kg} kg
              </ZoneText>
              <ZoneText
                style={[styles.cell, styles.colReps, { color: colors.text.primary }]}
              >
                {s.actual_reps}
              </ZoneText>
              <ZoneText
                style={[styles.cell, styles.colRpe, { color: colors.text.secondary }]}
              >
                {s.rpe ?? '—'}
              </ZoneText>
              <ZoneText style={[styles.cell, styles.colFlag]}>{isPR ? '🏆' : ''}</ZoneText>
            </View>
          );
        })
      )}
    </View>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.summaryCell}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.summaryLabel}>
        {label}
      </ZoneText>
      <ZoneText variant="heading" style={styles.summaryValue}>
        {value}
      </ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  content: { paddingHorizontal: 24, paddingBottom: 32 },
  loadingWrap: { paddingVertical: 24 },
  skelGap: { marginTop: 16 },
  empty: { paddingVertical: 80, alignItems: 'center' },
  errorTitle: { fontSize: 22, color: colors.text.muted, textAlign: 'center' },
  errorAction: { marginTop: 24, alignSelf: 'stretch' },
  title: { fontSize: 30, color: colors.text.primary, marginTop: 4 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  metaText: { fontSize: 12 },
  scoreBubble: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  scoreBubbleText: { color: colors.bg.primary, fontFamily: 'Inter-Bold', fontSize: 12 },
  zoneCard: {
    marginTop: 16,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderRadius: 12,
    padding: 14,
  },
  zoneCardTitle: { fontFamily: 'Inter-Bold', fontSize: 13, letterSpacing: 1 },
  zoneMessage: { marginTop: 6, lineHeight: 17 },
  section: { marginTop: 22 },
  sectionTitle: { fontSize: 16, letterSpacing: 2, color: colors.text.primary, marginBottom: 8 },
  exerciseBlock: {
    marginBottom: 14,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
  },
  exerciseName: { fontSize: 18, color: colors.text.primary, letterSpacing: 1 },
  tableHeader: {
    flexDirection: 'row',
    marginTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableRow: { flexDirection: 'row', paddingVertical: 6, alignItems: 'center' },
  cell: { fontFamily: 'Inter-Medium', fontSize: 13 },
  cellPR: { color: colors.accent.gold, fontFamily: 'Inter-Bold' },
  colSet: { width: 50, fontSize: 11 },
  colWeight: { flex: 1 },
  colReps: { width: 50, textAlign: 'center' },
  colRpe: { width: 40, textAlign: 'center' },
  colFlag: { width: 28, textAlign: 'right' },
  noSetsRow: { marginTop: 10 },
  summaryRow: { flexDirection: 'row', marginTop: 16 },
  summaryCell: {
    flex: 1,
    marginHorizontal: 4,
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  summaryLabel: { letterSpacing: 1, fontSize: 10 },
  summaryValue: { fontSize: 22, color: colors.text.primary, marginTop: 4, lineHeight: 26 },
});
