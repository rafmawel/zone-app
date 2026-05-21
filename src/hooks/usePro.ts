import { useCallback, useEffect, useState } from 'react';
import {
  getSubscriptionStatus,
  updateSubscriptionStatus,
} from '@/lib/firestore';
import { checkProStatus, getProExpiryDate } from '@/lib/subscriptions';
import { useAuth } from '@/hooks/useAuth';

export interface UseProResult {
  isPro: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const NOOP_REFRESH = async (): Promise<void> => {};

/**
 * Hook that resolves whether the current user has a Pro subscription.
 *
 * In development (`__DEV__`) this short-circuits to Pro immediately so
 * the full analytics surface is testable without RevenueCat configured.
 *
 * In production:
 *  1. Reads the Firestore cache (fast).
 *  2. Asks RevenueCat for the authoritative status.
 *  3. Syncs the result back to Firestore so other devices see it.
 *
 * @returns `{ isPro, loading, refresh }`
 */
export function usePro(): UseProResult {
  if (__DEV__) {
    return { isPro: true, loading: false, refresh: NOOP_REFRESH };
  }
  return useProProduction();
}

function useProProduction(): UseProResult {
  const { user, loading: authLoading } = useAuth();
  const [isPro, setIsPro] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const resolve = useCallback(async (uid: string | null): Promise<void> => {
    if (!uid) {
      setIsPro(false);
      setLoading(false);
      return;
    }
    setLoading(true);

    try {
      const cached = await getSubscriptionStatus(uid);
      if (cached) {
        setIsPro(isCacheActive(cached.isPro, cached.expiresAt));
      }
    } catch {
      // ignore cache failure
    }

    let proFromRC = false;
    try {
      proFromRC = await checkProStatus();
    } catch {
      proFromRC = false;
    }
    setIsPro(proFromRC);
    setLoading(false);

    try {
      const expiresAt = proFromRC ? await getProExpiryDate() : null;
      await updateSubscriptionStatus(uid, {
        isPro: proFromRC,
        expiresAt,
      });
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    if (authLoading) {
      setLoading(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await resolve(user?.uid ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, resolve]);

  const refresh = useCallback(async (): Promise<void> => {
    await resolve(user?.uid ?? null);
  }, [resolve, user]);

  return { isPro, loading, refresh };
}

function isCacheActive(isPro: boolean, expiresAt: string | null): boolean {
  if (!isPro) return false;
  if (!expiresAt) return true;
  const exp = new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) return true;
  return exp.getTime() > Date.now();
}
