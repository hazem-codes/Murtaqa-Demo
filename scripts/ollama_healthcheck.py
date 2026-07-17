"""Pre-recording health check for the Layer 3 Ollama pipeline.

Run this before starting a demo recording session. It confirms the Ollama
server is responsive (restarting it if not), then runs one real call through
each of advisor_engine.py's narration types (forecast, counterfactual,
categories) -- guard included -- so a broken pipeline is caught before
recording rather than mid-take.

Usage: python scripts/ollama_healthcheck.py
Exit code 0 = safe to record, non-zero = fix the printed issue first.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

import advisor_engine as ae  # noqa: E402
import counterfactual_engine as ce  # noqa: E402

OLLAMA_EXE_FALLBACK = Path.home() / "AppData" / "Local" / "Programs" / "Ollama" / "ollama.exe"
PING_TIMEOUT_SECONDS = 5
SERVER_START_WAIT_SECONDS = 3
POST_RESTART_RETRIES = 5
SAMPLE_ACCOUNT_NUMBER = "100000009"  # the demo persona -- one account now drives every screen.


def _find_ollama_exe() -> Path | None:
    """Locates the ollama executable via PATH, falling back to the winget install path."""
    on_path = shutil.which("ollama")
    if on_path:
        return Path(on_path)
    return OLLAMA_EXE_FALLBACK if OLLAMA_EXE_FALLBACK.exists() else None


def is_ollama_responsive() -> bool:
    """Pings the Ollama server's lightweight /api/tags endpoint (no model load needed)."""
    try:
        request = urllib.request.Request(f"{ae.OLLAMA_HOST}/api/tags")
        with urllib.request.urlopen(request, timeout=PING_TIMEOUT_SECONDS):
            return True
    except (urllib.error.URLError, TimeoutError, ConnectionError):
        return False


def restart_ollama_server() -> bool:
    """Kills any existing ollama/llama-server processes and starts a fresh server.

    A full kill-and-restart (not just starting a new instance) is used because
    this session's testing found that repeated model switching can leave
    zombie llama-server processes that both waste RAM and destabilize new
    requests -- a clean restart reliably fixed every stall encountered.

    Returns:
        True if the server responds within POST_RESTART_RETRIES after restart.
    """
    ollama_exe = _find_ollama_exe()
    if ollama_exe is None:
        print("Could not locate ollama.exe (not on PATH, not at the default winget install path).")
        print("Manual fix: install Ollama, or start it yourself with `ollama serve`.")
        return False

    subprocess.run(
        ["powershell", "-Command", "Get-Process -Name 'ollama*','llama*' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"],
        capture_output=True,
    )
    time.sleep(2)

    subprocess.Popen(
        [str(ollama_exe), "serve"],
        creationflags=subprocess.CREATE_NO_WINDOW,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(SERVER_START_WAIT_SECONDS)

    for _ in range(POST_RESTART_RETRIES):
        if is_ollama_responsive():
            return True
        time.sleep(2)
    return False


def _load_sample_customer_profile() -> dict:
    """Loads the demo persona's real, deterministic ineligible profile for the smoke test."""
    return ce.load_profile(SAMPLE_ACCOUNT_NUMBER)


def run_pipeline_smoke_test() -> dict:
    """Runs one real call through each narration type and reports pass/fail per type.

    Returns:
        {"forecast": bool, "counterfactual": bool, "top_categories": bool, "all_passed": bool}
    """
    customer_profile = _load_sample_customer_profile()
    results: dict[str, bool] = {}

    print("Running smoke test (forecast, counterfactual, top categories)...")

    for name, call in (
        ("forecast", lambda: ae.narrate_forecast(SAMPLE_ACCOUNT_NUMBER)),
        ("counterfactual", lambda: ae.narrate_counterfactual(customer_profile)),
        ("top_categories", lambda: ae.narrate_top_categories(SAMPLE_ACCOUNT_NUMBER)),
    ):
        start = time.time()
        result = call()
        elapsed = time.time() - start
        passed = result.get("narration") is not None
        results[name] = passed
        status = "PASS" if passed else "FAIL"
        print(f"  [{status}] {name} ({elapsed:.1f}s, attempts={result.get('attempts')})")
        if not passed:
            print(f"    error: {result.get('error')}")

    results["all_passed"] = all(results.values())
    return results


def run_healthcheck() -> bool:
    """Runs the full pre-recording check. Returns True if safe to record."""
    print(f"Checking Ollama server at {ae.OLLAMA_HOST} ...")
    if is_ollama_responsive():
        print("Ollama server is responsive.")
    else:
        print("Ollama server did not respond. Restarting...")
        if restart_ollama_server():
            print("Ollama server restarted and is now responsive.")
        else:
            print("FAILED to bring the Ollama server up. Manual fix needed:")
            print("  1. Open a terminal and run: ollama serve")
            print("  2. Re-run this health check.")
            return False

    results = run_pipeline_smoke_test()

    print()
    if results["all_passed"]:
        print(f"ALL CHECKS PASSED (model: {ae.MODEL_NAME}). Safe to start recording.")
    else:
        failed = [name for name, passed in results.items() if name != "all_passed" and not passed]
        print(f"CHECKS FAILED: {', '.join(failed)}. Do not start recording -- investigate before proceeding.")
    return results["all_passed"]


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    success = run_healthcheck()
    sys.exit(0 if success else 1)
