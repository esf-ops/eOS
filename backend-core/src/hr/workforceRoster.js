/**
 * In-memory test roster for HR workforce grading when DB roster is empty (dev/demo).
 * Stable UUIDs match eliteos_workforce_quality_test_roster.sql when applied.
 */

export const WORKFORCE_TEST_ROSTER = Object.freeze([
  {
    id: "a1000001-0001-4001-8001-000000000001",
    full_name: "Jordan Ellis",
    email: "jordan.ellis.test@eliteosfab.local",
    department: "Production",
    job_title: "CNC Operator",
    is_test: true
  },
  {
    id: "a1000001-0001-4001-8001-000000000002",
    full_name: "Morgan Chen",
    email: "morgan.chen.test@eliteosfab.local",
    department: "Install",
    job_title: "Lead Installer",
    is_test: true
  },
  {
    id: "a1000001-0001-4001-8001-000000000003",
    full_name: "Riley Brooks",
    email: "riley.brooks.test@eliteosfab.local",
    department: "Estimating",
    job_title: "Junior Estimator",
    is_test: true
  },
  {
    id: "a1000001-0001-4001-8001-000000000004",
    full_name: "Casey Nguyen",
    email: "casey.nguyen.test@eliteosfab.local",
    department: "Customer Service",
    job_title: "Service Coordinator",
    is_test: true
  },
  {
    id: "a1000001-0001-4001-8001-000000000005",
    full_name: "Taylor Reed",
    email: "taylor.reed.test@eliteosfab.local",
    department: "Shop",
    job_title: "Polish & QC",
    is_test: true
  }
]);

/**
 * @param {string} organizationId
 */
export function workforceTestRosterForOrg(organizationId) {
  return WORKFORCE_TEST_ROSTER.map((m) => ({
    ...m,
    organization_id: organizationId,
    source: "roster",
    is_active: true
  }));
}

/**
 * @param {string} id
 * @param {"user"|"roster"} source
 */
export function workforceEmployeeKey(id, source) {
  return `${source}:${id}`;
}

/**
 * @param {string} raw
 * @returns {{ source: "user"|"roster", id: string }|null}
 */
export function parseWorkforceEmployeeKey(raw) {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(user|roster):([0-9a-f-]{36})$/i);
  if (m) return { source: m[1].toLowerCase(), id: m[2] };
  if (/^[0-9a-f-]{36}$/i.test(s)) return { source: "user", id: s };
  return null;
}
