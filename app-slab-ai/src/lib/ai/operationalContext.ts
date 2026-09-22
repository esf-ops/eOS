/**
 * Operational context assembly — typed blocks, limits, conflict detection.
 * Knowledge passages stay separate from company data.
 */
import type { AiQuoteDetail } from "@/lib/ai/actions";

export type OperationalSourceReference = {
  type: "quote" | "account" | "job" | "moraware" | "inventory" | "finance";
  entityId: string;
  label: string;
  fieldsUsed?: string[];
  retrievedAt: string;
  sourceSystem?: string | null;
  sourceUpdatedAt?: string | null;
};

export type AIAccountSummary = {
  accountId: string;
  accountName: string;
  accountType?: string | null;
  branch?: string | null;
  salesperson?: string | null;
  status?: string | null;
  locationHint?: string | null;
  summaryFacts?: Array<{ label: string; value: string | number }>;
  recentQuotes?: Array<Record<string, unknown>>;
  recentJobs?: Array<Record<string, unknown>>;
  retrievedAt?: string;
  sourceSystem?: string;
};

export type SlabAIOperationalContext = {
  accounts?: AIAccountSummary[];
  quotes?: AiQuoteDetail[];
  jobs?: Array<Record<string, unknown>>;
  inventory?: Array<Record<string, unknown>>;
  truncated?: boolean;
  warnings?: string[];
};

export const OPERATIONAL_LIMITS = {
  maxAccounts: 2,
  maxQuotes: 2,
  maxJobs: 8,
  maxInventory: 8,
  maxSerializedChars: 12000,
};

export function buildOperationalSources(ctx: SlabAIOperationalContext): OperationalSourceReference[] {
  const out: OperationalSourceReference[] = [];
  const now = new Date().toISOString();
  for (const a of ctx.accounts || []) {
    out.push({
      type: "account",
      entityId: a.accountId,
      label: a.accountName,
      fieldsUsed: ["accountName", "status", "branch", "salesperson", "recentQuotes", "recentJobs"],
      retrievedAt: a.retrievedAt || now,
      sourceSystem: a.sourceSystem || "account_directory",
    });
  }
  for (const q of ctx.quotes || []) {
    out.push({
      type: "quote",
      entityId: q.quoteId,
      label: q.quoteNumber || q.projectName || q.quoteId,
      fieldsUsed: ["quoteNumber", "status", "customerName", "rooms", "lineHints", "recordedTotal"],
      retrievedAt: (q as { retrievedAt?: string }).retrievedAt || now,
      sourceSystem: "quote_headers",
    });
  }
  for (const j of ctx.jobs || []) {
    const id = String(j.jobId || "");
    if (!id) continue;
    out.push({
      type: "job",
      entityId: id,
      label: String(j.jobName || id),
      fieldsUsed: ["status", "jobDate", "salesperson"],
      retrievedAt: String(j.retrievedAt || now),
      sourceSystem: String(j.sourceSystem || "moraware_prepared"),
    });
  }
  for (const m of ctx.inventory || []) {
    const id = String(m.materialId || "");
    if (!id) continue;
    out.push({
      type: "inventory",
      entityId: id,
      label: [m.colorName, m.materialName].filter(Boolean).join(" · ") || id,
      fieldsUsed: ["colorName", "materialName", "thickness", "dimensions", "rack"],
      retrievedAt: String(m.retrievedAt || now),
      sourceSystem: String(m.sourceSystem || "slab_inventory"),
      sourceUpdatedAt: null,
    });
  }
  return out;
}

/**
 * Detect mismatches between form input and loaded operational entities.
 */
export function detectOperationalConflicts(opts: {
  formValues: Record<string, unknown>;
  account?: AIAccountSummary | null;
  quote?: AiQuoteDetail | null;
}): string[] {
  const warnings: string[] = [];
  const formCustomer = String(opts.formValues.customerProjectName || opts.formValues.accountName || "").trim().toLowerCase();
  const formMaterial = String(opts.formValues.materialColor || opts.formValues.material || "").trim().toLowerCase();

  if (opts.quote && opts.account) {
    const quoteAccountId = (opts.quote as { accountDirectoryAccountId?: string | null }).accountDirectoryAccountId;
    if (quoteAccountId && quoteAccountId !== opts.account.accountId) {
      warnings.push(
        "Loaded quote is linked to a different Account Directory record than the selected account. Using IDs from the selected entities only — do not merge identities."
      );
    }
  }

  if (opts.quote && formCustomer) {
    const quoteName = String(opts.quote.customerName || opts.quote.accountName || "").toLowerCase();
    if (quoteName && formCustomer && !quoteName.includes(formCustomer.slice(0, 12)) && !formCustomer.includes(quoteName.slice(0, 12))) {
      warnings.push(
        `Form customer/project ("${String(opts.formValues.customerProjectName || "").slice(0, 60)}") differs from quote customer ("${opts.quote.customerName || opts.quote.accountName}"). Prefer quote record for project context when drafting from a loaded quote.`
      );
    }
  }

  if (opts.quote && formMaterial) {
    const hints = (opts.quote.lineHints || [])
      .map((l) => String(l.description || "").toLowerCase())
      .join(" ");
    if (hints && formMaterial.length >= 4 && !hints.includes(formMaterial.slice(0, 8))) {
      warnings.push(
        `Form material ("${String(opts.formValues.materialColor || "").slice(0, 40)}") may not match quote line descriptions. Do not silently reconcile — call out the discrepancy.`
      );
    }
  }

  if (opts.account && formCustomer) {
    const acct = opts.account.accountName.toLowerCase();
    if (acct && formCustomer && !acct.includes(formCustomer.slice(0, 12)) && !formCustomer.includes(acct.slice(0, 12))) {
      warnings.push(
        `Form name differs from selected account "${opts.account.accountName}". Use the selected account ID for operational facts.`
      );
    }
  }

  return warnings;
}

/**
 * Serialize operational context for the model — structured, size-capped.
 */
export function serializeOperationalContext(ctx: SlabAIOperationalContext): string {
  const payload = {
    accounts: (ctx.accounts || []).slice(0, OPERATIONAL_LIMITS.maxAccounts),
    quotes: (ctx.quotes || []).slice(0, OPERATIONAL_LIMITS.maxQuotes),
    jobs: (ctx.jobs || []).slice(0, OPERATIONAL_LIMITS.maxJobs),
    inventory: (ctx.inventory || []).slice(0, OPERATIONAL_LIMITS.maxInventory),
    truncated: Boolean(ctx.truncated),
    warnings: ctx.warnings || [],
    instruction:
      "These are current company data facts from eliteOS Brain. Do not invent missing fields. Truncated lists are incomplete. Distinguish company data from knowledge documentation.",
  };
  let json = JSON.stringify(payload, null, 2);
  if (json.length > OPERATIONAL_LIMITS.maxSerializedChars) {
    json = json.slice(0, OPERATIONAL_LIMITS.maxSerializedChars) + "\n…[truncated]";
  }
  return json;
}

/**
 * Validate model-claimed operational refs against server-authorized set.
 */
export function filterValidatedOperationalSources(
  claimed: Array<{ entityId?: string; label?: string; type?: string }>,
  authorized: OperationalSourceReference[]
): OperationalSourceReference[] {
  const byId = new Map(authorized.map((a) => [a.entityId, a]));
  const byLabel = new Map(authorized.map((a) => [a.label.toLowerCase(), a]));
  const out: OperationalSourceReference[] = [];
  for (const c of claimed) {
    const id = String(c.entityId || "").trim();
    const label = String(c.label || "").trim().toLowerCase();
    const hit = (id && byId.get(id)) || (label && byLabel.get(label)) || null;
    if (hit && !out.some((o) => o.entityId === hit.entityId)) out.push(hit);
  }
  return out;
}
