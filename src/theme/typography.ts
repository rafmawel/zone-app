/**
 * Zone typography scale.
 *
 * - Bebas Neue is reserved for large numbers (score, weight, timer).
 * - Syne is the display face for titles and section headers.
 * - Inter carries all body copy.
 *
 * Font family keys must match those registered in app/_layout.tsx.
 */
export const typography = {
  // Large numbers only (score, weight, timer).
  number: { fontFamily: 'BebasNeue-Regular' },

  // Section titles, screen headers.
  title: { fontFamily: 'Syne-Bold' },
  titleMd: { fontFamily: 'Syne-Bold', fontSize: 20 },
  titleSm: { fontFamily: 'Syne-SemiBold', fontSize: 16 },

  // Body text.
  body: { fontFamily: 'Inter-Regular' },
  bodyMd: { fontFamily: 'Inter-Medium' },
  bodyBold: { fontFamily: 'Inter-Bold' },
  caption: { fontFamily: 'Inter-Regular', fontSize: 12 },
} as const;

/** Section header style: Syne-Bold 13px, wide tracking, muted. */
export const sectionHeader = {
  fontFamily: 'Syne-Bold',
  fontSize: 13,
  letterSpacing: 1.5,
} as const;
