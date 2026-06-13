/**
 * Zone typography scale — Inter exclusively.
 *
 * - Inter_700Bold is the display face (titles, large numbers).
 * - Inter_600SemiBold carries labels, badges and sub-titles.
 * - Inter_400Regular / Inter_500Medium carry body copy.
 *
 * Font family keys must match those registered in app/_layout.tsx.
 */
export const typography = {
  // Large numbers (score, weight, timer).
  number: { fontFamily: 'Inter_700Bold' },

  // Section titles, screen headers.
  title: { fontFamily: 'Inter_700Bold' },
  titleMd: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  titleSm: { fontFamily: 'Inter_600SemiBold', fontSize: 16 },

  // Body text.
  body: { fontFamily: 'Inter_400Regular' },
  bodyMd: { fontFamily: 'Inter_500Medium' },
  bodyBold: { fontFamily: 'Inter_700Bold' },
  caption: { fontFamily: 'Inter_400Regular', fontSize: 12 },
} as const;

/** Section header style: Inter 700 13px, wide tracking. */
export const sectionHeader = {
  fontFamily: 'Inter_700Bold',
  fontSize: 13,
  letterSpacing: 1.5,
} as const;
