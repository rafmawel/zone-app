/**
 * Gender-aware default adjustments.
 *
 * Defaults only: every value here is overridden the moment the athlete
 * logs real data (1RM, race time, measured volume tolerance). The goal is
 * a better cold start, not to constrain anyone. `non_precise` falls back
 * to the male (more conservative) baseline.
 *
 * References:
 *   - VO2max / VDOT sex differences: Joyner (1993), Daniels VDOT tables.
 *   - Strength ratios by bodyweight: typical raw-lifting norms.
 *   - Volume tolerance: Israetel (2019) notes many women recover from and
 *     benefit from higher weekly set volumes.
 */

import type { Gender } from '@/lib/firestore';

export function isFemale(gender: Gender | null | undefined): boolean {
  return gender === 'femme';
}

// --- Running -------------------------------------------------------------

/**
 * VDOT offset applied to an equivalent performance estimate. Female
 * athletes get a small downward baseline shift (-2) reflecting VO2max
 * differences; this only seeds the profile and is replaced by real races.
 */
export function vdotGenderDelta(gender: Gender | null | undefined): number {
  return isFemale(gender) ? -2 : 0;
}

// --- Weightlifting -------------------------------------------------------

export type OlympicLift = 'snatch' | 'clean_and_jerk';

const LIFT_BW_RATIO: Record<OlympicLift, { femme: number; male: number }> = {
  snatch: { femme: 0.5, male: 0.7 },
  clean_and_jerk: { femme: 0.65, male: 0.9 },
};

/**
 * Estimate a starting 1RM from bodyweight when none is known.
 */
export function defaultLiftEstimate(
  bodyweightKg: number,
  lift: OlympicLift,
  gender: Gender | null | undefined,
): number {
  const ratio = isFemale(gender) ? LIFT_BW_RATIO[lift].femme : LIFT_BW_RATIO[lift].male;
  return Math.round((bodyweightKg * ratio) / 2.5) * 2.5;
}

/**
 * Scale factor for a level-based default Olympic-lift weight. Returns 1
 * for men / unspecified; for women, the female:male strength ratio.
 */
export function olympicLiftGenderFactor(
  lift: OlympicLift,
  gender: Gender | null | undefined,
): number {
  if (!isFemale(gender)) return 1;
  return LIFT_BW_RATIO[lift].femme / LIFT_BW_RATIO[lift].male;
}

// --- Musculation ---------------------------------------------------------

const LOWER_BODY_MUSCLES = new Set([
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
]);

/**
 * Extra weekly sets women tolerate at each volume landmark (Israetel):
 * +2 lower body, +2 upper body on MEV; MAV/MRV shift up in step.
 */
export function genderVolumeBonus(muscle: string, gender: Gender | null | undefined): number {
  if (!isFemale(gender)) return 0;
  return LOWER_BODY_MUSCLES.has(muscle) ? 2 : 2;
}

// --- Hyrox ---------------------------------------------------------------

/** Wall-ball weight target by gender (standard Hyrox divisions). */
export function wallBallWeightKg(gender: Gender | null | undefined): number {
  return isFemale(gender) ? 4 : 6;
}

/**
 * Multiplier on a station's reference race time. Women's open-division
 * targets run slightly longer on the heaviest carries/pushes.
 */
export function hyroxStationTimeFactor(
  stationId: string,
  gender: Gender | null | undefined,
): number {
  if (!isFemale(gender)) return 1;
  if (stationId === 'sled_push' || stationId === 'sled_pull' || stationId === 'farmers_carry') {
    return 1.1;
  }
  return 1.05;
}
