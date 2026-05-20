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

const DEV_FORCE_PRO = __DEV__;

/**
 * Hook that resolves whether the current user has a Pro subscription.
 *
 * Strategy:
 *  1. Read the Firestore cache (fast).
 *  2. Ask RevenueCat for the authoritative status.
 *  3. Sync the result back to Firestore so other devices see it.
 *
 * In development, `DEV_FORCE_PRO` short-circuits to Pro for testing.
 *
 * @returns `{ isPro, loading, refresh }`
 */
export function usePro(): UseProResult {
  const { user, loading: authLoading } = useAuth();
  const [isPro, setIsPro] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const resolve = useCallback(
    async (uid: string | null): Promise<void> => {
      if (DEV_FORCE_PRO) {
        setIsPro(true);
        setLoading(false);
        return;
      }
      if (!uid) {
        setIsPro(false);
        setLoading(false);
        return;
      }
      setLoading(true);
      // 1. Fast Firestore cache
      try {
        const cached = await getSubscriptionStatus(uid);
        if (cached) {
          setIsPro(isCacheActive(cached.isPro, cached.expiresAt));
        }
      } catch {
        // ignore cache failure
      }

      // 2. Authoritative RevenueCat
      let proFromRC = false;
      try {
        proFromRC = await checkProStatus();
      } catch {
        proFromRC = false;
      }
      setIsPro(proFromRC);
      setLoading(false);

      // 3. Sync back
      try {
        const expiresAt = proFromRC ? await getProExpiryDate() : null;
        await updateSubscriptionStatus(uid, {
          isPro: proFromRC,
          expiresAt,
        });
      } catch {
        // best-effort
      }
    },
    [],
  );

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
