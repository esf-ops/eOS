/**
 * Bounded LIGHT_ACCOUNT Monday → Sales Ops sync.
 * Parent column values + Layer B ownership only. No updates/files/docs history.
 */

import { SALES_OPS_ITEM_PAGE_SIZE } from "./salesOpsConstants.js";
import { SalesOpsError } from "./salesOpsPlanLifecycle.mjs";
import { isMondayReadEnabled, prepareMondayItemRows } from "./salesOpsMondayMirror.mjs";
import { loadAdLinkMap, loadRepMap, persistPreparedItemRows } from "./salesOpsMondayBatch.mjs";
import { createReconcileProgress } from "./salesOpsMondayProgress.mjs";

async function* iterateLightPages(monday, boardId, itemIds = null) {
  const ids = [...new Set((itemIds || []).map(String).filter(Boolean))];
  if (ids.length) {
    let page = 0;
    for (let i = 0; i < ids.length; i += SALES_OPS_ITEM_PAGE_SIZE) {
      const part = ids.slice(i, i + SALES_OPS_ITEM_PAGE_SIZE);
      page += 1;
      let items = [];
      if (typeof monday.getItemsLight === "function") {
        items = (await monday.getItemsLight(part)) || [];
      } else if (typeof monday.getItem === "function") {
        items = [];
        for (const id of part) {
          const item = await monday.getItem(id);
          if (item) items.push(item);
        }
      }
      yield { items, cursor: null, page };
    }
    return;
  }
  if (typeof monday.listBoardItemsPageLight === "function") {
    let cursor = null;
    let page = 0;
    do {
      const result = await monday.listBoardItemsPageLight(boardId, cursor);
      page += 1;
      yield { items: result?.items || [], cursor: result?.cursor || null, page };
      cursor = result?.cursor || null;
    } while (cursor);
    return;
  }
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

export async function runLightMondayAccountSync(
  store,
  monday,
  { organizationId, cfg, actorUserId = null, itemIds = null, progress: existingProgress = null } = {}
) {
  if (!cfg?.accountMasterBoardId) {
    throw new SalesOpsError("Account Master List board is not configured.", 409, "configuration_needed");
  }
  if (!isMondayReadEnabled(cfg)) {
    throw new SalesOpsError("Monday read sync is disabled for this organization.", 409, "monday_read_disabled");
  }
  if (!cfg.columnMap?.salesExecutive?.columnId) {
    throw new SalesOpsError("Sales Executive column is not mapped.", 409, "configuration_needed");
  }
  if (!monday) throw new SalesOpsError("Monday client is unavailable.", 503, "monday_unavailable");

  const boardId = String(cfg.accountMasterBoardId);
  const progress =
    existingProgress ||
    createReconcileProgress({
      store,
      organizationId,
      mondayBoardId: boardId,
      syncMode: "light"
    });
  if (typeof monday.setHooks === "function") {
    monday.setHooks({
      onBackoff: (info) => progress.noteRateLimit(info),
      onRequest: () => progress.noteMondayRequest()
    });
  }

  try {
    await progress.start();
    await progress.setStage("parent_items", { batchSize: SALES_OPS_ITEM_PAGE_SIZE, parentProcessed: 0 });
    const nowIso = new Date().toISOString();
    const [repMap, adLinkMap] = await Promise.all([
      loadRepMap(store, organizationId),
      loadAdLinkMap(store, organizationId, boardId)
    ]);
    const ctxBase = {
      organizationId,
      columnMap: cfg.columnMap || {},
      schema: cfg.boardSchema?.parent || {},
      nowIso,
      repMap,
      adLinkMap
    };

    let parentCount = 0;
    for await (const page of iterateLightPages(monday, boardId, itemIds)) {
      const prepared = [];
      for (const item of page.items || []) {
        prepared.push(
          prepareMondayItemRows(item, {
            ...ctxBase,
            boardId: item.board?.id || boardId,
            itemKind: "item"
          })
        );
        parentCount += 1;
      }
      await progress.setStage("column_values", {
        page: page.page,
        parentProcessed: parentCount,
        batchSize: SALES_OPS_ITEM_PAGE_SIZE
      });
      await persistPreparedItemRows(store, prepared, progress);
      await progress.setStage("projection", {
        page: page.page,
        parentProcessed: parentCount,
        projectionProcessed: parentCount,
        projectionTotal: parentCount
      });
      await progress.tick({
        parentProcessed: parentCount,
        parentTotal: parentCount,
        projectionProcessed: parentCount,
        projectionTotal: parentCount,
        page: page.page
      });
    }

    const doneIso = new Date().toISOString();
    await store.upsertMondayConfig({
      organizationId,
      lastSuccessAt: doneIso,
      lastError: null
    });
    const snapshot = await progress.complete({
      parentProcessed: parentCount,
      parentTotal: parentCount,
      projectionProcessed: parentCount,
      projectionTotal: parentCount
    });
    if (typeof store.upsertMondaySyncState === "function") {
      await store.upsertMondaySyncState({
        organizationId,
        mondayBoardId: boardId,
        syncMode: "light",
        lastSuccessfulReconcileAt: doneIso,
        lastError: null,
        metadata: snapshot
      });
    }
    await store.insertSyncLog({
      organizationId,
      direction: "monday_to_eliteos",
      entity: "account",
      operation: "light_account_sync",
      outcome: "success",
      actorUserId,
      metadata: {
        count: parentCount,
        boardId,
        runId: progress.runId,
        elapsedMs: snapshot.elapsedMs,
        mondayRequestCount: snapshot.mondayRequestCount,
        dbBatchCount: snapshot.dbBatchCount,
        targeted: Boolean(itemIds?.length)
      }
    });
    return {
      ok: true,
      complete: true,
      jobType: "light",
      scheduleType: "LIGHT_ACCOUNT",
      count: parentCount,
      progress: snapshot,
      writeEnabled: false
    };
  } catch (e) {
    const msg = String(e?.message || e);
    await progress.fail(e);
    await store.upsertMondayConfig({ organizationId, lastError: msg.slice(0, 500) });
    if (typeof store.upsertMondaySyncState === "function") {
      await store.upsertMondaySyncState({
        organizationId,
        mondayBoardId: boardId,
        syncMode: "light",
        lastError: msg.slice(0, 500),
        metadata: progress.snapshot
      });
    }
    await store.insertSyncLog({
      organizationId,
      direction: "monday_to_eliteos",
      entity: "account",
      operation: "light_account_sync",
      outcome: "error",
      error: msg.slice(0, 500),
      actorUserId
    });
    throw e;
  }
}
