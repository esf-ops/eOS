import {
  PROVIDER_MODE_LIVE,
  PROVIDER_NAME_LIVE,
  PROVIDER_VERSION_LIVE
} from "./classificationTypes.mjs";

/**
 * Browser-side live provider: calls the isolated lab intelligence server only.
 * Never holds Gemini credentials. Never sends attachment bytes.
 */
export class LiveIntakeIntelligenceProvider {
  /**
   * @param {{ baseUrl?: string, labToken?: string, fetchImpl?: typeof fetch }} [opts]
   */
  constructor(opts = {}) {
    const viteEnv = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
    this._baseUrl = String(opts.baseUrl ?? viteEnv.VITE_QIL_LIVE_SERVER_URL ?? "http://127.0.0.1:5197")
      .trim()
      .replace(/\/+$/, "");
    this._labToken = String(opts.labToken ?? viteEnv.VITE_QIL_LAB_REQUEST_TOKEN ?? "").trim();
    this._fetch = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  get name() {
    return PROVIDER_NAME_LIVE;
  }

  get mode() {
    return PROVIDER_MODE_LIVE;
  }

  get version() {
    return PROVIDER_VERSION_LIVE;
  }

  async health() {
    try {
      const res = await this._fetch(`${this._baseUrl}/health`, { method: "GET" });
      if (!res.ok) return { ok: false, code: "HEALTH_HTTP", status: res.status };
      const json = await res.json();
      return { ok: true, ...json };
    } catch {
      return { ok: false, code: "SERVER_UNAVAILABLE" };
    }
  }

  /**
   * @param {object} request IntakeClassificationRequest (Phase 2 normalized)
   */
  async classify(request) {
    if (!this._labToken) {
      throw Object.assign(
        new Error("Lab request token is not configured (VITE_QIL_LAB_REQUEST_TOKEN). Live mode unavailable."),
        { code: "LAB_TOKEN_MISSING" }
      );
    }

    const payload = {
      caseId: request.caseId,
      subject: request.subject,
      textBody: request.textBody,
      from: request.from,
      to: request.to,
      cc: request.cc,
      replyTo: request.replyTo ?? null,
      messageId: request.messageId ?? null,
      thread: request.thread ?? null,
      mailbox: request.mailbox ?? null,
      attachments: (request.attachments ?? []).map((a) => ({
        id: a.id,
        filename: a.filename,
        contentType: a.contentType,
        sizeBytes: a.sizeBytes ?? null
      }))
    };

    // Guard against accidental byte leakage from upstream mistakes
    for (const a of payload.attachments) {
      if ("bytes" in a) delete a.bytes;
    }

    let res;
    try {
      res = await this._fetch(`${this._baseUrl}/classify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-QIL-Lab-Token": this._labToken
        },
        body: JSON.stringify(payload)
      });
    } catch {
      throw Object.assign(
        new Error("Live intelligence server is unavailable. Start it with npm run live-server or switch to simulated."),
        { code: "SERVER_UNAVAILABLE" }
      );
    }

    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    if (!res.ok || !json?.ok) {
      const code = json?.code ?? `HTTP_${res.status}`;
      throw Object.assign(new Error(json?.error ?? `Live classification failed (${res.status}).`), {
        code,
        statusCode: res.status
      });
    }

    const result = json.result ?? {};
    const validationWarnings =
      json.validationWarnings ?? result.verification?.validationWarnings ?? result.warnings ?? [];
    return {
      startedAt: json.startedAt,
      completedAt: json.completedAt,
      result: {
        ...result,
        warnings: Array.isArray(result.warnings) ? result.warnings : validationWarnings
      },
      validationWarnings
    };
  }
}

export function getLiveIntakeIntelligenceProvider(opts) {
  return new LiveIntakeIntelligenceProvider(opts);
}
