import { motion } from "motion/react";
import { ArrowRight, Lock, ShieldCheck, Zap, User } from "lucide-react";
import type { Screen, UserMode } from "../lib/data";
import { Logo } from "../components/Logo";
import { Button } from "../components/Button";
import { EASE } from "../animations/variants";
import { cn } from "../lib/utils";

const tabs: { id: UserMode; label: string }[] = [
  { id: "individuals", label: "الأفراد" },
  { id: "business", label: "الأعمال" },
];

const perks = [
  { icon: ShieldCheck, text: "بياناتك مشفّرة وتحت سيطرتك الكاملة" },
  { icon: Zap, text: "تحليل مالي فوري بمجرد ربط الحساب" },
  { icon: Lock, text: "لا نحتفظ بأي بيانات بنكية حقيقية" },
];

export function Login({
  onNavigate,
  mode,
  onSelectMode,
}: {
  onNavigate: (s: Screen) => void;
  mode: UserMode;
  onSelectMode: (m: UserMode) => void;
}) {
  const tab = mode;

  return (
    <div className="relative min-h-screen bg-cream flex items-center justify-center p-5 overflow-hidden" dir="rtl">
      {/* Warm ambient glow behind the card */}
      <div className="pointer-events-none absolute -top-32 -start-32 w-[36rem] h-[36rem] rounded-full bg-copper/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -end-32 w-[32rem] h-[32rem] rounded-full bg-gold/15 blur-3xl" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="relative w-full max-w-4xl grid md:grid-cols-2 rounded-[2rem] overflow-hidden shadow-[var(--shadow-xl)] border border-line bg-card"
      >
        {/* Brand panel */}
        <div className="relative hidden md:flex flex-col justify-between bg-espresso p-9 overflow-hidden">
          <div className="pointer-events-none absolute -top-16 -start-10 w-72 h-72 rounded-full bg-copper/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -end-10 w-72 h-72 rounded-full bg-gold/15 blur-3xl" />
          <div className="relative">
            <Logo size="md" onDark />
          </div>
          <div className="relative">
            <h2 className="text-2xl font-bold text-white leading-relaxed mb-6">
              مرحباً بك في مُرتقى
              <br />
              <span className="text-gold">مرشدك المالي الذكي</span>
            </h2>
            <div className="space-y-4">
              {perks.map((p) => (
                <div key={p.text} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white/8 flex items-center justify-center shrink-0">
                    <p.icon size={17} className="text-gold" />
                  </div>
                  <span className="text-sm text-white/70">{p.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="relative text-xs text-white/35">
            نسخة تجريبية أكاديمية — بيانات وهمية بالكامل
          </div>
        </div>

        {/* Form */}
        <div className="p-8 md:p-10">
          <div className="md:hidden mb-6 flex justify-center">
            <Logo size="md" />
          </div>

          <span className="inline-block bg-espresso text-white text-xs px-4 py-1 rounded-full mb-4">
            نسخة تجريبية — Demo Version
          </span>
          <h1 className="text-xl font-bold text-ink">تسجيل الدخول</h1>
          <p className="text-sm text-ink-soft mt-1 mb-6">هذا عرض تجريبي — لا حاجة لحساب حقيقي.</p>

          {/* Tabs */}
          <div className="relative flex bg-cream-deep rounded-xl p-1 mb-6 border border-line">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => onSelectMode(t.id)}
                className={cn(
                  "relative flex-1 py-2 text-sm rounded-lg font-medium transition-colors z-10",
                  tab === t.id ? "text-copper" : "text-ink-soft hover:text-ink"
                )}
              >
                {tab === t.id && (
                  <motion.span
                    layoutId="login-tab"
                    className="absolute inset-0 bg-card rounded-lg shadow-[var(--shadow-sm)]"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <span className="relative">{t.label}</span>
              </button>
            ))}
          </div>

          {/* Fields */}
          <div className="space-y-4 mb-6">
            <Field label="اسم المستخدم" icon={User} defaultValue="demo_user" type="text" />
            <Field label="كلمة المرور" icon={Lock} defaultValue="demo1234" type="password" />
          </div>

          <Button size="lg" className="w-full" onClick={() => onNavigate("dashboard")}>
            الدخول كضيف
            <ArrowRight size={18} className="rotate-180" />
          </Button>

          <p className="text-center text-xs text-ink-faint mt-4 leading-relaxed">
            بالنقر على «الدخول كضيف» فأنت تقرّ بأن هذا عرض تجريبي لا يتضمن بيانات مالية حقيقية.
          </p>

          <button
            onClick={() => onNavigate("landing")}
            className="w-full mt-4 text-sm text-ink-soft hover:text-copper transition-colors flex items-center justify-center gap-1"
          >
            <ArrowRight size={15} /> العودة للصفحة الرئيسية
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  defaultValue,
  type,
}: {
  label: string;
  icon: typeof User;
  defaultValue: string;
  type: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-1.5">{label}</label>
      <div className="flex items-center gap-2.5 bg-cream border border-line rounded-xl px-3.5 py-3 focus-within:border-copper transition-colors">
        <Icon size={17} className="text-ink-faint shrink-0" />
        <input
          type={type}
          defaultValue={defaultValue}
          dir="rtl"
          className="flex-1 bg-transparent text-sm text-ink outline-none placeholder-ink-faint"
        />
      </div>
    </div>
  );
}
