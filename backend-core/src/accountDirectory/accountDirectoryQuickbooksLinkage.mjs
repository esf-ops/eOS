/**
 * Canonical QuickBooks linkage for Account Directory accounts.
 *
 * QuickBooks Linked = at least one active external link with
 * externalSystem === "quickbooks_desktop".
 *
 * Never infer from display name, frozen snapshots, partnerAccountId,
 * or ad-hoc columns on the account row.
 */

export const ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM = "quickbooks_desktop";

/**
 * @param {Array<{ isActive?: boolean, externalSystem?: string, external_system?: string }|null|undefined>|null|undefined} links
 * @returns {boolean}
 */
export function isAccountQuickbooksLinked(links) {
  if (!Array.isArray(links) || !links.length) return false;
  return links.some((l) => {
    if (!l || l.isActive === false) return false;
    const system = String(l.externalSystem || l.external_system || "").trim();
    return system === ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM;
  });
}

/**
 * Staff-safe label only — never expose List IDs.
 * @param {boolean|null|undefined} linked
 */
export function quickbooksLinkedLabel(linked) {
  if (linked == null) return null;
  return linked ? "QuickBooks Linked" : "QuickBooks Not Linked";
}
