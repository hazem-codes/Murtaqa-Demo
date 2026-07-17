"""SME dataset generator — archetype-driven, cash-flow-based, internally consistent.

Replaces the old single-persona SME mock (scripts/generate_mock_data.py) with a population of
500 businesses. Per the project rules and the rules reference (section 7), SMEs are NOT scored with a
fixed DBR ratio -- no such official SAMA ratio exists. Readiness is cash-flow based:
  1. positive net cash flow over the last 3+ months,
  2. stable or increasing revenue growth,
  3. no predicted negative cash-flow month in the next 6 months.

Criterion 3 is deliberately NOT decided here -- it is left to the Prophet forecast in
sme_engine.py (Layer B1), which overlays the scheduled obligations generated below.

DESIGN PHILOSOPHY — same as the individuals generator: each business is one coherent story,
generated in strict dependency order, never independently randomized:

    size_tier -> employee_count -> annual_revenue -> sector -> health archetype
        -> 24 months of revenue + 8 expense categories (all scaled to revenue/headcount)
        -> derived cash-flow facts -> scheduled obligations -> letter of guarantee

HEALTH ARCHETYPES exist so the forecast engine has real negative examples: roughly 30% of
businesses fail at least one of the three criteria (declining revenue, a recent negative
net-cash-flow run, or a scheduled obligation that tips a forecast month negative).

Size tiers follow the official Kafalah classification (rules reference, section 7):
    micro  1-5 employees,   up to SAR 3M annual revenue
    small  6-49 employees,  SAR 3-40M
    medium 50-249 employees, SAR 40-200M

Outputs (all under data/processed/):
  sme_profiles.csv                one row per business (the SME dataset)
  sme_monthly_clean.csv           accountNumber, ds, revenue, expenses, net_cashflow
  sme_monthly_categorized.csv     accountNumber, ds, category, amount (expense breakdown)
  sme_scheduled_obligations.csv   accountNumber, ds, label, amount (future lumpy outflows)
  sme_letters_of_guarantee.csv    accountNumber, amount, purpose, expiry_date

Reproducible: every draw comes from SME_RANDOM_SEED.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_PROCESSED = ROOT_DIR / "data" / "processed"

SME_PROFILES_CSV = DATA_PROCESSED / "sme_profiles.csv"
SME_MONTHLY_CLEAN_CSV = DATA_PROCESSED / "sme_monthly_clean.csv"
SME_MONTHLY_CATEGORIZED_CSV = DATA_PROCESSED / "sme_monthly_categorized.csv"
SME_SCHEDULED_OBLIGATIONS_CSV = DATA_PROCESSED / "sme_scheduled_obligations.csv"
SME_LETTERS_OF_GUARANTEE_CSV = DATA_PROCESSED / "sme_letters_of_guarantee.csv"

SME_RANDOM_SEED = 42
NUM_BUSINESSES = 500
ACCOUNT_NUMBER_BASE = 300_000_001  # 300000001 is the demo persona (index 0).
DEMO_ACCOUNT = "300000001"

HISTORY_START = "2024-07"
HISTORY_MONTHS = 24  # 2024-07 .. 2026-06 (last complete month before "today", 2026-07).
FUTURE_SETTLEMENT_MONTH = "2026-08"  # inside the 6-month forward window -> a forecastable gap.

# ── Kafalah size tiers (rules reference, section 7) ─────────────────────────────────────
SIZE_TIERS = {
    "micro":  {"share": 0.60, "employees": (1, 5),    "annual_revenue": (400_000.0, 3_000_000.0)},
    "small":  {"share": 0.30, "employees": (6, 49),   "annual_revenue": (3_000_000.0, 40_000_000.0)},
    "medium": {"share": 0.10, "employees": (50, 249), "annual_revenue": (40_000_000.0, 200_000_000.0)},
}
SECTORS = ["trade", "services", "manufacturing"]

# ── Health archetypes (why ~30% of businesses fail at least one criterion) ──────────────
# healthy    : growing revenue, positive net, no scheduled gap -> passes all three.
# gap_risk   : healthy today, but a lumpy scheduled settlement tips a forecast month negative.
# declining  : shrinking revenue -> fails criterion 2 (and often 3).
# distressed : expenses have overtaken revenue recently -> fails criterion 1.
HEALTH_ARCHETYPES = {
    "healthy":    {"share": 0.74, "revenue_growth": (0.004, 0.014),  "net_margin": (0.12, 0.24)},
    "gap_risk":   {"share": 0.11, "revenue_growth": (0.002, 0.010),  "net_margin": (0.10, 0.20)},
    "declining":  {"share": 0.08, "revenue_growth": (-0.020, -0.006), "net_margin": (0.05, 0.15)},
    "distressed": {"share": 0.07, "revenue_growth": (-0.010, 0.004), "net_margin": (-0.08, -0.01)},
}
# A distressed business genuinely has bad unit economics, so its solved COGS share is allowed
# past the sector's healthy ceiling -- otherwise the clamp would quietly rescue it back into
# profit and the dataset would contain no real criterion-1 failures for the engine to learn from.
DISTRESSED_COGS_CEILING = 0.88

REVENUE_NOISE_SD = 0.04

# ── Expense model ──────────────────────────────────────────────────────────────────────
# Cost of goods / suppliers is the business's main margin lever, so it is the ONE component
# solved backwards from the archetype's target net margin (see _solve_cogs_share). Everything
# else stays a forward, structural function of headcount or revenue, exactly as specified.
# The sector bands below are the plausible range a solved share is clamped into, so a
# services firm never ends up with a trade firm's cost structure.
COGS_REVENUE_SHARE = {"trade": (0.45, 0.72), "services": (0.12, 0.38), "manufacturing": (0.35, 0.60)}
SALARY_PER_EMPLOYEE_SAR = (7_000.0, 16_000.0)   # monthly, per employee.
RENT_UTILITIES_REVENUE_SHARE = (0.04, 0.09)
PROFESSIONAL_SERVICES_REVENUE_SHARE = (0.008, 0.022)  # accounting / consulting.
LICENSES_FEES_MONTHLY_SAR = (600.0, 3_500.0)          # CR + municipality, amortized monthly.
VISA_IQAMA_COST_PER_EMPLOYEE_YEAR = 12_000.0          # distributed monthly.
VAT_RATE = 0.15                                        # 15% on the value added (revenue - COGS).
LOAN_INSTALLMENT_PROB = 0.45
LOAN_INSTALLMENT_REVENUE_SHARE = (0.02, 0.06)
EXPENSE_NOISE_SD = 0.04

EXPENSE_CATEGORIES = [
    "salaries_wages",
    "cogs_suppliers",
    "rent_utilities",
    "professional_services",
    "licenses_fees",
    "visa_iqama_costs",
    "vat",
    "loan_installments",
]

# ── Scheduled obligations (the lumpy future outflows the forecast overlays) ─────────────
SETTLEMENT_REVENUE_MULTIPLE = (0.75, 1.05)  # settlement sized against a month of revenue.
PAST_SETTLEMENT_SOFTENING = 0.25            # the past instance the business absorbed.

# ── Liquidity ──────────────────────────────────────────────────────────────────────────
CASH_RUNWAY_MONTHS_RANGE = {
    "healthy": (2.5, 6.0),
    "gap_risk": (2.0, 3.0),
    "declining": (1.5, 3.5),
    "distressed": (0.8, 2.5),
}

# ── Letters of guarantee (Open Banking realism; small/medium only) ──────────────────────
LETTER_OF_GUARANTEE_PROB = 0.20
LETTER_PURPOSES = ["ضمان تنفيذ عقد", "ضمان دفعة مقدمة", "ضمان ابتدائي لمناقصة"]
LETTER_AMOUNT_REVENUE_SHARE = (0.03, 0.10)  # of annual revenue.
LETTER_EXPIRY_MONTHS = (6, 24)

# ── The demo persona (account 300000001) — the SME activation-journey story ─────────────
# A micro retail-trade business: healthy and growing, but a bi-annual supplier settlement
# falls due in Aug 2026 and tips the forecasted August net negative. Keeps the same narrative
# structure as the previous single-persona mock (a designed, explainable liquidity gap).
DEMO_EMPLOYEES = 5
DEMO_ANNUAL_REVENUE = 2_460_000.0     # ~205k SAR/month -> micro tier.
DEMO_SECTOR = "trade"
DEMO_REVENUE_GROWTH = 0.008
DEMO_COGS_SHARE = 0.20                # this trade persona buys well; a deliberately high margin.
DEMO_SALARY_PER_EMPLOYEE = 13_200.0   # 5 employees -> ~66k/month payroll.
DEMO_RENT_UTILITIES = 23_000.0
DEMO_SETTLEMENT_SAR = 185_000.0
DEMO_CASH_BALANCE_SAR = 412_000.0


def _month_range(start: str, count: int) -> list[pd.Timestamp]:
    return list(pd.date_range(start=start, periods=count, freq="MS"))


def _pick(rng: np.random.Generator, table: dict) -> str:
    keys = list(table.keys())
    weights = [table[key]["share"] for key in keys]
    return str(rng.choice(keys, p=weights))


def _solve_cogs_share(
    monthly_revenue: float, fixed_costs: float, target_net_margin: float, sector: str, archetype: str
) -> float:
    """Solves the COGS share that yields the archetype's target net margin.

    With VAT charged on the value added, net cash flow is:
        net = (revenue - cogs) * (1 - VAT_RATE) - fixed_costs
    Setting net = target_margin * revenue and solving for cogs = share * revenue gives:
        share = 1 - (target_margin * revenue + fixed_costs) / ((1 - VAT_RATE) * revenue)
    The result is clamped to the sector's plausible band, so a solved share never produces an
    unrealistic cost structure -- a business clamped at its floor simply misses its target
    margin, which is why the printed report shows the ACTUAL realized margin.
    """
    denominator = (1.0 - VAT_RATE) * monthly_revenue
    if denominator <= 0:
        return float(np.mean(COGS_REVENUE_SHARE[sector]))
    share = 1.0 - (target_net_margin * monthly_revenue + fixed_costs) / denominator
    floor, ceiling = COGS_REVENUE_SHARE[sector]
    if archetype == "distressed":
        ceiling = DISTRESSED_COGS_CEILING
    return float(np.clip(share, floor, ceiling))


def _build_business(rng: np.random.Generator, index: int) -> dict:
    """Generates one business's scalar profile, field by dependent field."""
    account_number = str(ACCOUNT_NUMBER_BASE + index)
    is_demo = account_number == DEMO_ACCOUNT

    if is_demo:
        size_tier, sector, archetype = "micro", DEMO_SECTOR, "gap_risk"
        employee_count = DEMO_EMPLOYEES
        annual_revenue = DEMO_ANNUAL_REVENUE
        revenue_growth = DEMO_REVENUE_GROWTH
        salary_per_employee = DEMO_SALARY_PER_EMPLOYEE
    else:
        # 1-3. Tier -> headcount -> revenue (revenue correlates with headcount within the tier).
        size_tier = _pick(rng, SIZE_TIERS)
        tier = SIZE_TIERS[size_tier]
        employee_low, employee_high = tier["employees"]
        employee_count = int(rng.integers(employee_low, employee_high + 1))

        revenue_low, revenue_high = tier["annual_revenue"]
        headcount_position = (employee_count - employee_low) / max(1, employee_high - employee_low)
        # Revenue tracks headcount, with real variance around it (never a rigid function).
        centre = revenue_low + headcount_position * (revenue_high - revenue_low)
        spread = (revenue_high - revenue_low) * 0.22
        annual_revenue = float(np.clip(rng.normal(centre, spread), revenue_low, revenue_high))

        # 4. Sector, then the health archetype that shapes the whole series.
        sector = str(rng.choice(SECTORS))
        archetype = _pick(rng, HEALTH_ARCHETYPES)
        revenue_growth = float(rng.uniform(*HEALTH_ARCHETYPES[archetype]["revenue_growth"]))
        salary_per_employee = float(rng.uniform(*SALARY_PER_EMPLOYEE_SAR))

    # 5. Cost structure. Everything except COGS is a forward function of headcount or revenue.
    monthly_revenue = annual_revenue / 12.0
    salaries = employee_count * salary_per_employee
    rent_utilities = (
        DEMO_RENT_UTILITIES
        if is_demo
        else monthly_revenue * float(rng.uniform(*RENT_UTILITIES_REVENUE_SHARE))
    )
    professional_services = monthly_revenue * float(rng.uniform(*PROFESSIONAL_SERVICES_REVENUE_SHARE))
    licenses_fees = float(rng.uniform(*LICENSES_FEES_MONTHLY_SAR))
    visa_iqama_costs = employee_count * VISA_IQAMA_COST_PER_EMPLOYEE_YEAR / 12.0
    has_loan = is_demo or bool(rng.random() < LOAN_INSTALLMENT_PROB)
    loan_installments = (
        monthly_revenue * float(rng.uniform(*LOAN_INSTALLMENT_REVENUE_SHARE)) if has_loan else 0.0
    )

    fixed_costs = (
        salaries + rent_utilities + professional_services + licenses_fees + visa_iqama_costs + loan_installments
    )
    if is_demo:
        cogs_share = DEMO_COGS_SHARE
    else:
        target_net_margin = float(rng.uniform(*HEALTH_ARCHETYPES[archetype]["net_margin"]))
        cogs_share = _solve_cogs_share(monthly_revenue, fixed_costs, target_net_margin, sector, archetype)

    return {
        "accountNumber": account_number,
        "business_size_tier": size_tier,
        "employee_count": employee_count,
        "annual_revenue_sar": round(annual_revenue, 2),
        "sector": sector,
        "health_archetype": archetype,
        "_revenue_growth": revenue_growth,
        "_cogs_share": cogs_share,
        "_costs": {
            "salaries_wages": salaries,
            "rent_utilities": rent_utilities,
            "professional_services": professional_services,
            "licenses_fees": licenses_fees,
            "visa_iqama_costs": visa_iqama_costs,
            "loan_installments": loan_installments,
        },
        "_is_demo": is_demo,
    }


def _generate_series(
    rng: np.random.Generator, business: dict, months: list[pd.Timestamp]
) -> tuple[list[dict], list[dict], list[dict]]:
    """Builds one business's 24-month cash-flow series and its expense breakdown."""
    account = business["accountNumber"]
    is_demo = business["_is_demo"]
    base_monthly_revenue = business["annual_revenue_sar"] / 12.0
    growth = business["_revenue_growth"]
    cogs_share = business["_cogs_share"]

    costs = business["_costs"]
    salaries_base = costs["salaries_wages"]
    rent_base = costs["rent_utilities"]
    professional_base = costs["professional_services"]
    licenses_base = costs["licenses_fees"]
    visa_iqama_base = costs["visa_iqama_costs"]
    loan_installment = costs["loan_installments"]

    # The past instance of the lumpy settlement (softened -- the business absorbed it).
    settlement = (
        DEMO_SETTLEMENT_SAR
        if is_demo
        else base_monthly_revenue * float(rng.uniform(*SETTLEMENT_REVENUE_MULTIPLE))
    )
    has_scheduled_gap = business["health_archetype"] == "gap_risk"
    past_settlement_month = months[-5].strftime("%Y-%m")  # a visible past instance in history.

    clean_rows: list[dict] = []
    category_rows: list[dict] = []

    for i, month in enumerate(months):
        ds = month.strftime("%Y-%m")
        revenue = (
            base_monthly_revenue
            * ((1.0 + growth) ** i)
            * (1.0 + float(rng.normal(0.0, REVENUE_NOISE_SD)))
        )

        cogs = revenue * cogs_share * (1.0 + float(rng.normal(0.0, EXPENSE_NOISE_SD)))
        salaries = salaries_base * (1.0 + float(rng.normal(0.0, EXPENSE_NOISE_SD / 2)))
        rent_utilities = rent_base * (1.0 + float(rng.normal(0.0, EXPENSE_NOISE_SD)))
        professional = professional_base * (1.0 + float(rng.normal(0.0, EXPENSE_NOISE_SD)))
        licenses = licenses_base
        visa_iqama = visa_iqama_base
        # VAT is charged on the value added (revenue net of purchased goods), per the 15% rate.
        vat = max(0.0, revenue - cogs) * VAT_RATE

        if has_scheduled_gap and ds == past_settlement_month:
            cogs += settlement * PAST_SETTLEMENT_SOFTENING

        by_category = {
            "salaries_wages": salaries,
            "cogs_suppliers": cogs,
            "rent_utilities": rent_utilities,
            "professional_services": professional,
            "licenses_fees": licenses,
            "visa_iqama_costs": visa_iqama,
            "vat": vat,
            "loan_installments": loan_installment,
        }
        expenses = sum(by_category.values())

        clean_rows.append(
            {
                "accountNumber": account,
                "ds": ds,
                "revenue": round(revenue, 2),
                "expenses": round(expenses, 2),
                "net_cashflow": round(revenue - expenses, 2),
            }
        )
        for category, amount in by_category.items():
            if amount <= 0:
                continue
            category_rows.append(
                {"accountNumber": account, "ds": ds, "category": category, "amount": round(amount, 2)}
            )

    # Scheduled obligations — the SAME values that drive the forecast overlay downstream.
    scheduled: list[dict] = []
    if has_scheduled_gap:
        scheduled.append(
            {
                "accountNumber": account,
                "ds": FUTURE_SETTLEMENT_MONTH,
                "label": "تسوية المورد النصف سنوية",
                "type": "supplier_settlement",
                "amount": round(settlement, 2),
            }
        )

    return clean_rows, category_rows, scheduled


def _recurring_obligations(business: dict, clean_rows: list[dict], category_rows: list[dict]) -> list[dict]:
    """payroll_run / rent_payment / loan_installment — read back from the SAME generated series."""
    account = business["accountNumber"]
    last_month = clean_rows[-1]["ds"]
    latest = {row["category"]: row["amount"] for row in category_rows if row["ds"] == last_month}

    rows = [
        {"accountNumber": account, "type": "payroll_run", "amount": round(latest.get("salaries_wages", 0.0), 2), "frequency": "monthly"},
        {"accountNumber": account, "type": "rent_payment", "amount": round(latest.get("rent_utilities", 0.0), 2), "frequency": "monthly"},
    ]
    loan = latest.get("loan_installments", 0.0)
    if loan > 0:
        rows.append(
            {"accountNumber": account, "type": "loan_installment", "amount": round(loan, 2), "frequency": "monthly"}
        )
    return rows


def _derive_cashflow_facts(clean_rows: list[dict]) -> dict:
    """Criteria 1 and 2, derived from the ACTUAL generated series (never pre-assigned)."""
    nets = [row["net_cashflow"] for row in clean_rows]
    revenues = [row["revenue"] for row in clean_rows]

    cashflow_positive_3m = bool(all(net > 0 for net in nets[-3:]))

    # Revenue trend = OLS slope over the 24-month series, expressed as % of mean revenue.
    x = np.arange(len(revenues), dtype=float)
    slope = float(np.polyfit(x, revenues, 1)[0])
    mean_revenue = float(np.mean(revenues)) or 1.0
    revenue_growth_trend_pct = slope / mean_revenue * 100.0

    realized_net_margin = float(np.mean(nets)) / mean_revenue * 100.0

    return {
        "cashflow_positive_3m": int(cashflow_positive_3m),
        "revenue_growth_trend_pct": round(revenue_growth_trend_pct, 3),
        "revenue_growing": int(revenue_growth_trend_pct >= 0),
        "net_margin_pct": round(realized_net_margin, 2),
        "avg_monthly_expenses_sar": round(float(np.mean([r["expenses"] for r in clean_rows][-6:])), 2),
    }


def _letter_of_guarantee(rng: np.random.Generator, business: dict, last_month: str) -> dict | None:
    """~20% of small/medium businesses hold an outstanding letter of guarantee."""
    if business["business_size_tier"] == "micro":
        return None
    if rng.random() >= LETTER_OF_GUARANTEE_PROB:
        return None
    amount = business["annual_revenue_sar"] * float(rng.uniform(*LETTER_AMOUNT_REVENUE_SHARE))
    expiry = pd.Timestamp(last_month + "-01") + pd.DateOffset(
        months=int(rng.integers(*LETTER_EXPIRY_MONTHS))
    )
    return {
        "accountNumber": business["accountNumber"],
        "amount": round(amount, 2),
        "purpose": str(rng.choice(LETTER_PURPOSES)),
        "expiry_date": expiry.strftime("%Y-%m"),
    }


def generate() -> dict[str, pd.DataFrame]:
    """Generates all 500 businesses and their coherent 24-month cash-flow histories."""
    rng = np.random.default_rng(SME_RANDOM_SEED)
    months = _month_range(HISTORY_START, HISTORY_MONTHS)

    profiles, clean, categorized, scheduled, letters = [], [], [], [], []

    for index in range(NUM_BUSINESSES):
        business = _build_business(rng, index)
        clean_rows, category_rows, scheduled_rows = _generate_series(rng, business, months)

        facts = _derive_cashflow_facts(clean_rows)
        runway_low, runway_high = CASH_RUNWAY_MONTHS_RANGE[business["health_archetype"]]
        cash_balance = (
            DEMO_CASH_BALANCE_SAR
            if business["_is_demo"]
            else facts["avg_monthly_expenses_sar"] * float(rng.uniform(runway_low, runway_high))
        )

        letter = _letter_of_guarantee(rng, business, months[-1].strftime("%Y-%m"))
        if letter:
            letters.append(letter)

        profiles.append(
            {
                "accountNumber": business["accountNumber"],
                "business_size_tier": business["business_size_tier"],
                "employee_count": business["employee_count"],
                "annual_revenue_sar": business["annual_revenue_sar"],
                "sector": business["sector"],
                "health_archetype": business["health_archetype"],
                "cash_balance_sar": round(cash_balance, 2),
                "has_letter_of_guarantee": int(letter is not None),
                "history_start": HISTORY_START,
                "history_months": HISTORY_MONTHS,
                **facts,
            }
        )
        clean.extend(clean_rows)
        categorized.extend(category_rows)
        scheduled.extend(scheduled_rows)
        scheduled_recurring = _recurring_obligations(business, clean_rows, category_rows)
        letters_placeholder = scheduled_recurring  # recurring rows live in their own frame below.
        profiles[-1]["monthly_payroll_sar"] = letters_placeholder[0]["amount"]
        profiles[-1]["monthly_rent_sar"] = letters_placeholder[1]["amount"]

    frames = {
        "profiles": pd.DataFrame(profiles),
        "clean": pd.DataFrame(clean),
        "categorized": pd.DataFrame(categorized),
        "scheduled": pd.DataFrame(scheduled),
        "letters": pd.DataFrame(letters),
    }

    DATA_PROCESSED.mkdir(parents=True, exist_ok=True)
    frames["profiles"].to_csv(SME_PROFILES_CSV, index=False)
    frames["clean"].to_csv(SME_MONTHLY_CLEAN_CSV, index=False)
    frames["categorized"].to_csv(SME_MONTHLY_CATEGORIZED_CSV, index=False)
    frames["scheduled"].to_csv(SME_SCHEDULED_OBLIGATIONS_CSV, index=False)
    frames["letters"].to_csv(SME_LETTERS_OF_GUARANTEE_CSV, index=False)

    return frames


def _print_report(frames: dict[str, pd.DataFrame]) -> None:
    profiles = frames["profiles"]
    n = len(profiles)
    print(f"Generated {n} SME personas ({HISTORY_MONTHS} months each).\n")

    print("business_size_tier (target ~60% micro / ~30% small / ~10% medium):")
    for tier in ("micro", "small", "medium"):
        print(f"  {tier:<8} {(profiles['business_size_tier'] == tier).mean() * 100:5.1f}%")

    print("\nsector (target roughly even):")
    for sector, share in profiles["sector"].value_counts(normalize=True).items():
        print(f"  {sector:<15} {share * 100:5.1f}%")

    print("\nhealth archetype (with the REALIZED net margin, not the target):")
    for archetype, share in profiles["health_archetype"].value_counts(normalize=True).items():
        margin = profiles[profiles["health_archetype"] == archetype]["net_margin_pct"].mean()
        print(f"  {archetype:<11} {share * 100:5.1f}%   avg net margin {margin:+6.1f}%")

    print("\nderived cash-flow criteria (computed from the ACTUAL generated series):")
    fails_c1 = (profiles["cashflow_positive_3m"] == 0).mean()
    fails_c2 = (profiles["revenue_growing"] == 0).mean()
    has_gap = (profiles["health_archetype"] == "gap_risk").mean()
    fails_any = (
        (profiles["cashflow_positive_3m"] == 0)
        | (profiles["revenue_growing"] == 0)
        | (profiles["health_archetype"] == "gap_risk")
    ).mean()
    print(f"  fails criterion 1 (positive net cash flow, last 3m): {fails_c1 * 100:5.1f}%")
    print(f"  fails criterion 2 (revenue stable/growing)        : {fails_c2 * 100:5.1f}%")
    print(f"  carries a scheduled gap (criterion 3 at risk)     : {has_gap * 100:5.1f}%")
    print(f"  FAILS AT LEAST ONE criterion (target ~25-30%)     : {fails_any * 100:5.1f}%")

    print(f"\nletters of guarantee: {int(profiles['has_letter_of_guarantee'].sum())} "
          f"({profiles['has_letter_of_guarantee'].mean() * 100:.1f}% of all; small/medium only)")

    demo = profiles[profiles["accountNumber"] == DEMO_ACCOUNT].iloc[0]
    demo_clean = frames["clean"][frames["clean"]["accountNumber"] == DEMO_ACCOUNT]
    demo_scheduled = frames["scheduled"][frames["scheduled"]["accountNumber"] == DEMO_ACCOUNT]
    print(f"\nDemo persona {DEMO_ACCOUNT} ({demo['business_size_tier']}, {demo['sector']}):")
    print(f"  employees                : {demo['employee_count']}")
    print(f"  annual revenue           : SAR {demo['annual_revenue_sar']:,.0f}")
    print(f"  last month revenue       : SAR {demo_clean['revenue'].iloc[-1]:,.0f}")
    print(f"  last month expenses      : SAR {demo_clean['expenses'].iloc[-1]:,.0f}")
    print(f"  last month net           : SAR {demo_clean['net_cashflow'].iloc[-1]:,.0f}")
    print(f"  positive net, last 3m    : {bool(demo['cashflow_positive_3m'])}")
    print(f"  revenue trend            : {demo['revenue_growth_trend_pct']:+.2f}% of mean revenue/month")
    print(f"  cash balance             : SAR {demo['cash_balance_sar']:,.0f}")
    print(f"  avg monthly expenses (6m): SAR {demo['avg_monthly_expenses_sar']:,.0f}")
    print(f"  implied runway           : {demo['cash_balance_sar'] / demo['avg_monthly_expenses_sar']:.1f} months")
    if len(demo_scheduled):
        row = demo_scheduled.iloc[0]
        print(f"  scheduled settlement     : SAR {row['amount']:,.0f} in {row['ds']}")

    print("\nWrote:")
    for path in (
        SME_PROFILES_CSV,
        SME_MONTHLY_CLEAN_CSV,
        SME_MONTHLY_CATEGORIZED_CSV,
        SME_SCHEDULED_OBLIGATIONS_CSV,
        SME_LETTERS_OF_GUARANTEE_CSV,
    ):
        print(f"  {path.relative_to(ROOT_DIR)}")


if __name__ == "__main__":
    import sys

    sys.stdout.reconfigure(encoding="utf-8")
    _print_report(generate())
