import { z } from "zod";
import type { SlabAITool, ToolCatalogEntry, ToolCategory } from "./types";
import { remnantPitchTool } from "./remnant-pitch/definition";
import { machineTroubleshooterTool } from "./machine-troubleshooter/definition";
import { quoteScopeTool } from "./quote-scope/definition";
import { stoneCareTool } from "./stone-care/definition";
import { accountBriefTool } from "./account-brief/definition";

function comingSoonTool(partial: {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  category: ToolCategory;
  icon: string;
  keywords?: string[];
}): SlabAITool {
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
    systemPrompt: "",
    buildPrompt: () => "",
    emptyStateHint: "This tool is planned for a future release.",
  };
}

const comingSoonTools: SlabAITool[] = [
  comingSoonTool({
    id: "commercial-bid",
    slug: "commercial-bid",
    title: "Commercial B2B Bid Drafter",
    shortDescription: "Structured commercial bid narrative for B2B opportunities.",
    description: "Coming soon — draft commercial bid language with governed account context.",
    category: "sales-estimating",
    icon: "Briefcase",
    keywords: ["commercial", "bid", "b2b"],
  }),
  comingSoonTool({
    id: "yield-assistant",
    slug: "yield-assistant",
    title: "Yield Assistant",
    shortDescription: "Remnant and nest awareness to improve material yield conversations.",
    description: "Coming soon — help estimators discuss yield options without inventing inventory.",
    category: "sales-estimating",
    icon: "LayoutGrid",
    keywords: ["yield", "nest", "slab"],
  }),
  comingSoonTool({
    id: "install-defect-sop",
    slug: "install-defect-sop",
    title: "Installation Defect & Seam SOP Generator",
    shortDescription: "Standard operating language for seam and install defect responses.",
    description: "Coming soon — generate SOPs for common install and seam issues.",
    category: "shop-operations",
    icon: "ClipboardList",
    keywords: ["install", "seam", "sop", "defect"],
  }),
  comingSoonTool({
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

const LIVE_TOOLS: SlabAITool[] = [
  remnantPitchTool,
  machineTroubleshooterTool,
  quoteScopeTool,
  stoneCareTool,
  accountBriefTool,
];

export const SLAB_AI_TOOLS: SlabAITool[] = [...LIVE_TOOLS, ...comingSoonTools];

const byId = new Map(SLAB_AI_TOOLS.map((t) => [t.id, t]));
const bySlug = new Map(SLAB_AI_TOOLS.map((t) => [t.slug, t]));

export function getToolById(id: string): SlabAITool | undefined {
  return byId.get(id);
}

export function getToolBySlug(slug: string): SlabAITool | undefined {
  return bySlug.get(slug);
}

export function requireToolById(id: string): SlabAITool {
  const tool = getToolById(id);
  if (!tool) {
    throw Object.assign(new Error(`Unknown tool id: ${id}`), { code: "UNKNOWN_TOOL", status: 404 });
  }
  if (tool.status !== "live") {
    throw Object.assign(new Error(`Tool is not available: ${id}`), {
      code: "TOOL_UNAVAILABLE",
      status: 400,
    });
  }
  return tool;
}

export function toCatalogEntry(tool: SlabAITool): ToolCatalogEntry {
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
}

export function listCatalog(): ToolCatalogEntry[] {
  return SLAB_AI_TOOLS.map(toCatalogEntry);
}

export function searchTools(
  query: string,
  category?: ToolCategory | "all"
): ToolCatalogEntry[] {
  const q = query.trim().toLowerCase();
  return listCatalog().filter((tool) => {
    if (category && category !== "all" && tool.category !== category) return false;
    if (!q) return true;
    const haystack = [
      tool.title,
      tool.shortDescription,
      tool.description,
      tool.category,
      ...tool.keywords,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}
