import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from './ui/ZoneText';
import { frenchMonthYear } from '@/lib/frenchDate';

export interface MonthCalendarProps {
  /** Currently selected date (YYYY-MM-DD) or empty string for no selection. */
  value: string;
  /** Earliest selectable day; defaults to today. */
  minDate?: Date;
  onChange: (next: string) => void;
}

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIso(iso: string): Date | null {
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function dayOfWeekISO(d: Date): number {
  // Monday-first: Mon=0..Sun=6
  return (d.getDay() + 6) % 7;
}

function buildMonthCells(view: Date): (Date | null)[] {
  const first = startOfMonth(view);
  const firstWeekday = dayOfWeekISO(first);
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  let cursor = new Date(first);
  while (cursor.getMonth() === view.getMonth()) {
    cells.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function MonthCalendar({ value, minDate, onChange }: MonthCalendarProps): React.ReactElement {
  const today = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);
  const floor = minDate ?? today;
  const initial = parseIso(value) ?? today;
  const [view, setView] = useState<Date>(startOfMonth(initial));

  const cells = useMemo(() => buildMonthCells(view), [view]);
  const selected = value;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => setView((v) => addMonths(v, -1))}
          hitSlop={12}
          activeOpacity={0.7}
          style={styles.navBtn}
        >
          <ChevronLeft size={20} color={colors.scoreGreen} />
        </TouchableOpacity>
        <ZoneText variant="titleSm" color={colors.text.primary}>
          {frenchMonthYear(view)}
        </ZoneText>
        <TouchableOpacity
          onPress={() => setView((v) => addMonths(v, 1))}
          hitSlop={12}
          activeOpacity={0.7}
          style={styles.navBtn}
        >
          <ChevronRight size={20} color={colors.scoreGreen} />
        </TouchableOpacity>
      </View>

      <View style={styles.dayLabelRow}>
        {DAY_LABELS.map((d, i) => (
          <ZoneText
            key={i}
            variant="caption"
            color={colors.text.muted}
            style={styles.dayLabel}
          >
            {d}
          </ZoneText>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={styles.cellEmpty} />;
          const iso = isoDate(d);
          const isSelected = iso === selected;
          const isPast = d.getTime() < floor.getTime();
          return (
            <TouchableOpacity
              key={i}
              activeOpacity={isPast ? 1 : 0.7}
              disabled={isPast}
              onPress={() => onChange(iso)}
              style={[
                styles.cell,
                isSelected ? styles.cellSelected : null,
              ]}
            >
              <ZoneText
                variant="label"
                style={{
                  color: isSelected
                    ? colors.bg.primary
                    : isPast
                      ? colors.text.muted
                      : colors.text.primary,
                  fontFamily: isSelected ? 'Inter_700Bold' : 'Inter_500Medium',
                }}
              >
                {d.getDate()}
              </ZoneText>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.bg.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    letterSpacing: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  cellEmpty: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
  },
  cellSelected: {
    backgroundColor: colors.scoreGreen,
  },
});
