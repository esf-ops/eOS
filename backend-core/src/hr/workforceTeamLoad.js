/**
 * Load merged workforce roster (user profiles + roster members) for HR grading.
 */

import {
  parseWorkforceEmployeeKey,
  workforceEmployeeKey,
  workforceTestRosterForOrg,
  WORKFORCE_TEST_ROSTER
} from "./workforceRoster.js";

function pickStr(v) {
  return String(v ?? "").trim();
}

function isMissingTableError(error) {
  const msg = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "");
  return code === "42P01" || (msg.includes("relation") && msg.includes("does not exist"));
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 */
export async function ensureTestRosterMembers(db, organizationId) {
  try {
    const { count, error } = await db
      .from("workforce_roster_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("is_test", true);
    if (error) {
      if (isMissingTableError(error)) return false;
      throw error;
    }
    if ((count ?? 0) >= WORKFORCE_TEST_ROSTER.length) return true;

    const rows = workforceTestRosterForOrg(organizationId).map((m) => ({
      id: m.id,
      organization_id: organizationId,
      full_name: m.full_name,
      email: m.email,
      department: m.department,
      job_title: m.job_title,
      is_test: true,
      is_active: true
    }));

    const { error: insErr } = await db.from("workforce_roster_members").upsert(rows, { onConflict: "id" });
    if (insErr) throw insErr;
    return true;
  } catch (e) {
    if (isMissingTableError(e)) return false;
    throw e;
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 */
async function loadRosterMembers(db, organizationId) {
  try {
    const { data, error } = await db
      .from("workforce_roster_members")
      .select("id, full_name, email, department, job_title, is_active, is_test")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("full_name", { ascending: true });
    if (error) {
      if (isMissingTableError(error)) return workforceTestRosterForOrg(organizationId);
      throw error;
    }
    if (!data?.length) return workforceTestRosterForOrg(organizationId);
    return data.map((r) => ({ ...r, source: "roster" }));
  } catch (e) {
    if (isMissingTableError(e)) return workforceTestRosterForOrg(organizationId);
    throw e;
  }
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 */
async function loadUserProfiles(db, organizationId) {
  try {
    const { data, error } = await db
      .from("user_profiles")
      .select("id, full_name, email, role, job_title, department, is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("full_name", { ascending: true });
    if (error) {
      if (isMissingTableError(error)) return [];
      throw error;
    }
    return (data ?? []).map((u) => ({ ...u, source: "user" }));
  } catch (e) {
    if (isMissingTableError(e)) return [];
    throw e;
  }
}

/**
 * @param {object} row
 */
function normalizeWorkforceMember(row) {
  const source = row.source === "roster" ? "roster" : "user";
  const id = String(row.id);
  return {
    employeeKey: workforceEmployeeKey(id, source),
    employeeId: id,
    employeeSource: source,
    fullName: pickStr(row.full_name) || pickStr(row.email) || id,
    email: pickStr(row.email),
    role: pickStr(row.role),
    jobTitle: pickStr(row.job_title),
    department: pickStr(row.department),
    isTest: Boolean(row.is_test)
  };
}

/**
 * All graded team members for org — user profiles plus roster (includes test roster fallback).
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationId
 * @param {string|null} [filterEmployeeKey] workforce key or bare user uuid
 */
export async function loadWorkforceTeam(db, organizationId, filterEmployeeKey = null) {
  await ensureTestRosterMembers(db, organizationId);

  const [users, roster] = await Promise.all([
    loadUserProfiles(db, organizationId),
    loadRosterMembers(db, organizationId)
  ]);

  let members = [...users, ...roster].map(normalizeWorkforceMember);

  if (filterEmployeeKey) {
    const parsed = parseWorkforceEmployeeKey(filterEmployeeKey);
    if (parsed) {
      members = members.filter(
        (m) => m.employeeId === parsed.id && m.employeeSource === parsed.source
      );
    } else {
      members = members.filter((m) => m.employeeId === filterEmployeeKey);
    }
  }

  members.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return members;
}

/**
 * @param {{ source: "user"|"roster", id: string }} ref
 */
export function workforceRefToDbColumns(ref) {
  if (ref.source === "roster") {
    return { employee_user_id: null, employee_roster_id: ref.id };
  }
  return { employee_user_id: ref.id, employee_roster_id: null };
}

/**
 * @param {{ employee_user_id?: string|null, employee_roster_id?: string|null }} row
 */
export function workforceRefFromDbRow(row) {
  if (row.employee_roster_id) {
    return { source: "roster", id: String(row.employee_roster_id) };
  }
  if (row.employee_user_id) {
    return { source: "user", id: String(row.employee_user_id) };
  }
  return null;
}

/**
 * @param {{ source: "user"|"roster", id: string }} ref
 */
export function workforceSnapshotKey(ref) {
  return `${ref.source}:${ref.id}`;
}
