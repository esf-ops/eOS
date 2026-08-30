/**
 * Safe human labels for Sales Ops salespeople.
 * UUID keys stay internal. Never infer a name from an identifier.
 */

export const UNKNOWN_SALESPERSON_LABEL = "Unknown salesperson";
export const UNASSIGNED_IN_MONDAY_LABEL = "Unassigned in Monday";
export const MONDAY_OWNER_UNMAPPED_LABEL = "Monday owner not mapped to eliteOS";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidLike(value) {
  return UUID_RE.test(String(value || "").trim());
}

export function safeHumanLabel(value, fallback = UNKNOWN_SALESPERSON_LABEL) {
  const text = String(value || "").trim();
  if (!text || isUuidLike(text)) return fallback;
  return text;
}

/**
 * Fallback order:
 * 1. governed salesperson display name (mapping label, then Monday person cache)
 * 2. mapped staff display name
 * 3. explicit "Unknown salesperson"
 */
export function resolveSalespersonDisplayName({
  salespersonLabel = null,
  mondayDisplayName = null,
  staffFullName = null
} = {}) {
  return safeHumanLabel(
    salespersonLabel,
    safeHumanLabel(mondayDisplayName, safeHumanLabel(staffFullName, UNKNOWN_SALESPERSON_LABEL))
  );
}

export function identityOwnershipState({ mondayAssignedUserId = null, assignedUserId = null } = {}) {
  if (String(assignedUserId || "").trim()) return "mapped";
  if (String(mondayAssignedUserId || "").trim()) return "unmapped";
  return "unassigned";
}

export function identityOwnershipLabel({ ownershipState, salespersonDisplayName = null } = {}) {
  if (ownershipState === "unassigned") return UNASSIGNED_IN_MONDAY_LABEL;
  if (ownershipState === "unmapped") return MONDAY_OWNER_UNMAPPED_LABEL;
  return `Owner: ${safeHumanLabel(salespersonDisplayName)}`;
}
