# SME (Business) Engine — Build Plan

**Status (2026-07-10): ALL STEPS DONE — business track is live end-to-end.**
Steps 1–3 built in `scripts/generate_mock_data.py` + `scripts/sme_engine.py`; Step 4 in
`scripts/advisor_engine.py` (`narrate_sme_readiness`, `narrate_sme_top_expenses`,
`answer_sme_question`); Step 5 in `server.py` (`/api/business/*`) with `USE_MOCK_BUSINESS =
false`. Verified: Aug-2026 gap detected, score 72/"شبه جاهزة", runway 2.4mo, live SME chat.
One deviation from the plan below: Prophet **seasonality is OFF** (the gap is created by the
deterministic scheduled-obligation overlay, so seasonality was unnecessary and far too slow —
~25s/fit → ~1s/fit). The sections below are kept as the original design record.
**Rule:** SMEs are **not** scored with a fixed DBR ratio. Eligibility is
cash-flow based: (a) positive net cash flow over the last 3+ months, (b) stable/increasing
revenue, (c) **no predicted negative cash-flow month in the next 6 months**.

The persona (`300000001`) is designed to PASS (a) and (b) but be AT RISK on (c): a bi-annual
supplier settlement (SAR 185,000) falls due Aug 2026, in the summer revenue trough, driving
the forecasted August net to ≈ −140,000. That single predicted negative month is the
"liquidity gap" the SME advisor exists to catch early.

---

## Step 1 — Synthetic persona (DONE)
`scripts/generate_mock_data.py` → writes:
- `data/processed/sme_monthly_clean.csv` — `accountNumber, ds, revenue, expenses, net_cashflow` (24 months, 2024-07 → 2026-06, all net-positive).
- `data/processed/sme_monthly_categorized.csv` — `accountNumber, ds, category, amount` (5 expense categories: salaries, suppliers, rent, operations, other).
- `data/processed/sme_scheduled_obligations.csv` — `accountNumber, ds, label, amount` (the Aug-2026 gap driver).
- `data/processed/sme_profile.json` — cash balance (for runway), sector, window.

Reproducible via `SME_RANDOM_SEED = 42`. Verified: last-3 net-positive ✓, all-24 net-positive ✓, revenue growing ✓, runway ≈ 2.4 months, projected Aug-2026 net ≈ −140k ✓.

---

## Step 2 — SME cash-flow forecast (`scripts/sme_engine.py`, Layer B1)
- Load `sme_monthly_clean.csv` for the account.
- Prophet-forecast **revenue** and **expenses** separately for the next 6 months (reuse the
  seeding convention from `forecast_engine.py`: `PROPHET_UNCERTAINTY_SEED`).
- **Overlay scheduled obligations**: for each row in `sme_scheduled_obligations.csv`, add its
  `amount` to the forecasted expenses of its `ds` month. This makes the gap a *deterministic,
  explainable* event, not a Prophet artifact.
- `forward_net[month] = forecast_revenue − (forecast_expenses + scheduled_obligation)`.
- Output: 6-month `forward` list + `negative_months` (the gap months) + `avg_monthly_expense`.

## Step 3 — SME readiness scorer (Layer B2, cash-flow based — NO DBR)
Compute the three criteria and a 0–100 score:
1. **Positive cash flow ≥3 months** — from history tail. pass/fail.
2. **Stable/increasing revenue** — Prophet trend slope > 0, or last-6 mean > prior-6 mean. pass/fail.
3. **No predicted negative month (next 6)** — from B1's `negative_months`. A single shallow,
   explainable gap = **watch**, not fail; multiple/deep negatives = fail.
- `score` = weighted blend (e.g. criteria 1 & 2 heavy, criterion 3 as the swing factor);
  `statusWord` from score bands ("جاهزة" / "شبه جاهزة" / "غير جاهزة").
- `runwayMonths = cash_balance_sar ÷ avg_monthly_expense`.
- `timing`: if a gap exists, verdict = apply *after* the gap month passes with a positive
  month (e.g. "الأفضل بعد شهرين"); the detail explains why (matches the existing mock story).

## Step 4 — SME advisor narration (Layer B3)
- Extend `advisor_engine.py` with `narrate_sme_readiness()` and an SME fixed-question set
  (timing / why-semi-ready / how-to-prepare / biggest-expenses), reusing the **same**
  `_validate_narration()` numeric-fidelity + script guard. Fallback to a verified backup
  (add SME entries to `demo_backup_narrations.json`).
- Improvement `paths` (businessPaths): template from real numbers — faster receivables
  collection (pull ~X forward), build a 3-month reserve, split the settlement across two
  months — each derived from the real gap size / settlement amount, not invented.

## Step 5 — Bridge + frontend flip
In `server.py`, add and back with the engine:
- `GET /api/business/overview` → `businessKpis` (netCashflow, revenue, expenses, runwayMonths,
  revenueGrowth), `revenueExpenseData` (last 6 months → `{month, income, spending}`),
  `expenseCategories` (donut; Arabic labels + palette colors).
- `GET /api/business/readiness` → `score, statusWord, criteria[], timing, paths[]`.
- `GET /api/business/transactions` → derive from `sme_monthly_categorized.csv` (as the
  individuals feed does).
- `POST /api/business/chat` → SME advisor fixed questions.

Then set `USE_MOCK_BUSINESS = false` in `frontend/src/lib/api.ts`. No business screen JSX
should need changing — they already read through the `api` layer.

**Arabic category labels needed** (bridge-side, mirror the individual map):
salaries→الرواتب, suppliers→الموردون, rent→الإيجار, operations→التشغيل واللوجستيات, other→أخرى.

---

## Honesty notes to carry forward (same discipline as the individual side)
- `businessReadiness.score` weighting is a **defined heuristic**, not a SAMA-published SME
  score (SAMA has no fixed SME ratio) — document the formula in code.
- The gap is a *designed* scheduled obligation, clearly sourced from
  `sme_scheduled_obligations.csv`; the forecast overlay is deterministic and explainable.
- All SME figures are synthetic (persona `300000001`), per the project's SME-data rule.
