/**
 * RevenueCat subscription integration for the modular Zone Pro model.
 *
 * The native module is wrapped so it can be safely imported on every
 * platform (including web during type checks). All calls are no-ops
 * if the SDK fails to load.
 *
 * Zone Pro is split into a free-with-any-sport "Base" tier plus one
 * paid module per sport, and an all-inclusive bundle. Each maps to a
 * RevenueCat product and entitlement.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';
import {
  ALL_PRO_SPORTS,
  EMPTY_SUBSCRIPTION,
  type ProSport,
  type ZoneSubscription,
} from '@/types/subscription';

const RC_API_KEY = 'rc_android_REPLACE_ME';

/** RevenueCat product identifiers for each Zone Pro module. */
export const RC_PRODUCTS = {
  base: 'zone_pro_base', // included with all sports
  running: 'zone_pro_running',
  hyrox: 'zone_pro_hyrox',
  musculation: 'zone_pro_musculation',
  weightlifting: 'zone_pro_weightlifting',
  bundle: 'zone_pro_bundle',
} as const;

/** RevenueCat entitlement identifiers, mirroring the product IDs. */
export const RC_ENTITLEMENTS = {
  base: 'zone_pro_base',
  running: 'zone_pro_running',
  hyrox: 'zone_pro_hyrox',
  musculation: 'zone_pro_musculation',
  weightlifting: 'zone_pro_weightlifting',
  bundle: 'zone_pro_bundle',
} as const;

const SPORT_ENTITLEMENTS: Record<ProSport, string> = {
  running: RC_ENTITLEMENTS.running,
  hyrox: RC_ENTITLEMENTS.hyrox,
  musculation: RC_ENTITLEMENTS.musculation,
  weightlifting: RC_ENTITLEMENTS.weightlifting,
};

const isExpoGo = Constants.appOwnership === 'expo';
const shouldSkipRC = isExpoGo;

let initialized = false;
let initializing: Promise<void> | null = null;

export interface PurchaseResult {
  success: boolean;
  subscription: ZoneSubscription;
  error?: string;
}

/**
 * Initialise RevenueCat for the supplied Firebase user id.
 *
 * Safe to call multiple times. The first call configures the SDK and
 * logs the user in, subsequent calls are no-ops.
 *
 * @param userId Firebase auth UID
 */
export async function initializePurchases(userId: string): Promise<void> {
  if (shouldSkipRC) return;
  if (initialized) return;
  if (initializing) {
    return initializing;
  }
  initializing = (async () => {
    try {
      if (__DEV__) {
        await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      }
      Purchases.configure({ apiKey: RC_API_KEY, appUserID: userId });
      initialized = true;
    } catch {
      // SDK unavailable (e.g. emulator without store services).
      initialized = false;
    } finally {
      initializing = null;
    }
  })();
  return initializing;
}

/**
 * Translate active RevenueCat entitlements into a {@link ZoneSubscription}.
 *
 * The bundle entitlement unlocks every sport. Any sport entitlement (or
 * the bundle) unlocks Base automatically.
 *
 * @param info customer info from RevenueCat
 */
export function buildSubscriptionFromCustomerInfo(
  info: CustomerInfo,
): ZoneSubscription {
  const active = info.entitlements.active;
  const has = (id: string): boolean => typeof active[id] !== 'undefined';

  const hasBundle = has(RC_ENTITLEMENTS.bundle);
  const proSports: ProSport[] = hasBundle
    ? [...ALL_PRO_SPORTS]
    : ALL_PRO_SPORTS.filter((sport) => has(SPORT_ENTITLEMENTS[sport]));

  if (proSports.length === 0) {
    return EMPTY_SUBSCRIPTION;
  }

  // Earliest expiry across the active sport/bundle entitlements.
  let expiresAt: string | null = null;
  const relevant = hasBundle
    ? [RC_ENTITLEMENTS.bundle]
    : proSports.map((s) => SPORT_ENTITLEMENTS[s]);
  for (const id of relevant) {
    const exp = active[id]?.expirationDate ?? null;
    if (exp && (expiresAt === null || exp < expiresAt)) {
      expiresAt = exp;
    }
  }

  return {
    hasProBase: true,
    proSports,
    plan: hasBundle ? 'bundle' : 'sport',
    expiresAt,
    source: 'revenuecat',
  };
}

/**
 * Resolve the current user's modular Zone Pro subscription from RevenueCat.
 *
 * @returns a {@link ZoneSubscription}; empty if nothing is active.
 */
export async function checkProStatus(): Promise<ZoneSubscription> {
  if (shouldSkipRC) return EMPTY_SUBSCRIPTION;
  try {
    const info: CustomerInfo = await Purchases.getCustomerInfo();
    return buildSubscriptionFromCustomerInfo(info);
  } catch {
    return EMPTY_SUBSCRIPTION;
  }
}

/**
 * Fetch the current offering configured on the RevenueCat dashboard.
 *
 * @returns the current `PurchasesOffering`, or `null` if unavailable.
 */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (shouldSkipRC) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch {
    return null;
  }
}

/**
 * Find the package in an offering matching a Zone Pro product id.
 *
 * @param offering offering returned by {@link getCurrentOffering}
 * @param productId one of {@link RC_PRODUCTS}
 */
export function findPackage(
  offering: PurchasesOffering | null,
  productId: string,
): PurchasesPackage | null {
  if (!offering) return null;
  return (
    offering.availablePackages.find(
      (p) => p.product.identifier === productId,
    ) ?? null
  );
}

/**
 * Purchase the supplied package and return the resulting subscription.
 *
 * @param pkg package the user selected on the paywall
 * @returns result object: `success`, resolved `subscription`, optional `error`
 */
export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<PurchaseResult> {
  if (shouldSkipRC) {
    return {
      success: false,
      subscription: EMPTY_SUBSCRIPTION,
      error:
        "Les achats ne sont pas disponibles ici. Lance l'app depuis un build natif.",
    };
  }
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return {
      success: true,
      subscription: buildSubscriptionFromCustomerInfo(customerInfo),
    };
  } catch (err: unknown) {
    const cancelled = isUserCancellationError(err);
    if (cancelled) {
      return { success: false, subscription: EMPTY_SUBSCRIPTION };
    }
    return {
      success: false,
      subscription: EMPTY_SUBSCRIPTION,
      error: extractMessage(err),
    };
  }
}

/**
 * Restore prior purchases for the current user.
 *
 * @returns same shape as {@link purchasePackage}
 */
export async function restorePurchases(): Promise<PurchaseResult> {
  if (shouldSkipRC) {
    return { success: true, subscription: EMPTY_SUBSCRIPTION };
  }
  try {
    const info = await Purchases.restorePurchases();
    return {
      success: true,
      subscription: buildSubscriptionFromCustomerInfo(info),
    };
  } catch (err: unknown) {
    return {
      success: false,
      subscription: EMPTY_SUBSCRIPTION,
      error: extractMessage(err),
    };
  }
}

/**
 * Open the platform-specific subscription management UI.
 *
 * @returns void
 */
export async function showManageSubscriptions(): Promise<void> {
  if (shouldSkipRC) return;
  try {
    if (Platform.OS === 'web') return;
    await Purchases.showManageSubscriptions();
  } catch {
    // best-effort, fail silently
  }
}

interface RevenueCatError {
  userCancelled?: boolean;
  code?: string;
  message?: string;
}

function isUserCancellationError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as RevenueCatError;
  if (e.userCancelled === true) return true;
  if (e.code === '1') return true;
  return false;
}

function extractMessage(err: unknown): string {
  if (!err) return 'Erreur inconnue';
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    const e = err as RevenueCatError;
    if (e.message) return e.message;
  }
  return 'Erreur inconnue';
}
