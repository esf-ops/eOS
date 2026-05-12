/**
 * Territory-based salesperson assignment for public quote leads.
 * No external geocoding — table-driven ZIP / city / county / branch / state.
 */

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function unassigned(reason) {
  return {
    assigned_sales_rep: null,
    assigned_sales_rep_email: null,
    branch: null,
    assignment_source: reason || "unassigned",
    matched_territory_id: null,
    confidence: "none",
    metadata: { reason }
  };
}

/**
 * @param {{ zip?: string, city?: string, county?: string, state?: string, branch?: string, db?: { from: Function } }} params
 */
export async function assignSalesRepForPublicQuote({ zip, city, county, state, branch, db }) {
  if (!db || typeof db.from !== "function") {
    return unassigned("no_db");
  }
  let rows = [];
  try {
    const { data, error } = await db.from("quote_sales_territories").select("*").eq("is_active", true);
    if (error) return unassigned("table_missing_or_error");
    rows = Array.isArray(data) ? data : [];
  } catch {
    return unassigned("table_missing_or_error");
  }
  if (!rows.length) return unassigned("no_territories");

  const candidates = [
    { type: "zip", value: norm(zip) },
    { type: "city", value: norm(city) },
    { type: "county", value: norm(county) },
    { type: "branch", value: norm(branch) },
    { type: "state", value: norm(state) }
  ];

  for (const c of candidates) {
    if (!c.value) continue;
    const matches = rows.filter((r) => norm(r.match_type) === c.type && norm(r.match_value) === c.value);
    if (!matches.length) continue;
    matches.sort((a, b) => (Number(a.priority) || 100) - (Number(b.priority) || 100));
    const pick = matches[0];
    const territoryMeta = pick.metadata && typeof pick.metadata === "object" && !Array.isArray(pick.metadata) ? { ...pick.metadata } : {};
    return {
      assigned_sales_rep: pick.assigned_sales_rep || null,
      assigned_sales_rep_email: pick.assigned_sales_rep_email || null,
      branch: pick.branch || null,
      assignment_source: `territory_${c.type}`,
      matched_territory_id: pick.id,
      confidence: "rule_match",
      metadata: {
        match_type: c.type,
        match_value: c.value,
        territory_name: pick.territory_name,
        ...territoryMeta
      }
    };
  }
  return unassigned("no_rule_match");
}

/**
 * @param {{ quoteId: string, assignmentResult: Record<string, unknown> }} params
 */
export function buildLeadAssignmentRow({ quoteId, assignmentResult }) {
  const a = assignmentResult || {};
  return {
    quote_id: quoteId,
    assignment_source: String(a.assignment_source || "unassigned"),
    assigned_sales_rep: a.assigned_sales_rep ?? null,
    assigned_sales_rep_email: a.assigned_sales_rep_email ?? null,
    branch: a.branch ?? null,
    matched_territory_id: a.matched_territory_id ?? null,
    confidence: String(a.confidence || "none"),
    metadata: typeof a.metadata === "object" && a.metadata ? a.metadata : {}
  };
}
