/**
 * Estimate Builder directory — branch, sales rep and QuickBooks customer choices for the estimate header.
 *
 * Authority:
 *   - Branch and sales rep lists: `organization_integration_configs` row `estimating_directory` (org-scoped,
 *     non-secret). Each branch carries its QuickBooks Class ListID; each rep carries their QuickBooks SalesRep
 *     ListID. Names are display only — QuickBooks identity is always the ListID.
 *   - QuickBooks names / active flags: the Brain QuickBooks mirrors (`brain_quickbooks_classes`,
 *     `brain_quickbooks_sales_reps`).
 *   - Accounts: top-level active customers in the QuickBooks customer mirror (`ad_qb_customer_facts`).
 *
 * The browser sends codes and a customer ListID; the Brain re-resolves them at save so the stored
 * QuickBooks references can never be forged or drift from the directory.
 */

export const ESTIMATING_DIRECTORY_INTEGRATION_KEY = "estimating_directory";
const MAX_SEARCH_RESULTS = 20;

function str(v, max = 200) {
  return v == null ? "" : String(v).trim().slice(0, max);
}

/** Brain QuickBooks mirrors store qbXML text nodes as `{ "#text": "..." }`. */
function qbText(v) {
  if (v == null) return "";
  if (typeof v === "object") return str(v["#text"]);
  return str(v);
}

function sourceError(what, error) {
  const e = new Error(`${what}: ${error?.message || error}`);
  e.statusCode = 503;
  e.code = "estimating_directory_unavailable";
  return e;
}

/**
 * @param {unknown} config
 * @returns {{ branches: Array<{ code: string, label: string, qbClassListId: string }>, salesReps: Array<{ code: string, name: string, qbSalesRepListId: string }> }}
 */
export function normalizeDirectoryConfig(config) {
  const c = config && typeof config === "object" ? config : {};
  const seen = new Set();
  const uniq = (prefix, code) => {
    const k = `${prefix}:${code}`;
    if (!code || seen.has(k)) return false;
    seen.add(k);
    return true;
  };
  const branches = (Array.isArray(c.branches) ? c.branches : [])
    .map((b) => ({ code: str(b?.code, 60), label: str(b?.label, 60), qbClassListId: str(b?.qbClassListId, 60) }))
    .filter((b) => b.label && uniq("b", b.code));
  const salesReps = (Array.isArray(c.salesReps) ? c.salesReps : [])
    .map((r) => ({ code: str(r?.code, 60), name: str(r?.name, 120), qbSalesRepListId: str(r?.qbSalesRepListId, 60) }))
    .filter((r) => r.name && uniq("r", r.code));
  return { branches, salesReps };
}

/**
 * Directory DTO for the head: config entries joined to the QuickBooks mirrors (status per entry).
 * @param {ReturnType<typeof normalizeDirectoryConfig>} cfg
 * @param {Map<string, { fullName: string, active: boolean }>} classes by ListID
 * @param {Map<string, { initials: string, fullName: string, active: boolean }>} reps by ListID
 */
export function buildDirectory(cfg, classes, reps) {
  const status = (listId, row) => (!listId ? "unmapped" : !row ? "missing" : row.active ? "linked" : "inactive");
  return {
    configured: cfg.branches.length > 0 || cfg.salesReps.length > 0,
    branches: cfg.branches.map((b) => {
      const row = classes.get(b.qbClassListId) ?? null;
      return {
        code: b.code,
        label: b.label,
        quickbooks: { classListId: b.qbClassListId || null, classFullName: row?.fullName || null, status: status(b.qbClassListId, row) }
      };
    }),
    salesReps: cfg.salesReps.map((r) => {
      const row = reps.get(r.qbSalesRepListId) ?? null;
      return {
        code: r.code,
        name: r.name,
        quickbooks: {
          salesRepListId: r.qbSalesRepListId || null,
          initials: row?.initials || null,
          fullName: row?.fullName || null,
          status: status(r.qbSalesRepListId, row)
        }
      };
    })
  };
}

const EMPTY_DIRECTORY = Object.freeze({ configured: false, branches: [], salesReps: [] });

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string|null} organizationId
 */
export async function loadEstimatingDirectory(db, organizationId) {
  if (!organizationId) return EMPTY_DIRECTORY;
  const { data, error } = await db
    .from("organization_integration_configs")
    .select("is_enabled, config")
    .eq("organization_id", organizationId)
    .eq("integration_key", ESTIMATING_DIRECTORY_INTEGRATION_KEY)
    .maybeSingle();
  if (error) throw sourceError("Estimating directory config", error);
  if (!data || data.is_enabled !== true) return EMPTY_DIRECTORY;
  const cfg = normalizeDirectoryConfig(data.config);

  const classIds = cfg.branches.map((b) => b.qbClassListId).filter(Boolean);
  const repIds = cfg.salesReps.map((r) => r.qbSalesRepListId).filter(Boolean);
  const [classRes, repRes] = await Promise.all([
    classIds.length
      ? db.from("brain_quickbooks_classes").select("qb_list_id, is_active, raw_payload").eq("organization_id", organizationId).in("qb_list_id", classIds)
      : { data: [], error: null },
    repIds.length
      ? db.from("brain_quickbooks_sales_reps").select("qb_list_id, is_active, raw_payload").eq("organization_id", organizationId).in("qb_list_id", repIds)
      : { data: [], error: null }
  ]);
  if (classRes.error) throw sourceError("QuickBooks class mirror", classRes.error);
  if (repRes.error) throw sourceError("QuickBooks sales rep mirror", repRes.error);
  const classes = new Map(
    (classRes.data || []).map((r) => [String(r.qb_list_id), { fullName: qbText(r.raw_payload?.FullName), active: r.is_active !== false }])
  );
  const reps = new Map(
    (repRes.data || []).map((r) => [
      String(r.qb_list_id),
      {
        initials: qbText(r.raw_payload?.Initial),
        fullName: qbText(r.raw_payload?.SalesRepEntityRef?.FullName),
        active: r.is_active !== false
      }
    ])
  );
  return buildDirectory(cfg, classes, reps);
}

/** Escape LIKE wildcards so the user's text is matched literally. */
export function likeContains(term) {
  return `%${String(term).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Account type-ahead: top-level active QuickBooks customers whose name contains `q`.
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {string} q
 */
export async function searchQuickbooksCustomers(db, organizationId, q) {
  const term = str(q, 80);
  if (!organizationId || term.length < 2) return [];
  const { data, error } = await db
    .from("ad_qb_customer_facts")
    .select("qb_list_id, full_name, bill_city, bill_state")
    .eq("organization_id", organizationId)
    .eq("is_job", false)
    .eq("is_active", true)
    .ilike("full_name", likeContains(term))
    .order("full_name", { ascending: true })
    .limit(MAX_SEARCH_RESULTS);
  if (error) throw sourceError("QuickBooks customer mirror", error);
  return (data || []).map((r) => ({
    listId: String(r.qb_list_id),
    fullName: str(r.full_name),
    city: str(r.bill_city) || null,
    state: str(r.bill_state) || null
  }));
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string|null} organizationId
 * @param {string} listId
 * @returns {Promise<{ listId: string, fullName: string, active: boolean, isJob: boolean } | null>}
 */
export async function findQuickbooksCustomer(db, organizationId, listId) {
  const id = str(listId, 60);
  if (!organizationId || !id) return null;
  const { data, error } = await db
    .from("ad_qb_customer_facts")
    .select("qb_list_id, full_name, is_active, is_job")
    .eq("organization_id", organizationId)
    .eq("qb_list_id", id)
    .maybeSingle();
  if (error) throw sourceError("QuickBooks customer mirror", error);
  if (!data) return null;
  return { listId: String(data.qb_list_id), fullName: str(data.full_name), active: data.is_active !== false, isJob: data.is_job === true };
}

/**
 * Resolve the header's directory choices to display labels and QuickBooks references (pure).
 * Branch / rep codes must exist in the directory; an older document with only a label is matched to the
 * directory entry with exactly that label. A customer ListID must exist in the org's QuickBooks mirror.
 *
 * @param {Record<string, any>} header normalized document header
 * @param {ReturnType<typeof buildDirectory>} directory
 * @param {Awaited<ReturnType<typeof findQuickbooksCustomer>>} customer mirror row for `header.qbCustomerListId`
 */
export function resolveHeaderQuickbooks(header, directory, customer) {
  const h = { ...header };
  const issues = [];
  const sameLabel = (a, b) => str(a).toLowerCase() === str(b).toLowerCase();

  const branch =
    directory.branches.find((b) => b.code === h.branchCode) ??
    (!h.branchCode && h.branch ? directory.branches.find((b) => sameLabel(b.label, h.branch)) : null) ??
    null;
  if (branch) {
    h.branchCode = branch.code;
    h.branch = branch.label;
    if (branch.quickbooks.status !== "linked") issues.push({ code: "branch_class_unlinked", message: `Branch "${branch.label}" has no active QuickBooks class.` });
  } else {
    if (h.branchCode) issues.push({ code: "branch_unknown", message: "The selected branch is no longer in the directory." });
    h.branchCode = "";
    if (directory.configured) issues.push({ code: "branch_missing", message: "Choose a branch." });
  }

  const rep =
    directory.salesReps.find((r) => r.code === h.salesRepCode) ??
    (!h.salesRepCode && h.salesRep ? directory.salesReps.find((r) => sameLabel(r.name, h.salesRep)) : null) ??
    null;
  if (rep) {
    h.salesRepCode = rep.code;
    h.salesRep = rep.name;
    if (rep.quickbooks.status !== "linked") issues.push({ code: "sales_rep_unlinked", message: `${rep.name} has no active QuickBooks sales rep.` });
  } else {
    if (h.salesRepCode) issues.push({ code: "sales_rep_unknown", message: "The selected sales rep is no longer in the directory." });
    h.salesRepCode = "";
    if (directory.configured) issues.push({ code: "sales_rep_missing", message: "Choose a sales rep." });
  }

  let qbCustomer = null;
  if (h.qbCustomerListId) {
    if (customer && customer.active && !customer.isJob) {
      qbCustomer = { listId: customer.listId, fullName: customer.fullName };
      h.accountName = customer.fullName;
    } else {
      issues.push({ code: "qb_customer_invalid", message: "The linked QuickBooks customer was not found or is inactive — pick the account again." });
      h.qbCustomerListId = "";
    }
  } else if (directory.configured) {
    issues.push({ code: "qb_customer_missing", message: "Pick the account from QuickBooks customers." });
  }

  return {
    header: h,
    quickbooks: {
      customer: qbCustomer,
      class: branch?.quickbooks.status === "linked" ? { listId: branch.quickbooks.classListId, fullName: branch.quickbooks.classFullName } : null,
      salesRep:
        rep?.quickbooks.status === "linked"
          ? { listId: rep.quickbooks.salesRepListId, initials: rep.quickbooks.initials, fullName: rep.quickbooks.fullName }
          : null,
      ready: Boolean(qbCustomer && branch?.quickbooks.status === "linked" && rep?.quickbooks.status === "linked"),
      issues
    }
  };
}
