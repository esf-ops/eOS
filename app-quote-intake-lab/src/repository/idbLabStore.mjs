/**
 * IndexedDB persistence for lab-imported cases, attachment blobs, and classification.
 * Never used as source for built-in fixtures. Never touches network / Supabase.
 *
 * v1 → v2 adds classification runs, reviewed snapshots, audit events, case overlays.
 */

const DB_NAME = "quote-intake-lab-v1";
const DB_VERSION = 2;
const STORE_CASES = "cases";
const STORE_ATTACHMENTS = "attachments";
const STORE_DEDUPE = "dedupe";
const STORE_RUNS = "classificationRuns";
const STORE_SNAPSHOTS = "reviewedSnapshots";
const STORE_AUDIT = "auditEvents";
const STORE_OVERLAYS = "caseOverlays";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion ?? 0;
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORE_CASES)) {
          db.createObjectStore(STORE_CASES, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_ATTACHMENTS)) {
          const att = db.createObjectStore(STORE_ATTACHMENTS, { keyPath: "key" });
          att.createIndex("byCase", "caseId", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_DEDUPE)) {
          db.createObjectStore(STORE_DEDUPE, { keyPath: "dedupeKey" });
        }
      }
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(STORE_RUNS)) {
          const runs = db.createObjectStore(STORE_RUNS, { keyPath: "id" });
          runs.createIndex("byCase", "caseId", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
          const snaps = db.createObjectStore(STORE_SNAPSHOTS, { keyPath: "id" });
          snaps.createIndex("byCase", "caseId", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_AUDIT)) {
          const audit = db.createObjectStore(STORE_AUDIT, { keyPath: "id" });
          audit.createIndex("byCase", "caseId", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_OVERLAYS)) {
          db.createObjectStore(STORE_OVERLAYS, { keyPath: "caseId" });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export class IdbLabStore {
  constructor() {
    /** @type {IDBDatabase|null} */
    this._db = null;
  }

  async ready() {
    if (!this._db) this._db = await openDb();
    return this;
  }

  async listImportedCases() {
    await this.ready();
    const tx = this._db.transaction(STORE_CASES, "readonly");
    const store = tx.objectStore(STORE_CASES);
    const rows = await reqToPromise(store.getAll());
    await txDone(tx);
    return (rows ?? []).sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  }

  async getCase(id) {
    await this.ready();
    const tx = this._db.transaction(STORE_CASES, "readonly");
    const row = await reqToPromise(tx.objectStore(STORE_CASES).get(id));
    await txDone(tx);
    return row ?? null;
  }

  async findCaseIdByDedupeKey(key) {
    await this.ready();
    const tx = this._db.transaction(STORE_DEDUPE, "readonly");
    const row = await reqToPromise(tx.objectStore(STORE_DEDUPE).get(key));
    await txDone(tx);
    return row?.caseId ?? null;
  }

  async countImported() {
    await this.ready();
    const tx = this._db.transaction(STORE_CASES, "readonly");
    const count = await reqToPromise(tx.objectStore(STORE_CASES).count());
    await txDone(tx);
    return count ?? 0;
  }

  async saveImportedCase({ caseRow, attachmentBlobs }) {
    await this.ready();
    const dedupeKey = caseRow.importMeta?.dedupeKey;
    if (!dedupeKey) throw new Error("Missing dedupeKey on imported case");

    const existingId = await this.findCaseIdByDedupeKey(dedupeKey);
    if (existingId) return { duplicate: true, caseId: existingId };

    const persisted = JSON.parse(JSON.stringify(stripBytes(caseRow)));
    const tx = this._db.transaction([STORE_CASES, STORE_ATTACHMENTS, STORE_DEDUPE], "readwrite");
    tx.objectStore(STORE_CASES).put(persisted);
    tx.objectStore(STORE_DEDUPE).put({ dedupeKey, caseId: persisted.id });
    for (const blob of attachmentBlobs ?? []) {
      tx.objectStore(STORE_ATTACHMENTS).put({
        key: `${persisted.id}:${blob.attachmentId}`,
        caseId: persisted.id,
        attachmentId: blob.attachmentId,
        bytes: blob.bytes,
        contentType: blob.contentType ?? "application/octet-stream",
        filename: blob.filename ?? "attachment.bin"
      });
    }
    await txDone(tx);
    return { duplicate: false, caseId: persisted.id };
  }

  async getAttachmentBytes(caseId, attachmentId) {
    await this.ready();
    const tx = this._db.transaction(STORE_ATTACHMENTS, "readonly");
    const row = await reqToPromise(tx.objectStore(STORE_ATTACHMENTS).get(`${caseId}:${attachmentId}`));
    await txDone(tx);
    if (!row?.bytes) return null;
    if (row.bytes instanceof Uint8Array) return row.bytes;
    if (row.bytes instanceof ArrayBuffer) return new Uint8Array(row.bytes);
    return new Uint8Array(row.bytes);
  }

  async getOverlay(caseId) {
    await this.ready();
    const tx = this._db.transaction(STORE_OVERLAYS, "readonly");
    const row = await reqToPromise(tx.objectStore(STORE_OVERLAYS).get(caseId));
    await txDone(tx);
    return row ?? null;
  }

  async listOverlays() {
    await this.ready();
    const tx = this._db.transaction(STORE_OVERLAYS, "readonly");
    const rows = await reqToPromise(tx.objectStore(STORE_OVERLAYS).getAll());
    await txDone(tx);
    return rows ?? [];
  }

  /**
   * Merge patch into case overlay. For imported cases, also mirrors key fields onto the case row.
   * Special: `__pushEvent` appends to case.events (imported) and overlay.extraEvents (fixtures).
   */
  async setCaseOverlay(caseId, patch) {
    await this.ready();
    const { __pushEvent, ...rest } = patch ?? {};
    const tx = this._db.transaction([STORE_OVERLAYS, STORE_CASES], "readwrite");
    const overlayStore = tx.objectStore(STORE_OVERLAYS);
    const caseStore = tx.objectStore(STORE_CASES);
    const existingOverlay = (await reqToPromise(overlayStore.get(caseId))) ?? { caseId };
    const nextOverlay = { ...existingOverlay, ...rest, caseId };
    if (__pushEvent) {
      nextOverlay.extraEvents = [...(existingOverlay.extraEvents ?? []), __pushEvent];
    }
    overlayStore.put(nextOverlay);

    const caseRow = await reqToPromise(caseStore.get(caseId));
    if (caseRow) {
      const merged = { ...caseRow, ...rest };
      if (__pushEvent) {
        merged.events = [...(caseRow.events ?? []), __pushEvent];
      }
      caseStore.put(stripBytes(merged));
    }
    await txDone(tx);
    return nextOverlay;
  }

  async appendCaseEvent(caseId, event) {
    return this.setCaseOverlay(caseId, { __pushEvent: event });
  }

  async saveClassificationRun(run) {
    await this.ready();
    const tx = this._db.transaction(STORE_RUNS, "readwrite");
    tx.objectStore(STORE_RUNS).put(JSON.parse(JSON.stringify(run)));
    await txDone(tx);
  }

  async patchClassificationRun(runId, patch) {
    await this.ready();
    const tx = this._db.transaction(STORE_RUNS, "readwrite");
    const store = tx.objectStore(STORE_RUNS);
    const existing = await reqToPromise(store.get(runId));
    if (!existing) {
      await txDone(tx);
      throw Object.assign(new Error("Run not found"), { code: "RUN_NOT_FOUND" });
    }
    const next = { ...existing, ...patch, id: runId };
    if (Object.prototype.hasOwnProperty.call(patch, "result")) next.result = patch.result;
    store.put(next);
    await txDone(tx);
  }

  async getClassificationRun(runId) {
    await this.ready();
    const tx = this._db.transaction(STORE_RUNS, "readonly");
    const row = await reqToPromise(tx.objectStore(STORE_RUNS).get(runId));
    await txDone(tx);
    return row ?? null;
  }

  async listClassificationRuns(caseId) {
    await this.ready();
    const tx = this._db.transaction(STORE_RUNS, "readonly");
    const idx = tx.objectStore(STORE_RUNS).index("byCase");
    const rows = await reqToPromise(idx.getAll(caseId));
    await txDone(tx);
    return (rows ?? []).sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  }

  async saveReviewedSnapshot(snapshot) {
    await this.ready();
    const tx = this._db.transaction(STORE_SNAPSHOTS, "readwrite");
    tx.objectStore(STORE_SNAPSHOTS).put(JSON.parse(JSON.stringify(snapshot)));
    await txDone(tx);
  }

  async getLatestAcceptedSnapshot(caseId) {
    await this.ready();
    const tx = this._db.transaction(STORE_SNAPSHOTS, "readonly");
    const rows = await reqToPromise(tx.objectStore(STORE_SNAPSHOTS).index("byCase").getAll(caseId));
    await txDone(tx);
    const list = (rows ?? []).sort((a, b) => String(b.acceptedAt).localeCompare(String(a.acceptedAt)));
    return list[0] ?? null;
  }

  async appendAuditEvent(event) {
    await this.ready();
    const tx = this._db.transaction(STORE_AUDIT, "readwrite");
    tx.objectStore(STORE_AUDIT).put(JSON.parse(JSON.stringify(event)));
    await txDone(tx);
  }

  async listAuditEvents(caseId) {
    await this.ready();
    const tx = this._db.transaction(STORE_AUDIT, "readonly");
    const rows = await reqToPromise(tx.objectStore(STORE_AUDIT).index("byCase").getAll(caseId));
    await txDone(tx);
    return (rows ?? []).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }

  async clearImported() {
    await this.ready();
    const imported = await this.listImportedCases();
    const importedIds = new Set(imported.map((c) => c.id));

    const readTx = this._db.transaction(
      [STORE_RUNS, STORE_SNAPSHOTS, STORE_AUDIT, STORE_OVERLAYS],
      "readonly"
    );
    const [runs, snaps, audits, overlays] = await Promise.all([
      reqToPromise(readTx.objectStore(STORE_RUNS).getAll()),
      reqToPromise(readTx.objectStore(STORE_SNAPSHOTS).getAll()),
      reqToPromise(readTx.objectStore(STORE_AUDIT).getAll()),
      reqToPromise(readTx.objectStore(STORE_OVERLAYS).getAll())
    ]);
    await txDone(readTx);

    const writeTx = this._db.transaction(
      [STORE_CASES, STORE_ATTACHMENTS, STORE_DEDUPE, STORE_RUNS, STORE_SNAPSHOTS, STORE_AUDIT, STORE_OVERLAYS],
      "readwrite"
    );
    writeTx.objectStore(STORE_CASES).clear();
    writeTx.objectStore(STORE_ATTACHMENTS).clear();
    writeTx.objectStore(STORE_DEDUPE).clear();
    for (const r of runs ?? []) {
      if (importedIds.has(r.caseId)) writeTx.objectStore(STORE_RUNS).delete(r.id);
    }
    for (const s of snaps ?? []) {
      if (importedIds.has(s.caseId)) writeTx.objectStore(STORE_SNAPSHOTS).delete(s.id);
    }
    for (const a of audits ?? []) {
      if (importedIds.has(a.caseId)) writeTx.objectStore(STORE_AUDIT).delete(a.id);
    }
    for (const o of overlays ?? []) {
      if (importedIds.has(o.caseId)) writeTx.objectStore(STORE_OVERLAYS).delete(o.caseId);
    }
    await txDone(writeTx);
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

let _singleton = null;

/** Browser singleton IdbLabStore */
export function getIdbLabStore() {
  if (!_singleton) _singleton = new IdbLabStore();
  return _singleton;
}
