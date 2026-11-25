import { useEffect, useState } from "react";

import { apiGet, apiPost, ApiError } from "../lib/api";
import { TileMedia } from "./Tiles";

/** A piece the rep has picked to share with a customer (session draft, not an authority). */
export type PickedPiece = {
  id: string;
  color_name: string | null;
  material_name: string | null;
  source_inventory_type: string | null;
  thickness_nominal: string | null;
  length_in: number | null;
  width_in: number | null;
  inventory_id: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
};

type ShareRow = {
  id: string;
  title: string | null;
  customer_name: string | null;
  piece_count: number;
  state: "active" | "expired" | "revoked";
  created_at: string | null;
  created_by_name: string | null;
  expires_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
};

const EXPIRY = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
];

const PICKS_KEY = "li.picks.v1";

export function loadPicks(): PickedPiece[] {
  try {
    const raw = sessionStorage.getItem(PICKS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((p) => p && typeof p.id === "string") : [];
  } catch {
    return [];
  }
}

export function savePicks(picks: PickedPiece[]) {
  try {
    sessionStorage.setItem(PICKS_KEY, JSON.stringify(picks));
  } catch {
    /* storage full / disabled — picks stay in memory */
  }
}

function fmtIn(n: number | null) {
  return n == null ? "—" : `${Math.round(n * 10) / 10}″`;
}

function dateLabel(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function IconPick({ filled = false }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7">
      <path d="M5 3h10v14l-5-3.5L5 17V3Z" strokeLinejoin="round" />
    </svg>
  );
}

export function PicksTray({ picks, onShare, onClear }: { picks: PickedPiece[]; onShare: () => void; onClear: () => void }) {
  if (!picks.length) return null;
  return (
    <div className="li-tray" role="region" aria-label="Customer picks">
      <div className="li-tray-stack" aria-hidden>
        {picks.slice(0, 4).map((p) => (
          <TileMedia key={p.id} className="li-tray-thumb" sources={[{ url: p.thumbnail_url, kind: "cutout" }, { url: p.image_url, kind: "cutout" }]} />
        ))}
      </div>
      <div className="li-tray-copy">
        <strong>
          {picks.length} pick{picks.length === 1 ? "" : "s"}
        </strong>
        <span>{[...new Set(picks.map((p) => p.color_name).filter(Boolean))].slice(0, 3).join(" · ")}</span>
      </div>
      <button type="button" className="li-tray-clear" onClick={onClear}>
        Clear
      </button>
      <button type="button" className="li-action primary" onClick={onShare}>
        Share with customer
      </button>
    </div>
  );
}

export function ShareDialog({
  picks,
  token,
  onRemove,
  onClose,
}: {
  picks: PickedPiece[];
  token: string;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [days, setDays] = useState(30);
  const [showContact, setShowContact] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [recent, setRecent] = useState<ShareRow[] | null>(null);

  async function loadRecent() {
    try {
      const body = (await apiGet("/api/live-inventory/shares", token)) as { shares?: ShareRow[] };
      setRecent(body.shares || []);
    } catch {
      setRecent([]);
    }
  }

  useEffect(() => {
    void loadRecent();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!picks.length) return;
    setBusy(true);
    setError(null);
    try {
      const body = (await apiPost("/api/live-inventory/shares", token, {
        piece_ids: picks.map((p) => p.id),
        title: title || null,
        customer_name: customerName || null,
        message: message || null,
        expires_in_days: days,
        show_contact: showContact,
      })) as { path?: string };
      setLink(`${window.location.origin}${body.path}`);
      setCopied(false);
      void loadRecent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the link.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function revoke(id: string) {
    try {
      await apiPost(`/api/live-inventory/shares/${id}/revoke`, token);
      void loadRecent();
    } catch {
      /* list refresh shows the real state */
    }
  }

  const subject = `${title || "Stone options"}${customerName ? ` for ${customerName}` : ""}`;

  return (
    <div className="li-measure-backdrop" role="presentation" onClick={onClose}>
      <div className="li-share" role="dialog" aria-modal="true" aria-label="Share picks with a customer" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="li-measure-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <p className="li-kicker">Share with customer</p>
        <h2>{link ? "Link ready" : `${picks.length} piece${picks.length === 1 ? "" : "s"} picked`}</h2>

        {link ? (
          <div className="li-share-done">
            <p className="li-muted">
              Anyone with this link can view these pieces — live from the rack, no login. Sold pieces show as no longer available.
            </p>
            <div className="li-share-link">
              <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Share link" />
              <button type="button" className="li-action primary" onClick={() => void copy()}>
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
            <div className="li-actions">
              <a className="li-action" href={link} target="_blank" rel="noreferrer">
                Preview
              </a>
              <a className="li-action" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${subject}:\n${link}`)}`}>
                Email
              </a>
              <a className="li-action" href={`sms:?&body=${encodeURIComponent(`${subject}: ${link}`)}`}>
                Text
              </a>
              <button type="button" className="li-action" onClick={() => setLink(null)}>
                New link
              </button>
            </div>
          </div>
        ) : (
          <form className="li-share-form" onSubmit={create}>
            <ul className="li-share-picks">
              {picks.map((p) => (
                <li key={p.id}>
                  <TileMedia className="li-share-thumb" sources={[{ url: p.thumbnail_url, kind: "cutout" }, { url: p.image_url, kind: "cutout" }]} />
                  <div>
                    <strong>{p.color_name || "Unnamed"}</strong>
                    <span>
                      {p.source_inventory_type === "Remnant" ? "Remnant" : "Slab"} · {fmtIn(p.length_in)} × {fmtIn(p.width_in)}
                      {p.thickness_nominal ? ` · ${p.thickness_nominal}` : ""}
                    </span>
                  </div>
                  <button type="button" onClick={() => onRemove(p.id)} aria-label={`Remove ${p.color_name || "piece"}`}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="li-share-fields">
              <label>
                <span>Customer</span>
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. The Garcias" maxLength={120} />
              </label>
              <label>
                <span>Title</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Kitchen options" maxLength={120} />
              </label>
              <label className="wide">
                <span>Note</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="A short note to go with the picks"
                  maxLength={1000}
                  rows={3}
                />
              </label>
              <div className="wide li-share-row">
                <div className="li-seg" role="radiogroup" aria-label="Link expires">
                  {EXPIRY.map((o) => (
                    <button
                      key={o.days}
                      type="button"
                      role="radio"
                      aria-checked={days === o.days}
                      className={days === o.days ? "active" : ""}
                      onClick={() => setDays(o.days)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <label className="li-layout-toggle">
                  <input type="checkbox" checked={showContact} onChange={(e) => setShowContact(e.target.checked)} />
                  <span>Show my name &amp; email</span>
                </label>
              </div>
            </div>
            {error ? <p className="li-error">{error}</p> : null}
            <button type="submit" className="li-action primary li-share-submit" disabled={busy || !picks.length}>
              {busy ? "Creating…" : "Create link"}
            </button>
          </form>
        )}

        <section className="li-share-recent" aria-label="Recent links">
          <h3>Recent links</h3>
          {recent == null ? <p className="li-muted">Loading…</p> : null}
          {recent && !recent.length ? <p className="li-muted">No links yet.</p> : null}
          <ul>
            {(recent || []).slice(0, 8).map((s) => (
              <li key={s.id} className={s.state !== "active" ? "inactive" : ""}>
                <div>
                  <strong>{s.title || s.customer_name || "Stone options"}</strong>
                  <span>
                    {s.customer_name && s.title ? `${s.customer_name} · ` : ""}
                    {s.piece_count} piece{s.piece_count === 1 ? "" : "s"} · {dateLabel(s.created_at)}
                    {s.created_by_name ? ` · ${s.created_by_name}` : ""}
                  </span>
                </div>
                <span className={`li-share-state ${s.state}`}>
                  {s.state === "active" ? `${s.view_count} view${s.view_count === 1 ? "" : "s"}` : s.state}
                </span>
                {s.state === "active" ? (
                  <button type="button" onClick={() => void revoke(s.id)}>
                    Revoke
                  </button>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
