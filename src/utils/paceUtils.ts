/**
 * Pace ↔ speed helpers for running displays.
 *
 * Speed (km/h) is shown next to pace (min/km) everywhere a running pace is
 * surfaced — intuitive for treadmills and effort comprehension.
 */

/**
 * Convert a pace in sec/km to km/h.
 *
 * @param paceSecPerKm pace in seconds per kilometre
 * @returns speed in km/h, rounded to 1 decimal (0 when input is invalid)
 */
export function paceToSpeed(paceSecPerKm: number): number {
  if (!paceSecPerKm || paceSecPerKm <= 0) return 0;
  return Math.round((3600 / paceSecPerKm) * 10) / 10;
}

/**
 * Convert a "MM:SS" /km pace string to km/h.
 *
 * @param paceStr pace formatted as "4:45"
 * @returns speed in km/h, rounded to 1 decimal (0 when input is invalid)
 */
export function paceStringToSpeed(paceStr: string): number {
  const parts = paceStr.split(':');
  if (parts.length !== 2) return 0;
  const minutes = parseInt(parts[0], 10);
  const seconds = parseInt(parts[1], 10);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return 0;
  return paceToSpeed(minutes * 60 + seconds);
}

/**
 * Format a sec/km pace as a speed label, e.g. "12.6 km/h".
 *
 * @param paceSecPerKm pace in seconds per kilometre
 * @returns "<n> km/h", or '' when the pace is invalid
 */
export function formatSpeed(paceSecPerKm: number): string {
  const speed = paceToSpeed(paceSecPerKm);
  return speed > 0 ? `${speed.toFixed(1)} km/h` : '';
}
