import { motion } from "motion/react";
import {
  Settings,
  ShieldCheck,
  Info,
  LogOut,
  ChevronLeft,
  BadgeCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Screen, UserMode } from "../lib/data";
import { user, business, eligibility, businessReadiness } from "../lib/data";
import { Card } from "../components/Card";
import { CountUp } from "../components/CountUp";
import { FloatingBadge } from "../components/FloatingBadge";
import { Stagger, StaggerItem } from "../components/Stagger";
import { fadeUp } from "../animations/variants";

const menuItems: { icon: LucideIcon; label: string; desc: string }[] = [
  { icon: Settings, label: "الإعدادات", desc: "التفضيلات والإشعارات" },
  { icon: ShieldCheck, label: "الخصوصية والأمان", desc: "التحكم ببياناتك وصلاحيات الربط" },
  { icon: Info, label: "حول التطبيق", desc: "معلومات النسخة التجريبية" },
];

export function Profile({
  onNavigate,
  mode = "individuals",
}: {
  onNavigate: (s: Screen) => void;
  mode?: UserMode;
}) {
  const isBusiness = mode === "business";
  const account = isBusiness ? business : user;
  const stats = isBusiness
    ? [
        { label: "الجاهزية", node: <CountUp value={businessReadiness.score} suffix=" / 100" /> },
        { label: "التدفق", node: <span>موجب</span> },
        { label: "الشهر", node: <span>يونيو</span> },
      ]
    : [
        { label: "الأهلية", node: <CountUp value={eligibility.personal} suffix="٪" /> },
        { label: "المسار", node: <span>نشط</span> },
        { label: "الشهر", node: <span>يونيو</span> },
      ];
  return (
    <div className="p-5 md:p-8 max-w-lg mx-auto space-y-5" dir="rtl">
      {/* Identity — dark stage */}
      <motion.div initial="hidden" animate="show" variants={fadeUp}>
        <Card reveal={false} className="relative overflow-visible bg-espresso border-espresso pt-14 p-8 text-center">
          <FloatingBadge icon={BadgeCheck} tone="gold" position="top-center" />
          <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden">
            <div className="absolute -top-16 -start-12 w-56 h-56 rounded-full bg-copper/25 blur-3xl" />
            <div className="absolute -bottom-16 -end-12 w-48 h-48 rounded-full bg-gold/12 blur-3xl" />
          </div>
          <div className="relative w-20 h-20 rounded-full bg-gold text-espresso text-3xl font-bold flex items-center justify-center mx-auto mb-4 shadow-[var(--shadow-lg)]">
            {account.initial}
          </div>
          <h2 className="relative text-xl font-bold text-white">{account.name}</h2>
          <p className="relative text-white/60 text-sm mt-1">{account.email}</p>
          <span className="relative inline-block mt-4 bg-white/8 text-gold text-xs px-4 py-1.5 rounded-full font-medium border border-white/15">
            {account.segment}
          </span>
        </Card>
      </motion.div>

      {/* Stats — one divided band */}
      <motion.div initial="hidden" animate="show" variants={fadeUp}>
        <Card reveal={false} className="grid grid-cols-3 overflow-hidden rounded-[1.5rem]">
          {stats.map((s, i) => (
            <div key={s.label} className={i > 0 ? "p-4 text-center border-s border-line" : "p-4 text-center"}>
              <div className="text-lg font-bold text-copper tnum">{s.node}</div>
              <div className="text-xs text-ink-soft mt-1">{s.label}</div>
            </div>
          ))}
        </Card>
      </motion.div>

      {/* Menu */}
      <Stagger className="space-y-2.5">
        {menuItems.map((item) => (
          <StaggerItem key={item.label}>
            <button className="w-full group">
              <Card reveal={false} interactive className="p-4 flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-copper-tint flex items-center justify-center shrink-0">
                  <item.icon size={19} className="text-copper" />
                </div>
                <div className="flex-1 text-start">
                  <div className="font-semibold text-ink text-sm">{item.label}</div>
                  <div className="text-xs text-ink-soft mt-0.5">{item.desc}</div>
                </div>
                <ChevronLeft size={18} className="text-ink-faint group-hover:text-copper transition-colors" />
              </Card>
            </button>
          </StaggerItem>
        ))}
      </Stagger>

      {/* Logout */}
      <button
        onClick={() => onNavigate("landing")}
        className="w-full flex items-center justify-center gap-2 bg-card border border-line rounded-2xl py-4 text-sm text-negative hover:bg-negative-bg transition-colors font-medium shadow-[var(--shadow-sm)]"
      >
        <LogOut size={16} />
        الخروج من النسخة التجريبية
      </button>

      <p className="text-center text-xs text-ink-faint leading-relaxed px-4">
        نسخة تجريبية أكاديمية — جميع البيانات وهمية لأغراض العرض فقط.
      </p>
    </div>
  );
}
