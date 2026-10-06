import { useMemo, useState } from "react";
import type { CatalogProduct, EstimateCatalog, EstimateRoom, ProductTab, RoomEligibility } from "../lib/estimateTypes";
import type { QuickAddChoice } from "./AddItemMenu";
import { formatMoney } from "./format";

export type PickerTab = "addons" | ProductTab;

type AddonButton = QuickAddChoice & { key: string; opensEditor?: boolean };

/** One-click add-ons (quantity bumps if the room already has it). Edges and custom lines open the editor. */
const ADDON_SECTIONS: Array<{ title: string; items: AddonButton[] }> = [
  {
    title: "Cutouts",
    items: [
      { key: "sink", label: "Undermount sink cutout", itemType: "cutout", pricingStrategy: "addon_catalog", inputs: { cutoutCode: "qty-sink", qty: 1 } },
      { key: "bar", label: "Vanity / bar sink cutout", itemType: "cutout", pricingStrategy: "addon_catalog", inputs: { cutoutCode: "qty-bar", qty: 1 } },
      { key: "cook", label: "Cooktop cutout", itemType: "cutout", pricingStrategy: "addon_catalog", inputs: { cutoutCode: "qty-cook", qty: 1 } },
      { key: "outlet", label: "Outlet cutout", itemType: "outlet", pricingStrategy: "addon_catalog", inputs: { qty: 1 } }
    ]
  },
  {
    title: "Services",
    items: [
      { key: "tear", label: "Tear-out", itemType: "service", pricingStrategy: "service_catalog", inputs: { serviceCode: "tear_out", qty: 1 } },
      { key: "trip", label: "Additional trip", itemType: "service", pricingStrategy: "service_catalog", inputs: { serviceCode: "additional_trip", qty: 1 } }
    ]
  },
  {
    title: "Edges & other (opens details)",
    items: [
      { key: "edge", label: "Upgraded edge…", itemType: "edge", pricingStrategy: "edge_v2", inputs: { edgeMode: "upgraded" }, opensEditor: true },
      { key: "miter", label: "Mitered edge…", itemType: "edge", pricingStrategy: "edge_v2", inputs: { edgeMode: "mitered" }, opensEditor: true },
      { key: "custom", label: "Custom item…", itemType: "custom", pricingStrategy: "custom_line", opensEditor: true },
      { key: "credit", label: "Credit / discount…", itemType: "custom", pricingStrategy: "custom_line", inputs: { category: "credit" }, opensEditor: true }
    ]
  }
];

const ROOM_FILTERS: Array<{ key: RoomEligibility | "all"; label: string }> = [
  { key: "all", label: "All" },
  { key: "kitchen", label: "Kitchen" },
  { key: "bar_prep", label: "Bar & prep" },
  { key: "vanity", label: "Vanity" },
  { key: "laundry_utility", label: "Laundry" }
];

function roomFilterFor(roomName: string | undefined): RoomEligibility | "all" {
  const n = (roomName ?? "").toLowerCase();
  if (/bath|vanity|powder/.test(n)) return "vanity";
  if (/bar|prep|wet/.test(n)) return "bar_prep";
  if (/laundry|utility|mud/.test(n)) return "laundry_utility";
  if (/kitchen|island/.test(n)) return "kitchen";
  return "all";
}

const CUTOUT_HINT: Record<string, string> = { "qty-sink": "adds sink cutout", "qty-bar": "adds vanity/bar cutout" };

type Props = {
  catalog: EstimateCatalog;
  rooms: EstimateRoom[];
  initialRoomId: string | null;
  initialTab: PickerTab;
  onAddProduct: (product: CatalogProduct, variantId: string | null, roomId: string | null) => void;
  onAddAddon: (choice: QuickAddChoice, roomId: string | null) => void;
  onOpenEditorFor: (choice: QuickAddChoice, roomId: string | null) => void;
  onClose: () => void;
};

export default function CatalogPicker({ catalog, rooms, initialRoomId, initialTab, onAddProduct, onAddAddon, onOpenEditorFor, onClose }: Props) {
  const [tab, setTab] = useState<PickerTab>(initialTab);
  const [roomId, setRoomId] = useState<string | null>(initialRoomId);
  const [query, setQuery] = useState("");
  const [roomFilter, setRoomFilter] = useState<RoomEligibility | "all">(() => roomFilterFor(rooms.find((r) => r.id === initialRoomId)?.name));
  const [added, setAdded] = useState<Record<string, number>>({});
  const [lastAdded, setLastAdded] = useState("");

  const bump = (key: string, label: string) => {
    setAdded((a) => ({ ...a, [key]: (a[key] ?? 0) + 1 }));
    setLastAdded(label);
  };

  const products = useMemo(() => {
    if (tab === "addons") return [];
    const q = query.trim().toLowerCase();
    return catalog.products.products.filter((p) => {
      if (q) {
        const hay = `${p.displayName} ${p.manufacturer} ${p.sku ?? ""} ${p.categoryLabel} ${p.variants.map((v) => `${v.finish} ${v.sku}`).join(" ")}`.toLowerCase();
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      } else if (p.tab !== tab) {
        return false;
      }
      if (tab === "sinks" && !q && roomFilter !== "all" && !p.roomEligibility.includes(roomFilter)) return false;
      return true;
    });
  }, [catalog.products.products, tab, query, roomFilter]);

  const byManufacturer = useMemo(() => {
    const m = new Map<string, CatalogProduct[]>();
    for (const p of products) {
      const k = query.trim() ? p.categoryLabel.replace(/y$/, "ie") + "s" : p.manufacturer;
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()];
  }, [products, query]);

  const tabs: Array<{ key: PickerTab; label: string }> = [{ key: "addons", label: "Add-ons" }, ...catalog.products.tabs];

  return (
    <div className="eb-overlay" onClick={onClose}>
      <div
        className="eb-dialog eb-catalog"
        role="dialog"
        aria-modal="true"
        aria-label="Sinks, faucets and add-ons"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="eb-dialog-head">
          <h2>Add sinks, faucets &amp; add-ons</h2>
          <label className="eb-palette-room">
            <span>Room</span>
            <select
              value={roomId ?? ""}
              onChange={(e) => {
                const id = e.target.value || null;
                setRoomId(id);
                setRoomFilter(roomFilterFor(rooms.find((r) => r.id === id)?.name));
              }}
            >
              <option value="">Project (no room)</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="eb-icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="eb-catalog-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={tab === t.key ? "is-active" : ""}
              onClick={() => {
                setTab(t.key);
                setQuery("");
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "addons" ? (
          <div className="eb-catalog-body">
            {ADDON_SECTIONS.map((section) => (
              <section key={section.title} className="eb-catalog-section">
                <h3>{section.title}</h3>
                <div className="eb-addon-grid">
                  {section.items.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      className="eb-addon-btn"
                      onClick={() => {
                        if (a.opensEditor) {
                          onOpenEditorFor(a, roomId);
                          return;
                        }
                        onAddAddon(a, roomId);
                        bump(`addon:${a.key}`, a.label);
                      }}
                    >
                      <span>{a.opensEditor ? a.label : `+ ${a.label}`}</span>
                      {added[`addon:${a.key}`] ? <span className="eb-added">Added ×{added[`addon:${a.key}`]}</span> : null}
                    </button>
                  ))}
                </div>
              </section>
            ))}
            <p className="eb-hint">Clicking an add-on again adds one more to the same line. Pop-up outlets and other installed items are under Specialty.</p>
          </div>
        ) : (
          <>
            <div className="eb-catalog-filters">
              <input
                autoFocus
                className="eb-palette-search"
                placeholder="Search model, SKU, brand… (searches every tab)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search catalog"
              />
              {tab === "sinks" && !query.trim() ? (
                <div className="eb-segmented" role="radiogroup" aria-label="Room type">
                  {ROOM_FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      role="radio"
                      aria-checked={roomFilter === f.key}
                      className={roomFilter === f.key ? "is-active" : ""}
                      onClick={() => setRoomFilter(f.key)}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="eb-catalog-body" key={tab}>
              {byManufacturer.length === 0 ? <p className="eb-muted">No matching products.</p> : null}
              {byManufacturer.map(([group, list]) => (
                <section key={group} className="eb-catalog-section">
                  <h3>{group}</h3>
                  <ul className="eb-product-list">
                    {list.map((p) => (
                      <ProductRow
                        key={p.productId}
                        product={p}
                        addedCount={added[p.productId] ?? 0}
                        onAdd={(variantId, label) => {
                          onAddProduct(p, variantId, roomId);
                          bump(p.productId, label);
                        }}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}

        <div className="eb-catalog-foot">
          <span className="eb-muted eb-small" role="status">
            {lastAdded ? `Added ${lastAdded}` : `Prices from the ESF plumbing catalog${catalog.products.sourceVersion ? ` (${catalog.products.sourceVersion})` : ""}.`}
          </span>
          <span className="eb-spacer" />
          <button type="button" className="eb-btn eb-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/** Finish chips grouped by configuration; a single configuration gets no label. */
function variantGroups(p: CatalogProduct): Array<[string, CatalogProduct["variants"]]> {
  const groups = new Map<string, CatalogProduct["variants"]>();
  for (const v of p.variants) groups.set(v.style, [...(groups.get(v.style) ?? []), v]);
  if (groups.size === 1) return [["", p.variants]];
  return [...groups.entries()].map(([style, vs]) => [style || "Standard", vs]);
}

function ProductRow({ product: p, addedCount, onAdd }: { product: CatalogProduct; addedCount: number; onAdd: (variantId: string | null, label: string) => void }) {
  const short = p.displayName.length > 70 ? `${p.displayName.slice(0, 69)}…` : p.displayName;
  return (
    <li className="eb-product">
      <div className="eb-product-main">
        <span className="eb-product-name" title={p.displayName}>
          {short}
        </span>
        <span className="eb-product-sub">
          {[p.sku && !p.variants.length ? p.sku : null, p.stock ? "Stock" : "Special order", p.cutoutCode ? CUTOUT_HINT[p.cutoutCode] : null]
            .filter(Boolean)
            .join(" · ")}
          {addedCount ? <span className="eb-added"> · Added ×{addedCount}</span> : null}
        </span>
        {variantGroups(p).map(([style, variants]) => (
          <div key={style} className="eb-finishes" role="group" aria-label={`${p.displayName} ${style} finishes`}>
            {style ? <span className="eb-variant-style">{style}</span> : null}
            {variants.map((v) => (
              <button
                key={v.variantId}
                type="button"
                className="eb-chip"
                title={`${v.sku} · ${v.stock ? "Stock" : "Special order"}`}
                onClick={() => onAdd(v.variantId, [short, style, v.finish].filter(Boolean).join(" — "))}
              >
                + {v.finish} <span className="eb-muted">{formatMoney(v.price)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {!p.variants.length && p.price != null ? (
        <>
          <span className="eb-product-price">{formatMoney(p.price)}</span>
          <button type="button" className="eb-btn eb-btn-sm" onClick={() => onAdd(null, short)} aria-label={`Add ${p.displayName}`}>
            + Add
          </button>
        </>
      ) : null}
    </li>
  );
}
