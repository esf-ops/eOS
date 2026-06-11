/**
 * Custom Quote save — shared quote_headers persistence (not Internal Estimate save path).
 */

import { generateQuoteNumber, persistQuoteSubmission } from "./quotePersist.js";
import { calculateCustomQuote, normalizeCustomQuoteInput } from "./customQuoteCalculator.js";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {{
 *   body: Record<string, unknown>,
 *   userEmail: string,
 *   organizationContext?: import("../organizations/organizationContext.js").OrganizationContext|null
 * }} opts
 */
export async function processCustomQuoteSave(db, opts) {
  const body = opts.body && typeof opts.body === "object" ? opts.body : {};
  const calc = await calculateCustomQuote(body);
  const input = normalizeCustomQuoteInput(body);

  const quoteNumber = String(body.quote_number || "").trim() || generateQuoteNumber();
  const userEmail = String(opts.userEmail || "unknown");

  const snapshotToStore = {
    ...(calc.snapshot || {}),
    quote_source: "custom_quote",
    custom_quote_ui: {
      color_name: input.colorName,
      material_type: input.materialType,
      supplier_name: input.supplierName,
      pricing_mode: calc.pricingMode,
      saved_via: "custom_quote_tool"
    },
    totals: calc.calculationSnapshot
  };

  const saveBody = {
    customer_name: input.customer_name || null,
    project_name: input.project_name || null,
    city: input.city || null,
    state: input.state || null,
    zip: input.zip || null,
    sales_rep: input.sales_rep || null,
    branch: input.branch || null,
    notes: input.notes || null,
    material_type: input.materialType,
    color_name: input.colorName,
    supplier_name: input.supplierName
  };

  const pricingModeLabel = calc.pricingMode === "wholesale" ? "Wholesale" : "Retail";

  const { quoteId } = await persistQuoteSubmission(db, {
    body: saveBody,
    calc,
    userEmail,
    quoteNumber,
    quoteSource: "custom_quote",
    quoteStatus: "draft",
    snapshotToStore,
    estimatesByGroup: null,
    assignment: null,
    publicResponsePayload: null,
    organizationContext: opts.organizationContext ?? null,
    internalEstimateSummary: null,
    pricingModeLabel,
    headerExtras: {
      estimated_material_group: input.materialType || null,
      notes_length: input.notes ? String(input.notes).length : null
    },
    skipMondaySync: true
  });

  return {
    quoteId,
    quoteNumber,
    calc,
    snapshotToStore
  };
}
