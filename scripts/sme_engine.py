"""SME (business) engine — Layer B1 (cash-flow forecast + gap detection) and
Layer B2 (financing-readiness scorer).

SMEs are NOT scored with a fixed DBR ratio (see the rules reference section 7:
no such official SAMA ratio exists). Financing readiness is cash-flow based -- positive net
cash flow over the last 3+ months, stable/increasing revenue, and no predicted negative
cash-flow month in the next 6 months.

Layer B1 forecasts revenue and expenses separately with Prophet, then DETERMINISTICALLY
overlays that business's known scheduled obligations (sme_scheduled_obligations.csv) onto the
forecasted expenses of their months. Forward net cash flow is
`forecast_revenue - (forecast_expenses + scheduled_obligation)`; any month whose forward net
is negative is a "liquidity gap". Making the gap driver an explicit scheduled outflow (rather
than hoping Prophet invents a dip) keeps the gap explainable and demo-stable.

Layer B2 turns the history + forecast into the three readiness criteria, a 0-100 score, a cash
runway, and a timing verdict.

ACCOUNT-AWARE (rebuilt 2026-07-12): this engine used to serve a single hardcoded persona. The
generated dataset holds 500 businesses (scripts/generate_sme.py), so every function now takes
an accountNumber and reads that business's own history, obligations and cash balance.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from prophet import Prophet

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_PROCESSED = ROOT_DIR / "data" / "processed"
SME_PROFILES_CSV = DATA_PROCESSED / "sme_profiles.csv"
SME_MONTHLY_CLEAN_CSV = DATA_PROCESSED / "sme_monthly_clean.csv"
SME_SCHEDULED_OBLIGATIONS_CSV = DATA_PROCESSED / "sme_scheduled_obligations.csv"

SME_ACCOUNT = "300000001"  # the demo persona (the liquidity-gap story).

PROPHET_UNCERTAINTY_SEED = 42  # mirrors forecast_engine.py's reproducibility convention.
MIN_HISTORY_MONTHS = 6
POSITIVE_CASHFLOW_MIN_MONTHS = 3  # SME rule: positive net over the last 3+ months.
RUNWAY_TRAILING_MONTHS = 6

# Readiness score weights (a DEFINED heuristic — SAMA publishes no fixed SME score).
SCORE_POSITIVE_CASHFLOW = 35
SCORE_REVENUE_STABILITY = 25
SCORE_NO_NEGATIVE = {"pass": 40, "watch": 12, "fail": 0}
STATUS_READY_THRESHOLD = 85
STATUS_SEMI_THRESHOLD = 60

# A single shallow, explainable predicted gap is a "watch"; more than this is "fail".
GAP_WATCH_MAX_MONTHS = 1

PROPHET_KWARGS = {
    "yearly_seasonality": False,
    "weekly_seasonality": False,
    "daily_seasonality": False,
}

ARABIC_MONTHS = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
]


def _arabic_month(ds: str) -> str:
    return ARABIC_MONTHS[(int(ds.split("-")[1]) - 1) % 12]


@lru_cache(maxsize=1)
def _load_all_history() -> pd.DataFrame:
    df = pd.read_csv(SME_MONTHLY_CLEAN_CSV, dtype={"accountNumber": str})
    df["ds"] = pd.to_datetime(df["ds"], format="%Y-%m")
    return df


@lru_cache(maxsize=1)
def _load_all_profiles() -> pd.DataFrame:
    return pd.read_csv(SME_PROFILES_CSV, dtype={"accountNumber": str})


@lru_cache(maxsize=1)
def _load_all_obligations() -> pd.DataFrame:
    if not SME_SCHEDULED_OBLIGATIONS_CSV.exists():
        return pd.DataFrame(columns=["accountNumber", "ds", "label", "type", "amount"])
    return pd.read_csv(SME_SCHEDULED_OBLIGATIONS_CSV, dtype={"accountNumber": str})


def _history_for(account_number: str) -> pd.DataFrame:
    df = _load_all_history()
    return df[df["accountNumber"] == str(account_number)].sort_values("ds").reset_index(drop=True)


def _profile_for(account_number: str) -> dict:
    df = _load_all_profiles()
    rows = df[df["accountNumber"] == str(account_number)]
    if rows.empty:
        raise KeyError(f"unknown SME account: {account_number}")
    return rows.iloc[0].to_dict()


def _obligations_for(account_number: str) -> dict[str, float]:
    """Maps 'YYYY-MM' -> total scheduled outflow that month, for one business."""
    df = _load_all_obligations()
    rows = df[df["accountNumber"] == str(account_number)]
    if rows.empty:
        return {}
    return rows.groupby("ds")["amount"].sum().to_dict()


def scheduled_obligations(account_number: str = SME_ACCOUNT) -> list[dict]:
    """This business's scheduled lumpy outflows (label, month, amount)."""
    df = _load_all_obligations()
    rows = df[df["accountNumber"] == str(account_number)]
    return rows.to_dict("records")


def list_accounts() -> list[str]:
    """Every SME account number in the dataset."""
    return _load_all_profiles()["accountNumber"].tolist()


def _prophet_forecast(history: pd.DataFrame, column: str, months_ahead: int) -> list[float]:
    """Fits Prophet on one column (revenue or expenses) and returns the forward point estimates.

    Seasonality is intentionally OFF: the liquidity gap is created by the deterministic
    scheduled-obligation overlay in forecast_sme_cashflow(), not by a learned seasonal dip.
    Trend-only keeps each fit ~1s (vs ~25s with yearly_seasonality).
    """
    series = history[["ds", column]].rename(columns={column: "y"})
    model = Prophet(**PROPHET_KWARGS)
    model.fit(series)
    future = model.make_future_dataframe(periods=months_ahead, freq="MS")
    np.random.seed(PROPHET_UNCERTAINTY_SEED)
    forecast = model.predict(future)
    return [float(value) for value in forecast["yhat"].tail(months_ahead)]


@lru_cache(maxsize=32)
def forecast_sme_cashflow(account_number: str = SME_ACCOUNT, months_ahead: int = 6) -> dict:
    """Layer B1: forecasts forward net cash flow and detects liquidity-gap months.

    Cached (the Prophet fits are the expensive part): repeated calls -- including
    assess_readiness()'s internal call and every /api/business/* request -- reuse the result.

    Returns:
        {
          "account_number", "history": [...], "forecast": [...],
          "negative_months": [str, ...], "avg_monthly_expense": float,
        }
        Or {"account_number", "error"} if history is too short.
    """
    account_number = str(account_number)
    history = _history_for(account_number)

    if len(history) < MIN_HISTORY_MONTHS:
        return {"account_number": account_number, "error": "insufficient SME history"}

    forecast_revenue = _prophet_forecast(history, "revenue", months_ahead)
    forecast_expenses = _prophet_forecast(history, "expenses", months_ahead)

    obligations = _obligations_for(account_number)
    last_month = history["ds"].iloc[-1]
    future_months = pd.date_range(start=last_month, periods=months_ahead + 1, freq="MS")[1:]

    forecast_rows: list[dict] = []
    negative_months: list[str] = []
    for month, revenue, expense in zip(future_months, forecast_revenue, forecast_expenses):
        ds = month.strftime("%Y-%m")
        scheduled = float(obligations.get(ds, 0.0))
        net = revenue - (expense + scheduled)
        is_gap = net < 0
        if is_gap:
            negative_months.append(ds)
        forecast_rows.append(
            {
                "month": ds,
                "forecast_revenue": round(revenue, 2),
                "forecast_expenses": round(expense, 2),
                "scheduled_obligation": round(scheduled, 2),
                "net_cashflow": round(net, 2),
                "is_gap": is_gap,
            }
        )

    history_rows = [
        {
            "month": row.ds.strftime("%Y-%m"),
            "revenue": float(row.revenue),
            "expenses": float(row.expenses),
            "net_cashflow": float(row.net_cashflow),
        }
        for row in history.itertuples()
    ]

    # Robust trailing expense (the median ignores a lumpy settlement spike) -> runway basis.
    avg_monthly_expense = float(history["expenses"].tail(RUNWAY_TRAILING_MONTHS).median())

    return {
        "account_number": account_number,
        "history": history_rows,
        "forecast": forecast_rows,
        "negative_months": negative_months,
        "avg_monthly_expense": round(avg_monthly_expense, 2),
    }


def _count_trailing_positive_months(history_rows: list[dict]) -> int:
    """Consecutive net-positive months counting back from the most recent."""
    count = 0
    for row in reversed(history_rows):
        if row["net_cashflow"] > 0:
            count += 1
        else:
            break
    return count


def _revenue_growth_pct(history_rows: list[dict]) -> float:
    """Percent change of the last 6 months' mean revenue vs the prior 6 months'."""
    revenues = [row["revenue"] for row in history_rows]
    if len(revenues) < 12:
        return 0.0
    recent = np.mean(revenues[-6:])
    prior = np.mean(revenues[-12:-6])
    return float((recent - prior) / prior * 100) if prior else 0.0


def assess_readiness(account_number: str = SME_ACCOUNT) -> dict:
    """Layer B2: the three cash-flow criteria, a 0-100 score, runway, and a timing verdict."""
    account_number = str(account_number)
    cashflow = forecast_sme_cashflow(account_number)
    if "error" in cashflow:
        return {"account_number": cashflow["account_number"], "error": cashflow["error"]}

    profile = _profile_for(account_number)
    history_rows = cashflow["history"]
    negative_months = cashflow["negative_months"]

    # Criterion 1 — positive net cash flow over the last 3+ months.
    positive_streak = _count_trailing_positive_months(history_rows)
    c1_pass = positive_streak >= POSITIVE_CASHFLOW_MIN_MONTHS
    criterion_cashflow = {
        "id": "positive-cashflow",
        "label": "تدفق نقدي موجب لآخر 3 أشهر فأكثر",
        "status": "pass" if c1_pass else "fail",
        "value": f"{positive_streak} أشهر متتالية",
        "detail": (
            f"صافي تدفقك موجب منذ {positive_streak} أشهر متتالية — أقوى مؤشر تنظر إليه جهات تمويل الأعمال."
            if c1_pass
            else "تدفقك النقدي لم يبقَ موجباً لثلاثة أشهر متتالية — عالج ذلك أولاً."
        ),
    }

    # Criterion 2 — stable / increasing revenue.
    growth = _revenue_growth_pct(history_rows)
    c2_pass = growth >= 0
    criterion_revenue = {
        "id": "revenue-stability",
        "label": "إيرادات مستقرة أو متصاعدة",
        "status": "pass" if c2_pass else "watch",
        "value": f"{growth:+.0f}٪ نمواً",
        "detail": (
            f"إيراداتك تنمو بمعدل {growth:+.0f}٪ عند مقارنة آخر 6 أشهر بما قبلها."
            if c2_pass
            else f"إيراداتك تتراجع بمعدل {growth:.0f}٪ — راقب هذا الاتجاه قبل التمويل."
        ),
    }

    # Criterion 3 — no predicted negative month in the next 6.
    gap_count = len(negative_months)
    if gap_count == 0:
        c3_status = "pass"
    elif gap_count <= GAP_WATCH_MAX_MONTHS:
        c3_status = "watch"
    else:
        c3_status = "fail"
    if negative_months:
        gap_ar = "، ".join(_arabic_month(month) for month in negative_months)
        c3_value = f"فجوة متوقعة في {gap_ar}"
        c3_detail = (
            f"يتوقع مُرتقى ضغطاً على التدفق في {gap_ar} بسبب التزام مجدول كبير. "
            "تجاوزه دون شهر سالب يرفع جاهزيتك إلى ممتازة."
        )
    else:
        c3_value = "لا أشهر سالبة متوقعة"
        c3_detail = "لا يتوقع مُرتقى أي شهر سالب في الأشهر الستة القادمة — مؤشر ممتاز."
    criterion_gap = {
        "id": "no-negative-month",
        "label": "لا شهر سالب متوقع في الأشهر الستة القادمة",
        "status": c3_status,
        "value": c3_value,
        "detail": c3_detail,
    }

    criteria = [criterion_cashflow, criterion_revenue, criterion_gap]

    score = 0
    score += SCORE_POSITIVE_CASHFLOW if c1_pass else 0
    score += SCORE_REVENUE_STABILITY if c2_pass else 0
    score += SCORE_NO_NEGATIVE[c3_status]

    if score >= STATUS_READY_THRESHOLD:
        status_word = "جاهزة"
    elif score >= STATUS_SEMI_THRESHOLD:
        status_word = "شبه جاهزة"
    else:
        status_word = "غير جاهزة"

    cash_balance = float(profile["cash_balance_sar"])
    runway_months = round(cash_balance / cashflow["avg_monthly_expense"], 1)

    return {
        "account_number": account_number,
        "score": score,
        "status_word": status_word,
        "runway_months": runway_months,
        "cash_balance_sar": cash_balance,
        "sector": str(profile["sector"]),
        "business_size_tier": str(profile["business_size_tier"]),
        "employee_count": int(profile["employee_count"]),
        # Raw numeric fields (beyond the display-string criterion values) so downstream
        # narration can pass clean numbers through the advisor's number-fidelity guard.
        "revenue_growth_pct": int(round(growth)),
        "positive_streak_months": positive_streak,
        "gap_months": list(negative_months),
        "criteria": criteria,
        "timing": _build_timing(negative_months),
    }


def _build_timing(negative_months: list[str]) -> dict:
    """Timing verdict: apply now if clear, else after the gap passes with a positive month."""
    if not negative_months:
        return {
            "verdict": "الوقت مناسب لطلب التمويل الآن",
            "detail": "ملفك مكتمل: تدفق موجب، نمو مستقر، ولا أشهر سالبة متوقعة — تقدّم من موقع قوة.",
        }
    gap_ar = _arabic_month(negative_months[0])
    return {
        "verdict": f"الأفضل: قدّم طلب التمويل بعد تجاوز فجوة {gap_ar}",
        "detail": (
            f"بعد تجاوز فجوة {gap_ar} المتوقعة بشهر موجب، يكتمل ملفك: أشهر موجبة متتالية، "
            "نمو مستقر، ولا أشهر سالبة متوقعة — فتتقدم من موقع قوة وبشروط أفضل."
        ),
    }


if __name__ == "__main__":
    import sys

    sys.stdout.reconfigure(encoding="utf-8")

    cashflow = forecast_sme_cashflow(SME_ACCOUNT)
    print(f"=== Layer B1: forward cash flow (account {SME_ACCOUNT}) ===")
    for row in cashflow["forecast"]:
        flag = "  <-- GAP" if row["is_gap"] else ""
        print(
            f"  {row['month']}: revenue {row['forecast_revenue']:>12,.0f}  "
            f"expenses {row['forecast_expenses']:>12,.0f}  "
            f"scheduled {row['scheduled_obligation']:>10,.0f}  "
            f"net {row['net_cashflow']:>12,.0f}{flag}"
        )
    print(f"  negative_months: {cashflow['negative_months']}")
    print(f"  avg_monthly_expense (runway basis): {cashflow['avg_monthly_expense']:,.0f}")

    print("\n=== Layer B2: readiness ===")
    readiness = assess_readiness(SME_ACCOUNT)
    print(f"  score: {readiness['score']}  ({readiness['status_word']})")
    print(f"  runway: {readiness['runway_months']} months")
    for criterion in readiness["criteria"]:
        print(f"  [{criterion['status'].upper():5}] {criterion['label']}  — {criterion['value']}")
    print(f"  timing: {readiness['timing']['verdict']}")
