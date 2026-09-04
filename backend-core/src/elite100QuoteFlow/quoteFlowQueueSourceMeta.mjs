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
 * Generic/scanner basenames that must never become a canonical Quote Name.
 * @param {string|null|undefined} name
 */
export function isWeakPlanBasename(name) {
  const raw = String(name || "").trim();
  if (!raw) return true;
  const base = filenameWithoutExtension(raw);
  if (!base) return true;
  if (isOpaquePlanFilename(raw)) return true;
  if (/^(image|img|scan|drawing|photo|screenshot|file|document|attachment|pic|dsc)[\d_\-]*$/i.test(base)) {
    return true;
  }
  // Shop scanner patterns like 1803_001
  if (/^\d{2,5}_\d{2,5}$/.test(base)) return true;
  if (/^(untitled|new document)$/i.test(base)) return true;
  return false;
}

/**
 * Meaningful human-facing Quote Name (not plan/file identity).
 * Rejects extensions and weak scanner basenames (image001, 1803_001).
 * A name may legitimately match a plan stem (e.g. job title used as filename).
 * @param {string|null|undefined} value
 * @param {Array<string|null|undefined>} [planNames]
 */
export function isMeaningfulQuoteName(value, planNames = []) {
  void planNames;
  const s = sanitizeQueueSourceText(value, 200);
  if (!s) return false;
  if (s === "(no subject)") return false;
  if (/^quote name required$/i.test(s)) return false;
  if (/not named|not identified|^unknown$/i.test(s)) return false;
  if (looksLikeAttachmentFilename(s)) return false;
  if (isWeakPlanBasename(s)) return false;
  return true;
}

/**
 * Establish initial canonical Quote Name from email subject (never from filename).
 * @param {{
 *   requestSubject?: string|null,
 *   quoteName?: string|null,
 *   quoteNameUserSet?: boolean,
 *   selectedPlanFilename?: string|null,
 *   packetFiles?: Array<{filename?: string|null}>
 * }} input
 */
export function establishInitialQuoteName(input = {}) {
  const planNames = [
    input.selectedPlanFilename,
    ...(Array.isArray(input.packetFiles) ? input.packetFiles.map((f) => f?.filename) : [])
  ].filter(Boolean);

  if (input.quoteNameUserSet === true && isMeaningfulQuoteName(input.quoteName, planNames)) {
    return {
      quoteName: sanitizeQueueSourceText(input.quoteName, 200),
      quoteNameUserSet: true,
      quoteNameSource: "user"
    };
  }

  if (isMeaningfulQuoteName(input.quoteName, planNames)) {
    return {
      quoteName: sanitizeQueueSourceText(input.quoteName, 200),
      quoteNameUserSet: input.quoteNameUserSet === true,
      quoteNameSource:
        input.quoteNameUserSet === true
          ? "user"
          : isUsableRequestSubject(input.requestSubject) &&
              sanitizeQueueSourceText(input.quoteName, 200) ===
                sanitizeQueueSourceText(input.requestSubject, 200)
            ? "email_subject"
            : "existing"
    };
  }

  if (isUsableRequestSubject(input.requestSubject)) {
    return {
      quoteName: sanitizeQueueSourceText(input.requestSubject, 200),
      quoteNameUserSet: false,
      quoteNameSource: "email_subject"
    };
  }

  return {
    quoteName: null,
    quoteNameUserSet: false,
    quoteNameSource: null
  };
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
 *   quoteName?: string|null,
 *   quoteNameUserSet?: boolean,
 *   quoteNameSource?: string|null,
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

  const requestSubject = isUsableRequestSubject(input.requestSubject)
    ? sanitizeQueueSourceText(input.requestSubject, 320)
    : null;

  const established = establishInitialQuoteName({
    requestSubject,
    quoteName: input.quoteName,
    quoteNameUserSet: input.quoteNameUserSet === true,
    selectedPlanFilename,
    packetFiles
  });

  return {
    requestSubject,
    quoteName: established.quoteName,
    quoteNameUserSet: established.quoteNameUserSet === true,
    quoteNameSource: established.quoteNameSource,
    sourceEmailBodyPreview: sanitizeQueueSourceText(input.sourceEmailBodyPreview, 4000),
    sourceEmailBodyCharCount:
      Number.isFinite(Number(input.sourceEmailBodyCharCount)) && Number(input.sourceEmailBodyCharCount) > 0
        ? Math.floor(Number(input.sourceEmailBodyCharCount))
        : input.sourceEmailBodyPreview
          ? String(input.sourceEmailBodyPreview).length
          : null,
    requestedSelections:
      input.requestedSelections && typeof input.requestedSelections === "object"
        ? input.requestedSelections
        : null,
    startingConfiguration:
      input.startingConfiguration && typeof input.startingConfiguration === "object"
        ? input.startingConfiguration
        : null,
    accountDirectoryLink:
      input.accountDirectoryLink && typeof input.accountDirectoryLink === "object"
        ? input.accountDirectoryLink
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
 * Preserves canonical Quote Name and email subject across attachment/AI reruns.
 * @param {object|null|undefined} existingMetadata
 * @param {ReturnType<typeof buildQuoteFlowTakeoffSourceMeta>} quoteFlow
 */
export function mergeQuoteFlowTakeoffMetadata(existingMetadata, quoteFlow) {
  const base =
    existingMetadata && typeof existingMetadata === "object" ? { ...existingMetadata } : {};
  const prev =
    base.quoteFlow && typeof base.quoteFlow === "object" ? { ...base.quoteFlow } : {};
  const next = quoteFlow && typeof quoteFlow === "object" ? { ...quoteFlow } : {};

  const planNames = [
    next.selectedPlanFilename,
    prev.selectedPlanFilename,
    ...(Array.isArray(next.packetFiles) ? next.packetFiles.map((f) => f?.filename) : []),
    ...(Array.isArray(prev.packetFiles) ? prev.packetFiles.map((f) => f?.filename) : [])
  ].filter(Boolean);

  // Never wipe / replace a good request subject with null or a plan filename.
  if (
    isUsableRequestSubject(prev.requestSubject) &&
    !isUsableRequestSubject(next.requestSubject)
  ) {
    next.requestSubject = sanitizeQueueSourceText(prev.requestSubject, 320);
  }

  const prevUserSet = prev.quoteNameUserSet === true;
  const prevMeaningful = isMeaningfulQuoteName(prev.quoteName, planNames);
  const nextMeaningful = isMeaningfulQuoteName(next.quoteName, planNames);

  if (prevUserSet && prevMeaningful) {
    // Estimator-owned name wins forever over stamp/AI/attachment merges.
    next.quoteName = sanitizeQueueSourceText(prev.quoteName, 200);
    next.quoteNameUserSet = true;
    next.quoteNameSource = "user";
  } else if (prevMeaningful && !nextMeaningful) {
    next.quoteName = sanitizeQueueSourceText(prev.quoteName, 200);
    next.quoteNameUserSet = prevUserSet === true;
    next.quoteNameSource = prev.quoteNameSource || "existing";
  } else if (!nextMeaningful) {
    const established = establishInitialQuoteName({
      requestSubject: next.requestSubject || prev.requestSubject,
      quoteName: null,
      quoteNameUserSet: false,
      selectedPlanFilename: next.selectedPlanFilename || prev.selectedPlanFilename,
      packetFiles: next.packetFiles || prev.packetFiles
    });
    next.quoteName = established.quoteName;
    next.quoteNameUserSet = false;
    next.quoteNameSource = established.quoteNameSource;
  } else if (next.quoteNameUserSet !== true) {
    next.quoteNameUserSet = false;
    next.quoteNameSource = next.quoteNameSource || "email_subject";
  }

  // Preserve bounded email body + confirmed requested selections across reruns.
  if (prev.sourceEmailBodyPreview && !next.sourceEmailBodyPreview) {
    next.sourceEmailBodyPreview = prev.sourceEmailBodyPreview;
    next.sourceEmailBodyCharCount = prev.sourceEmailBodyCharCount || null;
  }

  return {
    ...base,
    quoteFlow: {
      ...prev,
      ...next,
      requestedSelections: mergeRequestedSelectionsSafe(prev.requestedSelections, next.requestedSelections),
      startingConfiguration: mergeStartingConfigurationMeta(
        prev.startingConfiguration,
        next.startingConfiguration
      ),
      accountDirectoryLink: mergeAccountDirectoryLinkMeta(
        prev.accountDirectoryLink,
        next.accountDirectoryLink
      )
    }
  };
}

function mergeRequestedSelectionsSafe(prevSel, nextSel) {
  try {
    const prev = prevSel && typeof prevSel === "object" ? prevSel : null;
    const next = nextSel && typeof nextSel === "object" ? nextSel : null;
    if (!prev) return next;
    if (!next) return prev;
    const prevItems = Array.isArray(prev.items) ? prev.items : [];
    const nextItems = Array.isArray(next.items) ? next.items : [];
    const keep = prevItems.filter((i) => i?.status === "confirmed" || i?.status === "rejected");
    const keepIds = new Set(keep.map((i) => String(i.id)));
    const keepFp = new Set(
      keep.map(
        (i) =>
          `${i.kind}|${String(i.customerRawText || "").toLowerCase()}|${String(i.roomHint || "").toLowerCase()}`
      )
    );
    const merged = [
      ...keep,
      ...nextItems.filter((i) => {
        if (keepIds.has(String(i?.id))) return false;
        const fp = `${i?.kind}|${String(i?.customerRawText || "").toLowerCase()}|${String(i?.roomHint || "").toLowerCase()}`;
        return !keepFp.has(fp);
      })
    ];
    return { ...prev, ...next, items: merged.slice(0, 80) };
  } catch {
    return nextSel || prevSel || null;
  }
}

function mergeStartingConfigurationMeta(prevCfg, nextCfg) {
  try {
    const prev = prevCfg && typeof prevCfg === "object" ? prevCfg : null;
    const next = nextCfg && typeof nextCfg === "object" ? nextCfg : null;
    if (!prev) return next;
    if (!next) return prev;
    if (prev.userSet === true) return prev;
    if (next.userSet === true) return next;
    if (prev.seededAt && !next.seededAt) return prev;
    return { ...prev, ...next };
  } catch {
    return nextCfg || prevCfg || null;
  }
}

function mergeAccountDirectoryLinkMeta(prevLink, nextLink) {
  try {
    const prev = prevLink && typeof prevLink === "object" ? prevLink : null;
    const next = nextLink && typeof nextLink === "object" ? nextLink : null;
    if (!prev) return next;
    if (!next) return prev;
    if (prev.status === "confirmed" && prev.userSet === true) return prev;
    if (next.status === "confirmed" && next.userSet === true) return next;
    return { ...prev, ...next };
  } catch {
    return nextLink || prevLink || null;
  }
}

/**
 * Persist only the canonical Quote Name (estimator Save Draft / rename).
 * @param {{
 *   getSupabase?: Function|null,
 *   organizationId: string,
 *   takeoffJobId: string,
 *   quoteName: string,
 *   userSet?: boolean
 * }} args
 */
export async function persistQuoteFlowQuoteName(args) {
  const organizationId = String(args.organizationId || "").trim();
  const takeoffJobId = String(args.takeoffJobId || "").trim();
  const getSupabase = args.getSupabase;
  if (!organizationId || !takeoffJobId || typeof getSupabase !== "function") {
    return { ok: false, reason: "missing_args" };
  }
  const name = sanitizeQueueSourceText(args.quoteName, 200);
  if (!isMeaningfulQuoteName(name)) {
    return { ok: false, reason: "quote_name_required" };
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
    const base =
      row.metadata && typeof row.metadata === "object" ? { ...row.metadata } : {};
    const prev = base.quoteFlow && typeof base.quoteFlow === "object" ? { ...base.quoteFlow } : {};
    const nextMeta = {
      ...base,
      quoteFlow: {
        ...prev,
        quoteName: name,
        quoteNameUserSet: args.userSet !== false,
        quoteNameSource: args.userSet === false ? prev.quoteNameSource || "email_subject" : "user"
      }
    };
    const { error: writeErr } = await supabase
      .from("quote_takeoff_jobs")
      .update({ metadata: nextMeta })
      .eq("organization_id", organizationId)
      .eq("id", takeoffJobId);
    if (writeErr) return { ok: false, reason: "write_failed" };
    return {
      ok: true,
      quoteName: name,
      quoteNameUserSet: args.userSet !== false
    };
  } catch {
    return { ok: false, reason: "exception" };
  }
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
