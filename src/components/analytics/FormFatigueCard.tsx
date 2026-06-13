import React, { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';
import { Card } from '@/components/ui/Card';
import { LineChart } from './charts';
import type { DailyPerformanceMetrics, FormStatus } from '@/lib/pro';

export interface FormFatigueCardProps {
  metrics: DailyPerformanceMetrics[];
  formStatus: FormStatus;
}

function weeklyAverage(values: number[], weeks: number): number[] {
  if (values.length === 0) return [];
  const out: number[] = [];
  const perWeek = Math.max(1, Math.floor(values.length / weeks));
  for (let w = 0; w < weeks; w += 1) {
    const start = values.length - (weeks - w) * perWeek;
    const slice = values.slice(Math.max(0, start), Math.max(0, start) + perWeek);
    if (slice.length === 0) {
      out.push(0);
    } else {
      out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
  }
  return out;
}

export function FormFatigueCard({ metrics, formStatus }: FormFatigueCardProps): React.ReactElement {
  const [width, setWidth] = useState<number>(0);

  const onLayout = (e: LayoutChangeEvent): void => {
    setWidth(e.nativeEvent.layout.width);
  };

  const { ctlSeries, atlSeries, tsbSeries, xLabels, current, weeklyDelta } = useMemo(() => {
    const tail = metrics.slice(-56);
    const ctl = weeklyAverage(tail.map((m) => m.ctl), 8);
    const atl = weeklyAverage(tail.map((m) => m.atl), 8);
    const tsb = weeklyAverage(tail.map((m) => m.tsb), 8);
    const labels = Array.from({ length: 8 }, (_, i) => `S${i + 1}`);
    const last = metrics[metrics.length - 1];
    const prev = metrics[metrics.length - 8] ?? metrics[0];
    return {
      ctlSeries: ctl,
      atlSeries: atl,
      tsbSeries: tsb,
      xLabels: labels,
      current: last,
      weeklyDelta: {
        ctl: last && prev ? last.ctl - prev.ctl : 0,
        atl: last && prev ? last.atl - prev.atl : 0,
        tsb: last && prev ? last.tsb - prev.tsb : 0,
      },
    };
  }, [metrics]);

  const hasData = metrics.length > 0 && metrics.some((m) => m.ctl > 0 || m.atl > 0);

  return (
    <Card style={styles.card}>
      <ZoneText variant="heading" size={22} color={colors.text.primary} style={styles.title}>
        TON ÉNERGIE SUR 8 SEMAINES
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.subtitle}>
        Comment ton corps a évolué ces 2 derniers mois
      </ZoneText>

      <View style={styles.chartWrap} onLayout={onLayout}>
        {width > 0 ? (
          hasData ? (
            <LineChart
              width={width}
              height={180}
              yMin={-60}
              yMax={120}
              band={{ from: 5, to: 25, color: colors.success }}
              guides={[{ y: 0, color: colors.text.muted, dashed: true }]}
              xLabels={xLabels}
              series={[
                { values: ctlSeries, color: colors.scoreGreen, strokeWidth: 2.5 },
                {
                  values: atlSeries,
                  color: colors.danger,
                  strokeWidth: 1.5,
                  dashed: true,
                },
                { values: tsbSeries, color: colors.orbe.blue, strokeWidth: 2 },
              ]}
            />
          ) : (
            <View style={styles.empty}>
              <ZoneText variant="caption" color={colors.text.muted}>
                Pas encore assez de données. Termine quelques séances pour voir ton énergie évoluer.
              </ZoneText>
            </View>
          )
        ) : null}
      </View>

      <View style={styles.legend}>
        <LegendItem color={colors.scoreGreen} label="Énergie accumulée" />
        <LegendItem color={colors.danger} label="Fatigue récente" />
        <LegendItem color={colors.orbe.blue} label="Forme du moment" />
        <LegendItem color={colors.success} label="Zone idéale" />
      </View>

      <View style={styles.metrics}>
        <Metric label="ÉNERGIE" value={current?.ctl ?? 0} delta={weeklyDelta.ctl} color={colors.scoreGreen} />
        <Metric label="FATIGUE" value={current?.atl ?? 0} delta={weeklyDelta.atl} color={colors.danger} />
        <Metric label="FORME" value={current?.tsb ?? 0} delta={weeklyDelta.tsb} color={colors.orbe.blue} signed />
      </View>

      <View style={[styles.interpret, { borderLeftColor: formStatus.color }]}>
        <ZoneText variant="label" color={formStatus.color}>
          {formStatus.label}
        </ZoneText>
        <ZoneText variant="body" size={13} color={colors.text.primary} style={styles.interpretMsg}>
          {interpretForm(current?.tsb ?? 0)}
        </ZoneText>
      </View>

      <ZoneText variant="caption" size={10} color={colors.text.muted} style={styles.science}>
        Méthode utilisée par les athlètes olympiques depuis 1975
      </ZoneText>
    </Card>
  );
}

function interpretForm(tsb: number): string {
  if (tsb > 25) return 'Tu es frais. Idéal pour te dépasser.';
  if (tsb >= 5) return 'Tu es bien équilibré. Ni trop fatigué, ni sous-entraîné.';
  if (tsb >= -10) return 'Légère fatigue. Séance modérée conseillée.';
  return 'Fatigue accumulée. Récupère en priorité.';
}

function LegendItem({ color, label }: { color: string; label: string }): React.ReactElement {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <ZoneText variant="caption" size={10} color={colors.text.muted}>
        {label}
      </ZoneText>
    </View>
  );
}

interface MetricProps {
  label: string;
  value: number;
  delta: number;
  color: string;
  signed?: boolean;
}

function Metric({ label, value, delta, color, signed }: MetricProps): React.ReactElement {
  const arrow = delta > 0.5 ? <ChevronUp size={12} color={colors.success} /> : delta < -0.5 ? <ChevronDown size={12} color={colors.danger} /> : null;
  const deltaColor = delta > 0.5 ? colors.success : delta < -0.5 ? colors.danger : colors.text.muted;
  const sign = signed && value > 0 ? '+' : '';
  return (
    <View style={styles.metric}>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.metricLabel}>
        {label}
      </ZoneText>
      <ZoneText variant="heading" size={28} color={color}>
        {sign}
        {Math.round(value)}
      </ZoneText>
      <View style={styles.metricDelta}>
        {arrow}
        <ZoneText variant="caption" color={deltaColor}>
          {delta > 0 ? '+' : ''}
          {delta.toFixed(1)} cette semaine
        </ZoneText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  title: {
    letterSpacing: 1.2,
  },
  subtitle: {
    marginTop: 2,
    marginBottom: 12,
  },
  chartWrap: {
    minHeight: 180,
    marginBottom: 8,
  },
  empty: {
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  metrics: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  metric: {
    flex: 1,
    backgroundColor: colors.bg.elevated,
    borderRadius: 12,
    padding: 12,
    alignItems: 'flex-start',
  },
  metricLabel: {
    letterSpacing: 1,
    marginBottom: 4,
  },
  metricDelta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  interpret: {
    marginTop: 16,
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 6,
  },
  interpretMsg: {
    marginTop: 4,
  },
  interpretAdvice: {
    marginTop: 4,
    fontStyle: 'italic',
  },
  science: {
    marginTop: 12,
    textAlign: 'center',
  },
});
