import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format an integer with Arabic-Saudi thousands grouping (Western digits by default). */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

/** Format a currency amount in SAR, e.g. "15,500 ر.س". */
export function formatSAR(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}${formatNumber(Math.abs(value))} ر.س`;
}
