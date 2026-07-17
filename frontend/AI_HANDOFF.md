# Murtaqa UI — AI Handoff & Project Guide

> Give this file to any AI assistant (or a new developer) and it will understand the whole
> frontend project without reading every file first. It explains what the project is, the tech
> stack, how to run it, the folder layout, the design system, every screen, the mock-data model,
> and the important conventions/gotchas.

---

## 1. What this project is

**Murtaqa (مُرتقى)** is a **frontend UI prototype** for a Saudi FinTech product: a personal &
SME **financing‑eligibility engine and counterfactual advisor** built around Saudi Central Bank
(SAMA) responsible‑lending ideas (debt‑burden ratio / DBR, financing ceilings, smart improvement
paths).

**Status update (2026-07-10) — this UI is now connected to a real backend.** It is part of the
same repo as the Python engines (one level up, at the project root). A FastAPI bridge (`server.py`)
runs Prophet forecasting + DiCE counterfactuals + a local Ollama Arabic LLM (ALLaM), and **both the
individual and business (SME) screens now read live engine output** through `src/lib/api.ts`
(`USE_MOCK = false`, `USE_MOCK_BUSINESS = false`). Vite proxies `/api` → `http://localhost:8000`.

`src/lib/data.ts` mock still exists as the **offline fallback** (flip `USE_MOCK`/`USE_MOCK_BUSINESS`
back to `true` to run with no backend) and as the type source for the API contract. Some UI fields
are **documented proxies** (not raw engine output) — see
`../docs/Frontend_Backend_Integration_Report.md` for the full live-vs-proxy inventory. Screens read
through the `api` object + `useApi` hook, never from `data.ts` directly (except where noted).

---

## 2. Tech stack (locked)

| Concern | Choice |
|---|---|
| Build tool | **Vite 6** (NOT Next.js — there is no `app/` or `pages/`, no SSR, no `"use client"`) |
| UI library | **React 18** + **TypeScript 5.6** |
| Styling | **Tailwind CSS v4** (via `@tailwindcss/vite`), config-less, tokens defined in CSS |
| Animation | **`motion`** (Framer Motion's successor) — imported as `motion/react` |
| Icons | **`lucide-react`** |
| Charts | **`recharts`** |
| Class merging | **`clsx` + `tailwind-merge`** exposed as `cn()` in `src/lib/utils.ts` |

> If someone asks for "Next.js code," adapt it to this Vite/React setup instead — porting to real
> Next.js would break the app.

---

## 3. How to run it

The frontend lives in the **`frontend/`** folder at the project root (this file is inside it).

```bash
# Frontend (from the frontend/ folder)
npm install        # first time only
npm run dev        # start Vite dev server (usually http://localhost:5173)
npm run build      # production build (tsc + vite build)
npm run typecheck  # tsc --noEmit  (run this after any code change)
```

For the screens to show **live** data, also start the backend bridge in a separate terminal
(from the project root — one level up):

```bash
python server.py   # FastAPI bridge on http://localhost:8000 (needs Ollama + iKhalid/ALLaM:7b)
```

Vite's dev-server proxy (`vite.config.ts`) forwards `/api/*` to `:8000`. Without the backend
running, live API calls fail and screens show their error state — either start `server.py` or set
`USE_MOCK`/`USE_MOCK_BUSINESS` back to `true` in `src/lib/api.ts` for offline mock. Full setup:
`../SETUP.md` section 9.

---

## 4. Folder structure

```
src/
├── main.tsx                     App entry → renders <App/> into #root
├── App.tsx                      Root: screen router via useState, wraps shell screens in AppShell
├── animations/
│   └── variants.ts              Shared motion variants + EASE curves (fadeUp, stagger, slideIn…)
├── components/
│   ├── Button.tsx               Variants: primary | secondary | ghost | dark; sizes sm|md|lg
│   ├── Card.tsx                 Base surface (white, hairline border, warm shadow), optional reveal/hover
│   ├── Modal.tsx                Premium centered modal (backdrop blur, Esc to close, scroll lock)
│   ├── FullScreenLoader.tsx     Full-screen Pearl loading overlay (pulsing logo + gold progress bar)
│   ├── Logo.tsx                 "مُرتقى" wordmark chip (copper on light, gold on dark)
│   ├── CountUp.tsx              Animates a number 0→value when scrolled into view
│   ├── EligibilityRing.tsx      Self-drawing circular gauge for an eligibility %
│   ├── ConcentricRings.tsx      Layered radial bars for top spending categories
│   ├── FloatingBadge.tsx        Circular icon badge that floats half-outside a card edge
│   ├── StatCard.tsx             KPI tile
│   ├── Sparkle.tsx / Stagger.tsx  Decorative sparkle + staggered-reveal wrappers
│   ├── charts/                  Recharts wrappers: IncomeSpendingChart, SpendingDonut,
│   │                            MonthlySpendingBars, ChartTooltip
│   └── layout/
│       └── AppShell.tsx         The app chrome: TOP navigation bar + mobile drawer + main slot
├── lib/
│   ├── data.ts                 ★ ALL mock data lives here (see §7)
│   ├── chartColors.ts          CHART hex tokens + CATEGORY_COLORS palette
│   └── utils.ts                cn(), formatNumber(), formatSAR()
├── screens/                     One file per screen (see §6)
│   ├── Landing.tsx  Login.tsx  Dashboard.tsx  Analysis.tsx
│   ├── Eligibility.tsx  Chat.tsx  Profile.tsx
└── styles/
    ├── theme.css               ★ Design tokens (colors, radii, shadows) + Tailwind @theme mapping
    ├── fonts.css               IBM Plex Sans Arabic
    └── index.css               Entry that imports the others + Tailwind
```

---

## 5. Design system

- **Language/direction:** Arabic, **RTL-first**. Containers use `dir="rtl"`. Use **logical
  properties** in Tailwind: `start`/`end` (not left/right), `ps`/`pe`, `ms`/`me`. In RTL,
  `start` = right, `end` = left. Use physical `right`/`left` only when you deliberately want a
  fixed visual side (rare).
- **Font:** IBM Plex Sans Arabic. Numbers use the `.tnum` class for tabular alignment.
- **Aesthetic:** warm, premium, minimal — cream/off-white surfaces, royal-brown/copper text,
  espresso dark panels, matte-gold accents. Light mode only.

### Core theme tokens (`src/styles/theme.css`, exposed as Tailwind colors)

| Token | Hex | Tailwind class | Use |
|---|---|---|---|
| cream | `#FAF8F4` | `bg-cream` | page background |
| cream-deep | `#F4EEE6` | `bg-cream-deep` | recessed panels/tiles |
| card | `#FFFFFF` | `bg-card` | elevated cards |
| line | `#EBE4D9` | `border-line` | hairline borders |
| ink | `#23303C` | `text-ink` | primary text (deep navy) |
| ink-soft | `#6B6154` | `text-ink-soft` | secondary text |
| copper | `#8B5E3C` | `text-copper`/`bg-copper` | brand primary |
| copper-tint | `#F3EBE1` | `bg-copper-tint` | soft copper wash |
| espresso | `#23303C` | `bg-espresso` | dark surfaces (nav, hero panels) |
| gold | `#D8B991` | `text-gold` | accent on dark surfaces |
| positive/negative/warn | green/red/amber | `text-positive` etc. | semantic states |

Also: `--radius*`, `--shadow-sm/md/lg/xl` (warm-tinted), and keyframes `float`, `pulseRing`,
`shimmer`.

> **Palette rule the owner set:** keep the existing token palette. Some newer one-off components
> use bespoke hexes on purpose (e.g. `FullScreenLoader` uses Pearl `#F4F1EA`, Royal Brown
> `#3D220A`, Matte Gold `#D4AF37`). That's intentional per request; don't "normalize" them away.

### Chart palette (`src/lib/chartColors.ts`)

`CATEGORY_COLORS` (index order = السكن، الغذاء، الفواتير، التسوق، الترفيه), tuned for high contrast:

```
#9B7050 (السكن - soft mocha)   #C5A570 (الغذاء - tan)   #3A4B56 (الفواتير - slate/navy)
#52796F (التسوق - teal)         CHART.green (الترفيه)
```

### Animation conventions

- Import from `motion/react`. Shared variants live in `src/animations/variants.ts`
  (`fadeUp`, `staggerContainer`, `staggerItem`, `slideInStart/End`, `EASE`, `inView`).
- Standard easing: `EASE = [0.22, 1, 0.36, 1]`.
- Sliding "active pill" selectors use `layoutId` + a spring for smooth movement.
- Entry reveals use `whileInView` with `viewport={inView}` (`{ once: true, amount: 0.25 }`).
- `prefers-reduced-motion` is respected globally in `theme.css`.

---

## 6. Screens & navigation

**Routing is state-based, not URL-based.** `App.tsx` holds `const [screen, setScreen]` of type
`Screen` (`"landing" | "login" | "dashboard" | "analysis" | "eligibility" | "chat" | "profile"`)
and passes `onNavigate` down. `landing` and `login` render full-bleed; the other five render inside
`<AppShell>`.

| Screen | Purpose |
|---|---|
| **Landing** | Marketing page. Has a **navbar segment toggle "الأفراد / المنشآت"** (`mode` state) that swaps the hero copy, the hero eligibility card, and the features/services between B2C (personal finance) and B2B (SME: AI cash-flow forecasting + SME eligibility). Large section spacing (`py-16 md:py-24 lg:py-32`). Content swaps animate via `AnimatePresence` keyed by `mode`. |
| **Login** | Demo login modal-style card. A 2-tab segment control (**الأفراد / الأعمال**, each 50% width via `flex-1`) with a sliding copper pill. "الدخول كضيف" → dashboard. |
| **Dashboard** | Bento grid of KPIs. Starts with a **"اربط حسابك البنكي"** (connect bank) card; clicking reveals the full grid (eligibility ring with personal/mortgage toggle, income-vs-spending chart, category rings, donut, advisor recommendation, mission progress, savings insight). |
| **Analysis** | Financial analysis: income/spending summary tiles, charts (`IncomeSpendingChart`, `SpendingDonut`, `MonthlySpendingBars`), recent transactions list. |
| **Eligibility** | ★ The most feature-rich screen (see §8). Eligibility overview + 3 improvement "paths" + Details modal + an "Active Plan" state. |
| **Chat** | "المستشار المالي الذكي". Suggested-question chips; **each question returns its own answer** (`advisorReplies` map) with a fallback (`advisorDefaultReply`) for free-typed input. Fake typing indicator. |
| **Profile** | User identity card + settings menu + logout. |

### AppShell (`components/layout/AppShell.tsx`)

The shared chrome for the five in-app screens. It is a **TOP navigation bar** (espresso/dark):
logo on the right (RTL start), centered nav links with an animated active pill (`layoutId`),
notifications + user avatar on the left (end). Below it is a full-width `<main>`. A hamburger opens
a mobile drawer on small screens.

---

## 7. Mock-data model (`src/lib/data.ts`)

Everything the UI shows comes from here. Key exports:

- `user` — name, initial, segment, bank, account.
- `kpis` — income, spending, commitments, loans, savingsRate.
- `incomeSpendingData`, `spendingCategories`, `transactions` — chart/list data.
- `eligibility` — `{ personal: 68, mortgage: 52, metrics: [...] }`. `metrics` shows on the
  Eligibility overview: **نسبة الالتزامات (42٪)**, **المبلغ المتاح حالياً (50,000 ر.س)**,
  **السنوات الائتمانية (3 سنوات)**. (Simah score was intentionally removed.)
- `currentDbr = 42`, `currentAvailable = 50000` — baselines for the Eligibility screen.
- `EligibilityPath` interface + `eligibilityPaths[]` — the 3 improvement paths. Each path has:
  `id, title, summary, steps[], impact (%), duration, difficulty (سهل|متوسط|صعب),
  targetDbr, targetEligibility, targetAmount, pros[], cons[], timeline[]`.
  Each `timeline` step is `{ month, title, detail, advice }` where **`advice`** feeds the
  per-step advisor popover.
  Numbers scale monotonically with difficulty (bigger effort → lower DBR → higher eligibility →
  bigger financing ceiling):
  - سهل · نقل وتوحيد المديونيات → 100,000 ر.س · +15% · DBR 33%
  - متوسط · الادخار والسداد المبكر → 120,000 ر.س · +20% · DBR 30%
  - صعب · إعادة هيكلة الالتزامات → 150,000 ر.س · +25% · DBR 28%
- `initialChatMessages`, `suggestedQuestions`, `advisorReplies` (per-question map),
  `advisorDefaultReply` — the Chat screen.
- `services`, `segments`, `trustStats` — Landing content (B2C). B2B/business content lives
  inline in `Landing.tsx` (`businessServices` + `modeContent`).

`src/lib/utils.ts`: `formatSAR(15500)` → `"15,500 ر.س"`, `formatNumber`, `cn`.

---

## 8. Eligibility screen deep-dive (`src/screens/Eligibility.tsx`)

This screen has three interactive layers:

1. **Overview card** — an `EligibilityRing` + description ("أنت مؤهل حالياً للحصول على 50,000 ر.س.
   لرفع سقف التمويل إلى 150,000 ر.س…") + the 3 metric tiles.
2. **3 Path cards** — titled "مسارات تحسين الأهلية وزيادة التمويل". Each card shows steps, a
   **"سقف التمويل الجديد"** amount band, a meta row (difficulty / +impact% / duration), and two
   buttons: **التفاصيل** (opens the Details modal) and **تفعيل المسار** (opens a confirm modal).
   Cards use `h-full flex flex-col` and a single **`mt-auto` bottom group** (amount + meta +
   buttons) so all three cards' bottoms align regardless of step-text length.
3. **Details modal** — pros/cons (two columns), a headline financing-ceiling banner, quick meta
   tiles, and a vertical **month-by-month timeline** (`TimelineStepper`).
4. **Active Plan state** — after confirming activation, the 3 cards are replaced by: a hero stats
   card with a glowing **matte-gold DBR ring** (shows target DBR, e.g. 42%→28%) + 3 stat tiles, a
   dark **"تقدّم الخطة"** progress strip, and a full-width **timeline card**. A **"تغيير المسار"**
   button resets back to the 3 cards.
   - In the Active Plan timeline, each step has a **"✨ لماذا؟"** advisor chip. Clicking it opens
     an **inline popover to the LEFT of the chip** (with a caret pointing at it) explaining why
     that step helps (`step.advice`). Click-away layer closes it.

---

## 9. Reusable components worth knowing

- **`Button`** — `variant` (`primary|secondary|ghost|dark`), `size` (`sm|md|lg`); motion tap/hover.
- **`Card`** — base surface; props `interactive` (hover lift) and `reveal` (scroll fade-in).
- **`Modal`** — `open`, `onClose`, `title`, `subtitle`, `className`; blurred backdrop, Esc-to-close,
  body scroll lock, spring entrance.
- **`FullScreenLoader`** — `fixed inset-0 z-50`, Pearl `#F4F1EA` background, pulsing "مُرتقى" logo
  in Royal Brown `#3D220A`, a slim Matte-Gold `#D4AF37` indeterminate progress bar (keyframe is
  inline/self-contained), and an Arabic `message` prop (default "جاري معالجة البيانات..."). Use it
  with an `isLoading` boolean: `{isLoading && <FullScreenLoader message="…" />}`.
- **`EligibilityRing`** / **`ConcentricRings`** / **`CountUp`** / **`FloatingBadge`** — animated
  data-viz/decorative pieces described in §4.

---

## 10. Conventions & gotchas (read before editing)

- **RTL logical props:** prefer `start/end`, `ps/pe`, `ms/me`. Remember `start` = right.
- **`cn()` uses `tailwind-merge`**, so later classes win on conflicts — safe to override.
- **All figures are mock.** Keep numbers internally consistent across screens (DBR 42% baseline,
  33% employee cap, 50k current → up to 150k, top spend = السكن 35%, savings 37%). If you change one,
  update the related copy/data too.
- **Equal-height card rows** rely on `h-full` + a grid; put shared "pin to bottom" content in an
  `mt-auto` wrapper (see the path cards).
- **Tailwind `space-y-*` beats a child's own `mt-*`** (higher CSS specificity). To reliably add a
  gap for one child, put the margin on an inner element, not the direct space-y child.
- **Two components were written comment-free on purpose** (`FullScreenLoader`, plus the landing
  mode-toggle additions) because the owner asked for zero comments in those. Match that if editing
  them.
- After any change, run **`npm run typecheck`** (and ideally `npm run build`) — the project stays
  green.
- Charts need **real hex values**, not CSS `var()` — that's why `chartColors.ts` mirrors the tokens.

---

## 11. Quick task recipes

- **Change a screen's content/numbers** → edit `src/lib/data.ts` (single source of truth).
- **Add a new in-app screen** → add it to the `Screen` union in `data.ts`, render it in `App.tsx`,
  and add a nav item in `AppShell.tsx`.
- **Trigger the loader on a button** →
  `const [isLoading,setIsLoading]=useState(false)` → on click `setIsLoading(true)` then run the
  task / `setTimeout` → render `{isLoading && <FullScreenLoader/>}`.
- **Add a chart category color** → append to `CATEGORY_COLORS` in `chartColors.ts`.
- **Adjust global look** → `src/styles/theme.css` tokens (affects the whole app).

---

*This is a demo/academic prototype with fully synthetic data — it is not a real financial product
and performs no real banking operations.*
