import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Lock, X } from 'lucide-react-native';
import { auth } from '@/lib/firebase';
import {
  getHyroxProfile,
  getHyroxStationAverages,
  getTodayCheckin,
  getUserProfile,
  saveHyroxSession,
  todayDateString,
  updateWeakStations,
  type Gender,
  type HyroxProfile,
  type HyroxSessionTypeKey,
  type HyroxStationResult,
} from '@/lib/firestore';
import { hyroxStationTimeFactor, wallBallWeightKg } from '@/lib/genderProfiles';
import { usePro } from '@/hooks/usePro';
import { getZoneLevel } from '@/lib/zoneScore';
import {
  getHyroxStation,
  HYROX_STATION_ORDER,
  type HyroxStationKey,
} from '@/data/hyroxStations';
import {
  formatDuration,
  hyroxZoneRaceAdaptation,
  lactateStatus,
  rateWeakness,
  roundTimerColor,
  selectTrainingStations,
  zoneAdjustedTarget,
  type HyroxZoneRaceAdaptation,
} from '@/lib/hyroxScience';
import { colors } from '@/theme/colors';
import { SafeScreen } from '@/components/ui/SafeScreen';
import { ZoneText } from '@/components/ui/ZoneText';
import { Button } from '@/components/ui/Button';

type Phase = 'loading' | 'gate' | 'pre' | 'work' | 'summary';

interface PlannedRound {
  stationId: HyroxStationKey;
  roundNumber: number;
  totalRounds: number;
  targetSec: number;
  targetReps: number | null;
}

interface RoundResult {
  stationId: HyroxStationKey;
  timeSec: number;
  reps: number | null;
}

const STATION_ROUNDS = 3;
const STATION_WORK_FRACTION = 0.5;
const REST_RATIO = 2; // NSCA 1:2 work:rest for anaerobic stations.

function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function HyroxSessionScreen(): React.ReactElement {
  const router = useRouter();
  const { isPro } = usePro();
  const params = useLocalSearchParams<{ id: string; type?: string; block?: string }>();
  const sessionType = (params.type ?? 'station_work') as HyroxSessionTypeKey;
  const blockPhase = Math.max(1, Math.min(4, parseInt(params.block ?? '2', 10) || 2));

  const [phase, setPhase] = useState<Phase>('loading');
  const [profile, setProfile] = useState<HyroxProfile | null>(null);
  const [gender, setGender] = useState<Gender | null>(null);
  const [zoneScore, setZoneScore] = useState<number | null>(null);
  const [rounds, setRounds] = useState<PlannedRound[]>([]);
  const [results, setResults] = useState<RoundResult[]>([]);
  const [techniqueOnly, setTechniqueOnly] = useState<boolean>(false);

  // Timer state.
  const [roundIdx, setRoundIdx] = useState<number>(0);
  const [elapsed, setElapsed] = useState<number>(0);
  const [reps, setReps] = useState<number>(0);
  const [timerActive, setTimerActive] = useState<boolean>(false);
  const [restRemaining, setRestRemaining] = useState<number>(0);
  const [lactate, setLactate] = useState<number>(0);
  const [roundFeedback, setRoundFeedback] = useState<string | null>(null);

  const timerActiveRef = useRef<boolean>(false);
  const restingRef = useRef<boolean>(false);
  timerActiveRef.current = timerActive;
  restingRef.current = restRemaining > 0;

  const adaptation: HyroxZoneRaceAdaptation = useMemo(
    () => hyroxZoneRaceAdaptation(zoneScore),
    [zoneScore],
  );
  const zoneLevel = useMemo(() => (zoneScore !== null ? getZoneLevel(zoneScore) : null), [zoneScore]);
  const accent = zoneLevel?.color ?? colors.accent.gold;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = auth.currentUser;
      if (!user) {
        setPhase('pre');
        return;
      }
      try {
        const [p, checkin, averages, userProfile] = await Promise.all([
          getHyroxProfile(user.uid),
          getTodayCheckin(user.uid),
          getHyroxStationAverages(user.uid),
          getUserProfile(user.uid),
        ]);
        if (cancelled) return;
        setProfile(p);
        const g = userProfile?.gender ?? null;
        setGender(g);
        const z = checkin?.zone_score ?? null;
        setZoneScore(z);
        setRounds(buildRounds(sessionType, p, averages, g));
        setPhase(z !== null && z < 40 ? 'gate' : 'pre');
      } catch {
        if (!cancelled) setPhase('pre');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionType]);

  // Single 1s tick driving the work stopwatch and the rest countdown.
  useEffect(() => {
    if (phase !== 'work') return;
    const t = setInterval(() => {
      if (timerActiveRef.current) {
        setElapsed((e) => e + 1);
      } else if (restingRef.current) {
        setRestRemaining((r) => Math.max(0, r - 1));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  const currentRound = rounds[roundIdx];
  const station = currentRound ? getHyroxStation(currentRound.stationId) : null;
  const isRepBased = station?.unit === 'reps';

  const cue = useMemo(() => {
    if (!station) return '';
    const idx = Math.floor(elapsed / 30) % station.coachingCues.length;
    return station.coachingCues[idx];
  }, [station, elapsed]);

  const lactateInfo = lactateStatus(lactate);

  const startWork = (): void => {
    setElapsed(0);
    setReps(0);
    setRoundFeedback(null);
    setTimerActive(true);
  };

  const stopWork = (): void => {
    if (!currentRound || !station) return;
    setTimerActive(false);
    const result: RoundResult = {
      stationId: currentRound.stationId,
      timeSec: elapsed,
      reps: isRepBased ? reps : null,
    };
    const nextResults = [...results, result];
    setResults(nextResults);

    // Lactate accumulation for this effort.
    const addedLactate = station.lactateLoad * (sessionType === 'station_work' ? STATION_WORK_FRACTION : 1);
    setLactate((l) => l + addedLactate);

    // Feedback vs the best previous round of this station.
    const sameStation = results.filter((r) => r.stationId === currentRound.stationId);
    const prevBest = sameStation.length > 0 ? Math.min(...sameStation.map((r) => r.timeSec)) : null;
    if (prevBest !== null && elapsed < prevBest) {
      setRoundFeedback(`Record de la séance, ${prevBest - elapsed}s plus rapide.`);
    } else if (elapsed <= currentRound.targetSec * 1.05) {
      setRoundFeedback('Dans la cible. Bonne régularité.');
    } else {
      setRoundFeedback(`${elapsed - currentRound.targetSec}s derrière. Technique prioritaire.`);
    }

    const isLast = roundIdx >= rounds.length - 1;
    if (isLast) {
      void finish(nextResults);
      return;
    }
    setRestRemaining(Math.max(30, Math.round(elapsed * REST_RATIO)));
  };

  const skipRest = (): void => {
    setRestRemaining(0);
    setRoundIdx((i) => i + 1);
    setElapsed(0);
    setReps(0);
    setRoundFeedback(null);
  };

  const finish = async (allResults: RoundResult[]): Promise<void> => {
    setPhase('summary');
    const user = auth.currentUser;
    if (!user) return;

    const stations = aggregateStations(allResults);
    const weakest = stations
      .filter((s) => s.weakness_score < -5)
      .sort((a, b) => a.weakness_score - b.weakness_score)
      .map((s) => s.station_id);

    try {
      await saveHyroxSession(user.uid, {
        date: todayDateString(),
        session_type: sessionType,
        block_phase: blockPhase,
        stations,
        total_time_sec: sessionType === 'race_simulation' ? allResults.reduce((a, r) => a + r.timeSec, 0) : null,
        cumulative_lactate: Math.round(lactate * 10) / 10,
        zone_score_at_start: zoneScore,
      });
      if (weakest.length > 0) await updateWeakStations(user.uid, weakest.slice(0, 4));
    } catch {
      // surfaced in summary
    }
  };

  const onClose = (): void => router.replace('/(app)/(tabs)/program');

  if (phase === 'loading') {
    return (
      <SafeScreen>
        <View style={styles.center}>
          <ZoneText variant="body" color={colors.text.muted}>
            Préparation de ta séance Hyrox
          </ZoneText>
        </View>
      </SafeScreen>
    );
  }

  if (phase === 'gate') {
    return (
      <GateView
        zoneScore={zoneScore ?? 0}
        onContinue={() => setPhase('pre')}
        onTechnique={() => {
          setTechniqueOnly(true);
          setPhase('pre');
        }}
        onCancel={() => router.back()}
      />
    );
  }

  if (phase === 'summary') {
    return (
      <SummaryView
        accent={accent}
        sessionType={sessionType}
        results={results}
        lactate={lactate}
        isPro={isPro}
        onClose={onClose}
      />
    );
  }

  if (phase === 'pre') {
    return (
      <PreView
        accent={accent}
        sessionType={sessionType}
        rounds={rounds}
        adaptation={adaptation}
        zoneScore={zoneScore}
        techniqueOnly={techniqueOnly}
        onStart={() => {
          setPhase('work');
          setRoundIdx(0);
          setElapsed(0);
          setReps(0);
        }}
        onClose={() => router.back()}
      />
    );
  }

  // phase === 'work'
  const resting = restRemaining > 0;
  const showFeedbackRest = roundFeedback !== null && !timerActive;

  return (
    <SafeScreen edges={['top', 'left', 'right']}>
      <View style={[styles.topStrip, { backgroundColor: accent }]}>
        <ZoneText variant="caption" style={styles.topStripText}>
          {station?.name ?? 'Station'} · Round {currentRound ? currentRound.roundNumber : 0}/
          {currentRound?.totalRounds ?? 0}
        </ZoneText>
        {isPro ? (
          <View style={[styles.lactateBadge, { borderColor: lactateInfo.color }]}>
            <ZoneText style={[styles.lactateBadgeText, { color: lactateInfo.color }]}>
              LAC {lactateInfo.total}
            </ZoneText>
          </View>
        ) : null}
      </View>

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onClose} hitSlop={16} style={styles.closeBtn}>
          <X size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <ZoneText variant="caption" color={colors.text.muted}>
          {roundIdx + 1}/{rounds.length}
        </ZoneText>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {showFeedbackRest ? (
          <View style={styles.restCard}>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
              RÉCUPÉRATION
            </ZoneText>
            <ZoneText variant="heading" style={[styles.restValue, { color: accent }]}>
              {mmss(restRemaining)}
            </ZoneText>
            <ZoneText variant="body" color={colors.text.primary} style={styles.feedbackText}>
              {roundFeedback}
            </ZoneText>
            {isPro ? (
              <ZoneText variant="caption" color={colors.text.secondary} style={styles.restNote}>
                FC estimée ~165 bpm · Zone 4 · {lactateInfo.message}
              </ZoneText>
            ) : (
              <LockedHint label="Lactate et FC en Pro" />
            )}
            <View style={styles.restBtn}>
              <Button title="Round suivant" onPress={skipRest} />
            </View>
          </View>
        ) : (
          <>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
              CIBLE {mmss(zoneAdjustedTarget(currentRound?.targetSec ?? 0, adaptation))}
              {currentRound?.targetReps ? ` · ${currentRound.targetReps} reps` : ''}
              {station?.id === 'wall_balls' ? ` · ballon ${wallBallWeightKg(gender)} kg` : ''}
            </ZoneText>
            <ZoneText
              variant="heading"
              style={[styles.timer, { color: roundTimerColor(elapsed, zoneAdjustedTarget(currentRound?.targetSec ?? 0, adaptation)) }]}
            >
              {mmss(elapsed)}
            </ZoneText>

            {timerActive ? (
              <ZoneText variant="body" color={colors.text.secondary} style={styles.cue}>
                {cue}
              </ZoneText>
            ) : (
              <ZoneText variant="caption" color={colors.text.muted} style={styles.cue}>
                {station?.pacingStrategy ?? ''}
              </ZoneText>
            )}

            {isRepBased && timerActive ? (
              <View style={styles.repWrap}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.repButton, { borderColor: accent }]}
                  onPress={() => setReps((r) => r + 1)}
                >
                  <ZoneText variant="heading" style={[styles.repValue, { color: accent }]}>
                    {reps}
                  </ZoneText>
                  <ZoneText variant="caption" color={colors.text.muted}>
                    / {currentRound?.targetReps ?? station?.reps ?? 0} reps · appuie
                  </ZoneText>
                </TouchableOpacity>
                {reps > 0 && isPro ? (
                  <ZoneText variant="caption" color={colors.text.muted} style={styles.projection}>
                    À ce rythme: {mmss(Math.round((elapsed / reps) * (currentRound?.targetReps ?? reps)))}
                  </ZoneText>
                ) : null}
              </View>
            ) : null}

            <View style={styles.workBtn}>
              <Button
                title={timerActive ? 'Arrêter' : 'Démarrer'}
                onPress={timerActive ? stopWork : startWork}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeScreen>
  );
}

function buildRounds(
  type: HyroxSessionTypeKey,
  profile: HyroxProfile | null,
  averages: Record<string, number>,
  gender: Gender | null,
): PlannedRound[] {
  if (type === 'race_simulation') {
    return HYROX_STATION_ORDER.map((id, i) => {
      const s = getHyroxStation(id);
      return {
        stationId: id,
        roundNumber: i + 1,
        totalRounds: 8,
        targetSec: Math.round(s.raceTimeTarget * hyroxStationTimeFactor(id, gender)),
        targetReps: s.reps ?? null,
      };
    });
  }

  if (type === 'station_work') {
    const profileWeak = (profile?.weak_stations ?? []).filter((s): s is HyroxStationKey =>
      HYROX_STATION_ORDER.includes(s as HyroxStationKey),
    );
    const scores = HYROX_STATION_ORDER.map((id) => {
      const s = getHyroxStation(id);
      const avg = averages[id];
      const score = avg && avg > 0 ? ((s.raceTimeTarget - avg) / s.raceTimeTarget) * 100 : profileWeak.includes(id) ? -25 : 0;
      return { id, score };
    });
    const selected = selectTrainingStations(scores, profileWeak.slice(0, 3));
    const out: PlannedRound[] = [];
    for (const id of selected) {
      const s = getHyroxStation(id);
      const factor = hyroxStationTimeFactor(id, gender);
      for (let r = 1; r <= STATION_ROUNDS; r += 1) {
        out.push({
          stationId: id,
          roundNumber: r,
          totalRounds: STATION_ROUNDS,
          targetSec: Math.round(s.raceTimeTarget * STATION_WORK_FRACTION * factor),
          targetReps: s.reps ? Math.round(s.reps * STATION_WORK_FRACTION) : null,
        });
      }
    }
    return out;
  }

  // running_base / strength_base: single guided continuous effort.
  const fallback = getHyroxStation(type === 'strength_base' ? 'sled_push' : 'row_erg');
  return [
    {
      stationId: fallback.id,
      roundNumber: 1,
      totalRounds: 1,
      targetSec: type === 'strength_base' ? 50 * 60 : 50 * 60,
      targetReps: null,
    },
  ];
}

function aggregateStations(results: RoundResult[]): HyroxStationResult[] {
  const byStation = new Map<string, RoundResult[]>();
  for (const r of results) {
    const list = byStation.get(r.stationId) ?? [];
    list.push(r);
    byStation.set(r.stationId, list);
  }
  const out: HyroxStationResult[] = [];
  for (const [id, list] of byStation) {
    const avg = list.reduce((a, r) => a + r.timeSec, 0) / list.length;
    const station = getHyroxStation(id as HyroxStationKey);
    const rating = rateWeakness(station.raceTimeTarget, avg);
    out.push({
      station_id: id,
      rounds: list.map((r) => ({ time_sec: r.timeSec, ...(r.reps !== null ? { reps: r.reps } : {}) })),
      avg_time_sec: Math.round(avg),
      weakness_score: rating.score,
    });
  }
  return out;
}

function LockedHint({ label }: { label: string }): React.ReactElement {
  return (
    <View style={styles.lockedRow}>
      <Lock size={11} color={colors.accent.gold} />
      <ZoneText variant="caption" color={colors.accent.gold} style={styles.lockedText}>
        {label}
      </ZoneText>
    </View>
  );
}

function GateView({
  zoneScore,
  onContinue,
  onTechnique,
  onCancel,
}: {
  zoneScore: number;
  onContinue: () => void;
  onTechnique: () => void;
  onCancel: () => void;
}): React.ReactElement {
  return (
    <SafeScreen>
      <View style={styles.gateWrap}>
        <TouchableOpacity onPress={onCancel} hitSlop={16} style={styles.closeBtn}>
          <X size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.gateCard}>
          <ZoneText variant="caption" color={colors.orbe.red} style={styles.eyebrow}>
            ZONE {zoneScore} · ÉPUISÉ
          </ZoneText>
          <ZoneText variant="heading" style={styles.gateTitle}>
            Séance Hyrox à risque
          </ZoneText>
          <ZoneText variant="body" color={colors.text.secondary} style={styles.gateBody}>
            Zone score insuffisant pour une séance Hyrox intense. Risque élevé de blessure et de
            fatigue chronique. Recommandation: récupération active ou repos.
          </ZoneText>
          <View style={styles.gateActions}>
            <Button title="Séance technique uniquement" onPress={onTechnique} />
            <View style={{ height: 10 }} />
            <Button title="Continuer quand même" variant="secondary" onPress={onContinue} />
          </View>
        </View>
      </View>
    </SafeScreen>
  );
}

function PreView({
  accent,
  sessionType,
  rounds,
  adaptation,
  zoneScore,
  techniqueOnly,
  onStart,
  onClose,
}: {
  accent: string;
  sessionType: HyroxSessionTypeKey;
  rounds: PlannedRound[];
  adaptation: HyroxZoneRaceAdaptation;
  zoneScore: number | null;
  techniqueOnly: boolean;
  onStart: () => void;
  onClose: () => void;
}): React.ReactElement {
  const uniqueStations = Array.from(new Set(rounds.map((r) => r.stationId)));
  const title =
    sessionType === 'race_simulation'
      ? 'Simulation de course'
      : sessionType === 'station_work'
        ? 'Travail aux stations'
        : sessionType === 'strength_base'
          ? 'Renforcement fonctionnel'
          : 'Base running';
  return (
    <SafeScreen>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onClose} hitSlop={16} style={styles.closeBtn}>
          <X size={24} color={colors.text.primary} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <ZoneText variant="caption" color={accent} style={styles.eyebrow}>
          HYROX
        </ZoneText>
        <ZoneText variant="heading" style={styles.preTitle}>
          {title.toUpperCase()}
        </ZoneText>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.preZone}>
          {zoneScore !== null ? `Zone score: ${zoneScore} · Objectifs à ${Math.round(adaptation.targetMultiplier * 100)}%` : 'Pas de check-in'}
          {techniqueOnly ? ' · technique uniquement' : ''}
        </ZoneText>
        <ZoneText variant="body" color={colors.text.secondary} style={styles.preMessage}>
          {adaptation.message}
        </ZoneText>

        {uniqueStations.map((id) => {
          const s = getHyroxStation(id);
          const round = rounds.find((r) => r.stationId === id);
          const target = zoneAdjustedTarget(round?.targetSec ?? s.raceTimeTarget, adaptation);
          return (
            <View key={id} style={styles.stationCard}>
              <View style={styles.stationCardHead}>
                <ZoneText variant="label" color={colors.text.primary}>
                  {s.name}
                </ZoneText>
                <ZoneText variant="caption" color={accent}>
                  cible {mmss(target)}
                </ZoneText>
              </View>
              <ZoneText variant="caption" color={colors.text.muted} style={styles.stationPacing}>
                {s.pacingStrategy}
              </ZoneText>
            </View>
          );
        })}
      </ScrollView>
      <View style={styles.preFooter}>
        <Button title="Commencer" onPress={onStart} />
      </View>
    </SafeScreen>
  );
}

function SummaryView({
  accent,
  sessionType,
  results,
  lactate,
  isPro,
  onClose,
}: {
  accent: string;
  sessionType: HyroxSessionTypeKey;
  results: RoundResult[];
  lactate: number;
  isPro: boolean;
  onClose: () => void;
}): React.ReactElement {
  const stations = aggregateStations(results);
  const totalSec = results.reduce((a, r) => a + r.timeSec, 0);
  // Bottleneck: stations slower than target, weighted by impact.
  const bottlenecks = stations
    .map((s) => {
      const station = getHyroxStation(s.station_id as HyroxStationKey);
      return { name: station.name, deficit: s.avg_time_sec - station.raceTimeTarget };
    })
    .filter((b) => b.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit)
    .slice(0, 3);

  return (
    <SafeScreen>
      <ScrollView contentContainerStyle={styles.summaryScroll} showsVerticalScrollIndicator={false}>
        <ZoneText variant="caption" color={colors.text.muted} style={styles.summaryEyebrow}>
          {sessionType === 'race_simulation' ? 'SIMULATION TERMINÉE' : 'SÉANCE TERMINÉE'}
        </ZoneText>
        <ZoneText variant="heading" style={[styles.summaryTime, { color: accent }]}>
          {sessionType === 'race_simulation' ? formatDuration(totalSec) : `${stations.length} stations`}
        </ZoneText>

        <View style={styles.summaryCard}>
          {stations.map((s) => {
            const station = getHyroxStation(s.station_id as HyroxStationKey);
            const rating = rateWeakness(station.raceTimeTarget, s.avg_time_sec);
            return (
              <View key={s.station_id} style={styles.summaryRow}>
                <ZoneText variant="caption" color={colors.text.primary} style={styles.summaryStation}>
                  {station.name}
                </ZoneText>
                <ZoneText variant="caption" color={colors.text.muted} style={styles.summaryAvg}>
                  moy {mmss(s.avg_time_sec)}
                </ZoneText>
                <ZoneText variant="caption" color={rating.color} style={styles.summaryRating}>
                  {rating.label}
                </ZoneText>
              </View>
            );
          })}
        </View>

        {isPro && bottlenecks.length > 0 ? (
          <View style={styles.bottleneckCard}>
            <ZoneText variant="caption" color={colors.text.muted} style={styles.eyebrow}>
              STATIONS LES PLUS COÛTEUSES
            </ZoneText>
            {bottlenecks.map((b) => (
              <ZoneText key={b.name} variant="caption" color={colors.text.primary} style={styles.bottleneckRow}>
                {b.name}: +{b.deficit}s vs objectif
              </ZoneText>
            ))}
          </View>
        ) : null}

        {isPro ? (
          <ZoneText variant="caption" color={colors.text.muted} style={styles.lactateSummary}>
            Charge métabolique cumulée: {Math.round(lactate * 10) / 10}
          </ZoneText>
        ) : (
          <LockedHint label="Analyse lactate et bottlenecks en Pro" />
        )}

        <ZoneText variant="caption" color={colors.text.muted} style={styles.refs}>
          Tschakert & Hofmann (2013) · Billat (2003) · NSCA work:rest 1:2
        </ZoneText>
      </ScrollView>
      <View style={styles.preFooter}>
        <Button title="Retour au programme" onPress={onClose} />
      </View>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topStrip: { paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topStripText: { flex: 1, color: colors.bg.primary, fontFamily: 'Inter-Bold', fontSize: 12, letterSpacing: 0.3 },
  lactateBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  lactateBadgeText: { fontFamily: 'Inter-Bold', fontSize: 10, letterSpacing: 0.5 },
  headerRow: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  scroll: { paddingHorizontal: 24, paddingBottom: 40, alignItems: 'center' },
  eyebrow: { letterSpacing: 2, fontFamily: 'Inter-Bold' },
  timer: { fontSize: 84, lineHeight: 90, marginTop: 18 },
  cue: { textAlign: 'center', marginTop: 12, marginHorizontal: 12, minHeight: 40 },
  repWrap: { alignItems: 'center', marginTop: 16 },
  repButton: { width: 180, height: 180, borderRadius: 90, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  repValue: { fontSize: 64, lineHeight: 70 },
  projection: { marginTop: 12 },
  workBtn: { marginTop: 28, alignSelf: 'stretch' },
  restCard: { alignSelf: 'stretch', alignItems: 'center', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 20, marginTop: 16 },
  restValue: { fontSize: 64, lineHeight: 70, marginTop: 8 },
  feedbackText: { textAlign: 'center', marginTop: 12 },
  restNote: { textAlign: 'center', marginTop: 10, lineHeight: 16 },
  restBtn: { marginTop: 20, alignSelf: 'stretch' },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  lockedText: { fontFamily: 'Inter-Bold', fontSize: 11, letterSpacing: 0.5 },
  gateWrap: { flex: 1, padding: 20 },
  gateCard: { marginTop: 12, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.orbe.red, borderRadius: 16, padding: 20 },
  gateTitle: { fontSize: 26, color: colors.text.primary, marginTop: 8 },
  gateBody: { marginTop: 12, lineHeight: 20 },
  gateActions: { marginTop: 22 },
  preTitle: { fontSize: 30, color: colors.text.primary, marginTop: 4 },
  preZone: { marginTop: 8, letterSpacing: 0.5 },
  preMessage: { marginTop: 10, lineHeight: 20, alignSelf: 'stretch' },
  stationCard: { alignSelf: 'stretch', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginTop: 12 },
  stationCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stationPacing: { marginTop: 6, lineHeight: 16 },
  preFooter: { padding: 24, paddingTop: 8 },
  summaryScroll: { padding: 24, alignItems: 'center' },
  summaryEyebrow: { letterSpacing: 2, marginTop: 24 },
  summaryTime: { fontSize: 56, lineHeight: 60, marginTop: 6 },
  summaryCard: { alignSelf: 'stretch', marginTop: 24, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 5 },
  summaryStation: { flex: 1, fontSize: 12 },
  summaryAvg: { width: 70, textAlign: 'center', fontSize: 11 },
  summaryRating: { width: 120, textAlign: 'right', fontSize: 11 },
  bottleneckCard: { alignSelf: 'stretch', marginTop: 16, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14 },
  bottleneckRow: { marginTop: 6 },
  lactateSummary: { marginTop: 16 },
  refs: { marginTop: 24, textAlign: 'center', fontSize: 10, lineHeight: 15 },
});
