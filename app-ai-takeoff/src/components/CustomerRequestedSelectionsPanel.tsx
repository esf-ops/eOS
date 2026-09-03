import React, { useMemo, useState } from "react";

export type RequestedSelectionItem = {
  id: string;
  kind: string;
  status: string;
  mentionStatus?: string;
  customerRawText?: string | null;
  roomHint?: string | null;
  confidence?: string;
  geometryReviewRequired?: boolean;
  resolved?: {
    displayLabel?: string | null;
    materialGroup?: string | null;
    colorName?: string | null;
    addonKey?: string | null;
    edgeProfileToken?: string | null;
    matchConfidence?: string | null;
  } | null;
};

type Props = {
  items: RequestedSelectionItem[];
  readonly?: boolean;
  busyId?: string | null;
  onConfirm?: (id: string) => void;
  onReject?: (id: string) => void;
  onUnresolve?: (id: string) => void;
};

function kindLabel(kind: string) {
  switch (kind) {
    case "material":
      return "Material";
    case "sink":
      return "Sink";
    case "edge":
      return "Edge";
    case "tear_out":
      return "Tear-out";
    case "backsplash":
      return "Backsplash";
    case "waterfall":
      return "Waterfall";
    default:
      return "Request";
  }
}

export default function CustomerRequestedSelectionsPanel(props: Props) {
  const { items, readonly = false, busyId = null, onConfirm, onReject, onUnresolve } = props;
  const [open, setOpen] = useState(false);

  const summary = useMemo(() => {
    const list = Array.isArray(items) ? items : [];
    const resolved = list.filter((i) => i.resolved && i.status !== "rejected").length;
    const needs = list.filter(
      (i) =>
        i.status === "proposed" ||
        i.status === "unresolved" ||
        i.geometryReviewRequired === true
    ).length;
    return { total: list.length, resolved, needs };
  }, [items]);

  if (!summary.total) return null;

  return (
    <section className="ctr-customer-requested" data-testid="ctr-customer-requested">
      <button
        type="button"
        className="ctr-customer-requested__toggle"
        data-testid="ctr-customer-requested-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          Customer requested · {summary.total} item{summary.total === 1 ? "" : "s"} ·{" "}
          {summary.resolved} resolved · {summary.needs} needs review
        </span>
        <span className="ctr-customer-requested__chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </button>
      {open ? (
        <ul className="ctr-customer-requested__list" data-testid="ctr-customer-requested-list">
          {items.map((item) => {
            const busy = busyId === item.id;
            return (
              <li
                key={item.id}
                className="ctr-customer-requested__item"
                data-testid="ctr-customer-requested-item"
                data-kind={item.kind}
                data-status={item.status}
              >
                <div className="ctr-customer-requested__head">
                  <strong>{kindLabel(item.kind)}</strong>
                  {item.roomHint ? <span className="ctr-muted"> · {item.roomHint}</span> : null}
                  <span className={`ctr-customer-requested__status ctr-customer-requested__status--${item.status}`}>
                    {item.status}
                  </span>
                </div>
                <div className="ctr-customer-requested__row">
                  <span className="ctr-muted">Customer:</span> {item.customerRawText || "—"}
                </div>
                <div className="ctr-customer-requested__row">
                  <span className="ctr-muted">Matched:</span>{" "}
                  {item.resolved?.displayLabel ||
                    (item.status === "unresolved" ? "unresolved" : "—")}
                </div>
                {item.geometryReviewRequired ? (
                  <div className="ctr-customer-requested__warn" data-testid="ctr-customer-requested-geometry">
                    Requires geometry review
                  </div>
                ) : null}
                {!readonly ? (
                  <div className="ctr-customer-requested__actions">
                    {item.status !== "confirmed" ? (
                      <button
                        type="button"
                        className="ctr-btn ctr-btn--small"
                        disabled={busy || !item.resolved}
                        data-testid="ctr-customer-requested-confirm"
                        onClick={() => onConfirm?.(item.id)}
                      >
                        Confirm
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="ctr-btn ctr-btn--small ctr-btn--ghost"
                      disabled={busy}
                      data-testid="ctr-customer-requested-reject"
                      onClick={() => onReject?.(item.id)}
                    >
                      Reject
                    </button>
                    {item.status !== "unresolved" ? (
                      <button
                        type="button"
                        className="ctr-btn ctr-btn--small ctr-btn--ghost"
                        disabled={busy}
                        data-testid="ctr-customer-requested-unresolve"
                        onClick={() => onUnresolve?.(item.id)}
                      >
                        Mark unresolved
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
