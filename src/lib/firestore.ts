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

export interface TrainingSession {
  id: string;
  date: string;
  sport_key: TrainingSessionSport;
  status: TrainingSessionStatus;
  rpe?: number;
  duration_minutes?: number;
  created_at: Timestamp | null;
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
