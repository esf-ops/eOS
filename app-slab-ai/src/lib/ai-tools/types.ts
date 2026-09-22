import type { ZodType } from "zod";

export type ToolCategory =
  | "sales-estimating"
  | "shop-operations"
  | "customer-care"
  | "purchasing"
  | "inventory"
  | "accounting"
  | "leadership"
  | "install"
  | "template"
  | "cad"
  | "production"
  | "hr"
  | "marketing"
  | "safety"
  | "quality-control"
  | "service"
  | "account-management";

export type ModelClass = "fast" | "reasoning";

export type SafetyClass = "normal" | "operational" | "machine-guidance";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "multiselect"
  | "checkbox";

export type ToolFieldOption = {
  value: string;
  label: string;
};

export type ToolField = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: ToolFieldOption[];
  min?: number;
  max?: number;
  step?: number;
};

export type SourceReference = {
  id: string;
  title: string;
  kind:
    | "manual"
    | "sop"
    | "catalog"
    | "pricing"
    | "job"
    | "account"
    | "knowledge"
    | "manufacturer"
    | "other";
  url?: string;
  excerpt?: string;
};

export type GenerationResultModel = {
  content: string;
  sources?: SourceReference[];
  warnings?: string[];
  assumptions?: string[];
};

export type SlabAIToolStatus = "live" | "coming-soon";

export type SlabAITool = {
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
  systemPrompt: string;
  buildPrompt: (values: Record<string, unknown>) => string;
  evidencePolicy?: string;
  relatedTools?: string[];
  emptyStateHint: string;
  /** Least-privilege governed Brain actions this tool may invoke. */
  allowedActions?: string[];
  /** Whether this tool should attempt knowledge retrieval. */
  knowledgeEnabled?: boolean;
  knowledgeSourceTypes?: string[];
};

export type ToolCatalogEntry = Omit<
  SlabAITool,
  "formSchema" | "systemPrompt" | "buildPrompt"
> & {
  fieldNames: string[];
};

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  "sales-estimating": "Sales & Estimating",
  "shop-operations": "Shop & Operations",
  "customer-care": "Customer Care",
  purchasing: "Purchasing",
  inventory: "Inventory",
  accounting: "Accounting",
  leadership: "Leadership",
  install: "Install",
  template: "Template",
  cad: "CAD",
  production: "Production",
  hr: "HR",
  marketing: "Marketing",
  safety: "Safety",
  "quality-control": "Quality Control",
  service: "Service",
  "account-management": "Account Management",
};

export const NAV_CATEGORIES: ToolCategory[] = [
  "sales-estimating",
  "shop-operations",
  "customer-care",
  "account-management",
];
