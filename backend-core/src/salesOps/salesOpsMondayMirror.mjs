/**
 * Sales Ops Monday Layer A ingest + governed DTOs.
 * Browser never receives source_snapshot, raw_columns, tokens, or private asset URLs.
 */

import {
  SALES_OPS_ACCOUNT_LIST_DEFAULT_LIMIT,
  SALES_OPS_ACCOUNT_LIST_MAX_LIMIT,
  SALES_OPS_HEAVY_DEFAULT_LIMIT,
  SALES_OPS_HEAVY_MAX_LIMIT,
  SALES_OPS_MONDAY_EXTERNAL_SYSTEM,
  mondayExternalId
} from "./salesOpsConstants.js";

const FORBIDDEN_DTO_KEYS = new Set([
  "rawColumns",
  "raw_columns",
  "sourceSnapshot",
  "source_snapshot",
  "source_metadata",
  "sourceMetadata",
  "lastEliteosMutationHash",
  "lastEliteosMutationAt",
  "blocks"
]);

export function isMondayReadEnabled(cfg) {
  if (!cfg) return false;
  if (cfg.readEnabled === false) return false;
  return true;
}

export function isMondayWriteEnabled(cfg) {
  if (!cfg) return false;
  if (cfg.writeEnabled === true) return true;
  if (cfg.writeEnabled === false) return false;
  return cfg.enabled === true;
}

export function parseJsonValue(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function parsePeopleAssignments(col) {
  const parsed = parseJsonValue(col?.value);
  const pts = parsed?.personsAndTeams;
  if (!Array.isArray(pts)) return [];
  return pts
    .map((p) => ({
      id: String(p.id ?? ""),
      kind: String(p.kind || "person").toLowerCase() === "team" ? "team" : "person"
    }))
    .filter((p) => p.id);
}

export function parseColumnRecord(col, titleById = {}) {
  const columnId = String(col?.id ?? "");
  const parsed = parseJsonValue(col?.value);
  return {
    columnId,
    columnTitle: titleById[columnId] || col?.title || null,
    columnType: col?.type ? String(col.type) : null,
    displayText: col?.text == null ? null : String(col.text),
    value: parsed === undefined ? null : parsed
  };
}

export function resolveItemDescription(item, records = []) {
  if (item?.description != null) return item.description;
  const rec = records.find((r) => {
    const title = String(r.columnTitle || "").toLowerCase();
    const type = String(r.columnType || "").toLowerCase();
    return title === "description" || title === "item description" || (type.includes("long") && title.includes("description"));
  });
  return rec ? rec.displayText : null;
}

export function governedColumnDto(row) {
  const type = String(row.columnType || row.column_type || "").toLowerCase();
  const value = row.value;
  const normalized = {};
  if (type.includes("people") || type === "person") {
    normalized.assignments = parsePeopleAssignments({ value });
  } else if (type.includes("date")) {
    normalized.date = value?.date || (row.displayText && /^\d{4}-\d{2}-\d{2}/.test(row.displayText) ? String(row.displayText).slice(0, 10) : null);
  } else if (type.includes("checkbox") || type === "boolean") {
    normalized.checked = Boolean(value?.checked === true || value?.checked === "true" || row.displayText === "true" || row.displayText === "v");
  } else if (type.includes("status") || type === "color") {
    normalized.label = value?.label || row.displayText;
    normalized.index = value?.index ?? null;
  } else if (type.includes("dropdown")) {
    normalized.ids = value?.ids || value?.chosenValues || null;
    normalized.label = row.displayText;
  } else if (type.includes("location")) {
    normalized.address = value?.address || row.displayText;
    normalized.lat = value?.lat ?? null;
    normalized.lng = value?.lng ?? null;
  } else if (type.includes("numeric") || type === "numbers") {
    const n = Number(row.displayText ?? value);
    normalized.number = Number.isFinite(n) ? n : null;
  } else if (type.includes("link") || type === "email" || type === "phone") {
    normalized.text = row.displayText;
  }
  return {
    columnId: row.columnId || row.column_id,
    title: row.columnTitle || row.column_title || null,
    type: row.columnType || row.column_type || null,
    text: row.displayText ?? row.display_text ?? null,
    normalized
  };
}

export function toAccountListDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    accountDirectoryAccountId: row.accountDirectoryAccountId ?? null,
    mondayItemId: row.mondayItemId ? String(row.mondayItemId) : null,
    accountName: row.accountName,
    status: row.status ?? null,
    lastContact: row.lastContact ?? null,
    nextContact: row.nextContact ?? null,
    market: row.market ?? null,
    branch: row.branch ?? null,
    mondayUrl: row.mondayUrl ?? null,
    assignedUserId: row.assignedUserId ?? null,
    sourceState: row.sourceState || (row.archived ? "archived" : "active"),
    syncedAt: row.syncedAt ?? null
  };
}

export function toAccountDetailDto(row, { columns = [], description = null } = {}) {
  const list = toAccountListDto(row);
  return {
    ...list,
    accountType: row.accountType ?? null,
    sampleProgram: row.sampleProgram ?? null,
    currentPrimarySupplier: row.currentPrimarySupplier ?? null,
    primaryPainPoint: row.primaryPainPoint ?? null,
    esfSolution: row.esfSolution ?? null,
    nextStrategicMilestone: row.nextStrategicMilestone ?? null,
    targetSqFtPerMonth: row.targetSqFtPerMonth ?? null,
    keyContact: row.keyContact ?? null,
    estKitchensPerMonth: row.estKitchensPerMonth ?? null,
    mondayBoardId: row.mondayBoardId,
    mondayItemId: row.mondayItemId,
    mondayGroup: row.mondayGroup ?? null,
    groupId: row.groupId ?? null,
    mondayAssignedUserId: row.mondayAssignedUserId ?? null,
    mondayCreatedAt: row.mondayCreatedAt ?? null,
    mondayUpdatedAt: row.mondayUpdatedAt ?? null,
    lastSeenAt: row.lastSeenAt ?? null,
    description: description ?? row.description ?? null,
    columns: columns.map(governedColumnDto)
  };
}

export function toUpdateDto(row) {
  return {
    id: row.id,
    mondayUpdateId: row.mondayUpdateId,
    parentMondayUpdateId: row.parentMondayUpdateId ?? null,
    creatorMondayId: row.creatorMondayId ?? null,
    creatorName: row.creatorName ?? null,
    bodyText: row.bodyText ?? null,
    mondayCreatedAt: row.mondayCreatedAt ?? null
  };
}

export function toAssetDto(row) {
  return {
    id: row.id,
    mondayAssetId: row.mondayAssetId,
    filename: row.filename ?? null,
    fileExtension: row.fileExtension ?? null,
    fileSize: row.fileSize ?? null,
    associatedKind: row.associatedKind,
    mondayItemId: row.mondayItemId ?? null,
    mondayUpdateId: row.mondayUpdateId ?? null
  };
}

export function toDocDto(row) {
  return {
    id: row.id,
    mondayDocId: row.mondayDocId,
    title: row.title ?? null,
    columnId: row.columnId ?? null,
    accessibility: row.accessibility || "unknown",
    sourceUrl: row.sourceUrl ?? null
  };
}

export function toSubitemDto(item, columns = []) {
  return {
    id: item.id,
    mondayItemId: item.mondayItemId,
    mondayBoardId: item.mondayBoardId,
    parentMondayItemId: item.parentMondayItemId,
    name: item.itemName,
    sourceState: item.sourceState,
    mondayUrl: item.mondayUrl ?? null,
    columns: columns.map(governedColumnDto)
  };
}

export function assertNoForbiddenDto(obj, path = "dto") {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => assertNoForbiddenDto(v, `${path}[${i}]`));
    return;
  }
  for (const key of Object.keys(obj)) {
    if (FORBIDDEN_DTO_KEYS.has(key)) {
      throw new Error(`Forbidden field "${key}" leaked in ${path}`);
    }
    if (key === "value" && path.includes("columns")) {
      throw new Error(`Forbidden field "value" leaked in ${path}`);
    }
    const v = obj[key];
    if (v && typeof v === "object") assertNoForbiddenDto(v, `${path}.${key}`);
  }
}

export function parseListLimit(raw, fallback = SALES_OPS_ACCOUNT_LIST_DEFAULT_LIMIT, max = SALES_OPS_ACCOUNT_LIST_MAX_LIMIT) {
  const n = Number.parseInt(String(raw ?? fallback), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, n));
}

export function parseHeavyLimit(raw) {
  return parseListLimit(raw, SALES_OPS_HEAVY_DEFAULT_LIMIT, SALES_OPS_HEAVY_MAX_LIMIT);
}

export function encodeListCursor(accountName, id) {
  return Buffer.from(JSON.stringify({ n: accountName, i: id }), "utf8").toString("base64url");
}

export function decodeListCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
    if (!parsed?.i) return null;
    return { n: String(parsed.n || ""), i: String(parsed.i) };
  } catch {
    return null;
  }
}

export function encodeOffsetCursor(offset) {
  return Buffer.from(JSON.stringify({ o: Number(offset) || 0 }), "utf8").toString("base64url");
}

export function decodeOffsetCursor(cursor) {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor), "base64url").toString("utf8"));
    const o = Number(parsed?.o);
    return Number.isFinite(o) && o >= 0 ? o : 0;
  } catch {
    return 0;
  }
}

export function mondayUpdatedMs(iso) {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function shouldSkipStaleIncoming(existingIso, incomingIso) {
  const prev = mondayUpdatedMs(existingIso);
  const next = mondayUpdatedMs(incomingIso);
  if (!prev || !next) return false;
  return next < prev;
}

function titleMapFromSchema(schema) {
  const out = {};
  for (const col of schema?.columns || []) {
    if (col?.id) out[String(col.id)] = col.title || null;
  }
  return out;
}

function semanticText(columnMap, recordsById, semantic) {
  const colId = columnMap?.[semantic]?.columnId;
  if (!colId) return null;
  const rec = recordsById.get(colId);
  if (!rec) return null;
  const t = rec.displayText;
  if (t == null || String(t).trim() === "") return t === "" ? null : null;
  return String(t).trim();
}

export function projectParentFields(item, columnMap, records) {
  const byId = new Map(records.map((r) => [r.columnId, r]));
  const peopleColId = columnMap?.salesExecutive?.columnId;
  const peopleRec = peopleColId ? byId.get(peopleColId) : null;
  const assignments = peopleRec ? parsePeopleAssignments({ value: peopleRec.value }) : [];
  const primaryPerson = assignments.find((a) => a.kind === "person") || assignments[0] || null;
  const kitchens = semanticText(columnMap, byId, "estKitchensPerMonth");
  const target = semanticText(columnMap, byId, "targetSqFtPerMonth");
  return {
    accountName: String(item.name || item.itemName || "").trim(),
    mondayUrl: item.url || item.mondayUrl || null,
    mondayGroup: item.group?.title || item.groupTitle || null,
    groupId: item.group?.id || item.groupId || null,
    mondayAssignedUserId: primaryPerson?.id || null,
    status: semanticText(columnMap, byId, "status"),
    lastContact: semanticText(columnMap, byId, "lastContact"),
    nextContact: semanticText(columnMap, byId, "nextContact"),
    market: semanticText(columnMap, byId, "market"),
    branch: semanticText(columnMap, byId, "branch"),
    accountType: semanticText(columnMap, byId, "accountType"),
    sampleProgram: semanticText(columnMap, byId, "sampleProgram"),
    currentPrimarySupplier: semanticText(columnMap, byId, "currentPrimarySupplier"),
    primaryPainPoint: semanticText(columnMap, byId, "primaryPainPoint"),
    esfSolution: semanticText(columnMap, byId, "esfSolution"),
    nextStrategicMilestone: semanticText(columnMap, byId, "nextStrategicMilestone"),
    targetSqFtPerMonth: target != null && target !== "" ? Number(target) : null,
    keyContact: semanticText(columnMap, byId, "keyContact"),
    estKitchensPerMonth: kitchens != null && kitchens !== "" ? Number(kitchens) : null,
    description: item.description ?? item.description_html ?? null,
    mondayCreatedAt: item.created_at || item.mondayCreatedAt || null,
    mondayUpdatedAt: item.updated_at || item.mondayUpdatedAt || null,
    peopleAssignments: assignments
  };
}

export function extractDocIds(records) {
  const out = [];
  for (const rec of records) {
    const type = String(rec.columnType || "").toLowerCase();
    if (!type.includes("doc") && type !== "direct_doc") continue;
    const v = rec.value;
    const docId = v?.files?.[0]?.objectId || v?.file_id || v?.docId || v?.id || rec.displayText;
    if (docId) out.push({ columnId: rec.columnId, mondayDocId: String(docId) });
  }
  return out;
}

export function extractFileAssets(item, records, boardId) {
  const assets = [];
  for (const a of item?.assets || []) {
    assets.push({
      mondayAssetId: String(a.id),
      filename: a.name || a.original_geometry || null,
      fileExtension: a.file_extension || null,
      fileSize: a.file_size == null ? null : Number(a.file_size),
      associatedKind: "item",
      mondayItemId: String(item.id),
      mondayBoardId: String(boardId),
      mondayCreatedAt: a.created_at || null,
      sourceMetadata: { name: a.name || null }
    });
  }
  for (const rec of records) {
    const type = String(rec.columnType || "").toLowerCase();
    if (!type.includes("file")) continue;
    const files = rec.value?.files || rec.value?.assets || [];
    for (const f of files) {
      const id = f.assetId || f.asset_id || f.id;
      if (!id) continue;
      assets.push({
        mondayAssetId: String(id),
        filename: f.name || null,
        fileExtension: null,
        fileSize: f.fileSize || f.size || null,
        associatedKind: "column",
        columnId: rec.columnId,
        mondayItemId: String(item.id),
        mondayBoardId: String(boardId),
        sourceMetadata: { columnId: rec.columnId }
      });
    }
  }
  return assets;
}

export function prepareMondayItemRows(item, ctx) {
  const {
    organizationId,
    boardId,
    columnMap = {},
    schema = {},
    itemKind = "item",
    parentMondayItemId = null,
    nowIso = new Date().toISOString(),
    repMap = null,
    adLinkMap = null
  } = ctx;
  const titleById = titleMapFromSchema(schema);
  const records = (item.column_values || []).map((c) => parseColumnRecord(c, titleById));
  const snapshot = {
    id: item.id,
    name: item.name,
    url: item.url || null,
    created_at: item.created_at || null,
    updated_at: item.updated_at || null,
    group: item.group || null,
    description: item.description ?? null
  };
  const itemRow = {
    organizationId,
    mondayBoardId: String(boardId),
    mondayItemId: String(item.id),
    parentMondayItemId: parentMondayItemId ? String(parentMondayItemId) : null,
    itemKind,
    itemName: String(item.name || ""),
    groupId: item.group?.id || null,
    groupTitle: item.group?.title || null,
    mondayUrl: item.url || null,
    description: resolveItemDescription(item, records),
    mondayCreatedAt: item.created_at || null,
    mondayUpdatedAt: item.updated_at || null,
    sourceState: "active",
    lastSeenAt: nowIso,
    sourceSnapshot: snapshot
  };
  const columnRows = records
    .filter((rec) => rec.columnId)
    .map((rec) => ({
      organizationId,
      mondayBoardId: String(boardId),
      mondayItemId: String(item.id),
      columnId: rec.columnId,
      columnTitle: rec.columnTitle,
      columnType: rec.columnType,
      displayText: rec.displayText,
      value: rec.value,
      mondayUpdatedAt: item.updated_at || null
    }));
  const userRows = records.flatMap((r) => parsePeopleAssignments({ value: r.value })).map((person) => ({
    organizationId,
    mondayUserId: person.id,
    kind: person.kind,
    lastSeenAt: nowIso
  }));
  const assetRows = extractFileAssets(item, records, boardId).map((asset) => ({
    organizationId,
    ...asset,
    associatedKind: itemKind === "subitem" && asset.associatedKind === "item" ? "subitem" : asset.associatedKind
  }));
  const docRows = extractDocIds(records).map((doc) => ({
    organizationId,
    mondayBoardId: String(boardId),
    mondayItemId: String(item.id),
    columnId: doc.columnId,
    mondayDocId: doc.mondayDocId,
    accessibility: "unknown",
    blocks: []
  }));
  let accountRow = null;
  if (itemKind === "item") {
    const projected = projectParentFields(item, columnMap, records);
    const mappedUserId = projected.mondayAssignedUserId && repMap instanceof Map
      ? repMap.get(String(projected.mondayAssignedUserId)) || null
      : undefined;
    const linkedAccountId = adLinkMap instanceof Map ? adLinkMap.get(String(item.id)) || null : undefined;
    accountRow = {
      organizationId,
      mondayBoardId: String(boardId),
      mondayItemId: String(item.id),
      accountName: projected.accountName,
      mondayUrl: projected.mondayUrl,
      mondayGroup: projected.mondayGroup,
      groupId: projected.groupId,
      mondayAssignedUserId: projected.mondayAssignedUserId,
      assignedUserId: mappedUserId,
      accountDirectoryAccountId: linkedAccountId,
      status: projected.status,
      lastContact: projected.lastContact,
      nextContact: projected.nextContact,
      market: projected.market,
      branch: projected.branch,
      accountType: projected.accountType,
      sampleProgram: projected.sampleProgram,
      currentPrimarySupplier: projected.currentPrimarySupplier,
      primaryPainPoint: projected.primaryPainPoint,
      esfSolution: projected.esfSolution,
      nextStrategicMilestone: projected.nextStrategicMilestone,
      targetSqFtPerMonth: Number.isFinite(projected.targetSqFtPerMonth) ? projected.targetSqFtPerMonth : null,
      keyContact: projected.keyContact,
      estKitchensPerMonth: Number.isFinite(projected.estKitchensPerMonth) ? projected.estKitchensPerMonth : null,
      description: resolveItemDescription(item, records),
      mondayCreatedAt: projected.mondayCreatedAt,
      mondayUpdatedAt: projected.mondayUpdatedAt,
      lastSeenAt: nowIso,
      sourceState: "active",
      archived: false,
      syncedAt: nowIso,
      _needsRepLookup: mappedUserId === undefined && Boolean(projected.mondayAssignedUserId),
      _needsAdLookup: linkedAccountId === undefined
    };
  }
  return { records, itemRow, columnRows, userRows, assetRows, docRows, accountRow };
}

export function prepareUpdateRows({ organizationId, boardId, itemId, updates }) {
  const updateRows = [];
  const userRows = [];
  const assetRows = [];
  let repliesProcessed = 0;
  function walk(list, parentId = null) {
    for (const u of list || []) {
      if (!u?.id) continue;
      updateRows.push({
        organizationId,
        mondayBoardId: String(boardId),
        mondayItemId: String(itemId),
        mondayUpdateId: String(u.id),
        parentMondayUpdateId: parentId,
        creatorMondayId: u.creator?.id ? String(u.creator.id) : null,
        creatorName: u.creator?.name || null,
        bodyText: u.text_body || u.body || null,
        bodyHtml: u.body || null,
        mondayCreatedAt: u.created_at || null,
        mondayUpdatedAt: u.updated_at || null,
        sourceMetadata: { hasReplies: Array.isArray(u.replies) && u.replies.length > 0 }
      });
      if (parentId) repliesProcessed += 1;
      if (u.creator?.id) {
        userRows.push({
          organizationId,
          mondayUserId: String(u.creator.id),
          kind: "person",
          displayName: u.creator.name || null
        });
      }
      for (const a of u.assets || []) {
        if (!a?.id) continue;
        assetRows.push({
          organizationId,
          mondayBoardId: String(boardId),
          mondayItemId: String(itemId),
          mondayUpdateId: String(u.id),
          mondayAssetId: String(a.id),
          filename: a.name || null,
          fileExtension: a.file_extension || null,
          fileSize: a.file_size == null ? null : Number(a.file_size),
          associatedKind: parentId ? "reply" : "update",
          sourceMetadata: { name: a.name || null }
        });
      }
      if (Array.isArray(u.replies) && u.replies.length) walk(u.replies, String(u.id));
    }
  }
  walk(updates, null);
  return { updateRows, userRows, assetRows, repliesProcessed };
}

export function buildAccountProjectionRow({
  organizationId,
  boardId,
  item,
  columnMap,
  records,
  nowIso,
  assignedUserId = null,
  accountDirectoryAccountId = null
}) {
  const projected = projectParentFields(item, columnMap, records);
  return {
    organizationId,
    mondayBoardId: String(boardId),
    mondayItemId: String(item.id || item.mondayItemId),
    accountName: projected.accountName,
    mondayUrl: projected.mondayUrl,
    mondayGroup: projected.mondayGroup,
    groupId: projected.groupId,
    mondayAssignedUserId: projected.mondayAssignedUserId,
    assignedUserId,
    accountDirectoryAccountId,
    status: projected.status,
    lastContact: projected.lastContact,
    nextContact: projected.nextContact,
    market: projected.market,
    branch: projected.branch,
    accountType: projected.accountType,
    sampleProgram: projected.sampleProgram,
    currentPrimarySupplier: projected.currentPrimarySupplier,
    primaryPainPoint: projected.primaryPainPoint,
    esfSolution: projected.esfSolution,
    nextStrategicMilestone: projected.nextStrategicMilestone,
    targetSqFtPerMonth: Number.isFinite(projected.targetSqFtPerMonth) ? projected.targetSqFtPerMonth : null,
    keyContact: projected.keyContact,
    estKitchensPerMonth: Number.isFinite(projected.estKitchensPerMonth) ? projected.estKitchensPerMonth : null,
    description: resolveItemDescription(item, records),
    mondayCreatedAt: projected.mondayCreatedAt,
    mondayUpdatedAt: projected.mondayUpdatedAt,
    lastSeenAt: nowIso,
    sourceState: item.sourceState || "active",
    archived: false,
    syncedAt: nowIso
  };
}

export async function ingestMondayItem(store, ctx) {
  const {
    organizationId,
    boardId,
    item,
    nowIso = new Date().toISOString()
  } = ctx;
  const prepared = prepareMondayItemRows(item, { ...ctx, nowIso });
  const existingItem = await store.getMondayItem(organizationId, boardId, String(item.id));
  const incomingUpdated = item.updated_at || item.mondayUpdatedAt;
  if (existingItem && shouldSkipStaleIncoming(existingItem.mondayUpdatedAt, incomingUpdated)) {
    return { skippedStale: true, item: existingItem, records: prepared.records };
  }

  const mirrored = await store.upsertMondayItem(prepared.itemRow);
  if (typeof store.upsertMondayColumnValuesBatch === "function") {
    await store.upsertMondayColumnValuesBatch(prepared.columnRows);
  } else {
    for (const row of prepared.columnRows) await store.upsertMondayColumnValue(row);
  }
  for (const row of prepared.userRows) await store.upsertMondayUser(row);
  for (const row of prepared.assetRows) await store.upsertMondayAsset(row);
  for (const row of prepared.docRows) await store.upsertMondayDoc(row);

  if (prepared.accountRow) {
    const accountRow = { ...prepared.accountRow };
    if (accountRow._needsRepLookup) {
      const mapping = await store.getRepMappingByMondayUser(organizationId, accountRow.mondayAssignedUserId);
      accountRow.assignedUserId = mapping?.userId ?? null;
    }
    if (accountRow._needsAdLookup) {
      const link =
        typeof store.getMondayAccountDirectoryLink === "function"
          ? await store.getMondayAccountDirectoryLink(organizationId, boardId, String(item.id))
          : null;
      accountRow.accountDirectoryAccountId = link?.accountId ?? null;
    }
    delete accountRow._needsRepLookup;
    delete accountRow._needsAdLookup;
    await store.upsertAccount(accountRow);
  }

  return { skippedStale: false, item: mirrored, records: prepared.records };
}

export async function ingestUpdates(store, { organizationId, boardId, itemId, updates }) {
  const prepared = prepareUpdateRows({ organizationId, boardId, itemId, updates });
  if (typeof store.upsertMondayUpdatesBatch === "function") {
    await store.upsertMondayUpdatesBatch(prepared.updateRows);
  } else {
    for (const row of prepared.updateRows) await store.upsertMondayUpdate(row);
  }
  if (typeof store.upsertMondayUsersBatch === "function") {
    await store.upsertMondayUsersBatch(prepared.userRows);
  } else {
    for (const row of prepared.userRows) await store.upsertMondayUser(row);
  }
  if (typeof store.upsertMondayAssetsBatch === "function") {
    await store.upsertMondayAssetsBatch(prepared.assetRows);
  } else {
    for (const row of prepared.assetRows) await store.upsertMondayAsset(row);
  }
  return prepared.updateRows;
}

export { SALES_OPS_MONDAY_EXTERNAL_SYSTEM, mondayExternalId };
