/**
 * Safe display label for inbox person/contact fields.
 * Production Shared Inbox may return { displayName, safeAddressLabel, emailPresent }.
 * Never return a raw object — React cannot render those as children.
 *
 * @param {unknown} value
 * @param {string} [fallback="Unknown contact"]
 * @returns {string}
 */
export function formatPersonLabel(value, fallback = "Unknown contact") {
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

  // Nested shapes sometimes used for customer/account wrappers.
  for (const key of ["sender", "from", "customer", "contact", "requester", "account", "recipient"]) {
    if (obj[key] != null && typeof obj[key] !== "object") {
      const nested = formatPersonLabel(obj[key], "");
      if (nested) return nested;
    }
    if (obj[key] && typeof obj[key] === "object") {
      const nested = formatPersonLabel(obj[key], "");
      if (nested) return nested;
    }
  }

  return fallback;
}

/**
 * Normalize inbox list/detail fields so React only receives strings.
 * @param {Record<string, unknown>|null|undefined} item
 */
export function normalizeInboxItemLabels(item) {
  if (!item || typeof item !== "object") return item;
  const senderLabel = formatPersonLabel(item.senderLabel ?? item.sender, "Unknown contact");
  const customerLabel = formatPersonLabel(
    item.customerLabel ?? item.customer ?? item.contact ?? item.requester,
    "Unknown contact"
  );
  const accountLabel = formatPersonLabel(item.accountLabel ?? item.account, "Unknown contact");
  const projectLabel = (() => {
    const p = item.projectLabel ?? item.project ?? item.projectName;
    if (p == null || p === "") return null;
    if (typeof p === "string" || typeof p === "number") return String(p);
    return formatPersonLabel(p, "Project");
  })();

  return {
    ...item,
    sender: senderLabel,
    senderLabel,
    customerLabel,
    accountLabel,
    projectLabel
  };
}
