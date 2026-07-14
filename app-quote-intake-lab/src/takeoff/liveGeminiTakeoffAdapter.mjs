/**
 * LiveGeminiTakeoffAdapter — lab TakeoffAdapter that sends plan bytes only via
 * the isolated loopback lab server (POST /takeoff). Phase 4B.4A: no UI wiring.
 */

import {
  LAB_TAKEOFF_STATUS,
  PROVIDER_MODE_LIVE,
  PROVIDER_NAME_LIVE,
  PROVIDER_VERSION_LIVE
} from "./takeoffTypes.mjs";

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
    this._baseUrl = String(opts.baseUrl ?? "http://127.0.0.1:5197").replace(/\/$/, "");
    this._labToken = String(opts.labToken ?? "");
    this._fetch = opts.fetchImpl ?? globalThis.fetch;
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
   * @param {{
   *   caseId: string,
   *   acceptedIntakeSnapshotId: string,
   *   attachmentId: string,
   *   filename: string,
   *   mimeType: string,
   *   sizeBytes: number,
   *   contentHash: string,
   *   contentBytes: Buffer|Uint8Array,
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
    const contentBytes = Buffer.isBuffer(input.contentBytes)
      ? input.contentBytes
      : Buffer.from(input.contentBytes ?? []);

    if (this._directPipeline) {
      const { sanitizeLiveTakeoffRequest } = await import("../../server/takeoff/sanitizeTakeoffRequest.mjs");
      const maxAttachmentBytes = this._directConfig?.takeoff?.maxAttachmentBytes ?? 4_000_000;
      const request = sanitizeLiveTakeoffRequest(
        {
          caseId: input.caseId,
          acceptedIntakeSnapshotId: input.acceptedIntakeSnapshotId,
          attachmentId: input.attachmentId,
          filename: input.filename,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes ?? contentBytes.length,
          contentHash: input.contentHash,
          contentBase64: contentBytes.toString("base64"),
          liveTransmissionAcknowledged: input.liveTransmissionAcknowledged,
          actorLabel: input.actorLabel,
          requestedAt: input.requestedAt ?? new Date().toISOString(),
          elite100Decision: input.elite100Decision,
          classificationHints: input.classificationHints,
          syntheticPlanAcknowledged: input.syntheticPlanAcknowledged
        },
        { maxAttachmentBytes }
      );
      const outcome = await this._directPipeline({
        request,
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
    }

    if (!this._labToken) {
      const err = new Error("Lab request token is required for live takeoff HTTP transport.");
      err.code = "TOKEN_NOT_CONFIGURED";
      throw err;
    }

    const body = {
      caseId: input.caseId,
      acceptedIntakeSnapshotId: input.acceptedIntakeSnapshotId,
      attachmentId: input.attachmentId,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes ?? contentBytes.length,
      contentHash: input.contentHash,
      contentBase64: contentBytes.toString("base64"),
      liveTransmissionAcknowledged: Boolean(input.liveTransmissionAcknowledged),
      actorLabel: input.actorLabel,
      requestedAt: input.requestedAt ?? new Date().toISOString(),
      elite100Decision: input.elite100Decision,
      classificationHints: input.classificationHints,
      syntheticPlanAcknowledged: input.syntheticPlanAcknowledged ?? true
    };

    const res = await this._fetch(`${this._baseUrl}/takeoff`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-QIL-Lab-Token": this._labToken
      },
      body: JSON.stringify(body)
    });

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
      run
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
