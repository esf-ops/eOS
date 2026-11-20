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
import type { EdgeViewerColor } from "./lib/edgeProfiles/EdgeProfilesViewer";

// The 3D viewer (three.js) is loaded only when someone opens it.
const EdgeProfilesViewer = lazy(() =>
  import("./lib/edgeProfiles/EdgeProfilesViewer").then((m) => ({ default: m.EdgeProfilesViewer })),
);

export default function PublicElite100Page() {
  const kiosk = useMemo(() => isKioskOrArreyaMode(), []);
  const dense = useMemo(() => isDenseKiosk(), []);
  useKioskInset(dense);
  useKioskTitle(null, dense);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPublicElite100Showroom>> | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Elite100ShowroomItem | null>(null);
  const [edgeOpen, setEdgeOpen] = useState(false);
  const [edgeColorKey, setEdgeColorKey] = useState<string | null>(null);

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

  const rootClass = ["e100-public-page", kiosk ? "e100-public-kiosk" : "", dense ? "kiosk-dense" : ""].filter(Boolean).join(" ");

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
            {data.groups.map((group) => (
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
          onSeeEdges={() => { setEdgeColorKey(selected.color_key); setEdgeOpen(true); }}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
