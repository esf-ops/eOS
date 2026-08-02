/**
 * Studio V2 — Customer Selection Review panel (read-only).
 * Shows saved Digital Estimate selections and scope requests for estimators.
 * Does not apply, approve, publish, or invent priced totals.
 */
import React from "react";

export type SelectionReviewRoom = {
  roomKey?: string | null;
  roomName?: string | null;
  material?: { label?: string | null; group?: string | null } | null;
  edge?: { label?: string | null } | null;
  backsplash?: { label?: string | null } | null;
  sink?: { label?: string | null; source?: string | null } | null;
  faucet?: { label?: string | null; source?: string | null } | null;
  accessories?: Array<{ label?: string | null; quantity?: number }>;
  specialty?: Array<{ label?: string | null; quantity?: number }>;
  notes?: string | null;
};

export type StudioCustomerSelectionReview = {
  hasSavedSelections?: boolean;
  lastSavedAt?: string | null;
  reviewRequested?: boolean;
  pricedSelections?: {
    rooms?: SelectionReviewRoom[];
    selectionChangeCount?: number;
    selectionChangeItems?: Array<{ kind?: string; label?: string }>;
  };
  scopeRequests?: {
    count?: number;
    items?: Array<{ kind?: string; label?: string; requiresEstimatorReview?: boolean }>;
    openings?: Array<{ type?: string | null; quantity?: number; roomId?: string | null }>;
    waterfalls?: Array<{ side?: string | null; note?: string | null }>;
    customerNotes?: Array<{ note?: string | null }>;
    projectNote?: string | null;
    backsplashChangeRequest?: { label?: string | null; note?: string | null } | null;
  };
  totals?: {
    publishedBaselineTotal?: number | null;
    customerEstimateTotal?: number | null;
    difference?: number | null;
  };
  pricingAuthority?: string | null;
  staffDiagnostics?: Array<{ code?: string; message?: string }>;
};

type Props = {
  activity?: {
    viewed?: boolean;
    savedSelections?: boolean;
    reviewRequested?: boolean;
    accepted?: boolean;
    lastSavedAt?: string | null;
  } | null;
  selectionReview?: StudioCustomerSelectionReview | null;
  acceptance?: {
    acceptedAt?: string | null;
    customerDisplayTotal?: number | null;
    publicationId?: string | null;
    acceptedAsPublished?: boolean;
  } | null;
  activePublication?: { publicationId?: string | null } | null;
  historicalCount?: number;
};

function money(v: unknown): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function differenceLabel(diff: number | null | undefined): string {
  if (diff == null || !Number.isFinite(Number(diff))) return "—";
  const n = Number(diff);
  if (Math.abs(n) < 0.005) return "No change";
  const abs = money(Math.abs(n));
  return n > 0 ? `+${abs}` : `−${abs.replace("$", "")}`;
}

function RoomCard({ room }: { room: SelectionReviewRoom }) {
  const lines: Array<{ label: string; value: string }> = [];
  if (room.material?.label) {
    lines.push({
      label: "Material",
      value: room.material.group
        ? `${room.material.label} (${room.material.group})`
        : room.material.label
    });
  }
  if (room.edge?.label) lines.push({ label: "Edge", value: room.edge.label });
  if (room.backsplash?.label) lines.push({ label: "Backsplash", value: room.backsplash.label });
  if (room.sink?.label) lines.push({ label: "Sink", value: room.sink.label });
  if (room.faucet?.label) lines.push({ label: "Faucet", value: room.faucet.label });
  for (const a of room.accessories || []) {
    if (a.label) {
      lines.push({
        label: "Accessory",
        value: Number(a.quantity) > 1 ? `${a.label} ×${a.quantity}` : a.label
      });
    }
  }
  for (const s of room.specialty || []) {
    if (s.label) {
      lines.push({
        label: "Specialty",
        value: Number(s.quantity) > 1 ? `${s.label} ×${s.quantity}` : s.label
      });
    }
  }
  if (room.notes) lines.push({ label: "Room note", value: room.notes });

  if (!lines.length) return null;

  return (
    <div className="studio-v2-selection-room" data-testid="studio-v2-selection-room">
      <h4>{room.roomName || room.roomKey || "Room"}</h4>
      <dl className="studio-v2-dl">
        {lines.map((line, i) => (
          <div key={`${line.label}-${i}`}>
            <dt>{line.label}</dt>
            <dd>{line.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function StudioV2CustomerSelectionReviewPanel(props: Props) {
  const {
    activity,
    selectionReview,
    acceptance,
    activePublication,
    historicalCount = 0
  } = props;

  const review = selectionReview || null;
  const saved = Boolean(activity?.savedSelections || review?.hasSavedSelections);
  const rooms = review?.pricedSelections?.rooms || [];
  const scope = review?.scopeRequests;
  const scopeCount = Number(scope?.count) || 0;
  const diagnostics = Array.isArray(review?.staffDiagnostics) ? review.staffDiagnostics : [];

  return (
    <section className="studio-v2-panel" data-testid="studio-v2-customer-selection-review">
      <div className="studio-v2-panel__head">
        <h2>Customer selection review</h2>
      </div>

      <dl className="studio-v2-dl" data-testid="studio-v2-selection-status">
        <div>
          <dt>Viewed</dt>
          <dd>{activity?.viewed ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt>Saved selections</dt>
          <dd>{saved ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt>Last saved</dt>
          <dd>{formatWhen(activity?.lastSavedAt || review?.lastSavedAt)}</dd>
        </div>
        <div>
          <dt>Review requested</dt>
          <dd>{activity?.reviewRequested || review?.reviewRequested ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt>Accepted</dt>
          <dd data-testid="studio-v2-accepted-flag">
            {activity?.accepted || acceptance ? "Yes" : "No"}
          </dd>
        </div>
        {activity?.accepted || acceptance ? (
          <>
            <div>
              <dt>Accepted total</dt>
              <dd data-testid="studio-v2-accepted-total">
                {money(
                  acceptance?.customerDisplayTotal ??
                    review?.totals?.publishedBaselineTotal ??
                    null
                )}
              </dd>
            </div>
            <div>
              <dt>Accepted at</dt>
              <dd data-testid="studio-v2-accepted-at">
                {formatWhen(acceptance?.acceptedAt || null)}
              </dd>
            </div>
            <div>
              <dt>Accepted publication</dt>
              <dd data-testid="studio-v2-accepted-publication">
                {acceptance?.publicationId ||
                  activePublication?.publicationId ||
                  "—"}
              </dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>Publication</dt>
          <dd>
            {activePublication?.publicationId ? "Active publication present" : "No active publication"}
            {" · "}
            {historicalCount} historical
          </dd>
        </div>
      </dl>

      <div className="studio-v2-selection-totals" data-testid="studio-v2-selection-totals">
        <h3>Customer estimate</h3>
        {!saved ? (
          <p className="muted">No customer selections saved yet.</p>
        ) : (
          <dl className="studio-v2-dl">
            <div>
              <dt>Published estimate</dt>
              <dd>{money(review?.totals?.publishedBaselineTotal)}</dd>
            </div>
            <div>
              <dt>Customer estimate</dt>
              <dd>{money(review?.totals?.customerEstimateTotal)}</dd>
            </div>
            <div>
              <dt>Difference</dt>
              <dd>{differenceLabel(review?.totals?.difference)}</dd>
            </div>
          </dl>
        )}
      </div>

      <div
        className="studio-v2-selection-priced"
        data-testid="studio-v2-priced-selections"
      >
        <h3>Priced customer selections</h3>
        <p className="muted studio-v2-selection-hint">
          Material, edge, backsplash, and product choices the customer saved. These are not
          physical scope-change requests.
        </p>
        {!saved || rooms.length === 0 ? (
          <p className="muted">No priced selections saved.</p>
        ) : (
          <div className="studio-v2-selection-rooms">
            {rooms.map((room, idx) => (
              <RoomCard key={room.roomKey || room.roomName || `room-${idx}`} room={room} />
            ))}
          </div>
        )}
      </div>

      <div className="studio-v2-selection-scope" data-testid="studio-v2-scope-requests">
        <h3>Scope requests requiring review</h3>
        <p className="muted studio-v2-selection-hint">
          Additional openings, waterfalls, project notes, and other physical scope requests.
        </p>
        {scopeCount <= 0 ? (
          <p className="muted">No scope-change requests.</p>
        ) : (
          <ul className="studio-v2-warnings">
            {(scope?.items || []).map((item, i) => (
              <li key={`${item.kind || "scope"}-${i}`}>
                {item.label || "Scope request"}
              </li>
            ))}
            {scope?.projectNote && !(scope.items || []).some((i) => i.kind === "project_note") ? (
              <li>Project note: {scope.projectNote}</li>
            ) : null}
          </ul>
        )}
      </div>

      {diagnostics.length > 0 ? (
        <div
          className="studio-v2-selection-diagnostics"
          data-testid="studio-v2-selection-diagnostics"
        >
          <h3>Staff diagnostics</h3>
          <ul className="studio-v2-warnings">
            {diagnostics.map((d, i) => (
              <li key={`${d.code || "diag"}-${i}`}>{d.message || d.code || "Diagnostic"}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="muted studio-v2-selection-readonly">
        Read-only review. Applying customer selections to the estimate is not available yet.
      </p>
    </section>
  );
}
