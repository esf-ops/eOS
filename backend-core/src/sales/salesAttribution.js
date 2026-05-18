/**
 * Sales attribution & classification for Sales Head (Brain job rows).
 * Moraware remains source of truth for raw `salesperson_name`; eliteOS adds normalized attribution for dashboards.
 *
 * Local ACCOUNT_* rules are legacy preview fallbacks only. Trusted account -> branch/location/salesperson
 * attribution must come from approved Sales Account Mapping Admin rows.
 */

/** Elite active sales reps — only these are "active_rep" when Moraware matches exactly. */
export const ACTIVE_SALES_REPS = Object.freeze(["Casey Schenke", "Thera McEnany", "Michael Joseph"]);

const ACTIVE_SET = new Set(ACTIVE_SALES_REPS);

/** Known branch labels for filters and grouping. */
export const SALES_BRANCHES = Object.freeze(["Lisbon", "Dyersville", "Iowa City", "Unmapped / Moraware only"]);

export const BRANCH_UNMAPPED = "Unmapped / Moraware only";

/** Human-readable rules list for Classification Rules panel (must match logic below). */
export const ACCOUNT_RULES_DOCUMENTATION = Object.freeze([
  "Legacy preview fallback only: Fox Countertops → Lisbon / House Account - Lisbon (exact account name)",
  "Legacy preview fallback only: Aceno → Lisbon / House Account - Lisbon (exact account name)",
  "Legacy preview fallback only: Cambrian Granite & Stone → Dyersville / House Account - Dyersville (exact account name)",
  "Legacy preview fallback only: accounts whose name contains “Skogman” → Dyersville / Casey Schenke (substring rule)",
  "Blackstone is explicitly not attributed to Dyersville. It remains Moraware fallback unless Chris approves a Brain mapping later.",
  "Only approved Sales Account Mapping Admin rows are trusted account/branch attribution. Preview fallback rules must not be treated as production truth."
]);

function isMissingRelationError(error) {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return code === "42P01" || msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation");
}

/**
 * Best-effort load of approved attribution mappings from Supabase (if tables exist).
 *
 * Precedence:
 * 1) Approved aliases/assignments from Supabase
 * 2) Fallback: hardcoded/manual rules below (seed/fallback only)
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function loadApprovedSalesAttributionMappings(supabase) {
  if (!supabase) return { source: "hardcoded_rules_only", aliasesByNormMoraware: new Map(), assignmentsByMasterId: new Map() };

  /** @type {Map<string, any>} */
  const aliasesByNormMoraware = new Map();
  /** @type {Map<string, any>} */
  const assignmentsByMasterId = new Map();

  // ---- Aliases (approved) ----
  let aliases = [];
  try {
    const { data, error } = await supabase
      .from("sales_account_aliases")
      .select(
        "id,approved,normalized_moraware_name,moraware_account_name,sales_account_master_id,monday_account_name,normalized_monday_name,assigned_salesperson,branch,match_type,confidence,notes"
      )
      .eq("approved", true);
    if (error) throw error;
    aliases = data ?? [];
  } catch (e) {
    if (isMissingRelationError(e)) {
      return { source: "no_alias_table", aliasesByNormMoraware, assignmentsByMasterId };
    }
    return { source: "alias_table_error", aliasesByNormMoraware, assignmentsByMasterId, error: String(e?.message || e) };
  }

  for (const a of aliases) {
    const k = String(a.normalized_moraware_name ?? "").trim();
    if (!k) continue;
    // Enforce precedence: first approved wins (we avoid silently overwriting).
    if (!aliasesByNormMoraware.has(k)) aliasesByNormMoraware.set(k, a);
  }

  // ---- Assignments (approved current_owner) ----
  // If the assignments table is missing, that's fine; we can still use alias.assigned_salesperson/branch.
  const masterIds = [...new Set(aliases.map((a) => String(a.sales_account_master_id ?? "")).filter(Boolean))];
  if (masterIds.length) {
    try {
      const { data, error } = await supabase
        .from("sales_account_assignments")
        .select(
          "id,sales_account_master_id,assigned_salesperson,branch,assignment_type,active,approved,effective_start_date,effective_end_date,approved_at"
        )
        .eq("approved", true)
        .eq("active", true)
        .eq("assignment_type", "current_owner")
        .in("sales_account_master_id", masterIds);
      if (error) throw error;
      for (const r of data ?? []) {
        const k = String(r.sales_account_master_id ?? "").trim();
        if (!k) continue;
        if (!assignmentsByMasterId.has(k)) assignmentsByMasterId.set(k, r);
      }
    } catch (e) {
      if (!isMissingRelationError(e)) {
        // Non-fatal; keep going with alias fields.
        return { source: "approved_aliases_plus_rules", aliasesByNormMoraware, assignmentsByMasterId, warning: String(e?.message || e) };
      }
    }
  }

  return { source: "approved_aliases_plus_assignments", aliasesByNormMoraware, assignmentsByMasterId };
}

/**
 * Exact account_name match (trim, case-insensitive) → branch + normalized salesperson + class.
 * @type {ReadonlyArray<{ account: string, branch: string, normalizedSalesperson: string, salespersonClass: string, note: string }>}
 */
const ACCOUNT_EXACT_OVERRIDES = Object.freeze([
  {
    account: "Fox Countertops",
    branch: "Lisbon",
    normalizedSalesperson: "House Account - Lisbon",
    salespersonClass: "house_account",
    note: "Fox Countertops → Lisbon / House Account - Lisbon"
  },
  {
    account: "Aceno",
    branch: "Lisbon",
    normalizedSalesperson: "House Account - Lisbon",
    salespersonClass: "house_account",
    note: "Aceno → Lisbon / House Account - Lisbon"
  },
  {
    account: "Cambrian Granite & Stone",
    branch: "Dyersville",
    normalizedSalesperson: "House Account - Dyersville",
    salespersonClass: "house_account",
    note: "Cambrian Granite & Stone → Dyersville / House Account - Dyersville"
  }
]);

/**
 * Substring on account_name (case-insensitive).
 * @type {ReadonlyArray<{ contains: string, branch: string, normalizedSalesperson: string, salespersonClass: string, note: string }>}
 */
const ACCOUNT_SUBSTRING_OVERRIDES = Object.freeze([
  {
    contains: "skogman",
    branch: "Dyersville",
    normalizedSalesperson: "Casey Schenke",
    salespersonClass: "active_rep",
    note: "Skogman accounts → Dyersville / Casey Schenke"
  }
]);

function normAccount(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase();
}

function inferBranchFromMorawareSalesperson(morawareSp) {
  const s = String(morawareSp ?? "").toLowerCase();
  if (s.includes("lisbon")) return "Lisbon";
  if (s.includes("dyersville")) return "Dyersville";
  if (s.includes("iowa city")) return "Iowa City";
  return null;
}

/**
 * @param {object} job — brain_jobs row shape (at least account_name, salesperson_name)
 * @param {ReturnType<typeof loadApprovedSalesAttributionMappings> | null} mappings
 * @returns {{
 *   morawareSalesperson: string,
 *   normalizedSalesperson: string,
 *   branch: string,
 *   salespersonClass: string,
 *   classificationMethod: string,
 *   classificationConfidence: string,
 *   classificationNote: string
 * }}
 */
export function classifySalesJob(job, mappings = null) {
  const accountName = String(job.account_name ?? "").trim();
  const morawareSalesperson = String(job.salesperson_name ?? "").trim();
  const morawareLower = morawareSalesperson.toLowerCase();
  const acctKey = normAccount(accountName);

  // 1) Approved mapping (Supabase) — never override it with local rules.
  if (mappings?.aliasesByNormMoraware && mappings.aliasesByNormMoraware.size) {
    // Normalized key should match what scripts generate: without location prefix.
    const normNoPrefix = normAccount(accountName.replace(/^(dyersville|lisbon|iowa\s*city)\s*[-–—]\s*/i, ""));
    const alias = mappings.aliasesByNormMoraware.get(normNoPrefix) || mappings.aliasesByNormMoraware.get(acctKey) || null;
    if (alias) {
      const masterId = String(alias.sales_account_master_id ?? "").trim();
      const assignment = masterId ? mappings.assignmentsByMasterId?.get(masterId) : null;
      const assignedSalesperson = String(assignment?.assigned_salesperson ?? alias.assigned_salesperson ?? "").trim();
      const assignedBranch = String(assignment?.branch ?? alias.branch ?? "").trim();
      const isHouse = /^house\s*account/i.test(assignedSalesperson);
      const isActive = ACTIVE_SET.has(assignedSalesperson);
      return {
        morawareSalesperson,
        normalizedSalesperson: assignedSalesperson || "(unassigned)",
        branch: assignedBranch || BRANCH_UNMAPPED,
        salespersonClass: isActive ? "active_rep" : isHouse ? "house_account" : assignedSalesperson ? "inactive_rep" : "unknown",
        classificationMethod: "approved_mapping",
        classificationConfidence: "high",
        classificationNote: "Approved Supabase mapping (sales_account_aliases / sales_account_assignments)."
      };
    }
  }

  if (acctKey.includes("blackstone")) {
    return {
      morawareSalesperson,
      normalizedSalesperson: morawareSalesperson || "(unknown)",
      branch: BRANCH_UNMAPPED,
      salespersonClass: morawareSalesperson ? "fallback_moraware" : "unknown",
      classificationMethod: "blackstone_guardrail",
      classificationConfidence: "high",
      classificationNote:
        "Blackstone must not be attributed to Dyersville from legacy dashboard data; keep unmapped unless Chris approves a Brain mapping."
    };
  }

  /** @type {{ branch: string, normalizedSalesperson: string, salespersonClass: string, method: string, confidence: string, note: string }} */
  let hit = null;

  for (const rule of ACCOUNT_EXACT_OVERRIDES) {
    if (acctKey && acctKey === normAccount(rule.account)) {
      hit = {
        branch: rule.branch,
        normalizedSalesperson: rule.normalizedSalesperson,
        salespersonClass: rule.salespersonClass,
        method: "legacy_preview_rule",
        confidence: "low",
        note: rule.note
      };
      break;
    }
  }

  if (!hit) {
    const al = accountName.toLowerCase();
    for (const rule of ACCOUNT_SUBSTRING_OVERRIDES) {
      if (al.includes(rule.contains.toLowerCase())) {
        hit = {
          branch: rule.branch,
          normalizedSalesperson: rule.normalizedSalesperson,
          salespersonClass: rule.salespersonClass,
          method: "legacy_preview_rule",
          confidence: "low",
          note: rule.note
        };
        break;
      }
    }
  }

  if (hit) {
    return {
      morawareSalesperson,
      normalizedSalesperson: hit.normalizedSalesperson,
      branch: hit.branch,
      salespersonClass: hit.salespersonClass,
      classificationMethod: hit.method,
      classificationConfidence: hit.confidence,
      classificationNote: `Attribution preview / needs approved mapping: ${hit.note}`
    };
  }

  // Moraware salesperson exact active rep
  if (morawareSalesperson && ACTIVE_SET.has(morawareSalesperson)) {
    const inferred = inferBranchFromMorawareSalesperson(morawareSalesperson);
    return {
      morawareSalesperson,
      normalizedSalesperson: morawareSalesperson,
      branch: inferred || BRANCH_UNMAPPED,
      salespersonClass: "active_rep",
      classificationMethod: "exact_master_match",
      classificationConfidence: inferred ? "medium" : "medium",
      classificationNote: "Moraware salesperson matches active rep roster."
    };
  }

  // House account salesperson patterns from Moraware
  if (/house\s*account\s*-\s*lisbon/i.test(morawareSalesperson)) {
    return {
      morawareSalesperson,
      normalizedSalesperson: "House Account - Lisbon",
      branch: "Lisbon",
      salespersonClass: "house_account",
      classificationMethod: "moraware_fallback",
      classificationConfidence: "high",
      classificationNote: "Moraware house-account salesperson (Lisbon)."
    };
  }
  if (/house\s*account\s*-\s*dyersville/i.test(morawareSalesperson)) {
    return {
      morawareSalesperson,
      normalizedSalesperson: "House Account - Dyersville",
      branch: "Dyersville",
      salespersonClass: "house_account",
      classificationMethod: "moraware_fallback",
      classificationConfidence: "high",
      classificationNote: "Moraware house-account salesperson (Dyersville)."
    };
  }

  if (!morawareSalesperson) {
    return {
      morawareSalesperson: "",
      normalizedSalesperson: "(unknown)",
      branch: BRANCH_UNMAPPED,
      salespersonClass: "unknown",
      classificationMethod: "unknown",
      classificationConfidence: "low",
      classificationNote: "Missing Moraware salesperson on job."
    };
  }

  const inferred = inferBranchFromMorawareSalesperson(morawareSalesperson);
  // Other named values (Hunter Robinson, Paul Nelson, etc.) — not active roster
  return {
    morawareSalesperson,
    normalizedSalesperson: morawareSalesperson,
    branch: inferred || BRANCH_UNMAPPED,
    salespersonClass: "fallback_moraware",
    classificationMethod: "moraware_fallback",
    classificationConfidence: "low",
    classificationNote:
      "Moraware salesperson is not on the active rep roster; volume retained under Moraware label for transparency."
  };
}

/**
 * @param {string} method
 */
export function methodLabelForDisplay(method) {
  const m = String(method ?? "");
  if (m === "user_override") return "User override";
  if (m === "legacy_preview_rule") return "Attribution preview - needs approved mapping";
  if (m === "exact_master_match") return "Exact master match";
  if (m === "substring_rule") return "Substring rule";
  if (m === "prior_dashboard") return "Prior dashboard classification carried forward";
  if (m === "moraware_fallback") return "Moraware fallback - no confident master match";
  if (m === "unknown") return "Unknown";
  return m || "Unknown";
}
