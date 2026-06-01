export type MuscleGroup =
  | 'quadriceps'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'lower_back'
  | 'upper_back'
  | 'lats'
  | 'traps'
  | 'shoulders'
  | 'chest'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'core'
  | 'hip_flexors';

export type ExerciseCategory =
  | 'olympic_lift'
  | 'squat'
  | 'hinge'
  | 'push'
  | 'pull'
  | 'core'
  | 'accessory';

export type ExerciseDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type ExerciseEquipment =
  | 'barbell'
  | 'dumbbell'
  | 'bodyweight'
  | 'rack'
  | 'rings';

export type ExerciseSport = 'weightlifting' | 'strength' | 'both';

export interface Exercise {
  id: string;
  name: string;
  name_en: string;
  sport: ExerciseSport;
  category: ExerciseCategory;
  difficulty: ExerciseDifficulty;
  equipment: ExerciseEquipment[];
  muscles_primary: MuscleGroup[];
  muscles_secondary: MuscleGroup[];
  description: string;
  setup: string;
  execution: string;
  cues: string[];
  feeling: string;
  common_errors: string[];
  default_sets: number;
  default_reps: string;
  default_rest_seconds: number;
}

export const EXERCISES: Exercise[] = [
  {
    id: 'snatch',
    name: 'Arraché',
    name_en: 'Snatch',
    sport: 'weightlifting',
    category: 'olympic_lift',
    difficulty: 'advanced',
    equipment: ['barbell'],
    muscles_primary: ['quadriceps', 'hamstrings', 'glutes', 'traps', 'shoulders', 'lower_back'],
    muscles_secondary: ['core', 'forearms', 'calves', 'upper_back'],
    description:
      "Mouvement olympique en un temps. La barre passe du sol à la position bras tendus au-dessus de la tête en un seul geste explosif, réception en squat overhead.",
    setup:
      "Pieds largeur de hanches sous la barre. Prise large (snatch grip), bras tendus, dos plat, hanches plus basses que les épaules, regard devant.",
    execution:
      "Premier tirage lent et contrôlé, barre proche des tibias. Au passage des genoux, extension explosive des hanches. Tire-toi sous la barre en réception squat overhead, bras verrouillés. Relève-toi.",
    cues: [
      "Barre au plus près du corps",
      "Pousse contre le sol au premier tirage",
      "Hanches hautes, épaules basses au départ",
      "Reçois sous la barre, ne tire pas dessus",
      "Verrouille les coudes à la réception",
    ],
    feeling:
      "Sensation de puissance ascendante venant des jambes. Les bras guident sans tirer.",
    common_errors: [
      "Tirer avec les bras avant l'extension de hanches",
      "Sauter en avant à la réception",
      "Barre qui s'éloigne du corps",
    ],
    default_sets: 5,
    default_reps: '1-3',
    default_rest_seconds: 180,
  },
  {
    id: 'clean_and_jerk',
    name: 'Épaulé-jeté',
    name_en: 'Clean & Jerk',
    sport: 'weightlifting',
    category: 'olympic_lift',
    difficulty: 'advanced',
    equipment: ['barbell'],
    muscles_primary: ['quadriceps', 'glutes', 'hamstrings', 'traps', 'shoulders', 'lower_back'],
    muscles_secondary: ['core', 'triceps', 'forearms', 'calves', 'upper_back'],
    description:
      "Mouvement olympique en deux temps. La barre est portée aux épaules (épaulé), puis projetée au-dessus de la tête (jeté).",
    setup:
      "Pieds largeur de hanches, prise serrée (clean grip) un peu plus large que les épaules. Dos plat, hanches sous les épaules.",
    execution:
      "Épaulé : tirage explosif, réception en front squat coudes hauts. Relève-toi. Jeté : flexion légère des jambes, projection verticale, réception fente avant (split jerk) ou jambes parallèles (push jerk).",
    cues: [
      "Coudes hauts à la réception du clean",
      "Trajet vertical de la barre",
      "Tête à travers les bras au jeté",
      "Reçois en fente solide et stable",
      "Pieds collés, plante complète au sol",
    ],
    feeling:
      "Deux explosions distinctes : hanches au clean, jambes verticales au jerk.",
    common_errors: [
      "Coudes bas à la réception du clean (barre roule)",
      "Pousser la barre vers l'avant au jeté",
      "Fente trop courte ou déséquilibrée",
    ],
    default_sets: 5,
    default_reps: '1-2',
    default_rest_seconds: 180,
  },
  {
    id: 'power_clean',
    name: 'Épaulé de force',
    name_en: 'Power Clean',
    sport: 'weightlifting',
    category: 'olympic_lift',
    difficulty: 'intermediate',
    equipment: ['barbell'],
    muscles_primary: ['quadriceps', 'glutes', 'hamstrings', 'traps', 'lower_back'],
    muscles_secondary: ['shoulders', 'core', 'forearms', 'calves'],
    description:
      "Variante du clean reçue avec les cuisses au-dessus de la parallèle. Moins technique, idéal pour développer la puissance.",
    setup:
      "Identique à l'épaulé : pieds largeur de hanches, prise clean, dos plat, hanches sous les épaules.",
    execution:
      "Tirage explosif identique au clean. Réception coudes hauts sans descendre en squat complet, jambes au-dessus de la parallèle.",
    cues: [
      "Pousse fort dans le sol",
      "Hanche complète avant de tirer sous",
      "Coudes hauts à la réception",
      "Reste compact",
      "Ne descends pas en squat profond",
    ],
    feeling:
      "Puissance courte et nette, réception haute et solide.",
    common_errors: [
      "Plier les bras trop tôt",
      "Sauter en avant",
      "Coudes bas (rack position molle)",
    ],
    default_sets: 5,
    default_reps: '3-5',
    default_rest_seconds: 150,
  },
  {
    id: 'power_snatch',
    name: 'Arraché de force',
    name_en: 'Power Snatch',
    sport: 'weightlifting',
    category: 'olympic_lift',
    difficulty: 'intermediate',
    equipment: ['barbell'],
    muscles_primary: ['quadriceps', 'glutes', 'hamstrings', 'traps', 'shoulders', 'lower_back'],
    muscles_secondary: ['core', 'forearms', 'calves', 'upper_back'],
    description:
      "Variante du snatch reçue avec les cuisses au-dessus de la parallèle, sans descendre en squat overhead.",
    setup:
      "Comme l'arraché classique : prise large, hanches basses, dos plat.",
    execution:
      "Tirage explosif, réception bras tendus au-dessus de la tête, jambes au-dessus de la parallèle.",
    cues: [
      "Trajet de barre vertical",
      "Hanche complète",
      "Bras tendus immédiatement",
      "Reçois compact",
      "Pieds bien plantés",
    ],
    feeling:
      "Geste vif et propre, sans plonger sous la barre.",
    common_errors: [
      "Tirage avec les bras",
      "Réception en arrière",
      "Barre qui s'éloigne",
    ],
    default_sets: 5,
    default_reps: '2-3',
    default_rest_seconds: 150,
  },
  {
    id: 'hang_clean',
    name: 'Épaulé suspendu',
    name_en: 'Hang Clean',
    sport: 'weightlifting',
    category: 'olympic_lift',
    difficulty: 'intermediate',
    equipment: ['barbell'],
    muscles_primary: ['quadriceps', 'glutes', 'hamstrings', 'traps'],
    muscles_secondary: ['shoulders', 'core', 'forearms', 'lower_back'],
    description:
      "Clean démarré depuis la position suspendue (barre au-dessus des genoux). Travaille le deuxième tirage et la rapidité sous la barre.",
    setup:
      "Debout, barre à hauteur des cuisses ou genoux. Prise clean, dos plat, légère flexion des hanches.",
    execution:
      "Descends jusqu'au-dessus des genoux en bascule de hanche. Extension explosive verticale, réception coudes hauts.",
    cues: [
      "Bascule de hanche, pas de squat",
      "Garde le dos plat",
      "Barre proche des cuisses",
      "Explosion verticale",
      "Coudes hauts vite",
    ],
    feeling:
      "Charnière de hanche puissante suivie d'une attaque verticale rapide.",
    common_errors: [
      "Squatter au lieu de basculer",
      "Bras pliés trop tôt",
      "Décollage trop lent",
    ],
    default_sets: 5,
    default_reps: '3',
    default_rest_seconds: 120,
  },
  {
    id: 'hang_snatch',
    name: 'Arraché suspendu',
    name_en: 'Hang Snatch',
    sport: 'weightlifting',
    category: 'olympic_lift',
    difficulty: 'advanced',
    equipment: ['barbell'],
    muscles_primary: ['quadriceps', 'glutes', 'hamstrings', 'traps', 'shoulders'],
    muscles_secondary: ['core', 'forearms', 'lower_back', 'upper_back'],
    description:
      "Snatch démarré depuis la position suspendue. Focalise le deuxième tirage et la vitesse de réception bras tendus.",
    setup:
      "Debout, barre au-dessus des genoux, prise snatch large. Dos plat, hanche fléchie.",
    execution:
      "Bascule contrôlée vers les genoux. Extension explosive complète, réception bras tendus au-dessus de la tête.",
    cues: [
      "Bascule de hanche propre",
      "Pousse contre le sol",
      "Verrouille les coudes en réception",
      "Reste compact",
      "Barre dans l'axe",
    ],
    feeling:
      "Geste vertical sec, sans tirage de bras.",
    common_errors: [
      "Tirage prématuré avec les bras",
      "Barre en avant",
      "Réception molle",
    ],
    default_sets: 5,
    default_reps: '2',
    default_rest_seconds: 150,
  },
  {
    id: 'snatch_pull',
    name: 'Tirage arraché',
    name_en: 'Snatch Pull',
    sport: 'weightlifting',
    category: 'olympic_lift',
    difficulty: 'intermediate',
    equipment: ['barbell'],
    muscles_primary: ['hamstrings', 'glutes', 'lower_back', 'traps'],
    muscles_secondary: ['quadriceps', 'upper_back', 'forearms', 'calves'],
    description:
      "Mouvement de tirage sans réception. Travaille la chaîne postérieure et le geste du snatch sans la phase de réception.",
    setup:
      "Comme l'arraché : pieds largeur de hanches, prise large, dos plat.",
    execution:
      "Tirage explosif identique au snatch jusqu'à extension complète. Hausse les épaules, barre proche du corps, pas de descente sous.",
    cues: [
      "Garde la barre proche",
      "Extension complète des hanches",
      "Hausse les épaules au sommet",
      "Bras restent tendus",
      "Pousse contre le sol",
    ],
    feeling:
      "Tirage long et puissant, sans plonger.",
    common_errors: [
      "Plier les bras",
      "Hanche incomplète",
      "Inclinaison vers l'arrière",
    ],
    default_sets: 4,
    default_reps: '3-5',
    default_rest_seconds: 150,
  },
  {
    id: 'clean_pull',
    name: 'Tirage épaulé',
    name_en: 'Clean Pull',
    sport: 'weightlifting',
    category: 'olympic_lift',
    difficulty: 'intermediate',
    equipment: ['barbell'],
    muscles_primary: ['hamstrings', 'glutes', 'lower_back', 'traps'],
    muscles_secondary: ['quadriceps', 'upper_back', 'forearms', 'calves'],
    description:
      "Tirage sans la réception du clean. Renforce la chaîne postérieure et la vitesse d'extension.",
    setup:
      "Identique à l'épaulé : pieds largeur de hanches, prise clean, dos plat.",
    execution:
      "Premier tirage contrôlé puis extension explosive. Hausse les épaules en haut, bras tendus.",
    cues: [
      "Pousse le sol",
      "Hanche complète",
      "Hausse les épaules",
      "Bras tendus",
      "Barre proche",
    ],
    feeling:
      "Engagement total de la chaîne postérieure.",
    common_errors: [
      "Plier les bras",
      "Extension incomplète",
      "Dos arrondi",
    ],
    default_sets: 4,
    default_reps: '3-5',
    default_rest_seconds: 150,
  },
  {
    id: 'push_jerk',
    name: 'Jeté debout',
    name_en: 'Push Jerk',
    sport: 'weightlifting',
    category: 'olympic_lift',
    difficulty: 'intermediate',
    equipment: ['barbell'],
    muscles_primary: ['shoulders', 'triceps', 'quadriceps', 'glutes'],
    muscles_secondary: ['core', 'traps', 'upper_back', 'calves'],
    description:
      "Projection de la barre au-dessus de la tête avec une flexion-extension des jambes et une réception en quart de squat, pieds parallèles.",
    setup:
      "Barre en position front rack (épaules), coudes hauts, pieds largeur de hanches.",
    execution:
      "Flexion légère verticale des jambes. Extension explosive, projette la barre vers le haut. Reçois en quart de squat avec les bras tendus, puis relève-toi.",
    cues: [
      "Flexion verticale, pas en avant",
      "Pousse fort dans le sol",
      "Tête à travers les bras",
      "Verrouille les coudes",
      "Reçois pieds bien plantés",
    ],
    feeling:
      "Sensation de jambes qui projettent la barre, bras qui verrouillent.",
    common_errors: [
      "Flexion vers l'avant (genoux qui partent)",
      "Pousser avec les épaules avant l'extension",
      "Coudes mous à la réception",
    ],
    default_sets: 4,
    default_reps: '3-5',
    default_rest_seconds: 150,
  },
  {
    id: 'split_jerk',
    name: 'Jeté fendu',
    name_en: 'Split Jerk',
    sport: 'weightlifting',
    category: 'olympic_lift',
    difficulty: 'advanced',
    equipment: ['barbell'],
    muscles_primary: ['shoulders', 'triceps', 'quadriceps', 'glutes'],
    muscles_secondary: ['core', 'traps', 'upper_back', 'calves', 'hamstrings'],
    description:
      "Projection de la barre suivie d'une réception en fente avant. Permet de soulever plus lourd en réduisant la hauteur de projection.",
    setup:
      "Barre en front rack, coudes hauts, pieds largeur de hanches.",
    execution:
      "Flexion verticale puis extension explosive. Lance les pieds en fente : un devant, un derrière, jambe avant fléchie genou au-dessus de la cheville. Bras tendus.",
    cues: [
      "Pied avant tout droit",
      "Pied arrière sur la pointe",
      "Genou avant aligné cheville",
      "Tronc vertical",
      "Reviens pied arrière d'abord",
    ],
    feeling:
      "Verrouillage haut, base solide en fente large.",
    common_errors: [
      "Fente trop courte",
      "Genou avant qui passe le pied",
      "Tronc penché en avant",
    ],
    default_sets: 5,
    default_reps: '1-3',
    default_rest_seconds: 180,
  },
  {
    id: 'back_squat_high',
    name: 'Squat barre haute',
    name_en: 'Back Squat High Bar',
    sport: 'both',
    category: 'squat',
    difficulty: 'intermediate',
    equipment: ['barbell', 'rack'],
    muscles_primary: ['quadriceps', 'glutes'],
    muscles_secondary: ['hamstrings', 'core', 'lower_back', 'calves'],
    description:
      "Squat avec la barre placée haut sur les trapèzes. Tronc plus vertical, dominante quadriceps. Référence en haltérophilie.",
    setup:
      "Barre sur les trapèzes hauts, coudes sous la barre. Pieds largeur d'épaules, pointes légèrement vers l'extérieur. Verrouille le tronc.",
    execution:
      "Descente contrôlée, hanches en arrière et genoux qui suivent les pointes. Cuisses sous la parallèle. Remonte en poussant contre le sol, tronc vertical.",
    cues: [
      "Tronc vertical",
      "Genoux dans l'axe des orteils",
      "Pousse contre le sol",
      "Verrouille les abdos",
      "Descente complète",
    ],
    feeling:
      "Cuisses chargées, dos engagé, montée explosive depuis le bas.",
    common_errors: [
      "Genoux qui rentrent",
      "Tronc qui plonge en avant",
      "Talons qui décollent",
    ],
    default_sets: 5,
    default_reps: '3-5',
    default_rest_seconds: 180,
  },
  {
    id: 'back_squat_low',
    name: 'Squat barre basse',
    name_en: 'Back Squat Low Bar',
    sport: 'strength',
    category: 'squat',
    difficulty: 'intermediate',
    equipment: ['barbell', 'rack'],
    muscles_primary: ['glutes', 'hamstrings', 'quadriceps'],
    muscles_secondary: ['lower_back', 'core', 'upper_back'],
    description:
      "Squat avec la barre placée bas sur les deltoïdes postérieurs. Plus de bascule de hanche, dominante chaîne postérieure. Style powerlifting.",
    setup:
      "Barre sur les deltoïdes postérieurs, coudes vers l'arrière. Pieds plus larges que les épaules, pointes ouvertes.",
    execution:
      "Descente avec bascule de hanche prononcée, tronc plus penché. Descends jusqu'à la parallèle. Pousse les hanches vers le plafond.",
    cues: [
      "Pousse les hanches en arrière",
      "Garde la barre au-dessus du milieu du pied",
      "Coudes serrés vers l'arrière",
      "Genoux qui suivent les pointes",
      "Verrouille en haut",
    ],
    feeling:
      "Fessiers et ischios chargés, dos très engagé.",
    common_errors: [
      "Dos arrondi en bas",
      "Décollage du bassin (good morning)",
      "Profondeur insuffisante",
    ],
    default_sets: 5,
    default_reps: '3-5',
    default_rest_seconds: 180,
  },
  {
    id: 'front_squat',
    name: 'Squat avant',
    name_en: 'Front Squat',
    sport: 'both',
    category: 'squat',
    difficulty: 'intermediate',
    equipment: ['barbell', 'rack'],
    muscles_primary: ['quadriceps', 'glutes', 'core'],
    muscles_secondary: ['upper_back', 'hamstrings', 'shoulders'],
    description:
      "Squat avec la barre sur le devant des épaules. Tronc très vertical, gainage maximal. Essentiel pour le clean.",
    setup:
      "Barre en front rack sur les deltoïdes antérieurs, coudes très hauts. Pieds largeur d'épaules.",
    execution:
      "Descente contrôlée, coudes restent hauts. Cuisses sous la parallèle. Remonte en gardant la poitrine ouverte.",
    cues: [
      "Coudes vers le ciel",
      "Poitrine ouverte",
      "Descente complète",
      "Genoux ouverts",
      "Pousse depuis les talons",
    ],
    feeling:
      "Gainage intense, quadriceps qui prennent toute la charge.",
    common_errors: [
      "Coudes qui tombent",
      "Tronc qui plonge",
      "Talons décollés",
    ],
    default_sets: 5,
    default_reps: '3-5',
    default_rest_seconds: 150,
  },
  {
    id: 'overhead_squat',
    name: 'Squat overhead',
    name_en: 'Overhead Squat',
    sport: 'weightlifting',
    category: 'squat',
    difficulty: 'advanced',
    equipment: ['barbell'],
    muscles_primary: ['quadriceps', 'glutes', 'shoulders', 'core'],
    muscles_secondary: ['upper_back', 'traps', 'hamstrings', 'triceps'],
    description:
      "Squat complet avec barre bras tendus au-dessus de la tête. Position de réception du snatch. Exigeant en mobilité et gainage.",
    setup:
      "Barre au-dessus de la tête, prise large (snatch grip), bras verrouillés. Pieds largeur d'épaules.",
    execution:
      "Descente lente et contrôlée, barre légèrement en arrière de la tête. Cuisses sous la parallèle. Remonte en gardant les bras verrouillés.",
    cues: [
      "Bras verrouillés",
      "Barre dans l'axe des épaules",
      "Tronc vertical",
      "Genoux ouverts",
      "Gainage maximal",
    ],
    feeling:
      "Gainage total, sensation de stabilité dans une position exigeante.",
    common_errors: [
      "Barre qui tombe en avant",
      "Bras qui plient",
      "Talons décollés",
    ],
    default_sets: 4,
    default_reps: '3-5',
    default_rest_seconds: 120,
  },
  {
    id: 'bulgarian_split_squat',
    name: 'Squat Bulgare',
    name_en: 'Bulgarian Split Squat',
    sport: 'both',
    category: 'squat',
    difficulty: 'intermediate',
    equipment: ['dumbbell', 'barbell'],
    muscles_primary: ['quadriceps', 'glutes'],
    muscles_secondary: ['hamstrings', 'core', 'calves'],
    description:
      "Squat unilatéral avec pied arrière surélevé. Renforce chaque jambe indépendamment, corrige les asymétries.",
    setup:
      "Pied arrière posé sur un banc, pied avant éloigné d'environ une longueur de jambe. Haltères dans les mains ou barre sur le dos.",
    execution:
      "Descends en gardant le tronc vertical, genou avant qui s'aligne avec la cheville. Genou arrière proche du sol. Remonte en poussant avec la jambe avant.",
    cues: [
      "Tronc vertical",
      "Poids sur la jambe avant",
      "Genou avant aligné cheville",
      "Descente complète",
      "Pousse depuis le talon avant",
    ],
    feeling:
      "Travail intense d'une seule jambe, équilibre constant.",
    common_errors: [
      "Genou avant qui dépasse le pied",
      "Tronc penché en avant",
      "Pied avant trop proche",
    ],
    default_sets: 4,
    default_reps: '8-10',
    default_rest_seconds: 90,
  },
  {
    id: 'forward_lunge',
    name: 'Fente avant',
    name_en: 'Forward Lunge',
    sport: 'both',
    category: 'squat',
    difficulty: 'beginner',
    equipment: ['dumbbell', 'barbell', 'bodyweight'],
    muscles_primary: ['quadriceps', 'glutes'],
    muscles_secondary: ['hamstrings', 'core', 'calves'],
    description:
      "Pas en avant suivi d'une flexion des deux genoux. Travail unilatéral, équilibre, mobilité de hanche.",
    setup:
      "Debout, pieds largeur de hanches. Charge optionnelle en mains ou sur le dos.",
    execution:
      "Avance un pied largement. Descends jusqu'à ce que le genou arrière effleure le sol. Pousse fort sur le talon avant pour revenir.",
    cues: [
      "Tronc vertical",
      "Genou avant aligné cheville",
      "Descente jusqu'au genou bas",
      "Pousse depuis le talon avant",
      "Pas large et contrôlé",
    ],
    feeling:
      "Cuisses qui chauffent, fessier engagé à chaque montée.",
    common_errors: [
      "Pas trop court",
      "Genou avant qui dépasse",
      "Tronc en avant",
    ],
    default_sets: 3,
    default_reps: '10-12',
    default_rest_seconds: 75,
  },
  {
    id: 'deadlift',
    name: 'Soulevé de terre',
    name_en: 'Conventional Deadlift',
    sport: 'strength',
    category: 'hinge',
    difficulty: 'intermediate',
    equipment: ['barbell'],
    muscles_primary: ['hamstrings', 'glutes', 'lower_back', 'upper_back'],
    muscles_secondary: ['quadriceps', 'lats', 'traps', 'forearms', 'core'],
    description:
      "Mouvement de tirage depuis le sol. Référence de la force globale, sollicite toute la chaîne postérieure.",
    setup:
      "Pieds largeur de hanches sous la barre. Barre au milieu du pied. Prise un peu plus large que les jambes, dos plat, hanches sous les épaules.",
    execution:
      "Pousse contre le sol pour décoller la barre. Hanches et épaules montent ensemble. Quand la barre passe les genoux, étends les hanches jusqu'au verrouillage debout.",
    cues: [
      "Dos plat tout du long",
      "Barre proche du corps",
      "Pousse le sol, ne tire pas",
      "Hanches et épaules synchro",
      "Verrouillage debout",
    ],
    feeling:
      "Engagement total. Jambes qui poussent, dos engagé, fessiers qui terminent.",
    common_errors: [
      "Dos arrondi",
      "Barre qui s'éloigne",
      "Hanches qui montent avant les épaules",
    ],
    default_sets: 5,
    default_reps: '3-5',
    default_rest_seconds: 180,
  },
  {
    id: 'romanian_deadlift',
    name: 'Soulevé de terre roumain',
    name_en: 'Romanian Deadlift',
    sport: 'both',
    category: 'hinge',
    difficulty: 'beginner',
    equipment: ['barbell', 'dumbbell'],
    muscles_primary: ['hamstrings', 'glutes', 'lower_back'],
    muscles_secondary: ['upper_back', 'forearms', 'core'],
    description:
      "Variante du soulevé centrée sur la charnière de hanche, sans contact au sol entre les reps. Cible les ischio-jambiers.",
    setup:
      "Debout, barre devant les cuisses, prise pronation. Pieds largeur de hanches, jambes très légèrement fléchies.",
    execution:
      "Pousse les hanches en arrière, descends la barre le long des jambes en gardant le dos plat. Arrête-toi quand tu sens l'étirement des ischios. Remonte en poussant les hanches en avant.",
    cues: [
      "Pousse les hanches en arrière",
      "Genoux peu fléchis",
      "Barre proche des jambes",
      "Dos plat",
      "Étirement contrôlé",
    ],
    feeling:
      "Étirement profond dans les ischios, fessiers qui se contractent en haut.",
    common_errors: [
      "Squatter au lieu de hinger",
      "Dos arrondi",
      "Barre qui s'éloigne",
    ],
    default_sets: 4,
    default_reps: '6-10',
    default_rest_seconds: 120,
  },
  {
    id: 'good_morning',
    name: 'Good morning',
    name_en: 'Good Morning',
    sport: 'both',
    category: 'hinge',
    difficulty: 'intermediate',
    equipment: ['barbell'],
    muscles_primary: ['hamstrings', 'glutes', 'lower_back'],
    muscles_secondary: ['upper_back', 'core'],
    description:
      "Bascule de hanche avec barre sur les épaules. Renforce la chaîne postérieure, en particulier les lombaires.",
    setup:
      "Barre comme un back squat, sur les trapèzes. Pieds largeur de hanches, jambes légèrement fléchies.",
    execution:
      "Pousse les hanches en arrière, plie le tronc vers l'avant en gardant le dos plat. Descends jusqu'à environ 90° ou ressentir l'étirement. Remonte en serrant les fessiers.",
    cues: [
      "Charnière de hanche",
      "Dos plat tout du long",
      "Genoux stables",
      "Tronc parallèle au sol max",
      "Fessiers en haut",
    ],
    feeling:
      "Étirement marqué des ischios, dos qui travaille en gainage.",
    common_errors: [
      "Dos arrondi",
      "Plier les genoux comme un squat",
      "Descendre trop bas",
    ],
    default_sets: 3,
    default_reps: '8-10',
    default_rest_seconds: 120,
  },
  {
    id: 'hip_thrust',
    name: 'Hip thrust',
    name_en: 'Hip Thrust',
    sport: 'strength',
    category: 'hinge',
    difficulty: 'beginner',
    equipment: ['barbell'],
    muscles_primary: ['glutes', 'hamstrings'],
    muscles_secondary: ['quadriceps', 'core', 'lower_back'],
    description:
      "Extension de hanche dos appuyé sur un banc. Isolation puissante du fessier.",
    setup:
      "Haut du dos contre un banc, pieds à plat au sol largeur de hanches. Barre sur le pli des hanches (avec coussin).",
    execution:
      "Pousse à travers les talons et étends les hanches jusqu'à aligner épaules-hanches-genoux. Contracte fort les fessiers en haut. Redescends contrôlé.",
    cues: [
      "Pousse les hanches au plafond",
      "Verrouille les fessiers",
      "Tibias verticaux en haut",
      "Menton rentré",
      "Tempo contrôlé",
    ],
    feeling:
      "Brûlure intense dans le fessier, contraction marquée en haut.",
    common_errors: [
      "Hyper-extension lombaire",
      "Pieds trop loin ou trop près",
      "Ne pas verrouiller les fessiers",
    ],
    default_sets: 4,
    default_reps: '8-12',
    default_rest_seconds: 90,
  },
  {
    id: 'kb_swing',
    name: 'Kettlebell swing',
    name_en: 'Kettlebell Swing',
    sport: 'both',
    category: 'hinge',
    difficulty: 'beginner',
    equipment: ['dumbbell'],
    muscles_primary: ['glutes', 'hamstrings', 'lower_back'],
    muscles_secondary: ['core', 'shoulders', 'upper_back', 'forearms'],
    description:
      "Swing balistique avec kettlebell ou haltère. Travaille la puissance de hanche et la chaîne postérieure.",
    setup:
      "Kettlebell entre les pieds. Pieds largeur d'épaules. Charnière de hanche pour saisir la poignée.",
    execution:
      "Recule la kettlebell entre les jambes en hingeant. Explose les hanches vers l'avant, la kettlebell monte par inertie jusqu'à hauteur des épaules. Pas de coup de bras.",
    cues: [
      "Puissance vient des hanches",
      "Bras restent passifs",
      "Charnière, pas squat",
      "Contracte les fessiers en haut",
      "Respire à chaque rep",
    ],
    feeling:
      "Explosion ascendante depuis le fessier, le bras suit.",
    common_errors: [
      "Squatter au lieu de hinger",
      "Tirer avec les bras",
      "Hyper-extension en haut",
    ],
    default_sets: 4,
    default_reps: '15-20',
    default_rest_seconds: 60,
  },
  {
    id: 'strict_press',
    name: 'Développé militaire',
    name_en: 'Strict Press',
    sport: 'both',
    category: 'push',
    difficulty: 'intermediate',
    equipment: ['barbell'],
    muscles_primary: ['shoulders', 'triceps'],
    muscles_secondary: ['upper_back', 'core', 'chest'],
    description:
      "Poussée verticale stricte de la barre depuis les épaules, sans aide des jambes. Référence de la force d'épaule.",
    setup:
      "Barre sur la partie haute du sternum, prise un peu plus large que les épaules. Pieds largeur de hanches, fessiers et abdos serrés.",
    execution:
      "Pousse la barre verticalement, tête recule légèrement pour laisser passer. Quand la barre passe le front, avance la tête sous la barre. Verrouille les coudes en haut.",
    cues: [
      "Pas de poussée des jambes",
      "Coudes sous la barre au départ",
      "Tête à travers en haut",
      "Verrouille les coudes",
      "Gainage total",
    ],
    feeling:
      "Effort pur des épaules et triceps, gainage qui transmet la force.",
    common_errors: [
      "Cambrer le dos",
      "Poussée vers l'avant",
      "Coudes ouverts",
    ],
    default_sets: 5,
    default_reps: '3-5',
    default_rest_seconds: 150,
  },
  {
    id: 'push_press',
    name: 'Développé militaire poussé',
    name_en: 'Push Press',
    sport: 'both',
    category: 'push',
    difficulty: 'intermediate',
    equipment: ['barbell'],
    muscles_primary: ['shoulders', 'triceps', 'quadriceps'],
    muscles_secondary: ['glutes', 'core', 'upper_back'],
    description:
      "Développé avec une légère impulsion des jambes. Permet de soulever plus lourd qu'un strict press.",
    setup:
      "Barre en position rack épaules, pieds largeur de hanches.",
    execution:
      "Flexion légère des jambes, extension explosive verticale. Au moment où les jambes s'étendent, pousse la barre. Verrouille les coudes en haut sans bouger les jambes.",
    cues: [
      "Dip vertical, pas en avant",
      "Pousse au moment de l'extension",
      "Jambes restent tendues à la fin",
      "Tête à travers",
      "Verrouille",
    ],
    feeling:
      "Transmission de puissance des jambes aux bras.",
    common_errors: [
      "Dip vers l'avant",
      "Pousser trop tôt avec les bras",
      "Re-fléchir les jambes en montée",
    ],
    default_sets: 5,
    default_reps: '3-5',
    default_rest_seconds: 150,
  },
  {
    id: 'snatch_balance',
    name: 'Snatch balance',
    name_en: 'Snatch Balance',
    sport: 'weightlifting',
    category: 'olympic_lift',
    difficulty: 'advanced',
    equipment: ['barbell', 'rack'],
    muscles_primary: ['shoulders', 'quadriceps', 'glutes', 'traps'],
    muscles_secondary: ['core', 'upper_back', 'lower_back'],
    description:
      "Exercice technique de l'arraché. Barre sur le dos (prise large), on se reçoit vite en squat overhead bras verrouillés. Grave la vitesse et la confiance sous la barre.",
    setup:
      "Barre sur les trapèzes, prise d'arraché. Pieds largeur des hanches, gainage serré.",
    execution:
      "Dip court, légère impulsion, puis tire-toi agressivement en réception squat overhead bras tendus. Stabilise en bas puis relève-toi.",
    cues: [
      "Punch sous la barre, ne pousse pas la barre vers le haut",
      "Coudes verrouillés instantanément",
      "Réception basse et stable",
      "Regard devant",
    ],
    feeling:
      "Sensation de plonger sous une barre fixe, gainage explosif.",
    common_errors: [
      "Réception trop haute",
      "Barre qui part en avant",
      "Coudes mous à la réception",
    ],
    default_sets: 3,
    default_reps: '3',
    default_rest_seconds: 120,
  },
  {
    id: 'jerk_from_blocks',
    name: 'Jeté depuis blocs',
    name_en: 'Jerk from Blocks',
    sport: 'weightlifting',
    category: 'olympic_lift',
    difficulty: 'advanced',
    equipment: ['barbell', 'rack'],
    muscles_primary: ['shoulders', 'triceps', 'quadriceps', 'glutes'],
    muscles_secondary: ['core', 'upper_back', 'calves'],
    description:
      "Jeté isolé depuis des blocs (ou rack) à hauteur d'épaules. Permet de charger lourd le jeté sans la fatigue de l'épaulé.",
    setup:
      "Barre sur blocs à hauteur de clavicules, position rack épaules, coudes hauts, pieds largeur de hanches.",
    execution:
      "Dip vertical court, extension explosive, fends-toi sous la barre (split jerk) bras verrouillés. Récupère pied arrière puis pied avant.",
    cues: [
      "Dip strictement vertical",
      "Pousse la tête à travers",
      "Fente franche et stable",
      "Verrouille avant de récupérer",
    ],
    feeling:
      "Puissance verticale pure, réception solide en fente.",
    common_errors: [
      "Dip vers l'avant",
      "Barre poussée devant la tête",
      "Fente trop courte",
    ],
    default_sets: 4,
    default_reps: '2',
    default_rest_seconds: 150,
  },
  {
    id: 'bench_press',
    name: 'Développé couché',
    name_en: 'Bench Press',
    sport: 'strength',
    category: 'push',
    difficulty: 'intermediate',
    equipment: ['barbell'],
    muscles_primary: ['chest', 'triceps', 'shoulders'],
    muscles_secondary: ['upper_back', 'core'],
    description:
      "Poussée horizontale de la barre depuis la poitrine. Référence de la force du haut du corps.",
    setup:
      "Allongé sur le banc, omoplates serrées et rétractées. Pieds à plat au sol. Prise un peu plus large que les épaules, poignets verrouillés.",
    execution:
      "Descends la barre contrôlée jusqu'à la base du sternum. Pousse vers le haut en gardant les omoplates serrées. Verrouille les coudes en haut.",
    cues: [
      "Omoplates serrées",
      "Pieds plantés",
      "Coudes à 45-60°",
      "Barre touche le sternum",
      "Pousse droit vers le haut",
    ],
    feeling:
      "Pectoraux qui s'étirent en bas, qui poussent en haut.",
    common_errors: [
      "Omoplates relâchées",
      "Coudes trop écartés",
      "Rebondir la barre",
    ],
    default_sets: 5,
    default_reps: '3-6',
    default_rest_seconds: 180,
  },
  {
    id: 'incline_press',
    name: 'Développé incliné',
    name_en: 'Incline Press',
    sport: 'strength',
    category: 'push',
    difficulty: 'intermediate',
    equipment: ['barbell', 'dumbbell'],
    muscles_primary: ['chest', 'shoulders', 'triceps'],
    muscles_secondary: ['upper_back', 'core'],
    description:
      "Développé sur banc incliné à 30-45°. Cible le haut des pectoraux et les épaules antérieures.",
    setup:
      "Allongé sur banc incliné 30-45°, omoplates serrées, pieds au sol. Prise barre ou haltères au-dessus de la poitrine.",
    execution:
      "Descends contrôlé jusqu'au haut des pectoraux. Pousse vers le haut sans verrouiller violemment.",
    cues: [
      "Omoplates serrées",
      "Pieds plantés",
      "Coudes 45°",
      "Descente complète",
      "Trajet vertical",
    ],
    feeling:
      "Haut des pectoraux qui chauffent, deltoïdes antérieurs sollicités.",
    common_errors: [
      "Inclinaison trop forte (vire en épaule)",
      "Coudes ouverts",
      "Décollement des fessiers",
    ],
    default_sets: 4,
    default_reps: '6-10',
    default_rest_seconds: 120,
  },
  {
    id: 'dips',
    name: 'Dips',
    name_en: 'Dips',
    sport: 'both',
    category: 'push',
    difficulty: 'intermediate',
    equipment: ['bodyweight', 'rings'],
    muscles_primary: ['chest', 'triceps', 'shoulders'],
    muscles_secondary: ['upper_back', 'core'],
    description:
      "Poussée verticale depuis des barres parallèles. Excellent pour pectoraux, triceps et épaules.",
    setup:
      "En suspension entre deux barres parallèles, bras tendus, corps légèrement penché en avant pour cibler les pectoraux ou vertical pour les triceps.",
    execution:
      "Descends jusqu'à ce que les épaules soient légèrement sous les coudes. Pousse pour remonter, verrouille les bras en haut.",
    cues: [
      "Épaules basses",
      "Coudes proches du corps (triceps) ou légèrement ouverts (pectoraux)",
      "Descente complète",
      "Gainage actif",
      "Verrouille en haut",
    ],
    feeling:
      "Pectoraux ou triceps qui s'engagent selon l'angle.",
    common_errors: [
      "Épaules qui remontent",
      "Descente incomplète",
      "Balancement",
    ],
    default_sets: 4,
    default_reps: '6-12',
    default_rest_seconds: 90,
  },
  {
    id: 'pushups',
    name: 'Pompes',
    name_en: 'Push-ups',
    sport: 'both',
    category: 'push',
    difficulty: 'beginner',
    equipment: ['bodyweight'],
    muscles_primary: ['chest', 'triceps', 'shoulders'],
    muscles_secondary: ['core', 'upper_back'],
    description:
      "Poussée horizontale au poids du corps. Fondamental, accessible, progressable.",
    setup:
      "En planche, mains largeur d'épaules ou légèrement plus larges, doigts vers l'avant. Corps aligné de la tête aux chevilles.",
    execution:
      "Descends contrôlé jusqu'à effleurer le sol avec la poitrine. Pousse vers le haut en gardant le corps aligné.",
    cues: [
      "Gainage actif",
      "Coudes 45°",
      "Descente complète",
      "Tête neutre",
      "Trajet rectiligne",
    ],
    feeling:
      "Travail global du haut du corps, gainage permanent.",
    common_errors: [
      "Bassin qui s'affaisse",
      "Coudes trop ouverts",
      "Descente partielle",
    ],
    default_sets: 4,
    default_reps: '10-20',
    default_rest_seconds: 60,
  },
  {
    id: 'pullup_pronation',
    name: 'Traction pronation',
    name_en: 'Pull-up',
    sport: 'both',
    category: 'pull',
    difficulty: 'intermediate',
    equipment: ['bodyweight'],
    muscles_primary: ['lats', 'upper_back', 'biceps'],
    muscles_secondary: ['forearms', 'core', 'shoulders'],
    description:
      "Tirage vertical au poids du corps en prise pronation. Cible les dorsaux et le haut du dos.",
    setup:
      "Suspension à la barre, prise pronation un peu plus large que les épaules, bras tendus, omoplates engagées vers le bas.",
    execution:
      "Tire vers la barre en ramenant les coudes vers le bas et l'arrière. Menton au-dessus de la barre. Descente contrôlée jusqu'à l'extension complète.",
    cues: [
      "Engage les omoplates avant de tirer",
      "Coudes vers le bas",
      "Menton au-dessus de la barre",
      "Descente complète",
      "Pas de balancement",
    ],
    feeling:
      "Dorsaux qui se contractent puissamment, sensation de largeur.",
    common_errors: [
      "Kipping involontaire",
      "Amplitude partielle",
      "Tirer avec les bras uniquement",
    ],
    default_sets: 4,
    default_reps: '5-10',
    default_rest_seconds: 120,
  },
  {
    id: 'pullup_supination',
    name: 'Traction supination',
    name_en: 'Chin-up',
    sport: 'both',
    category: 'pull',
    difficulty: 'intermediate',
    equipment: ['bodyweight'],
    muscles_primary: ['lats', 'biceps'],
    muscles_secondary: ['upper_back', 'forearms', 'core'],
    description:
      "Tirage vertical en prise supination. Plus de biceps, légèrement plus accessible que la traction pronation.",
    setup:
      "Suspension à la barre, prise supination largeur d'épaules. Bras tendus.",
    execution:
      "Tire en ramenant la barre vers le sternum, coudes vers le bas. Descente contrôlée.",
    cues: [
      "Engage les omoplates",
      "Tire avec le dos d'abord",
      "Sternum vers la barre",
      "Coudes près du corps",
      "Amplitude complète",
    ],
    feeling:
      "Sensation conjointe dos et biceps, contraction sur le haut.",
    common_errors: [
      "Tirer uniquement avec les biceps",
      "Balancement",
      "Amplitude partielle",
    ],
    default_sets: 4,
    default_reps: '5-10',
    default_rest_seconds: 120,
  },
  {
    id: 'barbell_row',
    name: 'Rowing barre',
    name_en: 'Bent-over Row',
    sport: 'strength',
    category: 'pull',
    difficulty: 'intermediate',
    equipment: ['barbell'],
    muscles_primary: ['upper_back', 'lats', 'lower_back'],
    muscles_secondary: ['biceps', 'forearms', 'core', 'traps'],
    description:
      "Tirage horizontal de la barre vers l'abdomen, tronc penché. Excellent pour l'épaisseur du dos.",
    setup:
      "Pieds largeur de hanches, hanches en arrière, tronc penché vers 45°, dos plat. Barre dans les mains, prise pronation largeur d'épaules.",
    execution:
      "Tire la barre vers le bas du sternum / nombril, coudes près du corps. Contracte les omoplates en haut. Descente contrôlée jusqu'à extension.",
    cues: [
      "Dos plat",
      "Coudes près du corps",
      "Contracte les omoplates",
      "Pas de balancement",
      "Tronc stable",
    ],
    feeling:
      "Travail intense du milieu et haut du dos.",
    common_errors: [
      "Dos arrondi",
      "Tronc qui se relève à chaque rep (effet kettlebell swing)",
      "Coudes trop ouverts",
    ],
    default_sets: 4,
    default_reps: '6-10',
    default_rest_seconds: 120,
  },
  {
    id: 'dumbbell_row',
    name: 'Rowing haltère',
    name_en: 'Dumbbell Row',
    sport: 'both',
    category: 'pull',
    difficulty: 'beginner',
    equipment: ['dumbbell'],
    muscles_primary: ['upper_back', 'lats'],
    muscles_secondary: ['biceps', 'forearms', 'core'],
    description:
      "Tirage horizontal unilatéral à l'haltère, un genou et une main sur un banc. Isole un côté du dos.",
    setup:
      "Un genou et une main sur le banc, dos parallèle au sol, plat. Haltère dans la main opposée, bras tendu vers le bas.",
    execution:
      "Tire l'haltère vers la hanche, coude près du corps. Contracte l'omoplate. Redescends contrôlé.",
    cues: [
      "Dos plat parallèle au sol",
      "Coude près du corps",
      "Tire vers la hanche",
      "Pas de rotation du tronc",
      "Amplitude complète",
    ],
    feeling:
      "Tension unilatérale forte dans le dorsal et les rhomboïdes.",
    common_errors: [
      "Rotation du tronc",
      "Coude trop ouvert",
      "Tirer vers l'épaule",
    ],
    default_sets: 4,
    default_reps: '8-12',
    default_rest_seconds: 75,
  },
  {
    id: 'face_pull',
    name: 'Face pull',
    name_en: 'Face Pull',
    sport: 'both',
    category: 'pull',
    difficulty: 'beginner',
    equipment: ['dumbbell'],
    muscles_primary: ['shoulders', 'upper_back', 'traps'],
    muscles_secondary: ['biceps', 'forearms'],
    description:
      "Tirage à hauteur du visage. Renforce les deltoïdes postérieurs et la santé d'épaule.",
    setup:
      "Face à une poulie haute ou élastique, corde ou élastique en main, bras tendus à hauteur du visage.",
    execution:
      "Tire les mains vers le visage en ouvrant les coudes vers l'extérieur. Contracte les omoplates et les arrières d'épaule. Relâche contrôlé.",
    cues: [
      "Coudes hauts et ouverts",
      "Tire vers les oreilles",
      "Contraction des arrières d'épaule",
      "Tempo lent",
      "Pas de balancement",
    ],
    feeling:
      "Brûlure ciblée sur l'arrière de l'épaule et le milieu du dos.",
    common_errors: [
      "Coudes qui tombent",
      "Trop lourd (utilise l'élan)",
      "Amplitude partielle",
    ],
    default_sets: 3,
    default_reps: '12-15',
    default_rest_seconds: 60,
  },
  {
    id: 'barbell_shrug',
    name: 'Shrug barre',
    name_en: 'Barbell Shrug',
    sport: 'both',
    category: 'pull',
    difficulty: 'beginner',
    equipment: ['barbell'],
    muscles_primary: ['traps'],
    muscles_secondary: ['upper_back', 'forearms'],
    description:
      "Haussement d'épaules avec barre. Isolation des trapèzes supérieurs.",
    setup:
      "Debout, barre devant les cuisses, prise pronation largeur d'épaules. Bras tendus.",
    execution:
      "Hausse les épaules vers les oreilles, sans plier les coudes. Pause courte en haut. Redescends contrôlé.",
    cues: [
      "Bras tendus",
      "Épaules droit vers le haut",
      "Pause en haut",
      "Pas de rotation",
      "Tempo contrôlé",
    ],
    feeling:
      "Trapèzes qui se contractent en haut.",
    common_errors: [
      "Rotation des épaules",
      "Plier les coudes",
      "Trop lourd",
    ],
    default_sets: 3,
    default_reps: '10-15',
    default_rest_seconds: 60,
  },
  {
    id: 'plank',
    name: 'Gainage frontal',
    name_en: 'Plank',
    sport: 'both',
    category: 'core',
    difficulty: 'beginner',
    equipment: ['bodyweight'],
    muscles_primary: ['core'],
    muscles_secondary: ['shoulders', 'glutes', 'lower_back'],
    description:
      "Maintien isométrique en position de planche sur les avant-bras. Renforce le gainage profond.",
    setup:
      "Avant-bras au sol largeur d'épaules, coudes sous les épaules. Corps aligné de la tête aux chevilles, pieds largeur de hanches.",
    execution:
      "Maintiens la position en contractant abdos et fessiers. Respiration normale. Tiens la durée prévue.",
    cues: [
      "Contracte les abdos",
      "Serre les fessiers",
      "Tête neutre",
      "Bassin aligné",
      "Respire calmement",
    ],
    feeling:
      "Abdominaux profonds qui travaillent en isométrie.",
    common_errors: [
      "Bassin haut",
      "Bassin qui s'affaisse",
      "Tête levée",
    ],
    default_sets: 3,
    default_reps: '30-60s',
    default_rest_seconds: 45,
  },
  {
    id: 'side_plank',
    name: 'Gainage latéral',
    name_en: 'Side Plank',
    sport: 'both',
    category: 'core',
    difficulty: 'beginner',
    equipment: ['bodyweight'],
    muscles_primary: ['core'],
    muscles_secondary: ['shoulders', 'glutes'],
    description:
      "Gainage latéral sur un avant-bras. Cible les obliques.",
    setup:
      "Allongé sur le côté, en appui sur l'avant-bras, coude sous l'épaule. Jambes tendues, pieds empilés.",
    execution:
      "Soulève le bassin pour aligner épaule-hanche-pied. Tiens la position en contractant les obliques.",
    cues: [
      "Hanche haute",
      "Corps aligné",
      "Coude sous l'épaule",
      "Respire calmement",
      "Tête neutre",
    ],
    feeling:
      "Brûlure sur le côté du tronc.",
    common_errors: [
      "Hanche basse",
      "Tronc en rotation",
      "Coude pas aligné",
    ],
    default_sets: 3,
    default_reps: '30-45s',
    default_rest_seconds: 45,
  },
  {
    id: 'crunch',
    name: 'Crunch',
    name_en: 'Crunch',
    sport: 'both',
    category: 'core',
    difficulty: 'beginner',
    equipment: ['bodyweight'],
    muscles_primary: ['core'],
    muscles_secondary: ['hip_flexors'],
    description:
      "Flexion partielle du tronc allongé. Cible la partie haute des abdominaux.",
    setup:
      "Allongé sur le dos, genoux pliés, pieds à plat. Mains derrière les oreilles ou croisées sur la poitrine.",
    execution:
      "Décolle les omoplates du sol en contractant les abdos. Pause courte en haut. Redescends contrôlé.",
    cues: [
      "Mouvement court et contrôlé",
      "Menton ouvert",
      "Pas de traction sur la nuque",
      "Contraction marquée",
      "Expiration en montée",
    ],
    feeling:
      "Brûlure ciblée sur la partie haute des abdos.",
    common_errors: [
      "Tirer sur la nuque",
      "Mouvement trop ample",
      "Tempo trop rapide",
    ],
    default_sets: 3,
    default_reps: '15-20',
    default_rest_seconds: 45,
  },
  {
    id: 'russian_twist',
    name: 'Russian twist',
    name_en: 'Russian Twist',
    sport: 'both',
    category: 'core',
    difficulty: 'beginner',
    equipment: ['bodyweight', 'dumbbell'],
    muscles_primary: ['core'],
    muscles_secondary: ['hip_flexors', 'shoulders'],
    description:
      "Rotation du tronc assis, jambes légèrement levées. Cible les obliques.",
    setup:
      "Assis, genoux pliés, talons légèrement décollés. Tronc penché en arrière à environ 45°. Mains jointes ou haltère.",
    execution:
      "Tourne le tronc d'un côté en touchant le sol, puis de l'autre. Garde le tronc stable.",
    cues: [
      "Tourne avec le tronc",
      "Pas seulement les bras",
      "Garde l'angle du tronc",
      "Respire chaque côté",
      "Contrôle le tempo",
    ],
    feeling:
      "Brûlure intense sur les obliques.",
    common_errors: [
      "Tourner les bras sans le tronc",
      "Dos arrondi",
      "Pieds posés (trop facile)",
    ],
    default_sets: 3,
    default_reps: '20-30',
    default_rest_seconds: 45,
  },
  {
    id: 'seated_good_morning',
    name: 'Good morning assis',
    name_en: 'Seated Good Morning',
    sport: 'strength',
    category: 'core',
    difficulty: 'intermediate',
    equipment: ['barbell'],
    muscles_primary: ['lower_back', 'core'],
    muscles_secondary: ['upper_back', 'glutes'],
    description:
      "Good morning exécuté assis sur un banc. Isole les lombaires en supprimant la contribution des ischios.",
    setup:
      "Assis sur un banc, barre sur les trapèzes comme un back squat. Pieds à plat au sol.",
    execution:
      "Penche le tronc vers l'avant en gardant le dos plat. Descends jusqu'à environ 45-60°. Remonte en contractant les lombaires.",
    cues: [
      "Dos plat",
      "Tronc qui bascule, pas qui s'arrondit",
      "Lombaires engagés",
      "Tempo contrôlé",
      "Amplitude raisonnable",
    ],
    feeling:
      "Lombaires qui travaillent en flexion-extension.",
    common_errors: [
      "Dos arrondi",
      "Amplitude excessive",
      "Tempo rapide",
    ],
    default_sets: 3,
    default_reps: '8-10',
    default_rest_seconds: 90,
  },
  {
    id: 'back_extension',
    name: 'Extension lombaire',
    name_en: 'Back Extension',
    sport: 'both',
    category: 'core',
    difficulty: 'beginner',
    equipment: ['bodyweight'],
    muscles_primary: ['lower_back', 'glutes'],
    muscles_secondary: ['hamstrings', 'core'],
    description:
      "Extension du tronc sur banc à lombaires. Renforce la chaîne postérieure basse.",
    setup:
      "Bassin sur le coussin du banc, chevilles bloquées. Tronc libre de bouger.",
    execution:
      "Descends le tronc vers le sol en gardant le dos plat. Remonte jusqu'à aligner le tronc avec les jambes. Ne pas hyper-étendre.",
    cues: [
      "Mouvement de hanche",
      "Dos plat",
      "Arrête à l'horizontale",
      "Pas d'hyper-extension",
      "Tempo contrôlé",
    ],
    feeling:
      "Lombaires et fessiers engagés sur toute l'amplitude.",
    common_errors: [
      "Hyper-extension en haut",
      "Dos arrondi en bas",
      "Tempo trop rapide",
    ],
    default_sets: 3,
    default_reps: '12-15',
    default_rest_seconds: 60,
  },
  {
    id: 'barbell_curl',
    name: 'Curl biceps barre',
    name_en: 'Barbell Curl',
    sport: 'strength',
    category: 'accessory',
    difficulty: 'beginner',
    equipment: ['barbell'],
    muscles_primary: ['biceps'],
    muscles_secondary: ['forearms'],
    description:
      "Flexion du coude avec barre, prise supination. Isolation des biceps.",
    setup:
      "Debout, barre dans les mains prise supination largeur d'épaules. Coudes contre le tronc.",
    execution:
      "Fléchis les coudes pour monter la barre vers les épaules sans bouger les coudes. Redescends contrôlé jusqu'à extension complète.",
    cues: [
      "Coudes fixes",
      "Pas de balancement",
      "Amplitude complète",
      "Tempo contrôlé",
      "Contraction en haut",
    ],
    feeling:
      "Brûlure ciblée sur les biceps.",
    common_errors: [
      "Coudes qui avancent",
      "Balancer le tronc",
      "Amplitude partielle",
    ],
    default_sets: 3,
    default_reps: '8-12',
    default_rest_seconds: 60,
  },
  {
    id: 'tricep_extension',
    name: 'Extension triceps poulie',
    name_en: 'Tricep Extension',
    sport: 'strength',
    category: 'accessory',
    difficulty: 'beginner',
    equipment: ['dumbbell'],
    muscles_primary: ['triceps'],
    muscles_secondary: ['shoulders'],
    description:
      "Extension des coudes à la poulie haute ou avec haltère. Isolation des triceps.",
    setup:
      "Face à la poulie haute, coudes pliés et contre le tronc, mains sur la barre ou la corde.",
    execution:
      "Étends les coudes en gardant les épaules immobiles. Tire la charge vers le bas jusqu'à extension complète. Remonte contrôlé.",
    cues: [
      "Coudes fixes contre le corps",
      "Extension complète",
      "Tempo lent",
      "Pas de mouvement d'épaule",
      "Pause en bas",
    ],
    feeling:
      "Brûlure isolée sur les triceps.",
    common_errors: [
      "Coudes qui s'éloignent",
      "Utiliser les épaules",
      "Amplitude partielle",
    ],
    default_sets: 3,
    default_reps: '10-15',
    default_rest_seconds: 60,
  },
  {
    id: 'lateral_raises',
    name: 'Élévations latérales',
    name_en: 'Lateral Raises',
    sport: 'strength',
    category: 'accessory',
    difficulty: 'beginner',
    equipment: ['dumbbell'],
    muscles_primary: ['shoulders'],
    muscles_secondary: ['traps'],
    description:
      "Élévation latérale des haltères pour cibler les deltoïdes moyens.",
    setup:
      "Debout, haltères dans les mains le long du corps, légère flexion des coudes.",
    execution:
      "Lève les haltères sur les côtés jusqu'à hauteur des épaules. Pause courte. Redescends contrôlé.",
    cues: [
      "Coudes légèrement pliés",
      "Lève à hauteur d'épaules max",
      "Pas de balancement",
      "Petit-doigt légèrement plus haut",
      "Tempo contrôlé",
    ],
    feeling:
      "Brûlure ciblée sur les deltoïdes moyens.",
    common_errors: [
      "Trop lourd (balancement)",
      "Monter au-dessus des épaules",
      "Coudes verrouillés",
    ],
    default_sets: 3,
    default_reps: '12-15',
    default_rest_seconds: 60,
  },
  {
    id: 'reverse_fly',
    name: 'Oiseau',
    name_en: 'Reverse Fly',
    sport: 'strength',
    category: 'accessory',
    difficulty: 'beginner',
    equipment: ['dumbbell'],
    muscles_primary: ['shoulders', 'upper_back'],
    muscles_secondary: ['traps'],
    description:
      "Élévation latérale tronc penché. Cible les deltoïdes postérieurs et le milieu du dos.",
    setup:
      "Tronc penché vers 45°, dos plat, haltères dans les mains pendant sous les épaules. Légère flexion des coudes.",
    execution:
      "Lève les haltères sur les côtés en contractant les omoplates. Hauteur des épaules. Redescends contrôlé.",
    cues: [
      "Dos plat",
      "Coudes légèrement pliés",
      "Contracte les omoplates",
      "Mouvement large mais contrôlé",
      "Pas de balancement",
    ],
    feeling:
      "Brûlure sur l'arrière des épaules et le milieu du dos.",
    common_errors: [
      "Tronc qui se relève",
      "Trop lourd",
      "Coudes verrouillés",
    ],
    default_sets: 3,
    default_reps: '12-15',
    default_rest_seconds: 60,
  },
  {
    id: 'dumbbell_bench_press',
    name: 'Développé couché haltères',
    name_en: 'Dumbbell Bench Press',
    sport: 'strength',
    category: 'push',
    difficulty: 'beginner',
    equipment: ['dumbbell'],
    muscles_primary: ['chest', 'triceps', 'shoulders'],
    muscles_secondary: ['upper_back', 'core'],
    description:
      "Variante haltères du développé couché. Amplitude plus grande, meilleure stabilité scapulaire.",
    setup:
      "Allongé sur banc, haltères au-dessus de la poitrine, paumes face à face ou en pronation. Omoplates serrées.",
    execution:
      "Descends les haltères jusqu’à hauteur du sternum. Pousse vers le haut sans cogner les haltères en haut.",
    cues: [
      'Omoplates serrées',
      'Coudes 45°',
      'Trajet vertical',
      'Pas de choc en haut',
      'Contrôle la descente',
    ],
    feeling: 'Pectoraux qui s’étirent en bas, contraction franche en haut.',
    common_errors: ['Coudes trop ouverts', 'Amplitude partielle', 'Lacher la posture haute'],
    default_sets: 4,
    default_reps: '8-12',
    default_rest_seconds: 90,
  },
  {
    id: 'dumbbell_fly',
    name: 'Écarté haltères',
    name_en: 'Dumbbell Fly',
    sport: 'strength',
    category: 'accessory',
    difficulty: 'beginner',
    equipment: ['dumbbell'],
    muscles_primary: ['chest'],
    muscles_secondary: ['shoulders'],
    description:
      "Isolation des pectoraux. Mouvement d’arc, légère flexion permanente des coudes.",
    setup:
      "Allongé sur banc, haltères au-dessus de la poitrine, paumes face à face, coudes légèrement pliés.",
    execution:
      "Descends les haltères sur les côtés en arc, jusqu’à étirement des pectoraux. Reviens en contractant les pectoraux.",
    cues: [
      'Coudes pliés tout du long',
      'Mouvement en arc',
      'Étirement maîtrisé',
      'Contraction en haut',
      'Tempo lent',
    ],
    feeling: 'Étirement profond des pectoraux, contraction ciblée à la fermeture.',
    common_errors: ['Trop lourd', 'Coudes verrouillés', 'Amplitude excessive'],
    default_sets: 3,
    default_reps: '10-12',
    default_rest_seconds: 75,
  },
  {
    id: 'lat_pulldown',
    name: 'Tirage vertical poulie',
    name_en: 'Lat Pulldown',
    sport: 'strength',
    category: 'pull',
    difficulty: 'beginner',
    equipment: ['dumbbell'],
    muscles_primary: ['lats', 'upper_back', 'biceps'],
    muscles_secondary: ['forearms', 'core'],
    description:
      "Tirage vertical à la poulie haute. Travail des dorsaux quand la traction n’est pas accessible.",
    setup:
      "Assis face à la poulie haute, prise pronation un peu plus large que les épaules. Coussinets contre les cuisses.",
    execution:
      'Tire la barre vers le haut du sternum, coudes vers le bas et l’arrière. Contraction omoplates. Remonte contrôlé.',
    cues: [
      'Coudes vers le bas',
      'Sternum vers la barre',
      'Pas de balancement',
      'Contracte les omoplates',
      'Amplitude complète',
    ],
    feeling: 'Dorsaux qui travaillent en largeur, biceps en support.',
    common_errors: ['Tirer derrière la nuque', 'Balancer le tronc', 'Amplitude partielle'],
    default_sets: 4,
    default_reps: '8-12',
    default_rest_seconds: 90,
  },
  {
    id: 'leg_press',
    name: 'Presse à cuisses',
    name_en: 'Leg Press',
    sport: 'strength',
    category: 'squat',
    difficulty: 'beginner',
    equipment: ['barbell'],
    muscles_primary: ['quadriceps', 'glutes'],
    muscles_secondary: ['hamstrings', 'calves'],
    description:
      "Poussée des jambes contre une charge guidée. Permet de charger lourd sans contrainte de stabilité.",
    setup:
      "Assis dans la presse, dos plaqué, pieds largeur d’épaules au milieu de la plateforme.",
    execution:
      'Descends en pliant les genoux jusqu’à 90°. Pousse à fond sans verrouiller les genoux en haut.',
    cues: [
      'Dos plaqué',
      'Genoux qui suivent les orteils',
      'Amplitude complète',
      'Pas de verrouillage',
      'Pousse depuis les talons',
    ],
    feeling: 'Quadriceps qui chauffent fort, fessiers engagés sur la poussée.',
    common_errors: ['Pieds trop bas', 'Genoux qui rentrent', 'Décollage du bassin'],
    default_sets: 4,
    default_reps: '8-12',
    default_rest_seconds: 120,
  },
  {
    id: 'leg_curl',
    name: 'Leg curl',
    name_en: 'Leg Curl',
    sport: 'strength',
    category: 'accessory',
    difficulty: 'beginner',
    equipment: ['dumbbell'],
    muscles_primary: ['hamstrings'],
    muscles_secondary: ['calves'],
    description:
      "Flexion du genou contre charge. Isolation des ischio-jambiers.",
    setup:
      "Allongé ou assis selon la machine, chevilles contre le rouleau, jambes tendues.",
    execution:
      "Plie les genoux pour amener les talons vers les fessiers. Contraction en haut. Redescends contrôlé.",
    cues: [
      'Mouvement isolé du genou',
      'Pas de balancement',
      'Contraction en haut',
      'Tempo lent',
      'Amplitude complète',
    ],
    feeling: 'Brûlure ciblée sur les ischio-jambiers.',
    common_errors: ['Trop lourd', 'Décollage du bassin', 'Amplitude partielle'],
    default_sets: 3,
    default_reps: '10-15',
    default_rest_seconds: 60,
  },
  {
    id: 'leg_extension',
    name: 'Leg extension',
    name_en: 'Leg Extension',
    sport: 'strength',
    category: 'accessory',
    difficulty: 'beginner',
    equipment: ['dumbbell'],
    muscles_primary: ['quadriceps'],
    muscles_secondary: [],
    description:
      "Extension du genou contre charge. Isolation des quadriceps.",
    setup:
      "Assis dans la machine, dos plaqué, chevilles contre le rouleau.",
    execution:
      "Étends les genoux jusqu’en haut, contraction marquée. Redescends contrôlé.",
    cues: [
      'Dos plaqué',
      'Extension complète',
      'Contraction en haut',
      'Tempo lent',
      'Pas de coup sec',
    ],
    feeling: 'Brûlure isolée sur les quadriceps.',
    common_errors: ['Coup sec en bas', 'Trop lourd', 'Amplitude partielle'],
    default_sets: 3,
    default_reps: '10-15',
    default_rest_seconds: 60,
  },
  {
    id: 'alternating_db_curl',
    name: 'Curl haltères alterné',
    name_en: 'Alternating Dumbbell Curl',
    sport: 'strength',
    category: 'accessory',
    difficulty: 'beginner',
    equipment: ['dumbbell'],
    muscles_primary: ['biceps'],
    muscles_secondary: ['forearms'],
    description:
      "Flexion des coudes en alternance, haltère par haltère.",
    setup:
      "Debout, haltères dans les mains le long du corps, paumes face au corps.",
    execution:
      "Plie un coude en supinant la main jusqu’en haut. Redescends contrôlé. Alterne avec l’autre bras.",
    cues: [
      'Coudes fixes',
      'Supination en montée',
      'Pas de balancement',
      'Contraction en haut',
      'Tempo contrôlé',
    ],
    feeling: 'Brûlure ciblée sur chaque biceps en alternance.',
    common_errors: ['Coudes qui avancent', 'Balancement du tronc', 'Amplitude partielle'],
    default_sets: 3,
    default_reps: '8-12',
    default_rest_seconds: 60,
  },
  {
    id: 'skull_crusher',
    name: 'Skull crusher',
    name_en: 'Skull Crusher',
    sport: 'strength',
    category: 'accessory',
    difficulty: 'intermediate',
    equipment: ['barbell', 'dumbbell'],
    muscles_primary: ['triceps'],
    muscles_secondary: ['shoulders'],
    description:
      "Extension triceps allongé avec barre EZ ou haltères. Isolation efficace des triceps.",
    setup:
      "Allongé sur banc, bras tendus au-dessus de la poitrine, barre dans les mains, coudes verrouillés.",
    execution:
      "Plie les coudes pour amener la barre vers le front, sans bouger les épaules. Étends pour revenir.",
    cues: [
      'Coudes fixes',
      'Mouvement isolé au coude',
      'Descente lente',
      'Pas de mouvement d’épaule',
      'Contraction en haut',
    ],
    feeling: 'Étirement et contraction très isolés sur les triceps.',
    common_errors: ['Bouger les épaules', 'Trop lourd', 'Trajet inégal'],
    default_sets: 3,
    default_reps: '8-12',
    default_rest_seconds: 75,
  },
  {
    id: 'ab_wheel',
    name: 'Ab wheel rollout',
    name_en: 'Ab Wheel Rollout',
    sport: 'strength',
    category: 'core',
    difficulty: 'intermediate',
    equipment: ['bodyweight'],
    muscles_primary: ['core'],
    muscles_secondary: ['lats', 'shoulders', 'lower_back'],
    description:
      "Roulette abdominale. Travail anti-extension lombaire, très exigeant en gainage.",
    setup:
      "À genoux, mains sur la roulette, bras tendus, dos plat.",
    execution:
      "Fais rouler la roulette vers l’avant, le corps s’étend. Reviens en contractant les abdominaux.",
    cues: [
      'Dos plat tout du long',
      'Hanches dans l’axe',
      'Gainage maximal',
      'Amplitude raisonnable',
      'Pas d’affaissement',
    ],
    feeling: 'Tension profonde sur tout le bloc abdominal.',
    common_errors: [
      'Cambrure lombaire',
      'Aller trop loin sans contrôle',
      'Remonter avec les hanches',
    ],
    default_sets: 3,
    default_reps: '6-10',
    default_rest_seconds: 75,
  },
];

export const EXERCISE_CATEGORIES: { key: ExerciseCategory | 'all' | ExerciseSport; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'weightlifting', label: 'Haltérophilie' },
  { key: 'strength', label: 'Force' },
  { key: 'squat', label: 'Squat' },
  { key: 'pull', label: 'Tirage' },
  { key: 'push', label: 'Poussée' },
  { key: 'core', label: 'Gainage' },
];

export function getExerciseById(id: string): Exercise | undefined {
  return EXERCISES.find((e) => e.id === id);
}
