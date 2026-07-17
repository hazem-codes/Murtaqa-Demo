/** Hex mirrors of the CSS chart tokens — Recharts needs real values, not var(). */
export const CHART = {
  copper: "#8B5E3C",
  sand: "#C9A87C",
  brown: "#6F4A2E",
  teal: "#5E8B87",
  green: "#7FA07C",
  ink: "#23303C",
  copperLight: "#B8855A",
  line: "#EBE4D9",
  creamDeep: "#F4EEE6",
  inkSoft: "#6B6154",
  positive: "#3F8E5F",
} as const;

/**
 * Per-category palette — tuned for high contrast between adjacent categories
 * (السكن vs الفواتير were both brown and blended together in the radial chart).
 * Index order matches spendingCategories: السكن، الغذاء، الفواتير، التسوق، الترفيه.
 */
export const CATEGORY_COLORS = [
  "#9B7050", // السكن — soft mocha / lighter brown
  "#C5A570", // الغذاء — matte gold / tan
  "#3A4B56", // الفواتير — muted slate/navy (clear contrast vs housing)
  "#52796F", // التسوق — muted teal
  CHART.green, // الترفيه — soft green
];
