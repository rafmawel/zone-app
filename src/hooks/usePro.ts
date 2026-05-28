import { useProSports } from '@/hooks/useProSports';

export interface UseProResult {
  isPro: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Backward-compatibility shim for the legacy single-tier Pro check.
 *
 * Existing screens that only need a boolean "is this user Pro" gate keep
 * working against the modular subscription model: `isPro` now maps to
 * "has Zone Pro Base" (granted with any sport subscription). New screens
 * should use {@link useProSports} directly for per-sport gating.
 *
 * @returns `{ isPro, loading, refresh }`
 */
export function usePro(): UseProResult {
  const { hasProBase, loading, refresh } = useProSports();
  return { isPro: hasProBase, loading, refresh };
}
