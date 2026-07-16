import { useEffect, useState } from "react";

/** Public-safe estimate DTO from GET /api/public-digital-estimate/v1/:token */
interface PublicEstimate {
  documentTitle: string;
  quoteNumber: string | null;
  revisionLabel: string | null;
  revisionNumber: number | null;
  publishedAt: string | null;
  pricingValidThrough: string | null;
  project: {
    customerName: string | null;
    projectName: string | null;
    projectAddress: string | null;
  };
  rooms: Array<{
    name: string | null;
    summaryLines: string[];
    materialLabel: string | null;
    colorLabel: string | null;
  }>;
  lineItems: Array<{
    label: string | null;
    amount: number | null;
  }>;
  totals: {
    estimatedProjectTotal: number | null;
    currency: string;
    rounding: string;
  };
  notes: string[];
  disclosures: {
    version: string | null;
    text: string | null;
  };
}

interface PublicEstimateResponse {
  ok: boolean;
  estimate?: PublicEstimate;
}

const UNAVAILABLE_MESSAGE = "This estimate is unavailable.";

/** Parse token from path /e/:token (intended host: digital.eliteosfab.com). */
export function parseTokenFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/e\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function apiBaseUrl(): string {
  const configured = import.meta.env.VITE_BACKEND_URL?.trim();
  return configured ? configured.replace(/\/$/, "") : "";
}

function buildEstimateUrl(token: string): string {
  const base = apiBaseUrl();
  return `${base}/api/public-digital-estimate/v1/${encodeURIComponent(token)}`;
}

function formatCurrency(amount: number | null, currency: string): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function App() {
  const [estimate, setEstimate] = useState<PublicEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const token = parseTokenFromPath(window.location.pathname);
    if (!token) {
      setUnavailable(true);
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(buildEstimateUrl(token), {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          if (!cancelled) setUnavailable(true);
          return;
        }
        const body = (await res.json()) as PublicEstimateResponse;
        if (!body.ok || !body.estimate) {
          if (!cancelled) setUnavailable(true);
          return;
        }
        if (!cancelled) setEstimate(body.estimate);
      } catch {
        if (!cancelled) setUnavailable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="page">
        <main className="shell" aria-busy="true">
          <p className="status">Loading estimate…</p>
        </main>
      </div>
    );
  }

  if (unavailable || !estimate) {
    return (
      <div className="page">
        <main className="shell shell--narrow">
          <p className="unavailable" role="alert">
            {UNAVAILABLE_MESSAGE}
          </p>
        </main>
      </div>
    );
  }

  const { totals } = estimate;
  const revision =
    estimate.revisionLabel ||
    (estimate.revisionNumber != null ? `R${estimate.revisionNumber}` : null);

  return (
    <div className="page">
      <header className="topbar no-print">
        <div className="topbar__inner">
          <h1 className="topbar__title">{estimate.documentTitle}</h1>
          <button type="button" className="btn-print" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </header>

      <main className="shell">
        <section className="print-header print-only" aria-hidden="true">
          <h1>{estimate.documentTitle}</h1>
          <dl className="print-meta">
            <div>
              <dt>Quote #</dt>
              <dd>{estimate.quoteNumber ?? "—"}</dd>
            </div>
            <div>
              <dt>Revision</dt>
              <dd>{revision ?? "—"}</dd>
            </div>
            <div>
              <dt>Published</dt>
              <dd>{formatDate(estimate.publishedAt)}</dd>
            </div>
            <div>
              <dt>Pricing valid through</dt>
              <dd>{formatDate(estimate.pricingValidThrough)}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{formatCurrency(totals.estimatedProjectTotal, totals.currency)}</dd>
            </div>
          </dl>
        </section>

        <section className="hero">
          <h2 className="hero__title">{estimate.documentTitle}</h2>
          <dl className="meta-grid">
            {estimate.quoteNumber ? (
              <div>
                <dt>Quote #</dt>
                <dd>{estimate.quoteNumber}</dd>
              </div>
            ) : null}
            {revision ? (
              <div>
                <dt>Revision</dt>
                <dd>{revision}</dd>
              </div>
            ) : null}
            {estimate.publishedAt ? (
              <div>
                <dt>Published</dt>
                <dd>{formatDate(estimate.publishedAt)}</dd>
              </div>
            ) : null}
            {estimate.pricingValidThrough ? (
              <div>
                <dt>Pricing valid through</dt>
                <dd>{formatDate(estimate.pricingValidThrough)}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        {(estimate.project.customerName ||
          estimate.project.projectName ||
          estimate.project.projectAddress) && (
          <section className="card">
            <h3 className="card__heading">Project</h3>
            {estimate.project.customerName ? (
              <p className="project-line">{estimate.project.customerName}</p>
            ) : null}
            {estimate.project.projectName ? (
              <p className="project-line">{estimate.project.projectName}</p>
            ) : null}
            {estimate.project.projectAddress ? (
              <p className="project-line project-line--muted">
                {estimate.project.projectAddress}
              </p>
            ) : null}
          </section>
        )}

        {estimate.rooms.length > 0 ? (
          <section className="card">
            <h3 className="card__heading">Rooms</h3>
            <ul className="room-list">
              {estimate.rooms.map((room, i) => (
                <li key={i} className="room">
                  {room.name ? <h4 className="room__name">{room.name}</h4> : null}
                  {room.materialLabel ? (
                    <p className="room__detail">
                      <span className="room__label">Material</span> {room.materialLabel}
                    </p>
                  ) : null}
                  {room.colorLabel ? (
                    <p className="room__detail">
                      <span className="room__label">Color</span> {room.colorLabel}
                    </p>
                  ) : null}
                  {Array.isArray(room.summaryLines) && room.summaryLines.length > 0 ? (
                    <ul className="room__summary">
                      {room.summaryLines.map((line, j) => (
                        <li key={j}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {estimate.lineItems.length > 0 ? (
          <section className="card">
            <h3 className="card__heading">Line items</h3>
            <table className="line-table">
              <thead>
                <tr>
                  <th scope="col">Description</th>
                  <th scope="col" className="line-table__amount">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {estimate.lineItems.map((item, i) => (
                  <tr key={i}>
                    <td>{item.label ?? "—"}</td>
                    <td className="line-table__amount">
                      {formatCurrency(item.amount, totals.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <section className="card card--total">
          <div className="total-row">
            <span className="total-row__label">Estimated project total</span>
            <span className="total-row__value">
              {formatCurrency(totals.estimatedProjectTotal, totals.currency)}
            </span>
          </div>
        </section>

        {estimate.notes.length > 0 ? (
          <section className="card">
            <h3 className="card__heading">Notes</h3>
            <ul className="notes-list">
              {estimate.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {estimate.disclosures.text ? (
          <section className="card card--disclosures">
            <h3 className="card__heading">Disclosures</h3>
            <p className="disclosures">{estimate.disclosures.text}</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}
