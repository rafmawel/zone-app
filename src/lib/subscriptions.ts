/**
 * RevenueCat subscription integration for Zone Pro.
 *
 * The native module is wrapped so it can be safely imported on every
 * platform (including web during type checks). All calls are no-ops
 * if the SDK fails to load.
 */

import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

const RC_API_KEY = 'rc_android_REPLACE_ME';
const PRO_ENTITLEMENT_ID = 'pro';

let initialized = false;
let initializing: Promise<void> | null = null;

export interface ProFeature {
  label: string;
  detail: string;
}

export const PRO_FEATURES: ProFeature[] = [
  {
    label: 'Forme · Fatigue · Fraîcheur',
    detail: 'Modèle Banister (1975) · Utilisé par les athlètes olympiques',
  },
  {
    label: 'Ratio charge/récupération (ACWR)',
    detail: 'Gabbett (2016) · Réduction prouvée de 50% des blessures',
  },
  {
    label: 'Autoregulation RIR intelligente',
    detail: 'Zourdos et al. (2016) · Progression +23% vs programme fixe',
  },
  {
    label: 'Tableau de Prilepin (haltérophilie)',
    detail: 'Recherche soviétique 1975 · Validée par 50 ans de résultats',
  },
  {
    label: 'MEV/MAV/MRV en temps réel',
    detail: 'Israetel et al. (2019) · Optimisation du volume musculaire',
  },
  {
    label: 'Prédictions de performance',
    detail: 'Modèle CTL/ATL/TSB · Projection sur 8-16 semaines',
  },
  {
    label: 'Risque blessure en temps réel',
    detail: 'ACWR + sommeil + fatigue · Alerte avant le problème',
  },
  {
    label: 'Coach Zone · Analyse hebdomadaire',
    detail: 'Synthèse de tous les indicateurs chaque lundi',
  },
];

export interface PurchaseResult {
  success: boolean;
  isPro: boolean;
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
 * Check whether the current user has an active Pro entitlement.
 *
 * @returns `true` if RevenueCat reports `pro` entitlement active.
 */
export async function checkProStatus(): Promise<boolean> {
  try {
    const info: CustomerInfo = await Purchases.getCustomerInfo();
    return typeof info.entitlements.active[PRO_ENTITLEMENT_ID] !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Fetch the current offering configured on the RevenueCat dashboard.
 *
 * @returns the current `PurchasesOffering`, or `null` if unavailable.
 */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch {
    return null;
  }
}

/**
 * Purchase the supplied package and return whether the user is Pro.
 *
 * @param pkg package the user selected on the paywall
 * @returns result object: `success`, `isPro`, optional `error` message
 */
export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<PurchaseResult> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPro =
      typeof customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== 'undefined';
    return { success: true, isPro };
  } catch (err: unknown) {
    const cancelled = isUserCancellationError(err);
    if (cancelled) {
      return { success: false, isPro: false };
    }
    return {
      success: false,
      isPro: false,
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
  try {
    const info = await Purchases.restorePurchases();
    const isPro =
      typeof info.entitlements.active[PRO_ENTITLEMENT_ID] !== 'undefined';
    return { success: true, isPro };
  } catch (err: unknown) {
    return { success: false, isPro: false, error: extractMessage(err) };
  }
}

/**
 * Open the platform-specific subscription management UI.
 *
 * @returns void
 */
export async function showManageSubscriptions(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    await Purchases.showManageSubscriptions();
  } catch {
    // best-effort, fail silently
  }
}

/**
 * Fetch the expiry date of the current Pro entitlement, if any.
 *
 * @returns ISO date string or null
 */
export async function getProExpiryDate(): Promise<string | null> {
  try {
    const info = await Purchases.getCustomerInfo();
    const ent = info.entitlements.active[PRO_ENTITLEMENT_ID];
    return ent?.expirationDate ?? null;
  } catch {
    return null;
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
