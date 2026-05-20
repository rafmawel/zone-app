import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { colors } from '@/theme/colors';
import { getZoneLevel } from '@/lib/zoneScore';
import { ZoneText } from './ui/ZoneText';
import type { DailyCheckin } from '@/lib/firestore';

const HEIGHT = 140;
const PADDING_X = 24;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 24;
const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export interface ZoneSparklineProps {
  checkins: DailyCheckin[];
  width: number;
}

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface Point {
  x: number;
  y: number;
  score: number | null;
}

export function ZoneSparkline({ checkins, width }: ZoneSparklineProps): React.ReactElement {
  const innerW = Math.max(1, width - PADDING_X * 2);
  const innerH = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const stepX = innerW / 6;

  const points = useMemo<Point[]>(() => {
    const week = startOfWeek(new Date());
    const map = new Map<string, number>();
    for (const c of checkins) map.set(c.date, c.zone_score);
    const result: Point[] = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(week);
      d.setDate(week.getDate() + i);
      const key = isoDate(d);
      const score = map.has(key) ? (map.get(key) as number) : null;
      const x = PADDING_X + stepX * i;
      const y = PADDING_TOP + innerH - ((score ?? 0) / 100) * innerH;
      result.push({ x, y, score });
    }
    return result;
  }, [checkins, innerW, innerH, stepX]);

  const baselineY = PADDING_TOP + innerH - (50 / 100) * innerH;
  const realPoints = points.filter((p) => p.score !== null);
  const polyline = realPoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <View>
      <Svg width={width} height={HEIGHT}>
        {/* Baseline at 50 */}
        <Line
          x1={PADDING_X}
          x2={width - PADDING_X}
          y1={baselineY}
          y2={baselineY}
          stroke={colors.border}
          strokeWidth={1}
          strokeDasharray="3 4"
        />
        {/* Connecting line (only across real points) */}
        {realPoints.length > 1 ? (
          <Polyline
            points={polyline}
            fill="none"
            stroke={colors.accent.gold}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {/* Dots */}
        {points.map((p, i) => {
          if (p.score === null) {
            return (
              <Circle
                key={i}
                cx={p.x}
                cy={baselineY}
                r={3}
                fill={colors.bg.primary}
                stroke={colors.text.muted}
                strokeDasharray="2 2"
                strokeWidth={1}
              />
            );
          }
          const level = getZoneLevel(p.score);
          return (
            <Circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={5}
              fill={level.color}
              stroke={colors.bg.primary}
              strokeWidth={1.5}
            />
          );
        })}
      </Svg>
      <View style={[styles.daysRow, { paddingHorizontal: PADDING_X }]}>
        {DAY_LABELS.map((label) => (
          <ZoneText key={label} variant="caption" color={colors.text.muted} style={styles.dayLabel}>
            {label}
          </ZoneText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  daysRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayLabel: { fontSize: 10, letterSpacing: 0.5 },
});
