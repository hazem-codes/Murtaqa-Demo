# Data Methodology Statement — "Murtaqa" Project (Amad Hackathon 2026)
> Transparency document: exact breakdown of what is real data vs. engineered/synthetic data,
> and why.

---

## Why This Document Exists

Real customer banking data cannot be used in this hackathon due to privacy and regulatory
constraints — this was confirmed directly by the hackathon organizers, who stated no real
customer data would be provided. Instead of treating this as a limitation to hide, this
project treats it as an engineering constraint to be solved transparently, the same way a
real production fintech team would when building and testing a system before securing live
Open Banking access.

---

## Dataset 1: Individual Loan Eligibility Data

**Real component:** Kaggle public dataset (taweilo/loan-approval-classification-data),
45,000 real anonymized loan applicant records (age, income, home ownership, loan terms, etc).

**Engineered component:**
- Currency converted from USD to SAR (fixed rate).
- Reduced from 14 to 7 relevant columns (removed non-financial fields like education,
  gender, credit history length — none of which are part of the official SAMA formula).
- `eligible_sama` label was NOT taken from the original dataset's own approval label.
  It was RE-COMPUTED from scratch using the official SAMA Responsible Lending Principles
  (33.33% salary-linked cap for employees, 25% for retirees, 45% total obligation cap).
- Retiree class was under-represented in the original data (0.04%). 1,200 synthetic
  retiree records were added, using realistic income/age adjustments, to balance the
  dataset for fair model training (final: ~11% retiree, ~89% employee).

**Why this is defensible:** The real financial behavior data (income, loan terms, spending
patterns) is authentic. Only the regulatory labeling was corrected to match Saudi law
instead of the original (foreign, non-SAMA-compliant) approval logic.

---

## Dataset 2: Cash-Flow / Transaction Data

**Real component:** Kaggle public dataset (tjverry/credit-card-transactions), real
anonymized credit card transaction records (500 sampled accounts, monthly aggregated).
Raw source lives at `data/raw/transactions.csv` (5,000 accounts); the 500-account sample
was built with `scripts/build_transaction_sample.py`. Both are checked into the project
so the pipeline is fully reproducible without any external file dependency.

**Engineered component:**
- The original dataset only records credit card SPENDING — it contains no salary or income
  deposits (a structural limitation of any public transaction dataset, since real salary
  deposit data is private and was never going to be available).
- A `simulated_monthly_salary` was injected per account using a right-skewed lognormal
  distribution matching real Saudi private-sector salary patterns (median ~SAR 9,000-11,000,
  no artificial ceiling, natural rare tail up to ~SAR 100,000), loosely correlated with each
  account's real historical spending level.
- `realistic_net_flow = simulated_monthly_salary + real_spending` is what feeds the
  Prophet forecasting model — this produces a believable full financial picture (income
  minus expenses) instead of an always-negative, spending-only signal.

**Why this is defensible:** The spending side of the data is 100% real transaction behavior.
Only the income side (which no public dataset would ever legally include) was modeled using
a statistically realistic distribution grounded in actual Saudi salary market research.

---

## Dataset 3: SME (Small/Medium Enterprise) Data

**Real component:** None.

**Engineered component:** Fully synthetic. Generated directly in code (not from any Kaggle
source) because:
1. No official fixed DBR ratio exists for SMEs under SAMA rules — eligibility is
   cash-flow based, not ratio-based, so no ready-made labeled dataset would even apply.
2. No suitable real/public Saudi SME transaction dataset exists.

Synthetic SMEs are built with realistic monthly revenue/expense cycles (seasonality, growth
trends) to demonstrate the cash-flow eligibility logic for the business-facing persona
("Nawa") in the demo.

---

## One-Line Summary for the Pitch

"We used real, publicly available financial datasets for both spending behavior and loan
characteristics, and applied transparent, documented engineering — currency conversion,
SAMA-compliant relabeling, class balancing, and realistic income simulation — to adapt them
to the Saudi regulatory context. Where no real data could exist (SME cash flow), we built
synthetic data grounded in the same regulatory logic, exactly as a production team would
during pre-launch testing before Open Banking integration."
