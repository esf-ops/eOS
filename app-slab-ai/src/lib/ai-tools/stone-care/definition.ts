import type { SlabAITool } from "../types";
import { buildStoneCarePrompt, STONE_CARE_PROMPT_VERSION, stoneCareSystemPrompt } from "./prompt";
import { stoneCareSchema } from "./schema";

export const stoneCareTool: SlabAITool = {
  id: "stone-care",
  slug: "stone-care",
  title: "Stone Care & Natural Variance Guide",
  shortDescription: "Customer-ready care instructions and natural variation expectations.",
  description:
    "Creates a polished customer document covering cleaning, heat/impact, sealing, natural characteristics, and expectations. Does not invent manufacturer warranties.",
  category: "customer-care",
  keywords: [
    "care",
    "cleaning",
    "seal",
    "variance",
    "veining",
    "warranty",
    "customer",
    "natural stone",
  ],
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
  promptVersion: STONE_CARE_PROMPT_VERSION,
  systemPrompt: stoneCareSystemPrompt,
  buildPrompt: buildStoneCarePrompt,
  evidencePolicy: "General care language only unless manufacturer documentation is supplied via governed sources.",
  relatedTools: ["quote-scope"],
  allowedActions: [],
  knowledgeEnabled: true,
  knowledgeSourceTypes: ["material_care", "manufacturer", "sop"],
  emptyStateHint:
    "Generate a customer care guide covering cleaning, heat/impact, sealing, natural characteristics, and expectations.",
};
