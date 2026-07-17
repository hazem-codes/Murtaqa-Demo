"""Layer 1 (addon): per-category monthly spending breakdown.

Aggregates the generated transaction-level ledger (data/raw/individuals_transactions.csv)
into one row per account / month / category, so advice can reference specific spending
categories ("reduce dining spend") rather than only a single aggregated net flow.

This module owns the individuals SPENDING TAXONOMY. Every category below is produced by
scripts/generate_individuals.py, which is why there is no mapping table and no fallback
"other_uncategorized" bucket any more: under the old Kaggle data, raw merchant category
codes had to be mapped onto consolidated categories and anything unmapped fell through.
The generated ledger emits its categories directly, so a row can never be uncategorized --
an unrecognised category here is a real bug, not a data-quality artifact, and is raised.

Obligation rows (mortgage_payment / loan_installment / credit_card_min_payment) and the
salary credit are NOT spending: they are excluded here and handled by the eligibility math
(scripts/generate_individuals.py) and the standing-order / direct-debit files. `rent` IS
spending and stays -- it is a household outflow, not a credit obligation.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parent.parent
RAW_TRANSACTIONS_CSV = ROOT_DIR / "data" / "raw" / "individuals_transactions.csv"
OUTPUT_DIR = ROOT_DIR / "data" / "processed"
OUTPUT_CSV = OUTPUT_DIR / "individuals_monthly_categorized.csv"

# The 10 household spending categories (scripts/generate_individuals.py, step 15).
SPENDING_CATEGORIES = [
    "rent",
    "electricity_water_gas",
    "internet_mobile",
    "groceries",
    "dining_cafes",
    "transport_fuel",
    "healthcare_insurance",
    "subscriptions",
    "shopping_clothing",
    "entertainment",
]

# Credit obligations and income — real ledger rows, but not "spending" for the breakdown.
OBLIGATION_CATEGORIES = ["mortgage_payment", "loan_installment", "credit_card_min_payment"]
INCOME_CATEGORIES = ["salary"]

# Display labels. The Layer 3 advisor narrates in Arabic and its guard rejects Latin script,
# so the Arabic label -- not the English slug -- is what must reach the model.
CATEGORY_LABELS_AR = {
    "rent": "الإيجار",
    "electricity_water_gas": "الكهرباء والماء والغاز",
    "internet_mobile": "الإنترنت والجوال",
    "groceries": "البقالة والتموين",
    "dining_cafes": "المطاعم والمقاهي",
    "transport_fuel": "التنقل والوقود",
    "healthcare_insurance": "الصحة والتأمين",
    "subscriptions": "الاشتراكات",
    "shopping_clothing": "التسوق والملابس",
    "entertainment": "الترفيه",
}


def load_raw_transactions() -> pd.DataFrame:
    """Loads the generated transaction ledger."""
    return pd.read_csv(RAW_TRANSACTIONS_CSV, dtype={"accountNumber": str})


def assert_known_categories(raw_df: pd.DataFrame) -> None:
    """Fails loudly on any category the taxonomy doesn't know about."""
    known = set(SPENDING_CATEGORIES) | set(OBLIGATION_CATEGORIES) | set(INCOME_CATEGORIES)
    unknown = set(raw_df["category"].unique()) - known
    if unknown:
        raise ValueError(
            f"Unrecognised transaction categories in the ledger: {sorted(unknown)}. "
            "The taxonomy in category_engine.py and generate_individuals.py has drifted apart."
        )


def aggregate_monthly_by_category(raw_df: pd.DataFrame) -> pd.DataFrame:
    """Aggregates spending debits into one row per accountNumber, month, and category."""
    spending_df = raw_df[raw_df["category"].isin(SPENDING_CATEGORIES)].copy()
    spending_df["ds"] = pd.to_datetime(spending_df["transactionDateTime"]).dt.strftime("%Y-%m")

    aggregated = (
        spending_df.groupby(["accountNumber", "ds", "category"], as_index=False)["transactionAmount"]
        .sum()
        .rename(columns={"transactionAmount": "amount"})
    )
    return aggregated.sort_values(["accountNumber", "ds", "category"]).reset_index(drop=True)


def build_categorized_dataset() -> pd.DataFrame:
    """Runs the full pipeline: load, validate the taxonomy, aggregate, save."""
    raw_df = load_raw_transactions()
    assert_known_categories(raw_df)

    aggregated_df = aggregate_monthly_by_category(raw_df)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    aggregated_df.to_csv(OUTPUT_CSV, index=False)
    print(f"Saved {len(aggregated_df)} rows to {OUTPUT_CSV.relative_to(ROOT_DIR)}")
    print(f"  accounts   : {aggregated_df['accountNumber'].nunique()}")
    print(f"  categories : {aggregated_df['category'].nunique()} of {len(SPENDING_CATEGORIES)} defined")

    return aggregated_df


def print_sample_account_summaries(aggregated_df: pd.DataFrame, num_accounts: int = 3, top_n: int = 3) -> None:
    """Prints each sample account's top spending categories by average monthly amount."""
    for account_number in aggregated_df["accountNumber"].drop_duplicates().head(num_accounts):
        account_df = aggregated_df[aggregated_df["accountNumber"] == account_number]
        avg_by_category = account_df.groupby("category")["amount"].mean().sort_values(ascending=False)
        print(f"\nAccount {account_number} - top {top_n} categories by avg monthly spend:")
        for category, avg_amount in avg_by_category.head(top_n).items():
            print(f"  {category:<22} SAR {avg_amount:,.2f}/month")


if __name__ == "__main__":
    result_df = build_categorized_dataset()
    print_sample_account_summaries(result_df)
