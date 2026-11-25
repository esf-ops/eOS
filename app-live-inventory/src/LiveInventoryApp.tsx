import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";
import MeasureView, { type PieceGeometry } from "./components/MeasureView";
import { IconArrow, IconDownload, IconRuler, IconSearch, TileMedia, TileSkeleton } from "./components/Tiles";
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
  swatch_url?: string | null;
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
  thickness_options?: { mm: number; label: string; count: number }[];
};

type Summary = {
  total_active_slabs?: number;
  distinct_colors?: number;
  last_sync?: { finished_at?: string | null; triggered_by?: string | null } | null;
};

type ToolId = "measure" | "download";

const COMING_TOOLS = ["Paint match", "Inquire", "Wishlist", "Email", "Get a quote", "3D / AR"];

const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];

function letterOf(name: string | null | undefined) {
  const ch = String(name || "").trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

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

function ColorTile({
  program: p,
  typeFilter,
  fitCount,
  onOpen,
}: {
  program: ColorProgram;
  typeFilter: "all" | "Slab" | "Remnant";
  fitCount: number | null;
  onOpen: () => void;
}) {
  const size = fmtSize(p.largest_piece_long_in, p.largest_piece_short_in);
  const showSlabs = typeFilter !== "Remnant" && p.slab_count > 0;
  const showRemnants = typeFilter !== "Slab" && p.remnant_count > 0;
  return (
    <button type="button" className="li-tile" role="listitem" onClick={onOpen}>
      <TileMedia
        sources={[
          { url: p.swatch_url, kind: "swatch" },
          { url: browseImageUrl(p), kind: "cutout" },
          { url: p.representative_image_url, kind: "cutout" },
        ]}
      >
        <div className="li-chips">
          {fitCount != null ? <span className="li-chip accent">{plural(fitCount, "piece")} fit</span> : null}
          {fitCount == null && showSlabs ? <span className="li-chip">{plural(p.slab_count, "slab")}</span> : null}
          {fitCount == null && showRemnants ? <span className="li-chip">{plural(p.remnant_count, "remnant")}</span> : null}
        </div>
        <span className="li-tile-cta">
          View pieces <IconArrow />
        </span>
      </TileMedia>
      <div className="li-tile-body">
        <h3 className="li-tile-name">{p.color_name || "Unnamed"}</h3>
        <div className="li-tile-meta">
          <p>{p.material_name || "—"}</p>
          {size ? <span className="li-tile-size">up to {size}</span> : null}
        </div>
      </div>
    </button>
  );
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
  const [thicknessMm, setThicknessMm] = useState<number | null>(null);
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
  const [stockTotals, setStockTotals] = useState<{ colors: number; pieces: number } | null>(null);
  /** Color list per thickness (0 = any) so switching back is instant; always revalidated. */
  const programsCacheRef = useRef(new Map<number, ColorProgram[]>());
  const [refreshing, setRefreshing] = useState(false);
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
      new URLSearchParams({
        source: INVENTORY_SOURCE,
        ...(thicknessMm ? { thickness_mm: String(thicknessMm) } : {}),
        ...extra,
      }).toString();
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
  }, [token, job, fitType, thicknessMm]);

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
    const cached = programsCacheRef.current.get(thicknessMm ?? 0);
    if (cached) setPrograms(cached);
    setRefreshing(!cached);
    const thicknessQs = thicknessMm ? `&thickness_mm=${thicknessMm}` : "";
    const primaryReq = (
      apiGet(`/api/slab-inventory/color-programs?source=${INVENTORY_SOURCE}${thicknessQs}`, token) as Promise<{
        color_programs?: ColorProgram[];
      }>
    ).then((prog) => (Array.isArray(prog.color_programs) ? prog.color_programs : []));
    primaryReq
      .then((primary) => {
        if (cancelled) return;
        setPrograms(primary);
        setRefreshing(false);
        if (!thicknessMm) {
          setStockTotals({
            colors: primary.length,
            pieces: primary.reduce((n, p) => n + (p.total_inventory_count || 0), 0),
          });
        }
      })
      .catch(fail)
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });
    Promise.all([
      primaryReq,
      (apiGet(`/api/slab-inventory/color-programs?source=${IMAGE_ENRICH_SOURCE}`, token) as Promise<{
        color_programs?: ColorProgram[];
      }>).catch(() => ({ color_programs: [] as ColorProgram[] })),
    ])
      .then(([primary, photoProg]) => {
        const photos = Array.isArray(photoProg.color_programs) ? photoProg.color_programs : [];
        if (cancelled) return;
        const merged = photos.length ? enrichColorProgramImages(primary, photos) : primary;
        programsCacheRef.current.set(thicknessMm ?? 0, merged);
        if (photos.length) setPrograms(merged);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, thicknessMm]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (apiGet(`/api/slab-inventory/filters?source=${INVENTORY_SOURCE}`, token) as Promise<{ filters?: Filters }>)
      .then((fil) => {
        if (!cancelled) setFilters(fil.filters || null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : String(e));
      });
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

  const letterGroups = useMemo(() => {
    const groups = new Map<string, ColorProgram[]>();
    for (const p of visiblePrograms) {
      const l = letterOf(p.color_name);
      const list = groups.get(l);
      if (list) list.push(p);
      else groups.set(l, [p]);
    }
    return LETTERS.filter((l) => groups.has(l)).map((letter) => ({ letter, items: groups.get(letter)! }));
  }, [visiblePrograms]);

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
        if (thicknessMm) params.set("thickness_mm", String(thicknessMm));
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
    [token, job, thicknessMm]
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
    setThicknessMm(null);
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
    }
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
  const filtersActive = Boolean(
    search || typeFilter !== "all" || material || priceGroup || thicknessMm || jobLength || jobWidth
  );
  const thicknessChoices = (filters?.thickness_options || []).filter((o) => o.count > 0);
  const showFit = Boolean(job && view === "fit");

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

      <header className="li-hero">
        <div className="li-hero-copy">
          <h1>Stone in stock</h1>
          <p>
            {stockTotals ? (
              <>
                <strong>{stockTotals.colors.toLocaleString()}</strong> colors ·{" "}
                <strong>{stockTotals.pieces.toLocaleString()}</strong> pieces on the rack, measured from every photo
              </>
            ) : (
              "Loading what's on the rack…"
            )}
          </p>
        </div>
        <div className="li-live" title={summary?.last_sync?.finished_at || undefined}>
          <span className="li-live-dot" aria-hidden />
          Live{syncLabel ? ` · ${syncLabel.replace(/^Synced /, "synced ")}` : ""}
        </div>
      </header>

      <div className="li-filterbar" role="search">
        <label className="li-search">
          <IconSearch />
          <input
            type="search"
            placeholder="Search colors, brands, item #"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search colors, brands, or item number"
          />
        </label>
        <div className="li-seg" role="radiogroup" aria-label="Piece type">
          {(
            [
              ["all", "All"],
              ["Slab", "Slabs"],
              ["Remnant", "Remnants"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={typeFilter === value}
              className={typeFilter === value ? "active" : ""}
              onClick={() => setTypeFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <select value={material} onChange={(e) => setMaterial(e.target.value)} aria-label="Material">
          <option value="">Any material</option>
          {(filters?.materials || []).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {thicknessChoices.length > 1 ? (
          <div className="li-seg" role="radiogroup" aria-label="Thickness">
            <button
              type="button"
              role="radio"
              aria-checked={thicknessMm == null}
              className={thicknessMm == null ? "active" : ""}
              onClick={() => setThicknessMm(null)}
            >
              Any
            </button>
            {thicknessChoices.map((o) => (
              <button
                key={o.mm}
                type="button"
                role="radio"
                aria-checked={thicknessMm === o.mm}
                className={thicknessMm === o.mm ? "active" : ""}
                title={`${o.count} pieces`}
                onClick={() => setThicknessMm(o.mm)}
              >
                {o.label}
              </button>
            ))}
          </div>
        ) : null}
        <select value={priceGroup} onChange={(e) => setPriceGroup(e.target.value)} aria-label="Price group">
          <option value="">Any price group</option>
          {(filters?.price_groups || []).map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <div className={`li-jobsize${job ? " active" : ""}`} role="group" aria-label="Fits a job piece">
          <IconRuler />
          <span className="li-jobsize-label">Fits</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={1}
            placeholder="L″"
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
            placeholder="W″"
            value={jobWidth}
            onChange={(e) => setJobWidth(e.target.value)}
            aria-label="Job piece width in inches"
          />
        </div>
        {filtersActive ? (
          <button type="button" className="li-reset" onClick={resetFilters}>
            Clear
          </button>
        ) : null}
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
              {refreshing && programs.length ? (
                "Updating…"
              ) : filtersActive ? (
                <>
                  <strong>{visiblePrograms.length}</strong> of {stockTotals?.colors ?? programs.length} colors
                </>
              ) : (
                <>
                  <strong>{visiblePrograms.length}</strong> colors, A–Z
                </>
              )}
            </span>
          )}
          {job ? (
            <span className="li-sync">
              {fitLoading
                ? "Matching every piece's real shape…"
                : `Fits ${Math.round(job.lengthIn)}″ × ${Math.round(job.widthIn)}″ — checked against each piece's measured shape`}
            </span>
          ) : null}
        </div>

        {error ? <div className="li-error">{error}</div> : null}
        {loading && !programs.length ? <TileSkeleton count={18} /> : null}

        {showFit ? (
          <>
            <div className="li-grid li-grid--pieces" role="list">
              {visibleFitPieces.map((p, idx) => {
                const usable = usableLabel(p);
                const remnant = p.source_inventory_type === "Remnant";
                return (
                  <button
                    key={p.id || p.external_slab_id || `fit-${idx}`}
                    type="button"
                    className="li-tile"
                    role="listitem"
                    onClick={() => openFitPiece(p)}
                  >
                    <TileMedia
                      sources={[
                        { url: p.thumbnail_url, kind: "cutout" },
                        { url: p.image_url, kind: "cutout" },
                      ]}
                    >
                      <div className="li-chips">
                        {idx === 0 ? <span className="li-chip accent">Best fit</span> : null}
                        <span className="li-chip">{remnant ? "Remnant" : "Slab"}</span>
                      </div>
                      <span className={`li-waste${p.waste_pct != null && p.waste_pct > 50 ? " high" : ""}`}>
                        {p.waste_pct != null ? `${Math.round(p.waste_pct)}% leftover` : "Fits"}
                      </span>
                    </TileMedia>
                    <div className="li-tile-body">
                      <h3 className="li-tile-name">{p.color_name || "Unnamed"}</h3>
                      <div className="li-tile-meta">
                        <p>
                          {p.material_name || "—"}
                          {p.rack ? ` · ${p.rack}` : ""}
                        </p>
                        <span className="li-tile-size">
                          {usable ? `usable ${usable}` : `${fmtIn(p.length_actual_in)} × ${fmtIn(p.width_actual_in)}`}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            {!fitLoading && visibleFitPieces.length === 0 ? (
              <p className="li-empty">No pieces in stock fit this size. Try a smaller piece or include slabs.</p>
            ) : null}
            {fitResult?.total_matches != null && fitResult.total_matches > (fitResult.pieces?.length ?? 0) ? (
              <p className="li-muted li-more">
                Showing the {fitResult.pieces?.length} closest fits of {fitResult.total_matches}.
              </p>
            ) : null}
          </>
        ) : null}

        <div className={`li-catalog${refreshing && programs.length ? " is-refreshing" : ""}`} hidden={showFit}>
          <div className="li-sections">
            {letterGroups.map((group) => (
              <section key={group.letter} id={`li-letter-${group.letter}`} className="li-section" aria-label={group.letter}>
                <h2 className="li-letter">
                  {group.letter}
                  <span>{group.items.length}</span>
                </h2>
                <div className="li-grid" role="list">
                  {group.items.map((p) => (
                    <ColorTile
                      key={p.color_key}
                      program={p}
                      typeFilter={typeFilter}
                      fitCount={fitCounts ? fitCounts.get(p.color_key) ?? 0 : null}
                      onOpen={() => openColor(p)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
          {letterGroups.length > 1 ? (
            <nav className="li-az" aria-label="Jump to letter">
              {LETTERS.map((l) => {
                const has = letterGroups.some((g) => g.letter === l);
                return (
                  <button
                    key={l}
                    type="button"
                    disabled={!has}
                    onClick={() =>
                      document.getElementById(`li-letter-${l}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
                    }
                  >
                    {l}
                  </button>
                );
              })}
            </nav>
          ) : null}
        </div>

        {!loading && view === "colors" && visiblePrograms.length === 0 ? (
          <div className="li-empty-state">
            <h3>No colors match</h3>
            <p>{job ? "Nothing in stock fits that size with these filters." : "Try a different search or clear the filters."}</p>
            <button type="button" className="li-btn" onClick={resetFilters}>
              Clear filters
            </button>
          </div>
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
              <TileMedia
                key={activePiece?.id || selectedColor.color_key}
                className="li-media--hero"
                sources={
                  activePiece
                    ? [
                        { url: activePiece.image_url, kind: "cutout" },
                        { url: activePiece.thumbnail_url, kind: "cutout" },
                      ]
                    : [
                        { url: selectedColor.swatch_url, kind: "swatch" },
                        { url: selectedColor.representative_image_url, kind: "cutout" },
                      ]
                }
              />
              {activePiece ? (
                <p className="li-hero-caption">
                  {activePiece.source_inventory_type === "Remnant" ? "Remnant" : "Slab"}
                  {activePiece.inventory_id ? ` · #${activePiece.inventory_id}` : ""}
                  {activePiece.rack ? ` · ${activePiece.rack}` : ""}
                </p>
              ) : null}
            </div>

            <div className="li-lightbox-body">
              <p className="li-kicker">
                {selectedColor.material_name || "Material"}
                {selectedColor.source_price_group ? ` · Group ${selectedColor.source_price_group}` : ""}
              </p>
              <h2>{selectedColor.color_name || "Unnamed"}</h2>

              {activePiece ? (
                <>
                  <div className="li-headline">
                    <span className="li-headline-size">
                      {fmtIn(activePiece.length_actual_in)} × {fmtIn(activePiece.width_actual_in)}
                    </span>
                    {pieceAreaLabel(activePiece) ? <span className="li-pill">{pieceAreaLabel(activePiece)}</span> : null}
                    {usableLabel(activePiece) ? (
                      <span className="li-pill accent">usable {usableLabel(activePiece)}</span>
                    ) : null}
                  </div>
                  <dl className="li-specs">
                    <div>
                      <dt>Thickness</dt>
                      <dd>{activePiece.thickness_nominal || "—"}</dd>
                    </div>
                    <div>
                      <dt>Location</dt>
                      <dd>{activePiece.rack || "—"}</dd>
                    </div>
                    <div>
                      <dt>Lot</dt>
                      <dd>{activePiece.lot || "—"}</dd>
                    </div>
                    <div>
                      <dt>Item #</dt>
                      <dd>{activePiece.inventory_id || "—"}</dd>
                    </div>
                  </dl>
                </>
              ) : null}

              <div className="li-actions" aria-label="Piece tools">
                <button
                  type="button"
                  className="li-action primary"
                  disabled={!activePiece}
                  onClick={() => activePiece && runTool("measure", activePiece)}
                >
                  <IconRuler /> Measure
                </button>
                <button
                  type="button"
                  className="li-action"
                  disabled={!activePiece}
                  onClick={() => activePiece && runTool("download", activePiece)}
                >
                  <IconDownload /> Photo
                </button>
              </div>
              {toolNote ? <p className="li-tool-note">{toolNote}</p> : null}
              <p className="li-coming">Coming next: {COMING_TOOLS.join(" · ")}</p>

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
                  Slabs <span>{selectedColor.slab_count}</span>
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
                  Remnants <span>{selectedColor.remnant_count}</span>
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
                      <TileMedia
                        className="li-media--thumb"
                        sources={[
                          { url: piece.thumbnail_url, kind: "cutout" },
                          { url: piece.image_url, kind: "cutout" },
                        ]}
                      />
                      <div className="li-piece-meta">
                        <strong>
                          {fmtIn(piece.length_actual_in)} × {fmtIn(piece.width_actual_in)}
                        </strong>
                        <span>
                          {pieceAreaLabel(piece) || "—"}
                          {usableLabel(piece) ? ` · usable ${usableLabel(piece)}` : ""}
                        </span>
                        <span>
                          {piece.inventory_id ? `#${piece.inventory_id}` : piece.lot || "Piece"}
                          {piece.rack ? ` · ${piece.rack}` : ""}
                        </span>
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
