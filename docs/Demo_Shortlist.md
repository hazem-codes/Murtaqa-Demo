# Murtaqa — Demo Shortlist (judged run)

> Curated 2026-07-13. Every account below was smoke-tested end-to-end on the live engines:
> overview, transactions, eligibility, counterfactual paths, advisor narration, and chat.
> All numbers verified against `scripts/sama_rules.py`. Navigate to any of them with the
> account browser (the account button in the top nav).

---

## Individuals (8)

| # | Account | Profile | Numbers | Why it's demo-worthy |
|---|---|---|---|---|
| 1 | **100000009** ⭐ | 50, employee, **mortgage**, bracket 2 | DBR **41% / 33.33%** ✗ · total **62% / 65%** ✓ · 3 paths | **THE ANCHOR.** Fails the salary cap while *passing* the total cap — the single clearest proof that the two SAMA ratios are different checks. Narration is **pre-baked → instant** (0.02s). Start here. |
| 2 | 100000012 | 38, employee, renting, bracket 2 | DBR **16% / 33.33%** ✓ · ceiling **210,000 ر.س** | Clean, unambiguous **pass**. Shows the "you're eligible, here's your headroom" side of the product. |
| 3 | 100000008 | 43, employee, renting, bracket 2 | DBR **37% / 33.33%** ✗ · 3 DiCE paths | The strongest **"here's exactly how to fix it"** story: no mortgage, so one ratio, one clear breach, three concrete DiCE routes back. Top spend: groceries. |
| 4 | 100000005 | 57, **retired**, renting | DBR **32% / 25%** ✗ · 3 paths · narration ✓ | **Proves the retiree fix.** The 25% cap (not 33.33%) is what fails him — and the advisor narrates it correctly, which it could not do before today. |
| 5 | 100000443 | 41, employee, **mortgage**, bracket 2 | DBR **49% / 33.33%** ✗ · total **74% / 65%** ✗ | The **contrast to #1**: this one breaches *both* caps. Put next to 100000009 it shows the engine distinguishing "one problem" from "two problems". |
| 6 | 100000133 | 62, **retired**, renting | DBR **41% / 25%** ✗ · 3 paths | A deep breach against the tightest cap. Also one of the accounts DiCE's search can time out on — the closed-form SAMA fallback still returns a real, verified path, so it **never** dead-ends. |
| 7 | 100000002 | 32, employee, mortgage, **bracket 3** | DBR **23% / 33.33%** ✓ · total **45% / 65%** ✓ · income **47,763 ر.س** | High earner, eligible, **groceries 6,216 ر.س/mo** — very different forecast and spending mix from the others. Good for the Layer 1 story. |
| 8 | **100000060** ☕ | **25**, employee, renting | DBR **42% / 33.33%** ✗ · 3 paths | Youngest persona — thin obligations but an over-sized financing request. **Also the Coffee Index spotlight:** one path cuts the card min payment, and the behavioral nudge shows that trimming **55% of entertainment (394 ر.س)** covers the **218 ر.س** reduction. |

⭐ = has pre-baked ALLaM narration (instant). Every other account generates a **live** narration
(~2-16s) — it appears after the numbers, which render immediately.

---

## SMEs (6)

| # | Account | Profile | Numbers | Why it's demo-worthy |
|---|---|---|---|---|
| 1 | **300000001** ⭐ | micro · trade · 5 staff | score **72** "شبه جاهزة" · gap **أغسطس** · settlement **185,000 ر.س** · runway 2.2mo | **THE ANCHOR.** The full liquidity-gap story: healthy today, but a scheduled supplier settlement tips August negative. Plans are **pre-baked AI → instant**. |
| 2 | 300000030 | **medium** · trade | score **100** "جاهزة" · no gap | A clean, fully-ready business — the positive control. Also covers the **medium** tier. |
| 3 | 300000005 | **small** · manufacturing | score **100** "جاهزة" · no gap | Healthy **small** manufacturer — covers the third Kafalah tier and a non-trade sector. |
| 4 | 300000012 | micro · services · **distressed** | score **0** "غير جاهزة" · gap **يوليو** · COGS **67%** | A genuinely failing business: negative cash flow, immediate gap. Proves the engine says **no** when it should. |
| 5 | 300000035 | small · trade · healthy | score **100** · **COGS 79%** | The most **cost-of-goods-heavy** business in the pool — showcases that `cogs_suppliers` produces realistic trade margins rather than a fantasy 60% net. |
| 6 | 300000063 | micro · trade · gap-risk | score **72** · gap **أغسطس** · settlement **161,640 ر.س** · **COGS 76%** | COGS-heavy **and** carries a real forecast gap — proves 300000001's story isn't a one-off special case baked into the demo. |

⭐ = pre-baked AI action plans (instant). The others serve the templated playbook, grounded in
their **own** real numbers (a live AI plan generation takes ~60-100s, too slow to browse).

---

## Notes for the live run

- **Nothing dead-ends.** Every ineligible individual now returns at least one verified path
  (0 no-feasible-path accounts across 150 tested). If DiCE's search times out, a closed-form
  SAMA solution takes over — same guarantees, no fabricated numbers.
- **The LLM never blocks a screen.** Numbers render instantly; the advisor narration streams in
  after. The two anchor accounts are pre-baked, so they are instant end-to-end.
- **A judge clicking freely is safe.** The full 1000/500 pool was walked; no screen errors, no
  NaN, and every displayed number reconciles to `sama_rules`.
- **Two "so-what" features (2026-07-15).** The **Coffee Index** behavioral nudge fires on
  `100000060` (☕), connecting Layer-1 spending to a Layer-2 path. The **Jargon Translator** `i`
  tooltips (on every eligibility metric tile) explain each ratio in plain Arabic using the user's
  own numbers — both instant, both fabrication-proof.
