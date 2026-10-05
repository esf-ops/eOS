import { Suspense, lazy, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ApiError, apiGet, apiPost } from "../lib/api";
import { config } from "../lib/config";
import { emptyDocument, estimateReducer, groupItemsByRoom, newId, cloneDocument, type DocAction } from "../lib/estimateDocument";
import type {
  EstimateCatalog,
  EstimatePricing,
  EstimateTotals,
  LoadedQuote,
  SavedPrint,
  PricedItem,
  SaveMode,
  SaveResult,
  SavedQuoteSummary
} from "../lib/estimateTypes";
import AddItemMenu, { type QuickAddChoice } from "./AddItemMenu";
import EstimateHeader from "./EstimateHeader";
import ItemEditor from "./ItemEditor";
import RoomSection from "./RoomSection";
import TotalsSummary from "./TotalsSummary";
import { formatMoney } from "./format";

const ReviewPanel = lazy(() => import("./ReviewPanel"));

const PRICE_DEBOUNCE_MS = 220;
const RECENT_MATERIALS_KEY = "eliteos.estimateBuilder.recentMaterials";

export type SavedRef = {
  quoteId: string;
  quoteNumber: string;
  revisionLabel: string | null;
  status: string;
  isCurrentRevision: boolean;
};

type PricingState = { data: EstimatePricing | null; pending: boolean; error: string };

/** Recent-material shortcuts are a per-browser convenience only; the Brain catalog stays the authority. */
function loadRecentMaterials(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_MATERIALS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

export default function EstimateBuilder({ token, preparedByDefault }: { token: string; preparedByDefault: string }) {
  const [doc, dispatchRaw] = useReducer(estimateReducer, undefined, () => {
    const d = emptyDocument("direct");
    d.header.preparedBy = preparedByDefault;
    return d;
  });
  const [catalog, setCatalog] = useState<EstimateCatalog | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [pricing, setPricing] = useState<PricingState>({ data: null, pending: false, error: "" });
  const [saved, setSaved] = useState<SavedRef | null>(null);
  const [savedTotals, setSavedTotals] = useState<EstimateTotals | null>(null);
  const [savedPrint, setSavedPrint] = useState<SavedPrint | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "danger"; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addMenu, setAddMenu] = useState<{ roomId: string | null } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [openList, setOpenList] = useState<SavedQuoteSummary[] | null>(null);
  const [recentMaterials, setRecentMaterials] = useState<string[]>(loadRecentMaterials);
  const priceSeq = useRef(0);

  const dispatch = useCallback((action: DocAction) => {
    dispatchRaw(action);
    if (action.type !== "replace") setDirty(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiGet<EstimateCatalog>("/api/estimate-builder/catalog", token)
      .then((c) => !cancelled && setCatalog(c))
      .catch((e) => !cancelled && setCatalogError(e instanceof ApiError ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Live pricing: every document change is re-priced by the Brain (debounced, latest-request-wins).
  useEffect(() => {
    if (!catalog) return;
    const seq = ++priceSeq.current;
    const ctrl = new AbortController();
    setPricing((p) => ({ ...p, pending: true }));
    const timer = window.setTimeout(() => {
      apiPost<EstimatePricing>("/api/estimate-builder/price", token, { document: doc, quoteNumber: saved?.quoteNumber ?? "", revisionLabel: saved?.revisionLabel ?? "" }, ctrl.signal)
        .then((data) => {
          if (seq === priceSeq.current) setPricing({ data, pending: false, error: "" });
        })
        .catch((e) => {
          if ((e as Error)?.name === "AbortError" || seq !== priceSeq.current) return;
          setPricing((p) => ({ ...p, pending: false, error: e instanceof ApiError ? e.message : String(e) }));
        });
    }, PRICE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [doc, catalog, token, saved?.quoteNumber, saved?.revisionLabel]);

  const pricedById = useMemo(() => {
    const m = new Map<string, PricedItem>();
    for (const p of pricing.data?.items ?? []) m.set(p.itemId, p);
    return m;
  }, [pricing.data]);

  const groups = useMemo(() => groupItemsByRoom(doc), [doc]);
  const roomTotals = useMemo(() => {
    const m = new Map<string | null, number>();
    for (const p of pricing.data?.items ?? []) m.set(p.roomId, (m.get(p.roomId) ?? 0) + (p.amount || 0));
    return m;
  }, [pricing.data]);

  const rememberMaterial = useCallback((colorId: string | null) => {
    if (!colorId) return;
    setRecentMaterials((prev) => {
      const next = [colorId, ...prev.filter((x) => x !== colorId)].slice(0, 8);
      try {
        localStorage.setItem(RECENT_MATERIALS_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable — recents are optional
      }
      return next;
    });
  }, []);

  const addItem = useCallback(
    (choice: QuickAddChoice, roomId: string | null) => {
      const id = newId();
      dispatch({
        type: "add_item",
        spec: {
          id,
          itemType: choice.itemType,
          pricingStrategy: choice.pricingStrategy,
          roomId,
          inputs: choice.inputs,
          now: new Date().toISOString()
        }
      });
      setAddMenu(null);
      setEditingId(id);
    },
    [dispatch]
  );

  const addRoom = useCallback(
    (name: string) => {
      const id = newId();
      dispatch({ type: "add_room", id, name });
      return id;
    },
    [dispatch]
  );

  const applyTemplate = useCallback(
    (templateId: string) => {
      const template = catalog?.templates.find((t) => t.id === templateId);
      if (!template || !template.items.length) return;
      dispatch({ type: "append_template", template, newId, now: new Date().toISOString() });
    },
    [catalog, dispatch]
  );

  const save = useCallback(
    async (mode: SaveMode, status: string) => {
      if (config.preview) {
        setNotice({ tone: "warn", text: "Saving is disabled in local preview mode (no signed-in session)." });
        return null;
      }
      setSaving(true);
      setNotice(null);
      try {
        const res = await apiPost<SaveResult>("/api/estimate-builder/save", token, {
          document: doc,
          quote_status: status,
          save_mode: mode,
          quote_id: mode === "create" ? null : saved?.quoteId ?? null
        });
        setSaved({
          quoteId: res.quote_id,
          quoteNumber: res.quote_number,
          revisionLabel: res.revision_label,
          status: res.quote_status,
          isCurrentRevision: true
        });
        setSavedTotals(res.pricing.totals);
        setDirty(false);
        // Re-read what Brain persisted so review and PDF show the stored quote, not browser state.
        try {
          const stored = await apiGet<LoadedQuote>(`/api/estimate-builder/quotes/${encodeURIComponent(res.quote_id)}`, token);
          setSavedPrint(stored.saved);
          setSavedTotals(stored.savedPricing);
        } catch {
          setSavedPrint(null);
        }
        setNotice({
          tone: "ok",
          text: `${mode === "save_revision" ? "Revision saved" : "Saved"} to Quote Library as ${res.quote_number}${
            res.revision_label ? ` (${res.revision_label})` : ""
          }.`
        });
        return res;
      } catch (e) {
        const payload = e instanceof ApiError ? (e.payload as { blockers?: string[] } | null) : null;
        const blockers = payload?.blockers?.length ? ` ${payload.blockers.join(" ")}` : "";
        setNotice({ tone: "danger", text: `${e instanceof Error ? e.message : String(e)}${blockers}` });
        return null;
      } finally {
        setSaving(false);
      }
    },
    [doc, saved, token]
  );

  const saveDraft = useCallback(() => {
    if (!doc.items.length) {
      setNotice({ tone: "warn", text: "Add at least one item before saving." });
      return;
    }
    void save(saved ? "update_existing" : "create", saved?.status && saved.status !== "draft" ? saved.status : "draft");
  }, [doc.items.length, save, saved]);

  const openSavedList = useCallback(async () => {
    if (config.preview) {
      setNotice({ tone: "warn", text: "Opening saved estimates needs a signed-in session." });
      return;
    }
    try {
      const res = await apiGet<{ quotes: SavedQuoteSummary[] }>("/api/estimate-builder/quotes", token);
      setOpenList(res.quotes ?? []);
    } catch (e) {
      setNotice({ tone: "danger", text: e instanceof Error ? e.message : String(e) });
    }
  }, [token]);

  const openSaved = useCallback(
    async (id: string) => {
      if (dirty && !window.confirm("Discard unsaved changes and open another estimate?")) return;
      try {
        const res = await apiGet<LoadedQuote>(`/api/estimate-builder/quotes/${encodeURIComponent(id)}`, token);
        dispatchRaw({ type: "replace", doc: res.document });
        setSaved({
          quoteId: res.quote.id,
          quoteNumber: res.quote.quote_number,
          revisionLabel: res.quote.revision_label,
          status: res.quote.quote_status ?? "draft",
          isCurrentRevision: res.quote.is_current_revision
        });
        setSavedTotals(res.savedPricing);
        setSavedPrint(res.saved);
        setDirty(false);
        setOpenList(null);
        setEditingId(null);
        const drift = res.savedPricing && Math.abs((res.savedPricing.total ?? 0) - res.pricing.totals.total) >= 0.01;
        setNotice(
          drift
            ? {
                tone: "warn",
                text: `Current pricing (${formatMoney(res.pricing.totals.total)}) differs from the saved total (${formatMoney(
                  res.savedPricing!.total
                )}). Save a revision to lock in current pricing.`
              }
            : { tone: "ok", text: `Opened ${res.quote.quote_number}.` }
        );
      } catch (e) {
        setNotice({ tone: "danger", text: e instanceof Error ? e.message : String(e) });
      }
    },
    [dirty, token]
  );

  const newEstimate = useCallback(() => {
    if (dirty && !window.confirm("Discard unsaved changes and start a new estimate?")) return;
    const d = emptyDocument(doc.pricingChannel);
    d.header.preparedBy = preparedByDefault;
    dispatchRaw({ type: "replace", doc: d });
    setSaved(null);
    setSavedTotals(null);
    setSavedPrint(null);
    setDirty(false);
    setEditingId(null);
    setNotice(null);
  }, [dirty, doc.pricingChannel, preparedByDefault]);

  const duplicateEstimate = useCallback(() => {
    dispatchRaw({ type: "replace", doc: cloneDocument(doc, newId) });
    setSaved(null);
    setSavedTotals(null);
    setSavedPrint(null);
    setDirty(true);
    setNotice({ tone: "ok", text: "Duplicated as a new unsaved estimate." });
  }, [doc]);

  // Keyboard: ⌘/Ctrl+K add item, ⌘/Ctrl+S save draft, Esc closes the top-most layer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAddMenu({ roomId: doc.rooms.length ? doc.rooms[doc.rooms.length - 1].id : null });
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveDraft();
      } else if (e.key === "Escape") {
        if (addMenu) setAddMenu(null);
        else if (editingId) setEditingId(null);
        else if (openList) setOpenList(null);
        else if (reviewOpen) setReviewOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addMenu, doc.rooms, editingId, openList, reviewOpen, saveDraft]);

  const editingItem = editingId ? doc.items.find((it) => it.id === editingId) ?? null : null;
  const blockerCount = pricing.data?.readiness.blockers.length ?? 0;
  const readOnly = Boolean(saved && !saved.isCurrentRevision);

  if (catalogError) {
    return (
      <main className="eb-page">
        <div className="eb-banner eb-banner-danger">Could not load the Estimate Builder catalog: {catalogError}</div>
      </main>
    );
  }
  if (!catalog) {
    return (
      <main className="eb-page">
        <p className="eb-muted">Loading catalog…</p>
      </main>
    );
  }

  return (
    <main className="eb-page">
      {config.preview ? (
        <div className="eb-banner eb-banner-warn eb-no-print">
          Local preview — prices come from the dev pricing harness running production pricing code. Saving is disabled.
        </div>
      ) : null}

      <div className="eb-no-print">
        <EstimateHeader
          doc={doc}
          dispatch={dispatch}
          saved={saved}
          dirty={dirty}
          onNew={newEstimate}
          onOpen={() => void openSavedList()}
          onDuplicate={duplicateEstimate}
        />

        {notice ? (
          <div className={`eb-banner eb-banner-row eb-banner-${notice.tone}`} role="status">
            <span>{notice.text}</span>
            <button type="button" className="eb-link" onClick={() => setNotice(null)} aria-label="Dismiss">
              Dismiss
            </button>
          </div>
        ) : null}
        {readOnly ? (
          <div className="eb-banner eb-banner-warn">This is a historical revision. Open the current revision to make changes.</div>
        ) : null}
        {catalog.materialCatalogWarnings.length ? (
          <div className="eb-banner eb-banner-warn">{catalog.materialCatalogWarnings.join(" ")}</div>
        ) : null}

        <div className="eb-layout">
          <section className="eb-canvas" aria-label="Estimate items">
            {doc.items.length === 0 && doc.rooms.length === 0 ? (
              <EmptyState
                catalog={catalog}
                onQuickAdd={(c) => addItem(c, null)}
                onOpenMenu={() => setAddMenu({ roomId: null })}
                onTemplate={applyTemplate}
                onAddRoom={addRoom}
              />
            ) : (
              <>
                <div className="eb-canvas-toolbar">
                  <button
                    type="button"
                    className="eb-btn eb-btn-primary"
                    onClick={() => setAddMenu({ roomId: doc.rooms.length ? doc.rooms[doc.rooms.length - 1].id : null })}
                    disabled={readOnly}
                  >
                    + Add item <kbd>⌘K</kbd>
                  </button>
                  <AddRoomControl suggestions={catalog.roomSuggestions} existing={doc.rooms.map((r) => r.name)} onAdd={addRoom} />
                  <TemplateSelect catalog={catalog} onTemplate={applyTemplate} />
                  <span className="eb-spacer" />
                  {pricing.pending ? <span className="eb-muted eb-small">Pricing…</span> : null}
                  {pricing.error ? <span className="eb-danger-text eb-small">Pricing unavailable: {pricing.error}</span> : null}
                </div>
                {groups.map((g) => (
                  <RoomSection
                    key={g.room?.id ?? "__project"}
                    room={g.room}
                    items={g.items}
                    rooms={doc.rooms}
                    pricedById={pricedById}
                    roomTotal={roomTotals.get(g.room?.id ?? null) ?? 0}
                    isFirstRoom={g.room ? doc.rooms[0]?.id === g.room.id : false}
                    isLastRoom={g.room ? doc.rooms[doc.rooms.length - 1]?.id === g.room.id : false}
                    stale={pricing.pending}
                    dispatch={dispatch}
                    onEdit={setEditingId}
                    onAddItem={(roomId) => setAddMenu({ roomId })}
                    readOnly={readOnly}
                  />
                ))}
              </>
            )}
          </section>

          <aside className="eb-side">
            <TotalsSummary
              totals={pricing.data?.totals ?? null}
              savedTotals={dirty ? null : savedTotals}
              stale={pricing.pending}
              channel={doc.pricingChannel}
            />
            <div className="eb-actions">
              <button type="button" className="eb-btn" onClick={saveDraft} disabled={saving || readOnly || config.preview}>
                {saving ? "Saving…" : saved ? "Save changes" : "Save draft"}
              </button>
              {saved ? (
                <button
                  type="button"
                  className="eb-btn"
                  onClick={() => void save("save_revision", "revised")}
                  disabled={saving || config.preview || !doc.items.length}
                  title="Keep the saved version and create the next revision"
                >
                  Save as revision
                </button>
              ) : null}
              <button
                type="button"
                className="eb-btn eb-btn-primary"
                onClick={() => setReviewOpen(true)}
                disabled={!doc.items.length}
              >
                Review &amp; finalize
              </button>
              {blockerCount && doc.items.length ? (
                <p className="eb-small eb-warn-text">
                  Before finalizing: {pricing.data!.readiness.blockers[0]}
                  {blockerCount > 1 ? ` (+${blockerCount - 1} more)` : ""}
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      </div>

      {addMenu ? (
        <AddItemMenu
          catalog={catalog}
          rooms={doc.rooms}
          initialRoomId={addMenu.roomId}
          onPick={addItem}
          onClose={() => setAddMenu(null)}
        />
      ) : null}

      {editingItem ? (
        <ItemEditor
          key={editingItem.id}
          item={editingItem}
          priced={pricedById.get(editingItem.id) ?? null}
          pricingPending={pricing.pending}
          catalog={catalog}
          doc={doc}
          recentMaterials={recentMaterials}
          onRememberMaterial={rememberMaterial}
          dispatch={dispatch}
          onClose={() => setEditingId(null)}
          readOnly={readOnly}
        />
      ) : null}

      {openList ? <OpenEstimateDialog quotes={openList} onOpen={(id) => void openSaved(id)} onClose={() => setOpenList(null)} /> : null}

      {reviewOpen ? (
        <Suspense fallback={<div className="eb-review"><p className="eb-page eb-muted">Loading review…</p></div>}>
        <ReviewPanel
          doc={doc}
          pricing={pricing.data}
          pricingPending={pricing.pending}
          saved={saved}
          savedPrint={dirty ? null : savedPrint}
          saving={saving}
          canSave={!config.preview && !readOnly}
          onClose={() => setReviewOpen(false)}
          onEditItem={(id) => {
            setReviewOpen(false);
            setEditingId(id);
          }}
          onFinalize={(status) => save(saved ? "update_existing" : "create", status)}
        />
        </Suspense>
      ) : null}
    </main>
  );
}

// --- Small local pieces ---

const QUICK_ADDS: Array<QuickAddChoice & { key: string }> = [
  { key: "ct", label: "Elite 100 countertop", itemType: "countertop", pricingStrategy: "elite_100" },
  { key: "ooc", label: "Out-of-Collection countertop", itemType: "countertop", pricingStrategy: "out_of_collection" },
  { key: "vanity", label: "Vanity", itemType: "vanity", pricingStrategy: "vanity_program_2026" },
  { key: "bs", label: "Backsplash", itemType: "backsplash", pricingStrategy: "standard" },
  { key: "sink", label: "Sink / cutout", itemType: "cutout", pricingStrategy: "addon_catalog" },
  { key: "custom", label: "Custom item", itemType: "custom", pricingStrategy: "custom_line" }
];

function EmptyState({
  catalog,
  onQuickAdd,
  onOpenMenu,
  onTemplate,
  onAddRoom
}: {
  catalog: EstimateCatalog;
  onQuickAdd: (c: QuickAddChoice) => void;
  onOpenMenu: () => void;
  onTemplate: (id: string) => void;
  onAddRoom: (name: string) => string;
}) {
  return (
    <div className="eb-empty">
      <h2>Start with an item</h2>
      <p className="eb-muted">
        An estimate is a list of smart items. Add what you’re quoting — rooms are optional and can be added any time.
      </p>
      <div className="eb-empty-grid">
        {QUICK_ADDS.map((q) => (
          <button key={q.key} type="button" className="eb-quick" onClick={() => onQuickAdd(q)}>
            <span className="eb-quick-plus">+</span>
            {q.label}
          </button>
        ))}
        <button type="button" className="eb-quick eb-quick-disabled" disabled title="AI Takeoff import is coming soon">
          Import AI Takeoff <span className="eb-pill">Coming soon</span>
        </button>
      </div>
      <div className="eb-empty-row">
        <button type="button" className="eb-btn" onClick={onOpenMenu}>
          All item types <kbd>⌘K</kbd>
        </button>
        <AddRoomControl suggestions={catalog.roomSuggestions} existing={[]} onAdd={onAddRoom} />
        <TemplateSelect catalog={catalog} onTemplate={onTemplate} />
      </div>
    </div>
  );
}

function AddRoomControl({ suggestions, existing, onAdd }: { suggestions: string[]; existing: string[]; onAdd: (name: string) => string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const listId = "eb-room-suggestions";
  if (!open) {
    return (
      <button type="button" className="eb-btn" onClick={() => setOpen(true)}>
        + Room
      </button>
    );
  }
  const submit = () => {
    if (name.trim()) onAdd(name.trim());
    setName("");
    setOpen(false);
  };
  return (
    <form
      className="eb-inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        autoFocus
        list={listId}
        placeholder="Room name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
          }
        }}
        aria-label="Room name"
      />
      <datalist id={listId}>
        {suggestions
          .filter((s) => !existing.some((x) => x.toLowerCase() === s.toLowerCase()))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
      <button type="submit" className="eb-btn eb-btn-primary">
        Add
      </button>
      <button type="button" className="eb-link" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

function TemplateSelect({ catalog, onTemplate }: { catalog: EstimateCatalog; onTemplate: (id: string) => void }) {
  const options = catalog.templates.filter((t) => t.items.length);
  if (!options.length) return null;
  return (
    <select
      className="eb-select"
      value=""
      onChange={(e) => {
        if (e.target.value) onTemplate(e.target.value);
      }}
      aria-label="Add from template"
    >
      <option value="">Add from template…</option>
      {options.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );
}

function OpenEstimateDialog({
  quotes,
  onOpen,
  onClose
}: {
  quotes: SavedQuoteSummary[];
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="eb-overlay" role="dialog" aria-modal="true" aria-label="Open estimate" onClick={onClose}>
      <div className="eb-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="eb-dialog-head">
          <h2>Open estimate</h2>
          <button type="button" className="eb-icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {quotes.length === 0 ? (
          <p className="eb-muted">No saved Estimate Builder estimates yet.</p>
        ) : (
          <ul className="eb-open-list">
            {quotes.map((q) => (
              <li key={q.id}>
                <button type="button" onClick={() => onOpen(q.id)}>
                  <span className="eb-open-num">
                    {q.quote_number}
                    {q.revision_label ? ` · ${q.revision_label}` : ""}
                  </span>
                  <span className="eb-open-name">{[q.customer_name || q.account_name, q.project_name].filter(Boolean).join(" — ") || "Untitled"}</span>
                  <span className="eb-open-meta">
                    {q.quote_status ?? "draft"} · {formatMoney(q.grand_total)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}