import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Circle,
  G,
  Line as SvgLine,
  Path,
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';

export interface LineSeries {
  values: number[];
  color: string;
  strokeWidth?: number;
  dashed?: boolean;
}

export interface LineChartProps {
  width: number;
  height: number;
  series: LineSeries[];
  xLabels?: string[];
  yMin: number;
  yMax: number;
  /** Optional band [start,end] in y units that is highlighted (e.g. optimal zone). */
  band?: { from: number; to: number; color: string };
  /** Optional horizontal reference lines. */
  guides?: { y: number; color: string; dashed?: boolean }[];
  padding?: number;
}

const DEFAULT_PAD = 28;

function scaleX(i: number, n: number, width: number, pad: number): number {
  if (n <= 1) return pad;
  return pad + (i * (width - pad * 2)) / (n - 1);
}

function scaleY(
  v: number,
  min: number,
  max: number,
  height: number,
  pad: number,
): number {
  if (max === min) return height / 2;
  const t = (v - min) / (max - min);
  return height - pad - t * (height - pad * 2);
}

export function LineChart({
  width,
  height,
  series,
  xLabels,
  yMin,
  yMax,
  band,
  guides,
  padding = DEFAULT_PAD,
}: LineChartProps): React.ReactElement {
  const w = Math.max(120, width);
  const h = height;
  const pad = padding;
  const maxN = series.reduce((acc, s) => Math.max(acc, s.values.length), 0);

  return (
    <Svg width={w} height={h}>
      {band ? (
        <Rect
          x={pad}
          y={scaleY(band.to, yMin, yMax, h, pad)}
          width={w - pad * 2}
          height={Math.max(
            0,
            scaleY(band.from, yMin, yMax, h, pad) -
              scaleY(band.to, yMin, yMax, h, pad),
          )}
          fill={band.color}
          opacity={0.12}
        />
      ) : null}
      {guides?.map((g, idx) => (
        <SvgLine
          key={`g-${idx}`}
          x1={pad}
          x2={w - pad}
          y1={scaleY(g.y, yMin, yMax, h, pad)}
          y2={scaleY(g.y, yMin, yMax, h, pad)}
          stroke={g.color}
          strokeWidth={1}
          strokeDasharray={g.dashed ? '4,4' : undefined}
          opacity={0.5}
        />
      ))}
      {series.map((s, idx) => {
        if (s.values.length === 0) return null;
        let started = false;
        const d = s.values
          .map((v, i) => {
            if (!Number.isFinite(v)) {
              started = false;
              return '';
            }
            const x = scaleX(i, maxN, w, pad);
            const y = scaleY(v, yMin, yMax, h, pad);
            const cmd = started ? 'L' : 'M';
            started = true;
            return `${cmd}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .filter((part) => part.length > 0)
          .join(' ');
        const lastFinite = [...s.values]
          .map((v, i) => ({ v, i }))
          .filter((entry) => Number.isFinite(entry.v))
          .pop();
        const lastX = lastFinite
          ? scaleX(lastFinite.i, maxN, w, pad)
          : pad;
        const lastY = lastFinite
          ? scaleY(lastFinite.v, yMin, yMax, h, pad)
          : pad;
        return (
          <G key={`s-${idx}`}>
            <Path
              d={d}
              stroke={s.color}
              strokeWidth={s.strokeWidth ?? 2}
              fill="none"
              strokeDasharray={s.dashed ? '5,4' : undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <Circle cx={lastX} cy={lastY} r={3.5} fill={s.color} />
          </G>
        );
      })}
      {xLabels?.map((label, i) => (
        <SvgText
          key={`x-${i}`}
          x={scaleX(i, xLabels.length, w, pad)}
          y={h - 6}
          fontSize={10}
          fill={colors.text.muted}
          textAnchor="middle"
        >
          {label}
        </SvgText>
      ))}
    </Svg>
  );
}

export interface BarChartItem {
  value: number;
  color: string;
}

export interface BarChartProps {
  width: number;
  height: number;
  data: BarChartItem[];
  yMin: number;
  yMax: number;
  guides?: { y: number; color: string; dashed?: boolean; label?: string }[];
  padding?: number;
}

export function BarChart({
  width,
  height,
  data,
  yMin,
  yMax,
  guides,
  padding = DEFAULT_PAD,
}: BarChartProps): React.ReactElement {
  const w = Math.max(120, width);
  const h = height;
  const pad = padding;
  const innerW = w - pad * 2;
  const barW = data.length > 0 ? Math.max(2, innerW / data.length - 1.5) : 0;

  return (
    <Svg width={w} height={h}>
      {guides?.map((g, idx) => (
        <G key={`g-${idx}`}>
          <SvgLine
            x1={pad}
            x2={w - pad}
            y1={scaleY(g.y, yMin, yMax, h, pad)}
            y2={scaleY(g.y, yMin, yMax, h, pad)}
            stroke={g.color}
            strokeWidth={1}
            strokeDasharray={g.dashed ? '4,4' : undefined}
            opacity={0.6}
          />
          {g.label ? (
            <SvgText
              x={w - pad - 4}
              y={scaleY(g.y, yMin, yMax, h, pad) - 4}
              fontSize={9}
              fill={g.color}
              textAnchor="end"
            >
              {g.label}
            </SvgText>
          ) : null}
        </G>
      ))}
      {data.map((d, i) => {
        const x = pad + (i * innerW) / Math.max(1, data.length);
        const yTop = scaleY(d.value, yMin, yMax, h, pad);
        const yBase = scaleY(yMin, yMin, yMax, h, pad);
        const heightBar = Math.max(0, yBase - yTop);
        return (
          <Rect
            key={`b-${i}`}
            x={x}
            y={yTop}
            width={barW}
            height={heightBar}
            fill={d.color}
            rx={1.5}
          />
        );
      })}
    </Svg>
  );
}

export interface DonutChartProps {
  size: number;
  thickness: number;
  segments: { value: number; color: string }[];
  centerLabel?: string;
  centerSub?: string;
}

export function DonutChart({
  size,
  thickness,
  segments,
  centerLabel,
  centerSub,
}: DonutChartProps): React.ReactElement {
  const total = segments.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  const r = size / 2 - thickness / 2;
  const cx = size / 2;
  const cy = size / 2;

  let startAngle = -Math.PI / 2;

  const arcs: React.ReactElement[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg.value <= 0 || total <= 0) continue;
    const angle = (seg.value / total) * Math.PI * 2;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const d = `M${x1} ${y1} A${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
    arcs.push(
      <Path
        key={`d-${i}`}
        d={d}
        stroke={seg.color}
        strokeWidth={thickness}
        fill="none"
        strokeLinecap="butt"
      />,
    );
    startAngle = endAngle;
  }

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFillObject}>
        {arcs}
      </Svg>
      <View style={{ alignItems: 'center' }}>
        {centerLabel ? (
          <ZoneText variant="heading" size={28} color={colors.text.primary}>
            {centerLabel}
          </ZoneText>
        ) : null}
        {centerSub ? (
          <ZoneText variant="caption" color={colors.text.muted}>
            {centerSub}
          </ZoneText>
        ) : null}
      </View>
    </View>
  );
}

export interface RadarChartProps {
  size: number;
  axes: string[];
  values: number[];
  reference?: number[];
  /** Max value used to normalise. */
  max: number;
  fillColor?: string;
  strokeColor?: string;
}

export function RadarChart({
  size,
  axes,
  values,
  reference,
  max,
  fillColor = colors.scoreGreen,
  strokeColor = colors.scoreGreen,
}: RadarChartProps): React.ReactElement {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 18;
  const n = axes.length;
  const pointFor = (val: number, i: number): { x: number; y: number } => {
    const t = Math.max(0, Math.min(1, val / Math.max(1, max)));
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return {
      x: cx + Math.cos(angle) * r * t,
      y: cy + Math.sin(angle) * r * t,
    };
  };
  const polygonPoints = (vals: number[]): string =>
    vals
      .map((v, i) => {
        const p = pointFor(v, i);
        return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })
      .join(' ');

  return (
    <Svg width={size} height={size}>
      {[0.25, 0.5, 0.75, 1].map((s, i) => (
        <Polygon
          key={`ring-${i}`}
          points={axes
            .map((_, idx) => {
              const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / n;
              return `${(cx + Math.cos(angle) * r * s).toFixed(1)},${(cy + Math.sin(angle) * r * s).toFixed(1)}`;
            })
            .join(' ')}
          stroke={colors.border}
          strokeWidth={0.5}
          fill="none"
        />
      ))}
      {axes.map((axis, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        return (
          <G key={`axis-${i}`}>
            <SvgLine
              x1={cx}
              y1={cy}
              x2={x}
              y2={y}
              stroke={colors.border}
              strokeWidth={0.5}
            />
            <SvgText
              x={cx + Math.cos(angle) * (r + 10)}
              y={cy + Math.sin(angle) * (r + 10)}
              fontSize={9}
              fill={colors.text.muted}
              textAnchor="middle"
            >
              {axis}
            </SvgText>
          </G>
        );
      })}
      {reference ? (
        <Polygon
          points={polygonPoints(reference)}
          stroke={colors.text.muted}
          strokeWidth={1}
          strokeDasharray="4,3"
          fill="none"
        />
      ) : null}
      <Polygon
        points={polygonPoints(values)}
        stroke={strokeColor}
        strokeWidth={2}
        fill={fillColor}
        fillOpacity={0.25}
      />
    </Svg>
  );
}
