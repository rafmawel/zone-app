/**
 * Hyrox station reference data.
 *
 * Eight functional stations alternating with 8 x 1 km runs. Targets are
 * intermediate-athlete race times; lactate load is a relative metabolic
 * cost (arbitrary units) used by the in-session accumulation model, and
 * raceImpactWeight scales how much a station's deficit hurts the finish.
 *
 * Energy system tags follow Tschakert & Hofmann (2013) on high-intensity
 * intermittent exercise.
 */

export type HyroxStationKey =
  | 'ski_erg'
  | 'sled_push'
  | 'sled_pull'
  | 'burpee_broad_jump'
  | 'row_erg'
  | 'farmers_carry'
  | 'sandbag_lunges'
  | 'wall_balls';

export type HyroxStationUnit = 'm' | 'reps';

export type HyroxEnergySystem = 'atp_pcr' | 'glycolytic' | 'oxidative';

export interface HyroxStationData {
  id: HyroxStationKey;
  name: string;
  englishName: string;
  /** Distance-based stations set this; rep-based stations set `reps`. */
  distance?: number;
  reps?: number;
  unit: HyroxStationUnit;
  /** Intermediate-athlete race target, in seconds. */
  raceTimeTarget: number;
  /** Relative metabolic cost for the lactate model. */
  lactateLoad: number;
  /** How heavily this station weighs on the race result. */
  raceImpactWeight: number;
  /** Dominant energy system for the live breakdown. */
  primarySystem: HyroxEnergySystem;
  muscles: string[];
  coachingCues: string[];
  commonMistakes: string[];
  pacingStrategy: string;
}

export const HYROX_STATIONS: HyroxStationData[] = [
  {
    id: 'ski_erg',
    name: 'SkiErg',
    englishName: 'Ski Erg',
    distance: 1000,
    unit: 'm',
    raceTimeTarget: 180,
    lactateLoad: 2.5,
    raceImpactWeight: 1.1,
    primarySystem: 'oxidative',
    muscles: ['grand_dorsal', 'trapèzes', 'triceps', 'core'],
    coachingCues: [
      'Tirez avec le dos, pas les bras',
      'Corps légèrement penché en avant, hanches en arrière',
      'Cadence régulière, évitez le sprint puis pause',
    ],
    commonMistakes: [
      'Tirer avec les bras uniquement, ça épuise les épaules',
      'Aller trop vite sur les 200 premiers mètres',
    ],
    pacingStrategy: 'Négatif: légèrement plus lent sur 500m puis accélérez',
  },
  {
    id: 'sled_push',
    name: 'Poussée de traîneau',
    englishName: 'Sled Push',
    distance: 50,
    unit: 'm',
    raceTimeTarget: 90,
    lactateLoad: 4.0,
    raceImpactWeight: 1.3,
    primarySystem: 'atp_pcr',
    muscles: ['quadriceps', 'fessiers', 'épaules', 'triceps'],
    coachingCues: [
      'Angle 45 degrés corps-sol, corps incliné vers l’avant',
      'Poussez avec les jambes, pas le dos',
      'Pas courts et rapides, ne cherchez pas à enjamber',
    ],
    commonMistakes: [
      'Se redresser, ça perd la force de transmission',
      'Bloquer la respiration',
    ],
    pacingStrategy: 'Sprint contrôlé, gardez un peu pour le retour',
  },
  {
    id: 'sled_pull',
    name: 'Tirage de traîneau',
    englishName: 'Sled Pull',
    distance: 50,
    unit: 'm',
    raceTimeTarget: 90,
    lactateLoad: 3.5,
    raceImpactWeight: 1.0,
    primarySystem: 'glycolytic',
    muscles: ['ischio-jambiers', 'fessiers', 'dos', 'avant-bras'],
    coachingCues: [
      'Marchez à reculons, regardez par-dessus l’épaule',
      'Corde tendue en permanence',
      'Engagez les fessiers à chaque pas',
    ],
    commonMistakes: ['Corde trop longue, ça perd la tension', 'Pas trop longs'],
    pacingStrategy: 'Régulier, idem aller et retour',
  },
  {
    id: 'burpee_broad_jump',
    name: 'Burpee Saut en longueur',
    englishName: 'Burpee Broad Jump',
    reps: 80,
    unit: 'reps',
    raceTimeTarget: 240,
    lactateLoad: 5.0,
    raceImpactWeight: 1.3,
    primarySystem: 'glycolytic',
    muscles: ['corps_entier', 'épaules', 'quadriceps', 'core'],
    coachingCues: [
      'Sautez loin, pas haut',
      'Rythme constant plutôt que sprint puis pause',
      'Économisez les épaules, atterrissage souple',
    ],
    commonMistakes: [
      'Partir trop vite et s’effondrer après 30 reps',
      'Sauter haut au lieu de loin',
    ],
    pacingStrategy: '1 rep toutes les 3 secondes = 4min pour 80 reps',
  },
  {
    id: 'row_erg',
    name: 'Rameur',
    englishName: 'Row Erg',
    distance: 1000,
    unit: 'm',
    raceTimeTarget: 210,
    lactateLoad: 2.0,
    raceImpactWeight: 1.0,
    primarySystem: 'oxidative',
    muscles: ['dos', 'biceps', 'jambes', 'core'],
    coachingCues: [
      '60% jambes, 20% dos, 20% bras',
      'Poussez avec les talons au départ',
      'Ratio drive sur récupération de 1 sur 2',
    ],
    commonMistakes: [
      'Ramer avec les bras et perdre la puissance des jambes',
      'Se courber en fin de tirage',
    ],
    pacingStrategy: '2:10/500m intermédiaire, 2:00 avancé',
  },
  {
    id: 'farmers_carry',
    name: 'Farmers Carry',
    englishName: 'Farmers Carry',
    distance: 200,
    unit: 'm',
    raceTimeTarget: 90,
    lactateLoad: 1.5,
    raceImpactWeight: 0.8,
    primarySystem: 'oxidative',
    muscles: ['trapèzes', 'avant-bras', 'core', 'fessiers'],
    coachingCues: [
      'Épaules en arrière et basses',
      'Pas réguliers et contrôlés',
      'Regardez devant, pas vers le bas',
    ],
    commonMistakes: [
      'Épaules qui roulent vers l’avant',
      'Gripper trop fort et fatiguer les avant-bras',
    ],
    pacingStrategy: 'Station de récupération relative, reposez-y votre cardio',
  },
  {
    id: 'sandbag_lunges',
    name: 'Fentes avec sac',
    englishName: 'Sandbag Lunges',
    distance: 100,
    unit: 'm',
    raceTimeTarget: 180,
    lactateLoad: 3.0,
    raceImpactWeight: 1.2,
    primarySystem: 'glycolytic',
    muscles: ['quadriceps', 'fessiers', 'core', 'équilibre'],
    coachingCues: [
      'Genou avant à 90 degrés, ne dépasse pas la pointe du pied',
      'Sac sur les épaules, pas en avant',
      'Alternez naturellement, pas de pause debout',
    ],
    commonMistakes: [
      'Genou avant qui tombe en dedans',
      'Tronc trop incliné vers l’avant',
    ],
    pacingStrategy: 'Régulier du début à la fin, évitez le sprint initial',
  },
  {
    id: 'wall_balls',
    name: 'Wall Balls',
    englishName: 'Wall Balls',
    reps: 100,
    unit: 'reps',
    raceTimeTarget: 270,
    lactateLoad: 4.5,
    raceImpactWeight: 1.4,
    primarySystem: 'glycolytic',
    muscles: ['quadriceps', 'fessiers', 'épaules', 'core'],
    coachingCues: [
      'Squat complet avant chaque lancer',
      'Visez le point cible précisément pour rattraper facilement',
      'Rattrapez à hauteur de poitrine, absorbez',
    ],
    commonMistakes: [
      'Demi-squat, moins de puissance et plus d’épaules',
      'Perdre le rythme après une mauvaise réception',
    ],
    pacingStrategy: '1 rep toutes les 2.7s = 4min30 pour 100 reps, sets de 10',
  },
];

export function getHyroxStation(id: HyroxStationKey): HyroxStationData {
  return HYROX_STATIONS.find((s) => s.id === id) ?? HYROX_STATIONS[0];
}

export const HYROX_STATION_ORDER: HyroxStationKey[] = HYROX_STATIONS.map((s) => s.id);
