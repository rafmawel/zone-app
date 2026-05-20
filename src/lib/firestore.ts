import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export type SportKey =
  | 'halterophilie'
  | 'course'
  | 'musculation'
  | 'hyrox'
  | 'wod'
  | 'calisthenics'
  | 'cyclisme'
  | 'natation'
  | 'triathlon'
  | 'padel';

export type Level = 'debutant' | 'intermediaire' | 'avance' | 'confirme';

export type HealthDataSource = 'health_connect' | 'manual' | 'both' | null;

export type SessionsOrganization =
  | 'separees'
  | 'combinees'
  | 'mixte'
  | null;

export interface UserProfile {
  uid: string;
  created_at: Timestamp | null;
  onboarding_completed: boolean;
  level: Level | null;
  health_data_source: HealthDataSource;
  sessions_organization: SessionsOrganization;
  optimize_global_progression?: boolean;
  zone_score: number;
}

export interface UserSport {
  sport_key: SportKey;
  level: Level;
  goal: string;
  sessions_per_week: number;
  equipment?: string;
  target_race?: string;
}

export interface DailyCheckin {
  date: string;
  sleep_duration: number;
  sleep_quality: number;
  feeling: number;
  muscle_soreness: number;
  stress: number;
  created_at: Timestamp | null;
  zone_score: number;
}

export type TrainingSessionSport = 'weightlifting' | 'running';
export type TrainingSessionStatus = 'planned' | 'completed' | 'skipped';

export interface PlannedSet {
  exercise_id: string;
  set_number: number;
  target_reps: string;
  target_weight_kg: number | null;
  target_rpe: number | null;
  rest_seconds: number;
}

export interface SessionExercise {
  exercise_id: string;
  sets: PlannedSet[];
  notes?: string;
}

export interface CompletedSet {
  exercise_id: string;
  set_number: number;
  actual_reps: number;
  actual_weight_kg: number;
  rpe: number | null;
  completed_at: Timestamp | null;
}

export interface TrainingSession {
  id: string;
  date: string;
  sport_key: TrainingSessionSport;
  status: TrainingSessionStatus;
  rpe?: number;
  duration_minutes?: number;
  created_at: Timestamp | null;
  planned_exercises?: SessionExercise[];
  completed_sets?: CompletedSet[];
  zone_score_at_start?: number | null;
  zone_message?: string | null;
  completed_at?: Timestamp | null;
  total_volume_kg?: number;
}

export type ProgramBlock = 1 | 2 | 3;
export type ProgramSport = 'weightlifting' | 'running';

export interface UserProgram {
  uid: string;
  sport_key: ProgramSport;
  current_block: ProgramBlock;
  current_week: number;
  current_day: number;
  mesocycle_start: string;
  sessions_per_week: number;
  level: string;
  goal: string;
  equipment: string;
  created_at: Timestamp | null;
  updated_at: Timestamp | null;
}

export interface ExerciseMax {
  exercise_id: string;
  weight_kg: number;
  reps: number;
  estimated_1rm: number;
  date: string;
  is_pr: boolean;
}

export type RunningRaceDistance = '5km' | '10km' | 'semi' | 'marathon';
export type RunningSessionType = 'EF' | 'SL' | 'TC' | 'TB' | 'IV' | 'RV' | 'RA';
export type RunningSessionStatus = 'planned' | 'completed' | 'skipped';
export type LongRunPreference = 'samedi' | 'dimanche' | 'flexible';

export interface RunningProfile {
  vdot: number;
  easy_pace_sec_per_km: number;
  goal: string;
  reference_distance: RunningRaceDistance | null;
  reference_time_seconds: number | null;
  sessions_per_week: number;
  target_race_date: string | null;
  long_run_pref: LongRunPreference;
  updated_at: Timestamp | null;
}

export interface RunningSessionStepPlanned {
  kind: 'warmup' | 'cooldown' | 'work' | 'recovery' | 'steady';
  label: string;
  duration_seconds: number | null;
  target_pace_sec_per_km: number | null;
  distance_meters: number | null;
}

export interface RunningSessionGPSPoint {
  lat: number;
  lng: number;
  ts: number;
}

export type MuscleGoal = 'hypertrophy' | 'strength' | 'mixed' | 'fitness';
export type MuscleEquipment = 'barbell_plates' | 'dumbbells' | 'full_gym';

export interface MuscleProfile {
  goal: MuscleGoal;
  equipment: MuscleEquipment[];
  weak_points: string[];
  sessions_per_week: number;
  updated_at: Timestamp | null;
}

export type HyroxLevel = 'debutant' | 'regulier' | 'competiteur' | 'pro';

export interface HyroxProfile {
  level: HyroxLevel;
  weak_stations: string[];
  has_target_race: boolean;
  target_race_date: string | null;
  sessions_per_week: number;
  updated_at: Timestamp | null;
}

export interface WeeklyScheduleDayDoc {
  date: string;
  day_index: number;
  sessions: {
    sport: string;
    session_type: string;
    planned_duration_minutes: number;
    intensity: 'low' | 'medium' | 'high';
  }[];
  warnings: { level: 'info' | 'caution' | 'danger'; message: string }[];
  load_score: number;
  recovery_score: number;
}

export interface WeeklyScheduleDoc {
  week_start: string;
  days: WeeklyScheduleDayDoc[];
  updated_at: Timestamp | null;
}

export interface RunSession {
  id: string;
  date: string;
  status: RunningSessionStatus;
  session_type: RunningSessionType;
  steps: RunningSessionStepPlanned[];
  estimated_duration_min: number;
  estimated_distance_km: number;
  zone_score_at_start: number | null;
  zone_message: string | null;
  rpe?: number;
  actual_duration_seconds?: number;
  actual_distance_km?: number;
  avg_pace_sec_per_km?: number;
  positions?: RunningSessionGPSPoint[];
  created_at: Timestamp | null;
  completed_at?: Timestamp | null;
}

export function todayDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { uid, ...(snap.data() as Omit<UserProfile, 'uid'>) };
}

export async function updateUserProfile(
  uid: string,
  data: Partial<Omit<UserProfile, 'uid'>>,
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), data);
}

export async function getUserSports(uid: string): Promise<UserSport[]> {
  const snap = await getDocs(collection(db, 'users', uid, 'sports'));
  return snap.docs.map((d) => d.data() as UserSport);
}

export async function setUserSport(
  uid: string,
  sportKey: SportKey,
  data: UserSport,
): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'sports', sportKey), data);
}

export async function getTodayCheckin(uid: string): Promise<DailyCheckin | null> {
  const date = todayDateString();
  const snap = await getDoc(doc(db, 'users', uid, 'checkins', date));
  if (!snap.exists()) return null;
  return snap.data() as DailyCheckin;
}

export interface SaveCheckinInput {
  date: string;
  sleep_duration: number;
  sleep_quality: number;
  feeling: number;
  muscle_soreness: number;
  stress: number;
  zone_score: number;
}

export async function saveCheckin(uid: string, input: SaveCheckinInput): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'checkins', input.date), {
    ...input,
    created_at: serverTimestamp(),
  });
}

export async function getLatestCheckins(uid: string, max: number): Promise<DailyCheckin[]> {
  const q = query(
    collection(db, 'users', uid, 'checkins'),
    orderBy('date', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as DailyCheckin);
}

export async function getUpcomingSessions(
  uid: string,
  max: number,
): Promise<TrainingSession[]> {
  const today = todayDateString();
  const q = query(
    collection(db, 'users', uid, 'sessions'),
    where('date', '>=', today),
    where('status', '==', 'planned'),
    orderBy('date', 'asc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as TrainingSession);
}

export async function getTodayZoneScore(uid: string): Promise<number> {
  const ci = await getTodayCheckin(uid);
  return ci?.zone_score ?? 50;
}

export async function getUserProgram(uid: string): Promise<UserProgram | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'state', 'program'));
  if (!snap.exists()) return null;
  return snap.data() as UserProgram;
}

export async function saveUserProgram(
  uid: string,
  program: Omit<UserProgram, 'created_at' | 'updated_at'> & {
    created_at?: UserProgram['created_at'];
  },
): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'state', 'program'), {
    ...program,
    created_at: program.created_at ?? serverTimestamp(),
    updated_at: serverTimestamp(),
  });
}

export async function getExerciseMaxes(uid: string): Promise<ExerciseMax[]> {
  const snap = await getDocs(collection(db, 'users', uid, 'maxes'));
  return snap.docs.map((d) => d.data() as ExerciseMax);
}

export async function saveExerciseMax(uid: string, max: ExerciseMax): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'maxes', max.exercise_id), max);
}

export interface SavePlannedSessionInput {
  date: string;
  sport_key: TrainingSessionSport;
  planned_exercises: SessionExercise[];
  zone_score_at_start: number | null;
  zone_message: string | null;
}

export async function createPlannedSession(
  uid: string,
  input: SavePlannedSessionInput,
): Promise<string> {
  const ref = doc(collection(db, 'users', uid, 'sessions'));
  const payload: Omit<TrainingSession, 'id' | 'created_at'> & {
    created_at: ReturnType<typeof serverTimestamp>;
  } = {
    date: input.date,
    sport_key: input.sport_key,
    status: 'planned',
    planned_exercises: input.planned_exercises,
    completed_sets: [],
    zone_score_at_start: input.zone_score_at_start,
    zone_message: input.zone_message,
    created_at: serverTimestamp(),
  };
  await setDoc(ref, { ...payload, id: ref.id });
  return ref.id;
}

export async function getSession(
  uid: string,
  sessionId: string,
): Promise<TrainingSession | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'sessions', sessionId));
  if (!snap.exists()) return null;
  return snap.data() as TrainingSession;
}

export async function saveCompletedSet(
  uid: string,
  sessionId: string,
  set: CompletedSet,
): Promise<void> {
  const ref = doc(db, 'users', uid, 'sessions', sessionId);
  const snap = await getDoc(ref);
  const data = (snap.data() as TrainingSession | undefined) ?? null;
  const current = data?.completed_sets ?? [];
  const next = [...current, { ...set, completed_at: serverTimestamp() }];
  await updateDoc(ref, { completed_sets: next });
}

export interface CompleteSessionSummary {
  rpe?: number;
  duration_minutes: number;
  total_volume_kg: number;
}

export async function completeSession(
  uid: string,
  sessionId: string,
  summary: CompleteSessionSummary,
): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'sessions', sessionId), {
    status: 'completed',
    completed_at: serverTimestamp(),
    ...(summary.rpe !== undefined ? { rpe: summary.rpe } : {}),
    duration_minutes: summary.duration_minutes,
    total_volume_kg: summary.total_volume_kg,
  });
}

export async function countCompletedSessionsSince(
  uid: string,
  isoDate: string,
): Promise<number> {
  const q = query(
    collection(db, 'users', uid, 'sessions'),
    where('status', '==', 'completed'),
    where('date', '>=', isoDate),
  );
  try {
    const snap = await getDocs(q);
    return snap.size;
  } catch {
    return 0;
  }
}

export async function getCompletedSessions(uid: string): Promise<TrainingSession[]> {
  const q = query(
    collection(db, 'users', uid, 'sessions'),
    where('status', '==', 'completed'),
    orderBy('date', 'desc'),
    limit(60),
  );
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as TrainingSession);
  } catch {
    return [];
  }
}

export async function getSessionById(
  uid: string,
  sessionId: string,
): Promise<TrainingSession | null> {
  return getSession(uid, sessionId);
}

export interface AllTimeStats {
  totalSessions: number;
  totalVolume: number;
  bestStreak: number;
  avgZoneScore: number;
}

export async function getAllTimeStats(uid: string): Promise<AllTimeStats> {
  let totalSessions = 0;
  let totalVolume = 0;
  try {
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'sessions'), where('status', '==', 'completed')),
    );
    snap.docs.forEach((d) => {
      totalSessions += 1;
      const data = d.data() as TrainingSession;
      totalVolume += data.total_volume_kg ?? 0;
    });
  } catch {
    // keep defaults
  }

  let bestStreak = 0;
  let avgZoneScore = 0;
  try {
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'checkins'), orderBy('date', 'asc')),
    );
    const checkins = snap.docs.map((d) => d.data() as DailyCheckin);
    if (checkins.length > 0) {
      avgZoneScore = Math.round(
        checkins.reduce((acc, c) => acc + (c.zone_score ?? 0), 0) / checkins.length,
      );
      let streak = 0;
      let prev: Date | null = null;
      for (const c of checkins) {
        if ((c.zone_score ?? 0) <= 0) {
          streak = 0;
          prev = null;
          continue;
        }
        const d = new Date(c.date);
        if (prev && (d.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24) === 1) {
          streak += 1;
        } else {
          streak = 1;
        }
        if (streak > bestStreak) bestStreak = streak;
        prev = d;
      }
    }
  } catch {
    // keep defaults
  }

  return { totalSessions, totalVolume, bestStreak, avgZoneScore };
}

export async function getDaysSinceLastSession(uid: string): Promise<number> {
  const q = query(
    collection(db, 'users', uid, 'sessions'),
    where('status', '==', 'completed'),
    orderBy('date', 'desc'),
    limit(1),
  );
  try {
    const snap = await getDocs(q);
    if (snap.empty) return 2;
    const last = snap.docs[0].data() as TrainingSession;
    const lastDate = new Date(last.date);
    const today = new Date();
    const diffMs = today.getTime() - lastDate.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  } catch {
    return 2;
  }
}

export async function saveRunningProfile(uid: string, profile: Omit<RunningProfile, 'updated_at'>): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'state', 'running_profile'), {
    ...profile,
    updated_at: serverTimestamp(),
  });
}

export async function getRunningProfile(uid: string): Promise<RunningProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'state', 'running_profile'));
  if (!snap.exists()) return null;
  return snap.data() as RunningProfile;
}

export async function updateVDOT(uid: string, newVDOT: number): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'state', 'running_profile'), {
    vdot: newVDOT,
    updated_at: serverTimestamp(),
  });
}

export interface CreateRunSessionInput {
  date: string;
  session_type: RunningSessionType;
  steps: RunningSessionStepPlanned[];
  estimated_duration_min: number;
  estimated_distance_km: number;
  zone_score_at_start: number | null;
  zone_message: string | null;
}

export async function createRunSession(uid: string, input: CreateRunSessionInput): Promise<string> {
  const ref = doc(collection(db, 'users', uid, 'runs'));
  await setDoc(ref, {
    id: ref.id,
    status: 'planned',
    ...input,
    created_at: serverTimestamp(),
  });
  return ref.id;
}

export async function getRunSession(uid: string, runId: string): Promise<RunSession | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'runs', runId));
  if (!snap.exists()) return null;
  return snap.data() as RunSession;
}

export interface CompleteRunInput {
  duration_seconds: number;
  distance_km: number;
  avg_pace_sec_per_km: number;
  positions?: RunningSessionGPSPoint[];
  rpe?: number;
}

export async function completeRunSession(
  uid: string,
  runId: string,
  input: CompleteRunInput,
): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'runs', runId), {
    status: 'completed',
    completed_at: serverTimestamp(),
    actual_duration_seconds: input.duration_seconds,
    actual_distance_km: input.distance_km,
    avg_pace_sec_per_km: input.avg_pace_sec_per_km,
    ...(input.rpe !== undefined ? { rpe: input.rpe } : {}),
    ...(input.positions ? { positions: input.positions } : {}),
  });
}

export async function getCompletedRuns(uid: string, max: number): Promise<RunSession[]> {
  try {
    const snap = await getDocs(
      query(
        collection(db, 'users', uid, 'runs'),
        where('status', '==', 'completed'),
        orderBy('date', 'desc'),
        limit(max),
      ),
    );
    return snap.docs.map((d) => d.data() as RunSession);
  } catch {
    return [];
  }
}

export async function getUpcomingRuns(uid: string, max: number): Promise<RunSession[]> {
  try {
    const today = todayDateString();
    const snap = await getDocs(
      query(
        collection(db, 'users', uid, 'runs'),
        where('status', '==', 'planned'),
        where('date', '>=', today),
        orderBy('date', 'asc'),
        limit(max),
      ),
    );
    return snap.docs.map((d) => d.data() as RunSession);
  } catch {
    return [];
  }
}

export async function saveMuscleProfile(uid: string, profile: Omit<MuscleProfile, 'updated_at'>): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'state', 'muscle_profile'), {
    ...profile,
    updated_at: serverTimestamp(),
  });
}

export async function getMuscleProfile(uid: string): Promise<MuscleProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'state', 'muscle_profile'));
  if (!snap.exists()) return null;
  return snap.data() as MuscleProfile;
}

export async function saveHyroxProfile(uid: string, profile: Omit<HyroxProfile, 'updated_at'>): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'state', 'hyrox_profile'), {
    ...profile,
    updated_at: serverTimestamp(),
  });
}

export async function getHyroxProfile(uid: string): Promise<HyroxProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'state', 'hyrox_profile'));
  if (!snap.exists()) return null;
  return snap.data() as HyroxProfile;
}

export async function saveWeeklySchedule(
  uid: string,
  schedule: Omit<WeeklyScheduleDoc, 'updated_at'>,
): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'schedules', schedule.week_start), {
    ...schedule,
    updated_at: serverTimestamp(),
  });
}

export async function getActiveScheduleForWeek(
  uid: string,
  weekStart: string,
): Promise<WeeklyScheduleDoc | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'schedules', weekStart));
  if (!snap.exists()) return null;
  return snap.data() as WeeklyScheduleDoc;
}
