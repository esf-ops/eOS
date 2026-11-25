import React, { useCallback, useEffect, useMemo, useState } from "react";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";
import { apiGet, ApiError } from "./lib/api";
import { getSupabase } from "./lib/supabase";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";
const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";
const HOME_URL = String(import.meta.env.VITE_HOME_URL || "https://www.eliteosfab.com").replace(/\/+$/, "");

/** Prefer Slabsmith cache — hourly, matches public SlabCloud InventoryIDs. */
const INVENTORY_SOURCE = "slabsmith";

type Slab = {
  id: string;
  inventory_id: string | null;
  color_name: string | null;
  material_name: string | null;
  price_group: string | null;
  source_price_group?: string | null;
  thickness_nominal: string | null;
  rack: string | null;
  lot: string | null;
  width_actual_in: number | null;
  length_actual_in: number | null;
  image_url: string | null;
  thumbnail_url: string | null;
  source_inventory_type?: string | null;
};

type Summary = {
  total_active_slabs?: number;
  distinct_colors?: number;
  distinct_materials?: number;
  last_sync?: {
    status?: string | null;
    finished_at?: string | null;
    triggered_by?: string | null;
  } | null;
};

type Filters = {
  materials?: string[];
  price_groups?: string[];
  thicknesses?: string[];
};

type SlabsPayload = {
  ok?: boolean;
  rows?: Slab[];
  slabs?: Slab[];
  total?: number;
  limit?: number;
  offset?: number;
};

type ToolId = "measure" | "paint" | "inquire" | "wishlist" | "email" | "download" | "quote" | "visualizer";

const TOOLS: { id: ToolId; label: string; ready: boolean }[] = [
  { id: "measure", label: "Measure", ready: false },
  { id: "paint", label: "Paint match", ready: false },
  { id: "inquire", label: "Inquire", ready: false },
  { id: "wishlist", label: "Wishlist", ready: false },
  { id: "email", label: "Email", ready: false },
  { id: "download", label: "Download", ready: true },
  { id: "quote", label: "Get a quote", ready: false },
  { id: "visualizer", label: "3D / AR", ready: false },
];

function fmtIn(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n * 10) / 10}"`;
}

function fmtArea(w: number | null | undefined, l: number | null | undefined) {
  if (w == null || l == null || !Number.isFinite(w) || !Number.isFinite(l)) return null;
  const sf = (w * l) / 144;
  return `${Math.round(sf)} ft²`;
}

function syncAgeLabel(iso: string | null | undefined) {
  if (!iso) return "Sync time unknown";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "Sync time unknown";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 2) return "Synced just now";
  if (mins < 60) return `Synced ${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 36) return `Synced ${hrs}h ago`;
  return `Synced ${Math.round(hrs / 24)}d ago`;
}

export default function LiveInventoryApp() {
  const [token, setToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "Slab" | "Remnant">("all");
  const [material, setMaterial] = useState("");
  const [priceGroup, setPriceGroup] = useState("");
  const [page, setPage] = useState(1);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [slabs, setSlabs] = useState<Slab[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Slab | null>(null);
  const [toolNote, setToolNote] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setAuthReady(true);
      return;
    }
    let cancelled = false;
    const applySession = (session: {
      access_token?: string;
      user?: { email?: string; user_metadata?: Record<string, unknown> };
    } | null) => {
      if (cancelled) return;
      setToken(session?.access_token || null);
      setUserEmail(session?.user?.email || null);
      const meta = session?.user?.user_metadata || {};
      const name = String(meta.full_name || meta.name || meta.display_name || "").trim();
      setUserName(name || null);
      setAuthReady(true);
    };
    sb.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => applySession(session));
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const [sum, fil] = await Promise.all([
          apiGet(`/api/slab-inventory/summary?source=${INVENTORY_SOURCE}`, token) as Promise<Summary & { ok?: boolean }>,
          apiGet(`/api/slab-inventory/filters?source=${INVENTORY_SOURCE}`, token) as Promise<{ filters?: Filters }>,
        ]);
        if (cancelled) return;
        setSummary(sum);
        setFilters(fil.filters || null);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const loadSlabs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const pageSize = 48;
      const params = new URLSearchParams({
        source: INVENTORY_SOURCE,
        limit: String(pageSize),
        offset: String((page - 1) * pageSize),
      });
      if (search.trim()) params.set("q", search.trim());
      if (material) params.set("material_name", material);
      if (priceGroup) params.set("price_group", priceGroup);
      if (typeFilter !== "all") params.set("type", typeFilter);
      const body = (await apiGet(`/api/slab-inventory/slabs?${params}`, token)) as SlabsPayload;
      const rows = body.rows || body.slabs || [];
      setSlabs(rows);
      setTotal(body.total ?? rows.length);
    } catch (e) {
      setSlabs([]);
      setTotal(0);
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token, page, search, material, priceGroup, typeFilter]);

  useEffect(() => {
    void loadSlabs();
  }, [loadSlabs]);

  const menuItems: EliteosTopbarMenuItem[] = useMemo(
    () => [{ id: "home", label: "Open Home", onSelect: () => { window.location.href = HOME_URL; } }],
    []
  );

  async function signOut() {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    window.location.href = HOME_URL;
  }

  function runTool(tool: ToolId, slab: Slab) {
    if (tool === "download") {
      const url = slab.image_url || slab.thumbnail_url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        setToolNote(null);
        return;
      }
      setToolNote("No verified image for this piece yet.");
      return;
    }
    setToolNote(`${TOOLS.find((t) => t.id === tool)?.label ?? tool} is next — scaffold only in v1.`);
  }

  if (!authReady) {
    return <div className="li-boot">Loading…</div>;
  }

  if (!token) {
    return (
      <div className="shell">
        <div className="li-gate">
          <p className="li-eyebrow">eliteOS</p>
          <h1>Live Inventory</h1>
          <p>Sign in from eliteOS Home. Backend authorization is enforced on every API call.</p>
          <a className="li-btn" href={HOME_URL}>
            Open Home
          </a>
        </div>
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(total / 48));

  return (
    <div className="shell">
      <EliteosTopbar
        appName="Live Inventory"
        organizationName={DEFAULT_WORKSPACE_NAME}
        logoSrc={EOS_LOGO_URL}
        homeHref={HOME_URL}
        userDisplayName={userName || userEmail || "User"}
        userEmail={userEmail || undefined}
        userRoleLabel="Staff"
        menuItems={menuItems}
        onSignOut={() => void signOut()}
      />

      <main className="main">
        <header className="li-hero">
          <div>
            <p className="li-eyebrow">eliteOS · Live stock</p>
            <h1>Live Inventory</h1>
            <p className="li-lede">
              Slabs and remnants from the governed Slabsmith cache. Measure, paint match, inquire, and share tools
              ship here — Elite 100 / catalog / kiosk stay on their own heads.
            </p>
          </div>
          <div className="li-stats" aria-label="Inventory summary">
            <div>
              <strong>{summary?.total_active_slabs ?? "—"}</strong>
              <span>Active pieces</span>
            </div>
            <div>
              <strong>{summary?.distinct_colors ?? "—"}</strong>
              <span>Colors</span>
            </div>
            <div>
              <strong>{summary?.distinct_materials ?? "—"}</strong>
              <span>Materials</span>
            </div>
            <div>
              <strong>{syncAgeLabel(summary?.last_sync?.finished_at)}</strong>
              <span>{summary?.last_sync?.triggered_by || "source"}</span>
            </div>
          </div>
        </header>

        <div className="li-toolbar">
          <input
            type="search"
            placeholder="Search by name or ID"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
          <select
            value={typeFilter}
            onChange={(e) => {
              setPage(1);
              setTypeFilter(e.target.value as "all" | "Slab" | "Remnant");
            }}
            aria-label="Type"
          >
            <option value="all">Any type</option>
            <option value="Slab">Slabs</option>
            <option value="Remnant">Remnants</option>
          </select>
          <select
            value={material}
            onChange={(e) => {
              setPage(1);
              setMaterial(e.target.value);
            }}
            aria-label="Material"
          >
            <option value="">Any material</option>
            {(filters?.materials || []).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <select
            value={priceGroup}
            onChange={(e) => {
              setPage(1);
              setPriceGroup(e.target.value);
            }}
            aria-label="Price group"
          >
            <option value="">Any price group</option>
            {(filters?.price_groups || []).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="li-btn ghost"
            onClick={() => {
              setSearch("");
              setTypeFilter("all");
              setMaterial("");
              setPriceGroup("");
              setPage(1);
            }}
          >
            Reset
          </button>
        </div>

        {error ? <div className="li-error">{error}</div> : null}
        {loading ? <div className="li-muted">Loading inventory…</div> : null}

        <div className="li-grid" role="list">
          {slabs.map((s) => {
            const area = fmtArea(s.width_actual_in, s.length_actual_in);
            const img = s.thumbnail_url || s.image_url;
            return (
              <button
                key={s.id}
                type="button"
                className="li-card"
                role="listitem"
                onClick={() => {
                  setSelected(s);
                  setToolNote(null);
                }}
              >
                <div className="li-card-media">
                  {img ? <img src={img} alt="" loading="lazy" /> : <div className="li-card-placeholder" />}
                </div>
                <div className="li-card-body">
                  <h2>{s.color_name || "Unnamed"}</h2>
                  <p>{s.material_name || "—"}</p>
                  <div className="li-card-meta">
                    <span>{s.source_inventory_type || "Piece"}</span>
                    <span>{s.price_group || s.source_price_group || "—"}</span>
                    {area ? <span>{area}</span> : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {!loading && slabs.length === 0 ? (
          <p className="li-empty">No pieces match these filters.</p>
        ) : null}

        {pageCount > 1 ? (
          <div className="li-pager">
            <button type="button" className="li-btn ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {page} of {pageCount} · {total} pieces
            </span>
            <button
              type="button"
              className="li-btn ghost"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        ) : null}
      </main>

      {selected ? (
        <div className="li-modal-backdrop" role="presentation" onClick={() => setSelected(null)}>
          <div
            className="li-modal"
            role="dialog"
            aria-modal="true"
            aria-label={selected.color_name || "Slab detail"}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="li-modal-close" onClick={() => setSelected(null)} aria-label="Close">
              ×
            </button>
            <div className="li-modal-media">
              {selected.image_url || selected.thumbnail_url ? (
                <img src={selected.image_url || selected.thumbnail_url || ""} alt="" />
              ) : (
                <div className="li-card-placeholder tall" />
              )}
            </div>
            <div className="li-modal-body">
              <p className="li-eyebrow">{selected.material_name || "Material"}</p>
              <h2>{selected.color_name || "Unnamed"}</h2>
              <dl className="li-specs">
                <div>
                  <dt>Item #</dt>
                  <dd>{selected.inventory_id || "—"}</dd>
                </div>
                <div>
                  <dt>Type</dt>
                  <dd>{selected.source_inventory_type || "—"}</dd>
                </div>
                <div>
                  <dt>Thickness</dt>
                  <dd>{selected.thickness_nominal || "—"}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>
                    {fmtIn(selected.length_actual_in)} × {fmtIn(selected.width_actual_in)}
                    {fmtArea(selected.width_actual_in, selected.length_actual_in)
                      ? ` · ${fmtArea(selected.width_actual_in, selected.length_actual_in)}`
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt>Lot</dt>
                  <dd>{selected.lot || "—"}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{selected.rack || "—"}</dd>
                </div>
                <div>
                  <dt>Price group</dt>
                  <dd>{selected.price_group || selected.source_price_group || "—"}</dd>
                </div>
              </dl>

              <div className="li-tools" aria-label="Slab tools">
                {TOOLS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`li-tool${t.id === "inquire" ? " primary" : ""}`}
                    onClick={() => runTool(t.id, selected)}
                  >
                    {t.label}
                    {!t.ready ? <span className="soon">Soon</span> : null}
                  </button>
                ))}
              </div>
              {toolNote ? <p className="li-tool-note">{toolNote}</p> : null}
              <p className="li-foot">Read-only · source price group is imported, not eliteOS pricing authority.</p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
