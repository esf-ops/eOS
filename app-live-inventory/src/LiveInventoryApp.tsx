import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";
import MeasureView, { type PieceGeometry } from "./components/MeasureView";
import { apiGet, ApiError } from "./lib/api";
import { browseImageUrl, enrichColorProgramImages } from "./lib/enrichColorImages";
import { parseJobSize, pieceFitsJob, type JobSize } from "./lib/fit";
import { getSupabase } from "./lib/supabase";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";
const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";
const HOME_URL = String(import.meta.env.VITE_HOME_URL || "https://www.eliteosfab.com").replace(/\/+$/, "");
/** Stock + photo authority — Slabsmith cache. SlabCloud only fills colors with no Slabsmith photo. */
const INVENTORY_SOURCE = "slabsmith";
const IMAGE_ENRICH_SOURCE = "slabcloud";

type ColorProgram = {
  color_key: string;
  color_name: string | null;
  material_name: string | null;
  source_price_group: string | null;
  total_inventory_count: number;
  slab_count: number;
  remnant_count: number;
  representative_image_url: string | null;
  representative_thumbnail_url: string | null;
  largest_piece_long_in?: number | null;
  largest_piece_short_in?: number | null;
};

type FitPiece = Piece & {
  color_key: string;
  area_sqft: number | null;
  waste_sqft: number | null;
  waste_pct: number | null;
  fit_basis: "photo_geometry" | "bounding_box";
};

type FitResponse = {
  total_matches?: number;
  pieces?: FitPiece[];
  fit?: { job_sqft?: number };
};

type Piece = {
  id: string | null;
  inventory_id: string | null;
  external_slab_id?: string | null;
  color_name: string | null;
  material_name: string | null;
  source_inventory_type: string | null;
  source_price_group: string | null;
  thickness_nominal: string | null;
  rack: string | null;
  lot: string | null;
  width_actual_in: number | null;
  length_actual_in: number | null;
  image_url: string | null;
  thumbnail_url: string | null;
  image_status?: string | null;
  geometry?: PieceGeometry | null;
};

type Filters = {
  materials?: string[];
  price_groups?: string[];
};

type Summary = {
  total_active_slabs?: number;
  distinct_colors?: number;
  last_sync?: { finished_at?: string | null; triggered_by?: string | null } | null;
};

type ToolId = "measure" | "paint" | "inquire" | "wishlist" | "email" | "download" | "quote" | "visualizer";

const TOOLS: { id: ToolId; label: string; ready: boolean }[] = [
  { id: "measure", label: "Measure", ready: true },
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
  return `${Math.round((w * l) / 144)} ft²`;
}

function fmtSize(long: number | null | undefined, short: number | null | undefined) {
  if (long == null || short == null) return null;
  return `${Math.round(long)}″ × ${Math.round(short)}″`;
}

/** Area from the photo outline when measured, else L×W. */
function pieceAreaLabel(piece: Piece) {
  const a = piece.geometry?.area_sqft;
  if (a != null && Number.isFinite(a)) return `${Math.round(a * 10) / 10} ft²`;
  return fmtArea(piece.width_actual_in, piece.length_actual_in);
}

/** Largest usable rectangle, shown only when the piece is not a plain rectangle. */
function usableLabel(piece: Piece) {
  const g = piece.geometry;
  if (!g || g.is_rectangular || !g.usable_long_in || !g.usable_short_in) return null;
  return fmtSize(g.usable_long_in, g.usable_short_in);
}

function syncAgeLabel(iso: string | null | undefined) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "Slab" | "Remnant">("all");
  const [material, setMaterial] = useState("");
  const [priceGroup, setPriceGroup] = useState("");
  const [jobLength, setJobLength] = useState("");
  const [jobWidth, setJobWidth] = useState("");
  const [job, setJob] = useState<JobSize | null>(null);
  const [view, setView] = useState<"colors" | "fit">("colors");
  const [fitCounts, setFitCounts] = useState<Map<string, number> | null>(null);
  const [fitResult, setFitResult] = useState<FitResponse | null>(null);
  const [fitLoading, setFitLoading] = useState(false);
  const preferPieceIdRef = useRef<string | null>(null);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [programs, setPrograms] = useState<ColorProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedColor, setSelectedColor] = useState<ColorProgram | null>(null);
  const [colorTab, setColorTab] = useState<"slab" | "remnant">("slab");
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [piecesLoading, setPiecesLoading] = useState(false);
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [measurePiece, setMeasurePiece] = useState<Piece | null>(null);
  const [toolNote, setToolNote] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 220);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = parseJobSize(jobLength, jobWidth);
      setJob((prev) =>
        prev?.lengthIn === next?.lengthIn && prev?.widthIn === next?.widthIn ? prev : next
      );
    }, 300);
    return () => window.clearTimeout(t);
  }, [jobLength, jobWidth]);

  const fitType = typeFilter === "Slab" ? "slab" : typeFilter === "Remnant" ? "remnant" : "all";

  // Shape-aware fit: which colors have a piece that fits the job (grid) + ranked best-fit pieces.
  useEffect(() => {
    if (!token || !job) {
      setFitCounts(null);
      setFitResult(null);
      if (!job) setView("colors");
      return;
    }
    let cancelled = false;
    setFitLoading(true);
    const qs = (extra: Record<string, string>) =>
      new URLSearchParams({ source: INVENTORY_SOURCE, ...extra }).toString();
    Promise.all([
      apiGet(
        `/api/slab-inventory/color-programs?${qs({
          fit_length_in: String(job.lengthIn),
          fit_width_in: String(job.widthIn),
          fit_type: fitType,
        })}`,
        token
      ) as Promise<{ color_programs?: (ColorProgram & { fit_count?: number })[] }>,
      apiGet(
        `/api/slab-inventory/fit?${qs({
          length_in: String(job.lengthIn),
          width_in: String(job.widthIn),
          type: fitType,
          limit: "200",
        })}`,
        token
      ) as Promise<FitResponse>,
    ])
      .then(([colors, fit]) => {
        if (cancelled) return;
        setFitCounts(new Map((colors.color_programs || []).map((c) => [c.color_key, c.fit_count ?? 0])));
        setFitResult(fit);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setFitLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, job, fitType]);

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

  // Each request renders as soon as it lands — the grid never waits on summary/filters.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const fail = (e: unknown) => {
      if (!cancelled) setError(e instanceof ApiError ? e.message : String(e));
    };
    setLoading(true);
    const primaryReq = (
      apiGet(`/api/slab-inventory/color-programs?source=${INVENTORY_SOURCE}`, token) as Promise<{
        color_programs?: ColorProgram[];
      }>
    ).then((prog) => (Array.isArray(prog.color_programs) ? prog.color_programs : []));
    primaryReq
      .then((primary) => {
        if (!cancelled) setPrograms(primary);
      })
      .catch(fail)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    Promise.all([
      primaryReq,
      (apiGet(`/api/slab-inventory/color-programs?source=${IMAGE_ENRICH_SOURCE}`, token) as Promise<{
        color_programs?: ColorProgram[];
      }>).catch(() => ({ color_programs: [] as ColorProgram[] })),
    ])
      .then(([primary, photoProg]) => {
        const photos = Array.isArray(photoProg.color_programs) ? photoProg.color_programs : [];
        if (!cancelled && photos.length) setPrograms(enrichColorProgramImages(primary, photos));
      })
      .catch(() => undefined);
    (apiGet(`/api/slab-inventory/filters?source=${INVENTORY_SOURCE}`, token) as Promise<{ filters?: Filters }>)
      .then((fil) => {
        if (!cancelled) setFilters(fil.filters || null);
      })
      .catch(fail);
    (apiGet(`/api/slab-inventory/summary?source=${INVENTORY_SOURCE}`, token) as Promise<Summary>)
      .then((sum) => {
        if (!cancelled) setSummary(sum);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token]);

  const visiblePrograms = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    const filtered = programs.filter((p) => {
      if (typeFilter === "Slab" && !(p.slab_count > 0)) return false;
      if (typeFilter === "Remnant" && !(p.remnant_count > 0)) return false;
      if (material && p.material_name !== material) return false;
      if (priceGroup && p.source_price_group !== priceGroup) return false;
      if (fitCounts && !fitCounts.get(p.color_key)) return false;
      if (q) {
        const hay = `${p.color_name || ""} ${p.material_name || ""} ${p.source_price_group || ""} ${p.color_key}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return filtered.sort((a, b) => {
      const an = String(a.color_name || "").trim();
      const bn = String(b.color_name || "").trim();
      if (!an && bn) return 1;
      if (an && !bn) return -1;
      return an.localeCompare(bn, undefined, { sensitivity: "base" });
    });
  }, [programs, debouncedSearch, typeFilter, material, priceGroup, fitCounts]);

  const visibleFitPieces = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return (fitResult?.pieces || []).filter((p) => {
      if (material && p.material_name !== material) return false;
      if (priceGroup && p.source_price_group !== priceGroup) return false;
      if (q) {
        const hay = `${p.color_name || ""} ${p.material_name || ""} ${p.inventory_id || ""} ${p.rack || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [fitResult, debouncedSearch, material, priceGroup]);

  const loadColorPieces = useCallback(
    async (colorKey: string, tab: "slab" | "remnant") => {
      if (!token) return;
      setPiecesLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          source: INVENTORY_SOURCE,
          type: tab,
          active_only: "true",
        });
        const body = (await apiGet(
          `/api/slab-inventory/colors/${encodeURIComponent(colorKey)}/inventory?${params}`,
          token
        )) as { rows?: Piece[] };
        let rows = body.rows || [];
        if (job) rows = rows.filter((r) => pieceFitsJob(r, job));
        setPieces(rows);
        const preferId = preferPieceIdRef.current;
        preferPieceIdRef.current = null;
        setSelectedPiece((preferId && rows.find((r) => r.id === preferId)) || rows[0] || null);
      } catch (e) {
        setPieces([]);
        setSelectedPiece(null);
        setError(e instanceof ApiError ? e.message : String(e));
      } finally {
        setPiecesLoading(false);
      }
    },
    [token, job]
  );

  const [preferTab, setPreferTab] = useState<"slab" | "remnant" | null>(null);

  useEffect(() => {
    if (!selectedColor) return;
    const preferRemnant =
      preferTab === "remnant" ||
      (preferTab == null &&
        (typeFilter === "Remnant" || (selectedColor.remnant_count > 0 && selectedColor.slab_count === 0)));
    const tab = preferRemnant ? "remnant" : "slab";
    setColorTab(tab);
    void loadColorPieces(selectedColor.color_key, tab);
  }, [selectedColor, preferTab, typeFilter, loadColorPieces]);

  const menuItems: EliteosTopbarMenuItem[] = useMemo(
    () => [{ id: "home", label: "Open Home", onSelect: () => { window.location.href = HOME_URL; } }],
    []
  );

  async function signOut() {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    window.location.href = HOME_URL;
  }

  function resetFilters() {
    setSearch("");
    setTypeFilter("all");
    setMaterial("");
    setPriceGroup("");
    setJobLength("");
    setJobWidth("");
    setView("colors");
  }

  function openColor(p: ColorProgram) {
    setPreferTab(null);
    setSelectedColor(p);
    setToolNote(null);
    setMeasurePiece(null);
  }

  function openFitPiece(piece: FitPiece) {
    const program =
      programs.find((p) => p.color_key === piece.color_key) ||
      ({
        color_key: piece.color_key,
        color_name: piece.color_name,
        material_name: piece.material_name,
        source_price_group: piece.source_price_group,
        total_inventory_count: 0,
        slab_count: 0,
        remnant_count: 0,
        representative_image_url: piece.image_url,
        representative_thumbnail_url: piece.thumbnail_url,
      } as ColorProgram);
    preferPieceIdRef.current = piece.id;
    setPreferTab(piece.source_inventory_type === "Remnant" ? "remnant" : "slab");
    setSelectedColor(program);
    setToolNote(null);
    setMeasurePiece(null);
  }

  function closeColor() {
    setSelectedColor(null);
    setPieces([]);
    setSelectedPiece(null);
    setMeasurePiece(null);
    setToolNote(null);
  }

  function runTool(tool: ToolId, piece: Piece) {
    if (tool === "measure") {
      const url = piece.image_url || piece.thumbnail_url;
      if (!url) {
        setToolNote("No photo available to measure yet.");
        return;
      }
      setMeasurePiece(piece);
      setToolNote(null);
      return;
    }
    if (tool === "download") {
      const url = piece.image_url || piece.thumbnail_url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        setToolNote(null);
        return;
      }
      setToolNote("No verified image for this piece yet.");
      return;
    }
    setToolNote(`${TOOLS.find((t) => t.id === tool)?.label ?? tool} is next — scaffold only.`);
  }

  if (!authReady) {
    return <div className="li-boot">Loading…</div>;
  }

  if (!token) {
    return (
      <div className="shell">
        <div className="li-gate">
          <p className="li-brand">eliteOS</p>
          <h1>Live Inventory</h1>
          <p>Sign in from eliteOS Home. Authorization is enforced on every API call.</p>
          <a className="li-btn" href={HOME_URL}>
            Open Home
          </a>
        </div>
      </div>
    );
  }

  const syncLabel = syncAgeLabel(summary?.last_sync?.finished_at);
  const activePiece = selectedPiece;

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

      <div className="li-filterbar" role="search">
        <input
          type="search"
          placeholder="Search by name or ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search by name or ID"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "all" | "Slab" | "Remnant")}
          aria-label="Type"
        >
          <option value="all">Any type</option>
          <option value="Slab">Slabs</option>
          <option value="Remnant">Remnants</option>
        </select>
        <select value={material} onChange={(e) => setMaterial(e.target.value)} aria-label="Material">
          <option value="">Any material</option>
          {(filters?.materials || []).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select value={priceGroup} onChange={(e) => setPriceGroup(e.target.value)} aria-label="Price group">
          <option value="">Any price group</option>
          {(filters?.price_groups || []).map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <div className="li-jobsize" role="group" aria-label="Fits a job piece">
          <span className="li-jobsize-label">Fits</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            placeholder="Length″"
            value={jobLength}
            onChange={(e) => setJobLength(e.target.value)}
            aria-label="Job piece length in inches"
          />
          <span aria-hidden>×</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            placeholder="Width″"
            value={jobWidth}
            onChange={(e) => setJobWidth(e.target.value)}
            aria-label="Job piece width in inches"
          />
        </div>
        <button type="button" className="li-reset" onClick={resetFilters}>
          Reset
        </button>
      </div>

      <main className="main">
        <div className="li-statusline">
          {job ? (
            <div className="li-viewswitch" role="tablist" aria-label="Results view">
              <button
                type="button"
                role="tab"
                aria-selected={view === "colors"}
                className={view === "colors" ? "active" : ""}
                onClick={() => setView("colors")}
              >
                Colors <span>{visiblePrograms.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "fit"}
                className={view === "fit" ? "active" : ""}
                onClick={() => setView("fit")}
              >
                Best fit <span>{visibleFitPieces.length}</span>
              </button>
            </div>
          ) : (
            <span>
              <strong>{visiblePrograms.length}</strong> colors
              {summary?.total_active_slabs != null ? ` · ${summary.total_active_slabs} pieces` : ""}
            </span>
          )}
          {job ? (
            <span className="li-sync">
              {fitLoading
                ? "Matching…"
                : `Pieces that fit ${Math.round(job.lengthIn)}″ × ${Math.round(job.widthIn)}″ — measured from each piece's real shape`}
            </span>
          ) : syncLabel ? (
            <span className="li-sync">{syncLabel}</span>
          ) : null}
        </div>

        {error ? <div className="li-error">{error}</div> : null}
        {loading && !programs.length ? <div className="li-muted">Loading inventory…</div> : null}

        {job && view === "fit" ? (
          <>
            <div className="li-grid" role="list">
              {visibleFitPieces.map((p, idx) => {
                const img = p.thumbnail_url || p.image_url;
                const usable = usableLabel(p);
                return (
                  <button
                    key={p.id || p.external_slab_id || `fit-${idx}`}
                    type="button"
                    className="li-card"
                    role="listitem"
                    onClick={() => openFitPiece(p)}
                  >
                    <div className="li-card-media">
                      {img ? <img src={img} alt="" loading="lazy" /> : <div className="li-card-placeholder" aria-hidden />}
                      {idx === 0 ? <span className="li-fit-rank">Best fit</span> : null}
                    </div>
                    <div className="li-card-head">
                      <h2>{p.color_name || "Unnamed"}</h2>
                      <p>
                        {p.material_name || "—"} · {p.source_inventory_type === "Remnant" ? "Remnant" : "Slab"}
                      </p>
                      <p className="li-card-dims">
                        {fmtIn(p.length_actual_in)} × {fmtIn(p.width_actual_in)}
                        {usable ? ` · usable ${usable}` : ""}
                      </p>
                      <span className={`li-stock${p.waste_pct != null && p.waste_pct > 50 ? " warn" : ""}`}>
                        {p.waste_pct != null ? `${Math.round(p.waste_pct)}% leftover` : "Fits"}
                        {p.waste_sqft != null ? ` · ${p.waste_sqft} ft²` : ""}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            {!fitLoading && visibleFitPieces.length === 0 ? (
              <p className="li-empty">No pieces in stock fit this size. Try a smaller piece or include slabs.</p>
            ) : null}
          </>
        ) : null}

        <div className="li-grid" role="list" hidden={Boolean(job && view === "fit")}>
          {visiblePrograms.map((p) => {
            const img = browseImageUrl(p);
            const stock =
              typeFilter === "Remnant"
                ? p.remnant_count
                : typeFilter === "Slab"
                  ? p.slab_count
                  : p.total_inventory_count;
            return (
              <button
                key={p.color_key}
                type="button"
                className="li-card"
                role="listitem"
                onClick={() => openColor(p)}
              >
                <div className="li-card-media">
                  {img ? (
                    <img
                      src={img}
                      alt=""
                      loading="lazy"
                      onError={(e) => {
                        const el = e.currentTarget;
                        const full = p.representative_image_url;
                        const thumb = p.representative_thumbnail_url;
                        if (thumb && !el.src.includes(thumb) && el.src !== thumb) {
                          el.src = thumb;
                          return;
                        }
                        if (full && el.src !== full) {
                          el.src = full;
                          return;
                        }
                        el.style.display = "none";
                        el.parentElement?.classList.add("li-card-media--empty");
                      }}
                    />
                  ) : (
                    <div className="li-card-placeholder" aria-hidden />
                  )}
                </div>
                <div className="li-card-head">
                  <h2>{p.color_name || "Unnamed"}</h2>
                  <p>{p.material_name || "—"}</p>
                  {fmtSize(p.largest_piece_long_in, p.largest_piece_short_in) ? (
                    <p className="li-card-dims">Up to {fmtSize(p.largest_piece_long_in, p.largest_piece_short_in)}</p>
                  ) : null}
                  <span className="li-stock">
                    {fitCounts ? `${fitCounts.get(p.color_key) ?? 0} fit` : `In Stock — ${stock}`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {!loading && view === "colors" && visiblePrograms.length === 0 ? (
          <p className="li-empty">No colors match these filters.</p>
        ) : null}
      </main>

      {selectedColor ? (
        <div className="li-lightbox-backdrop" role="presentation" onClick={closeColor}>
          <div
            className="li-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={selectedColor.color_name || "Color detail"}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="li-lightbox-close" onClick={closeColor} aria-label="Close">
              ×
            </button>

            <div className="li-lightbox-hero">
              {activePiece?.image_url || activePiece?.thumbnail_url || selectedColor.representative_image_url ? (
                <img
                  src={
                    activePiece?.image_url ||
                    activePiece?.thumbnail_url ||
                    selectedColor.representative_image_url ||
                    ""
                  }
                  alt=""
                />
              ) : (
                <div className="li-card-placeholder tall" />
              )}
            </div>

            <div className="li-lightbox-body">
              <p className="li-kicker">{selectedColor.material_name || "Material"}</p>
              <h2>{selectedColor.color_name || "Unnamed"}</h2>

              {activePiece ? (
                <dl className="li-specs">
                  <div>
                    <dt>Finish</dt>
                    <dd>—</dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>
                      {fmtIn(activePiece.length_actual_in)} × {fmtIn(activePiece.width_actual_in)}
                      {pieceAreaLabel(activePiece) ? ` · ${pieceAreaLabel(activePiece)}` : ""}
                    </dd>
                  </div>
                  {usableLabel(activePiece) ? (
                    <div>
                      <dt>Largest usable</dt>
                      <dd>{usableLabel(activePiece)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Thickness</dt>
                    <dd>{activePiece.thickness_nominal || "—"}</dd>
                  </div>
                  <div>
                    <dt>Lot</dt>
                    <dd>{activePiece.lot || "—"}</dd>
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd>{activePiece.rack || "—"}</dd>
                  </div>
                  <div>
                    <dt>Price group</dt>
                    <dd>{activePiece.source_price_group || selectedColor.source_price_group || "—"}</dd>
                  </div>
                  <div>
                    <dt>Item #</dt>
                    <dd>{activePiece.inventory_id || "—"}</dd>
                  </div>
                </dl>
              ) : null}

              <div className="li-tools" aria-label="Slab tools">
                {TOOLS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`li-tool${t.id === "measure" ? " primary" : ""}`}
                    disabled={!activePiece}
                    onClick={() => activePiece && runTool(t.id, activePiece)}
                  >
                    {t.label}
                    {!t.ready ? <span className="soon">Soon</span> : null}
                  </button>
                ))}
              </div>
              {toolNote ? <p className="li-tool-note">{toolNote}</p> : null}

              <div className="li-tabs" role="tablist" aria-label="Available inventory">
                <button
                  type="button"
                  role="tab"
                  aria-selected={colorTab === "slab"}
                  className={colorTab === "slab" ? "active" : ""}
                  onClick={() => {
                    setColorTab("slab");
                    void loadColorPieces(selectedColor.color_key, "slab");
                  }}
                >
                  Available slabs ({selectedColor.slab_count})
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={colorTab === "remnant"}
                  className={colorTab === "remnant" ? "active" : ""}
                  onClick={() => {
                    setColorTab("remnant");
                    void loadColorPieces(selectedColor.color_key, "remnant");
                  }}
                >
                  Remnants ({selectedColor.remnant_count})
                </button>
              </div>

              {job ? (
                <p className="li-muted">
                  Showing pieces that fit {Math.round(job.lengthIn)}″ × {Math.round(job.widthIn)}″.
                </p>
              ) : null}
              {piecesLoading ? <p className="li-muted">Loading pieces…</p> : null}

              <div className="li-piece-rail" role="list">
                {pieces.map((piece, idx) => {
                  const thumb = piece.thumbnail_url || piece.image_url;
                  const selected = activePiece?.id === piece.id;
                  return (
                    <button
                      key={piece.id || piece.inventory_id || piece.external_slab_id || `piece-${idx}`}
                      type="button"
                      role="listitem"
                      className={`li-piece${selected ? " selected" : ""}`}
                      onClick={() => {
                        setSelectedPiece(piece);
                        setToolNote(null);
                      }}
                    >
                      <div className="li-piece-thumb">
                        {thumb ? <img src={thumb} alt="" loading="lazy" /> : <div className="li-card-placeholder" />}
                      </div>
                      <div className="li-piece-meta">
                        <strong>
                          {fmtIn(piece.length_actual_in)} × {fmtIn(piece.width_actual_in)}
                        </strong>
                        <span>
                          {pieceAreaLabel(piece) || "—"}
                          {usableLabel(piece) ? ` · usable ${usableLabel(piece)}` : ""}
                        </span>
                        <span>{piece.inventory_id || piece.lot || "Piece"}</span>
                        <span>{piece.rack || "—"}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {!piecesLoading && pieces.length === 0 ? (
                <p className="li-empty">
                  No {colorTab === "slab" ? "slabs" : "remnants"} in this color{job ? " fit this size" : ""}.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {measurePiece && (measurePiece.image_url || measurePiece.thumbnail_url) ? (
        <MeasureView
          imageUrl={measurePiece.image_url || measurePiece.thumbnail_url || ""}
          lengthIn={measurePiece.length_actual_in}
          widthIn={measurePiece.width_actual_in}
          geometry={measurePiece.geometry}
          title={measurePiece.color_name || undefined}
          onClose={() => setMeasurePiece(null)}
        />
      ) : null}
    </div>
  );
}
