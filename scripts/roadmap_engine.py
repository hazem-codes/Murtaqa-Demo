"""Part 3 — stateful roadmap progress store.

Persists which improvement plan an account has ACTIVATED and which of its steps are done,
so the journey survives server restarts and page reloads. Until now this lived only in the
React screens' `useState`, so activating a plan and ticking a step reset on every refresh or
account switch (the individuals progress strip was even hardcoded to "الخطوة 0 من N").

This module owns ONLY state — never any SAMA math, never any LLM. The steps themselves are
computed elsewhere (server.py's deterministic roadmap/plan builders, from real path numbers);
here they are frozen and their completion tracked.

Snapshot semantics (decided with the project owner, 2026-07-15c): a plan is FROZEN at the
moment of activation. We store the exact steps the customer committed to, so their tracked
progress can never silently point at different steps if the account's underlying numbers later
shift. Re-activating (the same or a different plan) overwrites the snapshot and resets progress.

Storage (self-contained, per the project rule): one JSON file per account per track under
`data/roadmap_progress/`, e.g. `data/roadmap_progress/individuals_100000009.json`. The directory
lives inside the project root and is created on first write — nothing is ever read or written
outside the project folder. Writes are atomic (temp file + os.replace) so a crash mid-write can
never leave a half-written progress file.

Public API — every function takes `track` ("individuals" | "business") and a string `account`:
    activate(track, account, plan)          -> progress dict   (snapshot + empty completion)
    get_progress(track, account)            -> progress dict | None
    set_step(track, account, step_number, done) -> progress dict
    clear(track, account)                   -> None

`plan` passed to activate() is the normalized snapshot the caller builds from its own path/plan
shape:
    {"id": <int>, "title": <str>, "steps": [{"step_number": <int>, ...opaque display fields...}]}
Each step MUST carry a unique integer "step_number"; every other field is round-tripped opaque,
so the caller controls exactly what the UI later renders from the frozen snapshot.

progress dict shape (what every function returns / the JSON file stores):
    {
      "track": "individuals",
      "account": "100000009",
      "plan": {"id": 1, "title": "...", "steps": [ ... ]},
      "completedSteps": [1, 3],          # sorted unique step_numbers
      "totalSteps": 4,
      "completedCount": 2,
      "percent": 50,                     # round(completedCount / totalSteps * 100)
      "activatedAt": "2026-07-15T12:34:56Z",
      "updatedAt": "2026-07-15T12:40:00Z"
    }
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
PROGRESS_DIR = ROOT_DIR / "data" / "roadmap_progress"

TRACKS = ("individuals", "business")
# An account only ever appears in a filename, so restrict it to a safe charset (the generated
# accounts are digits); this also blocks any path-traversal via a crafted account string.
_ACCOUNT_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _validate_track(track: str) -> str:
    if track not in TRACKS:
        raise ValueError(f"unknown track: {track!r} (expected one of {TRACKS})")
    return track


def _validate_account(account: str) -> str:
    account = str(account)
    if not _ACCOUNT_RE.match(account):
        raise ValueError(f"invalid account: {account!r}")
    return account


def _store_path(track: str, account: str) -> Path:
    return PROGRESS_DIR / f"{_validate_track(track)}_{_validate_account(account)}.json"


def _normalize_plan(plan: dict) -> dict:
    """Validates the caller's snapshot and returns a clean, minimal copy to freeze."""
    if not isinstance(plan, dict):
        raise ValueError("plan must be a dict")
    steps = plan.get("steps")
    if not isinstance(steps, list) or not steps:
        raise ValueError("plan.steps must be a non-empty list")

    seen: set[int] = set()
    frozen_steps: list[dict] = []
    for step in steps:
        if not isinstance(step, dict) or "step_number" not in step:
            raise ValueError("every step must be a dict carrying a 'step_number'")
        number = int(step["step_number"])
        if number in seen:
            raise ValueError(f"duplicate step_number: {number}")
        seen.add(number)
        frozen_steps.append({**step, "step_number": number})

    return {
        "id": int(plan["id"]) if plan.get("id") is not None else None,
        "title": str(plan.get("title", "")),
        "steps": frozen_steps,
    }


def _derive(progress: dict) -> dict:
    """Recomputes the derived counters from the snapshot + completedSteps (single source)."""
    step_numbers = [s["step_number"] for s in progress["plan"]["steps"]]
    completed = sorted({n for n in progress.get("completedSteps", []) if n in step_numbers})
    total = len(step_numbers)
    progress["completedSteps"] = completed
    progress["totalSteps"] = total
    progress["completedCount"] = len(completed)
    progress["percent"] = round(len(completed) / total * 100) if total else 0
    return progress


def _write(path: Path, progress: dict) -> dict:
    """Atomic write: temp file in the same directory, then os.replace (never a partial file)."""
    PROGRESS_DIR.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(progress, fh, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    return progress


def activate(track: str, account: str, plan: dict) -> dict:
    """Freezes `plan` as this account's active roadmap, resetting completion to empty."""
    path = _store_path(track, account)
    now = _now_iso()
    progress = {
        "track": _validate_track(track),
        "account": _validate_account(account),
        "plan": _normalize_plan(plan),
        "completedSteps": [],
        "activatedAt": now,
        "updatedAt": now,
    }
    return _write(path, _derive(progress))


def get_progress(track: str, account: str) -> dict | None:
    """Returns the active plan + completion for this account, or None if nothing is active."""
    path = _store_path(track, account)
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as fh:
            progress = json.load(fh)
    except (json.JSONDecodeError, OSError):
        return None
    return _derive(progress)


def set_step(track: str, account: str, step_number: int, done: bool) -> dict:
    """Marks one step complete/incomplete and persists. Raises if no plan is active."""
    progress = get_progress(track, account)
    if progress is None:
        raise LookupError(f"no active roadmap for {track}/{account}")

    step_number = int(step_number)
    valid = {s["step_number"] for s in progress["plan"]["steps"]}
    if step_number not in valid:
        raise ValueError(f"step_number {step_number} is not part of the active plan")

    completed = set(progress.get("completedSteps", []))
    if done:
        completed.add(step_number)
    else:
        completed.discard(step_number)
    progress["completedSteps"] = list(completed)
    progress["updatedAt"] = _now_iso()
    return _write(_store_path(track, account), _derive(progress))


def clear(track: str, account: str) -> None:
    """Removes the active plan for this account (de-activation). No-op if none exists."""
    path = _store_path(track, account)
    if path.exists():
        path.unlink()
