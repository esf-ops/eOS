import { formatCurrency, formatDate, type PublicEstimate } from "./publicConfigApi";

type Props = {
  estimate: PublicEstimate;
  compact?: boolean;
};

export function ReadOnlyEstimateView({ estimate, compact = false }: Props) {
  const totals = estimate?.totals ?? { estimatedProjectTotal: null, currency: "USD", rounding: "integer_usd" };
  const project = estimate?.project ?? {
    customerName: null,
    projectName: null,
    projectAddress: null
  };
  const rooms = Array.isArray(estimate?.rooms) ? estimate.rooms : [];
  const lineItems = Array.isArray(estimate?.lineItems) ? estimate.lineItems : [];
  const notes = Array.isArray(estimate?.notes) ? estimate.notes : [];
  const disclosures = estimate?.disclosures ?? { version: null, text: null };
  const revision =
    estimate?.revisionLabel ||
    (estimate?.revisionNumber != null ? `R${estimate.revisionNumber}` : null);
  const documentTitle = estimate?.documentTitle || "Digital Estimate";

  return (
    <>
      {!compact ? (
        <header className="topbar no-print">
          <div className="topbar__inner">
            <h1 className="topbar__title">{documentTitle}</h1>
            <button type="button" className="btn-print" onClick={() => window.print()}>
              Print
            </button>
          </div>
        </header>
      ) : null}

      <section className="print-header print-only" aria-hidden="true">
        <h1>{documentTitle}</h1>
        <dl className="print-meta">
          <div>
            <dt>Quote #</dt>
            <dd>{estimate?.quoteNumber ?? "—"}</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd>{revision ?? "—"}</dd>
          </div>
          <div>
            <dt>Published</dt>
            <dd>{formatDate(estimate?.publishedAt)}</dd>
          </div>
          <div>
            <dt>Pricing valid through</dt>
            <dd>{formatDate(estimate?.pricingValidThrough)}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatCurrency(totals.estimatedProjectTotal, totals.currency)}</dd>
          </div>
        </dl>
      </section>

      <section className="hero">
        <h2 className="hero__title">{documentTitle}</h2>
        <dl className="meta-grid">
          {estimate?.quoteNumber ? (
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
          {estimate?.publishedAt ? (
            <div>
              <dt>Published</dt>
              <dd>{formatDate(estimate.publishedAt)}</dd>
            </div>
          ) : null}
          {estimate?.pricingValidThrough ? (
            <div>
              <dt>Pricing valid through</dt>
              <dd>{formatDate(estimate.pricingValidThrough)}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {(project.customerName || project.projectName || project.projectAddress) && (
        <section className="card">
          <h3 className="card__heading">Project</h3>
          {project.customerName ? (
            <p className="project-line">{project.customerName}</p>
          ) : null}
          {project.projectName ? (
            <p className="project-line">{project.projectName}</p>
          ) : null}
          {project.projectAddress ? (
            <p className="project-line project-line--muted">{project.projectAddress}</p>
          ) : null}
        </section>
      )}

      {rooms.length > 0 ? (
        <section className="card">
          <h3 className="card__heading">Rooms</h3>
          <ul className="room-list">
            {rooms.map((room, i) => (
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

      {lineItems.length > 0 ? (
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
              {lineItems.map((item, i) => (
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

      {notes.length > 0 ? (
        <section className="card">
          <h3 className="card__heading">Notes</h3>
          <ul className="notes-list">
            {notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {disclosures.text ? (
        <section className="card card--disclosures">
          <h3 className="card__heading">Disclosures</h3>
          <p className="disclosures">{disclosures.text}</p>
        </section>
      ) : null}
    </>
  );
}
