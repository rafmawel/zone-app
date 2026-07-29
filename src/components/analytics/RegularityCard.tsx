import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, type SportColorKey } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';

/** One completed activity, keyed by local date string ('YYYY-MM-DD'). */
export interface RegularityActivity {
  date: string;
  sport: SportColorKey;
}

export interface RegularityCardProps {
  activities: RegularityActivity[];
}

const HALTERO_COLOR = '#4F46E5'; // indigo — haltérophilie (et muscu / hyrox)
const COURSE_COLOR = '#F97316'; // orange — course
const REST_COLOR = 'rgba(255,255,255,0.08)'; // jour passé sans séance
const FUTURE_COLOR = 'rgba(255,255,255,0.04)'; // jour à venir (plus discret)
const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

/**
 * ISO 8601 week number: weeks start on Monday and week 1 is the one containing
 * the year's first Thursday. Matches the `S{n}` labels shown down the left.
 */
export function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Lundi = 1 … Dimanche = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Local Y-M-D, matching how activity dates are stored (todayDateString). */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface GridDay {
  date: string;
  isToday: boolean;
  isFuture: boolean;
  haltero: boolean;
  course: boolean;
}
interface GridWeek {
  weekNum: number;
  days: GridDay[];
}

interface Regularity {
  weeks: GridWeek[];
  totalSessions: number;
  weightliftingCount: number;
  runningCount: number;
  streakDays: number;
}

/** Build the sliding 8-week ISO grid (oldest week first) + the counters. */
function computeRegularity(activities: RegularityActivity[]): Regularity {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = ymd(today);
  const mondayOffset = (today.getDay() + 6) % 7; // jours depuis lundi

  // Per-day sport flags. Course = 'run'; tout le reste (haltéro / muscu /
  // hyrox) tombe dans le bucket indigo, comme le compteur « haltéro ».
  const byDate = new Map<string, { haltero: boolean; course: boolean }>();
  for (const a of activities) {
    const entry = byDate.get(a.date) ?? { haltero: false, course: false };
    if (a.sport === 'run') entry.course = true;
    else entry.haltero = true;
    byDate.set(a.date, entry);
  }

  const weeks: GridWeek[] = [];
  for (let w = 7; w >= 0; w -= 1) {
    const monday = new Date(today);
    monday.setDate(today.getDate() - mondayOffset - w * 7);
    const days: GridDay[] = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      const ds = ymd(day);
      const flags = byDate.get(ds);
      return {
        date: ds,
        isToday: ds === todayStr,
        isFuture: ds > todayStr,
        haltero: flags?.haltero ?? false,
        course: flags?.course ?? false,
      };
    });
    weeks.push({ weekNum: getISOWeekNumber(monday), days });
  }

  // Counters over the visible window (oldest Monday → today).
  const firstDay = weeks[0]?.days[0]?.date ?? todayStr;
  const windowActs = activities.filter((a) => a.date >= firstDay && a.date <= todayStr);
  const totalSessions = windowActs.length;
  const weightliftingCount = windowActs.filter(
    (a) => a.sport === 'haltero' || a.sport === 'muscu',
  ).length;
  const runningCount = windowActs.filter((a) => a.sport === 'run').length;

  // Consecutive days ending today (or yesterday if today is a rest day).
  const doneSet = new Set(activities.map((a) => a.date));
  let streakDays = 0;
  const cursor = new Date(today);
  if (!doneSet.has(ymd(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (doneSet.has(ymd(cursor))) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { weeks, totalSessions, weightliftingCount, runningCount, streakDays };
}

/** Section 2 — "Ta régularité" : an ISO-week dot grid (L→D columns, S{n} rows). */
export function RegularityCard({ activities }: RegularityCardProps): React.ReactElement {
  const { weeks, totalSessions, weightliftingCount, runningCount, streakDays } = useMemo(
    () => computeRegularity(activities),
    [activities],
  );

  return (
    <View style={styles.card}>
      <ZoneText style={styles.title}>Ta régularité</ZoneText>
      <ZoneText style={styles.subtitle}>Séances complétées ces 8 dernières semaines</ZoneText>

      <View style={styles.grid}>
        <View style={styles.headerRow}>
          <View style={styles.weekLabelCol} />
          {DAY_LABELS.map((label, i) => (
            <ZoneText key={i} style={styles.colHeader}>
              {label}
            </ZoneText>
          ))}
        </View>

        {weeks.map((week) => (
          <View key={`${week.weekNum}-${week.days[0]?.date ?? ''}`} style={styles.weekRow}>
            <ZoneText style={styles.weekLabel}>S{week.weekNum}</ZoneText>
            {week.days.map((day, di) => (
              <DayCell key={di} day={day} />
            ))}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        <LegendItem color={HALTERO_COLOR} label="Haltérophilie" />
        <LegendItem color={COURSE_COLOR} label="Course" />
        <LegendItem color={REST_COLOR} label="Repos" hollow />
      </View>

      <ZoneText style={styles.footer}>
        {totalSessions} séance{totalSessions > 1 ? 's' : ''} · {weightliftingCount} haltéro ·{' '}
        {runningCount} course · {streakDays} jour{streakDays > 1 ? 's' : ''} consécutif
        {streakDays > 1 ? 's' : ''}
      </ZoneText>
    </View>
  );
}

/** A single day: one colored dot, or two half-dots when both sports happened. */
function DayCell({ day }: { day: GridDay }): React.ReactElement {
  if (day.haltero && day.course) {
    return (
      <View style={styles.cell}>
        <View style={styles.dualWrap}>
          <View style={[styles.dotSmall, { backgroundColor: HALTERO_COLOR }]} />
          <View style={[styles.dotSmall, { backgroundColor: COURSE_COLOR }]} />
        </View>
      </View>
    );
  }
  let bg = FUTURE_COLOR;
  if (!day.isFuture) {
    if (day.haltero) bg = HALTERO_COLOR;
    else if (day.course) bg = COURSE_COLOR;
    else bg = REST_COLOR;
  }
  return (
    <View style={styles.cell}>
      <View style={[styles.dot, { backgroundColor: bg }, day.isToday ? styles.today : null]} />
    </View>
  );
}

function LegendItem({
  color,
  label,
  hollow,
}: {
  color: string;
  label: string;
  hollow?: boolean;
}): React.ReactElement {
  return (
    <View style={styles.legendItem}>
      <View
        style={[
          styles.legendDot,
          hollow
            ? { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)' }
            : { backgroundColor: color },
        ]}
      />
      <ZoneText style={styles.legendLabel}>{label}</ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: 16 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 16, color: colors.textPrimary },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  grid: { marginTop: 16, gap: 7 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  weekRow: { flexDirection: 'row', alignItems: 'center' },
  weekLabelCol: { width: 32 },
  weekLabel: {
    width: 32,
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
  },
  colHeader: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
  },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotSmall: { width: 6, height: 6, borderRadius: 3 },
  dualWrap: { flexDirection: 'row', gap: 2 },
  today: { borderWidth: 1.5, borderColor: '#FFFFFF' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  footer: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 14,
    textAlign: 'center',
  },
});
