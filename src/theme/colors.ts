/**
 * Zone design system — exclusive dark mode with bold, per-sport colour blocks.
 *
 * The flat tokens below are the source of truth. The nested `bg` / `text` /
 * `orbe` groups are backward-compatible aliases mapped onto the new palette so
 * existing screens keep rendering while the UI is migrated incrementally.
 */

// Backgrounds
const background = '#0D0D0D'; // App background
const surface = '#1A1A1A'; // Neutral cards, secondary surfaces
const surfaceAlt = '#242424'; // Tertiary surfaces

// Sport accents — one per discipline, used for the coloured blocks.
const haltero = '#4F46E5'; // Indigo vif — Haltérophilie
const run = '#F97316'; // Orange — Course
const muscu = '#EF4444'; // Rouge — Musculation
const hyrox = '#0EA5E9'; // Bleu ciel — Hyrox

// Functional
const scoreGreen = '#1BCA82'; // Vert vif — Score Zone / succès
const checkin = '#EC4899'; // Rose — Check-in quotidien
const warning = '#F59E0B'; // Ambre — alertes
const danger = '#EF4444'; // Rouge erreur

// Text
const textPrimary = '#FFFFFF';
const textSecondary = '#9CA3AF'; // Gris moyen
const textMuted = '#4B5563'; // Gris foncé (labels, hints)

export const colors = {
  // Backgrounds
  background,
  surface,
  surfaceAlt,

  // Sport accents
  haltero,
  run,
  muscu,
  hyrox,

  // Functional
  scoreGreen,
  checkin,
  warning,
  danger,

  // Text
  textPrimary,
  textSecondary,
  textMuted,

  // Misc
  border: '#2A2A2A',
  success: scoreGreen,

  // ── Backward-compatible aliases (mapped onto the new palette) ──────────────
  bg: { primary: background, card: surface, cardTop: surfaceAlt, elevated: surfaceAlt },
  text: { primary: textPrimary, secondary: textSecondary, muted: textMuted },
  // Effort / readiness tiers (low → high). Formerly the "orbe" palette.
  orbe: { red: danger, amber: warning, blue: hyrox, green: scoreGreen },
} as const;

/** Corner radius scale. */
export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  full: 9999,
} as const;

/**
 * Font family keys — Inter only. Must match the families registered with
 * `useFonts` in app/_layout.tsx.
 */
export const fonts = {
  display: 'Inter_700Bold', // Titles, large numbers
  body: 'Inter_400Regular', // Body copy
  label: 'Inter_600SemiBold', // Labels, badges, sub-titles
} as const;

export type SportColorKey = 'haltero' | 'run' | 'muscu' | 'hyrox';

/**
 * Resolve a sport accent colour from any of the sport keys used across the
 * app (canonical scheduler keys, Firestore keys, or the short DA keys).
 *
 * @param sport a sport identifier in any of the supported spellings
 * @returns the matching accent hex, falling back to the Zone green
 */
export function sportColorFor(sport: string): string {
  switch (sport) {
    case 'haltero':
    case 'halterophilie':
    case 'weightlifting':
      return haltero;
    case 'run':
    case 'running':
    case 'course':
      return run;
    case 'muscu':
    case 'musculation':
      return muscu;
    case 'hyrox':
      return hyrox;
    default:
      return scoreGreen;
  }
}
