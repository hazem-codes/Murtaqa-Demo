/* ============================================================================
   Selected-account store (QA / account-browser support).

   The backend serves ANY of the 1000 individuals / 500 SMEs via ?account=<n>.
   This holds which one the UI is currently looking at, one per track, so the
   two tracks can be browsed independently.

   Deliberately a tiny external store rather than React context: the api layer
   (lib/api.ts) is a plain module and reads the current account synchronously
   when it builds a request URL, while screens subscribe via useSelectedAccount()
   and re-fetch through useApi's dependency array when it changes.
   ============================================================================ */

import { useSyncExternalStore } from "react";

export type Track = "individuals" | "business";

/** Defaults are the demo personas — the only two with pre-baked ALLaM content. */
const DEFAULTS: Record<Track, string> = {
  individuals: "100000009",
  business: "300000001",
};

let selected: Record<Track, string> = { ...DEFAULTS };
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Read synchronously — used by the api layer when building a request URL. */
export function getAccount(track: Track): string {
  return selected[track];
}

export function setAccount(track: Track, accountNumber: string) {
  if (selected[track] === accountNumber) return;
  selected = { ...selected, [track]: accountNumber };
  emit();
}

export function isDemoAccount(track: Track, accountNumber: string): boolean {
  return DEFAULTS[track] === accountNumber;
}

/** Subscribe a component to the currently-selected account for one track. */
export function useSelectedAccount(track: Track): string {
  return useSyncExternalStore(
    subscribe,
    () => selected[track],
    () => DEFAULTS[track]
  );
}

/* ── The browsable account lists (shape mirrors the API) ───────────────────── */

export interface IndividualAccount {
  accountNumber: string;
  age: number;
  employmentType: string;
  incomeBracket: number;
  housingStatus: string;
  grossSalary: number;
  salaryDbr: number;
  eligible: boolean;
  /** False = no financing application on record (non-requester cohort). */
  hasActiveRequest?: boolean;
}

export interface BusinessAccount {
  accountNumber: string;
  sizeTier: string;
  sector: string;
  employees: number;
  annualRevenue: number;
  healthArchetype: string;
  cashflowPositive3m: boolean;
  revenueGrowing: boolean;
}
