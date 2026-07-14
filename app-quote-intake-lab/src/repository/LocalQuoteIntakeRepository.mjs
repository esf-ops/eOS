import { inboundEmailAdapter } from "../inbound/inboundEmailAdapter.mjs";
import { caseFromInboundMessage } from "../inbound/caseFromInbound.mjs";
import { formatTurnaround } from "../domain/age.mjs";
import {
  buildStatusCounts,
  filterQuoteIntakeCases,
  uniqueEstimators,
  uniqueSalespeople
} from "../domain/filters.mjs";
import { getFixtureCases, FIXTURE_AS_OF } from "../fixtures/quoteIntakeCases.mjs";
import { getIdbLabStore } from "./idbLabStore.mjs";

/**
 * Composite repository: built-in fixtures + locally imported cases (IndexedDB / memory).
 */
export class LocalQuoteIntakeRepository {
  /**
   * @param {{ store?: any, fixtureCases?: any[], asOfMode?: "wall"|"fixture" }} [opts]
   */
  constructor(opts = {}) {
    this._store = opts.store ?? getIdbLabStore();
    this._fixtureCases = opts.fixtureCases ?? getFixtureCases();
    this._asOfMode = opts.asOfMode ?? "wall";
    this._adapter = opts.adapter ?? inboundEmailAdapter;
    this._ready = null;
  }

  async ready() {
    if (!this._ready) this._ready = this._store.ready();
    await this._ready;
    return this;
  }

  getAsOf() {
    if (this._asOfMode === "fixture") return FIXTURE_AS_OF;
    return new Date().toISOString();
  }

  async _allRaw() {
    await this.ready();
    const imported = await this._store.listImportedCases();
    return [...imported, ...this._fixtureCases];
  }

  async listCases(filter = {}) {
    const asOf = this.getAsOf();
    const filtered = filterQuoteIntakeCases(await this._allRaw(), filter, asOf);
    return filtered.map((c) => enrichCase(c, asOf));
  }

  async getCase(id) {
    await this.ready();
    const local = await this._store.getCase(id);
    if (local) return enrichCase(local, this.getAsOf());
    const fixture = this._fixtureCases.find((c) => c.id === id);
    return fixture ? enrichCase(fixture, this.getAsOf()) : null;
  }

  async getStatusCounts(filter = {}) {
    const asOf = this.getAsOf();
    const filtered = filterQuoteIntakeCases(await this._allRaw(), filter, asOf);
    return buildStatusCounts(filtered);
  }

  async listSalespeople() {
    return uniqueSalespeople(await this._allRaw());
  }

  async listEstimators() {
    return uniqueEstimators(await this._allRaw());
  }

  async countImported() {
    await this.ready();
    return this._store.countImported();
  }

  /**
   * Preview-only: normalize source, check dedupe, do not persist.
   * @param {{ kind: "eml_upload"|"manual_paste", bytes?: Uint8Array, filename?: string, input?: any, importActor?: string }} source
   */
  async previewImport(source) {
    const message = await this._adapter.ingest(source);
    await this.ready();
    const existingId = await this._store.findCaseIdByDedupeKey(message.dedupeKey);
    return {
      message,
      duplicateOfCaseId: existingId,
      duplicateReason: existingId
        ? message.dedupeStrategy === "message_id"
          ? "Matching Message-ID already imported into the lab."
          : "Matching content hash already imported into the lab."
        : null,
      canConfirm: !existingId
    };
  }

  /**
   * Confirm import after preview. Idempotent — duplicates return existing case.
   * @param {import("../inbound/inboundTypes.mjs").InboundMessage} message
   */
  async confirmImport(message) {
    await this.ready();
    const existingId = await this._store.findCaseIdByDedupeKey(message.dedupeKey);
    if (existingId) {
      return {
        ok: false,
        duplicate: true,
        caseId: existingId,
        dedupeKey: message.dedupeKey,
        reason:
          message.dedupeStrategy === "message_id"
            ? "Matching Message-ID already imported into the lab."
            : "Matching content hash already imported into the lab."
      };
    }

    const caseRow = await caseFromInboundMessage(message);
    const attachmentBlobs = (message.attachments ?? [])
      .filter((a) => a.bytes && a.bytes.byteLength >= 0)
      .map((a) => ({
        attachmentId: a.id,
        bytes: a.bytes,
        contentType: a.contentType,
        filename: a.filename
      }));

    const saved = await this._store.saveImportedCase({ caseRow, attachmentBlobs });
    if (saved.duplicate) {
      return {
        ok: false,
        duplicate: true,
        caseId: saved.caseId,
        dedupeKey: message.dedupeKey,
        reason: "Duplicate detected during save."
      };
    }

    return {
      ok: true,
      caseId: saved.caseId,
      dedupeKey: message.dedupeKey,
      duplicate: false
    };
  }

  async getAttachmentBytes(caseId, attachmentId) {
    await this.ready();
    return this._store.getAttachmentBytes(caseId, attachmentId);
  }

  /** Remove locally imported cases + blobs. Fixtures untouched. */
  async clearImported() {
    await this.ready();
    await this._store.clearImported();
  }
}

function enrichCase(c, asOf) {
  return {
    ...c,
    elapsedTurnaroundLabel: formatTurnaround(c.receivedAt, asOf)
  };
}

let _browserRepo = null;

export function getLocalQuoteIntakeRepository() {
  if (!_browserRepo) _browserRepo = new LocalQuoteIntakeRepository();
  return _browserRepo;
}
