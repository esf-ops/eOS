/**
 * Present Shared Inbox rows as Quote Flow Inbox DTOs (Slice 1B).
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
  return {
    key: "needs_attachment_selection",
    label: "Needs attachment selection",
    takeoffJobId: null
  };
}

/**
 * @param {object} item
 * @param {{ alreadyScoped?: boolean }} [opts]
 */
export function presentQuoteFlowInboxItem(item, opts = {}) {
  const takeoffStatus = mapQuoteFlowTakeoffStatus(item, opts);
  const attachments = (Array.isArray(item?.attachments) ? item.attachments : []).map((a) => ({
    attachmentKey: a.attachmentKey || a.id || null,
    filename: a.filename || a.name || "Attachment",
    contentType: a.contentType || a.mimeType || null,
    support: a.support || null,
    supportedForTakeoff: a.supportedForTakeoff === true,
    canMarkAsPlan: a.canMarkAsPlan === true,
    action:
      a.supportedForTakeoff === true
        ? "start_takeoff"
        : a.canMarkAsPlan === true
          ? "mark_as_plan"
          : "unsupported"
  }));

  const senderLabel = formatQuoteFlowPersonLabel(item?.sender, "Unknown contact");
  const customerLabel = formatQuoteFlowPersonLabel(
    item?.customerLabel ?? item?.customer ?? item?.contact ?? item?.requester,
    "Unknown contact"
  );
  const accountLabel = formatQuoteFlowPersonLabel(
    item?.accountLabel ?? item?.account,
    "Unknown contact"
  );
  const projectRaw = item?.projectLabel ?? item?.project ?? item?.projectName ?? null;
  const projectLabel =
    projectRaw == null || projectRaw === ""
      ? null
      : typeof projectRaw === "string" || typeof projectRaw === "number"
        ? String(projectRaw)
        : formatQuoteFlowPersonLabel(projectRaw, "Project");

  return {
    messageKey: item?.messageKey || null,
    receivedAt: item?.receivedAt || null,
    // Always a display string (production Shared Inbox sender is often an object).
    sender: senderLabel,
    senderLabel,
    customerLabel,
    accountLabel,
    projectLabel,
    subject: item?.subject || "(no subject)",
    bodyPreview: item?.bodyPreview || null,
    intakeCaseId: item?.intakeCaseId || null,
    estimateId: item?.estimateId || item?.activeEstimateId || null,
    planSelectionRequired: item?.planSelectionRequired === true,
    attachments,
    takeoffStatus,
    takeoffJobId: takeoffStatus.takeoffJobId,
    alreadyScoped: opts.alreadyScoped === true,
    // Placeholder affordance for later Estimate Queue slice (non-functional in UI).
    queueHint:
      takeoffStatus.key === "takeoff_returned" || takeoffStatus.key === "takeoff_queued"
        ? "View in Estimate Queue"
        : null
  };
}
