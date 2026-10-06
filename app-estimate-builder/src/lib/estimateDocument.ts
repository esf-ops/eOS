/**
 * Pure estimate document operations (reducer + helpers). No pricing lives here — amounts come from the Brain.
 * Ids are always supplied by the caller so the reducer stays deterministic and testable.
 */

import type {
  EstimateDocument,
  EstimateHeader,
  EstimateItem,
  EstimateRoom,
  EstimateTemplate,
  ItemProvenance,
  ItemSourceKind,
  ItemType,
  PricingChannel,
  PricingStrategy
} from "./estimateTypes.ts";

export const DEFAULT_STRATEGY: Record<ItemType, PricingStrategy> = {
  countertop: "elite_100",
  backsplash: "standard",
  vanity: "vanity_program_2026",
  cutout: "addon_catalog",
  outlet: "addon_catalog",
  edge: "edge_v2",
  service: "service_catalog",
  product: "esf_catalog",
  custom: "custom_line",
  note: "text"
};

export function emptyHeader(): EstimateHeader {
  return {
    customerName: "",
    accountName: "",
    customerEmail: "",
    customerPhone: "",
    projectName: "",
    projectAddress: "",
    city: "",
    state: "",
    zip: "",
    branch: "",
    branchCode: "",
    salesRep: "",
    salesRepCode: "",
    qbCustomerListId: "",
    preparedBy: "",
    billToAddress: "",
    county: "",
    poNumber: "",
    customerMessage: "",
    customerNotes: "",
    internalNotes: ""
  };
}

export function emptyDocument(channel: PricingChannel = "direct"): EstimateDocument {
  return { version: 1, pricingChannel: channel, header: emptyHeader(), rooms: [], items: [] };
}

/** Default (price-free) inputs for an item type + strategy. */
export function defaultInputs(itemType: ItemType, strategy: PricingStrategy): Record<string, unknown> {
  switch (itemType) {
    case "countertop":
      if (strategy === "out_of_collection") {
        return {
          sqft: null,
          materialName: "",
          supplier: "",
          slabLengthIn: null,
          slabWidthIn: null,
          costPerSlab: null,
          wastePercent: null,
          slabQuantityOverride: null,
          overrideReason: ""
        };
      }
      return { sqft: null, materialColorId: null, materialColorName: "" };
    case "backsplash":
      return { sqft: null, materialSource: "room_countertop", materialColorId: null, materialColorName: "" };
    case "vanity":
      return {
        sizeCode: "",
        qty: 1,
        sinkType: "oval_white",
        sideSplashQty: 0,
        extraTrips: 0,
        depthIn: null,
        materialColorId: null,
        materialColorName: "",
        tierOverride: null,
        tierOverrideReason: ""
      };
    case "cutout":
      return { cutoutCode: "qty-sink", qty: 1 };
    case "outlet":
      return { qty: 1 };
    case "edge":
      return {
        edgeMode: "upgraded",
        profile: "",
        linearFeet: null,
        miterHeight: "",
        buildUpSqft: null,
        manualAmount: null,
        manualReason: "",
        customerLabel: ""
      };
    case "service":
      return { serviceCode: "additional_trip", qty: 1 };
    case "product":
      return { productId: null, variantId: null, qty: 1 };
    case "custom":
      return {
        description: "",
        qty: 1,
        unit: "ea",
        unitPrice: null,
        category: "other",
        customerFacing: true,
        customerNote: "",
        internalNote: ""
      };
    case "note":
      return { text: "" };
  }
}

export type NewItemSpec = {
  id: string;
  itemType: ItemType;
  pricingStrategy?: PricingStrategy;
  roomId?: string | null;
  label?: string;
  inputs?: Record<string, unknown>;
  sourceKind?: ItemSourceKind;
  provenance?: ItemProvenance;
  now?: string;
};

export function createItem(spec: NewItemSpec): EstimateItem {
  const strategy = spec.pricingStrategy ?? DEFAULT_STRATEGY[spec.itemType];
  return {
    id: spec.id,
    roomId: spec.roomId ?? null,
    itemType: spec.itemType,
    pricingStrategy: strategy,
    sortOrder: 0,
    label: spec.label ?? "",
    inputs: { ...defaultInputs(spec.itemType, strategy), ...(spec.inputs ?? {}) },
    source: { kind: spec.sourceKind ?? "manual", provenance: spec.provenance ?? "manually_added", reference: null },
    createdAt: spec.now ?? null,
    updatedAt: spec.now ?? null
  } as EstimateItem;
}

export type DocAction =
  | { type: "replace"; doc: EstimateDocument }
  | { type: "set_channel"; channel: PricingChannel }
  | { type: "set_header"; patch: Partial<EstimateHeader> }
  | { type: "add_item"; spec: NewItemSpec; afterId?: string | null }
  /** One-click add-on: bumps the qty of the same add-on already in the room, otherwise adds it. */
  | { type: "add_or_bump"; spec: NewItemSpec }
  /**
   * Catalog product add. When the product needs a cutout, the room is topped up so its cutout qty covers every
   * catalog product needing that cutout (`productCutouts` maps productId → cutout code).
   */
  | {
      type: "add_catalog_product";
      spec: NewItemSpec;
      cutout: { code: string; id: string } | null;
      productCutouts: Record<string, string | null>;
    }
  | {
      type: "update_item";
      id: string;
      patch: { inputs?: Record<string, unknown>; label?: string; pricingStrategy?: PricingStrategy };
      now?: string;
    }
  | { type: "remove_item"; id: string }
  | { type: "duplicate_item"; id: string; newId: string; now?: string }
  | { type: "move_item"; id: string; direction: "up" | "down" }
  | { type: "set_item_room"; id: string; roomId: string | null }
  | { type: "add_room"; id: string; name: string }
  | { type: "rename_room"; id: string; name: string }
  | { type: "remove_room"; id: string }
  | { type: "move_room"; id: string; direction: "up" | "down" }
  | { type: "append_template"; template: EstimateTemplate; newId: () => string; now?: string };

function renumberItems(items: EstimateItem[]): EstimateItem[] {
  return items.map((it, idx) => (it.sortOrder === idx ? it : { ...it, sortOrder: idx }));
}

function renumberRooms(rooms: EstimateRoom[]): EstimateRoom[] {
  return rooms.map((r, idx) => (r.sortOrder === idx ? r : { ...r, sortOrder: idx }));
}

/** Editing an imported item flips provenance so AI Takeoff review can tell edited from untouched rows. */
function editedProvenance(p: ItemProvenance): ItemProvenance {
  return p === "imported_unmodified" ? "imported_edited" : p;
}

function qtyOf(it: EstimateItem): number {
  return Number((it.inputs as { qty?: number }).qty) || 0;
}

/** Identity of a quantity-only add-on for `add_or_bump`; null for items that are not bumped. */
function addonKey(it: EstimateItem): string | null {
  if (it.itemType === "cutout") return `cutout:${it.inputs.cutoutCode}`;
  if (it.itemType === "outlet") return "outlet";
  if (it.itemType === "service") return `service:${it.inputs.serviceCode}`;
  return null;
}

/** Fields that survive a pricing-strategy switch (e.g. Elite 100 → Out-of-Collection keeps the sqft). */
const CARRY_OVER_KEYS = ["sqft", "qty"];

export function estimateReducer(doc: EstimateDocument, action: DocAction): EstimateDocument {
  switch (action.type) {
    case "replace":
      return action.doc;
    case "set_channel":
      return doc.pricingChannel === action.channel ? doc : { ...doc, pricingChannel: action.channel };
    case "set_header":
      return { ...doc, header: { ...doc.header, ...action.patch } };
    case "add_item": {
      const item = createItem(action.spec);
      const items = [...doc.items];
      const anchor = action.afterId ? items.findIndex((it) => it.id === action.afterId) : -1;
      if (anchor >= 0) items.splice(anchor + 1, 0, item);
      else items.push(item);
      return { ...doc, items: renumberItems(items) };
    }
    case "add_or_bump": {
      const probe = createItem(action.spec);
      const key = addonKey(probe);
      const existing = key ? doc.items.find((it) => it.roomId === probe.roomId && addonKey(it) === key) : undefined;
      if (!existing) return { ...doc, items: renumberItems([...doc.items, probe]) };
      return {
        ...doc,
        items: doc.items.map((it) =>
          it.id === existing.id ? ({ ...it, inputs: { ...it.inputs, qty: qtyOf(it) + 1 }, updatedAt: action.spec.now ?? it.updatedAt } as EstimateItem) : it
        )
      };
    }
    case "add_catalog_product": {
      const product = createItem(action.spec);
      let items = [...doc.items, product];
      const { cutout } = action;
      if (cutout) {
        const inRoom = (it: EstimateItem) => it.roomId === product.roomId;
        const need = items
          .filter((it) => inRoom(it) && it.itemType === "product" && action.productCutouts[it.inputs.productId ?? ""] === cutout.code)
          .reduce((s, it) => s + qtyOf(it), 0);
        const cutouts = items.filter((it) => inRoom(it) && it.itemType === "cutout" && it.inputs.cutoutCode === cutout.code);
        const have = cutouts.reduce((s, it) => s + qtyOf(it), 0);
        if (have < need) {
          if (cutouts.length) {
            const target = cutouts[0].id;
            items = items.map((it) => (it.id === target ? ({ ...it, inputs: { ...it.inputs, qty: qtyOf(it) + need - have } } as EstimateItem) : it));
          } else {
            items.push(
              createItem({
                id: cutout.id,
                itemType: "cutout",
                roomId: product.roomId,
                inputs: { cutoutCode: cutout.code, qty: need - have },
                now: action.spec.now
              })
            );
          }
        }
      }
      return { ...doc, items: renumberItems(items) };
    }
    case "update_item": {
      let changed = false;
      const items = doc.items.map((it) => {
        if (it.id !== action.id) return it;
        changed = true;
        const { patch } = action;
        const strategyChanged = patch.pricingStrategy && patch.pricingStrategy !== it.pricingStrategy;
        let inputs: Record<string, unknown> = it.inputs as Record<string, unknown>;
        if (strategyChanged) {
          const carried = Object.fromEntries(CARRY_OVER_KEYS.filter((k) => k in inputs).map((k) => [k, inputs[k]]));
          inputs = { ...defaultInputs(it.itemType, patch.pricingStrategy!), ...carried };
        }
        if (patch.inputs) inputs = { ...inputs, ...patch.inputs };
        return {
          ...it,
          pricingStrategy: patch.pricingStrategy ?? it.pricingStrategy,
          label: patch.label ?? it.label,
          inputs,
          source: { ...it.source, provenance: editedProvenance(it.source.provenance) },
          updatedAt: action.now ?? it.updatedAt
        } as EstimateItem;
      });
      return changed ? { ...doc, items } : doc;
    }
    case "remove_item": {
      const items = doc.items.filter((it) => it.id !== action.id);
      return items.length === doc.items.length ? doc : { ...doc, items: renumberItems(items) };
    }
    case "duplicate_item": {
      const idx = doc.items.findIndex((it) => it.id === action.id);
      if (idx < 0) return doc;
      const src = doc.items[idx];
      const copy = {
        ...src,
        id: action.newId,
        inputs: { ...src.inputs },
        source: { kind: "duplicate", provenance: "duplicated", reference: null },
        createdAt: action.now ?? null,
        updatedAt: action.now ?? null
      } as EstimateItem;
      const items = [...doc.items];
      items.splice(idx + 1, 0, copy);
      return { ...doc, items: renumberItems(items) };
    }
    case "move_item": {
      const idx = doc.items.findIndex((it) => it.id === action.id);
      if (idx < 0) return doc;
      const roomId = doc.items[idx].roomId;
      const step = action.direction === "up" ? -1 : 1;
      let j = idx + step;
      while (j >= 0 && j < doc.items.length && doc.items[j].roomId !== roomId) j += step;
      if (j < 0 || j >= doc.items.length) return doc;
      const items = [...doc.items];
      [items[idx], items[j]] = [items[j], items[idx]];
      return { ...doc, items: renumberItems(items) };
    }
    case "set_item_room": {
      const roomId = action.roomId && doc.rooms.some((r) => r.id === action.roomId) ? action.roomId : null;
      const idx = doc.items.findIndex((it) => it.id === action.id);
      if (idx < 0 || doc.items[idx].roomId === roomId) return doc;
      const items = doc.items.filter((it) => it.id !== action.id);
      items.push({ ...doc.items[idx], roomId });
      return { ...doc, items: renumberItems(items) };
    }
    case "add_room": {
      const name = action.name.trim() || `Room ${doc.rooms.length + 1}`;
      return { ...doc, rooms: renumberRooms([...doc.rooms, { id: action.id, name, sortOrder: doc.rooms.length }]) };
    }
    case "rename_room": {
      const name = action.name.trim();
      if (!name) return doc;
      return { ...doc, rooms: doc.rooms.map((r) => (r.id === action.id ? { ...r, name } : r)) };
    }
    case "remove_room": {
      if (!doc.rooms.some((r) => r.id === action.id)) return doc;
      return {
        ...doc,
        rooms: renumberRooms(doc.rooms.filter((r) => r.id !== action.id)),
        items: doc.items.map((it) => (it.roomId === action.id ? { ...it, roomId: null } : it))
      };
    }
    case "move_room": {
      const idx = doc.rooms.findIndex((r) => r.id === action.id);
      const j = action.direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || j < 0 || j >= doc.rooms.length) return doc;
      const rooms = [...doc.rooms];
      [rooms[idx], rooms[j]] = [rooms[j], rooms[idx]];
      return { ...doc, rooms: renumberRooms(rooms) };
    }
    case "append_template": {
      const rooms = [...doc.rooms];
      const roomIdByName = new Map<string, string>(rooms.map((r) => [r.name.toLowerCase(), r.id]));
      for (const name of action.template.rooms) {
        if (!roomIdByName.has(name.toLowerCase())) {
          const id = action.newId();
          rooms.push({ id, name, sortOrder: rooms.length });
          roomIdByName.set(name.toLowerCase(), id);
        }
      }
      const added = action.template.items.map((stub) =>
        createItem({
          id: action.newId(),
          itemType: stub.itemType,
          pricingStrategy: stub.pricingStrategy,
          roomId: roomIdByName.get(stub.room.toLowerCase()) ?? null,
          inputs: stub.inputs,
          sourceKind: "template",
          provenance: "template",
          now: action.now
        })
      );
      return { ...doc, rooms: renumberRooms(rooms), items: renumberItems([...doc.items, ...added]) };
    }
  }
}

export type RoomGroup = { room: EstimateRoom | null; items: EstimateItem[] };

/** Rooms in order, then project-level (unassigned) items last. Empty rooms are kept so they can receive items. */
export function groupItemsByRoom(doc: EstimateDocument): RoomGroup[] {
  const byRoom = new Map<string | null, EstimateItem[]>();
  for (const it of doc.items) {
    const key = it.roomId && doc.rooms.some((r) => r.id === it.roomId) ? it.roomId : null;
    const list = byRoom.get(key) ?? [];
    list.push(it);
    byRoom.set(key, list);
  }
  const groups: RoomGroup[] = doc.rooms.map((room) => ({ room, items: byRoom.get(room.id) ?? [] }));
  const unassigned = byRoom.get(null) ?? [];
  if (unassigned.length || !doc.rooms.length) groups.push({ room: null, items: unassigned });
  return groups;
}

/** Duplicate a whole estimate (new ids, provenance `duplicated`, saved-quote identity dropped by the caller). */
export function cloneDocument(doc: EstimateDocument, newId: () => string, keepHeader = true): EstimateDocument {
  const roomMap = new Map<string, string>();
  const rooms = doc.rooms.map((r) => {
    const id = newId();
    roomMap.set(r.id, id);
    return { ...r, id };
  });
  const items = doc.items.map(
    (it) =>
      ({
        ...it,
        id: newId(),
        roomId: it.roomId ? roomMap.get(it.roomId) ?? null : null,
        inputs: { ...it.inputs },
        source: { kind: "duplicate", provenance: "duplicated", reference: null },
        createdAt: null,
        updatedAt: null
      }) as EstimateItem
  );
  return { ...doc, header: keepHeader ? { ...doc.header } : emptyHeader(), rooms, items };
}

export function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
