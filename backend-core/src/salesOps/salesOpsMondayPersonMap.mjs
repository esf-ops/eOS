/**
 * Exact-only Monday person → eliteOS user mapping.
 * Fail closed. Never fuzzy-match names.
 */

function normEmail(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  return s.includes("@") ? s : "";
}

export function previewExactPersonMappings({
  mondayPeople = [],
  eliteOsUsers = [],
  existingMappings = [],
  assignedMondayPersonIds = []
} = {}) {
  const assigned = new Set((assignedMondayPersonIds || []).map(String).filter(Boolean));
  const existingByMonday = new Map();
  const existingByUser = new Map();
  for (const m of existingMappings || []) {
    if (!m?.active && m?.active !== undefined) continue;
    existingByMonday.set(String(m.mondayUserId), String(m.userId));
    existingByUser.set(String(m.userId), String(m.mondayUserId));
  }

  const eliteByEmail = new Map();
  const eliteEmailCounts = new Map();
  for (const u of eliteOsUsers || []) {
    if (u?.isActive === false) continue;
    const email = normEmail(u.email);
    if (!email) continue;
    eliteEmailCounts.set(email, (eliteEmailCounts.get(email) || 0) + 1);
    if (!eliteByEmail.has(email)) eliteByEmail.set(email, u);
  }

  const mondayByEmail = new Map();
  const mondayEmailCounts = new Map();
  for (const p of mondayPeople || []) {
    if (String(p.kind || "person") === "team") continue;
    const email = normEmail(p.email);
    if (!email) continue;
    mondayEmailCounts.set(email, (mondayEmailCounts.get(email) || 0) + 1);
    if (!mondayByEmail.has(email)) mondayByEmail.set(email, p);
  }

  const byId = new Map((mondayPeople || []).map((p) => [String(p.mondayUserId || p.id), p]));
  const ids = assigned.size ? [...assigned] : [...byId.keys()];
  const results = [];

  for (const mondayPersonId of ids) {
    const person = byId.get(String(mondayPersonId)) || { mondayUserId: mondayPersonId };
    const existingUserId = existingByMonday.get(String(mondayPersonId)) || null;
    const email = normEmail(person.email);
    if (existingUserId) {
      results.push({
        mondayPersonId: String(mondayPersonId),
        eliteosUserId: existingUserId,
        status: "EXACT",
        matchBasis: "existing_mapping",
        applied: true,
        applyable: false
      });
      continue;
    }
    if (!email) {
      results.push({
        mondayPersonId: String(mondayPersonId),
        eliteosUserId: null,
        status: "UNMATCHED",
        matchBasis: "missing_email",
        applied: false,
        applyable: false
      });
      continue;
    }
    const mondayCount = mondayEmailCounts.get(email) || 0;
    const eliteCount = eliteEmailCounts.get(email) || 0;
    if (mondayCount !== 1 || eliteCount !== 1) {
      results.push({
        mondayPersonId: String(mondayPersonId),
        eliteosUserId: eliteCount === 1 ? String(eliteByEmail.get(email).id) : null,
        status: "AMBIGUOUS",
        matchBasis: mondayCount !== 1 ? "duplicate_monday_email" : "duplicate_eliteos_email",
        applied: false,
        applyable: false
      });
      continue;
    }
    const elite = eliteByEmail.get(email);
    const eliteId = String(elite.id);
    const otherMonday = existingByUser.get(eliteId);
    if (otherMonday && otherMonday !== String(mondayPersonId)) {
      results.push({
        mondayPersonId: String(mondayPersonId),
        eliteosUserId: eliteId,
        status: "AMBIGUOUS",
        matchBasis: "eliteos_user_already_mapped",
        applied: false,
        applyable: false
      });
      continue;
    }
    results.push({
      mondayPersonId: String(mondayPersonId),
      eliteosUserId: eliteId,
      status: "EXACT",
      matchBasis: "exact_unique_email",
      applied: false,
      applyable: true
    });
  }

  results.sort((a, b) => String(a.mondayPersonId).localeCompare(String(b.mondayPersonId)));
  return {
    results,
    exactApplyable: results.filter((r) => r.applyable),
    unmatched: results.filter((r) => r.status === "UNMATCHED"),
    ambiguous: results.filter((r) => r.status === "AMBIGUOUS")
  };
}
