"""Layer 3: LLM Advisor (Ollama).

Narrates Layer 1/2's already-computed numbers into Arabic. The LLM never
calculates anything -- every response is checked by _validate_narration()
before reaching a caller, and every model is treated as untrusted until it
passes that guard, no exceptions.
"""

from __future__ import annotations

import json
import re
import sys
import threading
import urllib.request
from pathlib import Path

import pandas as pd

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

import category_engine as cat  # noqa: E402
import counterfactual_engine as ce  # noqa: E402
import forecast_engine as fe  # noqa: E402
import sme_engine as se  # noqa: E402

OLLAMA_HOST = "http://localhost:11434"
MODEL_NAME = "iKhalid/ALLaM:7b"  # swappable
MAX_GENERATION_ATTEMPTS = 3
CATEGORIZED_TRANSACTIONS_CSV = ROOT_DIR / "data" / "processed" / "individuals_monthly_categorized.csv"

SYSTEM_PROMPT = (
    "أنت «مُرتقى»، مستشار مالي سعودي ذكي وودود يتحدث العربية فقط بأسلوب دافئ ومتعاطف وواضح، "
    "كأنك رفيق مالي يفهم وضع العميل ويطمئنه بثقة.\n"
    "قواعد صارمة لا تُكسر أبداً:\n"
    "- استخدم فقط الأرقام الموجودة في البيانات المُعطاة، بلا أي حساب أو تقريب أو تعديل أو اختراع.\n"
    "- إن لم تجد رقماً في البيانات فلا تخترعه.\n"
    "- مهم: نسبة عبء الدين (DBR) تُحتسب من القسط الشهري للتمويل المطلوب (الناتج من المبلغ والمدة "
    "ومعدل الفائدة معاً)، وليس من مبلغ التمويل الإجمالي نفسه. عند شرح أثر التمويل على نسبة العميل، "
    "اذكر رقم القسط الشهري كما هو في بياناتك حرفياً (لا مبلغ التمويل الكامل)، ولا تحسب القسط بنفسك أبداً.\n"
    "- كن مختصراً وإنسانياً ومشجّعاً، لا آلة تقرأ أرقاماً."
)

# A warmer, more conversational persona for open-ended chat. Same hard number rule,
# but explicitly teaches the model to handle hypotheticals gracefully -- acknowledge the
# question, then pivot to the client's real figures -- instead of echoing an unknown number
# (which the guard would reject, dropping the reply to a stiff canned line).
CHAT_SYSTEM_PROMPT = (
    "أنت «مُرتقى»، رفيق مالي ذكي ودود يتحدث العربية فقط. تحاور العميل بدفء وتعاطف وثقة، "
    "وتجيب على سؤاله تحديداً بأسلوب طبيعي كأنك تتحدث مع صديق تفهم وضعه وتريد مصلحته.\n"
    "قواعد لا تُكسر: استخدم فقط الأرقام الموجودة في بيانات العميل، ولا تخترع أو تحسب أي رقم جديد. "
    "وإذا ذكر العميل رقماً أو سيناريو افتراضياً غير موجود في بياناتك، فلا تكرّر رقمه كأنه حقيقة ولا "
    "تخترع رقماً؛ بل تفهّم سؤاله بلطف (مثل: «بخصوص ما ذكرت، وبالنظر إلى وضعك الحالي…») ثم استند إلى "
    "أرقامه الحقيقية المتوفرة لديك فقط.\n"
    "مهم جداً: إذا سُئلت عن سبب ارتفاع نسبة عبء الدين (DBR) أو عن أثر مبلغ التمويل المطلوب عليها، "
    "وضّح أن ما يدخل فعلياً في حساب النسبة هو القسط الشهري للتمويل (الناتج من المبلغ والمدة ومعدل "
    "الفائدة معاً) وليس مبلغ التمويل الإجمالي نفسه، واذكر رقم القسط الشهري الفعلي كما هو في بياناتك "
    "حرفياً — لا تحسبه بنفسك ولا تفترضه."
)

# Savings advisor persona (the "AI Savings Advisor" full-page feature). Same hard number rule:
# EVERY riyal figure is computed in Python and handed to the model; the model only explains the
# 50/30/20 framework in the client's own numbers and suggests practical, human tips.
SAVINGS_SYSTEM_PROMPT = (
    "أنت «مُرتقى»، مستشار مالي سعودي ذكي وودود يتحدث العربية فقط بأسلوب دافئ ومشجّع وعملي. "
    "مهمتك أن تشرح للعميل قاعدة الادخار 50٪ للاحتياجات و30٪ للرغبات و20٪ للادخار مستخدماً مبالغه "
    "بالريال المعطاة لك، ثم تقترح خطوات عملية لتقليل مصروفاته غير الأساسية.\n"
    "قواعد صارمة لا تُكسر أبداً وإلا رُفضت إجابتك بالكامل:\n"
    "- الأرقام المسموح بذكرها هي فقط: المبالغ بالريال المعطاة في البيانات حرفياً، والنِّسَب 50 و30 "
    "و20. اكتب النِّسَب هكذا: «50٪ و30٪ و20٪»، وممنوع منعاً باتاً كتابتها بصيغة الشرطة المائلة "
    "مثل 50/30/20 أو استخدام الشرطة المائلة (/) بين أي رقمين إطلاقاً.\n"
    "- ممنوع اختراع أي مبلغ جديد، أو حساب أي فرق أو مجموع أو توفير، أو قول «ستوفّر كذا» أو «قلّل إلى "
    "كذا ريال». عند اقتراح تقليل فئة، صِفه بالكلمات فقط (مثل: «قلّل إنفاقك على المطاعم») دون أي رقم جديد.\n"
    "- لا تُجرِ أي عملية حسابية إطلاقاً.\n"
    "- كن مختصراً وإنسانياً ومحفّزاً، لا آلة تقرأ أرقاماً."
)

ACTIONABLE_FEATURE_LABELS_AR = {
    "requested_loan_amount_sar": "مبلغ التمويل المطلوب",
    "loan_int_rate": "معدل الفائدة",
    "other_loan_installments_sar": "أقساط القروض الأخرى",
    "credit_card_min_payment_sar": "الحد الأدنى لسداد البطاقة الائتمانية",
}

# Allows Arabic script, Arabic-Indic digits, ASCII digits, and basic punctuation.
# Anything outside this (e.g. Chinese/Latin script intrusions seen during model
# evaluation) fails the guard.
# Quotation marks and dashes were added 2026-07-13: ALLaM signs off with «فريق "مُرتقى"» and
# uses typographic dashes. They are punctuation -- they carry no numeric or directional meaning,
# so they cannot fabricate a figure or invert a claim, and rejecting them was throwing away
# otherwise-perfect narrations. This widens the PUNCTUATION set only; the script check itself
# (which is what catches Chinese/Latin intrusions) is unchanged.
_ALLOWED_CHAR_PATTERN = re.compile(
    r"^[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿"
    r"0-9\s.,:;!?()،؛؟٪٫٬﷽\-%\"'«»—–…]*$"
)

# ALLaM formats its lists with Markdown emphasis ("**المسار 1**"). Asterisks/underscores are
# pure formatting: they are stripped before the script check (and out of the returned text, so
# the UI never renders a literal "**").
#
# Two arms, and the distinction matters for safety:
#   [*_]{2,3}          a RUN of markers is always formatting -- no arithmetic notation uses "**"
#                      to mean anything the guard cares about, and the arithmetic check above
#                      explicitly matches "2 ** 3" anyway, so it is rejected before we get here.
#   (?<!\d)[*_](?!\d)  a SINGLE marker is stripped only when it is NOT between two digits, so a
#                      lone "2*3" survives intact. The arithmetic check already ran on the raw
#                      text; this is belt-and-braces. Stripping formatting cannot hide arithmetic.
_MARKDOWN_EMPHASIS_PATTERN = re.compile(r"[*_]{2,3}|(?<!\d)[*_](?!\d)")

_NUMBER_PATTERN = re.compile(r"\d[\d,]*\.?\d*")
# "-" requires surrounding whitespace to count as arithmetic, since a bare
# digit-hyphen-digit sequence is also how source month strings look (e.g.
# "2017-01") -- narrations legitimately quoting a month would otherwise be
# rejected as if they contained a subtraction. Other operators don't collide
# with any legitimate formatting, so they stay strict (no whitespace required).
_ARITHMETIC_OPERATOR_PATTERN = re.compile(
    r"\d[\d,.]*\s+[-+]\s+\d[\d,.]*|\d\s*\*\*\s*\d|\d\s*[*/=×÷]\s*\d"
)

# Narrow tolerance for legitimate rounding/formatting differences only (e.g. a model
# writing "833.0" for a source value of 833.03) -- not a loophole for fabrication.
# Real hallucinated numbers seen during evaluation (an invented "6%", a miscalculated
# "100.00" where the true value was 105.36) are far outside both of these bounds.
_NUMBER_MATCH_ROUNDING_DECIMALS = (0, 1)
_NUMBER_MATCH_RELATIVE_TOLERANCE = 0.01

# Best-effort Arabic direction keywords -- narrow and documented, matching the
# guard's existing philosophy for the numeric-fidelity check. Used only to catch
# a stated direction (increase/decrease) that contradicts the real change computed
# from cf_data; a narration with no direction wording near a number is unaffected.
_INCREASE_DIRECTION_WORDS = ("زياد", "ارفع", "رفع", "زد", "يزيد", "أعلى")
_DECREASE_DIRECTION_WORDS = ("تخفيض", "تقليل", "خفض", "خفّض", "قلل", "قلّل", "أنقص", "انقص")
_DIRECTION_WORD_WINDOW_CHARS = 40
# Chars of text BEFORE a feature name that are scanned for the direction verb bound to it.
# Short and one-sided on purpose -- see _validate_feature_direction_claims.
_DIRECTION_PREFIX_WINDOW_CHARS = 22

_DIRECTION_LABEL_AR = {"decrease": "تخفيض", "increase": "زيادة"}

# Distinctive Arabic phrase per actionable feature, used to detect a direction claim that names
# the feature but quotes NO value (see _validate_direction_claims). Deliberately the shortest
# unambiguous core of the label -- the model routinely writes "مبلغ التمويل" for the feature
# labelled "مبلغ التمويل المطلوب", and an exact-label match would silently never fire.
_FEATURE_MATCH_TERMS = {
    "requested_loan_amount_sar": "مبلغ التمويل",
    "loan_int_rate": "الفائدة",
    "other_loan_installments_sar": "القروض الأخرى",
    "credit_card_min_payment_sar": "البطاقة",
}

# Units per actionable feature -- loan_int_rate is a percentage, not a SAR amount.
_FEATURE_UNIT_AR = {
    "requested_loan_amount_sar": "ريال",
    "other_loan_installments_sar": "ريال",
    "credit_card_min_payment_sar": "ريال",
    "loan_int_rate": "%",
}

# List-enumeration markers ("1. ", "2. ") and path/option references ("المسار 2")
# use digits to refer to a list position, not a narrated data value -- stripped
# before number-fidelity checking so they aren't misflagged as fabricated numbers.
_LIST_MARKER_PATTERN = re.compile(r"(?m)^\s*\d+[.\)]\s+")
_PATH_REFERENCE_PATTERN = re.compile(r"(?:المسار|الخيار)\s+\d+")


def strip_markdown_emphasis(text: str) -> str:
    """Removes Markdown emphasis markers (formatting only -- never touches a digit-adjacent '*')."""
    return _MARKDOWN_EMPHASIS_PATTERN.sub("", text)


def _strip_non_data_number_references(text: str) -> str:
    """Removes list/path-index digit references before number-fidelity checking."""
    stripped = _LIST_MARKER_PATTERN.sub("", text)
    stripped = _PATH_REFERENCE_PATTERN.sub("", stripped)
    return stripped


def _number_matches_source(value: float, allowed_numbers: set[float]) -> bool:
    """Checks whether a narrated number is a legitimate reproduction of a source value."""
    for allowed in allowed_numbers:
        if abs(value - allowed) < 1e-6:
            return True
        if any(round(value, decimals) == round(allowed, decimals) for decimals in _NUMBER_MATCH_ROUNDING_DECIMALS):
            return True
        if allowed != 0 and abs(value - allowed) / abs(allowed) <= _NUMBER_MATCH_RELATIVE_TOLERANCE:
            return True
    return False


_DATE_STRING_PATTERN = re.compile(r"^(\d{4})-(\d{2})$")


def _flatten_numbers(value: object) -> set[float]:
    """Recursively collects every numeric leaf value from a nested dict/list.

    Also extracts the year/month components of "YYYY-MM" date strings (the
    `month`/`ds` fields' format), so a narration that quotes a date like
    "2017-01" isn't flagged as containing a fabricated number.
    """
    numbers: set[float] = set()
    if isinstance(value, bool):
        return numbers
    if isinstance(value, (int, float)):
        numbers.add(float(value))
    elif isinstance(value, str):
        date_match = _DATE_STRING_PATTERN.match(value)
        if date_match:
            numbers.add(float(date_match.group(1)))
            numbers.add(float(date_match.group(2)))
    elif isinstance(value, dict):
        for v in value.values():
            numbers |= _flatten_numbers(v)
    elif isinstance(value, list):
        for v in value:
            numbers |= _flatten_numbers(v)
    return numbers


def _validate_feature_direction_claims(text: str, direction_facts: list[dict]) -> tuple[bool, str]:
    """Rejects a direction claim attached to a FEATURE NAME rather than to a value.

    Why this exists (found 2026-07-12): the value-anchored check below only fires when the model
    quotes one of the real old/new numbers next to the direction word. ALLaM will happily write
    "in case you decide to INCREASE the financing amount, your ratio drops to 0.2732" -- naming
    the feature, stating the wrong direction, and quoting no value at all. Every number in that
    sentence is real, so the numeric-fidelity check passes, and no value sits near the direction
    word, so the value-anchored check never runs. The claim is still exactly the meaning-inversion
    failure the guard exists to stop.

    Only features whose direction is UNAMBIGUOUS across every path are checked: if one path raises
    a feature and another lowers it, a direction word near that feature's name is not by itself
    a contradiction, and flagging it would be a false positive.
    """
    directions_by_feature: dict[str, set[str]] = {}
    for fact in direction_facts:
        if fact["direction"] == "no_change":
            continue
        directions_by_feature.setdefault(fact["feature"], set()).add(fact["direction"])

    for feature, directions in directions_by_feature.items():
        if len(directions) != 1:
            continue
        true_direction = next(iter(directions))
        term = _FEATURE_MATCH_TERMS.get(feature)
        if not term:
            continue

        for match in re.finditer(re.escape(term), text):
            # Look ONLY at the text immediately BEFORE the feature name. In Arabic the direction
            # verb precedes its object ("زيادة مبلغ التمويل"), so this is the direction actually
            # bound to this feature. A symmetric window is wrong here: the sentence
            # "زيادة مبلغ التمويل ... فإن نسبة الالتزام ستنخفض" carries an increase word for the
            # AMOUNT and a decrease word for the RATIO, and a window spanning both cancels itself
            # out -- which is precisely how a real inversion escaped this check.
            window_text = text[max(0, match.start() - _DIRECTION_PREFIX_WINDOW_CHARS) : match.start()]
            has_increase = any(word in window_text for word in _INCREASE_DIRECTION_WORDS)
            has_decrease = any(word in window_text for word in _DECREASE_DIRECTION_WORDS)

            if true_direction == "decrease" and has_increase and not has_decrease:
                return False, (
                    f"stated an increase next to '{term}', but every real change to "
                    f"{feature} is a decrease"
                )
            if true_direction == "increase" and has_decrease and not has_increase:
                return False, (
                    f"stated a decrease next to '{term}', but every real change to "
                    f"{feature} is an increase"
                )
    return True, ""


def _validate_direction_claims(text: str, direction_facts: list[dict]) -> tuple[bool, str]:
    """Rejects narration that states the wrong increase/decrease direction.

    Two complementary checks, because a wrong direction can be stated with or without a number:
      1. VALUE-anchored (below): find a real old/new value in the text and reject a contradicting
         increase/decrease keyword near it.
      2. FEATURE-anchored (_validate_feature_direction_claims): reject a contradicting keyword
         near the feature's NAME, catching claims that quote no value at all.

    Both are computed from customer_profile vs. the DiCE path -- independent of whether the prompt
    told the model the right direction.
    """
    is_valid, reason = _validate_feature_direction_claims(text, direction_facts)
    if not is_valid:
        return False, reason

    for fact in direction_facts:
        if fact["direction"] == "no_change":
            continue
        target_numbers = {fact["old_value"], fact["new_value"]}
        for match in _NUMBER_PATTERN.finditer(text):
            raw = match.group().replace(",", "")
            if not raw or raw == ".":
                continue
            value = float(raw)
            if not any(_number_matches_source(value, {target}) for target in target_numbers):
                continue
            window_start = max(0, match.start() - _DIRECTION_WORD_WINDOW_CHARS)
            window_end = min(len(text), match.end() + _DIRECTION_WORD_WINDOW_CHARS)
            window_text = text[window_start:window_end]
            has_increase_word = any(word in window_text for word in _INCREASE_DIRECTION_WORDS)
            has_decrease_word = any(word in window_text for word in _DECREASE_DIRECTION_WORDS)
            if fact["direction"] == "decrease" and has_increase_word and not has_decrease_word:
                return False, (
                    f"stated an increase near {value}, but the real change for "
                    f"{fact['feature']} is a decrease ({fact['old_value']} -> {fact['new_value']})"
                )
            if fact["direction"] == "increase" and has_decrease_word and not has_increase_word:
                return False, (
                    f"stated a decrease near {value}, but the real change for "
                    f"{fact['feature']} is an increase ({fact['old_value']} -> {fact['new_value']})"
                )
    return True, ""


def _validate_narration(
    text: str, source_data: dict, direction_facts: list[dict] | None = None
) -> tuple[bool, str]:
    """Rejects narration containing fabricated numbers, non-Arabic script, or arithmetic.

    Args:
        text: The LLM's raw Arabic response.
        source_data: The structured dict the response was supposed to narrate.
        direction_facts: Optional list of {feature, old_value, new_value, direction}
            dicts (only passed for counterfactual narrations) cross-checked by
            _validate_direction_claims().

    Returns:
        (is_valid, reason). reason is empty when is_valid is True.
    """
    if not text.strip():
        return False, "empty response"

    # The arithmetic check runs FIRST, on the raw text, before any formatting is stripped --
    # otherwise removing a Markdown "*" could in principle erase the operator in "2*3".
    if _ARITHMETIC_OPERATOR_PATTERN.search(text):
        return False, "contains an arithmetic expression"

    text = strip_markdown_emphasis(text)

    if not _ALLOWED_CHAR_PATTERN.match(text):
        return False, "contains non-Arabic/non-numeral characters"

    checked_text = _strip_non_data_number_references(text)

    allowed_numbers = _flatten_numbers(source_data)
    for match in _NUMBER_PATTERN.finditer(checked_text):
        raw = match.group().replace(",", "")
        if not raw or raw == ".":
            continue
        value = float(raw)
        if not _number_matches_source(value, allowed_numbers):
            return False, f"number {value} not found in source data (not a reasonable rounding of any source value)"

    if direction_facts:
        is_valid, reason = _validate_direction_claims(checked_text, direction_facts)
        if not is_valid:
            return False, reason

    return True, ""


# Global lock serializing every ALLaM call. On a single local 7B model, concurrent
# generations (e.g. chat + action-plan generation) contend for CPU/RAM and can choke
# Ollama, so all callers queue through here rather than run in parallel.
_OLLAMA_LOCK = threading.Lock()
_OLLAMA_TIMEOUT_SECONDS = 180  # action-plan JSON is a large generation; give it headroom.


def _call_ollama(
    system_prompt: str,
    user_prompt: str,
    options: dict | None = None,
    json_format: bool = False,
) -> str:
    """Sends a chat request to the local Ollama server and returns the raw text.

    Serialized behind _OLLAMA_LOCK so only one generation runs at a time.

    Args:
        options: Ollama sampling options (e.g. {"temperature": 0}) for this call only.
        json_format: When True, sets Ollama's `format: "json"` so the model is constrained
            to emit syntactically valid JSON (used by action-plan generation).
    """
    payload: dict = {
        "model": MODEL_NAME,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
    }
    if json_format:
        payload["format"] = "json"
    if options:
        payload["options"] = options

    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{OLLAMA_HOST}/api/chat", data=body, headers={"Content-Type": "application/json"}
    )
    with _OLLAMA_LOCK:
        with urllib.request.urlopen(request, timeout=_OLLAMA_TIMEOUT_SECONDS) as response:
            result = json.loads(response.read().decode("utf-8"))
    return result["message"]["content"].strip()


def _generate_validated_narration(
    user_prompt: str,
    source_data: dict,
    direction_facts: list[dict] | None = None,
    system_prompt: str = SYSTEM_PROMPT,
    options: dict | None = None,
) -> dict:
    """Calls the LLM until its output passes _validate_narration(), up to a retry limit.

    Args:
        system_prompt: Persona/instruction prompt. Defaults to the strict-but-warm
            SYSTEM_PROMPT; free-text chat passes CHAT_SYSTEM_PROMPT for a softer tone.
        options: Optional Ollama sampling options (e.g. {"temperature": 0}) for callers that
            want tighter, more controllable output (the savings advisor uses greedy decoding to
            stop the model inventing "you'll save X" figures the guard would reject).

    Returns:
        {"narration": str, "attempts": int} on success, or
        {"narration": None, "attempts": int, "error": str} if every attempt failed.
    """
    last_reason = ""
    for attempt in range(1, MAX_GENERATION_ATTEMPTS + 1):
        text = _call_ollama(system_prompt, user_prompt, options=options)
        is_valid, reason = _validate_narration(text, source_data, direction_facts=direction_facts)
        if is_valid:
            # Return the cleaned text: the UI renders this as plain text, so a literal "**"
            # from the model's Markdown would otherwise show up on screen.
            return {"narration": strip_markdown_emphasis(text).strip(), "attempts": attempt}
        last_reason = reason
    return {
        "narration": None,
        "attempts": MAX_GENERATION_ATTEMPTS,
        "error": f"all attempts failed validation: {last_reason}",
    }


# ── Human-readable number formatting fed to the model (Part 1) ────────────────
# The model is shown, and asked to reproduce, already-formatted numbers -- rounded whole riyals
# with thousands separators, and ratios as whole percents -- so it never has to parrot an ugly
# raw float like "265066.61" or "0.1997" to satisfy the guard. Crucially, the guard's source_data
# is built from these SAME formatted values, so honest formatted output matches 1:1: the guard's
# tolerance logic is NOT loosened (which could admit fabrication), the source of truth is simply
# expressed in display units.
def _fmt_money_ar(value: float) -> str:
    """Whole-riyal amount with thousands separators, e.g. 265066.61 -> '265,067'."""
    return f"{int(round(float(value))):,}"


def _fmt_rate_ar(value: float) -> str:
    """Interest rate as a percent with up to one decimal, e.g. 6.36 -> '6.4', 15.0 -> '15'."""
    return f"{round(float(value), 1):g}"


def _fmt_pct_ar(fraction: float) -> str:
    """Ratio fraction -> whole percent string, e.g. 0.1997 -> '20'."""
    return f"{round(float(fraction) * 100)}"


def narrate_forecast(account_number: str, months_ahead: int = 6) -> dict:
    """Narrates a total cash-flow forecast in Arabic. The LLM never computes numbers."""
    forecast_data = fe.forecast_account(account_number, months_ahead=months_ahead)
    if "error" in forecast_data:
        return {"account_number": account_number, "narration": None, "error": forecast_data["error"]}

    first_month = forecast_data["forecast"][0]
    user_prompt = (
        "البيانات:\n"
        f"- متوسط صافي التدفق النقدي الشهري المتوقع لـ{months_ahead} أشهر القادمة: "
        f"{_fmt_money_ar(forecast_data['avg_monthly_flow_forecast'])} ريال\n"
        f"- التدفق المتوقع لأول شهر ({first_month['month']}): {_fmt_money_ar(first_month['predicted_flow'])} ريال\n"
        f"- عدد الأشهر المتوقع أن يكون فيها التدفق سالباً: {forecast_data['negative_months_ahead']}\n"
        f"- الدخل الشهري: {_fmt_money_ar(forecast_data['monthly_income_sar'])} ريال\n\n"
        "المطلوب: اشرح هذه النتائج بالعربية بأسلوب واضح ومباشر للعميل، بجملتين أو ثلاث فقط."
    )
    result = _generate_validated_narration(user_prompt, {**forecast_data, "months_ahead": months_ahead})
    return {"account_number": account_number, **result}


def _build_change_facts(customer_profile: dict, path: dict) -> list[dict]:
    """Computes old value / new value / direction ground truth for one path's changes.

    Direction is derived from the RAW values (so a display rounding can never flip or flatten it),
    but old_value/new_value are stored at DISPLAY precision -- whole riyals, or one decimal for the
    rate -- so both the prompt and the guard's source_data speak in the same formatted numbers the
    model is meant to reproduce (Part 1).
    """
    facts = []
    for feature, new_value in path["changed_features"].items():
        raw_old = float(customer_profile[feature])
        raw_new = float(new_value)
        if raw_new < raw_old - 1e-6:
            direction = "decrease"
        elif raw_new > raw_old + 1e-6:
            direction = "increase"
        else:
            direction = "no_change"
        if feature == "loan_int_rate":
            old_display, new_display = round(raw_old, 1), round(raw_new, 1)
        else:
            old_display, new_display = float(round(raw_old)), float(round(raw_new))
        facts.append(
            {"feature": feature, "old_value": old_display, "new_value": new_display, "direction": direction}
        )
    return facts


def _format_change_facts_ar(change_facts: list[dict]) -> str:
    """Formats a path's changed features as an Arabic old->new list with the correct direction word."""
    parts = []
    for fact in change_facts:
        label = ACTIONABLE_FEATURE_LABELS_AR.get(fact["feature"], fact["feature"])
        direction_word = _DIRECTION_LABEL_AR.get(fact["direction"], "بدون تغيير")
        unit = _FEATURE_UNIT_AR.get(fact["feature"], "")
        if fact["feature"] == "loan_int_rate":
            old_s, new_s = _fmt_rate_ar(fact["old_value"]), _fmt_rate_ar(fact["new_value"])
        else:
            old_s, new_s = _fmt_money_ar(fact["old_value"]), _fmt_money_ar(fact["new_value"])
        parts.append(f"{label}: من {old_s} إلى {new_s} {unit} ({direction_word})".replace("  ", " "))
    return "، ".join(parts)


def narrate_counterfactual(customer_profile: dict, num_paths: int = 3) -> dict:
    """Narrates DiCE counterfactual eligibility results in Arabic.

    Covers all three of generate_counterfactuals()'s outcomes: already eligible,
    no feasible path, or one/more real paths to eligibility.
    """
    cf_data = ce.generate_counterfactuals(customer_profile, num_paths=num_paths)
    direction_facts: list[dict] = []
    source_data: dict = {}

    if cf_data.get("already_eligible"):
        user_prompt = (
            "البيانات: العميل مؤهل بالفعل للحصول على التمويل.\n\n"
            "المطلوب: أخبر العميل بذلك بجملة واحدة بالعربية."
        )
    elif not cf_data["paths"]:
        current_pct = _fmt_pct_ar(cf_data["current_dbr"])
        # The guard's source of truth is the SAME percent the prompt shows (not the raw fraction).
        source_data = {"current_dbr_pct": int(current_pct)}
        user_prompt = (
            f"البيانات: العميل غير مؤهل حالياً (نسبة الالتزام الحالية: {current_pct}٪). "
            "لم يتم إيجاد أي مسار واقعي ليصبح مؤهلاً بالتغييرات المتاحة.\n\n"
            "المطلوب: اشرح هذا للعميل بجملتين بالعربية بأسلوب واضح ومتعاطف."
        )
    else:
        all_change_facts = [_build_change_facts(customer_profile, path) for path in cf_data["paths"]]
        current_pct = _fmt_pct_ar(cf_data["current_dbr"])
        paths_text = "\n".join(
            f"- المسار {index + 1}: {_format_change_facts_ar(facts)}، "
            f"نسبة الالتزام الجديدة: {_fmt_pct_ar(path['new_dbr'])}٪"
            for index, (path, facts) in enumerate(zip(cf_data["paths"], all_change_facts))
        )
        direction_facts = [fact for facts in all_change_facts for fact in facts]
        # source_data holds exactly the formatted numbers the prompt shows: whole-percent ratios
        # and (via change_facts) whole-riyal / one-decimal-rate lever values. The model reproduces
        # these, so it passes the (unchanged) guard without ever quoting a raw float.
        source_data = {
            "current_dbr_pct": int(current_pct),
            "num_paths": len(cf_data["paths"]),
            "paths": [
                {"new_dbr_pct": int(_fmt_pct_ar(path["new_dbr"])), "changes": facts}
                for path, facts in zip(cf_data["paths"], all_change_facts)
            ],
        }
        user_prompt = (
            f"البيانات: العميل غير مؤهل حالياً (نسبة الالتزام الحالية: {current_pct}٪). "
            f"توجد {len(cf_data['paths'])} مسارات ممكنة ليصبح مؤهلاً:\n{paths_text}\n\n"
            "المطلوب: اشرح هذه المسارات للعميل بالعربية بأسلوب واضح ومباشر. "
            "استخدم فقط كلمتي \"تخفيض\" أو \"زيادة\" كما وردتا أعلاه بالضبط لوصف اتجاه كل تغيير، ولا تعكسهما أبداً."
        )

    result = _generate_validated_narration(user_prompt, source_data, direction_facts=direction_facts)
    return {**result, "current_eligible": cf_data.get("already_eligible", False) or cf_data.get("current_eligible")}


def _top_categories_for_account(account_number: str, top_n: int = 3) -> list[dict]:
    """Computes an account's top spending categories by average monthly amount.

    Deterministic pandas aggregation over Layer 1's already-computed category data -- the LLM
    never sees raw transactions or performs this aggregation itself. Categories are returned
    under their ARABIC labels: the slugs are English, and the guard's script check rejects
    Latin characters, so feeding a slug to the model would either invite a foreign-script
    response or push it into inventing its own translation.
    """
    categorized_df = pd.read_csv(CATEGORIZED_TRANSACTIONS_CSV, dtype={"accountNumber": str})
    account_df = categorized_df[categorized_df["accountNumber"] == str(account_number)]
    avg_by_category = account_df.groupby("category")["amount"].mean().sort_values(ascending=False)
    return [
        {
            "category": cat.CATEGORY_LABELS_AR.get(category, category),
            "avg_monthly_amount": round(float(amount), 2),
        }
        for category, amount in avg_by_category.head(top_n).items()
    ]


def narrate_top_categories(account_number: str, top_n: int = 3) -> dict:
    """Narrates an account's top spending categories in Arabic."""
    top_categories = _top_categories_for_account(account_number, top_n=top_n)
    if not top_categories:
        return {"account_number": account_number, "narration": None, "error": "no category data for this account"}

    categories_text = "\n".join(
        f"- {entry['category']}: {_fmt_money_ar(entry['avg_monthly_amount'])} ريال شهرياً" for entry in top_categories
    )
    source_data = {"account_number": account_number, "top_categories": top_categories}
    user_prompt = (
        f"البيانات:\nأكبر {len(top_categories)} فئات إنفاق شهرياً:\n{categories_text}\n\n"
        "المطلوب: اشرح هذه الفئات للعميل بالعربية بأسلوب واضح ومباشر، بجملتين أو ثلاث فقط."
    )
    result = _generate_validated_narration(user_prompt, source_data)
    return {"account_number": account_number, **result}


def narrate_free_text(question: str, facts: dict) -> dict:
    """Answers a free-typed user question in Arabic, grounded ONLY in `facts`.

    `facts` is a flat dict of Arabic-label -> real numeric value already computed by
    Layers 1/2 (e.g. {"الدخل الشهري (ريال)": 20166, ...}). It is passed as the guard's
    source_data, so `_validate_narration()` still rejects any number the model emits that
    isn't one of these real values -- the no-fabrication rule holds even for open-ended
    chat. Off-topic questions (that quote no numbers) pass the guard and get a polite
    redirect; a fabricated figure is rejected and the caller falls back.
    """
    facts_text = "\n".join(f"- {label}: {value}" for label, value in facts.items())
    grounded_prompt = (
        "بيانات العميل الحقيقية المتاحة لك (استخدم هذه الأرقام فقط):\n"
        f"{facts_text}\n\n"
        f"سؤال العميل: {question}\n\n"
        "أجب على سؤاله تحديداً بالعربية بأسلوب دافئ ومباشر (من جملتين إلى أربع جمل). إن كان السؤال "
        "افتراضياً أو يتضمّن أرقاماً ليست في بياناتك، فلا تكرّر تلك الأرقام؛ تفهّم سؤاله ثم وجّهه بلطف "
        "إلى ما تقوله أرقامه الحقيقية أعلاه، وقدّم توصية عملية بناءً عليها."
    )
    result = _generate_validated_narration(grounded_prompt, facts, system_prompt=CHAT_SYSTEM_PROMPT)
    if result.get("narration"):
        return result

    # Warm, on-topic fallback: answer qualitatively with NO specific numbers, so the reply
    # stays conversational and passes the guard, instead of dropping to a static canned line.
    qualitative_prompt = (
        f"سؤال العميل: {question}\n\n"
        "أجب بالعربية بأسلوب دافئ ومتعاطف (جملتان) بشكل عام ومشجّع، دون ذكر أي رقم أو مبلغ محدّد، "
        "وادعُ العميل بلطف للسؤال عن أرقامه المالية التفصيلية لمزيد من التوضيح."
    )
    return _generate_validated_narration(qualitative_prompt, {}, system_prompt=CHAT_SYSTEM_PROMPT)


STRATEGY_SELECT_SYSTEM_PROMPT = (
    "أنت «مُرتقى»، مستشار مالي سعودي خبير. مهمتك اختيار أنسب استراتيجية ادخار واحدة من قائمة مُعطاة، "
    "بالموازنة بين هدف العميل ووضعه المالي الحالي معاً: فمن عليه عبء ديون مرتفع قد يناسبه توجيه أكبر "
    "لسداد الديون ولو كان هدفه شراءً، ومن يدّخر أصلاً بمستوى جيد يحتمل خطة أكثر جرأة، ومن إنفاقه على "
    "الرغبات منخفض لا يُثقَل بخطة متشدّدة.\n"
    "أخرج **فقط** كائن JSON صالحاً بالشكل {\"strategy_key\": \"<المفتاح حرفياً من القائمة>\"} — بلا أي "
    "نص أو شرح قبله أو بعده وبلا علامات ```. المفتاح يجب أن يكون واحداً من مفاتيح القائمة تماماً."
)


def _select_strategy_key(
    goal_label: str, financial_context: str, strategy_menu: str, allowed_keys: set
) -> str | None:
    """Asks ALLaM to pick ONE strategy key from the goal AND the client's financial state.

    `financial_context` is a qualitative, digit-free description of the client's situation (debt
    load, current saving behaviour, discretionary flexibility) classified in Python -- so the model
    weighs both goal and reality, while the step still outputs only a key (no numbers, so it stays
    highly reliable and needs no numeric guard). Returns a validated key, or None on failure (the
    caller then uses its deterministic goal->strategy fallback).
    """
    user_prompt = (
        f"هدف العميل: {goal_label}\n"
        f"وضع العميل المالي الحالي: {financial_context}\n\n"
        f"قائمة الاستراتيجيات المتاحة (اختر مفتاحاً واحداً يوازن بين الهدف والوضع المالي):\n{strategy_menu}\n\n"
        'أخرج JSON بالشكل {"strategy_key": "..."} فقط.'
    )
    for _ in range(ACTION_PLAN_MAX_ATTEMPTS):
        raw = _call_ollama(
            STRATEGY_SELECT_SYSTEM_PROMPT, user_prompt, options=ACTION_PLAN_OPTIONS, json_format=True
        )
        # _extract_clean_json already returns a parsed dict (or None) -- do NOT json.loads it again.
        data = _extract_clean_json(raw)
        if isinstance(data, dict):
            key = str(data.get("strategy_key", "")).strip()
            if key in allowed_keys:
                return key
    return None


def _narrate_strategy_plan(goal_label: str, strategy_name: str, source_data: dict) -> dict:
    """Narrates the chosen strategy tied to the goal, guard-validated against source_data.

    source_data carries the strategy's target amounts + its whole-percent ratios + the persona's
    real figures, so every number the model emits must be one of them; only the slash notation is
    disallowed (the prompt handles it). Sampled decoding so the guard's retry loop has variety.
    """
    # The library names carry a slash ratio suffix ("قاهر الديون 60/10/30"); a slash between digits
    # trips the guard's arithmetic check when the model echoes the name, so strip it for the prompt.
    clean_name = re.sub(r"\s*\d+\s*/\s*\d+\s*/\s*\d+\s*", "", strategy_name).strip()
    facts_text = "\n".join(f"- {label}: {value}" for label, value in source_data.items())
    user_prompt = (
        f"هدف العميل: {goal_label}\n"
        f"الاستراتيجية المختارة: {clean_name}\n\n"
        "بيانات العميل والمبالغ المستهدفة (استخدم هذه الأرقام فقط، حرفياً، بلا حساب أو اختراع):\n"
        f"{facts_text}\n\n"
        "اكتب شرحاً موجزاً ومحفّزاً بالعربية (ثلاث إلى خمس جُمَل) بهذا الترتيب:\n"
        "1) رحّب بالعميل واربط الاستراتيجية المختارة بهدفه ولماذا تناسبه.\n"
        "2) اذكر مبالغه المستهدفة الثلاثة بالريال كما وردت أعلاه حرفياً (احتياجات، رغبات، ادخار).\n"
        "3) قدّم نصيحة أو نصيحتين عمليتين لتقليل إنفاقه غير الأساسي — بالكلمات فقط دون أي رقم جديد — "
        "لتسريع الوصول إلى هدفه.\n"
        "تذكّر: الأرقام المسموحة هي المبالغ بالريال والنِّسَب المعطاة أعلاه فقط، وبلا شرطة مائلة (/)."
    )
    return _generate_validated_narration(user_prompt, source_data, system_prompt=SAVINGS_SYSTEM_PROMPT)


def recommend_savings_strategy(
    goal_label: str,
    financial_context: str,
    strategy_menu: str,
    strategies_full: dict,
    base_facts: dict,
    fallback_key: str,
) -> dict:
    """Two-step AI plan: SELECT the best strategy from goal + financial state, then NARRATE it.

    The LLM only chooses a key (from the fixed library) and writes prose; Python owns every riyal
    amount. Selection weighs both the goal and `financial_context` (a Python-classified, digit-free
    description of the client's debt load / saving behaviour / discretionary room).
    `strategies_full` is {key: {"name", "targets": {needs,wants,savings}, "pcts": [n,w,s]}}
    precomputed by the caller, so once a key is chosen the target amounts + ratios are ready as the
    guard's source_data. `base_facts` is the strategy-independent facts (income, obligations, actual
    spending, categories).

    Returns {"strategy_key": str, "advice": str | None, "source": "live" | "none"}.
    """
    key = _select_strategy_key(goal_label, financial_context, strategy_menu, set(strategies_full)) or fallback_key
    info = strategies_full[key]
    source = {
        **base_facts,
        "المبلغ المستهدف للاحتياجات (ريال)": info["targets"]["needs"],
        "المبلغ المستهدف للرغبات (ريال)": info["targets"]["wants"],
        "المبلغ المستهدف للادخار (ريال)": info["targets"]["savings"],
        "نسبة الاحتياجات": info["pcts"][0],
        "نسبة الرغبات": info["pcts"][1],
        "نسبة الادخار": info["pcts"][2],
    }
    result = _narrate_strategy_plan(goal_label, info["name"], source)
    if result.get("narration"):
        return {"strategy_key": key, "advice": result["narration"], "source": "live"}
    return {"strategy_key": key, "advice": None, "source": "none"}


# ── AI-generated action plans (JSON) — grounded, digit-free text ─────────────
# The model writes only qualitative Arabic text; every generated string must be
# DIGIT-FREE (durations spelled in words). This makes fabricating a financial number
# structurally impossible -- the caller injects the real numbers into the `effect`
# field afterward. Output is strict JSON, validated below; any failure -> None so the
# caller falls back to the pre-baked / templated playbook.
_PLAN_DIFFICULTIES = {"سهل", "متوسط", "صعب"}
_ANY_DIGIT_PATTERN = re.compile(r"[0-9٠-٩]")
ACTION_PLAN_MAX_ATTEMPTS = 3
# Deterministic, low-creativity sampling for JSON generation. temperature 0 -> greedy
# decoding, so the output is effectively reproducible for a given prompt (a valid result
# stays valid on every call). top_k/top_p reinforce the greedy path.
ACTION_PLAN_OPTIONS = {"temperature": 0, "top_k": 1, "top_p": 0.1}

ACTION_PLAN_SYSTEM_PROMPT = (
    "أنت «مُرتقى»، مستشار مالي سعودي خبير يقترح خططاً عملية لمنشأة صغيرة بالعربية الفصحى.\n"
    "يجب أن تُخرج **فقط** كائن JSON واحداً صالحاً مطابقاً للبنية المطلوبة تماماً — بلا أي نص أو "
    "شرح أو تحية قبله أو بعده، وبلا علامات ``` إطلاقاً.\n"
    "اكتب محتوى مالياً مفصّلاً ومهنياً وقابلاً للتنفيذ بعربية فصحى راقية: لكل خطوة اشرح ماذا "
    "ولماذا وكيف في جملة أو جملتين وافيتين تعطيان سياقاً حقيقياً، وتجنّب العبارات القصيرة "
    "المقتضبة أو العامة. اجعل المميزات والسلبيات جُملاً مكتملة تشرح الأثر لا مجرد كلمات.\n"
    "قاعدة صارمة لا تُكسر: لا تكتب أي رقم أو مبلغ أو نسبة داخل أي نص أبداً — لا أرقاماً عربية ولا "
    "إنجليزية. اكتب المدة بالكلمات فقط (مثل: شهر واحد، شهران، ثلاثة أشهر). كل النصوص عربية واضحة."
)

# One fully-filled, richly-detailed, digit-free example (few-shot) so the 7B model mirrors
# both the exact JSON shape AND the professional depth expected in each field.
_ACTION_PLAN_EXAMPLE = {
    "plans": [
        {
            "title": "تسريع دورة تحصيل المستحقات وتحسين إدارة الذمم المدينة",
            "summary": (
                "تقصير الفترة بين تسليم الطلبات وتحصيل قيمتها لتقوية التدفق النقدي التشغيلي قبل "
                "موسم الضغط، عبر ضبط سياسات الفوترة والتحصيل ومتابعة العملاء بشكل منهجي."
            ),
            "steps": [
                "إعادة تصميم سياسة الفوترة بحيث تُصدر الفاتورة فور تسليم الطلب مباشرةً بدلاً من "
                "نهاية الشهر، مع إرسال تذكير آلي للعميل عند اقتراب موعد الاستحقاق لتقليل التأخير.",
                "تقديم حافز سداد مبكر بسيط للعملاء الكبار مقابل تقصير مدة السداد، وربط الحافز بحجم "
                "التعامل بحيث يشجّع كبار العملاء على الالتزام دون الإضرار بالعلاقة التجارية.",
                "إنشاء متابعة أسبوعية منظمة للفواتير المتأخرة مع تصنيف العملاء حسب انتظام سدادهم، "
                "والتركيز على المتعثرين أولاً عبر تواصل مباشر ومهني لاستعادة السيولة المحتجزة.",
            ],
            "duration": "شهر واحد",
            "difficulty": "سهل",
            "pros": [
                "يحسّن السيولة التشغيلية بسرعة دون الحاجة إلى تمويل خارجي أو زيادة في المبيعات.",
                "يبني انضباطاً مالياً مستداماً في إدارة الذمم يقلّل تكرار فجوات السيولة مستقبلاً.",
            ],
            "cons": [
                "يعتمد نجاحه على مدى تجاوب العملاء والتزامهم بالمواعيد الجديدة للسداد.",
                "قد يتطلب حافز السداد المبكر التنازل عن جزء يسير من هامش الربح لبعض الصفقات.",
            ],
        }
    ]
}


def _build_action_plan_prompt(context_text: str, num_plans: int) -> str:
    """User prompt: num_plans distinct plans as strict JSON, few-shot, digit-free text."""
    example = json.dumps(_ACTION_PLAN_EXAMPLE, ensure_ascii=False)
    return (
        f"وضع المنشأة المالي:\n{context_text}\n\n"
        f"اقترح {num_plans} خطط عملية متمايزة لتقوية التدفق النقدي وتجاوز فجوة السيولة المتوقعة "
        "ورفع جاهزية المنشأة للتمويل.\n"
        f"لكل خطة: عنوان قصير، ووصف بجملة، وثلاث خطوات عملية واضحة، ومدة بالكلمات، ومستوى صعوبة "
        "(سهل أو متوسط أو صعب)، وميزتان، وسلبيتان.\n\n"
        f"اتبع هذا المثال في البنية بالضبط (لكن بمحتوى مختلف يناسب وضع المنشأة، ومع "
        f"{num_plans} خطط داخل المصفوفة بدل واحدة):\n{example}\n\n"
        "أعد فقط كائن JSON مطابقاً لهذه البنية، مع ملء كل الحقول السبعة لكل خطة، وبلا أي رقم في النص."
    )


def _text_is_clean(value: object) -> bool:
    """A generated string is valid only if it is non-empty, Arabic-only, and DIGIT-FREE."""
    return (
        isinstance(value, str)
        and bool(value.strip())
        and _ANY_DIGIT_PATTERN.search(value) is None
        and bool(_ALLOWED_CHAR_PATTERN.match(value))
    )


def _validate_plan(plan: object) -> bool:
    """Structure + digit-free check for a single generated plan dict."""
    if not isinstance(plan, dict):
        return False
    if not (_text_is_clean(plan.get("title")) and _text_is_clean(plan.get("summary"))):
        return False
    if not _text_is_clean(plan.get("duration")):
        return False
    if plan.get("difficulty") not in _PLAN_DIFFICULTIES:
        return False
    steps = plan.get("steps")
    if not isinstance(steps, list) or not (2 <= len(steps) <= 4) or not all(_text_is_clean(s) for s in steps):
        return False
    for key in ("pros", "cons"):
        items = plan.get(key)
        if not isinstance(items, list) or not (1 <= len(items) <= 4) or not all(_text_is_clean(i) for i in items):
            return False
    return True


_MARKDOWN_FENCE_PATTERN = re.compile(r"```(?:json)?", re.IGNORECASE)
_TRAILING_COMMA_PATTERN = re.compile(r",(\s*[}\]])")


def _extract_clean_json(raw: str) -> dict | None:
    """Robustly recovers a JSON object from a possibly-chatty/fenced model response.

    Defensive layers (in order): strip Markdown ``` fences, slice from the first '{' to the
    last '}' (dropping any pre/post chatter), remove trailing commas before } or ], then parse.
    Returns the dict, or None if nothing parseable remains.
    """
    if not raw:
        return None
    text = _MARKDOWN_FENCE_PATTERN.sub("", raw)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    candidate = _TRAILING_COMMA_PATTERN.sub(r"\1", text[start : end + 1])
    try:
        parsed = json.loads(candidate)
        return parsed if isinstance(parsed, dict) else None
    except (json.JSONDecodeError, ValueError):
        return None


def generate_action_plans(context_text: str, num_plans: int = 3) -> list[dict] | None:
    """Generates `num_plans` grounded, digit-free action plans via ALLaM as strict JSON.

    Args:
        context_text: A qualitative Arabic description of the business's situation.
        num_plans: How many plans to return.

    Returns:
        A list of validated plan dicts (title/summary/steps/duration/difficulty/pros/cons),
        or None if generation or validation failed on every attempt. No `effect`/id yet --
        the caller injects the real numbers.
    """
    user_prompt = _build_action_plan_prompt(context_text, num_plans)
    for _ in range(ACTION_PLAN_MAX_ATTEMPTS):
        try:
            raw = _call_ollama(
                ACTION_PLAN_SYSTEM_PROMPT,
                user_prompt,
                options=ACTION_PLAN_OPTIONS,
                json_format=True,
            )
        except Exception:  # noqa: BLE001 -- Ollama down/timeout -> let caller fall back
            return None
        data = _extract_clean_json(raw)
        if not data or not isinstance(data.get("plans"), list):
            continue
        # Coerce the two LABEL fields (difficulty, duration) to safe defaults when the model
        # omits or malforms them -- they are labels, not numbers or advisory content, so
        # defaulting them avoids discarding an otherwise-valid, digit-free plan. The real AI
        # content (title/summary/steps/pros/cons) is still required clean by _validate_plan.
        for candidate in data["plans"]:
            if not isinstance(candidate, dict):
                continue
            if candidate.get("difficulty") not in _PLAN_DIFFICULTIES:
                candidate["difficulty"] = "متوسط"
            if not _text_is_clean(candidate.get("duration")):
                candidate["duration"] = "شهر واحد"
        valid = [p for p in data["plans"] if _validate_plan(p)]
        if len(valid) >= num_plans:
            return valid[:num_plans]
    return None


# ── SME (business) narration — Layer 3 for the cash-flow-based readiness track ──
SME_MONTHLY_CATEGORIZED_CSV = ROOT_DIR / "data" / "processed" / "sme_monthly_categorized.csv"
SME_CATEGORY_LABELS_AR = {
    "salaries_wages": "الرواتب والأجور",
    "cogs_suppliers": "تكلفة البضاعة والموردون",
    "rent_utilities": "الإيجار والمرافق",
    "professional_services": "الخدمات المهنية",
    "licenses_fees": "الرخص والرسوم",
    "visa_iqama_costs": "تكاليف التأشيرات والإقامات",
    "vat": "ضريبة القيمة المضافة",
    "loan_installments": "أقساط التمويل",
}


def narrate_sme_readiness(account_number: str | None = None) -> dict:
    """Narrates SME financing readiness, runway, and the predicted liquidity gap in Arabic.

    The LLM never computes numbers -- every figure comes from sme_engine.assess_readiness().
    """
    readiness = se.assess_readiness(account_number or se.SME_ACCOUNT)
    if "error" in readiness:
        return {"account_number": readiness.get("account_number"), "narration": None, "error": readiness["error"]}

    gap_criterion = next((c for c in readiness["criteria"] if c["id"] == "no-negative-month"), None)
    gap_text = gap_criterion["value"] if gap_criterion else "لا فجوة متوقعة"

    # Pass clean raw numbers (not the "+6٪" display strings) so the guard's
    # number-fidelity check sees exactly the values the narration may quote.
    source_data = {
        "score": readiness["score"],
        "runway_months": readiness["runway_months"],
        "revenue_growth_pct": readiness["revenue_growth_pct"],
        "positive_streak_months": readiness["positive_streak_months"],
    }

    user_prompt = (
        "البيانات:\n"
        f"- درجة الجاهزية التمويلية: {readiness['score']} (الحالة: {readiness['status_word']})\n"
        f"- عدد الأشهر المتتالية بتدفق نقدي موجب: {readiness['positive_streak_months']}\n"
        f"- نسبة نمو الإيرادات: {readiness['revenue_growth_pct']}٪\n"
        f"- أشهر الأمان النقدي: {readiness['runway_months']}\n"
        f"- حالة الأشهر القادمة: {gap_text}\n"
        f"- التوقيت المقترح: {readiness['timing']['verdict']}\n\n"
        "المطلوب: اشرح جاهزية المنشأة للتمويل بالعربية بجملتين أو ثلاث، ونبّه بوضوح إلى فجوة السيولة "
        "المتوقعة إن وُجدت. استخدم فقط الأرقام الواردة أعلاه بدون أي حساب جديد."
    )
    result = _generate_validated_narration(user_prompt, source_data)
    return {"account_number": readiness["account_number"], **result}


def _sme_top_expenses(account_number: str | None = None, top_n: int = 3) -> list[dict]:
    """Average monthly expense per SME category, highest first (deterministic aggregation).

    Defaults to the demo persona: the dataset now holds 500 businesses, so aggregating with
    no account filter would average across all of them and report figures belonging to nobody.
    """
    df = pd.read_csv(SME_MONTHLY_CATEGORIZED_CSV, dtype={"accountNumber": str})
    df = df[df["accountNumber"] == str(account_number or se.SME_ACCOUNT)]
    avg = df.groupby("category")["amount"].mean().sort_values(ascending=False)
    return [
        {"category": SME_CATEGORY_LABELS_AR.get(cat, cat), "avg_monthly_amount": round(float(amount), 2)}
        for cat, amount in avg.head(top_n).items()
    ]


def narrate_sme_top_expenses(account_number: str | None = None, top_n: int = 3) -> dict:
    """Narrates an SME's largest operating-expense categories in Arabic."""
    top_expenses = _sme_top_expenses(account_number, top_n=top_n)
    if not top_expenses:
        return {"account_number": account_number, "narration": None, "error": "no SME category data"}

    expenses_text = "\n".join(
        f"- {entry['category']}: {entry['avg_monthly_amount']:.2f} ريال شهرياً" for entry in top_expenses
    )
    source_data = {"account_number": account_number, "top_expenses": top_expenses}
    user_prompt = (
        f"البيانات:\nأكبر {len(top_expenses)} بنود مصروفات تشغيلية شهرياً:\n{expenses_text}\n\n"
        "المطلوب: اشرح هذه البنود لصاحب المنشأة بالعربية بجملتين أو ثلاث، بدون أي حساب جديد."
    )
    result = _generate_validated_narration(user_prompt, source_data)
    return {"account_number": account_number, **result}


SME_QA_TEMPLATES = {
    "is_timing_right": "هل الوقت مناسب لطلب تمويل؟",
    "why_semi_ready": "لماذا جاهزيتي «شبه جاهزة»؟",
    "how_prepare_gap": "كيف أستعد لفجوة السيولة؟",
    "top_business_expenses": "أين تذهب أكبر مصروفاتي؟",
}


def answer_sme_question(question_key: str, account_number: str | None = None) -> dict:
    """Answers one of the fixed SME questions using sme_engine + SME narration.

    The first three map to the readiness narration (timing / status / gap prep);
    the fourth maps to the top-expenses narration.
    """
    if question_key not in SME_QA_TEMPLATES:
        return {"narration": None, "error": f"unknown sme question_key: {question_key}"}

    if question_key == "top_business_expenses":
        result = narrate_sme_top_expenses(account_number)
    else:
        result = narrate_sme_readiness(account_number)

    return {"question": SME_QA_TEMPLATES[question_key], **result}


QA_TEMPLATES = {
    "why_not_eligible": "لماذا أنا غير مؤهل؟",
    "how_to_become_eligible": "كيف أصبح مؤهلاً؟",
    "top_spending_categories": "ما هي أكبر مصاريفي؟",
}


def answer_fixed_question(
    question_key: str, customer_profile: dict | None = None, account_number: str | None = None
) -> dict:
    """Answers one of the fixed Q&A templates using the appropriate upstream data.

    Args:
        question_key: One of QA_TEMPLATES's keys.
        customer_profile: Required for "why_not_eligible" and "how_to_become_eligible".
        account_number: Required for "top_spending_categories".

    Returns:
        The corresponding narrate_*() result, plus "question" (the Arabic question text).
    """
    if question_key not in QA_TEMPLATES:
        return {"narration": None, "error": f"unknown question_key: {question_key}"}

    if question_key in ("why_not_eligible", "how_to_become_eligible"):
        result = narrate_counterfactual(customer_profile)
    elif question_key == "top_spending_categories":
        result = narrate_top_categories(account_number)

    return {"question": QA_TEMPLATES[question_key], **result}


def _assert_valid_narration_output(result: dict) -> None:
    """Validates that a narrate_*()/answer_fixed_question() result matches the output contract."""
    assert "narration" in result, "missing narration key"
    if result["narration"] is None:
        assert "error" in result, "narration is None but no error key present"
    else:
        assert isinstance(result["narration"], str) and result["narration"], "narration must be non-empty text"
        assert "attempts" in result, "missing attempts key"


def run_output_contract_tests(account_number: str, customer_profile: dict) -> None:
    """Runs each advisor function once and validates the output contract."""
    results = [
        narrate_forecast(account_number),
        narrate_counterfactual(customer_profile),
        narrate_top_categories(account_number),
        answer_fixed_question("why_not_eligible", customer_profile=customer_profile),
        answer_fixed_question("top_spending_categories", account_number=account_number),
    ]
    for result in results:
        _assert_valid_narration_output(result)
    print(f"All {len(results)} output contract tests passed.")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")

    profiles_df = pd.read_csv(
        ROOT_DIR / "data" / "processed" / "individuals_profiles.csv", dtype={"accountNumber": str}
    )
    ineligible = profiles_df[profiles_df["eligible_sama"] == 0].iloc[0]
    sample_account_number = str(ineligible["accountNumber"])
    sample_customer_profile = ce.load_profile(sample_account_number)

    print(json.dumps(narrate_forecast(sample_account_number), ensure_ascii=False, indent=2))
    print(json.dumps(narrate_counterfactual(sample_customer_profile), ensure_ascii=False, indent=2))
    print(json.dumps(narrate_top_categories(sample_account_number), ensure_ascii=False, indent=2))

    run_output_contract_tests(sample_account_number, sample_customer_profile)
