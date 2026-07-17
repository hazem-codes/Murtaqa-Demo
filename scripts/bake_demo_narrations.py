"""Regenerates data/processed/demo_backup_narrations.json from the current datasets.

Every entry is produced by a REAL call through advisor_engine (so it passes the numeric-fidelity
and direction-inversion guards) and is stored next to the exact engine output it was verified
against. Nothing here is hand-written: if a call fails the guard, this script fails loudly rather
than baking unverified text.

What the file is for:
  - the individuals eligibility screen serves the pre-baked counterfactual narration instantly
    (a live ALLaM call on that hot path costs ~65s under the shared lock),
  - the business readiness screen serves the pre-baked action plans instantly,
  - ollama_healthcheck.py and the live demo fall back to these if a live call fails.

Usage: python scripts/bake_demo_narrations.py   (needs `ollama serve` + iKhalid/ALLaM:7b)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(ROOT_DIR))  # so the savings facts can be built from server's helpers

import advisor_engine as ae  # noqa: E402
import counterfactual_engine as ce  # noqa: E402
import forecast_engine as fe  # noqa: E402
import server  # noqa: E402  -- import is side-effect-free (no uvicorn until __main__)
import sme_engine as se  # noqa: E402

OUTPUT_PATH = ROOT_DIR / "data" / "processed" / "demo_backup_narrations.json"

DEMO_ACCOUNT = "100000009"      # the individuals demo persona (one account, every screen).
DEMO_SME_ACCOUNT = se.SME_ACCOUNT  # 300000001 — the liquidity-gap story.

# advisor_engine already retries MAX_GENERATION_ATTEMPTS times inside each narrate_*() call.
# ALLaM still occasionally slips a Latin-script token in, which the guard (correctly) rejects
# outright, so a whole narrate call can come back empty. Baking is offline and only ever accepts
# guard-validated text, so it is safe -- and much less annoying -- to simply call again.
# This retries the GENERATION; it does not retry, relax, or bypass the guard.
BAKE_RETRIES = 5


def _require(call, label: str) -> tuple[str, dict]:
    """Calls `call` until the guard validates its output. Aborts rather than bake unverified text."""
    last_error = None
    for attempt in range(1, BAKE_RETRIES + 1):
        result = call()
        narration = result.get("narration")
        if narration:
            print(f"  [OK] {label} (call {attempt}, inner attempts={result.get('attempts')})")
            return narration, result
        last_error = result.get("error")
        print(f"  ..   {label}: call {attempt} rejected by the guard ({last_error})")

    raise RuntimeError(
        f"{label}: the guard rejected all {BAKE_RETRIES} calls ({last_error}). "
        "Refusing to bake unverified text."
    )


def bake() -> dict:
    profile = ce.load_profile(DEMO_ACCOUNT)

    print("Baking individual narrations...")
    forecast_data = fe.forecast_account(DEMO_ACCOUNT, months_ahead=6)
    forecast_narration, _ = _require(lambda: ae.narrate_forecast(DEMO_ACCOUNT), "forecast")

    top_categories = ae._top_categories_for_account(DEMO_ACCOUNT, top_n=3)
    top_categories_narration, _ = _require(
        lambda: ae.narrate_top_categories(DEMO_ACCOUNT), "top_categories"
    )

    counterfactual_data = ce.generate_counterfactuals(profile, num_paths=3)
    counterfactual_narration, _ = _require(
        lambda: ae.narrate_counterfactual(profile), "counterfactual"
    )

    # Savings advisor: bake the demo persona for each predefined goal. Best-effort -- a goal whose
    # narration can't pass the guard within the retries is skipped (served live/fallback at runtime),
    # so a single stubborn goal never fails the whole bake.
    print("Baking savings advisor (per goal)...")
    savings_base = server._savings_base(DEMO_ACCOUNT)
    savings_by_goal: dict = {}
    for goal in server.SAVINGS_GOALS:
        rec = None
        for attempt in range(1, BAKE_RETRIES + 1):
            rec = ae.recommend_savings_strategy(
                goal["label"],
                server._financial_snapshot_text(savings_base),
                server._strategy_menu(),
                server._strategies_full(savings_base["income"]),
                server._savings_base_facts(savings_base),
                server._deterministic_strategy_for_goal(goal["key"]),
            )
            if rec.get("advice"):
                print(f"  [OK] savings/{goal['key']} -> {rec['strategy_key']} (call {attempt})")
                break
            print(f"  ..   savings/{goal['key']}: call {attempt} rejected by the guard")
        if rec and rec.get("advice"):
            savings_by_goal[goal["key"]] = {
                "strategy_key": rec["strategy_key"],
                "narration": rec["advice"],
            }
        else:
            print(f"  [SKIP] savings/{goal['key']}: no valid narration after {BAKE_RETRIES} calls")

    print("Baking SME action plans (this is the slow one)...")
    readiness = se.assess_readiness(DEMO_SME_ACCOUNT)
    gap_note = (
        "وتتوقع فجوة سيولة صيفية بسبب تسوية مورد كبيرة"
        if readiness.get("gap_months")
        else "ولا تتوقع فجوة سيولة قريبة"
    )
    context = (
        f"منشأة تجزئة، جاهزيتها التمويلية «{readiness['status_word']}». تدفقها النقدي موجب "
        f"ومستقر، لكن أشهر الأمان النقدي لديها منخفضة، {gap_note}."
    )
    plans = ae.generate_action_plans(context, num_plans=3)
    if not plans or len(plans) < 3:
        raise RuntimeError("action-plan generation failed validation; refusing to bake.")
    print(f"  [OK] business_plans ({len(plans)} plans, all digit-free)")

    sme_readiness_narration, _ = _require(
        lambda: ae.narrate_sme_readiness(DEMO_SME_ACCOUNT), "sme_readiness"
    )

    return {
        "purpose": (
            "Known-good Arabic narration captured from real advisor_engine calls (guard-validated), "
            "served as the instant path for the eligibility/plans screens and as the last-resort "
            "fallback if a live Ollama call fails during a demo."
        ),
        "model": ae.MODEL_NAME,
        "generated_by": "scripts/bake_demo_narrations.py",
        "dataset": "generated 2026-07-12 (1000 individuals / 500 SMEs, archetype-driven)",
        "note_on_personas": (
            f"Individuals demo persona is account {DEMO_ACCOUNT}: one coherent persona now drives "
            "every individual screen (forecast, categories, eligibility, chat), because the "
            "generated dataset joins transactions and eligibility on the same account. He is an "
            "employee whose salary-linked DBR breaches SAMA's 33.33% cap while his total-obligations "
            f"ratio stays under his 65% mortgage-holder cap. SME demo persona is {DEMO_SME_ACCOUNT}."
        ),
        "narrations": {
            "forecast": {
                "account_number": DEMO_ACCOUNT,
                "narration": forecast_narration,
                "verified_against": {
                    "avg_monthly_flow_forecast": forecast_data["avg_monthly_flow_forecast"],
                    "first_forecast_month": forecast_data["forecast"][0]["month"],
                    "first_forecast_predicted_flow": forecast_data["forecast"][0]["predicted_flow"],
                    "negative_months_ahead": forecast_data["negative_months_ahead"],
                    "monthly_income_sar": forecast_data["monthly_income_sar"],
                },
            },
            "top_categories": {
                "account_number": DEMO_ACCOUNT,
                "narration": top_categories_narration,
                "verified_against": {"top_categories": top_categories},
            },
            "counterfactual": {
                "customer_profile": profile,
                "narration": counterfactual_narration,
                "verified_against": counterfactual_data,
                "reproducibility_note": (
                    "Paths come from counterfactual_engine's deterministic multi-lever optimizer "
                    "(no random search, no timeout), so these exact numbers reproduce on every run "
                    "for this customer_profile. DiCE remains only as a rare backfill and does not "
                    "generate the demo persona's paths."
                ),
            },
            "sme_readiness": {
                "account_number": DEMO_SME_ACCOUNT,
                "narration": sme_readiness_narration,
                "verified_against": {
                    "score": readiness["score"],
                    "runway_months": readiness["runway_months"],
                    "revenue_growth_pct": readiness["revenue_growth_pct"],
                    "positive_streak_months": readiness["positive_streak_months"],
                    "gap_months": readiness["gap_months"],
                },
            },
            "savings_by_goal": savings_by_goal,
        },
        "business_plans": {
            "account_number": DEMO_SME_ACCOUNT,
            "generated_by": (
                "advisor_engine.generate_action_plans (ALLaM, format=json + temperature 0, "
                "detailed few-shot), validated digit-free"
            ),
            "note": (
                "Pre-baked AI action plans for the demo SME persona; served instantly. The real "
                "numbers are injected into `effect` at serve time -- the model's own text is "
                "required to contain no digits at all, so it cannot fabricate a financial figure."
            ),
            "plans": plans,
        },
    }


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")

    baked = bake()
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(baked, f, ensure_ascii=False, indent=2)

    print(f"\nWrote {OUTPUT_PATH.relative_to(ROOT_DIR)}")
    for name, entry in baked["narrations"].items():
        # `savings_by_goal` is a dict of {goal: {strategy_key, narration}}, not a single entry.
        if name == "savings_by_goal":
            for goal_key, goal_entry in entry.items():
                print(f"\n--- savings/{goal_key} ({goal_entry['strategy_key']}) ---\n{goal_entry['narration']}")
        else:
            print(f"\n--- {name} ---\n{entry['narration']}")
