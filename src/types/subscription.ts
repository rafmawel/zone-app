/**
 * Modular Zone Pro subscription model.
 *
 * Zone Pro is split into a free-with-any-sport "Base" tier plus one
 * paid module per sport. Subscribing to any single sport unlocks Base
 * automatically. The "bundle" plan unlocks Base and all four sports.
 */

export type ProSport = 'running' | 'hyrox' | 'musculation' | 'weightlifting';

export interface ZoneSubscription {
  hasProBase: boolean;
  proSports: ProSport[];
  plan: 'free' | 'sport' | 'bundle';
  expiresAt: string | null;
  source: 'revenuecat' | 'promo' | 'none';
}

export const EMPTY_SUBSCRIPTION: ZoneSubscription = {
  hasProBase: false,
  proSports: [],
  plan: 'free',
  expiresAt: null,
  source: 'none',
};

export const ALL_PRO_SPORTS: ProSport[] = [
  'running',
  'hyrox',
  'musculation',
  'weightlifting',
];

export const SPORT_LABELS: Record<ProSport, string> = {
  running: 'Course à pied',
  hyrox: 'Hyrox',
  musculation: 'Musculation',
  weightlifting: 'Haltérophilie',
};

export const SPORT_PRICES: Record<ProSport, string> = {
  running: '4,99€',
  hyrox: '4,99€',
  musculation: '4,99€',
  weightlifting: '4,99€',
};

/** Numeric monthly price of a single sport module, in euros. */
export const SPORT_PRICE_EUR = 4.99;

export const BUNDLE_PRICE = '12,99€';

/** Numeric monthly price of the all-inclusive bundle, in euros. */
export const BUNDLE_PRICE_EUR = 12.99;
