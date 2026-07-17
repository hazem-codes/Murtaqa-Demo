"""Layer 2 (part 2): counterfactual explanations for ineligible applicants.

Wraps the trained Gradient Boosting classifier (output/best_model.pkl) with dice-ml to answer
"what would this customer need to change to become eligible?". The model is never retrained here.

Design note on derived features (rebuilt 2026-07-12 for the generated dataset): salary_dbr,
total_obligation_ratio, new_loan_installment_sar and loan_percent_income are exact mathematical
functions of the other columns (see scripts/sama_rules.py). DiCE is only allowed to vary the
ACTIONABLE levers -- the financing being requested (amount, rate) and the two obligations a
customer can actually pay down (other loans, credit-card minimum). After it proposes a
candidate, this module recomputes every derived field through sama_rules.evaluate() and
re-verifies eligibility by running the corrected, internally consistent profile back through
the trained model. Only re-verified paths are kept.

The mortgage installment, gross salary and age are deliberately NOT actionable: telling a
customer to "reduce your mortgage" or "be younger" is not advice.

Design note on the DiCE search timeout: dice_ml's "random" method has no wall-clock cutoff of
its own -- for edge-case profiles the search has been measured taking over two minutes. Since
Python threads cannot be forcibly killed and this project is Windows-only (no signal.alarm),
the search runs in a daemon thread bounded by DICE_TIMEOUT_SECONDS; on timeout the orphaned
thread is deliberately abandoned rather than routed through a subprocess, which would need to
pickle the model/data across a process boundary. An accepted trade-off for a short live demo,
not a general-purpose solution. A fresh dice_ml.Dice() explainer is built per call (the heavy
model/CSV load stays cached) so an abandoned search never shares mutable state with a later one.
"""

from __future__ import annotations

import json
import math
import sys
import threading
from functools import lru_cache
from itertools import combinations
from pathlib import Path
from typing import Any

import dice_ml
import joblib
import pandas as pd
from sklearn.base import ClassifierMixin

sys.path.insert(0, str(Path(__file__).resolve().parent))

import sama_rules  # noqa: E402

ROOT_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT_DIR / "output" / "best_model.pkl"
FEATURE_COLUMNS_PATH = ROOT_DIR / "output" / "feature_columns.json"
PROFILES_CSV = ROOT_DIR / "data" / "processed" / "individuals_profiles.csv"
OUTCOME_NAME = "eligible_sama"

CONTINUOUS_FEATURES = [
    "age",
    "gross_salary_sar",
    "mortgage_installment_sar",
    "other_loan_installments_sar",
    "credit_card_min_payment_sar",
    "requested_loan_amount_sar",
    "loan_int_rate",
    "new_loan_installment_sar",
    "salary_dbr",
    "total_obligation_ratio",
    "loan_percent_income",
]
CATEGORICAL_FEATURES = ["employment_type", "housing_status"]
RAW_FEATURE_COLUMNS = CONTINUOUS_FEATURES + CATEGORICAL_FEATURES

# The levers a customer can actually pull. Everything else is fixed or derived.
ACTIONABLE_FEATURES = [
    "requested_loan_amount_sar",
    "loan_int_rate",
    "other_loan_installments_sar",
    "credit_card_min_payment_sar",
]
# Recomputed from the actionable features after every DiCE proposal -- never trusted as given.
DERIVED_FEATURES = [
    "new_loan_installment_sar",
    "salary_dbr",
    "total_obligation_ratio",
    "loan_percent_income",
]

DICE_METHOD = "random"
# Kept at 3x/10 deliberately. Raising the pool to give the increase-filter (see
# generate_counterfactuals) more candidates to choose from was measured and made things WORSE:
# a bigger total_CFs makes DiCE's random search slower, so it hits DICE_TIMEOUT_SECONDS and
# returns nothing at all. Zero-path personas went from 2/40 to 11/40. The timeout is the binding
# constraint here, not the candidate count.
CANDIDATE_MULTIPLIER = 3
MIN_CANDIDATES = 10
DICE_RANDOM_SEED = 42  # unchanged: dice_ml's "random" method is otherwise non-deterministic
# across runs for the same customer, which would make the baked demo narration go stale.
DICE_TIMEOUT_SECONDS = 5  # unchanged: hard wall-clock cap on the search -- see module docstring.


def _load_model_and_encoded_columns() -> tuple[ClassifierMixin, list[str]]:
    """Loads the pretrained classifier and its locked encoded feature-column contract."""
    model = joblib.load(MODEL_PATH)
    with open(FEATURE_COLUMNS_PATH, encoding="utf-8") as f:
        contract = json.load(f)
    return model, contract["feature_columns"]


def _recompute_derived_features(profile: dict) -> dict:
    """Recomputes every derived field through the shared SAMA math (sama_rules.evaluate)."""
    derived = sama_rules.evaluate(profile)
    return {**profile, **{key: derived[key] for key in DERIVED_FEATURES}}


def _encode_profiles(df: pd.DataFrame, encoded_columns: list[str]) -> pd.DataFrame:
    """Reproduces the training-time one-hot encoding for one or more raw profiles.

    The derived features are always recomputed from the actionable ones rather than trusted
    from the input, so every prediction is self-consistent -- including the profiles DiCE
    invents mid-search.
    """
    consistent_df = pd.DataFrame(
        [_recompute_derived_features(row.to_dict()) for _, row in df.iterrows()]
    )
    encoded = pd.get_dummies(consistent_df, columns=CATEGORICAL_FEATURES, drop_first=False)
    return encoded.reindex(columns=encoded_columns, fill_value=0)


@lru_cache(maxsize=1)
def _load_engine() -> tuple[ClassifierMixin, list[str], dice_ml.Data, dice_ml.Model]:
    """Builds and caches the model and DiCE's data/model interfaces (the expensive parts)."""
    model, encoded_columns = _load_model_and_encoded_columns()

    def encode_for_dice(df: pd.DataFrame, data_interface=None) -> pd.DataFrame:
        return _encode_profiles(df, encoded_columns)

    # DiCE searches ONLY over the requester cohort (has_active_request == 1). The non-requester
    # personas have no financing application (requested amount 0, NaN rate) and are never subject
    # to a counterfactual "how do I become eligible for my request?" -- including them would both
    # feed NaN rates into DiCE's continuous-feature ranges and shift the search space. Filtering
    # here keeps the reference set exactly the original 1000 requesters, so DiCE behaviour (and the
    # demo persona's frozen paths) are unchanged by the non-requester addition.
    full_df = pd.read_csv(PROFILES_CSV)
    if "has_active_request" in full_df.columns:
        full_df = full_df[full_df["has_active_request"] == 1]
    raw_df = full_df[RAW_FEATURE_COLUMNS + [OUTCOME_NAME]].reset_index(drop=True)
    data_interface = dice_ml.Data(
        dataframe=raw_df,
        continuous_features=CONTINUOUS_FEATURES,
        outcome_name=OUTCOME_NAME,
    )
    model_interface = dice_ml.Model(model=model, backend="sklearn", func=encode_for_dice)

    return model, encoded_columns, data_interface, model_interface


def _build_explainer(data_interface: dice_ml.Data, model_interface: dice_ml.Model) -> dice_ml.Dice:
    """Constructs a fresh, cheap DiCE explainer wrapper -- see module docstring."""
    return dice_ml.Dice(data_interface, model_interface, method=DICE_METHOD)


def _predict_eligible(profile: dict, model: ClassifierMixin, encoded_columns: list[str]) -> bool:
    """Predicts eligible_sama for a single raw profile dict using the trained model.

    This is the model's OPINION. It drives DiCE's search (which needs a differentiable model to
    search against), but it is NOT what a path is verified against -- see _is_eligible_sama().
    """
    profile_df = pd.DataFrame([{column: profile[column] for column in RAW_FEATURE_COLUMNS}])
    encoded_df = _encode_profiles(profile_df, encoded_columns)
    return bool(model.predict(encoded_df)[0] == 1)


def _is_eligible_sama(profile: dict) -> bool:
    """Ground truth: does this profile ACTUALLY satisfy both SAMA caps?

    Paths are verified against this, not against the classifier. The classifier reproduces the
    SAMA label with ~99.5-100% accuracy, but it is still a proxy, and its errors cluster exactly
    where they do the most damage -- on the cap boundary. Trusting it was serving paths that left
    a retiree at a 0.2517 salary DBR against a 0.25 cap: the model called it eligible, the
    regulation does not. The regulation wins.
    """
    return bool(sama_rules.evaluate(profile)["eligible_sama"])


def _run_dice_with_timeout(
    explainer: dice_ml.Dice, query_df: pd.DataFrame, candidate_count: int, timeout_seconds: float
) -> tuple[Any | None, bool]:
    """Runs DiCE's search in a daemon thread, bounded by timeout_seconds.

    Returns (cf_result, timed_out). cf_result is None if DiCE raised or the search timed out.
    """
    result_container: dict[str, Any] = {}

    def _worker() -> None:
        try:
            result_container["cf_result"] = explainer.generate_counterfactuals(
                query_instances=query_df,
                total_CFs=candidate_count,
                desired_class="opposite",
                features_to_vary=ACTIONABLE_FEATURES,
                random_seed=DICE_RANDOM_SEED,
            )
        except Exception as error:  # noqa: BLE001 -- deliberately broad, see caller
            result_container["error"] = error

    worker_thread = threading.Thread(target=_worker, daemon=True)
    worker_thread.start()
    worker_thread.join(timeout=timeout_seconds)

    if worker_thread.is_alive():
        return None, True
    return result_container.get("cf_result"), False


# ── Closed-form SAMA fallback (DiCE-backfill support) ───────────────────────────────────
# DiCE's random search hits DICE_TIMEOUT_SECONDS for ~13% of ineligible customers. Measured over
# 150 of them, EVERY timeout was provably solvable -- simply asking for a smaller loan would have
# made them eligible -- yet each was told "no feasible path found within time limits". That is not
# honesty, it is a wrong answer.
#
# So on TIMEOUT ONLY, the path is SOLVED in closed form from scripts/sama_rules.py rather than
# searched. DiCE remains the primary generator and is completely untouched (same search, same
# DICE_RANDOM_SEED, same DICE_TIMEOUT_SECONDS); this replaces only the empty-handed degradation
# that used to follow a timeout. Every fallback path is still re-verified through the trained
# model before it is returned, exactly like a DiCE path, and every number comes straight from the
# SAMA formulas -- nothing is estimated.
#
# Levers are ranked by how realistic and minimally disruptive the ask is:
#   1. borrow less               -- the customer simply requests a smaller amount today
#   2. pay down the credit card  -- lowers the minimum payment due
#   3. settle/restructure a loan -- harder; touches an existing contract
#   4. negotiate a lower rate    -- offered only if the required rate stays realistic
# Every lever may only DECREASE (never advise taking on more obligation), and BOTH SAMA ratios
# must clear their own cap: the salary cap excluding the mortgage, the total cap including it.
_FALLBACK_LEVER_ORDER = [
    "requested_loan_amount_sar",
    "credit_card_min_payment_sar",
    "other_loan_installments_sar",
    "loan_int_rate",
]
# The lowest annual rate worth proposing -- the floor of the consumer-finance band the personas
# are drawn from (generate_individuals.py LOAN_INT_RATE_RANGE). Proposing a rate below the market
# floor would be advice the customer could never actually act on.
MIN_REALISTIC_RATE_PCT = 4.5
_RATE_SOLVE_ITERATIONS = 60


def _allowed_new_loan_installment(profile: dict, verdict: dict) -> float:
    """The largest new-loan installment that keeps BOTH SAMA ratios inside their caps."""
    gross = float(profile["gross_salary_sar"])
    fixed_salary_linked = float(profile["other_loan_installments_sar"]) + float(
        profile["credit_card_min_payment_sar"]
    )
    mortgage = float(profile["mortgage_installment_sar"])

    headroom_salary = verdict["salary_cap"] * gross - fixed_salary_linked
    headroom_total = verdict["total_cap"] * gross - fixed_salary_linked - mortgage
    return min(headroom_salary, headroom_total)


def _closed_form_candidates(profile: dict, verdict: dict) -> list[dict]:
    """Solves each lever for the value that just brings the customer inside BOTH caps."""
    gross = float(profile["gross_salary_sar"])
    term = int(profile.get("loan_term_months", sama_rules.MAX_FINANCE_TERM_MONTHS))
    rate = float(profile["loan_int_rate"])
    loan = float(profile["requested_loan_amount_sar"])
    other = float(profile["other_loan_installments_sar"])
    card = float(profile["credit_card_min_payment_sar"])
    mortgage = float(profile["mortgage_installment_sar"])
    installment = float(verdict["new_loan_installment_sar"])

    candidates: dict[str, float] = {}
    allowed_installment = _allowed_new_loan_installment(profile, verdict)

    # 1. Borrow less: the largest loan whose installment fits the headroom everything else leaves.
    if allowed_installment > 0:
        max_loan = sama_rules.principal_from_installment(allowed_installment, rate, term)
        max_loan = math.floor(max_loan * 100) / 100.0  # round DOWN, never back over the cap
        if 0 < max_loan < loan:
            candidates["requested_loan_amount_sar"] = max_loan

    # 2/3. Pay down the card / settle other loans: how far must that one obligation fall?
    for feature, current in (
        ("credit_card_min_payment_sar", card),
        ("other_loan_installments_sar", other),
    ):
        companion = other if feature == "credit_card_min_payment_sar" else card
        salary_room = verdict["salary_cap"] * gross - installment - companion
        total_room = verdict["total_cap"] * gross - installment - companion - mortgage
        target = math.floor(max(min(salary_room, total_room), 0.0) * 100) / 100.0
        if current > 0 and target < current:
            candidates[feature] = target

    # 4. Negotiate the rate: the installment rises monotonically with the rate, so bisect for the
    # HIGHEST rate that still fits the headroom (the smallest concession the customer must win).
    # The search is bounded BELOW by the realistic market floor -- both because a lower rate is
    # not advice anyone can act on, and because letting it approach zero divides by zero in the
    # annuity formula.
    if allowed_installment > 0 and installment > allowed_installment:
        floor_installment = sama_rules.monthly_installment(loan, MIN_REALISTIC_RATE_PCT, term)
        if floor_installment <= allowed_installment:
            low, high = MIN_REALISTIC_RATE_PCT, rate  # low fits, high does not
            for _ in range(_RATE_SOLVE_ITERATIONS):
                mid = (low + high) / 2.0
                if sama_rules.monthly_installment(loan, mid, term) > allowed_installment:
                    high = mid
                else:
                    low = mid
            solved_rate = math.floor(low * 100) / 100.0
            if MIN_REALISTIC_RATE_PCT <= solved_rate < rate:
                candidates["loan_int_rate"] = solved_rate

    return [{f: candidates[f]} for f in _FALLBACK_LEVER_ORDER if f in candidates]


def _closed_form_paths(
    customer_profile: dict, model: ClassifierMixin, encoded_columns: list[str], num_paths: int
) -> list[dict]:
    """Verified, decrease-only counterfactual paths solved rather than searched (timeout only)."""
    verdict = sama_rules.evaluate(customer_profile)

    paths = []
    for changed_features in _closed_form_candidates(customer_profile, verdict):
        # Never propose taking on MORE obligation -- the same rule the DiCE output filter applies.
        if any(
            value > float(customer_profile[feature]) + 1e-6
            for feature, value in changed_features.items()
        ):
            continue

        corrected = _recompute_derived_features({**customer_profile, **changed_features})
        # Re-verified against the SAMA rules, exactly like a DiCE path.
        if not _is_eligible_sama(corrected):
            continue

        paths.append(
            {
                "changed_features": {k: round(v, 2) for k, v in changed_features.items()},
                "new_dbr": round(corrected["salary_dbr"], 4),
                "new_total_ratio": round(corrected["total_obligation_ratio"], 4),
                "new_eligible": True,
            }
        )
        if len(paths) >= num_paths:
            break
    return paths


# ── Multi-lever path optimizer (PRIMARY generator, deterministic) ───────────────────────
# DiCE's random search kept returning near-duplicate SINGLE-lever paths -- for the demo anchor,
# all three just said "borrow less", each overshooting far BELOW the real financing ceiling
# (e.g. reduce a 265k request to 69k when 203k was already eligible). Its search is unconstrained
# by the SAMA structure, so it finds *a* feasible point, not the smartest or a varied one.
#
# This optimizer instead ENUMERATES the realistic combinations of the discrete actions a customer
# can take -- clear the credit-card minimum, settle the other loan, negotiate the rate -- and for
# each combination SOLVES the requested-loan amount to the MINIMAL reduction that clears BOTH caps.
# So a single path can pull several levers at once (e.g. "clear your card AND drop the rate to 4.5%,
# and you can still request 251k"). Every candidate is re-verified through sama_rules; the set is
# deduped; combinations whose extra actions buy no extra financing are pruned; and the best, most
# distinct paths are selected. It is fully deterministic (no random seed, no wall-clock timeout),
# so the displayed paths and the baked LLM narration can never drift apart.
_DISCRETE_ACTION_LEVERS = (
    "credit_card_min_payment_sar",
    "other_loan_installments_sar",
    "loan_int_rate",
)
# How disruptive / uncertain each discrete action is, and how heavily to penalise giving up
# requested financing. Used ONLY to rank/select candidates -- never to change the SAMA math.
_ACTION_COST = {
    "credit_card_min_payment_sar": 1.0,   # pay off a small revolving balance -- easiest
    "loan_int_rate": 1.2,                 # negotiate a lower rate -- uncertain outcome
    "other_loan_installments_sar": 1.5,   # settle / restructure another loan -- hardest
}
_FINANCING_SACRIFICE_WEIGHT = 3.0
# A realistic rate concession to model when the rate lever is pulled (percentage points), floored
# at the market floor. Mirrors Part C's projection drop so the two features tell the same story.
_RATE_NEGOTIATION_DROP_PCT = 2.0


def _change_signature(changed_features: dict) -> tuple:
    """A hashable identity for a set of lever changes, used to dedupe paths."""
    return tuple(sorted((key, round(float(value), 2)) for key, value in changed_features.items()))


def _path_dict(profile: dict, changed_features: dict) -> dict:
    """Shapes one verified lever change into the locked path output contract."""
    corrected = _recompute_derived_features({**profile, **changed_features})
    return {
        "changed_features": {key: round(float(value), 2) for key, value in changed_features.items()},
        "new_dbr": round(corrected["salary_dbr"], 4),
        "new_total_ratio": round(corrected["total_obligation_ratio"], 4),
        "new_eligible": True,
    }


def _rate_after_negotiation(profile: dict, use_rate: bool) -> tuple[float, bool]:
    """The rate a realistic negotiation would reach, and whether it actually moves the rate."""
    rate = float(profile["loan_int_rate"])
    if not use_rate:
        return rate, False
    target = max(MIN_REALISTIC_RATE_PCT, round(rate - _RATE_NEGOTIATION_DROP_PCT, 2))
    return (target, True) if target < rate - 1e-9 else (rate, False)


def _optimizer_candidate(profile: dict, action_subset: frozenset) -> dict | None:
    """One lever combination: apply the discrete actions, then solve the loan MINIMALLY.

    Returns a decrease-only, sama_rules-verified changed_features dict, or None if this combination
    cannot make the customer eligible (or requires no change at all).
    """
    changed: dict = {}
    if "credit_card_min_payment_sar" in action_subset and float(profile["credit_card_min_payment_sar"]) > 0:
        changed["credit_card_min_payment_sar"] = 0.0
    if "other_loan_installments_sar" in action_subset and float(profile["other_loan_installments_sar"]) > 0:
        changed["other_loan_installments_sar"] = 0.0
    effective_rate, rate_used = _rate_after_negotiation(profile, "loan_int_rate" in action_subset)
    if rate_used:
        changed["loan_int_rate"] = effective_rate

    partial = {**profile, **changed}
    allowed_installment = _allowed_new_loan_installment(partial, sama_rules.evaluate(partial))
    if allowed_installment <= 0:
        return None  # no room for ANY new loan even after these actions -- useless to a requester

    term = int(profile.get("loan_term_months", sama_rules.MAX_FINANCE_TERM_MONTHS))
    requested = float(profile["requested_loan_amount_sar"])
    true_max_loan = sama_rules.principal_from_installment(allowed_installment, effective_rate, term)
    # Only trim the request if it does not already fit under this combination's headroom. Floor the
    # target to a clean 1,000 -- this reads better as advice AND keeps it at or below the financing
    # ceiling the UI shows (which rounds to the nearest 1,000), so the two can never contradict.
    if requested > true_max_loan + 1e-6:
        target_loan = math.floor(true_max_loan / 1000.0) * 1000.0
        if target_loan <= 0:
            return None  # no room for a meaningful new loan even after these actions
        changed["requested_loan_amount_sar"] = target_loan

    if not changed:
        return None

    # Decrease-only (never advise taking on MORE) and re-verified against the regulation itself.
    if any(value > float(profile[feature]) + 1e-6 for feature, value in changed.items()):
        return None
    if not _is_eligible_sama(_recompute_derived_features({**profile, **changed})):
        return None
    return changed


def _select_optimizer_paths(profile: dict, candidates: list[dict], num_paths: int) -> list[dict]:
    """Prunes dominated combinations and picks the best, most distinct paths for display.

    Ranked by how much of the requested financing the customer keeps (their actual goal), while
    always also offering the universally-available "just borrow less" option so the easiest route
    is never hidden behind a multi-action one.
    """
    requested = float(profile["requested_loan_amount_sar"])
    for candidate in candidates:
        target_loan = float(candidate["changed"].get("requested_loan_amount_sar", requested))
        candidate["target_loan"] = target_loan
        candidate["cost"] = sum(_ACTION_COST[a] for a in candidate["actions"]) + (
            _FINANCING_SACRIFICE_WEIGHT * (requested - target_loan) / requested
        )

    # Prune a combination whose extra actions buy no extra financing: a strict subset of its actions
    # already reaches the same loan, so the extra effort is pointless (e.g. adding a rate cut on top
    # of clearing both obligations when the full request already fits).
    survivors = [
        candidate
        for candidate in candidates
        if not any(
            other is not candidate
            and other["actions"] < candidate["actions"]
            and other["target_loan"] >= candidate["target_loan"] - 1e-6
            for other in candidates
        )
    ]

    survivors.sort(key=lambda c: (-c["target_loan"], c["cost"]))
    selected = survivors[:num_paths]
    borrow_less = next((c for c in survivors if not c["actions"]), None)
    if borrow_less is not None and borrow_less not in selected:
        if len(selected) < num_paths:
            selected.append(borrow_less)
        else:
            selected[-1] = borrow_less  # trade the weakest multi-action path for the simple one
    selected.sort(key=lambda c: -c["target_loan"])
    return [_path_dict(profile, c["changed"]) for c in selected]


def _optimizer_paths(profile: dict, num_paths: int) -> list[dict]:
    """The deterministic multi-lever paths for one ineligible requester (may be fewer than asked)."""
    movable = [
        lever
        for lever in _DISCRETE_ACTION_LEVERS
        if (lever == "loan_int_rate" and _rate_after_negotiation(profile, True)[1])
        or (lever != "loan_int_rate" and float(profile[lever]) > 0)
    ]

    candidates: list[dict] = []
    seen: set[tuple] = set()
    for size in range(len(movable) + 1):
        for subset in combinations(movable, size):
            changed = _optimizer_candidate(profile, frozenset(subset))
            if changed is None:
                continue
            signature = _change_signature(changed)
            if signature in seen:
                continue
            seen.add(signature)
            candidates.append({"actions": frozenset(subset), "changed": changed})

    return _select_optimizer_paths(profile, candidates, num_paths)


def _dice_backfill_paths(
    customer_profile: dict,
    needed: int,
    seen_lever_sets: set,
    model: ClassifierMixin,
    encoded_columns: list[str],
    data_interface: dice_ml.Data,
    model_interface: dice_ml.Model,
) -> tuple[list[dict], str]:
    """DiCE (or, on timeout, the closed-form solver) as an ML backfill for the rare persona the
    optimizer cannot fill to num_paths. It may only add a path that pulls a lever COMBINATION not
    already shown -- so it can never re-introduce a near-duplicate single-lever overshoot (the very
    junk the optimizer replaced), and it never displaces an optimizer path (result stays stable).
    """
    query_df = pd.DataFrame([{column: customer_profile[column] for column in RAW_FEATURE_COLUMNS}])
    candidate_count = max(needed * CANDIDATE_MULTIPLIER, MIN_CANDIDATES)
    explainer = _build_explainer(data_interface, model_interface)
    cf_result, timed_out = _run_dice_with_timeout(
        explainer, query_df, candidate_count, DICE_TIMEOUT_SECONDS
    )

    def _collect(change_dicts: list[dict], source_label: str) -> tuple[list[dict], str]:
        collected: list[dict] = []
        for changed in change_dicts:
            lever_set = frozenset(changed.keys())
            if lever_set in seen_lever_sets:  # a path with this exact lever combination already shown
                continue
            if any(value > float(customer_profile[feature]) + 1e-6 for feature, value in changed.items()):
                continue
            if not _is_eligible_sama(_recompute_derived_features({**customer_profile, **changed})):
                continue
            seen_lever_sets.add(lever_set)
            collected.append(_path_dict(customer_profile, changed))
            if len(collected) >= needed:
                break
        return collected, source_label

    if timed_out or cf_result is None:
        closed = _closed_form_paths(customer_profile, model, encoded_columns, needed + len(seen_lever_sets))
        return _collect([p["changed_features"] for p in closed], "closed_form")

    candidates_df = cf_result.cf_examples_list[0].final_cfs_df
    if candidates_df is None or len(candidates_df) == 0:
        return [], "dice"
    change_dicts = []
    for _, row in candidates_df.iterrows():
        changed = {
            feature: float(row[feature])
            for feature in ACTIONABLE_FEATURES
            if abs(float(row[feature]) - float(customer_profile[feature])) > 1e-6
        }
        if changed:
            change_dicts.append(changed)
    return _collect(change_dicts, "dice")


def generate_counterfactuals(customer_profile: dict, num_paths: int = 3) -> dict:
    """Generates realistic, distinct, multi-lever counterfactual paths to eligibility.

    A deterministic SAMA-aware optimizer (see _optimizer_paths) is the primary generator: it
    enumerates combinations of the actionable levers, solves each to the minimal change, verifies
    every candidate against sama_rules, and selects the best distinct paths. DiCE (the ML search)
    is retained only as a backfill when the optimizer produces fewer than num_paths -- it can add
    distinct paths but never displace an optimizer one, so the result is reproducible.

    Args:
        customer_profile: Raw feature dict with keys matching RAW_FEATURE_COLUMNS.
        num_paths: Maximum number of counterfactual paths to return.

    Returns:
        {"already_eligible": True} if the customer is already eligible. Otherwise:
        {
            "current_eligible": False,
            "current_dbr": float,               # the salary-linked DBR (SAMA's 33.33%/25% cap)
            "current_total_ratio": float,       # the total-obligations ratio (45%/55%/65% cap)
            "paths": [{"changed_features": {...}, "new_dbr": float,
                       "new_total_ratio": float, "new_eligible": True}, ...],
            "path_source": "optimizer" | "optimizer+dice" | "optimizer+closed_form" | "none",
            "note": "..."  # only present when paths is empty
        }
    """
    model, encoded_columns, data_interface, model_interface = _load_engine()

    # Ground truth, not the classifier: a customer the model happens to misread on the boundary
    # must not be told the opposite of what the regulation says.
    if _is_eligible_sama(customer_profile):
        return {"already_eligible": True}

    baseline = sama_rules.evaluate(customer_profile)
    current_dbr = float(baseline["salary_dbr"])
    current_total_ratio = float(baseline["total_obligation_ratio"])

    paths = _optimizer_paths(customer_profile, num_paths)
    path_source = "optimizer"

    # Rare backfill: a persona with very few movable levers may yield fewer than num_paths. DiCE may
    # only contribute a NEW lever combination (deduped by lever-set), so it can never re-add a
    # near-duplicate single-lever overshoot.
    if len(paths) < num_paths:
        seen_lever_sets = {frozenset(path["changed_features"].keys()) for path in paths}
        extra, source = _dice_backfill_paths(
            customer_profile, num_paths - len(paths), seen_lever_sets,
            model, encoded_columns, data_interface, model_interface,
        )
        if extra:
            paths = paths + extra
            path_source = f"optimizer+{source}"

    if not paths:
        return {
            "current_eligible": False,
            "current_dbr": current_dbr,
            "current_total_ratio": current_total_ratio,
            "paths": [],
            "note": "No feasible path found.",
            "path_source": "none",
        }

    return {
        "current_eligible": False,
        "current_dbr": current_dbr,
        "current_total_ratio": current_total_ratio,
        "paths": paths[:num_paths],
        "path_source": path_source,
    }


def _assert_valid_output(result: dict) -> None:
    """Validates that generate_counterfactuals() output matches the locked JSON contract."""
    if result.get("already_eligible") is True:
        return

    for key in ("current_eligible", "current_dbr", "paths"):
        assert key in result, f"missing key: {key}"

    assert result["current_eligible"] is False, "current_eligible must be False when paths are reported"
    assert isinstance(result["current_dbr"], float), "current_dbr must be a float"
    assert isinstance(result["paths"], list), "paths must be a list"

    if not result["paths"]:
        assert result.get("note") in ("no feasible path found", "No feasible path found."), (
            "empty paths must carry a no-feasible-path note"
        )

    for path in result["paths"]:
        assert isinstance(path["changed_features"], dict) and path["changed_features"], (
            "changed_features must be a non-empty dict"
        )
        assert isinstance(path["new_dbr"], float), "new_dbr must be a float"
        assert path["new_eligible"] is True, "returned paths must all be re-verified eligible"


def run_output_contract_tests(customer_profiles: list[dict]) -> None:
    """Runs generate_counterfactuals() on each profile and validates the output contract."""
    for profile in customer_profiles:
        _assert_valid_output(generate_counterfactuals(profile))
    print(f"All {len(customer_profiles)} output contract tests passed.")


def load_profile(account_number: str) -> dict:
    """Loads one persona from individuals_profiles.csv as a raw feature dict.

    Values are cast to native Python types: pandas hands back numpy scalars (int64/float64),
    which are not JSON-serializable, and this dict is both serialized into the API response and
    baked into demo_backup_narrations.json.
    """
    df = pd.read_csv(PROFILES_CSV, dtype={"accountNumber": str})
    row = df[df["accountNumber"] == str(account_number)].iloc[0]

    profile: dict = {}
    for column in RAW_FEATURE_COLUMNS:
        value = row[column]
        profile[column] = value if isinstance(value, str) else float(value)

    profile["loan_term_months"] = int(row["loan_term_months"])
    profile["accountNumber"] = str(account_number)
    # Cohort flag (2026-07-15): 1 = has an active financing request, 0 = non-requester (no
    # application; requested amount 0, NaN rate). Defaults to 1 for a legacy CSV without the column.
    profile["has_active_request"] = int(row["has_active_request"]) if "has_active_request" in row.index else 1
    return profile


if __name__ == "__main__":
    profiles_df = pd.read_csv(PROFILES_CSV, dtype={"accountNumber": str})
    ineligible_rows = profiles_df[profiles_df[OUTCOME_NAME] == 0].head(2)
    sample_profiles = [
        {column: row[column] for column in RAW_FEATURE_COLUMNS}
        for _, row in ineligible_rows.iterrows()
    ]

    for sample_profile in sample_profiles:
        print(json.dumps(generate_counterfactuals(sample_profile), indent=2))

    run_output_contract_tests(sample_profiles)
