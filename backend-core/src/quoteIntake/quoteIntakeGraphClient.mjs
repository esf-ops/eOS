/**
 * Narrow Microsoft Graph mailbox client — Quote Intake Phase 6P.4.
 * Fixed mailbox only. Read-only GETs (+ token POST via token provider).
 */

import { createQuoteIntakeGraphTokenProvider } from "./quoteIntakeGraphToken.mjs";

export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
export const GRAPH_HOST = "graph.microsoft.com";
export const GRAPH_PREFER_HEADERS = 'outlook.body-content-type="text", IdType="ImmutableId"';

/** Max length for an opaque Graph ImmutableId (matches DB check). */
export const GRAPH_IMMUTABLE_ID_MAX_LEN = 2048;

/** Max length for a nextLink URL if validation is ever used. */
export const GRAPH_NEXT_LINK_MAX_LEN = 2048;

const FORBIDDEN_METHOD = /^(PATCH|PUT|DELETE)$/i;
const FORBIDDEN_PATH =
  /\/(sendMail|reply|replyAll|forward|createReply|move|copy|mailboxSettings)(\/|$|\?)/i;

/**
 * @param {string} method
 * @param {string} url
 */
export function assertGraphReadOnlyRequest(method, url) {
  const m = String(method ?? "GET").toUpperCase();
  if (FORBIDDEN_METHOD.test(m)) {
    const err = new Error("Graph write methods are not permitted");
    err.code = "graph_forbidden";
    err.statusCode = 500;
    throw err;
  }
  if (m !== "GET" && m !== "POST") {
    const err = new Error("Graph method not permitted");
    err.code = "graph_forbidden";
    err.statusCode = 500;
    throw err;
  }
  // POST only allowed for token endpoint (handled outside this client).
  if (m === "POST") {
    const err = new Error("Graph POST is not permitted on mailbox client");
    err.code = "graph_forbidden";
    err.statusCode = 500;
    throw err;
  }
  if (FORBIDDEN_PATH.test(String(url))) {
    const err = new Error("Graph mailbox mutation path is not permitted");
    err.code = "graph_forbidden";
    err.statusCode = 500;
    throw err;
  }
}

/**
 * Encode mailbox for Graph /users/{mailbox} path.
 * @param {string} mailbox
 */
export function encodeMailboxPath(mailbox) {
  return encodeURIComponent(String(mailbox).trim().toLowerCase());
}

/**
 * Relative path under /users/{mailbox} only — never an absolute/caller URL.
 * @param {string} pathUnderUser
 */
export function assertRelativeGraphUserPath(pathUnderUser) {
  const p = String(pathUnderUser ?? "");
  if (!p.startsWith("/") || p.includes("://") || p.includes("..")) {
    const err = new Error("Graph path rejected");
    err.code = "graph_forbidden";
    err.statusCode = 500;
    throw err;
  }
}

/**
 * Full request URL must be HTTPS graph.microsoft.com under the fixed mailbox.
 * @param {string} url
 * @param {string} mailbox
 */
export function assertApprovedGraphGetUrl(url, mailbox) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    const err = new Error("Graph URL rejected");
    err.code = "graph_forbidden";
    err.statusCode = 500;
    throw err;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== GRAPH_HOST) {
    const err = new Error("Graph URL rejected");
    err.code = "graph_forbidden";
    err.statusCode = 500;
    throw err;
  }
  const prefix = `${GRAPH_BASE}/users/${encodeMailboxPath(mailbox)}`;
  const pathOnly = `${parsed.origin}${parsed.pathname}`;
  if (pathOnly !== prefix && !pathOnly.startsWith(`${prefix}/`)) {
    const err = new Error("Graph URL rejected");
    err.code = "graph_forbidden";
    err.statusCode = 500;
    throw err;
  }
  assertGraphReadOnlyRequest("GET", url);
}

/**
 * Phase 6P.4 never follows @odata.nextLink. Call when a nextLink is observed
 * to document rejection of pagination follow (presence alone does not fail preview).
 * @param {unknown} nextLink
 * @returns {false}
 */
export function rejectFollowingGraphNextLink(nextLink) {
  if (nextLink == null || nextLink === "") return false;
  // Do not fetch. Callers must ignore the URL entirely.
  return false;
}

/**
 * If a future phase follows nextLink, it must pass this validator first.
 * Phase 6P.4 does not follow nextLink — this exists for bounded safety checks/tests.
 * @param {unknown} nextLink
 * @returns {string}
 */
export function assertSafeGraphNextLink(nextLink) {
  const raw = String(nextLink ?? "").trim();
  if (!raw || raw.length > GRAPH_NEXT_LINK_MAX_LEN) {
    const err = new Error("Graph nextLink rejected");
    err.code = "graph_forbidden";
    err.statusCode = 500;
    throw err;
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    const err = new Error("Graph nextLink rejected");
    err.code = "graph_forbidden";
    err.statusCode = 500;
    throw err;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== GRAPH_HOST) {
    const err = new Error("Graph nextLink rejected");
    err.code = "graph_forbidden";
    err.statusCode = 500;
    throw err;
  }
  return parsed.toString();
}

/**
 * @param {string} opaqueId
 */
export function encodeGraphOpaqueId(opaqueId) {
  const id = String(opaqueId ?? "").trim();
  if (!id || id.length > GRAPH_IMMUTABLE_ID_MAX_LEN || id.includes("://")) {
    const err = new Error("Message not found");
    err.code = "message_not_found";
    err.statusCode = 404;
    throw err;
  }
  return encodeURIComponent(id);
}

/**
 * @param {{
 *   mailbox: string,
 *   credentials: { tenantId: string, clientId: string, clientSecret: string },
 *   fetchImpl?: typeof fetch,
 *   now?: () => number,
 *   timeoutMs?: number,
 *   tokenProvider?: { getAccessToken: () => Promise<string>, invalidate: () => void }
 * }} deps
 */
export function createQuoteIntakeGraphClient(deps) {
  const mailbox = String(deps.mailbox ?? "")
    .trim()
    .toLowerCase();
  if (!mailbox || !mailbox.includes("@")) {
    const err = new Error("Quote Intake Graph is not configured");
    err.code = "graph_not_configured";
    err.statusCode = 503;
    throw err;
  }

  const fetchImpl = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = Number(deps.timeoutMs) > 0 ? Number(deps.timeoutMs) : 30_000;
  const tokenProvider =
    deps.tokenProvider ??
    createQuoteIntakeGraphTokenProvider({
      credentials: deps.credentials,
      fetchImpl,
      now: deps.now,
      timeoutMs
    });

  const mailboxSeg = encodeMailboxPath(mailbox);

  function usersBase() {
    return `${GRAPH_BASE}/users/${mailboxSeg}`;
  }

  /**
   * @param {string} pathUnderUser path starting with /
   * @param {{ prefer?: boolean, retryOn401?: boolean }} [opts]
   */
  async function graphGet(pathUnderUser, opts = {}) {
    const prefer = opts.prefer !== false;
    const retryOn401 = opts.retryOn401 !== false;
    assertRelativeGraphUserPath(pathUnderUser);
    const url = `${usersBase()}${pathUnderUser.startsWith("/") ? pathUnderUser : `/${pathUnderUser}`}`;
    assertApprovedGraphGetUrl(url, mailbox);

    const token = await tokenProvider.getAccessToken();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(url, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
          ...(prefer ? { Prefer: GRAPH_PREFER_HEADERS } : {})
        },
        signal: controller.signal
      });
    } catch (e) {
      const err = new Error("Graph request failed");
      err.code =
        e?.name === "AbortError" || String(e?.message ?? "").includes("abort")
          ? "graph_timeout"
          : "graph_unavailable";
      err.statusCode = err.code === "graph_timeout" ? 504 : 503;
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401 && retryOn401) {
      tokenProvider.invalidate();
      return graphGet(pathUnderUser, { ...opts, retryOn401: false });
    }

    if (res.status === 404) {
      const err = new Error("Message not found");
      err.code = "message_not_found";
      err.statusCode = 404;
      throw err;
    }
    if (res.status === 429) {
      const err = new Error("Graph throttled");
      err.code = "graph_throttled";
      err.statusCode = 429;
      const ra = res.headers?.get?.("retry-after");
      if (ra) err.retryAfterSeconds = Number(ra) || undefined;
      throw err;
    }
    if (res.status === 403) {
      const err = new Error("Graph mailbox access forbidden");
      err.code = "graph_forbidden";
      err.statusCode = 403;
      throw err;
    }
    if (!res.ok) {
      // Never attach raw Graph response body to the error.
      const err = new Error("Graph request failed");
      err.code = "graph_unavailable";
      err.statusCode = 503;
      throw err;
    }

    let json;
    try {
      json = await res.json();
    } catch {
      const err = new Error("Graph returned invalid response");
      err.code = "graph_invalid_response";
      err.statusCode = 502;
      throw err;
    }
    return json;
  }

  return {
    mailbox,
    usersBase,
    /**
     * List Inbox messages — single bounded page, newest first.
     * Never follows @odata.nextLink (even when present).
     * @param {{ top: number }} query
     */
    async listInboxMessages(query) {
      const top = Math.min(Math.max(Number(query.top) || 25, 1), 50);
      const select = [
        "id",
        "internetMessageId",
        "conversationId",
        "receivedDateTime",
        "lastModifiedDateTime",
        "subject",
        "from",
        "toRecipients",
        "ccRecipients",
        "bodyPreview",
        "body",
        "hasAttachments"
      ].join(",");
      const path =
        `/mailFolders/Inbox/messages` +
        `?$top=${top}` +
        `&$orderby=receivedDateTime%20desc` +
        `&$select=${select}`;
      const json = await graphGet(path);
      // Never follow pagination (bounded single page). Presence of nextLink is ignored.
      rejectFollowingGraphNextLink(json?.["@odata.nextLink"]);
      const value = Array.isArray(json?.value) ? json.value : [];
      return value;
    },

    /**
     * @param {string} messageId opaque ImmutableId
     */
    async getMessage(messageId) {
      const id = encodeGraphOpaqueId(messageId);
      const select = [
        "id",
        "internetMessageId",
        "conversationId",
        "receivedDateTime",
        "lastModifiedDateTime",
        "subject",
        "from",
        "toRecipients",
        "ccRecipients",
        "bodyPreview",
        "body",
        "hasAttachments"
      ].join(",");
      return graphGet(`/messages/${id}?$select=${select}`);
    },

    /**
     * Attachment metadata only (no contentBytes in $select).
     * @param {string} messageId
     */
    async listAttachmentMetadata(messageId) {
      const id = encodeGraphOpaqueId(messageId);
      const select = "id,name,contentType,size,isInline";
      const json = await graphGet(`/messages/${id}/attachments?$select=${select}`);
      return Array.isArray(json?.value) ? json.value : [];
    },

    /**
     * Fetch a single attachment including contentBytes when present (import only).
     * @param {string} messageId
     * @param {string} attachmentId
     */
    async getAttachment(messageId, attachmentId) {
      const mid = encodeGraphOpaqueId(messageId);
      const aid = encodeGraphOpaqueId(attachmentId);
      return graphGet(`/messages/${mid}/attachments/${aid}`);
    }
  };
}
