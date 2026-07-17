"""FastAPI bridge — connects the React frontend to the real Python engines.

This module is the single HTTP boundary between `frontend/` and the Layer 1/2/3
engines in `scripts/`. Every endpoint calls a real engine:

    /api/individuals/overview      -> forecast_engine (Layer 1) + categorized data
    /api/individuals/transactions  -> real per-month category data for the demo account
    /api/individuals/eligibility   -> counterfactual_engine (Layer 2) + advisor_engine (Layer 3)
    /api/individuals/chat          -> advisor_engine narration (Layer 3, ALLaM)
    /api/business/*                -> sme_engine (Layers B1/B2) + SME narration

DEMO IDENTITY (unified 2026-07-12): the individuals demo used to need TWO personas -- one
account for the forecast/categories (from the transaction dataset) and a separate loan profile
for eligibility (from an unrelated Kaggle loan dataset) -- because no key joined them. The
generated dataset makes every persona a single coherent story, so ONE account now drives every
individual screen: 100000009, an employee whose salary-linked DBR (41%) breaches SAMA's 33.33%
cap even though his total-obligations ratio (61.9%) stays under his 65% mortgage-holder cap.
That is the clearest possible illustration of why the two ratios are not the same check.

DERIVED-VALUE HONESTY NOTE (important, read before trusting a number):
The engines produce a small, exact set of numbers. The frontend UI was designed around richer
content (an eligibility gauge score, a financing ceiling, per-path pros/cons/timeline,
difficulty/duration). Where an engine produces the number, it is served verbatim. Where it does
not, this bridge computes a clearly-labelled *proxy* from real inputs using only constants that
appear in the SAMA rules reference (the salary caps, the total-obligation caps, the 60-month max
term). No SAMA-defined score exists for the eligibility gauge, so that proxy is a simplification,
not ground truth. Every proxy is listed in docs/Frontend_Backend_Integration_Report.md.
"""

from __future__ import annotations

import json
import sys
from functools import lru_cache
from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).resolve().parent
SCRIPTS_DIR = ROOT_DIR / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

import advisor_engine as ae  # noqa: E402
import category_engine as cat  # noqa: E402
import counterfactual_engine as ce  # noqa: E402
import forecast_engine as fe  # noqa: E402
import roadmap_engine as rme  # noqa: E402
import sama_rules  # noqa: E402
import sme_engine as se  # noqa: E402

DATA_PROCESSED = ROOT_DIR / "data" / "processed"
CATEGORIZED_CSV = DATA_PROCESSED / "individuals_monthly_categorized.csv"
PROFILES_CSV = DATA_PROCESSED / "individuals_profiles.csv"
SME_PROFILES_CSV = DATA_PROCESSED / "sme_profiles.csv"
BACKUP_NARRATIONS_PATH = DATA_PROCESSED / "demo_backup_narrations.json"

# ── Demo identity: one persona drives every individual screen ────────────────
# Every endpoint also accepts ?account=<n>, so the frontend's account browser can load ANY of
# the 1000 individuals / 500 businesses live. The demo accounts are simply the DEFAULT, and the
# only ones with pre-baked ALLaM content (see the narration/plans notes further down).
DEMO_ACCOUNT = "100000009"
DEMO_SME_ACCOUNT = se.SME_ACCOUNT


@lru_cache(maxsize=1024)
def _profile(account: str) -> dict:
    """One persona's raw feature dict, loaded from the generated dataset."""
    return ce.load_profile(account)


def _demo_profile() -> dict:
    return _profile(DEMO_ACCOUNT)


@lru_cache(maxsize=1)
def _individual_accounts() -> list[dict]:
    """The full browsable list of all 1000 individuals, with identifying labels."""
    df = pd.read_csv(PROFILES_CSV, dtype={"accountNumber": str})
    return [
        {
            "accountNumber": row["accountNumber"],
            "age": int(row["age"]),
            "employmentType": str(row["employment_type"]),
            "incomeBracket": int(row["income_bracket"]),
            "housingStatus": str(row["housing_status"]),
            "grossSalary": round(float(row["gross_salary_sar"])),
            "salaryDbr": round(float(row["salary_dbr"]) * 100, 1),
            "eligible": bool(int(row["eligible_sama"])),
            # 2026-07-15: non-requesters (no financing application) — the browser can label them.
            "hasActiveRequest": bool(int(row["has_active_request"])) if "has_active_request" in df.columns else True,
        }
        for _, row in df.iterrows()
    ]


@lru_cache(maxsize=1)
def _business_accounts() -> list[dict]:
    """The full browsable list of all 500 SMEs, with identifying labels."""
    df = pd.read_csv(SME_PROFILES_CSV, dtype={"accountNumber": str})
    return [
        {
            "accountNumber": row["accountNumber"],
            "sizeTier": str(row["business_size_tier"]),
            "sector": str(row["sector"]),
            "employees": int(row["employee_count"]),
            "annualRevenue": round(float(row["annual_revenue_sar"])),
            "healthArchetype": str(row["health_archetype"]),
            # The two criteria derivable without a forecast; criterion 3 needs Prophet, so the
            # list shows the cheap signals and the readiness screen shows the real verdict.
            "cashflowPositive3m": bool(int(row["cashflow_positive_3m"])),
            "revenueGrowing": bool(int(row["revenue_growing"])),
        }
        for _, row in df.iterrows()
    ]


# ── Presentation maps (labels/colours only — no numbers) ─────────────────────
CATEGORY_AR = cat.CATEGORY_LABELS_AR
CATEGORY_ICON = {
    "rent": "home",
    "electricity_water_gas": "bill",
    "internet_mobile": "bill",
    "groceries": "shopping",
    "dining_cafes": "food",
    "transport_fuel": "shopping",
    "healthcare_insurance": "shopping",
    "subscriptions": "play",
    "shopping_clothing": "shopping",
    "entertainment": "play",
}
# Mirrors frontend CATEGORY_COLORS, extended to the 8 real category slugs.
CATEGORY_COLORS = [
    "#9B7050", "#C5A570", "#3A4B56", "#52796F",
    "#7FA07C", "#8B5E3C", "#B8855A", "#5E8B87",
]
ARABIC_MONTHS = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
]

ACTIONABLE_LABEL_AR = {
    "requested_loan_amount_sar": "مبلغ التمويل المطلوب",
    "loan_int_rate": "معدل الفائدة",
    "other_loan_installments_sar": "أقساط القروض الأخرى",
    "credit_card_min_payment_sar": "الحد الأدنى لسداد البطاقة",
}
ACTIONABLE_UNIT_AR = {
    "requested_loan_amount_sar": "ريال",
    "other_loan_installments_sar": "ريال",
    "credit_card_min_payment_sar": "ريال",
    "loan_int_rate": "٪",
}
DIFFICULTY_DURATION = {"سهل": "1–2 شهر", "متوسط": "3–6 أشهر", "صعب": "6–9 أشهر"}

# ── Coffee Index (behavioral nudge): connect Layer-1 spend with Layer-2 paths ──
MONTHLY_OBLIGATION_LEVERS = ("other_loan_installments_sar", "credit_card_min_payment_sar")
DISCRETIONARY_CATEGORIES = ("dining_cafes", "entertainment", "shopping_clothing", "subscriptions")
COFFEE_INDEX_MAX_PCT = 55  # only nudge when the saving is <= 55% of the discretionary budget.

# ── AI Savings Advisor — essential household categories are "needs", the discretionary ones
# above are "wants". Debt obligations count as needs too. ─────────────────────────────────
ESSENTIAL_CATEGORIES = (
    "rent",
    "electricity_water_gas",
    "internet_mobile",
    "groceries",
    "transport_fuel",
    "healthcare_insurance",
)

# Strategy library. Each is a generic personal-budgeting framework (NOT a SAMA rule): three
# buckets — needs / wants / savings — whose ratios sum to 1.0. The AI picks a KEY from this
# library for the user's goal; Python computes the riyal amounts from the chosen key's ratios.
SAVINGS_STRATEGIES: dict[str, dict] = {
    "balanced_50_30_20": {"name": "التوازن الكلاسيكي 50/30/20", "ratios": (0.50, 0.30, 0.20),
        "tagline": "توزيع متوازن يناسب الأوضاع المستقرة."},
    "balanced_growth_50_25_25": {"name": "النمو المتوازن 50/25/25", "ratios": (0.50, 0.25, 0.25),
        "tagline": "توازن مع دفعة ادخارية أعلى قليلاً."},
    "relaxed_60_30_10": {"name": "المرن 60/30/10", "ratios": (0.60, 0.30, 0.10),
        "tagline": "مساحة أوسع للمصاريف عند ضيق الدخل."},
    "saver_50_20_30": {"name": "المدّخر 50/20/30", "ratios": (0.50, 0.20, 0.30),
        "tagline": "يرفع الادخار بضبط الرغبات."},
    "aggressive_50_15_35": {"name": "المكثّف 50/15/35", "ratios": (0.50, 0.15, 0.35),
        "tagline": "ادخار مرتفع لتحقيق هدف بسرعة."},
    "very_aggressive_45_10_45": {"name": "المتشدّد 45/10/45", "ratios": (0.45, 0.10, 0.45),
        "tagline": "أقصى تسريع للهدف مع تقشّف واضح."},
    "debt_crusher_60_10_30": {"name": "قاهر الديون 60/10/30", "ratios": (0.60, 0.10, 0.30),
        "tagline": "يوجّه فائضاً كبيراً لسداد الديون."},
    "debt_free_65_5_30": {"name": "التحرر من الدين 65/5/30", "ratios": (0.65, 0.05, 0.30),
        "tagline": "للالتزامات الثقيلة: تقشّف حاد وسداد مكثّف."},
    "emergency_builder_55_15_30": {"name": "درع الطوارئ 55/15/30", "ratios": (0.55, 0.15, 0.30),
        "tagline": "يبني صندوق طوارئ في وقت معقول."},
    "goal_focused_55_20_25": {"name": "نحو الهدف 55/20/25", "ratios": (0.55, 0.20, 0.25),
        "tagline": "لأهداف الشراء متوسطة المدى (سيارة، مناسبة)."},
    "home_saver_50_15_35": {"name": "نحو المنزل 50/15/35", "ratios": (0.50, 0.15, 0.35),
        "tagline": "يراكم دفعة أولى لمسكن بأسرع وتيرة واقعية."},
    "comfort_50_35_15": {"name": "أسلوب حياة مريح 50/35/15", "ratios": (0.50, 0.35, 0.15),
        "tagline": "يحافظ على جودة الحياة مع ادخار ثابت."},
}
DEFAULT_STRATEGY = "balanced_50_30_20"

# The predefined goal chips + the deterministic best-fit strategy used as the fallback when the
# AI selection fails (bad key / guard rejects). Custom ("other") goals default to balanced.
SAVINGS_GOALS: list[dict] = [
    {"key": "emergency_fund", "label": "صندوق طوارئ", "fallback": "emergency_builder_55_15_30"},
    {"key": "debt_payoff", "label": "سداد مبكر للديون", "fallback": "debt_crusher_60_10_30"},
    {"key": "car", "label": "شراء سيارة", "fallback": "goal_focused_55_20_25"},
    {"key": "wedding", "label": "زواج", "fallback": "goal_focused_55_20_25"},
    {"key": "home", "label": "دفعة أولى لمنزل", "fallback": "home_saver_50_15_35"},
]
_GOAL_FALLBACK = {g["key"]: g["fallback"] for g in SAVINGS_GOALS}
_GOAL_LABEL = {g["key"]: g["label"] for g in SAVINGS_GOALS}

CANNED_CHAT_REPLY = (
    "شكراً على سؤالك. أوضح فرصة لديك هي خفض نسبة الاستقطاع (DBR) عبر أحد المسارات "
    "المقترحة في صفحة الأهلية، ما يرفع سقف تمويلك المتاح. هل تريد أن أعرض لك الخطوات التفصيلية؟"
)


# ── Small helpers ────────────────────────────────────────────────────────────
def _fmt_sar(value: float) -> str:
    """Mirrors the frontend formatSAR: '15,500 ر.س' with western digits."""
    sign = "-" if value < 0 else ""
    return f"{sign}{abs(round(value)):,} ر.س"


def _arabic_month(ds: str) -> str:
    """'2017-01' -> 'يناير' (month name only, matching the mock series labels)."""
    month_index = int(ds.split("-")[1]) - 1
    return ARABIC_MONTHS[month_index % 12]


def _eligibility_score(dbr: float) -> int:
    """UI gauge proxy (0-100) from a real DBR. NOT a SAMA-defined score — see module docstring."""
    return max(0, min(100, round((1.0 - dbr) * 100)))


def _max_financeable_loan(profile: dict, changed: dict | None = None) -> int:
    """The maximum NEW loan principal this persona can take and still clear BOTH SAMA caps.

    "Available financing" is defined as the largest loan the persona could take given their
    OTHER obligations only -- it deliberately EXCLUDES the requested loan itself. That is the
    fix for the incoherence this used to produce: the previous version fed the headroom formula
    a DBR that already INCLUDED the loan being requested (or, for a path, the path's own reduced
    loan), so it actually returned "how much MORE you could borrow on top of that loan" -- a
    mixed-state figure that contradicted the very loan amount shown beside it on the card.

    Because it excludes the requested loan, this number is a stable ceiling: it does not change
    when the persona (or a path) changes only the requested loan amount, and it rises only when
    an obligation is paid down or the rate is negotiated. `changed` overlays a path's lever
    values so the SAME definition gives current_available (no overlay) and a path's
    resulting_available (with overlay).

    Uses BOTH caps -- the salary-linked cap (excl. mortgage) AND the total-obligations cap
    (incl. mortgage) -- taking whichever binds first, mirroring sama_rules.evaluate(). The
    previous version only checked the salary cap, which could overstate the ceiling for a
    mortgage holder whose total cap binds first. Still a proxy (it assumes the full headroom is
    taken over the 60-month max term) and flagged as such in the integration report.
    """
    merged = {**profile, **(changed or {})}
    gross = float(merged["gross_salary_sar"])
    mortgage = float(merged["mortgage_installment_sar"])
    fixed_salary_linked = (
        float(merged["other_loan_installments_sar"]) + float(merged["credit_card_min_payment_sar"])
    )
    rate = float(merged["loan_int_rate"])
    term = int(merged.get("loan_term_months", sama_rules.MAX_FINANCE_TERM_MONTHS))

    bracket = sama_rules.income_bracket(gross)
    applicable_salary_cap = sama_rules.salary_cap(str(merged["employment_type"]))
    applicable_total_cap = sama_rules.total_cap(mortgage > 0, bracket)

    # The new-loan installment must fit under BOTH caps once the other obligations are counted.
    headroom_salary = applicable_salary_cap * gross - fixed_salary_linked
    headroom_total = applicable_total_cap * gross - fixed_salary_linked - mortgage
    allowed_installment = min(headroom_salary, headroom_total)
    if allowed_installment <= 0:
        return 0

    principal = sama_rules.principal_from_installment(allowed_installment, rate, term)
    return int(round(principal / 1000.0) * 1000)


def _ceiling_breakdown(profile: dict) -> dict:
    """The SAMA components behind _max_financeable_loan, for the ceiling tooltip.

    Every value comes straight from sama_rules and the persona's own obligation fields -- no new
    heuristics. `binding` is whichever cap leaves the smaller monthly headroom (the one that
    actually limits how much this persona can borrow). The obligations counted here EXCLUDE the
    requested loan itself, exactly as the ceiling does, so the tooltip explains the same number.
    """
    gross = float(profile["gross_salary_sar"])
    mortgage = float(profile["mortgage_installment_sar"])
    fixed = float(profile["other_loan_installments_sar"]) + float(profile["credit_card_min_payment_sar"])
    bracket = sama_rules.income_bracket(gross)
    salary_cap_frac = sama_rules.salary_cap(str(profile["employment_type"]))
    total_cap_frac = sama_rules.total_cap(mortgage > 0, bracket)

    headroom_salary = salary_cap_frac * gross - fixed
    headroom_total = total_cap_frac * gross - fixed - mortgage
    binding = "salary" if headroom_salary <= headroom_total else "total"

    return {
        "binding": binding,
        "gross": round(gross),
        "salary_cap_pct": round(salary_cap_frac * 100, 2),
        "total_cap_pct": round(total_cap_frac * 100),
        "salary_cap_sar": round(salary_cap_frac * gross),
        "total_cap_sar": round(total_cap_frac * gross),
        "salary_fixed_obl": round(fixed),               # other loans + card min (excl. new loan)
        "total_fixed_obl": round(fixed + mortgage),     # + mortgage, for the total cap
        "salary_headroom": round(headroom_salary),
        "total_headroom": round(headroom_total),
    }


def _riyal(n: float) -> str:
    """Plain '15,754 ريال' formatting for inline use in explanation copy (western digits)."""
    return f"{round(n):,} ريال"


def _ceiling_explanation(
    profile: dict,
    current_available: int,
    already_eligible: bool = False,
    no_request: bool = False,
    indicative_rate: float | None = None,
) -> str:
    """Honest, deterministic, LLM-free tooltip for the ceiling tile.

    States plainly it is NOT an approval, names the binding SAMA cap, and walks the exact
    components (cap % -> cap SAR -> current obligations -> monthly headroom -> ceiling). Every
    number is one the backend already computes, so it can never drift from the tile above it.

    Three headlines share the same binding-cap detail line:
      no_request=True       -> a non-requester's forward estimate at the indicative rate.
      already_eligible=True -> an eligible requester (their current request already fits).
      (default)             -> an ineligible requester.
    """
    b = _ceiling_breakdown(profile)
    if b["binding"] == "salary":
        cap_label = "حدّ الاستقطاع من الراتب (بدون العقار)"
        cap_pct, cap_sar = b["salary_cap_pct"], b["salary_cap_sar"]
        cur_obl, headroom = b["salary_fixed_obl"], b["salary_headroom"]
    else:
        cap_label = "حدّ إجمالي الالتزامات (شامل العقار)"
        cap_pct, cap_sar = b["total_cap_pct"], b["total_cap_sar"]
        cur_obl, headroom = b["total_fixed_obl"], b["total_headroom"]

    detail = (
        f"القيد الأشد عليك هو {cap_label}: يسمح ساما بما لا يتجاوز {cap_pct}٪ من راتبك "
        f"({_riyal(b['gross'])}) = {_riyal(cap_sar)}، ويذهب منها {_riyal(cur_obl)} لالتزاماتك الحالية، "
        f"فيتبقّى {_riyal(headroom)} شهرياً — وهذا ما يموّل سقفاً أقصى قدره {_riyal(current_available)}."
    )

    if no_request:
        rate_str = f"{round(float(indicative_rate), 1):g}" if indicative_rate is not None else "-"
        headline = (
            "أنت لم تتقدم بطلب تمويل بعد. الرقم أعلاه تقدير تطلّعي لأقصى مبلغ يمكنك طلبه اليوم لو "
            f"تقدمت، محسوب وفق قواعد ساما على التزاماتك الحالية وبافتراض معدل فائدة تقديري متحفّظ "
            f"{rate_str}٪ — وليس عرضاً ولا موافقة."
        )
        return f"{headline}\n{detail}"

    if already_eligible:
        remaining = max(0, current_available - round(float(profile["requested_loan_amount_sar"])))
        headline = (
            "طلبك الحالي ضمن حدود ساما وأنت مؤهل له. الرقم أعلاه سقف نظري محسوب وفق قواعد ساما، "
            "وليس عرض تمويل ولا موافقة مسبقة."
        )
        if remaining > 0:
            tail = f"يمكنك زيادة مبلغ طلبك بما يصل إلى {_riyal(remaining)} إضافية مع بقائك مؤهلاً (أي حتى {_riyal(current_available)})."
        else:
            tail = "أنت عند الحد الأقصى الذي تسمح به قواعد ساما لوضعك الحالي."
        return f"{headline}\n{tail}"

    requested = round(float(profile["requested_loan_amount_sar"]))
    headline = (
        f"طلبك الحالي ({_riyal(requested)}) يتجاوز حدود ساما، وأنت غير مؤهل له كما هو. الرقم أعلاه "
        f"ليس عرض تمويل ولا موافقة ولا مبلغاً إضافياً متاحاً فوق طلبك — بل الحد الأقصى النظري "
        f"لو طلبت {_riyal(current_available)} بدلاً من مبلغ طلبك الحالي، مع بقاء التزاماتك الأخرى كما هي."
    )
    return f"{headline}\n{detail}"


def _load_backup() -> dict:
    with open(BACKUP_NARRATIONS_PATH, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def _categorized_all() -> pd.DataFrame:
    """The 229k-row categorized spend table, read once (was re-read on every request)."""
    return pd.read_csv(CATEGORIZED_CSV, dtype={"accountNumber": str})


def _categorized_for(account: str) -> pd.DataFrame:
    df = _categorized_all()
    return df[df["accountNumber"] == str(account)].copy()


@lru_cache(maxsize=1)
def _sme_categorized_all() -> pd.DataFrame:
    return pd.read_csv(SME_CATEGORIZED_CSV, dtype={"accountNumber": str})


# ── Overview (Layer 1 forecast + categorized spend) ──────────────────────────
@lru_cache(maxsize=256)
def _build_overview(account: str = DEMO_ACCOUNT) -> dict:
    forecast = fe.forecast_account(account, months_ahead=6)
    if "error" in forecast:
        raise RuntimeError(forecast["error"])

    profile = _profile(account)
    income = float(forecast["monthly_income_sar"])

    # Spending comes from the real per-month category totals, so the income/spending series
    # and the category donut reconcile to the same numbers. Household spending EXCLUDES credit
    # obligations (they are not "spending"), which is why they are added back below.
    acct = _categorized_for(account)
    monthly_spend = acct.groupby("ds")["amount"].sum().sort_index()

    commitments = (
        float(profile["mortgage_installment_sar"])
        + float(profile["other_loan_installments_sar"])
        + float(profile["credit_card_min_payment_sar"])
    )

    series = [
        {
            "month": _arabic_month(str(ds)),
            "income": round(income),
            "spending": round(float(spend) + commitments),
        }
        for ds, spend in monthly_spend.tail(6).items()
    ]

    last_spending = series[-1]["spending"] if series else 0
    savings_rate = round((income - last_spending) / income * 100) if income else 0

    # Every KPI now belongs to the SAME persona -- income and spending from their transaction
    # history, commitments and financing from their own obligation profile.
    kpis = {
        "income": round(income),
        "spending": round(last_spending),
        "commitments": round(commitments),
        "loans": round(float(profile["requested_loan_amount_sar"])),
        "savingsRate": savings_rate,
    }

    # categories: real average monthly spend per category for this account.
    avg = acct.groupby("category")["amount"].mean().sort_values(ascending=False)
    avg = avg[avg > 0]
    total = float(avg.sum()) or 1.0
    categories = []
    for i, (slug, amount) in enumerate(avg.head(6).items()):
        categories.append(
            {
                "name": CATEGORY_AR.get(slug, slug),
                "value": round(float(amount) / total * 100),
                "amount": round(float(amount)),
                "color": CATEGORY_COLORS[i % len(CATEGORY_COLORS)],
            }
        )

    # Additive: real obligation/loan components for the "لماذا هذا الرقم؟" modals. All real
    # profile fields (golden rule intact); optional on the client, so a rollback degrades gracefully.
    rate_val = float(profile["loan_int_rate"])
    metric_breakdowns = {
        "commitments": {
            "mortgage": round(float(profile["mortgage_installment_sar"])),
            "otherLoans": round(float(profile["other_loan_installments_sar"])),
            "cardMin": round(float(profile["credit_card_min_payment_sar"])),
            "total": round(commitments),
        },
        "loans": {
            "requested": round(float(profile["requested_loan_amount_sar"])),
            "rate": round(rate_val, 1) if pd.notna(rate_val) else None,
            "term": int(profile.get("loan_term_months", sama_rules.MAX_FINANCE_TERM_MONTHS)),
        },
    }

    return {
        "kpis": kpis,
        "series": series,
        "categories": categories,
        "metricBreakdowns": metric_breakdowns,
    }


@lru_cache(maxsize=256)
def _build_transactions(account: str = DEMO_ACCOUNT) -> list[dict]:
    """Recent 'transactions' derived from real per-month category spend for one account.

    Each row is a real monthly category aggregate (category + net SAR + month), not a single
    purchase — documented as a deficiency.
    """
    acct = _categorized_for(account)
    acct = acct[acct["amount"] > 0].sort_values("ds", ascending=False)
    rows = []
    for i, (_, r) in enumerate(acct.head(12).iterrows(), start=1):
        slug = r["category"]
        rows.append(
            {
                "id": i,
                "name": CATEGORY_AR.get(slug, slug),
                "category": CATEGORY_AR.get(slug, slug),
                "amount": -round(float(r["amount"])),
                "date": _arabic_month(str(r["ds"])),
                "icon": CATEGORY_ICON.get(slug, "shopping"),
            }
        )
    return rows


# ── AI Savings Advisor (isolated: reads the profile + category spend, never the eligibility engine) ──
def _avg_monthly_by_category(account: str) -> "pd.Series":
    """Average monthly SAR spend per household category for one account (real data)."""
    acct = _categorized_for(account)
    return acct.groupby("category")["amount"].mean()


@lru_cache(maxsize=256)
def _savings_base(account: str) -> dict:
    """Strategy-INDEPENDENT savings numbers for one account (NO LLM, all real).

    needs   = debt obligations + essential household spend
    wants   = discretionary household spend
    savings = income - needs - wants  (what is actually left over; can be negative)
    These `actuals` describe the persona's real spending and never change with the strategy —
    only the TARGET split does (see _strategy_targets).
    """
    profile = _profile(account)
    income = round(float(profile["gross_salary_sar"]))
    obligations = round(
        float(profile["mortgage_installment_sar"])
        + float(profile["other_loan_installments_sar"])
        + float(profile["credit_card_min_payment_sar"])
    )
    avg = _avg_monthly_by_category(account)
    essential_spend = round(float(sum(avg.get(c, 0.0) for c in ESSENTIAL_CATEGORIES)))
    discretionary_spend = round(float(sum(avg.get(c, 0.0) for c in DISCRETIONARY_CATEGORIES)))
    actual_needs = obligations + essential_spend
    actual_wants = discretionary_spend

    top_discretionary = [
        {"name": CATEGORY_AR.get(slug, slug), "amount": round(float(avg.get(slug, 0.0)))}
        for slug in DISCRETIONARY_CATEGORIES
        if float(avg.get(slug, 0.0)) > 0
    ]
    top_discretionary.sort(key=lambda c: c["amount"], reverse=True)

    return {
        "income": income,
        "obligations": obligations,
        "disposableAfterObligations": income - obligations,
        "essentialSpend": essential_spend,
        "discretionarySpend": discretionary_spend,
        "netCashFlow": income - actual_needs - actual_wants,
        "actuals": {"needs": actual_needs, "wants": actual_wants, "savings": income - actual_needs - actual_wants},
        "topDiscretionary": top_discretionary[:3],
    }


def _strategy_targets(income: int, strategy_key: str) -> dict:
    """The three target amounts for one strategy = income * that strategy's ratios."""
    needs_r, wants_r, savings_r = SAVINGS_STRATEGIES[strategy_key]["ratios"]
    return {
        "needs": round(income * needs_r),
        "wants": round(income * wants_r),
        "savings": round(income * savings_r),
    }


def _strategy_meta(strategy_key: str) -> dict:
    """Display metadata for one strategy (key, name, tagline, whole-percent split)."""
    st = SAVINGS_STRATEGIES[strategy_key]
    n, w, s = st["ratios"]
    return {
        "key": strategy_key,
        "name": st["name"],
        "tagline": st["tagline"],
        "pct": {"needs": round(n * 100), "wants": round(w * 100), "savings": round(s * 100)},
    }


def _build_savings_plan(account: str = DEMO_ACCOUNT, strategy_key: str = DEFAULT_STRATEGY) -> dict:
    """Deterministic savings breakdown for one account under one strategy (all real numbers)."""
    if strategy_key not in SAVINGS_STRATEGIES:
        strategy_key = DEFAULT_STRATEGY
    base = _savings_base(account)
    return {
        **base,
        "strategy": _strategy_meta(strategy_key),
        "targets": _strategy_targets(base["income"], strategy_key),
    }


def _savings_base_facts(base: dict) -> dict:
    """Strategy-INDEPENDENT facts fed to the guard as allowed numbers (income, obligations, the
    persona's actual spending, and their top discretionary categories)."""
    facts = {
        "الدخل الشهري (ريال)": base["income"],
        "إجمالي الالتزامات الشهرية (ريال)": base["obligations"],
        "المتاح بعد سداد الالتزامات (ريال)": base["disposableAfterObligations"],
        "إنفاقك الفعلي على الاحتياجات (ريال)": base["actuals"]["needs"],
        "إنفاقك الفعلي على الرغبات (ريال)": base["actuals"]["wants"],
        "ما يتبقّى فعلياً للادخار حالياً (ريال)": base["actuals"]["savings"],
    }
    for cat in base["topDiscretionary"]:
        facts[f"إنفاقك على {cat['name']} (ريال)"] = cat["amount"]
    return facts


def _strategies_full(income: int) -> dict:
    """Per-strategy {name, targets, pcts} for ALL strategies, used by the AI recommender."""
    out = {}
    for key, st in SAVINGS_STRATEGIES.items():
        n, w, s = st["ratios"]
        out[key] = {
            "name": st["name"],
            "targets": _strategy_targets(income, key),
            "pcts": [round(n * 100), round(w * 100), round(s * 100)],
        }
    return out


def _strategy_menu() -> str:
    """A compact text menu of the strategy library for the AI selection prompt."""
    lines = []
    for key, st in SAVINGS_STRATEGIES.items():
        n, w, s = (round(r * 100) for r in st["ratios"])
        lines.append(f"- {key}: {st['name']} (احتياجات {n}٪، رغبات {w}٪، ادخار {s}٪) — {st['tagline']}")
    return "\n".join(lines)


def _deterministic_strategy_for_goal(goal: str | None) -> str:
    return _GOAL_FALLBACK.get(goal or "", DEFAULT_STRATEGY)


def _savings_fallback_text(base: dict, strategy_key: str, goal_label: str) -> str:
    """Deterministic (no-LLM) explanation used when the AI selection/narration fails."""
    meta = _strategy_meta(strategy_key)
    targets = _strategy_targets(base["income"], strategy_key)
    return (
        f"لتحقيق هدفك «{goal_label}»، نوصي باستراتيجية {meta['name']}. من دخلك البالغ "
        f"{_fmt_sar(base['income'])}، خصّص {_fmt_sar(targets['needs'])} للاحتياجات و"
        f"{_fmt_sar(targets['wants'])} للرغبات و{_fmt_sar(targets['savings'])} للادخار شهرياً. "
        "ركّز على تقليل أكبر فئات إنفاقك غير الأساسي الظاهرة أدناه، ووجّه الفرق تلقائياً إلى حساب "
        "ادخار منفصل لتصل إلى هدفك أسرع."
    )


def _financial_snapshot_text(base: dict) -> str:
    """A qualitative, DIGIT-FREE description of the client's financial state for AI strategy
    selection. Classified in Python from the real numbers (debt load, current saving behaviour,
    discretionary flexibility) so ALLaM weighs the client's reality alongside their goal, while the
    selection step still emits only a strategy key (no numbers -> no guard needed here)."""
    income = base["income"] or 1
    debt_ratio = base["obligations"] / income
    savings_ratio = base["actuals"]["savings"] / income
    wants_ratio = base["actuals"]["wants"] / income

    if debt_ratio >= 0.40:
        debt = "عبء ديونه والتزاماته الشهرية مرتفع"
    elif debt_ratio >= 0.20:
        debt = "عبء ديونه والتزاماته الشهرية متوسط"
    else:
        debt = "عبء ديونه والتزاماته الشهرية منخفض"

    if savings_ratio >= 0.20:
        saving = "ويدّخر حالياً فعلياً بمستوى جيد"
    elif savings_ratio >= 0.05:
        saving = "وادخاره الحالي متواضع"
    else:
        saving = "ولا يكاد يدّخر حالياً"

    if wants_ratio >= 0.30:
        wants = "وإنفاقه على الرغبات مرتفع فلديه مجال واسع للتقليص"
    elif wants_ratio >= 0.10:
        wants = "وإنفاقه على الرغبات متوسط"
    else:
        wants = "وإنفاقه على الرغبات منخفض أصلاً"

    return f"{debt}، {saving}، {wants}."


def _savings_advice_response(strategy_key: str, advice: str, source: str) -> dict:
    return {
        "strategyKey": strategy_key,
        "strategyName": SAVINGS_STRATEGIES[strategy_key]["name"],
        "advice": advice,
        "source": source,
    }


def _build_savings_advice(account: str, goal: str | None) -> dict:
    """AI selects the best strategy for the goal + narrates it; Python owns all the numbers.

    Order: demo persona + predefined goal -> pre-baked (instant); else a live AI call
    (select key -> narrate, guard-validated); else a deterministic fallback (goal->strategy map +
    templated explanation). The numbers are always on screen from /savings-plan regardless.
    """
    base = _savings_base(account)
    goal_label = _GOAL_LABEL.get(goal or "", goal or "تحسين وضعي المالي")

    if str(account) == DEMO_ACCOUNT and goal in _GOAL_FALLBACK:
        entry = _load_backup().get("narrations", {}).get("savings_by_goal", {}).get(goal)
        if entry and entry.get("narration") and entry.get("strategy_key") in SAVINGS_STRATEGIES:
            return _savings_advice_response(entry["strategy_key"], entry["narration"], "prebaked")

    try:
        rec = ae.recommend_savings_strategy(
            goal_label,
            _financial_snapshot_text(base),
            _strategy_menu(),
            _strategies_full(base["income"]),
            _savings_base_facts(base),
            _deterministic_strategy_for_goal(goal),
        )
        if rec.get("advice") and rec.get("strategy_key") in SAVINGS_STRATEGIES:
            return _savings_advice_response(rec["strategy_key"], rec["advice"], "live")
    except Exception:  # noqa: BLE001 -- Ollama down / timeout must never 500 this screen
        pass

    key = _deterministic_strategy_for_goal(goal)
    return _savings_advice_response(key, _savings_fallback_text(base, key, goal_label), "fallback")


# ── Eligibility (Layer 2 counterfactual + Layer 3 advisor narration) ─────────
@lru_cache(maxsize=1024)
def _top_discretionary_spend(account: str) -> tuple[str, float] | None:
    """(Arabic label, avg monthly SAR) of the account's largest discretionary category, or None."""
    df = pd.read_csv(CATEGORIZED_CSV, dtype={"accountNumber": str})
    acct = df[(df["accountNumber"] == str(account)) & (df["category"].isin(DISCRETIONARY_CATEGORIES))]
    if acct.empty:
        return None
    avg = acct.groupby("category")["amount"].mean()
    amount = float(avg.max())
    if amount <= 0:
        return None
    slug = str(avg.idxmax())
    return CATEGORY_AR.get(slug, slug), amount


def _coffee_index_nudge(
    changed: dict, profile: dict, discretionary: tuple[str, float] | None
) -> str | None:
    """Deterministic behavioral nudge: how much of a discretionary category covers this path's
    monthly obligation cut. Shown only when that cut is <= COFFEE_INDEX_MAX_PCT of the budget.

    Golden-rule note: pure Python math on real numbers, injected as a display field -- it never
    passes through the LLM or its guard, so the pre-baked narration is unaffected.
    """
    if not discretionary:
        return None
    monthly_cut = sum(
        float(profile[feature]) - float(new_value)
        for feature, new_value in changed.items()
        if feature in MONTHLY_OBLIGATION_LEVERS and float(new_value) < float(profile[feature])
    )
    if monthly_cut <= 0:
        return None
    label, budget = discretionary
    if budget <= 0:
        return None
    z = round(monthly_cut / budget * 100)  # gate on the DISPLAYED percentage, honest + consistent.
    if z > COFFEE_INDEX_MAX_PCT:
        return None
    return (
        f"💡 ملاحظة سلوكية: متوسط صرفك على {label} هو {budget:,.0f} ريال شهرياً. "
        f"توفير {z}٪ فقط منه يغطّي الـ{monthly_cut:,.0f} ريال المطلوبة لخفض التزامك وتنفيذ هذا المسار."
    )


# ── Roadmap: a rich, deterministic (no-LLM) execution plan per path ───────────
# Ordered by how a Saudi retail customer would realistically act (mirrors the closed-form lever
# order). Every step is curated Arabic copy parameterized ONLY by numbers the backend already
# computed for this path -- no new arithmetic, no invented figures.
_ROADMAP_LEVER_ORDER = (
    "requested_loan_amount_sar",
    "credit_card_min_payment_sar",
    "other_loan_installments_sar",
    "loan_int_rate",
)


def _fmt_lever_value(feature: str, value: float) -> str:
    """Formats a lever value for display: whole riyals with separators, or a 1-decimal rate.

    The rate uses one decimal so two nearby rates never collapse to an identical integer (the old
    ':,.0f' produced meaningless steps like "من 6 إلى 6"). Currency stays whole with separators.
    """
    if feature == "loan_int_rate":
        return f"{round(float(value), 1):g}"
    return f"{round(float(value)):,}"


def _lever_action_steps(feature: str, old_value: float, new_value: float) -> list[dict]:
    """The 2 concrete execution steps for one changed lever (action + how/leverage)."""
    old_s = _fmt_lever_value(feature, old_value)
    new_s = _fmt_lever_value(feature, new_value)
    if feature == "requested_loan_amount_sar":
        return [
            {
                "title": "أعد تقديم طلب التمويل بمبلغ أقل",
                "description": (
                    f"عدّل مبلغ التمويل المطلوب من {old_s} ريال إلى {new_s} ريال عند تقديم طلبك. "
                    "هذا المبلغ الأصغر يُبقي قسطك الشهري ضمن الحد الذي تسمح به قواعد ساما."
                ),
                "expected_outcome": "ينخفض قسط التمويل الجديد فور اعتماد المبلغ الأصغر.",
                "reason": (
                    "قسط التمويل الجديد يدخل في بسط نسبة الاستقطاع التي تقيسها ساما مقابل راتبك، "
                    "فكل خفض في المبلغ المطلوب يقلّل القسط ويخفض النسبة مباشرةً نحو الحدّ المسموح."
                ),
            },
            {
                "title": "قدّم الطلب عبر القناة المناسبة",
                "description": (
                    "تستطيع تعديل المبلغ من تطبيق البنك أو المنصة الرقمية أو بزيارة الفرع؛ لا يتطلب "
                    "الأمر سوى إعادة إدخال المبلغ الجديد في طلب التمويل دون أي التزام إضافي عليك."
                ),
                "expected_outcome": "طلب جديد بالمبلغ المصحّح جاهز لدراسة البنك.",
                "reason": (
                    "هذه خطوة تنفيذية لا تضيف أي التزام جديد — هدفها فقط إيصال المبلغ المصحّح إلى "
                    "دراسة البنك بالنسبة الصحيحة التي حسبناها لك."
                ),
            },
        ]
    if feature == "loan_int_rate":
        return [
            {
                "title": "تفاوض على خفض معدل الفائدة",
                "description": (
                    f"اطلب من الجهة الممولة خفض معدل الفائدة من {old_s}٪ إلى {new_s}٪ على تمويلك؛ "
                    "فالمعدل الأقل يقلّل القسط الشهري ويخفض نسبة استقطاعك."
                ),
                "expected_outcome": "عند الموافقة ينخفض القسط الشهري وتقترب نسبتك من الحد المسموح.",
                "reason": (
                    "القسط الشهري يتناسب مع معدل الفائدة على نفس المبلغ، فمعدل أقل يعني قسطاً أقل "
                    "ونسبة استقطاع أدنى — دون أن تضطر لتقليل مبلغ التمويل نفسه."
                ),
            },
            {
                "title": "استخدم نقاط قوتك — مع إدراك أن القرار للبنك",
                "description": (
                    "اعرض سجلّك الائتماني الجيد أو عروض بنوك منافسة كورقة تفاوض، أو اطلب إعادة "
                    "التسعير عند تجديد التمويل. لكن خفض المعدل يبقى قراراً تقديرياً للجهة الممولة "
                    "وليس مضموناً، فتعامل معه كهدف تفاوضي لا كنتيجة مؤكدة."
                ),
                "expected_outcome": "فرصة أفضل للحصول على معدل أقل، دون ضمان مسبق.",
                "reason": (
                    "خفض المعدل قرار تقديري للبنك لا نضمنه، لذا نعرضه كهدف تفاوضي مدعوم بسجلّك "
                    "الائتماني وعروض المنافسين، لا كنتيجة مؤكدة."
                ),
            },
        ]
    if feature == "other_loan_installments_sar":
        return [
            {
                "title": "خفّض قسط قروضك الأخرى",
                "description": (
                    f"اعمل على تقليل إجمالي أقساط قروضك الأخرى من {old_s} ريال إلى {new_s} ريال "
                    "شهرياً، إما بسداد مبكر لجزء من الأصل أو بإعادة جدولة القسط على مدة أطول مع "
                    "الجهة الممولة."
                ),
                "expected_outcome": "كل خفض في هذا القسط ينعكس مباشرة على نسبة استقطاعك.",
                "reason": (
                    "أقساط قروضك الأخرى تُحتسب ضمن بسط نسبة الاستقطاع، فتقليلها يحرّر جزءاً من "
                    "راتبك أمام قسط التمويل الجديد ويخفض النسبة مباشرةً."
                ),
            },
            {
                "title": "تواصل مع الجهة الممولة لإعادة الهيكلة",
                "description": (
                    "راجع الجهة الممولة لطلب إعادة جدولة القسط أو تسوية مبكرة، وجهّز كشف الحساب "
                    "وبيان الالتزامات، وحدّد القرض الذي يمكن معالجته أولاً لأثر أسرع."
                ),
                "expected_outcome": "قسط شهري أقل يبدأ أثره من الشهر التالي لإعادة الجدولة.",
                "reason": (
                    "إعادة الجدولة أو السداد المبكر تخفض القسط الشهري المحتسب عليك، فيظهر أثره على "
                    "نسبتك اعتباراً من الشهر التالي مباشرةً."
                ),
            },
        ]
    if feature == "credit_card_min_payment_sar":
        return [
            {
                "title": "اخفض الحد الأدنى لسداد بطاقتك",
                "description": (
                    f"قلّل الحد الأدنى المطلوب لسداد بطاقتك الائتمانية من {old_s} ريال إلى {new_s} "
                    "ريال، وذلك بسداد جزء من الرصيد القائم فينخفض الحد الأدنى المحتسب عليك."
                ),
                "expected_outcome": "انخفاض الرصيد يقلّل الحد الأدنى الشهري المحتسب ضمن التزاماتك.",
                "reason": (
                    "ساما تحتسب الحد الأدنى لسداد البطاقة — لا الرصيد الكامل — ضمن التزاماتك "
                    "الشهرية، فخفضه يقلّل بسط نسبة الاستقطاع مباشرةً."
                ),
            },
            {
                "title": "سدّد جزءاً من رصيد البطاقة",
                "description": (
                    "وجّه أي فائض شهري لسداد جزء من رصيد البطاقة القائم؛ فالحد الأدنى يُحتسب كنسبة "
                    "من الرصيد وكل سداد يخفضه، ويمكنك المتابعة عبر تطبيق البنك."
                ),
                "expected_outcome": "حد أدنى أقل ينعكس على نسبتك في الدورة التالية.",
                "reason": (
                    "الحد الأدنى يُحتسب كنسبة من الرصيد القائم، فكل سداد جزئي يخفضه ويخفض التزامك "
                    "الشهري المحتسب في النسبة."
                ),
            },
        ]
    return []


def _build_roadmap(
    changed: dict,
    profile: dict,
    current_dbr: int,
    target_dbr: int,
    current_available: int,
    target_amount: int,
    duration: str,
    mode: str = "fix",
) -> list[dict]:
    """A numbered execution roadmap for one path: per-lever action steps + timeline + outcome.

    Every number embedded here is one of the path's already-computed display fields (the lever
    old->new values, the DBR before/after, the ceiling before/after, the duration), so nothing
    can drift from the card. No LLM, no new math.

    mode="fix"      -> an INELIGIBLE customer's path back to eligibility (default).
    mode="increase" -> an ALREADY-ELIGIBLE customer's projection to LIFT their financing ceiling
                       (Part C). The outcome step never claims "you become eligible" -- they
                       already are; it states the ceiling gain instead.
    """
    steps: list[dict] = []
    for feature in _ROADMAP_LEVER_ORDER:
        if feature in changed:
            steps.extend(_lever_action_steps(feature, float(profile[feature]), float(changed[feature])))

    steps.append(
        {
            "title": "المدة المتوقعة للتنفيذ",
            "description": (
                f"وفق طبيعة هذا المسار يستغرق تنفيذه {duration} تقريباً حتى يظهر أثره الكامل على نسبتك."
            ),
            "expected_outcome": "تتحسّن نسبتك تدريجياً حتى اكتمال الخطوات.",
            "reason": (
                "المدة تقديرية لظهور الأثر الكامل على نسبتك: بعض الإجراءات فوري كالسداد، وبعضها "
                "يحتاج وقتاً كالتفاوض أو إعادة الجدولة مع الجهة الممولة."
            ),
        }
    )

    if mode == "increase":
        description = (
            f"يرتفع أقصى مبلغ يمكنك طلبه من {current_available:,} ريال إلى {target_amount:,} ريال، "
            f"وتنخفض نسبة استقطاعك من {current_dbr}٪ إلى {target_dbr}٪ — مع بقائك مؤهلاً وفق معايير ساما."
        )
        expected = "سقف تمويل أعلى وملف أقوى أمام الجهة الممولة."
    else:
        if target_amount > current_available:
            ceiling_clause = f"ويرتفع أقصى مبلغ يمكنك طلبه من {current_available:,} ريال إلى {target_amount:,} ريال"
        else:
            ceiling_clause = f"ويصبح طلبك ضمن سقفك الأقصى البالغ {current_available:,} ريال"
        description = (
            f"تنخفض نسبة استقطاعك من {current_dbr}٪ إلى {target_dbr}٪، {ceiling_clause}، "
            "فتعود إلى نطاق الأهلية وفق معايير ساما."
        )
        expected = "ملف مؤهل وفق قواعد ساما، وسقف تمويل واضح أمامك."
    outcome_reason = (
        "بما أنك مؤهل أصلاً، مجموع هذه الخطوات يرفع أقصى مبلغ يمكنك طلبه مع بقائك ضمن حدود ساما."
        if mode == "increase"
        else "عند اكتمال الخطوات تتحقق نسبتا ساما معاً (الاستقطاع من الراتب وإجمالي الالتزامات) فتدخل نطاق الأهلية."
    )
    steps.append(
        {
            "title": "ما الذي يتغيّر لك بعد إتمام المسار",
            "description": description,
            "expected_outcome": expected,
            "reason": outcome_reason,
        }
    )

    return [{"step_number": i + 1, **step} for i, step in enumerate(steps)]



# ── Part B/C: non-requester estimate + DiCE-free "increase your ceiling" projections ──
CEILING_INCREASE_LEVERS = ("credit_card_min_payment_sar", "other_loan_installments_sar")
CEILING_INCREASE_MIN_GAIN_SAR = 1000  # only surface a projection that meaningfully lifts the ceiling
PROJECTION_RATE_DROP_PCT = 2.0        # a conservative negotiated-rate cut to project (requesters)
PROJECTION_RATE_FLOOR_PCT = 4.5       # market floor -- never project a rate below this


@lru_cache(maxsize=1)
def _market_rate_range() -> tuple[float, float]:
    """A REAL, data-grounded illustrative rate range (10th-90th percentile of every requester's
    actual loan_int_rate), used to present any displayed rate honestly as "around this range,
    varies by bank" rather than a single authoritative live figure. No bound is invented -- both
    ends come straight from the dataset's real rate distribution, same source as every other rate
    in this file.
    """
    df = pd.read_csv(PROFILES_CSV)
    rates = df[df["has_active_request"] == 1]["loan_int_rate"].dropna()
    return round(float(rates.quantile(0.10)), 1), round(float(rates.quantile(0.90)), 1)


# Persistent, honest note attached to every interest-rate display: the underlying number is a
# real per-persona (or dataset-derived) figure, but presenting it as a single point value could be
# mistaken for a live market rate -- it is not connected to any real rate-aggregation platform yet.
RATE_MARKET_NOTE_AR = (
    "أسعار الفائدة الفعلية تختلف يومياً وتتفاوت بين البنوك؛ الرقم المعروض تقديري ضمن هذا النطاق، "
    "وليس عرضاً حياً من أي جهة. سيتم لاحقاً ربطه بمنصة حقيقية لتجميع أسعار البنوك."
)


@lru_cache(maxsize=1)
def _indicative_rate() -> float:
    """Conservative indicative annual rate for a NON-requester's forward ceiling estimate.

    A non-requester has no application, so no interest rate on record. We assume the 75th
    percentile of the requester cohort's ACTUAL rates -- deliberately ABOVE the median so the
    projected ceiling UNDER-promises (a higher rate finances a smaller principal) rather than
    overstating what someone who has not applied could obtain. Surfaced in the UI as an explicit
    assumption, never as an offer.
    """
    df = pd.read_csv(PROFILES_CSV)
    rates = df[df["has_active_request"] == 1]["loan_int_rate"].dropna()
    return round(float(rates.quantile(0.75)), 2)


def _calc_profile(profile: dict) -> dict:
    """A profile guaranteed to carry a usable rate for the ceiling math.

    Requesters keep their own rate; a non-requester's NaN rate is replaced by the indicative rate
    so _max_financeable_loan / sama_rules never see a NaN. The requested loan is excluded from the
    ceiling anyway, so this only affects the assumed pricing of the forward estimate.
    """
    if int(profile.get("has_active_request", 1)) == 1:
        return profile
    return {**profile, "loan_int_rate": _indicative_rate()}


def _build_projection_path(
    index: int, calc_profile: dict, changed: dict, current_available: int, current_dbr: int, current_score: int
) -> dict:
    """One DiCE-free 'increase your ceiling' path (Part C): project a lever cut, recompute honestly.

    Numbers come only from sama_rules.evaluate + _max_financeable_loan on the projected profile --
    no search, no fabricated figures. Same card shape as a DiCE path so the frontend renders it
    identically; the roadmap uses mode="increase" so it never claims the customer "becomes eligible"
    (they already are).
    """
    steps, cons = [], []
    biggest_cut_ratio = 0.0
    for feature, new_value in changed.items():
        old_value = float(calc_profile[feature])
        label = ACTIONABLE_LABEL_AR.get(feature, feature)
        unit = ACTIONABLE_UNIT_AR.get(feature, "")
        steps.append(
            f"خفض {label} من {_fmt_lever_value(feature, old_value)} إلى {_fmt_lever_value(feature, new_value)} {unit}".strip()
        )
        cons.append(f"يتطلب خفض {label} فعلياً")
        if feature in ("other_loan_installments_sar", "credit_card_min_payment_sar") and old_value:
            biggest_cut_ratio = max(biggest_cut_ratio, 1.0 - new_value / old_value)

    difficulty = "صعب" if biggest_cut_ratio > 0.6 else "متوسط" if biggest_cut_ratio > 0.3 else "سهل"
    duration = DIFFICULTY_DURATION[difficulty]

    verdict = sama_rules.evaluate({**calc_profile, **changed})
    new_dbr = float(verdict["salary_dbr"])
    target_dbr = round(new_dbr * 100)
    target_score = _eligibility_score(new_dbr)
    target_amount = _max_financeable_loan(calc_profile, changed)
    labels = "، ".join(ACTIONABLE_LABEL_AR.get(f, f) for f in changed)

    return {
        "id": index,
        "title": f"زيادة السقف عبر {labels}",
        "summary": f"يرفع أقصى مبلغ يمكنك طلبه إلى {_fmt_sar(target_amount)} مع بقائك مؤهلاً وفق معايير ساما.",
        "steps": steps,
        "impact": max(0, target_score - current_score),
        "duration": duration,
        "difficulty": difficulty,
        "targetDbr": target_dbr,
        "targetEligibility": target_score,
        "targetAmount": target_amount,
        "pros": [
            f"يرفع أقصى مبلغ يمكنك طلبه إلى {_fmt_sar(target_amount)}",
            f"يخفض نسبة الالتزام إلى {target_dbr}٪",
            "يقوّي ملفك أمام الجهة الممولة",
        ],
        "cons": cons + ["يتطلب التزاماً مالياً فعلياً"],
        "timeline": [],
        "nudge": None,
        "ceilingSummary": f"بتطبيق هذا المسار يرتفع سقفك الأقصى من {_riyal(current_available)} إلى {_riyal(target_amount)}.",
        "roadmap": _build_roadmap(
            changed, calc_profile, current_dbr, target_dbr, current_available, target_amount, duration, mode="increase"
        ),
    }


def _ceiling_increase_paths(
    calc_profile: dict, current_available: int, current_dbr: int, current_score: int, include_rate: bool
) -> list[dict]:
    """Up to 3 'increase your ceiling' projections (Part C), ranked by the ceiling gained.

    Each lever is projected DOWN (clear an obligation; negotiate a lower rate) and the resulting
    ceiling is recomputed via _max_financeable_loan. Only projections that lift the ceiling by at
    least CEILING_INCREASE_MIN_GAIN_SAR are shown, so we never present a change with no real effect.
    """
    candidates: list[tuple[int, dict]] = []
    for lever in CEILING_INCREASE_LEVERS:
        if float(calc_profile[lever]) > 0:
            changed = {lever: 0.0}  # projection: clear this obligation
            new_ceiling = _max_financeable_loan(calc_profile, changed)
            if new_ceiling - current_available >= CEILING_INCREASE_MIN_GAIN_SAR:
                candidates.append((new_ceiling, changed))

    if include_rate:
        rate = float(calc_profile["loan_int_rate"])
        target_rate = max(PROJECTION_RATE_FLOOR_PCT, round(rate - PROJECTION_RATE_DROP_PCT, 2))
        if target_rate < rate:
            changed = {"loan_int_rate": target_rate}
            new_ceiling = _max_financeable_loan(calc_profile, changed)
            if new_ceiling - current_available >= CEILING_INCREASE_MIN_GAIN_SAR:
                candidates.append((new_ceiling, changed))

    candidates.sort(key=lambda item: item[0], reverse=True)
    return [
        _build_projection_path(i + 1, calc_profile, changed, current_available, current_dbr, current_score)
        for i, (_, changed) in enumerate(candidates[:3])
    ]


# ── Behavioral-fintech strategy library (2026-07-16) ──────────────────────────────────────
# A deterministic playbook of REAL banking strategies, scored/filtered against the customer's
# available data and returned as the top 3. Two strategies carry engine-computed riyal numbers
# (Fast Track, Financial Engineering); the other five are honest CONDITIONAL action cards -- real
# steps + "كيف؟" instructions, gated with "ينطبق إذا..." -- because the fields they'd need (card
# limit, savings, per-bank loans, auto-lease) are not in the dataset, and fabricating a figure
# would break the golden rule. Enforces the strict rules: never zero a personal loan (Rule 1),
# cap discretionary saving at 30% (Rule 2), prefer no-cash levers, and only actionable steps.

# Deterministic "كيف؟" (How?) banking instructions — no LLM, no numbers.
HOW_TO = {
    "reduce_loan": "عدّل مبلغ التمويل المطلوب في الطلب قبل إرساله، أو من تطبيق البنك ← التمويل ← تعديل الطلب.",
    "card_limit": "افتح تطبيق بنكك الحالي ← البطاقات الائتمانية ← الإعدادات ← تعديل الحد الائتماني أو إلغاء البطاقة.",
    "save_30": "استعن بخطة المستشار الادخاري في تطبيقنا، ثم حوّل المبلغ الموفّر لحساب بطاقتك الائتمانية.",
    "pay_card": "حوّل المبلغ إلى بطاقتك الائتمانية عبر تطبيق البنك ← سداد بطاقة ائتمانية.",
    "consolidation": "اطلب (خطاب إثبات مديونية) من بنكك الحالي، وارفعه في طلبك الجديد ليتم سداد مديونيتك.",
    "reschedule": "راجع بنكك الحالي واطلب (إعادة جدولة التمويل) لتمديد المدة إلى ٦٠ شهراً وخفض القسط الشهري.",
    "joint": "اختر (طلب تمويل تضامني) وأرسل رابط الدعوة للمتضامن للتوثيق عبر النفاذ الوطني.",
    "asset": "قم بتسييل المبلغ المطلوب من محفظتك الادخارية عبر التطبيق وحوله لسداد البطاقة.",
    "auto_lease": "راجع جهة تمويل سيارتك واطلب زيادة الدفعة الأخيرة (البالون) لخفض القسط الشهري.",
    "settle_loan": "راجع جهة تمويلك واطلب (سداد مبكر جزئي) أو إعادة هيكلة القرض لخفض القسط الشهري.",
    "bnpl": "افتح تطبيق (تمارا/تابي) ← المدفوعات ← سدّد الأقساط المتبقية مبكراً لإغلاق الالتزام.",
    "close_external": "سدّد أي قرض شخصي أو التزام خارجي غير موثّق، واطلب خطاب إخلاء طرف يثبت إغلاقه.",
    "income_proof": "جهّز إثبات دخلك الإضافي (عقد إيجار موثّق عبر منصة إيجار، أو كشف أرباح استثمارية) وأرفقه بالطلب.",
    "wait_expiry": "راجع جدول أقساطك، حدّد تاريخ انتهاء أقرب التزام قصير الأجل، ثم قدّم طلبك بعده.",
    "submit": "بعد تنفيذ الخطوات، أعد إرسال طلب التمويل ليُعاد احتساب نسبة استقطاعك.",
}

# FinTech-simulator disclaimer surfaced on the eligibility screen (What-If + super-strategies).
DISCLAIMER = "هذه المحاكاة مبنية على بياناتك، ولا تعتبر عرضاً تمويلياً من أي جهة."


# Per-action accordion metadata (qualitative -> effort/execution/checklist/cost-of-delay). These are
# deterministic labels, NOT fabricated numbers; the only number a step carries is impactSar, which is
# a REAL monthly SAR figure passed in by the caller. Keyed by the HOW_TO action key.
STEP_META = {
    "pay_card": {
        "effort": "سهل", "execution": "تنفيذ رقمي فوري",
        "checklist": ["تطبيق البنك ← البطاقات الائتمانية", "توفّر مبلغ السداد في حسابك"],
        "cost_of_delay": "كل شهر تأخير يبقي الحد الأدنى للبطاقة ضمن استقطاعك فتظل نسبتك مرتفعة.",
    },
    "card_limit": {
        "effort": "سهل", "execution": "تنفيذ رقمي فوري",
        "checklist": ["تطبيق البنك ← إعدادات البطاقة ← تعديل/إلغاء الحد"],
        "cost_of_delay": "بقاء الحد الائتماني مرتفعاً يبقي جزءاً منه محتسباً ضمن التزاماتك.",
    },
    "settle_loan": {
        "effort": "متوسط", "execution": "زيارة فرع",
        "checklist": ["مراجعة جهة تمويلك", "طلب سداد مبكر جزئي أو إعادة هيكلة", "توفير مبلغ السداد الجزئي"],
        "cost_of_delay": "تأجيل السداد الجزئي يبقي قسط القرض كاملاً في بسط نسبتك.",
    },
    "reduce_loan": {
        "effort": "سهل", "execution": "تنفيذ رقمي فوري",
        "checklist": ["تعديل مبلغ الطلب قبل إرساله من تطبيق البنك"],
        "cost_of_delay": "طلب مبلغ يفوق سقفك يعني رفضاً متجدداً حتى تعدّله.",
    },
    "consolidation": {
        "effort": "متوسط", "execution": "زيارة فرع",
        "checklist": ["خطاب إثبات مديونية من جهاتك", "طلب توحيد مديونيات لدى جهة واحدة"],
        "cost_of_delay": "تعدّد الأقساط يبقي إجمالي التزامك الشهري مرتفعاً.",
    },
    "reschedule": {
        "effort": "متوسط", "execution": "زيارة فرع",
        "checklist": ["مراجعة بنكك الحالي", "طلب إعادة جدولة إلى ٦٠ شهراً"],
        "cost_of_delay": "بقاء القسط مرتفعاً يبقي نسبة استقطاعك مرتفعة حتى إعادة الجدولة.",
    },
    "income_proof": {
        "effort": "متوسط", "execution": "زيارة فرع",
        "checklist": ["عقد إيجار موثّق عبر منصة إيجار أو كشف أرباح استثمارية", "إرفاق المستندات بالطلب"],
        "cost_of_delay": "بدون توثيق الدخل تبقى نسبتك محسوبة على الراتب وحده.",
    },
    "bnpl": {
        "effort": "سهل", "execution": "تنفيذ رقمي فوري",
        "checklist": ["تطبيق تمارا/تابي ← سداد الأقساط المتبقية", "الاحتفاظ بإثبات الإغلاق"],
        "cost_of_delay": "بقاء أقساط الشراء الآجل يبقيها ضمن التزاماتك الشهرية.",
    },
    "close_external": {
        "effort": "متوسط", "execution": "زيارة فرع",
        "checklist": ["سداد الالتزام الخارجي", "طلب خطاب إخلاء طرف"],
        "cost_of_delay": "الالتزامات الخارجية الموثّقة تبقى ضمن نسبتك حتى إغلاقها.",
    },
    "wait_expiry": {
        "effort": "سهل", "execution": "لا يتطلب إجراءً",
        "checklist": ["مراجعة جدول أقساطك", "تحديد تاريخ انتهاء أقرب التزام قصير"],
        "cost_of_delay": "التقديم قبل انتهاء الالتزام يعني نسبة أعلى ورفضاً محتملاً.",
    },
    "joint": {
        "effort": "متوسط", "execution": "تنفيذ رقمي فوري",
        "checklist": ["اختيار (طلب تمويل تضامني)", "توثيق المتضامن عبر النفاذ الوطني"],
        "cost_of_delay": "دون متضامن تبقى نسبتك محسوبة على دخلك وحدك.",
    },
    "asset": {
        "effort": "سهل", "execution": "تنفيذ رقمي فوري",
        "checklist": ["تسييل جزء من محفظتك الادخارية", "تحويله لسداد الالتزام"],
        "cost_of_delay": "تأجيل التسييل يبقي الالتزام المُعيق ضمن نسبتك.",
    },
    "auto_lease": {
        "effort": "متوسط", "execution": "زيارة فرع",
        "checklist": ["مراجعة جهة تمويل سيارتك", "طلب زيادة الدفعة الأخيرة (البالون)"],
        "cost_of_delay": "بقاء قسط السيارة مرتفعاً يبقي نسبتك مرتفعة.",
    },
    "save_30": {
        "effort": "متوسط", "execution": "تنفيذ رقمي فوري",
        "checklist": ["خطة المستشار الادخاري في التطبيق", "تحويل المبلغ الموفّر لسداد البطاقة"],
        "cost_of_delay": "تأخّر الاقتطاع يبطئ خفض رصيد بطاقتك ونسبتك.",
    },
    "submit": {
        "effort": "سهل", "execution": "تنفيذ رقمي فوري",
        "checklist": ["إعادة إرسال الطلب بعد تحديث بياناتك"],
        "cost_of_delay": "تأخير إعادة الإرسال يؤجّل إعادة احتساب نسبتك.",
    },
}


def _how_step(n: int, title: str, reason: str, how_key: str, impact_sar: float | None = None) -> dict:
    """One strictly-actionable roadmap step, enriched for the accordion UI: action title + لماذا
    (reason) + كيف (how_to) + qualitative effort/execution/checklist/cost-of-delay (STEP_META) +
    an optional REAL monthly SAR impact. No fabricated numbers -- only impactSar is numeric and it
    is passed in by the caller from sama_rules-derived figures."""
    meta = STEP_META.get(how_key, {})
    step = {"step_number": n, "title": title, "reason": reason, "how_to": HOW_TO[how_key]}
    if impact_sar is not None and impact_sar > 0:
        step["impactSar"] = round(impact_sar)
    if meta.get("effort"):
        step["effort"] = meta["effort"]
    if meta.get("execution"):
        step["execution"] = meta["execution"]
    if meta.get("checklist"):
        step["checklist"] = meta["checklist"]
    if meta.get("cost_of_delay"):
        step["costOfDelay"] = meta["cost_of_delay"]
    return step


def _strategy_card(
    index: int,
    key: str,
    title: str,
    summary: str,
    kind: str,
    steps: list[dict],
    *,
    difficulty: str,
    duration: str,
    outcome: str,
    cash_required: bool,
    conditional_note: str | None = None,
    target_dbr: int | None = None,
    target_amount: int | None = None,
    ceiling_summary: str | None = None,
    nudge: str | None = None,
    pros: list[str] | None = None,
    cons: list[str] | None = None,
    combination_benefit: bool = False,
) -> dict:
    """Assembles one strategy path card. Non-actionable info (duration/outcome/etc.) lives on the
    card as BADGES; the roadmap holds only the 3-4 actionable steps. Each strategy MUST pass
    explicit `pros`/`cons` arrays so the details modal always renders them."""
    return {
        "id": index,
        "strategyKey": key,
        "title": title,
        "summary": summary,
        "kind": kind,  # "computed" (real numbers) | "conditional" (no fabricated numbers)
        "conditionalNote": conditional_note,
        "cashRequired": cash_required,
        "difficulty": difficulty,
        "duration": duration,
        "outcome": outcome,
        "targetDbr": target_dbr,
        "targetAmount": target_amount,
        "ceilingSummary": ceiling_summary,
        "nudge": nudge,
        "roadmap": [{**s, "step_number": i + 1} for i, s in enumerate(steps)],
        # Legacy-compatible fields (Part 3 snapshot / older readers): flat step titles, no timeline.
        "steps": [s["title"] for s in steps],
        "timeline": [],
        "pros": pros if pros is not None else [outcome],
        "cons": cons if cons is not None else ([conditional_note] if conditional_note else []),
        # Super-strategy metadata: whether this path stacks multiple actions, and (set by the
        # selector) whether it's the recommended one for this persona's DBR severity.
        "combinationBenefit": combination_benefit,
        "recommended": False,
        "impact": 0,
    }


@lru_cache(maxsize=1024)
def _card_balance(account: str) -> float:
    """The account's credit-card balance (not in the model-feature profile dict; read here)."""
    df = pd.read_csv(PROFILES_CSV, dtype={"accountNumber": str})
    row = df[df["accountNumber"] == str(account)]
    return float(row.iloc[0]["credit_card_balance_sar"]) if not row.empty else 0.0


def _eligibility_context(account: str, profile: dict) -> dict:
    """Everything the strategy library needs, computed once from real data + sama_rules."""
    baseline = sama_rules.evaluate(profile)
    income = float(profile["gross_salary_sar"])
    salary_cap = float(baseline["salary_cap"])
    ceiling = _max_financeable_loan(profile)
    salary_gap = max(0.0, float(baseline["salary_linked_obligations_sar"]) - salary_cap * income)
    # The exact SAR/month the persona must shed to clear the binding tests (from the SAMA engine).
    tests = sama_rules.evaluate_tests(profile)["test_results"]
    binding_overage = [t["overage_sar"] for t in tests if t["binding"] and not t["passed"]]
    shed_target = max(binding_overage) if binding_overage else salary_gap
    return {
        "baseline": baseline,
        "income": income,
        "salary_cap": salary_cap,
        "current_dbr": round(float(baseline["salary_dbr"]) * 100),
        "ceiling": ceiling,
        "requested": float(profile["requested_loan_amount_sar"]),
        "other_loan": float(profile["other_loan_installments_sar"]),
        "card_min": float(profile["credit_card_min_payment_sar"]),
        "card_balance": _card_balance(account),
        "discretionary": _top_discretionary_spend(account),
        "salary_gap": salary_gap,
        "gap_ratio": salary_gap / income if income else 0.0,
        "tests": tests,
        "shed_target": shed_target,  # real overageSar to shed (drives every track's target)
    }


# Waterfall policy (a PRODUCT rule, not a SAMA rule): a partial settlement must leave the existing
# loan ACTIVE -- we may settle at most (1 - share) of its EMI, never zeroing it (Rule 1).
MIN_LOAN_RESIDUAL_SHARE = 0.25  # keep >= 25% of the original loan EMI active.


def _strat_smart_combination(ctx: dict, profile: dict) -> tuple[float, dict] | None:
    """PRIMARY computed track -- the WATERFALL. Covers the real overageSar by STACKING levers in
    strict priority order, and only trims the requested amount as an absolute last resort:

      1. reduce / close the credit card (shed up to its 5% minimum),
      2. PARTIALLY settle the existing loan -- down to its minimum residual, NEVER to zero (Rule 1),
      3. LAST RESORT: trim the requested amount to bridge whatever gap the levers above couldn't.

    Every figure is real (sama_rules); nothing is fabricated. (Term extension is not a lever here --
    every persona's term is already at the 60-month SAMA maximum, so it can't be extended.)
    """
    remaining = float(ctx["shed_target"])
    if remaining <= 0:
        return None
    baseline = ctx["baseline"]
    rate = float(profile["loan_int_rate"])
    term = int(profile.get("loan_term_months", sama_rules.MAX_FINANCE_TERM_MONTHS))
    mod: dict = {}
    steps: list[dict] = []

    # Lever 1 -- credit card: shed up to its 5% minimum (cheapest, least disruptive).
    if ctx["card_min"] > 0 and remaining > 0:
        shed = min(ctx["card_min"], remaining)
        mod["credit_card_min_payment_sar"] = ctx["card_min"] - shed
        remaining -= shed
        steps.append(_how_step(len(steps) + 1,
            f"اخفض أو أغلق بطاقتك الائتمانية لتوفير ~{_fmt_sar(shed)} شهرياً",
            "الحد الأدنى للبطاقة (٥٪ من الرصيد) يُحتسب ضمن التزاماتك؛ خفضه أولاً هو الأقل تكلفة.",
            "pay_card", impact_sar=shed))

    # Lever 2 -- PARTIAL settlement of the existing loan, never below its minimum residual (Rule 1).
    max_settle = max(0.0, ctx["other_loan"] * (1.0 - MIN_LOAN_RESIDUAL_SHARE))
    if max_settle > 0 and remaining > 0:
        shed = min(max_settle, remaining)
        mod["other_loan_installments_sar"] = ctx["other_loan"] - shed
        remaining -= shed
        steps.append(_how_step(len(steps) + 1,
            f"سدّد جزئياً قرضك القائم لخفض قسطه ~{_fmt_sar(shed)} (مع إبقائه نشطاً)",
            "السداد الجزئي يقلّل القسط دون إغلاق القرض؛ ممنوع تصفيره، لذا نخفضه إلى حده الأدنى المسموح فقط.",
            "settle_loan", impact_sar=shed))

    # Lever 3 (LAST RESORT) -- trim the requested amount to bridge the final remaining gap.
    if remaining > 0:
        old_inst = float(baseline["new_loan_installment_sar"])
        new_inst = max(0.0, old_inst - remaining)
        monthly_trim = old_inst - new_inst  # the real monthly installment reduction from the trim
        new_principal = int(sama_rules.principal_from_installment(new_inst, rate, term) // 1000 * 1000)
        cut_amount = round(ctx["requested"] - new_principal)
        mod["requested_loan_amount_sar"] = float(new_principal)
        remaining = 0.0
        steps.append(_how_step(len(steps) + 1,
            f"كملاذ أخير: خفّض مبلغ التمويل المطلوب من {_fmt_sar(ctx['requested'])} إلى "
            f"{_fmt_sar(new_principal)} (تخفيض قدره ~{_fmt_sar(cut_amount)})",
            "لا نلجأ لتقليص مبلغك إلا بعد استنفاد بقية الخيارات؛ هذا يسدّ الفجوة المتبقية فقط ليدخل طلبك ضمن الحد.",
            "reduce_loan", impact_sar=monthly_trim))

    if not steps:
        return None
    steps.append(_how_step(len(steps) + 1, "أعد إرسال الطلب بعد تنفيذ الخطوات",
        "تُعاد دراسة نسبتك على أساس التزاماتك ومبلغك المحدَّثين فتصبح ضمن الحد.", "submit"))

    verdict = sama_rules.evaluate({**profile, **mod})
    target_dbr = round(float(verdict["salary_dbr"]) * 100)
    now_eligible = bool(verdict["eligible_sama"])
    final_amount = int(mod.get("requested_loan_amount_sar", ctx["requested"]))
    reduced = "requested_loan_amount_sar" in mod
    outcome = f"نسبتك تصبح {target_dbr}٪ ({'ضمن الحد' if now_eligible else 'أقرب للحد'})" + (
        f" مع الاحتفاظ بـ{_fmt_sar(final_amount)} من تمويلك" if reduced else " دون تقليص مبلغ تمويلك"
    )
    card = _strategy_card(
        0, "aggressive_path", "المسار المكثّف (حل متكامل)",
        f"يجمع أكثر من إجراء لتغطية كامل فجوة استقطاعك ({_fmt_sar(ctx['shed_target'])}) دفعة واحدة: خفض "
        "البطاقة، وسداد جزئي لقرضك، مع تقليص المبلغ كملاذ أخير عند الحاجة.",
        "computed", steps, difficulty="متوسط", duration="أسبوع – شهر",
        outcome=outcome, cash_required=True, target_dbr=target_dbr,
        target_amount=final_amount if reduced else None,
        combination_benefit=True,
        ceiling_summary=(
            f"يبقي طلبك عند {_fmt_sar(final_amount)} ضمن حدّك بعد الجمع بين الخطوات."
            if reduced else "يجعلك ضمن الحد دون أي تقليص لمبلغ تمويلك."
        ),
        pros=["يغطّي كامل الفجوة دفعة واحدة ويضمن الوصول للحد",
              "يحافظ على قرضك القائم نشطاً (بلا تصفير)",
              "لا يقلّص مبلغ تمويلك إلا كحل أخير للجزء المتبقّي"],
        cons=["قد يتطلب سيولة نقدية لسداد جزء من التزاماتك",
              "يشمل عدة خطوات متتابعة"],
    )
    return 100.0, card


def _super_targeted(ctx: dict, profile: dict) -> dict | None:
    """Targeted Path (computed SINGLE action): the single most impactful real lever. If settling part
    of the existing loan alone clears the gap, use that; otherwise document additional income (which
    always covers it by widening the denominator). Both carry a real, sama_rules-verified after-DBR."""
    overage = float(ctx["shed_target"])
    if overage <= 0:
        return None
    cap_pct = round(ctx["salary_cap"] * 100, 2)
    max_loan_settle = ctx["other_loan"] * (1.0 - MIN_LOAN_RESIDUAL_SHARE)
    if max_loan_settle >= overage:
        cut = round(overage)
        verdict = sama_rules.evaluate({**profile, "other_loan_installments_sar": ctx["other_loan"] - cut})
        tdbr = round(float(verdict["salary_dbr"]) * 100)
        steps = [
            _how_step(1, f"سدّد جزئياً قرضك القائم بمقدار قسط ~{_fmt_sar(cut)} (مع إبقائه نشطاً)",
                      "هذا وحده يكفي لسدّ الفجوة لأنه أكبر إجراء منفرد أثراً على استقطاعك.", "settle_loan",
                      impact_sar=cut),
            _how_step(2, "أعد إرسال الطلب بعد تحديث التزاماتك",
                      "بقسط أقل تدخل نسبتك ضمن الحد.", "submit"),
        ]
        return _strategy_card(
            0, "targeted_path", "المسار المركّز — سداد جزئي للقرض",
            f"إجراء واحد أعلى أثراً: سداد جزئي لقرضك بمقدار ~{_fmt_sar(cut)} من قسطه يغطّي كامل فجوتك.",
            "computed", steps, difficulty="سهل", duration="أسبوع – شهر",
            outcome=f"نسبتك تصبح {tdbr}٪ (ضمن الحد) بإجراء واحد",
            cash_required=True, target_dbr=tdbr,
            pros=["إجراء واحد مركّز بأعلى أثر", "يحافظ على قرضك نشطاً (بلا تصفير)"],
            cons=["يتطلب سيولة نقدية للسداد الجزئي"],
        )
    extra = round(overage / ctx["salary_cap"]) if ctx["salary_cap"] else 0
    steps = [
        _how_step(1, f"وثّق دخلاً إضافياً محتسباً بـ~{_fmt_sar(extra)} شهرياً (إيجار/استثمار)",
                  "رفع الدخل المحتسب يوسّع مقام النسبة فتنخفض دون أي سداد؛ وهو الإجراء المنفرد الأكبر أثراً هنا.",
                  "income_proof", impact_sar=extra),
        _how_step(2, "أرفق المستندات وأعد إرسال طلبك",
                  "بدخل أعلى موثّق تُعاد دراسة نسبتك على قاعدة أكبر فتدخل ضمن الحد.", "submit"),
    ]
    return _strategy_card(
        0, "targeted_path", "المسار المركّز — إثبات دخل إضافي",
        f"إجراء واحد أعلى أثراً: توثيق دخل إضافي محتسب ~{_fmt_sar(extra)} شهرياً يُدخل نسبتك ضمن الحد.",
        "computed", steps, difficulty="متوسط", duration="أسبوع – شهر",
        outcome=f"نسبتك تصل إلى الحد ({cap_pct}٪) دون أي سداد",
        cash_required=False, target_dbr=round(ctx["salary_cap"] * 100),
        conditional_note=(
            f"يكفي دخل محتسب ~{_fmt_sar(extra)} شهرياً؛ وبما أن ساما تحتسب الدخل المتغيّر بنصفه، "
            f"وثّق ما يقارب {_fmt_sar(2 * extra)}. يتطلب دخلاً قابلاً للتوثيق."
        ),
        pros=["إجراء واحد يخفض النسبة دون أي سداد نقدي",
              "يفيد في اختباري الراتب والإجمالي معاً"],
        cons=["يجب أن يكون الدخل موثّقاً رسمياً",
              "يحتسب ساما الدخل المتغيّر بنصف قيمته"],
    )


def _super_balanced(ctx: dict, profile: dict) -> dict | None:
    """Balanced Path (conditional COMBINATION, estimate-only): a lighter mix -- consolidate existing
    loans + clear short-term commitments (BNPL / near-expiry). Those amounts aren't in the data, so it
    stays an ESTIMATE anchored to the real overageSar; NO fabricated after-DBR (targetDbr stays None)."""
    shed = round(ctx["shed_target"])
    if shed <= 0:
        return None
    other = round(ctx["other_loan"])
    loan_bit = f"وحّد قروضك القائمة (~{_fmt_sar(other)} شهرياً) " if other > 0 else "وحّد قروضك القائمة "
    steps = [
        _how_step(1, "وحّد قروضك القائمة في تمويل واحد بقسط أقل",
                  "دمج الأقساط بمدة أطول يخفض إجمالي القسط الشهري تدريجياً.", "consolidation"),
        _how_step(2, "أغلق أي التزامات قصيرة (شراء آجل/على وشك الانتهاء)",
                  "الالتزامات القصيرة تُحتسب ضمن نسبتك؛ إغلاقها أو انتهاؤها يخفّفها.", "bnpl"),
        _how_step(3, "أعد تقديم طلبك بعد تخفيف التزاماتك",
                  "بمجموع التزامات أقل تقترب من الحد.", "submit"),
    ]
    return _strategy_card(
        0, "balanced_path", "المسار المتوازن (أخف وأبسط)",
        f"{loan_bit}وأغلق أي التزامات قصيرة لتخفيف الـ{_fmt_sar(shed)} المطلوبة تدريجياً وبأقل تكلفة نقدية.",
        "conditional", steps, difficulty="سهل", duration="١ – ٤ أسابيع",
        outcome=f"تخفيف تدريجي نحو الحد ({round(ctx['salary_cap'] * 100, 2)}٪)",
        cash_required=False, combination_benefit=True,
        conditional_note=(
            f"تقديري — يعتمد على وجود قروض قابلة للتوحيد أو التزامات قصيرة لديك؛ المطلوب تحرير "
            f"~{_fmt_sar(shed)} من استقطاعك."
        ),
        pros=["الأخف تكلفةً نقدية بين المسارات",
              "يجمع إجراءين متكاملين لتخفيف الالتزامات"],
        cons=["تقديري: يعتمد على وجود قروض/التزامات قصيرة لديك",
              "أثره تدريجي وليس فورياً"],
    )


def _strategy_paths(account: str, profile: dict) -> list[dict]:
    """The 3 synthesized 'super-strategies' for an ineligible requester, ordered by DBR severity.
    Deterministic, golden-rule-safe: the computed paths (aggressive/targeted) carry real sama_rules
    numbers; the balanced (conditional) path is an ESTIMATE anchored to the real overageSar."""
    ctx = _eligibility_context(account, profile)
    agg = _strat_smart_combination(ctx, profile)  # the waterfall; returns (score, card) or None
    aggressive = agg[1] if agg else None
    targeted = _super_targeted(ctx, profile)
    balanced = _super_balanced(ctx, profile)

    # Severity (data-driven, NOT an invented threshold): can a SINGLE real obligation lever cover the
    # gap? If yes -> a focused single action is enough (recommend Targeted); if no, the full stacked
    # combination (incl. amount trim) is needed (recommend Aggressive).
    overage = float(ctx["shed_target"])
    single_covers = (
        ctx["other_loan"] * (1.0 - MIN_LOAN_RESIDUAL_SHARE) >= overage or ctx["card_min"] >= overage
    )
    recommended_key = "targeted_path" if single_covers else "aggressive_path"

    ordered = (
        [targeted, aggressive, balanced]
        if recommended_key == "targeted_path"
        else [aggressive, targeted, balanced]
    )
    cards = [c for c in ordered if c is not None]
    for i, card in enumerate(cards, start=1):
        card["id"] = i
        card["recommended"] = card.get("strategyKey") == recommended_key
    return cards


def _strategy_summary_text(paths: list[dict], current_dbr: int) -> str:
    """A deterministic, always-consistent one-paragraph summary of the top strategies (no LLM,
    so it can never drift from the cards and needs no re-bake)."""
    if not paths:
        return ""
    names = "، ".join(p["title"] for p in paths)
    return (
        f"نسبة استقطاعك الحالية {current_dbr}٪ تتجاوز الحد المسموح. اخترنا لك أنسب {len(paths)} مسارات "
        f"عملية للوصول إلى الأهلية: {names}. لكل مسار خطوات واضحة مع زرّي «لماذا؟» و«كيف؟» لتنفيذها."
    )


def _sama_test_results(profile: dict) -> list[dict]:
    """The 3-part SAMA test breakdown (camelCased) for the frontend's strategy routing.

    Purely additive: sama_rules.evaluate_tests() keeps is_eligible identical to the ground-truth
    eligible_sama (verified 0 drift across all 1180 personas), so this never changes any verdict --
    it only exposes the per-test failure points the 7-strategy router needs.
    """
    return [
        {
            "id": t["id"],
            "label": t["label"],
            "calculatedRatio": round(t["calculated_ratio"], 4),
            "allowedLimit": round(t["allowed_limit"], 4),
            "passed": bool(t["passed"]),
            "binding": bool(t["binding"]),
            "numeratorSar": round(t["numerator_sar"]),
            "denominatorSar": round(t["denominator_sar"]),
            "overageSar": round(t["overage_sar"]),
        }
        for t in sama_rules.evaluate_tests(profile)["test_results"]
    ]


def _build_non_requester_eligibility(account: str, profile: dict) -> dict:
    """Eligibility payload for a NON-requester (has_active_request == 0).

    No application exists, so: no DiCE counterfactual, no "current request", no real rate. Instead a
    forward-looking ceiling estimate (at the conservative indicative rate) + the binding-cap tooltip
    + Part C 'increase your ceiling' projections. `hasActiveRequest: false` tells the UI to show the
    "قدم طلبك" framing instead of the requester flow.
    """
    calc = _calc_profile(profile)
    indicative = _indicative_rate()
    baseline = sama_rules.evaluate(calc)  # requested amount is 0 -> ratios reflect EXISTING obligations
    income = float(profile["gross_salary_sar"])
    salary_cap = float(baseline["salary_cap"])
    total_cap = float(baseline["total_cap"])
    current_dbr_frac = float(baseline["salary_dbr"])
    current_total_frac = float(baseline["total_obligation_ratio"])
    current_dbr = round(current_dbr_frac * 100)
    current_score = _eligibility_score(current_dbr_frac)
    ceiling = _max_financeable_loan(calc)
    within_caps = bool(baseline["eligible_sama"])

    paths = _ceiling_increase_paths(calc, ceiling, current_dbr, current_score, include_rate=False)

    metrics = [
        {
            "label": f"نسبة الالتزام من الراتب (الحد {round(salary_cap * 100, 2)}٪)",
            "value": f"{current_dbr}٪",
            "tone": "warn" if current_dbr_frac > salary_cap else "neutral",
        },
        {
            "label": f"إجمالي الالتزامات (الحد {round(total_cap * 100)}٪)",
            "value": f"{round(current_total_frac * 100)}٪",
            "tone": "warn" if current_total_frac > total_cap else "neutral",
        },
        {"label": "أقصى مبلغ يمكنك طلبه (تقديري)", "value": _fmt_sar(ceiling), "tone": "neutral"},
        {"label": "معدل فائدة تقديري", "value": f"{_fmt_lever_value('loan_int_rate', indicative)}٪", "tone": "neutral"},
    ]

    return {
        "scores": {"personal": current_score, "mortgage": max(0, current_score - 10)},
        "metrics": metrics,
        "currentDbr": current_dbr,
        "currentTotalRatio": round(current_total_frac * 100),
        "currentAvailable": ceiling,
        "availableExplanation": _ceiling_explanation(calc, ceiling, no_request=True, indicative_rate=indicative),
        "paths": paths,
        "testResults": _sama_test_results(calc),
        "disclaimer": DISCLAIMER,
        "eligible": within_caps,
        "hasActiveRequest": False,
        "indicativeRate": indicative,
        "advisorNarration": None,
        "advisorSource": "none",
        "grossSalary": round(income),
        "salaryCapSar": round(salary_cap * income),
        "totalCapSar": round(total_cap * income),
        "salaryObligationsSar": round(float(baseline["salary_linked_obligations_sar"])),
        "totalObligationsSar": round(float(baseline["total_obligations_sar"])),
        # Part 6 — honest rate-market context (real dataset-derived range, not invented bounds).
        "rateRangeLowPct": _market_rate_range()[0],
        "rateRangeHighPct": _market_rate_range()[1],
        "rateMarketNote": RATE_MARKET_NOTE_AR,
    }


@lru_cache(maxsize=512)
def _build_eligibility(
    account: str = DEMO_ACCOUNT,
    extra_liability: float = 0.0,
    override_requested_amount: float | None = None,
) -> dict:
    profile = _profile(account)
    # The real, on-record requested amount -- always surfaced as-is, regardless of any override
    # below, so the page can show "your real request" and "your simulated override" separately.
    real_requested_amount = round(float(profile["requested_loan_amount_sar"]))
    if extra_liability and extra_liability > 0:
        # What-If simulation: add a hypothetical extra monthly liability to the persona's obligations
        # and recompute EVERYTHING (SAMA ratios, overageSar, the super-strategies) from real data.
        profile = {
            **profile,
            "other_loan_installments_sar": float(profile["other_loan_installments_sar"]) + float(extra_liability),
        }
    if (
        override_requested_amount is not None
        and override_requested_amount > 0
        and int(profile.get("has_active_request", 1)) == 1
    ):
        # Part 5: an ON-THIS-PAGE-ONLY demo override of the requested amount (e.g. the customer
        # forgot the real figure, or applied elsewhere). Frontend-only in spirit -- this recomputes
        # everything from sama_rules for display, but writes NOTHING back to the stored profile.
        profile = {**profile, "requested_loan_amount_sar": float(override_requested_amount)}
    if int(profile.get("has_active_request", 1)) == 0:
        return _build_non_requester_eligibility(account, profile)

    baseline = sama_rules.evaluate(profile)
    income = float(profile["gross_salary_sar"])
    rate = float(profile["loan_int_rate"])
    salary_cap = float(baseline["salary_cap"])
    total_cap = float(baseline["total_cap"])

    already = bool(baseline["eligible_sama"])  # ground truth = the SAMA rules, not the classifier
    current_dbr_frac = float(baseline["salary_dbr"])
    current_total_frac = float(baseline["total_obligation_ratio"])
    current_dbr = round(current_dbr_frac * 100)
    current_score = _eligibility_score(current_dbr_frac)
    # Available financing TODAY: the max loan financeable against the persona's current
    # obligations, excluding the requested loan itself (see _max_financeable_loan).
    current_available = _max_financeable_loan(profile)

    if already:
        # Part C: an ALREADY-ELIGIBLE requester has no path to fix, so offer DiCE-free
        # "increase your ceiling" projections instead (cut an obligation / negotiate the rate).
        paths = _ceiling_increase_paths(profile, current_available, current_dbr, current_score, include_rate=True)
        # These still narrate via the pre-baked/live counterfactual advisor for the demo persona.
        if str(account) == DEMO_ACCOUNT:
            advisor_narration, advisor_source = _narrate_counterfactual_with_fallback()
        else:
            advisor_narration, advisor_source = None, "pending"
    else:
        # Behavioral-fintech recommender: the top 3 real banking strategies to reach eligibility,
        # scored against this customer's data. The per-step "لماذا؟"/"كيف؟" carry the guidance, so
        # the top summary is deterministic (always consistent with the cards, no LLM, no re-bake).
        paths = _strategy_paths(account, profile)
        advisor_narration = _strategy_summary_text(paths, current_dbr)
        advisor_source = "deterministic"

    # Both SAMA ratios are surfaced: they are different checks against different caps, and this
    # persona fails one while passing the other.
    metrics = [
        {
            "label": f"نسبة الالتزام من الراتب (الحد {round(salary_cap * 100, 2)}٪)",
            "value": f"{current_dbr}٪",
            "tone": "warn" if current_dbr_frac > salary_cap else "neutral",
        },
        {
            "label": f"إجمالي الالتزامات (الحد {round(total_cap * 100)}٪)",
            "value": f"{round(current_total_frac * 100)}٪",
            "tone": "warn" if current_total_frac > total_cap else "neutral",
        },
        # Honest label: this is the max the persona could REQUEST today, not an approval. For an
        # INELIGIBLE requester it is explicitly conditional -- "instead of your actual request",
        # not something obtainable on top of / in addition to the (rejected) real request (Part 10).
        {
            "label": "أقصى مبلغ يمكنك طلبه الآن" if already else "أقصى مبلغ ممكن بدلاً من طلبك الحالي",
            "value": _fmt_sar(current_available),
            "tone": "neutral",
        },
        {"label": "معدل الفائدة الحالي", "value": f"{round(rate, 1):g}٪", "tone": "neutral"},
    ]

    return {
        "scores": {"personal": current_score, "mortgage": max(0, current_score - 10)},
        "metrics": metrics,
        "currentDbr": current_dbr,
        "currentTotalRatio": round(current_total_frac * 100),
        "currentAvailable": current_available,
        # Deterministic, LLM-free explanation of the ceiling tile (honest "not an approval"
        # framing + the binding SAMA cap and its components). Optional -> graceful rollback.
        "availableExplanation": _ceiling_explanation(profile, current_available, already_eligible=already),
        "paths": paths,
        "testResults": _sama_test_results(profile),
        "disclaimer": DISCLAIMER,
        "eligible": already,
        "hasActiveRequest": True,
        "advisorNarration": advisor_narration,
        "advisorSource": advisor_source,
        # Feature 2 — raw SAR figures for the Jargon Translator tooltip (from sama_rules):
        "grossSalary": round(income),
        "salaryCapSar": round(salary_cap * income),
        "totalCapSar": round(total_cap * income),
        "salaryObligationsSar": round(float(baseline["salary_linked_obligations_sar"])),
        "totalObligationsSar": round(float(baseline["total_obligations_sar"])),
        # Part 8 — the loan's computed MONTHLY INSTALLMENT (amount+term+rate), which is what
        # actually enters the T1/T2/T3 numerators -- never the raw requested amount.
        "newLoanInstallmentSar": round(float(baseline["new_loan_installment_sar"])),
        # Part 5 — the real, on-record requested amount, always the true figure regardless of any
        # override applied above; `requestedAmountOverridden` tells the frontend whether the ratios
        # on this payload reflect that real figure or a demo-only override.
        "requestedAmount": real_requested_amount,
        "requestedAmountOverridden": (
            override_requested_amount is not None
            and override_requested_amount > 0
            and round(float(override_requested_amount)) != real_requested_amount
        ),
        # Part 6 — honest rate-market context (real dataset-derived range, not invented bounds).
        "rateRangeLowPct": _market_rate_range()[0],
        "rateRangeHighPct": _market_rate_range()[1],
        "rateMarketNote": RATE_MARKET_NOTE_AR,
    }


# ── Standalone What-If Simulator (Part 4) — fully separate from the live /eligibility screen ──
WHATIF_FINANCING_TYPES = {"personal", "mortgage", "commercial"}
WHATIF_SIMULATION_LABEL_AR = "محاكاة — ليست بياناتك الفعلية"
# No SAMA source in this project distinguishes a separate "commercial" individual-financing rule
# (docs/Murtaqa_Financial_Rules_Reference_EN.md only documents personal vs. real-estate financing
# for individuals; "commercial" cash-flow rules exist only for SMEs, a different track entirely).
# Rather than invent a cap, "commercial" is evaluated under the same rule as "personal" and this is
# stated plainly in the response so it is never mistaken for a documented distinction.
WHATIF_COMMERCIAL_NOTE_AR = (
    "لا يوجد في مرجع قواعد ساما لهذا المشروع فرق رسمي بين التمويل الشخصي والتجاري للأفراد؛ لذلك "
    "يُحتسب التمويل «التجاري» هنا بنفس قواعد التمويل الشخصي (باستثناء العقار)."
)


def _build_whatif_simulation(
    account: str,
    amount: float,
    term_years: float,
    financing_type: str,
    activate_strategies: bool,
) -> dict:
    """A standalone hypothetical-financing calculator, deliberately separate from the live
    /individuals/eligibility screen and its cached _build_eligibility(). The user picks a made-up
    requested amount/term/type; the persona's REAL income and REAL existing obligations (loans,
    card, and -- for a personal/commercial scenario -- their real mortgage) are layered underneath,
    exactly like the existing extra_liability What-If pattern, so every ratio is still computed by
    sama_rules and nothing is fabricated. Every response field is labeled as a simulation.
    """
    if financing_type not in WHATIF_FINANCING_TYPES:
        raise HTTPException(status_code=400, detail=f"unknown financing_type: {financing_type}")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount must be > 0")
    if term_years <= 0:
        raise HTTPException(status_code=400, detail="term_years must be > 0")

    profile = _calc_profile(_profile(account))  # guarantees a usable rate even for non-requesters
    rate = float(profile["loan_int_rate"])
    requested_term_months = round(term_years * 12)

    # SAMA caps personal financing terms at 60 months; real estate is explicitly exempt from that
    # cap in the rules reference (section 5, "General Constraint for All Brackets").
    term_clamped = financing_type != "mortgage" and requested_term_months > sama_rules.MAX_FINANCE_TERM_MONTHS
    term_months = (
        requested_term_months
        if financing_type == "mortgage"
        else min(requested_term_months, sama_rules.MAX_FINANCE_TERM_MONTHS)
    )

    if financing_type == "mortgage":
        # A hypothetical mortgage sits in T3's numerator only (excluded from T1 by definition),
        # stacked on top of any real mortgage the persona already carries.
        hypothetical_installment = sama_rules.monthly_installment(amount, rate, term_months)
        mod = {
            **profile,
            "mortgage_installment_sar": float(profile["mortgage_installment_sar"]) + hypothetical_installment,
            "requested_loan_amount_sar": 0.0,
            "loan_int_rate": rate,
            "loan_term_months": sama_rules.MAX_FINANCE_TERM_MONTHS,
        }
    else:
        mod = {
            **profile,
            "requested_loan_amount_sar": float(amount),
            "loan_int_rate": rate,
            "loan_term_months": term_months,
        }

    verdict = sama_rules.evaluate(mod)
    current_dbr_frac = float(verdict["salary_dbr"])
    current_dbr = round(current_dbr_frac * 100)
    eligible = bool(verdict["eligible_sama"])
    ceiling = _max_financeable_loan(mod)

    metrics = [
        {
            "label": f"نسبة الالتزام من الراتب (الحد {round(float(verdict['salary_cap']) * 100, 2)}٪)",
            "value": f"{current_dbr}٪",
            "tone": "warn" if current_dbr_frac > float(verdict["salary_cap"]) else "neutral",
        },
        {
            "label": f"إجمالي الالتزامات (الحد {round(float(verdict['total_cap']) * 100)}٪)",
            "value": f"{round(float(verdict['total_obligation_ratio']) * 100)}٪",
            "tone": "warn" if float(verdict["total_obligation_ratio"]) > float(verdict["total_cap"]) else "neutral",
        },
        {"label": "أقصى مبلغ يمكنك طلبه بعد هذا السيناريو", "value": _fmt_sar(ceiling), "tone": "neutral"},
        {"label": "معدل الفائدة المفترض للمحاكاة", "value": f"{round(rate, 1):g}٪", "tone": "neutral"},
    ]

    paths: list[dict] = []
    strategies_note = None
    if activate_strategies:
        if eligible:
            strategies_note = "السيناريو الافتراضي مؤهل بالفعل وفق أرقامك الحالية؛ لا حاجة لمسارات تحسين."
        else:
            paths = _strategy_paths(account, mod)

    return {
        "simulation": True,
        "simulationLabel": WHATIF_SIMULATION_LABEL_AR,
        "inputs": {
            "amount": round(amount),
            "termYears": term_years,
            "financingType": financing_type,
            "termClampedTo60Months": term_clamped,
            "assumedRatePct": round(rate, 2),
        },
        "financingTypeNote": WHATIF_COMMERCIAL_NOTE_AR if financing_type == "commercial" else None,
        "scores": {"personal": _eligibility_score(current_dbr_frac)},
        "metrics": metrics,
        "currentDbr": current_dbr,
        "currentTotalRatio": round(float(verdict["total_obligation_ratio"]) * 100),
        "currentAvailable": ceiling,
        "eligible": eligible,
        "testResults": _sama_test_results(mod),
        "strategiesActivated": activate_strategies,
        "strategiesNote": strategies_note,
        "paths": paths,
        "disclaimer": DISCLAIMER,
        # Part 6 — honest rate-market context (real dataset-derived range, not invented bounds).
        "rateRangeLowPct": _market_rate_range()[0],
        "rateRangeHighPct": _market_rate_range()[1],
        "rateMarketNote": RATE_MARKET_NOTE_AR,
        # Part 8 — the hypothetical loan's computed MONTHLY INSTALLMENT, never the raw amount.
        "newLoanInstallmentSar": round(float(verdict["new_loan_installment_sar"])),
    }


def _narrate_counterfactual_with_fallback() -> tuple[str | None, str]:
    """Counterfactual narration for the individuals eligibility screen.

    Prefers the PRE-BAKED, verified ALLaM narration (instant) for the demo persona so the
    Eligibility screen never blocks on a ~65s live ALLaM call (which, under the shared
    _OLLAMA_LOCK, could stall behind chat/plan generation). This mirrors the business track's
    prebaked-first approach. A live call is only attempted if the backup is unavailable.
    """
    try:
        narration = _load_backup()["narrations"]["counterfactual"]["narration"]
        if narration:
            return narration, "prebaked"
    except Exception:  # noqa: BLE001
        pass
    try:
        result = ae.narrate_counterfactual(_demo_profile())
        if result.get("narration"):
            return result["narration"], "live"
    except Exception:  # noqa: BLE001 -- demo robustness
        pass
    return None, "fallback"


# ── Chat (Layer 3 fixed-question narration) ──────────────────────────────────
def _classify_question(text: str) -> str | None:
    """Maps free Arabic text to one of advisor_engine's 3 fixed-question keys, else None."""
    t = text.strip()
    if any(k in t for k in ("لم تُقبَل", "لم يُقبل", "غير مؤهل", "لماذا لم")):
        return "why_not_eligible"
    if any(k in t for k in ("أرفع", "ارفع", "أصبح مؤهل", "تحسين", "المسار", "كيف أرفع")):
        return "how_to_become_eligible"
    if any(k in t for k in ("إنفاق", "انفاق", "مصاريف", "مصروف", "بنود")):
        return "top_spending_categories"
    return None


def _individual_chat_facts(account: str = DEMO_ACCOUNT) -> dict:
    """Real numbers (Layers 1/2) used to ground a free-typed individual question."""
    kpis = _build_overview(account)["kpis"]
    profile = _profile(account)
    baseline = sama_rules.evaluate(profile)
    return {
        "الدخل الشهري (ريال)": kpis["income"],
        "الإنفاق الشهري (ريال)": kpis["spending"],
        "الالتزامات الشهرية (ريال)": kpis["commitments"],
        "مبلغ التمويل المطلوب (ريال)": kpis["loans"],
        # Part 8 — the number that actually enters the DBR numerator is this loan's computed
        # MONTHLY INSTALLMENT (amount+term+rate -> installment), never the raw requested amount.
        # Named explicitly so the model has the real figure to cite instead of conflating the two.
        "القسط الشهري لهذا التمويل (ريال)": round(float(baseline["new_loan_installment_sar"])),
        "معدل الادخار (%)": kpis["savingsRate"],
        "نسبة الالتزام من الراتب DBR (%)": round(float(baseline["salary_dbr"]) * 100),
        "الحد النظامي لنسبة الالتزام (%)": round(float(baseline["salary_cap"]) * 100, 2),
        "إجمالي الالتزامات (%)": round(float(baseline["total_obligation_ratio"]) * 100),
        "معدل الفائدة (%)": float(profile["loan_int_rate"]),
    }


def _chat_reply(text: str, account: str = DEMO_ACCOUNT) -> tuple[str, str]:
    """Returns (reply_text, source). source in {'live','fallback','canned'}."""
    account = str(account)
    key = _classify_question(text)
    if key is None:
        # Free-typed question → live ALLaM grounded in THIS customer's real numbers.
        try:
            result = ae.narrate_free_text(text, _individual_chat_facts(account))
            if result.get("narration"):
                return result["narration"], "live"
        except Exception:  # noqa: BLE001
            pass
        return CANNED_CHAT_REPLY, "canned"

    try:
        if key == "top_spending_categories":
            result = ae.answer_fixed_question(key, account_number=account)
        else:
            result = ae.answer_fixed_question(key, customer_profile=_profile(account))
        if result.get("narration"):
            return result["narration"], "live"
    except Exception:  # noqa: BLE001
        pass

    # Fallback: the verified backup narration. It belongs to the DEMO persona, so it may only
    # ever be served for the demo persona -- handing another browsed customer these numbers would
    # be showing them someone else's financial figures. Same rule as the DiCE timeout fallback.
    if account == DEMO_ACCOUNT:
        try:
            backup = _load_backup()["narrations"]
            if key == "top_spending_categories":
                return backup["top_categories"]["narration"], "fallback"
            return backup["counterfactual"]["narration"], "fallback"
        except Exception:  # noqa: BLE001
            pass
    return CANNED_CHAT_REPLY, "canned"


# ── Business / SME (Layer B1/B2 engine + Layer 3 SME narration) ──────────────
SME_CATEGORIZED_CSV = DATA_PROCESSED / "sme_monthly_categorized.csv"
SME_CATEGORY_AR = ae.SME_CATEGORY_LABELS_AR
SME_CATEGORY_ICON = {
    "salaries_wages": "home",
    "cogs_suppliers": "shopping",
    "rent_utilities": "bill",
    "professional_services": "play",
    "licenses_fees": "bill",
    "visa_iqama_costs": "home",
    "vat": "bill",
    "loan_installments": "bill",
}
CANNED_SME_CHAT_REPLY = (
    "شكراً على سؤالك. خلاصة وضع منشأتك متاحة في لوحة الجاهزية: تدفق نقدي موجب، نمو مستقر، "
    "مع فجوة سيولة متوقعة يجب الاستعداد لها قبل التقدّم للتمويل. هل تريد الخطوات التفصيلية؟"
)


def _readiness_camel(readiness: dict) -> dict:
    """Maps sme_engine's snake_case readiness dict to the frontend's shape."""
    return {
        "score": readiness["score"],
        "statusWord": readiness["status_word"],
        "criteria": readiness["criteria"],
        "timing": readiness["timing"],
    }


def _settlement_for(account_number: str) -> float:
    """This business's own scheduled settlement (never another business's number)."""
    obligations = se.scheduled_obligations(account_number)
    return float(obligations[0]["amount"]) if obligations else 0.0


def _business_paths(readiness: dict) -> list[dict]:
    """Improvement paths templated from the real gap / settlement / runway numbers.

    The third plan is CONDITIONAL: most businesses in the pool have no scheduled settlement, and
    the old text hardcoded one -- which read as "reschedule your supplier settlement of 0 ر.س" for
    every business without a gap. A business with no predicted gap gets a growth-oriented plan
    instead of advice about a liability it does not have.
    """
    account = readiness["account_number"]
    settlement = _settlement_for(account)
    has_gap = bool(readiness.get("gap_months"))
    gap_ar = se._arabic_month(readiness["gap_months"][0]) if has_gap else None
    runway = readiness["runway_months"]

    before_gap = f"قبل فجوة {gap_ar}" if gap_ar else "قبل التقدم للتمويل"

    if has_gap and settlement > 0:
        third = {
            "id": 3,
            "title": f"تجاوز فجوة {gap_ar} بثبات",
            "summary": "عالج الشهر الحرج المتوقع مسبقاً فيكتمل ملفك التمويلي.",
            "steps": [
                f"جدولة تسوية المورد البالغة {_fmt_sar(settlement)} على دفعتين",
                "عرض موسمي لتحريك المخزون الراكد",
                "تجميد المصروفات غير الأساسية خلال الشهر الحرج",
            ],
            "duration": "3 أشهر",
            "effect": f"يقسّم تسوية {_fmt_sar(settlement)} ويمرّر {gap_ar} دون شهر سالب",
            "difficulty": "متوسط",
        }
    else:
        third = {
            "id": 3,
            "title": "ترسيخ نمو الإيراد",
            "summary": "ثبّت مسار النمو حتى تتقدّم للتمويل من موقع قوة.",
            "steps": [
                "تركيز الجهد على أعلى المنتجات هامشاً",
                "تثبيت عقود متكررة مع العملاء الكبار",
                "مراجعة التسعير على البنود منخفضة الهامش",
            ],
            "duration": "3 أشهر",
            "effect": "يرفع هامش الربح ويقوّي ملفك التمويلي",
            "difficulty": "متوسط",
        }

    return [
        {
            "id": 1,
            "title": "تحصيل أسرع للمستحقات",
            "summary": f"قلّص فترة تحصيل فواتيرك لتقوية التدفق {before_gap}.",
            "steps": [
                "فوترة فورية عند التسليم بدل نهاية الشهر",
                "خصم للسداد المبكر للعملاء الكبار",
                "متابعة أسبوعية للفواتير المتأخرة",
            ],
            "duration": "شهر واحد",
            "effect": f"يقوّي التدفق النقدي {before_gap}",
            "difficulty": "سهل",
        },
        _reserve_plan(runway),
        third,
    ]


# A business is considered to have a comfortable cash buffer at this many months of runway.
# Below it, the advice is to BUILD the reserve; at or above it, telling the business to "raise
# your safety months from 5.8 to 3+" would be advising a DOWNGRADE (found while browsing).
HEALTHY_RUNWAY_MONTHS = 3


def _reserve_plan(runway: float) -> dict:
    """Plan 2 — build a reserve, or protect one the business already has."""
    if runway < HEALTHY_RUNWAY_MONTHS:
        return {
            "id": 2,
            "title": "بناء احتياطي نقدي",
            "summary": f"ارفع أشهر الأمان النقدي من {runway} إلى {HEALTHY_RUNWAY_MONTHS} أشهر فأكثر قبل التقدم للتمويل.",
            "steps": [
                "تحويل جزء ثابت من صافي كل شهر إلى حساب احتياطي",
                "تأجيل المصروفات الرأسمالية غير العاجلة",
                "إعادة التفاوض على آجال دفعات الموردين",
            ],
            "duration": "شهران",
            "effect": f"يرفع الأمان النقدي من {runway} إلى {HEALTHY_RUNWAY_MONTHS} أشهر فأكثر",
            "difficulty": "متوسط",
        }
    return {
        "id": 2,
        "title": "الحفاظ على الاحتياطي النقدي",
        "summary": f"أشهر الأمان النقدي لديك {runway} — حافظ عليها ووظّف الفائض بما يخدم النمو.",
        "steps": [
            "تثبيت حد أدنى للاحتياطي لا يُمس في التشغيل اليومي",
            "توجيه الفائض عن الحد إلى استثمار تشغيلي مدروس",
            "مراجعة ربع سنوية لكفاية الاحتياطي مقابل نمو المصروفات",
        ],
        "duration": "شهران",
        "effect": f"يحافظ على أشهر الأمان النقدي البالغة {runway}",
        "difficulty": "سهل",
    }


@lru_cache(maxsize=256)
def _build_business_overview(account: str = DEMO_SME_ACCOUNT) -> dict:
    cashflow = se.forecast_sme_cashflow(account)
    readiness = se.assess_readiness(account)
    history = cashflow["history"]
    last = history[-1]

    series = [
        {"month": _arabic_month(row["month"]), "income": round(row["revenue"]), "spending": round(row["expenses"])}
        for row in history[-6:]
    ]

    cat_df = _sme_categorized_all()
    cat_df = cat_df[cat_df["accountNumber"] == str(account)]
    avg = cat_df.groupby("category")["amount"].mean().sort_values(ascending=False)
    total = float(avg.sum()) or 1.0
    categories = [
        {
            "name": SME_CATEGORY_AR.get(slug, slug),
            "value": round(float(amount) / total * 100),
            "amount": round(float(amount)),
            "color": CATEGORY_COLORS[i % len(CATEGORY_COLORS)],
        }
        for i, (slug, amount) in enumerate(avg.items())
    ]

    kpis = {
        "netCashflow": round(last["net_cashflow"]),
        "revenue": round(last["revenue"]),
        "expenses": round(last["expenses"]),
        "runwayMonths": readiness["runway_months"],
        "revenueGrowth": readiness["revenue_growth_pct"],
    }

    return {"kpis": kpis, "series": series, "categories": categories, "readiness": _readiness_camel(readiness)}


@lru_cache(maxsize=256)
def _build_business_transactions(account: str = DEMO_SME_ACCOUNT) -> list[dict]:
    """Recent business 'transactions' derived from real monthly category totals (aggregates)."""
    cat_df = _sme_categorized_all()
    cat_df = cat_df[cat_df["accountNumber"] == str(account)].sort_values("ds", ascending=False)
    rows = []
    for i, (_, r) in enumerate(cat_df.head(12).iterrows(), start=1):
        slug = r["category"]
        rows.append(
            {
                "id": i,
                "name": SME_CATEGORY_AR.get(slug, slug),
                "category": SME_CATEGORY_AR.get(slug, slug),
                "amount": -round(float(r["amount"])),
                "date": _arabic_month(str(r["ds"])),
                "icon": SME_CATEGORY_ICON.get(slug, "bill"),
            }
        )
    return rows


def _gap_info(readiness: dict) -> dict:
    """Real numbers describing the liquidity gap, for the SME 'active plan' widgets.

    All grounded: cash balance from sme_profile, settlement amount from the scheduled
    obligations file, gap month + projected net from the forecast engine.
    """
    cashflow = se.forecast_sme_cashflow(readiness["account_number"])  # cached
    settlement = _settlement_for(readiness["account_number"])

    gap_months = readiness.get("gap_months", [])
    gap_month = gap_months[0] if gap_months else None
    projected_net = 0.0
    month_label = None
    if gap_month:
        month_label = se._arabic_month(gap_month)
        gap_row = next((r for r in cashflow["forecast"] if r["month"] == gap_month), None)
        if gap_row:
            projected_net = gap_row["net_cashflow"]

    return {
        "month": gap_month,
        "monthLabel": month_label,
        "settlementAmount": round(settlement),
        "cashBalance": round(float(readiness["cash_balance_sar"])),
        "projectedNet": round(projected_net),
    }


@lru_cache(maxsize=256)
def _build_business_readiness(account: str = DEMO_SME_ACCOUNT) -> dict:
    readiness = se.assess_readiness(account)
    return {**_readiness_camel(readiness), "gap": _gap_info(readiness)}


# ── AI-generated action plans (prebaked -> live -> templated) ────────────────
def _assemble_plans(raw_plans: list[dict], gap: dict) -> list[dict]:
    """Adds id + a real-number `effect` to each digit-free AI plan (numbers injected here).

    The effects are gap-aware: a business with no predicted gap has no settlement and no deficit,
    and injecting "eases your gap of 0 SAR" would be stating a number that is not a fact about it.
    """
    settlement = int(gap["settlementAmount"])
    cash = int(gap["cashBalance"])
    deficit = abs(int(gap["projectedNet"]))
    month = gap["monthLabel"]

    if month and settlement > 0:
        effects = [
            f"يخفّف أثر فجوة {month} البالغة {settlement:,} ريال",
            f"يحمي سيولتك الحالية البالغة {cash:,} ريال",
            f"يقلّص العجز المتوقع في {month} البالغ {deficit:,} ريال",
        ]
    else:
        effects = [
            f"يقوّي سيولتك الحالية البالغة {cash:,} ريال",
            f"يحمي سيولتك الحالية البالغة {cash:,} ريال",
            "يرفع جاهزيتك التمويلية دون فجوة سيولة متوقعة",
        ]
    assembled = []
    for i, plan in enumerate(raw_plans[:3]):
        assembled.append(
            {
                "id": i + 1,
                "title": plan["title"],
                "summary": plan["summary"],
                "steps": plan["steps"],
                "duration": plan["duration"],
                "difficulty": plan["difficulty"],
                "pros": plan["pros"],
                "cons": plan["cons"],
                "effect": effects[i % len(effects)],
            }
        )
    return assembled


def _load_prebaked_business_plans() -> list[dict] | None:
    """Returns the pre-baked, validated AI plans for the demo persona, or None."""
    try:
        entry = _load_backup().get("business_plans")
        if entry and isinstance(entry.get("plans"), list) and len(entry["plans"]) >= 3:
            return entry["plans"]
    except Exception:  # noqa: BLE001
        pass
    return None


def _business_plans_context(readiness: dict) -> str:
    """A qualitative (digit-free) description of the business, for live plan generation."""
    gap_note = (
        "وتتوقع فجوة سيولة صيفية بسبب تسوية مورد كبيرة"
        if readiness.get("gap_months")
        else "ولا تتوقع فجوة سيولة قريبة"
    )
    return (
        f"منشأة تجزئة، جاهزيتها التمويلية «{readiness['status_word']}». تدفقها النقدي موجب "
        f"ومستقر، لكن أشهر الأمان النقدي لديها منخفضة، {gap_note}."
    )


@lru_cache(maxsize=256)
def _build_business_plans(account: str = DEMO_SME_ACCOUNT) -> dict:
    """Serves action plans for one business.

    The pre-baked AI plans belong to the DEMO persona and are only ever served for it -- another
    business must never be shown plans written about someone else's situation. Browsing any other
    account gets the templated playbook, which is instant and grounded in that business's OWN real
    numbers. Live AI generation is deliberately NOT attempted on this path: it takes ~46-102s per
    business, which would make the account browser unusable.
    """
    readiness = se.assess_readiness(account)
    gap = _gap_info(readiness)

    if str(account) == DEMO_SME_ACCOUNT:
        prebaked = _load_prebaked_business_plans()
        if prebaked:
            return {"plans": _assemble_plans(prebaked, gap), "plansSource": "prebaked"}
        try:
            raw = ae.generate_action_plans(_business_plans_context(readiness))
            if raw:
                return {"plans": _assemble_plans(raw, gap), "plansSource": "ai"}
        except Exception:  # noqa: BLE001
            pass

    return {"plans": _business_paths(readiness), "plansSource": "template"}


def _classify_sme_question(text: str) -> str | None:
    t = text.strip()
    if any(k in t for k in ("مصروف", "مصاريف", "إنفاق", "انفاق", "بنود", "تذهب")):
        return "top_business_expenses"
    if any(k in t for k in ("شبه جاهز", "لماذا جاهزيت", "جاهزيتي")):
        return "why_semi_ready"
    if any(k in t for k in ("فجوة", "أغسطس", "اغسطس", "أستعد", "استعد")):
        return "how_prepare_gap"
    if any(k in t for k in ("الوقت", "مناسب", "تمويل", "أطلب", "اطلب")):
        return "is_timing_right"
    return None


def _sme_readiness_fallback_text(readiness: dict) -> str:
    """Deterministic Arabic summary from real numbers — the never-empty SME chat fallback."""
    gap_ar = se._arabic_month(readiness["gap_months"][0]) if readiness.get("gap_months") else None
    base = (
        f"جاهزيتك التمويلية {readiness['score']} ({readiness['status_word']}). "
        f"تدفقك النقدي موجب منذ {readiness['positive_streak_months']} أشهر ونمو إيراداتك "
        f"{readiness['revenue_growth_pct']}٪"
    )
    if gap_ar:
        base += f"، لكن هناك فجوة سيولة متوقعة في {gap_ar}. {readiness['timing']['verdict']}."
    else:
        base += f". {readiness['timing']['verdict']}."
    return base


def _business_chat_facts(account: str = DEMO_SME_ACCOUNT) -> dict:
    """Real numbers (SME engine) used to ground a free-typed business question."""
    overview = _build_business_overview(account)
    kpis = overview["kpis"]
    return {
        "الإيراد الشهري (ريال)": kpis["revenue"],
        "المصروف الشهري (ريال)": kpis["expenses"],
        "صافي التدفق النقدي (ريال)": kpis["netCashflow"],
        "أشهر الأمان النقدي": kpis["runwayMonths"],
        "نمو الإيرادات (%)": kpis["revenueGrowth"],
        "درجة الجاهزية التمويلية": overview["readiness"]["score"],
    }


def _business_chat_reply(text: str, account: str = DEMO_SME_ACCOUNT) -> tuple[str, str]:
    account = str(account)
    key = _classify_sme_question(text)
    if key is None:
        # Free-typed question → live SME ALLaM grounded in THIS business's real numbers.
        try:
            result = ae.narrate_free_text(text, _business_chat_facts(account))
            if result.get("narration"):
                return result["narration"], "live"
        except Exception:  # noqa: BLE001
            pass
        return CANNED_SME_CHAT_REPLY, "canned"

    try:
        result = ae.answer_sme_question(key, account_number=account)
        if result.get("narration"):
            return result["narration"], "live"
    except Exception:  # noqa: BLE001
        pass

    # Deterministic fallback from THIS business's real engine numbers (never empty).
    try:
        if key == "top_business_expenses":
            top = ae._sme_top_expenses(account)
            parts = "، ".join(f"{e['category']} بمبلغ {_fmt_sar(e['avg_monthly_amount'])}" for e in top)
            return f"أكبر بنود مصروفاتك التشغيلية شهرياً: {parts}.", "fallback"
        return _sme_readiness_fallback_text(se.assess_readiness(account)), "fallback"
    except Exception:  # noqa: BLE001
        return CANNED_SME_CHAT_REPLY, "canned"


# ── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="Murtaqa Bridge", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/banks")
def get_banks() -> list[dict]:
    return [
        {"id": "alinma", "name": "مصرف الإنماء", "featured": True},
        {"id": "alrajhi", "name": "الراجحي", "featured": False},
        {"id": "snb", "name": "الأهلي", "featured": False},
        {"id": "riyad", "name": "الرياض", "featured": False},
        {"id": "sab", "name": "ساب", "featured": False},
    ]


def _resolve_individual(account: str | None) -> str:
    """Validates a requested individual account, falling back to the demo persona."""
    if not account:
        return DEMO_ACCOUNT
    account = str(account)
    if account not in _known_individual_accounts():
        raise HTTPException(status_code=404, detail=f"unknown individual account: {account}")
    return account


def _resolve_business(account: str | None) -> str:
    """Validates a requested SME account, falling back to the demo persona."""
    if not account:
        return DEMO_SME_ACCOUNT
    account = str(account)
    if account not in _known_business_accounts():
        raise HTTPException(status_code=404, detail=f"unknown business account: {account}")
    return account


@lru_cache(maxsize=1)
def _known_individual_accounts() -> frozenset[str]:
    return frozenset(a["accountNumber"] for a in _individual_accounts())


@lru_cache(maxsize=1)
def _known_business_accounts() -> frozenset[str]:
    return frozenset(a["accountNumber"] for a in _business_accounts())


# ── Account browser: the full list of every persona in both pools ────────────
@app.get("/api/individuals/accounts")
def individuals_accounts() -> dict:
    return {"accounts": _individual_accounts(), "demoAccount": DEMO_ACCOUNT}


@app.get("/api/business/accounts")
def business_accounts() -> dict:
    return {"accounts": _business_accounts(), "demoAccount": DEMO_SME_ACCOUNT}


@app.get("/api/individuals/overview")
def individuals_overview(account: str | None = None) -> dict:
    return _build_overview(_resolve_individual(account))


@app.get("/api/individuals/transactions")
def individuals_transactions(account: str | None = None) -> list[dict]:
    return _build_transactions(_resolve_individual(account))


@app.get("/api/individuals/eligibility")
def individuals_eligibility(
    account: str | None = None,
    extra_liability: float = 0.0,
    override_requested_amount: float | None = None,
) -> dict:
    # extra_liability > 0 -> What-If: add a hypothetical monthly liability and recompute everything.
    # override_requested_amount -> Part 5: demo-only override of the requested loan amount, applied
    # on top (both can be combined); neither is ever written back to the stored profile.
    override = (
        float(override_requested_amount)
        if override_requested_amount is not None and override_requested_amount > 0
        else None
    )
    return _build_eligibility(_resolve_individual(account), max(0.0, float(extra_liability)), override)


@app.get("/api/individuals/whatif-simulator")
def individuals_whatif_simulator(
    account: str | None = None,
    amount: float = 0.0,
    term_years: float = 5.0,
    financing_type: str = "personal",
    activate_strategies: bool = False,
) -> dict:
    """Standalone hypothetical-financing calculator (Part 4) — entirely separate from the live
    /individuals/eligibility screen and its cache; never mutates a persona's real data."""
    return _build_whatif_simulation(
        _resolve_individual(account), float(amount), float(term_years), str(financing_type), bool(activate_strategies)
    )


@app.get("/api/individuals/advisor")
def individuals_advisor(account: str | None = None) -> dict:
    """Lazily generates the counterfactual narration for ONE account.

    Split out of /eligibility so that screen never blocks on the LLM: the demo persona returns
    its pre-baked narration instantly, and any other browsed account gets a live ALLaM call
    (~30-60s) that the frontend loads in the background after the numbers are already on screen.
    """
    resolved = _resolve_individual(account)
    if resolved == DEMO_ACCOUNT:
        narration, source = _narrate_counterfactual_with_fallback()
        return {"narration": narration, "source": source}
    try:
        result = ae.narrate_counterfactual(_profile(resolved))
        if result.get("narration"):
            return {"narration": result["narration"], "source": "live"}
    except Exception:  # noqa: BLE001
        pass
    # The guard rejected every attempt (or Ollama is down). Return nothing rather than another
    # customer's narration -- the same no-fabricated-numbers rule the engines follow.
    return {"narration": None, "source": "fallback"}


@app.post("/api/individuals/chat")
def individuals_chat(payload: dict) -> dict:
    text = str(payload.get("question", ""))
    account = _resolve_individual(payload.get("account"))
    reply, source = _chat_reply(text, account)
    return {"text": reply, "source": source}


@app.get("/api/individuals/savings-strategies")
def individuals_savings_strategies() -> dict:
    """The strategy library + goal chips — lets the UI render the override dropdown and recompute
    the cards client-side from each strategy's ratios (income * ratio)."""
    strategies = [
        {"key": key, "name": st["name"], "tagline": st["tagline"],
         "ratios": {"needs": st["ratios"][0], "wants": st["ratios"][1], "savings": st["ratios"][2]}}
        for key, st in SAVINGS_STRATEGIES.items()
    ]
    return {"strategies": strategies, "goals": SAVINGS_GOALS, "defaultStrategy": DEFAULT_STRATEGY}


@app.get("/api/individuals/savings-plan")
def individuals_savings_plan(account: str | None = None, strategy: str | None = None) -> dict:
    """Deterministic savings breakdown for one strategy (instant, no LLM). Powers the page summary
    and the bucket cards; `strategy` defaults to the balanced 50/30/20 split."""
    return _build_savings_plan(_resolve_individual(account), strategy or DEFAULT_STRATEGY)


@app.post("/api/individuals/savings-advice")
def individuals_savings_advice(payload: dict) -> dict:
    """AI picks the best strategy for the user's goal + narrates it (numbers computed in Python).

    Body: {account?, goal?}. Fetched only when the user taps 'Generate my plan'.
    """
    account = _resolve_individual(payload.get("account"))
    goal = payload.get("goal")
    goal = str(goal) if goal is not None else None
    return _build_savings_advice(account, goal)


@app.get("/api/business/overview")
def business_overview(account: str | None = None) -> dict:
    return _build_business_overview(_resolve_business(account))


@app.get("/api/business/transactions")
def business_transactions(account: str | None = None) -> list[dict]:
    return _build_business_transactions(_resolve_business(account))


@app.get("/api/business/readiness")
def business_readiness(account: str | None = None) -> dict:
    return _build_business_readiness(_resolve_business(account))


@app.get("/api/business/plans")
def business_plans(account: str | None = None) -> dict:
    return _build_business_plans(_resolve_business(account))


@app.post("/api/business/chat")
def business_chat(payload: dict) -> dict:
    text = str(payload.get("question", ""))
    account = _resolve_business(payload.get("account"))
    reply, source = _business_chat_reply(text, account)
    return {"text": reply, "source": source}


# ── Part 3: stateful roadmap progress (activate a plan, tick its steps, persist) ──
# The steps are the SAME deterministic ones already shown on the eligibility/plans screens;
# roadmap_engine only freezes the chosen plan and tracks completion (survives restart/reload).
def _individual_plan_snapshot(account: str, plan_id: int) -> dict | None:
    """Normalizes the chosen individuals path into a roadmap_engine snapshot (its rich roadmap)."""
    for path in _build_eligibility(account).get("paths", []):
        if int(path.get("id")) == int(plan_id):
            steps = path.get("roadmap") or [
                {"step_number": i + 1, "title": s} for i, s in enumerate(path.get("steps", []))
            ]
            return {"id": path["id"], "title": path.get("title", ""), "steps": steps}
    return None


def _business_plan_snapshot(account: str, plan_id: int) -> dict | None:
    """Normalizes the chosen SME plan into a roadmap_engine snapshot (its checklist steps)."""
    for plan in _build_business_plans(account).get("plans", []):
        if int(plan.get("id")) == int(plan_id):
            steps = [
                {"step_number": i + 1, "label": s} for i, s in enumerate(plan.get("steps", []))
            ]
            return {"id": plan["id"], "title": plan.get("title", ""), "steps": steps}
    return None


def _roadmap_activate(track: str, account: str, snapshot: dict | None) -> dict:
    if snapshot is None:
        raise HTTPException(status_code=404, detail="unknown plan for this account")
    return rme.activate(track, account, snapshot)


def _roadmap_set_step(track: str, account: str, payload: dict) -> dict:
    if "stepNumber" not in payload:
        raise HTTPException(status_code=400, detail="stepNumber is required")
    try:
        return rme.set_step(track, account, int(payload["stepNumber"]), bool(payload.get("done", True)))
    except LookupError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/individuals/roadmap")
def individuals_roadmap(account: str | None = None) -> dict:
    return {"progress": rme.get_progress("individuals", _resolve_individual(account))}


@app.post("/api/individuals/roadmap/activate")
def individuals_roadmap_activate(payload: dict) -> dict:
    account = _resolve_individual(payload.get("account"))
    snapshot = _individual_plan_snapshot(account, payload.get("planId"))
    return {"progress": _roadmap_activate("individuals", account, snapshot)}


@app.post("/api/individuals/roadmap/step")
def individuals_roadmap_step(payload: dict) -> dict:
    account = _resolve_individual(payload.get("account"))
    return {"progress": _roadmap_set_step("individuals", account, payload)}


@app.post("/api/individuals/roadmap/clear")
def individuals_roadmap_clear(payload: dict) -> dict:
    rme.clear("individuals", _resolve_individual(payload.get("account")))
    return {"progress": None}


@app.get("/api/business/roadmap")
def business_roadmap(account: str | None = None) -> dict:
    return {"progress": rme.get_progress("business", _resolve_business(account))}


@app.post("/api/business/roadmap/activate")
def business_roadmap_activate(payload: dict) -> dict:
    account = _resolve_business(payload.get("account"))
    snapshot = _business_plan_snapshot(account, payload.get("planId"))
    return {"progress": _roadmap_activate("business", account, snapshot)}


@app.post("/api/business/roadmap/step")
def business_roadmap_step(payload: dict) -> dict:
    account = _resolve_business(payload.get("account"))
    return {"progress": _roadmap_set_step("business", account, payload)}


@app.post("/api/business/roadmap/clear")
def business_roadmap_clear(payload: dict) -> dict:
    rme.clear("business", _resolve_business(payload.get("account")))
    return {"progress": None}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
