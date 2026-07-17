# Murtaqa (مُرتقى)

**Murtaqa** is a financial eligibility guide for Saudi individuals and small/medium businesses,
built around the Saudi Central Bank's (SAMA) Responsible Lending Principles. It reads a
customer's existing accounts (Open Banking-style, read-only), forecasts their cash flow,
explains — in plain Arabic — exactly why they are or aren't eligible for financing, and, if
they're not, computes real, personalized paths to get there instead of generic advice.

Built for the Amad Hackathon 2026.

## The problem

Loan and financing rejections in Saudi Arabia (and most markets) are usually delivered as a
single word — "rejected" — with no explanation of *why*, and no guidance on what to actually do
next. Applicants are left guessing whether it's their income, their existing debt, their
requested amount, or something else entirely. Murtaqa replaces that black box with a transparent,
numbers-first breakdown grounded in the exact regulatory formula the bank itself is required to
use, plus a set of concrete, achievable next steps.

## How it works — three layers

1. **Cash-flow forecasting** — a time-series model (Facebook Prophet) trained on each
   customer's own transaction history projects their income and spending forward, so the system
   understands their trajectory, not just a single snapshot.
2. **SAMA eligibility engine** — a rules engine that implements SAMA's official Debt Burden
   Ratio (DBR) formulas exactly (33.33%/25% salary caps, 45–65% total obligation caps depending
   on mortgage and income bracket), so the eligibility verdict is never a guess — it's the same
   math a bank is required to apply.
3. **Counterfactual / strategy optimizer** — for a customer who doesn't currently qualify, a
   deterministic optimizer (backed by a machine-learning counterfactual search, DiCE) enumerates
   realistic combinations of actions — pay down a card, partially settle a loan, request a
   smaller amount — and returns the smallest, most realistic changes that would make them
   eligible, each one re-verified against the real SAMA formulas.
4. **Generative Arabic advisor** — a local, open-source LLM (ALLaM, via Ollama) turns the
   computed numbers into clear, natural Arabic explanations. The LLM never calculates anything
   itself; every number it mentions is checked against the real computed data before being shown,
   so it can explain but never invent.

A parallel track applies the same idea to small businesses, using cash-flow-based readiness
criteria (since SAMA has no fixed DBR ratio for SMEs) instead of the individual DBR formula.

## Tech stack

- **Backend:** Python, FastAPI, Prophet (forecasting), scikit-learn + DiCE-ML (counterfactuals),
  Ollama running a local Arabic LLM (`ALLaM-7B`) — no paid APIs, no cloud LLM calls.
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS (RTL, Arabic-first).
- **Data:** a fully synthetic, internally-consistent dataset of 1,180 individual personas and
  500 SME businesses, generated from a single dependency chain per persona (age → employment →
  income → obligations → eligibility → 24 months of transactions), so every number a persona
  produces is traceable and self-consistent — not stitched together from unrelated sources.

## Running it locally

Two processes, in two terminals:

```bash
# Terminal 1 — backend (needs Ollama running locally with the ALLaM model pulled)
python server.py
# -> serves the API on http://localhost:8000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
# -> opens on http://localhost:5173
```

Full environment setup (Python dependencies, Prophet/CmdStan, Ollama installation and model pull,
common setup issues) is in **[SETUP.md](SETUP.md)**.

Before a live demo, it's worth running the local health check to confirm the LLM is responding
correctly:

```bash
python scripts/ollama_healthcheck.py
```

It should print `ALL CHECKS PASSED`.

## Project layout

```
server.py           FastAPI bridge — the only boundary between the frontend and the engines
scripts/             All Python engines: forecasting, SAMA rules, counterfactual optimizer,
                      LLM advisor, SME readiness scoring, and the data generators
frontend/             React + TypeScript + Tailwind app (RTL, Arabic)
data/raw/             Source transaction ledgers
data/processed/       Cleaned, model-ready datasets
output/               Trained models, evaluation charts, metrics
docs/                 Methodology notes and the official SAMA rules reference
```

## The SAMA compliance angle

Every eligibility decision Murtaqa shows is computed from the exact SAMA formula — the salary
DBR cap (excluding mortgage) and the total obligation cap (including mortgage, tiered by income
bracket) — implemented once, in a single source-of-truth module
(`scripts/sama_rules.py`), and reused everywhere: the data generation, the machine-learning
model's ground truth, and the live API. That means the numbers a customer sees on screen are
never an approximation or a UI-only estimate — they're the same regulatory math a real bank
would apply, which is what makes the "why was I rejected, and what do I do about it" experience
trustworthy rather than just a nice-looking demo.

> This is a hackathon prototype built on synthetic data for demonstration purposes. It is not a
> licensed financial product and does not connect to real bank accounts.
