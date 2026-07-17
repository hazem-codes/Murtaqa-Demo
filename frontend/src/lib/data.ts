/* ============================================================================
   Murtaqa — Mock data.
   As of 2026-07-10 the app reads live data from the FastAPI bridge (see lib/api.ts).
   This file is now the OFFLINE FALLBACK (used when USE_MOCK / USE_MOCK_BUSINESS are
   flipped back to true) and the type source for the API response contract.
   All figures here are illustrative.
   ============================================================================ */

import { CATEGORY_COLORS } from "./chartColors";

export type Screen =
  | "landing"
  | "login"
  | "dashboard"
  | "analysis"
  | "eligibility"
  | "simulator"
  | "savings"
  | "chat"
  | "profile";

/** Which experience the user entered from the login tabs. */
export type UserMode = "individuals" | "business";

export const user = {
  name: "محمد الأحمدي",
  email: "demo_user@murtaqa.sa",
  initial: "م",
  segment: "فئة الأفراد",
  bank: "مصرف الإنماء",
  account: "حساب التوفير",
};

/* ── Banks available for Open Banking connection (Alinma listed first) ─────── */
export const banks = [
  { id: "alinma", name: "مصرف الإنماء", featured: true },
  { id: "alrajhi", name: "الراجحي", featured: false },
  { id: "snb", name: "الأهلي", featured: false },
  { id: "riyad", name: "الرياض", featured: false },
  { id: "sab", name: "ساب", featured: false },
];

/* ── Dashboard KPIs ───────────────────────────────────────────────────────── */
export const kpis = {
  income: 15500,
  spending: 9800,
  commitments: 3200,
  loans: 45000,
  savingsRate: 37, // %
};

/* ── Income vs. Spending (last 6 months) ──────────────────────────────────── */
export const incomeSpendingData = [
  { month: "يناير", income: 14500, spending: 9200 },
  { month: "فبراير", income: 15000, spending: 10100 },
  { month: "مارس", income: 14800, spending: 8900 },
  { month: "أبريل", income: 15200, spending: 9500 },
  { month: "مايو", income: 15000, spending: 11200 },
  { month: "يونيو", income: 15500, spending: 9800 },
];

/* ── Spending by category (donut) — warm monochrome + teal/green accents ──── */
export const spendingCategories = [
  { name: "السكن", value: 35, amount: 3430, color: CATEGORY_COLORS[0] },
  { name: "الغذاء", value: 20, amount: 1960, color: CATEGORY_COLORS[1] },
  { name: "الفواتير", value: 15, amount: 1470, color: CATEGORY_COLORS[2] },
  { name: "التسوق", value: 18, amount: 1764, color: CATEGORY_COLORS[3] },
  { name: "الترفيه", value: 12, amount: 1176, color: CATEGORY_COLORS[4] },
];

/* ── Recent transactions ──────────────────────────────────────────────────── */
export const transactions = [
  { id: 1, name: "مطعم نجد", category: "الغذاء", amount: -180, date: "28 يونيو", icon: "food" },
  { id: 2, name: "راتب شهر يونيو", category: "دخل", amount: 15500, date: "27 يونيو", icon: "income" },
  { id: 3, name: "فاتورة الكهرباء", category: "الفواتير", amount: -320, date: "25 يونيو", icon: "bill" },
  { id: 4, name: "متجر إلكتروني", category: "التسوق", amount: -450, date: "23 يونيو", icon: "shopping" },
  { id: 5, name: "إيجار الشقة", category: "السكن", amount: -3500, date: "20 يونيو", icon: "home" },
  { id: 6, name: "اشتراك رقمي", category: "الترفيه", amount: -55, date: "18 يونيو", icon: "play" },
  { id: 7, name: "محطة وقود", category: "التنقل", amount: -240, date: "16 يونيو", icon: "shopping" },
  { id: 8, name: "صيدلية", category: "الصحة", amount: -130, date: "14 يونيو", icon: "shopping" },
  { id: 9, name: "قسط قرض السيارة", category: "الالتزامات", amount: -1850, date: "10 يونيو", icon: "bill" },
  { id: 10, name: "سوبرماركت", category: "الغذاء", amount: -520, date: "8 يونيو", icon: "food" },
  { id: 11, name: "فاتورة الاتصالات", category: "الفواتير", amount: -210, date: "5 يونيو", icon: "bill" },
  { id: 12, name: "تحويل لحساب الادخار", category: "ادخار", amount: -1500, date: "2 يونيو", icon: "income" },
] as const;

/* ── Eligibility ──────────────────────────────────────────────────────────── */
export const eligibility = {
  personal: 68,
  mortgage: 52,
  metrics: [
    { label: "نسبة الالتزامات", value: "42٪", tone: "warn" as const },
    { label: "المبلغ المتاح حالياً", value: "50,000 ر.س", tone: "neutral" as const },
    { label: "السنوات الائتمانية", value: "3 سنوات", tone: "neutral" as const },
  ],
};

export type DifficultyKey = "سهل" | "متوسط" | "صعب";

/** Current debt-burden ratio (نسبة الالتزامات) baseline used across the paths. */
export const currentDbr = 42;

/** Loan amount the user qualifies for right now (SAR), before any path. */
export const currentAvailable = 50000;

export interface TimelineStep {
  month: string;
  title: string;
  detail: string;
  /** Smart-advisor note: why this step helps (shown in the step popover). */
  advice: string;
}

export interface EligibilityPath {
  id: number;
  title: string;
  summary: string;
  steps: string[];
  impact: number;
  duration: string;
  difficulty: DifficultyKey;
  /** Projected DBR once completed — only on "computed" strategies (null on conditional ones). */
  targetDbr?: number | null;
  targetEligibility?: number;
  /** New financing ceiling (SAR) — only on "computed" strategies (null on conditional ones). */
  targetAmount?: number | null;
  pros: string[];
  cons: string[];
  timeline: TimelineStep[];
  nudge?: string | null;
  ceilingSummary?: string;
  roadmap?: RoadmapStep[];
  /* ── Behavioral-fintech strategy fields (2026-07-16) ── */
  /** Strategy library key (e.g. "fast_track", "debt_consolidation"). */
  strategyKey?: string;
  /** "computed" = engine-computed numbers; "conditional" = real steps, no fabricated numbers. */
  kind?: "computed" | "conditional";
  /** For conditional strategies: the honest "ينطبق إذا…" gate. */
  conditionalNote?: string | null;
  /** Whether the path needs cash from the customer (badge). */
  cashRequired?: boolean;
  /** One-line "what changes" outcome, shown as a badge (not a stepper step). */
  outcome?: string;
  /* ── Super-strategy fields (2026-07-17) ── */
  /** True if this super-strategy stacks multiple actions (shows a "منفعة الدمج" label). */
  combinationBenefit?: boolean;
  /** True if this is the recommended path for the persona's DBR severity. */
  recommended?: boolean;
}

/** One numbered step of a path's execution roadmap (strictly actionable). */
export interface RoadmapStep {
  step_number: number;
  title: string;
  description?: string;
  expected_outcome?: string;
  /** Smart-advisor "لماذا؟" — why this step helps (optional). */
  reason?: string;
  /** Deterministic "كيف؟" — exact banking instructions to do it (optional). */
  how_to?: string;
  /* ── Rich accordion fields (2026-07-17) ── */
  /** Real monthly SAR impact of this step (الأثر المالي). */
  impactSar?: number;
  /** Effort badge: سهل / متوسط / عالٍ. */
  effort?: string;
  /** Execution badge: تنفيذ رقمي فوري / زيارة فرع / … */
  execution?: string;
  /** Checklist of docs/actions (قائمة التحقق). */
  checklist?: string[];
  /** Cost-of-delay note (تكلفة التأخير). */
  costOfDelay?: string;
}

export const eligibilityPaths: EligibilityPath[] = [
  {
    id: 1,
    title: "نقل وتوحيد المديونيات",
    summary: "وحّد قروضك في جهة واحدة ومدّد المدة لخفض قسطك الشهري ونسبة الاستقطاع.",
    steps: [
      "نقل القروض الحالية إلى مصرف الإنماء",
      "زيادة مدة القرض وتقليل القسط الشهري (DBR)",
      "إغلاق البطاقة الائتمانية أو تقليل حدها الائتماني",
    ],
    impact: 15,
    duration: "1–2 شهر",
    difficulty: "سهل",
    targetDbr: 33,
    targetEligibility: 83,
    targetAmount: 100000,
    pros: [
      "أسرع مسار تنفيذاً وبأقل جهد ممكن",
      "يرفع سقف التمويل المتاح إلى 100,000 ر.س",
      "إجراء بسيط لا يتطلب ادخاراً أو انتظاراً طويلاً",
    ],
    cons: [
      "قد تشمل عملية النقل رسوماً إدارية بسيطة",
      "تمديد مدة القرض يزيد إجمالي الفوائد على المدى الطويل",
      "يتطلب موافقة الجهة الممولة الجديدة على النقل",
    ],
    timeline: [
      { month: "الشهر الأول", title: "نقل وتوحيد القروض", detail: "قدّم طلب نقل قروضك الحالية إلى مصرف الإنماء وتوحيدها في قرض واحد.", advice: "توحيد القروض في جهة واحدة يمنحك قسطاً واحداً بفائدة أوضح، ويبسّط التزاماتك ويسهّل خفض نسبة الاستقطاع." },
      { month: "الشهر الأول", title: "تمديد مدة القرض", detail: "أعد جدولة القرض بمدة أطول لخفض القسط الشهري ونسبة الاستقطاع (DBR).", advice: "إطالة مدة القرض تقلّل القسط الشهري، وبالتالي تنخفض نسبة الاستقطاع (DBR) ويرتفع المبلغ المتاح لك للتمويل." },
      { month: "الشهر الثاني", title: "خفض حد البطاقة", detail: "أغلق البطاقة الائتمانية أو قلّل حدها، ثم أعد تقييم أهليتك وسقف تمويلك.", advice: "تحتسب البنوك جزءاً من حد بطاقتك ضمن التزاماتك؛ خفض الحد أو إغلاقها يحسّن نسبة استقطاعك مباشرةً." },
    ],
  },
  {
    id: 2,
    title: "الادخار والسداد المبكر",
    summary: "ادّخر شهرياً ثم سدّد جزءاً من التزاماتك مبكراً لخفض نسبة الاستقطاع.",
    steps: [
      "توفير 1,500 ريال شهرياً لمدة 6 أشهر",
      "عمل سداد مبكر لجزء من التزاماتك الحالية",
      "إعادة تقييم نسبة الاستقطاع (DBR)",
    ],
    impact: 20,
    duration: "6 أشهر",
    difficulty: "متوسط",
    targetDbr: 30,
    targetEligibility: 88,
    targetAmount: 120000,
    pros: [
      "يخفض أصل الدين ويقلّل نسبة الاستقطاع تدريجياً",
      "يبني عادة ادخار صحية دون أي التزامات جديدة",
      "يرفع سقف التمويل المتاح إلى 120,000 ر.س",
    ],
    cons: [
      "يتطلب انضباطاً في الادخار لمدة 6 أشهر كاملة",
      "أثره أبطأ مقارنةً بمسار نقل وتوحيد المديونيات",
      "يحتاج فائضاً شهرياً لا يقل عن 1,500 ريال",
    ],
    timeline: [
      { month: "الأشهر ١–٣", title: "بناء المدخرات", detail: "خصّص 1,500 ريال شهرياً في حساب ادخار منفصل عن مصروفك اليومي.", advice: "تخصيص مبلغ ثابت شهرياً يبني لك سيولة كافية للسداد المبكر دون التأثير على مصروفك الأساسي." },
      { month: "الأشهر ٤–٦", title: "مواصلة الادخار", detail: "أكمل الادخار حتى تجمّع مبلغاً كافياً لسداد جزء من التزاماتك.", advice: "الاستمرار في الادخار يضمن وصولك إلى مبلغ يكفي لخفض أصل الدين بشكل ملموس وليس القسط فقط." },
      { month: "الشهر السادس", title: "سداد مبكر وتقييم", detail: "نفّذ سداداً مبكراً لجزء من التزاماتك، ثم أعد تقييم نسبة الاستقطاع.", advice: "سداد جزء من أصل الدين يقلّل القسط الشهري مباشرةً، فتنخفض نسبة الاستقطاع وترتفع أهليتك." },
    ],
  },
  {
    id: 3,
    title: "إعادة هيكلة الالتزامات",
    summary: "خطة شاملة لخفض الدين وإعادة التفاوض على قروضك مع بناء سجل نظيف — الأعلى أثراً.",
    steps: [
      "سدّد الالتزامات ذات الفائدة الأعلى أولاً",
      "أعد التفاوض على شروط قروضك القائمة مع الجهات الممولة",
      "حافظ على سجل سداد نظيف دون تمويل جديد لمدة 6 أشهر",
    ],
    impact: 25,
    duration: "6–9 أشهر",
    difficulty: "صعب",
    targetDbr: 28,
    targetEligibility: 93,
    targetAmount: 150000,
    pros: [
      "الأعلى أثراً على نسبة الاستقطاع وسقف التمويل بين المسارات",
      "يرفع سقف التمويل المتاح إلى 150,000 ر.س",
      "يبني ملفاً ائتمانياً قوياً يمنحك أفضل شروط تمويل مستقبلاً",
    ],
    cons: [
      "الأطول مدةً والأكثر انضباطاً بين المسارات",
      "يتطلب سيولة كافية لتسريع سداد الالتزامات",
      "لا يمكن التقدّم لأي تمويل جديد خلال الفترة",
    ],
    timeline: [
      { month: "الأشهر ١–٣", title: "ترتيب وسداد الأعلى فائدة", detail: "رتّب التزاماتك وابدأ بسداد الأعلى فائدةً أولاً (طريقة الانهيار الجليدي).", advice: "البدء بالقروض الأعلى فائدة يقلّل إجمالي ما تدفعه من فوائد ويسرّع خفض الدين — وهذا جوهر طريقة الانهيار الجليدي." },
      { month: "الأشهر ٤–٦", title: "إعادة التفاوض", detail: "أعد التفاوض على شروط قروضك القائمة لخفض الأقساط والفوائد.", advice: "التفاوض على شروط أفضل قد يخفض القسط أو نسبة الفائدة، ما ينعكس مباشرةً على نسبة استقطاعك الشهرية." },
      { month: "الأشهر ٧–٩", title: "تثبيت السجل والتقييم", detail: "حافظ على سجل سداد نظيف، ثم أعد تقييم أهليتك وسقف تمويلك.", advice: "الحفاظ على سجل سداد نظيف يرفع ثقة الجهات الممولة بك ويمنحك أفضل سقف تمويل ممكن مستقبلاً." },
    ],
  },
];

/* ── Advisor chat ─────────────────────────────────────────────────────────── */
export const initialChatMessages = [
  {
    id: 1,
    sender: "advisor" as const,
    text: "أهلاً وسهلاً! أنا مستشارك المالي في مُرتقى. بإمكاني تحليل وضعك المالي والإجابة على أسئلتك. كيف يمكنني مساعدتك اليوم؟",
  },
  {
    id: 2,
    sender: "user" as const,
    text: "لماذا لم يُوافَق على طلب تمويلي الأخير؟",
  },
  {
    id: 3,
    sender: "advisor" as const,
    text: "بناءً على تحليل بياناتك، نسبة التزاماتك الشهرية تبلغ 42٪ من دخلك — أعلى من الحد المقبول البالغ 33٪. هذا هو السبب الرئيسي. لدي مسار واضح يمكنه رفع أهليتك خلال 3 أشهر. هل تودّ الاطلاع عليه؟",
  },
];

export const suggestedQuestions = [
  "لماذا لم تُقبَل أهليتي؟",
  "كيف أرفع نسبة الأهلية؟",
  "ما أكبر بنود إنفاقي؟",
  "ما المسار الأسرع للتحسين؟",
];

/** A distinct answer per suggested question (keys must match suggestedQuestions). */
export const advisorReplies: Record<string, string> = {
  "لماذا لم تُقبَل أهليتي؟":
    "السبب الرئيسي أن نسبة التزاماتك الشهرية (DBR) تبلغ 42٪ من دخلك — أعلى من الحد المسموح به وهو 33٪. لذلك يقتصر المبلغ المتاح لك حالياً على 50,000 ر.س. بمجرد خفض هذه النسبة يرتفع سقف تمويلك بوضوح.",
  "كيف أرفع نسبة الأهلية؟":
    "المفتاح هو خفض نسبة الاستقطاع (DBR) من 42٪ نحو 33٪ أو أقل. أمامك ثلاثة مسارات: «نقل وتوحيد المديونيات» الأسرع، و«الادخار والسداد المبكر»، و«إعادة هيكلة الالتزامات» الأعلى أثراً الذي يرفع سقف تمويلك حتى 150,000 ر.س.",
  "ما أكبر بنود إنفاقي؟":
    "أكبر بنود إنفاقك: السكن 35٪ (نحو 3,430 ر.س شهرياً)، ثم الغذاء 20٪ (1,960 ر.س)، ثم التسوق 18٪ (1,764 ر.س). ترشيد بند التسوق تحديداً كفيل برفع معدّل ادخارك الحالي البالغ 37٪.",
  "ما المسار الأسرع للتحسين؟":
    "الأسرع هو «نقل وتوحيد المديونيات» — إجراء بسيط خلال شهر إلى شهرين: تنقل قروضك إلى جهة واحدة وتمدّد المدة لخفض القسط الشهري ونسبة الاستقطاع، فيرتفع سقف تمويلك المتاح إلى 100,000 ر.س بأقل جهد.",
};

/** Fallback answer for any free-typed question that isn't a suggested one. */
export const advisorDefaultReply =
  "شكراً على سؤالك. أوضح فرصة لديك هي خفض نسبة الاستقطاع (DBR) من 42٪ إلى ما دون 33٪ عبر أحد المسارات الثلاثة، ما يرفع سقف تمويلك المتاح من 50,000 ر.س حتى 150,000 ر.س. هل تريد أن أعرض لك الخطوات التفصيلية؟";

/* ── Consultative metric explanations (drill-down modals) ─────────────────── */
export interface MetricDetail {
  title: string;
  /** Why this number matters — the guide's plain-Arabic explanation. */
  explanation: string;
  /** Supporting breakdown rows shown inside the detail modal. */
  breakdown: { label: string; value: string }[];
  /** The guide's practical next-step note. */
  advice: string;
}

export const metricDetails: Record<string, MetricDetail> = {
  commitments: {
    title: "الالتزامات الشهرية",
    explanation:
      "مجموع ما يُستقطع من دخلك شهرياً لسداد أقساطك. هذا الرقم هو الأساس الذي تحسب منه الجهات التمويلية نسبة استقطاعك (DBR) — وكلما انخفض، ارتفعت أهليتك.",
    breakdown: [
      { label: "قسط قرض السيارة", value: "1,850 ر.س" },
      { label: "قسط التمويل الشخصي", value: "950 ر.س" },
      { label: "الحد الأدنى للبطاقة الائتمانية", value: "400 ر.س" },
    ],
    advice:
      "قسط السيارة يمثّل وحده 58٪ من التزاماتك — لذلك تبدأ مساراتك الثلاثة من معالجته.",
  },
  loans: {
    title: "إجمالي القروض القائمة",
    explanation:
      "أصل الدين المتبقي عليك لدى كل الجهات. لا يؤثر مباشرةً في نسبة الاستقطاع، لكنه يحدد قدرتك على إعادة الهيكلة والسداد المبكر.",
    breakdown: [
      { label: "قرض السيارة (متبقٍ)", value: "28,000 ر.س" },
      { label: "تمويل شخصي (متبقٍ)", value: "17,000 ر.س" },
    ],
    advice:
      "سداد مبكر بسيط لأصل قرض السيارة يخفض قسطك الشهري — وهذا أسرع أثر ممكن على أهليتك.",
  },
  bizCashflow: {
    title: "صافي التدفق النقدي التشغيلي",
    explanation:
      "الفرق بين ما يدخل أعمالك وما يخرج منها شهرياً. الجهات التمويلية للأعمال لا تنظر إلى نسبة استقطاع — بل إلى استمرارية هذا الرقم موجباً واستقراره.",
    breakdown: [
      { label: "متوسط آخر 3 أشهر", value: "+71,300 ر.س" },
      { label: "أفضل شهر (مايو)", value: "+86,000 ر.س" },
      { label: "أضعف شهر (فبراير)", value: "+58,500 ر.س" },
    ],
    advice:
      "تدفقك موجب منذ 6 أشهر متتالية — هذا أقوى ورقة في ملفك التمويلي. حافظ عليه فوق الصفر خلال موسم الصيف.",
  },
  bizRunway: {
    title: "أشهر الأمان النقدي",
    explanation:
      "كم شهراً تستطيع أعمالك تغطية مصروفاتها التشغيلية من السيولة الحالية لو توقفت الإيرادات تماماً. أقل من 3 أشهر يعني هشاشة، و6 فأكثر يعني ثباتاً مريحاً.",
    breakdown: [
      { label: "السيولة المتاحة", value: "412,000 ر.س" },
      { label: "متوسط المصروفات الشهرية", value: "165,000 ر.س" },
    ],
    advice:
      "أنت عند 2.5 شهر — تحت حد الأمان. بناء احتياطي حتى 3 أشهر هو خطوتك الأهم قبل أي طلب تمويل.",
  },
};

/* ══════════════════════════════════════════════════════════════════════════
   BUSINESS MODE — cash-flow-first (no DBR). Financing readiness follows the
   SME logic: sustained positive net cash flow, stable/growing revenue, and
   no predicted negative month in the coming 6 months.
   ══════════════════════════════════════════════════════════════════════════ */

export const business = {
  name: "مؤسسة الأفق للتجارة",
  initial: "أ",
  email: "alofuq@murtaqa.sa",
  segment: "فئة الأعمال",
  bank: "مصرف الإنماء — حساب الأعمال",
  sector: "تجارة التجزئة",
};

export const businessKpis = {
  netCashflow: 75000,
  revenue: 240000,
  expenses: 165000,
  runwayMonths: 2.5,
  revenueGrowth: 6, // % month-over-month trend
};

/** Revenue vs operating expenses — last 6 months. */
export const revenueExpenseData = [
  { month: "يناير", income: 205000, spending: 148000 },
  { month: "فبراير", income: 212000, spending: 153500 },
  { month: "مارس", income: 221000, spending: 158000 },
  { month: "أبريل", income: 228000, spending: 161000 },
  { month: "مايو", income: 247000, spending: 161000 },
  { month: "يونيو", income: 240000, spending: 165000 },
];

/** Operating-expense distribution (donut). */
export const expenseCategories = [
  { name: "الرواتب", value: 42, amount: 69300, color: CATEGORY_COLORS[0] },
  { name: "الموردون", value: 28, amount: 46200, color: CATEGORY_COLORS[1] },
  { name: "الإيجار", value: 14, amount: 23100, color: CATEGORY_COLORS[2] },
  { name: "التشغيل واللوجستيات", value: 10, amount: 16500, color: CATEGORY_COLORS[3] },
  { name: "أخرى", value: 6, amount: 9900, color: CATEGORY_COLORS[4] },
];

/** Recent business account activity. */
export const businessTransactions = [
  { id: 1, name: "دفعة عميل — عقد توريد", category: "إيراد", amount: 48000, date: "28 يونيو", icon: "income" },
  { id: 2, name: "رواتب شهر يونيو", category: "الرواتب", amount: -69300, date: "27 يونيو", icon: "home" },
  { id: 3, name: "مورد المخزون الرئيسي", category: "الموردون", amount: -22500, date: "24 يونيو", icon: "shopping" },
  { id: 4, name: "مبيعات نقاط البيع", category: "إيراد", amount: 31200, date: "22 يونيو", icon: "income" },
  { id: 5, name: "إيجار المستودع", category: "الإيجار", amount: -11500, date: "20 يونيو", icon: "bill" },
  { id: 6, name: "شحن ولوجستيات", category: "التشغيل", amount: -4800, date: "18 يونيو", icon: "play" },
  { id: 7, name: "دفعة عميل — طلبات الجملة", category: "إيراد", amount: 27400, date: "16 يونيو", icon: "income" },
  { id: 8, name: "تأمين المنشأة", category: "التشغيل", amount: -6200, date: "14 يونيو", icon: "bill" },
  { id: 9, name: "مبيعات المتجر الإلكتروني", category: "إيراد", amount: 18900, date: "11 يونيو", icon: "income" },
  { id: 10, name: "مورد التغليف", category: "الموردون", amount: -7800, date: "9 يونيو", icon: "shopping" },
  { id: 11, name: "فواتير الخدمات", category: "التشغيل", amount: -3400, date: "6 يونيو", icon: "bill" },
  { id: 12, name: "تحويل للاحتياطي النقدي", category: "احتياطي", amount: -12000, date: "3 يونيو", icon: "income" },
] as const;

/** Financing-readiness criteria (the business equivalent of eligibility). */
export interface ReadinessCriterion {
  id: string;
  label: string;
  status: "pass" | "watch" | "fail";
  value: string;
  detail: string;
}

export const businessReadiness: {
  /** Overall readiness 0–100 shown on the gauge. */
  score: number;
  statusWord: string;
  criteria: ReadinessCriterion[];
  /** The guide's timing verdict — the headline business answer. */
  timing: { verdict: string; detail: string };
} = {
  score: 72,
  statusWord: "شبه جاهزة",
  criteria: [
    {
      id: "positive-cashflow",
      label: "تدفق نقدي موجب لآخر 3 أشهر فأكثر",
      status: "pass",
      value: "6 أشهر متتالية",
      detail: "صافي تدفقك موجب منذ يناير — أقوى مؤشر تنظر إليه جهات تمويل الأعمال.",
    },
    {
      id: "revenue-stability",
      label: "إيرادات مستقرة أو متصاعدة",
      status: "pass",
      value: "+6٪ نمواً شهرياً",
      detail: "إيراداتك تنمو بثبات منذ 6 أشهر، مع تراجع طفيف غير مقلق في يونيو.",
    },
    {
      id: "no-negative-month",
      label: "لا شهر سالب متوقع في الأشهر الستة القادمة",
      status: "watch",
      value: "فجوة متوقعة في أغسطس",
      detail:
        "يتوقع مُرتقى ضغطاً موسمياً على التدفق في أغسطس (دفعات موردين + تباطؤ صيفي). تجاوزه دون شهر سالب يرفع جاهزيتك إلى ممتازة.",
    },
  ],
  timing: {
    verdict: "الأفضل: قدّم طلب التمويل بعد شهرين",
    detail:
      "بعد تجاوز فجوة أغسطس المتوقعة بشهر موجب، يكتمل ملفك: 8 أشهر موجبة متتالية، نمو مستقر، ولا أشهر سالبة متوقعة — فتتقدم من موقع قوة وبشروط أفضل.",
  },
};

/** Business improvement paths — cash-flow health, not DBR. */
export interface BusinessPath {
  id: number;
  title: string;
  summary: string;
  steps: string[];
  duration: string;
  effect: string;
  difficulty: DifficultyKey;
  /** AI-generated pros/cons (optional; the UI derives them from steps when absent). */
  pros?: string[];
  cons?: string[];
}

export const businessPaths: BusinessPath[] = [
  {
    id: 1,
    title: "تحصيل أسرع للمستحقات",
    summary: "قلّص فترة تحصيل فواتيرك لتقوية التدفق قبل فجوة أغسطس.",
    steps: [
      "فوترة فورية عند التسليم بدل نهاية الشهر",
      "خصم 2٪ للسداد خلال 10 أيام للعملاء الكبار",
      "متابعة أسبوعية للفواتير المتأخرة عن 30 يوماً",
    ],
    duration: "شهر واحد",
    effect: "يقدّم دخول نحو 35,000 ر.س شهرياً",
    difficulty: "سهل",
  },
  {
    id: 2,
    title: "بناء احتياطي 3 أشهر",
    summary: "ارفع أشهر الأمان النقدي من 2.5 إلى 3+ قبل التقدم للتمويل.",
    steps: [
      "تحويل 8٪ من صافي كل شهر إلى حساب احتياطي",
      "تأجيل المصروفات الرأسمالية غير العاجلة حتى سبتمبر",
      "إعادة التفاوض على دفعات الموردين إلى 45 يوماً",
    ],
    duration: "شهران",
    effect: "أمان نقدي 3.2 أشهر",
    difficulty: "متوسط",
  },
  {
    id: 3,
    title: "تجاوز فجوة أغسطس بثبات",
    summary: "عالج الشهر الحرج المتوقع مسبقاً — فيكتمل ملفك التمويلي.",
    steps: [
      "جدولة دفعة المورد الكبرى على دفعتين (أغسطس وسبتمبر)",
      "عرض صيفي لتحريك المخزون الراكد",
      "تجميد التوظيف الجديد حتى نهاية الربع",
    ],
    duration: "3 أشهر",
    effect: "جاهزية تمويل ممتازة (90+)",
    difficulty: "متوسط",
  },
];

/** Business-mode advisor content. */
export const businessSuggestedQuestions = [
  "هل الوقت مناسب لطلب تمويل؟",
  "لماذا جاهزيتي «شبه جاهزة»؟",
  "كيف أستعد لفجوة أغسطس؟",
  "أين تذهب أكبر مصروفاتي؟",
];

export const businessAdvisorReplies: Record<string, string> = {
  "هل الوقت مناسب لطلب تمويل؟":
    "ليس بعد — والأفضل خلال شهرين. تدفقك موجب منذ 6 أشهر وإيراداتك تنمو، لكن مُرتقى يتوقع فجوة موسمية في أغسطس. تجاوزها بشهر موجب يكمل ملفك: 8 أشهر موجبة متتالية ولا أشهر سالبة متوقعة، فتتقدم بشروط أفضل.",
  "لماذا جاهزيتي «شبه جاهزة»؟":
    "لأنك تحقق معيارين من ثلاثة: تدفق موجب 6 أشهر ✓ وإيرادات متصاعدة ✓. المعيار الثالث — لا شهر سالب متوقع — تحت المراقبة بسبب فجوة أغسطس. معالجتها ترفع جاهزيتك من 72 إلى أكثر من 90.",
  "كيف أستعد لفجوة أغسطس؟":
    "ثلاث خطوات عملية: جدولة دفعة المورد الكبرى على دفعتين، وتقديم تحصيل مستحقاتك (نحو 35,000 ر.س يمكن تقديمها بفوترة فورية)، وتحويل 8٪ من صافي يوليو إلى احتياطي. بهذا يمر أغسطس موجباً ويكتمل ملفك.",
  "أين تذهب أكبر مصروفاتي؟":
    "الرواتب 42٪ (69,300 ر.س) ثم الموردون 28٪ (46,200 ر.س) ثم الإيجار 14٪. بند الموردين هو الأكثر مرونة — إعادة التفاوض على آجال الدفع إلى 45 يوماً تخفف ضغط أغسطس دون أي تكلفة.",
};

export const businessAdvisorDefaultReply =
  "سؤال وجيه. خلاصة وضع أعمالك: تدفق موجب منذ 6 أشهر ونمو +6٪، والعائق الوحيد أمام جاهزية ممتازة هو فجوة أغسطس المتوقعة. عالجها بالمسارات الثلاثة المقترحة ثم تقدّم للتمويل بعد شهرين من موقع قوة. أعرض عليك الخطوات؟";
