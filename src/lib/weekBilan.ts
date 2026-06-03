/**
 * Bridge between the progression engine and the Aujourd'hui / Programme
 * UI.
 *
 * Given the persisted week state and the sport profile, build the inputs
 * for {@link checkWeekProgression} and turn the result into a
 * {@link BilanSummary} the {@link BilanCard} can render.
 */

import type { BilanStatus, BilanSummary } from '@/components/BilanCard';
import type { Gender } from './firestore';
import type { ProSport, SportProfile, WeekData, WeekProgressionResult } from './weekProgression';
import { checkWeekProgression, getSportConfig } from './weekProgression';
import type { WeekState } from './weekTracking';

const SPORT_LABELS: Record<string, string> = {
  weightlifting: 'Haltérophilie',
  running: 'Course',
  musculation: 'Musculation',
  hyrox: 'Hyrox',
};

export function labelForSport(sport: ProSport): string {
  return SPORT_LABELS[sport] ?? sport;
}

export interface BilanInputs {
  sport: ProSport;
  weekNumber: number;
  state: WeekState;
  profile: SportProfile;
  gender: Gender;
}

function statusFor(
  sport: ProSport,
  state: WeekState,
  result: WeekProgressionResult,
): BilanStatus {
  if (result.shouldRepeat) return 'insufficient';
  const cfg = getSportConfig(sport);
  if (cfg.progressionType === 'volume') {
    const planned = state.plannedKm ?? 0;
    if (planned <= 0) return 'partial';
    const ratio = state.actualKm / planned;
    if (ratio >= cfg.completionThresholds.optimal) return 'full';
    if (ratio >= cfg.completionThresholds.partial) return 'partial';
    return 'insufficient';
  }
  if (state.plannedSessions <= 0) return 'partial';
  const ratio = state.completedSessions / state.plannedSessions;
  if (ratio >= cfg.completionThresholds.optimal) return 'full';
  if (ratio >= cfg.completionThresholds.partial) return 'partial';
  return 'insufficient';
}

export function buildWeekData(
  sport: ProSport,
  weekNumber: number,
  state: WeekState,
): WeekData {
  return {
    sport,
    weekNumber,
    plannedSessions: state.plannedSessions,
    completedSessions: state.completedSessions,
    plannedKm: state.plannedKm ?? undefined,
    actualKm: state.actualKm,
    muscleSets: state.muscleSets,
    stationsWorked: state.stationsWorked,
    startedAt: state.startedAt ?? new Date(),
  };
}

export function buildBilanSummary(inputs: BilanInputs): BilanSummary {
  const weekData = buildWeekData(inputs.sport, inputs.weekNumber, inputs.state);
  const result = checkWeekProgression(inputs.sport, weekData, inputs.profile, inputs.gender);
  return {
    sport: inputs.sport,
    sportLabel: labelForSport(inputs.sport),
    weekNumber: inputs.weekNumber,
    plannedSessions: inputs.state.plannedSessions,
    completedSessions: inputs.state.completedSessions,
    plannedKm: inputs.state.plannedKm,
    actualKm: inputs.state.actualKm,
    status: statusFor(inputs.sport, inputs.state, result),
    result,
  };
}

/**
 * The week is "ready for bilan" when it has been started, the
 * progression engine accepts an advance, or the seven day window has
 * lapsed. Used to decide when to surface the BilanCard.
 */
export function isWeekBilanReady(summary: BilanSummary): boolean {
  if (summary.result.canAdvance) return true;
  if (summary.result.shouldRepeat) return true;
  return false;
}

export const PROGRAMME_TOTAL_WEEKS = 12;

export function isProgrammeComplete(weekNumber: number): boolean {
  return weekNumber >= PROGRAMME_TOTAL_WEEKS;
}
