/**
 * Client-side Estimate Queue (Scope Creation Queue) grouping / filter / label helpers.
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
  if (typeof value === "object") {
    const obj = /** @type {Record<string, unknown>} */ (value);
    const displayName = asString(obj.displayName);
    if (displayName) return displayName;
    const safe = asString(obj.safeAddressLabel);
    if (safe) return safe;
  }
  return fallback;
}

/**
 * @param {string} value
 */
function isWeakLabel(value) {
  const s = String(value || "").trim();
  if (!s) return true;
  return /^(unknown contact|customer not identified|not identified|inbound sender|inbound mailbox|manual estimate|email on file|quote request)$/i.test(
    s
  );
}

/**
 * @param {string|null|undefined} filename
 */
export function filenameWithoutExtension(filename) {
  const s = String(filename || "").trim();
  if (!s) return "";
  return s.replace(/\.[a-z0-9]{2,5}$/i, "") || s;
}

/**
 * @param {object} item
 */
export function resolveQueueGroupKey(item) {
  if (item?.alreadyScoped === true || item?.status?.key === "scope_set") return "scoped";
  const fromApi = String(item?.group?.key || "");
  if (fromApi === "ready" || fromApi === "manual" || fromApi === "processing" || fromApi === "failed") {
    return fromApi;
  }
  const status = String(item?.status?.key || "");
  if (status === "ready_for_review") return "ready";
  if (status === "manual_scope_needed") return "manual";
  if (status === "takeoff_queued" || status === "takeoff_processing") return "processing";
  if (status === "takeoff_failed") return "failed";
  return "other";
}

/**
 * @param {object[]} items
 */
export function groupQueueItems(items) {
  const list = (Array.isArray(items) ? items : []).filter(
    (i) => i?.alreadyScoped !== true && i?.status?.key !== "scope_set"
  );
  /** @type {Record<string, object[]>} */
  const groups = { ready: [], manual: [], processing: [], failed: [], other: [] };
  for (const item of list) {
    const key = resolveQueueGroupKey(item);
    if (groups[key]) groups[key].push(item);
    else groups.other.push(item);
  }
  return {
    ...groups,
    stats: {
      readyForReview: groups.ready.length,
      manualScopeNeeded: groups.manual.length,
      processing: groups.processing.length,
      failed: groups.failed.length,
      total: list.length
    }
  };
}

/**
 * @typedef {"all_active"|"ready"|"manual"|"processing"|"failed"} QueueFilterKey
 */

/**
 * Client-side filter — never resurfaces scoped rows.
 * @param {object[]} items
 * @param {QueueFilterKey} filter
 * @param {string} [search]
 */
export function filterQueueItems(items, filter = "all_active", search = "") {
  const unscoped = (Array.isArray(items) ? items : []).filter(
    (i) => i?.alreadyScoped !== true && i?.status?.key !== "scope_set"
  );
  let rows = unscoped;
  switch (filter) {
    case "ready":
      rows = unscoped.filter((i) => resolveQueueGroupKey(i) === "ready");
      break;
    case "manual":
      rows = unscoped.filter((i) => resolveQueueGroupKey(i) === "manual");
      break;
    case "processing":
      rows = unscoped.filter((i) => resolveQueueGroupKey(i) === "processing");
      break;
    case "failed":
      rows = unscoped.filter((i) => resolveQueueGroupKey(i) === "failed");
      break;
    case "all_active":
    default:
      rows = unscoped;
      break;
  }

  const q = String(search || "")
    .trim()
    .toLowerCase();
  if (!q) return rows;
  return rows.filter((item) => {
    const hay = [
      item?.estimateName,
      item?.defaultEstimateName,
      item?.customerDisplay,
      item?.customerName,
      item?.senderLabel,
      item?.projectDisplay,
      item?.projectName,
      item?.requestTitle,
      item?.subject,
      item?.planFilename,
      item?.planLabel,
      item?.summary?.label
    ]
      .map((v) => asString(v).toLowerCase())
      .join(" ");
    return hay.includes(q) && !/aamk/i.test(q);
  });
}

/**
 * Editable Estimate / Job name default.
 * @param {object} item
 */
export function resolveDefaultEstimateName(item) {
  const fromApi = asString(item?.estimateName || item?.defaultEstimateName || item?.requestTitle);
  if (fromApi && !isWeakLabel(fromApi) && !/^AAMk/i.test(fromApi) && !/unknown contact/i.test(fromApi)) {
    return fromApi;
  }

  const subject = asString(item?.subject);
  if (subject && subject !== "(no subject)" && !/not named|not identified/i.test(subject)) {
    return subject;
  }

  const project = asString(item?.projectDisplay || item?.projectName);
  if (project && !isWeakLabel(project) && !/not named|not identified/i.test(project)) {
    if (item?.planFilename && project === item.planFilename) {
      return filenameWithoutExtension(item.planFilename) || project;
    }
    return project;
  }

  const planBase = filenameWithoutExtension(item?.planFilename || item?.planLabel);
  if (planBase && !/^AAMk/i.test(planBase)) return planBase;

  const customer = resolveQueueCustomer(item, { allowUntitled: false });
  if (customer && !isWeakLabel(customer) && !/^Plan:/i.test(customer)) return customer;

  const rawId = asString(item?.takeoffJobId || item?.intakeCaseId);
  if (rawId && !/^AAMk/i.test(rawId)) {
    const short = rawId.replace(/-/g, "").slice(0, 8);
    if (short) return `Quote ${short}`;
  }
  return "Untitled quote request";
}

/**
 * @param {object} item
 * @param {{ allowUntitled?: boolean }} [opts]
 */
export function resolveQueueCustomer(item, opts = {}) {
  const candidates = [
    item?.customerDisplay,
    item?.customerName,
    item?.customerLabel,
    item?.senderLabel,
    item?.sender,
    item?.senderDisplayName,
    item?.contact
  ];
  for (const c of candidates) {
    const v = asString(c);
    if (v && !isWeakLabel(v) && !/not identified/i.test(v) && !/^AAMk/i.test(v)) return v;
  }
  const plan = filenameWithoutExtension(item?.planFilename) || asString(item?.planFilename);
  if (plan && !/^AAMk/i.test(plan)) return `Plan: ${plan}`;
  const project = asString(item?.projectDisplay || item?.projectName || item?.subject);
  if (project && !isWeakLabel(project) && !/not named|not identified/i.test(project)) {
    return project;
  }
  if (opts.allowUntitled === false) return "";
  return "";
}

/**
 * Row / workspace title — never "Unknown contact — Unknown contact".
 * @param {object} item
 */
export function resolveQueueTitle(item) {
  return resolveDefaultEstimateName(item);
}

/**
 * One-line subtitle under the title (contact · plan), skipping duplicates / weak labels.
 * @param {object} item
 * @param {string} [estimateName]
 */
export function resolveQueueSubtitle(item, estimateName = "") {
  const name = String(estimateName || resolveDefaultEstimateName(item)).trim();
  const customer = resolveQueueCustomer(item);
  const plan = filenameWithoutExtension(item?.planFilename) || asString(item?.planFilename);
  const parts = [];
  if (customer && customer !== name && !/^Plan:/i.test(customer)) parts.push(customer);
  if (plan && plan !== name && `Plan: ${plan}` !== customer) parts.push(plan);
  return parts.join(" · ");
}

/**
 * @param {string|null|undefined} iso
 */
export function formatQueueTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}
