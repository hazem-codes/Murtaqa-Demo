# Frontend ↔ Backend Integration — Gap & Deficiency Report

**Date:** 2026-07-10
**Scope of this task:** Build the FastAPI bridge and wire the **individual-mode**
screens to the real Python engines. Business/SME left on mock by decision (no SME
engine exists yet). Counterfactual paths narrated dynamically by ALLaM with a
verified fallback (chosen approach).

---

## 1. What was built and verified

### New backend — `server.py` (FastAPI bridge, project root)
Runs the real engines behind four live endpoints:

| Endpoint | Engine(s) called | Demo identity |
|---|---|---|
| `GET /api/individuals/overview` | `forecast_engine` (Prophet) + categorized spend | account `101380713` |
| `GET /api/individuals/transactions` | categorized spend data | account `101380713` |
| `GET /api/individuals/eligibility` | `counterfactual_engine` (DiCE) + `advisor_engine` (ALLaM) | age-22 profile |
| `POST /api/individuals/chat` | `advisor_engine` fixed-question narration (ALLaM) | both identities |
| `GET /api/banks`, `GET /api/health` | static | — |

The age-22 profile is the exact persona baked into `demo_backup_narrations.json`, so
`counterfactual_engine`'s timeout fallback and the bridge's own narration fallback both
match it.

### Frontend wiring
- `vite.config.ts`: added `server.proxy` routing `/api` → `http://localhost:8000`.
- `lib/api.ts`: `USE_MOCK = false` (individuals live) and `USE_MOCK_BUSINESS = false`
  (business live — see §4); added `sendChatMessage` + `sendBusinessChatMessage`; extended
  `EligibilityResponse` with `eligible`, `advisorNarration`, `advisorSource`.
- `screens/Eligibility.tsx`: reads via `useApi(api.getEligibility)`, real loading/error
  states, data-driven hero copy (reflects the ineligible demo profile honestly), and a
  new card that displays the live ALLaM narration.
- `screens/Chat.tsx`: individual mode calls the live advisor; business mode keeps local
  replies.

### Verification performed
- `tsc --noEmit` (typecheck) — clean.
- `vite build` (production) — succeeds.
- All endpoints tested **through the Vite proxy** (the real browser path): overview,
  eligibility (returned `advisorSource: "live"`), and chat (observed all three source
  states — `live`, `fallback`, `canned`).
- **Not** verified: pixel-level browser rendering — no browser-automation tool was
  available in this environment. The full data path a browser uses is verified; the
  visual render should be eyeballed manually with both servers running.

---

## 2. Individual-mode: fields that are NOT pure engine output (proxies/derivations)

These render in the UI but no engine produces them. Each is computed transparently and
flagged here. **None are fabricated** — they are transforms of real values — but they are
not ground truth and should be treated as demo placeholders.

| Field (UI) | Source | Honesty note |
|---|---|---|
| `scores.personal` / `scores.mortgage` (eligibility gauge) | proxy `= (1 − dbr)·100`; mortgage = personal − 10 | **No SAMA-defined eligibility score exists.** The engine only outputs a binary `eligible_sama`. Mortgage has no real-estate model at all. |
| `currentAvailable` / path `targetAmount` (financing ceiling) | proxy: monthly headroom to the 45% cap × 60-month term, zero-interest | Uses only the real SAMA-rule constants, but **ignores interest/amortization** — a simplification. For the demo (dbr 0.69) `currentAvailable` = 0, which is honest (over-leveraged). |
| Path `title`, `summary`, `steps` | derived from the real `changed_features` (old→new, direction) | Real numbers, templated Arabic wording. |
| Path `difficulty`, `duration` | heuristic from the size of the obligation cut | Not engine output; a rule-of-thumb. |
| Path `pros`, `cons`, `timeline.advice` | templated from the real change | Truthful but generic, not model-generated per path. |
| `advisorNarration` | **live ALLaM**, one narration covering all 3 paths | Real Layer 3 output. `advisorSource` tells you `live` vs `fallback`. Note: it is **one blob for all paths**, not per-path text. |
| KPI `commitments`, `loans` | the age-22 **loan** profile | See §3.1 — different identity from income/spending. |
| KPI `savingsRate` | `(income − spending)/income` | Reads ~90%+ because the simulated salary isn't scaled to this account's small spend — see §3.2. |
| Transactions feed | real **monthly category aggregates** relabeled as rows | See §3.3 — no per-transaction data exists. |
| Metric "معدل الفائدة الحالي" | real `loan_int_rate` | Replaced the mock "السنوات الائتمانية" (credit years), which no engine produces. |

---

## 3. Individual-mode: data-model deficiencies worth fixing

### 3.1 No key links the transactions dataset to the loan dataset
`transactions_monthly_clean.csv` (accounts) and `loan_data_clean_SAR_balanced.csv`
(loan profiles) share **no common identifier**. So one "user" in the UI is stitched from
two unrelated synthetic identities: income/spending/categories from account `101380713`,
commitments/loans/DBR from the age-22 loan profile. Any per-user coherence (e.g. DBR that
matches the shown income and commitments) is impossible until the datasets are joined or
regenerated from one source.

### 3.2 Simulated salary is not scaled to real spend
`forecast_engine` assigns each account a simulated salary from a population mixture,
independent of that account's actual transaction magnitude. Account `101380713` drew
~20,166 SAR/mo but spends ~800–2,600 SAR/mo, so the savings rate looks unrealistically
high. Fixing this needs the salary simulation to correlate more tightly with per-account
spend, or a different demo account.

### 3.3 No per-transaction data with merchant names
The processed data is monthly-and-categorized only. The "recent transactions" list is
built from real monthly category totals (real amounts, real months, Arabic category
labels) but each row is an aggregate, not a single purchase. A true feed needs
`data/raw/transactions.csv` mined per account with merchant-name enrichment.

### 3.4 Counterfactual narration is one blob, and live/fallback varies per call
`advisor_engine.narrate_counterfactual()` returns a single narration for all paths, and
DiCE's random method (5s timeout, seeded) plus the strict validator mean a given call may
return `live` or `fallback`. Both are verified-safe; just expect variation between runs.

---

## 4. Business / SME mode: NOW LIVE (built 2026-07-10)

The business track is fully wired. `USE_MOCK_BUSINESS = false`; every business screen reads
from the bridge, backed by the new SME engine.

| Frontend contract | Backed by | Status |
|---|---|---|
| `getBusinessOverview` | `sme_engine` (forecast + readiness) + `sme_monthly_categorized.csv` | **LIVE** — real KPIs, 6-month revenue/expense series, expense donut, readiness block. |
| `getBusinessReadiness` | `sme_engine.assess_readiness()` | **LIVE** — score, statusWord, the 3 cash-flow criteria, timing verdict, improvement paths. |
| `getBusinessTransactions` | `sme_monthly_categorized.csv` | **LIVE** — monthly category aggregates (same caveat as individuals: not per-transaction). |
| Business chat | `advisor_engine.answer_sme_question()` (live ALLaM) | **LIVE** — 4 fixed SME questions → ALLaM, deterministic fallback, else canned. |

**How it works:** `scripts/generate_mock_data.py` writes the synthetic persona
(`300000001`) — 24 months of net-positive, growing history plus a scheduled Aug-2026 supplier
settlement. `scripts/sme_engine.py` Layer B1 Prophet-forecasts revenue and expenses (trend
only — seasonality off for speed; **the gap is created by deterministically overlaying the
scheduled settlement**, not by a learned dip) and flags any month whose forward net is
negative. Layer B2 turns history + forecast into the 3 SAMA-SME criteria (positive cash flow
≥3 months, stable/increasing revenue, no predicted negative month), a 0–100 score, a runway
(`cash ÷ avg monthly expense`), and a timing verdict. Verified: detects the Aug gap, scores
72/"شبه جاهزة", runway 2.4 months, reproducible.

**Remaining SME proxies/heuristics (flagged, same discipline as individuals):**
- `businessReadiness.score` weighting is a **defined heuristic** (35/25/40 across the three
  criteria), not a SAMA-published SME score — SAMA has no fixed SME ratio.
- `businessPaths` (improvement paths) are templated from real numbers (gap month, settlement
  amount, runway) — real figures, templated prose.
- Business transactions are monthly category aggregates, not individual purchases.

---

## 4b. Interactivity + conversational advisor (added 2026-07-11)

- **In-app track switcher** (`AppShell.tsx` + `App.tsx`): a top-nav toggle (الأفراد/الأعمال)
  swaps the active persona and lands on that track's dashboard, so users can reach the business
  screens without logging out.
- **Conversational free-text chat** (both tracks): `advisor_engine.narrate_free_text()` answers
  any typed question grounded in the customer's real numbers. `CHAT_SYSTEM_PROMPT` is a warmer
  persona that handles hypotheticals gracefully — it acknowledges the question and pivots to the
  real figures instead of echoing an unknown number. The **numeric-fidelity guard is unchanged**
  (not weakened); when it still rejects, a warm no-numbers qualitative reply replaces the old
  static canned line. So custom questions now feel live and on-topic while fabrication stays
  impossible.
- **SME details modal** (`BusinessEligibility.tsx`): pros/cons/timeline, matching the individuals
  modal. Pros/cons are derived from the path's real steps (keyword-based); the timeline is the
  real steps.
- **SME activation journey**: تفعيل المسار → confirmation modal → active dashboard, mirroring
  individuals. Three widgets, all driven by real gap numbers newly exposed on
  `/api/business/readiness` as a `gap` object (`cashBalance`, `settlementAmount`, `month`,
  `monthLabel`, `projectedNet`): (1) **Cashflow Tracker** (cash vs. the gap cost), (2) **live
  Countdown** to the gap month (clamps at zero), (3) **Gap-Mitigation checklist** built from the
  plan's real steps (interactive, UI-only state).

**Update (2026-07-12) — SME action plans are now AI-generated.** `GET /api/business/plans`
serves 3 plans generated by ALLaM (`generate_action_plans()`) as strict JSON. The model's text
is required **digit-free** (durations in words) by a JSON-aware validator, so no financial number
can be fabricated; the backend **injects the real numbers** into each plan's `effect` (settlement
185k / cash 412k / projected deficit). Fallback chain (`plansSource`): **prebaked** (demo persona,
served instantly from `demo_backup_narrations.json`) → **ai** (live, non-baked personas) →
**template** (the curated playbook). A global `_OLLAMA_LOCK` serializes all ALLaM calls so plan
generation and chat never fight over the single 7B model; the frontend shows **card skeletons**
while plans load. The **individuals** paths remain the templated playbook (real numbers +
templated prose) — this change is business-track only.

## 5. Frontend surfaces still on mock (beyond business)

Even in individual mode, these are not yet wired to live data:

- **Dashboard eligibility ring** — `Dashboard.tsx` still imports `eligibility.personal/mortgage`
  from `lib/data.ts` for its personal/mortgage score ring. Only the **Eligibility screen**
  consumes the live eligibility endpoint. The dashboard ring should be pointed at
  `getEligibility` for consistency.
- **`metricDetails` drill-down modals** (commitments breakdown, loans breakdown, business
  cashflow/runway) — fully mock; no endpoint backs the breakdown rows.
- **Profile screen** — reads `user`, `business`, `eligibility`, `businessReadiness` from mock.
- **Login / bank-connection flows** — mock; no real Open Banking or auth.
- **Eligibility "active plan" / progress tracking** — UI-only state; no persistence or
  backend notion of an activated plan.

---

## 6. How to run the wired system

```bash
# Terminal 1 — backend (needs Ollama running with iKhalid/ALLaM:7b)
python server.py                       # serves on http://localhost:8000

# Terminal 2 — frontend
cd frontend && npm install && npm run dev   # http://localhost:5173
```

The Vite dev server proxies `/api` to `:8000`. To revert to full offline mock, set
`USE_MOCK = true` in `frontend/src/lib/api.ts`.
