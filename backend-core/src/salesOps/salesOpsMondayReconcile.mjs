/**
 * Full Monday census. Membership (unavailable) is applied only after a complete success.
 * Do not run against production Monday from agent/CI unless explicitly requested.
 */

import {
  SALES_OPS_DOC_FETCH_BATCH,
  SALES_OPS_ITEM_PAGE_SIZE,
  SALES_OPS_UPDATES_ITEM_ID_BATCH
} from "./salesOpsConstants.js";
import { SalesOpsError } from "./salesOpsPlanLifecycle.mjs";
import {
  ingestMondayItem,
  ingestUpdates,
  isMondayReadEnabled,
  prepareMondayItemRows,
  prepareUpdateRows
} from "./salesOpsMondayMirror.mjs";
import {
  chunk,
  loadAdLinkMap,
  loadRepMap,
  persistGroupsBatch,
  persistPreparedItemRows,
  persistPreparedUpdateRows
} from "./salesOpsMondayBatch.mjs";
import { createReconcileProgress } from "./salesOpsMondayProgress.mjs";

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

async function* iterateBoardItemPages(monday, boardId) {
  if (typeof monday.listBoardItemsPage === "function") {
    let cursor = null;
    let page = 0;
    do {
      const result = await monday.listBoardItemsPage(boardId, cursor);
      page += 1;
      yield { items: result?.items || [], cursor: result?.cursor || null, page };
      cursor = result?.cursor || null;
    } while (cursor);
    return;
  }
  const items = typeof monday.listBoardItems === "function" ? await monday.listBoardItems(boardId) : [];
  yield { items: items || [], cursor: null, page: 1 };
}

async function loadUpdatesForItems(monday, itemIds) {
  const ids = [...new Set((itemIds || []).map(String).filter(Boolean))];
  const byItem = new Map(ids.map((id) => [id, []]));
  if (typeof monday.listItemsUpdates === "function") {
    for (const part of chunk(ids, SALES_OPS_UPDATES_ITEM_ID_BATCH)) {
      const map = await monday.listItemsUpdates(part);
      if (map instanceof Map) {
        for (const [id, updates] of map.entries()) byItem.set(String(id), updates || []);
      } else if (map && typeof map === "object") {
        for (const [id, updates] of Object.entries(map)) byItem.set(String(id), updates || []);
      }
    }
    return byItem;
  }
  if (typeof monday.listItemUpdates === "function") {
    for (const id of ids) {
      byItem.set(id, (await monday.listItemUpdates(id)) || []);
    }
  }
  return byItem;
}

async function persistDocAccess(store, rows) {
  if (typeof store.upsertMondayDocsBatch === "function") {
    await store.upsertMondayDocsBatch(rows);
    return;
  }
  for (const row of rows) await store.upsertMondayDoc(row);
}

async function enrichDocsBatched(store, monday, organizationId, progress) {
  if (typeof store.listMondayDocs !== "function") return;
  await progress?.setStage("docs");
  const docs = await store.listMondayDocs(organizationId, { limit: 500, offset: 0 });
  const rows = docs.rows || docs || [];
  if (!monday.getDocs && !monday.getDoc) {
    await persistDocAccess(
      store,
      rows.map((doc) => ({ ...doc, organizationId, accessibility: "unsupported" }))
    );
    await progress?.tick({ docsProcessed: rows.length });
    return;
  }
  let processed = 0;
  for (const part of chunk(rows, SALES_OPS_DOC_FETCH_BATCH)) {
    const ids = part.map((d) => d.mondayDocId).filter(Boolean);
    let bodies = [];
    try {
      if (typeof monday.getDocs === "function") bodies = (await monday.getDocs(ids)) || [];
      else {
        for (const id of ids) bodies.push(await monday.getDoc(id));
      }
    } catch {
      bodies = part.map(() => ({ accessibility: "inaccessible" }));
    }
    const byId = new Map();
    for (const body of bodies) {
      const id = body?.id || body?.mondayDocId;
      if (id) byId.set(String(id), body);
    }
    const upserts = part.map((doc, i) => {
      const body = byId.get(String(doc.mondayDocId)) || bodies[i] || null;
      if (!body || body.accessibility === "unsupported") {
        return { ...doc, organizationId, accessibility: "unsupported" };
      }
      if (body.accessibility === "inaccessible") {
        return { ...doc, organizationId, accessibility: "inaccessible" };
      }
      return {
        ...doc,
        organizationId,
        title: body.name || body.title || doc.title,
        sourceUrl: body.url || doc.sourceUrl || null,
        blocks: body.blocks || [],
        accessibility: "available"
      };
    });
    await persistDocAccess(store, upserts);
    processed += part.length;
    await progress?.tick({ docsProcessed: processed });
  }
}

export async function runFullMondayReconcile(store, monday, { organizationId, cfg, actorUserId = null, markUnseen = true, progress: existingProgress = null, parentBoard: existingParentBoard = null } = {}) {
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
  const progress =
    existingProgress ||
    createReconcileProgress({
      store,
      organizationId,
      mondayBoardId: boardId,
      syncMode: "full"
    });
  if (typeof monday.setHooks === "function") {
    monday.setHooks({
      onBackoff: (info) => progress.noteRateLimit(info),
      onRequest: () => progress.noteMondayRequest()
    });
  }

  try {
    await progress.start();
    await progress.setStage("schema");
    const parentBoard = existingParentBoard || (await monday.inspectBoard(boardId));
    const parentSchema = schemaFromBoard(parentBoard);
    await persistGroupsBatch(store, organizationId, boardId, parentBoard?.groups || parentSchema.groups, progress);

    let subitemSchema = {};
    if (subitemBoardId) {
      const subBoard = await monday.inspectBoard(subitemBoardId);
      subitemSchema = schemaFromBoard(subBoard);
      await persistGroupsBatch(store, organizationId, subitemBoardId, subBoard?.groups || subitemSchema.groups, progress);
    }

    await progress.setStage("users");
    if (typeof monday.listUsers === "function") {
      const users = await monday.listUsers();
      const userRows = (users || []).map((u) => ({
        organizationId,
        mondayUserId: String(u.id),
        kind: "person",
        displayName: u.name || null,
        email: u.email || null,
        lastSeenAt: censusStartedAt,
        sourceMetadata: { enabled: u.enabled !== false, isGuest: Boolean(u.is_guest) }
      }));
      if (userRows.length) {
        if (typeof store.upsertMondayUsersBatch === "function") await store.upsertMondayUsersBatch(userRows);
        else for (const row of userRows) await store.upsertMondayUser(row);
        progress.noteDbBatch(1);
      }
    }

    const repMap = await loadRepMap(store, organizationId);
    const adLinkMap = await loadAdLinkMap(store, organizationId, boardId);
    const nowIso = new Date().toISOString();
    const ctxBase = {
      organizationId,
      columnMap: cfg.columnMap || {},
      schema: parentSchema,
      nowIso,
      repMap,
      adLinkMap
    };

    await progress.setStage("parent_items", { batchSize: SALES_OPS_ITEM_PAGE_SIZE, parentProcessed: 0 });
    let parentCount = 0;
    let subitemCount = 0;
    let updatesCount = 0;
    let repliesCount = 0;
    let assetsCount = 0;

    for await (const page of iterateBoardItemPages(monday, boardId)) {
      const prepared = [];
      for (const item of page.items || []) {
        prepared.push(
          prepareMondayItemRows(item, {
            ...ctxBase,
            boardId: item.board?.id || boardId,
            itemKind: "item"
          })
        );
        for (const sub of item.subitems || []) {
          prepared.push(
            prepareMondayItemRows(sub, {
              ...ctxBase,
              boardId: sub.board?.id || subitemBoardId || boardId,
              schema: subitemSchema,
              columnMap: {},
              itemKind: "subitem",
              parentMondayItemId: String(item.id)
            })
          );
          subitemCount += 1;
        }
        parentCount += 1;
        assetsCount += (item.assets || []).length;
      }
      await progress.setStage("column_values", {
        page: page.page,
        parentProcessed: parentCount,
        subitemsProcessed: subitemCount,
        assetsProcessed: assetsCount,
        batchSize: SALES_OPS_ITEM_PAGE_SIZE
      });
      await persistPreparedItemRows(store, prepared, progress);

      await progress.setStage("updates", { page: page.page, parentProcessed: parentCount });
      const updatesByItem = await loadUpdatesForItems(
        monday,
        (page.items || []).map((i) => i.id)
      );
      const pageUpdateRows = { updateRows: [], userRows: [], assetRows: [], repliesProcessed: 0 };
      for (const item of page.items || []) {
        const updates = updatesByItem.get(String(item.id)) || [];
        const preparedUpdates = prepareUpdateRows({
          organizationId,
          boardId: item.board?.id || boardId,
          itemId: String(item.id),
          updates
        });
        pageUpdateRows.updateRows.push(...preparedUpdates.updateRows);
        pageUpdateRows.userRows.push(...preparedUpdates.userRows);
        pageUpdateRows.assetRows.push(...preparedUpdates.assetRows);
        pageUpdateRows.repliesProcessed += preparedUpdates.repliesProcessed;
      }
      updatesCount += pageUpdateRows.updateRows.length;
      repliesCount += pageUpdateRows.repliesProcessed;
      await persistPreparedUpdateRows(store, pageUpdateRows, progress);
      await progress.tick({
        parentProcessed: parentCount,
        parentTotal: parentCount,
        subitemsProcessed: subitemCount,
        updatesProcessed: updatesCount,
        repliesProcessed: repliesCount,
        projectionProcessed: parentCount,
        projectionTotal: parentCount,
        page: page.page
      });
    }

    if (subitemBoardId && subitemBoardId !== boardId) {
      await progress.setStage("subitems", { parentProcessed: parentCount });
      for await (const page of iterateBoardItemPages(monday, subitemBoardId)) {
        const extra = [];
        for (const sub of page.items || []) {
          const parentId = sub.parent_item?.id || sub.parentMondayItemId;
          if (!parentId) continue;
          extra.push(
            prepareMondayItemRows(sub, {
              ...ctxBase,
              boardId: sub.board?.id || subitemBoardId,
              schema: subitemSchema,
              columnMap: {},
              itemKind: "subitem",
              parentMondayItemId: parentId
            })
          );
        }
        await persistPreparedItemRows(store, extra, progress);
        subitemCount += extra.length;
        await progress.tick({ subitemsProcessed: subitemCount, page: page.page });
      }
    }

    await enrichDocsBatched(store, monday, organizationId, progress);

    await progress.setStage("membership_reconcile");
    if (markUnseen && typeof store.markUnseenMondaySourcesUnavailable === "function") {
      await store.markUnseenMondaySourcesUnavailable(organizationId, boardId, censusStartedAt);
    }

    const doneIso = new Date().toISOString();
    await store.upsertMondayConfig({
      organizationId,
      boardSchema: { parent: parentSchema, subitem: subitemSchema },
      schemaInspectedAt: nowIso,
      lastFullReconcileAt: doneIso,
      lastFullSyncAt: doneIso,
      lastSuccessAt: doneIso,
      lastError: null,
      membershipHash: `census:${censusStartedAt}`
    });
    const snapshot = await progress.complete({
      parentProcessed: parentCount,
      parentTotal: parentCount,
      subitemsProcessed: subitemCount,
      updatesProcessed: updatesCount,
      repliesProcessed: repliesCount,
      projectionProcessed: parentCount,
      projectionTotal: parentCount
    });
    if (typeof store.upsertMondaySyncState === "function") {
      await store.upsertMondaySyncState({
        organizationId,
        mondayBoardId: boardId,
        syncMode: "full",
        lastSuccessfulReconcileAt: doneIso,
        lastCompleteCensusAt: doneIso,
        lastError: null,
        metadata: snapshot
      });
    }
    await store.insertSyncLog({
      organizationId,
      direction: "monday_to_eliteos",
      entity: "account",
      operation: "full_reconcile",
      outcome: "success",
      actorUserId,
      metadata: {
        count: parentCount,
        boardId,
        subitemBoardId,
        runId: progress.runId,
        elapsedMs: snapshot.elapsedMs,
        mondayRequestCount: snapshot.mondayRequestCount,
        dbBatchCount: snapshot.dbBatchCount
      }
    });
    return {
      ok: true,
      complete: true,
      count: parentCount,
      columnMap: cfg.columnMap || {},
      progress: snapshot
    };
  } catch (e) {
    const msg = String(e?.message || e);
    await progress.fail(e);
    await store.upsertMondayConfig({ organizationId, lastError: msg.slice(0, 500) });
    if (typeof store.upsertMondaySyncState === "function") {
      await store.upsertMondaySyncState({
        organizationId,
        mondayBoardId: boardId,
        syncMode: "full",
        lastError: msg.slice(0, 500),
        metadata: progress.snapshot
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
  const repMap = await loadRepMap(store, organizationId);
  const adLinkMap = await loadAdLinkMap(store, organizationId, boardId);
  await ingestMondayItem(store, {
    organizationId,
    boardId,
    item,
    columnMap: cfg.columnMap || {},
    schema: cfg.boardSchema?.parent || {},
    itemKind: "item",
    nowIso,
    repMap,
    adLinkMap
  });
  for (const sub of item.subitems || []) {
    await ingestMondayItem(store, {
      organizationId,
      boardId: sub.board?.id || cfg.subitemBoardId || boardId,
      item: sub,
      columnMap: {},
      schema: cfg.boardSchema?.subitem || {},
      itemKind: "subitem",
      parentMondayItemId: String(item.id),
      nowIso,
      repMap,
      adLinkMap
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
  return { missing: false, item };
}

export { schemaFromBoard };
