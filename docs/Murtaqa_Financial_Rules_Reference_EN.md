# Financial Rules & Regulatory Reference — "Murtaqa" Project (Amad Hackathon 2026)
> This is the fixed reference file for all financial rules and regulatory constraints in this project. These numbers should not change except with a new documented official source.

---

## 1. Official Source Document (Verified & Confirmed)
**Document:** Responsible Lending Principles for Individual Customers
**Issuing Authority:** Saudi Central Bank (SAMA)
**Circular No.:** 46538/99 dated 02/09/1439H (17/05/2018)
**Amended by Circular No.:** 40694/1 dated 09/09/1439H (24/05/2018)
**Effective date (Quantitative Principles, Chapter IV):** Immediate from circulation date
**Full document effective date:** 01/12/1439H (12/08/2018)

---

## 2. Precise Official Definitions (must be used literally in code)

| Term | Official Definition |
|---|---|
| **Gross Salary** | Basic monthly salary (after deducting GOSI/pension contributions) + all fixed monthly allowances paid by the employer |
| **Total Monthly Income** | Gross Salary + any other verifiable periodic income (calculated per Rule 3 below) |
| **Monthly Credit Obligations** | Total amount payable monthly across all credit obligations (see Rule 4) |
| **Deductible Ratio (DBR)** | Ratio of monthly credit obligations to total monthly income |
| **Monthly Disposable Income** | Remaining amount of monthly income after deducting basic expenses and credit obligations |

---

## 3. Total Monthly Income Calculation Rule
- Basic salary is counted in full as documented by the employer.
- **Other income** (periodic allowances, rental income, investment returns) is counted at **half of the monthly average only**, and must be verifiable via at least a 2-year bank statement or official documents proving continuity.
- **Citizen's Account and social security subsidies are NOT counted** as income at all, except in real estate financing if documented through the Ministry of Housing or Real Estate Development Fund.

---

## 4. Monthly Credit Obligations Calculation Rule
- Credit card obligation = **minimum repayment** on the credit ceiling, NOT the full balance.
- Includes: all obligations to creditors and specialized government lending institutions + loans from employer/friends/relatives + any other financing.
- Variable-cost financing: an additional margin must be included in the calculation to mitigate cost-change risk.
- Financing with unequal installments: calculated based on the fixed monthly average across all installments.

---

## 5. Official Ratios by Income Bracket (Individuals Only)

> Critical note: the ratio is exactly **33.33%**, NOT 33% — must be precise in code.

### Bracket 1: Monthly income ≤ SAR 15,000
| Constraint | Ratio |
|---|---|
| Gross Salary (employee) | ≤ 33.33% |
| Gross Salary (retiree) | ≤ 25% |
| Total obligations (excl. real estate) | ≤ 45% of total income |
| Total obligations (incl. real estate) | ≤ 55% of total income |
| Total obligations (Ministry of Housing/Real Estate Development Fund beneficiaries) | ≤ 65% of total income |

### Bracket 2: SAR 15,000 < Monthly income < SAR 25,000
| Constraint | Ratio |
|---|---|
| Gross Salary (employee) | ≤ 33.33% |
| Gross Salary (retiree) | ≤ 25% |
| Total obligations (excl. real estate) | ≤ 45% of total income |
| Total obligations (incl. real estate) | ≤ 65% of total income |

### Bracket 3: Monthly income ≥ SAR 25,000
| Constraint | Ratio |
|---|---|
| Gross Salary (employee) | ≤ 33.33% |
| Gross Salary (retiree) | ≤ 25% |
| Remaining obligations | Subject to creditor's own credit policy — no fixed official cap |

### General Constraint for All Brackets
- **Financing term ≤ 60 months (5 years)**, except for real estate financing and credit cards.

---

## 6. Final Code-Ready Formula

```python
def calculate_dbr(gross_salary, total_monthly_income, monthly_obligations, is_retired=False):
    salary_limit = 0.25 if is_retired else 0.3333
    salary_dbr = monthly_obligations / gross_salary
    salary_ok = salary_dbr <= salary_limit

    income_limit = 0.45  # excl. real estate, applies across brackets
    income_dbr = monthly_obligations / total_monthly_income
    income_ok = income_dbr <= income_limit

    eligible = salary_ok and income_ok
    gap = max(0, monthly_obligations - (gross_salary * salary_limit))
    return {
        "eligible": eligible,
        "salary_dbr": round(salary_dbr, 4),
        "salary_limit": salary_limit,
        "income_dbr": round(income_dbr, 4),
        "income_limit": income_limit,
        "gap": round(gap, 2)
    }
```

> Team note: the simplified prototype version is sufficient if it applies the 33.33%/25% salary cap + 45% total income cap (excl. real estate) as the minimum acceptable check — this fully covers Khalid's and Sarah's personas.

---

## 7. SME Rule (Important: Do Not Fabricate a Fixed Ratio)

> **There is NO official fixed DBR or DSCR ratio from SAMA for SMEs.** Confirmed via direct research of SAMA's website and the official Kafalah platform. Project's adopted decision:

**Adopted approach: Cash-flow analysis instead of a fixed debt ratio.**
Proposed prototype eligibility criteria:
1. Positive net cash flow sustained over at least the last 3 months.
2. Stable or increasing monthly revenue growth (example: Nawah persona at 18% monthly growth).
3. No predicted negative cash-flow month within the next 6 months (derived from the Forecasting Engine — Layer 1).

**Official Enterprise Size Classification (from the official Kafalah Program — under the SME Bank):**

| Category | Employees | Annual Revenue |
|---|---|---|
| Micro | 1-5 | Up to SAR 3 million |
| Small | 6-49 | SAR 3-40 million |
| Medium | 50-249 | SAR 40-200 million |

> This classification is used only to accurately tag the "Nawah" demo persona, not to calculate an eligibility ratio.

---

## 8. Additional Data & Context Sources
- **Transaction patterns for training:** Kaggle (realistic personal/banking datasets)
- **Saudi economic context:** open.data.gov.sa
- **Regulatory rules:** rulebook.sama.gov.sa (primary source of this file)
- **Freelance documentation:** freelance.sa (Ministry of Human Resources)

---

## 9. Golden Rule for the Team
Any number or ratio used in the eligibility engine must come from this file only. No team member or AI is permitted to "invent" or "estimate" a ratio not listed here. If a needed number is missing, log it as an open question in a separate section and resolve it via the official source — never by guessing.


---

## 10. FINAL DATASET DECISIONS (Locked — Do Not Change Without Team Agreement)

### Dataset 1 — Eligibility Engine + DiCE (Layer 2)
**Source:** Kaggle — taweilo/loan-approval-classification-data
**Rows:** 45,000 | **Columns:** 14
**Selected columns (all 14 used):**
person_age, person_gender, person_education, person_income, person_emp_exp,
person_home_ownership, loan_amnt, loan_intent, loan_int_rate, loan_percent_income,
cb_person_cred_hist_length, credit_score, previous_loan_defaults_on_file, loan_status (target)

**Critical rule:** `loan_status` from the original dataset must be RE-LABELED using
SAMA's official DBR rules (Section 5 of this document), not used as-is, since the
original labeling does not follow Saudi regulations.

### Dataset 2 — Cash-Flow Forecasting Engine (Layer 1)
**Source:** Kaggle — tjverry/credit-card-transactions
**Selected columns (final, locked):**
accountNumber, creditLimit, availableMoney, transactionDateTime, transactionAmount,
merchantCategoryCode, transactionType, currentBalance

**Excluded columns (confirmed not needed):**
merchantName, acqCountry, merchantCountryCode, posEntryMode, posConditionCode,
currentExpDate, accountOpenDate, dateOfLastAddressChange, cardPresent,
expirationDateKeyInMatch, isFraud

**Column roles:**
- accountNumber → customer identifier (groupby key)
- transactionDateTime → maps to Prophet's `ds`
- transactionAmount + transactionType → maps to Prophet's `y` (signed monthly net flow)
- creditLimit + currentBalance → feed into monthly credit obligation calculation (Section 4)
- availableMoney → optional, used for liquidity display in simulation screen
- merchantCategoryCode → optional, used for expense category breakdown in dashboard

**Processing pipeline (must be followed in this exact order):**
1. Select only the 8 columns above, drop all others.
2. Sample ~300 unique accountNumber values (not the full dataset) for prototype scale.
3. Convert transactionType to signed amounts (purchases negative, credits/payments positive).
4. Group by accountNumber + month → produces `ds`, `y` columns per customer.
5. Use creditLimit/currentBalance separately to compute monthly obligations per SAMA rules.


---

## 11. FINAL LOAN DATASET COLUMN DECISION (Locked — Simplified)

**Rule applied: keep ONLY columns that directly feed a calculation in the eligibility engine.
Drop anything that is just "context" and does not change a number.**

| Column | Keep? | Exact Reason |
|---|---|---|
| person_age | YES | Used to derive employment_status (>=60 = retired) |
| person_gender | NO | No effect on any calculation |
| person_education | NO | Does not feed DBR, income, or obligation calculation — context only |
| person_income | YES | Core input to DBR |
| person_emp_exp | NO | Does not change DBR calculation; dropped for simplicity |
| person_home_ownership | YES | Rent = additional monthly obligation |
| loan_amnt | YES | Used to compute monthly obligation |
| loan_intent | NO | Context only, does not affect eligibility number |
| loan_int_rate | YES | Needed to compute monthly installment accurately |
| loan_percent_income | YES | Direct proxy for DBR |
| cb_person_cred_hist_length | NO | Not part of SAMA DBR formula |
| credit_score | NO | Not part of SAMA DBR formula (SAMA rule is income/obligation based only) |
| previous_loan_defaults_on_file | NO | Not part of SAMA DBR formula |
| loan_status | YES | Will be RE-CALCULATED using SAMA rules, original value discarded |

### FINAL COLUMN LIST TO USE (7 columns + 1 derived):
person_age, person_income, person_home_ownership, loan_amnt, loan_int_rate,
loan_percent_income, loan_status
+ derived: employment_status (from person_age: >=60 -> "retired", else -> "employee")

### Derivation logic for employment_status:
```python
df['employment_status'] = df['person_age'].apply(lambda age: 'retired' if age >= 60 else 'employee')
```
Note: "freelancer" status is NOT derived from this dataset. It is only manually assigned
to the Sarah demo persona, built separately per Section 7 (SME) methodology.
