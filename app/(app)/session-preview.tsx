import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Info } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import {
  getCompletedSessions,
  getExerciseMaxes,
  getSession,
  getTodayZoneScore,
  getUserProgram,
  type ExerciseMax,
  type SessionExercise,
  type TrainingSession,
  type UserProgram,
} from '@/lib/firestore';
import {
  getBlockName,
  previewWeightliftingSession,
  restBaseForExercise,
  type SessionExercisePreview,
} from '@/lib/programEngine';
import { createWeightliftingSession } from '@/lib/sessionLaunch';
import { getExerciseById } from '@/data/exercises';
import { getWeekNote, getWeightliftingBlockNote } from '@/data/coachingContext';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

const LEVEL_LABEL: Record<string, string> = {
  debutant: 'débutant',
  intermediaire: 'intermédiaire',
  avance: 'avancé',
  confirme: 'confirmé',
};

interface PreviewRow {
  exerciseId: string;
  sets: number;
  reps: string;
  /** N complexes per set when `reps` is a "X+Y" complex notation. */
  complexes?: number;
  pct: number | null;
  weightKg: number | null;
  restMin: number;
  restSeconds: number;
  /** Per-set charge + reps, so the preview can render a set-by-set table. */
  setDetails: { weightKg: number | null; reps: string }[];
  display?: string;
}

/** "3 min" / "2 min 30" for the rest-between-sets line. */
function formatRest(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m} min` : `${m} min ${s.toString().padStart(2, '0')}`;
}

function firstInt(reps: string): number {
  const m = reps.match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

/**
 * Format the per-set prescription for the preview list. Complex notations
 * render as "N × (X+Y) reps" to match the session screen; plain reps use
 * the short "R reps" form.
 */
function formatRepsLine(reps: string, complexes?: number): string {
  if (reps.includes('+') && complexes && complexes > 0) {
    const word = complexes === 1 ? 'complexe' : 'complexes';
    return `${complexes} ${word} (${reps})`;
  }
  return `${reps} reps`;
}

function rowsFromPreview(exs: SessionExercisePreview[]): PreviewRow[] {
  return exs.map((ex) => {
    const restSeconds = restBaseForExercise(ex.exerciseId);
    return {
      exerciseId: ex.exerciseId,
      sets: ex.sets,
      reps: ex.reps,
      complexes: ex.complexes,
      pct: ex.pct,
      weightKg: ex.weightKg,
      restMin: Math.round(restSeconds / 60),
      restSeconds,
      // A block's sets share the same charge / reps, so mirror the summary
      // across the set count.
      setDetails: Array.from({ length: Math.max(1, ex.sets) }, () => ({
        weightKg: ex.weightKg,
        reps: ex.reps,
      })),
      display: ex.display,
    };
  });
}

function rowsFromDoc(exs: SessionExercise[]): PreviewRow[] {
  return exs.map((ex) => {
    const first = ex.sets[0];
    const restSeconds = first?.rest_seconds ?? 120;
    return {
      exerciseId: ex.exercise_id,
      sets: ex.sets.length,
      reps: first?.target_reps ?? '-',
      complexes: first?.target_complexes,
      pct: null,
      weightKg: first?.target_weight_kg ?? null,
      restMin: Math.round(restSeconds / 60),
      restSeconds,
      setDetails: ex.sets.map((s) => ({
        weightKg: s.target_weight_kg ?? null,
        reps: s.target_reps ?? '-',
      })),
    };
  });
}

export default function SessionPreviewScreen(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string;
    block?: string;
    week?: string;
    day?: string;
    launchable?: string;
  }>();

  const [program, setProgram] = useState<UserProgram | null>(null);
  const [maxes, setMaxes] = useState<ExerciseMax[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [recentRir, setRecentRir] = useState<number[]>([]);
  const [docSession, setDocSession] = useState<TrainingSession | null>(null);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [launching, setLaunching] = useState<boolean>(false);

  const day = params.day ? parseInt(params.day, 10) : null;
  const block = params.block ? parseInt(params.block, 10) : null;
  const week = params.week ? parseInt(params.week, 10) : null;
  const launchable = params.launchable !== 'false';
  const sessionId = params.id;

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [prog, m, sc, completed, sess] = await Promise.all([
        getUserProgram(user.uid).catch(() => null),
        getExerciseMaxes(user.uid).catch(() => [] as ExerciseMax[]),
        getTodayZoneScore(user.uid).catch(() => null),
        getCompletedSessions(user.uid).catch(() => [] as TrainingSession[]),
        sessionId ? getSession(user.uid, sessionId).catch(() => null) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setProgram(prog);
      setMaxes(m);
      setScore(sc);
      setRecentRir(
        completed
          .filter((s) => s.sport_key === 'weightlifting' && s.discipline !== 'musculation' && typeof s.rpe === 'number')
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-2)
          .map((s) => Math.max(0, 10 - (s.rpe as number))),
      );
      setDocSession(sess);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Build the preview, either from an existing doc or computed for the queue.
  const computed = useMemo(() => {
    if (docSession) {
      const rows = rowsFromDoc(docSession.planned_exercises ?? []);
      const totalSets = rows.reduce((a, r) => a + r.sets, 0);
      const sportLabel =
        docSession.discipline === 'musculation'
          ? 'MUSCULATION'
          : docSession.sport_key === 'running'
            ? 'COURSE'
            : 'HALTÉROPHILIE';
      const durationMin = docSession.duration_minutes ?? Math.round(10 + totalSets * 3);
      // The session doc stores no block / week. For a weightlifting session,
      // derive the pedagogical context from the current programme so CONTEXTE
      // still renders (the doc-branch previously left it null → hidden).
      const isWeightliftingDoc =
        docSession.discipline !== 'musculation' && docSession.sport_key !== 'running';
      const blockNum = isWeightliftingDoc && program ? (program.current_block as number) : null;
      const weekNum =
        isWeightliftingDoc && program ? Math.min(4, Math.max(1, program.current_week)) : null;
      return {
        title: `SÉANCE · ${sportLabel}`,
        sportLabel,
        rows,
        totalSets,
        durationMin,
        prilepin: null as string | null,
        blockNum: blockNum as number | null,
        weekNum: weekNum as number | null,
        isDeload: weekNum === 4,
        canLaunch: docSession.status === 'planned',
        launchRoute:
          docSession.discipline === 'musculation'
            ? `/(app)/muscle-session/${docSession.id}`
            : `/(app)/session/${docSession.id}`,
      };
    }
    if (program && day) {
      const projected: UserProgram = {
        ...program,
        current_block: (block ?? program.current_block) as UserProgram['current_block'],
        current_week: week ?? program.current_week,
      };
      const preview = previewWeightliftingSession(projected, maxes, day);
      const rows = rowsFromPreview(preview.exercises);
      const totalSets = rows.reduce((a, r) => a + r.sets, 0);
      const main = preview.exercises[0];
      const prilepin =
        main && main.pct != null
          ? `Cette séance respecte le tableau de Prilepin. ${main.sets * firstInt(main.reps)} répétitions totales à ${main.pct}% sur le mouvement principal, zone optimale pour un ${LEVEL_LABEL[program.level] ?? 'athlète'} en ${getBlockName(projected.current_block)}.`
          : null;
      const isCurrent =
        projected.current_block === program.current_block && projected.current_week === program.current_week;
      return {
        title: preview.title,
        sportLabel: 'HALTÉROPHILIE',
        rows,
        totalSets,
        durationMin: preview.durationMin,
        prilepin,
        blockNum: projected.current_block as number | null,
        weekNum: preview.week as number | null,
        isDeload: preview.week >= 4,
        canLaunch: launchable && isCurrent,
        launchRoute: null as string | null,
      };
    }
    return null;
  }, [docSession, program, maxes, day, block, week, launchable]);

  const wlBlockNote =
    computed && computed.blockNum != null ? getWeightliftingBlockNote(computed.blockNum) : null;

  const onLaunch = async (): Promise<void> => {
    const user = auth.currentUser;
    if (!user || !computed || launching) return;
    setLaunching(true);
    try {
      if (computed.launchRoute) {
        router.replace(computed.launchRoute as never);
        return;
      }
      if (program && day) {
        const id = await createWeightliftingSession({
          uid: user.uid,
          program,
          maxes,
          zoneScore: score,
          recentRir,
          dayOfWeek: day,
        });
        router.replace(`/(app)/session/${id}`);
      }
    } catch {
      setLaunching(false);
    }
  };

  return (
    <SafeScreen edges={['top', 'left', 'right']}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={16} activeOpacity={0.7}>
          <ArrowLeft size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.sportBadge}>
          <ZoneText variant="caption" color={colors.haltero} style={styles.sportBadgeText}>
            {computed?.sportLabel ?? ''} · APERÇU
          </ZoneText>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {!loaded || !computed ? (
          <>
            <Skeleton width="80%" height={28} borderRadius={8} />
            <Skeleton width="60%" height={16} borderRadius={6} style={styles.skelGap} />
            <Skeleton width="100%" height={90} borderRadius={16} style={styles.skelGap} />
            <Skeleton width="100%" height={90} borderRadius={16} style={styles.skelGap} />
          </>
        ) : (
          <>
            <ZoneText variant="heading" size={24} color={colors.text.primary} style={styles.title}>
              {computed.title}
            </ZoneText>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.meta}>
              ~{computed.durationMin} min · {computed.rows.length} exercices · {computed.totalSets} séries total
            </ZoneText>

            {wlBlockNote && computed.blockNum != null ? (
              <View style={styles.contextCard}>
                <ZoneText variant="caption" color={colors.text.muted} style={styles.contextEyebrow}>
                  CONTEXTE
                </ZoneText>
                <ZoneText variant="titleSm" color={colors.text.primary} style={styles.contextTitle}>
                  Bloc {computed.blockNum} · {wlBlockNote.name} · Semaine {computed.weekNum}/4
                </ZoneText>
                <ZoneText variant="caption" color={colors.text.secondary} style={styles.contextBody}>
                  {wlBlockNote.short}
                </ZoneText>
                {computed.isDeload ? (
                  <View style={styles.deloadBox}>
                    <ZoneText variant="caption" color={colors.orbe.amber} style={styles.deloadTitle}>
                      ⚠️ SEMAINE DE DÉCHARGE · RIR cible : 5-6
                    </ZoneText>
                    <ZoneText variant="caption" color={colors.text.secondary} style={styles.deloadBody}>
                      {getWeekNote(true).long}
                    </ZoneText>
                  </View>
                ) : null}
              </View>
            ) : null}

            <ZoneText variant="caption" color={colors.text.muted} style={styles.sectionEyebrow}>
              EXERCICES
            </ZoneText>

            {computed.rows.map((row, i) => {
              const ex = getExerciseById(row.exerciseId);
              return (
                <View key={`${row.exerciseId}-${i}`} style={styles.exCard}>
                  <ZoneText variant="titleSm" color={colors.text.primary} style={styles.exName}>
                    {(ex?.name ?? row.exerciseId).toUpperCase()}
                  </ZoneText>
                  {row.display ? (
                    <ZoneText variant="body" size={14} color={colors.text.primary} style={styles.exLine}>
                      {row.display}
                    </ZoneText>
                  ) : (
                    <View style={styles.setTable}>
                      {row.setDetails.map((set, si) => (
                        <View key={si} style={styles.setRow}>
                          <ZoneText variant="caption" color={colors.text.muted} style={styles.setColLeft}>
                            Série {si + 1}
                          </ZoneText>
                          <ZoneText variant="label" color={colors.text.primary} style={styles.setColMid}>
                            {set.weightKg != null ? `${set.weightKg} kg` : '—'}
                          </ZoneText>
                          <ZoneText variant="caption" color={colors.text.secondary} style={styles.setColRight}>
                            {formatRepsLine(set.reps, row.complexes)}
                          </ZoneText>
                        </View>
                      ))}
                    </View>
                  )}
                  <ZoneText variant="caption" color={colors.text.muted} style={styles.exMeta}>
                    Repos entre séries : {formatRest(row.restSeconds)}
                    {row.pct != null ? ` · Intensité : ${row.pct}% du 1RM` : ''}
                  </ZoneText>
                  {ex ? (
                    <TouchableOpacity
                      onPress={() => router.push(`/(app)/exercise/${row.exerciseId}`)}
                      activeOpacity={0.7}
                      style={styles.techLink}
                      hitSlop={8}
                    >
                      <Info size={14} color={colors.haltero} />
                      <ZoneText variant="caption" color={colors.haltero} style={styles.techText}>
                        Voir la technique
                      </ZoneText>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}

            {computed.prilepin ? (
              <View style={styles.scienceCard}>
                <ZoneText variant="body" size={13} color={colors.haltero} style={styles.scienceText}>
                  {computed.prilepin}
                </ZoneText>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      {computed?.canLaunch ? (
        <View style={styles.footer}>
          <Button
            title={launching ? '...' : 'LANCER LA SÉANCE  →'}
            loading={launching}
            onPress={onLaunch}
          />
        </View>
      ) : computed && !computed.canLaunch && !docSession ? (
        <View style={styles.footer}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.footerNote}>
            Termine la semaine en cours avant cette séance.
          </ZoneText>
        </View>
      ) : null}
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sportBadge: {
    borderWidth: 1,
    borderColor: colors.haltero,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  sportBadgeText: { fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  headerSpacer: { width: 24 },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 },
  skelGap: { marginTop: 12 },
  title: { letterSpacing: 0.5 },
  meta: { marginTop: 6, marginBottom: 20 },
  contextCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.haltero,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  contextEyebrow: { letterSpacing: 1.5, fontFamily: 'Inter_700Bold', fontSize: 10 },
  contextTitle: { marginTop: 8, letterSpacing: 0.3 },
  contextBody: { marginTop: 6, lineHeight: 18 },
  deloadBox: {
    marginTop: 12,
    backgroundColor: 'rgba(230,168,90,0.10)',
    borderWidth: 1,
    borderColor: colors.orbe.amber,
    borderRadius: 12,
    padding: 12,
  },
  deloadTitle: { fontFamily: 'Inter_700Bold', letterSpacing: 0.3 },
  deloadBody: { marginTop: 6, lineHeight: 18 },
  exCard: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  exName: { letterSpacing: 0.3 },
  exLine: { marginTop: 6 },
  sectionEyebrow: {
    letterSpacing: 1.5,
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    marginTop: 8,
    marginBottom: 10,
  },
  setTable: { marginTop: 10 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  setColLeft: { width: 70 },
  setColMid: { flex: 1 },
  setColRight: { width: 90, textAlign: 'right' },
  exMeta: { marginTop: 10, lineHeight: 17 },
  techLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  techText: { fontFamily: 'Inter_500Medium' },
  scienceCard: {
    marginTop: 8,
    backgroundColor: 'rgba(201,168,76,0.08)',
    borderWidth: 1,
    borderColor: colors.haltero,
    borderRadius: 16,
    padding: 16,
  },
  scienceText: { lineHeight: 20 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: colors.bg.primary,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  footerNote: { textAlign: 'center' },
});
