/** Copy for the account workbench, driven by Brain `/me` access flags — not a frontend-only role guess. */

/**
 * @typedef {{ isOrgAdmin?: boolean, isManager?: boolean }} AccountListAccess
 */

/**
 * @param {AccountListAccess | null | undefined} access
 * @param {{ viewingSelectedBook?: boolean } | null | undefined} [options]
 * @returns {string}
 */
export function accountListScopeCopy(access, options) {
  if (options?.viewingSelectedBook) {
    return "You are viewing this salesperson’s currently assigned Monday book. Unmapped Monday owners stay hidden.";
  }
  if (access?.isOrgAdmin) {
    return "You can see every active account in this organization. Unmapped Monday owners stay hidden from normal sales books but remain visible here.";
  }
  if (access?.isManager) {
    return "You see your managed scope: accounts assigned to you and to people who report to you. Unmapped Monday owners stay hidden.";
  }
  return "You only see your assigned book — accounts currently assigned to you. Unmapped Monday owners stay hidden.";
}
