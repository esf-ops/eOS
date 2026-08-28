/**
 * Monday Sales Ops adapter.
 * Tokens stay server-side. Column IDs come from org config or title matching after a live board inspect.
 * Never guess column IDs. Never mutate board structure.
 */

import { MONDAY_FIELD_TITLES, MONDAY_SEMANTIC_FIELDS, PATCHABLE_ACCOUNT_FIELDS } from "./salesOpsConstants.js";

const MONDAY_API_URL = "https://api.monday.com/v2";

export class SalesOpsMondayError extends Error {
  constructor(message, code = "monday_error") {
    super(message);
    this.code = code;
    this.name = "SalesOpsMondayError";
  }
}

function mondayToken() {
  return String(process.env.MONDAY_API_TOKEN ?? "").trim();
}

function signingSecret() {
  return String(process.env.MONDAY_APP_SIGNING_SECRET ?? process.env.MONDAY_SIGNING_SECRET ?? "").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function mondayErrorMessage(json, fallback) {
  const errs = json?.errors;
  if (!Array.isArray(errs) || !errs.length) return fallback;
  return errs.map((e) => (e && typeof e.message === "string" ? e.message : JSON.stringify(e))).join("; ");
}

function isRetryableMonday(res, json) {
  if (res.status === 429 || res.status === 503 || res.status === 502) return true;
  const msg = mondayErrorMessage(json, "").toLowerCase();
  return (
    msg.includes("complexity") ||
    msg.includes("rate limit") ||
    msg.includes("rate_limited") ||
    msg.includes("hourly_rate") ||
    msg.includes("429")
  );
}

function retryAfterMs(res, attempt) {
  const header = res.headers?.get?.("retry-after");
  const sec = Number(header);
  if (Number.isFinite(sec) && sec >= 0) return Math.min(60000, sec * 1000);
  return Math.min(30000, 1000 * 2 ** Math.max(0, attempt));
}

/**
 * @param {string} token
 * @param {string} query
 * @param {Record<string, unknown>} [variables]
 * @param {{ onBackoff?: Function, onRequest?: Function, maxRetries?: number }} [opts]
 */
export async function mondayGraphql(token, query, variables = {}, opts = {}) {
  const maxRetries = Number.isFinite(opts.maxRetries) ? opts.maxRetries : 8;
  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    opts.onRequest?.();
    const res = await fetch(MONDAY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: String(token).trim()
      },
      body: JSON.stringify({ query, variables })
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      lastErr = new SalesOpsMondayError(`Monday returned non-JSON (HTTP ${res.status})`, "monday_http");
      if (res.status >= 500 && attempt < maxRetries) {
        const waitMs = retryAfterMs(res, attempt);
        await opts.onBackoff?.({ waitMs, attempt, reason: "http" });
        await sleep(waitMs);
        continue;
      }
      throw lastErr;
    }
    if (isRetryableMonday(res, json) && attempt < maxRetries) {
      const waitMs = retryAfterMs(res, attempt);
      await opts.onBackoff?.({
        waitMs,
        attempt,
        reason: res.status === 429 ? "rate_limit" : "complexity"
      });
      await sleep(waitMs);
      continue;
    }
    if (!res.ok) throw new SalesOpsMondayError(`Monday HTTP ${res.status}`, "monday_http");
    const errs = json?.errors;
    if (Array.isArray(errs) && errs.length) {
      throw new SalesOpsMondayError(mondayErrorMessage(json, "Monday GraphQL error"), "monday_graphql");
    }
    return json;
  }
  throw lastErr || new SalesOpsMondayError("Monday request failed after retries", "monday_http");
}

export function resolveColumnMapFromBoard(columns, existingMap = {}) {
  const byTitle = new Map();
  for (const col of columns || []) {
    const title = String(col?.title ?? "").trim().toLowerCase();
    if (title) byTitle.set(title, col);
  }
  const out = { ...(existingMap || {}) };
  for (const semantic of MONDAY_SEMANTIC_FIELDS) {
    const current = out[semantic] || {};
    if (current.columnId) {
      out[semantic] = { ...current, title: current.title || semantic };
      continue;
    }
    const titles = MONDAY_FIELD_TITLES[semantic] || [];
    let matched = null;
    for (const t of titles) {
      matched = byTitle.get(String(t).toLowerCase());
      if (matched) break;
    }
    if (matched) {
      out[semantic] = {
        columnId: String(matched.id),
        title: String(matched.title),
        type: String(matched.type || "")
      };
    }
  }
  return out;
}

function columnText(col) {
  if (!col) return null;
  const t = col.text;
  if (t != null && String(t).trim()) return String(t).trim();
  const v = col.value;
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object") {
        if (parsed.name) return String(parsed.name);
        if (parsed.personsAndTeams?.[0]?.id) return String(parsed.personsAndTeams[0].id);
        if (parsed.date) return String(parsed.date);
        if (parsed.checked != null) return parsed.checked ? "true" : "false";
      }
    } catch {
      return v.trim() || null;
    }
    return v.trim() || null;
  }
  return null;
}

function peopleIds(col) {
  if (!col) return [];
  try {
    const v = typeof col.value === "string" ? JSON.parse(col.value) : col.value;
    const pts = v?.personsAndTeams;
    if (!Array.isArray(pts)) return [];
    return pts.map((p) => String(p.id)).filter(Boolean);
  } catch {
    return [];
  }
}

export function normalizeMondayItem(item, columnMap, boardId) {
  const cols = new Map((item?.column_values || []).map((c) => [String(c.id), c]));
  function field(semantic) {
    const colId = columnMap?.[semantic]?.columnId;
    if (!colId) return null;
    return columnText(cols.get(colId));
  }
  const peopleColId = columnMap?.salesExecutive?.columnId;
  const mondayAssigned = peopleColId ? peopleIds(cols.get(peopleColId))[0] || null : null;
  return {
    mondayItemId: String(item.id),
    mondayBoardId: String(boardId),
    accountName: String(item.name || "").trim(),
    mondayUrl: item.url ? String(item.url) : null,
    mondayGroup: item.group?.title ? String(item.group.title) : null,
    mondayAssignedUserId: mondayAssigned,
    status: field("status"),
    lastContact: field("lastContact"),
    nextContact: field("nextContact"),
    market: field("market"),
    branch: field("branch"),
    accountType: field("accountType"),
    sampleProgram: field("sampleProgram"),
    currentPrimarySupplier: field("currentPrimarySupplier"),
    primaryPainPoint: field("primaryPainPoint"),
    esfSolution: field("esfSolution"),
    nextStrategicMilestone: field("nextStrategicMilestone"),
    targetSqFtPerMonth: field("targetSqFtPerMonth") ? Number(field("targetSqFtPerMonth")) : null,
    mondayUpdatedAt: item.updated_at ? new Date(item.updated_at).toISOString() : null,
    rawColumns: Object.fromEntries((item?.column_values || []).map((c) => [c.id, { text: c.text ?? null, type: c.type ?? null }]))
  };
}

export function buildMondayColumnPayload(semanticPatch, columnMap) {
  const columnValues = {};
  const skipped = [];
  for (const [semantic, value] of Object.entries(semanticPatch || {})) {
    if (!PATCHABLE_ACCOUNT_FIELDS.includes(semantic)) continue;
    const col = columnMap?.[semantic];
    if (!col?.columnId) {
      skipped.push(semantic);
      continue;
    }
    const type = String(col.type || "").toLowerCase();
    if (value == null || value === "") {
      columnValues[col.columnId] = null;
      continue;
    }
    if (type.includes("date")) {
      columnValues[col.columnId] = { date: String(value).slice(0, 10) };
    } else if (type.includes("status")) {
      columnValues[col.columnId] = { label: String(value) };
    } else if (type.includes("numeric") || type === "numbers") {
      columnValues[col.columnId] = String(value);
    } else if (type.includes("checkbox")) {
      columnValues[col.columnId] = { checked: Boolean(value) };
    } else {
      columnValues[col.columnId] = String(value);
    }
  }
  return { columnValues, skipped };
}

export function createSalesOpsMondayClient(overrides = {}) {
  const hooks = {
    onBackoff: overrides.onBackoff || null,
    onRequest: overrides.onRequest || null
  };
  const stubbed = Boolean(overrides.inspectBoard || overrides.listBoardItems || overrides.getItem);
  const gql = (query, variables) => {
    const token = overrides.token ?? mondayToken();
    if (!token) throw new SalesOpsMondayError("Monday token is not configured", "monday_unconfigured");
    return mondayGraphql(token, query, variables, {
      onBackoff: (...args) => hooks.onBackoff?.(...args),
      onRequest: () => hooks.onRequest?.()
    });
  };

  return {
    tokenPresent: () => Boolean(overrides.token ?? mondayToken()),
    signingSecretPresent: () => Boolean(overrides.signingSecret ?? signingSecret()),
    getSigningSecret: () => overrides.signingSecret ?? signingSecret(),
    setHooks(next = {}) {
      if (next.onBackoff !== undefined) hooks.onBackoff = next.onBackoff;
      if (next.onRequest !== undefined) hooks.onRequest = next.onRequest;
    },

    async inspectBoard(boardId) {
      if (overrides.inspectBoard) return overrides.inspectBoard(boardId);
      const json = await gql(
        `query ($ids: [ID!]!) {
          boards(ids: $ids) {
            id name
            columns { id title type settings_str }
            groups { id title }
          }
        }`,
        { ids: [String(boardId)] }
      );
      return json?.data?.boards?.[0] || null;
    },

    async listBoardItemsPageLight(boardId, cursor = null) {
      if (overrides.listBoardItemsPageLight) return overrides.listBoardItemsPageLight(boardId, cursor);
      if (overrides.listBoardItemsPage) return this.listBoardItemsPage(boardId, cursor);
      if (overrides.listBoardItems) {
        if (cursor) return { items: [], cursor: null };
        return { items: (await overrides.listBoardItems(boardId)) || [], cursor: null };
      }
      const json = await gql(
        `query ($ids: [ID!]!, $cursor: String) {
          boards(ids: $ids) {
            items_page(limit: 50, cursor: $cursor) {
              cursor
              items {
                id name url created_at updated_at
                board { id }
                group { id title }
                column_values { id text type value }
              }
            }
          }
        }`,
        { ids: [String(boardId)], cursor }
      );
      const page = json?.data?.boards?.[0]?.items_page;
      return { items: page?.items || [], cursor: page?.cursor || null };
    },

    async listBoardItemsPage(boardId, cursor = null) {
      if (overrides.listBoardItemsPage) return overrides.listBoardItemsPage(boardId, cursor);
      if (overrides.listBoardItems) {
        if (cursor) return { items: [], cursor: null };
        return { items: (await overrides.listBoardItems(boardId)) || [], cursor: null };
      }
      const json = await gql(
        `query ($ids: [ID!]!, $cursor: String) {
          boards(ids: $ids) {
            items_page(limit: 50, cursor: $cursor) {
              cursor
              items {
                id name url created_at updated_at
                board { id }
                group { id title }
                column_values { id text type value }
                assets { id name file_extension file_size created_at }
                subitems {
                  id name url created_at updated_at
                  board { id }
                  group { id title }
                  parent_item { id }
                  column_values { id text type value }
                  assets { id name file_extension file_size created_at }
                }
              }
            }
          }
        }`,
        { ids: [String(boardId)], cursor }
      );
      const page = json?.data?.boards?.[0]?.items_page;
      return { items: page?.items || [], cursor: page?.cursor || null };
    },

    async listBoardItems(boardId) {
      if (overrides.listBoardItems) return overrides.listBoardItems(boardId);
      const items = [];
      let cursor = null;
      do {
        const page = await this.listBoardItemsPage(boardId, cursor);
        items.push(...(page.items || []));
        cursor = page.cursor || null;
      } while (cursor);
      return items;
    },

    async getItemsLight(itemIds) {
      if (overrides.getItemsLight) return overrides.getItemsLight(itemIds);
      const ids = [...new Set((itemIds || []).map(String).filter(Boolean))];
      if (!ids.length) return [];
      if (overrides.getItem) {
        const out = [];
        for (const id of ids) {
          const item = await overrides.getItem(id);
          if (item) out.push(item);
        }
        return out;
      }
      const json = await gql(
        `query ($ids: [ID!]!) {
          items(ids: $ids) {
            id name url created_at updated_at
            board { id }
            group { id title }
            column_values { id text type value }
          }
        }`,
        { ids }
      );
      return json?.data?.items || [];
    },

    async getItem(itemId) {
      if (overrides.getItem) return overrides.getItem(itemId);
      const json = await gql(
        `query ($ids: [ID!]!) {
          items(ids: $ids) {
            id name url created_at updated_at board { id }
            group { id title }
            column_values { id text type value }
            assets { id name file_extension file_size created_at }
            subitems {
              id name url created_at updated_at
              board { id }
              group { id title }
              parent_item { id }
              column_values { id text type value }
              assets { id name file_extension file_size created_at }
            }
          }
        }`,
        { ids: [String(itemId)] }
      );
      return json?.data?.items?.[0] || null;
    },

    async listItemUpdates(itemId) {
      if (overrides.listItemUpdates) return overrides.listItemUpdates(itemId);
      const all = [];
      for (let page = 1; page <= 50; page += 1) {
        let batch = [];
        try {
          const json = await gql(
            `query ($ids: [ID!]!, $limit: Int!, $page: Int!) {
              items(ids: $ids) {
                updates(limit: $limit, page: $page) {
                  id body text_body created_at updated_at
                  creator { id name }
                  assets { id name file_extension file_size created_at }
                  replies {
                    id body text_body created_at
                    creator { id name }
                    assets { id name file_extension file_size created_at }
                  }
                }
              }
            }`,
            { ids: [String(itemId)], limit: 50, page }
          );
          batch = json?.data?.items?.[0]?.updates || [];
        } catch (e) {
          if (page === 1) {
            const json = await gql(
              `query ($ids: [ID!]!) {
                items(ids: $ids) {
                  updates(limit: 100) {
                    id body text_body created_at updated_at
                    creator { id name }
                    assets { id name file_extension file_size created_at }
                    replies {
                      id body text_body created_at
                      creator { id name }
                      assets { id name file_extension file_size created_at }
                    }
                  }
                }
              }`,
              { ids: [String(itemId)] }
            );
            return json?.data?.items?.[0]?.updates || [];
          }
          throw e;
        }
        all.push(...batch);
        if (batch.length < 50) break;
      }
      return all;
    },

    async listItemsUpdates(itemIds) {
      if (overrides.listItemsUpdates) return overrides.listItemsUpdates(itemIds);
      const ids = [...new Set((itemIds || []).map(String).filter(Boolean))];
      const out = new Map(ids.map((id) => [id, []]));
      if (overrides.listItemUpdates) {
        for (const id of ids) out.set(id, (await overrides.listItemUpdates(id)) || []);
        return out;
      }
      if (!ids.length) return out;
      const json = await gql(
        `query ($ids: [ID!]!) {
          items(ids: $ids) {
            id
            updates(limit: 100) {
              id body text_body created_at updated_at
              creator { id name }
              assets { id name file_extension file_size created_at }
              replies {
                id body text_body created_at
                creator { id name }
                assets { id name file_extension file_size created_at }
              }
            }
          }
        }`,
        { ids }
      );
      for (const item of json?.data?.items || []) {
        out.set(String(item.id), item.updates || []);
      }
      return out;
    },

    async listUsers() {
      if (overrides.listUsers) return overrides.listUsers();
      if (stubbed) return [];
      try {
        const json = await gql(`query { users { id name email enabled is_guest } }`);
        return json?.data?.users || [];
      } catch {
        return [];
      }
    },

    async getDocs(docIds) {
      if (overrides.getDocs) return overrides.getDocs(docIds);
      const ids = [...new Set((docIds || []).map(String).filter(Boolean))];
      if (overrides.getDoc) {
        const out = [];
        for (const id of ids) out.push(await overrides.getDoc(id));
        return out;
      }
      if (!ids.length) return [];
      try {
        const json = await gql(
          `query ($ids: [ID!]!) { docs(ids: $ids) { id name url blocks { id type content } } }`,
          { ids }
        );
        return json?.data?.docs || [];
      } catch {
        return ids.map(() => ({ accessibility: "unsupported" }));
      }
    },

    async getDoc(docId) {
      if (overrides.getDoc) return overrides.getDoc(docId);
      const rows = await this.getDocs([docId]);
      return rows[0] || { accessibility: "unsupported" };
    },

    async changeColumnValues(boardId, itemId, columnValues) {
      if (overrides.changeColumnValues) return overrides.changeColumnValues(boardId, itemId, columnValues);
      const json = await gql(
        `mutation ($boardId: ID!, $itemId: ID!, $vals: JSON!) {
          change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $vals) { id }
        }`,
        { boardId: String(boardId), itemId: String(itemId), vals: JSON.stringify(columnValues) }
      );
      return json?.data?.change_multiple_column_values || null;
    },

    async createUpdate(itemId, body) {
      if (overrides.createUpdate) return overrides.createUpdate(itemId, body);
      const json = await gql(
        `mutation ($itemId: ID!, $body: String!) { create_update(item_id: $itemId, body: $body) { id body created_at } }`,
        { itemId: String(itemId), body: String(body) }
      );
      return json?.data?.create_update || null;
    }
  };
}
