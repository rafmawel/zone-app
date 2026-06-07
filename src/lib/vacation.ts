/**
 * Vacation mode logic.
 *
 * Freezes week progression during an athlete's planned absence, and
 * applies a deconditioning factor to the first sessions back.
 * Scientific basis (Mujika and Padilla 2000): two weeks of detraining
 * cause 4 to 14 percent VO2max loss and roughly 8 percent strength
 * loss; four weeks trigger measurable muscle atrophy; two to three
 * weeks of re-training are usually enough to return to baseline.
 */

import {
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  clearVacationState,
  getVacationState,
  setVacationState,
  type VacationState,
} from './firestore';
import type { ProSport } from './weekProgression';

export type DeconditioningSeverity =
  | 'none'
  | 'minimal'
  | 'moderate'
  | 'significant'
  | 'restart';

export interface DeconditioningPlan {
  severity: DeconditioningSeverity;
  /** Multiplier in [0,1] applied to intensity on the first session back. */
  intensityFactor: number;
  /** Suggested duration (in weeks) of the ramp-back phase. */
  rampWeeks: number;
  /** True when the engine should suggest restarting at block 1. */
  recommendRestart: boolean;
  /** Athlete-facing message describing how to resume. */
  message: string;
  /** Days the athlete was away (rounded). */
  awayDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysUntilReturn(state: VacationState | null, now: Date = new Date()): number {
  if (!state?.active || !state.returnDate) return 0;
  const target = state.returnDate.toDate();
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / DAY_MS));
}

export function isOnVacation(state: VacationState | null, now: Date = new Date()): boolean {
  if (!state?.active || !state.returnDate) return false;
  return state.returnDate.toDate().getTime() > now.getTime();
}

export function hasReturnedFromVacation(
  state: VacationState | null,
  now: Date = new Date(),
): boolean {
  if (!state?.active || !state.returnDate) return false;
  return state.returnDate.toDate().getTime() <= now.getTime();
}

/**
 * Build a deconditioning plan from an absence of `awayDays`. The
 * caller is responsible for actually applying the intensity factor to
 * upcoming sessions.
 */
export function buildDeconditioningPlan(awayDays: number): DeconditioningPlan {
  const days = Math.max(0, Math.round(awayDays));

  if (days <= 4) {
    return {
      severity: 'none',
      intensityFactor: 1,
      rampWeeks: 0,
      recommendRestart: false,
      message: 'Pas de désentraînement. Tu peux reprendre normalement.',
      awayDays: days,
    };
  }
  if (days <= 10) {
    return {
      severity: 'minimal',
      intensityFactor: 0.9,
      rampWeeks: 1,
      recommendRestart: false,
      message:
        "1 semaine d'absence. Tu peux reprendre normalement avec une légère réduction (-10 %) sur la première séance.",
      awayDays: days,
    };
  }
  if (days <= 17) {
    return {
      severity: 'moderate',
      intensityFactor: 0.8,
      rampWeeks: 1,
      recommendRestart: false,
      message:
        "2 semaines d'absence. Reprends à 80 % de ton intensité habituelle cette semaine.",
      awayDays: days,
    };
  }
  if (days <= 27) {
    return {
      severity: 'significant',
      intensityFactor: 0.7,
      rampWeeks: 2,
      recommendRestart: false,
      message:
        "3 semaines ou plus d'absence. Ton programme repart de 70 % pour éviter les blessures. Tu retrouveras ton niveau en 2 à 3 semaines.",
      awayDays: days,
    };
  }
  return {
    severity: 'restart',
    intensityFactor: 0.65,
    rampWeeks: 3,
    recommendRestart: true,
    message:
      "4 semaines ou plus d'absence. On te recommande de reprendre depuis le début du Bloc 1 pour éviter tout risque de blessure.",
    awayDays: days,
  };
}

export async function startVacation(
  uid: string,
  durationDays: number,
  start: Date = new Date(),
): Promise<VacationState> {
  const safeDays = Math.max(1, Math.min(180, Math.round(durationDays)));
  const startTs = Timestamp.fromDate(start);
  const returnTs = Timestamp.fromDate(
    new Date(start.getTime() + safeDays * DAY_MS),
  );
  const state: VacationState = {
    active: true,
    startDate: startTs,
    returnDate: returnTs,
    durationDays: safeDays,
  };
  await setVacationState(uid, state);
  return state;
}

export async function cancelVacation(uid: string): Promise<void> {
  await clearVacationState(uid);
}

/**
 * Persist the deconditioning factor on the programme_queue document
 * so session generators can read it back without an extra collection
 * fetch. The factor is stored per-sport plus an `until` ISO date so we
 * can fade it back to 1.0 once the ramp window has passed.
 */
export async function persistDeconditioning(
  uid: string,
  plan: DeconditioningPlan,
  sports: ProSport[],
): Promise<void> {
  if (plan.intensityFactor >= 1) return;
  const until = new Date(Date.now() + plan.rampWeeks * 7 * DAY_MS);
  const payload: Record<string, unknown> = {
    decond_factor: plan.intensityFactor,
    decond_severity: plan.severity,
    decond_until: Timestamp.fromDate(until),
    decond_updated_at: serverTimestamp(),
  };
  for (const sport of sports) {
    payload[`${sport}_decond_factor`] = plan.intensityFactor;
    payload[`${sport}_decond_until`] = Timestamp.fromDate(until);
  }
  await setDoc(
    doc(db, 'users', uid, 'state', 'programme_queue'),
    payload,
    { merge: true },
  );
}

export interface AcknowledgeVacationInput {
  uid: string;
  state: VacationState;
  sports: ProSport[];
}

/**
 * Called when the user taps through the "Bon retour" modal: clears
 * the vacation flag, persists the deconditioning plan, and returns
 * the plan so the caller can show next-step UI.
 */
export async function acknowledgeReturn(
  inputs: AcknowledgeVacationInput,
): Promise<DeconditioningPlan> {
  const plan = buildDeconditioningPlan(inputs.state.durationDays);
  await persistDeconditioning(inputs.uid, plan, inputs.sports);
  await cancelVacation(inputs.uid);
  return plan;
}

/**
 * Live reactive helper for screens that need to know vacation state
 * without subscribing themselves.
 */
export async function readVacation(uid: string): Promise<VacationState | null> {
  return getVacationState(uid);
}
