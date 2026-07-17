"""Layer 1: Cash-Flow Forecasting Engine.

Trains a per-account Prophet model on individuals_monthly_clean.csv and forecasts future
net monthly cash flow. Also batch-forecasts the total flow and the per-category spending
breakdown (individuals_monthly_categorized.csv) for every account.

NOTE ON SALARY (changed with the 2026-07-12 dataset rebuild): this engine used to *simulate*
a monthly salary per account from a lognormal mixture, because the old Kaggle transaction data
was card-spend only (always negative) and carried no income at all. The generated dataset
gives every persona a real, SAMA-consistent `gross_salary_sar` and books it as an actual salary
credit each month, so `y` is already a true signed net flow (income - outflow). The simulation
is therefore gone: `monthly_income_sar` is read from the data, never invented.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd
from prophet import Prophet

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_PROCESSED = ROOT_DIR / "data" / "processed"
MONTHLY_CLEAN_CSV = DATA_PROCESSED / "individuals_monthly_clean.csv"
CATEGORIZED_TRANSACTIONS_CSV = DATA_PROCESSED / "individuals_monthly_categorized.csv"
FORECAST_TOTAL_CSV = DATA_PROCESSED / "forecast_total.csv"
FORECAST_BY_CATEGORY_CSV = DATA_PROCESSED / "forecast_by_category.csv"

MIN_HISTORY_MONTHS = 4
PROPHET_UNCERTAINTY_SEED = 42

# Trend-only fits. The generated series has no designed seasonality (month-to-month variation
# is bounded noise around a persona-stable pattern), and disabling the seasonal terms keeps
# each fit ~1s instead of ~25s -- material when batching 1000 accounts x 10 categories.
PROPHET_KWARGS = {
    "yearly_seasonality": False,
    "weekly_seasonality": False,
    "daily_seasonality": False,
}


@lru_cache(maxsize=1)
def _load_monthly() -> pd.DataFrame:
    """Loads every account's monthly income / spending / net-flow history."""
    df = pd.read_csv(MONTHLY_CLEAN_CSV, dtype={"accountNumber": str})
    df["ds"] = pd.to_datetime(df["ds"], format="%Y-%m")
    return df


def _load_account_history(account_number: str) -> pd.DataFrame:
    """Loads and sorts the monthly history for a single account."""
    df = _load_monthly()
    account_df = df[df["accountNumber"] == str(account_number)].copy()
    return account_df.sort_values("ds")[["ds", "y", "income", "spending"]]


def forecast_account(account_number: str, months_ahead: int = 6) -> dict:
    """Forecasts net monthly cash flow for one account.

    Args:
        account_number: The accountNumber to filter on.
        months_ahead: Number of future months to forecast.

    Returns:
        A dict matching the Layer 1 output contract. If the account has fewer than
        MIN_HISTORY_MONTHS months of history, or does not exist, the dict contains an
        "error" field instead of forecast data.
    """
    history_df = _load_account_history(account_number)

    if len(history_df) < MIN_HISTORY_MONTHS:
        return {
            "account_number": str(account_number),
            "error": (
                f"Insufficient history: found {len(history_df)} month(s), "
                f"need at least {MIN_HISTORY_MONTHS}."
            ),
        }

    monthly_income = float(history_df["income"].iloc[-1])

    model = Prophet(**PROPHET_KWARGS)
    model.fit(history_df[["ds", "y"]])

    future_df = model.make_future_dataframe(periods=months_ahead, freq="MS")
    # Prophet draws yhat_lower/yhat_upper via numpy's global RNG during predict(). Reseeding
    # immediately before each call makes every interval reproducible across runs, independent
    # of how many other numpy-random-consuming calls happened earlier in the process.
    np.random.seed(PROPHET_UNCERTAINTY_SEED)
    forecast_df = model.predict(future_df)

    history = [
        {"month": row.ds.strftime("%Y-%m"), "actual_flow": float(row.y)}
        for row in history_df.itertuples()
    ]

    future_forecast = forecast_df.tail(months_ahead)
    forecast = [
        {
            "month": row.ds.strftime("%Y-%m"),
            "predicted_flow": float(row.yhat),
            "lower_bound": float(row.yhat_lower),
            "upper_bound": float(row.yhat_upper),
        }
        for row in future_forecast.itertuples()
    ]

    negative_months_ahead = sum(1 for month in forecast if month["predicted_flow"] < 0)
    avg_monthly_flow_forecast = sum(month["predicted_flow"] for month in forecast) / len(forecast)

    return {
        "account_number": str(account_number),
        "history": history,
        "forecast": forecast,
        "negative_months_ahead": negative_months_ahead,
        "avg_monthly_flow_forecast": avg_monthly_flow_forecast,
        "monthly_income_sar": monthly_income,
    }


def _assert_valid_forecast_output(result: dict) -> None:
    """Checks that a forecast_account() result has the required keys and numeric values."""
    assert "account_number" in result, "missing account_number"

    if "error" in result:
        return

    required_keys = {
        "history",
        "forecast",
        "negative_months_ahead",
        "avg_monthly_flow_forecast",
        "monthly_income_sar",
    }
    missing_keys = required_keys - result.keys()
    assert not missing_keys, f"missing keys: {missing_keys}"

    for entry in result["history"]:
        assert isinstance(entry["month"], str), "history month must be a string"
        assert isinstance(entry["actual_flow"], (int, float)), "actual_flow must be numeric"

    for entry in result["forecast"]:
        assert isinstance(entry["month"], str), "forecast month must be a string"
        for key in ("predicted_flow", "lower_bound", "upper_bound"):
            assert isinstance(entry[key], (int, float)), f"{key} must be numeric"

    assert isinstance(result["negative_months_ahead"], int), "negative_months_ahead must be an int"
    assert isinstance(result["avg_monthly_flow_forecast"], (int, float)), (
        "avg_monthly_flow_forecast must be numeric"
    )
    assert isinstance(result["monthly_income_sar"], (int, float)), "monthly_income_sar must be numeric"


def run_output_contract_tests(account_numbers: list[str]) -> None:
    """Runs forecast_account() on each account and validates the output contract."""
    for account_number in account_numbers:
        _assert_valid_forecast_output(forecast_account(account_number))
    print(f"All {len(account_numbers)} output contract tests passed.")


def forecast_all_accounts_total(months_ahead: int = 6) -> pd.DataFrame:
    """Batch-forecasts the total net cash flow for every account.

    Returns:
        Columns: accountNumber, ds, predicted_amount, lower_bound, upper_bound, method.
    """
    account_numbers = _load_monthly()["accountNumber"].drop_duplicates().tolist()

    rows = []
    skipped_count = 0
    for account_number in account_numbers:
        result = forecast_account(account_number, months_ahead=months_ahead)
        if "error" in result:
            skipped_count += 1
            continue
        for month in result["forecast"]:
            rows.append(
                {
                    "accountNumber": account_number,
                    "ds": month["month"],
                    "predicted_amount": month["predicted_flow"],
                    "lower_bound": month["lower_bound"],
                    "upper_bound": month["upper_bound"],
                    "method": "prophet",
                }
            )

    if skipped_count:
        print(f"forecast_all_accounts_total: skipped {skipped_count} account(s) with insufficient history.")

    total_forecast_df = pd.DataFrame(rows)
    total_forecast_df.to_csv(FORECAST_TOTAL_CSV, index=False)
    print(f"Saved {len(total_forecast_df)} rows to {FORECAST_TOTAL_CSV.relative_to(ROOT_DIR)}")
    return total_forecast_df


def _account_calendar(account_number: str) -> list[pd.Timestamp]:
    """Returns the sorted list of months an account has any history for."""
    return sorted(_load_account_history(account_number)["ds"].tolist())


def _forecast_category_series(
    calendar: list[pd.Timestamp],
    category_months: pd.DataFrame,
    months_ahead: int,
) -> tuple[list[pd.Timestamp], list[float], str]:
    """Forecasts one account/category time series.

    Uses Prophet if the category has at least MIN_HISTORY_MONTHS months of recorded activity;
    otherwise falls back to a flat forecast equal to the average monthly amount over the
    account's full calendar (months with no activity counted as zero). Negative forecasts are
    clipped to zero, since a category cannot have negative spend.
    """
    amount_by_month = dict(zip(category_months["ds"], category_months["amount"]))
    full_series = pd.DataFrame(
        {"ds": calendar, "amount": [amount_by_month.get(month, 0.0) for month in calendar]}
    )
    future_months = list(pd.date_range(start=calendar[-1], periods=months_ahead + 1, freq="MS")[1:])

    if len(category_months) < MIN_HISTORY_MONTHS:
        flat_amount = max(float(full_series["amount"].mean()), 0.0)
        return future_months, [flat_amount] * months_ahead, "average_fallback"

    model = Prophet(**PROPHET_KWARGS)
    model.fit(full_series.rename(columns={"amount": "y"}))
    future_df = model.make_future_dataframe(periods=months_ahead, freq="MS")
    np.random.seed(PROPHET_UNCERTAINTY_SEED)
    forecast_df = model.predict(future_df)
    forecasted_amounts = [max(float(value), 0.0) for value in forecast_df["yhat"].tail(months_ahead)]
    return future_months, forecasted_amounts, "prophet"


def forecast_all_accounts_by_category(months_ahead: int = 6) -> pd.DataFrame:
    """Batch-forecasts per-category spending for every account.

    Returns:
        Columns: accountNumber, ds, category, forecasted_amount, method.
    """
    categorized_df = pd.read_csv(CATEGORIZED_TRANSACTIONS_CSV, dtype={"accountNumber": str})
    categorized_df["ds"] = pd.to_datetime(categorized_df["ds"], format="%Y-%m")

    rows = []
    for account_number, account_df in categorized_df.groupby("accountNumber"):
        calendar = _account_calendar(account_number)
        if not calendar:
            continue
        for category in sorted(account_df["category"].unique()):
            category_months = account_df[account_df["category"] == category][["ds", "amount"]]
            future_months, forecasted_amounts, method = _forecast_category_series(
                calendar, category_months, months_ahead
            )
            for month, amount in zip(future_months, forecasted_amounts):
                rows.append(
                    {
                        "accountNumber": account_number,
                        "ds": month.strftime("%Y-%m"),
                        "category": category,
                        "forecasted_amount": amount,
                        "method": method,
                    }
                )

    category_forecast_df = pd.DataFrame(rows)
    category_forecast_df.to_csv(FORECAST_BY_CATEGORY_CSV, index=False)
    print(f"Saved {len(category_forecast_df)} rows to {FORECAST_BY_CATEGORY_CSV.relative_to(ROOT_DIR)}")
    return category_forecast_df


def print_category_vs_total_sanity_check(
    total_forecast_df: pd.DataFrame, category_forecast_df: pd.DataFrame, account_numbers: list[str]
) -> None:
    """Reconciles the per-category forecast against the total forecast for sample accounts.

    The total forecast predicts net flow (income - ALL outflows, including credit obligations).
    The category forecast sums household SPENDING only. The gap between them is therefore the
    account's credit obligations -- so this reconstructs an implied net flow as
    (income - category_sum - obligations) and checks it against the real total forecast.
    """
    profiles = pd.read_csv(
        DATA_PROCESSED / "individuals_profiles.csv", dtype={"accountNumber": str}
    ).set_index("accountNumber")

    for account_number in account_numbers:
        month_rows = category_forecast_df[category_forecast_df["accountNumber"] == account_number]
        if month_rows.empty:
            print(f"\nAccount {account_number}: no category forecast available.")
            continue

        next_month = month_rows["ds"].min()
        month_rows = month_rows[month_rows["ds"] == next_month]
        category_sum = float(month_rows["forecasted_amount"].sum())

        print(f"\nAccount {account_number} - category forecast for {next_month}:")
        for _, row in month_rows.sort_values("forecasted_amount", ascending=False).iterrows():
            print(f"  {row['category']:<22} SAR {row['forecasted_amount']:,.2f} ({row['method']})")
        print(f"  {'category spend sum':<22} SAR {category_sum:,.2f}")

        total_row = total_forecast_df[
            (total_forecast_df["accountNumber"] == account_number)
            & (total_forecast_df["ds"] == next_month)
        ]
        if total_row.empty:
            print(f"  No total forecast available for {next_month} to compare against.")
            continue

        profile = profiles.loc[account_number]
        income = float(profile["gross_salary_sar"])
        obligations = (
            float(profile["mortgage_installment_sar"])
            + float(profile["other_loan_installments_sar"])
            + float(profile["credit_card_min_payment_sar"])
        )
        total_amount = float(total_row["predicted_amount"].iloc[0])
        implied_total = income - category_sum - obligations

        divergence_pct = (
            abs(implied_total - total_amount) / abs(total_amount) * 100 if total_amount else float("inf")
        )
        print(f"  {'total forecast (net flow)':<30} SAR {total_amount:,.2f}")
        print(f"  {'implied (income-spend-oblig.)':<30} SAR {implied_total:,.2f}  (divergence: {divergence_pct:.1f}%)")
        if divergence_pct > 30:
            print(f"  FLAG: implied total diverges from the total forecast by more than 30% for {account_number}.")


if __name__ == "__main__":
    import json

    sample_account_numbers = _load_monthly()["accountNumber"].drop_duplicates().head(3).tolist()

    for sample_account_number in sample_account_numbers:
        print(json.dumps(forecast_account(sample_account_number), indent=2))

    run_output_contract_tests(sample_account_numbers)

    total_forecast_result = forecast_all_accounts_total()
    category_forecast_result = forecast_all_accounts_by_category()
    print_category_vs_total_sanity_check(
        total_forecast_result, category_forecast_result, sample_account_numbers
    )
