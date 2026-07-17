/* ============================================================================
   Realistic mock transaction ledger (individuals).

   Our dataset provides REAL aggregate spend per category per month (e.g. dining
   = 520 ر.س). This utility "explodes" each real category aggregate into a list
   of merchant-level line items that SUM BACK EXACTLY to the real total, using a
   localized dictionary of Saudi merchants. The aggregate is real; the per-line
   split (merchant, amount, day) is illustrative — a documented presentational
   proxy, deliberately kept in the frontend so the Python engines stay held to
   the project's no-fabrication golden rule.

   Deterministic: seeded from the account number, so a given persona always
   produces the same ledger (no drift between renders/reloads), and switching
   persona regenerates it.
   ============================================================================ */

import type { CategorySlice, TransactionRow } from "./api";

/** Saudi merchants per category (keyed by the Arabic category label the API returns). */
const MERCHANTS: Record<string, string[]> = {
  "المطاعم والمقاهي": ["هاف مليون", "دانكن", "البيك", "ماكدونالدز", "ستاربكس", "شاورمر"],
  "البقالة والتموين": ["بنده", "العثيم", "أسواق التميمي", "الدانوب", "كارفور"],
  "التنقل والوقود": ["أوبر", "كريم", "محطة الدريس", "ساسكو", "أرامكو"],
  "الكهرباء والماء والغاز": ["شركة الكهرباء", "شركة المياه الوطنية", "الغاز"],
  "الإنترنت والجوال": ["stc", "موبايلي", "زين"],
  "الصحة والتأمين": ["صيدلية النهدي", "صيدلية الدواء", "بوبا للتأمين", "مستوصف"],
  "الاشتراكات": ["نتفليكس", "شاهد VIP", "آبل", "يوتيوب بريميوم"],
  "التسوق والملابس": ["نمشي", "سنتربوينت", "ماكس", "H&M", "آيهرب"],
  "الترفيه": ["VOX سينما", "بلايستيشن ستور", "ملاهي", "دخول فعالية"],
  "الإيجار": ["إيجار الشقة"],
};

/** Category -> icon slug (mirrors the backend CATEGORY_ICON map; falls back to shopping). */
const ICONS: Record<string, string> = {
  "المطاعم والمقاهي": "food",
  "البقالة والتموين": "shopping",
  "التنقل والوقود": "shopping",
  "الكهرباء والماء والغاز": "bill",
  "الإنترنت والجوال": "bill",
  "الصحة والتأمين": "shopping",
  "الاشتراكات": "play",
  "التسوق والملابس": "shopping",
  "الترفيه": "play",
  "الإيجار": "home",
};

/** Single-payment categories are billed once, not split across merchants. */
const SINGLE_PAYMENT = new Set(["الإيجار", "الكهرباء والماء والغاز", "الإنترنت والجوال"]);

const AR_MONTH = "يونيو"; // matches the screen header ("يونيو 2025")

/* ── Tiny deterministic PRNG (xmur3 seed + mulberry32) — no deps ───────────── */
function seedFrom(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Split a real total into `n` positive integer parts that sum EXACTLY to it. */
function splitAmount(total: number, n: number, rand: () => number): number[] {
  if (n <= 1) return [Math.round(total)];
  const weights = Array.from({ length: n }, () => 0.4 + rand()); // avoid near-zero parts
  const sum = weights.reduce((s, w) => s + w, 0);
  const parts = weights.map((w) => Math.max(1, Math.round((w / sum) * total)));
  const drift = Math.round(total) - parts.reduce((s, p) => s + p, 0);
  parts[parts.length - 1] = Math.max(1, parts[parts.length - 1] + drift);
  return parts;
}

/**
 * Explode real per-category aggregates into a merchant-level ledger for one persona.
 * `income` (real gross salary) is added as a single salary credit row.
 */
export function buildLedger(
  account: string,
  categories: CategorySlice[],
  income: number
): TransactionRow[] {
  const rand = mulberry32(seedFrom(account));
  const rows: Omit<TransactionRow, "id">[] = [];

  if (income > 0) {
    rows.push({
      name: "راتب شهر يونيو",
      category: "دخل",
      amount: Math.round(income),
      date: `27 ${AR_MONTH}`,
      icon: "income",
    });
  }

  for (const cat of categories) {
    const total = Math.round(cat.amount);
    if (total <= 0) continue;
    const merchants = MERCHANTS[cat.name] ?? [cat.name];
    const icon = ICONS[cat.name] ?? "shopping";
    const maxN = SINGLE_PAYMENT.has(cat.name) ? 1 : Math.min(merchants.length, 4);
    const wantN = maxN <= 1 ? 1 : 2 + Math.floor(rand() * (maxN - 1)); // 2..maxN line items
    // Never ask for more line items than the total has whole riyals — otherwise the parts can't
    // each be >= 1 and still sum exactly to the (small) total.
    const n = Math.max(1, Math.min(wantN, total));
    const parts = splitAmount(total, n, rand);
    const pool = [...merchants];
    for (let i = 0; i < parts.length; i++) {
      const merchant = pool.splice(Math.floor(rand() * pool.length), 1)[0] ?? cat.name;
      const day = 2 + Math.floor(rand() * 26); // 2..27 يونيو
      rows.push({ name: merchant, category: cat.name, amount: -parts[i], date: `${day} ${AR_MONTH}`, icon });
    }
  }

  rows.sort((a, b) => dayOf(b.date) - dayOf(a.date)); // newest first
  return rows.map((r, i) => ({ ...r, id: i + 1 }));
}

function dayOf(date: string): number {
  return parseInt(date, 10) || 0;
}

/* ── Filter chips (Financial Analysis) ────────────────────────────────────── */
export const LEDGER_FILTERS = [
  "الكل",
  "المطاعم والمقاهي",
  "البقالة والتموين",
  "التنقل والوقود",
  "أخرى",
] as const;
export type LedgerFilter = (typeof LEDGER_FILTERS)[number];

const NAMED_FILTERS = new Set(["المطاعم والمقاهي", "البقالة والتموين", "التنقل والوقود"]);

/** Apply a chip filter. "أخرى" = anything not in the three named categories (excludes income). */
export function filterLedger(rows: TransactionRow[], filter: LedgerFilter): TransactionRow[] {
  if (filter === "الكل") return rows;
  if (filter === "أخرى")
    return rows.filter((r) => r.category !== "دخل" && !NAMED_FILTERS.has(r.category));
  return rows.filter((r) => r.category === filter);
}
