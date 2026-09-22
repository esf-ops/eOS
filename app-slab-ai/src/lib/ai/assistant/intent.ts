import type { AssistantIntent, AssistantThreadContext, ClarifyQuestion } from "./types";

const CARE_RE =
  /\b(care\s*(sheet|guide)|maintenance\s*guide|cleaning\s*(guide|instructions)|care\s*instructions)\b/i;
const SCOPE_RE = /\b(scope|proposal\s*narrative|fabrication\s*scope|draft\s*(a\s*)?scope)\b/i;
const BRIEF_RE = /\b(brief(ing)?|before\s+(i\s+)?call|account\s+snapshot|what.?s\s+going\s+on\s+with)\b/i;
const MACHINE_RE =
  /\b(chipping|chip|breakout|wandering|cnc|bridge\s*saw|troubleshoot|blade|miter\s+break)\b/i;
const REMNANT_RE = /\b(remnant|leftover\s+slab|marketing\s+(copy|listing)|social\s+post)\b/i;
const INVENTORY_RE =
  /\b(do\s+we\s+have|inventory|in\s+stock|on\s+(the\s+)?rack|find\s+(any\s+)?(material|slab|remnant))\b/i;
const QUOTE_RE = /\b(quote|estimate)\b/i;
const LATEST_QUOTE_RE = /\b(latest|recent|last)\s+quote\b/i;
const JOB_RE = /\b(job|jobs|open\s+work|moraware)\b/i;

export function classifyIntent(message: string, context: AssistantThreadContext): AssistantIntent {
  const m = message.trim();
  if (CARE_RE.test(m)) return "stone_care";
  if (SCOPE_RE.test(m) || (/\bturn\s+that\s+into\b/i.test(m) && context.quoteId)) return "quote_scope";
  // Plain "pull up / look up" loads context; explicit brief language drafts an artifact
  if (/^\s*(pull\s+up|look\s+up|open)\b/i.test(m) && !QUOTE_RE.test(m) && !BRIEF_RE.test(m)) {
    return "ops_lookup";
  }
  if (BRIEF_RE.test(m)) {
    if (LATEST_QUOTE_RE.test(m) || (QUOTE_RE.test(m) && context.accountId)) return "ops_lookup";
    return "account_brief";
  }
  if (MACHINE_RE.test(m)) return "machine_troubleshooter";
  if (REMNANT_RE.test(m)) return "remnant_pitch";
  if (INVENTORY_RE.test(m)) return "inventory_search";
  if (LATEST_QUOTE_RE.test(m) || (QUOTE_RE.test(m) && /\b(show|find|pull|get)\b/i.test(m))) return "ops_lookup";
  if (JOB_RE.test(m) && /\b(show|list|open|what)\b/i.test(m)) return "ops_lookup";
  if (context.quoteId && /\b(scope|draft|customer[- ]ready)\b/i.test(m)) return "quote_scope";
  if (context.accountId && /\b(brief|summarize|call)\b/i.test(m)) return "account_brief";
  return "general";
}

/** Extract quoted/likely account or product phrases from free text. */
export function extractEntityHints(message: string): {
  accountHint?: string;
  quoteHint?: string;
  manufacturer?: string;
  productColor?: string;
  material?: string;
} {
  const m = message.trim();
  const out: ReturnType<typeof extractEntityHints> = {};

  const quoted = m.match(/["“]([^"”]{2,80})["”]/);
  if (quoted) out.accountHint = quoted[1].trim();

  const pullUp = m.match(/\b(?:pull\s+up|look\s+up|brief(?:ing)?\s+(?:me\s+)?(?:on|for)|about)\s+([A-Z][\w&.' -]{1,60})/i);
  if (pullUp && !out.accountHint) out.accountHint = pullUp[1].replace(/[?.!,]+$/, "").trim();

  const withName = m.match(/\bwith\s+([A-Z][\w&.' -]{1,60}?)(?:\?|$)/);
  if (withName && !out.accountHint) out.accountHint = withName[1].trim();

  const quoteNum = m.match(/\b(?:quote|estimate)\s+#?\s*([A-Z0-9][\w-]{2,40})/i);
  if (quoteNum) out.quoteHint = quoteNum[1].trim();

  // "care sheet for Cambria Whitendale" / "Cambria Whitendale"
  const careFor = m.match(/\b(?:for|about)\s+(Cambria|Cosentino|Silestone|MSI|HanStone|Caesarstone|Dekton|Neolith)\s+([A-Za-z0-9][\w -]{1,40})/i);
  if (careFor) {
    out.manufacturer = careFor[1];
    out.productColor = careFor[2].replace(/\b(kitchen|vanity|countertop|job).*$/i, "").trim();
  } else {
    const brandColor = m.match(/\b(Cambria|Cosentino|Silestone|MSI|HanStone|Caesarstone)\s+([A-Z][\w -]{1,40})/i);
    if (brandColor) {
      out.manufacturer = brandColor[1];
      out.productColor = brandColor[2].replace(/\b(quartz|care|guide|sheet|job).*$/i, "").trim();
    }
  }

  if (/\bquartzite\b/i.test(m)) out.material = "Quartzite";
  else if (/\bquartz\b/i.test(m)) out.material = "Quartz";
  else if (/\bgranite\b/i.test(m)) out.material = "Granite";
  else if (/\bmarble\b/i.test(m)) out.material = "Marble";
  else if (/\bporcelain\b/i.test(m)) out.material = "Porcelain";
  else if (out.manufacturer && /cambria|silestone|caesarstone|hanstone/i.test(out.manufacturer)) {
    out.material = "Quartz";
  }

  // Taj Mahal style material mentions
  const taj = m.match(/\b(Taj\s+Mahal|Calacatta\s+\w+|Whitendale|Brittanicca)\b/i);
  if (taj && !out.productColor) out.productColor = taj[1];

  return out;
}

export function inferStoneCareFields(
  message: string,
  hints: ReturnType<typeof extractEntityHints>
): { fields: Record<string, unknown>; missing: ClarifyQuestion[] } {
  const fields: Record<string, unknown> = {
    manufacturer: hints.manufacturer || "",
    productColor: hints.productColor || "",
    material: hints.material || (hints.manufacturer ? "Quartz" : ""),
    materialClass: hints.material === "Quartz" || /cambria|silestone|caesarstone|hanstone/i.test(hints.manufacturer || "")
      ? "engineered"
      : hints.material === "Quartzite" || hints.material === "Granite" || hints.material === "Marble"
        ? "natural"
        : "unknown",
    finish: "",
    application: "",
    environment: "indoor",
    sealingStatus: "unknown",
    specialNotes: message.slice(0, 500),
  };

  const missing: ClarifyQuestion[] = [];
  if (!fields.productColor) {
    missing.push({ id: "productColor", field: "productColor", prompt: "What product or color is this care guide for?" });
  }
  if (!fields.material) {
    missing.push({ id: "material", field: "material", prompt: "What material is it (quartz, quartzite, granite, marble, porcelain)?" });
  }
  // application is required by schema — ask only that if everything else known
  const appMatch = message.match(/\b(kitchen\s+counter(?:top)?s?|vanity|shower|fireplace|outdoor\s+kitchen)\b/i);
  if (appMatch) {
    fields.application = appMatch[1];
  } else {
    missing.push({
      id: "application",
      field: "application",
      prompt: "Is this for a kitchen countertop, vanity, shower, or another application?",
    });
  }

  const finishMatch = message.match(/\b(polished|honed|leathered|matte)\b/i);
  fields.finish = finishMatch ? finishMatch[1].replace(/^\w/, (c) => c.toUpperCase()) : "Polished";

  return { fields, missing };
}

export function inferMachineFields(message: string): { fields: Record<string, unknown>; missing: ClarifyQuestion[] } {
  const fields: Record<string, unknown> = {
    manufacturer: "",
    model: "",
    machineType: "bridge-saw",
    material: "",
    materialThickness: "3 cm",
    bladeOrTool: "",
    bladeDiameter: "",
    operation: "",
    symptom: "other",
    currentRpm: "",
    currentFeedRate: "",
    waterCondition: "",
    recentMaintenance: "",
    operatorObservations: message.slice(0, 2000),
  };

  if (/\bcnc\b/i.test(message)) fields.machineType = "cnc";
  if (/\bbridge\s*saw\b/i.test(message)) fields.machineType = "bridge-saw";
  if (/\bwaterjet\b/i.test(message)) fields.machineType = "waterjet";

  const mat = message.match(/\b(Taj\s+Mahal|quartzite|quartz|porcelain|granite|marble)\b/i);
  if (mat) fields.material = /taj/i.test(mat[1]) ? "Quartzite" : mat[1];

  if (/\bchipping|chip\b/i.test(message)) {
    fields.symptom = /\bporcelain\b/i.test(message)
      ? "porcelain-chipping"
      : /\bquartzite|taj\b/i.test(message)
        ? "quartzite-deflection"
        : "quartz-chipping";
  }
  if (/\bmitre|miter\b/i.test(message)) {
    fields.operation = "Miter";
    if (/\bchip|breakout\b/i.test(message)) fields.symptom = "miter-breakout";
  }

  const machine = message.match(/\b(BACA|Park|Breton|Donatoni|Prussiani|Intermac)\b/i);
  if (machine) {
    fields.manufacturer = /baca/i.test(machine[1]) ? "BACA" : machine[1];
    fields.model = /baca/i.test(machine[1]) ? "BACA" : machine[1];
  }

  const missing: ClarifyQuestion[] = [];
  if (!fields.manufacturer) {
    missing.push({ id: "manufacturer", field: "manufacturer", prompt: "Which machine manufacturer/model is this on (e.g. BACA, Park, Breton)?" });
  }
  if (!fields.bladeOrTool) {
    missing.push({ id: "bladeOrTool", field: "bladeOrTool", prompt: "What blade or CNC tool is installed?" });
  }
  if (!fields.material) {
    missing.push({ id: "material", field: "material", prompt: "What material are you cutting?" });
  }
  if (!fields.operation) fields.operation = "Cut";

  // Fill required schema mins with placeholders only after clarifying machine/tool
  if (!fields.model && fields.manufacturer) fields.model = String(fields.manufacturer);

  return { fields, missing };
}

export function skillIdForIntent(intent: AssistantIntent): string | null {
  switch (intent) {
    case "account_brief":
      return "account-brief";
    case "quote_scope":
      return "quote-scope";
    case "machine_troubleshooter":
      return "machine-troubleshooter";
    case "stone_care":
      return "stone-care";
    case "remnant_pitch":
      return "remnant-pitch";
    default:
      return null;
  }
}

export function defaultFollowUps(intent: AssistantIntent, context: AssistantThreadContext): string[] {
  const out: string[] = [];
  if (context.accountId) {
    out.push("Show me their latest quote.");
    out.push("Draft a customer-ready scope from the latest quote.");
  }
  if (context.quoteId) {
    out.push("Turn that into a scope I can send the customer.");
  }
  if (intent === "stone_care") out.push("Is there an approved manufacturer care document loaded?");
  if (intent === "machine_troubleshooter") out.push("What should I escalate to maintenance?");
  if (intent === "inventory_search") out.push("Could any of these work for a vanity?");
  if (!out.length) {
    out.push("Brief me on an account");
    out.push("Draft a quote scope");
    out.push("Troubleshoot a shop issue");
  }
  return out.slice(0, 4);
}
