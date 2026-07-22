/**
 * Pedagogical "why" notes shown across the app (session preview, execution
 * screen, Programme tab) to explain each block / week type / running phase /
 * session type. Kept separate from `programmeDescriptions.ts` (which powers the
 * full programme-overview screen): these are the short, contextual coaching
 * notes surfaced in-flow.
 *
 * French property values are the user-facing copy; keys stay English for code
 * consistency with the rest of the codebase.
 */

export interface BlockNote {
  name: string;
  short: string;
  long: string;
}

export interface WeekNote {
  short: string;
  long: string;
  tip?: string;
}

export interface SessionNote {
  name?: string;
  short: string;
  long: string;
  tip?: string;
}

// ── Weightlifting ───────────────────────────────────────────────────────────

/** Meso-cycle blocks. The app's running programme is 3 blocks × 4 weeks with a
 *  week-4 deload; block 4 ("Transition") covers a light between-cycle week. */
export const WEIGHTLIFTING_BLOCKS: Record<number, BlockNote> = {
  1: {
    name: 'Accumulation',
    short: 'Construire le volume et la technique',
    long: "Le bloc d'accumulation pose les fondations. Tu travailles avec des charges modérées (70-80% du 1RM) sur un volume élevé. L'objectif : ancrer les automatismes techniques et habituer tes muscles et articulations à la charge. Ne cherche pas à soulever lourd — cherche à soulever juste.",
  },
  2: {
    name: 'Intensification',
    short: 'Monter en intensité, réduire le volume',
    long: "Le bloc d'intensification augmente les charges (80-90% du 1RM) tout en réduisant le volume. Ton système nerveux apprend à recruter plus d'unités motrices. C'est ici que la force réelle se construit, sur les bases techniques du bloc 1.",
  },
  3: {
    name: 'Réalisation',
    short: 'Exprimer ta force maximale',
    long: "Le bloc de réalisation est le pic de performance. Les charges atteignent 90-100% du 1RM sur peu de séries. L'objectif : exprimer toute la force accumulée pendant les blocs précédents. C'est souvent ici qu'on établit des nouveaux PRs.",
  },
  4: {
    name: 'Transition',
    short: 'Récupération avant le prochain cycle',
    long: 'Bloc de transition léger entre deux mésocycles. Volume et intensité très réduits pour permettre une récupération complète avant de repartir sur un nouveau cycle de progression.',
  },
};

export const WEIGHTLIFTING_WEEKS: { normal: WeekNote; deload: WeekNote } = {
  normal: {
    short: 'Semaine de progression',
    long: 'Semaine standard de progression. Les charges augmentent de 2.5% par rapport à la semaine précédente. Concentre-toi sur la qualité technique et respecte les temps de repos.',
  },
  deload: {
    short: 'Semaine de décharge — récupération active',
    long: "Cette semaine est intentionnellement légère. Ton corps a accumulé de la fatigue pendant les 3 semaines précédentes et a besoin de récupérer pour progresser. Les charges sont réduites à ~60-65% du 1RM. Ne cherche pas à augmenter — tu repartiras plus fort la semaine prochaine.",
    tip: "Garde 5 à 6 répétitions en réserve (RIR) sur chaque série. Si une série te semble trop facile, c'est normal et c'est bien — résiste à l'envie d'augmenter la charge.",
  },
};

/** Target reps-in-reserve on each set, by week type. */
export const DELOAD_RIR_TARGET = '5-6';
export const NORMAL_RIR_TARGET = '1-3';

/** Short banner shown wherever a deload session is surfaced. */
export const DELOAD_BANNER = {
  title: '⚠️ SEMAINE DE DÉCHARGE',
  body: `Garde 5-6 reps en réserve sur chaque série.\nSi c'est facile, c'est voulu — ne monte pas la charge.`,
};

export function getWeightliftingBlockNote(block: number): BlockNote | null {
  return WEIGHTLIFTING_BLOCKS[block] ?? null;
}

export function getWeekNote(isDeload: boolean): WeekNote {
  return isDeload ? WEIGHTLIFTING_WEEKS.deload : WEIGHTLIFTING_WEEKS.normal;
}

export interface TargetRIR {
  min: number;
  max: number;
  /** "2-3" — ready-to-render range label. */
  label: string;
  description: string;
}

/**
 * Target reps-in-reserve for a weightlifting set (Prilepin-aligned): block 1
 * accumulation 2-3, block 2 intensification 1-2, block 3 réalisation 0-1, and a
 * deload week 5-6. More reliable than "% of 1RM" once the real max has drifted.
 * `week` is accepted for API symmetry; the deload signal comes via `isDeload`.
 */
export function getTargetRIR(block: number, week: number, isDeload: boolean): TargetRIR {
  void week;
  if (isDeload) {
    return { min: 5, max: 6, label: '5-6', description: "Semaine de décharge : reste très loin de l'échec." };
  }
  switch (block) {
    case 2:
      return {
        min: 1,
        max: 2,
        label: '1-2',
        description: 'Séries lourdes : encore 1 à 2 reps possible après chaque série.',
      };
    case 3:
      return {
        min: 0,
        max: 1,
        label: '0-1',
        description: 'Séries maximales : proche ou à l’échec sur les dernières séries.',
      };
    case 1:
    default:
      return {
        min: 2,
        max: 3,
        label: '2-3',
        description: 'Arrête chaque série en ayant encore 2 à 3 reps en réserve.',
      };
  }
}

// ── Running ─────────────────────────────────────────────────────────────────

export interface RunningPhaseNote extends BlockNote {
  blocks: number[];
}

/** Running programme phases, keyed by meso-cycle block (1 → base, 2 → dev,
 *  3 → specific). */
export const RUNNING_PHASES: Record<number, RunningPhaseNote> = {
  1: {
    name: 'Base aérobie',
    blocks: [1],
    short: 'Construire ton moteur aérobie',
    long: "La phase de base aérobie construit les fondations cardio-vasculaires. Tu cours principalement en zone 2 (conversation possible), avec quelques foulées rapides pour maintenir la coordination neuromusculaire. L'objectif : habituer ton corps à courir régulièrement sans se blesser.",
  },
  2: {
    name: 'Développement',
    blocks: [2],
    short: 'Développer ta vitesse et ton endurance',
    long: "La phase de développement introduit des séances de qualité (tempo, intervalles). Tu travailles au-dessus de ton seuil lactique pour repousser tes limites. Plus difficile que la base, mais c'est ici que la progression est la plus rapide.",
  },
  3: {
    name: 'Spécifique',
    blocks: [3],
    short: "Courir à l'allure course",
    long: "La phase spécifique t'entraîne à l'allure exacte de ta course cible. Les intervalles et répétitions sont calées sur ton rythme objectif. L'objectif : que cette allure devienne naturelle le jour J.",
  },
};

/** Running session-type coaching notes. `EF_strides` is the EF + strides
 *  variant; `deload` covers any easy-only deload-week session. */
export const RUNNING_SESSIONS: Record<string, SessionNote> = {
  EF: {
    name: 'Endurance fondamentale',
    short: 'Course facile, conversation possible',
    long: 'Course en zone 2 aérobie. Tu dois pouvoir tenir une conversation complète. RPE cible : 4-5/10. Cette séance améliore ta capacité aérobie de base et favorise la récupération active.',
    tip: 'Si tu ne peux plus parler normalement, tu vas trop vite.',
  },
  EF_strides: {
    name: 'Endurance fondamentale + foulées',
    short: 'Course facile + accélérations courtes',
    long: 'Course en zone 2 suivie de 4-6 foulées rapides de 20-30 secondes. Les foulées améliorent ton économie de course et ta coordination neuromusculaire sans fatigue excessive.',
    tip: 'Les foulées doivent être rapides mais contrôlées — pas un sprint max. Récupère 60-90s entre chaque.',
  },
  IV: {
    name: 'Intervalles VO2max',
    short: 'Efforts courts à haute intensité',
    long: 'Séries courtes (400-1000m) à 95-100% de ta VO2max. Ces intervalles développent ta puissance aérobie maximale — le moteur principal du 5km. RPE : 8-9/10 sur les efforts.',
    tip: "La récupération entre les séries est aussi importante que l'effort. Respecte les temps de repos.",
  },
  TC: {
    name: 'Tempo / Course continue',
    short: 'Effort soutenu au seuil lactique',
    long: 'Course continue à ton seuil lactique (RPE 6-7/10). Tu dois pouvoir dire quelques mots mais pas tenir une conversation. Cette séance repousse le seuil à partir duquel tu accumules de l\'acide lactique.',
    tip: "L'allure doit être inconfortable mais tenable. Ni trop facile ni trop dur.",
  },
  RV: {
    name: 'Répétitions vitesse',
    short: 'Efforts très courts à vitesse maximale',
    long: 'Répétitions courtes (100-400m) à vitesse quasi-maximale avec longue récupération. Développe ton économie de course et ta vitesse de pointe. RPE : 9-10/10 sur les efforts.',
    tip: 'Ces efforts doivent être vraiment rapides. Si tu ne récupères pas complètement entre les séries, tu vas trop vite.',
  },
  deload: {
    name: 'Décharge',
    short: 'Semaine de décharge — récupération active',
    long: 'Semaine légère intentionnelle. Ton système cardio-vasculaire a besoin de récupérer pour assimiler les adaptations des semaines précédentes. Cours confortablement, sans te forcer.',
    tip: 'RPE cible : 3-4/10 maximum. Si tu te sens bien, c\'est normal — profites-en.',
  },
};

export function getRunningPhaseNote(block: number): RunningPhaseNote | null {
  return RUNNING_PHASES[block] ?? null;
}

/**
 * Coaching note for a running session. `type` is the engine session code
 * (EF/IV/TC/RV/SL/…). On a deload week, pass `isDeload` to get the deload note.
 * `withStrides` upgrades an EF to the EF+strides note. Returns null when no
 * dedicated note exists (caller falls back to the generic session purpose).
 */
export function getRunningSessionNote(
  type: string,
  opts?: { isDeload?: boolean; withStrides?: boolean },
): SessionNote | null {
  if (opts?.isDeload) return RUNNING_SESSIONS.deload;
  if (type === 'EF' && opts?.withStrides) return RUNNING_SESSIONS.EF_strides;
  return RUNNING_SESSIONS[type] ?? null;
}
