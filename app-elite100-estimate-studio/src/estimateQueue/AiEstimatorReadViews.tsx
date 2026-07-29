/**
 * Display-only AI estimator verification surfaces.
 * Consume server-derived aiEstimatorSummary — never mutate Scope or price.
 */
import React, { useState } from "react";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v: unknown): string {
  if (v == null || v === "") return "—";
  return `$${num(v).toFixed(2)}`;
}

function dim(lengthIn: number | null | undefined, depthIn: number | null | undefined): string {
  if (lengthIn == null && depthIn == null) return "—";
  return `${num(lengthIn).toFixed(1)} × ${num(depthIn).toFixed(1)}`;
}

export type OpeningsByType = {
  kitchenSink?: number;
  vanityBarSink?: number;
  cooktop?: number;
  outlet?: number;
  total?: number;
};

export type VerifiedRoom = {
  id?: string | null;
  name: string;
  countertopSf: number;
  backsplashSf: number;
  exposedEdgeLf: number;
  openingsByType?: OpeningsByType;
  pieces: Array<{
    id?: string | null;
    name: string;
    type?: string;
    lengthIn?: number | null;
    depthIn?: number | null;
    quantity?: number;
    squareFeet?: number;
    included?: boolean;
  }>;
};

export type PriceGroup = { key: string; label: string; amount: number };

export type ComparisonItem = {
  kind: string;
  label: string;
  from: string | number | null;
  to: string | number | null;
};

export function VerifiedMeasurementTotals(props: {
  countertopSf: number;
  backsplashSf: number;
  exposedEdgeLf: number;
  openingsByType: OpeningsByType;
  startingTotal?: number | null;
  revision?: number | null;
}) {
  const o = props.openingsByType || {};
  return (
    <section
      className="eq-ai-verified-totals"
      data-testid="eq-ai-verified-measurement-totals"
      aria-label="Verified totals"
    >
      <h3 className="eq-ai-section-title">Verified totals</h3>
      <dl className="eq-summary-dl eq-summary-dl--grid">
        <div>
          <dt>Total countertop SF</dt>
          <dd data-testid="eq-ai-verified-sf">{num(props.countertopSf).toFixed(2)} SF</dd>
        </div>
        <div>
          <dt>Total backsplash SF</dt>
          <dd data-testid="eq-ai-verified-backsplash-sf">
            {num(props.backsplashSf).toFixed(2)} SF
          </dd>
        </div>
        <div>
          <dt>Total exposed-edge LF</dt>
          <dd data-testid="eq-ai-verified-edge-lf">{num(props.exposedEdgeLf).toFixed(2)} LF</dd>
        </div>
        <div>
          <dt>Kitchen sink openings</dt>
          <dd data-testid="eq-ai-openings-kitchen-sink">{num(o.kitchenSink)}</dd>
        </div>
        <div>
          <dt>Vanity/bar sink openings</dt>
          <dd data-testid="eq-ai-openings-vanity-bar">{num(o.vanityBarSink)}</dd>
        </div>
        <div>
          <dt>Cooktop openings</dt>
          <dd data-testid="eq-ai-openings-cooktop">{num(o.cooktop)}</dd>
        </div>
        <div>
          <dt>Outlet openings</dt>
          <dd data-testid="eq-ai-openings-outlet">{num(o.outlet)}</dd>
        </div>
        <div>
          <dt>Starting estimate total</dt>
          <dd data-testid="eq-ai-starting-total">{money(props.startingTotal)}</dd>
        </div>
        {props.revision != null ? (
          <div>
            <dt>Estimate revision</dt>
            <dd data-testid="eq-ai-estimate-revision">R{props.revision}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function RoomOpeningsLines({ openings }: { openings?: OpeningsByType }) {
  if (!openings) return null;
  const rows: Array<[string, number]> = [
    ["Kitchen sink openings", num(openings.kitchenSink)],
    ["Vanity/bar sink openings", num(openings.vanityBarSink)],
    ["Cooktop openings", num(openings.cooktop)],
    ["Outlet openings", num(openings.outlet)]
  ].filter(([, n]) => n > 0) as Array<[string, number]>;
  if (!rows.length) return null;
  return (
    <ul className="eq-ai-room-openings" data-testid="eq-ai-room-openings">
      {rows.map(([label, n]) => (
        <li key={label}>
          <span>{label}</span>
          <span>{n}</span>
        </li>
      ))}
    </ul>
  );
}

export function VerifiedRoomScope(props: {
  rooms: VerifiedRoom[];
  defaultExpanded?: boolean;
  compact?: boolean;
}) {
  const [openIds, setOpenIds] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const r of props.rooms || []) {
      const key = r.id || r.name;
      init[key] = props.defaultExpanded !== false && !props.compact;
    }
    return init;
  });

  if (!props.rooms?.length) {
    return (
      <p className="eq-muted" data-testid="eq-ai-verified-room-scope-empty">
        No included rooms in verified scope.
      </p>
    );
  }

  return (
    <section
      className="eq-ai-verified-rooms"
      data-testid="eq-ai-verified-room-scope"
      aria-label="Room-by-room verified scope"
    >
      <h3 className="eq-ai-section-title">
        {props.compact ? "Verified scope summary" : "Room-by-room verified scope"}
      </h3>
      <ul className="eq-ai-room-list">
        {props.rooms.map((room) => {
          const key = room.id || room.name;
          const expanded = Boolean(openIds[key]);
          return (
            <li key={key} className="eq-ai-room-card" data-testid="eq-ai-room-card">
              <button
                type="button"
                className="eq-ai-room-card__header"
                aria-expanded={expanded}
                data-testid="eq-ai-room-toggle"
                onClick={() => setOpenIds((prev) => ({ ...prev, [key]: !prev[key] }))}
              >
                <span className="eq-ai-room-card__name">{room.name}</span>
                <span className="eq-ai-room-card__totals">
                  {num(room.countertopSf).toFixed(2)} SF · BS {num(room.backsplashSf).toFixed(2)} SF ·
                  Edge {num(room.exposedEdgeLf).toFixed(2)} LF
                </span>
              </button>
              {expanded ? (
                <div className="eq-ai-room-card__body">
                  <table className="eq-ai-piece-table" data-testid="eq-ai-piece-table">
                    <thead>
                      <tr>
                        <th>Piece</th>
                        <th>Type</th>
                        <th>L × D</th>
                        <th>Qty</th>
                        <th>SF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {room.pieces.map((p, i) => (
                        <tr key={p.id || `${p.name}-${i}`}>
                          <td>{p.name}</td>
                          <td>{p.type || "—"}</td>
                          <td>{dim(p.lengthIn, p.depthIn)}</td>
                          <td>{num(p.quantity) || 1}</td>
                          <td>{num(p.squareFeet).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <dl className="eq-ai-room-metrics">
                    <div>
                      <dt>Countertop SF</dt>
                      <dd>{num(room.countertopSf).toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>Backsplash SF</dt>
                      <dd>{num(room.backsplashSf).toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>Exposed edge LF</dt>
                      <dd>{num(room.exposedEdgeLf).toFixed(2)}</dd>
                    </div>
                  </dl>
                  <RoomOpeningsLines openings={room.openingsByType} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function StartingPriceBreakdown(props: {
  groups: PriceGroup[];
  startingTotal?: number | null;
}) {
  return (
    <section
      className="eq-ai-price-breakdown"
      data-testid="eq-ai-starting-price-breakdown"
      aria-label="Starting price breakdown"
    >
      <h3 className="eq-ai-section-title">Starting price breakdown</h3>
      {props.groups?.length ? (
        <ul className="eq-ai-price-groups">
          {props.groups.map((g) => (
            <li key={g.key || g.label}>
              <span>{g.label}</span>
              <span>{money(g.amount)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="eq-muted">No customer-safe line groups available yet.</p>
      )}
      <div className="eq-ai-price-total" data-testid="eq-ai-price-breakdown-total">
        <span>Starting total</span>
        <strong>{money(props.startingTotal)}</strong>
      </div>
    </section>
  );
}

export function PublicationActivitySummary(props: {
  publishedRevision?: number | null;
  publishedAt?: string | null;
  pricingValidThrough?: string | null;
  startingTotal?: number | null;
  customerActivityLabel?: string | null;
  customerActivityState?: string | null;
  lastCustomerActivityAt?: string | null;
  customerConfiguredTotal?: number | null;
  customerDifference?: number | null;
  reviewRequested?: boolean;
  currentPublishedRevision?: number | null;
  hasNewerApprovedRevision?: boolean;
  newerApprovedRevision?: number | null;
}) {
  const activity =
    props.customerActivityLabel ||
    (props.customerActivityState === "waiting" || props.customerActivityState === "none"
      ? "Not opened"
      : props.customerActivityState) ||
    "—";
  return (
    <section
      className="eq-ai-publication-activity"
      data-testid="eq-ai-publication-activity-summary"
      aria-label="Publication summary"
    >
      <h3 className="eq-ai-section-title">Publication summary</h3>
      <dl className="eq-summary-dl eq-summary-dl--grid">
        <div>
          <dt>Published revision</dt>
          <dd data-testid="eq-ai-pub-revision">
            {props.publishedRevision != null ? `R${props.publishedRevision}` : "—"}
          </dd>
        </div>
        <div>
          <dt>Published starting total</dt>
          <dd>{money(props.startingTotal)}</dd>
        </div>
        <div>
          <dt>Published</dt>
          <dd data-testid="eq-ai-pub-at">
            {props.publishedAt ? new Date(props.publishedAt).toLocaleString() : "—"}
          </dd>
        </div>
        {props.pricingValidThrough ? (
          <div>
            <dt>Pricing valid through</dt>
            <dd>{new Date(props.pricingValidThrough).toLocaleDateString()}</dd>
          </div>
        ) : null}
        <div>
          <dt>Customer link status</dt>
          <dd data-testid="eq-ai-customer-activity">{activity}</dd>
        </div>
        {props.lastCustomerActivityAt ? (
          <div>
            <dt>Last customer activity</dt>
            <dd>{new Date(props.lastCustomerActivityAt).toLocaleString()}</dd>
          </div>
        ) : null}
        {props.customerConfiguredTotal != null ? (
          <div>
            <dt>Customer configured total</dt>
            <dd>{money(props.customerConfiguredTotal)}</dd>
          </div>
        ) : null}
        {props.customerDifference != null ? (
          <div>
            <dt>Difference from published</dt>
            <dd>
              {props.customerDifference >= 0 ? "+" : ""}
              {money(props.customerDifference)}
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="eq-ai-revision-status" data-testid="eq-ai-revision-status">
        <p>
          Current published revision:{" "}
          <strong>
            {props.currentPublishedRevision != null
              ? `R${props.currentPublishedRevision}`
              : "—"}
          </strong>
        </p>
        {props.hasNewerApprovedRevision ? (
          <p data-testid="eq-ai-newer-approved">
            Approved revision R{props.newerApprovedRevision} is ready to publish
          </p>
        ) : (
          <p data-testid="eq-ai-no-newer-revision">No newer measurement revision</p>
        )}
      </div>
    </section>
  );
}

export function MeasurementRevisionComparison(props: {
  comparison: {
    baseRevision?: number | null;
    draftRevision?: number | null;
    changedItems?: ComparisonItem[];
    previousTotal?: number | null;
    revisedTotal?: number | null;
    difference?: number | null;
    previousCountertopSf?: number | null;
    revisedCountertopSf?: number | null;
    pricingStale?: boolean;
  } | null;
  dirtyLocal?: boolean;
}) {
  const c = props.comparison;
  if (!c) {
    return (
      <aside className="eq-ai-revision-compare" data-testid="eq-ai-revision-comparison">
        <h3 className="eq-ai-section-title">Changes from prior revision</h3>
        <p className="eq-muted">No prior published revision loaded for comparison.</p>
      </aside>
    );
  }
  const items = Array.isArray(c.changedItems) ? c.changedItems : [];
  return (
    <aside className="eq-ai-revision-compare" data-testid="eq-ai-revision-comparison">
      <h3 className="eq-ai-section-title">
        Changes from R{c.baseRevision ?? "?"}
      </h3>
      {props.dirtyLocal || c.pricingStale ? (
        <p className="eq-ai-pricing-stale" data-testid="eq-ai-pricing-stale" role="status">
          Save Draft to refresh revised pricing.
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="eq-muted">No geometry differences from the prior revision yet.</p>
      ) : (
        <ul className="eq-ai-change-list">
          {items.map((item, i) => (
            <li key={`${item.kind}-${item.label}-${i}`} data-testid="eq-ai-change-item">
              <span className="eq-ai-change-label">{item.label}</span>
              <span className="eq-ai-change-values">
                {item.from == null ? "—" : String(item.from)} →{" "}
                {item.to == null ? "—" : String(item.to)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {c.previousTotal != null && c.revisedTotal != null && !c.pricingStale ? (
        <dl className="eq-ai-price-delta">
          <div>
            <dt>Starting total</dt>
            <dd>
              {money(c.previousTotal)} → {money(c.revisedTotal)}
            </dd>
          </div>
          <div>
            <dt>Difference</dt>
            <dd data-testid="eq-ai-price-difference">
              {num(c.difference) >= 0 ? "+" : ""}
              {money(c.difference)}
            </dd>
          </div>
        </dl>
      ) : null}
    </aside>
  );
}

export function EstimatorWarnings(props: {
  warnings?: Array<{ code?: string | null; message: string }>;
  unresolvedItems?: Array<{ code?: string | null; message: string }>;
  blockers?: Array<{ code?: string | null; message?: string }>;
}) {
  const rows = [
    ...(props.blockers || []).map((b) => b.message || b.code || "Blocker"),
    ...(props.unresolvedItems || []).map((u) => u.message || u.code || "Unresolved"),
    ...(props.warnings || []).map((w) => w.message || w.code || "Warning")
  ].filter(Boolean);
  if (!rows.length) return null;
  return (
    <section
      className="eq-ai-warnings"
      data-testid="eq-ai-estimator-warnings"
      aria-label="Warnings before publication"
    >
      <h3 className="eq-ai-section-title">Warnings</h3>
      <ul className="eq-list eq-list--attention">
        {rows.map((msg, i) => (
          <li key={`${msg}-${i}`}>{msg}</li>
        ))}
      </ul>
    </section>
  );
}
