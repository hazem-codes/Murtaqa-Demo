"""Single source of truth for SAMA's individual lending math.

Every number here comes from docs/Murtaqa_Financial_Rules_Reference_EN.md (SAMA Circular
46538/99, sections 2-6). Nothing in this module may be estimated, rounded, or invented --
per the project's golden rule, a ratio that is not in that document does not exist.

Imported by the dataset generator, the counterfactual engine, and the API bridge, so the
eligibility math cannot drift between the data, the model, and what the UI tells the user.

THE TWO RATIOS (they are NOT the same, and the distinction is load-bearing):

  salary_dbr           = salary-linked credit obligations / gross salary
                         EXCLUDING the mortgage, because SAMA caps consumer credit against
                         salary separately from real estate (rules ref, section 5).
                         cap: 33.33% (employee), 25% (retiree).

  total_obligation_ratio = ALL obligations / gross salary, INCLUDING the mortgage.
                         cap: 45% with no mortgage; with a mortgage the cap rises by income
                         bracket (55% in bracket 1, 65% in brackets 2-3).

  eligible = salary_dbr <= salary_cap AND total_obligation_ratio <= total_cap
"""

from __future__ import annotations

# ── Official SAMA constants (rules reference, sections 3-5) ─────────────────────────────
SALARY_CAP_EMPLOYEE = 0.3333   # exactly 33.33%, not 33% -- the rules reference is explicit.
SALARY_CAP_RETIREE = 0.25
TOTAL_CAP_NO_MORTGAGE = 0.45   # total obligations excl. real estate, all income brackets.
TOTAL_CAP_MORTGAGE_BRACKET_1 = 0.55
TOTAL_CAP_MORTGAGE_BRACKET_2_3 = 0.65
MAX_FINANCE_TERM_MONTHS = 60   # max term, except real estate and credit cards.
CREDIT_CARD_MIN_PAYMENT_RATE = 0.05  # the obligation is the minimum repayment, not the balance.
VARIABLE_ALLOWANCE_COUNTED_SHARE = 0.5  # other income counts at half its monthly average.

BRACKET_1_MAX_SAR = 15_000.0
BRACKET_2_MAX_SAR = 25_000.0


def income_bracket(gross_salary_sar: float) -> int:
    """SAMA's three official income brackets (1: <=15k, 2: 15k-25k, 3: >=25k)."""
    if gross_salary_sar <= BRACKET_1_MAX_SAR:
        return 1
    if gross_salary_sar < BRACKET_2_MAX_SAR:
        return 2
    return 3


def salary_cap(employment_type: str) -> float:
    """The salary-linked obligation cap: 33.33% employee, 25% retiree."""
    return SALARY_CAP_RETIREE if employment_type == "retired" else SALARY_CAP_EMPLOYEE


def total_cap(has_mortgage: bool, bracket: int) -> float:
    """The total-obligations cap that applies to this persona."""
    if not has_mortgage:
        return TOTAL_CAP_NO_MORTGAGE
    if bracket == 1:
        return TOTAL_CAP_MORTGAGE_BRACKET_1
    return TOTAL_CAP_MORTGAGE_BRACKET_2_3


def monthly_installment(principal_sar: float, annual_rate_pct: float, term_months: int) -> float:
    """Standard annuity installment. A zero rate falls back to straight-line repayment."""
    if principal_sar <= 0:
        return 0.0
    monthly_rate = annual_rate_pct / 100.0 / 12.0
    if monthly_rate <= 0:
        return principal_sar / term_months
    return principal_sar * monthly_rate / (1.0 - (1.0 + monthly_rate) ** -term_months)


def principal_from_installment(
    installment_sar: float, annual_rate_pct: float, term_months: int
) -> float:
    """Inverse of monthly_installment(): the largest principal a given installment can service.

    Used by the counterfactual engine's timeout fallback to answer, in closed form, "how much
    could this customer actually borrow and still sit inside their SAMA caps?".
    """
    if installment_sar <= 0:
        return 0.0
    monthly_rate = annual_rate_pct / 100.0 / 12.0
    if monthly_rate <= 0:
        return installment_sar * term_months
    return installment_sar * (1.0 - (1.0 + monthly_rate) ** -term_months) / monthly_rate


def evaluate(profile: dict) -> dict:
    """Computes both SAMA ratios and the eligibility verdict for one persona.

    Args:
        profile: needs gross_salary_sar, employment_type, mortgage_installment_sar,
            other_loan_installments_sar, credit_card_min_payment_sar,
            requested_loan_amount_sar, loan_int_rate, and (optionally) loan_term_months.

    Returns:
        The derived fields: new_loan_installment_sar, salary_linked_obligations_sar,
        total_obligations_sar, salary_dbr, total_obligation_ratio, salary_cap, total_cap,
        loan_percent_income, income_bracket, eligible_sama.
    """
    gross = float(profile["gross_salary_sar"])
    term = int(profile.get("loan_term_months", MAX_FINANCE_TERM_MONTHS))

    new_loan_installment = monthly_installment(
        float(profile["requested_loan_amount_sar"]), float(profile["loan_int_rate"]), term
    )

    mortgage = float(profile["mortgage_installment_sar"])
    salary_linked = (
        float(profile["other_loan_installments_sar"])
        + float(profile["credit_card_min_payment_sar"])
        + new_loan_installment
    )
    total = salary_linked + mortgage

    bracket = income_bracket(gross)
    applicable_salary_cap = salary_cap(str(profile["employment_type"]))
    applicable_total_cap = total_cap(mortgage > 0, bracket)

    salary_dbr = salary_linked / gross
    total_obligation_ratio = total / gross

    return {
        "new_loan_installment_sar": new_loan_installment,
        "salary_linked_obligations_sar": salary_linked,
        "total_obligations_sar": total,
        "salary_dbr": salary_dbr,
        "total_obligation_ratio": total_obligation_ratio,
        "salary_cap": applicable_salary_cap,
        "total_cap": applicable_total_cap,
        "loan_percent_income": float(profile["requested_loan_amount_sar"]) / (gross * 12.0),
        "income_bracket": bracket,
        "eligible_sama": int(
            salary_dbr <= applicable_salary_cap and total_obligation_ratio <= applicable_total_cap
        ),
    }


def evaluate_tests(profile: dict) -> dict:
    """Additive routing/presentation layer over evaluate(): the SAME ground-truth eligibility,
    exposed as an explicit per-test breakdown the frontend can route its recommendation
    strategies on.

    It does NOT redefine any cap, denominator, or numerator -- every ratio and limit is taken
    straight from evaluate(), so `is_eligible` here is provably identical to evaluate()'s
    `eligible_sama`, and nothing can drift from the generated data or the trained model.

    The three parallel tests (all must pass), against the project's ground-truth denominator
    (gross salary = base + fixed allowances + half of variable, per the SAMA reference):

      Test 1  salary-linked DBR (excl. mortgage) <= 33.33% employee / 25% retiree
      Test 2  salary-linked DBR (excl. mortgage) <= 45%   -- the no-mortgage total baseline; it
              shares Test 1's ratio and is always dominated by it (cap 33.33% < 45%), so it never
              fails independently. Reported for completeness/routing and flagged binding=False.
      Test 3  total DBR (incl. mortgage) <= 45% (no mortgage) / 55%-65% (with mortgage, by bracket)

    Returns:
        {"is_eligible": bool,   # == evaluate()['eligible_sama']
         "test_results": [ {id, label, calculated_ratio, allowed_limit, passed, binding,
                            numerator_sar, denominator_sar, overage_sar}, ... ]}
    """
    r = evaluate(profile)
    gross = float(profile["gross_salary_sar"])
    has_mortgage = float(profile["mortgage_installment_sar"]) > 0
    salary_linked = float(r["salary_linked_obligations_sar"])
    total = float(r["total_obligations_sar"])

    def _test(id_, label, numerator, denominator, ratio, limit, binding):
        return {
            "id": id_,
            "label": label,
            "calculated_ratio": ratio,
            "allowed_limit": limit,
            "passed": ratio <= limit,
            "binding": binding,                                        # can failing it cause rejection?
            "numerator_sar": numerator,                                # monthly obligation in the numerator
            "denominator_sar": denominator,                            # income denominator
            "overage_sar": max(0.0, numerator - limit * denominator),  # SAR/month over the cap (0 if passed)
        }

    total_label = (
        "إجمالي الالتزامات (شامل الرهن العقاري)"
        if has_mortgage
        else "إجمالي الالتزامات (بدون رهن عقاري)"
    )
    tests = [
        _test("salary_dbr", "نسبة الالتزام من الراتب (باستثناء الرهن العقاري)",
              salary_linked, gross, r["salary_dbr"], r["salary_cap"], True),
        _test("total_dbr_no_mortgage", "إجمالي الالتزامات (باستثناء الرهن العقاري)",
              salary_linked, gross, r["salary_dbr"], TOTAL_CAP_NO_MORTGAGE, False),
        _test("total_dbr", total_label,
              total, gross, r["total_obligation_ratio"], r["total_cap"], True),
    ]

    return {"is_eligible": all(t["passed"] for t in tests), "test_results": tests}
