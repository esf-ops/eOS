/**
 * Lightweight deterministic natural-language → structured filter parser for
 * Ask Sales Data. No AI APIs — phrase rules only.
 */

export type SalesQueryFiltersInput = {
  date_from?: string | null;
  date_to?: string | null;
  account?: string | null;
  salesperson?: string | null;
  text?: string | null;
  tags?: string[];
  min_sqft?: number | null;
  max_sqft?: number | null;
  missing_sqft?: boolean;
  limit?: number;
};

export type ParseSalesQueryResult = {
  filters: SalesQueryFiltersInput;
  chips: string[];
  confidence: "high" | "low";
  remainderText: string | null;
};

const TAG_PHRASES: ReadonlyArray<{ tags: string[]; patterns: RegExp[]; chip: string }> = [
  {
    tags: ["full_height_backsplash"],
    patterns: [/\bfhbs\b/i, /full[\s-]*height[\s-]*backsplash/i, /full height splash/i],
    chip: "Full height backsplash"
  },
  {
    tags: ["customer_service"],
    patterns: [/customer service/i, /\bservice jobs?\b/i, /\bwarranty\b/i, /\brepair\b/i],
    chip: "Customer service"
  },
  { tags: ["wet_bar"], patterns: [/wet bar/i, /bar top/i], chip: "Wet bar" },
  { tags: ["fireplace"], patterns: [/fireplace/i, /\bhearth\b/i], chip: "Fireplace" },
  { tags: ["vanity"], patterns: [/\bvanit(?:y|ies)\b/i], chip: "Vanity" },
  { tags: ["kitchen"], patterns: [/\bkitchen\b/i], chip: "Kitchen" },
  { tags: ["bath"], patterns: [/\bbath(?:room)?\b/i, /powder bath/i], chip: "Bath" },
  { tags: ["shower"], patterns: [/\bshower\b/i], chip: "Shower" },
  { tags: ["laundry"], patterns: [/\blaundry\b/i, /drop zone/i], chip: "Laundry" },
  { tags: ["tear_out"], patterns: [/tear[\s-]*out/i, /\bdemo\b/i], chip: "Tear out" },
  { tags: ["remnant"], patterns: [/\bremnants?\b/i, /\bremts?\b/i], chip: "Remnant" }
];

const MONTH_MAP: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function monthRange(year: number, monthIndex: number): { from: string; to: string } {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  return { from: ymd(start), to: ymd(end) };
}

function stripMatched(text: string, re: RegExp) {
  return text.replace(re, " ").replace(/\s+/g, " ").trim();
}

/**
 * Parse a natural-language sales query into structured Moraware filters.
 */
export function parseSalesQuery(raw: string, now = new Date()): ParseSalesQueryResult {
  let text = String(raw ?? "").trim();
  const filters: SalesQueryFiltersInput = { tags: [], limit: 100 };
  const chips: string[] = [];
  let structuredHits = 0;

  if (!text) {
    return { filters, chips, confidence: "low", remainderText: null };
  }

  // Date presets
  if (/\b(ytd|this year)\b/i.test(text)) {
    filters.date_from = `${now.getFullYear()}-01-01`;
    filters.date_to = ymd(now);
    chips.push("YTD");
    text = stripMatched(text, /\b(ytd|this year)\b/i);
    structuredHits += 1;
  } else if (/\bthis month\b/i.test(text)) {
    filters.date_from = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
    filters.date_to = ymd(now);
    chips.push("This month");
    text = stripMatched(text, /\bthis month\b/i);
    structuredHits += 1;
  } else if (/\blast month\b/i.test(text)) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const range = monthRange(d.getFullYear(), d.getMonth());
    filters.date_from = range.from;
    filters.date_to = range.to;
    chips.push("Last month");
    text = stripMatched(text, /\blast month\b/i);
    structuredHits += 1;
  }

  const monthInMatch = text.match(/\bin\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i);
  if (monthInMatch) {
    const key = monthInMatch[1].toLowerCase();
    const mi = MONTH_MAP[key];
    if (mi != null) {
      const range = monthRange(now.getFullYear(), mi);
      filters.date_from = range.from;
      filters.date_to = range.to;
      chips.push(`In ${monthInMatch[1]}`);
      text = stripMatched(text, monthInMatch[0]);
      structuredHits += 1;
    }
  }

  // Missing sqft
  if (/\b(missing sqft|no sqft|without sqft|jobs missing sqft)\b/i.test(text)) {
    filters.missing_sqft = true;
    if (!filters.tags!.includes("missing_sqft")) filters.tags!.push("missing_sqft");
    chips.push("Missing sqft");
    text = stripMatched(text, /\b(missing sqft|no sqft|without sqft|jobs missing sqft)\b/i);
    structuredHits += 1;
  }

  // Sqft thresholds
  const overMatch = text.match(/\b(?:over|greater than|more than|above)\s+(\d+(?:\.\d+)?)\s*sq\.?\s*ft\.?\b/i);
  if (overMatch) {
    filters.min_sqft = Number(overMatch[1]);
    chips.push(`Over ${overMatch[1]} sqft`);
    text = stripMatched(text, overMatch[0]);
    structuredHits += 1;
  }
  const underMatch = text.match(/\b(?:under|less than|below)\s+(\d+(?:\.\d+)?)\s*sq\.?\s*ft\.?\b/i);
  if (underMatch) {
    filters.max_sqft = Number(underMatch[1]);
    chips.push(`Under ${underMatch[1]} sqft`);
    text = stripMatched(text, underMatch[0]);
    structuredHits += 1;
  }

  // Tag phrases (before account extraction — avoids eating account names)
  for (const rule of TAG_PHRASES) {
    if (rule.patterns.some((re) => re.test(text))) {
      for (const tag of rule.tags) {
        if (!filters.tags!.includes(tag)) filters.tags!.push(tag);
      }
      if (!chips.includes(rule.chip)) chips.push(rule.chip);
      for (const re of rule.patterns) {
        text = stripMatched(text, re);
      }
      structuredHits += 1;
    }
  }

  // Remnant shorthand (rem alone is noisy — only when explicitly requested in query)
  if (/\b(remnant|remts?)\b/i.test(text) && !filters.tags!.includes("remnant")) {
    filters.tags!.push("remnant");
    chips.push("Remnant");
    text = stripMatched(text, /\b(remnant|remts?)\b/i);
    structuredHits += 1;
  }

  // Salesperson
  const byRepMatch = text.match(/\b(?:by|salesperson)\s+([a-z][a-z\s.'-]{1,40})/i);
  if (byRepMatch) {
    filters.salesperson = byRepMatch[1].trim();
    chips.push(`Salesperson: ${filters.salesperson}`);
    text = stripMatched(text, byRepMatch[0]);
    structuredHits += 1;
  }

  // Account — jobs for X / for X
  const jobsForMatch = text.match(/\b(?:jobs?\s+for|for)\s+([a-z0-9][a-z0-9\s.'&-]{2,60})/i);
  if (jobsForMatch) {
    let account = jobsForMatch[1].trim();
    account = account.replace(/\b(this year|ytd|this month|last month|in\s+\w+)\b.*$/i, "").trim();
    if (account.length >= 3) {
      filters.account = account;
      chips.push(`Account: ${account}`);
      text = stripMatched(text, jobsForMatch[0]);
      structuredHits += 1;
    }
  }

  // Strip filler words
  text = text
    .replace(/\b(show me|show|jobs?|moraware|please)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const remainderText = text.length >= 3 ? text : null;
  if (remainderText && structuredHits === 0) {
    filters.text = remainderText;
    chips.push("Text search");
  } else if (remainderText && structuredHits > 0) {
    filters.text = remainderText;
    chips.push("Text search");
  }

  const confidence: "high" | "low" = structuredHits > 0 ? "high" : remainderText ? "low" : "high";

  return { filters, chips, confidence, remainderText };
}

/** Example queries for quick-start chips in the UI. */
export const SALES_QUERY_EXAMPLES = [
  { label: "Full height backsplash jobs", query: "full height backsplash jobs" },
  { label: "Customer service jobs", query: "customer service jobs" },
  { label: "Jobs missing sqft", query: "jobs missing sqft" },
  { label: "Wet bar jobs", query: "wet bar jobs" },
  { label: "Jobs over 100 sqft", query: "jobs over 100 sqft" },
  { label: "This month", query: "this month" },
  { label: "YTD", query: "ytd" }
] as const;

export const MORAWARE_TAG_OPTIONS = [
  { id: "full_height_backsplash", label: "Full height backsplash" },
  { id: "customer_service", label: "Customer service" },
  { id: "tear_out", label: "Tear out" },
  { id: "remnant", label: "Remnant" },
  { id: "vanity", label: "Vanity" },
  { id: "kitchen", label: "Kitchen" },
  { id: "bath", label: "Bath" },
  { id: "wet_bar", label: "Wet bar" },
  { id: "fireplace", label: "Fireplace" },
  { id: "shower", label: "Shower" },
  { id: "laundry", label: "Laundry" },
  { id: "missing_sqft", label: "Missing sqft" }
] as const;
