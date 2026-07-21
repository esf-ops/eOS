/**
 * Lovable customer quote UI — adapted from hub-spoke-hub q.$token.tsx.
 * Pricing / accept / Supabase / client totals removed. Brain APIs only.
 * Room options consume envelope options / config.products — never hard-coded catalogs.
 */
import { Component, useEffect, useId, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import {
  buildSelectionItems,
  groupColorsByPricingGroup,
  mapEliteOsToLovableViewModel,
  normalizeBacksplashLabel,
  resolveProductOptionKey,
  type CustomerInfoDraft,
  type LovableChoiceOption,
  type LovableColor,
  type LovableRoom,
} from "./lovableViewModel";
import {
  buildChangesBreakdown,
  buildUpdatedBreakdown,
  groupBreakdownLinesByRoom,
} from "./customerEstimateBreakdown";
import { summarizeSideSplashSelections } from "./sideSplashSummary";
import { buildDigitalEstimatePrintModel } from "./customerPrintAdapter";
import { DigitalEstimatePrintDocument } from "./DigitalEstimatePrintDocument";
import { enrichProductImageUrl, resolveProductImageFields } from "./productCatalogImages";
import {
  groupMissingInformationRequirements,
  missingInfoHeadline,
} from "./itemsForLater";
import { normalizeCatalogPermissions } from "./catalogPermissions";
import {
  exchangeFragmentToken,
  fetchConfiguration,
  fetchCurrentReviewRequest,
  formatDate,
  reviewUiEnabled,
  saveConfigurationSelections,
  submitReviewRequest,
  type BacksplashDraft,
  type ConfigurationSaveError,
  type ConfigurationState,
  type ConfigProduct,
  type CustomerReviewRequest,
  type ProductDraft,
  type RoomProductDrafts,
} from "./publicConfigApi";

type Props = {
  state: ConfigurationState;
  onState: (next: ConfigurationState) => void;
  onFatal: () => void;
  /** Stable publication token for session recovery after cookie loss. */
  accessToken?: string | null;
};

class ConfiguratorErrorBoundary extends Component<
  { children: ReactNode; onRetry?: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Safe internal diagnostic only — never render stack/variable names publicly.
    console.error("de_configurator_error", {
      name: error?.name,
      message: String(error?.message || "").slice(0, 200),
      componentStack: String(info?.componentStack || "").slice(0, 400),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-lg p-8 text-center" data-testid="de-configurator-error">
          <p className="text-base font-medium text-foreground">
            We couldn’t save that change. Please try again.
          </p>
          <button
            type="button"
            className="mt-4 rounded-lg border border-border px-4 py-2 text-sm"
            onClick={() => {
              this.setState({ hasError: false });
              this.props.onRetry?.();
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ConfigurationView(props: Props) {
  return (
    <ConfiguratorErrorBoundary>
      <ConfigurationViewInner {...props} />
    </ConfiguratorErrorBoundary>
  );
}

type ModalKind =
  | "color"
  | "backsplash"
  | "sink"
  | "faucet"
  | "accessories"
  | "cooktop"
  | "edge"
  | "specialty"
  | "sidesplash"
  | "notes"
  | null;

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${muted ? "text-muted-foreground" : "text-foreground"}`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function GroupChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function MaterialThumb({
  src,
  alt,
  className,
  size = "md",
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const [broken, setBroken] = useState(false);
  const dim = size === "sm" ? "h-10 w-10" : size === "lg" ? "h-28 w-full" : "h-16 w-16";
  const showImg = Boolean(src) && !broken;
  return (
    <span
      className={`relative inline-flex shrink-0 overflow-hidden rounded-md border border-border/60 ${dim} ${className || ""}`}
      data-testid="de-material-thumb"
      data-has-image={showImg ? "true" : "false"}
    >
      {showImg ? (
        <img
          src={src!}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center bg-[linear-gradient(145deg,#ebe8e0_0%,#d8d4c8_48%,#cfcabf_100%)] text-[10px] font-medium uppercase tracking-wider text-[#6b6560]"
          aria-hidden
          data-testid="de-material-placeholder"
        >
          <span className="px-1 text-center leading-tight">{alt.slice(0, 18) || "No image"}</span>
        </span>
      )}
    </span>
  );
}

function ModalShell({
  title,
  eyebrow,
  onClose,
  children,
  wide,
  testId,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  testId?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
      data-testid={testId}
    >
      <div
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-background shadow-2xl sm:max-h-[90vh] sm:rounded-2xl ${
          wide ? "max-w-[1200px]" : "max-w-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-layout={wide ? "wide-catalog" : "compact"}
      >
        <div className="sticky top-0 z-10 border-b border-border bg-background px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              {eyebrow ? (
                <div className="text-xs uppercase tracking-widest text-muted-foreground">{eyebrow}</div>
              ) : null}
              <div className="mt-0.5 text-lg font-semibold text-foreground">{title}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              data-testid="de-modal-done"
            >
              Done
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function ColorPickerModal({
  room,
  onSelect,
  onClose,
}: {
  room: LovableRoom;
  onSelect: (color: LovableColor) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => groupColorsByPricingGroup(room.colors), [room.colors]);
  const [activeGroup, setActiveGroup] = useState<string>("All");
  const [previewId, setPreviewId] = useState(room.selectedColorId);
  const [previewBroken, setPreviewBroken] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    // "All" is always valid — never snap back to the first pricing group.
    if (activeGroup === "All") return;
    if (!groups.some((g) => g.label === activeGroup) && groups[0]) {
      setActiveGroup(groups[0].label);
    }
  }, [groups, activeGroup]);

  useEffect(() => {
    setPreviewBroken(false);
  }, [previewId]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const pool =
      activeGroup === "All"
        ? room.colors
        : groups.find((g) => g.label === activeGroup)?.colors || room.colors;
    return pool.filter((c) =>
      query
        ? (c.name + " " + c.collectionLabel + " " + c.pricingGroupLabel)
            .toLowerCase()
            .includes(query)
        : true,
    );
  }, [q, room.colors, groups, activeGroup]);

  const preview =
    filtered.find((c) => c.id === previewId) ||
    room.colors.find((c) => c.id === previewId) ||
    filtered[0] ||
    room.colors[0] ||
    null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
      data-testid="de-color-modal"
    >
      <div
        className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-background shadow-2xl sm:h-[85vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Pick a color for ${room.name}`}
      >
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                {room.name} · pick a color
              </div>
              <div className="mt-0.5 text-lg font-semibold text-foreground">Elite 100 collection</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search color"
              data-testid="de-color-search"
              className="w-56 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <GroupChip
              active={activeGroup === "All"}
              label={`All (${room.colors.length})`}
              onClick={() => setActiveGroup("All")}
            />
            {groups.map((g) => (
              <GroupChip
                key={g.label}
                active={activeGroup === g.label}
                label={`${g.label} (${g.colors.length})`}
                onClick={() => setActiveGroup(g.label)}
              />
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 py-5 lg:flex-row">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {filtered.map((c) => {
                const selected = c.id === room.selectedColorId;
                const previewing = c.id === preview?.id;
                return (
                  <button
                    key={c.optionKey}
                    type="button"
                    disabled={!c.selectable}
                    onClick={() => onSelect(c)}
                    onMouseEnter={() => setPreviewId(c.id)}
                    onFocus={() => setPreviewId(c.id)}
                    data-testid="de-color-card"
                    data-group={c.pricingGroupLabel}
                    className={`group relative overflow-hidden rounded-xl border text-left transition ${
                      selected
                        ? "border-foreground bg-foreground/5 shadow-sm ring-2 ring-foreground/25"
                        : previewing
                          ? "border-foreground/50"
                          : "border-border hover:border-foreground/40 hover:shadow-sm"
                    } disabled:opacity-50`}
                  >
                    {selected ? (
                      <span
                        className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background"
                        data-testid="de-color-selected-badge"
                      >
                        <span aria-hidden>✓</span> Selected
                      </span>
                    ) : null}
                    <MaterialThumb src={c.imageThumb} alt={c.name} size="lg" className="rounded-none border-0 border-b border-border/60" />
                    <div className="px-3 py-2">
                      <div className="truncate text-xs font-medium text-foreground">{c.name}</div>
                      <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {c.pricingGroupLabel}
                        {c.includedInBaseline ? " · Original selection" : ""}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {!filtered.length ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No colors match &quot;{q || activeGroup}&quot;.
              </div>
            ) : null}
          </div>

          {preview ? (
            <aside
              className="hidden w-56 shrink-0 flex-col rounded-xl border border-border bg-muted/20 p-3 lg:flex"
              data-testid="de-color-preview"
            >
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Preview</div>
              <div className="mt-2 overflow-hidden rounded-lg border border-border bg-background">
                {(preview.imageFull || preview.imageThumb) && !previewBroken ? (
                  <img
                    src={preview.imageFull || preview.imageThumb || undefined}
                    alt={preview.name}
                    loading="lazy"
                    decoding="async"
                    className="aspect-square w-full object-cover"
                    data-testid="de-color-preview-full"
                    data-preview-src={preview.imageFull ? "full" : "thumb"}
                    onError={() => setPreviewBroken(true)}
                  />
                ) : (
                  <MaterialThumb src={null} alt={preview.name} size="lg" className="aspect-square h-auto min-h-[10rem] w-full rounded-none border-0" />
                )}
              </div>
              <div className="mt-3 text-sm font-medium text-foreground">{preview.name}</div>
              <div className="text-xs text-muted-foreground">{preview.pricingGroupLabel}</div>
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ChoiceRadio({
  options,
  name,
  onSelect,
}: {
  options: LovableChoiceOption[];
  name: string;
  onSelect: (optionKey: string) => void;
}) {
  if (!options.length) return null;
  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label={name}>
      {options.map((opt) => (
        <label
          key={opt.optionKey}
          data-selected={opt.selected ? "true" : "false"}
          data-testid="de-choice-option"
          className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-foreground ${
            opt.selected
              ? "border-foreground bg-foreground/5 ring-2 ring-foreground/20"
              : "border-border bg-background hover:border-foreground/40"
          }`}
        >
          <span className="min-w-0 flex-1">
            {opt.selected ? (
              <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-background">
                <span aria-hidden>✓</span> Selected
              </span>
            ) : null}
            <span className="block font-semibold text-foreground">{opt.displayLabel}</span>
            {opt.priceEffectLabel ? (
              <span className="mt-0.5 block text-xs font-medium tabular-nums text-foreground">
                {opt.priceEffectLabel}
              </span>
            ) : opt.includedInBaseline ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">Original selection</span>
            ) : null}
            {opt.availabilityText ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">{opt.availabilityText}</span>
            ) : null}
          </span>
          <input
            type="radio"
            name={name}
            checked={opt.selected}
            disabled={opt.selectable === false}
            onChange={() => onSelect(opt.optionKey)}
            className="mt-1 h-4 w-4"
            aria-label={opt.displayLabel}
          />
        </label>
      ))}
    </div>
  );
}

function ProductCards({
  products,
  selectedOptionKey,
  onPick,
  role,
}: {
  products: ConfigProduct[];
  selectedOptionKey: string | null;
  onPick: (product: ConfigProduct, variantId?: string | null) => void;
  role: "sink" | "faucet";
}) {
  const [openFamily, setOpenFamily] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      const cat = customerFacingFaucetCategory(p.category) || null;
      if (cat) set.add(cat);
    }
    return ["All", ...Array.from(set).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== "All") {
        const cat = customerFacingFaucetCategory(p.category);
        if (cat !== categoryFilter) return false;
      }
      if (!q) return true;
      const hay = [p.displayName, p.manufacturer, p.model, p.finish, p.description, p.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [products, query, categoryFilter]);

  if (!products.length) {
    return (
      <p className="text-sm text-muted-foreground" data-testid={`de-${role}-esf-empty`}>
        No ESF {role} options are available for this room yet. Your estimator can add them.
      </p>
    );
  }
  return (
    <div className="space-y-4" data-testid={`de-${role}-product-catalog`}>
      <div className="sticky top-0 z-10 -mx-1 space-y-2 bg-background/95 px-1 py-2 backdrop-blur">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${role === "sink" ? "sinks" : "faucets"}…`}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          data-testid={`de-${role}-catalog-search`}
          aria-label={`Search ${role}s`}
        />
        {role === "faucet" && categories.length > 2 ? (
          <div className="flex flex-wrap gap-1.5" data-testid="de-faucet-category-filters">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  categoryFilter === c
                    ? "bg-foreground text-background"
                    : "border border-border text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setCategoryFilter(c)}
              >
                {c}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {!filtered.length ? (
        <p className="text-sm text-muted-foreground">No products match your search.</p>
      ) : (
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          data-testid={`de-${role}-product-grid`}
        >
          {filtered.map((p) => {
            const variants = Array.isArray(p.variants) ? p.variants : [];
            const hasVariants = variants.length > 0;
            const familyOpen = openFamily === p.productId;
            const selected =
              selectedOptionKey &&
              (selectedOptionKey === p.optionKey ||
                variants.some((v) => v.optionKey === selectedOptionKey));
            const imageUrl = enrichProductImageUrl(p) || p.imageUrl;
            const faucetCat = customerFacingFaucetCategory(p.category);
            const metaBits = [
              p.manufacturer,
              p.model,
              role === "faucet" ? faucetCat : null,
              role === "sink" ? sinkBowlLabel(p) : null,
              role === "sink" ? sinkDimensionLabel(p) : null,
            ].filter(Boolean);
            const priceLabel =
              p.visibleDelta != null && Number.isFinite(Number(p.visibleDelta))
                ? Number(p.visibleDelta) >= 0
                  ? `+$${Math.round(Number(p.visibleDelta)).toLocaleString("en-US")}`
                  : `−$${Math.round(Math.abs(Number(p.visibleDelta))).toLocaleString("en-US")}`
                : p.visibleSellPrice != null && Number.isFinite(Number(p.visibleSellPrice))
                  ? `+$${Math.round(Number(p.visibleSellPrice)).toLocaleString("en-US")}`
                  : null;
            return (
              <div
                key={p.productId}
                className={`rounded-xl border p-3 ${selected ? "border-foreground ring-1 ring-foreground/20" : "border-border"}`}
                data-testid={`de-${role}-product-card`}
                data-product-id={p.productId}
              >
                <div className="flex gap-3">
                  <MaterialThumb src={imageUrl} alt={p.displayName} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-snug text-foreground" title={p.displayName}>
                      {p.displayName}
                    </div>
                    {metaBits.length ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">{metaBits.join(" · ")}</div>
                    ) : null}
                    {priceLabel ? (
                      <div className="mt-1 text-[11px] font-medium text-foreground" data-testid="de-product-price-effect">
                        {priceLabel}
                      </div>
                    ) : null}
                  </div>
                </div>
                {hasVariants ? (
                  <div className="mt-3">
                    <button
                      type="button"
                      className="text-xs font-medium text-foreground underline-offset-2 hover:underline"
                      onClick={() => setOpenFamily(familyOpen ? null : p.productId)}
                    >
                      {familyOpen ? "Hide finishes" : "Choose finish"}
                    </button>
                    {familyOpen ? (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {variants.map((v) => (
                          <button
                            key={v.variantId}
                            type="button"
                            className={`rounded-lg border px-3 py-2 text-left text-xs ${
                              v.optionKey && v.optionKey === selectedOptionKey
                                ? "border-foreground bg-muted/40"
                                : "border-border"
                            }`}
                            onClick={() => onPick(p, v.variantId)}
                          >
                            <span className="font-medium text-foreground">
                              {v.finish || v.color || v.displayName || v.sku || "Finish"}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="mt-3 w-full rounded-lg border border-border py-2 text-xs font-medium hover:border-foreground/40"
                    onClick={() => onPick(p, null)}
                  >
                    Select
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function customerFacingFaucetCategory(category: string | null | undefined): string | null {
  const c = String(category || "").toLowerCase();
  if (!c) return null;
  if (c.includes("kitchen_faucet") || c === "kitchen faucet") return "Kitchen faucet";
  if (c.includes("bar_prep") || c.includes("bar/prep")) return "Bar/prep faucet";
  if (c.includes("bathroom") || c.includes("vanity")) return "Bathroom faucet";
  if (c.includes("beverage")) return "Beverage faucet";
  return null;
}

function sinkBowlLabel(p: ConfigProduct): string | null {
  const raw = String((p as { bowlConfiguration?: string }).bowlConfiguration || p.description || "");
  const m = raw.match(/\b(\d[\d/]*\s*(?:bowl|station)|single|double|50\/50|60\/40|70\/30|workstation)\b/i);
  return m ? m[0] : null;
}

function sinkDimensionLabel(p: ConfigProduct): string | null {
  const raw = String(
    (p as { dimensionsLabel?: string; overallSize?: string }).dimensionsLabel ||
      (p as { overallSize?: string }).overallSize ||
      p.model ||
      "",
  );
  const m = raw.match(/\b\d{2,}\s*[x×]\s*\d{2,}(?:\s*[x×]\s*\d{1,})?\b/i);
  return m ? m[0].replace(/×/g, "x") : null;
}

function findOptionBySource(
  options: LovableChoiceOption[],
  role: string,
  kind: "none" | "customer_provided" | "esf",
): LovableChoiceOption | undefined {
  const pool = options.filter((o) => o.role === role);
  if (kind === "none") return pool.find((o) => o.sourceKind === "none");
  if (kind === "customer_provided") return pool.find((o) => o.sourceKind === "customer_provided");
  return pool.find((o) => o.sourceKind === "esf" || o.sourceKind === "stock" || o.sourceKind === "other");
}

function optionsToProducts(options: LovableChoiceOption[], catalog: ConfigProduct[]): ConfigProduct[] {
  // Envelope options are authoritative — catalog only enriches finish variants / images.
  const esf = options.filter(
    (o) => o.sourceKind === "esf" || o.sourceKind === "stock" || o.sourceKind === "other",
  );
  if (!esf.length) return [];
  return esf
    .filter((o) => {
      const id = String(o.productId || o.optionKey || "").toLowerCase();
      const label = String(o.displayLabel || "").toLowerCase();
      return !/strainer|flange|\bgrid\b/.test(id) && !/strainer|flange|\bgrid\b/.test(label);
    })
    .map((o) => {
      const fromCatalog = catalog.find(
        (p) => p.productId === o.productId || p.optionKey === o.optionKey,
      );
      const availability =
        fromCatalog?.availability ||
        o.catalogAvailability ||
        (String(o.productId || "").startsWith("blanco:") ? "special_order" : "stock");
      const product: ConfigProduct = {
        ...(fromCatalog || {}),
        productId: o.productId || fromCatalog?.productId || o.optionKey,
        category: fromCatalog?.category || String(o.role),
        displayName: o.displayLabel || fromCatalog?.displayName || "Option",
        description: o.description ?? fromCatalog?.description ?? null,
        imageUrl: null,
        sku: fromCatalog?.sku || o.sku || null,
        manufacturer: fromCatalog?.manufacturer || o.manufacturer || null,
        model: fromCatalog?.model || o.model || null,
        availability,
        availabilityText: null,
        optionKey: o.optionKey,
        variants:
          (Array.isArray(o.variants) && o.variants.length
            ? o.variants
            : fromCatalog?.variants) || [],
        visibleSellPrice: o.visibleSellPrice ?? null,
        visibleDelta: o.visibleDelta ?? null,
      };
      const images = resolveProductImageFields(product);
      product.imageUrl = images.thumbnailUrl || fromCatalog?.imageUrl || o.imageAssetRef || null;
      product.thumbnailUrl = images.thumbnailUrl;
      product.previewUrl = images.previewUrl;
      product.imageStatus = images.imageStatus;
      product.imageMatchType = images.imageMatchType;
      return product;
    });
}

function clearIncompatibleAccessoriesForRoom(
  nextQty: Record<string, number>,
  roomId: string,
  sinkOptionKey: string,
  rooms: LovableRoom[],
): string[] {
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return [];
  const sinkToken = sinkOptionKey.split(":").slice(2).join(":").toLowerCase();
  const sinkMode = sinkToken.startsWith("esf:")
    ? "esf"
    : sinkToken.startsWith("customer")
      ? "customer_provided"
      : sinkToken === "none"
        ? "none"
        : "other";
  const sinkProductId = sinkMode === "esf" ? sinkToken.replace(/^esf:/, "") : null;
  const removed: string[] = [];
  for (const opt of room.choiceOptions.filter((c) => c.role === "accessory")) {
    const kind = opt.accessoryKind || "other";
    if (kind !== "sink_accessory") continue;
    if ((nextQty[opt.optionKey] ?? 0) <= 0 && !opt.selected) continue;
    let keep = false;
    if (sinkMode === "esf" && sinkProductId) {
      const families = opt.compatibleFamilyIds || [];
      if (!families.length) {
        const sinkHint = sinkProductId.replace(/^kansas:/, "").split(/[:/]/)[0] || "";
        keep =
          Boolean(sinkHint) &&
          opt.displayLabel.toLowerCase().includes(sinkHint.toLowerCase().slice(0, 4));
      } else {
        keep = families.some(
          (f) => f === sinkProductId || sinkProductId.startsWith(f) || f.startsWith(sinkProductId),
        );
      }
    }
    if (!keep && (nextQty[opt.optionKey] ?? (opt.selected ? 1 : 0)) > 0) {
      nextQty[opt.optionKey] = 0;
      removed.push(opt.displayLabel);
    }
  }
  return removed;
}

function AccessoriesOrSpecialtyModal({
  kind,
  room,
  onClose,
  onToggle,
}: {
  kind: "accessories" | "specialty";
  room: LovableRoom;
  onClose: () => void;
  onToggle: (optionKey: string, role: "accessory" | "specialty") => void;
}) {
  if (kind === "specialty") {
    const options = room.choiceOptions.filter((c) => c.role === "specialty");
    return (
      <ModalShell title="Specialty" eyebrow={room.name} onClose={onClose} testId="de-specialty-modal">
        <div className="flex flex-col gap-2">
          {options.map((opt) => (
            <label
              key={opt.optionKey}
              className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                opt.selected ? "border-foreground bg-muted/30" : "border-border"
              }`}
            >
              <span>
                <span className="block font-medium text-foreground">{opt.displayLabel}</span>
                {opt.description ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{opt.description}</span>
                ) : null}
                {opt.priceEffectLabel ? (
                  <span className="mt-1 block text-xs text-muted-foreground">{opt.priceEffectLabel}</span>
                ) : null}
              </span>
              <input
                type="checkbox"
                checked={opt.selected}
                onChange={() => onToggle(opt.optionKey, "specialty")}
              />
            </label>
          ))}
        </div>
      </ModalShell>
    );
  }

  const sinkSelected = room.choiceOptions.find((c) => c.role === "sink" && c.selected);
  const sinkMode = sinkSelected?.sourceKind || "none";
  const sinkProductId = sinkSelected?.productId || null;
  const accessories = room.choiceOptions.filter((c) => c.role === "accessory");
  const sinkAccessories = accessories.filter((opt) => {
    if ((opt.accessoryKind || "sink_accessory") !== "sink_accessory") return false;
    if (sinkMode === "none" || sinkMode === "customer_provided") return false;
    if (sinkMode !== "esf" || !sinkProductId) return false;
    const families = opt.compatibleFamilyIds || [];
    if (!families.length) {
      const sinkHint = sinkProductId.replace(/^kansas:/, "").split(/[:/]/)[0] || "";
      return (
        Boolean(sinkHint) &&
        opt.displayLabel.toLowerCase().includes(sinkHint.toLowerCase().slice(0, 4))
      );
    }
    return families.some(
      (f) => f === sinkProductId || sinkProductId.startsWith(f) || f.startsWith(sinkProductId),
    );
  });
  const plumbingAddons = accessories.filter(
    (opt) => (opt.accessoryKind || "") === "plumbing_addon" ||
      (!opt.accessoryKind &&
        /soap|rinser|air switch|disposal|dispenser/i.test(opt.displayLabel)),
  );

  return (
    <ModalShell title="Accessories" eyebrow={room.name} onClose={onClose} testId="de-accessories-modal">
      <div className="space-y-5">
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Sink accessories
          </h3>
          {sinkMode === "none" ? (
            <p className="text-sm text-muted-foreground">
              Choose a sink to see compatible grids and accessories.
            </p>
          ) : sinkMode === "customer_provided" ? (
            <p className="text-sm text-muted-foreground">
              Model-specific sink accessories are available after an ESF sink is selected.
            </p>
          ) : sinkAccessories.length ? (
            <div className="flex flex-col gap-2">
              {sinkAccessories.map((opt) => (
                <label
                  key={opt.optionKey}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                    opt.selected ? "border-foreground bg-muted/30" : "border-border"
                  }`}
                >
                  <span>
                    <span className="font-medium text-foreground">{opt.displayLabel}</span>
                    {opt.priceEffectLabel ? (
                      <span className="ml-2 text-xs text-muted-foreground">{opt.priceEffectLabel}</span>
                    ) : null}
                  </span>
                  <input
                    type="checkbox"
                    checked={opt.selected}
                    onChange={() => onToggle(opt.optionKey, "accessory")}
                  />
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No compatible sink accessories for this selection.</p>
          )}
        </section>
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Faucet and plumbing add-ons
          </h3>
          {plumbingAddons.length ? (
            <div className="flex flex-col gap-2">
              {plumbingAddons.map((opt) => (
                <label
                  key={opt.optionKey}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                    opt.selected ? "border-foreground bg-muted/30" : "border-border"
                  }`}
                >
                  <span>
                    <span className="font-medium text-foreground">{opt.displayLabel}</span>
                    {opt.priceEffectLabel ? (
                      <span className="ml-2 text-xs text-muted-foreground">{opt.priceEffectLabel}</span>
                    ) : null}
                  </span>
                  <input
                    type="checkbox"
                    checked={opt.selected}
                    onChange={() => onToggle(opt.optionKey, "accessory")}
                  />
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No faucet and plumbing add-ons available for this room.</p>
          )}
        </section>
      </div>
    </ModalShell>
  );
}

function PlumbingSourceModal({
  room,
  role,
  draft,
  products,
  onClose,
  onSelectSource,
  onSelectProduct,
  onDraftChange,
}: {
  room: LovableRoom;
  role: "sink" | "faucet";
  draft: ProductDraft;
  products: ConfigProduct[];
  onClose: () => void;
  onSelectSource: (kind: "none" | "customer_provided" | "esf", optionKey?: string | null) => void;
  onSelectProduct: (product: ConfigProduct, variantId?: string | null) => void;
  onDraftChange: (next: ProductDraft) => void;
}) {
  const options = room.choiceOptions.filter((c) => c.role === role);
  const esfOptions = options.filter(
    (o) => o.sourceKind === "esf" || o.sourceKind === "stock" || o.sourceKind === "other",
  );
  const productCards = optionsToProducts(esfOptions, products);
  const title = role === "sink" ? "Sink" : "Faucet";
  const noneLabel = role === "sink" ? "No sink" : "No faucet";
  const customerLabel =
    role === "sink" ? "Customer-provided sink" : "Customer-provided faucet";
  const esfLabel =
    role === "sink" ? "Elite Stone Fabrication sinks" : "Elite Stone Fabrication faucets";
  const source =
    draft.source === "customer_provided" || draft.source === "none" || draft.source === "esf"
      ? draft.source
      : draft.source === "stock"
        ? "esf"
        : "none";
  const [esfPane, setEsfPane] = useState<"menu" | "catalog">("menu");
  const showingCatalog = esfPane === "catalog";

  return (
    <ModalShell
      title={title}
      eyebrow={room.name}
      onClose={onClose}
      wide={showingCatalog}
      testId={`de-${role}-modal`}
    >
      {showingCatalog ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setEsfPane("menu")}
            data-testid={`de-${role}-catalog-back`}
          >
            ← Back to {role} options
          </button>
          <div className="text-xs text-muted-foreground" data-testid={`de-${role}-catalog-title`}>
            {esfLabel}
          </div>
        </div>
      ) : null}

      {!showingCatalog ? (
        <div className="flex flex-col gap-2" data-testid={`de-${role}-source-choices`}>
          {(
            [
              ["none", noneLabel],
              ["customer_provided", customerLabel],
            ] as const
          ).map(([kind, label]) => {
            const opt = findOptionBySource(options, role, kind);
            const active = source === kind;
            return (
              <button
                key={kind}
                type="button"
                data-testid={`de-${role}-source-${kind}`}
                className={`rounded-xl border px-4 py-3 text-left text-sm font-medium ${
                  active ? "border-foreground bg-muted/30" : "border-border"
                }`}
                onClick={() => {
                  setEsfPane("menu");
                  onSelectSource(kind, opt?.optionKey);
                }}
              >
                {opt?.displayLabel || label}
              </button>
            );
          })}
          <button
            type="button"
            data-testid={`de-${role}-source-esf`}
            className={`rounded-xl border px-4 py-3 text-left text-sm font-medium ${
              source === "esf" ? "border-foreground bg-muted/30" : "border-border"
            }`}
            onClick={() => {
              onSelectSource("esf", null);
              setEsfPane("catalog");
            }}
          >
            {esfLabel}
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
              {productCards.length} approved {role === "sink" ? "sink" : "faucet"}
              {productCards.length === 1 ? "" : "s"} for this room
            </span>
          </button>
        </div>
      ) : null}

      {source === "customer_provided" && !showingCatalog ? (
        <div className="mt-5 space-y-3" data-testid={`de-${role}-customer-fields`}>
          <p className="text-xs text-muted-foreground">
            {role === "sink"
              ? "You can provide the model later. We will need it before fabrication."
              : "You can provide the faucet details later. We will need the model and hole requirements before fabrication."}
          </p>
          {(
            [
              ["manufacturer", "Manufacturer"],
              ["model", "Model"],
              ["finish", "Finish / color"],
              ...(role === "faucet"
                ? ([["holeCount", "Required hole count"]] as const)
                : ([] as const)),
              ["notes", "Notes"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-muted-foreground">{label} (optional)</span>
              {field === "notes" ? (
                <textarea
                  className="min-h-[64px] rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={draft.notes || ""}
                  onChange={(e) => onDraftChange({ ...draft, notes: e.target.value })}
                />
              ) : field === "holeCount" ? (
                <input
                  type="number"
                  min={0}
                  max={8}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={(draft as ProductDraft & { holeCount?: string | number }).holeCount ?? ""}
                  onChange={(e) =>
                    onDraftChange({
                      ...draft,
                      holeCount: e.target.value,
                    } as ProductDraft)
                  }
                  data-testid="de-faucet-hole-count"
                />
              ) : (
                <input
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={(draft[field as keyof ProductDraft] as string) || ""}
                  onChange={(e) => onDraftChange({ ...draft, [field]: e.target.value })}
                />
              )}
            </label>
          ))}
        </div>
      ) : null}

      {showingCatalog ? (
        <div className="mt-2 space-y-4" data-testid={`de-${role}-catalog`}>
          <ProductCards
            products={productCards}
            selectedOptionKey={draft.optionKey || null}
            onPick={onSelectProduct}
            role={role}
          />
        </div>
      ) : null}
    </ModalShell>
  );
}

function BacksplashModal({
  room,
  draft,
  onClose,
  onSelectOption,
  onDraftChange,
}: {
  room: LovableRoom;
  draft: BacksplashDraft;
  onClose: () => void;
  onSelectOption: (optionKey: string) => void;
  onDraftChange: (next: BacksplashDraft) => void;
}) {
  const options = room.choiceOptions
    .filter((c) => c.role === "backsplash")
    .map((o) => ({ ...o, displayLabel: normalizeBacksplashLabel(o.displayLabel) }));
  const customOpt = options.find((o) => /custom/i.test(o.optionKey) || /custom/i.test(o.displayLabel));
  const isCustom = draft.mode === "custom_height" || Boolean(customOpt?.selected);

  return (
    <ModalShell title="Backsplash" eyebrow={room.name} onClose={onClose} testId="de-backsplash-modal">
      <ChoiceRadio
        options={options.filter((o) => !/custom/i.test(o.optionKey))}
        name={`backsplash-${room.id}`}
        onSelect={onSelectOption}
      />
      {customOpt || true ? (
        <div className="mt-3">
          <button
            type="button"
            data-testid="de-backsplash-custom"
            className={`w-full rounded-xl border px-4 py-3 text-left text-sm font-medium ${
              isCustom ? "border-foreground bg-muted/30" : "border-border"
            }`}
            onClick={() => {
              if (customOpt) onSelectOption(customOpt.optionKey);
              onDraftChange({
                ...draft,
                mode: "custom_height",
                optionKey: customOpt?.optionKey || draft.optionKey,
              });
            }}
          >
            {customOpt ? normalizeBacksplashLabel(customOpt.displayLabel) : "Custom-height backsplash"}
          </button>
          {isCustom ? (
            <div className="mt-3 space-y-3 rounded-xl border border-border bg-muted/20 p-4" data-testid="de-backsplash-custom-fields">
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Height (inches)</span>
                <input
                  type="number"
                  min={1}
                  max={96}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={draft.requestedHeightInches ?? draft.customHeightIn ?? ""}
                  onChange={(e) =>
                    onDraftChange({
                      ...draft,
                      mode: "custom_height",
                      requestedHeightInches: e.target.value === "" ? null : Number(e.target.value),
                      customHeightIn: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-muted-foreground">Note (optional)</span>
                <textarea
                  className="min-h-[64px] rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={draft.note || ""}
                  onChange={(e) => onDraftChange({ ...draft, note: e.target.value })}
                />
              </label>
              <p className="text-xs text-muted-foreground" data-testid="de-backsplash-custom-copy">
                Final measurements and pricing require estimator review.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </ModalShell>
  );
}

function formatMoneyLabel(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Math.round(Number(n)));
}

function formatSignedMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  const v = Number(n);
  if (Math.abs(v) < 0.005) return "No change";
  const abs = formatMoneyLabel(Math.abs(v));
  return v < 0 ? `−${abs}` : `+${abs}`;
}

function SelectionRow({
  label,
  value,
  detail,
  priceEffect,
  onClick,
  testId,
  readOnly,
  actionLabel = "Change",
}: {
  label: string;
  value: string;
  detail?: string | null;
  priceEffect?: string | null;
  onClick?: () => void;
  testId?: string;
  readOnly?: boolean;
  actionLabel?: string;
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="mt-0.5 block text-sm font-semibold text-foreground">{value}</span>
        {detail ? (
          <span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span>
        ) : null}
        {priceEffect ? (
          <span
            className="mt-1 block text-xs font-medium tabular-nums text-foreground"
            data-testid="de-selection-price-effect"
          >
            {priceEffect}
          </span>
        ) : null}
      </span>
      {readOnly ? (
        <span className="shrink-0 text-xs text-muted-foreground">As published</span>
      ) : (
        <span className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground">
          {actionLabel}
        </span>
      )}
    </>
  );
  if (readOnly || !onClick) {
    return (
      <div
        className="flex w-full items-start justify-between gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3 text-left"
        data-testid={testId}
        data-readonly="true"
      >
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="flex w-full items-start justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3 text-left transition hover:border-foreground/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      {body}
    </button>
  );
}

/** @deprecated alias — prefer SelectionRow */
function SummaryRow(props: {
  label: string;
  value: string;
  onClick: () => void;
  testId?: string;
}) {
  return <SelectionRow {...props} />;
}

function ReviewRequestModal({
  rooms,
  onSubmit,
  onClose,
  busy,
  configuredTotalLabel,
  unresolvedCount,
}: {
  rooms: LovableRoom[];
  onSubmit: (message: string) => void;
  onClose: () => void;
  busy: boolean;
  configuredTotalLabel?: string | null;
  unresolvedCount?: number;
}) {
  const [message, setMessage] = useState("");
  const submittedRef = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
      data-testid="de-review-modal"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="review-modal-title"
        aria-modal="true"
      >
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Request review</div>
        <div id="review-modal-title" className="mt-1 text-lg font-semibold text-foreground">
          Ready for Elite to review your selections?
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          This is not final acceptance. Pricing and availability remain subject to estimator review.
        </p>
        <dl className="mt-4 space-y-1.5 rounded-xl border border-border bg-muted/20 px-3 py-3 text-sm">
          {configuredTotalLabel ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Your estimate</dt>
              <dd className="font-semibold tabular-nums" data-testid="de-review-confirm-total">
                {configuredTotalLabel}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Rooms</dt>
            <dd data-testid="de-review-confirm-rooms">{rooms.length}</dd>
          </div>
          {unresolvedCount != null && unresolvedCount > 0 ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Details still needed</dt>
              <dd data-testid="de-review-confirm-unresolved">{unresolvedCount}</dd>
            </div>
          ) : null}
        </dl>
        <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Optional note
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Anything Elite should know…"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        />
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || submittedRef.current}
            data-testid="de-review-submit"
            onClick={() => {
              if (busy || submittedRef.current) return;
              submittedRef.current = true;
              onSubmit(message.trim());
            }}
            className="rounded-md bg-foreground px-4 py-2 text-xs font-semibold text-background disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          >
            {busy ? "Sending…" : "Request review"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomerRoomCard({
  room,
  onOpenModal,
  onRename,
  onEdgeChange,
  catalogPermissions,
}: {
  room: LovableRoom;
  onOpenModal: (kind: Exclude<ModalKind, null>) => void;
  onRename: (name: string) => void;
  onEdgeChange?: (optionKey: string) => void;
  catalogPermissions?: Record<string, boolean> | null;
}) {
  const color = room.colors.find((c) => c.id === room.selectedColorId) || room.colors[0];
  const has = (role: string) => room.choiceOptions.some((c) => c.role === role);
  const hasSideSplash = room.sideSplashPieces.length > 0;
  const allowed = (key: string) =>
    catalogPermissions == null || catalogPermissions[key] !== false;
  const selectedEffect = (role: string) => {
    const sel =
      room.choiceOptions.find((c) => c.role === role && c.selected) ||
      room.choiceOptions.find((c) => c.role === role && c.includedInBaseline);
    return sel?.priceEffectLabel || null;
  };
  const colorEffect = color?.includedInBaseline
    ? "Original selection"
    : color
      ? "Price updates when saved"
      : null;
  const pricing = room.roomPricing;
  const roomStatus =
    pricing?.changeFromOriginal != null && Math.abs(pricing.changeFromOriginal) >= 0.005
      ? "Changed"
      : "As published";

  return (
    <article
      className="rounded-2xl border border-border bg-background p-5 shadow-sm sm:p-6"
      data-testid="de-room-card"
    >
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {room.customerMayEditLabel ? (
            <input
              className="w-full rounded-md border border-transparent bg-transparent text-lg font-semibold text-foreground outline-none hover:border-border focus:border-border focus:bg-background focus:px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              value={room.name}
              aria-label="Room name"
              data-testid="de-room-label"
              onChange={(e) => onRename(e.target.value)}
            />
          ) : (
            <h2 className="text-lg font-semibold text-foreground" data-testid="de-room-label">
              {room.name}
            </h2>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span
              className="rounded-full border border-border px-2 py-0.5"
              data-testid="de-room-status"
            >
              {roomStatus}
            </span>
            {pricing?.roomTotal != null ? (
              <span className="font-semibold tabular-nums text-foreground" data-testid="de-room-total">
                {formatMoneyLabel(pricing.roomTotal)}
              </span>
            ) : null}
            {pricing?.changeFromOriginal != null &&
            Math.abs(pricing.changeFromOriginal) >= 0.005 ? (
              <span data-testid="de-room-delta" className="tabular-nums">
                {formatSignedMoney(pricing.changeFromOriginal)} from published estimate
              </span>
            ) : null}
          </div>
        </div>
        <MaterialThumb
          src={color?.imageThumb || color?.imageFull}
          alt={color?.name || "Color"}
          size="md"
        />
      </header>

      <div className="mt-5 grid gap-2" data-testid="de-room-selections">
        {allowed("material") || color ? (
          <SelectionRow
            label="Material"
            value={color?.name || room.selectedColorName || "Choose a material"}
            detail={color?.pricingGroupLabel || "Elite 100"}
            priceEffect={colorEffect}
            readOnly={!allowed("material")}
            onClick={() => onOpenModal("color")}
            testId="de-open-color-modal"
          />
        ) : null}

        {has("backsplash") ? (
          <SelectionRow
            label="Backsplash"
            value={room.backsplashSummary || "Choose backsplash"}
            detail={
              room.backsplashSummary === "No backsplash"
                ? "Removes the standard backsplash from eligible wall runs"
                : "Applies to eligible wall runs approved by Elite"
            }
            priceEffect={selectedEffect("backsplash")}
            readOnly={!allowed("backsplash")}
            onClick={() => onOpenModal("backsplash")}
            testId="de-open-backsplash-modal"
          />
        ) : null}

        {hasSideSplash ? (
          <SelectionRow
            label="Side splash"
            value={summarizeSideSplashSelections(room.sideSplashPieces)}
            readOnly={!allowed("side_splash")}
            onClick={() => onOpenModal("sidesplash")}
            testId="de-open-sidesplash-modal"
          />
        ) : null}

        {has("sink") ? (
          <SelectionRow
            label="Sink"
            value={room.sinkSummary || "Choose sink"}
            priceEffect={selectedEffect("sink")}
            readOnly={!allowed("sink")}
            onClick={() => onOpenModal("sink")}
            testId="de-open-sink-modal"
          />
        ) : null}

        {has("faucet") ? (
          <SelectionRow
            label="Faucet"
            value={room.faucetSummary || "Choose faucet"}
            priceEffect={selectedEffect("faucet")}
            readOnly={!allowed("faucet")}
            onClick={() => onOpenModal("faucet")}
            testId="de-open-faucet-modal"
          />
        ) : null}

        {(has("accessory") || room.accessoryProducts.length) && allowed("accessories") ? (
          <SelectionRow
            label="Accessories"
            value={room.accessoriesSummary || "None selected"}
            onClick={() => onOpenModal("accessories")}
            testId="de-open-accessories-modal"
          />
        ) : null}

        {has("cooktop") ? (
          <SelectionRow
            label="Cooktop / cutouts"
            value={room.cooktopSummary || "Choose cooktop option"}
            onClick={() => onOpenModal("cooktop")}
            testId="de-open-cooktop-modal"
          />
        ) : null}

        {has("edge") ? (
          allowed("edge") ? (
            <div
              className="rounded-xl border border-border bg-background px-4 py-3"
              data-testid="de-edge-dropdown"
            >
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Edge
              </div>
              <label className="mt-1 block">
                <span className="sr-only">Edge profile</span>
                <select
                  className="mt-0.5 w-full rounded-md border border-border bg-background px-2 py-2 text-sm font-semibold text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                  value={
                    room.choiceOptions.find((c) => c.role === "edge" && c.selected)?.optionKey ||
                    room.choiceOptions.find((c) => c.role === "edge" && c.includedInBaseline)
                      ?.optionKey ||
                    ""
                  }
                  onChange={(e) => {
                    if (e.target.value) onEdgeChange?.(e.target.value);
                  }}
                  aria-label="Edge profile"
                >
                  {room.choiceOptions
                    .filter((c) => c.role === "edge")
                    .map((opt) => {
                      const effect =
                        opt.priceEffectLabel ||
                        (opt.includedInBaseline ? "Original selection" : "");
                      const label = effect
                        ? `${opt.displayLabel} — ${effect}`
                        : opt.displayLabel;
                      return (
                        <option key={opt.optionKey} value={opt.optionKey}>
                          {label}
                        </option>
                      );
                    })}
                </select>
              </label>
              {selectedEffect("edge") ? (
                <div className="mt-1 text-xs font-medium tabular-nums text-foreground">
                  {selectedEffect("edge")}
                </div>
              ) : null}
            </div>
          ) : (
            <SelectionRow
              label="Edge"
              value={room.edgeSummary || "As published"}
              priceEffect={selectedEffect("edge")}
              readOnly
              testId="de-edge-readonly"
            />
          )
        ) : null}

        {(has("specialty") || room.specialtyProducts.length) && allowed("specialty") ? (
          <SelectionRow
            label="Specialty options"
            value={room.specialtySummary || "None selected"}
            onClick={() => onOpenModal("specialty")}
            testId="de-open-specialty-modal"
          />
        ) : null}

        <SelectionRow
          label="Notes"
          value={room.roomNote?.trim() ? room.roomNote.trim().slice(0, 80) : "Add a note"}
          onClick={() => onOpenModal("notes")}
          testId="de-open-notes-modal"
          actionLabel="Edit"
        />
      </div>

      {pricing ? (
        <section
          className="mt-5 rounded-xl border border-border bg-muted/20 px-4 py-3"
          data-testid="de-room-price-summary"
          aria-label={`${room.name} price summary`}
        >
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Room price summary
          </div>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt>Countertop</dt>
              <dd className="tabular-nums" data-testid="de-room-countertop-amount">
                {formatMoneyLabel(pricing.countertopAmount)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt data-testid="de-room-backsplash-status">Backsplash</dt>
              <dd className="tabular-nums" data-testid="de-room-backsplash-amount">
                {formatMoneyLabel(pricing.backsplashAmount)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Add-ons</dt>
              <dd className="tabular-nums">{formatMoneyLabel(pricing.addOnsAmount)}</dd>
            </div>
            {(pricing.addOnLines || []).map((line, i) => (
              <div
                key={`${line.label}-${i}`}
                className="flex justify-between gap-3 pl-3 text-xs text-muted-foreground"
                data-testid="de-room-addon-line"
              >
                <dt>{line.label}</dt>
                <dd className="tabular-nums">{formatMoneyLabel(line.amount)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t border-border/60 pt-2 font-semibold text-foreground">
              <dt>Room total</dt>
              <dd className="tabular-nums">{formatMoneyLabel(pricing.roomTotal)}</dd>
            </div>
          </dl>
        </section>
      ) : (
        <p className="mt-4 text-[11px] text-muted-foreground" data-testid="de-room-counter-status">
          {room.measurementStatus ||
            "Measurements verified by estimator — locked for this estimate."}
        </p>
      )}
    </article>
  );
}

function ConfigurationViewInner({ state, onState, onFatal, accessToken }: Props) {
  const formId = useId();
  const config = state.configuration;
  const [qty, setQty] = useState<Record<string, number>>(() => ({
    ...(config?.currentSelections || {}),
  }));
  const [infoDraft, setInfoDraft] = useState<CustomerInfoDraft>(() => ({
    customerName: config?.customerInfoDraft?.customerName || config?.sourceProject?.customerName || state.estimate?.project?.customerName || "",
    projectName: config?.customerInfoDraft?.projectName || config?.sourceProject?.projectName || state.estimate?.project?.projectName || "",
    phone: config?.customerInfoDraft?.phone || "",
    email: config?.customerInfoDraft?.email || "",
    projectAddress:
      config?.customerInfoDraft?.projectAddress ||
      config?.sourceProject?.projectAddress ||
      state.estimate?.project?.projectAddress ||
      "",
  }));
  const [roomLabels, setRoomLabels] = useState<Record<string, string>>(
    () => ({ ...(config?.roomLabelDrafts || {}) }),
  );
  const [roomNotes, setRoomNotes] = useState<Record<string, string>>(
    () => ({ ...(config?.roomNotes || {}) }),
  );
  const [productDrafts, setProductDrafts] = useState<Record<string, RoomProductDrafts>>(
    () => ({ ...(config?.customerProductDrafts || config?.productDrafts || {}) }),
  );
  const [backsplashDrafts, setBacksplashDrafts] = useState<Record<string, BacksplashDraft>>(
    () => ({ ...(config?.backsplashDrafts || {}) }),
  );
  const [projectNote, setProjectNote] = useState(config?.projectNote || "");
  const [latestCalc, setLatestCalc] = useState(config?.latestCalculation ?? null);
  /** Last server-confirmed calculation — authoritative Your estimate source. */
  const [savedCalc, setSavedCalc] = useState(config?.latestCalculation ?? null);
  const [rowVersion, setRowVersion] = useState(state.session?.rowVersion ?? 1);
  const [saveState, setSaveState] = useState<"idle" | "unsaved" | "saving" | "saved" | "error">(
    "idle",
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [accessoryNotice, setAccessoryNotice] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<{ roomId: string; kind: Exclude<ModalKind, null> } | null>(
    null,
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewRequest, setReviewRequest] = useState<CustomerReviewRequest | null>(null);
  const [estimateTab, setEstimateTab] = useState<"estimate" | "changes">("estimate");
  const [breakdownOpen, setBreakdownOpen] = useState(true);
  const requestSeq = useMemo(() => ({ n: 0 }), []);
  const saveFnRef = useRef<() => Promise<number | null> | number | null | void>(() => null);
  const hydrateReadyRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const conflictRetryRef = useRef(false);
  const rowVersionRef = useRef(rowVersion);
  const qtyRef = useRef(qty);
  const productDraftsRef = useRef(productDrafts);
  const backsplashDraftsRef = useRef(backsplashDrafts);
  const infoDraftRef = useRef(infoDraft);
  const roomLabelsRef = useRef(roomLabels);
  const roomNotesRef = useRef(roomNotes);
  const projectNoteRef = useRef(projectNote);

  useEffect(() => {
    rowVersionRef.current = rowVersion;
  }, [rowVersion]);
  useEffect(() => {
    qtyRef.current = qty;
  }, [qty]);
  useEffect(() => {
    productDraftsRef.current = productDrafts;
  }, [productDrafts]);
  useEffect(() => {
    backsplashDraftsRef.current = backsplashDrafts;
  }, [backsplashDrafts]);
  useEffect(() => {
    infoDraftRef.current = infoDraft;
  }, [infoDraft]);
  useEffect(() => {
    roomLabelsRef.current = roomLabels;
  }, [roomLabels]);
  useEffect(() => {
    roomNotesRef.current = roomNotes;
  }, [roomNotes]);
  useEffect(() => {
    projectNoteRef.current = projectNote;
  }, [projectNote]);

  useEffect(() => {
    hydrateReadyRef.current = true;
  }, []);

  useEffect(() => {
    if (!hydrateReadyRef.current) return;
    if (saveState !== "unsaved") return;
    const timer = window.setTimeout(() => {
      void saveFnRef.current();
    }, 450);
    return () => window.clearTimeout(timer);
    // Debounced canonical autosave for all dirty draft fields (info, notes, qty, products).
  }, [saveState, infoDraft, roomLabels, roomNotes, projectNote, productDrafts, backsplashDrafts, qty]);

  useEffect(() => {
    if (!reviewUiEnabled()) return;
    let alive = true;
    void fetchCurrentReviewRequest()
      .then((r) => {
        if (alive && r.reviewRequest) setReviewRequest(r.reviewRequest);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (state.lifecycle !== "active" || !config || !state.estimate) {
    const title =
      state.lifecycle === "expired"
        ? "Pricing expired"
        : state.lifecycle === "revoked"
          ? "Link revoked"
          : state.lifecycle === "superseded"
            ? "Estimate updated"
            : "This estimate isn’t available";
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div
          className="max-w-md rounded-2xl border border-border bg-card p-6 text-center"
          data-testid="de-lifecycle-state"
          data-lifecycle={state.lifecycle || "invalid"}
        >
          <div className="text-lg font-semibold">{title}</div>
          <p className="mt-2 text-sm text-muted-foreground">
            {state.message || "This estimate is unavailable."}
          </p>
        </div>
      </div>
    );
  }

  const vm = mapEliteOsToLovableViewModel(
    state,
    qty,
    latestCalc,
    infoDraft,
    roomLabels,
    productDrafts,
    backsplashDrafts,
  );
  if (!vm) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading your estimate…
      </div>
    );
  }

  const modalRoom = vm.rooms.find((r) => r.id === activeModal?.roomId) ?? null;

  function selectColor(roomId: string, color: LovableColor) {
    const nextQty = { ...qty };
    const room = vm!.rooms.find((r) => r.id === roomId);
    for (const c of room?.colors || []) nextQty[c.optionKey] = 0;
    nextQty[color.optionKey] = 1;
    setQty(nextQty);
    setSaveState("unsaved");
    setSaveError(null);
    setActiveModal(null);
  }

  function selectChoice(optionKey: string, role: string, roomId: string) {
    const nextQty = { ...qty };
    const prefix = `${role}:${roomId}:`;
    for (const key of Object.keys(nextQty)) {
      if (key.startsWith(prefix)) {
        // For sidesplash, clear only the same piece prefix when possible
        if (role === "sidesplash") {
          const pieceParts = optionKey.split(":");
          const selPiece = pieceParts.slice(2, -1).join(":");
          const keyPiece = key.split(":").slice(2, -1).join(":");
          if (selPiece && keyPiece && selPiece !== keyPiece) continue;
        }
        // Accessories / specialty are multi-select — handled separately
        if (role === "accessory" || role === "specialty") continue;
        nextQty[key] = 0;
      }
    }
    nextQty[optionKey] = 1;
    if (role === "sink") {
      const removed = clearIncompatibleAccessoriesForRoom(
        nextQty,
        roomId,
        optionKey,
        vm?.rooms || [],
      );
      if (removed.length) {
        setAccessoryNotice(
          removed.length === 1
            ? `Removed incompatible accessory: ${removed[0]}`
            : `Removed ${removed.length} incompatible sink accessories for this selection.`,
        );
      }
    }
    setQty(nextQty);
    setSaveState("unsaved");
    setSaveError(null);
  }

  function toggleMultiChoice(optionKey: string, role: string, roomId: string) {
    const nextQty = { ...qty };
    nextQty[optionKey] = (nextQty[optionKey] ?? 0) > 0 ? 0 : 1;
    setQty(nextQty);
    setSaveState("unsaved");
    setSaveError(null);
  }

  function updateProductDraft(roomId: string, role: "sink" | "faucet", next: ProductDraft) {
    setProductDrafts((prev) => ({
      ...prev,
      [roomId]: { ...prev[roomId], [role]: next },
    }));
    setSaveState("unsaved");
  }

  function updateBacksplashDraft(roomId: string, next: BacksplashDraft) {
    setBacksplashDrafts((prev) => ({ ...prev, [roomId]: next }));
    setSaveState("unsaved");
  }

  function isConcurrencyConflict(err: ConfigurationSaveError): boolean {
    return (
      err.code === "row_version_conflict" ||
      err.code === "stale_configuration" ||
      err.diagnosticCode === "DE-CONFIGURATION-STALE" ||
      err.status === 409
    );
  }

  async function onSave(opts?: {
    qtyOverride?: Record<string, number>;
    allowSessionRecover?: boolean;
    productDraftsOverride?: Record<string, RoomProductDrafts>;
    backsplashDraftsOverride?: Record<string, BacksplashDraft>;
    /** Internal: already consumed one conflict retry. */
    conflictRetried?: boolean;
  }): Promise<number | null> {
    if (saveInFlightRef.current) {
      pendingSaveRef.current = true;
      return null;
    }
    saveInFlightRef.current = true;
    setSaveState("saving");
    setSaveError(null);
    const seq = ++requestSeq.n;
    const effectiveQty = opts?.qtyOverride || qtyRef.current;
    const effectiveProductDrafts = opts?.productDraftsOverride || productDraftsRef.current;
    const effectiveBacksplashDrafts = opts?.backsplashDraftsOverride || backsplashDraftsRef.current;
    const effectiveInfo = infoDraftRef.current;
    const effectiveLabels = roomLabelsRef.current;
    const effectiveRoomNotes = roomNotesRef.current;
    const effectiveProjectNote = projectNoteRef.current;
    const roomsForItems =
      mapEliteOsToLovableViewModel(
        state,
        effectiveQty,
        savedCalc,
        effectiveInfo,
        effectiveLabels,
        effectiveProductDrafts,
        effectiveBacksplashDrafts,
      )?.rooms || vm!.rooms;
    const items = buildSelectionItems(effectiveQty, roomsForItems);

    const finishFlight = () => {
      saveInFlightRef.current = false;
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        setSaveState("unsaved");
        queueMicrotask(() => {
          void saveFnRef.current();
        });
      }
    };

    try {
      const result = await saveConfigurationSelections({
        items,
        expectedRowVersion: rowVersionRef.current,
        idempotencyKey: `sel-${formId}-${Date.now()}-${seq}`,
        customerInfoDraft: effectiveInfo,
        roomLabelDrafts: effectiveLabels,
        roomNotes: effectiveRoomNotes,
        projectNote: effectiveProjectNote,
        customerProductDrafts: effectiveProductDrafts,
        backsplashDrafts: effectiveBacksplashDrafts,
      });
      if (seq !== requestSeq.n) {
        finishFlight();
        return null;
      }
      const nextRowVersion = result.session?.rowVersion ?? rowVersionRef.current;
      if (result.session?.rowVersion != null) {
        setRowVersion(result.session.rowVersion);
        rowVersionRef.current = result.session.rowVersion;
      }
      const nextCalc = (result.calculation as typeof latestCalc) || savedCalc;
      if (result.calculation) {
        setLatestCalc(result.calculation as typeof latestCalc);
        setSavedCalc(result.calculation as typeof latestCalc);
      }
      if (result.customerProductDrafts || result.productDrafts) {
        setProductDrafts(result.customerProductDrafts || result.productDrafts || effectiveProductDrafts);
      }
      if (result.backsplashDrafts) setBacksplashDrafts(result.backsplashDrafts);
      const stillPending = pendingSaveRef.current;
      setSaveState(stillPending ? "unsaved" : "saved");
      setSaveError(null);
      onState({
        ...state,
        session: state.session
          ? { ...state.session, rowVersion: nextRowVersion }
          : state.session,
        configuration: state.configuration
          ? {
              ...state.configuration,
              currentSelections: effectiveQty,
              customerInfoDraft: effectiveInfo,
              roomLabelDrafts: effectiveLabels,
              roomNotes: effectiveRoomNotes,
              projectNote: effectiveProjectNote,
              customerProductDrafts:
                result.customerProductDrafts || result.productDrafts || effectiveProductDrafts,
              backsplashDrafts: result.backsplashDrafts || effectiveBacksplashDrafts,
              missingInformationRequirements:
                result.missingInformationRequirements ||
                state.configuration.missingInformationRequirements,
              latestCalculation: nextCalc,
            }
          : state.configuration,
      });
      finishFlight();
      return nextRowVersion;
    } catch (e) {
      if (seq !== requestSeq.n) {
        finishFlight();
        return null;
      }
      const err = e as ConfigurationSaveError;
      const allowRecover = opts?.allowSessionRecover !== false;
      if (
        allowRecover &&
        accessToken &&
        (err.code === "session_required" ||
          err.code === "session_not_found" ||
          err.code === "session_invalid" ||
          err.diagnosticCode === "DE-COOKIE" ||
          err.status === 401)
      ) {
        try {
          const recovered = await exchangeFragmentToken(accessToken);
          if (recovered.lifecycle === "active" && recovered.configuration) {
            onState(recovered);
            const recoveredVersion = recovered.session?.rowVersion;
            if (recoveredVersion != null) {
              setRowVersion(recoveredVersion);
              rowVersionRef.current = recoveredVersion;
            }
            saveInFlightRef.current = false;
            return onSave({
              qtyOverride: effectiveQty,
              allowSessionRecover: false,
              productDraftsOverride: effectiveProductDrafts,
              backsplashDraftsOverride: effectiveBacksplashDrafts,
            });
          }
          if (
            recovered.lifecycle === "revoked" ||
            recovered.lifecycle === "expired" ||
            recovered.lifecycle === "superseded"
          ) {
            onFatal();
            finishFlight();
            return null;
          }
        } catch {
          /* fall through to inline error */
        }
      }
      if (isConcurrencyConflict(err) && !opts?.conflictRetried && !conflictRetryRef.current) {
        conflictRetryRef.current = true;
        try {
          const fresh = await fetchConfiguration();
          if (fresh.lifecycle === "active" && fresh.configuration) {
            const freshVersion = fresh.session?.rowVersion;
            if (freshVersion != null) {
              setRowVersion(freshVersion);
              rowVersionRef.current = freshVersion;
            }
            if (fresh.configuration.latestCalculation) {
              setSavedCalc(fresh.configuration.latestCalculation as typeof latestCalc);
              setLatestCalc(fresh.configuration.latestCalculation as typeof latestCalc);
            }
            onState({
              ...state,
              ...fresh,
              configuration: {
                ...fresh.configuration,
                currentSelections: effectiveQty,
                customerInfoDraft: effectiveInfo,
                roomLabelDrafts: effectiveLabels,
                roomNotes: effectiveRoomNotes,
                projectNote: effectiveProjectNote,
                customerProductDrafts: effectiveProductDrafts,
                backsplashDrafts: effectiveBacksplashDrafts,
              },
            });
            saveInFlightRef.current = false;
            conflictRetryRef.current = false;
            return onSave({
              qtyOverride: effectiveQty,
              allowSessionRecover: false,
              productDraftsOverride: effectiveProductDrafts,
              backsplashDraftsOverride: effectiveBacksplashDrafts,
              conflictRetried: true,
            });
          }
        } catch {
          /* fall through */
        } finally {
          conflictRetryRef.current = false;
        }
      }
      if (err.lifecycleFatal) {
        onFatal();
        finishFlight();
        return null;
      }
      setLatestCalc(savedCalc);
      setSaveState("error");
      setSaveError(
        err.code === "invalid_selection" ||
          err.code === "unknown_option" ||
          err.code === "option_not_allowed"
          ? err.message || "That selection is unavailable. Please choose another option."
          : err instanceof Error
            ? err.message
            : "Unable to save",
      );
      finishFlight();
      return null;
    }
  }

  async function onSendReview(note: string) {
    if (!reviewUiEnabled()) return;
    setReviewBusy(true);
    setReviewError(null);
    try {
      const reviewRowVersion = saveState === "saved" ? rowVersion : await onSave();
      if (reviewRowVersion == null) return;
      const result = await submitReviewRequest({
        expectedRowVersion: reviewRowVersion,
        idempotencyKey: `review-${formId}-${reviewRequest?.requestReference || "new"}`,
        customerNote: note || undefined,
      });
      setReviewRequest(result.reviewRequest);
      setReviewOpen(false);
    } catch (e) {
      const err = e as ConfigurationSaveError;
      if (err.lifecycleFatal || err.status === 410) {
        onFatal();
        return;
      }
      setReviewError(e instanceof Error ? e.message : "Unable to send for review");
    } finally {
      setReviewBusy(false);
    }
  }

  function applyPlumbingSource(
    roomId: string,
    role: "sink" | "faucet",
    kind: "none" | "customer_provided" | "esf",
    optionKey?: string | null,
  ) {
    const room = vm!.rooms.find((r) => r.id === roomId);
    const opt =
      (optionKey && room?.choiceOptions.find((c) => c.optionKey === optionKey)) ||
      findOptionBySource(room?.choiceOptions || [], role, kind);
    const nextDraft: ProductDraft = {
      ...((role === "sink" ? room?.sinkDraft : room?.faucetDraft) || {
        source: kind,
        manufacturer: "",
        model: "",
        finish: "",
        notes: "",
      }),
      source: kind,
      optionKey: kind === "esf" ? null : opt?.optionKey || null,
      displayLabel: kind === "esf" ? null : opt?.displayLabel || null,
      productId: kind === "esf" ? null : null,
      variantId: null,
      variantSku: null,
    };
    if (kind === "customer_provided" || kind === "none") {
      nextDraft.manufacturer = kind === "customer_provided" ? nextDraft.manufacturer || "" : "";
      nextDraft.model = kind === "customer_provided" ? nextDraft.model || "" : "";
      nextDraft.finish = kind === "customer_provided" ? nextDraft.finish || "" : "";
    }
    updateProductDraft(roomId, role, nextDraft);
    if (kind !== "esf" && opt?.optionKey) {
      selectChoice(opt.optionKey, role, roomId);
    } else if (kind === "esf") {
      const nextQty = { ...qty };
      const prefix = `${role}:${roomId}:`;
      for (const key of Object.keys(nextQty)) {
        if (!key.startsWith(prefix)) continue;
        const token = key.slice(prefix.length);
        if (token === "none" || token.startsWith("customer")) nextQty[key] = 0;
      }
      if (role === "sink") {
        const removed = clearIncompatibleAccessoriesForRoom(
          nextQty,
          roomId,
          `sink:${roomId}:none`,
          vm?.rooms || [],
        );
        if (removed.length) {
          setAccessoryNotice(
            removed.length === 1
              ? `Removed incompatible accessory: ${removed[0]}`
              : `Removed ${removed.length} incompatible sink accessories for this selection.`,
          );
        }
      }
      setQty(nextQty);
      setSaveState("unsaved");
    } else {
      setSaveState("unsaved");
    }
  }

  function applyEsfProduct(
    roomId: string,
    role: "sink" | "faucet",
    product: ConfigProduct,
    variantId?: string | null,
  ) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    if (variants.length > 1 && !variantId) {
      setSaveState("error");
      setSaveError("Choose a finish for this product before saving.");
      return;
    }
    const resolvedVariantId =
      variantId || (variants.length === 1 ? variants[0]?.variantId || variants[0]?.sku : null);
    const optionKey =
      resolveProductOptionKey(product, resolvedVariantId) || product.optionKey;
    if (!optionKey) {
      setSaveState("error");
      setSaveError("That product is unavailable. Please choose another option.");
      return;
    }
    const variant = product.variants?.find(
      (v) => v.variantId === resolvedVariantId || v.sku === resolvedVariantId,
    );
    const nextDraft: ProductDraft = {
      source: "esf",
      optionKey,
      productId: product.productId,
      variantId: resolvedVariantId || null,
      variantSku: variant?.sku || (resolvedVariantId as string) || null,
      manufacturer: product.manufacturer || "",
      model: product.model || "",
      finish: variant?.finish || variant?.color || product.finish || "",
      notes: "",
      displayLabel:
        variant?.displayName ||
        [product.displayName, variant?.finish || variant?.color].filter(Boolean).join(" · ") ||
        product.displayName,
      availability: variant?.availability || product.availability || null,
    };
    const nextDrafts = {
      ...productDraftsRef.current,
      [roomId]: { ...productDraftsRef.current[roomId], [role]: nextDraft },
    };
    productDraftsRef.current = nextDrafts;
    setProductDrafts(nextDrafts);
    const nextQty = { ...qtyRef.current };
    const prefix = `${role}:${roomId}:`;
    for (const key of Object.keys(nextQty)) {
      if (key.startsWith(prefix)) {
        if (role === "accessory" || role === "specialty") continue;
        nextQty[key] = 0;
      }
    }
    nextQty[optionKey] = 1;
    if (role === "sink") {
      const removed = clearIncompatibleAccessoriesForRoom(
        nextQty,
        roomId,
        optionKey,
        vm?.rooms || [],
      );
      if (removed.length) {
        setAccessoryNotice(
          removed.length === 1
            ? `Removed incompatible accessory: ${removed[0]}`
            : `Removed ${removed.length} incompatible sink accessories for this selection.`,
        );
      }
    }
    qtyRef.current = nextQty;
    setQty(nextQty);
    setSaveState("unsaved");
    setSaveError(null);
  }

  saveFnRef.current = () => onSave();

  const displayCalc =
    saveState === "unsaved" || saveState === "saving" || saveState === "error" ? savedCalc : latestCalc;
  const totalPending =
    saveState === "unsaved" || saveState === "saving" || saveState === "error";
  const vmForTotals = mapEliteOsToLovableViewModel(
    state,
    qty,
    displayCalc,
    infoDraft,
    roomLabels,
    productDrafts,
    backsplashDrafts,
  );
  const authoritativeEstimateLabel = vmForTotals?.updatedTotalLabel || vm.updatedTotalLabel;
  const authoritativeDiffLabel =
    vmForTotals?.materialUpgradeLabel ||
    vmForTotals?.changeFromOriginalLabel ||
    vm.materialUpgradeLabel ||
    vm.changeFromOriginalLabel;

  const estimateBreakdown = buildUpdatedBreakdown({
    calculation: savedCalc,
    rooms: vm.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      selectedColorName: r.selectedColorName,
    })),
  });
  const changeLines = vm.rooms.flatMap((room) => {
    const lines: Array<{
      roomName: string;
      category: string;
      originalLabel: string;
      newLabel: string;
      delta: number | null;
      reviewRequired?: boolean;
      pending?: boolean;
    }> = [];
    const roles: Array<{ role: string; category: string; summary: string | null }> = [
      { role: "backsplash", category: "Backsplash", summary: room.backsplashSummary },
      { role: "sink", category: "Sink", summary: room.sinkSummary },
      { role: "faucet", category: "Faucet", summary: room.faucetSummary },
      { role: "edge", category: "Edge", summary: room.edgeSummary },
    ];
    for (const { role, category, summary } of roles) {
      const opts = room.choiceOptions.filter((c) => c.role === role);
      const selected = opts.find((c) => c.selected);
      const baseline = opts.find((c) => c.includedInBaseline);
      if (!selected || !baseline) continue;
      if (selected.optionKey === baseline.optionKey) continue;
      const delta =
        selected.visibleDelta != null
          ? Number(selected.visibleDelta)
          : selected.visibleSellPrice != null
            ? Number(selected.visibleSellPrice)
            : null;
      lines.push({
        roomName: room.name,
        category,
        originalLabel: baseline.displayLabel,
        newLabel: selected.displayLabel || summary || "Changed",
        delta: Number.isFinite(delta as number) ? delta : null,
        reviewRequired:
          selected.priceEffectLabel === "Elite will confirm this option and price." ||
          selected.priceEffectLabel === "Requires estimator review" ||
          selected.availabilityState === "review_required",
        pending: totalPending,
      });
    }
    const color = room.colors.find((c) => c.id === room.selectedColorId);
    const baselineColor = room.colors.find((c) => c.includedInBaseline);
    if (color && baselineColor && color.optionKey !== baselineColor.optionKey) {
      lines.push({
        roomName: room.name,
        category: "Material",
        originalLabel: baselineColor.name,
        newLabel: color.name,
        delta: null,
        pending: totalPending,
      });
    }
    return lines;
  });
  const changesBreakdown = buildChangesBreakdown({
    changeLines: totalPending ? [] : changeLines,
    displayTotalDelta:
      (savedCalc as { displayTotalDelta?: number } | null)?.displayTotalDelta ?? null,
    roomPricingChanges:
      (savedCalc as {
        roomPricingChanges?: import("./publicConfigApi").PublicRoomPricingChanges | null;
      } | null)?.roomPricingChanges ?? null,
  });
  const activeBreakdown = estimateTab === "changes" ? changesBreakdown : estimateBreakdown;

  const canPrint =
    (saveState === "idle" || saveState === "saved") && !totalPending && Boolean(savedCalc);
  const printDisabledReason =
    saveState === "saving" || saveState === "unsaved"
      ? "Saving…"
      : saveState === "error"
        ? "Save failed — retry before printing"
        : !savedCalc
          ? "Estimate not ready"
          : null;

  const printModel = useMemo(
    () =>
      buildDigitalEstimatePrintModel({
        rooms: vm.rooms,
        roomPricing:
          (savedCalc as { roomPricing?: import("./publicConfigApi").PublicRoomPricing | null } | null)
            ?.roomPricing ?? null,
        estimateTotal:
          (savedCalc as { configuredDisplayTotal?: number | null } | null)?.configuredDisplayTotal ??
          null,
        customerName: vm.customerName,
        projectName: vm.projectName,
        projectAddress: vm.projectAddress,
        quoteNumber: vm.quoteNumber,
        pricingValidThrough: vm.pricingValidThrough
          ? formatDate(vm.pricingValidThrough)
          : null,
        projectNote,
      }),
    [vm, savedCalc, projectNote],
  );

  const onPrintEstimate = () => {
    if (!canPrint) return;
    window.print();
  };

  const printEstimateButton = (testId: string, className?: string) => (
    <button
      type="button"
      onClick={onPrintEstimate}
      disabled={!canPrint}
      aria-label={canPrint ? "Print estimate" : printDisabledReason || "Print estimate unavailable"}
      aria-disabled={!canPrint}
      data-testid={testId}
      className={
        className ||
        "w-full rounded-lg border border-border bg-background py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      }
    >
      {saveState === "saving" || saveState === "unsaved" ? "Saving…" : "Print estimate"}
    </button>
  );

  const summaryCard = (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm" data-testid="de-estimate-panel">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">Your estimate</div>
      <div className="mt-3 flex gap-1 rounded-lg border border-border bg-muted/30 p-1" data-testid="de-estimate-tabs" role="tablist" aria-label="Estimate summary">
        {(
          [
            ["estimate", "Estimate"],
            ["changes", "Changes"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`de-tab-${id}`}
            aria-selected={estimateTab === id}
            aria-controls={`de-tabpanel-${id}`}
            data-testid={`de-estimate-tab-${id}`}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${
              estimateTab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setEstimateTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="mt-4 space-y-2 text-sm"
        role="tabpanel"
        id={`de-tabpanel-${estimateTab}`}
        aria-labelledby={`de-tab-${estimateTab}`}
        data-testid="de-estimate-tabpanel"
      >
        <Row label="Published estimate" value={vm.originalTotalLabel} muted />
        <Row label="Your estimate" value={authoritativeEstimateLabel} />
        {totalPending ? (
          <div
            className="flex items-center justify-between text-xs text-muted-foreground"
            data-testid="de-pending-total"
          >
            <span>Pending changes</span>
            <span>Not saved yet</span>
          </div>
        ) : null}
        <Row label="Difference" value={authoritativeDiffLabel} />
        <div className="flex items-center justify-between border-t border-border pt-3 text-base font-semibold">
          <span>{activeBreakdown.title}</span>
          <span data-testid="de-updated-total">{activeBreakdown.totalLabel}</span>
        </div>
      </div>
      <button
        type="button"
        className="mt-3 text-xs font-medium text-muted-foreground underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        data-testid="de-view-breakdown"
        onClick={() => setBreakdownOpen((v) => !v)}
      >
        {breakdownOpen ? "Hide breakdown" : "View breakdown"}
      </button>
      {breakdownOpen ? (
        <div
          className="mt-3 max-h-[40vh] space-y-2 overflow-y-auto border-t border-border pt-3"
          data-testid="de-estimate-breakdown"
        >
          {activeBreakdown.lines.length ? (
            groupBreakdownLinesByRoom(activeBreakdown.lines).map((group) => (
              <div
                key={group.roomName || "project"}
                className="space-y-1.5 border-b border-border/60 pb-2 last:border-b-0"
                data-testid="de-breakdown-room-group"
              >
                <div
                  className="text-xs font-semibold text-foreground"
                  data-testid="de-breakdown-room-heading"
                >
                  {group.roomName || "Project"}
                </div>
                {group.lines.map((line) => (
                  <div
                    key={line.key}
                    className={`text-xs ${line.indent ? "pl-3" : ""}`}
                    data-testid="de-breakdown-line"
                  >
                    <div
                      className={`flex items-start justify-between gap-2 ${
                        line.emphasis
                          ? "font-semibold text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      <span>
                        {line.category && !line.indent ? `${line.category}: ` : ""}
                        {line.label}
                      </span>
                      {line.amountLabel ? (
                        <span className="shrink-0 tabular-nums text-foreground">{line.amountLabel}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">{activeBreakdown.emptyMessage}</p>
          )}
        </div>
      ) : null}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Pricing valid through {formatDate(vm.pricingValidThrough)}. Totals calculated by your estimator
        system — not final acceptance.
      </p>
      <div className="mt-4 de-interactive-chrome">{printEstimateButton("de-print-estimate")}</div>
      <div className="mt-5 space-y-2" data-testid="de-autosave-status-system">
        {accessoryNotice ? (
          <p
            className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-center text-xs text-foreground"
            role="status"
            data-testid="de-accessory-compat-notice"
          >
            {accessoryNotice}
            <button
              type="button"
              className="ml-2 underline underline-offset-2"
              onClick={() => setAccessoryNotice(null)}
            >
              Dismiss
            </button>
          </p>
        ) : null}
        <span
          className={`block text-center text-xs ${
            saveState === "error" ? "text-destructive" : "text-muted-foreground"
          }`}
          role="status"
          data-testid="de-save-status"
          data-save-state={saveState}
        >
          {saveState === "idle" || saveState === "saved" ? "All changes saved" : null}
          {saveState === "unsaved" ? "Saving your changes…" : null}
          {saveState === "saving" ? "Saving…" : null}
          {saveState === "error" ? saveError || "We couldn’t save that change. Please try again." : null}
        </span>
        {saveState === "error" ? (
          <button
            type="button"
            onClick={() => void onSave()}
            className="w-full rounded-lg bg-foreground py-3 text-sm font-semibold text-background transition hover:bg-foreground/90"
            data-testid="de-save-button"
          >
            Couldn’t save — Retry
          </button>
        ) : null}
            {reviewUiEnabled() ? (
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            disabled={
              saveState === "unsaved" ||
              saveState === "saving" ||
              saveState === "error" ||
              (Boolean(reviewRequest) && !reviewRequest?.currentSelectionsDifferFromSubmitted)
            }
            data-testid="de-request-review"
            className="w-full rounded-lg bg-foreground py-3 text-sm font-semibold text-background transition hover:bg-foreground/90 disabled:opacity-50"
          >
            {reviewRequest ? "Request already sent" : "Request review"}
          </button>
        ) : null}
        {reviewError ? <p className="text-center text-xs text-destructive">{reviewError}</p> : null}
      </div>
      {reviewRequest ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
          <div className="font-medium text-foreground">{reviewRequest.statusLabel}</div>
          <div className="mt-1 text-muted-foreground">
            Sent {formatDate(reviewRequest.requestedAt)}
          </div>
          <p className="mt-2 text-muted-foreground" data-testid="de-review-confirmation">
            {reviewRequest.nonAcceptanceNotice ||
              "Your selections were sent to Elite for review."}
          </p>
        </div>
      ) : null}
    </div>
  );

  return (
    <>
    <div className="min-h-screen bg-[oklch(0.98_0.005_260)] pb-36 lg:pb-10 de-screen-root de-no-print">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex w-[min(100%,1650px)] max-w-[1650px] items-center justify-between px-4 sm:px-6 py-3">
          <div className="text-sm font-semibold tracking-tight text-foreground">
            Elite Stone Fabrication
          </div>
          <span className="text-xs text-muted-foreground">Digital Estimate</span>
        </div>
      </header>

      <div
        className="mx-auto w-[min(95vw,1650px)] max-w-[1650px] px-4 sm:px-6 py-6 lg:py-8"
        data-testid="de-page-shell"
      >
        <section
          className="rounded-2xl border border-border bg-background px-4 py-4 shadow-sm sm:px-5"
          data-testid="de-compact-header"
          aria-label="Estimate summary"
        >
          <h1
            className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            data-testid="de-project-name"
          >
            {vm.projectName || "Your project"}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground" data-testid="de-customer-name">
            {vm.customerName}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {vm.quoteNumber ? (
              <span data-testid="de-quote-number">{vm.quoteNumber}</span>
            ) : null}
            {vm.pricingValidThrough ? (
              <span data-testid="de-pricing-valid">
                Pricing valid through {formatDate(vm.pricingValidThrough)}
              </span>
            ) : null}
          </div>

          <dl
            className="mt-4 grid grid-cols-1 gap-2 border-t border-border/70 pt-3 text-sm sm:grid-cols-3"
            data-testid="de-header-totals"
          >
            <div className="flex items-baseline justify-between gap-2 sm:block">
              <dt className="text-xs text-muted-foreground">Published estimate</dt>
              <dd
                className="font-semibold tabular-nums text-foreground"
                data-testid="de-header-original"
              >
                {vm.originalTotalLabel}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 sm:block">
              <dt className="text-xs text-muted-foreground">Your estimate</dt>
              <dd
                className="font-semibold tabular-nums text-foreground"
                data-testid="de-header-current"
              >
                {authoritativeEstimateLabel}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 sm:block">
              <dt className="text-xs text-muted-foreground">Difference</dt>
              <dd
                className="font-semibold tabular-nums text-foreground"
                data-testid="de-header-difference"
              >
                {authoritativeDiffLabel || "No change"}
              </dd>
            </div>
          </dl>

          <p
            className={`mt-3 text-xs ${
              saveState === "error" ? "text-destructive" : "text-muted-foreground"
            }`}
            role="status"
            data-testid="de-header-save-status"
            data-save-state={saveState}
          >
            {saveState === "idle" || saveState === "saved" ? "All changes saved" : null}
            {saveState === "unsaved" ? "Saving…" : null}
            {saveState === "saving" ? "Saving…" : null}
            {saveState === "error"
              ? saveError || "Couldn’t save — use Retry below"
              : null}
          </p>
          <p className="mt-3 text-sm text-foreground" data-testid="de-primary-instruction">
            Review each room and choose the options you prefer.
          </p>
        </section>

        {(() => {
          const grouped = groupMissingInformationRequirements(
            vm.missingInformationRequirements,
            Object.fromEntries(vm.rooms.map((r) => [r.id, r.name])),
          );
          if (!grouped.length) return null;
          return (
            <details
              className="mt-4 rounded-2xl border border-border bg-muted/20 px-4 py-3"
              data-testid="de-missing-info-banner"
            >
              <summary
                className="cursor-pointer list-none text-sm font-medium text-foreground"
                data-testid="de-missing-info-summary"
              >
                {missingInfoHeadline(grouped)}
                <span className="ml-2 text-xs font-normal text-muted-foreground underline-offset-2 hover:underline">
                  View details
                </span>
              </summary>
              <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
                {grouped.map((g) => (
                  <div key={g.key} data-testid="de-missing-info-group">
                    <div className="text-sm font-medium text-foreground">{g.title}</div>
                    <div className="text-[11px] text-muted-foreground">{g.timingLabel}</div>
                    {g.rooms.length ? (
                      <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                        {g.rooms.map((room) => (
                          <li key={room}>{room}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          );
        })()}

        <details
          className="mt-4 rounded-2xl border border-border bg-background px-4 py-3 shadow-sm"
          data-testid="de-customer-info"
        >
          <summary
            className="cursor-pointer list-none text-sm font-medium text-foreground"
            data-testid="de-project-details-summary"
          >
            Project details
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Contact, address, and corrections
            </span>
          </summary>
          <div className="mt-3 border-t border-border/60 pt-3">
            <p className="text-xs text-muted-foreground">
              Started from your estimator&apos;s records. Suggested corrections are saved with your
              selections for review — they do not change source accounts directly.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {(
                [
                  ["customerName", "Customer name"],
                  ["projectName", "Project / job name"],
                  ["phone", "Phone"],
                  ["email", "Email"],
                  ["projectAddress", "Project address"],
                ] as const
              ).map(([field, label]) => {
                const sourceVal = String(vm.sourceProject[field] || "");
                const draftVal = infoDraft[field] || "";
                const changed = Boolean(draftVal) && draftVal !== sourceVal;
                return (
                  <label
                    key={field}
                    className={
                      field === "projectAddress"
                        ? "sm:col-span-2 grid gap-1 text-sm"
                        : "grid gap-1 text-sm"
                    }
                  >
                    <span className="text-xs font-medium text-muted-foreground">{label}</span>
                    <input
                      className="rounded-md border border-border bg-background px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                      value={draftVal}
                      data-testid={`de-info-${field}`}
                      onChange={(e) => {
                        setInfoDraft((prev) => ({ ...prev, [field]: e.target.value }));
                        setSaveState("unsaved");
                      }}
                    />
                    {sourceVal ? (
                      <span className="text-[11px] text-muted-foreground">
                        {changed
                          ? `Suggested change · estimator value: ${sourceVal}`
                          : "Matches estimate"}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </div>
        </details>

        <div
          className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,30%)] xl:grid-cols-[minmax(0,1fr)_minmax(300px,28%)]"
          data-testid="de-main-layout"
        >
          <div className="space-y-4" data-testid="de-rooms-column">
            {vm.rooms.map((room) => (
              <CustomerRoomCard
                key={room.id}
                room={{ ...room, roomNote: roomNotes[room.id] || room.roomNote || "" }}
                catalogPermissions={normalizeCatalogPermissions(
                  (vm.catalogPermissions ||
                    config?.customerCatalogPermissions ||
                    null) as Record<string, boolean> | null,
                )}
                onOpenModal={(kind) => setActiveModal({ roomId: room.id, kind })}
                onRename={(name) => {
                  setRoomLabels((prev) => ({ ...prev, [room.id]: name }));
                  setSaveState("unsaved");
                }}
                onEdgeChange={(optionKey) => selectChoice(optionKey, "edge", room.id)}
              />
            ))}

            <div className="rounded-2xl border border-border bg-background p-6">
              <label className="text-xs uppercase tracking-widest text-muted-foreground">
                Project note
              </label>
              <div className="mt-1 text-lg font-semibold text-foreground">
                Anything else we should know about your project?
              </div>
              <textarea
                className="mt-4 min-h-[88px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                value={projectNote}
                maxLength={2000}
                data-testid="de-project-note"
                onChange={(e) => {
                  setProjectNote(e.target.value);
                  setSaveState("unsaved");
                }}
                onBlur={() => { /* debounced autosave */ }}
              />
            </div>

            {reviewUiEnabled() ? (
              <section
                className="rounded-2xl border border-border bg-background p-5 shadow-sm"
                data-testid="de-review-cta"
              >
                <h2 className="text-base font-semibold text-foreground">
                  Ready for Elite to review your selections?
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Send your estimate for review — not final acceptance.
                </p>
                <div className="mt-4 space-y-2 de-interactive-chrome">
                  {printEstimateButton("de-print-estimate-bottom")}
                </div>
                <button
                  type="button"
                  onClick={() => setReviewOpen(true)}
                  disabled={
                    saveState === "unsaved" ||
                    saveState === "saving" ||
                    saveState === "error" ||
                    (Boolean(reviewRequest) && !reviewRequest?.currentSelectionsDifferFromSubmitted)
                  }
                  className="mt-2 w-full rounded-lg bg-foreground py-3 text-sm font-semibold text-background disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                  data-testid="de-request-review-bottom"
                >
                  {reviewRequest ? "Request already sent" : "Request review"}
                </button>
              </section>
            ) : (
              <div className="de-interactive-chrome">{printEstimateButton("de-print-estimate-bottom")}</div>
            )}
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start" data-testid="de-estimate-workspace">
            {summaryCard}
          </aside>
        </div>
      </div>

      {modalRoom && activeModal?.kind === "color" ? (
        <ColorPickerModal
          room={modalRoom}
          onSelect={(c) => selectColor(modalRoom.id, c)}
          onClose={() => setActiveModal(null)}
        />
      ) : null}

      {modalRoom && activeModal?.kind === "backsplash" ? (
        <BacksplashModal
          room={modalRoom}
          draft={backsplashDrafts[modalRoom.id] || modalRoom.backsplashDraft || { mode: "none" }}
          onClose={() => {
            setActiveModal(null);
          }}
          onSelectOption={(optionKey) => {
            const token = optionKey.split(":").slice(2).join(":").toLowerCase();
            let mode: BacksplashDraft["mode"] = "none";
            if (token.includes("custom")) mode = "custom_height";
            else if (token.includes("full")) mode = "full_height";
            else if (token.includes("4") || token.includes("standard")) mode = "standard_4in";
            else if (token === "none") mode = "none";
            else mode = token;
            updateBacksplashDraft(modalRoom.id, {
              ...(backsplashDrafts[modalRoom.id] || modalRoom.backsplashDraft || { mode }),
              mode,
              optionKey,
            });
            selectChoice(optionKey, "backsplash", modalRoom.id);
          }}
          onDraftChange={(next) => {
            updateBacksplashDraft(modalRoom.id, next);
          }}
        />
      ) : null}

      {modalRoom && (activeModal?.kind === "sink" || activeModal?.kind === "faucet") ? (
        <PlumbingSourceModal
          room={modalRoom}
          role={activeModal.kind}
          draft={
            (activeModal.kind === "sink"
              ? productDrafts[modalRoom.id]?.sink || modalRoom.sinkDraft
              : productDrafts[modalRoom.id]?.faucet || modalRoom.faucetDraft) || {
              source: "none",
            }
          }
          products={activeModal.kind === "sink" ? modalRoom.sinkProducts : modalRoom.faucetProducts}
          onClose={() => {
            setActiveModal(null);
          }}
          onSelectSource={(kind, optionKey) =>
            applyPlumbingSource(modalRoom.id, activeModal.kind as "sink" | "faucet", kind, optionKey)
          }
          onSelectProduct={(product, variantId) =>
            applyEsfProduct(modalRoom.id, activeModal.kind as "sink" | "faucet", product, variantId)
          }
          onDraftChange={(next) =>
            updateProductDraft(modalRoom.id, activeModal.kind as "sink" | "faucet", next)
          }
        />
      ) : null}

      {modalRoom && activeModal?.kind === "sidesplash" ? (
        <ModalShell
          title="Side splash"
          eyebrow={modalRoom.name}
          onClose={() => setActiveModal(null)}
          testId="de-sidesplash-modal"
        >
          <div className="space-y-5">
            {modalRoom.sideSplashPieces.map((piece) => (
              <div key={piece.pieceKey} data-testid="de-sidesplash-piece">
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {piece.pieceLabel}
                </div>
                <ChoiceRadio
                  options={piece.options}
                  name={`sidesplash-${modalRoom.id}-${piece.pieceKey}`}
                  onSelect={(optionKey) => selectChoice(optionKey, "sidesplash", modalRoom.id)}
                />
              </div>
            ))}
          </div>
        </ModalShell>
      ) : null}

      {modalRoom && activeModal?.kind === "cooktop" ? (
        <ModalShell
          title="Cooktop / cutouts"
          eyebrow={modalRoom.name}
          onClose={() => setActiveModal(null)}
          testId="de-cooktop-modal"
        >
          <ChoiceRadio
            options={modalRoom.choiceOptions.filter((c) => c.role === "cooktop")}
            name={`cooktop-${modalRoom.id}`}
            onSelect={(optionKey) => selectChoice(optionKey, "cooktop", modalRoom.id)}
          />
        </ModalShell>
      ) : null}

      {modalRoom && (activeModal?.kind === "accessories" || activeModal?.kind === "specialty") ? (
        <AccessoriesOrSpecialtyModal
          kind={activeModal.kind}
          room={modalRoom}
          onClose={() => setActiveModal(null)}
          onToggle={(optionKey, role) => toggleMultiChoice(optionKey, role, modalRoom.id)}
        />
      ) : null}

      {modalRoom && activeModal?.kind === "notes" ? (
        <ModalShell
          title="Notes"
          eyebrow={modalRoom.name}
          onClose={() => {
            setActiveModal(null);
          }}
          testId="de-notes-modal"
        >
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Questions or notes for your estimator
          </label>
          <textarea
            className="mt-2 min-h-[120px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            value={roomNotes[modalRoom.id] || modalRoom.roomNote || ""}
            maxLength={2000}
            data-testid="de-room-note"
            onChange={(e) => {
              setRoomNotes((prev) => ({ ...prev, [modalRoom.id]: e.target.value }));
              setSaveState("unsaved");
            }}
          />
        </ModalShell>
      ) : null}

      {reviewOpen ? (
        <ReviewRequestModal
          rooms={vm.rooms}
          busy={reviewBusy}
          configuredTotalLabel={authoritativeEstimateLabel}
          unresolvedCount={vm.missingInformationRequirements.length}
          onClose={() => setReviewOpen(false)}
          onSubmit={(note) => void onSendReview(note)}
        />
      ) : null}

      {/* Mobile / tablet compact sticky total bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden de-no-print"
        data-testid="de-mobile-total-bar"
      >
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          data-testid="de-mobile-total-open"
          onClick={() => {
            setBreakdownOpen(true);
            setEstimateTab("estimate");
            document
              .querySelector('[data-testid="de-estimate-workspace"]')
              ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }}
        >
          <span>
            <span className="block text-[11px] uppercase tracking-wider text-muted-foreground">
              Your estimate
            </span>
            <span className="text-base font-semibold tabular-nums text-foreground">
              {authoritativeEstimateLabel}
            </span>
          </span>
          <span className="text-xs font-medium text-muted-foreground">View summary</span>
        </button>
        <div className="mt-2">{printEstimateButton("de-print-estimate-mobile")}</div>
      </div>
    </div>
    <div className="de-print-root" aria-hidden="true">
      <DigitalEstimatePrintDocument model={printModel} />
    </div>
    </>
  );
}
