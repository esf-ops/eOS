/**
 * Quote Flow Estimate Queue — safe source / packet identity helpers.
 * Subject/sender may be stored on takeoff job metadata (staff-only queue clarity).
 * Never log tokens or raw Graph payloads.
 */

/**
 * @param {string|null|undefined} filename
 */
export function filenameWithoutExtension(filename) {
  const s = String(filename || "").trim();
  if (!s) return "";
  return s.replace(/\.[a-z0-9]{2,5}$/i, "") || s;
}

/**
 * Opaque / machine filenames should not be primary queue titles.
 * @param {string|null|undefined} name
 */
export function isOpaquePlanFilename(name) {
  const raw = String(name || "").trim();
  if (!raw) return true;
  const base = filenameWithoutExtension(raw);
  if (!base) return true;
  if (/^\d{8,}$/.test(base)) return true;
  if (/^AAMk/i.test(base) || /^AAMk/i.test(raw)) return true;
  if (/^[A-Za-z0-9+/=_-]{32,}$/.test(base) && !/\s/.test(base)) return true;
  return false;
}

/**
 * True when a label is clearly an attachment/source document name, not a quote identity.
 * @param {string|null|undefined} name
 */
export function looksLikeAttachmentFilename(name) {
  const s = String(name || "").trim();
  if (!s) return false;
  return /\.(pdf|png|jpe?g|gif|webp|tif{1,2}|heic|dwg|dxf|svg)$/i.test(s);
}

/**
 * @param {string|null|undefined} name
 * @param {Array<string|null|undefined>} planNames
 */
export function matchesAnyPlanFilename(name, planNames = []) {
  const raw = String(name || "").trim();
  if (!raw) return false;
  const base = filenameWithoutExtension(raw).toLowerCase();
  const lower = raw.toLowerCase();
  for (const p of planNames) {
    const plan = String(p || "").trim();
    if (!plan) continue;
    if (lower === plan.toLowerCase()) return true;
    if (base && base === filenameWithoutExtension(plan).toLowerCase()) return true;
  }
  return false;
}

/**
 * Usable human-facing request/email subject (not a plan filename).
 * @param {string|null|undefined} value
 */
export function isUsableRequestSubject(value) {
  const s = sanitizeQueueSourceText(value, 320);
  if (!s) return false;
  if (s === "(no subject)") return false;
  if (/not named|not identified|^unknown$/i.test(s)) return false;
  if (isOpaquePlanFilename(s)) return false;
  if (looksLikeAttachmentFilename(s)) return false;
  return true;
}

/**
 * Prefer the original email/request subject. Never treat attachment filenames as subject.
 * @param {object|null|undefined} inboxItem
 * @param {{ selectedPlanFilename?: string|null, packetFiles?: Array<{filename?: string|null}> }} [opts]
 */
export function pickQuoteRequestSubjectFromInboxItem(inboxItem, opts = {}) {
  const planNames = [
    opts.selectedPlanFilename,
    ...(Array.isArray(opts.packetFiles) ? opts.packetFiles.map((f) => f?.filename) : []),
    inboxItem?.bestPlanCandidate?.filename,
    inboxItem?.takeoffPlanFilename,
    inboxItem?.planFilename,
    inboxItem?.selectedPlanFilename,
    inboxItem?.attachmentName
  ].filter(Boolean);

  const candidates = [
    inboxItem?.subject,
    inboxItem?.requestSubject,
    inboxItem?.requestTitle,
    inboxItem?.projectLabel
  ];
  for (const c of candidates) {
    if (!isUsableRequestSubject(c)) continue;
    if (matchesAnyPlanFilename(c, planNames)) continue;
    return sanitizeQueueSourceText(c, 320);
  }
  return null;
}

/**
 * @param {string|null|undefined} value
 * @param {number} [max]
 */
export function sanitizeQueueSourceText(value, max = 240) {
  let s = String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  if (s.length > max) s = `${s.slice(0, max - 1)}…`;
  return s;
}

/**
 * Build metadata blob stored on quote_takeoff_jobs.metadata.quoteFlow.
 * @param {{
 *   requestSubject?: string|null,
 *   senderLabel?: string|null,
 *   customerLabel?: string|null,
 *   selectedPlanFilename?: string|null,
 *   packetFilename?: string|null,
 *   packetMerged?: boolean,
 *   packetFiles?: Array<{ filename?: string|null, attachmentKey?: string|null }>,
 *   messageKey?: string|null,
 *   sourceMailboxLabel?: string|null,
 *   startedAt?: string|null
 * }} input
 */
export function buildQuoteFlowTakeoffSourceMeta(input = {}) {
  const packetFiles = (Array.isArray(input.packetFiles) ? input.packetFiles : [])
    .map((f) => {
      const filename = sanitizeQueueSourceText(f?.filename || f?.name || f?.safeFilename, 180);
      const attachmentKey = String(f?.attachmentKey || f?.key || "").trim() || null;
      if (!filename && !attachmentKey) return null;
      return {
        filename: filename || null,
        attachmentKey
      };
    })
    .filter(Boolean)
    .slice(0, 40);

  const packetMerged = input.packetMerged === true || packetFiles.length > 1;
  const selectedPlanFilename =
    sanitizeQueueSourceText(input.selectedPlanFilename, 180) ||
    (!packetMerged && packetFiles[0]?.filename) ||
    null;
  const packetFilename = sanitizeQueueSourceText(input.packetFilename, 180);

  return {
    requestSubject: isUsableRequestSubject(input.requestSubject)
      ? sanitizeQueueSourceText(input.requestSubject, 320)
      : null,
    senderLabel: sanitizeQueueSourceText(input.senderLabel, 160),
    customerLabel: sanitizeQueueSourceText(input.customerLabel, 160),
    selectedPlanFilename,
    packetFilename: packetFilename || (packetMerged ? selectedPlanFilename : null),
    packetMerged,
    packetFileCount: packetMerged
      ? Math.max(packetFiles.length, Number(input.packetFileCount) || 0, 2)
      : packetFiles.length || (selectedPlanFilename ? 1 : 0),
    packetFiles,
    messageKey: String(input.messageKey || "").trim() || null,
    sourceMailboxLabel: sanitizeQueueSourceText(input.sourceMailboxLabel, 120),
    startedAt: input.startedAt || new Date().toISOString()
  };
}

/**
 * Read quoteFlow source meta from a takeoff job row.
 * @param {object|null|undefined} takeoffJob
 */
export function readQuoteFlowTakeoffSourceMeta(takeoffJob) {
  const meta =
    takeoffJob?.metadata && typeof takeoffJob.metadata === "object"
      ? takeoffJob.metadata
      : takeoffJob?.jobMetadata && typeof takeoffJob.jobMetadata === "object"
        ? takeoffJob.jobMetadata
        : {};
  const qf = meta.quoteFlow && typeof meta.quoteFlow === "object" ? meta.quoteFlow : null;
  const summary =
    takeoffJob?.result_summary && typeof takeoffJob.result_summary === "object"
      ? takeoffJob.result_summary
      : takeoffJob?.resultSummary && typeof takeoffJob.resultSummary === "object"
        ? takeoffJob.resultSummary
        : {};
  const fromSummary =
    summary.quoteFlow && typeof summary.quoteFlow === "object" ? summary.quoteFlow : null;
  const raw = qf || fromSummary;
  if (!raw) return null;
  return buildQuoteFlowTakeoffSourceMeta(raw);
}

/**
 * Merge quoteFlow source onto existing job metadata (shallow).
 * @param {object|null|undefined} existingMetadata
 * @param {ReturnType<typeof buildQuoteFlowTakeoffSourceMeta>} quoteFlow
 */
export function mergeQuoteFlowTakeoffMetadata(existingMetadata, quoteFlow) {
  const base =
    existingMetadata && typeof existingMetadata === "object" ? { ...existingMetadata } : {};
  const prev =
    base.quoteFlow && typeof base.quoteFlow === "object" ? { ...base.quoteFlow } : {};
  const next = quoteFlow && typeof quoteFlow === "object" ? { ...quoteFlow } : {};

  // Never wipe / replace a good request subject with null or a plan filename.
  if (
    isUsableRequestSubject(prev.requestSubject) &&
    !isUsableRequestSubject(next.requestSubject)
  ) {
    next.requestSubject = sanitizeQueueSourceText(prev.requestSubject, 320);
  }

  return {
    ...base,
    quoteFlow: {
      ...prev,
      ...next
    }
  };
}

/**
 * Persist quoteFlow source meta on an existing takeoff job (best-effort).
 * @param {{
 *   getSupabase?: Function|null,
 *   organizationId: string,
 *   takeoffJobId: string,
 *   quoteFlow: ReturnType<typeof buildQuoteFlowTakeoffSourceMeta>
 * }} args
 */
export async function persistQuoteFlowTakeoffSourceMeta(args) {
  const organizationId = String(args.organizationId || "").trim();
  const takeoffJobId = String(args.takeoffJobId || "").trim();
  const quoteFlow = args.quoteFlow;
  const getSupabase = args.getSupabase;
  if (!organizationId || !takeoffJobId || !quoteFlow || typeof getSupabase !== "function") {
    return { ok: false, reason: "missing_args" };
  }
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: "no_supabase" };
  try {
    const { data: row, error: readErr } = await supabase
      .from("quote_takeoff_jobs")
      .select("id,metadata")
      .eq("organization_id", organizationId)
      .eq("id", takeoffJobId)
      .maybeSingle();
    if (readErr || !row?.id) return { ok: false, reason: "job_not_found" };
    const nextMeta = mergeQuoteFlowTakeoffMetadata(row.metadata, quoteFlow);
    const { error: writeErr } = await supabase
      .from("quote_takeoff_jobs")
      .update({ metadata: nextMeta })
      .eq("organization_id", organizationId)
      .eq("id", takeoffJobId);
    if (writeErr) return { ok: false, reason: "write_failed" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "exception" };
  }
}
