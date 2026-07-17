"""SME persona mock-data generator (Layer: business/SME track, Step 1).

Generates a fully synthetic SME ("small/medium enterprise") persona for the business
side of Murtaqa. Per the project rules, SMEs are NOT scored with a fixed DBR ratio — eligibility
is cash-flow based: positive net cash flow over the last 3+ months, stable/increasing
revenue, and no predicted negative cash-flow month in the next 6 months.

This persona is deliberately designed so that the first two criteria PASS but the third is
AT RISK: the business is healthy today (24 months of positive, growing net cash flow) yet a
known, lumpy supplier settlement falls due in August 2026 — right in the seasonal summer
revenue trough — which tips the *forecasted* August net negative. That single predicted
negative month is "the liquidity gap", the story the SME advisor exists to catch early.

Design choices (all synthetic, all reproducible via SME_RANDOM_SEED):
  - Revenue: a growing trend + a fixed 12-month seasonal shape (spring/year-end peaks,
    summer trough) + mild noise. Every *historical* month stays net-positive.
  - Expenses: 5 categories (salaries, suppliers, rent, operations, other). Suppliers
    scale with revenue; the rest are near-flat with mild noise.
  - The gap driver is NOT left to chance in the forecast: it is an explicit scheduled
    obligation (a bi-annual supplier settlement) written to its own file, so the SME
    engine can overlay it deterministically on the 6-month forward forecast. This keeps
    the gap a *designed, explainable* event rather than a random artifact of Prophet.

Outputs (all under data/processed/, self-contained):
  - sme_monthly_clean.csv        accountNumber, ds, revenue, expenses, net_cashflow
  - sme_monthly_categorized.csv  accountNumber, ds, category, amount   (expense breakdown)
  - sme_scheduled_obligations.csv accountNumber, ds, label, amount     (future lumpy outflows)
  - sme_profile.json             scalar profile (cash balance, sector, window) for runway
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_PROCESSED = ROOT_DIR / "data" / "processed"

SME_MONTHLY_CLEAN_CSV = DATA_PROCESSED / "sme_monthly_clean.csv"
SME_MONTHLY_CATEGORIZED_CSV = DATA_PROCESSED / "sme_monthly_categorized.csv"
SME_SCHEDULED_OBLIGATIONS_CSV = DATA_PROCESSED / "sme_scheduled_obligations.csv"
SME_PROFILE_JSON = DATA_PROCESSED / "sme_profile.json"

SME_ACCOUNT = "300000001"
SME_SECTOR = "retail_trade"
SME_RANDOM_SEED = 42

# 24 months of history ending at the last complete month before "today" (2026-07),
# so the 6-month forward window (Jul–Dec 2026) contains the Aug-2026 gap.
HISTORY_START = "2024-07"
HISTORY_MONTHS = 24

# Revenue model (SAR): growing trend × 12-month seasonal shape × mild noise.
REVENUE_BASE_SAR = 205_000.0
REVENUE_MONTHLY_GROWTH = 0.008  # ~0.8% month-over-month underlying trend.
REVENUE_NOISE_SD = 0.03         # 3% multiplicative noise.
# Seasonal multipliers by calendar month (1=Jan … 12=Dec): spring + year-end peaks,
# a pronounced summer trough (Jul/Aug) that sets up the liquidity gap.
REVENUE_SEASONALITY = {
    1: 1.02, 2: 0.98, 3: 1.05, 4: 1.06, 5: 1.08, 6: 0.95,
    7: 0.90, 8: 0.88, 9: 1.00, 10: 1.05, 11: 1.10, 12: 1.12,
}

# Expense model (SAR).
SALARY_BASE_SAR = 66_000.0
SALARY_MONTHLY_GROWTH = 0.004
SUPPLIERS_REVENUE_SHARE = 0.20   # suppliers scale with revenue.
RENT_SAR = 23_000.0
OPERATIONS_BASE_SAR = 15_000.0
OTHER_BASE_SAR = 9_000.0
EXPENSE_NOISE_SD = 0.04
EXPENSE_CATEGORIES = ["salaries", "suppliers", "rent", "operations", "other"]

# The deliberate gap: a bi-annual supplier settlement. The future one (Aug 2026) is the
# gap driver. A softened past instance (Feb 2026) is folded into history so the pattern is
# visible, but kept small enough that the business absorbed it WITHOUT a negative month —
# preserving the "positive cash flow for 6+ consecutive months" story.
SUPPLIER_SETTLEMENT_SAR = 185_000.0
PAST_SETTLEMENT_SAR = 45_000.0
FUTURE_SETTLEMENT_MONTH = "2026-08"
PAST_SETTLEMENT_MONTH = "2026-02"

# Liquidity on hand — used by the SME engine to compute runway (cash ÷ avg monthly expense).
SME_CASH_BALANCE_SAR = 412_000.0


def _month_range(start: str, count: int) -> list[pd.Timestamp]:
    return list(pd.date_range(start=start, periods=count, freq="MS"))


def _generate_frames() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Builds the monthly clean frame and the per-category expense frame."""
    rng = np.random.default_rng(SME_RANDOM_SEED)
    months = _month_range(HISTORY_START, HISTORY_MONTHS)

    clean_rows: list[dict] = []
    category_rows: list[dict] = []

    for i, month in enumerate(months):
        seasonal = REVENUE_SEASONALITY[month.month]
        trend = REVENUE_BASE_SAR * (1.0 + REVENUE_MONTHLY_GROWTH) ** i
        revenue = trend * seasonal * (1.0 + rng.normal(0.0, REVENUE_NOISE_SD))

        salaries = SALARY_BASE_SAR * (1.0 + SALARY_MONTHLY_GROWTH) ** i
        suppliers = revenue * SUPPLIERS_REVENUE_SHARE * (1.0 + rng.normal(0.0, EXPENSE_NOISE_SD))
        rent = RENT_SAR
        operations = OPERATIONS_BASE_SAR * (1.0 + rng.normal(0.0, EXPENSE_NOISE_SD))
        other = OTHER_BASE_SAR * (1.0 + rng.normal(0.0, EXPENSE_NOISE_SD))

        # Fold the past bi-annual settlement into history (visible pattern, still net-positive).
        if month.strftime("%Y-%m") == PAST_SETTLEMENT_MONTH:
            suppliers += PAST_SETTLEMENT_SAR  # a softened past instance the business absorbed.

        by_cat = {
            "salaries": salaries,
            "suppliers": suppliers,
            "rent": rent,
            "operations": operations,
            "other": other,
        }
        expenses = sum(by_cat.values())
        net = revenue - expenses

        ds = month.strftime("%Y-%m")
        clean_rows.append(
            {
                "accountNumber": SME_ACCOUNT,
                "ds": ds,
                "revenue": round(revenue, 2),
                "expenses": round(expenses, 2),
                "net_cashflow": round(net, 2),
            }
        )
        for category, amount in by_cat.items():
            category_rows.append(
                {"accountNumber": SME_ACCOUNT, "ds": ds, "category": category, "amount": round(amount, 2)}
            )

    return pd.DataFrame(clean_rows), pd.DataFrame(category_rows)


def _scheduled_obligations() -> pd.DataFrame:
    """The known future lumpy outflow(s) that drive the forecasted liquidity gap."""
    return pd.DataFrame(
        [
            {
                "accountNumber": SME_ACCOUNT,
                "ds": FUTURE_SETTLEMENT_MONTH,
                "label": "تسوية المورد النصف سنوية",
                "amount": round(SUPPLIER_SETTLEMENT_SAR, 2),
            }
        ]
    )


def _write_profile() -> dict:
    profile = {
        "accountNumber": SME_ACCOUNT,
        "sector": SME_SECTOR,
        "cash_balance_sar": SME_CASH_BALANCE_SAR,
        "history_start": HISTORY_START,
        "history_months": HISTORY_MONTHS,
        "expense_categories": EXPENSE_CATEGORIES,
    }
    with open(SME_PROFILE_JSON, "w", encoding="utf-8") as f:
        json.dump(profile, f, ensure_ascii=False, indent=2)
    return profile


def generate() -> None:
    """Generates and writes all SME persona files, then prints a design sanity check."""
    clean_df, category_df = _generate_frames()
    obligations_df = _scheduled_obligations()
    profile = _write_profile()

    clean_df.to_csv(SME_MONTHLY_CLEAN_CSV, index=False)
    category_df.to_csv(SME_MONTHLY_CATEGORIZED_CSV, index=False)
    obligations_df.to_csv(SME_SCHEDULED_OBLIGATIONS_CSV, index=False)

    _print_sanity_check(clean_df, obligations_df, profile)


def _print_sanity_check(clean_df: pd.DataFrame, obligations_df: pd.DataFrame, profile: dict) -> None:
    """Confirms the persona satisfies the two 'pass' criteria and sets up the gap."""
    net = clean_df["net_cashflow"]
    last3_positive = bool((net.tail(3) > 0).all())
    all_positive = bool((net > 0).all())
    # Simple growth check: mean of last 6 months' revenue vs the prior 6.
    revenue = clean_df["revenue"]
    growth_ok = bool(revenue.tail(6).mean() > revenue.iloc[-12:-6].mean())

    avg_expense = float(clean_df["expenses"].tail(6).mean())
    runway = profile["cash_balance_sar"] / avg_expense

    # Approximate the forecasted gap month: seasonal-adjusted trend revenue minus a
    # typical expense month minus the scheduled settlement. (The real forecast is the
    # engine's job; this only confirms the data is *designed* to produce a gap.)
    gap_month = obligations_df.iloc[0]["ds"]
    settlement = float(obligations_df.iloc[0]["amount"])
    n = len(clean_df)
    gap_season = REVENUE_SEASONALITY[pd.Timestamp(gap_month + "-01").month]
    projected_gap_revenue = REVENUE_BASE_SAR * (1.0 + REVENUE_MONTHLY_GROWTH) ** (n + 1) * gap_season
    projected_gap_net = projected_gap_revenue - avg_expense - settlement

    print(f"SME persona generated: account {SME_ACCOUNT} ({HISTORY_MONTHS} months)")
    print(f"  net-positive last 3 months : {last3_positive}")
    print(f"  net-positive all months    : {all_positive}")
    print(f"  revenue growing (6m vs 6m) : {growth_ok}")
    print(f"  avg monthly expense (6m)   : SAR {avg_expense:,.0f}")
    print(f"  cash runway                : {runway:.1f} months")
    print(f"  designed gap month         : {gap_month} (settlement SAR {settlement:,.0f})")
    print(f"  projected gap-month net    : SAR {projected_gap_net:,.0f}  "
          f"({'NEGATIVE — gap present' if projected_gap_net < 0 else 'positive — NO gap!'})")
    print("Wrote:")
    for path in (SME_MONTHLY_CLEAN_CSV, SME_MONTHLY_CATEGORIZED_CSV, SME_SCHEDULED_OBLIGATIONS_CSV, SME_PROFILE_JSON):
        print(f"  {path.relative_to(ROOT_DIR)}")


if __name__ == "__main__":
    generate()
