import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type {
  HyroxProfile,
  MuscleProfile,
  RunningProfile,
  UserProgram,
  UserProfile,
  Gender,
} from '@/lib/firestore';
import { getUserProfile } from '@/lib/firestore';
import { MUSCLE_VOLUME_LANDMARKS } from '@/lib/muscleEngine';
import { MUSCLE_LABELS_FR } from '@/lib/muscleSessionScience';
import { getHyroxStation, HYROX_STATION_ORDER } from '@/data/hyroxStations';
import type { BilanSummary } from '@/components/BilanCard';
import {
  buildBilanSummary,
  isProgrammeComplete,
  isWeekBilanReady,
} from '@/lib/weekBilan';
import { daysSince, type ProSport, type SportProfile, type MuscleVolumeTarget } from '@/lib/weekProgression';
import {
  recordWeekAdvance,
  setCurrentWeek,
  readCurrentWeek,
  type WeekState,
} from '@/lib/weekTracking';

type RawState = Record<string, unknown>;

function parseStateFromRaw(
  raw: RawState,
  sport: ProSport,
  week: number,
): WeekState {
  const k = (field: string): string => `${sport}_week_${week}_${field}`;
  const date = (v: unknown): Date | null => {
    if (!v) return null;
    if (v instanceof Date) return v;
    const maybe = v as { toDate?: () => Date };
    if (typeof maybe?.toDate === 'function') return maybe.toDate();
    return null;
  };
  const num = (v: unknown, f: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : f;
  const sets = ((): Record<string, number> => {
    const r = raw[k('muscle_sets')];
    if (!r || typeof r !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [m, v] of Object.entries(r as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[m] = v;
    }
    return out;
  })();
  const stations = ((): string[] => {
    const r = raw[k('stations_worked')];
    if (!Array.isArray(r)) return [];
    return r.filter((v): v is string => typeof v === 'string');
  })();
  return {
    startedAt: date(raw[k('started_at')]),
    plannedSessions: num(raw[k('planned_sessions')], 0),
    completedSessions: num(raw[k('completed_sessions')], 0),
    skippedSessions: num(raw[k('skipped_sessions')], 0),
    plannedKm:
      typeof raw[k('planned_km')] === 'number' ? (raw[k('planned_km')] as number) : null,
    actualKm: num(raw[k('actual_km')], 0),
    muscleSets: sets,
    stationsWorked: stations,
    advancedAt: date(raw[k('advanced_at')]),
    advanceNote:
      typeof raw[k('advance_note')] === 'string'
        ? (raw[k('advance_note')] as string)
        : null,
  };
}

function muscleTargets(): Record<string, MuscleVolumeTarget> {
  const out: Record<string, MuscleVolumeTarget> = {};
  for (const [muscle, vals] of Object.entries(MUSCLE_VOLUME_LANDMARKS)) {
    if (vals) out[muscle] = { MEV: vals.MEV, MAV: vals.MAV };
  }
  return out;
}

function stationLabels(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of HYROX_STATION_ORDER) {
    out[id] = getHyroxStation(id).name;
  }
  return out;
}

function plannedRunningKm(sessionsPerWeek: number, baseKm: number): number {
  const map: Record<number, number> = {
    2: baseKm * 0.7,
    3: baseKm * 1.0,
    4: baseKm * 1.3,
    5: baseKm * 1.6,
    6: baseKm * 2.0,
  };
  const n = Math.min(6, Math.max(2, Math.round(sessionsPerWeek)));
  return Math.round((map[n] ?? baseKm) * 10) / 10;
}

const RUNNING_BASE_KM = 25;

export interface WeekBilanEntry {
  sport: ProSport;
  weekNumber: number;
  summary: BilanSummary;
  isComplete: boolean;
  /**
   * True when the week has elapsed (7+ days) without any logged
   * activity (no completed session, no km, no station). Callers
   * render BilanCard with `notStartedOnStart` set so the user gets
   * a "Commencer la semaine" CTA instead of the standard bilan.
   */
  notStarted: boolean;
}

export interface UseWeekBilansResult {
  bilans: WeekBilanEntry[];
  advance: (sport: ProSport) => Promise<void>;
  repeat: (sport: ProSport) => Promise<void>;
  startNewCycle: (sport: ProSport) => Promise<void>;
}

export interface UseWeekBilansInputs {
  program: UserProgram | null;
  runningProfile: RunningProfile | null;
  muscleProfile: MuscleProfile | null;
  hyroxProfile: HyroxProfile | null;
}

export function useWeekBilans(inputs: UseWeekBilansInputs): UseWeekBilansResult {
  const [raw, setRaw] = useState<RawState>({});
  const [gender, setGender] = useState<Gender>('non_precise');

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', user.uid, 'state', 'programme_queue'),
      (snap) => setRaw(snap.exists() ? (snap.data() as RawState) : {}),
      () => setRaw({}),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    let cancelled = false;
    void (async () => {
      try {
        const p: UserProfile | null = await getUserProfile(user.uid);
        if (!cancelled) setGender(p?.gender ?? 'non_precise');
      } catch {
        // keep default
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const bilans: WeekBilanEntry[] = [];

  const entries: { sport: ProSport; profile: SportProfile | null }[] = [
    {
      sport: 'weightlifting',
      profile: inputs.program
        ? { sessionsPerWeek: inputs.program.sessions_per_week ?? 3 }
        : null,
    },
    {
      sport: 'running',
      profile: inputs.runningProfile
        ? {
            sessionsPerWeek: inputs.runningProfile.sessions_per_week ?? 3,
            plannedKmPerWeek: plannedRunningKm(
              inputs.runningProfile.sessions_per_week ?? 3,
              RUNNING_BASE_KM,
            ),
          }
        : null,
    },
    {
      sport: 'musculation',
      profile: inputs.muscleProfile
        ? {
            sessionsPerWeek: inputs.muscleProfile.sessions_per_week ?? 3,
            muscleTargets: muscleTargets(),
            muscleLabels: MUSCLE_LABELS_FR,
          }
        : null,
    },
    {
      sport: 'hyrox',
      profile: inputs.hyroxProfile
        ? {
            sessionsPerWeek: inputs.hyroxProfile.sessions_per_week ?? 3,
            stationsTracked: [...HYROX_STATION_ORDER],
            stationLabels: stationLabels(),
          }
        : null,
    },
  ];

  for (const { sport, profile } of entries) {
    if (!profile) continue;
    const weekNumber = readCurrentWeek(raw, sport);
    const stateBase = parseStateFromRaw(raw, sport, weekNumber);
    const state: WeekState = {
      ...stateBase,
      plannedSessions:
        stateBase.plannedSessions || profile.sessionsPerWeek,
      plannedKm:
        stateBase.plannedKm !== null
          ? stateBase.plannedKm
          : (profile.plannedKmPerWeek ?? null),
    };
    const summary = buildBilanSummary({ sport, weekNumber, state, profile, gender });

    // "Activity" = at least one logged signal. Without it, the week
    // is considered untouched and the bilan should only surface once
    // the seven-day timer has elapsed.
    const hasActivity =
      state.completedSessions > 0 ||
      state.skippedSessions > 0 ||
      state.actualKm > 0 ||
      state.stationsWorked.length > 0;
    const elapsed = state.startedAt ? daysSince(state.startedAt) : 0;

    if (!hasActivity && elapsed < 7) {
      // Brand new week, nothing logged: keep the queue visible
      // instead of preempting it with a "bilan insuffisant" card.
      continue;
    }

    const notStarted = !hasActivity && elapsed >= 7;
    if (!notStarted && !isWeekBilanReady(summary)) continue;

    bilans.push({
      sport,
      weekNumber,
      summary,
      isComplete: isProgrammeComplete(weekNumber),
      notStarted,
    });
  }

  const advance = async (sport: ProSport): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    const entry = bilans.find((b) => b.sport === sport);
    if (!entry) return;
    await recordWeekAdvance(user.uid, sport, entry.weekNumber, entry.summary.result.note);
    await setCurrentWeek(user.uid, sport, entry.weekNumber + 1);
  };

  const repeat = async (sport: ProSport): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    const entry = bilans.find((b) => b.sport === sport);
    if (!entry) return;
    await recordWeekAdvance(
      user.uid,
      sport,
      entry.weekNumber,
      `Reprise volontaire de la semaine ${entry.weekNumber}.`,
    );
  };

  const startNewCycle = async (sport: ProSport): Promise<void> => {
    const user = auth.currentUser;
    if (!user) return;
    await setCurrentWeek(user.uid, sport, 1);
  };

  return { bilans, advance, repeat, startNewCycle };
}
