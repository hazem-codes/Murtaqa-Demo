import { useState } from "react";
import { AnimatePresence, motion, type Variants } from "motion/react";
import {
  TrendingUp,
  BarChart3,
  ShieldCheck,
  Compass,
  MessageCircle,
  ArrowLeft,
  Wallet,
  CheckCircle2,
  Lock,
  HelpCircle,
  Route,
  Sparkles as SparklesIcon,
  Star,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Screen } from "../lib/data";
import { user } from "../lib/data";
import { Logo } from "../components/Logo";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { CountUp } from "../components/CountUp";
import { EligibilityRing } from "../components/EligibilityRing";
import { FloatingBadge } from "../components/FloatingBadge";
import { Sparkle } from "../components/Sparkle";
import { Stagger, StaggerItem } from "../components/Stagger";
import { fadeUp, inView } from "../animations/variants";
import { cn } from "../lib/utils";

/* ────────────────────────────────────────────────────────────────────────────
   Content — written around the product idea: Murtaqa is not a bank and not a
   wallet; it is an Arabic financial guide that reads your existing accounts
   (with your permission, via Open Banking), explains your situation in plain
   language, and proposes three realistic paths built from your own data.
   ──────────────────────────────────────────────────────────────────────────── */

const outcomeIcons: Record<string, LucideIcon> = {
  trending: TrendingUp,
  chart: BarChart3,
  shield: ShieldCheck,
  compass: Compass,
  chat: MessageCircle,
};

/** Soft pastel panels for the outcomes grid — warm token palette only. */
const outcomeTints = [
  { panel: "bg-copper-tint/70 border-copper/10", icon: "text-copper" },
  { panel: "bg-positive-bg/80 border-positive/10", icon: "text-positive" },
  { panel: "bg-sand/70 border-line", icon: "text-copper-dark" },
  { panel: "bg-warn-bg/70 border-warn/10", icon: "text-warn" },
  { panel: "bg-cream-deep border-line", icon: "text-espresso" },
];

/** Horizontal reveal from the trailing (right, in RTL) edge. */
const revealFromRight: Variants = {
  hidden: { opacity: 0, x: 48 },
  show: { opacity: 1, x: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

/** The three-chapter journey: connect → understand → choose a path.
    Alinma (sponsor bank) always leads the lineup. */
const journeyBanks = [
  { name: "الإنماء", featured: true },
  { name: "الراجحي", featured: false },
  { name: "الأهلي", featured: false },
  { name: "الرياض", featured: false },
];

type Mode = "individuals" | "business";

/** Mode-specific narrative for the shared story sections — the business
    story is cash-flow/timing-native, never a rewrite of the personal one. */
const storyByMode: Record<Mode, {
  definitionQuote: string;
  situations: { icon: LucideIcon; question: string; answer: string }[];
  ch2: {
    titleTop: string;
    titleBottom: string;
    body: React.ReactNode;
    bullets: string[];
    insight: React.ReactNode;
    meter: { markerAt: string; start: string; end: string; here: string };
  };
  ch3: {
    body: string;
    paths: { title: string; duration: string; chip: string; recommended: boolean }[];
  };
  advisor: { q: string; a: string; sub: string };
}> = {
  individuals: {
    definitionQuote: "«ماذا يحدث في أموالي، وما الخطوة الصحيحة الآن؟»",
    situations: [
      {
        icon: HelpCircle,
        question: "رُفض طلب تمويلك، ولا أحد يخبرك لماذا؟",
        answer: "يريك السبب بالأرقام من بياناتك — وكيف تعالجه خطوة بخطوة.",
      },
      {
        icon: Wallet,
        question: "راتبك جيد، لكنه يختفي قبل نهاية الشهر؟",
        answer: "يريك أين يذهب فعلاً، وما الذي يستحق أن يتغيّر أولاً.",
      },
      {
        icon: Route,
        question: "أمامك قرار مالي كبير وتخشى الخطأ؟",
        answer: "يتنبأ بأثره على أشهرك القادمة — قبل أن تخطو.",
      },
    ],
    ch2: {
      titleTop: "افهم ما يحدث في أموالك —",
      titleBottom: "بلغة تفهمها",
      body: (
        <>
          يحلّل مُرتقى دخلك والتزاماتك وإنفاقك، ثم يشرح لك ما هو صحي وما هو خطر —
          <span className="font-semibold text-ink"> ولماذا</span> — دون مصطلحات معقدة ولا
          جداول مرهقة. حتى لو لم تكن خبيراً مالياً، ستفهم وضعك في دقائق.
        </>
      ),
      bullets: ["يسمّي السبب الحقيقي، لا الأعراض", "يشرح بالعربية الواضحة، رقماً رقماً"],
      insight: (
        <>
          التزاماتك تستهلك <span className="font-bold text-negative tnum">42٪</span> من دخلك —
          أعلى من الحد الصحي <span className="font-bold text-positive tnum">(33٪)</span>.
          السبب الأكبر: قسط السيارة. لديّ ثلاثة مسارات تعالج هذا.
        </>
      ),
      meter: { markerAt: "42%", start: "صحي", end: "مرتفع", here: "أنت هنا — 42٪" },
    },
    ch3: {
      body: "لا نصائح عامة تصلح لأي أحد. يبني مُرتقى ثلاثة مسارات عملية من أرقامك وسلوكك وتوقيتك — لكل مسار مدته وأثره المتوقع على أهليتك — والقرار الأخير لك دائماً.",
      paths: [
        { title: "السداد المبكر", duration: "شهران", chip: "أهلية +9٪", recommended: false },
        { title: "توحيد المديونيات", duration: "3 أشهر", chip: "أهلية +15٪", recommended: true },
        { title: "إعادة هيكلة الالتزامات", duration: "6 أشهر", chip: "أهلية +21٪", recommended: false },
      ],
    },
    advisor: {
      q: "لماذا لم يُقبل طلب تمويلي؟",
      a: "التزاماتك 42٪ من دخلك — والجهات التمويلية تتوقف عند 33٪. لست بعيداً: لديّ مسار يعيدك إلى النطاق الصحي خلال 3 أشهر. أعرضه عليك؟",
      sub: "اسأل بلغتك الطبيعية: لماذا رُفض تمويلي؟ هل أتحمّل هذا القسط؟ متى أستطيع الشراء؟ — ويجيبك مُرتقى من بياناتك الفعلية، بإجابة تفهمها وخطوة تستطيع تنفيذها اليوم.",
    },
  },
  business: {
    definitionQuote: "«ما وضع منشأتي الحقيقي، وهل هذا هو وقت التمويل؟»",
    situations: [
      {
        icon: HelpCircle,
        question: "طلب تمويل منشأتك رُفض دون تفسير واضح؟",
        answer: "يريك معايير الجاهزية الثلاثة — وأين تقف منها أرقامك اليوم.",
      },
      {
        icon: Wallet,
        question: "إيراداتك جيدة، لكن السيولة تضيق آخر كل شهر؟",
        answer: "يكشف لك توقيت التحصيل والدفعات الذي يضغط تدفقك النقدي.",
      },
      {
        icon: Route,
        question: "قرار توسّع أو توظيف أمامك؟",
        answer: "يتنبأ بأثره على تدفقك التشغيلي — قبل أن تلتزم.",
      },
    ],
    ch2: {
      titleTop: "افهم ما يحدث في تدفقات منشأتك —",
      titleBottom: "قبل أن يضغط عليك الشهر",
      body: (
        <>
          يحلّل مُرتقى إيراداتك ومصروفاتك ودورة تحصيلك، ثم يشرح لك ما هو مستقر وما يضغط
          سيولتك — <span className="font-semibold text-ink">ولماذا</span> — دون جداول مرهقة.
          صورة تشغيلية واضحة تقرؤها في دقائق.
        </>
      ),
      bullets: ["يكشف مصدر الضغط على السيولة، لا أعراضه", "يقرأ موسمية أعمالك ودورة التحصيل"],
      insight: (
        <>
          دفعات مورديك تتركّز في أغسطس وتتزامن مع تباطؤ موسمي — أتوقع ضغطاً على تدفقك قدره{" "}
          <span className="font-bold text-negative tnum">38,000 ر.س</span>. لديّ ثلاث خطوات
          تعالجه مبكراً.
        </>
      ),
      meter: { markerAt: "45%", start: "مريح", end: "ضيق", here: "أنت هنا — 2.5 شهر أمان" },
    },
    ch3: {
      body: "لا نصائح عامة تصلح لأي منشأة. يبني مُرتقى ثلاثة مسارات عملية من تدفقاتك وموسميتك ودورة تحصيلك — لكل مسار مدته وأثره المتوقع على جاهزيتك — والقرار الأخير لك دائماً.",
      paths: [
        { title: "تحصيل أسرع للمستحقات", duration: "شهر واحد", chip: "+35,000 ر.س", recommended: true },
        { title: "بناء احتياطي 3 أشهر", duration: "شهران", chip: "أمان 3.2 أشهر", recommended: false },
        { title: "تجاوز فجوة أغسطس", duration: "3 أشهر", chip: "جاهزية 90+", recommended: false },
      ],
    },
    advisor: {
      q: "هل الوقت مناسب لطلب تمويل لمنشأتي؟",
      a: "ليس بعد — تدفقك موجب منذ 6 أشهر، لكنّي أتوقع فجوة موسمية في أغسطس. تجاوزها بشهر موجب يكمل ملفك، فتتقدم بعد شهرين بشروط أفضل. أعرض عليك الخطة؟",
      sub: "اسأل بلغتك الطبيعية: هل الوقت مناسب للتمويل؟ متى أتوسّع؟ ماذا لو تأخر عميل كبير في السداد؟ — ويجيبك مُرتقى من تدفقات منشأتك الفعلية، بإجابة واضحة وقرار مدروس التوقيت.",
    },
  },
};

const modeContent: Record<Mode, {
  badge: string;
  titleTop: string;
  titleAccent: string;
  subtitle: string;
  ctaPrimary: string;
  outcomesTitle: string;
  outcomesSubtitle: string;
  outcomes: { icon: string; question: string; answer: string }[];
  cardTitle: string;
  cardTag: string;
  ring: number;
  stat1: { value: number; label: string };
  stat2: { value: number; label: string };
}> = {
  individuals: {
    badge: "بإذنك فقط — عبر الخدمات المصرفية المفتوحة",
    titleTop: "مستقبلك المالي",
    titleAccent: "أوضح مع مُرتقى",
    subtitle:
      "مُرتقى ليس بنكاً ولا محفظة — بل مرشد مالي ذكي يقرأ حساباتك القائمة بإذنك، يشرح لك ما يحدث في أموالك بلغة واضحة، ويرسم لك مساراً عملياً نحو استقرار أكبر وأهلية تمويلية أفضل.",
    ctaPrimary: "حلّل وضعي المالي الآن",
    outcomesTitle: "ماذا سيتغيّر بالنسبة لك؟",
    outcomesSubtitle: "إجابات كنت تبحث عنها منذ زمن — من بياناتك أنت، لا من العموميات",
    outcomes: [
      { icon: "chart", question: "إلى أين يذهب راتبك؟", answer: "تحليل إنفاق يسمّي الأشياء بأسمائها — بند بند، وسبباً سبباً." },
      { icon: "trending", question: "كيف سيبدو شهرك القادم؟", answer: "تنبؤ بتدفقك النقدي قبل أن يفاجئك." },
      { icon: "shield", question: "لماذا تُقبل أو تُرفض طلباتك؟", answer: "أهليتك التمويلية بالأرقام والأسباب." },
      { icon: "compass", question: "ما الخطوة الأذكى الآن؟", answer: "مسارات عملية تناسب وضعك وتوقيتك." },
      { icon: "chat", question: "من تسأل حين تحتار؟", answer: "مرشد يجيبك من بياناتك، بلغتك." },
    ],
    cardTitle: "نتيجة تحليلك التمويلي",
    cardTag: "تمويل شخصي",
    ring: 68,
    stat1: { value: 15500, label: "الدخل الشهري" },
    stat2: { value: 9800, label: "إجمالي الإنفاق" },
  },
  business: {
    badge: "شريك مالي أذكى لأعمالك — Open Banking",
    titleTop: "مستقبل أعمالك",
    titleAccent: "أوضح مع مُرتقى",
    subtitle:
      "مرشد مالي ذكي لأعمالك — يقرأ تدفقاتك النقدية كما هي، يتنبأ بالأشهر القادمة، ويرشدك إلى قرارات تمويل ونموّ مبنية على أرقامك، لا على الحدس.",
    ctaPrimary: "حلّل وضع أعمالي الآن",
    outcomesTitle: "ماذا سيتغيّر في أعمالك؟",
    outcomesSubtitle: "قرارات أثبت، مبنية على تدفقاتك الفعلية لا على التقدير",
    outcomes: [
      { icon: "trending", question: "كيف تبدو أشهرك القادمة؟", answer: "تنبؤ بالتدفق النقدي التشغيلي قبل أن تفاجئك الفجوات." },
      { icon: "chart", question: "أين تذهب سيولة أعمالك؟", answer: "قراءة تفصيلية لإيراداتك ومصروفاتك التشغيلية." },
      { icon: "shield", question: "هل أعمالك مؤهلة للتمويل؟", answer: "تقييم واقعي مبني على استقرار تدفقاتك." },
      { icon: "compass", question: "متى تتوسّع ومتى تنتظر؟", answer: "مسارات نمو مدروسة بتوقيت مبني على أرقامك." },
      { icon: "chat", question: "من يجيب أسئلتك المالية؟", answer: "مرشد أعمال يقرأ بياناتك ويجيب على مدار الساعة." },
    ],
    cardTitle: "نسبة أهلية أعمالك",
    cardTag: "تمويل الأعمال",
    ring: 74,
    stat1: { value: 240000, label: "التدفق النقدي الشهري" },
    stat2: { value: 165000, label: "المصروفات التشغيلية" },
  },
};

/** What Murtaqa is — as numbers: 3 minutes, 3 paths, 0 money moved. */
const heroFacts = [
  { value: 3, suffix: " دقائق", label: "لربط حساباتك القائمة" },
  { value: 3, suffix: " مسارات", label: "عملية مبنية من بياناتك أنت" },
  { value: 0, suffix: "", label: "أموال نحرّكها أو نحتفظ بها" },
];

export function Landing({
  onNavigate,
  onSelectMode,
}: {
  onNavigate: (s: Screen) => void;
  /** Keeps the app-level mode in sync so login/dashboard open in the right experience. */
  onSelectMode?: (m: Mode) => void;
}) {
  const [mode, setMode] = useState<Mode>("individuals");
  const c = modeContent[mode];
  const story = storyByMode[mode];

  const chooseMode = (m: Mode) => {
    setMode(m);
    onSelectMode?.(m);
  };

  const startAnalysis = () => {
    onSelectMode?.(mode);
    onNavigate("login");
  };

  const scrollToJourney = () =>
    document.getElementById("journey")?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="min-h-screen bg-cream overflow-x-hidden" dir="rtl">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-cream/85 backdrop-blur-md border-b border-line">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 h-18 py-3 flex items-center justify-between">
          <Logo showTagline={false} />
          <div className="flex-1 flex justify-center">
            <div className="relative flex bg-cream-deep rounded-full p-1 border border-line">
              {(["individuals", "business"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => chooseMode(m)}
                  className={cn(
                    "relative z-10 px-5 sm:px-7 py-1.5 text-sm font-medium rounded-full transition-colors",
                    mode === m ? "text-white" : "text-ink-soft hover:text-ink"
                  )}
                >
                  {mode === m && (
                    <motion.span
                      layoutId="landing-mode-pill"
                      className="absolute inset-0 bg-copper rounded-full shadow-[var(--shadow-sm)]"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className="relative">{m === "individuals" ? "الأفراد" : "الأعمال"}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate("login")}
              className="hidden sm:inline text-sm font-medium text-ink-soft hover:text-copper transition-colors"
            >
              تسجيل الدخول
            </button>
            <Button size="sm" onClick={startAnalysis}>
              ابدأ التحليل
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hackathon supporters — quiet trust strip, never competing with
             the Murtaqa identity ─────────────────────────────────────────── */}
      <div className="w-full bg-card border-b border-line">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-3 flex items-center justify-center gap-x-5 gap-y-2 flex-wrap">
          <span className="text-[11px] text-ink-faint">
            نموذج أولي ضمن هاكاثون أمد — بدعم من
          </span>
          <SponsorMark
            src="/sponsors/alinma.png"
            alt="مصرف الإنماء"
            fallback="مصرف الإنماء · alinma"
            prominent
          />
          <span className="hidden sm:block w-px h-4 bg-line-strong" />
          <SponsorMark src="/sponsors/tuwaiq.png" alt="أكاديمية طويق" fallback="أكاديمية طويق · Tuwaiq Academy" />
        </div>
      </div>

      {/* ── Hero — dark espresso stage ──────────────────────────────────── */}
      <section className="relative w-full overflow-hidden bg-espresso">
        <div className="pointer-events-none absolute -top-32 -start-32 w-[40rem] h-[40rem] rounded-full bg-copper/25 blur-3xl" />
        <div className="pointer-events-none absolute top-40 -end-32 w-[32rem] h-[32rem] rounded-full bg-gold/12 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#1C2732]/60 to-transparent" />

        <div className="relative max-w-7xl mx-auto px-6 lg:px-12 pt-16 md:pt-20 pb-24 md:pb-28 grid lg:grid-cols-2 gap-16 items-center">
          {/* Copy */}
          <motion.div initial="hidden" animate="show" variants={fadeUp} className="relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="inline-flex items-center gap-2 bg-white/8 text-gold text-sm px-4 py-2 rounded-full mb-8 font-medium border border-white/15 backdrop-blur-sm">
                  <SparklesIcon size={15} className="text-gold" />
                  {c.badge}
                </div>

                <div className="relative">
                  <Sparkle size={34} color="var(--gold)" delay={0.3} spin className="absolute -top-6 start-2" />
                  <Sparkle size={20} color="var(--copper-light)" delay={0.5} className="absolute top-6 -start-6" />
                  <h1 className="text-5xl md:text-6xl xl:text-7xl font-bold text-white leading-[1.15] mb-7">
                    {c.titleTop}
                    <br />
                    <span className="inline-block bg-gold text-espresso rounded-full px-6 pb-2 mt-3 leading-[1.35]">
                      {c.titleAccent}
                    </span>
                  </h1>
                </div>

                <p className="text-lg md:text-xl text-white/65 leading-relaxed mb-10 max-w-xl">
                  {c.subtitle}
                </p>
              </motion.div>
            </AnimatePresence>

            <div className="flex flex-wrap items-center gap-4">
              <Button size="lg" onClick={startAnalysis}>
                {c.ctaPrimary}
                <ArrowLeft size={18} />
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="border-white/25 text-white hover:bg-white/10 hover:text-white"
                onClick={scrollToJourney}
              >
                كيف يعمل مُرتقى؟
              </Button>
            </div>

            {/* What Murtaqa is — in numbers */}
            <div className="grid grid-cols-3 mt-16 max-w-lg">
              {heroFacts.map((s, i) => (
                <div key={s.label} className={i > 0 ? "border-s border-white/10 ps-6" : ""}>
                  <div className="text-3xl md:text-4xl font-bold text-gold tnum">
                    <CountUp value={s.value} suffix={s.suffix} />
                  </div>
                  <div className="text-xs text-white/50 mt-1.5 leading-relaxed">{s.label}</div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Hero visual — the analysis preview */}
          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
            className="relative"
          >
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="absolute -top-5 end-6 z-20 bg-card border border-line rounded-full ps-2 pe-4 py-2 flex items-center gap-2 shadow-[var(--shadow-lg)]"
            >
              <span className="w-7 h-7 rounded-full bg-positive-bg flex items-center justify-center">
                <Lock size={14} className="text-positive" />
              </span>
              <span className="text-xs font-semibold text-ink">صلاحية قراءة فقط — لا ننقل أموالك</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="absolute bottom-20 -start-4 z-20 bg-card border border-line rounded-full ps-2 pe-4 py-2 flex items-center gap-2 shadow-[var(--shadow-lg)]"
            >
              <span className="w-7 h-7 rounded-full bg-copper-tint flex items-center justify-center">
                <ShieldCheck size={15} className="text-copper" />
              </span>
              <span className="text-xs font-semibold text-ink">متوافق مع أنظمة الحماية</span>
            </motion.div>

            <AnimatePresence mode="wait">
              <motion.div
                key={mode}
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              >
                <Card reveal={false} className="p-6 pt-9 shadow-[var(--shadow-xl)]">
                  <FloatingBadge icon={Wallet} tone="copper" position="top-start" />
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <div className="text-sm text-ink-soft">{c.cardTitle}</div>
                      <div className="text-xs text-ink-faint mt-0.5">{c.cardTag}</div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-positive-bg text-positive">
                      <CheckCircle2 size={13} /> جيدة
                    </span>
                  </div>

                  <div className="flex items-center justify-center py-2">
                    <EligibilityRing percentage={c.ring} size={176} showTier />
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-5">
                    <div className="rounded-xl bg-cream-deep p-3">
                      <div className="text-lg font-bold text-ink">
                        <CountUp value={c.stat1.value} suffix=" ر.س" delay={0.3} />
                      </div>
                      <div className="text-xs text-ink-soft mt-0.5">{c.stat1.label}</div>
                    </div>
                    <div className="rounded-xl bg-cream-deep p-3">
                      <div className="text-lg font-bold text-ink">
                        <CountUp value={c.stat2.value} suffix=" ر.س" delay={0.45} />
                      </div>
                      <div className="text-xs text-ink-soft mt-0.5">{c.stat2.label}</div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </AnimatePresence>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8, duration: 0.6 }}
              className="absolute -bottom-6 -end-4 bg-gold text-espresso rounded-2xl px-4 py-3 shadow-[var(--shadow-lg)] flex items-center gap-3 z-20"
            >
              <div className="w-9 h-9 rounded-lg bg-espresso/10 flex items-center justify-center">
                <TrendingUp size={17} className="text-espresso" />
              </div>
              <div>
                <div className="text-sm font-bold">
                  <CountUp value={15} prefix="+" suffix="٪ متوقع" delay={0.9} />
                </div>
                <div className="text-[11px] text-espresso/60">بعد إكمال المسار</div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Definition — what Murtaqa is NOT, and who it is for ─────────── */}
      <section className="w-full py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={inView}
            className="text-center max-w-3xl mx-auto mb-16"
          >
            <h2 className="text-3xl md:text-5xl font-bold text-ink leading-snug mb-6">
              مُرتقى ليس بنكاً جديداً،
              <br />
              <span className="text-ink-faint">ولا محفظة تُضاف إلى هاتفك.</span>
            </h2>
            <p className="text-lg md:text-xl text-ink-soft leading-relaxed">
              مُرتقى مرشد ومحلّل مالي شخصي: يقرأ حساباتك القائمة — بإذنك — ثم يجيبك عن السؤال
              الذي لا يجيبك عنه أحد:
              <span className="font-semibold text-copper"> {story.definitionQuote}</span>
            </p>
          </motion.div>

          <Stagger key={mode} className="grid md:grid-cols-3 gap-5" stagger={0.12}>
            {story.situations.map((s) => (
              <StaggerItem key={s.question}>
                <div className="h-full rounded-[2rem] bg-cream-deep/70 border border-line p-8 hover:bg-cream-deep transition-colors">
                  <div className="w-14 h-14 rounded-2xl bg-card shadow-[var(--shadow-sm)] flex items-center justify-center mb-6">
                    <s.icon size={24} className="text-copper" />
                  </div>
                  <div className="font-bold text-ink text-lg leading-snug mb-4">{s.question}</div>
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-gold/25 flex items-center justify-center">
                      <ArrowLeft size={12} className="text-copper-dark" />
                    </span>
                    <p className="text-sm text-ink-soft leading-relaxed">{s.answer}</p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── The journey: connect → understand → choose ──────────────────── */}
      <section id="journey" className="w-full py-8 md:py-12 scroll-mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 space-y-6">
          <SectionHeading
            eyebrow="رحلتك مع مُرتقى"
            title="من الغموض إلى الوضوح — في ثلاث خطوات"
            subtitle="لا تعقيد، لا مصطلحات، لا حساب جديد"
          />

          {/* Chapter 01 — Connect (Open Banking, shown not explained) */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={inView}
            className="rounded-[2.5rem] bg-cream-deep/60 border border-line px-6 py-12 sm:px-10 md:px-14 md:py-16 grid lg:grid-cols-2 gap-12 items-center"
          >
            <div>
              <ChapterBadge n="01" />
              <h3 className="text-2xl md:text-3xl font-bold text-ink leading-snug mb-4">
                اربط حساباتك القائمة —
                <br />
                بأمان، وبإذنك وحدك
              </h3>
              <p className="text-ink-soft leading-relaxed mb-6">
                لا حساب جديد ولا تحويل أموال. عبر الخدمات المصرفية المفتوحة المرخّصة، تمنح
                مُرتقى صلاحية <span className="font-semibold text-ink">قراءة فقط</span>، فيجمع
                صورتك المالية من كل بنوكك في مكان واحد.
              </p>
              <ul className="space-y-3">
                {["صلاحية قراءة فقط — لا يمكن تحريك أموالك", "تلغي الربط متى شئت بضغطة واحدة"].map((t) => (
                  <li key={t} className="flex items-center gap-2.5 text-sm text-ink">
                    <CheckCircle2 size={17} className="text-positive shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Visual: existing banks flow into Murtaqa → one clear picture */}
            <div className="flex flex-col sm:flex-row items-center gap-5">
              <div className="flex sm:flex-col flex-wrap justify-center gap-3">
                {journeyBanks.map((b, i) => (
                  <motion.span
                    key={b.name}
                    initial={{ opacity: 0, x: 16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.15 + i * 0.1 }}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold whitespace-nowrap shadow-[var(--shadow-sm)]",
                      b.featured
                        ? "bg-espresso text-gold border border-espresso"
                        : "bg-card text-ink border border-line"
                    )}
                  >
                    {b.name}
                    {b.featured && (
                      <span className="text-[10px] font-bold bg-gold/20 text-gold px-2 py-0.5 rounded-full">
                        البنك الشريك
                      </span>
                    )}
                  </motion.span>
                ))}
              </div>
              <div className="hidden sm:block w-10 border-t-2 border-dashed border-line-strong" />
              <div className="relative shrink-0">
                <span className="absolute inset-0 rounded-full bg-gold/30 blur-xl" />
                <div className="relative w-20 h-20 rounded-full bg-gold text-espresso font-bold text-lg flex items-center justify-center shadow-[var(--shadow-lg)]">
                  مُرتقى
                </div>
              </div>
              <div className="hidden sm:block w-10 border-t-2 border-dashed border-line-strong" />
              <div className="bg-card rounded-2xl border border-line shadow-[var(--shadow-md)] p-5 w-full sm:w-52">
                <div className="text-xs font-bold text-ink mb-3">صورتك المالية كاملة</div>
                {[
                  { label: "الدخل", w: "85%" },
                  { label: "الالتزامات", w: "45%" },
                  { label: "الإنفاق", w: "60%" },
                ].map((r) => (
                  <div key={r.label} className="mb-2.5 last:mb-0">
                    <div className="flex justify-between text-[11px] text-ink-soft mb-1">
                      <span>{r.label}</span>
                    </div>
                    <div className="h-1.5 bg-cream-deep rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-copper"
                        initial={{ width: 0 }}
                        whileInView={{ width: r.w }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.9, delay: 0.4 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Chapter 02 — Understand (the guide explains, plainly) */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={inView}
            className="rounded-[2.5rem] bg-cream-deep/60 border border-line px-6 py-12 sm:px-10 md:px-14 md:py-16 grid lg:grid-cols-2 gap-12 items-center"
          >
            {/* Visual: a "note from your guide" insight card + health meter */}
            <div className="order-2 lg:order-1">
              <div className="relative max-w-md mx-auto">
                <div className="absolute -top-4 start-8 z-10 bg-espresso text-white rounded-full ps-2 pe-4 py-2 flex items-center gap-2 shadow-[var(--shadow-lg)]">
                  <span className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center">
                    <SparklesIcon size={13} className="text-gold" />
                  </span>
                  <span className="text-xs font-semibold">ملاحظة من مرشدك</span>
                </div>
                <div className="rounded-[2rem] bg-card border border-line p-7 pt-9 shadow-[var(--shadow-xl)]">
                  <p className="text-ink leading-relaxed mb-6">{story.ch2.insight}</p>
                  <div className="relative h-2.5 rounded-full bg-gradient-to-l from-positive via-warn to-negative mb-2" dir="ltr">
                    <span
                      className="absolute -top-1 h-4 w-4 rounded-full bg-espresso ring-4 ring-card shadow-[var(--shadow-md)]"
                      style={{ right: story.ch2.meter.markerAt, transform: "translateX(50%)" }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-ink-soft">
                    <span>{story.ch2.meter.end}</span>
                    <span className="font-bold text-ink">{story.ch2.meter.here}</span>
                    <span>{story.ch2.meter.start}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <ChapterBadge n="02" />
              <h3 className="text-2xl md:text-3xl font-bold text-ink leading-snug mb-4">
                {story.ch2.titleTop}
                <br />
                {story.ch2.titleBottom}
              </h3>
              <p className="text-ink-soft leading-relaxed mb-6">{story.ch2.body}</p>
              <ul className="space-y-3">
                {story.ch2.bullets.map((t) => (
                  <li key={t} className="flex items-center gap-2.5 text-sm text-ink">
                    <CheckCircle2 size={17} className="text-positive shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>

          {/* Chapter 03 — Choose one of three real paths */}
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={inView}
            className="rounded-[2.5rem] bg-espresso border border-espresso px-6 py-12 sm:px-10 md:px-14 md:py-16 grid lg:grid-cols-2 gap-12 items-center relative overflow-hidden"
          >
            <div className="pointer-events-none absolute -top-20 -start-16 w-72 h-72 rounded-full bg-copper/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -end-16 w-72 h-72 rounded-full bg-gold/12 blur-3xl" />
            <div className="relative">
              <ChapterBadge n="03" onDark />
              <h3 className="text-2xl md:text-3xl font-bold text-white leading-snug mb-4">
                اختر مسارك —
                <br />
                ثلاثة خيارات واقعية من بياناتك أنت
              </h3>
              <p className="text-white/65 leading-relaxed mb-6">{story.ch3.body}</p>
              <Button
                className="bg-gold text-espresso hover:bg-[#E7CBA0] shadow-none font-semibold"
                onClick={startAnalysis}
              >
                اطلب مساراتك الثلاثة
                <ArrowLeft size={16} />
              </Button>
            </div>

            {/* Visual: the three paths, one recommended */}
            <div key={mode} className="relative space-y-3">
              {story.ch3.paths.map((p, i) => (
                <motion.div
                  key={p.title}
                  initial={{ opacity: 0, x: 24 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 + i * 0.12 }}
                  className={cn(
                    "relative rounded-2xl p-5 flex items-center justify-between gap-4 border",
                    p.recommended
                      ? "bg-gold text-espresso border-gold shadow-[var(--shadow-lg)]"
                      : "bg-white/6 border-white/10 text-white"
                  )}
                >
                  {p.recommended && (
                    <span className="absolute -top-3 start-5 inline-flex items-center gap-1 bg-espresso text-gold text-[11px] font-bold px-3 py-1 rounded-full">
                      <SparklesIcon size={11} /> يوصي به مرشدك
                    </span>
                  )}
                  <div>
                    <div className="font-bold text-sm mb-1">{p.title}</div>
                    <div className={cn("text-xs", p.recommended ? "text-espresso/60" : "text-white/50")}>
                      المدة: {p.duration}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-bold tnum px-3 py-1.5 rounded-full",
                      p.recommended ? "bg-espresso/10" : "bg-white/10"
                    )}
                  >
                    {p.chip}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Outcomes — the questions Murtaqa answers ─────────────────────── */}
      <section className="w-full py-16 md:py-24 lg:py-28">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <SectionHeading eyebrow="نتائج، لا وعود" title={c.outcomesTitle} subtitle={c.outcomesSubtitle} />
        </div>
        <motion.div
          key={mode}
          initial="hidden"
          whileInView="show"
          viewport={inView}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}
          className="max-w-7xl mx-auto grid md:grid-cols-2 lg:grid-cols-3 gap-5 px-6 lg:px-12"
        >
          {c.outcomes.map((s, i) => {
            const Icon = outcomeIcons[s.icon];
            const tint = outcomeTints[i % outcomeTints.length];
            const featured = i === 0;
            return (
              <motion.div key={s.question} variants={revealFromRight} className={featured ? "md:col-span-2" : ""}>
                <motion.div
                  whileHover={{ y: -4, transition: { duration: 0.25 } }}
                  className={cn(
                    "relative overflow-hidden rounded-[2rem] h-full border cursor-pointer transition-shadow hover:shadow-[var(--shadow-md)] flex flex-col",
                    featured ? "p-9 md:p-11 justify-center" : "p-8",
                    tint.panel
                  )}
                >
                  {featured && (
                    <div className="pointer-events-none absolute -top-14 -end-14 w-56 h-56 rounded-full bg-copper/10 blur-3xl" />
                  )}
                  <div
                    className={cn(
                      "rounded-2xl bg-card shadow-[var(--shadow-sm)] flex items-center justify-center",
                      featured ? "w-16 h-16 mb-7" : "w-14 h-14 mb-6"
                    )}
                  >
                    <Icon size={featured ? 30 : 26} className={tint.icon} />
                  </div>
                  <div className={cn("font-bold text-ink mb-2.5", featured ? "text-2xl md:text-3xl" : "text-lg")}>
                    {s.question}
                  </div>
                  <div className={cn("text-ink-soft leading-relaxed", featured ? "text-base md:text-lg max-w-xl" : "text-sm")}>
                    {s.answer}
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      {/* ── The advisor — ask "why?" and get your own numbers back ──────── */}
      <section className="w-full py-8 md:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
          <div className="rounded-[2.5rem] bg-cream-deep/60 border border-line px-6 py-14 sm:px-10 md:px-14 md:py-20 grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={inView}
            className="relative"
          >
            <div className="absolute -top-4 start-8 z-20 bg-espresso text-white rounded-full ps-2 pe-4 py-2 flex items-center gap-2 shadow-[var(--shadow-lg)]">
              <span className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center">
                <MessageCircle size={13} className="text-gold" />
              </span>
              <span className="text-xs font-semibold">مرشدك — في أي وقت</span>
            </div>

            <div className="rounded-[2rem] bg-card border border-line p-7 shadow-[var(--shadow-xl)]">
              <div className="flex items-center gap-3 mb-5 pb-4 border-b border-line">
                <div className="w-10 h-10 rounded-xl bg-espresso flex items-center justify-center">
                  <MessageCircle size={18} className="text-gold" />
                </div>
                <div>
                  <div className="font-bold text-ink text-sm">مرشدك المالي في مُرتقى</div>
                  <div className="text-xs text-positive">متصل الآن</div>
                </div>
              </div>
              <div key={mode} className="space-y-3">
                <div className="max-w-[85%] bg-cream border border-line rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-ink">
                  {story.advisor.q}
                </div>
                <div className="max-w-[90%] ms-auto bg-copper text-white rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed">
                  {story.advisor.a}
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={inView}>
            <div className="inline-flex items-center gap-2 text-copper text-sm font-semibold mb-4">
              <Star size={16} className="fill-copper" /> مرشد، لا مجرد روبوت
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-ink leading-tight mb-5">
              حين تسأل «لماذا؟»
              <br />
              يجيبك من أرقامك أنت
            </h2>
            <p className="text-lg text-ink-soft leading-relaxed mb-7">{story.advisor.sub}</p>
            <Button size="lg" onClick={() => onNavigate("chat")}>
              جرّب أن تسأله الآن
              <ArrowLeft size={18} />
            </Button>
          </motion.div>
          </div>
        </div>
      </section>

      {/* ── Individuals / Business — an honest split ─────────────────────── */}
      <section className="w-full py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
          <SectionHeading
            eyebrow="لمن بُني مُرتقى؟"
            title="وضوح للأفراد، وثبات للأعمال"
            subtitle="المنهج واحد: بياناتك الحقيقية، فهم أعمق، وقرار أثبت"
          />
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Individuals — light panel */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={inView}
              className="rounded-[2.5rem] bg-card border border-line shadow-[var(--shadow-md)] p-9 md:p-12 flex flex-col"
            >
              <span className="self-start inline-flex items-center gap-1.5 bg-positive-bg text-positive text-xs font-bold px-3.5 py-1.5 rounded-full mb-6">
                متاح الآن
              </span>
              <h3 className="text-2xl md:text-3xl font-bold text-ink mb-3">للأفراد</h3>
              <p className="text-ink-soft leading-relaxed mb-7">
                لمن يريد أن يفهم راتبه والتزاماته، ويرفع أهليته التمويلية، ويتخذ قراراته
                المالية بثقة بدل التخمين.
              </p>
              <ul className="space-y-3 mb-8">
                {["تحليل شامل لدخلك وإنفاقك والتزاماتك", "تنبؤ بأشهرك القادمة قبل أن تفاجئك", "ثلاثة مسارات عملية لأهلية أفضل"].map((t) => (
                  <li key={t} className="flex items-center gap-2.5 text-sm text-ink">
                    <CheckCircle2 size={17} className="text-positive shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
              <Button
                size="lg"
                className="mt-auto self-start"
                onClick={() => {
                  chooseMode("individuals");
                  onNavigate("login");
                }}
              >
                ابدأ تحليلك المجاني
                <ArrowLeft size={17} />
              </Button>
            </motion.div>

            {/* Business — dark panel */}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={inView}
              className="relative overflow-hidden rounded-[2.5rem] bg-espresso border border-espresso shadow-[var(--shadow-lg)] p-9 md:p-12 flex flex-col"
            >
              <div className="pointer-events-none absolute -top-16 -end-12 w-64 h-64 rounded-full bg-copper/20 blur-3xl" />
              <span className="relative self-start inline-flex items-center gap-1.5 bg-white/8 border border-white/15 text-gold text-xs font-bold px-3.5 py-1.5 rounded-full mb-6">
                للشركات والمنشآت
              </span>
              <h3 className="relative text-2xl md:text-3xl font-bold text-white mb-3">للأعمال</h3>
              <p className="relative text-white/65 leading-relaxed mb-7">
                لمن يدير تدفقات نقدية حقيقية ويريد قرارات نموّ وتمويل مبنية على أرقام —
                لا على الحدس.
              </p>
              <ul className="relative space-y-3 mb-8">
                {["تنبؤ بالتدفق النقدي التشغيلي", "تقييم واقعي لأهلية تمويل الأعمال", "مسارات نمو بتوقيت مدروس"].map((t) => (
                  <li key={t} className="flex items-center gap-2.5 text-sm text-white/85">
                    <CheckCircle2 size={17} className="text-gold shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
              <Button
                size="lg"
                className="relative mt-auto self-start bg-gold text-espresso hover:bg-[#E7CBA0] shadow-none font-semibold"
                onClick={() => {
                  chooseMode("business");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                استكشف مُرتقى للأعمال
                <ArrowLeft size={17} />
              </Button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── CTA band ─────────────────────────────────────────────────────── */}
      <section className="w-full py-8 md:py-12 pb-16 md:pb-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={inView}
            className="relative overflow-hidden rounded-[2.5rem] bg-espresso px-8 py-20 text-center"
          >
            <Sparkle size={26} color="var(--gold)" className="absolute top-10 start-16" spin />
            <Sparkle size={18} color="var(--copper-light)" className="absolute bottom-12 end-24" delay={0.3} />
            <div className="pointer-events-none absolute -top-16 -start-10 w-80 h-80 rounded-full bg-copper/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -end-10 w-80 h-80 rounded-full bg-gold/15 blur-3xl" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 text-gold text-sm mb-5">
                <Lock size={15} /> بياناتك مشفّرة، وصلاحية القراءة بيدك وحدك
              </div>
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-5 leading-tight">
                شاهد وضعك المالي
                <br />
                كما لم تره من قبل
              </h2>
              <p className="text-white/60 max-w-xl mx-auto mb-9 text-lg leading-relaxed">
                جرّب العرض التجريبي الآن — بيانات آمنة بالكامل تريك تجربة مُرتقى خطوة بخطوة:
                من الربط، إلى الفهم، إلى مسارك الأول.
              </p>
              <Button size="lg" onClick={startAnalysis}>
                ابدأ التحليل التجريبي
                <ArrowLeft size={18} />
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="w-full border-t border-line bg-card">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <Logo size="sm" />
          <p className="text-xs text-ink-soft text-center md:text-start max-w-lg leading-relaxed">
            تنبيه: هذا المشروع تجريبي وأكاديمي بحت، ولا يمثّل منصة مالية حقيقية ولا يقدّم
            خدمات بنكية فعلية. جميع البيانات المعروضة وهمية لأغراض العرض فقط.
          </p>
          <button
            onClick={() => onNavigate("profile")}
            className="w-9 h-9 rounded-full bg-espresso text-gold text-sm font-bold flex items-center justify-center shrink-0"
          >
            {user.initial}
          </button>
        </div>
      </footer>
    </div>
  );
}

/** Sponsor logo that degrades to a clean text lockup until the official
    asset is dropped into frontend/public/sponsors/. `prominent` gives the
    lead sponsor (Alinma) slightly more visual presence. */
function SponsorMark({
  src,
  alt,
  fallback,
  prominent = false,
}: {
  src: string;
  alt: string;
  fallback: string;
  prominent?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={cn(
          "font-bold whitespace-nowrap",
          prominent ? "text-sm text-ink" : "text-xs text-ink-soft"
        )}
      >
        {fallback}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={cn("w-auto object-contain", prominent ? "h-10 opacity-100" : "h-6 opacity-85")}
      onError={() => setFailed(true)}
    />
  );
}

/** Gold chapter-number chip used across the journey panels. */
function ChapterBadge({ n, onDark = false }: { n: string; onDark?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-12 h-12 rounded-2xl font-bold text-lg tnum mb-6",
        onDark ? "bg-gold text-espresso" : "bg-espresso text-gold"
      )}
    >
      {n}
    </span>
  );
}

function SectionHeading({ title, subtitle, eyebrow }: { title: string; subtitle: string; eyebrow?: string }) {
  return (
    <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={inView} className="text-center mb-12">
      {eyebrow && (
        <div className="inline-flex items-center gap-2 text-copper text-sm font-semibold bg-copper-tint/70 rounded-full px-4 py-1.5 mb-4">
          {eyebrow}
        </div>
      )}
      <h2 className="text-3xl md:text-5xl font-bold text-ink mb-4 leading-snug">{title}</h2>
      <p className="text-ink-soft text-base md:text-lg">{subtitle}</p>
    </motion.div>
  );
}
