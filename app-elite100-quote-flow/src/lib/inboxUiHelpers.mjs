/**
 * Inbox UI helpers — human labels + batch start copy (no raw Graph keys).
 */

/**
 * @param {string|null|undefined} jobId
 * @returns {string|null}
 */
export function shortJobLabel(jobId) {
  const s = String(jobId || "").trim();
  if (!s) return null;
  if (s.length <= 12) return `Job ${s}`;
  return `Job ${s.slice(0, 8)}…`;
}

/**
 * Prefer customer / subject / plan filename — never surface Graph message keys.
 * @param {object|null|undefined} item
 * @param {{
 *   resolveCustomerDisplay: Function,
 *   resolveRequestTitle: Function,
 *   formatPersonLabel: Function
 * }} helpers
 */
export function humanInboxLabel(item, helpers) {
  if (!item || typeof item !== "object") return "Request";
  const customer = String(
    helpers.resolveCustomerDisplay(item, helpers.formatPersonLabel) || ""
  ).trim();
  if (customer && customer !== "Unknown contact" && !looksLikeGraphKey(customer)) {
    return customer;
  }
  const title = String(helpers.resolveRequestTitle(item) || "").trim();
  if (title && title !== "Quote request" && !looksLikeGraphKey(title)) return title;
  const plan = String(item?.bestPlanCandidate?.filename || item?.takeoffPlanFilename || "").trim();
  if (plan) return plan;
  return "Request";
}

/**
 * Identity fields for batch / progress cards (subject + plan preferred over sender-only).
 * @param {object|null|undefined} item
 * @param {{
 *   resolveCustomerDisplay: Function,
 *   resolveRequestTitle: Function,
 *   formatPersonLabel: Function
 * }} helpers
 */
export function resolveBatchRequestIdentity(item, helpers) {
  const subjectRaw = String(
    helpers.resolveRequestTitle(item) || item?.requestTitle || item?.subject || ""
  ).trim();
  const subject =
    subjectRaw && subjectRaw !== "(no subject)" && !looksLikeGraphKey(subjectRaw)
      ? subjectRaw
      : null;
  const planFilename =
    String(item?.takeoffPlanFilename || item?.bestPlanCandidate?.filename || "").trim() || null;
  const customerRaw = String(
    helpers.resolveCustomerDisplay(item, helpers.formatPersonLabel) ||
      item?.customerDisplay ||
      item?.senderLabel ||
      ""
  ).trim();
  const customerLabel =
    customerRaw && customerRaw !== "Unknown contact" && !looksLikeGraphKey(customerRaw)
      ? customerRaw
      : null;
  const primaryLabel =
    subject || customerLabel || planFilename || humanInboxLabel(item, helpers) || "Request";
  return { subject, planFilename, customerLabel, primaryLabel };
}

/**
 * @param {string} value
 */
export function looksLikeGraphKey(value) {
  const s = String(value || "").trim();
  if (!s) return false;
  if (/^AAMk/i.test(s)) return true;
  if (/^[A-Za-z0-9+/=_-]{40,}$/.test(s) && !/\s/.test(s)) return true;
  return false;
}

/**
 * Staff-friendly one-line status for a batch start row.
 * @param {{
 *   ok: boolean,
 *   reused?: boolean,
 *   label?: string,
 *   subject?: string|null,
 *   planFilename?: string|null,
 *   customerLabel?: string|null,
 *   error?: string,
 *   kind?: string
 * }} result
 */
export function formatBatchResultLine(result) {
  const subject = String(result?.subject || "").trim();
  const plan = String(result?.planFilename || "").trim();
  const customer = String(result?.customerLabel || "").trim();
  const fallback = String(result?.label || "Request").trim() || "Request";
  const title = subject || fallback;
  const bits = [title];
  if (plan && plan !== title) bits.push(plan);
  else if (!subject && customer && customer !== title) bits.push(customer);
  const identity = bits.join(" · ");

  const err = String(result?.error || "").trim();
  if (
    result?.kind === "blocked" ||
    (!result?.ok && /scope already set|already_scoped|Open in Estimates/i.test(err))
  ) {
    return `Blocked · ${identity} — scope already set`;
  }
  if (!result?.ok) {
    return err ? `Could not start · ${identity} — ${err}` : `Could not start · ${identity}`;
  }
  if (result.reused || result.kind === "already_running") {
    return `Already processing · ${identity}`;
  }
  return `Started · ${identity}`;
}

/**
 * One clear batch headline — not a debug count strip.
 * @param {Array<{ ok: boolean, reused?: boolean, kind?: string }>} results
 */
export function summarizeBatchStartResults(results) {
  const list = Array.isArray(results) ? results : [];
  const selected = list.length;
  const started = list.filter((r) => r.ok && !r.reused && r.kind !== "already_running").length;
  const alreadyRunning = list.filter(
    (r) => r.ok && (r.reused === true || r.kind === "already_running")
  ).length;
  const failed = list.filter((r) => r.kind === "failed" || (!r.ok && r.kind !== "blocked")).length;
  const blocked = list.filter((r) => r.kind === "blocked").length;
  const tracking = started + alreadyRunning;

  let summaryLine = "";
  if (failed && !started && !alreadyRunning && !blocked) {
    summaryLine =
      failed === 1
        ? "1 AI Takeoff could not start. Review the issue below."
        : `${failed} AI Takeoffs could not start. Review the issues below.`;
  } else if (failed && (started || alreadyRunning)) {
    summaryLine =
      failed === 1
        ? "1 AI Takeoff could not start. Review the issue below."
        : `${failed} AI Takeoffs could not start. Review the issues below.`;
    if (tracking > 0) {
      summaryLine +=
        tracking === 1
          ? " We’ll keep tracking the other request here."
          : ` We’ll keep tracking the other ${tracking} here.`;
    }
  } else if (started && alreadyRunning) {
    summaryLine = `${started} AI Takeoff${started === 1 ? "" : "s"} started. ${alreadyRunning} ${
      alreadyRunning === 1 ? "was" : "were"
    } already running. We’ll keep tracking ${tracking === 2 ? "both" : "them"} here.`;
  } else if (started && !alreadyRunning) {
    summaryLine =
      started === 1
        ? "AI Takeoff started for 1 request."
        : `AI Takeoff started for ${started} requests.`;
  } else if (alreadyRunning && !started) {
    summaryLine =
      alreadyRunning === 1
        ? "1 selected request is already being processed. We’ll keep tracking it here."
        : `${alreadyRunning} selected requests are already being processed. We’ll keep tracking them here.`;
  } else if (blocked && !started && !alreadyRunning && !failed) {
    summaryLine =
      blocked === 1
        ? "1 request is already scoped. Open it in Estimates."
        : `${blocked} requests are already scoped. Open them in Estimates.`;
  } else {
    summaryLine = "Batch start finished.";
  }

  return {
    selected,
    started,
    alreadyRunning,
    failed,
    blocked,
    tracking,
    summaryLine
  };
}

/** Stage chips for active takeoff cards (no fake percent). */
export const ACTIVE_TAKEOFF_STAGE_CHIPS = [
  { key: "queued", label: "Queued" },
  { key: "sent", label: "Sent" },
  { key: "processing", label: "Processing" },
  { key: "returned", label: "Returned" }
];

/**
 * Map inbox status → chip index (0–3). Failed returns -1.
 * @param {string|null|undefined} statusKey
 * @param {string|null|undefined} stageKey
 */
export function resolveActiveTakeoffStageIndex(statusKey, stageKey) {
  const status = String(statusKey || "").toLowerCase();
  const stage = String(stageKey || "").toLowerCase();
  if (status === "takeoff_failed" || stage === "failed") return -1;
  if (status === "takeoff_returned" || status === "already_scoped" || stage === "returned") {
    return 3;
  }
  if (status === "takeoff_processing" || stage === "processing") return 2;
  if (stage === "sending" || /send/i.test(stage)) return 1;
  if (status === "takeoff_queued" || stage === "queued") return 0;
  return 0;
}

/**
 * @param {Array<object>} items
 * @param {string[]} messageKeys
 */
export function resolveTrackedBatchCompletion(items, messageKeys) {
  const keys = Array.isArray(messageKeys) ? messageKeys.filter(Boolean) : [];
  if (!keys.length) {
    return { complete: false, allReturned: false, returnedCount: 0, failedCount: 0, activeCount: 0 };
  }
  const byKey = new Map(
    (Array.isArray(items) ? items : []).map((row) => [String(row?.messageKey || ""), row])
  );
  let returnedCount = 0;
  let failedCount = 0;
  let activeCount = 0;
  let known = 0;
  for (const key of keys) {
    const row = byKey.get(key);
    if (!row) continue;
    known += 1;
    const status = String(row?.takeoffStatus?.key || "");
    if (status === "takeoff_returned" || status === "already_scoped" || row?.alreadyScoped) {
      returnedCount += 1;
    } else if (status === "takeoff_failed") {
      failedCount += 1;
    } else if (status === "takeoff_queued" || status === "takeoff_processing" || row?.isActiveTakeoff) {
      activeCount += 1;
    }
  }
  const complete = known === keys.length && activeCount === 0 && returnedCount + failedCount === keys.length;
  const allReturned = complete && failedCount === 0 && returnedCount === keys.length;
  return { complete, allReturned, returnedCount, failedCount, activeCount, known };
}
