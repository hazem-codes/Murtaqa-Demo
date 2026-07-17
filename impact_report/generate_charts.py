"""
One-off chart generator for the Murtaqa impact report.
Reads only real, already-computed project data (data/processed/*.csv, plus a live call into
the actual eligibility engine for the before/after example) — nothing here is fabricated.
Run once from the project root: python impact_report/generate_charts.py
"""

import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

ROOT_DIR = Path(__file__).resolve().parent.parent
OUT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR / "scripts"))
sys.path.insert(0, str(ROOT_DIR))

COPPER = "#B5651D"
GOLD = "#D8B991"
POSITIVE = "#3A8F5C"
NEGATIVE = "#C0504D"
INK = "#2B2420"
plt.rcParams.update(
    {
        "font.size": 11,
        "axes.edgecolor": "#DDD3C4",
        "axes.titleweight": "bold",
        "figure.facecolor": "white",
        "axes.facecolor": "white",
    }
)


def savefig(name):
    plt.tight_layout()
    plt.savefig(OUT_DIR / name, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"wrote {name}")


# ── Load real data ───────────────────────────────────────────────────────────
individuals = pd.read_csv(ROOT_DIR / "data" / "processed" / "individuals_profiles.csv")
sme = pd.read_csv(ROOT_DIR / "data" / "processed" / "sme_profiles.csv")
requesters = individuals[individuals["has_active_request"] == 1]

# ── Chart 1: eligible vs ineligible split among the 1,000 financing requesters ──
counts = requesters["eligible_sama"].value_counts().sort_index()
labels = ["Ineligible (fails SAMA DBR caps)", "Eligible (within SAMA DBR caps)"]
values = [counts.get(0, 0), counts.get(1, 0)]
fig, ax = plt.subplots(figsize=(6, 6))
ax.pie(
    values,
    labels=[f"{l}\n{v} customers ({v/sum(values)*100:.0f}%)" for l, v in zip(labels, values)],
    colors=[NEGATIVE, POSITIVE],
    startangle=90,
    wedgeprops={"edgecolor": "white", "linewidth": 2},
    textprops={"fontsize": 10},
)
ax.set_title(f"Eligibility outcome — {len(requesters)} financing requesters")
savefig("01_eligible_vs_ineligible.png")

# ── Chart 2: employment type distribution (all 1,180 individuals) ──────────────
emp_counts = individuals["employment_type"].value_counts()
fig, ax = plt.subplots(figsize=(6, 4.5))
bars = ax.bar(emp_counts.index.str.title(), emp_counts.values, color=[COPPER, GOLD])
for b in bars:
    ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 8, str(int(b.get_height())),
            ha="center", fontsize=10, fontweight="bold")
ax.set_ylabel("Number of personas")
ax.set_title(f"Employment type — all {len(individuals)} individual personas")
ax.spines[["top", "right"]].set_visible(False)
savefig("02_employment_distribution.png")

# ── Chart 3: income bracket distribution ────────────────────────────────────────
bracket_labels = {1: "Bracket 1 (lowest)", 2: "Bracket 2 (mid)", 3: "Bracket 3 (highest)"}
inc_counts = individuals["income_bracket"].map(bracket_labels).value_counts().reindex(
    [bracket_labels[1], bracket_labels[2], bracket_labels[3]]
)
fig, ax = plt.subplots(figsize=(6, 4.5))
bars = ax.bar(inc_counts.index, inc_counts.values, color=COPPER)
for b in bars:
    ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 8, str(int(b.get_height())),
            ha="center", fontsize=10, fontweight="bold")
ax.set_ylabel("Number of personas")
ax.set_title(f"Income bracket — all {len(individuals)} individual personas")
ax.spines[["top", "right"]].set_visible(False)
savefig("03_income_bracket_distribution.png")

# ── Chart 4: SME health archetype breakdown ─────────────────────────────────────
arch_order = ["healthy", "gap_risk", "declining", "distressed"]
arch_colors = {"healthy": POSITIVE, "gap_risk": GOLD, "declining": "#D98A3D", "distressed": NEGATIVE}
arch_counts = sme["health_archetype"].value_counts().reindex(arch_order).fillna(0)
fig, ax = plt.subplots(figsize=(6.5, 4.5))
bars = ax.bar(
    [a.replace("_", " ").title() for a in arch_order],
    arch_counts.values,
    color=[arch_colors[a] for a in arch_order],
)
for b in bars:
    pct = b.get_height() / len(sme) * 100
    ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 3, f"{int(b.get_height())}\n({pct:.0f}%)",
            ha="center", fontsize=9, fontweight="bold")
ax.set_ylabel("Number of businesses")
ax.set_title(f"SME financial-health archetype — all {len(sme)} businesses")
ax.spines[["top", "right"]].set_visible(False)
savefig("04_sme_health_archetype.png")

# ── Chart 5: eligibility rate by employment type (a genuine data insight) ──────
elig_by_emp = requesters.groupby("employment_type")["eligible_sama"].mean() * 100
fig, ax = plt.subplots(figsize=(6, 4.5))
bars = ax.bar(elig_by_emp.index.str.title(), elig_by_emp.values, color=[COPPER, GOLD])
for b in bars:
    ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 1, f"{b.get_height():.0f}%",
            ha="center", fontsize=10, fontweight="bold")
ax.set_ylabel("Eligibility rate (%)")
ax.set_ylim(0, 100)
ax.set_title("Eligibility rate by employment type (among requesters)")
ax.spines[["top", "right"]].set_visible(False)
savefig("05_eligibility_rate_by_employment.png")

# ── Chart 6: before/after DBR for a real ineligible persona going through a
#    strategy path (account 100000009 — the project's demo anchor persona) ────
import server as srv  # the real FastAPI bridge — same engine the live app uses

anchor = individuals[individuals["accountNumber"] == 100000009].iloc[0]
current_dbr = round(float(anchor["salary_dbr"]) * 100, 1)
cap = round(float(anchor["salary_cap"]) * 100, 2)
paths = srv._strategy_paths(100000009, anchor.to_dict())
computed_path = next(p for p in paths if p.get("kind") == "computed" and p.get("targetDbr") is not None)
target_dbr = computed_path["targetDbr"]

fig, ax = plt.subplots(figsize=(6, 5))
bars = ax.bar(["Before\n(as requested)", "After\n(strategy applied)"], [current_dbr, target_dbr],
              color=[NEGATIVE, POSITIVE], width=0.5)
ax.axhline(cap, color=INK, linestyle="--", linewidth=1.3)
ax.text(1.42, cap - 2.3, f"SAMA cap: {cap}%", va="center", fontsize=9, color=INK)
for b, v in zip(bars, [current_dbr, target_dbr]):
    ax.text(b.get_x() + b.get_width() / 2, v + 1.8, f"{v}%", ha="center", fontsize=12, fontweight="bold")
ax.set_ylabel("Salary DBR (%)")
ax.set_ylim(0, max(current_dbr, cap) + 10)
ax.set_title("Real before/after example — persona 100000009")
ax.spines[["top", "right"]].set_visible(False)
ax.set_xlim(-0.5, 2.0)
savefig("06_dbr_before_after_example.png")

print("\nAll charts generated from real project data.")
print(f"Demo persona 100000009: {current_dbr}% -> {target_dbr}% (cap {cap}%), "
      f"ceiling after path: {computed_path.get('targetAmount')} SAR")
