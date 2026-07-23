function norm(s: unknown): string {
  return s == null ? "" : String(s).trim().toLowerCase();
}

const SOURCE_LABELS: Record<string, string> = {
  public_consumer: "Public lead",
  internal_quote: "Internal estimate",
  partner_quote: "Partner quote",
  partner_portal: "Partner quote",
  public_retail: "Public lead",
  custom_quote: "Custom quote"
};

export function labelQuoteSource(raw: unknown): string {
  const k = norm(raw);
  if (!k) return "Unknown source";
  if (SOURCE_LABELS[k]) return SOURCE_LABELS[k];
  return String(raw).trim().replace(/_/g, " ");
}

const STATUS_LABELS: Record<string, string> = {
  lead_submitted: "Lead submitted",
  testing_review: "Testing review",
  draft: "Draft",
  sent: "Sent",
  follow_up: "Follow up",
  revised: "Revised",
  reviewing: "Reviewing",
  contacted: "Contacted",
  quoted: "Quoted",
  sold: "Sold",
  won: "Sold",
  lost: "Lost",
  archived: "Archived",
  submitted: "Submitted"
};

export function labelQuoteStatus(raw: unknown): string {
  const k = norm(raw);
  if (!k) return "—";
  return STATUS_LABELS[k] ?? String(raw).replace(/_/g, " ");
}

/** Row rollup + per-doc statuses from list API. */
export function labelHandoffRollup(rollup: unknown, moraware: unknown, quickbooks: unknown): string {
  const r = norm(rollup);
  const m = norm(moraware);
  const q = norm(quickbooks);

  if (r === "needs_handoff") return "Needs handoff";
  if (r === "in_progress") {
    const done = (s: string) => ["generated", "reviewed", "completed"].includes(s);
    if (done(m) && done(q)) return "Handoff docs ready";
    const bits: string[] = [];
    if (!m || m === "none") bits.push("Moraware needed");
    else if (!done(m)) bits.push("Moraware: " + labelHandoffDocStatus(m));
    if (!q || q === "none") bits.push("QuickBooks needed");
    else if (!done(q)) bits.push("QuickBooks: " + labelHandoffDocStatus(q));
    if (bits.length) return bits.join(" · ");
    return "In progress";
  }
  return labelHandoffDocStatus(rollup);
}

const HANDOFF_STATUS_LABELS: Record<string, string> = {
  "": "Not started",
  none: "Not started",
  needs_handoff: "Needs handoff",
  moraware_pending: "Moraware needed",
  quickbooks_pending: "QuickBooks needed",
  in_progress: "In progress",
  generated: "Generated",
  draft: "Draft",
  reviewed: "Reviewed",
  completed: "Completed",
  voided: "Voided"
};

export function labelHandoffDocStatus(raw: unknown): string {
  const k = norm(raw);
  if (!k) return "Not started";
  return HANDOFF_STATUS_LABELS[k] ?? String(raw).replace(/_/g, " ");
}

export const STATUS_FILTER_VALUES = [
  "",
  "draft",
  "testing_review",
  "sent",
  "follow_up",
  "revised",
  "sold",
  "won",
  "lost",
  "archived",
  "lead_submitted",
  "reviewing",
  "contacted",
  "quoted",
  "submitted"
] as const;

export function statusFilterLabel(value: string): string {
  if (!value) return "Any status";
  return labelQuoteStatus(value);
}

/** Table: account, customer subline, and project/job — no cross-field fallback. */
export function displayAccountColumn(r: Record<string, unknown>): {
  primary: string;
  subline: string;
  projectCell: string;
  accountLinked: boolean;
  accountDirectoryAccountId: string | null;
} {
  const identityName =
    typeof r.snapshot_identity_account === "string"
      ? String(r.snapshot_identity_account).trim()
      : r.customer_identity_snapshot &&
          typeof r.customer_identity_snapshot === "object" &&
          !Array.isArray(r.customer_identity_snapshot)
        ? String(
            (r.customer_identity_snapshot as { accountDisplayName?: unknown }).accountDisplayName ?? ""
          ).trim()
        : "";
  const acct = identityName || String(r.account_name ?? "").trim();
  const cust = String(r.customer_name ?? "").trim();
  const proj = String(r.project_name ?? "").trim();
  const accountDirectoryAccountId = r.account_directory_account_id
    ? String(r.account_directory_account_id).trim()
    : null;
  const accountLinked = Boolean(
    r.account_linked === true || accountDirectoryAccountId
  );
  const n = (s: string) => s.toLowerCase();
  const primary = accountLinked ? acct || "—" : acct || "Unlinked customer";
  const subline = cust && n(cust) !== n(acct) ? cust : "";
  const projectCell = proj || "";
  return { primary, subline, projectCell, accountLinked, accountDirectoryAccountId };
}
