import type { SlabAITool, ToolCatalogEntry, ToolCategory, ToolField, ModelClass, SafetyClass, SlabAIToolStatus } from "./types";
import { remnantPitchSchema } from "./remnant-pitch/schema";
import { REMNANT_APPLICATION_OPTIONS } from "./remnant-pitch/schema";
import { machineTroubleshooterSchema } from "./machine-troubleshooter/schema";
import { quoteScopeSchema } from "./quote-scope/schema";
import { stoneCareSchema } from "./stone-care/schema";
import { accountBriefSchema } from "./account-brief/schema";
import type { ZodType } from "zod";
import { z } from "zod";

export type ClientTool = {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  category: ToolCategory;
  keywords: string[];
  icon: string;
  modelClass: ModelClass;
  safetyClass: SafetyClass;
  status: SlabAIToolStatus;
  featured?: boolean;
  fields: ToolField[];
  formSchema: ZodType<Record<string, unknown>>;
  outputFormat: string;
  promptVersion: string;
  evidencePolicy?: string;
  relatedTools?: string[];
  emptyStateHint: string;
  allowedActions?: string[];
  knowledgeEnabled?: boolean;
  knowledgeSourceTypes?: string[];
};

function comingSoon(partial: {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  category: ToolCategory;
  icon: string;
  keywords?: string[];
}): ClientTool {
  return {
    ...partial,
    keywords: partial.keywords ?? [],
    modelClass: "fast",
    safetyClass: "normal",
    status: "coming-soon",
    fields: [],
    formSchema: z.object({}),
    outputFormat: "markdown-sections",
    promptVersion: "0.0.0",
    emptyStateHint: "This tool is planned for a future release.",
  };
}

export const CLIENT_TOOLS: ClientTool[] = [
  {
    id: "remnant-pitch",
    slug: "remnant-pitch",
    title: "Remnant Marketing Generator",
    shortDescription: "Turn leftover slabs into retail listings, social posts, and sales outreach.",
    description:
      "Helps remnant and sales teams convert leftover material into sellable opportunities with dimension-aware application ideas and professional marketing copy. Does not invent pricing.",
    category: "sales-estimating",
    keywords: ["remnant", "marketing", "sales", "listing", "social", "email", "leftover", "slab"],
    icon: "Gem",
    modelClass: "fast",
    safetyClass: "normal",
    status: "live",
    featured: true,
    fields: [
      {
        name: "materialType",
        label: "Material type",
        type: "select",
        required: true,
        options: [
          { value: "Quartz", label: "Quartz" },
          { value: "Granite", label: "Granite" },
          { value: "Marble", label: "Marble" },
          { value: "Quartzite", label: "Quartzite" },
          { value: "Porcelain", label: "Porcelain" },
          { value: "Solid Surface", label: "Solid surface" },
          { value: "Other", label: "Other" },
        ],
      },
      { name: "manufacturer", label: "Manufacturer / brand", type: "text", placeholder: "e.g. Cambria, Cosentino, MSI" },
      { name: "colorName", label: "Color / name", type: "text", required: true, placeholder: "e.g. Calacatta Laza" },
      { name: "lengthIn", label: "Length (inches)", type: "number", required: true, min: 1, max: 200, step: 0.25 },
      { name: "widthIn", label: "Width (inches)", type: "number", required: true, min: 1, max: 200, step: 0.25 },
      {
        name: "thickness",
        label: "Thickness",
        type: "select",
        required: true,
        options: [
          { value: "2 cm", label: "2 cm" },
          { value: "3 cm", label: "3 cm" },
          { value: "1.2 cm", label: "1.2 cm" },
          { value: "Other", label: "Other" },
        ],
      },
      {
        name: "finish",
        label: "Finish",
        type: "select",
        required: true,
        options: [
          { value: "Polished", label: "Polished" },
          { value: "Honed", label: "Honed" },
          { value: "Leathered", label: "Leathered" },
          { value: "Matte", label: "Matte" },
          { value: "Other", label: "Other" },
        ],
      },
      {
        name: "colorPalette",
        label: "Color palette",
        type: "text",
        placeholder: "Warm whites, soft gray veining…",
        helpText: "Optional notes for marketing tone.",
      },
      { name: "quantity", label: "Approximate quantity", type: "number", required: true, min: 1, max: 50, step: 1 },
      {
        name: "possibleApplication",
        label: "Possible application focus",
        type: "select",
        required: true,
        options: [...REMNANT_APPLICATION_OPTIONS],
      },
      { name: "notes", label: "Additional notes", type: "textarea", placeholder: "Edge chips, bookmatch leftover, showroom location…" },
    ],
    formSchema: remnantPitchSchema,
    outputFormat: "markdown-sections",
    promptVersion: "1.0.0",
    evidencePolicy: "Dimension reasoning from user inputs only. No inventing price or inventory status.",
    relatedTools: ["quote-scope"],
    emptyStateHint:
      "Generate an opportunity summary, retail listing, social post, sales email, and dimension-aware application ideas.",
    allowedActions: [],
    knowledgeEnabled: false,
  },
  {
    id: "machine-troubleshooter",
    slug: "machine-troubleshooter",
    title: "Bridge Saw & CNC Troubleshooter",
    shortDescription: "Safe diagnostic assistant for chipping, wandering, finish, and tooling issues.",
    description:
      "Helps operators diagnose bridge saw and CNC problems with ranked causes, safe checks, material considerations, and escalation guidance. Never invents authoritative machine setpoints and never bypasses safety systems.",
    category: "shop-operations",
    keywords: ["cnc", "bridge saw", "chipping", "blade", "troubleshoot", "quartz", "porcelain", "feed rate", "polishing"],
    icon: "Wrench",
    modelClass: "reasoning",
    safetyClass: "machine-guidance",
    status: "live",
    featured: true,
    fields: [
      { name: "manufacturer", label: "Machine manufacturer", type: "text", required: true, placeholder: "e.g. Breton, Park Industries" },
      { name: "model", label: "Machine model", type: "text", required: true },
      {
        name: "machineType",
        label: "Machine type",
        type: "select",
        required: true,
        options: [
          { value: "bridge-saw", label: "Bridge saw" },
          { value: "cnc", label: "CNC" },
          { value: "waterjet", label: "Waterjet" },
          { value: "other", label: "Other" },
        ],
      },
      { name: "material", label: "Material", type: "text", required: true, placeholder: "e.g. Quartz, Quartzite, Porcelain" },
      { name: "materialThickness", label: "Material thickness", type: "text", required: true, placeholder: "e.g. 3 cm" },
      { name: "bladeOrTool", label: "Blade / tool", type: "text", required: true, placeholder: "Blade brand/type or CNC tool" },
      { name: "bladeDiameter", label: "Blade diameter (if known)", type: "text", placeholder: "e.g. 16 in" },
      { name: "operation", label: "Operation", type: "text", required: true, placeholder: "Straight cut, miter, polish pass…" },
      {
        name: "symptom",
        label: "Symptom",
        type: "select",
        required: true,
        options: [
          { value: "quartz-chipping", label: "Quartz chipping" },
          { value: "quartzite-deflection", label: "Quartzite deflection" },
          { value: "porcelain-chipping", label: "Porcelain chipping" },
          { value: "miter-breakout", label: "Miter breakout" },
          { value: "blade-wandering", label: "Blade wandering" },
          { value: "poor-cut-finish", label: "Poor cut finish" },
          { value: "excessive-blade-wear", label: "Excessive blade wear" },
          { value: "tool-marks", label: "Tool marks" },
          { value: "cnc-polishing-problem", label: "CNC polishing problem" },
          { value: "other", label: "Other" },
        ],
      },
      {
        name: "currentRpm",
        label: "Current RPM (if known)",
        type: "text",
        helpText: "Operator-reported only. AI will not treat this as an authoritative setpoint.",
      },
      {
        name: "currentFeedRate",
        label: "Current feed rate (if known)",
        type: "text",
        helpText: "Operator-reported only. Verify against manufacturer/tooling specs.",
      },
      { name: "waterCondition", label: "Water condition / pressure notes", type: "text" },
      { name: "recentMaintenance", label: "Recent maintenance", type: "textarea" },
      {
        name: "operatorObservations",
        label: "Operator observations",
        type: "textarea",
        required: true,
        placeholder: "When it started, sound/vibration, edge quality, photo notes…",
      },
    ],
    formSchema: machineTroubleshooterSchema,
    outputFormat: "markdown-sections",
    promptVersion: "1.0.0",
    evidencePolicy:
      "No fabricated machine setpoints. Prefer verification language. Escalate to supervisor/maintenance/OEM when needed.",
    relatedTools: [],
    emptyStateHint:
      "Receive ranked causes, safe immediate checks, material notes, a diagnostic sequence, and escalation guidance — without invented RPM/feed specs.",
    allowedActions: [],
    knowledgeEnabled: true,
    knowledgeSourceTypes: ["sop", "machine_manual", "tooling_manual", "safety"],
  },
  {
    id: "quote-scope",
    slug: "quote-scope",
    title: "Quote & Fabrication Scope Drafter",
    shortDescription: "Draft professional scope narratives — never invents pricing.",
    description:
      "Produces customer-ready fabrication scope language: included work, assumptions, exclusions, and a proposal narrative. Does not calculate prices and does not replace eliteOS quote calculators.",
    category: "sales-estimating",
    keywords: ["quote", "scope", "proposal", "fabrication", "estimating", "exclusions", "assumptions"],
    icon: "FileText",
    modelClass: "reasoning",
    safetyClass: "operational",
    status: "live",
    featured: true,
    fields: [
      { name: "customerProjectName", label: "Customer / project name", type: "text", required: true },
      {
        name: "projectType",
        label: "Project type",
        type: "select",
        required: true,
        options: [
          { value: "residential-kitchen", label: "Residential kitchen" },
          { value: "residential-bath", label: "Residential bath" },
          { value: "commercial", label: "Commercial" },
          { value: "remodel", label: "Remodel" },
          { value: "new-construction", label: "New construction" },
          { value: "other", label: "Other" },
        ],
      },
      { name: "roomArea", label: "Room / area", type: "text", required: true, placeholder: "Kitchen island + perimeter" },
      {
        name: "approximateSqFt",
        label: "Approximate square footage",
        type: "number",
        min: 1,
        max: 50000,
        step: 0.5,
        helpText: "Optional. Used for narrative context only — not for pricing math.",
      },
      { name: "materialColor", label: "Material / color", type: "text", required: true },
      { name: "materialGroup", label: "Material group / tier", type: "text", placeholder: "Optional" },
      {
        name: "thickness",
        label: "Thickness",
        type: "select",
        required: true,
        options: [
          { value: "2 cm", label: "2 cm" },
          { value: "3 cm", label: "3 cm" },
          { value: "Other", label: "Other" },
        ],
      },
      { name: "edgeProfile", label: "Edge profile", type: "text", required: true, placeholder: "e.g. Eased, Ogee, Dupont" },
      { name: "sinkCutouts", label: "Sink cutouts", type: "number", required: true, min: 0, max: 20, step: 1 },
      { name: "cooktopCutouts", label: "Cooktop cutouts", type: "number", required: true, min: 0, max: 10, step: 1 },
      { name: "faucetHoles", label: "Faucet holes", type: "number", required: true, min: 0, max: 20, step: 1 },
      { name: "backsplash", label: "Backsplash", type: "text", placeholder: '4" splash / full height / none' },
      { name: "waterfallPanels", label: "Waterfall panels", type: "text" },
      { name: "tearOut", label: "Tear-out included", type: "checkbox" },
      { name: "templateRequired", label: "Template required", type: "checkbox" },
      { name: "installationRequired", label: "Installation required", type: "checkbox" },
      { name: "customerSuppliedItems", label: "Customer-supplied items", type: "textarea", placeholder: "Sink, faucet, cooktop…" },
      { name: "projectNotes", label: "Project notes", type: "textarea" },
      {
        name: "loadedQuoteId",
        label: "Loaded quote ID (optional)",
        type: "text",
        placeholder: "Paste quote UUID from search",
        helpText: "Use Load existing quote below, or paste a governed quote UUID. AI drafts narrative only — does not change the quote.",
      },
      {
        name: "loadedAccountId",
        label: "Loaded account ID (optional)",
        type: "text",
        placeholder: "Account Directory UUID after search/select",
        helpText: "Requires Account Directory access. Ambiguous names must be selected — IDs define relationships.",
      },
    ],
    formSchema: quoteScopeSchema,
    outputFormat: "markdown-sections",
    promptVersion: "1.1.0",
    evidencePolicy: "Narrative scope only. Pricing authority remains eliteOS Brain calculators. Company data and knowledge stay separate.",
    relatedTools: ["remnant-pitch", "stone-care", "account-brief"],
    emptyStateHint:
      "Draft included scope, fabrication/install language, assumptions, exclusions, and a customer-friendly proposal narrative — with no invented prices.",
    allowedActions: ["retrieveQuote", "searchQuotes", "searchAccounts", "retrieveAccount"],
    knowledgeEnabled: true,
    knowledgeSourceTypes: ["quote_policy", "sales_policy", "install_standard", "sop"],
  },
  {
    id: "account-brief",
    slug: "account-brief",
    title: "Account Brief",
    shortDescription: "Concise operational briefing before a call — company data only.",
    description:
      "Loads a selected Account Directory record (and related quote/job summaries when authorized) to draft a pre-meeting brief. Read-only. No CRM scoring or invented sentiment.",
    category: "account-management",
    keywords: ["account", "brief", "meeting", "customer", "360"],
    icon: "Building2",
    modelClass: "fast",
    safetyClass: "operational",
    status: "live",
    featured: true,
    fields: [
      {
        name: "accountSearch",
        label: "Account search",
        type: "text",
        placeholder: "Type a name, then select from results",
        helpText: "Requires Account Directory access. Ambiguous matches must be selected — AI will not guess.",
      },
      {
        name: "accountId",
        label: "Selected account ID",
        type: "text",
        placeholder: "Filled when you select an account",
        helpText: "Authoritative Account Directory UUID after disambiguation.",
      },
      {
        name: "focusQuestion",
        label: "Optional focus",
        type: "textarea",
        placeholder: "e.g. What should I know before tomorrow's install discussion?",
      },
    ],
    formSchema: accountBriefSchema,
    outputFormat: "markdown-sections",
    promptVersion: "1.0.0",
    evidencePolicy: "Operational company data only unless knowledge is separately enabled.",
    relatedTools: ["quote-scope"],
    emptyStateHint: "Search and select an account, then generate a concise pre-call briefing from governed company data.",
    allowedActions: ["searchAccounts", "retrieveAccount", "listAccountJobs", "searchQuotes"],
    knowledgeEnabled: false,
  },
  {
    id: "stone-care",
    slug: "stone-care",
    title: "Stone Care & Natural Variance Guide",
    shortDescription: "Customer-ready care instructions and natural variation expectations.",
    description:
      "Creates a polished customer document covering cleaning, heat/impact, sealing, natural characteristics, and expectations. Does not invent manufacturer warranties.",
    category: "customer-care",
    keywords: ["care", "cleaning", "seal", "variance", "veining", "warranty", "customer", "natural stone"],
    icon: "Sparkles",
    modelClass: "fast",
    safetyClass: "normal",
    status: "live",
    featured: true,
    fields: [
      { name: "material", label: "Material", type: "text", required: true, placeholder: "Granite, Quartz, Marble…" },
      { name: "manufacturer", label: "Manufacturer", type: "text", placeholder: "Optional" },
      { name: "productColor", label: "Product / color", type: "text", required: true },
      {
        name: "materialClass",
        label: "Natural vs engineered",
        type: "select",
        required: true,
        options: [
          { value: "natural", label: "Natural stone" },
          { value: "engineered", label: "Engineered" },
          { value: "unknown", label: "Unknown / mixed" },
        ],
      },
      {
        name: "finish",
        label: "Finish",
        type: "select",
        required: true,
        options: [
          { value: "Polished", label: "Polished" },
          { value: "Honed", label: "Honed" },
          { value: "Leathered", label: "Leathered" },
          { value: "Matte", label: "Matte" },
          { value: "Other", label: "Other" },
        ],
      },
      { name: "application", label: "Application", type: "text", required: true, placeholder: "Kitchen counters, vanity…" },
      {
        name: "environment",
        label: "Indoor / outdoor",
        type: "select",
        required: true,
        options: [
          { value: "indoor", label: "Indoor" },
          { value: "outdoor", label: "Outdoor" },
          { value: "mixed", label: "Mixed" },
        ],
      },
      {
        name: "sealingStatus",
        label: "Sealing status",
        type: "select",
        required: true,
        options: [
          { value: "sealed", label: "Sealed" },
          { value: "unsealed", label: "Unsealed" },
          { value: "not-applicable", label: "Not applicable" },
          { value: "unknown", label: "Unknown" },
        ],
      },
      { name: "specialNotes", label: "Special notes", type: "textarea" },
    ],
    formSchema: stoneCareSchema,
    outputFormat: "markdown-sections",
    promptVersion: "1.0.0",
    evidencePolicy: "General care language only unless manufacturer documentation is supplied via governed sources.",
    relatedTools: ["quote-scope"],
    emptyStateHint:
      "Generate a customer care guide covering cleaning, heat/impact, sealing, natural characteristics, and expectations.",
    allowedActions: [],
    knowledgeEnabled: true,
    knowledgeSourceTypes: ["material_care", "manufacturer", "sop"],
  },
  comingSoon({
    id: "commercial-bid",
    slug: "commercial-bid",
    title: "Commercial B2B Bid Drafter",
    shortDescription: "Structured commercial bid narrative for B2B opportunities.",
    description: "Coming soon — draft commercial bid language with governed account context.",
    category: "sales-estimating",
    icon: "Briefcase",
    keywords: ["commercial", "bid", "b2b"],
  }),
  comingSoon({
    id: "yield-assistant",
    slug: "yield-assistant",
    title: "Yield Assistant",
    shortDescription: "Remnant and nest awareness to improve material yield conversations.",
    description: "Coming soon — help estimators discuss yield options without inventing inventory.",
    category: "sales-estimating",
    icon: "LayoutGrid",
    keywords: ["yield", "nest", "slab"],
  }),
  comingSoon({
    id: "install-defect-sop",
    slug: "install-defect-sop",
    title: "Installation Defect & Seam SOP Generator",
    shortDescription: "Standard operating language for seam and install defect responses.",
    description: "Coming soon — generate SOPs for common install and seam issues.",
    category: "shop-operations",
    icon: "ClipboardList",
    keywords: ["install", "seam", "sop", "defect"],
  }),
  comingSoon({
    id: "natural-variance-expectations",
    slug: "natural-variance-expectations",
    title: "Natural Variance / Customer Expectation Document",
    shortDescription: "Dedicated expectation documents for natural stone characteristics.",
    description: "Coming soon — focused customer expectation packets for natural variance.",
    category: "customer-care",
    icon: "ScrollText",
    keywords: ["variance", "expectations", "natural"],
  }),
];

const bySlug = new Map(CLIENT_TOOLS.map((t) => [t.slug, t]));
const byId = new Map(CLIENT_TOOLS.map((t) => [t.id, t]));

export function getClientToolBySlug(slug: string): ClientTool | undefined {
  return bySlug.get(slug);
}

export function getClientToolById(id: string): ClientTool | undefined {
  return byId.get(id);
}

export function listClientCatalog(): ToolCatalogEntry[] {
  return CLIENT_TOOLS.map((tool) => {
    return {
      id: tool.id,
      slug: tool.slug,
      title: tool.title,
      shortDescription: tool.shortDescription,
      description: tool.description,
      category: tool.category,
      keywords: tool.keywords,
      icon: tool.icon,
      modelClass: tool.modelClass,
      safetyClass: tool.safetyClass,
      status: tool.status,
      featured: tool.featured,
      fields: tool.fields,
      outputFormat: tool.outputFormat,
      promptVersion: tool.promptVersion,
      evidencePolicy: tool.evidencePolicy,
      relatedTools: tool.relatedTools,
      emptyStateHint: tool.emptyStateHint,
      fieldNames: tool.fields.map((f) => f.name),
    };
  });
}

export function searchClientTools(query: string, category?: ToolCategory | "all"): ToolCatalogEntry[] {
  const q = query.trim().toLowerCase();
  return listClientCatalog().filter((tool) => {
    if (category && category !== "all" && tool.category !== category) return false;
    if (!q) return true;
    const haystack = [tool.title, tool.shortDescription, tool.description, tool.category, ...tool.keywords]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

/** Compatibility helper — client tools are usable where SlabAITool shape is needed without prompts. */
export function asWorkspaceTool(tool: ClientTool): SlabAITool {
  return {
    ...tool,
    systemPrompt: "",
    buildPrompt: () => "",
  };
}
