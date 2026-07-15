/**
 * Injected fake Graph + token transport for Phase 6P.4 tests.
 * No network. Records request methods/URLs for boundary assertions.
 */

const PDF_B64 = Buffer.from("%PDF-1.4 fake-plan-content").toString("base64");

/**
 * @param {{
 *   mailbox?: string,
 *   messages?: object[],
 *   attachmentsByMessageId?: Record<string, object[]>,
 *   tokenFails?: boolean,
 *   throttle?: boolean
 * }} [opts]
 */
export function createFakeGraphTransport(opts = {}) {
  const mailbox = (opts.mailbox || "quotes@elitestonefabrication.com").toLowerCase();
  const messages = opts.messages || [];
  const attachmentsByMessageId = opts.attachmentsByMessageId || {};
  /** @type {Array<{ method: string, url: string }>} */
  const requests = [];

  async function fetchImpl(url, init = {}) {
    const method = String(init.method || "GET").toUpperCase();
    const u = String(url);
    requests.push({ method, url: u });

    if (u.includes("login.microsoftonline.com") && u.includes("/oauth2/v2.0/token")) {
      if (opts.tokenFails) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: "invalid_client" }),
          headers: { get: () => null }
        };
      }
      const body = String(init.body || "");
      if (!body.includes("grant_type=client_credentials")) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: "bad_request" }),
          headers: { get: () => null }
        };
      }
      if (!body.includes("graph.microsoft.com") || !body.includes(".default")) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: "invalid_scope" }),
          headers: { get: () => null }
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "fake-access-token-not-for-production",
          expires_in: 3600,
          token_type: "Bearer"
        }),
        headers: { get: () => null }
      };
    }

    if (opts.throttle) {
      return {
        ok: false,
        status: 429,
        json: async () => ({}),
        headers: { get: (h) => (String(h).toLowerCase() === "retry-after" ? "2" : null) }
      };
    }

    const encodedMailbox = encodeURIComponent(mailbox);
    if (!u.includes(`/users/${encodedMailbox}`) && !u.includes(`/users/${mailbox}`)) {
      return {
        ok: false,
        status: 403,
        json: async () => ({}),
        headers: { get: () => null }
      };
    }

    if (u.includes("/mailFolders/Inbox/messages")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          value: messages,
          "@odata.nextLink": "https://graph.microsoft.com/v1.0/should-be-ignored"
        }),
        headers: { get: () => null }
      };
    }

    const msgMatch = u.match(/\/messages\/([^/?]+)(?:\/attachments(?:\/([^/?]+))?)?/);
    if (msgMatch) {
      const messageId = decodeURIComponent(msgMatch[1]);
      const attachmentId = msgMatch[2] ? decodeURIComponent(msgMatch[2]) : null;
      if (u.includes("/attachments")) {
        if (attachmentId) {
          const list = attachmentsByMessageId[messageId] || [];
          const att = list.find((a) => a.id === attachmentId);
          if (!att) {
            return {
              ok: false,
              status: 404,
              json: async () => ({}),
              headers: { get: () => null }
            };
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              ...att,
              contentBytes: att.contentBytes ?? (att.supportPdf ? PDF_B64 : undefined)
            }),
            headers: { get: () => null }
          };
        }
        const list = (attachmentsByMessageId[messageId] || []).map((a) => {
          const { contentBytes, ...meta } = a;
          return meta;
        });
        return {
          ok: true,
          status: 200,
          json: async () => ({ value: list }),
          headers: { get: () => null }
        };
      }
      const msg = messages.find((m) => m.id === messageId);
      if (!msg) {
        return {
          ok: false,
          status: 404,
          json: async () => ({}),
          headers: { get: () => null }
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => msg,
        headers: { get: () => null }
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({}),
      headers: { get: () => null }
    };
  }

  return {
    mailbox,
    requests,
    fetchImpl,
    PDF_B64
  };
}

export function sampleGraphMessage(overrides = {}) {
  return {
    id: "graph-msg-1",
    internetMessageId: "<sample-1@example.com>",
    conversationId: "conv-1",
    receivedDateTime: "2026-07-15T12:00:00Z",
    lastModifiedDateTime: "2026-07-15T12:00:00Z",
    subject: "Quote request Example Homes",
    from: {
      emailAddress: { name: "Buyer", address: "buyer@example.com" }
    },
    toRecipients: [{ emailAddress: { address: "quotes@elitestonefabrication.com" } }],
    ccRecipients: [],
    bodyPreview: "Please quote this kitchen.",
    body: { contentType: "text", content: "Please quote this kitchen." },
    hasAttachments: true,
    ...overrides
  };
}

export function samplePdfAttachment(overrides = {}) {
  return {
    id: "att-pdf-1",
    name: "plan.pdf",
    contentType: "application/pdf",
    size: 24,
    isInline: false,
    "@odata.type": "#microsoft.graph.fileAttachment",
    supportPdf: true,
    ...overrides
  };
}

export function sampleItemAttachment(overrides = {}) {
  return {
    id: "att-item-1",
    name: "forwarded.eml",
    contentType: "message/rfc822",
    size: 100,
    isInline: false,
    "@odata.type": "#microsoft.graph.itemAttachment",
    ...overrides
  };
}

export function sampleInlineImage(overrides = {}) {
  return {
    id: "att-img-1",
    name: "signature.png",
    contentType: "image/png",
    size: 50,
    isInline: true,
    "@odata.type": "#microsoft.graph.fileAttachment",
    ...overrides
  };
}
