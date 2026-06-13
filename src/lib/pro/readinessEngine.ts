/**
 * Composite Pro Readiness Score
 *
 * Synthesizes Zone score, ACWR, sleep debt, Banister TSB and SRA
 * readiness into a single 0-100 master score with French headlines
 * matching the Zone fil rouge.
 */

import type { ACWRResult } from './acwr';
import type { SleepDebtAnalysis } from './sleepDebtEngine';
import type { SRAPhase } from './hypertrophyProEngine';

export type SessionAdjustment =
  | 'normal'
  | 'reduce_volume'
  | 'reduce_intensity'
  | 'technique_only'
  | 'rest';

export interface SportReadinessSlot {
  score: number;
  ready: boolean;
  blockers: string[];
  sessionAdjustment: SessionAdjustment;
}

export interface ProReadinessComponents {
  zoneScore: number;
  acwrScore: number;
  sleepScore: number;
  formScore: number;
  recoveryScore: number;
}

export interface ProReadinessScore {
  score: number;
  components: ProReadinessComponents;
  label: string;
  color: string;
  headline: string;
  detail: string;
  sportReadiness: Record<string, SportReadinessSlot>;
  peakFormEstimate: string;
  optimalSessionToday: string;
}

const WEIGHTS = {
  zone: 0.3,
  acwr: 0.25,
  sleep: 0.2,
  form: 0.15,
  recovery: 0.1,
} as const;

/**
 * Compute the composite Pro readiness score.
 *
 * @param params component inputs
 * @returns Pro readiness score with French messaging
 */
export function calculateProReadiness(params: {
  zoneScore: number | null;
  acwr: ACWRResult;
  sleepDebt: SleepDebtAnalysis;
  tsb: number;
  activeSports: string[];
  sraStatus?: Record<string, SRAPhase>;
}): ProReadinessScore {
  const { zoneScore, acwr, sleepDebt, tsb, activeSports, sraStatus } = params;

  const zoneComponent = clamp(zoneScore ?? 50, 0, 100);
  const acwrComponent = scoreFromACWR(acwr.acwr);
  const sleepComponent = scoreFromSleep(sleepDebt.performanceImpactPercent);
  const formComponent = scoreFromTSB(tsb);
  const recoveryComponent = scoreFromSRA(sraStatus);

  const composite =
    zoneComponent * WEIGHTS.zone +
    acwrComponent * WEIGHTS.acwr +
    sleepComponent * WEIGHTS.sleep +
    formComponent * WEIGHTS.form +
    recoveryComponent * WEIGHTS.recovery;
  const score = Math.round(clamp(composite, 0, 100));

  const tier = tierFor(score);
  const sportReadiness = buildSportReadiness(
    activeSports,
    score,
    acwr,
    sleepDebt,
    sraStatus,
  );

  const peakFormEstimate = estimatePeakDate(tsb);
  const optimalSessionToday = pickOptimalSession(
    score,
    activeSports,
    sportReadiness,
  );

  return {
    score,
    components: {
      zoneScore: round0(zoneComponent),
      acwrScore: round0(acwrComponent),
      sleepScore: round0(sleepComponent),
      formScore: round0(formComponent),
      recoveryScore: round0(recoveryComponent),
    },
    label: tier.label,
    color: tier.color,
    headline: tier.headline,
    detail: tier.detail,
    sportReadiness,
    peakFormEstimate,
    optimalSessionToday,
  };
}

interface Tier {
  label: string;
  color: string;
  headline: string;
  detail: string;
}

function tierFor(score: number): Tier {
  if (score >= 85) {
    return {
      label: 'FENÊTRE DE PERFORMANCE',
      color: '#4CAF50',
      headline:
        "Toutes les conditions sont réunies. CTL élevé, fatigue basse, sommeil optimal.",
      detail:
        "C'est dans ces rares fenêtres que les records se font. ACWR optimal, TSB positif. Ne laisse pas passer ça.",
    };
  }
  if (score >= 70) {
    return {
      label: 'PRÊT',
      color: '#64B5F6',
      headline: "Tu es prêt. Execute le programme sans modification.",
      detail:
        "Tous les indicateurs sont dans le vert. Une séance de qualité est accessible aujourd'hui.",
    };
  }
  if (score >= 55) {
    return {
      label: 'CORRECT',
      color: '#1BCA82',
      headline:
        "Conditions correctes avec quelques signaux à surveiller.",
      detail:
        "Continue normalement mais surveille le RPE. Réduis si les séries deviennent anormalement difficiles.",
    };
  }
  if (score >= 40) {
    return {
      label: 'LIMITÉ',
      color: '#FFB74D',
      headline:
        "Plusieurs indicateurs en orange. Adapte la séance.",
      detail:
        "Technique légère prioritaire. Évite tout effort maximal. Une mauvaise séance aujourd'hui coûte 3 jours de récupération.",
    };
  }
  if (score >= 25) {
    return {
      label: 'RÉCUPÉRATION',
      color: '#E57373',
      headline:
        "Ton corps reconstitue ses réserves. Repos actif uniquement.",
      detail:
        "ACWR ou sommeil dégradé détecté. 30 min de marche ou mobilité. Pas de charge.",
    };
  }
  return {
    label: 'STOP',
    color: '#E57373',
    headline: "Signal de surmenage confirmé.",
    detail:
      "Une séance forcée aujourd'hui hypothèque 2 semaines. Ton corps a besoin d'un repos complet. Écoute-le.",
  };
}

function scoreFromACWR(acwr: number): number {
  if (!Number.isFinite(acwr) || acwr <= 0) return 60;
  if (acwr >= 0.8 && acwr <= 1.3) return 100;
  if (acwr < 0.8) {
    return Math.max(40, 60 + (acwr / 0.8) * 30);
  }
  if (acwr <= 1.5) return 60;
  if (acwr <= 2.0) return 30;
  return 10;
}

function scoreFromSleep(performanceImpactPercent: number): number {
  if (!Number.isFinite(performanceImpactPercent)) return 70;
  return clamp(100 - performanceImpactPercent * 2.5, 0, 100);
}

function scoreFromTSB(tsb: number): number {
  if (!Number.isFinite(tsb)) return 50;
  if (tsb >= 5 && tsb <= 25) return 100;
  if (tsb > 25) return Math.max(60, 100 - (tsb - 25) * 1.5);
  if (tsb >= -10) return 80;
  if (tsb >= -30) return 50;
  return 20;
}

function scoreFromSRA(
  sraStatus: Record<string, SRAPhase> | undefined,
): number {
  if (!sraStatus) return 75;
  const phases = Object.values(sraStatus);
  if (phases.length === 0) return 75;
  let total = 0;
  for (const p of phases) {
    switch (p.phase) {
      case 'supercompensation':
        total += 100;
        break;
      case 'adaptation':
        total += 85;
        break;
      case 'decay':
        total += 70;
        break;
      case 'recovery':
        total += 50;
        break;
      case 'fatigue':
        total += 30;
        break;
      case 'stimulus':
      default:
        total += 20;
        break;
    }
  }
  return total / phases.length;
}

function buildSportReadiness(
  sports: string[],
  score: number,
  acwr: ACWRResult,
  sleepDebt: SleepDebtAnalysis,
  sraStatus: Record<string, SRAPhase> | undefined,
): Record<string, SportReadinessSlot> {
  const out: Record<string, SportReadinessSlot> = {};
  for (const sport of sports) {
    const blockers: string[] = [];
    if (acwr.riskLevel === 'danger') {
      blockers.push("ACWR en zone de danger");
    }
    if (
      sleepDebt.debtLevel === 'severe' ||
      sleepDebt.debtLevel === 'critical'
    ) {
      blockers.push("Dette de sommeil élevée");
    }
    const sra = sraStatus?.[sport];
    if (sra && (sra.phase === 'fatigue' || sra.phase === 'recovery')) {
      blockers.push("Groupes musculaires non récupérés");
    }

    let adjustment: SessionAdjustment = 'normal';
    if (score < 25) adjustment = 'rest';
    else if (score < 40) adjustment = 'technique_only';
    else if (score < 55) adjustment = 'reduce_intensity';
    else if (score < 70) adjustment = 'reduce_volume';

    out[sport] = {
      score: clamp(score - blockers.length * 5, 0, 100),
      ready: adjustment !== 'rest' && blockers.length === 0,
      blockers,
      sessionAdjustment: adjustment,
    };
  }
  return out;
}

function estimatePeakDate(tsb: number): string {
  const today = new Date();
  // If TSB already in window, peak is now. Otherwise project days to reach +10.
  if (tsb >= 5 && tsb <= 25) {
    return today.toISOString().slice(0, 10);
  }
  const targetTSB = 10;
  // Rough: TSB moves ~1.3 points per rest day from a fatigued state.
  const daysAway = Math.max(
    1,
    Math.min(28, Math.round((targetTSB - tsb) / 1.3)),
  );
  const peak = new Date(today.getTime() + daysAway * 24 * 60 * 60 * 1000);
  return peak.toISOString().slice(0, 10);
}

function pickOptimalSession(
  score: number,
  sports: string[],
  sportReadiness: Record<string, SportReadinessSlot>,
): string {
  if (score < 25) return "Repos complet";
  if (score < 40) return "Mobilité et technique légère";
  if (sports.length === 0) return "Séance de qualité modérée";
  let best = sports[0];
  let bestScore = -1;
  for (const sport of sports) {
    const s = sportReadiness[sport]?.score ?? 0;
    if (s > bestScore) {
      bestScore = s;
      best = sport;
    }
  }
  if (score >= 85) return `Séance maximale ${best}`;
  if (score >= 70) return `Séance qualité ${best}`;
  return `Séance modérée ${best}`;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function round0(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v);
}
