/**
 * In-memory lab persistence for unit tests (mirrors IdbLabStore Phase 2+3 API).
 */
export class MemoryLabStore {
  constructor() {
    /** @type {Map<string, any>} */
    this.cases = new Map();
    /** @type {Map<string, { caseId: string, attachmentId: string, bytes: Uint8Array, meta: any }>} */
    this.attachments = new Map();
    /** @type {Map<string, string>} */
    this.dedupe = new Map();
    /** @type {Map<string, any>} */
    this.overlays = new Map();
    /** @type {Map<string, any>} */
    this.runs = new Map();
    /** @type {Map<string, any>} */
    this.snapshots = new Map();
    /** @type {Map<string, any>} */
    this.audit = new Map();
    /** @type {Map<string, any>} */
    this.takeoffRuns = new Map();
    /** @type {Map<string, any>} */
    this.takeoffAudit = new Map();
    /** @type {Map<string, any>} */
    this.takeoffOverlays = new Map();
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

  async saveImportedCase(payload) {
    const { caseRow, attachmentBlobs } = payload;
    const dedupeKey = caseRow.importMeta?.dedupeKey;
    if (!dedupeKey) throw new Error("Missing dedupeKey on imported case");
    const existing = this.dedupe.get(dedupeKey);
    if (existing) return { duplicate: true, caseId: existing };

    const persisted = clone(stripBytes(caseRow));
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

  async getOverlay(caseId) {
    return this.overlays.get(caseId) ?? null;
  }

  async listOverlays() {
    return [...this.overlays.values()];
  }

  async setCaseOverlay(caseId, patch) {
    const { __pushEvent, ...rest } = patch ?? {};
    const existing = this.overlays.get(caseId) ?? { caseId };
    const next = { ...existing, ...rest, caseId };
    if (__pushEvent) {
      next.extraEvents = [...(existing.extraEvents ?? []), __pushEvent];
    }
    this.overlays.set(caseId, next);
    const caseRow = this.cases.get(caseId);
    if (caseRow) {
      const merged = { ...caseRow, ...rest };
      if (__pushEvent) merged.events = [...(caseRow.events ?? []), __pushEvent];
      this.cases.set(caseId, stripBytes(merged));
    }
    return next;
  }

  async appendCaseEvent(caseId, event) {
    return this.setCaseOverlay(caseId, { __pushEvent: event });
  }

  async saveClassificationRun(run) {
    this.runs.set(run.id, clone(run));
  }

  async patchClassificationRun(runId, patch) {
    const existing = this.runs.get(runId);
    if (!existing) throw Object.assign(new Error("Run not found"), { code: "RUN_NOT_FOUND" });
    const next = { ...existing, ...patch, id: runId };
    if (Object.prototype.hasOwnProperty.call(patch, "result")) next.result = patch.result;
    this.runs.set(runId, next);
  }

  async getClassificationRun(runId) {
    return this.runs.get(runId) ?? null;
  }

  async listClassificationRuns(caseId) {
    return [...this.runs.values()]
      .filter((r) => r.caseId === caseId)
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  }

  async saveReviewedSnapshot(snapshot) {
    this.snapshots.set(snapshot.id, clone(snapshot));
  }

  async getLatestAcceptedSnapshot(caseId) {
    return [...this.snapshots.values()]
      .filter((s) => s.caseId === caseId)
      .sort((a, b) => String(b.acceptedAt).localeCompare(String(a.acceptedAt)))[0] ?? null;
  }

  async appendAuditEvent(event) {
    this.audit.set(event.id, clone(event));
  }

  async listAuditEvents(caseId) {
    return [...this.audit.values()]
      .filter((a) => a.caseId === caseId)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }

  async saveTakeoffRun(run) {
    const cleaned = stripTakeoffRunBytes(run);
    if (this.takeoffRuns.has(cleaned.id)) {
      const err = new Error("Takeoff run is immutable and already persisted.");
      err.code = "TAKEOFF_RUN_IMMUTABLE";
      throw err;
    }
    this.takeoffRuns.set(cleaned.id, clone(cleaned));
  }

  async getTakeoffRun(runId) {
    return this.takeoffRuns.get(runId) ?? null;
  }

  async listTakeoffRuns(caseId) {
    return [...this.takeoffRuns.values()]
      .filter((r) => r.caseId === caseId)
      .sort(compareTakeoffRunsNewestFirst);
  }

  async getLatestTakeoffRun(caseId) {
    const list = await this.listTakeoffRuns(caseId);
    return list[0] ?? null;
  }

  async appendTakeoffAuditEvent(event) {
    this.takeoffAudit.set(event.id, clone(event));
  }

  async listTakeoffAuditEvents(caseId) {
    return [...this.takeoffAudit.values()]
      .filter((a) => a.caseId === caseId)
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }

  async getTakeoffOverlay(caseId) {
    return this.takeoffOverlays.get(caseId) ?? null;
  }

  async listTakeoffOverlays() {
    return [...this.takeoffOverlays.values()];
  }

  async setTakeoffOverlay(caseId, patch) {
    const existing = this.takeoffOverlays.get(caseId) ?? { caseId };
    const next = { ...existing, ...patch, caseId };
    this.takeoffOverlays.set(caseId, next);
    return next;
  }

  async clearImported() {
    const importedIds = new Set(this.cases.keys());
    this.cases.clear();
    this.attachments.clear();
    this.dedupe.clear();
    for (const [id, run] of [...this.runs.entries()]) {
      if (importedIds.has(run.caseId)) this.runs.delete(id);
    }
    for (const [id, snap] of [...this.snapshots.entries()]) {
      if (importedIds.has(snap.caseId)) this.snapshots.delete(id);
    }
    for (const [id, ev] of [...this.audit.entries()]) {
      if (importedIds.has(ev.caseId)) this.audit.delete(id);
    }
    for (const caseId of importedIds) this.overlays.delete(caseId);
    for (const [id, run] of [...this.takeoffRuns.entries()]) {
      if (importedIds.has(run.caseId)) this.takeoffRuns.delete(id);
    }
    for (const [id, ev] of [...this.takeoffAudit.entries()]) {
      if (importedIds.has(ev.caseId)) this.takeoffAudit.delete(id);
    }
    for (const caseId of importedIds) this.takeoffOverlays.delete(caseId);
  }
}

function stripTakeoffRunBytes(run) {
  const cloneRun = clone(run ?? {});
  if (cloneRun.attachmentBytes != null) delete cloneRun.attachmentBytes;
  if (cloneRun.bytes != null) delete cloneRun.bytes;
  if (cloneRun.attachment && typeof cloneRun.attachment === "object") {
    delete cloneRun.attachment.bytes;
    delete cloneRun.attachment.attachmentBytes;
  }
  return cloneRun;
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

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function compareTakeoffRunsNewestFirst(a, b) {
  const ta = String(b.completedAt ?? b.startedAt ?? "");
  const tb = String(a.completedAt ?? a.startedAt ?? "");
  const cmp = ta.localeCompare(tb);
  if (cmp !== 0) return cmp;
  return String(b.id).localeCompare(String(a.id));
}
