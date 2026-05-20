import type { MuscleGroup } from '@/data/exercises';

export type SchedulerSport = 'weightlifting' | 'running' | 'musculation' | 'hyrox';
export type SessionIntensity = 'low' | 'medium' | 'high';
export type EnergySystem = 'atp_pcr' | 'glycolytic' | 'oxidative';

export interface ActiveSport {
  sport: SchedulerSport;
  sessionsPerWeek: number;
}

export interface ScheduledSession {
  sport: SchedulerSport;
  session_type: string;
  planned_duration_minutes: number;
  intensity: SessionIntensity;
  muscle_groups_affected: MuscleGroup[];
  energy_systems: EnergySystem[];
}

export interface ScheduleWarning {
  level: 'info' | 'caution' | 'danger';
  message: string;
}

export interface DayPlan {
  date: string;
  day_index: number;
  sessions: ScheduledSession[];
  recovery_score: number;
  load_score: number;
  warnings: ScheduleWarning[];
}

export interface WeeklySchedule {
  week_start: string;
  days: DayPlan[];
}

export interface SchedulePreferences {
  long_run_day?: 'samedi' | 'dimanche' | 'flexible';
  rest_day?: 'lundi' | 'mardi' | 'mercredi' | 'jeudi' | 'vendredi' | 'samedi' | 'dimanche';
}

const SPORT_COLORS: Record<SchedulerSport, string> = {
  weightlifting: '#C9A84C',
  running: '#64B5F6',
  musculation: '#B074F0',
  hyrox: '#FF9F4A',
};

export function sportColor(sport: SchedulerSport): string {
  return SPORT_COLORS[sport];
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function mondayOf(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day + 6) % 7;
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

interface PlannedSlot {
  sport: SchedulerSport;
  intensity: SessionIntensity;
  session_type: string;
  duration_min: number;
  muscles: MuscleGroup[];
  energy: EnergySystem[];
}

function buildSportSlots(sport: ActiveSport): PlannedSlot[] {
  const slots: PlannedSlot[] = [];
  const n = Math.max(1, Math.min(7, sport.sessionsPerWeek));
  if (sport.sport === 'weightlifting') {
    for (let i = 0; i < n; i += 1) {
      slots.push({
        sport: 'weightlifting',
        intensity: 'high',
        session_type: i === 0 ? 'Snatch focus' : i === 1 ? 'Clean & Jerk' : 'Force',
        duration_min: 75,
        muscles: ['quadriceps', 'glutes', 'lower_back', 'traps', 'shoulders'],
        energy: ['atp_pcr', 'glycolytic'],
      });
    }
  } else if (sport.sport === 'running') {
    for (let i = 0; i < n; i += 1) {
      const isLong = i === n - 1;
      const isQuality = !isLong && i === Math.floor(n / 2);
      slots.push({
        sport: 'running',
        intensity: isQuality ? 'high' : 'low',
        session_type: isLong ? 'Sortie longue' : isQuality ? 'Intervalles VO2max' : 'Endurance fondamentale',
        duration_min: isLong ? 80 : isQuality ? 55 : 45,
        muscles: ['quadriceps', 'hamstrings', 'calves'],
        energy: isQuality ? ['glycolytic', 'oxidative'] : ['oxidative'],
      });
    }
  } else if (sport.sport === 'musculation') {
    for (let i = 0; i < n; i += 1) {
      slots.push({
        sport: 'musculation',
        intensity: 'medium',
        session_type: i % 2 === 0 ? 'Upper' : 'Lower',
        duration_min: 60,
        muscles:
          i % 2 === 0
            ? ['chest', 'upper_back', 'shoulders', 'biceps', 'triceps']
            : ['quadriceps', 'hamstrings', 'glutes', 'calves'],
        energy: ['glycolytic'],
      });
    }
  } else {
    for (let i = 0; i < n; i += 1) {
      const isSim = i === n - 1;
      slots.push({
        sport: 'hyrox',
        intensity: isSim ? 'high' : 'medium',
        session_type: isSim ? 'Simulation' : i % 2 === 0 ? 'Stations' : 'Base course',
        duration_min: isSim ? 75 : 50,
        muscles: ['quadriceps', 'glutes', 'shoulders', 'upper_back', 'core'],
        energy: ['glycolytic', 'oxidative'],
      });
    }
  }
  return slots;
}

const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;
type DayName = (typeof DAY_NAMES)[number];

function dayIndexFromName(name: DayName | undefined): number | null {
  if (!name) return null;
  return DAY_NAMES.indexOf(name);
}

function intensityScore(intensity: SessionIntensity): number {
  return intensity === 'high' ? 60 : intensity === 'medium' ? 35 : 20;
}

function overlap(a: MuscleGroup[], b: MuscleGroup[]): MuscleGroup[] {
  const set = new Set(a);
  return b.filter((m) => set.has(m));
}

export function generateOptimalWeek(
  activeSports: ActiveSport[],
  preferences: SchedulePreferences,
  weekStart?: Date,
): WeeklySchedule {
  const start = mondayOf(weekStart ?? new Date());
  const restIdx = dayIndexFromName(preferences.rest_day);
  const longRunDay = preferences.long_run_day === 'samedi' ? 5 : 6;

  const allSlots: PlannedSlot[] = [];
  for (const sport of activeSports) {
    allSlots.push(...buildSportSlots(sport));
  }
  allSlots.sort((a, b) => intensityScore(b.intensity) - intensityScore(a.intensity));

  const days: DayPlan[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    days.push({
      date: isoDate(date),
      day_index: i,
      sessions: [],
      recovery_score: 100,
      load_score: 0,
      warnings: [],
    });
  }

  const placementOrder = [1, 3, 5, 0, 2, 4, 6];
  const allowed = (idx: number): boolean => restIdx === null || idx !== restIdx;

  for (const slot of allSlots) {
    // Long runs go on the preferred long-run day if open
    if (slot.sport === 'running' && slot.session_type === 'Sortie longue' && allowed(longRunDay)) {
      const targetDay = days[longRunDay];
      if (canPlace(targetDay, slot)) {
        targetDay.sessions.push(toScheduled(slot));
        continue;
      }
    }
    let placed = false;
    for (const idx of placementOrder) {
      if (!allowed(idx)) continue;
      const day = days[idx];
      if (!canPlace(day, slot)) continue;
      day.sessions.push(toScheduled(slot));
      placed = true;
      break;
    }
    if (!placed) {
      for (let idx = 0; idx < 7; idx += 1) {
        if (!allowed(idx)) continue;
        days[idx].sessions.push(toScheduled(slot));
        placed = true;
        break;
      }
    }
  }

  for (const day of days) {
    day.load_score = Math.min(
      100,
      day.sessions.reduce((acc, s) => acc + intensityScore(s.intensity), 0),
    );
    day.recovery_score = Math.max(0, 100 - day.load_score);
    day.warnings = checkDayConflicts(day);
  }

  // Consecutive day warnings
  let streak = 0;
  for (let i = 0; i < days.length; i += 1) {
    if (days[i].sessions.length > 0) {
      streak += 1;
      if (streak >= 3) {
        days[i].warnings.push({
          level: 'caution',
          message:
            'Trois jours d’entraînement consécutifs. Intègre une sortie légère ou repos demain.',
        });
      }
    } else {
      streak = 0;
    }
  }

  return { week_start: isoDate(start), days };
}

function canPlace(day: DayPlan, slot: PlannedSlot): boolean {
  if (day.sessions.length >= 2) return false;
  for (const existing of day.sessions) {
    if (
      (existing.sport === 'weightlifting' && slot.intensity === 'high' && slot.sport === 'running') ||
      (existing.sport === 'running' && existing.intensity === 'high' && slot.sport === 'weightlifting')
    ) {
      return false;
    }
    if (overlap(existing.muscle_groups_affected, slot.muscles).length >= 3) {
      return false;
    }
  }
  return true;
}

function toScheduled(slot: PlannedSlot): ScheduledSession {
  return {
    sport: slot.sport,
    session_type: slot.session_type,
    planned_duration_minutes: slot.duration_min,
    intensity: slot.intensity,
    muscle_groups_affected: slot.muscles,
    energy_systems: slot.energy,
  };
}

export function checkDayConflicts(day: DayPlan): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = [];
  if (day.sessions.length < 2) return warnings;

  for (let i = 0; i < day.sessions.length; i += 1) {
    for (let j = i + 1; j < day.sessions.length; j += 1) {
      const a = day.sessions[i];
      const b = day.sessions[j];
      const isHeavyLift = (s: ScheduledSession): boolean =>
        s.sport === 'weightlifting' || (s.sport === 'musculation' && s.intensity === 'high');
      const isIntervals = (s: ScheduledSession): boolean =>
        s.sport === 'running' && s.intensity === 'high';
      if ((isHeavyLift(a) && isIntervals(b)) || (isHeavyLift(b) && isIntervals(a))) {
        warnings.push({
          level: 'danger',
          message: 'Haltéro lourd + fractionné le même jour. Risque blessure élevé.',
        });
      }
      const isStrength = (s: ScheduledSession): boolean =>
        s.sport === 'weightlifting' || s.sport === 'musculation';
      if ((isStrength(a) && b.sport === 'running') || (isStrength(b) && a.sport === 'running')) {
        warnings.push({
          level: 'caution',
          message:
            'Force + course le même jour. Fais la course en premier si tu dois.',
        });
      }
      const muscleOverlap = overlap(a.muscle_groups_affected, b.muscle_groups_affected);
      if (muscleOverlap.length >= 3) {
        warnings.push({
          level: 'danger',
          message:
            'Ces groupes musculaires se chevauchent fortement. Espace ces séances de 48 h.',
        });
      }
    }
  }
  return warnings;
}
