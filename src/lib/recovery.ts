import {
  getLastSessionBySport,
  getLastSessionsByDate,
  todayDateString,
  type ScheduleSport,
} from './firestore';

export type WarnLevel = 'info' | 'warn' | 'danger';

export interface RecoveryWarning {
  level: WarnLevel;
  message: string;
  /** Whether a "continue anyway" path should be offered. */
  canContinue: boolean;
}

export interface RecoveryContext {
  lastBySport: Record<ScheduleSport, Date | null>;
  todaySports: ScheduleSport[];
}

export const EMPTY_RECOVERY_CONTEXT: RecoveryContext = {
  lastBySport: { weightlifting: null, running: null, musculation: null, hyrox: null },
  todaySports: [],
};

/** Load the data the recovery warnings need for a user. */
export async function loadRecoveryContext(uid: string): Promise<RecoveryContext> {
  const [wl, ru, mu, hy, today] = await Promise.all([
    getLastSessionBySport(uid, 'weightlifting').catch(() => null),
    getLastSessionBySport(uid, 'running').catch(() => null),
    getLastSessionBySport(uid, 'musculation').catch(() => null),
    getLastSessionBySport(uid, 'hyrox').catch(() => null),
    getLastSessionsByDate(uid, todayDateString()).catch(() => []),
  ]);
  return {
    lastBySport: { weightlifting: wl, running: ru, musculation: mu, hyrox: hy },
    todaySports: today.map((t) => t.sport),
  };
}

function hoursBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 3_600_000;
}

/**
 * Smart recovery guidance before launching a session. Same-day cross-sport
 * checks take priority, then per-sport recovery since the last session.
 *
 * @param sport sport the athlete wants to start now
 * @param ctx recovery context (last session per sport, sports done today)
 * @param now reference time
 */
export function buildRecoveryWarning(
  sport: ScheduleSport,
  ctx: RecoveryContext,
  now: Date,
): RecoveryWarning | null {
  const { lastBySport, todaySports } = ctx;

  // ── Same-day double session ──
  if (sport === 'weightlifting' && todaySports.includes('weightlifting')) {
    return {
      level: 'warn',
      message:
        "⚠️ Deux séances d'haltérophilie le même jour. Ton système nerveux ne récupère pas en quelques heures : risque de blessure et contre-productif.",
      canContinue: true,
    };
  }
  if (sport === 'musculation' && todaySports.includes('musculation')) {
    return {
      level: 'warn',
      message:
        '⚠️ Deuxième séance de muscu aujourd\'hui. Privilégie d\'autres groupes musculaires et arrête bien avant l\'échec.',
      canContinue: true,
    };
  }
  if (sport === 'weightlifting' && todaySports.includes('running')) {
    return {
      level: 'warn',
      message:
        "⚠️ Tu as déjà couru aujourd'hui. Course avant l'haltéro, ce n'est pas idéal : la fatigue cardiovasculaire nuit aux performances techniques.",
      canContinue: true,
    };
  }
  if (sport === 'running' && (todaySports.includes('weightlifting') || todaySports.includes('musculation'))) {
    return {
      level: 'info',
      message:
        '✓ Compatible. Laisse minimum 4h entre les deux séances. Tu as fait la muscu en premier, c\'est le bon ordre.',
      canContinue: true,
    };
  }
  if (sport === 'hyrox' && (todaySports.includes('weightlifting') || todaySports.includes('hyrox'))) {
    return {
      level: 'warn',
      message:
        '⚠️ Jambes déjà très sollicitées aujourd\'hui. Espace d\'au moins 6h ou reporte pour mieux récupérer.',
      canContinue: true,
    };
  }

  // ── Recovery since the last session of this sport ──
  const last = lastBySport[sport];
  if (sport === 'weightlifting' && last) {
    const h = hoursBetween(now, last);
    if (h < 24) {
      return {
        level: 'warn',
        message: `⚠️ Tu as fait de l'haltéro il y a moins de 24h (${Math.round(h)}h). Ton SNC n'est pas complètement récupéré. Deux séances consécutives, c'est moins efficace et la fatigue s'accumule.`,
        canContinue: true,
      };
    }
    if (h <= 48) {
      return {
        level: 'info',
        message: `✓ Récupération correcte (${Math.round(h)}h depuis la dernière séance).`,
        canContinue: true,
      };
    }
    return null;
  }
  if (sport === 'musculation' && last) {
    const h = hoursBetween(now, last);
    if (h < 48) {
      return {
        level: 'warn',
        message: `⚠️ Tu as fait de la muscu il y a ${Math.round(h)}h. Pour éviter le surentraînement, varie les groupes musculaires ou attends ${Math.max(1, Math.round(48 - h))}h.`,
        canContinue: true,
      };
    }
    return null;
  }
  if (sport === 'running' && last) {
    const h = hoursBetween(now, last);
    if (h < 12) {
      return {
        level: 'warn',
        message: `⚠️ Sortie course il y a moins de 12h (${Math.round(h)}h). Privilégie une sortie facile en Zone 2.`,
        canContinue: true,
      };
    }
  }
  if (sport === 'running' && lastBySport.weightlifting) {
    const hw = hoursBetween(now, lastBySport.weightlifting);
    if (hw < 24) {
      return {
        level: 'info',
        message:
          "💡 Tu as fait du squat lourd récemment. La course est possible mais reste en Zone 2 : évite les intervalles ou le tempo aujourd'hui.",
        canContinue: true,
      };
    }
  }
  return null;
}
