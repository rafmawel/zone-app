/**
 * Week tracking persistence.
 *
 * Stores per-sport per-week state under `users/{uid}/state/programme_queue`.
 * Keys are flat to keep Firestore reads cheap and merge-friendly. Each
 * field is namespaced `${sport}_week_${n}_<field>` so that adding a new
 * sport never requires a schema migration.
 */

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { ProSport } from './weekProgression';

export interface WeekState {
  startedAt: Date | null;
  plannedSessions: number;
  completedSessions: number;
  plannedKm: number | null;
  actualKm: number;
  muscleSets: Record<string, number>;
  stationsWorked: string[];
  advancedAt: Date | null;
  advanceNote: string | null;
}

const EMPTY_STATE: WeekState = {
  startedAt: null,
  plannedSessions: 0,
  completedSessions: 0,
  plannedKm: null,
  actualKm: 0,
  muscleSets: {},
  stationsWorked: [],
  advancedAt: null,
  advanceNote: null,
};

function key(sport: ProSport, week: number, field: string): string {
  return `${sport}_week_${week}_${field}`;
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  return null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function asMuscleSets(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

function parseWeekState(
  raw: Record<string, unknown>,
  sport: ProSport,
  week: number,
): WeekState {
  return {
    startedAt: asDate(raw[key(sport, week, 'started_at')]),
    plannedSessions: asNumber(raw[key(sport, week, 'planned_sessions')], 0),
    completedSessions: asNumber(raw[key(sport, week, 'completed_sessions')], 0),
    plannedKm:
      typeof raw[key(sport, week, 'planned_km')] === 'number'
        ? (raw[key(sport, week, 'planned_km')] as number)
        : null,
    actualKm: asNumber(raw[key(sport, week, 'actual_km')], 0),
    muscleSets: asMuscleSets(raw[key(sport, week, 'muscle_sets')]),
    stationsWorked: asStringArray(raw[key(sport, week, 'stations_worked')]),
    advancedAt: asDate(raw[key(sport, week, 'advanced_at')]),
    advanceNote:
      typeof raw[key(sport, week, 'advance_note')] === 'string'
        ? (raw[key(sport, week, 'advance_note')] as string)
        : null,
  };
}

export async function readProgrammeQueue(
  uid: string,
): Promise<Record<string, unknown>> {
  const snap = await getDoc(doc(db, 'users', uid, 'state', 'programme_queue'));
  if (!snap.exists()) return {};
  return snap.data() as Record<string, unknown>;
}

export async function getWeekState(
  uid: string,
  sport: ProSport,
  week: number,
): Promise<WeekState> {
  const data = await readProgrammeQueue(uid);
  return parseWeekState(data, sport, week);
}

export async function startWeek(
  uid: string,
  sport: ProSport,
  week: number,
  planned: { sessions: number; km?: number },
): Promise<void> {
  const existing = await getWeekState(uid, sport, week);
  if (existing.startedAt) return;
  const payload: Record<string, unknown> = {
    [key(sport, week, 'started_at')]: serverTimestamp(),
    [key(sport, week, 'planned_sessions')]: planned.sessions,
    [key(sport, week, 'completed_sessions')]: 0,
    [key(sport, week, 'muscle_sets')]: {},
    [key(sport, week, 'stations_worked')]: [],
    [key(sport, week, 'actual_km')]: 0,
  };
  if (planned.km !== undefined) {
    payload[key(sport, week, 'planned_km')] = planned.km;
  }
  await setDoc(
    doc(db, 'users', uid, 'state', 'programme_queue'),
    payload,
    { merge: true },
  );
}

export interface SessionCompletionPayload {
  km?: number;
  muscleSets?: Record<string, number>;
  stations?: string[];
}

export async function recordSessionComplete(
  uid: string,
  sport: ProSport,
  week: number,
  payload: SessionCompletionPayload,
): Promise<WeekState> {
  const current = await getWeekState(uid, sport, week);

  const completedSessions = current.completedSessions + 1;

  const muscleSets = { ...current.muscleSets };
  if (payload.muscleSets) {
    for (const [muscle, sets] of Object.entries(payload.muscleSets)) {
      muscleSets[muscle] = (muscleSets[muscle] ?? 0) + sets;
    }
  }

  const stationsWorked = [...current.stationsWorked, ...(payload.stations ?? [])];

  const update: Record<string, unknown> = {
    [key(sport, week, 'completed_sessions')]: completedSessions,
    [key(sport, week, 'muscle_sets')]: muscleSets,
    [key(sport, week, 'stations_worked')]: stationsWorked,
  };

  if (payload.km !== undefined) {
    update[key(sport, week, 'actual_km')] =
      Math.round((current.actualKm + payload.km) * 100) / 100;
  }

  if (!current.startedAt) {
    update[key(sport, week, 'started_at')] = serverTimestamp();
  }

  await setDoc(
    doc(db, 'users', uid, 'state', 'programme_queue'),
    update,
    { merge: true },
  );

  return {
    ...current,
    completedSessions,
    muscleSets,
    stationsWorked,
    actualKm:
      payload.km !== undefined
        ? Math.round((current.actualKm + payload.km) * 100) / 100
        : current.actualKm,
    startedAt: current.startedAt ?? new Date(),
  };
}

export async function recordWeekAdvance(
  uid: string,
  sport: ProSport,
  week: number,
  note: string,
): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'state', 'programme_queue'),
    {
      [key(sport, week, 'advanced_at')]: serverTimestamp(),
      [key(sport, week, 'advance_note')]: note,
    },
    { merge: true },
  );
}

/**
 * One source of truth for the active week per sport. Stored as a single
 * scalar to keep reads cheap when other UI surfaces (Aujourd'hui, etc.)
 * just need to know which week each sport is on.
 */
export async function setCurrentWeek(
  uid: string,
  sport: ProSport,
  week: number,
): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'state', 'programme_queue'),
    { [`${sport}_current_week`]: week },
    { merge: true },
  );
}

export function readCurrentWeek(
  data: Record<string, unknown>,
  sport: ProSport,
): number {
  const raw = data[`${sport}_current_week`];
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 1) {
    return Math.floor(raw);
  }
  return 1;
}
