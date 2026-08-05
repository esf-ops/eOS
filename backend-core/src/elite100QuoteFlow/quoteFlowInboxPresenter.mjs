/**
 * Present Shared Inbox rows as Quote Flow Inbox DTOs.
 * Product statuses only — no V1/V2 language.
 */

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
 * Stage progress for Inbox (coarse mapping — not fake precision).
 * @param {{ statusKey?: string, aiState?: string, aiLabel?: string, alreadyScoped?: boolean }} input
 */
export function mapQuoteFlowTakeoffProgress(input = {}) {
  if (input.alreadyScoped === true || input.statusKey === "already_scoped") {
    return {
      percent: 100,
      stageKey: "scope_set",
      stageLabel: "Scope set",
      isError: false,
      isComplete: true
    };
  }

  const statusKey = String(input.statusKey || "").toLowerCase();
  const aiState = String(input.aiState || "").toLowerCase();
  const aiLabel = String(input.aiLabel || "").toLowerCase();
  const blob = `${statusKey} ${aiState} ${aiLabel}`;

  if (statusKey === "takeoff_failed" || aiState === "failed" || /fail/.test(blob)) {
    return {
      percent: 0,
      stageKey: "failed",
      stageLabel: "Takeoff failed",
      isError: true,
      isComplete: false
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
      stageLabel: "Ready for review",
      isError: false,
      isComplete: true
    };
  }

  if (/building.?measurement|importing|import/.test(blob)) {
    return {
      percent: 80,
      stageKey: "building_measurements",
      stageLabel: "Building measurements",
      isError: false,
      isComplete: false
    };
  }

  if (/fetching|preparing|prepare|download/.test(blob)) {
    return {
      percent: 25,
      stageKey: "preparing",
      stageLabel: "Preparing plan",
      isError: false,
      isComplete: false
    };
  }

  if (
    statusKey === "takeoff_processing" ||
    aiState === "processing" ||
    /processing|running|in.?progress/.test(blob)
  ) {
    return {
      percent: 55,
      stageKey: "processing",
      stageLabel: "Processing takeoff",
      isError: false,
      isComplete: false
    };
  }

  if (statusKey === "takeoff_queued" || aiState === "queued" || /queue/.test(blob)) {
    return {
      percent: 10,
      stageKey: "queued",
      stageLabel: "Queued",
      isError: false,
      isComplete: false
    };
  }

  return {
    percent: 0,
    stageKey: "not_started",
    stageLabel: "Not started",
    isError: false,
    isComplete: false
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
      label: "Ready for review",
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
      return { key: "track_progress", label: "Track progress" };
    case "takeoff_returned":
      return { key: "view_queue", label: "View in Estimate Queue" };
    case "takeoff_failed":
      return { key: "retry_plan", label: "Choose plan & retry" };
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
      label: "Scope already set",
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
    return { key: "takeoff_failed", label: "Takeoff failed", takeoffJobId };
  }
  if (state === "processing") {
    const label = /queue/i.test(String(ai.label || ""))
      ? "Takeoff queued"
      : "Takeoff processing";
    return {
      key: /queue/i.test(label) ? "takeoff_queued" : "takeoff_processing",
      label,
      takeoffJobId
    };
  }
  if (state === "needs_review" || state === "approved") {
    return { key: "takeoff_returned", label: "Takeoff returned", takeoffJobId };
  }
  if (takeoffJobId && state !== "not_started") {
    // Prefer finer labels from ai.label when present.
    const progress = mapQuoteFlowTakeoffProgress({
      aiState: state,
      aiLabel: ai.label,
      statusKey: "takeoff_processing"
    });
    if (progress.stageKey === "queued") {
      return { key: "takeoff_queued", label: "Takeoff queued", takeoffJobId };
    }
    return { key: "takeoff_processing", label: "Takeoff processing", takeoffJobId };
  }
  if (takeoffJobId) {
    return { key: "takeoff_queued", label: "Takeoff queued", takeoffJobId };
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
    takeoffJobId: takeoffStatus.takeoffJobId,
    progress,
    group,
    nextAction,
    canStartTakeoff,
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
