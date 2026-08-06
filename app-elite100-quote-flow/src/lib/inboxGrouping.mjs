/**
 * Client-side Inbox grouping / progress / filter helpers (mirrors Quote Flow presenter).
 */

/**
 * @param {unknown} value
 * @param {string} [fallback]
 */
function asString(value, fallback = "") {
  if (value == null) return fallback;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim() || fallback;
  }
  return fallback;
}

/**
 * @param {object} item
 */
export function resolveInboxGroupKey(item) {
  if (item?.dismissed === true) return "dismissed";
  const fromApi = asString(item?.group?.key);
  if (
    fromApi === "needs_action" ||
    fromApi === "active" ||
    fromApi === "ready_for_review" ||
    fromApi === "completed" ||
    fromApi === "dismissed"
  ) {
    return fromApi;
  }
  const status = asString(item?.takeoffStatus?.key);
  if (
    status === "needs_attachment_selection" ||
    status === "ready_to_start" ||
    status === "takeoff_failed"
  ) {
    return "needs_action";
  }
  if (status === "takeoff_queued" || status === "takeoff_processing") return "active";
  if (status === "takeoff_returned") return "ready_for_review";
  return "completed";
}

/**
 * @param {object[]} items
 */
export function groupInboxItems(items) {
  const list = Array.isArray(items) ? items : [];
  /** @type {Record<string, object[]>} */
  const groups = {
    needs_action: [],
    active: [],
    ready_for_review: [],
    completed: [],
    dismissed: []
  };
  for (const item of list) {
    const key = resolveInboxGroupKey(item);
    if (groups[key]) groups[key].push(item);
    else groups.completed.push(item);
  }
  const active = list.filter((i) => i?.dismissed !== true);
  return {
    ...groups,
    stats: {
      newUnopened: active.filter(
        (i) => resolveInboxGroupKey(i) === "needs_action" && i?.opened !== true
      ).length,
      needsAction: groups.needs_action.length,
      activeTakeoffs: groups.active.length,
      readyForReview: active.filter((i) => i?.takeoffStatus?.key === "takeoff_returned").length,
      scopeSet: active.filter(
        (i) => i?.takeoffStatus?.key === "already_scoped" || i?.alreadyScoped
      ).length,
      dismissed: groups.dismissed.length
    }
  };
}

/**
 * Filter keys for command-center chips.
 * @typedef {"all_active"|"new"|"needs_attachment"|"active"|"ready"|"scope_set"|"removed"} InboxFilterKey
 */

/**
 * @param {object[]} items
 * @param {InboxFilterKey} filter
 * @param {string} [search]
 */
export function filterInboxItems(items, filter = "all_active", search = "") {
  const list = Array.isArray(items) ? items : [];
  const q = String(search || "")
    .trim()
    .toLowerCase();

  let rows = list;
  switch (filter) {
    case "removed":
      rows = list.filter((i) => i?.dismissed === true);
      break;
    case "new":
      rows = list.filter(
        (i) =>
          i?.dismissed !== true &&
          resolveInboxGroupKey(i) === "needs_action" &&
          i?.opened !== true
      );
      break;
    case "needs_attachment":
      rows = list.filter(
        (i) =>
          i?.dismissed !== true &&
          (i?.takeoffStatus?.key === "needs_attachment_selection" ||
            i?.planSelectionRequired === true)
      );
      break;
    case "active":
      rows = list.filter(
        (i) => i?.dismissed !== true && resolveInboxGroupKey(i) === "active"
      );
      break;
    case "ready":
      rows = list.filter(
        (i) => i?.dismissed !== true && i?.takeoffStatus?.key === "takeoff_returned"
      );
      break;
    case "scope_set":
      rows = list.filter(
        (i) =>
          i?.dismissed !== true &&
          (i?.alreadyScoped === true || i?.takeoffStatus?.key === "already_scoped")
      );
      break;
    case "all_active":
    default:
      rows = list.filter((i) => i?.dismissed !== true);
      break;
  }

  if (!q) return rows;
  return rows.filter((item) => {
    const hay = [
      item?.sender,
      item?.senderLabel,
      item?.customerDisplay,
      item?.customerLabel,
      item?.subject,
      item?.projectLabel,
      item?.requestTitle,
      item?.bestPlanCandidate?.filename,
      ...(Array.isArray(item?.attachments)
        ? item.attachments.map((a) => a?.filename)
        : [])
    ]
      .map((v) => asString(v).toLowerCase())
      .join(" ");
    return hay.includes(q);
  });
}

/**
 * Sort for list display: unopened / needs action first.
 * @param {object[]} items
 */
export function sortInboxItemsForDisplay(items) {
  const list = Array.isArray(items) ? [...items] : [];
  const order = {
    needs_action: 0,
    active: 2,
    ready_for_review: 3,
    completed: 4,
    dismissed: 99
  };
  list.sort((a, b) => {
    const ak = resolveInboxGroupKey(a);
    const bk = resolveInboxGroupKey(b);
    let ao = order[ak] ?? 50;
    let bo = order[bk] ?? 50;
    if (ak === "needs_action" && a?.opened !== true) ao = -1;
    if (bk === "needs_action" && b?.opened !== true) bo = -1;
    if (ao !== bo) return ao - bo;
    const aOpen = a?.opened === true ? 1 : 0;
    const bOpen = b?.opened === true ? 1 : 0;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return String(b?.receivedAt || "").localeCompare(String(a?.receivedAt || ""));
  });
  return list;
}

/**
 * Coarse progress from status (do not invent finer precision).
 * In-flight stages are indeterminate — no trustworthy engine percent.
 * @param {object} item
 */
export function resolveInboxProgress(item) {
  if (item?.progress && typeof item.progress === "object") {
    const percentRaw = item.progress.percent;
    const percent =
      percentRaw == null || percentRaw === ""
        ? null
        : Number.isFinite(Number(percentRaw))
          ? Math.max(0, Math.min(100, Number(percentRaw)))
          : null;
    return {
      percent,
      stageKey: asString(item.progress.stageKey, "not_started"),
      stageLabel: asString(item.progress.stageLabel, "Not started"),
      isError: item.progress.isError === true,
      isComplete: item.progress.isComplete === true,
      approximate: item.progress.approximate === true || percent == null,
      indeterminate:
        item.progress.indeterminate === true ||
        (percent == null && item.progress.isError !== true && item.progress.isComplete !== true)
    };
  }

  const status = asString(item?.takeoffStatus?.key);
  if (item?.alreadyScoped || status === "already_scoped") {
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
  if (status === "takeoff_failed") {
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
  if (status === "takeoff_returned") {
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
  if (status === "takeoff_processing") {
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
  if (status === "takeoff_queued") {
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
 * @param {number|null|undefined} seconds
 */
export function formatElapsedLabel(seconds) {
  if (seconds == null || !Number.isFinite(Number(seconds)) || Number(seconds) < 0) return null;
  const s = Math.floor(Number(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/**
 * @param {string|null|undefined} iso
 */
export function formatClockTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Safe request title — avoid empty "Customer not identified / Project not named" spam.
 * @param {object} item
 */
export function resolveRequestTitle(item) {
  const title = asString(item?.requestTitle);
  if (title && !/not identified|not named/i.test(title)) return title;
  const subject = asString(item?.subject);
  if (subject && subject !== "(no subject)" && !/not named/i.test(subject)) return subject;
  const project = asString(item?.projectLabel);
  if (project && !/not named|not identified/i.test(project)) return project;
  const plan = asString(item?.bestPlanCandidate?.filename);
  if (plan) return plan;
  return "Quote request";
}

/**
 * @param {object} item
 * @param {(v: unknown, fb?: string) => string} formatPersonLabel
 */
export function resolveCustomerDisplay(item, formatPersonLabel) {
  const fromApi = asString(item?.customerDisplay || item?.customerLabel);
  if (fromApi && fromApi !== "Unknown contact" && !/not identified/i.test(fromApi)) {
    return fromApi;
  }
  const sender = formatPersonLabel(item?.senderLabel ?? item?.sender, "");
  if (sender) return sender;
  const plan = asString(item?.bestPlanCandidate?.filename);
  if (plan) return `Plan: ${plan}`;
  return "Unknown contact";
}
