import React, { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';
import { Card } from '@/components/ui/Card';
import { BarChart } from './charts';
import type { ACWRResult, WeeklyLoadBudget, WorkloadDataPoint } from '@/lib/pro';
import { calculateACWR } from '@/lib/pro';

export interface ACWRCardProps {
  acwrResult: ACWRResult;
  budget: WeeklyLoadBudget;
  workloadHistory: WorkloadDataPoint[];
}

function colorForACWR(value: number): string {
  if (value < 0.6) return colors.text.muted;
  if (value < 0.8) return colors.orbe.blue;
  if (value <= 1.3) return colors.success;
  if (value <= 1.5) return colors.orbe.amber;
  return colors.danger;
}

function isoFromOffset(offsetDays: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

export function ACWRCard({
  acwrResult,
  budget,
  workloadHistory,
}: ACWRCardProps): React.ReactElement {
  const [width, setWidth] = useState<number>(0);
  const onLayout = (e: LayoutChangeEvent): void => {
    setWidth(e.nativeEvent.layout.width);
  };

  const daily = useMemo(() => {
    const out: { value: number; color: string }[] = [];
    for (let i = 27; i >= 0; i -= 1) {
      const day = isoFromOffset(i);
      const r = calculateACWR(workloadHistory, day);
      const value = Math.min(2.2, Math.max(0, r.acwr));
      out.push({ value, color: colorForACWR(r.acwr) });
    }
    return out;
  }, [workloadHistory]);

  const hasData = daily.some((d) => d.value > 0);
  const budgetPercent =
    acwrResult.maxSafeTSSThisWeek > 0
      ? Math.min(100, (budget.currentWeekTSS / acwrResult.maxSafeTSSThisWeek) * 100)
      : 0;
  const acwrColor = colorForACWR(acwrResult.acwr);

  return (
    <Card style={styles.card}>
      <ZoneText variant="heading" size={22} color={colors.text.primary} style={styles.title}>
        EST-CE QUE TU EN FAIS TROP ?
      </ZoneText>
      <ZoneText variant="caption" color={colors.text.muted} style={styles.subtitle}>
        L’équilibre entre ton effort et ta récupération
      </ZoneText>

      <View style={styles.chartWrap} onLayout={onLayout}>
        {width > 0 ? (
          hasData ? (
            <BarChart
              width={width}
              height={140}
              data={daily}
              yMin={0}
              yMax={2.0}
              guides={[
                { y: 0.8, color: colors.text.muted, dashed: true },
                { y: 1.3, color: colors.text.muted, dashed: true, label: 'ZONE IDÉALE' },
              ]}
            />
          ) : (
            <View style={styles.empty}>
              <ZoneText variant="caption" color={colors.text.muted}>
                Pas encore de données. Termine des séances pour voir si tu en fais trop.
              </ZoneText>
            </View>
          )
        ) : null}
      </View>

      <View style={styles.headlineRow}>
        <View style={[styles.riskDot, { backgroundColor: acwrColor }]} />
        <View style={styles.headlineBody}>
          <ZoneText variant="label" color={acwrColor}>
            {riskLabelFor(acwrResult.acwr)}
          </ZoneText>
        </View>
      </View>

      <View style={styles.budget}>
        <View style={styles.budgetRow}>
          <ZoneText variant="label" color={colors.text.primary}>
            Il te reste cette semaine
          </ZoneText>
          <ZoneText variant="label" color={colors.accent.gold}>
            {Math.max(0, budget.remainingBudget)} points d’énergie
          </ZoneText>
        </View>
        <ZoneText variant="caption" color={colors.text.muted}>
          Maximum recommandé aujourd’hui : {Math.max(0, budget.recommendedDailyTSS)}
        </ZoneText>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(100, Math.max(0, budgetPercent))}%`,
                backgroundColor: budgetPercent > 100 ? colors.danger : colors.accent.gold,
              },
            ]}
          />
        </View>
      </View>

      <ZoneText variant="caption" size={10} color={colors.text.muted} style={styles.science}>
        Basé sur la recherche en science du sport
      </ZoneText>
    </Card>
  );
}

function riskLabelFor(value: number): string {
  if (value < 0.6) return 'Pas assez actif cette semaine';
  if (value < 0.8) return 'En dessous de ton niveau habituel';
  if (value <= 1.3) return 'Intensité parfaite — continue comme ça';
  if (value <= 1.5) return 'Tu accélères un peu trop vite — surveille';
  return 'Stop — risque de blessure élevé';
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
    minHeight: 140,
    marginBottom: 8,
  },
  empty: {
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  headlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  riskDot: { width: 14, height: 14, borderRadius: 7 },
  headlineBody: {
    flex: 1,
  },
  budget: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.bg.elevated,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressBar: {
    marginTop: 10,
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  science: {
    marginTop: 12,
    textAlign: 'center',
  },
});
