/**
 * Batched Layer A persist + Layer B reprojection.
 * Call counts scale by page/chunk, not by account.
 */

import {
  SALES_OPS_ACCOUNT_UPSERT_BATCH,
  SALES_OPS_ASSET_UPSERT_BATCH,
  SALES_OPS_COLUMN_UPSERT_BATCH,
  SALES_OPS_DOC_UPSERT_BATCH,
  SALES_OPS_EAV_ITEM_ID_BATCH,
  SALES_OPS_GROUP_UPSERT_BATCH,
  SALES_OPS_ITEM_UPSERT_BATCH,
  SALES_OPS_UPDATE_UPSERT_BATCH,
  SALES_OPS_USER_UPSERT_BATCH
} from "./salesOpsConstants.js";
import { buildAccountProjectionRow } from "./salesOpsMondayMirror.mjs";

export function chunk(arr, size) {
  const out = [];
  const n = Math.max(1, Number(size) || 100);
  const list = Array.isArray(arr) ? arr : [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

function dedupeLastWins(rows, keyFn) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row) continue;
    const key = keyFn(row);
    if (!key) continue;
    map.set(key, row);
  }
  return [...map.values()];
}

async function persistRows(store, batchName, singleName, rows, batchSize) {
  const list = (rows || []).filter(Boolean);
  if (!list.length) return 0;
  if (typeof store[batchName] === "function") {
    let batches = 0;
    for (const part of chunk(list, batchSize)) {
      await store[batchName](part);
      batches += 1;
    }
    return batches;
  }
  for (const row of list) await store[singleName](row);
  return list.length;
}

export async function persistPreparedItemRows(store, preparedList, progress = null) {
  const items = [];
  const columns = [];
  const users = [];
  const assets = [];
  const docs = [];
  const accounts = [];
  for (const p of preparedList || []) {
    if (p.itemRow) items.push(p.itemRow);
    if (p.columnRows?.length) columns.push(...p.columnRows);
    if (p.userRows?.length) users.push(...p.userRows);
    if (p.assetRows?.length) assets.push(...p.assetRows);
    if (p.docRows?.length) docs.push(...p.docRows);
    if (p.accountRow) {
      const row = { ...p.accountRow };
      delete row._needsRepLookup;
      delete row._needsAdLookup;
      accounts.push(row);
    }
  }
  const uniqueItems = dedupeLastWins(
    items,
    (r) => `${r.organizationId}:${r.mondayBoardId}:${r.mondayItemId}`
  );
  const uniqueColumns = dedupeLastWins(
    columns,
    (r) => `${r.organizationId}:${r.mondayBoardId}:${r.mondayItemId}:${r.columnId}`
  );
  const uniqueUsers = dedupeLastWins(users, (r) => `${r.organizationId}:${r.mondayUserId}`);
  const uniqueAssets = dedupeLastWins(
    assets,
    (r) => `${r.organizationId}:${r.mondayAssetId || r.mondayBoardId}:${r.mondayItemId || ""}:${r.filename || ""}`
  );
  const uniqueDocs = dedupeLastWins(docs, (r) => `${r.organizationId}:${r.mondayDocId}:${r.mondayItemId || ""}`);
  const uniqueAccounts = dedupeLastWins(
    accounts,
    (r) => `${r.organizationId}:${r.mondayBoardId}:${r.mondayItemId}`
  );
  let batches = 0;
  batches += await persistRows(store, "upsertMondayItemsBatch", "upsertMondayItem", uniqueItems, SALES_OPS_ITEM_UPSERT_BATCH);
  batches += await persistRows(
    store,
    "upsertMondayColumnValuesBatch",
    "upsertMondayColumnValue",
    uniqueColumns,
    SALES_OPS_COLUMN_UPSERT_BATCH
  );
  batches += await persistRows(store, "upsertMondayUsersBatch", "upsertMondayUser", uniqueUsers, SALES_OPS_USER_UPSERT_BATCH);
  batches += await persistRows(store, "upsertMondayAssetsBatch", "upsertMondayAsset", uniqueAssets, SALES_OPS_ASSET_UPSERT_BATCH);
  batches += await persistRows(store, "upsertMondayDocsBatch", "upsertMondayDoc", uniqueDocs, SALES_OPS_DOC_UPSERT_BATCH);
  batches += await persistRows(store, "upsertAccountsBatch", "upsertAccount", uniqueAccounts, SALES_OPS_ACCOUNT_UPSERT_BATCH);
  progress?.noteDbBatch(batches);
  return {
    items: items.length,
    columns: columns.length,
    accounts: accounts.length,
    batches
  };
}

export async function persistPreparedUpdateRows(store, prepared, progress = null) {
  let batches = 0;
  const uniqueUsers = dedupeLastWins(prepared.userRows, (r) => `${r.organizationId}:${r.mondayUserId}`);
  batches += await persistRows(
    store,
    "upsertMondayUpdatesBatch",
    "upsertMondayUpdate",
    prepared.updateRows,
    SALES_OPS_UPDATE_UPSERT_BATCH
  );
  batches += await persistRows(
    store,
    "upsertMondayUsersBatch",
    "upsertMondayUser",
    uniqueUsers,
    SALES_OPS_USER_UPSERT_BATCH
  );
  batches += await persistRows(
    store,
    "upsertMondayAssetsBatch",
    "upsertMondayAsset",
    prepared.assetRows,
    SALES_OPS_ASSET_UPSERT_BATCH
  );
  progress?.noteDbBatch(batches);
  return { updates: prepared.updateRows?.length || 0, replies: prepared.repliesProcessed || 0, batches };
}

export async function persistGroupsBatch(store, organizationId, boardId, groups, progress = null) {
  const rows = (groups || [])
    .filter((g) => g?.id)
    .map((g) => ({
      organizationId,
      mondayBoardId: String(boardId),
      mondayGroupId: String(g.id),
      title: g.title || null,
      archived: Boolean(g.archived)
    }));
  const batches = await persistRows(store, "upsertMondayGroupsBatch", "upsertMondayGroup", rows, SALES_OPS_GROUP_UPSERT_BATCH);
  progress?.noteDbBatch(batches);
  return batches;
}

export async function loadRepMap(store, organizationId) {
  if (typeof store.listRepMappings === "function") {
    const rows = await store.listRepMappings(organizationId);
    return new Map((rows || []).filter((r) => r.active !== false).map((r) => [String(r.mondayUserId), r.userId]));
  }
  return new Map();
}

export async function loadAdLinkMap(store, organizationId, boardId) {
  if (typeof store.listMondayAccountDirectoryLinks === "function") {
    const rows = await store.listMondayAccountDirectoryLinks(organizationId, boardId);
    return new Map((rows || []).map((r) => [String(r.mondayItemId), r.accountId]));
  }
  return new Map();
}

export function itemFromMirrorRow(row) {
  return {
    id: row.mondayItemId,
    mondayItemId: row.mondayItemId,
    name: row.itemName,
    itemName: row.itemName,
    url: row.mondayUrl,
    mondayUrl: row.mondayUrl,
    group: { id: row.groupId, title: row.groupTitle },
    groupId: row.groupId,
    groupTitle: row.groupTitle,
    created_at: row.mondayCreatedAt,
    updated_at: row.mondayUpdatedAt,
    mondayCreatedAt: row.mondayCreatedAt,
    mondayUpdatedAt: row.mondayUpdatedAt,
    description: row.description,
    sourceState: row.sourceState
  };
}

export async function reprojectAccountsFromMirror(store, { organizationId, cfg, mondayPersonIds = null, progress = null } = {}) {
  const boardId = String(cfg.accountMasterBoardId);
  const columnMap = cfg.columnMap || {};
  const nowIso = new Date().toISOString();
  const started = Date.now();
  const repMap = await loadRepMap(store, organizationId);
  const adLinkMap = await loadAdLinkMap(store, organizationId, boardId);
  const items = await store.listMondayItems(organizationId, { boardId, itemKind: "item" });
  const wantedPeople = mondayPersonIds ? new Set([...mondayPersonIds].map(String)) : null;
  const parents = (items || []).filter((row) => {
    if ((row.sourceState || "active") === "unavailable") return false;
    return true;
  });
  progress?.tick?.({ projectionTotal: parents.length, projectionProcessed: 0, batchSize: SALES_OPS_ACCOUNT_UPSERT_BATCH });

  const eavByItem = new Map();
  const itemIds = parents.map((r) => String(r.mondayItemId));
  if (typeof store.listMondayColumnValuesForItems === "function") {
    const rows = await store.listMondayColumnValuesForItems(organizationId, itemIds, {
      chunkSize: SALES_OPS_EAV_ITEM_ID_BATCH
    });
    for (const rec of rows || []) {
      const id = String(rec.mondayItemId);
      if (!eavByItem.has(id)) eavByItem.set(id, []);
      eavByItem.get(id).push(rec);
    }
  } else {
    for (const row of parents) {
      const cols = await store.listMondayColumnValues(organizationId, boardId, row.mondayItemId);
      eavByItem.set(String(row.mondayItemId), cols);
    }
  }

  const accountRows = [];
  let processed = 0;
  for (const row of parents) {
    const records = eavByItem.get(String(row.mondayItemId)) || [];
    const item = itemFromMirrorRow(row);
    const projected = buildAccountProjectionRow({
      organizationId,
      boardId,
      item,
      columnMap,
      records,
      nowIso,
      assignedUserId: null,
      accountDirectoryAccountId: adLinkMap.get(String(row.mondayItemId)) || null
    });
    if (wantedPeople && projected.mondayAssignedUserId && !wantedPeople.has(String(projected.mondayAssignedUserId))) {
      processed += 1;
      continue;
    }
    if (wantedPeople && !projected.mondayAssignedUserId) {
      processed += 1;
      continue;
    }
    projected.assignedUserId = projected.mondayAssignedUserId
      ? repMap.get(String(projected.mondayAssignedUserId)) || null
      : null;
    accountRows.push(projected);
    processed += 1;
  }

  const batches = await persistRows(
    store,
    "upsertAccountsBatch",
    "upsertAccount",
    accountRows,
    SALES_OPS_ACCOUNT_UPSERT_BATCH
  );
  progress?.noteDbBatch(batches);
  await progress?.tick?.({
    projectionProcessed: processed,
    projectionTotal: parents.length,
    batchSize: SALES_OPS_ACCOUNT_UPSERT_BATCH
  });
  return {
    ok: true,
    mode: "reproject",
    parents: parents.length,
    written: accountRows.length,
    assignedEliteOsUsers: accountRows.filter((r) => r.assignedUserId).length,
    unmappedMondayPeopleRows: accountRows.filter((r) => r.mondayAssignedUserId && !r.assignedUserId).length,
    elapsedMs: Date.now() - started,
    accountUpsertChunks: batches
  };
}
