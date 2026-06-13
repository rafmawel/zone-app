/**
 * Hyrox energy-system and periodization science.
 *
 * Pure helpers for the Hyrox session executor and program tab:
 *   - cumulative lactate model (Billat 2003)
 *   - station weakness scoring and selection
 *   - race-time prediction
 *   - Zone-score race adaptation
 *   - periodization blocks (4-block macrocycle)
 *   - energy-system breakdown (Tschakert & Hofmann 2013)
 *   - weekly coach insights
 *
 * Work-to-rest for anaerobic stations uses the NSCA 1:2 ratio.
 */

import {
  getHyroxStation,
  HYROX_STATIONS,
  type HyroxEnergySystem,
  type HyroxStationKey,
} from '@/data/hyroxStations';
import { colors } from '@/theme/colors';

// ---------------------------------------------------------------------------
// Lactate accumulation
// ---------------------------------------------------------------------------

export interface LactateStatus {
  total: number;
  color: string;
  message: string;
}

export function lactateStatus(total: number): LactateStatus {
  const t = Math.max(0, Math.round(total * 10) / 10);
  if (t < 12) {
    return { total: t, color: colors.orbe.green, message: 'Système aérobie dominant. Rythme soutenable.' };
  }
  if (t < 20) {
    return { total: t, color: colors.orbe.blue, message: 'Accumulation lactique modérée. Respiration contrôlée.' };
  }
  if (t < 30) {
    return { total: t, color: colors.scoreGreen, message: 'Zone rouge approche. Le prochain run sera difficile.' };
  }
  if (t < 40) {
    return { total: t, color: colors.orbe.amber, message: 'Acidose métabolique. Ralentis immédiatement.' };
  }
  return { total: t, color: colors.orbe.red, message: 'Stop ou marche, tu détruiras les 2 prochaines stations.' };
}

/** Lactate added by holding a running km at a given pace vs easy pace. */
export function runningLactateLoad(paceSecPerKm: number, easyPaceSecPerKm: number): number {
  if (!Number.isFinite(paceSecPerKm) || !Number.isFinite(easyPaceSecPerKm)) return 1;
  // Faster than easy pace costs more; +1.0 at easy, up to ~3.5 at race pace.
  const ratio = easyPaceSecPerKm > 0 ? easyPaceSecPerKm / paceSecPerKm : 1;
  return Math.max(1, Math.min(3.5, 1 + (ratio - 1) * 6));
}

// ---------------------------------------------------------------------------
// Energy-system breakdown
// ---------------------------------------------------------------------------

export interface EnergyBreakdown {
  atp_pcr: number;
  glycolytic: number;
  oxidative: number;
}

const EMPTY_BREAKDOWN: EnergyBreakdown = { atp_pcr: 0, glycolytic: 0, oxidative: 0 };

/**
 * Normalised 0-1 contribution of each energy system across the stations
 * used (plus an optional running oxidative contribution).
 */
export function energySystemBreakdown(
  stationIds: HyroxStationKey[],
  runningOxidativeUnits = 0,
): EnergyBreakdown {
  const raw: EnergyBreakdown = { ...EMPTY_BREAKDOWN, oxidative: Math.max(0, runningOxidativeUnits) };
  for (const id of stationIds) {
    const station = getHyroxStation(id);
    raw[station.primarySystem] += station.lactateLoad;
  }
  const total = raw.atp_pcr + raw.glycolytic + raw.oxidative;
  if (total <= 0) return { ...EMPTY_BREAKDOWN };
  return {
    atp_pcr: raw.atp_pcr / total,
    glycolytic: raw.glycolytic / total,
    oxidative: raw.oxidative / total,
  };
}

export const ENERGY_SYSTEM_LABELS: Record<HyroxEnergySystem, string> = {
  atp_pcr: 'ATP-PCr',
  glycolytic: 'Glycolytique',
  oxidative: 'Oxydatif',
};

// ---------------------------------------------------------------------------
// Weakness scoring
// ---------------------------------------------------------------------------

export type WeaknessKind = 'strength' | 'normal' | 'to_work' | 'priority';

export interface WeaknessRating {
  /** (target - actual) / target * 100. Positive = faster than target. */
  score: number;
  kind: WeaknessKind;
  label: string;
  color: string;
}

export function rateWeakness(targetTimeSec: number, actualTimeSec: number): WeaknessRating {
  const score = targetTimeSec > 0 ? ((targetTimeSec - actualTimeSec) / targetTimeSec) * 100 : 0;
  let kind: WeaknessKind;
  let label: string;
  let color: string;
  if (score > 10) {
    kind = 'strength';
    label = 'Point fort';
    color = colors.orbe.green;
  } else if (score >= -5) {
    kind = 'normal';
    label = 'Dans la norme';
    color = colors.orbe.blue;
  } else if (score >= -20) {
    kind = 'to_work';
    label = 'Point à travailler';
    color = colors.orbe.amber;
  } else {
    kind = 'priority';
    label = 'Point faible prioritaire';
    color = colors.orbe.red;
  }
  return { score: Math.round(score * 10) / 10, kind, label, color };
}

export interface StationScore {
  id: HyroxStationKey;
  /** Weakness score; lower (more negative) = weaker. */
  score: number;
}

/**
 * Select 3 stations to train: 2 weakest-priority + 1 to-work, weighted by
 * race impact, never repeating the exact same trio as last time.
 */
export function selectTrainingStations(
  scores: StationScore[],
  lastSelection: HyroxStationKey[] = [],
): HyroxStationKey[] {
  const byId = new Map(scores.map((s) => [s.id, s.score]));
  // Rank every station by deficit weighted by race impact (weakest first).
  const ranked = HYROX_STATIONS.map((station) => {
    const score = byId.get(station.id) ?? 0;
    const deficit = Math.max(0, -score);
    return { id: station.id, priority: deficit * station.raceImpactWeight, score };
  }).sort((a, b) => b.priority - a.priority);

  const lastSet = new Set(lastSelection);
  const pick: HyroxStationKey[] = [];
  // Prefer stations not in the previous selection to force variety.
  for (const r of ranked) {
    if (pick.length >= 3) break;
    if (lastSelection.length === 3 && lastSet.has(r.id) && ranked.length > 3) continue;
    pick.push(r.id);
  }
  // Backfill if variety filtering left us short.
  for (const r of ranked) {
    if (pick.length >= 3) break;
    if (!pick.includes(r.id)) pick.push(r.id);
  }
  return pick.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Periodization
// ---------------------------------------------------------------------------

export type HyroxBlockPhase = 1 | 2 | 3 | 4;

export interface HyroxBlockInfo {
  block: HyroxBlockPhase;
  name: string;
  weeksRange: string;
  priority: string;
  stationIntensity: string;
  runningFocus: string;
  keyMetric: string;
}

export const HYROX_BLOCKS: Record<HyroxBlockPhase, HyroxBlockInfo> = {
  1: {
    block: 1,
    name: 'Base aérobie',
    weeksRange: 'Semaines 1-4',
    priority: 'Moteur aérobie et technique',
    stationIntensity: '50% allure course, forme parfaite',
    runningFocus: '80% facile (MAF), 20% modéré',
    keyMetric: 'Progression VDOT',
  },
  2: {
    block: 2,
    name: 'Endurance-force',
    weeksRange: 'Semaines 5-8',
    priority: 'Capacité aux stations et allure course',
    stationIntensity: '70-80% allure course',
    runningFocus: 'Tempo et seuil',
    keyMetric: 'Temps aux stations',
  },
  3: {
    block: 3,
    name: 'Spécificité course',
    weeksRange: 'Semaines 9-12',
    priority: 'Simulation de course',
    stationIntensity: '90-100% allure course',
    runningFocus: 'Intervalles allure course',
    keyMetric: 'Temps de course projeté',
  },
  4: {
    block: 4,
    name: 'Affûtage',
    weeksRange: 'Semaines 13-14',
    priority: 'Fraîcheur pour le jour J',
    stationIntensity: 'Volume -50%, intensité maintenue',
    runningFocus: 'Une simulation finale à 70%',
    keyMetric: 'TSB cible +10 à +20',
  },
};

/** Derive the current block from weeks remaining before the race. */
export function blockFromWeeksToRace(weeksToRace: number | null): HyroxBlockPhase {
  if (weeksToRace === null) return 2;
  if (weeksToRace <= 2) return 4;
  if (weeksToRace <= 5) return 3;
  if (weeksToRace <= 9) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Zone-score race adaptation
// ---------------------------------------------------------------------------

export interface HyroxZoneRaceAdaptation {
  /** Multiplier applied to target times (1.0 = full race effort). */
  targetMultiplier: number;
  message: string;
  /** True when the score is too low to train hard. */
  warn: boolean;
  techniqueOnly: boolean;
}

export function hyroxZoneRaceAdaptation(zoneScore: number | null): HyroxZoneRaceAdaptation {
  if (zoneScore === null || zoneScore >= 80) {
    return { targetMultiplier: 1.0, message: 'Conditions optimales. Race pace.', warn: false, techniqueOnly: false };
  }
  if (zoneScore >= 60) {
    return { targetMultiplier: 0.95, message: 'Séance productive. Légère réserve.', warn: false, techniqueOnly: false };
  }
  if (zoneScore >= 40) {
    return { targetMultiplier: 0.85, message: 'Focus technique. Pas de PR aujourd’hui.', warn: false, techniqueOnly: false };
  }
  return {
    targetMultiplier: 0.85,
    message:
      'Zone score insuffisant pour une séance Hyrox intense. Risque élevé de blessure et de fatigue chronique. Recommandation: récupération active ou repos.',
    warn: true,
    techniqueOnly: true,
  };
}

/** Apply the Zone multiplier to a target time (longer = easier target). */
export function zoneAdjustedTarget(targetSec: number, adaptation: HyroxZoneRaceAdaptation): number {
  if (adaptation.targetMultiplier <= 0) return targetSec;
  return Math.round(targetSec / adaptation.targetMultiplier);
}

// ---------------------------------------------------------------------------
// Round timer colour
// ---------------------------------------------------------------------------

export function roundTimerColor(elapsedSec: number, targetSec: number): string {
  if (targetSec <= 0) return colors.scoreGreen;
  const ratio = elapsedSec / targetSec;
  if (ratio <= 0.95) return colors.orbe.green;
  if (ratio <= 1.05) return colors.scoreGreen;
  if (ratio <= 1.15) return colors.orbe.amber;
  return colors.orbe.red;
}

// ---------------------------------------------------------------------------
// Race prediction
// ---------------------------------------------------------------------------

export interface RacePrediction {
  totalSec: number;
  runSec: number;
  stationSec: number;
  transitionSec: number;
  runPaceSecPerKm: number;
  stationAvgSec: number;
  goalSec: number | null;
  vsGoalSec: number | null;
}

const RACE_PRESSURE = 1.05;
const TRANSITION_SEC = 30;

/**
 * Predict race time from a running pace and recent per-station averages.
 *
 * @param runPaceSecPerKm projected race km pace
 * @param stationAvgSec per-station average (falls back to target time)
 * @param goalSec optional goal time
 */
export function computeRacePrediction(
  runPaceSecPerKm: number,
  stationAvgSec: Partial<Record<HyroxStationKey, number>>,
  goalSec: number | null,
): RacePrediction {
  const runSec = Math.round(runPaceSecPerKm * 8);
  let stationSec = 0;
  for (const station of HYROX_STATIONS) {
    const avg = stationAvgSec[station.id];
    const base = avg && avg > 0 ? avg : station.raceTimeTarget;
    stationSec += base * RACE_PRESSURE;
  }
  stationSec = Math.round(stationSec);
  const transitionSec = 8 * TRANSITION_SEC;
  const totalSec = runSec + stationSec + transitionSec;
  return {
    totalSec,
    runSec,
    stationSec,
    transitionSec,
    runPaceSecPerKm: Math.round(runPaceSecPerKm),
    stationAvgSec: Math.round(stationSec / 8),
    goalSec,
    vsGoalSec: goalSec !== null ? totalSec - goalSec : null,
  };
}

// ---------------------------------------------------------------------------
// Weekly coach insights
// ---------------------------------------------------------------------------

export interface StationHistoryPoint {
  date: string;
  stationId: HyroxStationKey;
  avgTimeSec: number;
}

export interface HyroxCoachInsights {
  positive: string | null;
  watch: string | null;
  recommendation: string | null;
}

/**
 * Three weekly insights from recent station history: best progress, the
 * most concerning trend, and a focused recommendation.
 */
export function hyroxCoachInsights(history: StationHistoryPoint[]): HyroxCoachInsights {
  const byStation = new Map<HyroxStationKey, StationHistoryPoint[]>();
  for (const p of history) {
    const list = byStation.get(p.stationId) ?? [];
    list.push(p);
    byStation.set(p.stationId, list);
  }

  let bestImprovementSec = 0;
  let bestStation: HyroxStationKey | null = null;
  let worstRegressionSec = 0;
  let worstStation: HyroxStationKey | null = null;

  for (const [id, pointsRaw] of byStation) {
    const points = [...pointsRaw].sort((a, b) => a.date.localeCompare(b.date));
    if (points.length < 2) continue;
    const delta = points[points.length - 1].avgTimeSec - points[0].avgTimeSec;
    if (delta < bestImprovementSec) {
      bestImprovementSec = delta;
      bestStation = id;
    }
    if (delta > worstRegressionSec) {
      worstRegressionSec = delta;
      worstStation = id;
    }
  }

  const positive =
    bestStation !== null && bestImprovementSec < 0
      ? `${getHyroxStation(bestStation).name}: ${Math.abs(Math.round(bestImprovementSec))}s gagnées. Ta technique porte ses fruits.`
      : null;
  const watch =
    worstStation !== null && worstRegressionSec > 0
      ? `${getHyroxStation(worstStation).name}: ${Math.round(worstRegressionSec)}s perdues. Signe d’une récupération insuffisante.`
      : null;

  // Recommendation: two highest-impact stations slower than target.
  const deficits = HYROX_STATIONS.map((station) => {
    const points = byStation.get(station.id);
    const latest = points && points.length > 0 ? points[points.length - 1].avgTimeSec : station.raceTimeTarget;
    const deficit = Math.max(0, latest - station.raceTimeTarget) * station.raceImpactWeight;
    return { id: station.id, deficit };
  })
    .filter((d) => d.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit)
    .slice(0, 2);

  const recommendation =
    deficits.length > 0
      ? `Cette semaine: priorité ${deficits.map((d) => getHyroxStation(d.id).name).join(' + ')}. Ce sont tes plus gros déficits sur le chrono.`
      : null;

  return { positive, watch, recommendation };
}

// ---------------------------------------------------------------------------
// Weekly scheduler
// ---------------------------------------------------------------------------

export type HyroxDayPlan =
  | 'station_work'
  | 'running_base'
  | 'strength_base'
  | 'race_simulation'
  | 'rest';

/**
 * Mon-Sun plan from weekly frequency and block. Race simulations only
 * appear in block 3; harder days are spaced to protect recovery.
 */
export function hyroxWeeklyPlan(sessionsPerWeek: number, block: HyroxBlockPhase): HyroxDayPlan[] {
  const freq = Math.max(3, Math.min(6, sessionsPerWeek));
  const sim: HyroxDayPlan = block >= 3 ? 'race_simulation' : 'station_work';
  if (freq <= 3) {
    return ['station_work', 'rest', 'running_base', 'rest', 'strength_base', 'rest', 'rest'];
  }
  if (freq === 4) {
    return ['station_work', 'running_base', 'rest', 'strength_base', 'rest', sim, 'rest'];
  }
  if (freq === 5) {
    return ['station_work', 'running_base', 'rest', 'strength_base', 'station_work', sim, 'rest'];
  }
  return ['station_work', 'running_base', 'strength_base', 'station_work', 'running_base', sim, 'rest'];
}

export const HYROX_DAY_LABELS: Record<HyroxDayPlan, string> = {
  station_work: 'Stations',
  running_base: 'Course',
  strength_base: 'Force',
  race_simulation: 'Simulation',
  rest: 'Repos',
};

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}'${String(sec).padStart(2, '0')}`;
  return `${m}'${String(sec).padStart(2, '0')}`;
}
