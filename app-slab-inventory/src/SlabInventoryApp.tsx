import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiGetJson, ApiError } from "@quote-lib/api";
import { config, EOS_LOGO_URL } from "@quote-lib/config";
import { getSupabase } from "./lib/supabase";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import { ZoomImageViewer, type ZoomGalleryItem } from "./ZoomImageViewer";
import { lookupElite100Texture } from "./lib/elite100TextureAssets";
import { MaterialPhotoVisualizer } from "./MaterialPhotoVisualizer";

/* ─────────────────────────────────────────── types */

type Slab = {
  id: string;
  external_slab_id: string | null;
  inventory_id: string | null;
  color_name: string | null;
  material_name: string | null;
  distributor: string | null;
  source_price_group: string | null;
  price_group: string | null;
  source_price_group_label?: string;
  thickness_nominal: string | null;
  rack: string | null;
  lot: string | null;
  width_actual_in: number | null;
  length_actual_in: number | null;
  is_active: boolean;
  last_seen_sync_run_id: string | null;
  updated_at: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  image_status: string;
  inventory_source?: string | null;
  image_url_pattern?: string | null;
  image_source_label?: string | null;
};

type LastSync = {
  id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  warning_count: number;
  slab_upserted_count: number | null;
  image_row_written_count: number | null;
  triggered_by: string | null;
} | null;

type NotSeenSampleRow = {
  id: string | null;
  color_name: string | null;
  material_name: string | null;
  inventory_id: string | null;
  rack: string | null;
  lot: string | null;
  source_price_group: string | null;
};

type Summary = {
  total_active_slabs: number;
  distinct_colors: number;
  distinct_materials: number;
  slabs_with_verified_images: number;
  slabs_by_price_group: { price_group: string; count: number }[];
  active_cached_slab_count?: number;
  latest_sync_slab_count?: number | null;
  latest_sync_id?: string | null;
  active_not_seen_in_latest_sync_count?: number;
  active_not_seen_in_latest_sync_sample?: NotSeenSampleRow[];
  last_sync: LastSync;
};

type Filters = {
  materials: string[];
  colors: string[];
  price_groups: string[];
  thicknesses: string[];
  racks: string[];
  distributors: string[];
  image_statuses: string[];
};

type SortKey = "color" | "material" | "inventory_id" | "rack" | "updated_at";

/* ── Elite 100 types ── */

type Elite100Item = {
  catalog_item_id: string;
  color_key: string;
  color_name: string | null;
  material_name: string | null;
  display_name: string | null;
  price_group: string;
  current_inventory_count?: number;
  total_inventory_count: number;
  slab_count: number;
  remnant_count: number;
  verified_photo_count: number;
  reference_image_url?: string | null;
  reference_image_url_full?: string | null;
  reference_image_url_1024?: string | null;
  reference_image_url_600?: string | null;
  reference_image_source?: string | null;
  current_inventory_image_url?: string | null;
  current_inventory_thumbnail_url?: string | null;
  representative_image_url: string | null;
  representative_thumbnail_url: string | null;
  representative_image_source_inventory_type: string | null;
  representative_image_inventory_id: string | null;
  visual_asset_url: string | null;
  visual_asset_url_600: string | null;
  visual_asset_url_1024: string | null;
  visual_asset_source: string | null;
  visual_asset_kind: string | null;
  visual_asset_review_status: string | null;
  has_inventory: boolean;
  program_status: "elite_100";
};

type Elite100Group = { price_group: string; items: Elite100Item[] };

type Elite100Data = {
  collection: {
    collection_key: string;
    display_name: string;
    collection_year: number | null;
    is_active: boolean;
  } | null;
  groups: Elite100Group[];
  price_group_order: string[];
} | null;

/* ── Non-Stock types ── */

type NonStockItem = {
  color_key: string;
  color_name: string | null;
  material_name: string | null;
  source_price_group: string | null;
  total_inventory_count: number;
  slab_count: number;
  remnant_count: number;
  verified_photo_count: number;
  representative_image_url: string | null;
  representative_thumbnail_url: string | null;
  program_status: "non_stock";
};

/* ── Color inventory modal types ── */

type PhysicalItem = {
  id: string;
  external_slab_id: string | null;
  inventory_id: string | null;
  color_name: string | null;
  material_name: string | null;
  source_inventory_type: string | null;
  source_inventory_scope: string | null;
  source_price_group: string | null;
  thickness_nominal: string | null;
  rack: string | null;
  lot: string | null;
  width_actual_in: number | null;
  length_actual_in: number | null;
  image_url: string | null;
  thumbnail_url: string | null;
  image_status: string;
  source_public_slug?: string | null;
  source_api_company_code?: string | null;
  source_asset_company_code?: string | null;
};

type ModalInventory = {
  slabs: PhysicalItem[];
  remnants: PhysicalItem[];
  total: number;
  slab_count: number;
  remnant_count: number;
} | null;

type ColorModal = {
  mode: "elite100" | "non_stock";
  catalogItemId?: string;
  colorKey?: string;
  colorName: string | null;
  materialName: string | null;
  priceGroup?: string | null;
  referenceImageUrl?: string | null;
  referenceImageUrlFull?: string | null;
  representativeImageUrl?: string | null;
} | null;

type ImageViewerState = {
  items: ZoomGalleryItem[];
  initialIndex: number;
} | null;

type MainTab = "elite100" | "non_stock" | "all_inventory" | "visualizer";

/* ─────────────────────────────────────────── constants */

const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";
const PAGE_SIZE = 60;
const SOURCE_PRICE_GROUP_HINT = "Imported price group from the active inventory feed — not slabOS pricing authority.";

/* ─────────────────────────────────────────── utils */

function homeLauncherUrl(): string {
  const raw = String(import.meta.env.VITE_HEAD_URL_HOME ?? "").trim();
  return raw.replace(/\/+$/, "") || "https://www.eliteosfab.com";
}

function deriveDisplayNameFromEmail(email: string): string {
  const e = String(email || "").trim();
  if (!e) return "";
  const local = e.includes("@") ? e.split("@")[0] : e;
  const words = local.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return e;
  return words.map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function userInitialsFor(name: string, email: string): string {
  const n = String(name || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }
  const e = String(email || "").trim();
  if (e) {
    const local = e.includes("@") ? e.split("@")[0] : e;
    const parts = local.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return local.slice(0, 2).toUpperCase();
  }
  return "ES";
}

function colorInitials(name: string | null): string {
  const n = String(name || "").trim();
  if (!n) return "—";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

function dimsLabel(w: number | null, l: number | null): string {
  if (w == null && l == null) return "—";
  const wl = w == null ? "?" : Math.round(Number(w));
  const ll = l == null ? "?" : Math.round(Number(l));
  return `${ll}″ × ${wl}″`;
}

function inventoryViewerSrc(item: PhysicalItem): string | null {
  return item.image_url || item.thumbnail_url || null;
}

function inventoryImageCaption(item: PhysicalItem, colorName: string | null): string {
  const name = colorName || item.color_name || "Slab";
  let caption = name;
  if (item.inventory_id) caption += ` — ID ${item.inventory_id}`;
  const extras: string[] = [];
  const dims = dimsLabel(item.width_actual_in, item.length_actual_in);
  if (dims !== "—") extras.push(dims);
  if (item.rack) extras.push(`Rack ${item.rack}`);
  if (item.lot) extras.push(`Lot ${item.lot}`);
  if (extras.length) caption += ` · ${extras.join(" · ")}`;
  return caption;
}

function buildInventoryGalleryItems(
  inventory: ModalInventory,
  colorName: string | null
): ZoomGalleryItem[] {
  if (!inventory) return [];
  const all = [...inventory.slabs, ...inventory.remnants];
  return all
    .map((item) => {
      const src = inventoryViewerSrc(item);
      if (!src || item.image_status === "missing") return null;
      return {
        src,
        caption: inventoryImageCaption(item, colorName),
        alt: colorName || item.color_name || "Inventory slab",
        itemId: item.id,
      };
    })
    .filter(Boolean) as ZoomGalleryItem[];
}

function referenceViewerSrc(modal: NonNullable<ColorModal>): string | null {
  return (
    modal.referenceImageUrlFull
    || modal.referenceImageUrl
    || modal.representativeImageUrl
    || null
  );
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Staff-safe label for inventory_source in technical details (no vendor names). */
function formatInventorySourceLabel(source: string | null | undefined): string | null {
  const s = String(source ?? "").trim().toLowerCase();
  if (s === "slabsmith") return "Local inventory";
  if (s === "slabcloud") return "Legacy sync";
  return s || null;
}

/* ─────────────────────────────────────────── icons */

const homeIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11.5L12 4l9 7.5" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" />
  </svg>
);
const profileIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.5-3.5 4.2-5 7-5s5.5 1.5 7 5" />
  </svg>
);
const searchIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="11" cy="11" r="7" /><path d="M21 21l-3.5-3.5" />
  </svg>
);

/* ─────────────────────────────────────────── main component */

export default function SlabInventoryApp() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userMetaName, setUserMetaName] = useState("");
  const [userProfile, setUserProfile] = useState<{ role: string; jobTitle: string; department: string }>({
    role: "", jobTitle: "", department: ""
  });

  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  /* Tab state */
  const [activeTab, setActiveTab] = useState<MainTab>("elite100");

  /* Elite 100 state */
  const [elite100Data, setElite100Data] = useState<Elite100Data>(null);
  const [elite100Busy, setElite100Busy] = useState(false);
  const [elite100Error, setElite100Error] = useState<string | null>(null);
  const [elite100Loaded, setElite100Loaded] = useState(false);

  /* Non-Stock state */
  const [nonStockItems, setNonStockItems] = useState<NonStockItem[]>([]);
  const [nonStockBusy, setNonStockBusy] = useState(false);
  const [nonStockError, setNonStockError] = useState<string | null>(null);
  const [nonStockLoaded, setNonStockLoaded] = useState(false);
  const [nonStockSearch, setNonStockSearch] = useState("");

  /* Color inventory modal state */
  const [colorModal, setColorModal] = useState<ColorModal>(null);
  const [modalInventory, setModalInventory] = useState<ModalInventory>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  /* All Inventory state (existing slab browser) */
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [slabs, setSlabs] = useState<Slab[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notInstalled, setNotInstalled] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [fMaterial, setFMaterial] = useState("");
  const [fColor, setFColor] = useState("");
  const [fPriceGroup, setFPriceGroup] = useState("");
  const [fThickness, setFThickness] = useState("");
  const [fRack, setFRack] = useState("");
  const [fDistributor, setFDistributor] = useState("");
  const [fImageStatus, setFImageStatus] = useState("");
  const [sort, setSort] = useState<SortKey>("color");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);

  const homeBase = useMemo(() => homeLauncherUrl(), []);
  const workspaceLogoUrl = EOS_LOGO_URL || undefined;
  const userDisplayName = useMemo(
    () => userMetaName || deriveDisplayNameFromEmail(userEmail) || "Signed in",
    [userMetaName, userEmail]
  );
  const userDisplayInitials = useMemo(() => userInitialsFor(userMetaName, userEmail), [userMetaName, userEmail]);
  const chipSubtitle = useMemo(() => {
    const t = (userProfile.jobTitle || userProfile.department || userProfile.role || "").trim();
    if (t) return t.toUpperCase();
    return userEmail && userEmail.toLowerCase() !== userDisplayName.toLowerCase() ? userEmail : "";
  }, [userProfile, userEmail, userDisplayName]);

  /* ─── auth ─── */

  const signIn = useCallback(async () => {
    setAuthError(null);
    if (!supabase) { setAuthError("Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."); return; }
    setAuthBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
      if (error) throw error;
      const tok = data.session?.access_token;
      if (!tok) throw new Error("No access token");
      setSessionToken(tok);
      setAuthPassword("");
    } catch (e: unknown) { setAuthError(String((e as Error)?.message || e)); }
    finally { setAuthBusy(false); }
  }, [authEmail, authPassword, supabase]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setSessionToken(null);
    setUserEmail(""); setUserMetaName("");
    setUserProfile({ role: "", jobTitle: "", department: "" });
    setSummary(null); setFilters(null); setSlabs([]);
    setElite100Data(null); setElite100Loaded(false);
    setNonStockItems([]); setNonStockLoaded(false);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const applySession = (sess: { access_token?: string; user?: { email?: string | null; user_metadata?: Record<string, unknown> } | null } | null) => {
      if (!alive) return;
      const tok = sess?.access_token ?? "";
      setSessionToken(tok || null);
      const u = sess?.user || null;
      setUserEmail(String(u?.email ?? ""));
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      const metaName = [meta.full_name, meta.name, meta.display_name]
        .map((v) => (typeof v === "string" ? v.trim() : "")).find((v) => Boolean(v)) || "";
      setUserMetaName(metaName);
    };
    void supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => applySession(sess));
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    (async () => {
      try {
        const me = (await apiGetJson("/api/me", sessionToken)) as { user?: { role?: string; job_title?: string | null; department?: string | null } };
        if (cancelled) return;
        setUserProfile({ role: String(me?.user?.role ?? "").trim(), jobTitle: String(me?.user?.job_title ?? "").trim(), department: String(me?.user?.department ?? "").trim() });
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, [sessionToken]);

  /* ─── data loads ─── */

  const loadMeta = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const [s, f] = await Promise.all([
        apiGetJson("/api/slab-inventory/summary", sessionToken) as Promise<{ summary?: Summary; installed?: boolean }>,
        apiGetJson("/api/slab-inventory/filters", sessionToken) as Promise<{ filters?: Filters; installed?: boolean }>
      ]);
      if (s.installed === false || f.installed === false) { setNotInstalled(true); return; }
      setNotInstalled(false);
      if (s.summary) setSummary(s.summary);
      if (f.filters) setFilters(f.filters);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 403) setErr("Forbidden — you need eliteOS Slab Inventory head access.");
      else if (e instanceof ApiError && e.status === 503) setNotInstalled(true);
      else setErr(e instanceof ApiError ? e.message : String(e));
    }
  }, [sessionToken]);

  const loadElite100 = useCallback(async () => {
    if (!sessionToken || elite100Loaded) return;
    setElite100Busy(true);
    setElite100Error(null);
    try {
      const data = (await apiGetJson("/api/slab-inventory/elite100-programs", sessionToken)) as Elite100Data & { ok?: boolean; installed?: boolean };
      if ((data as { installed?: boolean }).installed === false) { setNotInstalled(true); return; }
      setElite100Data(data);
      setElite100Loaded(true);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 403) setElite100Error("Forbidden — you need eliteOS Slab Inventory head access.");
      else setElite100Error(e instanceof ApiError ? e.message : String(e));
    } finally { setElite100Busy(false); }
  }, [sessionToken, elite100Loaded]);

  const loadNonStock = useCallback(async () => {
    if (!sessionToken || nonStockLoaded) return;
    setNonStockBusy(true);
    setNonStockError(null);
    try {
      const data = (await apiGetJson("/api/slab-inventory/non-stock-programs", sessionToken)) as { color_programs?: NonStockItem[]; installed?: boolean };
      if (data.installed === false) { setNotInstalled(true); return; }
      setNonStockItems(Array.isArray(data.color_programs) ? data.color_programs : []);
      setNonStockLoaded(true);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 403) setNonStockError("Forbidden.");
      else setNonStockError(e instanceof ApiError ? e.message : String(e));
    } finally { setNonStockBusy(false); }
  }, [sessionToken, nonStockLoaded]);

  const openColorModal = useCallback(async (modal: NonNullable<ColorModal>) => {
    setColorModal(modal);
    setModalInventory(null);
    setModalError(null);
    setModalBusy(true);
    try {
      if (modal.mode === "elite100" && modal.catalogItemId) {
        const data = (await apiGetJson(`/api/slab-inventory/elite100-programs/${modal.catalogItemId}/inventory`, sessionToken!)) as {
          catalog_item?: {
            reference_image_url?: string | null;
            reference_image_url_full?: string | null;
            reference_image_url_1024?: string | null;
          };
          slabs?: PhysicalItem[];
          remnants?: PhysicalItem[];
          totals?: { total: number; slab_count: number; remnant_count: number };
        };
        const refFromApi =
          data.catalog_item?.reference_image_url
          || data.catalog_item?.reference_image_url_1024
          || null;
        const refFullFromApi =
          data.catalog_item?.reference_image_url_full
          || data.catalog_item?.reference_image_url
          || data.catalog_item?.reference_image_url_1024
          || null;
        if (refFromApi || refFullFromApi) {
          setColorModal((prev) => (
            prev
              ? {
                  ...prev,
                  referenceImageUrl: refFromApi ?? prev.referenceImageUrl,
                  referenceImageUrlFull: refFullFromApi ?? prev.referenceImageUrlFull,
                }
              : prev
          ));
        }
        const slabs = data.slabs ?? [];
        const remnants = data.remnants ?? [];
        setModalInventory({ slabs, remnants, total: data.totals?.total ?? slabs.length + remnants.length, slab_count: data.totals?.slab_count ?? slabs.length, remnant_count: data.totals?.remnant_count ?? remnants.length });
      } else if (modal.colorKey) {
        const data = (await apiGetJson(`/api/slab-inventory/colors/${modal.colorKey}/inventory`, sessionToken!)) as { rows?: PhysicalItem[] };
        const rows = data.rows ?? [];
        const slabs = rows.filter((r) => r.source_inventory_type === "Slab");
        const remnants = rows.filter((r) => r.source_inventory_type === "Remnant");
        setModalInventory({ slabs, remnants, total: rows.length, slab_count: slabs.length, remnant_count: remnants.length });
      }
    } catch (e: unknown) {
      setModalError(e instanceof ApiError ? e.message : String(e));
    } finally { setModalBusy(false); }
  }, [sessionToken]);

  /* Load Elite 100 on initial sign-in */
  useEffect(() => {
    if (sessionToken && !elite100Loaded) void loadElite100();
  }, [sessionToken, elite100Loaded, loadElite100]);

  /* Load meta for All Inventory tab on sign-in */
  useEffect(() => { void loadMeta(); }, [loadMeta]);

  /* Load tab data when switching */
  useEffect(() => {
    if (!sessionToken) return;
    if (activeTab === "elite100" && !elite100Loaded) void loadElite100();
    else if (activeTab === "non_stock" && !nonStockLoaded) void loadNonStock();
    else if (activeTab === "all_inventory") void loadMeta();
  }, [activeTab, sessionToken, elite100Loaded, nonStockLoaded, loadElite100, loadNonStock, loadMeta]);

  /* All Inventory slab loading */
  const buildQuery = useCallback(() => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (fMaterial) p.set("material_name", fMaterial);
    if (fColor) p.set("color_name", fColor);
    if (fPriceGroup) p.set("price_group", fPriceGroup);
    if (fThickness) p.set("thickness_nominal", fThickness);
    if (fRack) p.set("rack", fRack);
    if (fDistributor) p.set("distributor", fDistributor);
    if (fImageStatus) p.set("image_status", fImageStatus);
    p.set("sort", sort); p.set("direction", direction);
    p.set("limit", String(PAGE_SIZE)); p.set("offset", String(page * PAGE_SIZE));
    return p.toString();
  }, [search, fMaterial, fColor, fPriceGroup, fThickness, fRack, fDistributor, fImageStatus, sort, direction, page]);

  const loadSlabs = useCallback(async () => {
    if (!sessionToken) return;
    setBusy(true); setErr(null);
    try {
      const res = (await apiGetJson(`/api/slab-inventory/slabs?${buildQuery()}`, sessionToken)) as { rows?: Slab[]; total?: number; installed?: boolean };
      if (res.installed === false) { setNotInstalled(true); setSlabs([]); setTotal(0); return; }
      setNotInstalled(false);
      setSlabs(Array.isArray(res.rows) ? res.rows : []);
      setTotal(Number(res.total || 0));
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 403) setErr("Forbidden — you need eliteOS Slab Inventory head access.");
      else if (e instanceof ApiError && e.status === 503) setNotInstalled(true);
      else setErr(e instanceof ApiError ? e.message : String(e));
    } finally { setBusy(false); }
  }, [sessionToken, buildQuery]);

  useEffect(() => {
    if (activeTab === "all_inventory") void loadSlabs();
  }, [loadSlabs, activeTab]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(0); }, [fMaterial, fColor, fPriceGroup, fThickness, fRack, fDistributor, fImageStatus, sort, direction]);

  const resetFilters = () => {
    setSearchInput(""); setSearch(""); setFMaterial(""); setFColor(""); setFPriceGroup("");
    setFThickness(""); setFRack(""); setFDistributor(""); setFImageStatus(""); setSort("color"); setDirection("asc"); setPage(0);
  };

  const activeFilterCount = [fMaterial, fColor, fPriceGroup, fThickness, fRack, fDistributor, fImageStatus, search].filter(Boolean).length;
  const activeChips: { key: string; label: string; onClear: () => void }[] = [];
  if (search) activeChips.push({ key: "search", label: `"${search}"`, onClear: () => { setSearchInput(""); setSearch(""); } });
  if (fMaterial) activeChips.push({ key: "material", label: `Material · ${fMaterial}`, onClear: () => setFMaterial("") });
  if (fColor) activeChips.push({ key: "color", label: `Color · ${fColor}`, onClear: () => setFColor("") });
  if (fPriceGroup) activeChips.push({ key: "pg", label: `Source PG · ${fPriceGroup}`, onClear: () => setFPriceGroup("") });
  if (fImageStatus) activeChips.push({ key: "img", label: `Photo · ${fImageStatus}`, onClear: () => setFImageStatus("") });
  if (fThickness) activeChips.push({ key: "thickness", label: `Thickness · ${fThickness}`, onClear: () => setFThickness("") });
  if (fRack) activeChips.push({ key: "rack", label: `Rack · ${fRack}`, onClear: () => setFRack("") });
  if (fDistributor) activeChips.push({ key: "distributor", label: `Distributor · ${fDistributor}`, onClear: () => setFDistributor("") });

  const rangeStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (page + 1) * PAGE_SIZE);
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  /* Lightbox keyboard nav */
  const openSlab = (i: number) => setSelectedIndex(i);
  const closeSlab = useCallback(() => setSelectedIndex(null), []);
  const stepSlab = useCallback((delta: number) => {
    setSelectedIndex((cur) => { if (cur == null) return cur; const next = cur + delta; if (next < 0 || next >= slabs.length) return cur; return next; });
  }, [slabs.length]);

  useEffect(() => {
    if (selectedIndex == null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeSlab(); else if (e.key === "ArrowRight") stepSlab(1); else if (e.key === "ArrowLeft") stepSlab(-1); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedIndex, closeSlab, stepSlab]);

  const selectedSlab = selectedIndex != null ? slabs[selectedIndex] : null;

  /* ─── topbar ─── */
  const menuItems: EliteosTopbarMenuItem[] = [
    { label: "Open Home", meta: "eliteOS Launcher", href: homeBase, icon: homeIcon },
    { label: "Profile & preferences", meta: "eliteOS Home", href: `${homeBase}?view=profile`, icon: profileIcon }
  ];
  const notSeenCount = summary?.active_not_seen_in_latest_sync_count ?? 0;

  /* ─── non-stock filter ─── */
  const filteredNonStock = useMemo(() => {
    if (!nonStockSearch.trim()) return nonStockItems;
    const q = nonStockSearch.trim().toLowerCase();
    return nonStockItems.filter((item) =>
      (item.color_name ?? "").toLowerCase().includes(q) ||
      (item.material_name ?? "").toLowerCase().includes(q)
    );
  }, [nonStockItems, nonStockSearch]);

  /* ─── elite100 total count ─── */
  const elite100TotalCount = useMemo(() => {
    if (!elite100Data?.groups) return 0;
    return elite100Data.groups.reduce((sum, g) => sum + g.items.length, 0);
  }, [elite100Data]);

  return (
    <div className="shell">
      {sessionToken ? (
        <EliteosTopbar
          appName="Inventory"
          organizationName={DEFAULT_WORKSPACE_NAME}
          logoSrc={workspaceLogoUrl}
          homeHref={homeBase}
          userName={userDisplayName}
          userEmail={userEmail}
          userSubtitle={chipSubtitle}
          initials={userDisplayInitials}
          menuItems={menuItems}
          onSignOut={() => void signOut()}
        />
      ) : (
        <EliteosTopbar appName="Inventory" organizationName={DEFAULT_WORKSPACE_NAME} logoSrc={workspaceLogoUrl} homeHref={homeBase} />
      )}

      <main className="main" role="main">
        {!supabase ? (
          <div className="banner banner-warn" role="alert">
            <strong>Supabase is not configured.</strong> Set <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> to sign in.
          </div>
        ) : null}

        {!sessionToken && supabase ? (
          <section className="auth-panel auth-panel-standalone" aria-label="Sign in">
            <header className="auth-panel-header">
              <p className="auth-panel-eyebrow">Slab Inventory · {DEFAULT_WORKSPACE_NAME}</p>
              <h2 className="auth-panel-title">Sign in to continue</h2>
              <p className="auth-panel-sub">
                Use your eliteOS staff account. Backend authorization (Slab Inventory head access) is enforced on every API call. This head is read-only.
              </p>
            </header>
            <div className="field-grid">
              <div className="field">
                <label htmlFor="si-email">Email</label>
                <input id="si-email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} autoComplete="username" placeholder="you@example.com" />
              </div>
              <div className="field">
                <label htmlFor="si-password">Password</label>
                <input id="si-password" type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} autoComplete="current-password" />
              </div>
            </div>
            {authError ? <div className="banner banner-error" role="alert" style={{ marginTop: 8 }}>{authError}</div> : null}
            <button type="button" className="btn primary" style={{ marginTop: 16 }} disabled={authBusy} onClick={() => void signIn()}>
              {authBusy ? "Signing in…" : "Sign in"}
            </button>
            <p className="auth-trust">Authenticated through Supabase. No service-role keys are used in the browser.</p>
          </section>
        ) : null}

        {sessionToken ? (
          <>
            {/* ── Tab bar ── */}
            <nav className="tab-bar" aria-label="Inventory views">
              <button
                type="button"
                className={`tab-btn${activeTab === "elite100" ? " active" : ""}`}
                onClick={() => setActiveTab("elite100")}
                aria-selected={activeTab === "elite100"}
              >
                Elite 100
                {elite100TotalCount > 0 && (
                  <span className="tab-badge">{elite100TotalCount}</span>
                )}
              </button>
              <button
                type="button"
                className={`tab-btn${activeTab === "non_stock" ? " active" : ""}`}
                onClick={() => setActiveTab("non_stock")}
                aria-selected={activeTab === "non_stock"}
              >
                Non-Stock
                {nonStockItems.length > 0 && (
                  <span className="tab-badge">{nonStockItems.length}</span>
                )}
              </button>
              <button
                type="button"
                className={`tab-btn${activeTab === "all_inventory" ? " active" : ""}`}
                onClick={() => setActiveTab("all_inventory")}
                aria-selected={activeTab === "all_inventory"}
              >
                All Inventory
              </button>
              <button
                type="button"
                className={`tab-btn${activeTab === "visualizer" ? " active" : ""}`}
                onClick={() => setActiveTab("visualizer")}
                aria-selected={activeTab === "visualizer"}
              >
                Photo Visualizer
              </button>
            </nav>

            {notInstalled ? (
              <div className="banner banner-warn" role="status">
                The slab inventory cache is not available yet. Run the local inventory sync, then reload.
              </div>
            ) : null}

            {/* ── Elite 100 tab ── */}
            {activeTab === "elite100" ? (
              <div className="e100-page">
                {elite100Busy && !elite100Data ? (
                  <div className="e100-loading">
                    <div className="e100-loading-inner">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="e100-skeleton-section">
                          <div className="e100-skeleton-head skeleton-shimmer" />
                          <div className="e100-skeleton-rail">
                            {Array.from({ length: 5 }).map((_, j) => (
                              <div key={j} className="e100-skeleton-card skeleton-shimmer" />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : elite100Error ? (
                  <div className="banner banner-error" role="alert">{elite100Error}</div>
                ) : elite100Data?.collection === null ? (
                  <div className="empty-state">
                    <div className="empty-art" aria-hidden>
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="14" rx="2" />
                        <path d="M3 14l4.5-4.5 4 4 3-3L21 14" />
                      </svg>
                    </div>
                    <p className="empty-title">No active Elite 100 catalog.</p>
                    <p className="empty-sub">Import and activate the Elite 100 color catalog to enable this view.</p>
                  </div>
                ) : elite100Data ? (
                  <>
                    <div className="e100-collection-header">
                      <p className="e100-collection-name">{elite100Data.collection?.display_name ?? "Elite 100 Color Collection"}</p>
                      <p className="e100-collection-sub">
                        {elite100TotalCount} colors · Premium showroom collection · Read-only
                      </p>
                    </div>
                    {elite100Data.groups.map((group) => (
                      <Elite100Section
                        key={group.price_group}
                        group={group}
                        onOpenItem={(item) => void openColorModal(elite100ColorModalFromItem(item))}
                      />
                    ))}
                  </>
                ) : null}
              </div>
            ) : null}

            {/* ── Non-Stock tab ── */}
            {activeTab === "non_stock" ? (
              <div className="ns-page">
                {nonStockBusy && !nonStockLoaded ? (
                  <div className="ns-grid">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="ns-card-skeleton">
                        <div className="ns-skeleton-img skeleton-shimmer" />
                        <div className="ns-skeleton-body">
                          <div className="skeleton-line skeleton-shimmer" style={{ width: "70%" }} />
                          <div className="skeleton-line skeleton-shimmer" style={{ width: "45%", marginTop: 4 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : nonStockError ? (
                  <div className="banner banner-error" role="alert">{nonStockError}</div>
                ) : (
                  <>
                    <div className="ns-header">
                      <div className="ns-header-text">
                        <h2 className="ns-title">Non-Stock Colors</h2>
                        <p className="ns-sub">
                          {nonStockItems.length} color group{nonStockItems.length !== 1 ? "s" : ""} · Typed inventory not matched to the active Elite 100 catalog
                        </p>
                      </div>
                      <div className="ns-search-wrap">
                        {searchIcon}
                        <input
                          type="search"
                          value={nonStockSearch}
                          onChange={(e) => setNonStockSearch(e.target.value)}
                          placeholder="Search color or material…"
                          aria-label="Search non-stock colors"
                        />
                      </div>
                    </div>
                    {filteredNonStock.length === 0 ? (
                      <div className="empty-state">
                        <p className="empty-title">{nonStockSearch ? "No colors match your search." : "No non-stock inventory."}</p>
                        <p className="empty-sub">{nonStockSearch ? "Try a different search term." : "All typed inventory is matched to the active Elite 100 catalog."}</p>
                        {nonStockSearch && <button type="button" className="btn secondary btn-sm" onClick={() => setNonStockSearch("")}>Clear search</button>}
                      </div>
                    ) : (
                      <div className="ns-grid">
                        {filteredNonStock.map((item) => (
                          <NonStockCard
                            key={item.color_key}
                            item={item}
                            onOpen={() => void openColorModal({
                              mode: "non_stock",
                              colorKey: item.color_key,
                              colorName: item.color_name,
                              materialName: item.material_name,
                              priceGroup: item.source_price_group,
                            })}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : null}

            {/* ── Photo Visualizer tab (client-side prototype) ── */}
            {activeTab === "visualizer" ? (
              <MaterialPhotoVisualizer />
            ) : null}

            {/* ── All Inventory tab ── */}
            {activeTab === "all_inventory" ? (
              <div className="gallery-content">
                {/* Page header with metrics */}
                <section className="page-header" aria-labelledby="si-page-title">
                  <div className="page-header-inner">
                    <div className="page-header-text">
                      <p className="page-eyebrow">All Inventory · read-only operational fallback</p>
                      <h1 id="si-page-title" className="page-title">All Inventory</h1>
                      <p className="page-subtitle">
                        Full paginated slab/remnant browser.{" "}
                        <span className="page-subtitle-note">Local shop inventory is the source of truth.</span>
                      </p>
                    </div>
                    <div className="page-metrics" aria-label="Inventory summary">
                      <Metric value={summary ? (summary.active_cached_slab_count ?? summary.total_active_slabs).toLocaleString() : "—"} label="Active slabs" hint="Never summed from color counts" />
                      <Metric value={summary ? summary.distinct_colors.toLocaleString() : "—"} label="Colors" />
                      <Metric value={summary ? summary.distinct_materials.toLocaleString() : "—"} label="Materials" />
                      <Metric value={summary ? summary.slabs_with_verified_images.toLocaleString() : "—"} label="Verified photos" />
                    </div>
                  </div>
                </section>

                {err ? <div className="banner banner-error" role="alert">{err}</div> : null}

                {/* Search + filter controls */}
                <section className="search-section" aria-label="Filters">
                  <div className="search-row">
                    <div className="search-input-wrap">
                      {searchIcon}
                      <input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search color, material, inventory ID, rack, lot…" aria-label="Search slabs" />
                    </div>
                    <div className="search-actions">
                      <label className="sort-control">
                        <span>Sort</span>
                        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                          <option value="color">Color</option><option value="material">Material</option>
                          <option value="inventory_id">ID</option><option value="rack">Rack</option>
                          <option value="updated_at">Updated</option>
                        </select>
                      </label>
                      <button type="button" className="icon-btn" title={direction === "asc" ? "Sort ascending" : "Sort descending"} aria-label={direction === "asc" ? "Sort ascending" : "Sort descending"} onClick={() => setDirection((d) => (d === "asc" ? "desc" : "asc"))}>
                        {direction === "asc" ? "↑" : "↓"}
                      </button>
                      <div className="view-toggle" role="group" aria-label="View mode">
                        <button type="button" className={viewMode === "grid" ? "on" : ""} onClick={() => setViewMode("grid")} aria-pressed={viewMode === "grid"}>Grid</button>
                        <button type="button" className={viewMode === "table" ? "on" : ""} onClick={() => setViewMode("table")} aria-pressed={viewMode === "table"}>List</button>
                      </div>
                      <button type="button" className={`filters-btn${filterDrawerOpen ? " open" : ""}${activeFilterCount > 0 ? " has-filters" : ""}`} onClick={() => setFilterDrawerOpen((o) => !o)} aria-expanded={filterDrawerOpen} aria-controls="filter-drawer">
                        Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                      </button>
                    </div>
                  </div>
                  {filterDrawerOpen ? (
                    <div id="filter-drawer" className="filter-drawer">
                      <SelectFilter label="Material" value={fMaterial} onChange={setFMaterial} options={filters?.materials} />
                      <SelectFilter label="Color" value={fColor} onChange={setFColor} options={filters?.colors} />
                      <SelectFilter label="Source price group" value={fPriceGroup} onChange={setFPriceGroup} options={filters?.price_groups} />
                      <SelectFilter label="Image status" value={fImageStatus} onChange={setFImageStatus} options={filters?.image_statuses} />
                      <SelectFilter label="Thickness" value={fThickness} onChange={setFThickness} options={filters?.thicknesses} />
                      <SelectFilter label="Rack" value={fRack} onChange={setFRack} options={filters?.racks} />
                      <SelectFilter label="Distributor" value={fDistributor} onChange={setFDistributor} options={filters?.distributors} />
                      {activeFilterCount > 0 ? <button type="button" className="btn secondary btn-sm" onClick={resetFilters}>Clear all</button> : null}
                    </div>
                  ) : null}
                </section>

                {/* Active filter chips */}
                {activeChips.length > 0 ? (
                  <div className="active-chips" aria-label="Active filters">
                    {activeChips.map((c) => (
                      <button key={c.key} type="button" className="chip" onClick={c.onClear} title="Remove filter">
                        <span className="chip-label">{c.label}</span><span className="chip-x" aria-hidden>×</span>
                      </button>
                    ))}
                    {activeChips.length > 1 ? <button type="button" className="chip chip-clear" onClick={resetFilters}>Clear all</button> : null}
                  </div>
                ) : null}

                {/* Result meta + health */}
                <div className="result-meta">
                  <span>{busy ? "Loading…" : `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${total.toLocaleString()}`}</span>
                  <span className="result-meta-right">
                    {summary?.last_sync || notSeenCount > 0 ? (
                      <button type="button" className="health-toggle-btn" onClick={() => setHealthOpen((o) => !o)} aria-expanded={healthOpen}>
                        Inventory health{notSeenCount > 0 ? ` (${notSeenCount} need review)` : ""} {healthOpen ? "▴" : "▾"}
                      </button>
                    ) : null}
                    <span className="result-meta-pages">
                      <button type="button" className="page-btn" disabled={page <= 0 || busy} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</button>
                      <span className="page-indicator">Page {page + 1} / {maxPage + 1}</span>
                      <button type="button" className="page-btn" disabled={page >= maxPage || busy} onClick={() => setPage((p) => Math.min(maxPage, p + 1))}>Next</button>
                    </span>
                  </span>
                </div>

                {/* Health panel (staff diagnostics — not shown by default) */}
                {healthOpen && summary ? (
                  <div className="health-panel" role="region" aria-label="Inventory health">
                    <div className="health-panel-inner">
                      {summary.last_sync ? (
                        <>
                          <div className="health-row"><span>Status</span><strong className={`sync-status sync-${summary.last_sync.status}`}>{summary.last_sync.status}</strong></div>
                          <div className="health-row"><span>Last sync</span><strong>{fmtDate(summary.last_sync.finished_at || summary.last_sync.started_at)}</strong></div>
                          <div className="health-row"><span>Latest sync count</span><strong>{summary.latest_sync_slab_count != null ? `${Number(summary.latest_sync_slab_count).toLocaleString()} slabs seen` : summary.last_sync.slab_upserted_count != null ? `${Number(summary.last_sync.slab_upserted_count).toLocaleString()} slabs seen` : "—"}</strong></div>
                          <div className="health-row"><span>Warnings</span><strong>{summary.last_sync.warning_count}</strong></div>
                        </>
                      ) : null}
                      <div className="health-row"><span>Active cache</span><strong>{(summary.active_cached_slab_count ?? summary.total_active_slabs).toLocaleString()} slabs</strong></div>
                      {notSeenCount > 0 ? (
                        <div className="health-row">
                          <span>Needs review</span>
                          <strong className="count-warn">{notSeenCount} not seen in latest sync</strong>
                        </div>
                      ) : summary.last_sync ? (
                        <div className="health-row"><span>Sync coverage</span><strong>All active slabs seen in latest sync</strong></div>
                      ) : null}
                    </div>
                    {notSeenCount > 0 && summary.active_not_seen_in_latest_sync_sample?.length ? (
                      <div className="health-not-seen">
                        <p className="health-not-seen-label">Sample — active rows not in latest sync (retire-on-missing disabled, or a failed/partial sync)</p>
                        <ul className="health-not-seen-sample">
                          {summary.active_not_seen_in_latest_sync_sample.map((row) => (
                            <li key={row.id ?? row.inventory_id}>
                              <span className="not-seen-color">{row.color_name || "—"}</span>
                              {" · "}
                              <span className="not-seen-material">{row.material_name || "—"}</span>
                              {row.inventory_id ? <> · <code className="not-seen-inv">{row.inventory_id}</code></> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {summary.slabs_by_price_group?.length ? (
                      <div className="health-pg">
                        <p className="health-pg-label">By source price group · imported from active inventory feed</p>
                        {summary.slabs_by_price_group.map((g) => (
                          <div key={g.price_group} className="health-pg-row">
                            <span className="pg-badge">{g.price_group}</span>
                            <span className="health-pg-count">{g.count.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {/* Slab grid/table/empty/skeleton */}
                {busy && slabs.length === 0 ? (
                  <div className="slab-grid">{Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}</div>
                ) : slabs.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-art" aria-hidden>
                      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="14" rx="2" /><path d="M3 14l4.5-4.5 4 4 3-3L21 14" /><circle cx="8.5" cy="8.5" r="1.3" />
                      </svg>
                    </div>
                    <p className="empty-title">No slabs match these criteria.</p>
                    <p className="empty-sub">Try removing a filter or broaden your search.</p>
                    <div className="empty-actions">
                      {activeFilterCount > 0 ? <button type="button" className="btn secondary btn-sm" onClick={resetFilters}>Clear filters</button> : null}
                      {fMaterial ? <button type="button" className="btn secondary btn-sm" onClick={() => setFMaterial("")}>Show all materials</button> : null}
                    </div>
                  </div>
                ) : viewMode === "grid" ? (
                  <div className="slab-grid">
                    {slabs.map((s, i) => <SlabCard key={s.id} slab={s} onOpen={() => openSlab(i)} />)}
                  </div>
                ) : (
                  <div className="slab-table-wrap">
                    <table className="slab-table">
                      <thead>
                        <tr>
                          <th>Color</th><th>Material</th><th>Dimensions</th>
                          <th>ID</th><th>Rack</th>
                          <th title={SOURCE_PRICE_GROUP_HINT}>Source PG</th>
                          <th title="Photo verified by URL check">Photo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slabs.map((s, i) => (
                          <tr key={s.id} onClick={() => openSlab(i)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSlab(i); } }} className="slab-row" tabIndex={0} role="button" aria-label={`View details: ${s.color_name ?? "Unnamed"} · ${s.material_name ?? ""}`}>
                            <td className="cell-strong">{s.color_name || "—"}</td>
                            <td>{s.material_name || "—"}</td>
                            <td>{dimsLabel(s.width_actual_in, s.length_actual_in)}</td>
                            <td>{s.inventory_id ? <code>ID {s.inventory_id}</code> : "—"}</td>
                            <td>{s.rack || "—"}</td>
                            <td>{s.source_price_group ? <span className="pg-badge" title={SOURCE_PRICE_GROUP_HINT}>{s.source_price_group}</span> : "—"}</td>
                            <td>{s.image_status === "ok" ? <span className="img-ok" aria-label="Verified">✓</span> : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}

            {/* Color Inventory Modal (Elite 100 + Non-Stock) */}
            {colorModal ? (
              <ColorInventoryModal
                modal={colorModal}
                inventory={modalInventory}
                busy={modalBusy}
                error={modalError}
                onClose={() => { setColorModal(null); setModalInventory(null); setModalError(null); }}
              />
            ) : null}
          </>
        ) : null}

        {/* Single-slab lightbox (All Inventory tab) */}
        {selectedSlab ? (
          <SlabLightbox slab={selectedSlab} index={selectedIndex ?? 0} count={slabs.length} onClose={closeSlab} onPrev={() => stepSlab(-1)} onNext={() => stepSlab(1)} />
        ) : null}
      </main>

      <footer className="footer-bar" role="contentinfo">
        <span>eliteOS · Slab Inventory</span>
        <span className="footer-meta">Read-only · {config.backendBaseUrl} · local shop inventory is the source of truth</span>
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────── shared subcomponents */

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="metric" title={hint}>
      <span className="metric-value">{value}</span>
      <span className="metric-label">{label}</span>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="slab-card slab-card-skeleton" aria-hidden>
      <div className="slab-card-media skeleton-shimmer" />
      <div className="slab-card-body">
        <div className="skeleton-line skeleton-shimmer" style={{ width: "70%" }} />
        <div className="skeleton-line skeleton-shimmer" style={{ width: "45%" }} />
        <div className="skeleton-line skeleton-shimmer" style={{ width: "55%", marginTop: 6 }} />
      </div>
    </div>
  );
}

function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options?: string[] }) {
  return (
    <label className="select-filter">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} data-active={value ? "1" : "0"}>
        <option value="">{label}: all</option>
        {(options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function SlabThumb({ src, imageStatus, colorName, className }: { src: string | null; imageStatus: string; colorName: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && imageStatus !== "missing" && !failed;
  if (showImage && src) {
    return <img className={className} src={src} alt={`${colorName ?? "Slab"}`.trim()} loading="lazy" onError={() => setFailed(true)} />;
  }
  return (
    <div className={`slab-fallback ${className ?? ""}`} aria-hidden>
      <span>{colorInitials(colorName)}</span>
    </div>
  );
}

function SlabCard({ slab, onOpen }: { slab: Slab; onOpen: () => void }) {
  return (
    <button type="button" className="slab-card" onClick={onOpen} aria-label={`View details: ${slab.color_name ?? "Unnamed"} · ${slab.material_name ?? ""}`}>
      <div className="slab-card-media">
        <SlabThumb src={slab.thumbnail_url || slab.image_url} imageStatus={slab.image_status} colorName={slab.color_name} className="slab-card-img" />
        {slab.source_price_group ? <span className="slab-card-pg pg-badge" title={SOURCE_PRICE_GROUP_HINT}>{slab.source_price_group}</span> : null}
        {slab.image_status === "ok" ? <span className="slab-card-verified" role="img" aria-label="Photo verified" /> : null}
        <span className="slab-card-overlay" aria-hidden><span className="slab-card-overlay-hint">View details ›</span></span>
      </div>
      <div className="slab-card-body">
        <p className="slab-card-color">{slab.color_name || "Unnamed"}</p>
        <p className="slab-card-material">{slab.material_name || "—"}</p>
        <div className="slab-card-meta">
          <span>{dimsLabel(slab.width_actual_in, slab.length_actual_in)}</span>
          {slab.rack ? <><span className="slab-card-dot" aria-hidden>·</span><span>Rack {slab.rack}</span></> : null}
        </div>
        {slab.inventory_id ? <p className="slab-card-inv">ID {slab.inventory_id}</p> : slab.external_slab_id ? <p className="slab-card-inv slab-card-inv-ext">{slab.external_slab_id.slice(0, 8)}…</p> : null}
      </div>
    </button>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className={`detail-value${mono ? " detail-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}

function SlabLightbox({ slab, index, count, onClose, onPrev, onNext }: { slab: Slab; index: number; count: number; onClose: () => void; onPrev: () => void; onNext: () => void }) {
  const [copied, setCopied] = useState(false);
  const copyId = async () => {
    try { await navigator.clipboard.writeText(String(slab.external_slab_id ?? "")); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { /* clipboard unavailable */ }
  };
  return (
    <div className="lightbox-overlay" role="dialog" aria-modal="true" aria-label={`${slab.color_name ?? "Slab"} detail`} onClick={onClose}>
      <div className="lightbox" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lightbox-close" onClick={onClose} aria-label="Close">×</button>
        <div className="lightbox-media">
          <SlabThumb src={slab.thumbnail_url || slab.image_url} imageStatus={slab.image_status} colorName={slab.color_name} className="lightbox-img" />
          {count > 1 ? (
            <>
              <button type="button" className="lightbox-nav lightbox-prev" onClick={onPrev} disabled={index <= 0} aria-label="Previous slab">‹</button>
              <button type="button" className="lightbox-nav lightbox-next" onClick={onNext} disabled={index >= count - 1} aria-label="Next slab">›</button>
            </>
          ) : null}
        </div>
        <div className="lightbox-info">
          <header className="lightbox-head">
            <p className="lightbox-eyebrow">{slab.material_name || "Slab"}</p>
            <h2 className="lightbox-title">{slab.color_name || "Unnamed slab"}</h2>
            {slab.source_price_group ? (
              <p className="lightbox-pg">
                <span className="pg-badge">{slab.source_price_group}</span>
                <span className="lightbox-pg-label">{slab.source_price_group_label || "Source price group"} · imported from active inventory feed</span>
              </p>
            ) : null}
          </header>
          <div className="detail-block">
            <DetailRow label="Dimensions" value={dimsLabel(slab.width_actual_in, slab.length_actual_in)} />
            <DetailRow label="Thickness" value={slab.thickness_nominal} />
            <DetailRow label="Distributor" value={slab.distributor} />
            <DetailRow label="Rack" value={slab.rack} />
            <DetailRow label="Lot" value={slab.lot} />
            <DetailRow label="Inventory ID" value={slab.inventory_id} mono />
            <DetailRow label="Image status" value={<span className={`img-status img-${slab.image_status}`}>{slab.image_status}</span>} />
            {slab.image_source_label ? <DetailRow label="Image source" value={slab.image_source_label} /> : null}
            {slab.inventory_source ? (
              <DetailRow label="Inventory source" value={formatInventorySourceLabel(slab.inventory_source)} />
            ) : null}
            <DetailRow label="Active" value={slab.is_active ? "Yes" : "No"} />
          </div>
          <details className="tech-details">
            <summary>Technical details</summary>
            <DetailRow label="External slab ID" value={<span className="copy-line"><code>{slab.external_slab_id || "—"}</code>{slab.external_slab_id ? <button type="button" className="copy-btn" onClick={() => void copyId()}>{copied ? "Copied" : "Copy"}</button> : null}</span>} />
            <DetailRow label="Last sync run" value={slab.last_seen_sync_run_id} mono />
            <DetailRow label="Updated" value={fmtDate(slab.updated_at)} />
            {slab.image_url ? <DetailRow label="Image URL" value={<a href={slab.image_url} target="_blank" rel="noreferrer noopener" className="img-link">open</a>} /> : null}
          </details>
          <p className="lightbox-foot">Read-only · source price group is imported from the active inventory feed and is not slabOS pricing authority.</p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────── Elite 100 components */

function elite100ColorModalFromItem(item: Elite100Item): NonNullable<ColorModal> {
  return {
    mode: "elite100",
    catalogItemId: item.catalog_item_id,
    colorKey: item.color_key,
    colorName: item.color_name,
    materialName: item.material_name,
    priceGroup: item.price_group,
    referenceImageUrl:
      item.reference_image_url
      || item.reference_image_url_1024
      || item.reference_image_url_600
      || item.visual_asset_url_1024
      || item.visual_asset_url_600
      || null,
    referenceImageUrlFull:
      item.reference_image_url_full
      || item.reference_image_url
      || item.reference_image_url_1024
      || item.reference_image_url_600
      || item.visual_asset_url_1024
      || item.visual_asset_url_600
      || null,
    representativeImageUrl:
      item.current_inventory_thumbnail_url
      || item.current_inventory_image_url
      || item.representative_thumbnail_url
      || item.representative_image_url
      || null,
  };
}

function Elite100Section({ group, onOpenItem }: { group: Elite100Group; onOpenItem: (item: Elite100Item) => void }) {
  const railRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    // Read actual card width from first child + gap (24px) so scroll step stays in sync
    // with whatever --e100-card-width resolves to at the current viewport.
    const firstItem = rail.firstElementChild as HTMLElement | null;
    const cardW = firstItem ? firstItem.offsetWidth + 24 : 424;
    rail.scrollBy({ left: dir * cardW * 2, behavior: "smooth" });
  };
  return (
    <section className="e100-section" aria-labelledby={`e100-group-${group.price_group}`}>
      <div className="e100-section-head">
        <div className="e100-section-title-row">
          <span className={`e100-group-badge${group.price_group === "Promo" ? " promo" : ""}`} aria-hidden>
            {group.price_group === "Promo" ? "P" : group.price_group}
          </span>
          <h2 id={`e100-group-${group.price_group}`} className="e100-section-title">
            {group.price_group === "Promo" ? "Group Promo" : `Group ${group.price_group}`}
          </h2>
          <span className="e100-section-count">{group.items.length} color{group.items.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="e100-section-controls" aria-label="Scroll carousel">
          <button type="button" className="e100-scroll-btn" onClick={() => scroll(-1)} aria-label="Scroll left">‹</button>
          <button type="button" className="e100-scroll-btn" onClick={() => scroll(1)} aria-label="Scroll right">›</button>
        </div>
      </div>
      <div className="e100-rail-wrap">
        <div className="e100-rail" ref={railRef} role="list" aria-label={`Group ${group.price_group} colors`}>
          {group.items.map((item) => (
            <div key={item.catalog_item_id} role="listitem">
              <Elite100Card item={item} onOpen={() => onOpenItem(item)} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Elite100Card({ item, onOpen }: { item: Elite100Item; onOpen: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const texture = lookupElite100Texture(item.color_name, item.color_key);
  const src = texture
    ? null
    : item.reference_image_url
      || item.reference_image_url_1024
      || item.reference_image_url_600
      || item.visual_asset_url_1024
      || item.visual_asset_url_600
      || null;
  const hasImage = Boolean(src) && !imgFailed;
  const availableCount = item.current_inventory_count ?? item.total_inventory_count;
  return (
    <button
      type="button"
      className="cp-card"
      onClick={onOpen}
      aria-label={`${item.color_name ?? "Color"} · ${item.has_inventory ? `${availableCount} current available` : "No current inventory"} — Open color`}
    >
      <div className={`cp-card-mat${texture ? " cp-card-mat-texture" : ""}`}>
        <div className="cp-card-img-wrap">
          {texture ? (
            <img
              src={texture.thumbUrl}
              alt={`${item.display_name ?? item.color_name ?? texture.colorName} material texture`}
              loading="lazy"
              className="cp-card-img"
            />
          ) : hasImage ? (
            <img
              src={src!}
              alt={item.display_name ?? item.color_name ?? ""}
              loading="lazy"
              className="cp-card-img"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="cp-card-placeholder" aria-hidden>
              <span>{colorInitials(item.color_name)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="cp-card-body">
        <p className="cp-card-name">{item.color_name || "—"}</p>
        {item.material_name ? (
          <p className="cp-card-material">{item.material_name}</p>
        ) : null}
        {item.has_inventory && availableCount > 0 ? (
          <p className="cp-card-meta">
            <span>{availableCount} current available</span>
            {(item.slab_count > 0 || item.remnant_count > 0) ? (
              <>
                <span className="cp-dot" aria-hidden> · </span>
                {item.slab_count > 0 ? <span>{item.slab_count} slab{item.slab_count !== 1 ? "s" : ""}</span> : null}
                {item.slab_count > 0 && item.remnant_count > 0 ? <span className="cp-dot" aria-hidden> · </span> : null}
                {item.remnant_count > 0 ? <span>{item.remnant_count} remnant{item.remnant_count !== 1 ? "s" : ""}</span> : null}
              </>
            ) : null}
          </p>
        ) : (
          <p className="cp-card-no-inv-text">No current inventory</p>
        )}
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────── Non-Stock components */

function NonStockCard({ item, onOpen }: { item: NonStockItem; onOpen: () => void }) {
  const [imgFailed, setImgFailed] = useState(false);
  const src = item.representative_thumbnail_url || item.representative_image_url;
  const hasImage = Boolean(src) && !imgFailed;
  return (
    <button
      type="button"
      className="ns-card"
      onClick={onOpen}
      aria-label={`${item.color_name ?? "Color"} · ${item.material_name ?? ""} — Open inventory`}
    >
      <div className="ns-card-img-wrap">
        {hasImage ? (
          <img src={src!} alt={`${item.color_name ?? ""} ${item.material_name ?? ""}`.trim()} loading="lazy" className="ns-card-img" onError={() => setImgFailed(true)} />
        ) : (
          <div className="ns-card-fallback" aria-hidden>
            <span>{colorInitials(item.color_name)}</span>
          </div>
        )}
        {item.source_price_group && (
          <span className="pg-badge ns-pg-badge" title={SOURCE_PRICE_GROUP_HINT}>
            {item.source_price_group}
          </span>
        )}
      </div>
      <div className="ns-card-body">
        <p className="ns-card-name">{item.color_name || "—"}</p>
        <p className="ns-card-material">{item.material_name || "—"}</p>
        <p className="ns-card-count">{item.slab_count > 0 ? `${item.slab_count} slab${item.slab_count !== 1 ? "s" : ""}` : ""}{item.slab_count > 0 && item.remnant_count > 0 ? " · " : ""}{item.remnant_count > 0 ? `${item.remnant_count} remnant${item.remnant_count !== 1 ? "s" : ""}` : ""}</p>
      </div>
    </button>
  );
}

/* ─────────────────────────────────────────── Color Inventory Modal */

function ColorInventoryModal({
  modal,
  inventory,
  busy,
  error,
  onClose
}: {
  modal: NonNullable<ColorModal>;
  inventory: ModalInventory;
  busy: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [imageViewer, setImageViewer] = useState<ImageViewerState>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !imageViewer) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, imageViewer]);

  const pilotTexture = modal.mode === "elite100"
    ? lookupElite100Texture(modal.colorName, modal.colorKey)
    : null;
  const totalSlabs = inventory?.slab_count ?? 0;
  const totalRemnants = inventory?.remnant_count ?? 0;
  const total = inventory?.total ?? 0;
  const catalogHeroSrc = modal.referenceImageUrl ?? modal.representativeImageUrl;
  const heroSrc = pilotTexture?.thumbUrl ?? catalogHeroSrc ?? null;
  const hasHeroImg = Boolean(heroSrc) && !heroImgFailed;
  const heroViewerSrc = pilotTexture?.fullUrl ?? referenceViewerSrc(modal) ?? null;
  const inventoryGallery = useMemo(
    () => buildInventoryGalleryItems(inventory, modal.colorName),
    [inventory, modal.colorName]
  );

  const openReferenceViewer = () => {
    if (!heroViewerSrc) return;
    const caption = modal.colorName
      ? `${modal.colorName} reference image`
      : "Catalog reference image";
    setImageViewer({
      items: [{ src: heroViewerSrc, caption, alt: modal.colorName ?? "Catalog reference" }],
      initialIndex: 0,
    });
  };

  const openInventoryViewer = (item: PhysicalItem) => {
    const src = inventoryViewerSrc(item);
    if (!src || item.image_status === "missing") return;
    const index = inventoryGallery.findIndex((g) => g.itemId === item.id);
    setImageViewer({
      items: inventoryGallery.length > 0 ? inventoryGallery : [{
        src,
        caption: inventoryImageCaption(item, modal.colorName),
        alt: modal.colorName || item.color_name || "Inventory slab",
      }],
      initialIndex: index >= 0 ? index : 0,
    });
  };

  return (
    <>
      <div className="cim-overlay" role="dialog" aria-modal="true" aria-label={`${modal.colorName ?? "Color"} inventory`} onClick={onClose}>
        <div className="cim" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="cim-close" onClick={onClose} aria-label="Close">×</button>

          {/* Hero: reference image + detail panel */}
          <div className="cim-hero">
            <div className="cim-hero-img-wrap">
              {hasHeroImg ? (
                <button
                  type="button"
                  className="cim-hero-img-btn"
                  onClick={openReferenceViewer}
                  aria-label={`View full-size reference image for ${modal.colorName ?? "color"}`}
                  title="View full-size reference image"
                >
                  <img
                    src={heroSrc!}
                    alt={modal.colorName ?? ""}
                    className="cim-hero-img"
                    onError={() => setHeroImgFailed(true)}
                  />
                  <span className="cim-hero-zoom-hint" aria-hidden>Click to zoom</span>
                </button>
              ) : (
                <div className="cim-hero-placeholder" aria-hidden>
                  <span>{colorInitials(modal.colorName)}</span>
                </div>
              )}
            </div>

          <div className="cim-detail">
            <p className="cim-eyebrow">
              {modal.mode === "elite100" ? (
                <><span className="cim-e100-badge">Elite 100</span>{modal.priceGroup && <span className="cim-group">Group {modal.priceGroup}</span>}</>
              ) : modal.priceGroup ? (
                <span className="cim-group">Source Group {modal.priceGroup}</span>
              ) : (
                <span className="cim-group">Non-Stock</span>
              )}
            </p>
            <h2 className="cim-title">{modal.colorName || "Color"}</h2>
            {modal.materialName && <p className="cim-material">{modal.materialName}</p>}

            <div className="cim-stats">
              <div className="cim-stat">
                <span className="cim-stat-n">{busy ? "—" : total}</span>
                <span className="cim-stat-label">Available</span>
              </div>
              <div className="cim-stat">
                <span className="cim-stat-n">{busy ? "—" : totalSlabs}</span>
                <span className="cim-stat-label">Full Slabs</span>
              </div>
              <div className="cim-stat">
                <span className="cim-stat-n">{busy ? "—" : totalRemnants}</span>
                <span className="cim-stat-label">Remnants</span>
              </div>
            </div>
            <p className="cim-source-note">Read-only · reference image from color catalog · current inventory from local stock</p>
          </div>
        </div>

        {/* Scrollable inventory body */}
        <div className="cim-body">
          {busy && (
            <div className="cim-loading">
              <div className="cim-loading-spinner" aria-hidden />
              Loading inventory…
            </div>
          )}
          {!busy && error && (
            <div className="banner banner-error" role="alert">{error}</div>
          )}
          {!busy && !error && inventory && (
            <>
              <section className="cim-section">
                <h3 className="cim-section-title">Full Slabs{totalSlabs > 0 ? ` (${totalSlabs})` : ""}</h3>
                {inventory.slabs.length === 0 ? (
                  <p className="cim-empty">No full slabs currently available.</p>
                ) : (
                  <div className="cim-item-grid">
                    {inventory.slabs.map((item) => (
                      <PhysicalItemCard key={item.id} item={item} onImageClick={openInventoryViewer} />
                    ))}
                  </div>
                )}
              </section>
              <section className="cim-section">
                <h3 className="cim-section-title">Remnants{totalRemnants > 0 ? ` (${totalRemnants})` : ""}</h3>
                {inventory.remnants.length === 0 ? (
                  <p className="cim-empty">No remnants currently available.</p>
                ) : (
                  <div className="cim-item-grid">
                    {inventory.remnants.map((item) => (
                      <PhysicalItemCard key={item.id} item={item} onImageClick={openInventoryViewer} />
                    ))}
                  </div>
                )}
              </section>
              {totalSlabs === 0 && totalRemnants === 0 && (
                <div className="cim-no-inventory">
                  <p>No current inventory for this {modal.mode === "elite100" ? "Elite 100 color" : "color"}.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>

      {imageViewer ? (
        <ZoomImageViewer
          items={imageViewer.items}
          initialIndex={imageViewer.initialIndex}
          onClose={() => setImageViewer(null)}
        />
      ) : null}
    </>
  );
}

function PhysicalItemCard({
  item,
  onImageClick,
}: {
  item: PhysicalItem;
  onImageClick?: (item: PhysicalItem) => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const thumbSrc = item.thumbnail_url || item.image_url;
  const hasImage = Boolean(thumbSrc) && item.image_status !== "missing" && !imgFailed;
  const canZoom = Boolean(inventoryViewerSrc(item)) && item.image_status !== "missing" && !imgFailed;
  const dims = dimsLabel(item.width_actual_in, item.length_actual_in);
  return (
    <div className="pi-card">
      <div className="pi-card-img-wrap">
        {hasImage ? (
          <button
            type="button"
            className="pi-card-img-btn"
            onClick={() => onImageClick?.(item)}
            disabled={!canZoom}
            aria-label={canZoom ? `View full-size photo${item.inventory_id ? ` for ID ${item.inventory_id}` : ""}` : undefined}
            title={canZoom ? "View full-size photo" : undefined}
          >
            <img src={thumbSrc!} alt="" className="pi-card-img" loading="lazy" onError={() => setImgFailed(true)} />
            {canZoom ? <span className="pi-card-zoom-hint" aria-hidden>Zoom</span> : null}
          </button>
        ) : (
          <div className="pi-card-fallback" aria-hidden>
            <span>{colorInitials(item.color_name)}</span>
          </div>
        )}
      </div>
      <div className="pi-card-info">
        {dims !== "—" && <p className="pi-dims">{dims}</p>}
        {item.thickness_nominal && <p className="pi-thickness">{item.thickness_nominal}</p>}
        {item.rack && <p className="pi-meta">Rack {item.rack}{item.lot ? ` · Lot ${item.lot}` : ""}</p>}
        {item.inventory_id && <p className="pi-id">ID {item.inventory_id}</p>}
        {item.source_price_group && (
          <span className="pg-badge pi-pg" title={SOURCE_PRICE_GROUP_HINT}>
            {item.source_price_group}
          </span>
        )}
      </div>
    </div>
  );
}
