/**
 * Authorized staff-safe Digital Estimate customer-link recovery.
 * Shared by Publications workspace, Live Digital Estimates detail, and Studio DE readiness.
 * Never generates/replaces tokens — read-only unwrap of persisted wrap material.
 */

import {
  buildDigitalEstimateCustomerUrl,
  buildLinkRecoveryDiagnostics,
  unwrapDigitalEstimateAccessTokenDetailed
} from "./digitalEstimateTokenWrap.mjs";

export const NO_RECOVERABLE_CUSTOMER_LINK_MESSAGE =
  "No recoverable customer link is stored for this publication. Replace link creates a new URL and invalidates the previous URL.";

/**
 * Recover staff-safe customer URL metadata for an org-scoped publication row.
 * @param {object} repository Digital Estimate repository
 * @param {string} organizationId
 * @param {object|null|undefined} pub Publication row
 * @param {NodeJS.ProcessEnv|object} [env]
 * @returns {Promise<{
 *   customerUrl: string|null,
 *   linkStatus: string|null,
 *   linkDiagnostics?: object|null,
 *   linkError?: { code: string, message: string }|null
 * }>}
 */
export async function recoverStaffPublicationLinkMeta(
  repository,
  organizationId,
  pub,
  env = process.env
) {
  if (!pub?.id) {
    return {
      customerUrl: null,
      linkStatus: null,
      linkDiagnostics: buildLinkRecoveryDiagnostics(env, null, { code: null })
    };
  }
  if (pub.status === "revoked" || pub.revoked_at) {
    return {
      customerUrl: null,
      linkStatus: "revoked",
      linkDiagnostics: buildLinkRecoveryDiagnostics(env, null, {
        code: "publication_revoked",
        decryptSucceeded: false
      })
    };
  }
  if (pub.status === "superseded" || pub.superseded_at) {
    return {
      customerUrl: null,
      linkStatus: "superseded",
      linkDiagnostics: buildLinkRecoveryDiagnostics(env, null, {
        code: "publication_superseded",
        decryptSucceeded: false
      })
    };
  }
  if (pub.status !== "active") {
    return {
      customerUrl: null,
      linkStatus: String(pub.status || "invalid"),
      linkDiagnostics: buildLinkRecoveryDiagnostics(env, null, {
        code: "publication_inactive",
        decryptSucceeded: false
      })
    };
  }
  if (typeof repository.getActiveTokenForPublication !== "function") {
    return {
      customerUrl: null,
      linkStatus: "recovery_error",
      linkDiagnostics: buildLinkRecoveryDiagnostics(env, null, {
        code: "active_token_lookup_unavailable",
        decryptSucceeded: false
      }),
      linkError: {
        code: "active_token_lookup_unavailable",
        message: "Customer link recovery is unavailable on this Brain."
      }
    };
  }
  try {
    const counts =
      typeof repository.countTokensForPublication === "function"
        ? await repository.countTokensForPublication(organizationId, pub.id)
        : { activeTokenRows: null };
    const tokenRow = await repository.getActiveTokenForPublication(organizationId, pub.id);
    if (!tokenRow || tokenRow.revoked_at) {
      return {
        customerUrl: null,
        linkStatus: "needs_replace",
        linkDiagnostics: buildLinkRecoveryDiagnostics(env, tokenRow, {
          activeTokenRows: counts.activeTokenRows,
          decryptSucceeded: false,
          code: "active_token_missing"
        }),
        linkError: {
          code: "active_token_missing",
          message: "No active customer link token. Use Replace Link to create one."
        }
      };
    }
    const unwrapped = unwrapDigitalEstimateAccessTokenDetailed(tokenRow.token_wrapped, env, {
      tokenRow,
      activeTokenRows: counts.activeTokenRows
    });
    if (!unwrapped.ok) {
      const message =
        unwrapped.code === "link_wrap_key_missing"
          ? "Customer link recovery key is missing on Brain. Set DIGITAL_ESTIMATE_LINK_WRAP_KEY and redeploy."
          : unwrapped.code === "token_wrapped_missing"
            ? "Customer link is not recoverable yet. Use Replace Link once (requires DIGITAL_ESTIMATE_LINK_WRAP_KEY)."
            : "Customer link could not be decrypted with the current wrap key. Verify DIGITAL_ESTIMATE_LINK_WRAP_KEY and Replace Link.";
      return {
        customerUrl: null,
        linkStatus: "recovery_error",
        linkDiagnostics: unwrapped.diagnostics,
        linkError: { code: unwrapped.code, message }
      };
    }
    return {
      customerUrl: buildDigitalEstimateCustomerUrl(unwrapped.rawToken, env),
      linkStatus: "active",
      linkDiagnostics: unwrapped.diagnostics
    };
  } catch (e) {
    return {
      customerUrl: null,
      linkStatus: "recovery_error",
      linkDiagnostics: buildLinkRecoveryDiagnostics(env, null, {
        code: e?.code || "link_recovery_failed",
        decryptSucceeded: false
      }),
      linkError: {
        code: e?.code || "link_recovery_failed",
        message: e?.message || "Unable to recover customer link."
      }
    };
  }
}

/**
 * Staff-detail presentation fields (never include raw/wrapped tokens).
 * @param {{ customerUrl?: string|null, linkStatus?: string|null, linkError?: { code?: string, message?: string }|null }} linkMeta
 * @param {{ accessExpiresAt?: string|null, now?: Date }} [opts]
 */
export function presentStaffLinkForDetail(linkMeta, opts = {}) {
  const now = opts.now || new Date();
  const accessExpiresAt = opts.accessExpiresAt || null;
  const status = String(linkMeta?.linkStatus || "");
  const url =
    typeof linkMeta?.customerUrl === "string" && linkMeta.customerUrl.trim()
      ? linkMeta.customerUrl.trim()
      : null;

  if (status === "revoked") {
    return {
      customerUrl: null,
      linkAvailable: false,
      linkState: "revoked",
      linkUnavailableReason: "Link inactive (revoked)."
    };
  }
  if (status === "superseded") {
    return {
      customerUrl: null,
      linkAvailable: false,
      linkState: "superseded",
      linkUnavailableReason: "Link inactive (superseded)."
    };
  }

  const expired =
    accessExpiresAt &&
    !Number.isNaN(Date.parse(String(accessExpiresAt))) &&
    Date.parse(String(accessExpiresAt)) < now.getTime();
  if (expired && !url) {
    return {
      customerUrl: null,
      linkAvailable: false,
      linkState: "expired",
      linkUnavailableReason: "Link expired."
    };
  }

  if (url) {
    return {
      customerUrl: url,
      linkAvailable: true,
      linkState: "available",
      linkUnavailableReason: null
    };
  }

  const recoveryMessage =
    (linkMeta?.linkError && typeof linkMeta.linkError.message === "string"
      ? linkMeta.linkError.message
      : null) || NO_RECOVERABLE_CUSTOMER_LINK_MESSAGE;

  return {
    customerUrl: null,
    linkAvailable: false,
    linkState: status === "recovery_error" ? "unavailable" : "unavailable",
    linkUnavailableReason: recoveryMessage
  };
}
