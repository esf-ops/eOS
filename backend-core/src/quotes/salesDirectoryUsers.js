/**
 * eOS users eligible for sales assignment pickers (territories, pipeline, future internal quote / partner owner).
 * Criteria: active profile and (sales head OR sales-like role OR sales-like department).
 */

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

const DEPT_TERMS = ["sales", "account", "business development", "bd"];

function departmentLooksSales(department) {
  const d = norm(department);
  if (!d) return false;
  return DEPT_TERMS.some((t) => d.includes(t));
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {{ warn?: (o: Record<string, unknown>) => void }} [log]
 * @returns {Promise<Array<{ id: string, user_id: string, full_name: string, email: string, phone: string | null, branch: string | null, role: string | null, is_active: boolean }>>}
 */
export async function listSalesDirectoryUsers(supabase, log) {
  const { data: profiles, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("is_active", true);
  if (error || !profiles) {
    log?.warn?.({ msg: "listSalesDirectoryUsers.profiles", err: error?.message });
    return [];
  }

  const ids = profiles.map((p) => p.id).filter(Boolean);
  if (!ids.length) return [];

  let heads = [];
  try {
    const { data: hRows, error: hErr } = await supabase.from("user_head_access").select("user_id, head_slug").in("user_id", ids);
    if (hErr) log?.warn?.({ msg: "listSalesDirectoryUsers.heads", err: hErr.message });
    heads = hRows ?? [];
  } catch (e) {
    log?.warn?.({ msg: "listSalesDirectoryUsers.heads_throw", err: String(e?.message || e) });
  }

  const headsByUser = new Map();
  for (const h of heads) {
    const uid = h.user_id;
    if (!headsByUser.has(uid)) headsByUser.set(uid, new Set());
    headsByUser.get(uid).add(String(h.head_slug || "").trim());
  }

  const out = [];
  for (const p of profiles) {
    const uid = p.id;
    if (!uid) continue;
    const role = String(p.role || "").trim();
    const dept = p.department;
    const headSet = headsByUser.get(uid) || new Set();
    const hasSalesHead = headSet.has("sales");
    const roleIsSales = norm(role) === "sales";
    const deptSales = departmentLooksSales(dept);

    if (!hasSalesHead && !roleIsSales && !deptSales) continue;

    const email = String(p.email || "").trim();
    if (!email) continue;

    const full_name = String(p.full_name || "").trim() || email;
    let phone = null;
    if (p.phone != null && String(p.phone).trim()) phone = String(p.phone).trim();
    else if (p.mobile_phone != null && String(p.mobile_phone).trim()) phone = String(p.mobile_phone).trim();

    let branch = null;
    if (p.branch != null && String(p.branch).trim()) branch = String(p.branch).trim();

    out.push({
      id: uid,
      user_id: uid,
      full_name,
      email,
      phone,
      branch,
      role: role || (hasSalesHead ? "sales_head" : null),
      is_active: p.is_active !== false
    });
  }

  out.sort((a, b) => a.full_name.localeCompare(b.full_name));
  return out;
}
