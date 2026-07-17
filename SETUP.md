# Murtaqa — Environment Setup Guide

This file gets any team member — or any AI coding agent with zero prior context —
from a clean machine to a fully working local copy of this project. It documents
only what is actually verified in this project's own history and current state;
it does not invent troubleshooting steps that were never encountered.

See `README.md` first for the project's overview and architecture. This file is
purely mechanical: "how do I get it running."

---

## 1. Required software

| Software | Version used in this project | Notes |
|---|---|---|
| Python | 3.14.6 (verified via `python --version` on the working dev machine) | Any recent Python 3.11+ should work for the packages below, but 3.14 is the confirmed-working version. |
| OS | Windows 11 | The project's scripts are OS-agnostic (pure Python + `pathlib`), but `scripts/ollama_healthcheck.py` shells out to `powershell` to manage the Ollama process, so that specific script is Windows-only. |
| Git | any recent version | Standard version control. |
| Git LFS | 3.7.1 (verified) | **Required**, not optional — `data/raw/transactions.csv` (~59 MB) is tracked via Git LFS (see `.gitattributes`). Without `git-lfs`, cloning gives you a pointer file, not the real data. |
| Ollama | any recent version | Local LLM runtime for Layer 3. Install via `winget install Ollama.Ollama` (Windows) or see https://ollama.com for other platforms. This project's install was verified via winget. |

Verify Git LFS is active after cloning:
```
git lfs install
git lfs pull
```
Then confirm the real file (not a pointer) landed:
```
python -c "import os; print(os.path.getsize('data/raw/transactions.csv'))"
```
This should print a number around `61250448` (~59 MB), not a few hundred bytes.

---

## 2. Python dependencies

**There is no `requirements.txt` in this project yet.** The packages actually
imported by `scripts/*.py` (verified via `grep` across the codebase) are:

```
pandas
numpy
scikit-learn
prophet
dice-ml
joblib
matplotlib
```

`cmdstanpy` is not imported directly by project scripts, but it's a required
runtime dependency of `prophet` (installed automatically alongside it).

Install with:
```
pip install pandas numpy scikit-learn prophet dice-ml joblib matplotlib
```

Versions confirmed working on the current dev machine (`pip freeze`), for
reference if you hit a compatibility issue and want to pin down:
```
pandas==3.0.3
numpy==2.5.0
scikit-learn==1.9.0
prophet==1.3.0
cmdstanpy==1.3.0
dice_ml==0.12
joblib==1.5.3
matplotlib==3.11.0
```

**Harmless warning you will see and can ignore:** `Importing plotly failed.
Interactive plots will not work.` — `plotly` is an optional dependency Prophet
tries to import for interactive charting; it is not installed in this project's
environment and nothing here uses it. This has been observed directly and does
not affect any script's output.

---

## 3. Prophet + CmdStan verification

Prophet requires a working CmdStan backend. After `pip install prophet`, verify
it resolved correctly:

```
python -c "import cmdstanpy; print(cmdstanpy.cmdstan_path())"
```

This should print a real path to an installed CmdStan version (e.g.
`...\.cmdstan\cmdstan-2.39.0`) with no error. If it fails or the path doesn't
exist, run:
```
python -c "import cmdstanpy; cmdstanpy.install_cmdstan()"
```
and re-run the verification command above.

Then confirm Prophet itself runs end-to-end (this also warms up its first-run
compilation step, which can take a little while the very first time):
```
python -c "
from prophet import Prophet
import pandas as pd
df = pd.DataFrame({'ds': pd.date_range('2024-01-01', periods=10, freq='MS'), 'y': range(10)})
m = Prophet().fit(df)
print('Prophet OK')
"
```

---

## 4. DiCE-ML setup

DiCE-ML (`dice-ml` on PyPI, imported as `dice_ml`) needs no separate backend —
installing the pip package is sufficient. Verify:
```
python -c "import dice_ml; print('dice_ml OK, version', dice_ml.__version__ if hasattr(dice_ml, '__version__') else 'unknown')"
```
The project's `scripts/counterfactual_engine.py` uses `dice_ml.Dice(..., method="random")`
with a fixed `DICE_RANDOM_SEED = 42` for reproducibility — no extra setup needed
beyond the package install.

---

## 5. Ollama installation and model setup

1. Install Ollama:
   ```
   winget install Ollama.Ollama
   ```
   (or download from https://ollama.com for non-Windows platforms).

2. Start the server (if it isn't already running as a background service):
   ```
   ollama serve
   ```

3. Pull the exact model this project uses:
   ```
   ollama pull iKhalid/ALLaM:7b
   ```
   This is SDAIA's Arabic-tuned model (~4 GB). The project's `MODEL_NAME` constant
   in `scripts/advisor_engine.py` is set to `"iKhalid/ALLaM:7b"` — do not substitute
   a different model without updating that constant, since the numeric-fidelity/
   direction guard was tuned and verified against this specific model's output.

4. **RAM requirement (verified this project's own history):** this machine needs
   roughly 7-8 GB of free RAM for `iKhalid/ALLaM:7b` to run without severe disk
   thrashing. Close other memory-heavy applications before running Layer 3.

5. Confirm the model is actually responding (not just installed) — this does a
   real generation call, not just a ping:
   ```
   ollama run iKhalid/ALLaM:7b "قل مرحبا بجملة واحدة"
   ```
   You should get a short Arabic response back within a reasonable time. If it
   hangs for minutes with no output, see the troubleshooting section below.

6. Lower-level server check (what `ollama_healthcheck.py` uses internally) — this
   only confirms the server process is up, not that the model itself responds:
   ```
   curl http://localhost:11434/api/tags
   ```
   Should return a JSON list of installed models, not a connection error.

---

## 6. Running the pre-recording / pre-demo health check

**Windows-only:** `scripts/ollama_healthcheck.py` shells out to `powershell` to
find and kill `ollama`/`llama-server` processes when the server needs a restart
(see section 1's OS note). On macOS/Linux, the automatic-restart step will fail
— if you're on a non-Windows machine, expect that specific step not to work and
restart Ollama manually (`ollama serve`) instead; the rest of the script
(pinging the server and running the narration smoke tests) is not
Windows-specific.

This is the project's own automated way to confirm the entire Layer 3 pipeline
(server + model + guard) is actually working, not just installed:

```
python scripts/ollama_healthcheck.py
```

What it does: pings the Ollama server; if unresponsive, kills any
`ollama`/`llama-server` processes and restarts `ollama serve` cleanly (a known
fix for zombie-process RAM issues documented in this project's history); then
runs one real narration call through each of `forecast`, `counterfactual`, and
`top_categories` (guard included) and prints PASS/FAIL with timing for each.

**A passing run looks like this:**
```
Checking Ollama server at http://localhost:11434 ...
Ollama server is responsive.
Running smoke test (forecast, counterfactual, top categories)...
  [PASS] forecast (17.0s, attempts=1)
  [PASS] counterfactual (42.3s, attempts=1)
  [PASS] top_categories (25.6s, attempts=2)

ALL CHECKS PASSED (model: iKhalid/ALLaM:7b). Safe to start recording.
```
Exit code `0` means safe to proceed; any non-zero exit code means something in
the pipeline needs fixing before recording/demoing — the printed error under the
failing `[FAIL]` line tells you which guard check rejected the output.

---

## 7. Project folder structure and self-containment rule

**Critical rule: this entire project must be 100%
self-contained inside this project folder.** No script reads from or depends on
any path outside it. Every script anchors its paths via
`ROOT_DIR = Path(__file__).resolve().parent.parent` and builds paths from there
— never from the current working directory.

Required layout after setup:
```
<project-root>\
├── README.md
├── SETUP.md
├── data\
│   ├── raw\
│   │   └── transactions.csv        <- MUST exist locally (~59 MB, via Git LFS — see section 1)
│   └── processed\
│       ├── loan_data_clean_SAR_balanced.csv
│       ├── transactions_monthly_clean.csv
│       ├── transactions_monthly_categorized.csv
│       ├── forecast_total.csv
│       ├── forecast_by_category.csv
│       └── demo_backup_narrations.json
├── docs\
├── output\
│   ├── best_model.pkl
│   └── feature_columns.json
└── scripts\
```

**`data/raw/transactions.csv` is not something to skip or substitute.** It's the
real source data `category_engine.py` and `build_transaction_sample.py` depend
on. If it's missing (e.g. Git LFS wasn't pulled), `category_engine.py` and any
script that rebuilds the processed category/forecast CSVs from scratch will fail
or silently work on stale/wrong data. Verify its presence and size per section 1
before doing any pipeline work that touches raw data.

If any script needs to read a file from outside this project folder, that's a
bug — this is a hard self-containment rule, not a style preference.

---

## 8. Running the core pipeline end-to-end

The processed CSVs and trained model already exist in `data/processed/` and
`output/` — you don't need to rebuild them to use the project. These commands
are for rebuilding a stage from scratch (e.g. after a data or logic change).

1. **Category engine** — rebuilds `transactions_monthly_categorized.csv` from raw data:
   ```
   python scripts/category_engine.py
   ```

2. **Forecast engine** — rebuilds `forecast_total.csv` and `forecast_by_category.csv`,
   and exposes `forecast_account(account_number)` for a single account:
   ```
   python scripts/forecast_engine.py
   ```

3. **Model comparison (Layer 2a)** — retrains and compares Logistic Regression /
   Random Forest / Gradient Boosting, saves the best model to `output/best_model.pkl`:
   ```
   python scripts/model_comparison.py
   ```

4. **Counterfactual engine (Layer 2b)** — runs DiCE against a couple of sample
   ineligible profiles and prints their counterfactual paths:
   ```
   python scripts/counterfactual_engine.py
   ```

5. **Advisor engine (Layer 3)** — runs a full narration pass (forecast +
   counterfactual + top-categories + the fixed Q&A set) for one sample account,
   requires Ollama running with the model pulled (see section 5):
   ```
   python scripts/advisor_engine.py
   ```
   A successful run ends with `All 5 output contract tests passed.`

6. **Health check** — confirms the whole Layer 3 chain is demo-ready (see section 6):
   ```
   python scripts/ollama_healthcheck.py
   ```

There is currently no single "run everything" script — each stage above is run
independently, in the order Layer 1 → Layer 2a → Layer 2b → Layer 3.

---

## 9. Running the web app (frontend + FastAPI bridge)

As of 2026-07-10 the React frontend talks to the Python engines through a FastAPI
bridge. Running the app is a **two-process** setup — a backend and a frontend, each
in its own terminal.

### 9.1 Backend — the FastAPI bridge (`server.py`)

`server.py` lives at the **project root** (not in `scripts/`). It must be started
from the project root; running `python server.py` from any other folder gives
`[Errno 2] No such file or directory` because Python can't find the file.

Two ways to start it:

```
# Option A — the launcher (recommended; it cd's to the right place for you)
powershell -ExecutionPolicy Bypass -File "run_backend.ps1"

# Option B — plain Python (you MUST be in the project root first)
cd "C:\Users\Moath\OneDrive - Islamic University of Madinah\Desktop\AMD-master11"
python server.py
```

`run_backend.ps1` anchors itself to its own folder via `$PSScriptRoot`, checks that
`server.py` and `python` are present, warns if Ollama isn't up, then launches
Uvicorn. A healthy start prints `Uvicorn running on http://127.0.0.1:8000`.

**Ollama must be running** (`ollama serve`, model `iKhalid/ALLaM:7b` pulled — see
section 5): the `/api/individuals/eligibility` and `/api/individuals/chat` endpoints
make live ALLaM calls. If Ollama is down they fall back to the verified backup text
in `demo_backup_narrations.json` rather than failing, but you won't get live
narration.

Quick check the backend is up:
```
curl http://localhost:8000/api/health
```
Should return `{"status":"ok"}`.

### 9.2 Frontend — the Vite dev server

```
cd frontend
npm install        # first time only (node_modules is gitignored)
npm run dev        # serves http://localhost:5173
```

Vite proxies every `/api/...` request to `http://localhost:8000` (configured in
`frontend/vite.config.ts`), so the browser talks to the bridge with no CORS setup.
Open `http://localhost:5173` once both processes are running.

### 9.3 What's live vs. still mock

- **Individual-mode screens are LIVE** (`USE_MOCK = false` in
  `frontend/src/lib/api.ts`): dashboard/analysis, eligibility (real DiCE paths +
  live ALLaM narration), and individual chat.
- **Business/SME screens are LIVE too** (`USE_MOCK_BUSINESS = false`): dashboard,
  readiness (SME engine — cash-flow forecast, gap detection, readiness score, timing),
  and business chat (live SME ALLaM advisor). Backed by `scripts/sme_engine.py` +
  the synthetic persona from `scripts/generate_mock_data.py` (regenerate with
  `python scripts/generate_mock_data.py` if the SME CSVs are missing).
- To run the whole UI fully offline on mock data (no backend at all), set both
  `USE_MOCK = true` and `USE_MOCK_BUSINESS = true` in `frontend/src/lib/api.ts`.

Full inventory of what's live, what's a documented proxy, and what's still missing:
`docs/Frontend_Backend_Integration_Report.md`.

---

## 10. Common errors and their fixes (only ones actually encountered in this project)

**Ollama server becomes unresponsive after several consecutive requests**
Documented repeatedly during Layer 3 development (4+ times). Root cause not
identified (possibly a resource/socket leak under sustained sequential load in
this Ollama version). Fix that has always worked: kill all Ollama processes and
restart cleanly, rather than just restarting the same process:
```
powershell -Command "Get-Process -Name 'ollama*','llama*' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"
ollama serve
```
`scripts/ollama_healthcheck.py` does this automatically when it detects the
server isn't responding.

**Free RAM drops far below the ~7-8 GB `iKhalid/ALLaM:7b` needs, with no new
programs opened**
Confirmed cause: leaked "zombie" `llama-server` processes left over from
repeated model switching, silently consuming RAM. Fix: the same full-kill
command above immediately reclaims the RAM. Verified directly — RAM returned to
the expected ~7.9 GB free after the kill.

**`Importing plotly failed. Interactive plots will not work.`**
Not an error — see section 2. `plotly` is an optional Prophet dependency not
installed in this project; nothing here depends on it.

**A narration call returns `"narration": null` with an error message**
This is the guard (`_validate_narration()` / `_validate_direction_claims()` in
`scripts/advisor_engine.py`) correctly rejecting untrustworthy model output
(fabricated number, wrong script, wrong direction word, etc.) after 3 retry
attempts — not a setup problem. Re-run `ollama_healthcheck.py` to see which
specific check is failing.

**A counterfactual narration takes 1-2.5 minutes instead of the usual ~1 second**
DiCE's random search can occasionally take much longer for certain customer
profiles before finding a feasible path. A 5-second timeout with a deterministic
closed-form fallback solver handles this in the current version of
`scripts/counterfactual_engine.py` — this is a live-demo timing risk to be aware
of, not a setup misconfiguration.

---

## 11. "You're ready" checklist

- [ ] Python 3.11+ installed and on PATH (`python --version` works)
- [ ] Repo cloned, `git lfs install` + `git lfs pull` run
- [ ] `data/raw/transactions.csv` exists and is ~59 MB (not a small pointer file)
- [ ] `pip install pandas numpy scikit-learn prophet dice-ml joblib matplotlib` completed with no errors
- [ ] `python -c "import cmdstanpy; print(cmdstanpy.cmdstan_path())"` prints a valid path
- [ ] `python -c "import dice_ml"` runs with no error
- [ ] Ollama installed, `ollama serve` running (or running as a service)
- [ ] `ollama pull iKhalid/ALLaM:7b` completed
- [ ] `ollama run iKhalid/ALLaM:7b "قل مرحبا بجملة واحدة"` returns a real Arabic response
- [ ] `python scripts/ollama_healthcheck.py` prints `ALL CHECKS PASSED` and exits 0
- [ ] `python scripts/advisor_engine.py` prints `All 5 output contract tests passed.`
- [ ] Backend starts: `run_backend.ps1` (or `python server.py` from root) → `curl http://localhost:8000/api/health` returns `{"status":"ok"}`
- [ ] Frontend starts: `cd frontend && npm install && npm run dev` → `http://localhost:5173` loads, and the dashboard/eligibility screens show live data

If every box above is checked, the project is fully operational end-to-end.
