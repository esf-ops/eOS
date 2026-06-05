import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiGetJson, ApiError } from "@quote-lib/api";
import { config, EOS_LOGO_URL } from "@quote-lib/config";
import { getSupabase } from "./lib/supabase";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";

/* ------------------------------------------------------------------ types */

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

/* -------------------------------------------------------------- workspace */

const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";
const PAGE_SIZE = 60;

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

function dimsLabel(s: Slab): string {
  const w = s.width_actual_in;
  const l = s.length_actual_in;
  if (w == null && l == null) return "—";
  const wl = w == null ? "?" : Math.round(Number(w));
  const ll = l == null ? "?" : Math.round(Number(l));
  return `${ll}″ × ${wl}″`;
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/* ------------------------------------------------------------------ icons */

const homeIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11.5L12 4l9 7.5" />
    <path d="M5 10v10h14V10" />
    <path d="M10 20v-6h4v6" />
  </svg>
);
const profileIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c1.5-3.5 4.2-5 7-5s5.5 1.5 7 5" />
  </svg>
);

const searchIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-3.5-3.5" />
  </svg>
);

/* -------------------------------------------------------------- component */

export default function SlabInventoryApp() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userMetaName, setUserMetaName] = useState("");
  const [userProfile, setUserProfile] = useState<{ role: string; jobTitle: string; department: string }>({
    role: "",
    jobTitle: "",
    department: ""
  });

  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Data
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filters, setFilters] = useState<Filters | null>(null);
  const [slabs, setSlabs] = useState<Slab[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notInstalled, setNotInstalled] = useState(false);

  // Filter UI state
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
  const [presentationMode, setPresentationMode] = useState(false);
  const [presentationFiltersOpen, setPresentationFiltersOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
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

  /* ----------------------------------------------------------- auth flow */

  const signIn = useCallback(async () => {
    setAuthError(null);
    if (!supabase) {
      setAuthError("Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
    setAuthBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword
      });
      if (error) throw error;
      const tok = data.session?.access_token;
      if (!tok) throw new Error("No access token");
      setSessionToken(tok);
      setAuthPassword("");
    } catch (e: unknown) {
      setAuthError(String((e as Error)?.message || e));
    } finally {
      setAuthBusy(false);
    }
  }, [authEmail, authPassword, supabase]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setSessionToken(null);
    setUserEmail("");
    setUserMetaName("");
    setUserProfile({ role: "", jobTitle: "", department: "" });
    setSummary(null);
    setFilters(null);
    setSlabs([]);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const applySession = (sess: {
      access_token?: string;
      user?: { email?: string | null; user_metadata?: Record<string, unknown> } | null;
    } | null) => {
      if (!alive) return;
      const tok = sess?.access_token ?? "";
      setSessionToken(tok || null);
      const u = sess?.user || null;
      setUserEmail(String(u?.email ?? ""));
      const meta = (u?.user_metadata ?? {}) as Record<string, unknown>;
      const metaName =
        [meta.full_name, meta.name, meta.display_name]
          .map((v) => (typeof v === "string" ? v.trim() : ""))
          .find((v) => Boolean(v)) || "";
      setUserMetaName(metaName);
    };
    void supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => applySession(sess));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    (async () => {
      try {
        const me = (await apiGetJson("/api/me", sessionToken)) as {
          user?: { role?: string; job_title?: string | null; department?: string | null };
        };
        if (cancelled) return;
        setUserProfile({
          role: String(me?.user?.role ?? "").trim(),
          jobTitle: String(me?.user?.job_title ?? "").trim(),
          department: String(me?.user?.department ?? "").trim()
        });
      } catch {
        /* non-fatal */
      }
    })();
    return () => { cancelled = true; };
  }, [sessionToken]);

  /* ---------------------------------------------------------- data loads */

  const loadMeta = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const [s, f] = await Promise.all([
        apiGetJson("/api/slab-inventory/summary", sessionToken) as Promise<{ summary?: Summary; installed?: boolean }>,
        apiGetJson("/api/slab-inventory/filters", sessionToken) as Promise<{ filters?: Filters; installed?: boolean }>
      ]);
      if (s.installed === false || f.installed === false) {
        setNotInstalled(true);
        return;
      }
      setNotInstalled(false);
      if (s.summary) setSummary(s.summary);
      if (f.filters) setFilters(f.filters);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 403) {
        setErr("Forbidden — you need eliteOS Slab Inventory head access.");
      } else if (e instanceof ApiError && e.status === 503) {
        setNotInstalled(true);
      } else {
        setErr(e instanceof ApiError ? e.message : String(e));
      }
    }
  }, [sessionToken]);

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
    p.set("sort", sort);
    p.set("direction", direction);
    p.set("limit", String(PAGE_SIZE));
    p.set("offset", String(page * PAGE_SIZE));
    return p.toString();
  }, [search, fMaterial, fColor, fPriceGroup, fThickness, fRack, fDistributor, fImageStatus, sort, direction, page]);

  const loadSlabs = useCallback(async () => {
    if (!sessionToken) return;
    setBusy(true);
    setErr(null);
    try {
      const res = (await apiGetJson(`/api/slab-inventory/slabs?${buildQuery()}`, sessionToken)) as {
        rows?: Slab[];
        total?: number;
        installed?: boolean;
      };
      if (res.installed === false) {
        setNotInstalled(true);
        setSlabs([]);
        setTotal(0);
        return;
      }
      setNotInstalled(false);
      setSlabs(Array.isArray(res.rows) ? res.rows : []);
      setTotal(Number(res.total || 0));
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 403) {
        setErr("Forbidden — you need eliteOS Slab Inventory head access.");
      } else if (e instanceof ApiError && e.status === 503) {
        setNotInstalled(true);
      } else {
        setErr(e instanceof ApiError ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  }, [sessionToken, buildQuery]);

  useEffect(() => { void loadMeta(); }, [loadMeta]);
  useEffect(() => { void loadSlabs(); }, [loadSlabs]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(0);
  }, [fMaterial, fColor, fPriceGroup, fThickness, fRack, fDistributor, fImageStatus, sort, direction]);

  const resetFilters = () => {
    setSearchInput("");
    setSearch("");
    setFMaterial("");
    setFColor("");
    setFPriceGroup("");
    setFThickness("");
    setFRack("");
    setFDistributor("");
    setFImageStatus("");
    setSort("color");
    setDirection("asc");
    setPage(0);
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

  /* -------------------------------------------------------- lightbox nav */

  const openSlab = (i: number) => setSelectedIndex(i);
  const closeSlab = useCallback(() => setSelectedIndex(null), []);
  const stepSlab = useCallback(
    (delta: number) => {
      setSelectedIndex((cur) => {
        if (cur == null) return cur;
        const next = cur + delta;
        if (next < 0 || next >= slabs.length) return cur;
        return next;
      });
    },
    [slabs.length]
  );

  useEffect(() => {
    if (selectedIndex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSlab();
      else if (e.key === "ArrowRight") stepSlab(1);
      else if (e.key === "ArrowLeft") stepSlab(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedIndex, closeSlab, stepSlab]);

  const selectedSlab = selectedIndex != null ? slabs[selectedIndex] : null;

  /* -------------------------------------------------------------- topbar */

  const menuItems: EliteosTopbarMenuItem[] = [
    { label: "Open Home", meta: "eliteOS Launcher", href: homeBase, icon: homeIcon },
    { label: "Profile & preferences", meta: "eliteOS Home", href: `${homeBase}?view=profile`, icon: profileIcon }
  ];

  const notSeenCount = summary?.active_not_seen_in_latest_sync_count ?? 0;

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
                Use your eliteOS staff account. Backend authorization (Slab Inventory head access) is enforced on every
                API call. This head is read-only.
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
            {authError ? (
              <div className="banner banner-error" role="alert" style={{ marginTop: 8 }}>{authError}</div>
            ) : null}
            <button type="button" className="btn primary" style={{ marginTop: 16 }} disabled={authBusy} onClick={() => void signIn()}>
              {authBusy ? "Signing in…" : "Sign in"}
            </button>
            <p className="auth-trust">Authenticated through Supabase. No service-role keys are used in the browser.</p>
          </section>
        ) : null}

        {sessionToken ? (
          <>
            {/* Presentation bar */}
            {presentationMode ? (
              <div className="presentation-bar" role="region" aria-label="Presentation mode">
                <span className="presentation-tag">Presentation mode</span>
                <div className="presentation-search">
                  {searchIcon}
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search slabs…"
                    aria-label="Search slabs"
                  />
                </div>
                <div className="presentation-actions">
                  <button
                    type="button"
                    className="btn secondary btn-sm"
                    onClick={() => setPresentationFiltersOpen((o) => !o)}
                    aria-expanded={presentationFiltersOpen}
                  >
                    Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                  </button>
                  <button
                    type="button"
                    className="btn primary btn-sm"
                    onClick={() => { setPresentationMode(false); setPresentationFiltersOpen(false); }}
                  >
                    Exit presentation
                  </button>
                </div>
                {presentationFiltersOpen ? (
                  <div className="presentation-filter-panel">
                    <div className="filter-drawer">
                      <SelectFilter label="Material" value={fMaterial} onChange={setFMaterial} options={filters?.materials} />
                      <SelectFilter label="Color" value={fColor} onChange={setFColor} options={filters?.colors} />
                      <SelectFilter label="Source price group" value={fPriceGroup} onChange={setFPriceGroup} options={filters?.price_groups} />
                      <SelectFilter label="Image status" value={fImageStatus} onChange={setFImageStatus} options={filters?.image_statuses} />
                      <SelectFilter label="Thickness" value={fThickness} onChange={setFThickness} options={filters?.thicknesses} />
                      <SelectFilter label="Rack" value={fRack} onChange={setFRack} options={filters?.racks} />
                      <SelectFilter label="Distributor" value={fDistributor} onChange={setFDistributor} options={filters?.distributors} />
                      {activeFilterCount > 0 ? (
                        <button type="button" className="btn secondary btn-sm" onClick={resetFilters}>Clear all</button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Flat page header — normal mode only */}
            {!presentationMode ? (
              <section className="page-header" aria-labelledby="si-page-title">
                <div className="page-header-inner">
                  <div className="page-header-text">
                    <p className="page-eyebrow">Slab inventory · read-only</p>
                    <h1 id="si-page-title" className="page-title">Slab inventory</h1>
                    <p className="page-subtitle">
                      Browse synced SlabCloud/Slabsmith slab inventory in a read-only eliteOS view.{" "}
                      <span className="page-subtitle-note">
                        SlabCloud/Slabsmith is the source of truth; slabOS displays the latest cached sync.
                      </span>
                    </p>
                  </div>
                  <div className="page-metrics" aria-label="Inventory summary">
                    <Metric
                      value={summary ? (summary.active_cached_slab_count ?? summary.total_active_slabs).toLocaleString() : "—"}
                      label="Active cached slabs"
                      hint="Count of slab rows in the slabOS cache (never summed from color counts)"
                    />
                    <Metric value={summary ? summary.distinct_colors.toLocaleString() : "—"} label="Colors" hint="Distinct color names" />
                    <Metric value={summary ? summary.distinct_materials.toLocaleString() : "—"} label="Materials" hint="Distinct material names" />
                    <Metric value={summary ? summary.slabs_with_verified_images.toLocaleString() : "—"} label="Verified photos" hint="Images confirmed OK by URL check" />
                  </div>
                </div>
              </section>
            ) : null}

            {err ? <div className="banner banner-error" role="alert">{err}</div> : null}
            {notInstalled ? (
              <div className="banner banner-warn" role="status">
                The slab inventory cache tables are not available yet. Run the SlabCloud cache sync, then reload.
              </div>
            ) : null}

            <div className={`gallery-content${presentationMode ? " is-presentation" : ""}`}>

              {/* Search + filter controls — hidden in presentation mode */}
              {!presentationMode ? (
                <section className="search-section" aria-label="Filters">
                  <div className="search-row">
                    <div className="search-input-wrap">
                      {searchIcon}
                      <input
                        type="search"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Search color, material, inventory ID, rack, lot…"
                        aria-label="Search slabs"
                      />
                    </div>
                    <div className="search-actions">
                      <label className="sort-control">
                        <span>Sort</span>
                        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                          <option value="color">Color</option>
                          <option value="material">Material</option>
                          <option value="inventory_id">ID</option>
                          <option value="rack">Rack</option>
                          <option value="updated_at">Updated</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        className="icon-btn"
                        title={direction === "asc" ? "Sort ascending" : "Sort descending"}
                        aria-label={direction === "asc" ? "Sort ascending" : "Sort descending"}
                        onClick={() => setDirection((d) => (d === "asc" ? "desc" : "asc"))}
                      >
                        {direction === "asc" ? "↑" : "↓"}
                      </button>
                      <div className="view-toggle" role="group" aria-label="View mode">
                        <button type="button" className={viewMode === "grid" ? "on" : ""} onClick={() => setViewMode("grid")} aria-pressed={viewMode === "grid"}>Grid</button>
                        <button type="button" className={viewMode === "table" ? "on" : ""} onClick={() => setViewMode("table")} aria-pressed={viewMode === "table"}>List</button>
                      </div>
                      <button
                        type="button"
                        className={`filters-btn${filterDrawerOpen ? " open" : ""}${activeFilterCount > 0 ? " has-filters" : ""}`}
                        onClick={() => setFilterDrawerOpen((o) => !o)}
                        aria-expanded={filterDrawerOpen}
                        aria-controls="filter-drawer"
                      >
                        Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                      </button>
                      <button
                        type="button"
                        className="btn secondary btn-sm present-btn"
                        onClick={() => setPresentationMode(true)}
                        title="Hide operational chrome and focus on slabs"
                      >
                        Presentation
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
                      {activeFilterCount > 0 ? (
                        <button type="button" className="btn secondary btn-sm" onClick={resetFilters}>Clear all</button>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}

              {/* Trust / sync banner — replaces right sidebar */}
              {!presentationMode && summary ? (
                notSeenCount > 0 ? (
                  <div className="trust-banner trust-banner-warn" role="alert">
                    <div className="trust-banner-content">
                      <span className="trust-banner-dot warn" aria-hidden />
                      <span>
                        <strong>{notSeenCount}</strong>{" "}
                        {notSeenCount === 1 ? "slab needs" : "slabs need"} review
                        — active cached slabs not seen in latest sync.
                      </span>
                      <button
                        type="button"
                        className="trust-banner-btn"
                        onClick={() => setReviewOpen((o) => !o)}
                        aria-expanded={reviewOpen}
                      >
                        {reviewOpen ? "Hide" : "Review"}
                      </button>
                    </div>
                    {reviewOpen && summary.active_not_seen_in_latest_sync_sample?.length ? (
                      <ul className="trust-banner-sample">
                        {summary.active_not_seen_in_latest_sync_sample.map((row) => (
                          <li key={row.id ?? row.inventory_id}>
                            <span className="not-seen-color">{row.color_name || "—"}</span>
                            {" · "}
                            <span className="not-seen-material">{row.material_name || "—"}</span>
                            {row.inventory_id ? (
                              <> · <code className="not-seen-inv">{row.inventory_id}</code></>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : summary.last_sync ? (
                  <p className="trust-ok-line" role="status">
                    <span className="trust-ok-dot" aria-hidden />
                    Inventory cache up to date
                  </p>
                ) : null
              ) : null}

              {/* Active filter chips */}
              {activeChips.length > 0 ? (
                <div className="active-chips" aria-label="Active filters">
                  {activeChips.map((c) => (
                    <button key={c.key} type="button" className="chip" onClick={c.onClear} title="Remove filter">
                      <span className="chip-label">{c.label}</span>
                      <span className="chip-x" aria-hidden>×</span>
                    </button>
                  ))}
                  {activeChips.length > 1 ? (
                    <button type="button" className="chip chip-clear" onClick={resetFilters}>Clear all</button>
                  ) : null}
                </div>
              ) : null}

              {/* Result meta + inventory health toggle */}
              <div className="result-meta">
                <span>{busy ? "Loading…" : `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${total.toLocaleString()}`}</span>
                <span className="result-meta-right">
                  {!presentationMode && summary?.last_sync ? (
                    <button
                      type="button"
                      className="health-toggle-btn"
                      onClick={() => setHealthOpen((o) => !o)}
                      aria-expanded={healthOpen}
                    >
                      Inventory health {healthOpen ? "▴" : "▾"}
                    </button>
                  ) : null}
                  <span className="result-meta-pages">
                    <button type="button" className="page-btn" disabled={page <= 0 || busy} onClick={() => setPage((p) => Math.max(0, p - 1))}>Prev</button>
                    <span className="page-indicator">Page {page + 1} / {maxPage + 1}</span>
                    <button type="button" className="page-btn" disabled={page >= maxPage || busy} onClick={() => setPage((p) => Math.min(maxPage, p + 1))}>Next</button>
                  </span>
                </span>
              </div>

              {/* Inventory health panel — collapsible, replaces sidebar sync card */}
              {healthOpen && summary?.last_sync && !presentationMode ? (
                <div className="health-panel" role="region" aria-label="Inventory health">
                  <div className="health-panel-inner">
                    <div className="health-row">
                      <span>Status</span>
                      <strong className={`sync-status sync-${summary.last_sync.status}`}>{summary.last_sync.status}</strong>
                    </div>
                    <div className="health-row">
                      <span>Last sync</span>
                      <strong>{fmtDate(summary.last_sync.finished_at || summary.last_sync.started_at)}</strong>
                    </div>
                    <div className="health-row">
                      <span>Latest sync count</span>
                      <strong>
                        {summary.latest_sync_slab_count != null
                          ? `${Number(summary.latest_sync_slab_count).toLocaleString()} slabs seen`
                          : summary.last_sync.slab_upserted_count != null
                            ? `${Number(summary.last_sync.slab_upserted_count).toLocaleString()} slabs seen`
                            : "—"}
                      </strong>
                    </div>
                    <div className="health-row">
                      <span>Active cache</span>
                      <strong>{(summary.active_cached_slab_count ?? summary.total_active_slabs).toLocaleString()} slabs</strong>
                    </div>
                    {notSeenCount > 0 ? (
                      <div className="health-row">
                        <span>Needs review</span>
                        <strong className="count-warn">{notSeenCount} not seen in latest sync</strong>
                      </div>
                    ) : null}
                    <div className="health-row">
                      <span>Warnings</span>
                      <strong>{summary.last_sync.warning_count}</strong>
                    </div>
                  </div>
                  {summary.slabs_by_price_group?.length ? (
                    <div className="health-pg">
                      <p className="health-pg-label">By source price group · imported from SlabCloud</p>
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

              {/* Slab gallery / table / empty / skeleton */}
              {busy && slabs.length === 0 ? (
                <div className="slab-grid">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <SkeletonCard key={i} />
                  ))}
                </div>
              ) : slabs.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-art" aria-hidden>
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="14" rx="2" />
                      <path d="M3 14l4.5-4.5 4 4 3-3L21 14" />
                      <circle cx="8.5" cy="8.5" r="1.3" />
                    </svg>
                  </div>
                  <p className="empty-title">No slabs match these criteria.</p>
                  <p className="empty-sub">Try removing a filter or broaden your search.</p>
                  <div className="empty-actions">
                    {activeFilterCount > 0 ? (
                      <button type="button" className="btn secondary btn-sm" onClick={resetFilters}>Clear filters</button>
                    ) : null}
                    {fMaterial ? (
                      <button type="button" className="btn secondary btn-sm" onClick={() => setFMaterial("")}>Show all materials</button>
                    ) : null}
                  </div>
                </div>
              ) : viewMode === "grid" || presentationMode ? (
                <div className="slab-grid">
                  {slabs.map((s, i) => (
                    <SlabCard key={s.id} slab={s} onOpen={() => openSlab(i)} />
                  ))}
                </div>
              ) : (
                <div className="slab-table-wrap">
                  <table className="slab-table">
                    <thead>
                      <tr>
                        <th>Color</th>
                        <th>Material</th>
                        <th>Dimensions</th>
                        <th>ID</th>
                        <th>Rack</th>
                        <th title="Source price group — imported from SlabCloud">Source PG</th>
                        <th title="Photo verified by URL check">Photo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slabs.map((s, i) => (
                        <tr
                          key={s.id}
                          onClick={() => openSlab(i)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openSlab(i); } }}
                          className="slab-row"
                          tabIndex={0}
                          role="button"
                          aria-label={`View details: ${s.color_name ?? "Unnamed"} · ${s.material_name ?? ""}`}
                        >
                          <td className="cell-strong">{s.color_name || "—"}</td>
                          <td>{s.material_name || "—"}</td>
                          <td>{dimsLabel(s)}</td>
                          <td>{s.inventory_id ? <code>ID {s.inventory_id}</code> : "—"}</td>
                          <td>{s.rack || "—"}</td>
                          <td>{s.source_price_group ? <span className="pg-badge" title="Imported from SlabCloud">{s.source_price_group}</span> : "—"}</td>
                          <td>{s.image_status === "ok" ? <span className="img-ok" aria-label="Verified">✓</span> : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}
      </main>

      {selectedSlab ? (
        <SlabLightbox
          slab={selectedSlab}
          index={selectedIndex ?? 0}
          count={slabs.length}
          onClose={closeSlab}
          onPrev={() => stepSlab(-1)}
          onNext={() => stepSlab(1)}
        />
      ) : null}

      <footer className="footer-bar" role="contentinfo">
        <span>eliteOS · Slab Inventory</span>
        <span className="footer-meta">
          Read-only · {config.backendBaseUrl} · SlabCloud/Slabsmith is the source of truth
        </span>
      </footer>
    </div>
  );
}

/* --------------------------------------------------------- subcomponents */

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

function SelectFilter({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options?: string[];
}) {
  return (
    <label className="select-filter">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} data-active={value ? "1" : "0"}>
        <option value="">{label}: all</option>
        {(options ?? []).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function SlabThumb({ slab, className }: { slab: Slab; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = slab.thumbnail_url || slab.image_url;
  const showImage = Boolean(src) && slab.image_status !== "missing" && !failed;
  if (showImage && src) {
    return (
      <img
        className={className}
        src={src}
        alt={`${slab.color_name ?? "Slab"} ${slab.material_name ?? ""}`.trim()}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className={`slab-fallback ${className ?? ""}`} aria-hidden>
      <span>{colorInitials(slab.color_name)}</span>
    </div>
  );
}

function SlabCard({ slab, onOpen }: { slab: Slab; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="slab-card"
      onClick={onOpen}
      aria-label={`View details: ${slab.color_name ?? "Unnamed"} · ${slab.material_name ?? ""}`}
    >
      <div className="slab-card-media">
        <SlabThumb slab={slab} className="slab-card-img" />
        {slab.source_price_group ? (
          <span className="slab-card-pg pg-badge" title="Source price group — imported from SlabCloud">
            {slab.source_price_group}
          </span>
        ) : null}
        {slab.image_status === "ok" ? (
          <span className="slab-card-verified" role="img" aria-label="Photo verified" />
        ) : null}
        <span className="slab-card-overlay" aria-hidden>
          <span className="slab-card-overlay-hint">View details ›</span>
        </span>
      </div>
      <div className="slab-card-body">
        <p className="slab-card-color">{slab.color_name || "Unnamed"}</p>
        <p className="slab-card-material">{slab.material_name || "—"}</p>
        <div className="slab-card-meta">
          <span>{dimsLabel(slab)}</span>
          {slab.rack ? (
            <><span className="slab-card-dot" aria-hidden>·</span><span>Rack {slab.rack}</span></>
          ) : null}
        </div>
        {slab.inventory_id ? (
          <p className="slab-card-inv">ID {slab.inventory_id}</p>
        ) : slab.external_slab_id ? (
          <p className="slab-card-inv slab-card-inv-ext">{slab.external_slab_id.slice(0, 8)}…</p>
        ) : null}
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

function SlabLightbox({
  slab,
  index,
  count,
  onClose,
  onPrev,
  onNext
}: {
  slab: Slab;
  index: number;
  count: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(String(slab.external_slab_id ?? ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="lightbox-overlay" role="dialog" aria-modal="true" aria-label={`${slab.color_name ?? "Slab"} detail`} onClick={onClose}>
      <div className="lightbox" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lightbox-close" onClick={onClose} aria-label="Close">×</button>

        <div className="lightbox-media">
          <SlabThumb slab={slab} className="lightbox-img" />
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
                <span className="lightbox-pg-label">{slab.source_price_group_label || "Source price group"} · imported from SlabCloud</span>
              </p>
            ) : null}
          </header>

          <div className="detail-block">
            <DetailRow label="Dimensions" value={dimsLabel(slab)} />
            <DetailRow label="Thickness" value={slab.thickness_nominal} />
            <DetailRow label="Distributor" value={slab.distributor} />
            <DetailRow label="Rack" value={slab.rack} />
            <DetailRow label="Lot" value={slab.lot} />
            <DetailRow label="Inventory ID" value={slab.inventory_id} mono />
            <DetailRow label="Image status" value={<span className={`img-status img-${slab.image_status}`}>{slab.image_status}</span>} />
            <DetailRow label="Active" value={slab.is_active ? "Yes" : "No"} />
          </div>

          <details className="tech-details">
            <summary>Technical details</summary>
            <DetailRow label="External slab ID" value={
              <span className="copy-line">
                <code>{slab.external_slab_id || "—"}</code>
                {slab.external_slab_id ? (
                  <button type="button" className="copy-btn" onClick={() => void copyId()}>{copied ? "Copied" : "Copy"}</button>
                ) : null}
              </span>
            } />
            <DetailRow label="Last sync run" value={slab.last_seen_sync_run_id} mono />
            <DetailRow label="Updated" value={fmtDate(slab.updated_at)} />
            {slab.image_url ? (
              <DetailRow label="Image URL" value={<a href={slab.image_url} target="_blank" rel="noreferrer noopener" className="img-link">open</a>} />
            ) : null}
          </details>

          <p className="lightbox-foot">Read-only · source price group is imported from SlabCloud and is not slabOS pricing authority.</p>
        </div>
      </div>
    </div>
  );
}
