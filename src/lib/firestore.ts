import {
  collection,
  deleteDoc,
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
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { normalizeQueueState } from './queueKeys';

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

export type Gender = 'homme' | 'femme' | 'non_precise';

export interface UserProfile {
  uid: string;
  name?: string;
  first_name?: string;
  gender?: Gender;
  created_at: Timestamp | null;
  onboarding_completed: boolean;
  level: Level | null;
  health_data_source: HealthDataSource;
  sessions_organization: SessionsOrganization;
  optimize_global_progression?: boolean;
  /** Daily check-in reminder, "HH:MM" 24h. */
  notification_time?: string;
  /** Whether the daily check-in reminder is enabled. */
  notifications_enabled?: boolean;
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
  /** When `target_reps` is a complex notation (e.g. "2+1"), the number of
   *  times the complex is performed per set. Drives the "N × (X+Y)" display
   *  on the session screen. Absent for simple prescriptions. */
  target_complexes?: number;
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

export type SessionDiscipline = 'weightlifting' | 'musculation' | 'running';

export interface TrainingSession {
  id: string;
  date: string;
  sport_key: TrainingSessionSport;
  /** Finer-grained training type; defaults to sport_key when absent. */
  discipline?: SessionDiscipline;
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
  /** Links a session to a programme-queue item so completion unlocks the next. */
  queue_key?: string;
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
export type RunningSessionType = 'EF' | 'SL' | 'TC' | 'TB' | 'IV' | 'RV' | 'RA' | 'CO' | 'AS';
export type RunningSessionStatus = 'planned' | 'completed' | 'skipped';
export type Weekday =
  | 'lundi'
  | 'mardi'
  | 'mercredi'
  | 'jeudi'
  | 'vendredi'
  | 'samedi'
  | 'dimanche';
export type LongRunPreference = Weekday | 'flexible';

export interface RunningProfile {
  vdot: number;
  easy_pace_sec_per_km: number;
  goal: string;
  reference_distance: RunningRaceDistance | null;
  reference_time_seconds: number | null;
  sessions_per_week: number;
  target_race_date: string | null;
  long_run_pref: LongRunPreference;
  /** Goal finishing time in seconds for the target race. */
  goal_time_seconds?: number | null;
  /** Goal race distance (distinct from `reference_distance`, which is a past
   *  performance used to calibrate VDOT). */
  race_distance?: RunningRaceDistance | null;
  /** VDOT required to hit `goal_time_seconds` over `race_distance`. */
  goal_vdot?: number | null;
  /** Phase-aware programme length in weeks (base + dev + spec + taper). */
  programme_weeks?: number | null;
  /** ISO date the programme started — used to render race countdowns and
   *  position the athlete inside the phase plan. */
  programme_start_date?: string | null;
  /**
   * Manual offset (sec/km) added to every EF target pace. Set after a
   * post-run prompt when the athlete's HR / RPE suggested the planned
   * easy pace was too aggressive for them today.
   */
  ef_pace_adjustment?: number | null;
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
  /** When set, the active week runs at reduced volume (deload). */
  deload_active?: boolean;
  updated_at: Timestamp | null;
}

export type HyroxLevel = 'debutant' | 'regulier' | 'competiteur' | 'pro';

export interface HyroxProfile {
  level: HyroxLevel;
  weak_stations: string[];
  has_target_race: boolean;
  target_race_date: string | null;
  sessions_per_week: number;
  baseline_skierg_500m_sec?: number | null;
  baseline_rowing_500m_sec?: number | null;
  baseline_wall_balls_2min?: number | null;
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

export type RunLocation = 'outdoor' | 'treadmill';
export type RunConditions = 'normal' | 'heat' | 'wind' | 'rain';
/** How the run was recorded: live chrono (outdoor/treadmill) or entered after the fact. */
export type RunEntryMode = 'outdoor' | 'treadmill' | 'manual';

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
  queue_key?: string;
  /** Where the run was done. Defaults to outdoor for legacy sessions. */
  location?: RunLocation;
  /** Self-reported environmental conditions. Defaults to 'normal'. */
  conditions?: RunConditions;
  /** How the run was recorded (live chrono vs manual entry). */
  mode?: RunEntryMode;
  /** Multi-select weather tags, e.g. ['sunny', 'wind']. */
  conditions_list?: string[];
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
  discipline?: SessionDiscipline;
  planned_exercises: SessionExercise[];
  zone_score_at_start: number | null;
  zone_message: string | null;
  queue_key?: string;
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
    discipline: input.discipline ?? input.sport_key,
    status: 'planned',
    planned_exercises: input.planned_exercises,
    completed_sets: [],
    zone_score_at_start: input.zone_score_at_start,
    zone_message: input.zone_message,
    ...(input.queue_key ? { queue_key: input.queue_key } : {}),
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

export async function updateRunningEfPaceAdjustment(
  uid: string,
  adjustmentSecPerKm: number,
): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'state', 'running_profile'),
    {
      ef_pace_adjustment: adjustmentSecPerKm,
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );
}

export interface CreateRunSessionInput {
  date: string;
  session_type: RunningSessionType;
  steps: RunningSessionStepPlanned[];
  estimated_duration_min: number;
  estimated_distance_km: number;
  zone_score_at_start: number | null;
  zone_message: string | null;
  queue_key?: string;
  location?: RunLocation;
  conditions?: RunConditions;
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
  distance_km: number | null;
  avg_pace_sec_per_km: number | null;
  positions?: RunningSessionGPSPoint[];
  rpe?: number;
  location?: RunLocation;
  conditions?: RunConditions;
  mode?: RunEntryMode;
  conditions_list?: string[];
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
    actual_distance_km: input.distance_km ?? null,
    avg_pace_sec_per_km: input.avg_pace_sec_per_km ?? null,
    ...(input.rpe !== undefined ? { rpe: input.rpe } : {}),
    ...(input.positions ? { positions: input.positions } : {}),
    ...(input.location ? { location: input.location } : {}),
    ...(input.conditions ? { conditions: input.conditions } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
    ...(input.conditions_list ? { conditions_list: input.conditions_list } : {}),
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

export async function setMuscleDeloadActive(uid: string, active: boolean): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'state', 'muscle_profile'),
    { deload_active: active, updated_at: serverTimestamp() },
    { merge: true },
  );
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

export type ScheduleSlot = 'matin' | 'apresmidi';
export type ScheduleSport = 'weightlifting' | 'running' | 'musculation' | 'hyrox';

export interface ScheduleAssignment {
  day: Weekday;
  slot: ScheduleSlot;
  sport: ScheduleSport;
  session_type: string;
  intensity: 'low' | 'medium' | 'high';
}

export interface UserSchedule {
  week_days: Weekday[];
  double_days: Weekday[];
  assignments: ScheduleAssignment[];
  updated_at: Timestamp | null;
}

export async function saveUserSchedule(
  uid: string,
  schedule: Omit<UserSchedule, 'updated_at'>,
): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'state', 'schedule'), {
    ...schedule,
    updated_at: serverTimestamp(),
  });
}

export async function getUserSchedule(uid: string): Promise<UserSchedule | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'state', 'schedule'));
  if (!snap.exists()) return null;
  return snap.data() as UserSchedule;
}

export interface HyroxBaselineInput {
  baseline_skierg_500m_sec: number;
  baseline_rowing_500m_sec: number;
  baseline_wall_balls_2min: number;
}

export async function saveHyroxBaseline(uid: string, baseline: HyroxBaselineInput): Promise<void> {
  await updateDoc(doc(db, 'users', uid, 'state', 'hyrox_profile'), {
    ...baseline,
    updated_at: serverTimestamp(),
  });
}

export type HyroxSessionTypeKey =
  | 'station_work'
  | 'running_base'
  | 'strength_base'
  | 'race_simulation';

export interface HyroxStationResult {
  station_id: string;
  rounds: { time_sec: number; reps?: number }[];
  avg_time_sec: number;
  weakness_score: number;
}

export interface HyroxRunSegment {
  round: number;
  duration_sec: number;
  distance_m: number;
  pace_sec_per_km: number;
}

export interface HyroxSessionRecord {
  id: string;
  date: string;
  session_type: HyroxSessionTypeKey;
  block_phase: number;
  stations: HyroxStationResult[];
  total_time_sec?: number | null;
  cumulative_lactate?: number | null;
  zone_score_at_start: number | null;
  run_segments?: HyroxRunSegment[];
  created_at: Timestamp | null;
}

export async function saveHyroxSession(
  uid: string,
  record: Omit<HyroxSessionRecord, 'id' | 'created_at'>,
): Promise<string> {
  const ref = doc(collection(db, 'users', uid, 'hyrox_sessions'));
  await setDoc(ref, {
    ...record,
    id: ref.id,
    created_at: serverTimestamp(),
  });
  return ref.id;
}

export async function getHyroxSessionHistory(
  uid: string,
  max: number = 30,
): Promise<HyroxSessionRecord[]> {
  const q = query(
    collection(db, 'users', uid, 'hyrox_sessions'),
    orderBy('date', 'desc'),
    limit(max),
  );
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as HyroxSessionRecord);
  } catch {
    return [];
  }
}

export async function updateWeakStations(uid: string, stations: string[]): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'state', 'hyrox_profile'),
    { weak_stations: stations, updated_at: serverTimestamp() },
    { merge: true },
  );
}

/** Per-station average completion time from recent Hyrox sessions. */
export async function getHyroxStationAverages(
  uid: string,
): Promise<Record<string, number>> {
  const history = await getHyroxSessionHistory(uid, 12);
  const sums: Record<string, { total: number; count: number }> = {};
  for (const session of history) {
    for (const st of session.stations ?? []) {
      if (!Number.isFinite(st.avg_time_sec) || st.avg_time_sec <= 0) continue;
      const cur = sums[st.station_id] ?? { total: 0, count: 0 };
      cur.total += st.avg_time_sec;
      cur.count += 1;
      sums[st.station_id] = cur;
    }
  }
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(sums)) {
    if (v.count > 0) out[id] = v.total / v.count;
  }
  return out;
}

export type ResettableSport = 'weightlifting' | 'running' | 'musculation' | 'hyrox';

const SPORT_STATE_DOC: Record<ResettableSport, string> = {
  weightlifting: 'program',
  running: 'running_profile',
  musculation: 'muscle_profile',
  hyrox: 'hyrox_profile',
};

export async function resetSportProfile(uid: string, sport: ResettableSport): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'state', SPORT_STATE_DOC[sport]));
}

export interface WorkloadEntry {
  date: string;
  tss: number;
  sport: string;
  sessionType: string;
  durationMinutes: number;
  intensityFactor: number;
}

export interface PerformanceModelSnapshot {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
  calculatedAt: Timestamp | null;
}

export async function saveDailyTSS(
  uid: string,
  entry: WorkloadEntry,
): Promise<void> {
  const id = `${entry.date}_${entry.sport}`;
  await setDoc(doc(db, 'users', uid, 'workload', id), entry);
}

export async function getWorkloadHistory(
  uid: string,
  daysBack: number,
): Promise<WorkloadEntry[]> {
  const safeDays = Math.max(1, Math.floor(daysBack));
  try {
    const snap = await getDocs(
      query(
        collection(db, 'users', uid, 'workload'),
        orderBy('date', 'desc'),
        limit(safeDays),
      ),
    );
    return snap.docs.map((d) => d.data() as WorkloadEntry);
  } catch {
    return [];
  }
}

export async function savePerformanceSnapshot(
  uid: string,
  snapshot: PerformanceModelSnapshot,
): Promise<void> {
  const ref = doc(db, 'users', uid, 'state', 'performance_model');
  const snap = await getDoc(ref);
  const existing = snap.exists()
    ? ((snap.data() as { snapshots?: PerformanceModelSnapshot[] }).snapshots ?? [])
    : [];
  const filtered = existing.filter((s) => s.date !== snapshot.date);
  const next = [...filtered, snapshot]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-180);
  await setDoc(ref, {
    snapshots: next,
    updated_at: serverTimestamp(),
  });
}

export async function getPerformanceModel(
  uid: string,
): Promise<PerformanceModelSnapshot[]> {
  const snap = await getDoc(doc(db, 'users', uid, 'state', 'performance_model'));
  if (!snap.exists()) return [];
  const data = snap.data() as { snapshots?: PerformanceModelSnapshot[] };
  return data.snapshots ?? [];
}

const RESET_COLLECTIONS = [
  'checkins',
  'sessions',
  'runs',
  'maxes',
  'workload',
  'state',
  'sports',
  'schedules',
  'health_sync',
] as const;

async function deleteCollection(uid: string, name: string): Promise<void> {
  const snap = await getDocs(collection(db, 'users', uid, name));
  if (snap.empty) return;
  // Firestore batched writes cap at 500 ops; chunk just in case.
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = writeBatch(db);
    const slice = docs.slice(i, i + 400);
    for (const d of slice) batch.delete(d.ref);
    await batch.commit();
  }
}

/**
 * Delete every per-user document under `users/{uid}` and reset the
 * top-level profile to the pre-onboarding state. The auth user itself
 * is left intact so the caller can sign them out separately.
 *
 * @param uid Firebase auth UID
 */
export async function deleteAllUserData(uid: string): Promise<void> {
  for (const name of RESET_COLLECTIONS) {
    await deleteCollection(uid, name);
  }
  try {
    await deleteDoc(doc(db, 'users', uid, 'state', 'performance_model'));
  } catch {
    // already deleted by the state-collection sweep
  }
  await setDoc(
    doc(db, 'users', uid),
    {
      onboarding_completed: false,
      zone_score: 50,
    },
    { merge: true },
  );
}

export interface HealthSyncData {
  date: string;
  source: 'health_connect';
  sleep_duration_hours: number | null;
  sleep_quality: number | null;
  avg_heart_rate: number | null;
  resting_heart_rate: number | null;
  hrv_ms: number | null;
  steps: number | null;
  active_calories: number | null;
  weight_kg: number | null;
  synced_at: Timestamp | null;
}

export async function saveHealthSync(
  uid: string,
  data: Omit<HealthSyncData, 'synced_at'>,
): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'health_sync', data.date), {
    ...data,
    synced_at: serverTimestamp(),
  });
}

export async function getHealthSync(
  uid: string,
  date: string,
): Promise<HealthSyncData | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'health_sync', date));
  if (!snap.exists()) return null;
  return snap.data() as HealthSyncData;
}

export type StrengthTestSport = 'weightlifting' | 'musculation';

export interface StrengthTestState {
  weightlifting_session1_at: string | null;
  musculation_session1_at: string | null;
  updated_at: Timestamp | null;
}

export async function getStrengthTestState(
  uid: string,
): Promise<StrengthTestState | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'state', 'strength_test'));
  if (!snap.exists()) return null;
  return snap.data() as StrengthTestState;
}

export async function saveStrengthTestSession1(
  uid: string,
  sport: StrengthTestSport,
  iso: string,
): Promise<void> {
  const field =
    sport === 'weightlifting'
      ? 'weightlifting_session1_at'
      : 'musculation_session1_at';
  await setDoc(
    doc(db, 'users', uid, 'state', 'strength_test'),
    { [field]: iso, updated_at: serverTimestamp() },
    { merge: true },
  );
}

// ── On-demand recovery helpers ──────────────────────────────────────────────
// These power the smart recovery warnings: how long since the last session of
// a given sport, and what was trained on a given day.

function timestampToDate(t: Timestamp | null | undefined): Date | null {
  if (!t) return null;
  try {
    return t.toDate();
  } catch {
    return null;
  }
}

/** Fallback when a session has no completion timestamp: noon on its date. */
function dateStringToDate(date: string): Date | null {
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function latestDate(dates: (Date | null)[]): Date | null {
  let best: Date | null = null;
  for (const d of dates) {
    if (!d) continue;
    if (!best || d.getTime() > best.getTime()) best = d;
  }
  return best;
}

/**
 * Most recent completed session date/time for a sport, or null.
 *
 * @param uid Firebase auth UID
 * @param sport one of weightlifting / running / musculation / hyrox
 */
export async function getLastSessionBySport(
  uid: string,
  sport: ScheduleSport,
): Promise<Date | null> {
  if (sport === 'running') {
    const runs = await getCompletedRuns(uid, 10);
    return latestDate(
      runs.map((r) => timestampToDate(r.completed_at) ?? dateStringToDate(r.date)),
    );
  }
  if (sport === 'hyrox') {
    const records = await getHyroxSessionHistory(uid, 10);
    return latestDate(
      records.map((h) => timestampToDate(h.created_at) ?? dateStringToDate(h.date)),
    );
  }
  const sessions = await getCompletedSessions(uid);
  const filtered = sessions.filter((s) =>
    sport === 'musculation'
      ? s.discipline === 'musculation'
      : s.discipline !== 'musculation',
  );
  return latestDate(
    filtered.map((s) => timestampToDate(s.completed_at) ?? dateStringToDate(s.date)),
  );
}

export interface DatedSportSession {
  sport: ScheduleSport;
  at: Date | null;
}

/**
 * Every completed session (all sports) on a given calendar date.
 *
 * @param uid Firebase auth UID
 * @param date ISO date string (YYYY-MM-DD)
 */
export async function getLastSessionsByDate(
  uid: string,
  date: string,
): Promise<DatedSportSession[]> {
  const [sessions, runs, hyrox] = await Promise.all([
    getCompletedSessions(uid).catch(() => [] as TrainingSession[]),
    getCompletedRuns(uid, 30).catch(() => [] as RunSession[]),
    getHyroxSessionHistory(uid, 20).catch(() => [] as HyroxSessionRecord[]),
  ]);
  const out: DatedSportSession[] = [];
  for (const s of sessions) {
    if (s.date !== date) continue;
    out.push({
      sport: s.discipline === 'musculation' ? 'musculation' : 'weightlifting',
      at: timestampToDate(s.completed_at),
    });
  }
  for (const r of runs) {
    if (r.date === date) out.push({ sport: 'running', at: timestampToDate(r.completed_at) });
  }
  for (const h of hyrox) {
    if (h.date === date) out.push({ sport: 'hyrox', at: timestampToDate(h.created_at) });
  }
  return out;
}

// ── Programme queue persistence ─────────────────────────────────────────────
// The unified multi-sport queue: each session of each sport is keyed and its
// status (completed / skipped) persists so the next session of that sport
// unlocks. Key format: `${sport}_w${week}_s${sessionIndex}`.

export type QueueItemStatus = 'completed' | 'skipped';

export interface QueueItemState {
  status: QueueItemStatus;
  completedAt?: Timestamp | null;
  skippedAt?: Timestamp | null;
}

export type QueueState = Record<string, QueueItemState>;

export async function getProgrammeQueue(uid: string): Promise<QueueState> {
  const ref = doc(db, 'users', uid, 'state', 'programme_queue');
  const snap = await getDoc(ref);
  if (!snap.exists()) return {};
  const data = snap.data() as { items?: QueueState };
  const items = data.items ?? {};
  const normalized = normalizeQueueState(items);
  if (normalized !== items) {
    // Persist the migration so subsequent reads stay fast and downstream
    // writers (`updateQueueItem`) don't keep recreating the legacy
    // shape. `updateDoc` replaces the `items` field outright — that
    // drops the legacy `{sport}_w{N}_s{M}` entries that the canonical
    // builder no longer references. Best-effort; failure leaves the
    // in-memory normalized state intact.
    void updateDoc(ref, { items: normalized, updated_at: serverTimestamp() }).catch(() => undefined);
  }
  return normalized;
}

export async function updateQueueItem(
  uid: string,
  key: string,
  status: QueueItemStatus,
): Promise<void> {
  const stamp = status === 'completed' ? { completedAt: serverTimestamp() } : { skippedAt: serverTimestamp() };
  await setDoc(
    doc(db, 'users', uid, 'state', 'programme_queue'),
    { items: { [key]: { status, ...stamp } }, updated_at: serverTimestamp() },
    { merge: true },
  );
}

// ---------------------------------------------------------------------------
// Mode Vacances
// ---------------------------------------------------------------------------

export interface VacationState {
  active: boolean;
  startDate: Timestamp | null;
  returnDate: Timestamp | null;
  durationDays: number;
}

export async function getVacationState(uid: string): Promise<VacationState | null> {
  const snap = await getDoc(doc(db, 'users', uid, 'state', 'vacances'));
  if (!snap.exists()) return null;
  return snap.data() as VacationState;
}

export async function setVacationState(
  uid: string,
  state: VacationState,
): Promise<void> {
  await setDoc(doc(db, 'users', uid, 'state', 'vacances'), state);
}

export async function clearVacationState(uid: string): Promise<void> {
  await setDoc(
    doc(db, 'users', uid, 'state', 'vacances'),
    {
      active: false,
      startDate: null,
      returnDate: null,
      durationDays: 0,
    } satisfies VacationState,
  );
}
