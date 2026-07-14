/**
 * In-memory lab persistence for unit tests.
 */
export class MemoryLabStore {
  constructor() {
    /** @type {Map<string, any>} */
    this.cases = new Map();
    /** @type {Map<string, { caseId: string, attachmentId: string, bytes: Uint8Array, meta: any }>} */
    this.attachments = new Map();
    /** @type {Map<string, string>} dedupeKey -> caseId */
    this.dedupe = new Map();
  }

  async ready() {
    return this;
  }

  async listImportedCases() {
    return [...this.cases.values()].sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  }

  async getCase(id) {
    return this.cases.get(id) ?? null;
  }

  async findCaseIdByDedupeKey(key) {
    return this.dedupe.get(key) ?? null;
  }

  async countImported() {
    return this.cases.size;
  }

  /**
   * @param {{ caseRow: any, attachmentBlobs: Array<{ attachmentId: string, bytes: Uint8Array }> }} payload
   */
  async saveImportedCase(payload) {
    const { caseRow, attachmentBlobs } = payload;
    const dedupeKey = caseRow.importMeta?.dedupeKey;
    if (!dedupeKey) throw new Error("Missing dedupeKey on imported case");
    const existing = this.dedupe.get(dedupeKey);
    if (existing) {
      return { duplicate: true, caseId: existing };
    }

    const persisted = structuredClone
      ? structuredClone(stripBytes(caseRow))
      : JSON.parse(JSON.stringify(stripBytes(caseRow)));
    this.cases.set(persisted.id, persisted);
    this.dedupe.set(dedupeKey, persisted.id);

    for (const blob of attachmentBlobs ?? []) {
      const key = `${persisted.id}:${blob.attachmentId}`;
      this.attachments.set(key, {
        caseId: persisted.id,
        attachmentId: blob.attachmentId,
        bytes: blob.bytes,
        meta: (caseRow.attachments || []).find((a) => a.id === blob.attachmentId) ?? null
      });
    }
    return { duplicate: false, caseId: persisted.id };
  }

  async getAttachmentBytes(caseId, attachmentId) {
    return this.attachments.get(`${caseId}:${attachmentId}`)?.bytes ?? null;
  }

  async clearImported() {
    this.cases.clear();
    this.attachments.clear();
    this.dedupe.clear();
  }
}

function stripBytes(caseRow) {
  return {
    ...caseRow,
    attachments: (caseRow.attachments ?? []).map((a) => {
      const { bytes: _b, ...rest } = a;
      return rest;
    })
  };
}
