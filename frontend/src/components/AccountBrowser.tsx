/* ============================================================================
   Account browser — a QA / spot-check tool.

   Lets you load ANY of the 1000 individual or 500 SME personas live through the
   real engines (no mock data, no hardcoded persona). Every row carries enough
   identifying detail to find a specific ARCHETYPE quickly — a retired renter who
   fails eligibility, a distressed manufacturing SME, and so on.

   This is deliberately plain: it is a testing instrument, not a demo screen.
   The "demo shortlist" for the judged run is a separate concern and is NOT
   baked in here — every account is equally reachable.
   ============================================================================ */

import { useMemo, useState } from "react";
import { api } from "../lib/api";
import {
  getAccount,
  setAccount,
  isDemoAccount,
  type BusinessAccount,
  type IndividualAccount,
  type Track,
} from "../lib/accountStore";
import { useApi } from "../lib/useApi";
import { Modal } from "./Modal";

const EMPLOYMENT_AR: Record<string, string> = { employee: "موظف", retired: "متقاعد" };
const HOUSING_AR: Record<string, string> = { mortgage: "رهن عقاري", rent: "إيجار" };
const TIER_AR: Record<string, string> = { micro: "متناهية الصغر", small: "صغيرة", medium: "متوسطة" };
const SECTOR_AR: Record<string, string> = {
  trade: "تجارة",
  services: "خدمات",
  manufacturing: "تصنيع",
};
const ARCHETYPE_AR: Record<string, string> = {
  healthy: "سليمة",
  gap_risk: "فجوة متوقعة",
  declining: "إيرادات متراجعة",
  distressed: "متعثرة",
};

type IndividualFilter = "all" | "eligible" | "ineligible" | "retired" | "mortgage";
type BusinessFilter = "all" | "healthy" | "gap_risk" | "declining" | "distressed";

const PAGE_SIZE = 40;

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
        active
          ? "bg-copper text-white"
          : "bg-cream-deep text-ink-soft hover:text-ink border border-line"
      }`}
    >
      {children}
    </button>
  );
}

function IndividualsList({ onPick }: { onPick: (accountNumber: string) => void }) {
  const { state } = useApi(api.getIndividualAccounts, []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<IndividualFilter>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const current = getAccount("individuals");

  const rows = useMemo(() => {
    const all: IndividualAccount[] = state.data?.accounts ?? [];
    const q = query.trim();
    return all.filter((a) => {
      if (q && !a.accountNumber.includes(q)) return false;
      if (filter === "eligible") return a.eligible;
      if (filter === "ineligible") return !a.eligible;
      if (filter === "retired") return a.employmentType === "retired";
      if (filter === "mortgage") return a.housingStatus === "mortgage";
      return true;
    });
  }, [state.data, query, filter]);

  if (state.status === "loading") return <p className="p-6 text-sm text-ink-soft">جارٍ تحميل الحسابات…</p>;
  if (state.status === "error")
    return <p className="p-6 text-sm text-red-600">تعذّر تحميل الحسابات: {state.error}</p>;

  return (
    <div className="flex flex-col gap-3">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setLimit(PAGE_SIZE);
        }}
        placeholder="ابحث برقم الحساب… (مثال: 100000009)"
        className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-copper"
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "الكل"],
            ["ineligible", "غير مؤهل"],
            ["eligible", "مؤهل"],
            ["retired", "متقاعد"],
            ["mortgage", "صاحب رهن"],
          ] as [IndividualFilter, string][]
        ).map(([key, label]) => (
          <Chip
            key={key}
            active={filter === key}
            onClick={() => {
              setFilter(key);
              setLimit(PAGE_SIZE);
            }}
          >
            {label}
          </Chip>
        ))}
      </div>

      <p className="text-xs text-ink-soft">{rows.length} حساب</p>

      <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-line">
        {rows.slice(0, limit).map((a) => {
          const active = a.accountNumber === current;
          return (
            <button
              key={a.accountNumber}
              type="button"
              onClick={() => onPick(a.accountNumber)}
              className={`flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2 text-right text-sm transition last:border-0 hover:bg-cream-deep ${
                active ? "bg-copper/10" : ""
              }`}
            >
              <span className="flex flex-col items-start gap-0.5">
                <span className="font-mono text-xs text-ink-soft">
                  {a.accountNumber}
                  {isDemoAccount("individuals", a.accountNumber) && (
                    <span className="mr-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 ">
                      العميل التجريبي
                    </span>
                  )}
                </span>
                <span className="text-ink">
                  {a.age} سنة · {EMPLOYMENT_AR[a.employmentType] ?? a.employmentType} ·{" "}
                  {HOUSING_AR[a.housingStatus] ?? a.housingStatus} · الشريحة {a.incomeBracket}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    a.eligible
                      ? "bg-emerald-500/15 text-emerald-700 "
                      : "bg-red-500/15 text-red-700 "
                  }`}
                >
                  {a.eligible ? "مؤهل" : "غير مؤهل"}
                </span>
                <span className="font-mono text-[11px] text-ink-soft">
                  DBR {a.salaryDbr}٪ · {a.grossSalary.toLocaleString("en-US")} ر.س
                </span>
              </span>
            </button>
          );
        })}
        {rows.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-soft">لا توجد نتائج مطابقة.</p>
        )}
      </div>

      {limit < rows.length && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE_SIZE)}
          className="rounded-lg border border-line py-2 text-sm text-ink-soft hover:bg-cream-deep"
        >
          عرض المزيد ({rows.length - limit} متبقٍ)
        </button>
      )}
    </div>
  );
}

function BusinessList({ onPick }: { onPick: (accountNumber: string) => void }) {
  const { state } = useApi(api.getBusinessAccounts, []);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BusinessFilter>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const current = getAccount("business");

  const rows = useMemo(() => {
    const all: BusinessAccount[] = state.data?.accounts ?? [];
    const q = query.trim();
    return all.filter((a) => {
      if (q && !a.accountNumber.includes(q)) return false;
      if (filter === "all") return true;
      return a.healthArchetype === filter;
    });
  }, [state.data, query, filter]);

  if (state.status === "loading") return <p className="p-6 text-sm text-ink-soft">جارٍ تحميل المنشآت…</p>;
  if (state.status === "error")
    return <p className="p-6 text-sm text-red-600">تعذّر تحميل المنشآت: {state.error}</p>;

  return (
    <div className="flex flex-col gap-3">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setLimit(PAGE_SIZE);
        }}
        placeholder="ابحث برقم الحساب… (مثال: 300000001)"
        className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-copper"
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["all", "الكل"],
            ["healthy", "سليمة"],
            ["gap_risk", "فجوة متوقعة"],
            ["declining", "إيرادات متراجعة"],
            ["distressed", "متعثرة"],
          ] as [BusinessFilter, string][]
        ).map(([key, label]) => (
          <Chip
            key={key}
            active={filter === key}
            onClick={() => {
              setFilter(key);
              setLimit(PAGE_SIZE);
            }}
          >
            {label}
          </Chip>
        ))}
      </div>

      <p className="text-xs text-ink-soft">{rows.length} منشأة</p>

      <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-line">
        {rows.slice(0, limit).map((a) => {
          const active = a.accountNumber === current;
          const healthy = a.cashflowPositive3m && a.revenueGrowing;
          return (
            <button
              key={a.accountNumber}
              type="button"
              onClick={() => onPick(a.accountNumber)}
              className={`flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2 text-right text-sm transition last:border-0 hover:bg-cream-deep ${
                active ? "bg-copper/10" : ""
              }`}
            >
              <span className="flex flex-col items-start gap-0.5">
                <span className="font-mono text-xs text-ink-soft">
                  {a.accountNumber}
                  {isDemoAccount("business", a.accountNumber) && (
                    <span className="mr-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 ">
                      المنشأة التجريبية
                    </span>
                  )}
                </span>
                <span className="text-ink">
                  {TIER_AR[a.sizeTier] ?? a.sizeTier} · {SECTOR_AR[a.sector] ?? a.sector} ·{" "}
                  {a.employees} موظف
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                    healthy
                      ? "bg-emerald-500/15 text-emerald-700 "
                      : "bg-amber-500/15 text-amber-700 "
                  }`}
                >
                  {ARCHETYPE_AR[a.healthArchetype] ?? a.healthArchetype}
                </span>
                <span className="font-mono text-[11px] text-ink-soft">
                  {Math.round(a.annualRevenue / 1000).toLocaleString("en-US")}k ر.س/سنة
                </span>
              </span>
            </button>
          );
        })}
        {rows.length === 0 && (
          <p className="p-6 text-center text-sm text-ink-soft">لا توجد نتائج مطابقة.</p>
        )}
      </div>

      {limit < rows.length && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE_SIZE)}
          className="rounded-lg border border-line py-2 text-sm text-ink-soft hover:bg-cream-deep"
        >
          عرض المزيد ({rows.length - limit} متبقٍ)
        </button>
      )}
    </div>
  );
}

export function AccountBrowser({
  track,
  open,
  onClose,
}: {
  track: Track;
  open: boolean;
  onClose: () => void;
}) {
  const pick = (accountNumber: string) => {
    setAccount(track, accountNumber);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={track === "business" ? "تصفّح المنشآت (500)" : "تصفّح الحسابات (1000)"}
    >
      {track === "business" ? <BusinessList onPick={pick} /> : <IndividualsList onPick={pick} />}
    </Modal>
  );
}
