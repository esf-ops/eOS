import { useEffect, useRef, useState, type ReactNode } from "react";
import { newId, type DocAction } from "../lib/estimateDocument";
import type {
  BacksplashInputs,
  CustomInputs,
  CutoutInputs,
  EdgeInputs,
  EliteCountertopInputs,
  EstimateCatalog,
  EstimateDocument,
  EstimateItem,
  MaterialColor,
  OutOfCollectionInputs,
  PricedItem,
  PricingStrategy,
  ProductInputs,
  ServiceInputs,
  VanityInputs
} from "../lib/estimateTypes";
import MaterialPicker from "./MaterialPicker";
import { itemFallbackLabel } from "./RoomSection";
import type { CalculatorTarget } from "./SqftCalculator";
import { formatMoney, formatQty, numValue, parseNum } from "./format";

type Props = {
  item: EstimateItem;
  priced: PricedItem | null;
  pricingPending: boolean;
  catalog: EstimateCatalog;
  doc: EstimateDocument;
  recentMaterials: string[];
  onRememberMaterial: (id: string | null) => void;
  dispatch: (a: DocAction) => void;
  onClose: () => void;
  onAddAnother: () => void;
  onOpenCalculator: (target: CalculatorTarget) => void;
  readOnly: boolean;
};

type OpenCalc = (kind: CalculatorTarget["kind"], onUse: (sqft: number) => void) => void;

function CalcLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="eb-link eb-calc-link" onClick={onClick}>
      Calculate square feet…
    </button>
  );
}

const STRATEGY_OPTIONS: Partial<Record<EstimateItem["itemType"], Array<{ value: PricingStrategy; label: string }>>> = {
  countertop: [
    { value: "elite_100", label: "Elite 100" },
    { value: "out_of_collection", label: "Out-of-Collection" }
  ],
  backsplash: [
    { value: "standard", label: "Standard" },
    { value: "full_height", label: "Full height" }
  ]
};

const TITLES: Record<EstimateItem["itemType"], string> = {
  countertop: "Countertop",
  backsplash: "Backsplash",
  vanity: "Vanity",
  cutout: "Sink / cutout",
  product: "Sink / faucet / accessory",
  outlet: "Electrical outlet cutout",
  edge: "Edge / fabrication upgrade",
  service: "Trip / service",
  custom: "Custom item",
  note: "Note"
};

export default function ItemEditor({
  item,
  priced,
  pricingPending,
  catalog,
  doc,
  recentMaterials,
  onRememberMaterial,
  dispatch,
  onClose,
  onAddAnother,
  onOpenCalculator,
  readOnly
}: Props) {
  const openCalc: OpenCalc = (kind, onUse) => onOpenCalculator({ kind, onUse });
  const panelRef = useRef<HTMLElement>(null);
  const setInputs = (inputs: Record<string, unknown>) => dispatch({ type: "update_item", id: item.id, patch: { inputs }, now: new Date().toISOString() });
  const setStrategy = (pricingStrategy: PricingStrategy) =>
    dispatch({ type: "update_item", id: item.id, patch: { pricingStrategy }, now: new Date().toISOString() });
  const pickMaterial = (c: MaterialColor) => {
    setInputs({ materialColorId: c.id, materialColorName: c.colorName });
    onRememberMaterial(c.id);
  };
  const strategies = STRATEGY_OPTIONS[item.itemType];

  useEffect(() => {
    const first = panelRef.current?.querySelector<HTMLElement>("[data-autofocus], input, select, textarea");
    first?.focus();
  }, []);

  return (
    <div className="eb-overlay eb-overlay-drawer" onClick={onClose}>
      <aside className="eb-drawer eb-editor" ref={panelRef} role="dialog" aria-modal="true" aria-label={`Edit ${TITLES[item.itemType]}`} onClick={(e) => e.stopPropagation()}>
        <div className="eb-drawer-head">
          <div>
            <p className="eb-kicker">{TITLES[item.itemType]}</p>
            <h2>{priced?.description || itemFallbackLabel(item)}</h2>
          </div>
          <button type="button" className="eb-icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <fieldset className="eb-drawer-body" disabled={readOnly}>
          {strategies ? (
            <div className="eb-segmented eb-segmented-wide" role="radiogroup" aria-label="Pricing strategy">
              {strategies.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={item.pricingStrategy === s.value}
                  className={item.pricingStrategy === s.value ? "is-active" : ""}
                  onClick={() => setStrategy(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : null}

          <ItemFields
            item={item}
            catalog={catalog}
            doc={doc}
            recentMaterials={recentMaterials}
            setInputs={setInputs}
            pickMaterial={pickMaterial}
            openCalc={readOnly ? null : openCalc}
            priced={priced}
          />

          {item.itemType !== "note" ? (
            <TextField
              label="Description on proposal"
              value={item.label}
              placeholder={priced?.description || itemFallbackLabel(item)}
              onChange={(v) => dispatch({ type: "update_item", id: item.id, patch: { label: v } })}
            />
          ) : null}

          <label className="eb-field">
            <span>Room</span>
            <select value={item.roomId ?? ""} onChange={(e) => dispatch({ type: "set_item_room", id: item.id, roomId: e.target.value || null })}>
              <option value="">Project (no room)</option>
              {doc.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>

          {item.itemType !== "note" ? (
            <>
              <PricingPanel priced={priced} pending={pricingPending} />
              <Advanced item={item} setInputs={setInputs} priced={priced} />
            </>
          ) : null}
        </fieldset>

        <div className="eb-drawer-foot">
          {!readOnly ? (
            <>
              <button
                type="button"
                className="eb-btn eb-btn-danger-ghost"
                onClick={() => {
                  dispatch({ type: "remove_item", id: item.id });
                  onClose();
                }}
              >
                Delete
              </button>
              <button
                type="button"
                className="eb-btn"
                onClick={() => dispatch({ type: "duplicate_item", id: item.id, newId: newId(), now: new Date().toISOString() })}
              >
                Duplicate
              </button>
            </>
          ) : null}
          <span className="eb-spacer" />
          {!readOnly ? (
            <button type="button" className="eb-btn" onClick={onAddAnother} title="Close this item and add the next one to the same room">
              Save &amp; add another
            </button>
          ) : null}
          <button type="button" className="eb-btn eb-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </aside>
    </div>
  );
}

// --- Per-type fields ---

function ItemFields({
  item,
  catalog,
  doc,
  recentMaterials,
  setInputs,
  pickMaterial,
  openCalc,
  priced
}: {
  item: EstimateItem;
  catalog: EstimateCatalog;
  doc: EstimateDocument;
  recentMaterials: string[];
  setInputs: (i: Record<string, unknown>) => void;
  pickMaterial: (c: MaterialColor) => void;
  openCalc: OpenCalc | null;
  priced: PricedItem | null;
}) {
  const calcFor = (kind: CalculatorTarget["kind"]) => (openCalc ? <CalcLink onClick={() => openCalc(kind, (sqft) => setInputs({ sqft }))} /> : null);
  switch (item.itemType) {
    case "countertop":
      return item.pricingStrategy === "elite_100" ? (
        <EliteFields inputs={item.inputs} catalog={catalog} recent={recentMaterials} setInputs={setInputs} pickMaterial={pickMaterial} calcLink={calcFor("counter")} />
      ) : (
        <OutOfCollectionFields inputs={item.inputs} catalog={catalog} priced={priced} setInputs={setInputs} calcLink={calcFor("counter")} />
      );
    case "backsplash":
      return (
        <BacksplashFields
          item={item}
          inputs={item.inputs}
          doc={doc}
          catalog={catalog}
          recent={recentMaterials}
          setInputs={setInputs}
          pickMaterial={pickMaterial}
          calcLink={calcFor("splash")}
        />
      );
    case "product":
      return <ProductFields inputs={item.inputs} catalog={catalog} setInputs={setInputs} />;
    case "vanity":
      return <VanityFields inputs={item.inputs} catalog={catalog} recent={recentMaterials} setInputs={setInputs} pickMaterial={pickMaterial} />;
    case "cutout":
      return <CutoutFields inputs={item.inputs} catalog={catalog} setInputs={setInputs} />;
    case "outlet":
      return (
        <NumField label="Quantity" value={item.inputs.qty} integer min={0} onChange={(v) => setInputs({ qty: v ?? 0 })} />
      );
    case "edge":
      return <EdgeFields inputs={item.inputs} catalog={catalog} setInputs={setInputs} />;
    case "service":
      return <ServiceFields inputs={item.inputs} catalog={catalog} setInputs={setInputs} />;
    case "custom":
      return <CustomFields inputs={item.inputs} catalog={catalog} setInputs={setInputs} />;
    case "note":
      return (
        <label className="eb-field">
          <span>Note (prints on the proposal, no price)</span>
          <textarea rows={4} maxLength={1000} value={item.inputs.text} data-autofocus="" onChange={(e) => setInputs({ text: e.target.value })} />
        </label>
      );
  }
}

type SetInputs = (i: Record<string, unknown>) => void;

function EliteFields({
  inputs,
  catalog,
  recent,
  setInputs,
  pickMaterial,
  calcLink
}: {
  inputs: EliteCountertopInputs;
  catalog: EstimateCatalog;
  recent: string[];
  setInputs: SetInputs;
  pickMaterial: (c: MaterialColor) => void;
  calcLink: ReactNode;
}) {
  return (
    <>
      <NumField label="Countertop square feet" value={inputs.sqft} suffix="sf" min={0} autoFocus onChange={(v) => setInputs({ sqft: v })} />
      {calcLink}
      <div className="eb-field">
        <span>Elite 100 color</span>
        <MaterialPicker colors={catalog.materialColors} valueId={inputs.materialColorId} valueName={inputs.materialColorName} recentIds={recent} onPick={pickMaterial} />
      </div>
    </>
  );
}

function BacksplashFields({
  item,
  inputs,
  doc,
  catalog,
  recent,
  setInputs,
  pickMaterial,
  calcLink
}: {
  item: EstimateItem;
  inputs: BacksplashInputs;
  doc: EstimateDocument;
  catalog: EstimateCatalog;
  recent: string[];
  setInputs: SetInputs;
  pickMaterial: (c: MaterialColor) => void;
  calcLink: ReactNode;
}) {
  const roomTop = doc.items.find(
    (it) => it.roomId === item.roomId && it.itemType === "countertop" && it.pricingStrategy === "elite_100"
  ) as (EstimateItem & { inputs: EliteCountertopInputs }) | undefined;
  return (
    <>
      <NumField label="Backsplash square feet" value={inputs.sqft} suffix="sf" min={0} autoFocus onChange={(v) => setInputs({ sqft: v })} />
      {calcLink}
      <div className="eb-field">
        <span>Material</span>
        <div className="eb-radio-row">
          <label>
            <input
              type="radio"
              checked={inputs.materialSource === "room_countertop"}
              onChange={() => setInputs({ materialSource: "room_countertop" })}
            />
            Match room countertop
            {inputs.materialSource === "room_countertop" ? (
              <span className="eb-muted eb-small">
                {" "}
                · {roomTop?.inputs.materialColorName || (item.roomId ? "no Elite 100 countertop in this room yet" : "put this item in a room")}
              </span>
            ) : null}
          </label>
          <label>
            <input type="radio" checked={inputs.materialSource === "explicit"} onChange={() => setInputs({ materialSource: "explicit" })} />
            Choose color
          </label>
        </div>
      </div>
      {inputs.materialSource === "explicit" ? (
        <MaterialPicker colors={catalog.materialColors} valueId={inputs.materialColorId} valueName={inputs.materialColorName} recentIds={recent} onPick={pickMaterial} />
      ) : null}
    </>
  );
}

function ProductFields({ inputs, catalog, setInputs }: { inputs: ProductInputs; catalog: EstimateCatalog; setInputs: SetInputs }) {
  const product = catalog.products.products.find((p) => p.productId === inputs.productId) ?? null;
  if (!product) {
    return <p className="eb-warn-text">This catalog product is no longer available. Delete this line and add a current product.</p>;
  }
  const variant = product.variants.find((v) => v.variantId === inputs.variantId) ?? null;
  const price = variant?.price ?? product.price;
  return (
    <>
      <div className="eb-product-card">
        <strong>{product.displayName}</strong>
        <span className="eb-muted eb-small">
          {[product.manufacturer, variant?.sku ?? product.sku, (variant?.stock ?? product.stock) ? "Stock" : "Special order", price != null ? formatMoney(price) : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <div className="eb-grid-2">
        {product.variants.length ? (
          <label className="eb-field">
            <span>Finish</span>
            <select data-autofocus value={inputs.variantId ?? ""} onChange={(e) => setInputs({ variantId: e.target.value || null })}>
              <option value="">Choose finish…</option>
              {product.variants.map((v) => (
                <option key={v.variantId} value={v.variantId}>
                  {[v.style, v.finish].filter(Boolean).join(" · ")} — {formatMoney(v.price)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <NumField label="Quantity" value={inputs.qty} integer min={1} autoFocus={!product.variants.length} onChange={(v) => setInputs({ qty: v ?? 1 })} />
      </div>
      {product.cutoutCode ? (
        <p className="eb-hint">
          Needs a {product.cutoutCode === "qty-bar" ? "vanity/bar" : "sink"} cutout in the same room — one is added automatically from the catalog picker.
        </p>
      ) : null}
    </>
  );
}

function OutOfCollectionFields({
  inputs,
  catalog,
  priced,
  setInputs,
  calcLink
}: {
  inputs: OutOfCollectionInputs;
  catalog: EstimateCatalog;
  priced: PricedItem | null;
  setInputs: SetInputs;
  calcLink: ReactNode;
}) {
  const { costMultiplier, defaultWastePercent } = catalog.outOfCollection;
  const slabs = priced?.slabs ?? null;
  const [overrideOpen, setOverrideOpen] = useState(inputs.slabQuantityOverride != null);
  return (
    <>
      <div className="eb-grid-2">
        <TextField label="Material name" value={inputs.materialName} autoFocus onChange={(v) => setInputs({ materialName: v })} />
        <TextField label="Supplier" value={inputs.supplier} onChange={(v) => setInputs({ supplier: v })} />
      </div>
      <NumField label="Countertop square feet" value={inputs.sqft} suffix="sf" min={0} onChange={(v) => setInputs({ sqft: v })} />
      {calcLink}
      <div className="eb-grid-3">
        <NumField label="Slab length" value={inputs.slabLengthIn} suffix="in" min={0} placeholder="126" onChange={(v) => setInputs({ slabLengthIn: v })} />
        <NumField label="Slab width" value={inputs.slabWidthIn} suffix="in" min={0} placeholder="63" onChange={(v) => setInputs({ slabWidthIn: v })} />
        <NumField label="Cost per slab" value={inputs.costPerSlab} prefix="$" min={0} onChange={(v) => setInputs({ costPerSlab: v })} />
      </div>
      <div className="eb-grid-2">
        <NumField
          label="Waste"
          value={inputs.wastePercent ?? defaultWastePercent}
          suffix="%"
          min={0}
          onChange={(v) => setInputs({ wastePercent: v == null || v === defaultWastePercent ? null : v })}
        />
        <div className="eb-field">
          <span>Slabs needed</span>
          <div className="eb-slab-count">
            {slabs ? (
              <>
                <strong>{slabs.priced}</strong>
                <span className="eb-muted">
                  {slabs.requiredWithWasteSf} sf ÷ {slabs.slabAreaSf} sf per slab
                  {slabs.priced !== slabs.suggested ? ` · calculated ${slabs.suggested}` : ""}
                </span>
              </>
            ) : (
              <span className="eb-muted">Enter sf, slab size and cost</span>
            )}
          </div>
        </div>
      </div>
      <p className="eb-hint">
        Price = slabs × cost per slab × {costMultiplier} (covers fabrication and install). Waste defaults to {defaultWastePercent}%.
      </p>
      {overrideOpen ? (
        <div className="eb-grid-2">
          <NumField
            label="Slabs (override)"
            value={inputs.slabQuantityOverride}
            integer
            min={1}
            placeholder={slabs ? String(slabs.suggested) : ""}
            onChange={(v) => setInputs({ slabQuantityOverride: v })}
          />
          <TextField label="Reason" value={inputs.overrideReason} placeholder="e.g. bookmatch, seam layout" onChange={(v) => setInputs({ overrideReason: v })} />
        </div>
      ) : (
        <button type="button" className="eb-link" onClick={() => setOverrideOpen(true)}>
          Use a different slab count…
        </button>
      )}
    </>
  );
}

function VanityFields({
  inputs,
  catalog,
  recent,
  setInputs,
  pickMaterial
}: {
  inputs: VanityInputs;
  catalog: EstimateCatalog;
  recent: string[];
  setInputs: SetInputs;
  pickMaterial: (c: MaterialColor) => void;
}) {
  const singles = catalog.vanity.sizes.filter((s) => s.bowlCount === 1);
  const doubles = catalog.vanity.sizes.filter((s) => s.bowlCount === 2);
  return (
    <>
      <div className="eb-grid-2">
        <label className="eb-field">
          <span>Vanity size</span>
          <select data-autofocus value={inputs.sizeCode} onChange={(e) => setInputs({ sizeCode: e.target.value })}>
            <option value="">Choose size…</option>
            <optgroup label="Single bowl">
              {singles.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Double bowl">
              {doubles.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <NumField label="Quantity" value={inputs.qty} integer min={1} onChange={(v) => setInputs({ qty: v ?? 1 })} />
      </div>
      <div className="eb-grid-2">
        <label className="eb-field">
          <span>Bowls</span>
          <select value={inputs.sinkType} onChange={(e) => setInputs({ sinkType: e.target.value })}>
            {catalog.vanity.sinkTypes.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="eb-field">
          <span>Side splash</span>
          <select value={inputs.sideSplashQty} onChange={(e) => setInputs({ sideSplashQty: Number(e.target.value) })}>
            <option value={0}>None</option>
            <option value={1}>1 piece</option>
            <option value={2}>2 pieces</option>
          </select>
        </label>
      </div>
      <div className="eb-field">
        <span>Elite 100 color</span>
        <MaterialPicker colors={catalog.materialColors} valueId={inputs.materialColorId} valueName={inputs.materialColorName} recentIds={recent} onPick={pickMaterial} />
      </div>
      <p className="eb-hint">Vanity Program tops include the bowl cutouts — don’t add separate vanity bowl cutouts for this vanity.</p>
    </>
  );
}

function CutoutFields({ inputs, catalog, setInputs }: { inputs: CutoutInputs; catalog: EstimateCatalog; setInputs: SetInputs }) {
  return (
    <div className="eb-grid-2">
      <label className="eb-field">
        <span>Cutout</span>
        <select data-autofocus value={inputs.cutoutCode} onChange={(e) => setInputs({ cutoutCode: e.target.value })}>
          {catalog.cutouts.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <NumField label="Quantity" value={inputs.qty} integer min={0} onChange={(v) => setInputs({ qty: v ?? 0 })} />
    </div>
  );
}

function EdgeFields({ inputs, catalog, setInputs }: { inputs: EdgeInputs; catalog: EstimateCatalog; setInputs: SetInputs }) {
  return (
    <>
      <div className="eb-segmented eb-segmented-wide" role="radiogroup" aria-label="Edge type">
        {(
          [
            ["upgraded", "Upgraded profile"],
            ["mitered", "Mitered"],
            ["manual", "Custom profile"]
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={inputs.edgeMode === mode}
            className={inputs.edgeMode === mode ? "is-active" : ""}
            onClick={() => setInputs({ edgeMode: mode })}
          >
            {label}
          </button>
        ))}
      </div>
      {inputs.edgeMode === "upgraded" ? (
        <div className="eb-grid-2">
          <label className="eb-field">
            <span>Profile</span>
            <select value={inputs.profile} onChange={(e) => setInputs({ profile: e.target.value })}>
              <option value="">Choose profile…</option>
              {catalog.edge.upgradedProfiles.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <NumField label="Linear feet" value={inputs.linearFeet} suffix="lf" min={0} onChange={(v) => setInputs({ linearFeet: v })} />
        </div>
      ) : inputs.edgeMode === "mitered" ? (
        <>
          <div className="eb-grid-2">
            <label className="eb-field">
              <span>Miter height</span>
              <select value={inputs.miterHeight} onChange={(e) => setInputs({ miterHeight: e.target.value })}>
                <option value="">Choose height…</option>
                {catalog.edge.miterHeights.map((h) => (
                  <option key={h} value={h}>
                    {h.replace("in", "″")}
                  </option>
                ))}
              </select>
            </label>
            <NumField label="Linear feet" value={inputs.linearFeet} suffix="lf" min={0} onChange={(v) => setInputs({ linearFeet: v })} />
          </div>
          <NumField label="Build-up (optional)" value={inputs.buildUpSqft} suffix="sf" min={0} onChange={(v) => setInputs({ buildUpSqft: v })} />
        </>
      ) : (
        <>
          <TextField label="Customer-facing label" value={inputs.customerLabel} onChange={(v) => setInputs({ customerLabel: v })} />
          <div className="eb-grid-2">
            <NumField label="Amount" value={inputs.manualAmount} prefix="$" min={0} onChange={(v) => setInputs({ manualAmount: v })} />
            <TextField label="Internal reason (required)" value={inputs.manualReason} onChange={(v) => setInputs({ manualReason: v })} />
          </div>
        </>
      )}
    </>
  );
}

function ServiceFields({ inputs, catalog, setInputs }: { inputs: ServiceInputs; catalog: EstimateCatalog; setInputs: SetInputs }) {
  return (
    <div className="eb-grid-2">
      <label className="eb-field">
        <span>Service</span>
        <select data-autofocus value={inputs.serviceCode} onChange={(e) => setInputs({ serviceCode: e.target.value })}>
          {catalog.services.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <NumField label="Quantity" value={inputs.qty} integer min={0} onChange={(v) => setInputs({ qty: v ?? 0 })} />
    </div>
  );
}

function CustomFields({ inputs, catalog, setInputs }: { inputs: CustomInputs; catalog: EstimateCatalog; setInputs: SetInputs }) {
  const isCredit = inputs.category === "credit";
  return (
    <>
      <TextField label={isCredit ? "Credit description" : "Description"} value={inputs.description} autoFocus onChange={(v) => setInputs({ description: v })} />
      <div className="eb-grid-3">
        <NumField label="Qty" value={inputs.qty} min={0} onChange={(v) => setInputs({ qty: v ?? 0 })} />
        <TextField label="Unit" value={inputs.unit} onChange={(v) => setInputs({ unit: v })} />
        <NumField
          label={isCredit ? "Credit per unit" : "Unit price"}
          value={inputs.unitPrice}
          prefix="$"
          min={0}
          onChange={(v) => setInputs({ unitPrice: v })}
        />
      </div>
      <label className="eb-field">
        <span>Category</span>
        <select value={inputs.category} onChange={(e) => setInputs({ category: e.target.value })}>
          {catalog.customCategories.map((c) => (
            <option key={c} value={c}>
              {c[0].toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <TextField label="Customer note (optional)" value={inputs.customerNote} onChange={(v) => setInputs({ customerNote: v })} />
    </>
  );
}

// --- Pricing + advanced ---

function PricingPanel({ priced, pending }: { priced: PricedItem | null; pending: boolean }) {
  if (!priced) {
    return <div className="eb-price-panel is-stale">{pending ? "Pricing…" : "Not priced yet."}</div>;
  }
  return (
    <div className={`eb-price-panel${pending ? " is-stale" : ""}`} aria-live="polite">
      <div className="eb-price-row">
        <span className="eb-price-label">
          {priced.status === "priced" && priced.quantity != null
            ? `${formatQty(priced.quantity, priced.unit)}${priced.rate != null ? ` × ${formatMoney(priced.rate)}` : ""}`
            : priced.status === "incomplete"
              ? "Needs details"
              : "Pricing error"}
        </span>
        <span className="eb-price-amount">{priced.status === "priced" ? formatMoney(priced.amount) : "—"}</span>
      </div>
      {priced.status === "priced" && (priced.useTaxAmount > 0 || priced.roundingAdjustment !== 0) ? (
        <p className="eb-price-math">
          {formatMoney(priced.exactAmount)}
          {priced.useTaxAmount > 0 ? ` + ${formatMoney(priced.useTaxAmount)} use tax` : ""}
          {priced.roundingAdjustment !== 0 ? ` → rounded up to ${formatMoney(priced.amount)}` : ""}
        </p>
      ) : null}
      {priced.warnings.length ? (
        <ul className="eb-warning-list">
          {priced.warnings.map((w) => (
            <li key={w.code} className={`eb-warning eb-warning-${w.severity}`}>
              {w.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Advanced({ item, priced, setInputs }: { item: EstimateItem; priced: PricedItem | null; setInputs: SetInputs }) {
  const [open, setOpen] = useState(false);
  let extra: ReactNode = null;
  if (item.itemType === "vanity") {
    const i = item.inputs;
    extra = (
      <>
        <div className="eb-grid-2">
          <NumField label="Vanity depth" value={i.depthIn} suffix="in" min={0} placeholder="Standard" onChange={(v) => setInputs({ depthIn: v })} />
          <NumField label="Extra trips" value={i.extraTrips} integer min={0} onChange={(v) => setInputs({ extraTrips: v ?? 0 })} />
        </div>
        <label className="eb-field">
          <span>Program tier</span>
          <select value={i.tierOverride ?? ""} onChange={(e) => setInputs({ tierOverride: e.target.value || null })}>
            <option value="">Automatic (from kitchen countertop sf)</option>
            <option value="kitchen_over_35">Kitchen ≥ 35 sf</option>
            <option value="kitchen_under_35">Kitchen &lt; 35 sf</option>
          </select>
        </label>
        {i.tierOverride ? (
          <TextField label="Override reason (required)" value={i.tierOverrideReason} onChange={(v) => setInputs({ tierOverrideReason: v })} />
        ) : null}
      </>
    );
  } else if (item.itemType === "custom") {
    const i = item.inputs;
    extra = (
      <>
        <label className="eb-check">
          <input type="checkbox" checked={i.customerFacing} onChange={(e) => setInputs({ customerFacing: e.target.checked })} />
          Show as its own line on the customer estimate
        </label>
        <label className="eb-field">
          <span>Internal note</span>
          <textarea rows={2} value={i.internalNote} onChange={(e) => setInputs({ internalNote: e.target.value })} />
        </label>
      </>
    );
  }

  return (
    <div className="eb-advanced">
      <button type="button" className="eb-advanced-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "▾" : "▸"} Advanced pricing
      </button>
      {open ? (
        <div className="eb-advanced-body">
          {extra}
          {priced?.details.length ? (
            <dl className="eb-details">
              {priced.details.map((d, idx) => (
                <div key={`${d.label}-${idx}`}>
                  <dt>{d.label}</dt>
                  <dd>{d.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {priced ? (
            <p className="eb-muted eb-small">
              Priced by {priced.pricingSource.engine} · {priced.pricingSource.reference}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// --- Inputs ---

function TextField({
  label,
  value,
  onChange,
  autoFocus,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="eb-field">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} data-autofocus={autoFocus ? "" : undefined} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Keeps the raw text locally so partial entries like "4." survive while the parsed value drives pricing. */
function NumField({
  label,
  value,
  onChange,
  suffix,
  prefix,
  min,
  step,
  integer,
  autoFocus,
  placeholder
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  suffix?: string;
  prefix?: string;
  min?: number;
  step?: number;
  integer?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(numValue(value));
  useEffect(() => {
    if (parseNum(text) !== value) setText(numValue(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="eb-field">
      <span>{label}</span>
      <span className="eb-num">
        {prefix ? <span className="eb-affix">{prefix}</span> : null}
        <input
          inputMode={integer ? "numeric" : "decimal"}
          value={text}
          placeholder={placeholder}
          data-autofocus={autoFocus ? "" : undefined}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            let n = parseNum(raw);
            if (n != null && integer) n = Math.floor(n);
            if (n != null && min != null && n < min) return;
            onChange(n);
          }}
          step={step}
        />
        {suffix ? <span className="eb-affix">{suffix}</span> : null}
      </span>
    </label>
  );
}
