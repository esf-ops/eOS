import assert from "node:assert/strict";
import { test } from "node:test";

import { cloneDocument, emptyDocument, estimateReducer, groupItemsByRoom, type DocAction } from "./estimateDocument.ts";
import type { EstimateDocument, EstimateTemplate } from "./estimateTypes.ts";

function run(doc: EstimateDocument, ...actions: DocAction[]): EstimateDocument {
  return actions.reduce(estimateReducer, doc);
}

function counter(prefix = "n") {
  let i = 0;
  return () => `${prefix}${++i}`;
}

function acceptanceDoc(): EstimateDocument {
  return run(
    emptyDocument("direct"),
    { type: "set_header", patch: { customerName: "Northbridge Homes", projectName: "Maple Court Kitchen" } },
    { type: "add_room", id: "kitchen", name: "Kitchen" },
    { type: "add_room", id: "bath", name: "Primary Bath" },
    { type: "add_item", spec: { id: "ct", itemType: "countertop", roomId: "kitchen", inputs: { sqft: 48 } } },
    { type: "add_item", spec: { id: "bs", itemType: "backsplash", roomId: "kitchen", inputs: { sqft: 12 } } },
    { type: "add_item", spec: { id: "sink", itemType: "cutout", roomId: "kitchen", inputs: { cutoutCode: "qty-sink" } } },
    { type: "add_item", spec: { id: "van", itemType: "vanity", roomId: "bath", inputs: { sizeCode: "61_D", sideSplashQty: 1 } } },
    { type: "add_item", spec: { id: "trip", itemType: "service", inputs: { serviceCode: "additional_trip" } } }
  );
}

test("new items get price-free default inputs and manual provenance", () => {
  const doc = run(emptyDocument(), { type: "add_item", spec: { id: "a", itemType: "countertop" } });
  const item = doc.items[0];
  assert.equal(item.pricingStrategy, "elite_100");
  assert.deepEqual(item.inputs, { sqft: null, materialColorId: null, materialColorName: "" });
  assert.equal(item.source.provenance, "manually_added");
  assert.doesNotMatch(JSON.stringify(acceptanceDoc()), /"(unitPrice|rate|ratePerSqft|amount|total|subtotal)"/i);
});

test("groupItemsByRoom orders rooms then project-level items", () => {
  const groups = groupItemsByRoom(acceptanceDoc());
  assert.deepEqual(
    groups.map((g) => [g.room?.name ?? "Project", g.items.map((i) => i.id)]),
    [
      ["Kitchen", ["ct", "bs", "sink"]],
      ["Primary Bath", ["van"]],
      ["Project", ["trip"]]
    ]
  );
});

test("rooms are optional: a room-less estimate has one project group", () => {
  const doc = run(emptyDocument(), { type: "add_item", spec: { id: "x", itemType: "custom" } });
  const groups = groupItemsByRoom(doc);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].room, null);
});

test("move_item swaps only within the same room", () => {
  let doc = acceptanceDoc();
  doc = estimateReducer(doc, { type: "move_item", id: "sink", direction: "up" });
  assert.deepEqual(groupItemsByRoom(doc)[0].items.map((i) => i.id), ["ct", "sink", "bs"]);
  const unchanged = estimateReducer(doc, { type: "move_item", id: "van", direction: "up" });
  assert.deepEqual(groupItemsByRoom(unchanged)[1].items.map((i) => i.id), ["van"]);
  assert.equal(estimateReducer(doc, { type: "move_item", id: "ct", direction: "up" }), doc);
});

test("set_item_room moves to the end of the target room and rejects unknown rooms", () => {
  let doc = estimateReducer(acceptanceDoc(), { type: "set_item_room", id: "trip", roomId: "bath" });
  assert.deepEqual(groupItemsByRoom(doc)[1].items.map((i) => i.id), ["van", "trip"]);
  doc = estimateReducer(doc, { type: "set_item_room", id: "trip", roomId: "nope" });
  assert.equal(doc.items.find((i) => i.id === "trip")?.roomId, null);
});

test("remove_room keeps its items as project-level items", () => {
  const doc = estimateReducer(acceptanceDoc(), { type: "remove_room", id: "bath" });
  assert.equal(doc.rooms.length, 1);
  assert.equal(doc.items.find((i) => i.id === "van")?.roomId, null);
});

test("rename and reorder rooms", () => {
  let doc = run(acceptanceDoc(), { type: "rename_room", id: "kitchen", name: "Main Kitchen" }, { type: "move_room", id: "bath", direction: "up" });
  assert.deepEqual(doc.rooms.map((r) => [r.name, r.sortOrder]), [
    ["Primary Bath", 0],
    ["Main Kitchen", 1]
  ]);
  doc = estimateReducer(doc, { type: "rename_room", id: "bath", name: "   " });
  assert.equal(doc.rooms[0].name, "Primary Bath");
});

test("duplicate_item inserts after the source with duplicated provenance", () => {
  const doc = estimateReducer(acceptanceDoc(), { type: "duplicate_item", id: "ct", newId: "ct2" });
  const ids = doc.items.map((i) => i.id);
  assert.deepEqual(ids.slice(0, 2), ["ct", "ct2"]);
  const copy = doc.items[1];
  assert.equal(copy.source.provenance, "duplicated");
  assert.equal(copy.roomId, "kitchen");
  assert.notEqual(copy.inputs, doc.items[0].inputs);
});

test("switching countertop strategy resets inputs but keeps sqft", () => {
  const doc = estimateReducer(acceptanceDoc(), {
    type: "update_item",
    id: "ct",
    patch: { pricingStrategy: "out_of_collection" }
  });
  const item = doc.items.find((i) => i.id === "ct")!;
  assert.equal(item.pricingStrategy, "out_of_collection");
  assert.equal((item.inputs as { sqft: number }).sqft, 48);
  assert.equal((item.inputs as { materialType: string }).materialType, "quartz");
  assert.ok(!("materialColorId" in item.inputs));
});

test("editing an imported item flips provenance to imported_edited", () => {
  let doc = run(emptyDocument(), {
    type: "add_item",
    spec: { id: "ai", itemType: "countertop", sourceKind: "ai_takeoff", provenance: "imported_unmodified" }
  });
  doc = estimateReducer(doc, { type: "update_item", id: "ai", patch: { inputs: { sqft: 40 } } });
  assert.equal(doc.items[0].source.provenance, "imported_edited");
  assert.equal(doc.items[0].source.kind, "ai_takeoff");
});

test("append_template reuses rooms by name and tags template provenance", () => {
  const template: EstimateTemplate = {
    id: "kitchen_island",
    label: "Kitchen + Island",
    rooms: ["Kitchen", "Island"],
    items: [
      { room: "Kitchen", itemType: "countertop", pricingStrategy: "elite_100", inputs: {} },
      { room: "Island", itemType: "countertop", pricingStrategy: "elite_100", inputs: {} }
    ]
  };
  const doc = estimateReducer(acceptanceDoc(), { type: "append_template", template, newId: counter("t") });
  assert.deepEqual(doc.rooms.map((r) => r.name), ["Kitchen", "Primary Bath", "Island"]);
  const added = doc.items.filter((i) => i.source.provenance === "template");
  assert.equal(added.length, 2);
  assert.equal(added[0].roomId, "kitchen");
  assert.equal(added[1].roomId, doc.rooms[2].id);
});

test("cloneDocument issues new ids and remaps rooms", () => {
  const src = acceptanceDoc();
  const copy = cloneDocument(src, counter("c"));
  assert.equal(copy.items.length, src.items.length);
  assert.ok(copy.items.every((i) => i.id.startsWith("c") && i.source.provenance === "duplicated"));
  const kitchenId = copy.rooms.find((r) => r.name === "Kitchen")!.id;
  assert.equal(copy.items.find((i) => i.itemType === "countertop")!.roomId, kitchenId);
  assert.equal(copy.header.customerName, "Northbridge Homes");
  assert.equal(cloneDocument(src, counter("d"), false).header.customerName, "");
});

test("sortOrder stays dense after removals", () => {
  const doc = estimateReducer(acceptanceDoc(), { type: "remove_item", id: "bs" });
  assert.deepEqual(doc.items.map((i) => i.sortOrder), [0, 1, 2, 3]);
});

test("notes are text-only items placed after an anchor and moved like any line", () => {
  const doc = run(
    acceptanceDoc(),
    { type: "add_item", spec: { id: "note", itemType: "note", roomId: "kitchen", inputs: { text: "Eased Edges / NO Backsplash" } }, afterId: "ct" },
    { type: "move_item", id: "note", direction: "down" }
  );
  const note = doc.items.find((it) => it.id === "note")!;
  assert.equal(note.pricingStrategy, "text");
  assert.deepEqual(note.inputs, { text: "Eased Edges / NO Backsplash" });
  assert.deepEqual(
    groupItemsByRoom(doc)[0].items.map((it) => it.id),
    ["ct", "bs", "note", "sink"]
  );
  assert.equal(emptyDocument().header.customerMessage, "");
  assert.equal(emptyDocument().header.billToAddress, "");
});
