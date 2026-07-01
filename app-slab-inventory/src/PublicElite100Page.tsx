import { useEffect, useMemo, useState } from "react";
import { EOS_LOGO_URL } from "@quote-lib/config";
import {
  Elite100ShowroomSection,
  type Elite100ShowroomItem,
} from "./lib/elite100Showroom";
import { fetchPublicElite100Showroom } from "./lib/publicElite100Api";
import { isKioskOrArreyaMode } from "./lib/publicElite100Route";
import { PublicElite100ColorLightbox } from "./lib/PublicElite100ColorLightbox";

export default function PublicElite100Page() {
  const kiosk = useMemo(() => isKioskOrArreyaMode(), []);
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPublicElite100Showroom>> | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Elite100ShowroomItem | null>(null);

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

  const rootClass = ["e100-public-page", kiosk ? "e100-public-kiosk" : ""].filter(Boolean).join(" ");

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
                  onOpenItem={setSelected}
                />
              ) : null
            ))}
          </div>
        )}
      </main>

      <footer className="e100-public-footer">
        <p>Elite Stone Fabrication · Elite 100 showroom · Display only</p>
      </footer>

      {selected ? (
        <PublicElite100ColorLightbox
          item={selected}
          kiosk={kiosk}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
