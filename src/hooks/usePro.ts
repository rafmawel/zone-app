import { useCallback, useEffect, useState } from 'react';
import { getSubscriptionStatus } from '@/lib/firestore';
import { useAuth } from '@/hooks/useAuth';

export interface UseProResult {
  isPro: boolean;
  loading: boolean;
  refresh: () => void;
}

const DEV_PRO_OVERRIDE = __DEV__ && false;

/**
 * Hook that resolves whether the current user has a Pro subscription.
 *
 * Reads `users/{uid}/state/subscription` and respects a development
 * override (`DEV_PRO_OVERRIDE`).
 *
 * @returns `{ isPro, loading, refresh }`
 */
export function usePro(): UseProResult {
  const { user, loading: authLoading } = useAuth();
  const [isPro, setIsPro] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [version, setVersion] = useState<number>(0);

  const refresh = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }
    if (!user) {
      setIsPro(DEV_PRO_OVERRIDE);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const status = await getSubscriptionStatus(user.uid);
        if (cancelled) return;
        if (!status) {
          setIsPro(DEV_PRO_OVERRIDE);
          setLoading(false);
          return;
        }
        const active = isSubscriptionActive(status.isPro, status.expiresAt);
        setIsPro(active || DEV_PRO_OVERRIDE);
        setLoading(false);
      } catch {
        if (cancelled) return;
        setIsPro(DEV_PRO_OVERRIDE);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, version]);

  return { isPro, loading, refresh };
}

function isSubscriptionActive(
  isPro: boolean,
  expiresAt: string | null,
): boolean {
  if (!isPro) return false;
  if (!expiresAt) return true;
  const exp = new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) return true;
  return exp.getTime() > Date.now();
}
