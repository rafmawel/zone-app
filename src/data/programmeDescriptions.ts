/**
 * Sport programme descriptions registry.
 *
 * Each entry powers the `/programme-overview` screen for one sport.
 * Adding a new sport equals adding one entry to {@link PROGRAMME_DESCRIPTIONS}.
 * The screen is 100 percent data-driven; if a sport has no entry,
 * the screen falls back to a generic overview built from
 * {@link getSportConfig}.
 *
 * Scientific references are intentionally short labels so we can render
 * them as a tag list rather than a paragraph.
 */

import type { ProSport } from '@/lib/weekProgression';

export interface ProgrammeBlock {
  name: string;
  weeks: string;
  intensity: string;
  volume: string;
  goal: string;
  sessionDuration: string;
  color: string;
}

export interface ProgrammeProgressionStep {
  week: string;
  description: string;
}

export interface ProgrammeFaq {
  question: string;
  answer: string;
}

export interface ProgrammeScience {
  method: string;
  reference: string;
  principle: string;
}

export interface ProgrammeDescription {
  sport: ProSport;
  title: string;
  subtitle: string;
  duration: string;
  sessionsPerWeek: string;
  objective: string;
  science: ProgrammeScience;
  blocks: ProgrammeBlock[];
  progression: ProgrammeProgressionStep[];
  benefits: string[];
  warnings: string[];
  faq: ProgrammeFaq[];
}

const BLOCK_COLOR_BLUE = '#64B5F6';
const BLOCK_COLOR_ACCENT = '#1BCA82';
const BLOCK_COLOR_RED = '#E57373';
const BLOCK_COLOR_GREEN = '#4CAF50';

const WEIGHTLIFTING: ProgrammeDescription = {
  sport: 'weightlifting',
  title: 'Programme Haltérophilie',
  subtitle: 'Périodisation soviétique · 12 semaines',
  duration: '12 semaines',
  sessionsPerWeek: '2 à 4 séances',
  objective:
    'Augmenter tes 1RM sur les 4 mouvements olympiques via une progression scientifique.',
  science: {
    method: 'Tableau de Prilepin (1975)',
    reference:
      'Recherche soviétique validée par 50 ans de résultats olympiques.',
    principle:
      "Chaque séance respecte des plages de répétitions totales optimales par zone d'intensité. Trop peu : sous-stimulation. Trop : surmenage.",
  },
  blocks: [
    {
      name: 'BLOC 1 · ACCUMULATION',
      weeks: 'Semaines 1-3',
      intensity: '65 à 75 % de tes maxes',
      volume: 'Modéré · 12 à 18 répétitions par mouvement',
      goal:
        "Construire les bases neurologiques. Ton système nerveux apprend les patterns.",
      sessionDuration: '40 à 65 min selon ton niveau',
      color: BLOCK_COLOR_BLUE,
    },
    {
      name: 'BLOC 2 · INTENSIFICATION',
      weeks: 'Semaines 4-6',
      intensity: '75 à 85 % de tes maxes',
      volume: 'Élevé · 10 à 16 répétitions par mouvement',
      goal:
        "Développer la force maximale. Les charges montent, le corps s'adapte.",
      sessionDuration: '55 à 75 min',
      color: BLOCK_COLOR_ACCENT,
    },
    {
      name: 'BLOC 3 · RÉALISATION',
      weeks: 'Semaines 7-9',
      intensity: '85 à 95 % de tes maxes',
      volume: 'Réduit · 4 à 10 répétitions par mouvement',
      goal:
        "Atteindre des performances maximales. C'est ici que tu bats tes records.",
      sessionDuration: '50 à 65 min',
      color: BLOCK_COLOR_RED,
    },
    {
      name: 'DÉCHARGE',
      weeks: 'Semaines 10-12',
      intensity: '60 à 70 % de tes maxes',
      volume: 'Faible · Volume réduit de 50 %',
      goal:
        "Laisser le corps s'adapter et consolider les gains. La croissance se passe ici.",
      sessionDuration: '35 à 45 min',
      color: BLOCK_COLOR_GREEN,
    },
  ],
  progression: [
    {
      week: 'Semaines 1-3',
      description:
        "Tu te sens sous-entraîné. C'est normal et voulu. Ton SNC se recalibre.",
    },
    {
      week: 'Semaines 4-6',
      description:
        'Les charges deviennent sérieuses. Tu sens la progression se construire.',
    },
    {
      week: 'Semaines 7-9',
      description:
        "Tu es en forme optimale. C'est le moment de tout donner.",
    },
    {
      week: 'Semaines 10-12',
      description:
        "Les séances semblent faciles. Ton corps récupère et s'adapte.",
    },
  ],
  benefits: [
    'Progression garantie sur 12 semaines',
    'Zéro risque de surentraînement (protocole scientifique)',
    'Adapté à ton niveau, du débutant à avancé',
    'Charges calculées automatiquement depuis tes 1RM',
    'Autorégulation RIR pour ajuster en temps réel',
  ],
  warnings: [
    'Ne saute pas le Bloc 1 même si tu te sens fort',
    'Respecte les temps de repos, 3 min minimum',
    'Ne teste pas tes maxes pendant le programme',
    'Dors minimum 7 h : le SNC récupère la nuit',
  ],
  faq: [
    {
      question: 'Pourquoi ma première séance est courte ?',
      answer:
        "Le Bloc 1 est intentionnellement modéré. Ton système nerveux doit se recalibrer avant d'augmenter la charge. C'est la base de toute progression en haltérophilie.",
    },
    {
      question: 'Que faire si je manque une séance ?',
      answer:
        "Continue depuis là où tu en es. Zone ajuste l'intensité de la semaine suivante selon ton taux de complétion.",
    },
    {
      question: "Qu'est-ce que le tirage à l'arraché ?",
      answer:
        "C'est le même mouvement que l'arraché sans la réception en squat. Il se fait plus lourd (90 à 105 % de ton 1RM arraché) pour renforcer la chaîne postérieure et développer la puissance.",
    },
  ],
};

const RUNNING: ProgrammeDescription = {
  sport: 'running',
  title: 'Programme Course',
  subtitle: 'Méthode Daniels et règle 80/20 · 12 semaines',
  duration: '12 semaines',
  sessionsPerWeek: '2 à 6 séances',
  objective:
    'Améliorer ton VDOT et tes temps de course sur toutes les distances.',
  science: {
    method: 'VDOT Daniels (2005) et polarisation Seiler (2010)',
    reference:
      "Jack Daniels, PhD, entraîneur de champions olympiques. Stephen Seiler, 20 ans de recherche sur les athlètes d'élite.",
    principle:
      "80 % de tes km en endurance fondamentale (conversation possible), 20 % en qualité. La majorité des coureurs font l'inverse, et progressent 3 fois moins vite.",
  },
  blocks: [
    {
      name: 'BLOC 1 · BASE AÉROBIE',
      weeks: 'Semaines 1-3',
      intensity: 'Zone 1 à 2 (80 % des sorties)',
      volume: 'Volume progressif, +10 %/semaine',
      goal:
        'Construire le moteur aérobie. La base de toute performance en course.',
      sessionDuration: '35 à 75 min',
      color: BLOCK_COLOR_BLUE,
    },
    {
      name: 'BLOC 2 · DÉVELOPPEMENT',
      weeks: 'Semaines 4-6',
      intensity: 'Introduction tempo et intervalles',
      volume: 'Volume maintenu, qualité augmente',
      goal: 'Développer le seuil lactique et la VMA.',
      sessionDuration: '40 à 90 min',
      color: BLOCK_COLOR_ACCENT,
    },
    {
      name: 'BLOC 3 · SPÉCIFICITÉ',
      weeks: 'Semaines 7-9',
      intensity: 'Séances race-pace',
      volume: 'Volume réduit, intensité maximale',
      goal: 'Préparer la performance sur ta distance cible.',
      sessionDuration: '40 à 80 min',
      color: BLOCK_COLOR_RED,
    },
    {
      name: 'AFFÛTAGE',
      weeks: 'Semaines 10-12',
      intensity: 'Volume -30 %, intensité maintenue',
      volume: 'Faible',
      goal: 'Arriver frais sur la ligne de départ.',
      sessionDuration: '25 à 60 min',
      color: BLOCK_COLOR_GREEN,
    },
  ],
  progression: [
    {
      week: 'Semaines 1-3',
      description:
        "Tu cours lentement, plus longtemps. C'est volontaire : on construit la machine.",
    },
    {
      week: 'Semaines 4-6',
      description:
        'Les premières séances qualité arrivent. Tu sens un nouveau registre.',
    },
    {
      week: 'Semaines 7-9',
      description:
        "Les allures cibles deviennent confortables. C'est la spécificité qui paye.",
    },
    {
      week: 'Semaines 10-12',
      description:
        "Les jambes sont fraîches, l'envie de courir revient. Tu es prêt.",
    },
  ],
  benefits: [
    'Allures calculées automatiquement depuis ton VDOT',
    'Polarisation 80/20 pour progresser sans te blesser',
    'Adaptation au profil (débutant à élite amateur)',
    'Sorties longues et qualité dosées scientifiquement',
    'Affûtage pour arriver en forme le jour J',
  ],
  warnings: [
    'Ne cours pas trop vite tes sorties faciles',
    "N'augmente pas le volume hebdo de plus de 10 %",
    'Respecte un jour de repos après une séance de qualité',
    'Hydrate-toi : déshydratation -2 % égale -10 % de performance',
  ],
  faq: [
    {
      question: 'Pourquoi courir aussi lentement en Zone 2 ?',
      answer:
        "L'endurance fondamentale développe les mitochondries et la capacité à utiliser les graisses. Aller trop vite empêche ces adaptations et accumule de la fatigue sans bénéfice supplémentaire.",
    },
    {
      question: "C'est quoi le VDOT ?",
      answer:
        "Une mesure de ta capacité aérobie inventée par Jack Daniels. Zone calcule ton VDOT depuis tes performances récentes et ajuste toutes tes allures d'entraînement automatiquement.",
    },
    {
      question: 'Que faire si je rate ma sortie longue ?',
      answer:
        "Décale-la d'un jour si possible. Si la semaine est perdue, Zone réduit légèrement le volume de la semaine suivante pour respecter la règle des 10 % et éviter la blessure.",
    },
  ],
};

const MUSCULATION: ProgrammeDescription = {
  sport: 'musculation',
  title: 'Programme Musculation',
  subtitle: 'MEV / MAV / MRV Israetel · 12 semaines',
  duration: '12 semaines',
  sessionsPerWeek: '3 à 6 séances',
  objective:
    'Maximiser la croissance musculaire via la périodisation du volume.',
  science: {
    method: 'MEV / MAV / MRV Israetel (2019) et cycle SRA',
    reference:
      'Dr Mike Israetel, Renaissance Periodization. Méthode utilisée par les culturistes et athlètes de force professionnels.',
    principle:
      "Chaque muscle a un volume minimum (MEV), optimal (MAV) et maximum (MRV) par semaine. Zone t'aide à rester dans la zone optimale en permanence.",
  },
  blocks: [
    {
      name: 'PHASE MEV · CONSTRUCTION',
      weeks: 'Semaines 1-3',
      intensity: 'RIR 3 à 4 (réserve confortable)',
      volume: 'Volume minimum efficace par muscle',
      goal:
        'Établir la base, préparer les tendons et articulations.',
      sessionDuration: '45 à 55 min',
      color: BLOCK_COLOR_BLUE,
    },
    {
      name: 'PHASE MAV · CROISSANCE',
      weeks: 'Semaines 4-8',
      intensity: 'RIR 1 à 2 (effort élevé)',
      volume: 'Volume optimal pour la croissance max',
      goal: 'Maximiser le stimulus hypertrophique.',
      sessionDuration: '55 à 70 min',
      color: BLOCK_COLOR_ACCENT,
    },
    {
      name: 'PHASE MRV · ACCUMULATION',
      weeks: 'Semaines 9-10',
      intensity: "RIR 0 à 1 (proche de l'échec)",
      volume: 'Volume maximum tolérable',
      goal: 'Pousser les limites avant la décharge.',
      sessionDuration: '65 à 80 min',
      color: BLOCK_COLOR_RED,
    },
    {
      name: 'DÉCHARGE',
      weeks: 'Semaines 11-12',
      intensity: 'RIR 4 à 5 (très léger)',
      volume: 'Volume réduit de 50 %',
      goal:
        'Récupération et super-compensation. La vraie croissance se passe ici.',
      sessionDuration: '30 à 40 min',
      color: BLOCK_COLOR_GREEN,
    },
  ],
  progression: [
    {
      week: 'Semaines 1-3',
      description:
        "Les séances semblent légères. C'est voulu : on prépare les tissus.",
    },
    {
      week: 'Semaines 4-8',
      description:
        'Le volume monte, les pumps deviennent sérieux. Les muscles répondent.',
    },
    {
      week: 'Semaines 9-10',
      description:
        "Tu es proche de l'échec. La fatigue accumulée se voit, c'est le signal.",
    },
    {
      week: 'Semaines 11-12',
      description:
        "Décharge. Tu te sens reposé, plus fort. C'est là que la croissance se concrétise.",
    },
  ],
  benefits: [
    'Volume calibré sur ton MEV / MAV / MRV personnel',
    'Split choisi automatiquement selon ta fréquence',
    'Autorégulation RIR pour ajuster sans réfléchir',
    'Décharge programmée pour éviter la stagnation',
    'Suivi du volume par muscle en temps réel',
  ],
  warnings: [
    'Ne dépasse pas le RIR demandé : la fatigue tue la progression',
    'Mange suffisamment : la croissance demande un surplus calorique',
    "N'ignore pas la décharge même si tu te sens fort",
    'Dors 7 à 9 h : la croissance se passe pendant le sommeil',
  ],
  faq: [
    {
      question: "C'est quoi le RIR ?",
      answer:
        "Reps In Reserve : combien de répétitions tu aurais pu faire de plus. RIR 2 égale tu t'es arrêté 2 reps avant l'échec musculaire. Zone te demande ce chiffre après chaque série pour ajuster les charges automatiquement.",
    },
    {
      question: 'Pourquoi une décharge ?',
      answer:
        'Après des semaines de volume élevé, ton système nerveux et tes muscles ont besoin de récupérer. La croissance musculaire se produit pendant la récupération, pas pendant l\'effort.',
    },
    {
      question: 'Que faire si je rate une séance dans la semaine ?',
      answer:
        "Continue normalement. Zone détecte les muscles sous-stimulés et priorise leur volume la semaine suivante (extra-séries dans la zone MAV).",
    },
  ],
};

const HYROX: ProgrammeDescription = {
  sport: 'hyrox',
  title: 'Programme Hyrox',
  subtitle: 'Périodisation mixte · 12 à 14 semaines',
  duration: '12 à 14 semaines',
  sessionsPerWeek: '2 à 5 séances',
  objective:
    'Améliorer ton temps de course Hyrox en développant les 3 composantes : running, force fonctionnelle et endurance spécifique.',
  science: {
    method: 'Tschakert et Hofmann (2013) et NSCA Guidelines',
    reference:
      'Périodisation spécifique aux sports de fitness racing. Ratio travail-repos 1:2 pour les stations anaérobies.',
    principle:
      "Hyrox égale 50 % running plus 50 % stations. La majorité des athlètes négligent l'une ou l'autre composante. Zone équilibre les deux selon tes points faibles détectés.",
  },
  blocks: [
    {
      name: 'BLOC 1 · BASE ET STATIONS',
      weeks: 'Semaines 1-4',
      intensity: "60 % de l'allure course cible",
      volume: '2 séances/semaine minimum',
      goal:
        'Apprendre les stations, construire la base aérobie.',
      sessionDuration: '40 à 60 min',
      color: BLOCK_COLOR_BLUE,
    },
    {
      name: 'BLOC 2 · ENDURANCE-FORCE',
      weeks: 'Semaines 5-8',
      intensity: '75 à 80 % allure course cible',
      volume: '3 à 4 séances/semaine',
      goal:
        'Augmenter la capacité des stations tout en maintenant la base running.',
      sessionDuration: '45 à 70 min',
      color: BLOCK_COLOR_ACCENT,
    },
    {
      name: 'BLOC 3 · SPÉCIFICITÉ COURSE',
      weeks: 'Semaines 9-12',
      intensity: '90 à 100 % allure course cible',
      volume: 'Volume réduit, intensité maximale',
      goal: 'Simuler les conditions de course.',
      sessionDuration: '50 à 90 min',
      color: BLOCK_COLOR_RED,
    },
    {
      name: 'AFFÛTAGE',
      weeks: 'Semaines 13-14 (si date de course)',
      intensity: 'Volume -50 %, intensité maintenue',
      volume: 'Faible',
      goal: 'Arriver frais et confiant le jour J.',
      sessionDuration: '30 à 45 min',
      color: BLOCK_COLOR_GREEN,
    },
  ],
  progression: [
    {
      week: 'Semaines 1-4',
      description:
        "Tu découvres les 8 stations. La technique s'installe, le coeur s'habitue.",
    },
    {
      week: 'Semaines 5-8',
      description:
        'Tu enchaînes course et stations sans craquer. La machine prend forme.',
    },
    {
      week: 'Semaines 9-12',
      description:
        "Tu tournes à l'allure cible. Les chronos sur tes stations faibles tombent.",
    },
    {
      week: 'Semaines 13-14',
      description:
        'Tu te sens léger et frais. Le jour J approche et tu es prêt.',
    },
  ],
  benefits: [
    'Équilibre automatique course / stations selon ton niveau',
    'Détection des stations faibles via tes chronos',
    'Projection du temps de course en temps réel',
    'Périodisation adaptée à ta date de course',
    'Énergie atp-pcr / glycolytique / oxydative ciblée',
  ],
  warnings: [
    'Toujours échauffer 10 min avant les stations explosives',
    'Ne pas négliger la course : 50 % du temps total',
    'Hydratation et glucides obligatoires pendant la simulation',
    'Une session lourde + un fractionné, jamais le même jour',
  ],
  faq: [
    {
      question: 'Par quoi commencer : running ou stations ?',
      answer:
        "Toujours le running en premier si tu combines les deux le même jour. La fatigue cardiovasculaire nuit aux performances techniques des stations, mais pas l'inverse.",
    },
    {
      question: 'Comment sont choisis mes points faibles ?',
      answer:
        'Zone compare tes temps sur chaque station à l\'objectif calculé depuis ton temps de course cible. Les stations avec le plus grand écart sont priorisées automatiquement.',
    },
    {
      question: "Combien de stations par séance ?",
      answer:
        "Selon le bloc et ta fréquence : 3 à 4 stations en station_work, 1 à 2 en simulation. Zone te génère la séance avec tes points faibles en priorité.",
    },
  ],
};

const REGISTRY: Record<string, ProgrammeDescription> = {
  weightlifting: WEIGHTLIFTING,
  running: RUNNING,
  musculation: MUSCULATION,
  hyrox: HYROX,
};

export const PROGRAMME_DESCRIPTIONS: Readonly<Record<string, ProgrammeDescription>> = REGISTRY;

export function getProgrammeDescription(
  sport: ProSport,
): ProgrammeDescription | null {
  return REGISTRY[sport] ?? null;
}

export function registerProgrammeDescription(
  description: ProgrammeDescription,
): void {
  REGISTRY[description.sport] = description;
}

const SPORT_EMOJIS: Record<string, string> = {
  weightlifting: '🏋️',
  running: '🏃',
  musculation: '💪',
  hyrox: '🔥',
};

export function emojiForSport(sport: ProSport): string {
  return SPORT_EMOJIS[sport] ?? '🏆';
}
