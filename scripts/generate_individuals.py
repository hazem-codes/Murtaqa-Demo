"""Individuals dataset generator — archetype-driven, SAMA-compliant, internally consistent.

Replaces the old Kaggle-sourced individual datasets (loan_data_clean_SAR_balanced.csv +
the unrelated credit-card transactions.csv), whose transactions had no logical relationship
to their loan/eligibility data.

DESIGN PHILOSOPHY — every persona is one coherent financial story. Fields are generated in a
strict dependency order and each is DERIVED from the ones before it, never randomized
independently:

    age -> employment_type -> years_of_experience -> income_bracket -> salary components
        -> gross_salary -> housing (mortgage vs rent) -> existing obligations
        -> requested financing -> DBR ratios -> eligibility label -> 24 months of spending

The eligibility label is a pure OUTPUT of the SAMA ratio math (never pre-assigned, never
forced); balance across the population is achieved by tuning the generation ranges only.

SAMA RATIOS (docs/Murtaqa_Financial_Rules_Reference_EN.md sections 5-6):
  - salary-linked cap  : credit obligations EXCLUDING real estate / gross salary
                         <= 33.33% (employee) or <= 25% (retiree)
  - total-obligations  : ALL obligations INCLUDING real estate / gross salary
                         <= 45% when there is no mortgage;
                         <= 55% (bracket 1) or <= 65% (brackets 2-3) when there is one.
  eligible_sama = salary_ok AND total_ok

WHY A REQUESTED FINANCING EXISTS: "eligible" must mean eligible *for something*. Each persona
requests a personal finance (amount + rate, over SAMA's 60-month maximum term); its amortized
installment joins the obligations before the ratios are computed. This is what the Layer 2
counterfactual engine varies, and it is why the eligibility screen has an interest rate and a
financing amount to talk about.

Outputs (all under data/, self-contained):
  data/raw/individuals_transactions.csv        transaction-level ledger (Open Banking-like)
  data/processed/individuals_profiles.csv      one row per persona (eligibility dataset)
  data/processed/individuals_monthly_clean.csv accountNumber, ds, y, income, spending
  data/processed/individuals_standing_orders.csv
  data/processed/individuals_direct_debits.csv

Reproducible: every draw comes from INDIVIDUALS_RANDOM_SEED.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sama_rules  # noqa: E402

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_RAW = ROOT_DIR / "data" / "raw"
DATA_PROCESSED = ROOT_DIR / "data" / "processed"

RAW_TRANSACTIONS_CSV = DATA_RAW / "individuals_transactions.csv"
PROFILES_CSV = DATA_PROCESSED / "individuals_profiles.csv"
MONTHLY_CLEAN_CSV = DATA_PROCESSED / "individuals_monthly_clean.csv"
STANDING_ORDERS_CSV = DATA_PROCESSED / "individuals_standing_orders.csv"
DIRECT_DEBITS_CSV = DATA_PROCESSED / "individuals_direct_debits.csv"

INDIVIDUALS_RANDOM_SEED = 42
# The population is TWO cohorts, appended in order so the first cohort's RNG draws are unchanged:
#   1. NUM_REQUESTER_PERSONAS: the original personas, each WITH an active financing request. Their
#      generation is byte-identical to before this change (same seed, same draw order).
#   2. NUM_NON_REQUEST_PERSONAS (~15%): coherent personas (real salary + obligations) who have NOT
#      applied for any financing. Open Banking (AIS) exposes a customer's OWN accounts/obligations,
#      not whether they have applied for a loan elsewhere (that is credit-bureau / SIMAH scope), so
#      "has an active request" is an EXPLICIT persona state -- not a universal assumption. A request
#      is layered ONLY onto the first cohort.
NUM_REQUESTER_PERSONAS = 1000
NUM_NON_REQUEST_PERSONAS = 180
NUM_PERSONAS = NUM_REQUESTER_PERSONAS + NUM_NON_REQUEST_PERSONAS  # 1180 total
ACCOUNT_NUMBER_BASE = 100_000_001  # individuals occupy 1000000xx; SMEs occupy 3000000xx.
# The non-request cohort starts here (100001001); 100001001 is the non-request demo anchor.
NON_REQUEST_ACCOUNT_BASE = ACCOUNT_NUMBER_BASE + NUM_REQUESTER_PERSONAS

HISTORY_START = "2024-08"
HISTORY_MONTHS = 24  # 2024-08 .. 2026-06 (the last complete month before "today", 2026-07).

# ── Official SAMA constants: imported, never redefined ─────────────────────────────────
# scripts/sama_rules.py is the single source of truth for the caps, the 60-month term, the
# credit-card minimum-payment rate and the half-of-average allowance rule. Duplicating them
# here is exactly how the data and the eligibility engine would silently drift apart.
MAX_FINANCE_TERM_MONTHS = sama_rules.MAX_FINANCE_TERM_MONTHS
CREDIT_CARD_MIN_PAYMENT_RATE = sama_rules.CREDIT_CARD_MIN_PAYMENT_RATE
VARIABLE_ALLOWANCE_COUNTED_SHARE = sama_rules.VARIABLE_ALLOWANCE_COUNTED_SHARE

# ── Age (skewed toward 25-55, with a real 55-70 tail so retirees can exist) ─────────────
AGE_MIN, AGE_MAX = 18, 70
# (weight, mean, sd) — tuned by simulation so the derived employment mix lands near 70/30.
AGE_MIXTURE = [
    (0.29, 31.0, 5.0),
    (0.29, 44.0, 6.0),
    (0.42, 60.0, 5.5),
]

# ── Employment (derived from age) ──────────────────────────────────────────────────────
RETIREMENT_AGE_FLOOR = 55   # below this nobody is retired.
RETIREMENT_AGE_FULL = 65    # at/above this everybody is retired.

# ── Income bracket (derived from employment + experience) ──────────────────────────────
# Seniority score -> bracket probabilities. Tuned to land near the 40/35/25 target mix.
BRACKET_WEIGHTS_JUNIOR = [0.74, 0.22, 0.04]
BRACKET_WEIGHTS_MID = [0.42, 0.40, 0.18]
BRACKET_WEIGHTS_SENIOR = [0.20, 0.38, 0.42]
BRACKET_WEIGHTS_RETIREE = [0.64, 0.27, 0.09]  # pensions skew low.
JUNIOR_MAX_EXPERIENCE = 5
MID_MAX_EXPERIENCE = 15

BRACKET_GROSS_RANGE = {
    1: (5_500.0, 15_000.0),
    2: (15_000.0, 25_000.0),
    3: (25_000.0, 60_000.0),
}
# Salary decomposition (shares of gross). The variable series averages twice its counted
# share, because SAMA counts only half of the average (VARIABLE_ALLOWANCE_COUNTED_SHARE).
BASE_SALARY_SHARE = 0.75
FIXED_ALLOWANCE_SHARE = 0.15
VARIABLE_COUNTED_SHARE = 0.10
VARIABLE_MONTHLY_NOISE_SD = 0.35

# ── Housing ────────────────────────────────────────────────────────────────────────────
MORTGAGE_BASE_PROB = 0.04
MORTGAGE_AGE_SLOPE = 0.012      # per year above 25.
MORTGAGE_BRACKET_BONUS = {1: 0.00, 2: 0.12, 3: 0.22}
MORTGAGE_INSTALLMENT_SHARE = (0.16, 0.26)  # of gross salary.
RENT_SHARE_OF_GROSS = (0.14, 0.24)

# ── Existing non-mortgage obligations ──────────────────────────────────────────────────
OTHER_LOAN_BASE_PROB = 0.18
OTHER_LOAN_AGE_SLOPE = 0.011    # older -> more accumulated loans.
OTHER_LOAN_SHARE = (0.03, 0.13)  # of gross salary.
CREDIT_CARD_PROB = 0.55
CREDIT_CARD_BALANCE_MONTHS = (0.20, 1.20)  # balance as a multiple of monthly gross.

# ── Requested financing (what eligibility is assessed *for*) ───────────────────────────
REQUESTED_LOAN_MONTHS_OF_GROSS = (3.0, 19.0)
LOAN_INT_RATE_RANGE = (4.5, 17.5)  # annual %, realistic Saudi consumer-finance band.

# ── Spending model (SAR/month, before income scaling) ───────────────────────────────────
# Each category: (low, high) absolute band, and how strongly it scales with income.
# `income_elasticity` 0.0 = flat regardless of income (utilities), 1.0 = fully proportional.
SPENDING_CATEGORIES = {
    "rent":                  {"band": (0.0, 0.0),        "elasticity": 1.0},  # special-cased
    "electricity_water_gas": {"band": (300.0, 700.0),    "elasticity": 0.15},
    "internet_mobile":       {"band": (200.0, 500.0),    "elasticity": 0.15},
    "groceries":             {"band": (600.0, 3000.0),   "elasticity": 0.75},
    "dining_cafes":          {"band": (150.0, 500.0),    "elasticity": 0.60},
    "transport_fuel":        {"band": (200.0, 500.0),    "elasticity": 0.35},
    "healthcare_insurance":  {"band": (150.0, 300.0),    "elasticity": 0.20},
    "subscriptions":         {"band": (150.0, 400.0),    "elasticity": 0.30},
    "shopping_clothing":     {"band": (150.0, 450.0),    "elasticity": 0.65},
    "entertainment":         {"band": (120.0, 500.0),    "elasticity": 0.55},
}
SPENDING_NOISE_SD = 0.12          # +/-10-15% month-to-month noise, per persona-stable pattern.
SPENDER_PROFILE_SD = 0.18         # a low spender stays a low spender across all months.
INCOME_SCALING_REFERENCE_SAR = 12_000.0  # income at which a category sits mid-band.

SAVINGS_TRANSFER_SHARE = 0.10     # standing order, only when the persona runs a surplus.
SAVINGS_MIN_SURPLUS_SAR = 1_500.0


def _sample_ages(rng: np.random.Generator, n: int) -> np.ndarray:
    weights = [component[0] for component in AGE_MIXTURE]
    edges = np.cumsum(weights)
    picks = np.searchsorted(edges, rng.random(n), side="right")
    ages = np.empty(n)
    for index, (_, mean, sd) in enumerate(AGE_MIXTURE):
        mask = picks == index
        ages[mask] = rng.normal(mean, sd, size=int(mask.sum()))
    return np.clip(np.round(ages), AGE_MIN, AGE_MAX).astype(int)


def _retirement_probability(age: int) -> float:
    """Nobody retired below 55; ramps to certain by 65."""
    if age < RETIREMENT_AGE_FLOOR:
        return 0.0
    if age >= RETIREMENT_AGE_FULL:
        return 1.0
    span = RETIREMENT_AGE_FULL - RETIREMENT_AGE_FLOOR
    return 0.35 + 0.65 * (age - RETIREMENT_AGE_FLOOR) / span


def _bracket_weights(employment_type: str, years_of_experience: int) -> list[float]:
    if employment_type == "retired":
        return BRACKET_WEIGHTS_RETIREE
    if years_of_experience <= JUNIOR_MAX_EXPERIENCE:
        return BRACKET_WEIGHTS_JUNIOR
    if years_of_experience <= MID_MAX_EXPERIENCE:
        return BRACKET_WEIGHTS_MID
    return BRACKET_WEIGHTS_SENIOR


def _build_persona(rng: np.random.Generator, index: int, has_active_request: bool = True) -> dict:
    """Generates one internally-consistent persona, field by dependent field.

    `has_active_request` gates ONLY the requested-financing step. Every field up to and including
    the existing obligations is generated identically for both cohorts; a request (amount + rate)
    is layered on afterward for requesters only. For a non-requester the request fields are zeroed
    and the interest rate is NaN (no application means no rate on record), and the SAMA ratios are
    then computed on the EXISTING obligations alone (new_loan_installment = 0). For that cohort
    `eligible_sama` therefore means "already within the SAMA caps on existing obligations, i.e. has
    borrowing headroom" -- NOT "approved for a requested loan" (there is no request). The
    has_active_request flag is the field that distinguishes the two meanings.
    """
    account_number = str(ACCOUNT_NUMBER_BASE + index)

    # 1-3. Age -> employment -> experience.
    age = int(_sample_ages(rng, 1)[0])
    employment_type = "retired" if rng.random() < _retirement_probability(age) else "employee"
    if employment_type == "retired":
        years_of_experience = 0
    else:
        # Career starts somewhere between 20 and 24; experience follows from age.
        career_start_age = int(rng.integers(20, 25))
        years_of_experience = max(0, age - career_start_age)

    # 4-7. Income bracket -> salary components -> gross salary.
    income_bracket = int(rng.choice([1, 2, 3], p=_bracket_weights(employment_type, years_of_experience)))
    low, high = BRACKET_GROSS_RANGE[income_bracket]
    gross_target = float(rng.uniform(low, high))

    base_salary = gross_target * BASE_SALARY_SHARE
    fixed_allowances = gross_target * FIXED_ALLOWANCE_SHARE
    # A real 24-month variable-allowance series; SAMA counts half of its average.
    variable_series = np.clip(
        rng.normal(
            gross_target * VARIABLE_COUNTED_SHARE / VARIABLE_ALLOWANCE_COUNTED_SHARE,
            gross_target * VARIABLE_COUNTED_SHARE * VARIABLE_MONTHLY_NOISE_SD,
            size=HISTORY_MONTHS,
        ),
        0.0,
        None,
    )
    variable_allowances_avg = float(variable_series.mean()) * VARIABLE_ALLOWANCE_COUNTED_SHARE
    gross_salary = base_salary + fixed_allowances + variable_allowances_avg

    # 8-9. Housing: mortgage probability rises with age and bracket; rent otherwise.
    mortgage_prob = min(
        0.85,
        MORTGAGE_BASE_PROB
        + max(0, age - 25) * MORTGAGE_AGE_SLOPE
        + MORTGAGE_BRACKET_BONUS[income_bracket],
    )
    has_mortgage = bool(rng.random() < mortgage_prob)
    mortgage_installment = (
        gross_salary * float(rng.uniform(*MORTGAGE_INSTALLMENT_SHARE)) if has_mortgage else 0.0
    )
    rent = 0.0 if has_mortgage else gross_salary * float(rng.uniform(*RENT_SHARE_OF_GROSS))

    # 10. Other loans: correlated with age (accumulated), independent of mortgage status.
    other_loan_prob = min(0.80, OTHER_LOAN_BASE_PROB + max(0, age - 25) * OTHER_LOAN_AGE_SLOPE)
    has_other_loans = bool(rng.random() < other_loan_prob)
    other_loan_installments = (
        gross_salary * float(rng.uniform(*OTHER_LOAN_SHARE)) if has_other_loans else 0.0
    )

    # 11. Credit card: the obligation is the MINIMUM payment due, not the balance (SAMA s.4).
    has_credit_card = bool(rng.random() < CREDIT_CARD_PROB)
    credit_card_balance = (
        gross_salary * float(rng.uniform(*CREDIT_CARD_BALANCE_MONTHS)) if has_credit_card else 0.0
    )
    credit_card_min_payment = credit_card_balance * CREDIT_CARD_MIN_PAYMENT_RATE

    # The financing being requested (what eligibility is assessed for) -- requesters only.
    # A non-requester has no application, hence amount 0 and NaN rate (no rate on record). The
    # requester branch's draws are byte-identical to before, preserving the original 1000 personas.
    if has_active_request:
        requested_loan_amount = gross_salary * float(rng.uniform(*REQUESTED_LOAN_MONTHS_OF_GROSS))
        loan_int_rate = float(rng.uniform(*LOAN_INT_RATE_RANGE))
    else:
        requested_loan_amount = 0.0
        loan_int_rate = float("nan")

    # Round the INPUTS to what the CSV will actually store, THEN run the SAMA math on them.
    # Doing it the other way round (deriving from full precision, then rounding for storage)
    # leaves a dataset whose own derived columns cannot be reproduced from its own inputs --
    # and the counterfactual engine re-derives exactly these fields from the stored values,
    # so the data and the engine would silently disagree on the ratios.
    inputs = {
        "gross_salary_sar": round(gross_salary, 2),
        "employment_type": employment_type,
        "mortgage_installment_sar": round(mortgage_installment, 2),
        "other_loan_installments_sar": round(other_loan_installments, 2),
        "credit_card_min_payment_sar": round(credit_card_min_payment, 2),
        "requested_loan_amount_sar": round(requested_loan_amount, 2),
        "loan_int_rate": round(loan_int_rate, 2),
        "loan_term_months": MAX_FINANCE_TERM_MONTHS,
    }

    # 12-14. The SAMA ratios and the label, computed by the shared rules module. The label is a
    # pure OUTPUT of this math -- it is never assigned, and never nudged to balance the classes.
    verdict = sama_rules.evaluate(inputs)

    return {
        "person_id": index + 1,
        "accountNumber": account_number,
        "age": age,
        "years_of_experience": years_of_experience,
        "income_bracket": verdict["income_bracket"],
        "housing_status": "mortgage" if has_mortgage else "rent",
        "base_salary_sar": round(base_salary, 2),
        "fixed_allowances_sar": round(fixed_allowances, 2),
        "variable_allowances_avg_sar": round(variable_allowances_avg, 2),
        "has_mortgage": int(has_mortgage),
        "rent_sar": round(rent, 2),
        "credit_card_balance_sar": round(credit_card_balance, 2),
        "loan_term_months": MAX_FINANCE_TERM_MONTHS,
        **inputs,
        "new_loan_installment_sar": round(verdict["new_loan_installment_sar"], 2),
        "salary_linked_obligations_sar": round(verdict["salary_linked_obligations_sar"], 2),
        "total_obligations_sar": round(verdict["total_obligations_sar"], 2),
        "salary_dbr": round(verdict["salary_dbr"], 4),
        "total_obligation_ratio": round(verdict["total_obligation_ratio"], 4),
        "salary_cap": verdict["salary_cap"],
        "total_cap": verdict["total_cap"],
        "loan_percent_income": round(verdict["loan_percent_income"], 4),
        "eligible_sama": verdict["eligible_sama"],
        # 1 = has an active financing request (requester cohort); 0 = no application on record.
        # See the docstring: for a non-requester, eligible_sama reads as "within caps on EXISTING
        # obligations (has headroom)", not "approved for a requested loan".
        "has_active_request": int(has_active_request),
    }


def _spender_multiplier(rng: np.random.Generator) -> float:
    """A persona-stable spending temperament: a low spender stays a low spender."""
    return float(np.clip(rng.normal(1.0, SPENDER_PROFILE_SD), 0.55, 1.6))


def _base_category_amounts(rng: np.random.Generator, persona: dict) -> dict[str, float]:
    """The persona's steady-state monthly amount per spending category (pre-noise)."""
    gross = persona["gross_salary_sar"]
    income_factor = gross / INCOME_SCALING_REFERENCE_SAR
    temperament = _spender_multiplier(rng)

    amounts: dict[str, float] = {}
    for category, spec in SPENDING_CATEGORIES.items():
        if category == "rent":
            amounts["rent"] = persona["rent_sar"]
            continue
        low, high = spec["band"]
        midpoint = rng.uniform(low, high)
        scaled = midpoint * (income_factor ** spec["elasticity"]) * temperament
        amounts[category] = float(np.clip(scaled, low * 0.5, high * 3.5))
    return amounts


def _build_months() -> list[pd.Timestamp]:
    return list(pd.date_range(start=HISTORY_START, periods=HISTORY_MONTHS, freq="MS"))


def _generate_history(
    rng: np.random.Generator, persona: dict, months: list[pd.Timestamp]
) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    """Builds one persona's 24-month ledger, monthly rollup, standing orders, direct debits.

    Single source of truth: the mortgage / loan / credit-card amounts written into the
    standing orders and direct debits are the SAME values used in the persona's obligation
    math -- they are read from the persona dict, never re-drawn.
    """
    account = persona["accountNumber"]
    gross = persona["gross_salary_sar"]
    base_amounts = _base_category_amounts(rng, persona)

    ledger: list[dict] = []
    monthly: list[dict] = []

    # Recurring obligations, straight from the persona (never re-randomized).
    mortgage = persona["mortgage_installment_sar"]
    other_loans = persona["other_loan_installments_sar"]
    card_minimum = persona["credit_card_min_payment_sar"]

    for month in months:
        ds = month.strftime("%Y-%m")
        salary_date = month.replace(day=27)  # Saudi salaries land near month-end.

        ledger.append(
            {
                "accountNumber": account,
                "transactionDateTime": salary_date.strftime("%Y-%m-%d"),
                "transactionAmount": round(gross, 2),
                "category": "salary",
                "transactionType": "CREDIT",
            }
        )

        spending_total = 0.0
        for category, base_amount in base_amounts.items():
            if base_amount <= 0:
                continue
            amount = base_amount * float(np.clip(rng.normal(1.0, SPENDING_NOISE_SD), 0.6, 1.5))
            spending_total += amount
            ledger.append(
                {
                    "accountNumber": account,
                    "transactionDateTime": month.replace(day=int(rng.integers(2, 26))).strftime("%Y-%m-%d"),
                    "transactionAmount": round(amount, 2),
                    "category": category,
                    "transactionType": "DEBIT",
                }
            )

        obligations_total = 0.0
        for category, amount in (
            ("mortgage_payment", mortgage),
            ("loan_installment", other_loans),
            ("credit_card_min_payment", card_minimum),
        ):
            if amount <= 0:
                continue
            obligations_total += amount
            ledger.append(
                {
                    "accountNumber": account,
                    "transactionDateTime": month.replace(day=5).strftime("%Y-%m-%d"),
                    "transactionAmount": round(amount, 2),
                    "category": category,
                    "transactionType": "DEBIT",
                }
            )

        outflow = spending_total + obligations_total
        monthly.append(
            {
                "accountNumber": account,
                "ds": ds,
                "income": round(gross, 2),
                "spending": round(outflow, 2),
                "y": round(gross - outflow, 2),
            }
        )

    # Standing orders (recurring transfers the customer sets up themselves).
    standing_orders: list[dict] = []
    if persona["has_mortgage"]:
        standing_orders.append(
            {"accountNumber": account, "type": "mortgage_payment", "amount": round(mortgage, 2), "frequency": "monthly"}
        )
    else:
        standing_orders.append(
            {"accountNumber": account, "type": "rent_payment", "amount": round(persona["rent_sar"], 2), "frequency": "monthly"}
        )

    typical_surplus = float(np.median([row["y"] for row in monthly]))
    if typical_surplus > SAVINGS_MIN_SURPLUS_SAR:
        standing_orders.append(
            {
                "accountNumber": account,
                "type": "savings_transfer",
                "amount": round(typical_surplus * SAVINGS_TRANSFER_SHARE, 2),
                "frequency": "monthly",
            }
        )

    # Direct debits (pulled by the creditor) — same amounts as the obligation math above.
    direct_debits: list[dict] = []
    if other_loans > 0:
        direct_debits.append(
            {"accountNumber": account, "type": "loan_installment", "amount": round(other_loans, 2), "frequency": "monthly"}
        )
    if card_minimum > 0:
        direct_debits.append(
            {
                "accountNumber": account,
                "type": "credit_card_min_payment",
                "amount": round(card_minimum, 2),
                "frequency": "monthly",
            }
        )
    direct_debits.append(
        {
            "accountNumber": account,
            "type": "subscription_debit",
            "amount": round(base_amounts["subscriptions"], 2),
            "frequency": "monthly",
        }
    )

    return ledger, monthly, standing_orders, direct_debits


def generate() -> dict[str, pd.DataFrame]:
    """Generates all individual personas and their coherent 24-month histories."""
    rng = np.random.default_rng(INDIVIDUALS_RANDOM_SEED)
    months = _build_months()

    personas, ledger, monthly, standing_orders, direct_debits = [], [], [], [], []

    def _add_persona(index: int, has_active_request: bool) -> None:
        persona = _build_persona(rng, index, has_active_request=has_active_request)
        personas.append(persona)
        persona_ledger, persona_monthly, persona_orders, persona_debits = _generate_history(
            rng, persona, months
        )
        ledger.extend(persona_ledger)
        monthly.extend(persona_monthly)
        standing_orders.extend(persona_orders)
        direct_debits.extend(persona_debits)

    # Cohort 1: requesters (indices 0..999) -- identical draws to before this change.
    for index in range(NUM_REQUESTER_PERSONAS):
        _add_persona(index, has_active_request=True)
    # Cohort 2: non-requesters (indices 1000..1179), appended so cohort 1's RNG is untouched.
    for offset in range(NUM_NON_REQUEST_PERSONAS):
        _add_persona(NUM_REQUESTER_PERSONAS + offset, has_active_request=False)

    frames = {
        "profiles": pd.DataFrame(personas),
        "ledger": pd.DataFrame(ledger),
        "monthly": pd.DataFrame(monthly),
        "standing_orders": pd.DataFrame(standing_orders),
        "direct_debits": pd.DataFrame(direct_debits),
    }

    DATA_RAW.mkdir(parents=True, exist_ok=True)
    DATA_PROCESSED.mkdir(parents=True, exist_ok=True)
    frames["ledger"].to_csv(RAW_TRANSACTIONS_CSV, index=False)
    frames["profiles"].to_csv(PROFILES_CSV, index=False)
    frames["monthly"].to_csv(MONTHLY_CLEAN_CSV, index=False)
    frames["standing_orders"].to_csv(STANDING_ORDERS_CSV, index=False)
    frames["direct_debits"].to_csv(DIRECT_DEBITS_CSV, index=False)

    return frames


def _print_distribution_report(profiles: pd.DataFrame, monthly: pd.DataFrame) -> None:
    """Prints the target-vs-actual mix for every distribution the spec pins down."""
    n = len(profiles)
    print(f"Generated {n} individual personas ({HISTORY_MONTHS} months each).\n")

    requesters = profiles[profiles["has_active_request"] == 1]
    non_requesters = profiles[profiles["has_active_request"] == 0]
    print("has_active_request (cohort split; non-requesters ~15% target):")
    print(f"  requesters      {len(requesters):>5}  ({len(requesters) / n * 100:4.1f}%)")
    print(f"  non-requesters  {len(non_requesters):>5}  ({len(non_requesters) / n * 100:4.1f}%)")
    ineligible_non_req = int((non_requesters["eligible_sama"] == 0).sum())
    print(f"  non-requesters already over caps on existing obligations (ceiling 0): {ineligible_non_req}\n")

    print("employment_type (target ~70% employee / ~30% retired):")
    for value, share in profiles["employment_type"].value_counts(normalize=True).items():
        print(f"  {value:<10} {share * 100:5.1f}%")

    print("\nincome_bracket (target ~40% / ~35% / ~25%):")
    labels = {1: "<=15k", 2: "15k-25k", 3: ">=25k"}
    for bracket in (1, 2, 3):
        share = (profiles["income_bracket"] == bracket).mean()
        print(f"  bracket {bracket} ({labels[bracket]:<8}) {share * 100:5.1f}%")

    print("\neligible_sama for REQUESTERS (computed OUTPUT, and reasonably balanced):")
    nr = len(requesters)
    for value, share in requesters["eligible_sama"].value_counts(normalize=True).sort_index().items():
        label = "eligible" if value == 1 else "not eligible"
        print(f"  {label:<13} {share * 100:5.1f}%  ({int(round(share * nr))} personas)")

    print("\nhousing (rent and mortgage are mutually exclusive by construction):")
    print(f"  mortgage      {profiles['has_mortgage'].mean() * 100:5.1f}%")
    both = ((profiles["has_mortgage"] == 1) & (profiles["rent_sar"] > 0)).sum()
    print(f"  paying BOTH rent and mortgage: {both} (must be 0)")

    print("\ngross salary (SAR/month):")
    gross = profiles["gross_salary_sar"]
    print(f"  mean={gross.mean():,.0f}  median={gross.median():,.0f}  "
          f"min={gross.min():,.0f}  max={gross.max():,.0f}")

    print("\nsalary_dbr (salary-linked obligations / gross, excl. real estate):")
    dbr = profiles["salary_dbr"]
    print(f"  mean={dbr.mean():.3f}  median={dbr.median():.3f}  min={dbr.min():.3f}  max={dbr.max():.3f}")

    print(f"\nmonthly rows: {len(monthly)}  (accounts: {monthly['accountNumber'].nunique()})")
    negative_months = (monthly["y"] < 0).mean()
    print(f"  months with a negative net flow: {negative_months * 100:.1f}%")


if __name__ == "__main__":
    result = generate()
    _print_distribution_report(result["profiles"], result["monthly"])
    print("\nWrote:")
    for path in (RAW_TRANSACTIONS_CSV, PROFILES_CSV, MONTHLY_CLEAN_CSV, STANDING_ORDERS_CSV, DIRECT_DEBITS_CSV):
        print(f"  {path.relative_to(ROOT_DIR)}")
