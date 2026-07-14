/**
 * IndexedDB persistence for lab-imported cases + attachment blobs.
 * Never used for fixtures. Never touches network / Supabase.
 */

const DB_NAME = "quote-intake-lab-v1";
const DB_VERSION = 1;
const STORE_CASES = "cases";
const STORE_ATTACHMENTS = "attachments";
const STORE_DEDUPE = "dedupe";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
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

  async clearImported() {
    await this.ready();
    const tx = this._db.transaction([STORE_CASES, STORE_ATTACHMENTS, STORE_DEDUPE], "readwrite");
    tx.objectStore(STORE_CASES).clear();
    tx.objectStore(STORE_ATTACHMENTS).clear();
    tx.objectStore(STORE_DEDUPE).clear();
    await txDone(tx);
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
