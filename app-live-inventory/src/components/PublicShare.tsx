import { useEffect, useMemo, useState } from "react";

import { ApiError, publicGet } from "../lib/api";
import { TileMedia, TileSkeleton } from "./Tiles";

type SharePiece = {
  key: string;
  color_name: string | null;
  material_name: string | null;
  type: "slab" | "remnant";
  thickness: string | null;
  length_in: number | null;
  width_in: number | null;
  area_sqft: number | null;
  item_number: string | null;
  available: boolean;
  image_url: string | null;
  thumbnail_url: string | null;
  swatch_url: string | null;
};

type ShareBody = {
  share: {
    title: string | null;
    customer_name: string | null;
    message: string | null;
    organization_name: string | null;
    contact: { name: string | null; email: string | null } | null;
    created_at: string | null;
    expires_at: string | null;
  };
  pieces: SharePiece[];
};

function fmtIn(n: number | null) {
  return n == null ? "—" : `${Math.round(n * 10) / 10}″`;
}

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : null;
}

function sizeLine(p: SharePiece) {
  const parts = [p.type === "remnant" ? "Remnant" : "Slab", `${fmtIn(p.length_in)} × ${fmtIn(p.width_in)}`];
  if (p.area_sqft) parts.push(`${p.area_sqft} ft²`);
  return parts.join(" · ");
}

export default function PublicShare({ token }: { token: string }) {
  const [data, setData] = useState<ShareBody | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "gone" | "error">("loading");
  const [open, setOpen] = useState<SharePiece | null>(null);

  useEffect(() => {
    let cancelled = false;
    publicGet(`/api/public/live-inventory/shares/${encodeURIComponent(token)}`)
      .then((body) => {
        if (cancelled) return;
        setData(body as ShareBody);
        setState("ok");
      })
      .catch((e) => {
        if (cancelled) return;
        setState(e instanceof ApiError && (e.status === 404 || e.status === 410) ? "gone" : "error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const s = data?.share;
    const org = s?.organization_name || "Stone selections";
    document.title = s ? `${s.title || "Stone options"}${s.customer_name ? ` for ${s.customer_name}` : ""} · ${org}` : "Stone selections";
  }, [data]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const available = useMemo(() => (data?.pieces || []).filter((p) => p.available), [data]);
  const gone = useMemo(() => (data?.pieces || []).filter((p) => !p.available), [data]);
  const share = data?.share;
  const org = share?.organization_name || "Your fabricator";

  return (
    <div className="ps-shell">
      <header className="ps-bar">
        <span className="ps-brand">{state === "ok" ? org : "Stone selections"}</span>
        <span className="ps-live">
          <span className="li-live-dot" aria-hidden /> Live from the rack
        </span>
      </header>

      {state === "loading" ? (
        <main className="ps-main">
          <div className="ps-hero">
            <div className="li-shimmer ps-shimmer-title" />
          </div>
          <div className="ps-grid">
            <TileSkeleton count={3} />
          </div>
        </main>
      ) : null}

      {state === "gone" || state === "error" ? (
        <main className="ps-main ps-empty">
          <h1>{state === "gone" ? "This link isn't available anymore" : "We couldn't load these picks"}</h1>
          <p>
            {state === "gone"
              ? "It may have expired or been replaced. Reach out to your fabricator for a fresh link."
              : "Please try again in a moment."}
          </p>
        </main>
      ) : null}

      {state === "ok" && share ? (
        <main className="ps-main">
          <section className="ps-hero">
            <p className="li-kicker">{share.customer_name ? `Picked for ${share.customer_name}` : "Picked for you"}</p>
            <h1>{share.title || "Your stone options"}</h1>
            <p className="ps-sub">
              {available.length} piece{available.length === 1 ? "" : "s"} in stock at {org}
              {fmtDate(share.created_at) ? ` · selected ${fmtDate(share.created_at)}` : ""}
            </p>
            {share.message ? (
              <figure className="ps-note">
                <blockquote>{share.message}</blockquote>
                {share.contact?.name ? <figcaption>— {share.contact.name}</figcaption> : null}
              </figure>
            ) : null}
          </section>

          <section className="ps-grid" aria-label="Picked pieces">
            {available.map((p) => (
              <button key={p.key} type="button" className="ps-card" onClick={() => setOpen(p)}>
                <TileMedia
                  className="ps-media"
                  sources={[
                    { url: p.image_url, kind: "cutout" },
                    { url: p.thumbnail_url, kind: "cutout" },
                    { url: p.swatch_url, kind: "swatch" },
                  ]}
                >
                  <span className="li-chip accent ps-chip">Available</span>
                </TileMedia>
                <div className="ps-card-body">
                  <h2>{p.color_name || "Unnamed"}</h2>
                  <p className="ps-material">
                    {p.material_name || "Stone"}
                    {p.thickness ? ` · ${p.thickness}` : ""}
                  </p>
                  <p className="ps-size">{sizeLine(p)}</p>
                  {p.item_number ? <p className="ps-item">Item #{p.item_number}</p> : null}
                </div>
              </button>
            ))}
          </section>

          {gone.length ? (
            <section className="ps-gone" aria-label="No longer available">
              <h3>No longer available</h3>
              <ul>
                {gone.map((p) => (
                  <li key={p.key}>
                    {p.color_name || "Unnamed"} · {sizeLine(p)}
                    {p.item_number ? ` · #${p.item_number}` : ""}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <footer className="ps-foot">
            {share.contact?.name || share.contact?.email ? (
              <div className="ps-contact">
                <span>Questions or ready to hold one?</span>
                <strong>{share.contact?.name || org}</strong>
                {share.contact?.email ? (
                  <a className="li-action primary" href={`mailto:${share.contact.email}?subject=${encodeURIComponent(share.title || "Stone options")}`}>
                    Email {share.contact?.name?.split(" ")[0] || "us"}
                  </a>
                ) : null}
              </div>
            ) : null}
            <p className="ps-fine">
              Availability updates live as pieces sell. Photos are of the actual pieces; color can vary by screen.
              {fmtDate(share.expires_at) ? ` Link active until ${fmtDate(share.expires_at)}.` : ""}
            </p>
            <p className="ps-powered">Powered by eliteOS</p>
          </footer>
        </main>
      ) : null}

      {open ? (
        <div className="li-measure-backdrop" role="presentation" onClick={() => setOpen(null)}>
          <div className="ps-viewer" role="dialog" aria-modal="true" aria-label={open.color_name || "Piece"} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="li-measure-close" onClick={() => setOpen(null)} aria-label="Close">
              ×
            </button>
            <TileMedia
              className="ps-viewer-media"
              sources={[
                { url: open.image_url, kind: "cutout" },
                { url: open.thumbnail_url, kind: "cutout" },
              ]}
            />
            <div className="ps-viewer-meta">
              <div>
                <p className="li-kicker">{open.material_name || "Stone"}</p>
                <h2>{open.color_name || "Unnamed"}</h2>
              </div>
              <dl>
                <div>
                  <dt>Size</dt>
                  <dd>
                    {fmtIn(open.length_in)} × {fmtIn(open.width_in)}
                  </dd>
                </div>
                <div>
                  <dt>Area</dt>
                  <dd>{open.area_sqft ? `${open.area_sqft} ft²` : "—"}</dd>
                </div>
                <div>
                  <dt>Thickness</dt>
                  <dd>{open.thickness || "—"}</dd>
                </div>
                <div>
                  <dt>Item #</dt>
                  <dd>{open.item_number || "—"}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
