export type HyroxStationId =
  | 'skierg'
  | 'sled_push'
  | 'sled_pull'
  | 'burpee_broad_jump'
  | 'rowing'
  | 'farmers_carry'
  | 'sandbag_lunges'
  | 'wall_balls';

export type HyroxEnergySystem = 'atp_pcr' | 'glycolytic' | 'oxidative';

export interface HyroxStation {
  id: HyroxStationId;
  label: string;
  primary_system: HyroxEnergySystem;
  secondary_system: HyroxEnergySystem;
  duration_avg_min: number;
  description: string;
}

export const HYROX_STATIONS: HyroxStation[] = [
  {
    id: 'skierg',
    label: 'SkiErg 1000 m',
    primary_system: 'oxidative',
    secondary_system: 'glycolytic',
    duration_avg_min: 4,
    description: 'Tirage haut, transfert de poids du corps, respiration contrôlée.',
  },
  {
    id: 'sled_push',
    label: 'Sled Push 50 m',
    primary_system: 'glycolytic',
    secondary_system: 'atp_pcr',
    duration_avg_min: 2,
    description: 'Position basse, jambes qui poussent en continu.',
  },
  {
    id: 'sled_pull',
    label: 'Sled Pull 50 m',
    primary_system: 'glycolytic',
    secondary_system: 'atp_pcr',
    duration_avg_min: 2.5,
    description: 'Tirage main sur main, dos plat, hanches engagées.',
  },
  {
    id: 'burpee_broad_jump',
    label: 'Burpee Broad Jump 80 m',
    primary_system: 'glycolytic',
    secondary_system: 'oxidative',
    duration_avg_min: 5,
    description: 'Saut horizontal après chaque burpee, économie d’énergie.',
  },
  {
    id: 'rowing',
    label: 'Rameur 1000 m',
    primary_system: 'oxidative',
    secondary_system: 'glycolytic',
    duration_avg_min: 4,
    description: 'Cadence régulière, drive jambes, finish bras.',
  },
  {
    id: 'farmers_carry',
    label: 'Farmers Carry 200 m',
    primary_system: 'glycolytic',
    secondary_system: 'oxidative',
    duration_avg_min: 2,
    description: '2×24 kg hommes, 2×16 kg femmes. Postures verrouillée.',
  },
  {
    id: 'sandbag_lunges',
    label: 'Sandbag Lunges 100 m',
    primary_system: 'glycolytic',
    secondary_system: 'oxidative',
    duration_avg_min: 5,
    description: '20 kg hommes, 10 kg femmes. Pas long, genou aligné.',
  },
  {
    id: 'wall_balls',
    label: 'Wall Balls 75 reps',
    primary_system: 'glycolytic',
    secondary_system: 'oxidative',
    duration_avg_min: 6,
    description: '6 kg hommes, 4 kg femmes. Rythme stable, respiration synchro.',
  },
];

export function getStation(id: HyroxStationId): HyroxStation {
  return HYROX_STATIONS.find((s) => s.id === id) ?? HYROX_STATIONS[0];
}

export type HyroxLevel = 'debutant' | 'regulier' | 'competiteur' | 'pro';

export const HYROX_LEVEL_LABELS: Record<HyroxLevel, string> = {
  debutant: 'Débutant',
  regulier: 'Régulier',
  competiteur: 'Compétiteur',
  pro: 'Pro / Élite',
};

export const HYROX_LEVEL_FINISH: Record<HyroxLevel, string> = {
  debutant: '~1h45',
  regulier: '~1h15',
  competiteur: '~1h00',
  pro: '< 55 min',
};

export type HyroxSessionType =
  | 'race_simulation'
  | 'station_work'
  | 'running_base'
  | 'strength_base';

export const HYROX_SESSION_LABELS: Record<HyroxSessionType, string> = {
  race_simulation: 'Simulation de course',
  station_work: 'Travail des stations',
  running_base: 'Base de course',
  strength_base: 'Force fonctionnelle',
};

export const HYROX_SESSION_PURPOSES: Record<HyroxSessionType, string> = {
  race_simulation:
    'Reproduire l’enchaînement course / station à allure compétition.',
  station_work: 'Cibler 2 à 3 stations faibles, en intensité contrôlée.',
  running_base: 'Construire l’aérobie. Couloir facile, conversationnel.',
  strength_base:
    'Renforcer les patterns Hyrox : sled, carry, lunges, wall balls.',
};

export type HyroxBlock = 1 | 2 | 3;

export interface HyroxBlockMix {
  block: HyroxBlock;
  mix: Partial<Record<HyroxSessionType, number>>;
}

export const HYROX_BLOCK_MIX: HyroxBlockMix[] = [
  { block: 1, mix: { running_base: 60, station_work: 40 } },
  { block: 2, mix: { running_base: 40, station_work: 40, race_simulation: 20 } },
  { block: 3, mix: { running_base: 30, station_work: 30, race_simulation: 40 } },
];

export interface PlannedHyroxRound {
  round_number: number;
  run_distance_m: number;
  station: HyroxStationId | null;
  station_target_label: string | null;
  target_pace_sec_per_km: number | null;
  target_duration_sec: number | null;
}

export interface PlannedHyroxSession {
  type: HyroxSessionType;
  name: string;
  message: string;
  rounds: PlannedHyroxRound[];
  estimated_duration_min: number;
}

export interface HyroxZoneAdaptation {
  message: string;
  forceTechniqueOnly: boolean;
  reduceIntensity: boolean;
  raceEffort: boolean;
}

export function adaptHyroxSessionToZone(zoneScore: number | null): HyroxZoneAdaptation {
  if (zoneScore === null) {
    return {
      message: 'Pas de check-in aujourd’hui. Garde une marge de sécurité.',
      forceTechniqueOnly: false,
      reduceIntensity: false,
      raceEffort: false,
    };
  }
  if (zoneScore <= 30) {
    return {
      message: 'Technique sans effort aujourd’hui.',
      forceTechniqueOnly: true,
      reduceIntensity: true,
      raceEffort: false,
    };
  }
  if (zoneScore <= 50) {
    return {
      message: 'Travail de base, sans aller dans le rouge.',
      forceTechniqueOnly: false,
      reduceIntensity: true,
      raceEffort: false,
    };
  }
  if (zoneScore <= 75) {
    return {
      message: 'Tu peux tenir le rythme. Sois régulier.',
      forceTechniqueOnly: false,
      reduceIntensity: false,
      raceEffort: false,
    };
  }
  return {
    message: 'Simule la compétition. Tu es prêt.',
    forceTechniqueOnly: false,
    reduceIntensity: false,
    raceEffort: true,
  };
}

export interface GenerateHyroxSessionParams {
  type: HyroxSessionType;
  level: HyroxLevel;
  weakStations: HyroxStationId[];
  zoneScore: number | null;
}

const RACE_RUN_PACE: Record<HyroxLevel, number> = {
  debutant: 6 * 60 + 30,
  regulier: 5 * 60 + 30,
  competiteur: 4 * 60 + 45,
  pro: 4 * 60 + 0,
};

export function generateHyroxSession(params: GenerateHyroxSessionParams): PlannedHyroxSession {
  const adaptation = adaptHyroxSessionToZone(params.zoneScore);
  const basePace = RACE_RUN_PACE[params.level];
  const effortPace = adaptation.reduceIntensity ? basePace + 45 : basePace;
  const rounds: PlannedHyroxRound[] = [];
  let estimated = 0;

  if (params.type === 'race_simulation' && !adaptation.forceTechniqueOnly) {
    for (let i = 0; i < 8; i += 1) {
      const station = HYROX_STATIONS[i];
      rounds.push({
        round_number: i + 1,
        run_distance_m: 1000,
        station: station.id,
        station_target_label: station.label,
        target_pace_sec_per_km: effortPace,
        target_duration_sec: Math.round(station.duration_avg_min * 60),
      });
      estimated += effortPace + station.duration_avg_min * 60;
    }
  } else if (params.type === 'station_work') {
    const targets = (params.weakStations.length > 0 ? params.weakStations : HYROX_STATIONS.map((s) => s.id))
      .slice(0, 3);
    for (let i = 0; i < targets.length; i += 1) {
      const station = getStation(targets[i]);
      rounds.push({
        round_number: i + 1,
        run_distance_m: 600,
        station: station.id,
        station_target_label: `${station.label} · 3 séries`,
        target_pace_sec_per_km: effortPace + 20,
        target_duration_sec: Math.round(station.duration_avg_min * 60 * 0.6),
      });
      estimated += (effortPace + 20) * 0.6 + station.duration_avg_min * 60 * 0.6 * 3;
    }
  } else if (params.type === 'running_base') {
    const minutes = params.level === 'debutant' ? 45 : params.level === 'regulier' ? 55 : 70;
    rounds.push({
      round_number: 1,
      run_distance_m: 0,
      station: null,
      station_target_label: `Course continue ${minutes} min`,
      target_pace_sec_per_km: effortPace + 60,
      target_duration_sec: minutes * 60,
    });
    estimated = minutes * 60;
  } else {
    const focus: HyroxStationId[] =
      params.weakStations.length > 0
        ? params.weakStations.slice(0, 4)
        : ['sled_push', 'sled_pull', 'farmers_carry', 'sandbag_lunges'];
    for (let i = 0; i < focus.length; i += 1) {
      const station = getStation(focus[i]);
      rounds.push({
        round_number: i + 1,
        run_distance_m: 0,
        station: station.id,
        station_target_label: `${station.label} · 4 séries`,
        target_pace_sec_per_km: null,
        target_duration_sec: Math.round(station.duration_avg_min * 60),
      });
      estimated += station.duration_avg_min * 60 * 4;
    }
  }

  return {
    type: params.type,
    name: HYROX_SESSION_LABELS[params.type],
    message: adaptation.message,
    rounds,
    estimated_duration_min: Math.max(20, Math.round(estimated / 60)),
  };
}
