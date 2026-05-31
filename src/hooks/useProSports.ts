import { useCallback, useEffect, useState } from 'react';
import { getSubscription, saveSubscription } from '@/lib/firestore';
import { checkProStatus } from '@/lib/subscriptions';
import { useAuth } from '@/hooks/useAuth';
import {
  ALL_PRO_SPORTS,
  EMPTY_SUBSCRIPTION,
  type ProSport,
  type ZoneSubscription,
} from '@/types/subscription';

export interface ProSportsState {
  subscription: ZoneSubscription;
  hasProBase: boolean;
  proSports: ProSport[];
  isProSport: (sport: ProSport) => boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const DEV_SUBSCRIPTION: ZoneSubscription = {
  hasProBase: true,
  proSports: [...ALL_PRO_SPORTS],
  plan: 'bundle',
  expiresAt: '2099-12-31',
  source: 'promo',
};

/**
 * Resolve the current user's modular Zone Pro subscription.
 *
 * In development (`__DEV__`) every module is unlocked immediately so the
 * full surface is testable without RevenueCat configured.
 *
 * In production:
 *  1. Read the Firestore cache first. If it is still active (promo code
 *     or a previously synced subscription) return it and stop.
 *  2. Otherwise ask RevenueCat and map active entitlements to sports.
 *  3. Sync the RevenueCat result back to Firestore.
 *
 * Base is always granted when at least one sport is active.
 *
 * @returns {@link ProSportsState}
 */
export function useProSports(): ProSportsState {
  if (__DEV__) {
    return {
      subscription: DEV_SUBSCRIPTION,
      hasProBase: true,
      proSports: [...ALL_PRO_SPORTS],
      isProSport: () => true,
      loading: false,
      refresh: async () => {},
    };
  }
  return useProSportsProduction();
}

function useProSportsProduction(): ProSportsState {
  const { user, loading: authLoading } = useAuth();
  const [subscription, setSubscription] =
    useState<ZoneSubscription>(EMPTY_SUBSCRIPTION);
  const [loading, setLoading] = useState<boolean>(true);

  const resolve = useCallback(async (uid: string | null): Promise<void> => {
    if (!uid) {
      setSubscription(EMPTY_SUBSCRIPTION);
      setLoading(false);
      return;
    }
    setLoading(true);

    // 1. Firestore first — a promo code or synced subscription wins.
    try {
      const cached = await getSubscription(uid);
      if (isSubscriptionActive(cached)) {
        setSubscription(normalize(cached));
        setLoading(false);
        return;
      }
    } catch {
      // ignore cache failure and fall through to RevenueCat
    }

    // 2. Consult RevenueCat when Firestore did not grant access.
    let fromRC = EMPTY_SUBSCRIPTION;
    try {
      fromRC = await checkProStatus();
    } catch {
      fromRC = EMPTY_SUBSCRIPTION;
    }
    const resolved = normalize(fromRC);
    setSubscription(resolved);
    setLoading(false);

    // 3. Sync a positive result back so it persists offline.
    if (resolved.proSports.length > 0) {
      try {
        await saveSubscription(uid, resolved);
      } catch {
        // best-effort
      }
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

  return {
    subscription,
    hasProBase: subscription.hasProBase,
    proSports: subscription.proSports,
    isProSport: (sport: ProSport) => subscription.proSports.includes(sport),
    loading,
    refresh,
  };
}

/** Base is included whenever at least one sport is active. */
function normalize(sub: ZoneSubscription): ZoneSubscription {
  const hasProBase = sub.hasProBase || sub.proSports.length > 0;
  return { ...sub, hasProBase };
}

function isSubscriptionActive(sub: ZoneSubscription): boolean {
  if (sub.proSports.length === 0 && !sub.hasProBase) return false;
  if (!sub.expiresAt) return sub.proSports.length > 0 || sub.hasProBase;
  const exp = new Date(sub.expiresAt);
  if (Number.isNaN(exp.getTime())) return true;
  return exp.getTime() > Date.now();
}
