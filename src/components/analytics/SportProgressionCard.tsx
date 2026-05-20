import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';
import { Card } from '@/components/ui/Card';
import { BarChart, DonutChart, LineChart, RadarChart } from './charts';
import type {
  MuscleVolumeStatus,
  WorkloadDataPoint,
  WorkloadSport,
} from '@/lib/pro';
import {
  validateSessionVolume,
} from '@/lib/pro';
import type { ExerciseMax, RunningProfile, TrainingSession } from '@/lib/firestore';
import { calculateVDOTPaces, formatPace as formatRunPace } from '@/lib/runningEngine';

const SPORT_LABELS: Record<WorkloadSport, string> = {
  weightlifting: 'Haltérophilie',
  running: 'Course',
  musculation: 'Musculation',
  hyrox: 'Hyrox',
};

const WEIGHTLIFTING_KEY_LIFTS: { id: string; name: string; color: string }[] = [
  { id: 'snatch', name: 'Arraché', color: colors.accent.gold },
  { id: 'clean_and_jerk', name: 'Épaulé-jeté', color: colors.orbe.blue },
  { id: 'front_squat', name: 'Squat avant', color: colors.success },
];

export interface SportProgressionCardProps {
  activeSports: WorkloadSport[];
  workloadHistory: WorkloadDataPoint[];
  exerciseMaxes: ExerciseMax[];
  completedSessions: TrainingSession[];
  runningProfile: RunningProfile | null;
  muscleVolumeStatus: MuscleVolumeStatus[];
}

export function SportProgressionCard({
  activeSports,
  workloadHistory,
  exerciseMaxes,
  completedSessions,
  runningProfile,
  muscleVolumeStatus,
}: SportProgressionCardProps): React.ReactElement | null {
  const sports = activeSports.length > 0 ? activeSports : (['weightlifting'] as WorkloadSport[]);
  const [selected, setSelected] = useState<WorkloadSport>(sports[0]);

  return (
    <Card style={styles.card}>
      <ZoneText variant="heading" size={22} color={colors.text.primary} style={styles.title}>
        PROGRESSION PAR SPORT
      </ZoneText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {sports.map((sport) => {
          const active = sport === selected;
          return (
            <TouchableOpacity
              key={sport}
              onPress={() => setSelected(sport)}
              style={[
                styles.chip,
                active && {
                  borderColor: colors.accent.gold,
                  backgroundColor: `${colors.accent.gold}1F`,
                },
              ]}
            >
              <ZoneText
                variant="label"
                size={12}
                color={active ? colors.accent.gold : colors.text.muted}
              >
                {SPORT_LABELS[sport]}
              </ZoneText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {selected === 'weightlifting' ? (
        <WeightliftingProgression
          maxes={exerciseMaxes}
          sessions={completedSessions}
          workloadHistory={workloadHistory}
        />
      ) : null}

      {selected === 'running' ? (
        <RunningProgression
          runningProfile={runningProfile}
          workloadHistory={workloadHistory}
        />
      ) : null}

      {selected === 'musculation' ? (
        <MusculationProgression
          muscleVolumeStatus={muscleVolumeStatus}
          workloadHistory={workloadHistory}
        />
      ) : null}

      {selected === 'hyrox' ? <HyroxProgression /> : null}
    </Card>
  );
}

interface WeightliftingProgressionProps {
  maxes: ExerciseMax[];
  sessions: TrainingSession[];
  workloadHistory: WorkloadDataPoint[];
}

function WeightliftingProgression({
  maxes,
  sessions,
}: WeightliftingProgressionProps): React.ReactElement {
  const [width, setWidth] = useState<number>(0);
  const onLayout = (e: LayoutChangeEvent): void => {
    setWidth(e.nativeEvent.layout.width);
  };

  const series = useMemo(() => {
    return WEIGHTLIFTING_KEY_LIFTS.map((lift) => {
      const values = buildWeeklyOneRM(sessions, lift.id, 12);
      return { values, color: lift.color, strokeWidth: 2 };
    });
  }, [sessions]);

  const compliance = useMemo(() => {
    let total = 0;
    let inZone = 0;
    for (const session of sessions) {
      const planned = session.planned_exercises ?? [];
      for (const ex of planned) {
        const exMax = maxes.find((m) => m.exercise_id === ex.exercise_id);
        if (!exMax || exMax.estimated_1rm <= 0) continue;
        const sets = ex.sets
          .map((s) => ({
            reps: parseInt(s.target_reps, 10) || 0,
            weightKg: s.target_weight_kg ?? 0,
          }))
          .filter((s) => s.reps > 0 && s.weightKg > 0);
        if (sets.length === 0) continue;
        total += 1;
        const validation = validateSessionVolume(sets, exMax.estimated_1rm);
        if (validation.isWithinRange) inZone += 1;
      }
    }
    return { total, inZone };
  }, [sessions, maxes]);

  const topPRs = useMemo(() => {
    return [...maxes]
      .filter((m) => m.is_pr)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3);
  }, [maxes]);

  const hasData = series.some((s) => s.values.some((v) => v > 0));
  const labels = Array.from({ length: 12 }, (_, i) => `S${i + 1}`);
  const maxValue = Math.max(50, ...series.flatMap((s) => s.values));

  return (
    <View style={styles.sportBody}>
      <ZoneText variant="label" color={colors.text.primary} style={styles.sectionTitle}>
        PROGRESSION HALTÉROPHILIE
      </ZoneText>
      <View style={styles.chartWrap} onLayout={onLayout}>
        {width > 0 ? (
          hasData ? (
            <LineChart
              width={width}
              height={160}
              series={series}
              xLabels={labels}
              yMin={0}
              yMax={Math.ceil((maxValue + 10) / 10) * 10}
            />
          ) : (
            <View style={styles.empty}>
              <ZoneText variant="caption" color={colors.text.muted}>
                Pas encore d'historique de levés sur ces 12 semaines.
              </ZoneText>
            </View>
          )
        ) : null}
      </View>
      <View style={styles.legend}>
        {WEIGHTLIFTING_KEY_LIFTS.map((lift) => (
          <View key={lift.id} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: lift.color }]} />
            <ZoneText variant="caption" color={colors.text.muted}>
              {lift.name}
            </ZoneText>
          </View>
        ))}
      </View>

      <View style={styles.prilepinBox}>
        <ZoneText variant="caption" color={colors.text.muted}>
          Sessions dans la zone Prilepin ce mois
        </ZoneText>
        <ZoneText variant="heading" size={36} color={colors.accent.gold}>
          {compliance.total > 0
            ? `${Math.round((compliance.inZone / compliance.total) * 100)}%`
            : '—'}
        </ZoneText>
        <ZoneText variant="caption" color={colors.text.muted}>
          {compliance.inZone}/{compliance.total} séances conformes au tableau de Prilepin
        </ZoneText>
        <ZoneText variant="caption" size={10} color={colors.text.muted} style={styles.scienceInline}>
          Prilepin AS (1975) · Recherche soviétique
        </ZoneText>
      </View>

      <ZoneText variant="label" color={colors.text.primary} style={styles.sectionTitle}>
        TOP PRs
      </ZoneText>
      <View style={styles.prList}>
        {topPRs.length === 0 ? (
          <ZoneText variant="caption" color={colors.text.muted}>
            Aucun record enregistré pour l'instant.
          </ZoneText>
        ) : (
          topPRs.map((pr) => (
            <View key={pr.exercise_id} style={styles.prCard}>
              <ZoneText variant="label" color={colors.text.primary}>
                {pr.exercise_id}
              </ZoneText>
              <ZoneText variant="heading" size={22} color={colors.accent.gold}>
                {pr.weight_kg} kg
              </ZoneText>
              <ZoneText variant="caption" color={colors.text.muted}>
                {pr.date}
              </ZoneText>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function buildWeeklyOneRM(
  sessions: TrainingSession[],
  exerciseId: string,
  weeks: number,
): number[] {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const buckets: number[] = new Array(weeks).fill(0);
  for (const session of sessions) {
    const sets = session.completed_sets ?? [];
    const exSets = sets.filter((s) => s.exercise_id === exerciseId);
    if (exSets.length === 0) continue;
    const dParts = session.date.split('-');
    if (dParts.length !== 3) continue;
    const d = new Date(Date.UTC(+dParts[0], +dParts[1] - 1, +dParts[2]));
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays < 0 || diffDays >= weeks * 7) continue;
    const idx = weeks - 1 - Math.floor(diffDays / 7);
    const best = exSets.reduce((acc, s) => {
      // Epley 1RM
      const est = s.actual_weight_kg * (1 + s.actual_reps / 30);
      return Math.max(acc, est);
    }, 0);
    if (best > buckets[idx]) buckets[idx] = best;
  }
  return buckets;
}

interface RunningProgressionProps {
  runningProfile: RunningProfile | null;
  workloadHistory: WorkloadDataPoint[];
}

function RunningProgression({
  runningProfile,
  workloadHistory,
}: RunningProgressionProps): React.ReactElement {
  const [width, setWidth] = useState<number>(0);
  const onLayout = (e: LayoutChangeEvent): void => {
    setWidth(e.nativeEvent.layout.width);
  };

  const currentVDOT = runningProfile?.vdot ?? 0;

  const vdotHistory = useMemo(() => {
    const past = new Array<number>(12).fill(0);
    if (currentVDOT > 0) {
      for (let i = 0; i < 12; i += 1) {
        past[i] = Math.max(0, currentVDOT - (12 - i - 1) * 0.15);
      }
    }
    return past;
  }, [currentVDOT]);

  const projection = useMemo(() => {
    const out = new Array<number>(8).fill(0);
    if (currentVDOT > 0) {
      for (let i = 0; i < 8; i += 1) {
        out[i] = currentVDOT + (i + 1) * 0.15;
      }
    }
    return out;
  }, [currentVDOT]);

  const compliance = useMemo(() => {
    let easyMin = 0;
    let qualityMin = 0;
    for (const w of workloadHistory) {
      if (w.sport !== 'running') continue;
      if (w.intensityFactor < 0.85) easyMin += w.durationMinutes;
      else qualityMin += w.durationMinutes;
    }
    return { easyMin, qualityMin };
  }, [workloadHistory]);

  const totalMin = compliance.easyMin + compliance.qualityMin;
  const easyPct = totalMin > 0 ? compliance.easyMin / totalMin : 0;
  const hasRun = totalMin > 0;

  const paces = currentVDOT > 0 ? calculateVDOTPaces(currentVDOT) : null;
  const projected8wPaces = currentVDOT > 0 ? calculateVDOTPaces(currentVDOT + 1.2) : null;
  const labels = Array.from({ length: 20 }, (_, i) => (i < 12 ? `S${i + 1}` : `+${i - 11}`));

  return (
    <View style={styles.sportBody}>
      <ZoneText variant="label" color={colors.text.primary} style={styles.sectionTitle}>
        PROGRESSION COURSE
      </ZoneText>

      <View style={styles.chartWrap} onLayout={onLayout}>
        {width > 0 && currentVDOT > 0 ? (
          <LineChart
            width={width}
            height={160}
            yMin={Math.max(0, currentVDOT - 6)}
            yMax={currentVDOT + 4}
            xLabels={labels}
            series={[
              {
                values: [...vdotHistory, ...new Array(8).fill(Number.NaN)],
                color: colors.accent.gold,
                strokeWidth: 2.5,
              },
              {
                values: [
                  ...new Array(11).fill(Number.NaN),
                  vdotHistory[11],
                  ...projection,
                ],
                color: colors.orbe.blue,
                strokeWidth: 2,
                dashed: true,
              },
            ]}
          />
        ) : (
          <View style={styles.empty}>
            <ZoneText variant="caption" color={colors.text.muted}>
              Configure le profil course pour voir la progression VDOT.
            </ZoneText>
          </View>
        )}
      </View>
      {currentVDOT > 0 ? (
        <ZoneText variant="caption" color={colors.orbe.blue}>
          VDOT projeté à 8 semaines : {(currentVDOT + 1.2).toFixed(1)}
        </ZoneText>
      ) : null}

      <View style={styles.split8020}>
        <DonutChart
          size={140}
          thickness={16}
          segments={[
            { value: compliance.easyMin, color: colors.orbe.blue },
            { value: compliance.qualityMin, color: colors.accent.gold },
          ]}
          centerLabel={hasRun ? `${Math.round(easyPct * 100)}%` : '—'}
          centerSub={hasRun ? 'facile' : 'pas de données'}
        />
        <View style={styles.split8020Body}>
          <ZoneText variant="label" color={colors.text.primary}>
            Règle 80/20
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.muted}>
            Ce mois : {Math.round(easyPct * 100)}% facile · {Math.round((1 - easyPct) * 100)}% qualité
          </ZoneText>
          {hasRun && easyPct < 0.7 ? (
            <ZoneText variant="caption" color={colors.orbe.amber} style={styles.warningText}>
              Pas assez de facile. Risque d'accumulation de fatigue.
            </ZoneText>
          ) : null}
          {hasRun && easyPct > 0.9 ? (
            <ZoneText variant="caption" color={colors.orbe.blue} style={styles.warningText}>
              Introduis plus de qualité pour stimuler le VO2max.
            </ZoneText>
          ) : null}
        </View>
      </View>

      <View style={styles.paceTable}>
        <View style={styles.paceHeader}>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.paceColDist}>
            Distance
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.paceColMid}>
            Actuel
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.muted} style={styles.paceColEnd}>
            8 sem
          </ZoneText>
        </View>
        {paces && projected8wPaces ? (
          <>
            <PaceRow
              dist="5 km"
              current={formatRunPace(paces.T)}
              projected={formatRunPace(projected8wPaces.T)}
            />
            <PaceRow
              dist="10 km"
              current={formatRunPace(paces.T + 8)}
              projected={formatRunPace(projected8wPaces.T + 8)}
            />
            <PaceRow
              dist="Semi"
              current={formatRunPace(paces.M)}
              projected={formatRunPace(projected8wPaces.M)}
            />
            <PaceRow
              dist="Marathon"
              current={formatRunPace(paces.M + 15)}
              projected={formatRunPace(projected8wPaces.M + 15)}
            />
          </>
        ) : (
          <ZoneText variant="caption" color={colors.text.muted}>
            Renseigne ton VDOT pour estimer les allures.
          </ZoneText>
        )}
      </View>
    </View>
  );
}

function PaceRow({
  dist,
  current,
  projected,
}: {
  dist: string;
  current: string;
  projected: string;
}): React.ReactElement {
  return (
    <View style={styles.paceRow}>
      <ZoneText variant="caption" color={colors.text.primary} style={styles.paceColDist}>
        {dist}
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.primary} style={styles.paceColMid}>
        {current}
      </ZoneText>
      <ZoneText variant="caption" color={colors.accent.gold} style={styles.paceColEnd}>
        {projected}
      </ZoneText>
    </View>
  );
}

interface MusculationProgressionProps {
  muscleVolumeStatus: MuscleVolumeStatus[];
  workloadHistory: WorkloadDataPoint[];
}

function MusculationProgression({
  muscleVolumeStatus,
  workloadHistory,
}: MusculationProgressionProps): React.ReactElement {
  const [expanded, setExpanded] = useState<boolean>(false);
  const [width, setWidth] = useState<number>(0);
  const onLayout = (e: LayoutChangeEvent): void => {
    setWidth(e.nativeEvent.layout.width);
  };
  const visible = expanded ? muscleVolumeStatus : muscleVolumeStatus.slice(0, 8);

  const weeklyVolume = useMemo(() => {
    const out: { value: number; color: string }[] = [];
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    for (let w = 5; w >= 0; w -= 1) {
      const weekEndMs = now.getTime() - w * 7 * 24 * 60 * 60 * 1000;
      const weekStartMs = weekEndMs - 7 * 24 * 60 * 60 * 1000;
      let total = 0;
      for (const entry of workloadHistory) {
        if (entry.sport !== 'musculation') continue;
        const parts = entry.date.split('-');
        if (parts.length !== 3) continue;
        const d = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
        if (d.getTime() >= weekStartMs && d.getTime() < weekEndMs) {
          total += entry.tss;
        }
      }
      out.push({ value: total, color: colors.accent.gold });
    }
    return out;
  }, [workloadHistory]);

  const hasVolume = weeklyVolume.some((w) => w.value > 0);

  return (
    <View style={styles.sportBody}>
      <ZoneText variant="label" color={colors.text.primary} style={styles.sectionTitle}>
        PROGRESSION MUSCULATION
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.subline}>
        MEV/MAV/MRV · Israetel (2019)
      </ZoneText>

      <View style={styles.muscleBars}>
        {visible.map((m) => (
          <MuscleBar key={m.muscle} status={m} />
        ))}
      </View>
      {muscleVolumeStatus.length > 8 ? (
        <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={styles.expandBtn}>
          <ZoneText variant="caption" color={colors.accent.gold}>
            {expanded ? 'Réduire' : 'Voir tout'}
          </ZoneText>
        </TouchableOpacity>
      ) : null}

      <ZoneText variant="label" color={colors.text.primary} style={styles.sectionTitle}>
        VOLUME HEBDOMADAIRE
      </ZoneText>
      <View style={styles.chartWrap} onLayout={onLayout}>
        {width > 0 ? (
          hasVolume ? (
            <BarChart
              width={width}
              height={120}
              data={weeklyVolume}
              yMin={0}
              yMax={Math.max(100, ...weeklyVolume.map((w) => w.value)) * 1.1}
            />
          ) : (
            <View style={styles.empty}>
              <ZoneText variant="caption" color={colors.text.muted}>
                Pas encore de volume musculation cumulé.
              </ZoneText>
            </View>
          )
        ) : null}
      </View>
    </View>
  );
}

function MuscleBar({ status }: { status: MuscleVolumeStatus }): React.ReactElement {
  const denom = Math.max(1, status.mrv - status.mev);
  const fillPct =
    status.currentWeeklySets <= status.mev
      ? 0
      : Math.min(1, (status.currentWeeklySets - status.mev) / denom);

  return (
    <View style={styles.muscleRow}>
      <ZoneText variant="caption" color={colors.text.primary} style={styles.muscleName}>
        {status.muscle}
      </ZoneText>
      <View style={styles.muscleTrack}>
        <View
          style={[
            styles.muscleFill,
            { width: `${Math.round(fillPct * 100)}%`, backgroundColor: status.statusColor },
          ]}
        />
      </View>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.muscleValue}>
        {status.currentWeeklySets}/{status.mrv}
      </ZoneText>
    </View>
  );
}

function HyroxProgression(): React.ReactElement {
  const axes = ['SkiErg', 'Sled Push', 'Sled Pull', 'Burpees', 'Row', 'Carry', 'Lunges', 'Wall Balls'];
  const values = [55, 60, 50, 45, 65, 70, 55, 60];
  const reference = [80, 80, 80, 80, 80, 80, 80, 80];

  return (
    <View style={styles.sportBody}>
      <ZoneText variant="label" color={colors.text.primary} style={styles.sectionTitle}>
        PROGRESSION HYROX
      </ZoneText>
      <View style={styles.radarWrap}>
        <RadarChart
          size={260}
          axes={axes}
          values={values}
          reference={reference}
          max={100}
        />
      </View>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.subline}>
        Niveau actuel par station · ligne pointillée : objectif
      </ZoneText>

      <ZoneText variant="label" color={colors.text.primary} style={styles.sectionTitle}>
        FILIÈRES ÉNERGÉTIQUES
      </ZoneText>
      <View style={styles.energyBars}>
        <EnergyBar label="ATP-PCr" pct={0.2} color={colors.danger} />
        <EnergyBar label="Glycolytique" pct={0.35} color={colors.orbe.amber} />
        <EnergyBar label="Oxydatif" pct={0.45} color={colors.success} />
      </View>
    </View>
  );
}

function EnergyBar({ label, pct, color }: { label: string; pct: number; color: string }): React.ReactElement {
  return (
    <View style={styles.energyRow}>
      <ZoneText variant="caption" color={colors.text.primary} style={styles.energyLabel}>
        {label}
      </ZoneText>
      <View style={styles.energyTrack}>
        <View style={[styles.energyFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
      </View>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.energyValue}>
        {Math.round(pct * 100)}%
      </ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  title: {
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  chips: {
    gap: 8,
    paddingBottom: 4,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sportBody: {
    marginTop: 8,
  },
  sectionTitle: {
    marginTop: 16,
    marginBottom: 8,
    letterSpacing: 1,
  },
  subline: {
    marginBottom: 8,
  },
  chartWrap: {
    minHeight: 120,
  },
  empty: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  prilepinBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.bg.elevated,
    alignItems: 'flex-start',
  },
  scienceInline: {
    marginTop: 6,
  },
  prList: {
    flexDirection: 'row',
    gap: 8,
  },
  prCard: {
    flex: 1,
    backgroundColor: colors.bg.elevated,
    borderRadius: 10,
    padding: 10,
    alignItems: 'flex-start',
  },
  split8020: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  split8020Body: {
    flex: 1,
  },
  warningText: {
    marginTop: 6,
  },
  paceTable: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.bg.elevated,
  },
  paceHeader: {
    flexDirection: 'row',
    paddingVertical: 4,
    borderBottomColor: colors.border,
    borderBottomWidth: 0.5,
  },
  paceRow: {
    flexDirection: 'row',
    paddingVertical: 6,
  },
  paceColDist: {
    flex: 1.2,
  },
  paceColMid: {
    flex: 1,
    textAlign: 'right',
  },
  paceColEnd: {
    flex: 1,
    textAlign: 'right',
  },
  muscleBars: {
    gap: 6,
  },
  muscleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  muscleName: {
    width: 90,
  },
  muscleTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  muscleFill: {
    height: '100%',
    borderRadius: 4,
  },
  muscleValue: {
    width: 50,
    textAlign: 'right',
  },
  expandBtn: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  radarWrap: {
    alignItems: 'center',
    marginVertical: 8,
  },
  energyBars: {
    gap: 8,
  },
  energyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  energyLabel: {
    width: 110,
  },
  energyTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  energyFill: {
    height: '100%',
    borderRadius: 4,
  },
  energyValue: {
    width: 40,
    textAlign: 'right',
  },
});
