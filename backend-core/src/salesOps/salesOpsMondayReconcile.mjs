/**
 * Full Monday census. Membership (unavailable) is applied only after a complete success.
 * Do not run against production Monday from agent/CI.
 */

import { SalesOpsError } from "./salesOpsPlanLifecycle.mjs";
import {
  ingestMondayItem,
  ingestUpdates,
  isMondayReadEnabled
} from "./salesOpsMondayMirror.mjs";

function schemaFromBoard(board) {
  if (!board) return {};
  return {
    boardId: board.id ? String(board.id) : null,
    name: board.name || null,
    columns: (board.columns || []).map((c) => ({
      id: String(c.id),
      title: c.title || null,
      type: c.type || null,
      settings: c.settings_str ? safeJson(c.settings_str) : c.settings || null
    })),
    groups: (board.groups || []).map((g) => ({
      id: String(g.id),
      title: g.title || null
    }))
  };
}

function safeJson(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

async function persistGroups(store, organizationId, boardId, groups) {
  for (const g of groups || []) {
    if (!g?.id) continue;
    await store.upsertMondayGroup({
      organizationId,
      mondayBoardId: String(boardId),
      mondayGroupId: String(g.id),
      title: g.title || null,
      archived: Boolean(g.archived)
    });
  }
}

async function ingestItemTree(store, monday, ctx) {
  const { organizationId, boardId, item, columnMap, schema, nowIso, subitemBoardId } = ctx;
  await ingestMondayItem(store, {
    organizationId,
    boardId,
    item,
    columnMap,
    schema,
    itemKind: "item",
    nowIso
  });
  for (const sub of item.subitems || []) {
    const subBoard = sub.board?.id || subitemBoardId || boardId;
    await ingestMondayItem(store, {
      organizationId,
      boardId: subBoard,
      item: sub,
      columnMap: {},
      schema: ctx.subitemSchema || {},
      itemKind: "subitem",
      parentMondayItemId: String(item.id),
      nowIso
    });
  }
  const updates = monday.listItemUpdates
    ? await monday.listItemUpdates(String(item.id))
    : item.updates || [];
  await ingestUpdates(store, {
    organizationId,
    boardId,
    itemId: String(item.id),
    updates
  });
}

async function enrichDocs(store, monday, organizationId) {
  if (typeof store.listMondayDocs !== "function") return;
  const docs = await store.listMondayDocs(organizationId, { limit: 500, offset: 0 });
  for (const doc of docs.rows || docs || []) {
    if (!monday.getDoc) {
      await store.upsertMondayDoc({
        ...doc,
        organizationId,
        accessibility: "unsupported"
      });
      continue;
    }
    try {
      const body = await monday.getDoc(doc.mondayDocId);
      if (body?.accessibility === "unsupported") {
        await store.upsertMondayDoc({ ...doc, organizationId, accessibility: "unsupported" });
        continue;
      }
      if (!body) {
        await store.upsertMondayDoc({ ...doc, organizationId, accessibility: "inaccessible" });
        continue;
      }
      await store.upsertMondayDoc({
        ...doc,
        organizationId,
        title: body.name || body.title || doc.title,
        sourceUrl: body.url || doc.sourceUrl || null,
        blocks: body.blocks || [],
        accessibility: "available"
      });
    } catch {
      await store.upsertMondayDoc({ ...doc, organizationId, accessibility: "inaccessible" });
    }
  }
}

export async function runFullMondayReconcile(store, monday, { organizationId, cfg, actorUserId = null, markUnseen = true } = {}) {
  if (!cfg?.accountMasterBoardId) {
    throw new SalesOpsError("Account Master List board is not configured.", 409, "configuration_needed");
  }
  if (!isMondayReadEnabled(cfg)) {
    throw new SalesOpsError("Monday read sync is disabled for this organization.", 409, "monday_read_disabled");
  }
  if (!monday) throw new SalesOpsError("Monday client is unavailable.", 503, "monday_unavailable");

  const censusStartedAt = new Date().toISOString();
  const boardId = String(cfg.accountMasterBoardId);
  const subitemBoardId = cfg.subitemBoardId ? String(cfg.subitemBoardId) : null;

  try {
    const parentBoard = await monday.inspectBoard(boardId);
    const parentSchema = schemaFromBoard(parentBoard);
    await persistGroups(store, organizationId, boardId, parentBoard?.groups || parentSchema.groups);

    let subitemSchema = {};
    if (subitemBoardId) {
      const subBoard = await monday.inspectBoard(subitemBoardId);
      subitemSchema = schemaFromBoard(subBoard);
      await persistGroups(store, organizationId, subitemBoardId, subBoard?.groups || subitemSchema.groups);
    }

    const items = await monday.listBoardItems(boardId);
    const nowIso = new Date().toISOString();
    for (const item of items || []) {
      await ingestItemTree(store, monday, {
        organizationId,
        boardId: item.board?.id || boardId,
        item,
        columnMap: cfg.columnMap || {},
        schema: parentSchema,
        subitemSchema,
        subitemBoardId,
        nowIso
      });
    }

    if (subitemBoardId && subitemBoardId !== boardId && typeof monday.listBoardItems === "function") {
      const extraSubs = await monday.listBoardItems(subitemBoardId);
      for (const sub of extraSubs || []) {
        const parentId = sub.parent_item?.id || sub.parentMondayItemId;
        if (!parentId) continue;
        await ingestMondayItem(store, {
          organizationId,
          boardId: sub.board?.id || subitemBoardId,
          item: sub,
          columnMap: {},
          schema: subitemSchema,
          itemKind: "subitem",
          parentMondayItemId: parentId,
          nowIso
        });
      }
    }

    await enrichDocs(store, monday, organizationId);

    if (markUnseen && typeof store.markUnseenMondaySourcesUnavailable === "function") {
      await store.markUnseenMondaySourcesUnavailable(organizationId, boardId, censusStartedAt);
    }

    await store.upsertMondayConfig({
      organizationId,
      boardSchema: { parent: parentSchema, subitem: subitemSchema },
      schemaInspectedAt: nowIso,
      lastFullReconcileAt: nowIso,
      lastFullSyncAt: nowIso,
      lastSuccessAt: nowIso,
      lastError: null,
      membershipHash: `census:${censusStartedAt}`
    });
    if (typeof store.upsertMondaySyncState === "function") {
      await store.upsertMondaySyncState({
        organizationId,
        mondayBoardId: boardId,
        syncMode: "full",
        lastSuccessfulReconcileAt: nowIso,
        lastCompleteCensusAt: nowIso,
        lastError: null
      });
    }
    await store.insertSyncLog({
      organizationId,
      direction: "monday_to_eliteos",
      entity: "account",
      operation: "full_reconcile",
      outcome: "success",
      actorUserId,
      metadata: { count: (items || []).length, boardId, subitemBoardId }
    });
    return { ok: true, complete: true, count: (items || []).length, columnMap: cfg.columnMap || {} };
  } catch (e) {
    const msg = String(e?.message || e);
    await store.upsertMondayConfig({ organizationId, lastError: msg.slice(0, 500) });
    if (typeof store.upsertMondaySyncState === "function") {
      await store.upsertMondaySyncState({
        organizationId,
        mondayBoardId: boardId,
        syncMode: "full",
        lastError: msg.slice(0, 500)
      });
    }
    await store.insertSyncLog({
      organizationId,
      direction: "monday_to_eliteos",
      entity: "account",
      operation: "full_reconcile",
      outcome: "error",
      error: msg.slice(0, 500),
      actorUserId
    });
    throw e;
  }
}

export async function ingestIncrementalItem(store, monday, { organizationId, cfg, itemId }) {
  const item = await monday.getItem(String(itemId));
  if (!item) return { missing: true };
  const nowIso = new Date().toISOString();
  const boardId = String(item.board?.id || cfg.accountMasterBoardId);
  await ingestItemTree(store, monday, {
    organizationId,
    boardId,
    item,
    columnMap: cfg.columnMap || {},
    schema: cfg.boardSchema?.parent || {},
    subitemSchema: cfg.boardSchema?.subitem || {},
    subitemBoardId: cfg.subitemBoardId,
    nowIso
  });
  return { missing: false, item };
}

export { schemaFromBoard };
