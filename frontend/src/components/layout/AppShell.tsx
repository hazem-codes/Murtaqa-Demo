import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutGrid,
  BarChart3,
  Route,
  PiggyBank,
  MessageCircle,
  User,
  LogOut,
  Menu,
  X,
  Bell,
  Users,
  Calculator,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Screen, UserMode } from "../../lib/data";
import { user, business } from "../../lib/data";
import { Logo } from "../Logo";
import { cn } from "../../lib/utils";
import { AccountBrowser } from "../AccountBrowser";
import { useSelectedAccount } from "../../lib/accountStore";

interface NavItem {
  id: Screen;
  icon: LucideIcon;
  label: string;
}

// Short, always-visible one/two-word labels — the nav shows text next to every icon at all
// times (no hover-only tooltips), so labels are kept terse to avoid cramping the bar.
const navItemsByMode: Record<UserMode, NavItem[]> = {
  individuals: [
    { id: "dashboard", icon: LayoutGrid, label: "لوحة التحكم" },
    { id: "analysis", icon: BarChart3, label: "التحليل" },
    { id: "eligibility", icon: Route, label: "المسارات" },
    { id: "simulator", icon: Calculator, label: "الحاسبة" },
    { id: "savings", icon: PiggyBank, label: "الادخار" },
    { id: "chat", icon: MessageCircle, label: "المستشار" },
  ],
  business: [
    { id: "dashboard", icon: LayoutGrid, label: "الصحة المالية" },
    { id: "analysis", icon: BarChart3, label: "الإيرادات" },
    { id: "eligibility", icon: Route, label: "الجاهزية" },
    { id: "chat", icon: MessageCircle, label: "المستشار" },
  ],
};

/** Individuals / Business track switcher — swaps the active persona app-wide. */
function TrackToggle({
  mode,
  onSelect,
  layoutId,
}: {
  mode: UserMode;
  onSelect: (m: UserMode) => void;
  layoutId: string;
}) {
  const tracks: { id: UserMode; label: string }[] = [
    { id: "individuals", label: "الأفراد" },
    { id: "business", label: "الأعمال" },
  ];
  return (
    <div className="relative flex bg-white/5 rounded-full p-0.5 border border-white/10">
      {tracks.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t.id)}
          className={cn(
            "relative px-3 py-1.5 text-xs font-medium rounded-full transition-colors z-10 whitespace-nowrap",
            mode === t.id ? "text-white" : "text-white/50 hover:text-white/80"
          )}
        >
          {mode === t.id && (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 rounded-full bg-copper shadow-[var(--shadow-sm)]"
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
            />
          )}
          <span className="relative">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

/** A single top-nav link with an animated active pill. */
function TopNavLink({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      title={item.label}
      aria-label={item.label}
      className={cn(
        // flex-1 makes every item claim an equal share of the nav's width, so the group spreads
        // evenly across the full bar instead of clustering and leaving a gap. The label is always
        // rendered (never hover-only) — min-w-0 + truncate keep a long label from breaking layout.
        "relative flex-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-2 rounded-full text-[13px] transition-colors duration-200",
        active ? "text-white" : "text-white/55 hover:text-white"
      )}
    >
      {active && (
        <motion.span
          layoutId="topnav-active"
          className="absolute inset-0 rounded-full bg-copper shadow-[var(--shadow-md)]"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      <span className="relative flex items-center gap-1.5 min-w-0">
        <Icon size={16} strokeWidth={2} className="shrink-0" />
        <span className="font-medium truncate">{item.label}</span>
      </span>
    </button>
  );
}

export function AppShell({
  currentScreen,
  onNavigate,
  mode = "individuals",
  onSelectMode,
  children,
}: {
  currentScreen: Screen;
  onNavigate: (s: Screen) => void;
  mode?: UserMode;
  onSelectMode?: (m: UserMode) => void;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [browserOpen, setBrowserOpen] = useState(false);
  const navItems = navItemsByMode[mode];
  const account = mode === "business" ? business : user;
  const selectedAccount = useSelectedAccount(mode === "business" ? "business" : "individuals");

  const go = (s: Screen) => {
    onNavigate(s);
    setMobileOpen(false);
  };

  // Switching track swaps the whole persona (individuals ↔ business) and lands the
  // user on that track's dashboard so they don't stay on a screen for the old track.
  const switchTrack = (m: UserMode) => {
    if (m === mode) return;
    onSelectMode?.(m);
    onNavigate("dashboard");
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col" dir="rtl">
      {/* ── Floating pill navigation ───────────────────────────────────────── */}
      <header className="sticky top-0 z-40 px-3 md:px-6 pt-3 pb-2 bg-gradient-to-b from-cream via-cream/85 to-transparent">
        <div className="mx-auto max-w-7xl 2xl:max-w-[1600px] h-14 ps-4 pe-2.5 md:ps-6 md:pe-3 flex items-center justify-between gap-4 rounded-full bg-espresso shadow-[var(--shadow-lg)] border border-white/10">
          {/* Right (start in RTL): logo */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              className="md:hidden text-white/80 hover:text-white"
              onClick={() => setMobileOpen(true)}
              aria-label="القائمة"
            >
              <Menu size={22} />
            </button>
            <Logo onDark showTagline={false} />
            {/* Track switcher (desktop) — enter individuals or business at any time */}
            {onSelectMode && (
              <div className="hidden md:block">
                <TrackToggle mode={mode} onSelect={switchTrack} layoutId="track-toggle-desktop" />
              </div>
            )}
          </div>

          {/* Center: primary nav (desktop). flex-1 + min-w-0 lets this section shrink instead of
              pushing the account/profile cluster outside the pill/viewport as more nav items are
              added. Each TopNavLink is itself flex-1, so the items distribute evenly across the
              full nav width (no empty middle gap) while keeping an always-visible label next to
              every icon; overflow-x-auto is a last-resort fallback for extreme narrow widths. */}
          <nav className="hidden md:flex flex-1 min-w-0 items-center gap-1 bg-white/5 rounded-full p-1 border border-white/10 overflow-x-auto no-scrollbar">
            {navItems.map((item) => (
              <TopNavLink
                key={item.id}
                item={item}
                active={currentScreen === item.id}
                onClick={() => go(item.id)}
              />
            ))}
          </nav>

          {/* Left (end in RTL): account switcher + notifications + profile */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Account browser — loads any of the 1000/500 personas live (QA tool). */}
            <button
              onClick={() => setBrowserOpen(true)}
              title="تصفّح الحسابات"
              className="flex items-center gap-2 px-3 h-10 rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/25 transition-colors"
            >
              <Users size={16} />
              <span className="hidden sm:block font-mono text-xs">{selectedAccount}</span>
            </button>
            <button className="relative w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-gold hover:border-white/20 transition-colors">
              <Bell size={18} />
              <span className="absolute top-2 end-2.5 w-2 h-2 bg-gold rounded-full ring-2 ring-espresso" />
            </button>
            <button
              onClick={() => onNavigate("profile")}
              className={cn(
                "flex items-center gap-2.5 ps-1 pe-3 py-1 rounded-full border transition-colors",
                currentScreen === "profile"
                  ? "bg-white/10 border-white/20"
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              )}
            >
              <span className="w-8 h-8 rounded-full bg-gold text-espresso font-bold flex items-center justify-center">
                {account.initial}
              </span>
              <span className="hidden lg:block text-sm font-medium text-white/85 leading-none">
                {account.name}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile drawer ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 bg-espresso/50 backdrop-blur-sm z-50 md:hidden"
            />
            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 34 }}
              className="fixed inset-y-0 start-0 w-72 z-[55] md:hidden flex flex-col bg-espresso"
            >
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <Logo onDark />
                <button
                  onClick={() => setMobileOpen(false)}
                  className="text-white/60 hover:text-white"
                  aria-label="إغلاق"
                >
                  <X size={22} />
                </button>
              </div>
              {/* Track switcher (mobile) */}
              {onSelectMode && (
                <div className="px-4 pt-4">
                  <TrackToggle mode={mode} onSelect={switchTrack} layoutId="track-toggle-mobile" />
                </div>
              )}
              <nav className="flex-1 p-4 space-y-1.5">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = currentScreen === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => go(item.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors",
                        active ? "bg-copper text-white" : "text-white/55 hover:text-white hover:bg-white/5"
                      )}
                    >
                      <Icon size={18} />
                      <span className="font-medium">{item.label}</span>
                    </button>
                  );
                })}
              </nav>
              <div className="p-4 border-t border-white/10 space-y-1.5">
                <button
                  onClick={() => go("profile")}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-colors",
                    currentScreen === "profile"
                      ? "bg-copper text-white"
                      : "text-white/55 hover:text-white hover:bg-white/5"
                  )}
                >
                  <User size={18} />
                  <span className="font-medium">الملف الشخصي</span>
                </button>
                <button
                  onClick={() => go("landing")}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors"
                >
                  <LogOut size={18} />
                  <span>تسجيل الخروج</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Full-width content ─────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto scroll-warm">{children}</main>

      <AccountBrowser
        track={mode === "business" ? "business" : "individuals"}
        open={browserOpen}
        onClose={() => setBrowserOpen(false)}
      />
    </div>
  );
}
