/**
 * Present Shared Inbox rows as Quote Flow Inbox DTOs.
 * Product statuses only — no V1/V2 language.
 */

/** Soft warning when processing exceeds this (ms). */
export const QUOTE_FLOW_INBOX_PROCESSING_WARN_MS = 15 * 60 * 1000;
/** Stale when processing exceeds this (ms). */
export const QUOTE_FLOW_INBOX_PROCESSING_STALE_MS = 60 * 60 * 1000;

/**
 * Shared Inbox may send sender/customer as
 * `{ displayName, safeAddressLabel, emailPresent }` — never pass that object to React.
 *
 * @param {unknown} value
 * @param {string} [fallback="Unknown contact"]
 * @returns {string}
 */
export function formatQuoteFlowPersonLabel(value, fallback = "Unknown contact") {
  if (value == null || value === "") return fallback;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const s = String(value).trim();
    return s || fallback;
  }
  if (typeof value !== "object") return fallback;

  const obj = /** @type {Record<string, unknown>} */ (value);
  const displayName = String(obj.displayName ?? "").trim();
  if (displayName) return displayName;

  const safeAddressLabel = String(obj.safeAddressLabel ?? "").trim();
  if (safeAddressLabel) return safeAddressLabel;

  if (obj.emailPresent === true) return "Email on file";

  for (const key of ["sender", "from", "customer", "contact", "requester", "account", "recipient"]) {
    if (obj[key] != null) {
      const nested = formatQuoteFlowPersonLabel(obj[key], "");
      if (nested) return nested;
    }
  }

  return fallback;
}

/**
 * Strip secrets / stack traces from takeoff error text for staff UI.
 * @param {unknown} value
 * @returns {string|null}
 */
export function sanitizeTakeoffErrorMessage(value) {
  if (value == null) return null;
  let s = String(value).trim();
  if (!s) return null;
  s = s.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "[redacted]");
  s = s.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}/g, "[redacted]");
  s = s.replace(/service[_-]?role[^\s]*/gi, "[redacted]");
  s = s.replace(/supabase\.co\/[^\s]+/gi, "[redacted]");
  s = s.replace(/at\s+\S+\s+\([^)]+\)/g, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  if (!s || s.length < 3) return null;
  if (s.length > 220) s = `${s.slice(0, 217)}…`;
  return s;
}

/**
 * @param {string|null|undefined} iso
 * @param {number} [nowMs]
 * @returns {number|null}
 */
export function resolveTakeoffElapsedSeconds(iso, nowMs = Date.now()) {
  if (!iso) return null;
  const started = Date.parse(String(iso));
  if (!Number.isFinite(started)) return null;
  const elapsed = Math.floor((nowMs - started) / 1000);
  return elapsed >= 0 ? elapsed : 0;
}

/**
 * @param {{
 *   statusKey?: string,
 *   startedAt?: string|null,
 *   updatedAt?: string|null,
 *   now?: number,
 *   warnMs?: number,
 *   staleMs?: number
 * }} input
 */
export function resolveInboxStaleProcessing(input = {}) {
  const statusKey = String(input.statusKey || "");
  if (statusKey !== "takeoff_queued" && statusKey !== "takeoff_processing") {
    return {
      isStaleProcessing: false,
      isLongRunning: false,
      staleLabel: null
    };
  }
  const warnMs =
    Number.isFinite(Number(input.warnMs)) && Number(input.warnMs) > 0
      ? Number(input.warnMs)
      : QUOTE_FLOW_INBOX_PROCESSING_WARN_MS;
  const staleMs =
    Number.isFinite(Number(input.staleMs)) && Number(input.staleMs) > 0
      ? Number(input.staleMs)
      : QUOTE_FLOW_INBOX_PROCESSING_STALE_MS;
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const raw = input.startedAt || input.updatedAt || null;
  const started = raw ? Date.parse(String(raw)) : NaN;
  if (!Number.isFinite(started)) {
    return {
      isStaleProcessing: false,
      isLongRunning: true,
      staleLabel: "Processing longer than expected"
    };
  }
  const age = now - started;
  if (age >= staleMs) {
    return {
      isStaleProcessing: true,
      isLongRunning: true,
      staleLabel: "Possibly stale"
    };
  }
  if (age >= warnMs) {
    return {
      isStaleProcessing: false,
      isLongRunning: true,
      staleLabel: "Processing longer than expected"
    };
  }
  return {
    isStaleProcessing: false,
    isLongRunning: false,
    staleLabel: null
  };
}

/**
 * Stable queue handoff key (matches Estimate Queue archive key).
 * @param {{ takeoffJobId?: string|null, intakeCaseId?: string|null, messageKey?: string|null }} row
 */
export function resolveInboxQueueItemKey(row = {}) {
  const takeoff = String(row?.takeoffJobId || "").trim();
  if (takeoff) return `takeoff:${takeoff}`;
  const intake = String(row?.intakeCaseId || "").trim();
  if (intake) return `intake:${intake}`;
  const message = String(row?.messageKey || "").trim();
  if (message) return `message:${message}`;
  return null;
}

/**
 * Stage progress for Inbox (coarse mapping — not fake precision).
 * In-flight stages are indeterminate (no trustworthy percent from the engine).
 * @param {{ statusKey?: string, aiState?: string, aiLabel?: string, alreadyScoped?: boolean }} input
 */
export function mapQuoteFlowTakeoffProgress(input = {}) {
  if (input.alreadyScoped === true || input.statusKey === "already_scoped") {
    return {
      percent: 100,
      stageKey: "scope_set",
      stageLabel: "Scope set",
      isError: false,
      isComplete: true,
      approximate: false,
      indeterminate: false
    };
  }

  const statusKey = String(input.statusKey || "").toLowerCase();
  const aiState = String(input.aiState || "").toLowerCase();
  const aiLabel = String(input.aiLabel || "").toLowerCase();
  const blob = `${statusKey} ${aiState} ${aiLabel}`;

  if (statusKey === "takeoff_failed" || aiState === "failed" || /fail/.test(blob)) {
    return {
      percent: null,
      stageKey: "failed",
      stageLabel: "Failed / needs decision",
      isError: true,
      isComplete: false,
      approximate: false,
      indeterminate: false
    };
  }

  if (
    statusKey === "takeoff_returned" ||
    aiState === "needs_review" ||
    aiState === "approved" ||
    /returned|ready.?for.?review|needs.?review/.test(blob)
  ) {
    return {
      percent: 100,
      stageKey: "returned",
      stageLabel: "Takeoff returned",
      isError: false,
      isComplete: true,
      approximate: false,
      indeterminate: false
    };
  }

  if (/building.?measurement|importing|import/.test(blob)) {
    return {
      percent: null,
      stageKey: "building_measurements",
      stageLabel: "AI Takeoff processing",
      isError: false,
      isComplete: false,
      approximate: true,
      indeterminate: true
    };
  }

  if (/fetching|preparing|prepare|download|sending/.test(blob)) {
    return {
      percent: null,
      stageKey: "preparing",
      stageLabel: "Sending plan to AI Takeoff",
      isError: false,
      isComplete: false,
      approximate: true,
      indeterminate: true
    };
  }

  if (
    statusKey === "takeoff_processing" ||
    aiState === "processing" ||
    /processing|running|in.?progress/.test(blob)
  ) {
    return {
      percent: null,
      stageKey: "processing",
      stageLabel: "AI Takeoff processing",
      isError: false,
      isComplete: false,
      approximate: true,
      indeterminate: true
    };
  }

  if (statusKey === "takeoff_queued" || aiState === "queued" || /queue/.test(blob)) {
    return {
      percent: null,
      stageKey: "queued",
      stageLabel: "Queued",
      isError: false,
      isComplete: false,
      approximate: true,
      indeterminate: true
    };
  }

  return {
    percent: null,
    stageKey: "not_started",
    stageLabel: "Ready to start",
    isError: false,
    isComplete: false,
    approximate: false,
    indeterminate: false
  };
}

/**
 * @param {string} statusKey
 * @param {{ dismissed?: boolean, opened?: boolean }} [opts]
 */
export function mapQuoteFlowInboxGroup(statusKey, opts = {}) {
  if (opts.dismissed === true) {
    return {
      key: "dismissed",
      label: "Removed",
      sortOrder: 99
    };
  }
  const key = String(statusKey || "");
  if (
    key === "needs_attachment_selection" ||
    key === "ready_to_start" ||
    key === "takeoff_failed"
  ) {
    const unopened = opts.opened !== true;
    return {
      key: "needs_action",
      label: unopened ? "New" : "Needs action",
      sortOrder: unopened ? 0 : 1
    };
  }
  if (key === "takeoff_queued" || key === "takeoff_processing") {
    return {
      key: "active",
      label: "Active AI Takeoffs",
      sortOrder: 2
    };
  }
  if (key === "takeoff_returned") {
    return {
      key: "ready_for_review",
      label: "Takeoff returned",
      sortOrder: 3
    };
  }
  return {
    key: "completed",
    label: "Completed / already handled",
    sortOrder: 4
  };
}

/**
 * @param {string} statusKey
 */
export function mapQuoteFlowNextAction(statusKey) {
  switch (String(statusKey || "")) {
    case "needs_attachment_selection":
      return { key: "select_plan", label: "Select plan" };
    case "ready_to_start":
      return { key: "start_takeoff", label: "Start AI Takeoff" };
    case "takeoff_queued":
    case "takeoff_processing":
      return { key: "track_progress", label: "Waiting on AI Takeoff" };
    case "takeoff_returned":
      return { key: "view_queue", label: "View in Estimate Queue" };
    case "takeoff_failed":
      return { key: "retry_takeoff", label: "Retry AI Takeoff" };
    case "already_scoped":
      return { key: "view_estimates", label: "View in Estimates" };
    default:
      return { key: "open", label: "Open" };
  }
}

/**
 * @param {object|null|undefined} item Shared Inbox row
 * @param {{ alreadyScoped?: boolean }} [opts]
 */
export function mapQuoteFlowTakeoffStatus(item, opts = {}) {
  if (opts.alreadyScoped === true) {
    return {
      key: "already_scoped",
      label: "Already scoped",
      takeoffJobId: item?.aiTakeoff?.takeoffJobId || null
    };
  }

  const ai = item?.aiTakeoff && typeof item.aiTakeoff === "object" ? item.aiTakeoff : {};
  const state = String(ai.state || "not_started");
  const takeoffJobId = ai.takeoffJobId || null;
  const planSelectionRequired = item?.planSelectionRequired === true;
  const supportedCount = Array.isArray(item?.attachments)
    ? item.attachments.filter((a) => a?.supportedForTakeoff === true).length
    : 0;

  if (state === "failed") {
    return { key: "takeoff_failed", label: "Failed / needs decision", takeoffJobId };
  }
  if (state === "processing") {
    const queued = /queue/i.test(String(ai.label || ""));
    return {
      key: queued ? "takeoff_queued" : "takeoff_processing",
      label: queued ? "Queued" : "AI Takeoff processing",
      takeoffJobId
    };
  }
  if (state === "needs_review" || state === "approved") {
    return { key: "takeoff_returned", label: "Takeoff returned", takeoffJobId };
  }
  if (takeoffJobId && state !== "not_started") {
    const progress = mapQuoteFlowTakeoffProgress({
      aiState: state,
      aiLabel: ai.label,
      statusKey: "takeoff_processing"
    });
    if (progress.stageKey === "queued") {
      return { key: "takeoff_queued", label: "Queued", takeoffJobId };
    }
    if (progress.stageKey === "preparing") {
      return {
        key: "takeoff_processing",
        label: "Sending plan to AI Takeoff",
        takeoffJobId
      };
    }
    return { key: "takeoff_processing", label: "AI Takeoff processing", takeoffJobId };
  }
  if (takeoffJobId) {
    return { key: "takeoff_queued", label: "Queued", takeoffJobId };
  }
  if (planSelectionRequired || supportedCount > 1) {
    return {
      key: "needs_attachment_selection",
      label: "Needs attachment selection",
      takeoffJobId: null
    };
  }
  if (supportedCount === 1) {
    return {
      key: "ready_to_start",
      label: "Ready to start",
      takeoffJobId: null
    };
  }
  return {
    key: "needs_attachment_selection",
    label: "Needs attachment selection",
    takeoffJobId: null
  };
}

/**
 * Build a short staff-facing timeline for the detail panel.
 * @param {object} input
 */
export function buildInboxTakeoffTimeline(input = {}) {
  /** @type {{ key: string, label: string, at?: string|null, tone?: string }[]} */
  const steps = [];
  if (input.receivedAt) {
    steps.push({
      key: "received",
      label: "Request received",
      at: input.receivedAt,
      tone: "done"
    });
  }
  if (input.planFilename) {
    steps.push({
      key: "plan",
      label: `Plan selected: ${input.planFilename}`,
      at: null,
      tone: "done"
    });
  }
  if (input.startedAt) {
    steps.push({
      key: "started",
      label: "Takeoff started",
      at: input.startedAt,
      tone: "done"
    });
  }

  const statusKey = String(input.statusKey || "");
  if (statusKey === "takeoff_queued") {
    steps.push({ key: "queued", label: "AI Takeoff queued", at: input.updatedAt, tone: "active" });
  } else if (statusKey === "takeoff_processing") {
    steps.push({
      key: "processing",
      label: input.progressLabel || "AI Takeoff processing",
      at: input.updatedAt,
      tone: "active"
    });
  } else if (statusKey === "takeoff_failed") {
    steps.push({
      key: "failed",
      label: input.errorMessage
        ? `Failed: ${input.errorMessage}`
        : "Failed: AI Takeoff failed, but no detailed reason was returned.",
      at: input.failedAt || input.updatedAt,
      tone: "error"
    });
  } else if (statusKey === "takeoff_returned") {
    steps.push({
      key: "returned",
      label: "Returned: ready for Estimate Queue",
      at: input.updatedAt,
      tone: "done"
    });
  } else if (statusKey === "already_scoped") {
    steps.push({
      key: "scoped",
      label: "Already scoped — open in Estimates",
      at: input.updatedAt,
      tone: "done"
    });
  } else if (statusKey === "ready_to_start") {
    steps.push({ key: "ready", label: "Ready to start AI Takeoff", at: null, tone: "pending" });
  } else if (statusKey === "needs_attachment_selection") {
    steps.push({ key: "select", label: "Needs plan selection", at: null, tone: "pending" });
  }

  if (input.dismissed === true) {
    steps.push({ key: "removed", label: "Removed from Quote Flow", at: null, tone: "muted" });
  }

  return steps;
}

/**
 * @param {object[]} attachments
 */
export function pickBestPlanCandidate(attachments) {
  const list = Array.isArray(attachments) ? attachments : [];
  const supported = list.filter((a) => a?.supportedForTakeoff === true);
  if (supported.length === 1) return supported[0];
  if (supported.length > 1) {
    // Prefer PDF-like plans when multiple candidates exist.
    const pdf = supported.find((a) =>
      /pdf/i.test(String(a.contentType || "")) || /\.pdf$/i.test(String(a.filename || ""))
    );
    return pdf || supported[0];
  }
  const markable = list.find((a) => a?.canMarkAsPlan === true);
  return markable || null;
}

/**
 * Sort inbox items: new/unopened → needs action → active → ready → completed → dismissed.
 * @param {object[]} items
 */
export function sortQuoteFlowInboxItems(items) {
  const list = Array.isArray(items) ? [...items] : [];
  list.sort((a, b) => {
    const ao = Number(a?.group?.sortOrder ?? 99);
    const bo = Number(b?.group?.sortOrder ?? 99);
    if (ao !== bo) return ao - bo;
    const aOpen = a?.opened === true ? 1 : 0;
    const bOpen = b?.opened === true ? 1 : 0;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return String(b?.receivedAt || "").localeCompare(String(a?.receivedAt || ""));
  });
  return list;
}

/**
 * @param {object[]} items
 */
export function groupQuoteFlowInboxItems(items) {
  const sorted = sortQuoteFlowInboxItems(items);
  /** @type {Record<string, object[]>} */
  const buckets = {
    needs_action: [],
    active: [],
    ready_for_review: [],
    completed: [],
    dismissed: []
  };
  for (const item of sorted) {
    const key = item?.group?.key || "completed";
    if (buckets[key]) buckets[key].push(item);
    else if (key === "ready_for_review") buckets.ready_for_review.push(item);
    else buckets.completed.push(item);
  }
  const activeVisible = sorted.filter((i) => i?.dismissed !== true);
  const newUnopened = activeVisible.filter(
    (i) => i?.group?.key === "needs_action" && i?.opened !== true
  ).length;
  return {
    needs_action: buckets.needs_action,
    active: buckets.active,
    ready_for_review: buckets.ready_for_review,
    completed: buckets.completed,
    dismissed: buckets.dismissed,
    stats: {
      newUnopened,
      needsAction: buckets.needs_action.length,
      activeTakeoffs: buckets.active.length,
      readyForReview: activeVisible.filter((i) => i?.takeoffStatus?.key === "takeoff_returned")
        .length,
      scopeSet: activeVisible.filter((i) => i?.takeoffStatus?.key === "already_scoped").length,
      dismissed: buckets.dismissed.length
    }
  };
}

/**
 * @param {object} item
 * @param {{ alreadyScoped?: boolean, dismissed?: boolean, opened?: boolean }} [opts]
 */
export function presentQuoteFlowInboxItem(item, opts = {}) {
  const takeoffStatus = mapQuoteFlowTakeoffStatus(item, opts);
  const attachments = (Array.isArray(item?.attachments) ? item.attachments : []).map((a) => ({
    attachmentKey: a.attachmentKey || a.id || null,
    filename: a.filename || a.name || "Attachment",
    contentType: a.contentType || a.mimeType || null,
    support: a.support || null,
    supportLabel: a.supportLabel || null,
    detectionReason: a.supportLabel || a.detectionReason || a.support || null,
    supportedForTakeoff: a.supportedForTakeoff === true,
    canMarkAsPlan: a.canMarkAsPlan === true,
    action:
      a.supportedForTakeoff === true
        ? "start_takeoff"
        : a.canMarkAsPlan === true
          ? "mark_as_plan"
          : "unsupported"
  }));

  const bestPlan = pickBestPlanCandidate(attachments);
  const senderLabel = formatQuoteFlowPersonLabel(item?.sender, "Unknown contact");
  const customerLabel = formatQuoteFlowPersonLabel(
    item?.customerLabel ?? item?.customer ?? item?.contact ?? item?.requester,
    "Unknown contact"
  );
  const accountLabel = formatQuoteFlowPersonLabel(
    item?.accountLabel ?? item?.account,
    "Unknown contact"
  );

  const subjectRaw = String(item?.subject || "").trim();
  const subject =
    subjectRaw && subjectRaw !== "(no subject)" ? subjectRaw : subjectRaw || "(no subject)";
  const projectRaw = item?.projectLabel ?? item?.project ?? item?.projectName ?? null;
  let projectLabel =
    projectRaw == null || projectRaw === ""
      ? null
      : typeof projectRaw === "string" || typeof projectRaw === "number"
        ? String(projectRaw).trim() || null
        : formatQuoteFlowPersonLabel(projectRaw, "");

  // Prefer real subject / plan filename over empty project placeholders.
  if (!projectLabel || /not named|not identified|unknown project/i.test(projectLabel)) {
    projectLabel = null;
  }

  const requestTitle =
    (subject && subject !== "(no subject)" ? subject : null) ||
    projectLabel ||
    (bestPlan?.filename ? String(bestPlan.filename) : null) ||
    "Quote request";

  const customerDisplay =
    (senderLabel && senderLabel !== "Unknown contact" ? senderLabel : null) ||
    (customerLabel && customerLabel !== "Unknown contact" ? customerLabel : null) ||
    (accountLabel && accountLabel !== "Unknown contact" ? accountLabel : null) ||
    (bestPlan?.filename ? `Plan: ${bestPlan.filename}` : null) ||
    "Unknown contact";

  const ai = item?.aiTakeoff && typeof item.aiTakeoff === "object" ? item.aiTakeoff : {};
  const dismissed = opts.dismissed === true;
  const opened = opts.opened === true;
  const progress = mapQuoteFlowTakeoffProgress({
    statusKey: takeoffStatus.key,
    aiState: ai.state,
    aiLabel: ai.label,
    alreadyScoped: opts.alreadyScoped === true
  });
  const group = mapQuoteFlowInboxGroup(takeoffStatus.key, { dismissed, opened });
  const nextAction = mapQuoteFlowNextAction(takeoffStatus.key);
  const estimateId = item?.estimateId || item?.activeEstimateId || null;

  const canStartTakeoff =
    opts.alreadyScoped !== true &&
    dismissed !== true &&
    (takeoffStatus.key === "ready_to_start" ||
      takeoffStatus.key === "needs_attachment_selection" ||
      takeoffStatus.key === "takeoff_failed");

  const isActiveTakeoff =
    takeoffStatus.key === "takeoff_queued" || takeoffStatus.key === "takeoff_processing";

  const takeoffJobId = takeoffStatus.takeoffJobId || null;
  const takeoffPlanFilename =
    String(ai.planFilename || bestPlan?.filename || "").trim() || null;
  const takeoffStartedAt = ai.startedAt || item?.takeoffStartedAt || null;
  const takeoffUpdatedAt = ai.updatedAt || item?.takeoffUpdatedAt || item?.lastActivityAt || null;
  const takeoffFailedAt =
    takeoffStatus.key === "takeoff_failed"
      ? ai.failedAt || item?.takeoffCompletedAt || takeoffUpdatedAt || null
      : null;
  const importError = item?.lastImportError && typeof item.lastImportError === "object"
    ? item.lastImportError
    : null;
  const takeoffErrorMessageSafe =
    sanitizeTakeoffErrorMessage(ai.errorMessage) ||
    sanitizeTakeoffErrorMessage(item?.takeoffErrorMessage) ||
    sanitizeTakeoffErrorMessage(importError?.message) ||
    null;
  const takeoffErrorCode =
    String(ai.errorCode || importError?.code || "").trim() || null;
  const takeoffFailureStage =
    String(ai.failureStage || item?.takeoffFailureStage || "").trim() || null;
  const takeoffElapsedSeconds = resolveTakeoffElapsedSeconds(
    takeoffStartedAt || (isActiveTakeoff ? takeoffUpdatedAt : null)
  );
  const stale = resolveInboxStaleProcessing({
    statusKey: takeoffStatus.key,
    startedAt: takeoffStartedAt,
    updatedAt: takeoffUpdatedAt
  });
  const queueItemKey = resolveInboxQueueItemKey({
    takeoffJobId,
    intakeCaseId: item?.intakeCaseId || null,
    messageKey: item?.messageKey || null
  });

  const nextRecommendedAction = nextAction;
  const takeoffTimeline = buildInboxTakeoffTimeline({
    receivedAt: item?.receivedAt || null,
    planFilename: takeoffPlanFilename,
    startedAt: takeoffStartedAt,
    updatedAt: takeoffUpdatedAt,
    failedAt: takeoffFailedAt,
    statusKey: takeoffStatus.key,
    progressLabel: progress.stageLabel,
    errorMessage: takeoffErrorMessageSafe,
    dismissed
  });

  const canRetryTakeoff =
    takeoffStatus.key === "takeoff_failed" &&
    canStartTakeoff &&
    Boolean(
      bestPlan?.attachmentKey ||
        attachments.some((a) => a.supportedForTakeoff && a.attachmentKey)
    );

  return {
    messageKey: item?.messageKey || null,
    receivedAt: item?.receivedAt || null,
    sender: senderLabel,
    senderLabel,
    customerLabel: customerDisplay,
    customerDisplay,
    accountLabel,
    projectLabel: projectLabel || (subject !== "(no subject)" ? subject : null),
    requestTitle,
    subject: subject || "(no subject)",
    bodyPreview: item?.bodyPreview || null,
    intakeCaseId: item?.intakeCaseId || null,
    estimateId,
    planSelectionRequired:
      item?.planSelectionRequired === true ||
      attachments.filter((a) => a.supportedForTakeoff).length > 1,
    attachmentCount: attachments.length,
    bestPlanCandidate: bestPlan
      ? {
          attachmentKey: bestPlan.attachmentKey,
          filename: bestPlan.filename,
          contentType: bestPlan.contentType,
          detectionReason: bestPlan.detectionReason || bestPlan.supportLabel || bestPlan.support
        }
      : null,
    attachments,
    takeoffStatus,
    takeoffStatusLabel: takeoffStatus.label,
    takeoffJobId,
    takeoffProgress: progress,
    progress,
    takeoffStartedAt,
    takeoffUpdatedAt,
    takeoffElapsedSeconds,
    takeoffErrorCode,
    takeoffErrorMessageSafe:
      takeoffStatus.key === "takeoff_failed"
        ? takeoffErrorMessageSafe ||
          "AI Takeoff failed, but no detailed reason was returned."
        : takeoffErrorMessageSafe,
    takeoffFailureStage,
    takeoffFailedAt,
    takeoffPlanFilename,
    queueItemKey,
    isStaleProcessing: stale.isStaleProcessing,
    isLongRunning: stale.isLongRunning,
    staleLabel: stale.staleLabel,
    takeoffTimeline,
    group,
    nextAction,
    nextRecommendedAction,
    canStartTakeoff,
    canRetryTakeoff,
    alreadyScoped: opts.alreadyScoped === true,
    opened,
    dismissed,
    isActiveTakeoff,
    viewQueue:
      takeoffStatus.key === "takeoff_returned" ||
      takeoffStatus.key === "takeoff_queued" ||
      takeoffStatus.key === "takeoff_processing",
    viewEstimates: takeoffStatus.key === "already_scoped" && Boolean(estimateId || item?.intakeCaseId),
    queueHint:
      takeoffStatus.key === "takeoff_returned"
        ? "View in Estimate Queue"
        : takeoffStatus.key === "already_scoped"
          ? "View in Estimates"
          : null
  };
}
