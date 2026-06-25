import { previewWeightliftingSession, projectProgram } from './programEngine';
import {
  blockWeekForAbsoluteWeek,
  buildSessionPlan,
  calculateVDOTPaces,
  getWeeklyDistribution,
  sessionName,
  type RunningSessionType,
} from './runningEngine';
import { generateMuscleSession } from './muscleEngine';
import { generateHyroxSession, type HyroxSessionType } from './hyroxEngine';
import { hyroxWeeklyPlan, type HyroxBlockPhase } from './hyroxScience';
import { getExerciseById } from '@/data/exercises';
import { normalizeQueueState, queueKey, type QueueSport } from './queueKeys';
import type {
  ExerciseMax,
  HyroxProfile,
  MuscleProfile,
  QueueState,
  RunningProfile,
  UserProgram,
} from './firestore';

export type QueueStatus = 'completed' | 'skipped' | 'available' | 'locked';
export { queueKey } from './queueKeys';
export type { QueueSport } from './queueKeys';

export interface QueueItem {
  key: string;
  sport: QueueSport;
  weekNumber: number;
  sessionIndex: number;
  name: string;
  exercises: string[];
  estimatedMinutes: number;
  status: QueueStatus;
  /** Launch parameters. */
  day: number;
  block: number;
  week: number;
  runningType?: RunningSessionType;
  /** Mirror the weekly-template flags so the launch-time build matches the
   *  preview-time build (otherwise EF strides / recovery would silently
   *  disappear on tap). */
  runningWithStrides?: boolean;
  runningRecovery?: boolean;
  hyroxType?: HyroxSessionType;
}

export interface BuildQueueInputs {
  program: UserProgram | null;
  maxes: ExerciseMax[];
  runningProfile: RunningProfile | null;
  muscleProfile: MuscleProfile | null;
  hyroxProfile: HyroxProfile | null;
  hyroxBlock: HyroxBlockPhase;
  state: QueueState;
  weeks?: number;
}

const SPORT_ORDER: QueueSport[] = ['weightlifting', 'running', 'musculation', 'hyrox'];
const SQUAT_IDS = new Set(['front_squat', 'back_squat_high', 'back_squat_low', 'overhead_squat']);

/**
 * Depth of the per-sport item pool. The queue builds this many weeks of
 * sessions per sport so that even after several blocks are closed out the
 * next "first incomplete week" is still reachable. Twelve covers a full
 * intermediate cycle (3 blocks × 4 weeks).
 */
const POOL_WEEKS = 12;

function exName(id: string): string {
  return getExerciseById(id)?.name ?? id;
}

function weightliftingName(exerciseIds: string[]): string {
  if (exerciseIds.length === 0) return 'Séance haltérophilie';
  const main = exName(exerciseIds[0]);
  const squat = exerciseIds.find((id) => SQUAT_IDS.has(id));
  if (squat && squat !== exerciseIds[0]) return `${main} · ${exName(squat)}`;
  if (exerciseIds[1]) return `${main} · ${exName(exerciseIds[1])}`;
  return main;
}

const HYROX_NAME: Record<HyroxSessionType, string> = {
  station_work: 'Stations · travail technique',
  running_base: 'Course base · endurance',
  strength_base: 'Renforcement · force fonctionnelle',
  race_simulation: 'Simulation de course',
};

function runningLevel(vdot: number): 'beginner' | 'intermediate' | 'advanced' {
  return vdot < 35 ? 'beginner' : vdot < 55 ? 'intermediate' : 'advanced';
}

/**
 * Mark every item in a single sport's queue. **Per-sport invariant — this
 * function never reads other sports' keys.** Weightlifting's advancement
 * to week 2 depends only on whether weightlifting's prior sessions are
 * done; whether running's week 1 is still in progress is irrelevant, and
 * vice-versa.
 *
 * Sequential within a sport: the first item without a stored
 * `completed` / `skipped` status becomes `available`; the rest are
 * `locked`. As soon as a week's last session is marked `completed`,
 * the next iteration of this loop turns the following week's first
 * session into `available` — that's the "week progression trigger"
 * the UI relies on.
 */
function assignSportStatuses(items: QueueItem[], state: QueueState): void {
  let blocked = false;
  for (const item of items) {
    const saved = state[item.key];
    if (saved?.status === 'completed') {
      item.status = 'completed';
      continue;
    }
    if (saved?.status === 'skipped') {
      item.status = 'skipped';
      continue;
    }
    if (!blocked) {
      item.status = 'available';
      blocked = true;
      continue;
    }
    item.status = 'locked';
  }
}

/**
 * Build the unified multi-sport queue, grouped by week.
 *
 * **Dynamic window per sport.** The queue scans up to `POOL_WEEKS` weeks
 * ahead for every configured sport, then picks each sport's "first
 * incomplete week" (the first week with at least one not-yet-done session)
 * and surfaces *that* week plus the next one. So if weightlifting has
 * already closed out weeks 1 and 2 while running is mid-week-1, the
 * weightlifting card shows week 3 (available + locked), and the running
 * card stays on week 1 — each sport advances on its own clock.
 *
 * @returns array indexed by display position (0 = each sport's current
 *   active week, 1 = each sport's next week, etc.), each holding the
 *   items every sport contributes for that display slot.
 */
export function buildProgrammeQueue(inputs: BuildQueueInputs): QueueItem[][] {
  const visibleWeeks = Math.max(1, inputs.weeks ?? 2);
  const perSport: Record<QueueSport, QueueItem[]> = {
    weightlifting: [],
    running: [],
    musculation: [],
    hyrox: [],
  };

  const { program, maxes, runningProfile, muscleProfile, hyroxProfile } = inputs;
  // Normalize the incoming state — convert pre-block legacy keys
  // (`{sport}_w{N}_s{M}`) to the canonical `{sport}_b{N}_w{N}_s{N}` shape
  // so completion data written by older versions still resolves against
  // the keys the queue generates today.
  const state = normalizeQueueState(inputs.state);

  // Weightlifting
  if (program && program.sport_key === 'weightlifting') {
    const perWeek = Math.max(1, Math.min(6, program.sessions_per_week));
    for (let w = 1; w <= POOL_WEEKS; w += 1) {
      const projected = projectProgram(program, w - 1);
      for (let s = 1; s <= perWeek; s += 1) {
        try {
          const p = previewWeightliftingSession(projected, maxes, s);
          const ids = p.exercises.map((e) => e.exerciseId);
          perSport.weightlifting.push({
            // Stable across completion-driven advancement (block/week, not the
            // relative display week) so a key is never reused for a new session.
            key: queueKey('weightlifting', projected.current_block, projected.current_week, s),
            sport: 'weightlifting',
            weekNumber: w,
            sessionIndex: s,
            name: weightliftingName(ids),
            exercises: ids.slice(0, 3).map(exName),
            estimatedMinutes: p.durationMin,
            status: 'locked',
            day: s,
            block: projected.current_block,
            week: projected.current_week,
          });
        } catch {
          // skip
        }
      }
    }
  }

  // Running
  if (runningProfile) {
    // VDOT drives the adaptive durations and session-type selection at runtime,
    // so the queue always reflects the athlete's current fitness — no stored
    // baked-in durations, no manual reconfiguration when the VDOT improves.
    const vdot = Number.isFinite(runningProfile.vdot) ? runningProfile.vdot : 35;
    const paces = calculateVDOTPaces(vdot);
    const level = runningLevel(vdot);
    // Honour the athlete's chosen weekly frequency. The engine clamps
    // to 2..6 internally, but we re-clamp here so an undefined or
    // out-of-range value never silently collapses to the default 3.
    const runPerWeek = Math.max(
      2,
      Math.min(
        6,
        Number.isFinite(runningProfile.sessions_per_week)
          ? Math.round(runningProfile.sessions_per_week)
          : 3,
      ),
    );
    const goalDistance = runningProfile.reference_distance ?? undefined;
    const goalTimeSeconds = runningProfile.goal_time_seconds ?? undefined;
    for (let w = 1; w <= POOL_WEEKS; w += 1) {
      // The queue key keeps the legacy block-1 / absolute-week shape (no data
      // migration), but the session content needs the real block / week-in-block:
      // both the session types (getWeeklyDistribution) and the durations depend
      // on it, so the distribution is recomputed per week rather than reused.
      const { block: slBlock, week: slWeek } = blockWeekForAbsoluteWeek(w);
      const dist = getWeeklyDistribution(runPerWeek, slBlock, slWeek, vdot);
      const slots = dist.items.filter((i) => i.type !== 'REST');
      slots.forEach((slot, idx) => {
        const s = idx + 1;
        const t = slot.type as RunningSessionType;
        const plan = buildSessionPlan({
          type: t,
          paces,
          level,
          block: slBlock,
          week: slWeek,
          vdot,
          withStrides: slot.withStrides,
          recovery: slot.recovery,
          goalDistance,
          goalTimeSeconds,
        });
        const labelSuffix = slot.recovery && t === 'EF' ? ' · récup' : slot.withStrides && t === 'EF' ? ' + foulées' : '';
        perSport.running.push({
          key: queueKey('running', 1, w, s),
          sport: 'running',
          weekNumber: w,
          sessionIndex: s,
          name: `${sessionName(t)}${labelSuffix} · ${plan.estimatedDistanceKm} km`,
          exercises: [`${plan.estimatedDistanceKm} km`, sessionName(t)],
          estimatedMinutes: plan.estimatedDurationMin,
          status: 'locked',
          day: s,
          block: 1,
          week: w,
          runningType: t,
          runningWithStrides: slot.withStrides,
          runningRecovery: slot.recovery,
        });
      });
    }
  }

  // Musculation
  if (muscleProfile) {
    const perWeek = Math.max(1, Math.min(6, muscleProfile.sessions_per_week));
    for (let w = 1; w <= POOL_WEEKS; w += 1) {
      for (let s = 1; s <= perWeek; s += 1) {
        try {
          const gen = generateMuscleSession({
            sessionsPerWeek: muscleProfile.sessions_per_week,
            dayOfWeek: s,
            goal: muscleProfile.goal,
            weakPoints: [],
            zoneScore: null,
            recentRir: [],
          });
          perSport.musculation.push({
            key: queueKey('musculation', 1, w, s),
            sport: 'musculation',
            weekNumber: w,
            sessionIndex: s,
            name: gen.split_day,
            exercises: gen.exercises.slice(0, 3).map((e) => exName(e.exercise_id)),
            estimatedMinutes: gen.estimated_duration_min,
            status: 'locked',
            day: s,
            block: 1,
            week: w,
          });
        } catch {
          // skip
        }
      }
    }
  }

  // Hyrox
  if (hyroxProfile) {
    const plan = hyroxWeeklyPlan(hyroxProfile.sessions_per_week, inputs.hyroxBlock);
    const types = plan.filter((t): t is HyroxSessionType => t !== 'rest');
    for (let w = 1; w <= POOL_WEEKS; w += 1) {
      types.forEach((t, idx) => {
        const s = idx + 1;
        const gen = generateHyroxSession({
          type: t,
          level: hyroxProfile.level,
          weakStations: [],
          zoneScore: 60,
        });
        perSport.hyrox.push({
          key: queueKey('hyrox', 1, w, s),
          sport: 'hyrox',
          weekNumber: w,
          sessionIndex: s,
          name: HYROX_NAME[t],
          exercises: gen.rounds.slice(0, 3).map((r) => r.station_target_label ?? 'Course'),
          estimatedMinutes: gen.estimated_duration_min,
          status: 'locked',
          day: s,
          block: inputs.hyroxBlock,
          week: w,
          hyroxType: t,
        });
      });
    }
  }

  // Status: assign per sport, in isolation. Each sport's list is
  // sequential; sport X never gates sport Y. See assignSportStatuses for
  // the per-sport invariant.
  for (const sport of SPORT_ORDER) {
    assignSportStatuses(perSport[sport], state);
  }

  // Per-sport dynamic window: find the first incomplete week, keep that
  // week + (visibleWeeks - 1) following weeks, and renumber weekNumber
  // 1..visibleWeeks so the UI can group consistently across sports that
  // are each at a different absolute week.
  const visiblePerSport: Record<QueueSport, QueueItem[]> = {
    weightlifting: filterToVisibleWindow(perSport.weightlifting, visibleWeeks),
    running: filterToVisibleWindow(perSport.running, visibleWeeks),
    musculation: filterToVisibleWindow(perSport.musculation, visibleWeeks),
    hyrox: filterToVisibleWindow(perSport.hyrox, visibleWeeks),
  };

  // Group by display weekNumber (1..visibleWeeks) so the home screen can
  // walk the array and surface "current" and "next" slots together.
  const grouped: QueueItem[][] = [];
  for (let dw = 1; dw <= visibleWeeks; dw += 1) {
    const items: QueueItem[] = [];
    for (const sport of SPORT_ORDER) {
      for (const item of visiblePerSport[sport]) {
        if (item.weekNumber === dw) items.push(item);
      }
    }
    grouped.push(items);
  }
  return grouped;
}

/**
 * Find the first week with at least one not-yet-done session (i.e. neither
 * `completed` nor `skipped`). Items are assumed to be in week-then-session
 * order, with the `weekNumber` field carrying the absolute pool week index.
 * Returns `Infinity` when every session in the pool is done (caller should
 * treat that as "nothing visible").
 */
function findFirstIncompleteWeek(items: QueueItem[]): number {
  for (const item of items) {
    if (item.status !== 'completed' && item.status !== 'skipped') {
      return item.weekNumber;
    }
  }
  return Infinity;
}

/**
 * Keep only the items belonging to the first incomplete week and the
 * following `visibleWeeks - 1` weeks, renumbering `weekNumber` to
 * 1..visibleWeeks so the caller can group across sports that are each
 * sitting at a different absolute week.
 *
 * Per-sport isolated by construction: only this sport's `items` are read.
 */
function filterToVisibleWindow(items: QueueItem[], visibleWeeks: number): QueueItem[] {
  if (items.length === 0) return [];
  const first = findFirstIncompleteWeek(items);
  if (!Number.isFinite(first)) return [];
  const last = first + visibleWeeks - 1;
  return items
    .filter((it) => it.weekNumber >= first && it.weekNumber <= last)
    .map((it) => ({ ...it, weekNumber: it.weekNumber - first + 1 }));
}

/**
 * Find the first `available` item for a single sport across the queue.
 *
 * Sport-isolated by construction — other sports' items are skipped before
 * the status is even read. Returns `'complete'` when the sport has items
 * in the visible window but none are available (every visible week is
 * already done/skipped) and `null` when the sport isn't configured at all.
 */
export function nextAvailableForSport(
  weeks: QueueItem[][],
  sport: QueueSport,
): QueueItem | 'complete' | null {
  let hasItems = false;
  for (const week of weeks) {
    for (const item of week) {
      if (item.sport !== sport) continue;
      hasItems = true;
      if (item.status === 'available') return item;
    }
  }
  return hasItems ? 'complete' : null;
}
