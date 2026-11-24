import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { EOS_LOGO_URL } from "@quote-lib/config";
import {
  Elite100ShowroomSection,
  type Elite100ShowroomItem,
} from "./lib/elite100Showroom";
import { fetchPublicElite100Showroom } from "./lib/publicElite100Api";
import { isKioskOrArreyaMode } from "./lib/publicElite100Route";
import { isDenseKiosk, useKioskInset, useKioskTitle } from "./lib/kioskDense";
import { PublicElite100ColorLightbox } from "./lib/PublicElite100ColorLightbox";
import { lookupElite100Texture } from "./lib/elite100TextureAssets";
import { usePhoneLayout } from "./lib/phoneLayout";
import "./lib/elite100Mobile.css";
import type { EdgeViewerColor } from "./lib/edgeProfiles/EdgeProfilesViewer";

// The 3D viewer (three.js) is loaded only when someone opens it.
const EdgeProfilesViewer = lazy(() =>
  import("./lib/edgeProfiles/EdgeProfilesViewer").then((m) => ({ default: m.EdgeProfilesViewer })),
);

export default function PublicElite100Page() {
  const kiosk = useMemo(() => isKioskOrArreyaMode(), []);
  const dense = useMemo(() => isDenseKiosk(), []);
  // Phone layout (browse grid, search, group chips, full-screen color view). Never in the full-screen kiosk (dense) mode.
  const phoneScreen = usePhoneLayout();
  const phone = phoneScreen && !dense;
  useKioskInset(dense);
  useKioskTitle(null, dense);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPublicElite100Showroom>> | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Elite100ShowroomItem | null>(null);
  const [edgeOpen, setEdgeOpen] = useState(false);
  const [edgeColorKey, setEdgeColorKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Elite 100 · Elite Stone Fabrication";

    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", "noindex, nofollow");

    let desc = document.querySelector('meta[name="description"]');
    if (!desc) {
      desc = document.createElement("meta");
      desc.setAttribute("name", "description");
      document.head.appendChild(desc);
    }
    desc.setAttribute(
      "content",
      "Elite Stone Fabrication Elite 100 color collection showroom — premium stone colors by group.",
    );
  }, []);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError(null);
    fetchPublicElite100Showroom()
      .then((payload) => {
        if (!alive) return;
        setData(payload);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => { alive = false; };
  }, []);

  const totalCount = useMemo(
    () => (data?.groups ?? []).reduce((sum, g) => sum + g.items.length, 0),
    [data],
  );

  // Phone search: match color or material name, ignoring case, spaces and punctuation.
  const searching = phone && query.trim().length > 0;
  const visibleGroups = useMemo(() => {
    const groups = data?.groups ?? [];
    if (!searching) return groups;
    const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const q = norm(query);
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => norm(i.color_name).includes(q) || norm(i.display_name).includes(q) || norm(i.material_name).includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [data, query, searching]);
  const visibleItems = useMemo(() => visibleGroups.flatMap((g) => g.items), [visibleGroups]);
  const selectedIndex = selected ? visibleItems.findIndex((i) => i.color_key === selected.color_key) : -1;

  // Highlight the group chip for the section currently under the sticky bar.
  useEffect(() => {
    if (!phone || searching || !data?.collection) return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>(".e100-section"));
    if (sections.length === 0 || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveGroup(entry.target.getAttribute("data-group"));
        }
      },
      { rootMargin: "-130px 0px -65% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [phone, searching, data, visibleGroups]);

  const jumpToGroup = (group: string) => {
    setActiveGroup(group);
    document.getElementById(`e100-group-${group}`)?.closest("section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const edgeColors = useMemo<EdgeViewerColor[]>(
    () => (data?.groups ?? []).flatMap((group) => group.items).map((item) => {
      const name = item.color_name ?? item.display_name ?? item.color_key;
      const tex = lookupElite100Texture(name, item.color_key);
      const textureUrl = tex?.fullUrl
        ?? item.reference_image_url_1024
        ?? item.reference_image_url_600
        ?? item.reference_image_url
        ?? item.visual_asset_url_1024
        ?? item.visual_asset_url_600
        ?? item.visual_asset_url
        ?? null;
      // Every color is listed; one without a photo still appears and shows as plain stone.
      return {
        key: item.color_key,
        name,
        group: item.price_group,
        textureUrl,
        thumbUrl: tex?.thumbUrl ?? item.reference_image_url_600 ?? textureUrl,
      };
    }),
    [data],
  );

  const rootClass = ["e100-public-page", kiosk ? "e100-public-kiosk" : "", dense ? "kiosk-dense" : "", phone ? "e100-mobile" : ""].filter(Boolean).join(" ");

  return (
    <div className={rootClass}>
      <header className="e100-public-header">
        <div className="e100-public-brand">
          {EOS_LOGO_URL ? (
            <img src={EOS_LOGO_URL} alt="" className="e100-public-logo" />
          ) : (
            <span className="e100-public-logo-mark" aria-hidden>ESF</span>
          )}
          <div className="e100-public-brand-text">
            <h1 className="e100-public-title">
              {data?.collection?.display_name ?? "Elite 100 Color Collection"}
            </h1>
            <p className="e100-public-subtitle">
              Premium showroom collection · {totalCount > 0 ? `${totalCount} colors` : "Elite Stone Fabrication"}
            </p>
          </div>
          <button type="button" className="e100-edge-btn" onClick={() => { setEdgeColorKey(null); setEdgeOpen(true); }}>
            Edge profiles
          </button>
        </div>
      </header>

      {phone && data?.collection ? (
        <div className="e100m-bar">
          <label className="e100m-search">
            <span className="e100m-sr">Search colors</span>
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              placeholder={`Search ${totalCount > 0 ? totalCount : "all"} colors`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {!searching ? (
            <nav className="e100m-chips" aria-label="Jump to a price group">
              {data.groups.filter((g) => g.items.length > 0).map((g) => (
                <button
                  key={g.price_group}
                  type="button"
                  className={`e100m-chip${activeGroup === g.price_group ? " on" : ""}`}
                  onClick={() => jumpToGroup(g.price_group)}
                >
                  {g.price_group === "Promo" ? "Promo" : `Group ${g.price_group}`}
                </button>
              ))}
            </nav>
          ) : (
            <p className="e100m-count" aria-live="polite">
              {visibleItems.length === 0 ? "No colors match" : `${visibleItems.length} color${visibleItems.length === 1 ? "" : "s"}`}
            </p>
          )}
        </div>
      ) : null}

      <main className="e100-public-main">
        {busy && !data ? (
          <div className="e100-public-loading" aria-live="polite">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="e100-skeleton-section" aria-hidden />
            ))}
          </div>
        ) : error ? (
          <div className="banner banner-error" role="alert">{error}</div>
        ) : !data?.collection ? (
          <div className="empty-state">
            <p className="empty-title">Elite 100 showroom unavailable</p>
            <p className="empty-sub">{data?.note ?? "No active Elite 100 catalog is configured."}</p>
          </div>
        ) : (
          <div className="e100-public-sections">
            {visibleGroups.map((group) => (
              group.items.length > 0 ? (
                <Elite100ShowroomSection
                  key={group.price_group}
                  group={group}
                  kiosk={kiosk}
                  showInventoryMeta={false}
                  onOpenItem={setSelected}
                />
              ) : null
            ))}
            {searching && visibleItems.length === 0 ? (
              <p className="e100m-empty">Nothing matches “{query.trim()}”. Try part of a color name, like “calacatta”.</p>
            ) : null}
            <button type="button" className="e100-edge-card" onClick={() => { setEdgeColorKey(null); setEdgeOpen(true); }}>
              <span className="e100-edge-card-eyebrow">Explore in 3D</span>
              <span className="e100-edge-card-title">Edge Profiles</span>
              <span className="e100-edge-card-sub">Turn each edge, compare two side by side, and see it in your color.</span>
            </button>
          </div>
        )}
      </main>

      {edgeOpen ? (
        <Suspense fallback={null}>
          <EdgeProfilesViewer colors={edgeColors} initialColorKey={edgeColorKey} onClose={() => setEdgeOpen(false)} />
        </Suspense>
      ) : null}

      <footer className="e100-public-footer">
        <p>Elite Stone Fabrication · Elite 100 showroom · Display only</p>
      </footer>

      {selected ? (
        <PublicElite100ColorLightbox
          item={selected}
          kiosk={kiosk}
          // The color view uses the phone layout on any phone-sized screen, including a phone in landscape inside the kiosk's
          // full-screen (dense) mode, where the kiosk's own floating logo and Home buttons sit over the page's left side.
          mobile={phoneScreen}
          position={phoneScreen && selectedIndex >= 0 ? { index: selectedIndex, total: visibleItems.length } : undefined}
          onPrev={phoneScreen && selectedIndex > 0 ? () => setSelected(visibleItems[selectedIndex - 1] ?? null) : undefined}
          onNext={phoneScreen && selectedIndex >= 0 && selectedIndex < visibleItems.length - 1 ? () => setSelected(visibleItems[selectedIndex + 1] ?? null) : undefined}
          onSeeEdges={() => { setEdgeColorKey(selected.color_key); setEdgeOpen(true); }}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
