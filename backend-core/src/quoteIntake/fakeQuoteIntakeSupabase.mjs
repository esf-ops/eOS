/**
 * Minimal in-process fake Supabase client for Quote Intake unit tests.
 * Supports the query shapes used by SupabaseQuoteIntakeRepository only.
 */

import { randomUUID } from "node:crypto";

function deepClone(v) {
  return structuredClone(v);
}

export class FakeQuoteIntakeSupabaseClient {
  constructor() {
    /** @type {Record<string, object[]>} */
    this.tables = {
      quote_intake_cases: [],
      quote_intake_attachments: [],
      quote_intake_automation_decisions: [],
      quote_intake_audit_events: [],
      quote_intake_takeoff_links: []
    };
    /** Simulate unique race on next insert into cases */
    this._forceUniqueOnNextCaseInsert = false;
  }

  from(table) {
    return new FakeQuery(this, table);
  }

  clear() {
    for (const k of Object.keys(this.tables)) this.tables[k] = [];
    this._forceUniqueOnNextCaseInsert = false;
  }
}

class FakeQuery {
  /**
   * @param {FakeQuoteIntakeSupabaseClient} client
   * @param {string} table
   */
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this._filters = [];
    this._order = null;
    this._limit = null;
    this._action = "select";
    this._payload = null;
    this._wantSingle = false;
    this._wantMaybe = false;
  }

  select() {
    return this;
  }

  insert(payload) {
    this._action = "insert";
    this._payload = payload;
    return this;
  }

  update(payload) {
    this._action = "update";
    this._payload = payload;
    return this;
  }

  delete() {
    this._action = "delete";
    return this;
  }

  eq(col, val) {
    this._filters.push({ col, val });
    return this;
  }

  order(col, opts = {}) {
    this._order = { col, ascending: opts.ascending !== false };
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  single() {
    this._wantSingle = true;
    return this.thenable();
  }

  maybeSingle() {
    this._wantMaybe = true;
    return this.thenable();
  }

  then(resolve, reject) {
    return this.thenable().then(resolve, reject);
  }

  thenable() {
    return Promise.resolve().then(() => this.#execute());
  }

  #rows() {
    return this.client.tables[this.table] ?? [];
  }

  #applyFilters(rows) {
    return rows.filter((r) =>
      this._filters.every((f) => String(r[f.col]) === String(f.val))
    );
  }

  #execute() {
    if (this._action === "insert") {
      return this.#doInsert();
    }
    if (this._action === "update") {
      return this.#doUpdate();
    }
    if (this._action === "delete") {
      return this.#doDelete();
    }
    let rows = this.#applyFilters(this.#rows()).map(deepClone);
    if (this._order) {
      const { col, ascending } = this._order;
      rows.sort((a, b) => {
        const av = String(a[col] ?? "");
        const bv = String(b[col] ?? "");
        return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    if (this._limit != null) rows = rows.slice(0, this._limit);
    if (this._wantSingle) {
      if (rows.length !== 1) {
        return { data: null, error: { code: "PGRST116", message: "not single" } };
      }
      return { data: rows[0], error: null };
    }
    if (this._wantMaybe) {
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  #doInsert() {
    const items = Array.isArray(this._payload) ? this._payload : [this._payload];
    const created = [];

    for (const raw of items) {
      if (this.table === "quote_intake_cases" && this.client._forceUniqueOnNextCaseInsert) {
        this.client._forceUniqueOnNextCaseInsert = false;
        return { data: null, error: { code: "23505", message: "duplicate key value" } };
      }

      const row = {
        id: raw.id || randomUUID(),
        created_at: raw.created_at || new Date().toISOString(),
        updated_at: raw.updated_at || new Date().toISOString(),
        ...raw
      };

      // Unique checks
      if (this.table === "quote_intake_cases") {
        const all = this.#rows();
        const msgId = String(row.internet_message_id ?? "").trim();
        if (
          msgId &&
          all.some(
            (r) =>
              r.organization_id === row.organization_id &&
              String(r.internet_message_id ?? "").trim() === msgId
          )
        ) {
          return { data: null, error: { code: "23505", message: "duplicate key value" } };
        }
        // Content-hash unique only when Message-ID is absent (fallback semantics).
        if (
          row.content_hash &&
          !msgId &&
          all.some(
            (r) =>
              r.organization_id === row.organization_id &&
              r.content_hash === row.content_hash &&
              !String(r.internet_message_id ?? "").trim()
          )
        ) {
          return { data: null, error: { code: "23505", message: "duplicate key value" } };
        }
      }
      if (this.table === "quote_intake_attachments") {
        if (
          this.#rows().some(
            (r) => r.intake_case_id === row.intake_case_id && r.sha256 === row.sha256
          )
        ) {
          return { data: null, error: { code: "23505", message: "duplicate key value" } };
        }
        // Child org check
        const parent = this.client.tables.quote_intake_cases.find((c) => c.id === row.intake_case_id);
        if (parent && parent.organization_id !== row.organization_id) {
          return {
            data: null,
            error: { code: "23514", message: "organization_id must match parent" }
          };
        }
      }
      if (this.table === "quote_intake_takeoff_links") {
        if (
          this.#rows().some(
            (r) =>
              r.organization_id === row.organization_id &&
              r.idempotency_key === row.idempotency_key
          )
        ) {
          return { data: null, error: { code: "23505", message: "duplicate key value" } };
        }
      }
      if (this.table === "quote_intake_audit_events") {
        // append-only table — inserts fine
        const parent = this.client.tables.quote_intake_cases.find((c) => c.id === row.intake_case_id);
        if (parent && parent.organization_id !== row.organization_id) {
          return {
            data: null,
            error: { code: "23514", message: "organization_id must match parent" }
          };
        }
      }

      this.#rows().push(row);
      created.push(deepClone(row));
    }

    if (this._wantSingle || this._wantMaybe) {
      return { data: created[0], error: null };
    }
    return { data: created, error: null };
  }

  #doUpdate() {
    const matched = this.#applyFilters(this.#rows());
    for (const row of matched) {
      if (
        this.table === "quote_intake_cases" &&
        this._payload.organization_id != null &&
        this._payload.organization_id !== row.organization_id
      ) {
        return {
          data: null,
          error: { code: "23514", message: "organization_id is immutable" }
        };
      }
      Object.assign(row, this._payload, { updated_at: new Date().toISOString() });
    }
    return { data: matched.map(deepClone), error: null };
  }

  #doDelete() {
    if (this.table === "quote_intake_audit_events") {
      return {
        data: null,
        error: { code: "42501", message: "quote_intake_audit_events are append-only" }
      };
    }
    const keep = [];
    const removed = [];
    for (const row of this.#rows()) {
      const match = this._filters.every((f) => String(row[f.col]) === String(f.val));
      if (match) removed.push(row);
      else keep.push(row);
    }
    this.client.tables[this.table] = keep;
    return { data: removed, error: null };
  }
}
