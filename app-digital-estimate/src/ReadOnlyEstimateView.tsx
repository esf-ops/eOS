import { formatCurrency, formatDate, type PublicEstimate } from "./publicConfigApi";

type Props = {
  estimate: PublicEstimate;
  compact?: boolean;
};

export function ReadOnlyEstimateView({ estimate, compact = false }: Props) {
  const { totals } = estimate;
  const revision =
    estimate.revisionLabel ||
    (estimate.revisionNumber != null ? `R${estimate.revisionNumber}` : null);

  return (
    <>
      {!compact ? (
        <header className="topbar no-print">
          <div className="topbar__inner">
            <h1 className="topbar__title">{estimate.documentTitle}</h1>
            <button type="button" className="btn-print" onClick={() => window.print()}>
              Print
            </button>
          </div>
        </header>
      ) : null}

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
            <p className="project-line project-line--muted">{estimate.project.projectAddress}</p>
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
    </>
  );
}
