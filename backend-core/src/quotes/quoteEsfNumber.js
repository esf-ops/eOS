/**
 * ESF internal quote numbers: ESF-{BRANCH}-{NNNNNN} (+ optional -R{n} per revision).
 * Sequences are allocated server-side via Supabase RPC quote_allocate_esf_sequence (see eliteos_internal_quote_phase2.sql).
 *
 * TODO: Move branch-prefix mapping to Pricing/System Admin config (organization_integration_configs or similar).
 */

/**
 * @param {string|null|undefined} organizationId
 */
export function organizationKeyForQuotes(organizationId) {
  const s = organizationId != null ? String(organizationId).trim() : "";
  return s || "global";
}

/**
 * Map saved branch label to stable uppercase prefix used in quote numbers.
 * Known Elite branches: Dyersville, Iowa City, Lisbon.
 * @param {string|null|undefined} branch
 */
export function branchPrefixFromBranchLabel(branch) {
  const b = String(branch || "")
    .trim()
    .toLowerCase();
  if (!b) return "DYER";
  if (b.includes("dyersville") || /\bdyer\b/.test(b)) return "DYER";
  if (b.includes("iowa city") || /\bic\b/.test(b)) return "IC";
  if (b.includes("lisbon") || /\blis\b/.test(b)) return "LIS";
  return "DYER";
}

/**
 * @param {string} branchPrefix
 * @param {number} seq
 */
export function formatEsfQuoteNumberBase(branchPrefix, seq) {
  const p = String(branchPrefix || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const safePrefix = p || "DYER";
  const n = Number(seq);
  if (!Number.isFinite(n) || n < 1) throw new Error("Invalid ESF sequence");
  return `ESF-${safePrefix}-${String(Math.floor(n)).padStart(6, "0")}`;
}

/**
 * @param {string} base e.g. ESF-DYER-000001
 * @param {number} revisionNumber 1-based
 */
export function quoteNumberForRevision(base, revisionNumber) {
  const r = Number(revisionNumber);
  if (!Number.isFinite(r) || r < 1) throw new Error("Invalid revision number");
  const b = String(base || "").trim();
  if (!b) throw new Error("Missing quote_number_base");
  if (r <= 1) return b;
  return `${b}-R${r}`;
}

/**
 * @param {number} revisionNumber
 */
export function revisionLabelFromNumber(revisionNumber) {
  const r = Number(revisionNumber);
  if (!Number.isFinite(r) || r < 1) return "R1";
  return `R${r}`;
}

/**
 * Next atomic sequence for org × branch prefix (requires migration RPC).
 * @param {import("@supabase/supabase-js").SupabaseClient} db
 * @param {string} organizationKey
 * @param {string} branchPrefix
 */
export async function allocateEsfSequence(db, organizationKey, branchPrefix) {
  const ok = String(organizationKey || "").trim() || "global";
  const bp = String(branchPrefix || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const safeBp = bp || "DYER";
  const { data, error } = await db.rpc("quote_allocate_esf_sequence", {
    p_organization_key: ok,
    p_branch_prefix: safeBp
  });
  if (error) throw error;
  const seq = Number(data);
  if (!Number.isFinite(seq)) {
    throw new Error("quote_allocate_esf_sequence returned invalid sequence — apply eliteos_internal_quote_phase2.sql");
  }
  return seq;
}

/**
 * @param {Record<string, unknown>} row quote_headers row
 */
export function deriveQuoteNumberBaseFromRow(row) {
  const explicit = String(row?.quote_number_base ?? "").trim();
  if (explicit) return explicit;
  const qn = String(row?.quote_number ?? "").trim();
  if (!qn) return "";
  const m = /^(ESF-[A-Z]+-[0-9]{6})(-R[0-9]+)?$/i.exec(qn);
  if (m) return m[1];
  return qn;
}
