/**
 * Sales Account Manual Rules (seed suggestions only).
 *
 * IMPORTANT:
 * - These rules must NEVER override approved mappings in Supabase.
 * - Treat these as suggestion seeds/fallback classification only.
 * - Keep editable and easy to review.
 */

export const SALES_ACCOUNT_MANUAL_RULES_VERSION = "seed-2026-05-11";

/**
 * @typedef {Object} ManualRule
 * @property {string} id
 * @property {"exact"|"substring"} type
 * @property {string} match
 * @property {string} rationale
 * @property {boolean} approvedByRule Defaults false; must remain false unless explicitly reviewed.
 * @property {{ mondayAccountName?: string, branch?: string, assignedSalesperson?: string }} suggestion
 */

/** @type {ReadonlyArray<ManualRule>} */
export const SALES_ACCOUNT_MANUAL_RULES = Object.freeze([
  {
    id: "skogman-substring",
    type: "substring",
    match: "skogman",
    rationale: "Seed: Skogman accounts are known to map to Dyersville / Casey (per historical rule).",
    approvedByRule: false,
    suggestion: {
      // Prefer mapping to Monday master account if present; otherwise keep as attribution suggestion only.
      branch: "Dyersville",
      assignedSalesperson: "Casey Schenke"
    }
  },
  {
    id: "fox-countertops",
    type: "exact",
    match: "Fox Countertops",
    rationale: "Seed: Fox Countertops historically treated as Lisbon house account.",
    approvedByRule: false,
    suggestion: {
      branch: "Lisbon",
      assignedSalesperson: "House Account - Lisbon",
      mondayAccountName: "Fox Countertops"
    }
  },
  {
    id: "aceno-granite",
    type: "substring",
    match: "aceno",
    rationale: "Seed: Aceno appears as high-volume Moraware account needing stable ownership mapping.",
    approvedByRule: false,
    suggestion: {
      branch: "Lisbon",
      assignedSalesperson: "House Account - Lisbon"
    }
  },
  {
    id: "cambrian-granite-and-stone",
    type: "exact",
    match: "Cambrian Granite & Stone",
    rationale: "Seed: Cambrian Granite & Stone historically treated as Dyersville house account.",
    approvedByRule: false,
    suggestion: {
      branch: "Dyersville",
      assignedSalesperson: "House Account - Dyersville",
      mondayAccountName: "Cambrian Granite & Stone"
    }
  }
]);

