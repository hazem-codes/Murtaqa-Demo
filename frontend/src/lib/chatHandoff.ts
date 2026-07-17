/* ============================================================================
   "Ask the Advisor" handoff store (Part 7).

   Any screen can stage a context-specific DRAFT question next to a sensitive figure
   (a SAMA ratio, a rate, a loan amount, a strategy step) via askAdvisor(draft). The
   app navigates to the Chat screen and pre-fills the composer with that draft — the
   user reviews/edits it and sends it themselves; nothing is auto-sent. This mirrors
   accountStore.ts's tiny-external-store pattern rather than threading a prop through
   every screen, since the handoff can originate from anywhere in the tree.
   ============================================================================ */

import { useSyncExternalStore } from "react";

interface Handoff {
  draft: string;
  /** Bumped on every call so two identical consecutive drafts still each trigger a fresh navigation. */
  seq: number;
}

let pending: Handoff | null = null;
let seqCounter = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Called by an "Ask the Advisor" button: stages a draft question and signals for navigation to chat. */
export function askAdvisor(draft: string) {
  pending = { draft, seq: ++seqCounter };
  emit();
}

/** App.tsx: observe the pending handoff (to navigate to "chat" whenever seq changes). */
export function useHandoffSeq(): number {
  return useSyncExternalStore(
    subscribe,
    () => pending?.seq ?? 0,
    () => 0
  );
}

/** Chat.tsx: read-and-clear the staged draft once (so revisiting chat later starts empty again). */
export function consumeDraft(): string | null {
  const draft = pending?.draft ?? null;
  pending = null;
  return draft;
}
