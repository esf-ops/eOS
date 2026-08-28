import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createSalesOpsMemoryStore } from "./salesOpsMemoryStore.mjs";
import { createSalesOpsService, SalesOpsError } from "./salesOpsService.mjs";
import { createSalesOpsMondayClient } from "./salesOpsMonday.mjs";
import {
  ingestMondayItem,
  ingestUpdates,
  toAccountListDto,
  assertNoForbiddenDto
} from "./salesOpsMondayMirror.mjs";

const ORG = "00000000-0000-4000-8000-aaaaaaaaaaaa";
const ORG_B = "00000000-0000-4000-8000-bbbbbbbbbbbb";
const REP_A = "00000000-0000-4000-8000-0000000000aa";
const REP_B = "00000000-0000-4000-8000-0000000000bb";
const MGR = "00000000-0000-4000-8000-0000000000cc";
const ADMIN = "00000000-0000-4000-8000-0000000000dd";
const BOARD = "18397092941";
const SUB_BOARD = "18397319923";

function user(id, role, org = ORG) {
  return { id, email: `${id.slice(-4)}@example.test`, full_name: "Sentinel", role, organization_id: org, isActive: true };
}

function col(id, title, type, text, value) {
  return {
    id,
    title,
    type,
    text,
    value: value == null || typeof value === "string" ? value : JSON.stringify(value)
  };
}

function peopleValue(entries) {
  return { personsAndTeams: entries.map((e) => ({ id: e.id, kind: e.kind || "person" })) };
}

function mondayClient(items, extras = {}) {
  return createSalesOpsMondayClient({
    token: "sentinel-token",
    inspectBoard: async (id) => ({
      id,
      name: String(id) === SUB_BOARD ? "Subitems of Account Master List" : "Account Master List",
      columns: extras.columns || [{ id: "person", title: "Sales Executive", type: "people", settings_str: "{}" }],
      groups: extras.groups || [{ id: "g1", title: "West" }]
    }),
    listBoardItems: extras.listBoardItems || (async () => [...items.values()]),
    getItem: async (id) => items.get(String(id)) || null,
    listItemUpdates: extras.listItemUpdates || (async (id) => items.get(String(id))?.updates || []),
    getDoc: extras.getDoc || (async () => ({ accessibility: "unsupported" })),
    changeColumnValues: extras.changeColumnValues || (async () => {
      throw new Error("write should not run");
    }),
    createUpdate: extras.createUpdate || (async () => {
      throw new Error("write should not run");
    })
  });
}

async function world(itemMap = new Map(), extras = {}) {
  const store = createSalesOpsMemoryStore();
  await store.upsertMondayConfig({
    organizationId: ORG,
    enabled: false,
    readEnabled: true,
    writeEnabled: false,
    accountMasterBoardId: BOARD,
    subitemBoardId: SUB_BOARD,
    columnMap: { salesExecutive: { columnId: "person", title: "Sales Executive", type: "people" } }
  });
  await store.upsertRepMapping({ organizationId: ORG, userId: REP_A, mondayUserId: "1001" });
  if (extras.mapB !== false) {
    await store.upsertRepMapping({ organizationId: ORG, userId: REP_B, mondayUserId: "1002" });
  }
  const monday = mondayClient(itemMap, extras);
  const svc = createSalesOpsService({ store, monday, audit: async () => {} });
  return { store, monday, svc, items: itemMap };
}

function parentItem(id, name, columns, extras = {}) {
  return {
    id,
    name,
    url: `https://monday.example.test/pulses/${id}`,
    created_at: extras.created_at || "2026-01-01T00:00:00Z",
    updated_at: extras.updated_at || "2026-08-01T00:00:00Z",
    group: extras.group || { id: "g1", title: "West" },
    board: { id: BOARD },
    column_values: columns,
    subitems: extras.subitems || [],
    assets: extras.assets || [],
    updates: extras.updates || [],
    description: extras.description
  };
}

async function main() {
  const v1 = readFileSync(fileURLToPath(new URL("../../supabase/eliteos_sales_ops_v1.sql", import.meta.url)), "utf8");
  const v2 = readFileSync(
    fileURLToPath(new URL("../../supabase/eliteos_sales_ops_monday_full_mirror_v2.sql", import.meta.url)),
    "utf8"
  );
  const serviceSrc = readFileSync(fileURLToPath(new URL("./salesOpsService.mjs", import.meta.url)), "utf8");
  const ingestSrc = readFileSync(fileURLToPath(new URL("./salesOpsMondayMirror.mjs", import.meta.url)), "utf8");
  const feSrc = readFileSync(fileURLToPath(new URL("../../../app-sales-ops/src/ui/SalesOpsApp.tsx", import.meta.url)), "utf8");
  const feApi = readFileSync(fileURLToPath(new URL("../../../app-sales-ops/src/lib/api.ts", import.meta.url)), "utf8");

  // 1. v2 migration is additive
  const uncommented = v2.replace(/--[^\n]*/g, "");
  assert.ok(!/drop\s+table/i.test(uncommented));
  assert.ok(!/truncate/i.test(uncommented));
  assert.ok(v2.includes("sales_ops_monday_column_values"));
  assert.ok(v2.includes("add column if not exists"));
  assert.ok(v1.includes("sales_ops_accounts"));

  const store = createSalesOpsMemoryStore();
  await store.upsertMondayConfig({
    organizationId: ORG,
    accountMasterBoardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person", title: "Sales Executive", type: "people" } }
  });
  await store.upsertRepMapping({ organizationId: ORG, userId: REP_A, mondayUserId: "1001" });

  const baseCols = [
    col("person", "Sales Executive", "people", "Alex", peopleValue([{ id: "1001", kind: "person" }]))
  ];

  // 2. unknown future column persists
  await ingestMondayItem(store, {
    organizationId: ORG,
    boardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person", title: "Sales Executive", type: "people" } },
    schema: { columns: [{ id: "future_xyz", title: "Brand New Field" }] },
    item: parentItem("item-1", "Alpha Cabinets", [
      ...baseCols,
      col("future_xyz", "Brand New Field", "text", "hello-future", "hello-future")
    ])
  });
  const cols1 = await store.listMondayColumnValues(ORG, BOARD, "item-1");
  assert.equal(cols1.some((c) => c.columnId === "future_xyz" && c.displayText === "hello-future"), true);

  // 2b. empty Monday columns (JSON null) persist without throwing
  await ingestMondayItem(store, {
    organizationId: ORG,
    boardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person", title: "Sales Executive", type: "people" } },
    schema: { columns: [{ id: "subtasks_mkzzp75r", title: "Subitems", type: "subtasks" }] },
    item: parentItem("item-empty-col", "Empty Column Account", [
      ...baseCols,
      col("subtasks_mkzzp75r", "Subitems", "subtasks", null, null)
    ])
  });
  const emptyCols = await store.listMondayColumnValues(ORG, BOARD, "item-empty-col");
  assert.equal(emptyCols.some((c) => c.columnId === "subtasks_mkzzp75r"), true);

  // 3. renamed column same ID updates metadata without duplicating identity
  await ingestMondayItem(store, {
    organizationId: ORG,
    boardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person" } },
    schema: { columns: [{ id: "future_xyz", title: "Renamed Field" }] },
    item: parentItem("item-1", "Alpha Cabinets", [
      ...baseCols,
      col("future_xyz", "Renamed Field", "text", "hello-future", "hello-future")
    ])
  });
  const cols2 = await store.listMondayColumnValues(ORG, BOARD, "item-1");
  const renamed = cols2.filter((c) => c.columnId === "future_xyz");
  assert.equal(renamed.length, 1);
  assert.equal(renamed[0].columnTitle, "Renamed Field");

  // 4. null/blank preserved
  await ingestMondayItem(store, {
    organizationId: ORG,
    boardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person" } },
    item: parentItem("item-blank", "Blank Co", [
      ...baseCols,
      col("notes", "Notes", "text", "", ""),
      col("empty", "Empty", "text", null, null)
    ])
  });
  const blanks = await store.listMondayColumnValues(ORG, BOARD, "item-blank");
  assert.equal(blanks.find((c) => c.columnId === "notes").displayText, "");
  assert.equal(blanks.find((c) => c.columnId === "empty").displayText, null);

  // 5–6. people arrays + teams preserved
  await ingestMondayItem(store, {
    organizationId: ORG,
    boardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person" } },
    item: parentItem("item-people", "People Co", [
      col(
        "person",
        "Sales Executive",
        "people",
        "Alex, Team",
        peopleValue([
          { id: "1001", kind: "person" },
          { id: "99047417", kind: "person" },
          { id: "team-9", kind: "team" }
        ])
      )
    ])
  });
  const peopleCols = await store.listMondayColumnValues(ORG, BOARD, "item-people");
  const pts = peopleCols.find((c) => c.columnId === "person").value.personsAndTeams;
  assert.equal(pts.length, 3);
  assert.equal(pts.some((p) => String(p.kind) === "team"), true);
  const peopleAcc = await store.getAccountByMondayItem(ORG, "item-people");
  assert.equal(peopleAcc.mondayAssignedUserId, "1001");

  // 7. normalized owner uses explicit person ID mapping
  assert.equal(peopleAcc.assignedUserId, REP_A);

  // 8. unmapped owner hidden from rep — covered after service world

  // 9. multi-select dropdown
  await ingestMondayItem(store, {
    organizationId: ORG,
    boardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person" } },
    item: parentItem("item-dd", "Dropdown Co", [
      ...baseCols,
      col("dd", "Tags", "dropdown", "A, B", { ids: [1, 2], chosenValues: ["A", "B"] })
    ])
  });
  const dd = (await store.listMondayColumnValues(ORG, BOARD, "item-dd")).find((c) => c.columnId === "dd");
  assert.deepEqual(dd.value.ids, [1, 2]);

  // 10. status text + value
  await ingestMondayItem(store, {
    organizationId: ORG,
    boardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person" }, status: { columnId: "status" } },
    item: parentItem("item-st", "Status Co", [
      ...baseCols,
      col("status", "Status", "status", "Active", { label: "Active", index: 1 })
    ])
  });
  const st = (await store.listMondayColumnValues(ORG, BOARD, "item-st")).find((c) => c.columnId === "status");
  assert.equal(st.displayText, "Active");
  assert.equal(st.value.label, "Active");

  // 11. checkbox
  await ingestMondayItem(store, {
    organizationId: ORG,
    boardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person" } },
    item: parentItem("item-cb", "Check Co", [...baseCols, col("cb", "OK", "checkbox", "v", { checked: true })])
  });
  assert.equal((await store.listMondayColumnValues(ORG, BOARD, "item-cb")).find((c) => c.columnId === "cb").value.checked, true);

  // 12. date
  await ingestMondayItem(store, {
    organizationId: ORG,
    boardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person" } },
    item: parentItem("item-date", "Date Co", [...baseCols, col("d", "Last Contact", "date", "2026-08-01", { date: "2026-08-01" })])
  });
  assert.equal((await store.listMondayColumnValues(ORG, BOARD, "item-date")).find((c) => c.columnId === "d").value.date, "2026-08-01");

  // 13. location structured
  await ingestMondayItem(store, {
    organizationId: ORG,
    boardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person" } },
    item: parentItem("item-loc", "Loc Co", [
      ...baseCols,
      col("loc", "Location", "location", "Dubuque", { address: "Dubuque", lat: 42.5, lng: -90.6 })
    ])
  });
  const loc = (await store.listMondayColumnValues(ORG, BOARD, "item-loc")).find((c) => c.columnId === "loc");
  assert.equal(loc.value.lat, 42.5);

  // 14. formula display
  await ingestMondayItem(store, {
    organizationId: ORG,
    boardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person" } },
    item: parentItem("item-f", "Formula Co", [...baseCols, col("f", "Score", "formula", "12.5", null)])
  });
  assert.equal((await store.listMondayColumnValues(ORG, BOARD, "item-f")).find((c) => c.columnId === "f").displayText, "12.5");

  // 15. phone/email
  await ingestMondayItem(store, {
    organizationId: ORG,
    boardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person" } },
    item: parentItem("item-pe", "Contact Co", [
      ...baseCols,
      col("phone", "Phone", "phone", "555-0100", { phone: "555-0100" }),
      col("email", "Email", "email", "a@example.test", { email: "a@example.test" })
    ])
  });
  const pe = await store.listMondayColumnValues(ORG, BOARD, "item-pe");
  assert.equal(pe.find((c) => c.columnId === "phone").displayText, "555-0100");
  assert.equal(pe.find((c) => c.columnId === "email").displayText, "a@example.test");

  // 16. numbers
  await ingestMondayItem(store, {
    organizationId: ORG,
    boardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person" } },
    item: parentItem("item-n", "Num Co", [...baseCols, col("n", "Target Sq Ft Per Month", "numbers", "2500", "2500")])
  });
  assert.equal((await store.listMondayColumnValues(ORG, BOARD, "item-n")).find((c) => c.columnId === "n").displayText, "2500");

  // 17. long text
  const long = "x".repeat(4000);
  await ingestMondayItem(store, {
    organizationId: ORG,
    boardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person" } },
    item: parentItem("item-lt", "Long Co", [...baseCols, col("lt", "Notes", "long_text", long, { text: long })])
  });
  assert.equal((await store.listMondayColumnValues(ORG, BOARD, "item-lt")).find((c) => c.columnId === "lt").displayText.length, 4000);

  // 18. item description ingested
  await ingestMondayItem(store, {
    organizationId: ORG,
    boardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person" } },
    item: parentItem("item-desc", "Desc Co", baseCols, { description: "Board description body" })
  });
  const descItem = await store.getMondayItem(ORG, BOARD, "item-desc");
  assert.equal(descItem.description, "Board description body");
  const descAcc = await store.getAccountByMondayItem(ORG, "item-desc");
  assert.equal(descAcc.description, "Board description body");
  const listDto = toAccountListDto(descAcc);
  assert.equal(Object.prototype.hasOwnProperty.call(listDto, "description"), false);

  // 19–21. subitems + unknown subitem column + files
  await ingestMondayItem(store, {
    organizationId: ORG,
    boardId: SUB_BOARD,
    itemKind: "subitem",
    parentMondayItemId: "item-1",
    item: {
      id: "sub-1",
      name: "Follow-up visit",
      group: { id: "sg", title: "Open" },
      column_values: [
        col("person", "Owner", "people", "Alex", peopleValue([{ id: "1001" }])),
        col("status", "Status", "status", "Done", { label: "Done" }),
        col("date0", "Date", "date", "2026-08-02", { date: "2026-08-02" }),
        col("text_mm0910rd", "Notes", "text", "ok", "ok"),
        col("future_sub", "New Sub Col", "text", "new", "new"),
        col("file_mm09xyk8", "File", "file", "spec.pdf", { files: [{ assetId: "asset-sub-1", name: "spec.pdf" }] })
      ],
      assets: [{ id: "asset-sub-1", name: "spec.pdf", file_extension: "pdf", file_size: 12 }]
    }
  });
  const subs = await store.listMondayItems(ORG, { parentMondayItemId: "item-1", itemKind: "subitem" });
  assert.equal(subs.length, 1);
  const subCols = await store.listMondayColumnValues(ORG, SUB_BOARD, "sub-1");
  assert.equal(subCols.some((c) => c.columnId === "future_sub"), true);
  const subFiles = await store.listMondayAssetsPage(ORG, "sub-1", { limit: 10, offset: 0 });
  assert.equal(subFiles.rows.some((a) => a.mondayAssetId === "asset-sub-1"), true);

  // 22–24. updates paginated, replies parent, assets
  await ingestUpdates(store, {
    organizationId: ORG,
    boardId: BOARD,
    itemId: "item-1",
    updates: [
      {
        id: "u-1",
        text_body: "parent note",
        created_at: "2026-08-01T00:00:00Z",
        creator: { id: "1001", name: "Alex" },
        assets: [{ id: "asset-u1", name: "photo.png", file_extension: "png", file_size: 4 }],
        replies: [
          {
            id: "u-1-r",
            text_body: "reply body",
            created_at: "2026-08-01T01:00:00Z",
            creator: { id: "1002", name: "Blake" }
          }
        ]
      },
      { id: "u-2", text_body: "second", created_at: "2026-08-02T00:00:00Z", creator: { id: "1001", name: "Alex" } }
    ]
  });
  const page1 = await store.listMondayUpdatesPage(ORG, "item-1", { limit: 1, offset: 0 });
  assert.equal(page1.rows.length, 1);
  assert.equal(page1.hasMore, true);
  const allU = await store.listMondayUpdatesPage(ORG, "item-1", { limit: 10, offset: 0 });
  const reply = allU.rows.find((u) => u.mondayUpdateId === "u-1-r");
  assert.equal(reply.parentMondayUpdateId, "u-1");
  const assets = await store.listMondayAssetsPage(ORG, "item-1", { limit: 20, offset: 0 });
  assert.equal(assets.rows.some((a) => a.mondayAssetId === "asset-u1"), true);

  // 25. docs indexed / content graceful
  await ingestMondayItem(store, {
    organizationId: ORG,
    boardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person" } },
    item: parentItem("item-doc", "Doc Co", [
      ...baseCols,
      col("doc", "Account Doc", "direct_doc", "Strategy", { files: [{ objectId: "doc-99" }] })
    ])
  });
  const { store: docStore, svc: docSvc } = await world(
    new Map([
      [
        "item-doc",
        parentItem("item-doc", "Doc Co", [
          ...baseCols,
          col("doc", "Account Doc", "direct_doc", "Strategy", { files: [{ objectId: "doc-99" }] })
        ])
      ]
    ]),
    { getDoc: async () => ({ accessibility: "unsupported" }) }
  );
  await docSvc.syncMonday(user(ADMIN, "admin"));
  const docs = await docStore.listMondayDocs(ORG, { mondayItemId: "item-doc", limit: 10, offset: 0 });
  assert.equal(docs.rows.some((d) => d.mondayDocId === "doc-99"), true);
  assert.equal(docs.rows.find((d) => d.mondayDocId === "doc-99").accessibility, "unsupported");

  // 26. duplicate webhook replay harmless
  const items = new Map([
    ["item-a", parentItem("item-a", "Alpha", [col("person", "Sales Executive", "people", "Alex", peopleValue([{ id: "1001" }]))])]
  ]);
  const { svc, store: stA } = await world(items);
  await svc.syncMonday(user(ADMIN, "admin"));
  const h1 = await svc.processWebhook({ organizationId: ORG, eventId: "evt-dup", eventType: "change_column_value", itemId: "item-a" });
  const h2 = await svc.processWebhook({ organizationId: ORG, eventId: "evt-dup", eventType: "change_column_value", itemId: "item-a" });
  assert.equal(h1.duplicate, false);
  assert.equal(h2.duplicate, true);

  // 27. out-of-order event does not silently regress current state
  items.set("item-a", parentItem("item-a", "Alpha", [
    col("person", "Sales Executive", "people", "Alex", peopleValue([{ id: "1001" }])),
    col("status", "Status", "status", "Won", { label: "Won" })
  ], { updated_at: "2026-08-20T00:00:00Z" }));
  await ingestMondayItem(stA, {
    organizationId: ORG,
    boardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person" }, status: { columnId: "status" } },
    item: items.get("item-a")
  });
  items.set("item-a", parentItem("item-a", "Alpha", [
    col("person", "Sales Executive", "people", "Alex", peopleValue([{ id: "1001" }])),
    col("status", "Status", "status", "Lead", { label: "Lead" })
  ], { updated_at: "2026-08-01T00:00:00Z" }));
  await ingestMondayItem(stA, {
    organizationId: ORG,
    boardId: BOARD,
    columnMap: { salesExecutive: { columnId: "person" }, status: { columnId: "status" } },
    item: items.get("item-a")
  });
  const stNow = (await stA.listMondayColumnValues(ORG, BOARD, "item-a")).find((c) => c.columnId === "status");
  assert.equal(stNow.displayText, "Won");

  // 28–30. full reconcile recovers; incomplete census does not mark unseen; success marks unavailable without delete
  const censusItems = new Map([
    ["c1", parentItem("c1", "One", [col("person", "Sales Executive", "people", "Alex", peopleValue([{ id: "1001" }]))])],
    ["c2", parentItem("c2", "Two", [col("person", "Sales Executive", "people", "Alex", peopleValue([{ id: "1001" }]))])],
    ["c3", parentItem("c3", "Three", [col("person", "Sales Executive", "people", "Alex", peopleValue([{ id: "1001" }]))])]
  ]);
  const successCensus = await world(censusItems);
  await successCensus.svc.syncMonday(user(ADMIN, "admin"));
  assert.equal((await successCensus.store.getAccountByMondayItem(ORG, "c3")).sourceState, "active");

  let updateCalls = 0;
  const failMonday = mondayClient(censusItems, {
    listItemUpdates: async () => {
      updateCalls += 1;
      if (updateCalls >= 2) throw new Error("census exploded");
      return [];
    }
  });
  const failSvc = createSalesOpsService({ store: successCensus.store, monday: failMonday, audit: async () => {} });
  await failSvc.syncMonday(user(ADMIN, "admin")).then(
    () => {
      throw new Error("expected census failure");
    },
    () => {}
  );
  assert.equal((await successCensus.store.getAccountByMondayItem(ORG, "c3")).sourceState, "active");
  assert.ok(await successCensus.store.getMondayItem(ORG, BOARD, "c3"));

  censusItems.delete("c3");
  const { svc: okSvc, store: okStore } = await world(censusItems);
  await okStore.upsertAccount({
    organizationId: ORG,
    mondayBoardId: BOARD,
    mondayItemId: "c3",
    accountName: "Three",
    assignedUserId: REP_A,
    sourceState: "active",
    lastSeenAt: "2026-01-01T00:00:00Z"
  });
  await okStore.upsertMondayItem({
    organizationId: ORG,
    mondayBoardId: BOARD,
    mondayItemId: "c3",
    itemKind: "item",
    itemName: "Three",
    sourceState: "active",
    lastSeenAt: "2026-01-01T00:00:00Z"
  });
  await okSvc.syncMonday(user(ADMIN, "admin"));
  const gone = await okStore.getAccountByMondayItem(ORG, "c3");
  assert.equal(gone.sourceState, "unavailable");
  assert.ok(gone.id);
  assert.equal((await okStore.getMondayItem(ORG, BOARD, "c3")).sourceState, "unavailable");

  // 31–33. exact AD link reused; no fuzzy; unlinked still valid
  const adId = "00000000-0000-4000-8000-00000000ad01";
  const { store: adStore, svc: adSvc } = await world(
    new Map([
      ["link-me", parentItem("link-me", "Exact Name Match Inc", [col("person", "Sales Executive", "people", "Alex", peopleValue([{ id: "1001" }]))])],
      ["unlinked", parentItem("unlinked", "Exact Name Match Inc", [col("person", "Sales Executive", "people", "Alex", peopleValue([{ id: "1001" }]))])]
    ])
  );
  adStore.seedMondayAccountDirectoryLink(ORG, BOARD, "link-me", adId);
  await adSvc.syncMonday(user(ADMIN, "admin"));
  assert.equal((await adStore.getAccountByMondayItem(ORG, "link-me")).accountDirectoryAccountId, adId);
  assert.equal((await adStore.getAccountByMondayItem(ORG, "unlinked")).accountDirectoryAccountId, null);
  const unlinkedList = await adSvc.getMyAccounts(user(REP_A, "sales"));
  assert.equal(unlinkedList.accounts.some((a) => a.mondayItemId === "unlinked"), true);
  assert.ok(!ingestSrc.toLowerCase().includes("fuzzy"));
  assert.ok(!ingestSrc.includes("account_master_list"));

  // 34–36. list pagination + no raw leak
  const many = new Map();
  for (let i = 0; i < 3; i += 1) {
    many.set(`p${i}`, parentItem(`p${i}`, `Page ${i}`, [col("person", "Sales Executive", "people", "Alex", peopleValue([{ id: "1001" }]))]));
  }
  const { svc: pSvc } = await world(many);
  await pSvc.syncMonday(user(ADMIN, "admin"));
  const page = await pSvc.getMyAccounts(user(REP_A, "sales"), { limit: 1 });
  assert.equal(page.accounts.length, 1);
  assert.ok(page.nextCursor);
  const page2 = await pSvc.getMyAccounts(user(REP_A, "sales"), { limit: 1, cursor: page.nextCursor });
  assert.equal(page2.accounts.length, 1);
  assert.notEqual(page.accounts[0].id, page2.accounts[0].id);
  assertNoForbiddenDto(page.accounts[0]);
  assert.equal(Object.prototype.hasOwnProperty.call(page.accounts[0], "rawColumns"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(page.accounts[0], "sourceSnapshot"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(page.accounts[0], "description"), false);

  // 8, 37–41. authorization
  const iso = new Map([
    ["a", parentItem("a", "Rep A House", [col("person", "Sales Executive", "people", "Alex", peopleValue([{ id: "1001" }]))], {
      subitems: [
        {
          id: "sub-a",
          name: "task",
          board: { id: SUB_BOARD },
          column_values: [col("future_sub", "New", "text", "x", "x")]
        }
      ]
    })],
    ["b", parentItem("b", "Rep B House", [col("person", "Sales Executive", "people", "Blake", peopleValue([{ id: "1002" }]))])],
    ["unmap", parentItem("unmap", "Unmapped House", [col("person", "Sales Executive", "people", "Thera", peopleValue([{ id: "99047417" }]))])]
  ]);
  const { svc: authSvc, store: authStore } = await world(iso);
  await authStore.insertManagerAssignment({
    organizationId: ORG,
    managerUserId: MGR,
    reportUserId: REP_A,
    canMutateAccounts: false
  });
  await authSvc.syncMonday(user(ADMIN, "admin"));
  const aList = await authSvc.getMyAccounts(user(REP_A, "sales"));
  const bList = await authSvc.getMyAccounts(user(REP_B, "sales"));
  assert.equal(aList.accounts.some((a) => a.mondayItemId === "unmap"), false);
  assert.equal(aList.accounts.some((a) => a.mondayItemId === "b"), false);
  const aId = aList.accounts.find((a) => a.mondayItemId === "a").id;
  const bId = bList.accounts.find((a) => a.mondayItemId === "b").id;
  await assert.rejects(() => authSvc.getAccountWorkspace(user(REP_A, "sales"), bId), (e) => e.status === 404);
  await assert.rejects(() => authSvc.getAccountUpdates(user(REP_A, "sales"), bId), (e) => e.status === 404);
  await assert.rejects(() => authSvc.getAccountFiles(user(REP_A, "sales"), bId), (e) => e.status === 404);
  await assert.rejects(() => authSvc.getAccountDocs(user(REP_A, "sales"), bId), (e) => e.status === 404);
  await assert.rejects(() => authSvc.getAccountSubitems(user(REP_A, "sales"), bId), (e) => e.status === 404);
  await authSvc.getAccountSubitems(user(REP_A, "sales"), aId);
  await authSvc.getAccountFiles(user(MGR, "sales"), aId);
  await assert.rejects(() => authSvc.getAccountFiles(user(MGR, "sales"), bId), (e) => e.status === 404);
  await assert.rejects(() => authSvc.getAccountWorkspace(user(REP_A, "sales", ORG_B), aId), (e) => e.status === 404 || e.code === "no_org");
  await assert.rejects(() => authSvc.getAccountFile(user(REP_A, "sales"), aId, "missing"), (e) => e.status === 404 || e.code === "asset_fetch_not_enabled");

  const detail = await authSvc.getAccountWorkspace(user(REP_A, "sales"), aId);
  assertNoForbiddenDto(detail.account);
  assert.ok(Array.isArray(detail.account.columns));
  assert.equal(detail.account.columns.some((c) => Object.prototype.hasOwnProperty.call(c, "value")), false);
  await authStore.upsertMondayAsset({
    organizationId: ORG,
    mondayBoardId: BOARD,
    mondayItemId: "a",
    mondayAssetId: "asset-a1",
    filename: "quote.pdf",
    associatedKind: "item"
  });
  const files = await authSvc.getAccountFiles(user(REP_A, "sales"), aId);
  assert.ok(files.files.some((f) => f.mondayAssetId === "asset-a1"));
  assert.equal(files.files.some((f) => Object.prototype.hasOwnProperty.call(f, "url") || Object.prototype.hasOwnProperty.call(f, "publicUrl")), false);
  await assert.rejects(
    () => authSvc.getAccountFile(user(REP_A, "sales"), aId, files.files.find((f) => f.mondayAssetId === "asset-a1").id),
    (e) => e.status === 409 && e.code === "asset_fetch_not_enabled"
  );
  const docsDto = await authSvc.getAccountDocs(user(REP_A, "sales"), aId);
  assert.equal(docsDto.docs.some((d) => Object.prototype.hasOwnProperty.call(d, "sourceUrl") || Object.prototype.hasOwnProperty.call(d, "source_url")), false);

  // 42. Monday credentials cannot enter frontend
  assert.ok(!/MONDAY_API_TOKEN|SERVICE_ROLE|SIGNING_SECRET/.test(feSrc + feApi));

  // 43–44. write-disabled blocks mutations; read-only still operates
  const writes = [];
  const wItems = new Map([
    ["w1", parentItem("w1", "Write Co", [col("person", "Sales Executive", "people", "Alex", peopleValue([{ id: "1001" }]))])]
  ]);
  const { svc: wSvc, store: wStore } = await world(wItems, {
    changeColumnValues: async () => {
      writes.push("change");
      return {};
    },
    createUpdate: async () => {
      writes.push("note");
      return { id: "n1" };
    }
  });
  await wSvc.syncMonday(user(ADMIN, "admin"));
  const wAcc = (await wSvc.getMyAccounts(user(REP_A, "sales"))).accounts[0];
  await assert.rejects(() => wSvc.patchAccount(user(REP_A, "sales"), wAcc.id, { status: "Won" }), (e) => e.code === "monday_writes_disabled");
  await assert.rejects(() => wSvc.addNote(user(REP_A, "sales"), wAcc.id, "hi"), (e) => e.code === "monday_writes_disabled");
  assert.equal(writes.length, 0);
  await wStore.upsertMondayConfig({ organizationId: ORG, writeEnabled: true, enabled: true });
  // still need mapped next/status for patch — skip success path; enable flag is what matters
  const health = await wSvc.integrationHealth(user(ADMIN, "admin"));
  assert.equal(health.writeEnabled, true);
  await wStore.upsertMondayConfig({ organizationId: ORG, writeEnabled: false, enabled: false, readEnabled: true });
  const health2 = await wSvc.integrationHealth(user(ADMIN, "admin"));
  assert.equal(health2.writeEnabled, false);
  assert.equal(health2.readEnabled, true);
  await wSvc.syncMonday(user(ADMIN, "admin"));

  // 45. no 120-second legitimate-event suppression
  assert.ok(!serviceSrc.includes("120_000"));
  assert.ok(!serviceSrc.includes("echo: true"));
  const accRow = await wStore.getAccountByMondayItem(ORG, "w1");
  await wStore.upsertAccount({
    ...accRow,
    lastEliteosMutationHash: "abc",
    lastEliteosMutationAt: new Date().toISOString()
  });
  wItems.set(
    "w1",
    parentItem("w1", "Write Co", [
      col("person", "Sales Executive", "people", "Alex", peopleValue([{ id: "1001" }])),
      col("status", "Status", "status", "Human edit", { label: "Human edit" })
    ], { updated_at: new Date().toISOString() })
  );
  const hook = await wSvc.processWebhook({
    organizationId: ORG,
    eventId: "evt-human",
    eventType: "change_column_value",
    itemId: "w1"
  });
  assert.equal(hook.echo, undefined);
  const afterHuman = (await wStore.listMondayColumnValues(ORG, BOARD, "w1")).find((c) => c.columnId === "status");
  assert.equal(afterHuman.displayText, "Human edit");

  console.log("salesOpsMondayMirror.test.mjs: ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
