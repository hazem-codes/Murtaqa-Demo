/* ============================================================================
   Murtaqa — API layer (backend-integration boundary)

   Individual-mode calls now hit the live FastAPI bridge (server.py), which runs
   the real Python engines (forecast / counterfactual / ALLaM advisor).

   Business-mode calls still resolve from lib/data.ts mock: there is no SME engine
   in scripts/ yet, so those three endpoints (getBusinessOverview,
   getBusinessTransactions, getBusinessReadiness) are intentionally left on mock
   and gated by USE_MOCK_BUSINESS. See the deficiency report for what an SME
   backend would need to produce.
   ============================================================================ */

import {
  kpis,
  incomeSpendingData,
  spendingCategories,
  transactions,
  eligibility,
  eligibilityPaths,
  currentDbr,
  currentAvailable,
  businessKpis,
  revenueExpenseData,
  expenseCategories,
  businessTransactions,
  businessReadiness,
  businessPaths,
  banks,
  type EligibilityPath,
  type BusinessPath,
  type ReadinessCriterion,
} from "./data";
import {
  getAccount,
  type BusinessAccount,
  type IndividualAccount,
  type Track,
} from "./accountStore";

/** Individuals endpoints are live against the FastAPI bridge. */
export const USE_MOCK = false;
/** Business endpoints are now live too (SME engine + bridge, 2026-07-10). */
export const USE_MOCK_BUSINESS = false;
export const API_BASE = "/api";

/** Simulated network latency for mock mode (keeps loading states honest). */
const MOCK_LATENCY_MS = 450;

function mock<T>(payload: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(payload), MOCK_LATENCY_MS));
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Appends the currently-selected account for a track. Every data endpoint is
 * account-scoped, so the account browser can load any of the 1500 personas live.
 */
function withAccount(path: string, track: Track): string {
  return `${path}?account=${encodeURIComponent(getAccount(track))}`;
}

/* ── Response shapes (the contract the FastAPI bridge must fulfil) ────────── */

export interface SeriesPoint {
  month: string;
  income: number;
  spending: number;
}

export interface CategorySlice {
  name: string;
  value: number;
  amount: number;
  color: string;
}

export interface TransactionRow {
  id: number;
  name: string;
  category: string;
  amount: number;
  date: string;
  icon: string;
}

export interface IndividualsOverview {
  kpis: typeof kpis;
  series: SeriesPoint[];
  categories: CategorySlice[];
  /** Real obligation/loan components for the dashboard "لماذا هذا الرقم؟" modals (additive). */
  metricBreakdowns?: {
    commitments: { mortgage: number; otherLoans: number; cardMin: number; total: number };
    loans: { requested: number; rate: number | null; term: number };
  };
}

export interface BusinessOverview {
  kpis: typeof businessKpis;
  series: SeriesPoint[];
  categories: CategorySlice[];
  readiness: typeof businessReadiness;
}

/**
 * One of the three parallel SAMA tests (additive routing surface for the 7-strategy recommender).
 * `is_eligible` on the backend == all three passing == the ground-truth verdict (0 drift verified).
 * `binding: false` marks the 45% no-mortgage baseline, which is always dominated by Test 1's cap —
 * so the router must NOT treat it as an independent failure axis.
 */
export interface SamaTest {
  id: "salary_dbr" | "total_dbr_no_mortgage" | "total_dbr";
  label: string;
  /** The persona's ratio as a fraction (0–1). */
  calculatedRatio: number;
  /** The SAMA cap for this test as a fraction (0–1). */
  allowedLimit: number;
  passed: boolean;
  binding: boolean;
  numeratorSar: number;
  denominatorSar: number;
  /** SAR/month over the cap (0 if passed) — how much to shed to clear this test. */
  overageSar: number;
}

export interface EligibilityResponse {
  scores: { personal: number; mortgage: number };
  metrics: typeof eligibility.metrics;
  /** The 3-part SAMA test breakdown for strategy routing (additive; optional on rollback). */
  testResults?: SamaTest[];
  currentDbr: number;
  /** The SAMA total-obligations ratio (a different check against a different cap than DBR). */
  currentTotalRatio?: number;
  currentAvailable: number;
  /** Honest, deterministic explanation of the "max you can request today" ceiling tile. */
  availableExplanation?: string;
  paths: EligibilityPath[];
  /** True if this profile is already SAMA-eligible (no paths needed). */
  eligible: boolean;
  /**
   * False = the persona has NO active financing request (Open Banking can't see one). The screen
   * shows a forward-looking ceiling estimate + "قدم طلبك" CTA instead of the requester flow.
   * Defaults to true when the backend omits it (older payloads).
   */
  hasActiveRequest?: boolean;
  /** The conservative indicative rate used for a non-requester's forward ceiling estimate (%). */
  indicativeRate?: number;
  /** Layer 3 ALLaM narration of the counterfactual; null if not (yet) available. */
  advisorNarration: string | null;
  /**
   * Where the narration came from. "pending" means this is a non-demo account whose narration
   * is generated lazily by getAdvisorNarration() — the screen renders its numbers immediately
   * rather than blocking ~30-60s on the LLM.
   */
  advisorSource: "live" | "prebaked" | "fallback" | "pending" | "deterministic";
  /** FinTech-simulator disclaimer (What-If + super-strategies). */
  disclaimer?: string;
  /** Raw SAR figures for the DBR/obligations tooltips (Jargon Translator). */
  grossSalary?: number;
  salaryCapSar?: number;
  totalCapSar?: number;
  salaryObligationsSar?: number;
  totalObligationsSar?: number;
  /** Part 5 — the REAL, on-record requested amount (only present for requesters). */
  requestedAmount?: number;
  /** True when this payload's ratios reflect a demo-only override, not the real requested amount. */
  requestedAmountOverridden?: boolean;
  /** Part 6 — real, dataset-derived illustrative rate range (10th-90th percentile), not invented. */
  rateRangeLowPct?: number;
  rateRangeHighPct?: number;
  /** Persistent honest note: rates vary daily by bank; not a live/authoritative feed yet. */
  rateMarketNote?: string;
  /**
   * Part 8 — the requested loan's computed MONTHLY INSTALLMENT (amount+term+rate), which is what
   * actually enters the T1/T2/T3 ratio numerators — never the raw requested amount.
   */
  newLoanInstallmentSar?: number;
}

/** Financing type for the standalone What-If Simulator (Part 4). */
export type WhatIfFinancingType = "personal" | "mortgage" | "commercial";

/**
 * Response of the standalone What-If Simulator — entirely separate from EligibilityResponse /
 * the live account's real data. Every field is computed from a HYPOTHETICAL requested amount/
 * term/type layered on the persona's real income + existing obligations (same pattern as the
 * eligibility screen's extra_liability What-If). `simulation: true` and `simulationLabel` exist
 * so the UI can never present this as the customer's real eligibility result.
 */
export interface WhatIfSimulationResponse {
  simulation: true;
  simulationLabel: string;
  inputs: {
    amount: number;
    termYears: number;
    financingType: WhatIfFinancingType;
    /** True if the requested term was clamped to SAMA's 60-month cap (real estate is exempt). */
    termClampedTo60Months: boolean;
    assumedRatePct: number;
  };
  /** Set only for financing_type "commercial" — honest note that no distinct SAMA rule exists. */
  financingTypeNote: string | null;
  scores: { personal: number };
  metrics: typeof eligibility.metrics;
  currentDbr: number;
  currentTotalRatio: number;
  currentAvailable: number;
  eligible: boolean;
  testResults: SamaTest[];
  strategiesActivated: boolean;
  strategiesNote: string | null;
  paths: EligibilityPath[];
  disclaimer: string;
  /** Part 6 — real, dataset-derived illustrative rate range (10th-90th percentile), not invented. */
  rateRangeLowPct: number;
  rateRangeHighPct: number;
  rateMarketNote: string;
  /** Part 8 — the hypothetical loan's computed monthly installment (not the raw amount). */
  newLoanInstallmentSar: number;
}

export interface AdvisorNarrationResponse {
  narration: string | null;
  source: "live" | "prebaked" | "fallback";
}

export interface ChatResponse {
  text: string;
  /** "live" = ALLaM now, "fallback" = verified backup, "canned" = static default. */
  source: "live" | "fallback" | "canned";
}

export interface GapInfo {
  /** Gap month as "YYYY-MM", or null if no gap predicted. */
  month: string | null;
  /** Arabic month name (e.g. "أغسطس"), or null. */
  monthLabel: string | null;
  /** The scheduled supplier settlement driving the gap (SAR). */
  settlementAmount: number;
  /** Current cash on hand (SAR). */
  cashBalance: number;
  /** Forecasted net cash flow for the gap month (negative SAR). */
  projectedNet: number;
}

export interface BusinessReadinessResponse {
  score: number;
  statusWord: string;
  criteria: ReadinessCriterion[];
  timing: { verdict: string; detail: string };
  /** Real gap numbers for the SME active-plan widgets. */
  gap: GapInfo;
}

export interface BusinessPlansResponse {
  plans: BusinessPath[];
  /** Where the plans came from: live ALLaM, pre-baked AI backup, or templated playbook. */
  plansSource: "ai" | "prebaked" | "template";
}

export interface BankOption {
  id: string;
  name: string;
  featured: boolean;
}

/** One frozen step of an activated roadmap (individuals carry the rich fields, SME a label). */
export interface RoadmapProgressStep {
  step_number: number;
  title?: string;
  description?: string;
  expected_outcome?: string;
  label?: string;
}

/**
 * A persisted roadmap: which plan an account activated and which steps are done. Survives server
 * restart and page reload (Part 3), so the journey is real state, not React-only memory.
 */
export interface RoadmapProgress {
  track: "individuals" | "business";
  account: string;
  plan: { id: number | null; title: string; steps: RoadmapProgressStep[] };
  completedSteps: number[];
  totalSteps: number;
  completedCount: number;
  percent: number;
  activatedAt: string;
  updatedAt: string;
}

export interface RoadmapProgressResponse {
  progress: RoadmapProgress | null;
}

/** AI Savings Advisor — deterministic breakdown under one strategy (all numbers computed in Python). */
export interface SavingsBuckets {
  needs: number;
  wants: number;
  savings: number;
}

export interface SavingsStrategyMeta {
  key: string;
  name: string;
  tagline: string;
  pct: SavingsBuckets;
}

export interface SavingsPlanResponse {
  income: number;
  obligations: number;
  disposableAfterObligations: number;
  essentialSpend: number;
  discretionarySpend: number;
  /** What is actually left over each month after real needs + wants (can be negative). */
  netCashFlow: number;
  strategy: SavingsStrategyMeta;
  targets: SavingsBuckets;
  actuals: SavingsBuckets;
  topDiscretionary: { name: string; amount: number }[];
}

/** One strategy in the library (ratios sum to 1.0) — powers the override dropdown + client-side recompute. */
export interface SavingsStrategy {
  key: string;
  name: string;
  tagline: string;
  ratios: SavingsBuckets;
}

export interface SavingsGoal {
  key: string;
  label: string;
  fallback: string;
}

export interface SavingsStrategiesResponse {
  strategies: SavingsStrategy[];
  goals: SavingsGoal[];
  defaultStrategy: string;
}

export interface SavingsAdviceResponse {
  /** The strategy the AI picked for the goal. */
  strategyKey: string;
  strategyName: string;
  advice: string;
  /** "prebaked" = demo persona's baked narration; "live" = ALLaM now; "fallback" = deterministic. */
  source: "prebaked" | "live" | "fallback";
}

/* ── API surface ──────────────────────────────────────────────────────────── */

export const api = {
  /** Banks offered on the Open Banking connect step (sponsor bank first). */
  getBanks(): Promise<BankOption[]> {
    if (USE_MOCK) return mock(banks);
    return get<BankOption[]>("/banks");
  },

  /* ── Account browser: every persona in both pools ───────────────────────── */

  /** All 1000 individual personas, with identifying labels for the browser. */
  getIndividualAccounts(): Promise<{ accounts: IndividualAccount[]; demoAccount: string }> {
    return get("/individuals/accounts");
  },

  /** All 500 SME personas, with identifying labels for the browser. */
  getBusinessAccounts(): Promise<{ accounts: BusinessAccount[]; demoAccount: string }> {
    return get("/business/accounts");
  },

  /** Individuals dashboard/analysis payload (Layer 1 output + KPIs). */
  getIndividualsOverview(): Promise<IndividualsOverview> {
    if (USE_MOCK)
      return mock({ kpis, series: incomeSpendingData, categories: spendingCategories });
    return get<IndividualsOverview>(withAccount("/individuals/overview", "individuals"));
  },

  /** Individuals transactions feed. */
  getTransactions(): Promise<TransactionRow[]> {
    if (USE_MOCK) return mock([...transactions]);
    return get<TransactionRow[]>(withAccount("/individuals/transactions", "individuals"));
  },

  /**
   * Individuals eligibility + the 3 synthesized super-strategies (Layer 2).
   * `extraLiability` > 0 runs the What-If: the backend adds that hypothetical monthly liability,
   * recomputes the SAMA ratios + overageSar, and re-selects the 3 most relevant super-strategies.
   * `overrideRequestedAmount` > 0 (Part 5) is a demo-only override of the requested loan amount —
   * recomputes the same way, but the payload still reports the real amount separately
   * (`requestedAmount`) plus `requestedAmountOverridden` so the UI never confuses the two.
   */
  getEligibility(extraLiability = 0, overrideRequestedAmount = 0): Promise<EligibilityResponse> {
    if (USE_MOCK)
      return mock({
        scores: { personal: eligibility.personal, mortgage: eligibility.mortgage },
        metrics: eligibility.metrics,
        currentDbr,
        currentAvailable,
        paths: eligibilityPaths,
        eligible: false,
        advisorNarration: null,
        advisorSource: "fallback" as const,
      });
    let url = withAccount("/individuals/eligibility", "individuals");
    if (extraLiability > 0) url += `&extra_liability=${encodeURIComponent(extraLiability)}`;
    if (overrideRequestedAmount > 0)
      url += `&override_requested_amount=${encodeURIComponent(overrideRequestedAmount)}`;
    return get<EligibilityResponse>(url);
  },

  /**
   * Standalone What-If Simulator (Part 4) — a hypothetical amount/term/financing-type calculator,
   * separate from the live eligibility screen. `activateStrategies` runs the same 3 super-strategy
   * engine (Aggressive/Targeted/Balanced) against the hypothetical scenario instead of the real
   * requested loan.
   */
  getWhatIfSimulation(
    amount: number,
    termYears: number,
    financingType: WhatIfFinancingType,
    activateStrategies: boolean
  ): Promise<WhatIfSimulationResponse> {
    const base = withAccount("/individuals/whatif-simulator", "individuals");
    const params = new URLSearchParams({
      amount: String(amount),
      term_years: String(termYears),
      financing_type: financingType,
      activate_strategies: String(activateStrategies),
    });
    return get<WhatIfSimulationResponse>(`${base}&${params.toString()}`);
  },

  /**
   * The ALLaM counterfactual narration for the selected account, fetched separately so the
   * eligibility screen can render its (instant) numbers first. Pre-baked for the demo persona;
   * a live ~30-60s generation for any other browsed account.
   */
  getAdvisorNarration(): Promise<AdvisorNarrationResponse> {
    return get<AdvisorNarrationResponse>(withAccount("/individuals/advisor", "individuals"));
  },

  /** Individuals advisor chat — routes the message to the live ALLaM advisor. */
  sendChatMessage(question: string): Promise<ChatResponse> {
    return post<ChatResponse>("/individuals/chat", {
      question,
      account: getAccount("individuals"),
    });
  },

  /** Business advisor chat — routes to the live SME advisor (readiness/gap/expenses). */
  sendBusinessChatMessage(question: string): Promise<ChatResponse> {
    return post<ChatResponse>("/business/chat", {
      question,
      account: getAccount("business"),
    });
  },

  /* ── Business endpoints — now live (SME engine + bridge) ──────────────────── */

  /** Business dashboard payload (cash-flow forecast + readiness). */
  getBusinessOverview(): Promise<BusinessOverview> {
    if (USE_MOCK_BUSINESS)
      return mock({
        kpis: businessKpis,
        series: revenueExpenseData,
        categories: expenseCategories,
        readiness: businessReadiness,
      });
    return get<BusinessOverview>(withAccount("/business/overview", "business"));
  },

  /** Business transactions feed. */
  getBusinessTransactions(): Promise<TransactionRow[]> {
    if (USE_MOCK_BUSINESS) return mock([...businessTransactions]);
    return get<TransactionRow[]>(withAccount("/business/transactions", "business"));
  },

  /** Business financing readiness (score, criteria, timing, gap numbers). */
  getBusinessReadiness(): Promise<BusinessReadinessResponse> {
    if (USE_MOCK_BUSINESS)
      return mock({
        ...businessReadiness,
        gap: {
          month: "2026-08",
          monthLabel: "أغسطس",
          settlementAmount: 185000,
          cashBalance: 412000,
          projectedNet: -140000,
        },
      });
    return get<BusinessReadinessResponse>(withAccount("/business/readiness", "business"));
  },

  /** Business action plans (AI-generated, with pre-baked/templated fallback). */
  getBusinessPlans(): Promise<BusinessPlansResponse> {
    if (USE_MOCK_BUSINESS) return mock({ plans: businessPaths, plansSource: "template" as const });
    return get<BusinessPlansResponse>(withAccount("/business/plans", "business"));
  },

  /* ── Roadmap progress (Part 3) — persisted per account, per track ─────────── */

  /** The selected individual's active roadmap + step completion (null if none active). */
  getIndividualsRoadmap(): Promise<RoadmapProgressResponse> {
    return get<RoadmapProgressResponse>(withAccount("/individuals/roadmap", "individuals"));
  },
  /** Freezes the chosen individuals path as the active roadmap (resets completion). */
  activateIndividualsRoadmap(planId: number): Promise<RoadmapProgressResponse> {
    return post("/individuals/roadmap/activate", { account: getAccount("individuals"), planId });
  },
  /** Marks one individuals roadmap step complete/incomplete and persists it. */
  setIndividualsRoadmapStep(stepNumber: number, done: boolean): Promise<RoadmapProgressResponse> {
    return post("/individuals/roadmap/step", { account: getAccount("individuals"), stepNumber, done });
  },
  /** De-activates the individual's roadmap (clears the persisted plan). */
  clearIndividualsRoadmap(): Promise<RoadmapProgressResponse> {
    return post("/individuals/roadmap/clear", { account: getAccount("individuals") });
  },

  /** The selected business's active roadmap + step completion (null if none active). */
  getBusinessRoadmap(): Promise<RoadmapProgressResponse> {
    return get<RoadmapProgressResponse>(withAccount("/business/roadmap", "business"));
  },
  /** Freezes the chosen SME plan as the active roadmap (resets completion). */
  activateBusinessRoadmap(planId: number): Promise<RoadmapProgressResponse> {
    return post("/business/roadmap/activate", { account: getAccount("business"), planId });
  },
  /** Marks one SME roadmap step complete/incomplete and persists it. */
  setBusinessRoadmapStep(stepNumber: number, done: boolean): Promise<RoadmapProgressResponse> {
    return post("/business/roadmap/step", { account: getAccount("business"), stepNumber, done });
  },
  /** De-activates the business roadmap (clears the persisted plan). */
  clearBusinessRoadmap(): Promise<RoadmapProgressResponse> {
    return post("/business/roadmap/clear", { account: getAccount("business") });
  },

  /* ── AI Savings Advisor (individuals) ─────────────────────────────────────── */

  /** The strategy library + goal chips (for the override dropdown + client-side card recompute). */
  getSavingsStrategies(): Promise<SavingsStrategiesResponse> {
    return get<SavingsStrategiesResponse>("/individuals/savings-strategies");
  },
  /** Deterministic breakdown for one strategy (instant, no LLM). Defaults to balanced 50/30/20. */
  getSavingsPlan(strategy?: string): Promise<SavingsPlanResponse> {
    const base = withAccount("/individuals/savings-plan", "individuals");
    return get<SavingsPlanResponse>(strategy ? `${base}&strategy=${encodeURIComponent(strategy)}` : base);
  },
  /** AI picks the best strategy for the goal + narrates it — fetched on the CTA. */
  getSavingsAdvice(goal: string): Promise<SavingsAdviceResponse> {
    return post<SavingsAdviceResponse>("/individuals/savings-advice", {
      account: getAccount("individuals"),
      goal,
    });
  },
};
