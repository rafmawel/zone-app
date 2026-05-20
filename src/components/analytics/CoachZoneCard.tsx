import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertTriangle, ArrowRight, CheckCircle2, Sparkles } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import { ZoneText } from '@/components/ui/ZoneText';
import { Card } from '@/components/ui/Card';
import type {
  ACWRResult,
  DailyPerformanceMetrics,
  SleepDebtAnalysis,
  WeeklyLoadBudget,
} from '@/lib/pro';

export interface CoachZoneCardProps {
  acwr: ACWRResult;
  sleepDebt: SleepDebtAnalysis;
  metrics: DailyPerformanceMetrics[];
  budget: WeeklyLoadBudget;
}

interface Observation {
  type: 'positive' | 'watch' | 'recommendation';
  text: string;
}

function buildObservations({
  acwr,
  sleepDebt,
  metrics,
  budget,
}: CoachZoneCardProps): Observation[] {
  const observations: Observation[] = [];

  if (acwr.riskLevel === 'optimal') {
    observations.push({
      type: 'positive',
      text: `ACWR maintenu en zone optimale (${acwr.acwr.toFixed(2)}). Charge et récupération équilibrées.`,
    });
  } else if (sleepDebt.cumulativeDebtHours < 4 && sleepDebt.avgHoursLast7Days >= 7) {
    observations.push({
      type: 'positive',
      text: `Sommeil de qualité (${sleepDebt.avgHoursLast7Days.toFixed(1)}h en moyenne). Récupération bien engagée.`,
    });
  } else {
    const last = metrics[metrics.length - 1];
    const prev = metrics[metrics.length - 8] ?? metrics[0];
    if (last && prev && last.ctl - prev.ctl > 1) {
      observations.push({
        type: 'positive',
        text: `Fitness en hausse : CTL +${(last.ctl - prev.ctl).toFixed(1)} sur la semaine.`,
      });
    } else {
      observations.push({
        type: 'positive',
        text: 'Programme suivi avec régularité. Maintiens ce rythme.',
      });
    }
  }

  if (sleepDebt.debtLevel === 'severe' || sleepDebt.debtLevel === 'critical') {
    observations.push({
      type: 'watch',
      text: `Sommeil moyen : ${sleepDebt.avgHoursLast7Days.toFixed(1)}h cette semaine. Impact estimé : -${Math.round(sleepDebt.strengthImpactPercent)}% sur la force.`,
    });
  } else if (acwr.riskLevel === 'danger') {
    observations.push({
      type: 'watch',
      text: `ACWR en zone de danger (${acwr.acwr.toFixed(2)}). Risque de blessure multiplié par 2 à 4.`,
    });
  } else if (acwr.acuteLoad > acwr.chronicLoad * 1.2) {
    observations.push({
      type: 'watch',
      text: "ATL en hausse rapide. Surveille les signes de fatigue.",
    });
  } else {
    observations.push({
      type: 'watch',
      text: "Pas de signal d'alerte majeur. Continue la rigueur sur le suivi.",
    });
  }

  const last = metrics[metrics.length - 1];
  if (budget.remainingBudget > 0 && acwr.riskLevel !== 'danger') {
    observations.push({
      type: 'recommendation',
      text: `Budget restant cette semaine : ${budget.remainingBudget} TSS. Vise ${Math.max(0, budget.recommendedDailyTSS)} TSS/jour pour rester dans la zone.`,
    });
  } else if (last && last.tsb >= 5) {
    observations.push({
      type: 'recommendation',
      text: `TSB actuel +${Math.round(last.tsb)}. Fenêtre de qualité ouverte. Place une séance forte cette semaine.`,
    });
  } else {
    observations.push({
      type: 'recommendation',
      text: "Priorité récupération. Coupe le volume de 30% sur les 3 prochains jours.",
    });
  }

  return observations;
}

export function CoachZoneCard(props: CoachZoneCardProps): React.ReactElement {
  const observations = buildObservations(props);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View>
          <ZoneText variant="heading" size={22} color={colors.text.primary} style={styles.title}>
            COACH ZONE
          </ZoneText>
          <ZoneText variant="caption" color={colors.text.muted}>
            Analyse de ta semaine · Mise à jour chaque lundi
          </ZoneText>
        </View>
        <Sparkles size={20} color={colors.accent.gold} />
      </View>
      <View style={styles.list}>
        {observations.map((o, idx) => (
          <ObservationRow key={`${o.type}-${idx}`} observation={o} />
        ))}
      </View>
    </Card>
  );
}

function ObservationRow({ observation }: { observation: Observation }): React.ReactElement {
  let icon: React.ReactNode;
  let color: string;
  switch (observation.type) {
    case 'positive':
      icon = <CheckCircle2 size={18} color={colors.success} />;
      color = colors.success;
      break;
    case 'watch':
      icon = <AlertTriangle size={18} color={colors.orbe.amber} />;
      color = colors.orbe.amber;
      break;
    case 'recommendation':
    default:
      icon = <ArrowRight size={18} color={colors.accent.gold} />;
      color = colors.accent.gold;
      break;
  }
  return (
    <View style={[styles.row, { borderLeftColor: color }]}>
      <View style={styles.rowIcon}>{icon}</View>
      <ZoneText variant="body" size={13} color={colors.text.primary} style={styles.rowText}>
        {observation.text}
      </ZoneText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: {
    letterSpacing: 1.2,
  },
  list: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingLeft: 10,
    borderLeftWidth: 3,
    paddingVertical: 4,
  },
  rowIcon: {
    marginTop: 1,
  },
  rowText: {
    flex: 1,
  },
});
