/**
 * LiveGeminiTakeoffAdapter — browser/lab TakeoffAdapter that sends plan bytes only via
 * the isolated loopback lab server (POST /takeoff).
 */

import {
  LAB_TAKEOFF_STATUS,
  PROVIDER_MODE_LIVE,
  PROVIDER_NAME_LIVE,
  PROVIDER_VERSION_LIVE
} from "./takeoffTypes.mjs";
import { assertApprovedForLiveTakeoff } from "./syntheticLiveAllowlist.mjs";
import { sha256Hex } from "./sha256.mjs";
import { bytesToBase64, toUint8Array } from "./base64.mjs";

export class LiveGeminiTakeoffAdapter {
  /**
   * @param {{
   *   baseUrl?: string,
   *   labToken?: string,
   *   fetchImpl?: typeof fetch,
   *   directPipeline?: (args: object) => Promise<object>,
   *   directConfig?: object
   * }} [opts]
   */
  constructor(opts = {}) {
    const viteEnv = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
    this._baseUrl = String(opts.baseUrl ?? viteEnv.VITE_QIL_LIVE_SERVER_URL ?? "http://127.0.0.1:5197")
      .trim()
      .replace(/\/+$/, "");
    this._labToken = String(opts.labToken ?? viteEnv.VITE_QIL_LAB_REQUEST_TOKEN ?? "").trim();
    this._fetch = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    this._directPipeline = opts.directPipeline ?? null;
    this._directConfig = opts.directConfig ?? null;
    /** @type {Map<string, import("./takeoffTypes.mjs").TakeoffRun>} */
    this._runs = new Map();
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

  /**
   * Safe health for UI — never returns secrets.
   */
  async health() {
    try {
      const res = await this._fetch(`${this._baseUrl}/health`, { method: "GET" });
      if (!res.ok) return { ok: false, status: "unavailable", code: "HEALTH_HTTP", httpStatus: res.status };
      const json = await res.json();
      const takeoff = json.takeoff ?? {};
      if (!takeoff.liveEnabled) {
        return {
          ok: false,
          status: "disabled",
          code: "LIVE_TAKEOFF_DISABLED",
          takeoff,
          hasApiKey: Boolean(json.hasApiKey),
          modelConfigured: Boolean(takeoff.modelConfigured)
        };
      }
      if (!json.hasApiKey || !takeoff.modelConfigured) {
        return {
          ok: false,
          status: "misconfigured",
          code: "PROVIDER_CONFIG_MISSING",
          takeoff,
          hasApiKey: Boolean(json.hasApiKey),
          modelConfigured: Boolean(takeoff.modelConfigured)
        };
      }
      return {
        ok: true,
        status: "ready",
        code: "READY",
        takeoff,
        hasApiKey: true,
        modelConfigured: true,
        provider: takeoff.provider ?? "gemini"
      };
    } catch {
      return { ok: false, status: "unavailable", code: "SERVER_UNAVAILABLE" };
    }
  }

  /**
   * @param {{
   *   caseId: string,
   *   acceptedIntakeSnapshotId: string,
   *   attachmentId: string,
   *   filename: string,
   *   mimeType: string,
   *   sizeBytes: number,
   *   contentHash: string,
   *   contentBytes: Uint8Array|ArrayBuffer|ArrayBufferView,
   *   liveTransmissionAcknowledged: boolean,
   *   actorLabel: string,
   *   requestedAt?: string,
   *   elite100Decision?: string,
   *   classificationHints?: object,
   *   syntheticPlanAcknowledged?: boolean,
   *   stagedProvider?: object
   * }} input
   */
  async run(input) {
    const contentBytes = toUint8Array(input.contentBytes);

    if (!input.liveTransmissionAcknowledged) {
      const err = new Error("Explicit live transmission acknowledgment is required.");
      err.code = "ACKNOWLEDGMENT_REQUIRED";
      throw err;
    }

    assertApprovedForLiveTakeoff(input.contentHash, { sizeBytes: input.sizeBytes ?? contentBytes.length });
    const actualHash = await sha256Hex(contentBytes);
    if (actualHash !== String(input.contentHash).toLowerCase()) {
      const err = new Error("Client-computed SHA-256 does not match attachment metadata.");
      err.code = "HASH_MISMATCH";
      throw err;
    }

    // Test-only in-process path — never static-import server modules (keeps Vite browser bundle clean).
    if (this._directPipeline) {
      let contentBase64 = bytesToBase64(contentBytes);
      try {
        const outcome = await this._directPipeline({
          caseId: input.caseId,
          acceptedIntakeSnapshotId: input.acceptedIntakeSnapshotId,
          attachmentId: input.attachmentId,
          filename: input.filename,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes ?? contentBytes.length,
          contentHash: actualHash,
          contentBytes,
          contentBase64,
          liveTransmissionAcknowledged: true,
          actorLabel: input.actorLabel,
          requestedAt: input.requestedAt ?? new Date().toISOString(),
          elite100Decision: input.elite100Decision,
          classificationHints: input.classificationHints,
          syntheticPlanAcknowledged: input.syntheticPlanAcknowledged,
          config: this._directConfig,
          stagedProvider: input.stagedProvider
        });
        const run = outcome.run;
        this._runs.set(run.id, run);
        return {
          ok: run.labTakeoffStatus !== LAB_TAKEOFF_STATUS.FAILED,
          runId: run.id,
          status: run.labTakeoffStatus,
          run
        };
      } finally {
        contentBase64 = "";
      }
    }

    if (!this._labToken) {
      const err = new Error(
        "Lab request token is not configured (VITE_QIL_LAB_REQUEST_TOKEN). Live takeoff unavailable."
      );
      err.code = "LAB_TOKEN_MISSING";
      throw err;
    }
    if (typeof this._fetch !== "function") {
      const err = new Error("fetch is unavailable for live takeoff.");
      err.code = "NO_FETCH";
      throw err;
    }

    const body = {
      caseId: input.caseId,
      acceptedIntakeSnapshotId: input.acceptedIntakeSnapshotId,
      attachmentId: input.attachmentId,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes ?? contentBytes.length,
      contentHash: actualHash,
      contentBase64: bytesToBase64(contentBytes),
      liveTransmissionAcknowledged: true,
      actorLabel: input.actorLabel,
      requestedAt: input.requestedAt ?? new Date().toISOString(),
      elite100Decision: input.elite100Decision ?? "elite_100_candidate",
      classificationHints: input.classificationHints ?? null,
      syntheticPlanAcknowledged: input.syntheticPlanAcknowledged ?? true
    };

    let res;
    try {
      res = await this._fetch(`${this._baseUrl}/takeoff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-QIL-Lab-Token": this._labToken
        },
        body: JSON.stringify(body)
      });
    } catch {
      const err = new Error(
        "Live takeoff server is unavailable. Start it with npm run live-server or switch to Simulated."
      );
      err.code = "SERVER_UNAVAILABLE";
      throw err;
    } finally {
      // Drop local base64 as soon as the request body is constructed/sent.
      body.contentBase64 = "";
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) {
      const err = new Error(json.error ?? `Live takeoff failed (${res.status}).`);
      err.code = json.code ?? "TAKEOFF_HTTP_ERROR";
      err.statusCode = res.status;
      throw err;
    }

    const run = json.run;
    this._runs.set(run.id, run);
    return {
      ok: true,
      runId: run.id,
      status: run.labTakeoffStatus,
      run,
      meta: json.meta ?? null
    };
  }

  async getRun(runId) {
    return this._runs.get(runId) ?? null;
  }

  async listRuns(caseId) {
    return [...this._runs.values()]
      .filter((r) => r.caseId === caseId)
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  }
}

export function getLiveGeminiTakeoffAdapter(opts) {
  return new LiveGeminiTakeoffAdapter(opts);
}
