/**
 * Client-side Inbox grouping / progress helpers (mirrors Quote Flow presenter).
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
  const fromApi = asString(item?.group?.key);
  if (fromApi === "needs_action" || fromApi === "active" || fromApi === "completed") {
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
  return "completed";
}

/**
 * @param {object[]} items
 */
export function groupInboxItems(items) {
  const list = Array.isArray(items) ? items : [];
  /** @type {{ needs_action: object[], active: object[], completed: object[] }} */
  const groups = { needs_action: [], active: [], completed: [] };
  for (const item of list) {
    groups[resolveInboxGroupKey(item)].push(item);
  }
  return {
    ...groups,
    stats: {
      needsAction: groups.needs_action.length,
      activeTakeoffs: groups.active.length,
      readyForReview: list.filter((i) => i?.takeoffStatus?.key === "takeoff_returned").length,
      scopeSet: list.filter((i) => i?.takeoffStatus?.key === "already_scoped" || i?.alreadyScoped)
        .length
    }
  };
}

/**
 * Coarse progress from status (do not invent finer precision).
 * @param {object} item
 */
export function resolveInboxProgress(item) {
  if (item?.progress && typeof item.progress === "object" && Number.isFinite(item.progress.percent)) {
    return {
      percent: Math.max(0, Math.min(100, Number(item.progress.percent))),
      stageKey: asString(item.progress.stageKey, "not_started"),
      stageLabel: asString(item.progress.stageLabel, "Not started"),
      isError: item.progress.isError === true,
      isComplete: item.progress.isComplete === true
    };
  }

  const status = asString(item?.takeoffStatus?.key);
  if (item?.alreadyScoped || status === "already_scoped") {
    return {
      percent: 100,
      stageKey: "scope_set",
      stageLabel: "Scope set",
      isError: false,
      isComplete: true
    };
  }
  if (status === "takeoff_failed") {
    return {
      percent: 0,
      stageKey: "failed",
      stageLabel: "Takeoff failed",
      isError: true,
      isComplete: false
    };
  }
  if (status === "takeoff_returned") {
    return {
      percent: 100,
      stageKey: "returned",
      stageLabel: "Ready for review",
      isError: false,
      isComplete: true
    };
  }
  if (status === "takeoff_processing") {
    return {
      percent: 55,
      stageKey: "processing",
      stageLabel: "Processing takeoff",
      isError: false,
      isComplete: false
    };
  }
  if (status === "takeoff_queued") {
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
