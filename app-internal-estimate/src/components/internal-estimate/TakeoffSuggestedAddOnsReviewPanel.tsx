import React from "react";
import type { TakeoffSuggestedAddOnReview, TakeoffSuggestedAddOnReviewStatus } from "../../lib/takeoffImportWorkflow";
import { ADDON_CATALOG } from "@quote-lib/prototypeQuoteMath";

interface Props {
  reviews: TakeoffSuggestedAddOnReview[];
  onChange: (reviews: TakeoffSuggestedAddOnReview[]) => void;
  onAllReviewed?: () => void;
}

const STATUS_OPTIONS: { value: TakeoffSuggestedAddOnReviewStatus; label: string }[] = [
  { value: "accepted", label: "Accepted" },
  { value: "ignored", label: "Ignored" },
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "pending", label: "Pending" },
];

function catalogLabel(id: string | null | undefined) {
  if (!id) return null;
  return ADDON_CATALOG.find((a) => a.id === id)?.label ?? id;
}

export default function TakeoffSuggestedAddOnsReviewPanel({ reviews, onChange, onAllReviewed }: Props) {
  if (!reviews.length) return null;

  const update = (key: string, patch: Partial<TakeoffSuggestedAddOnReview>) => {
    onChange(reviews.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const allDone = reviews.every((r) => r.status !== "pending");

  return (
    <div className="ie-takeoff-addon-review card">
      <div className="ie-takeoff-addon-review-head">
        <h2 className="ie-section-title" style={{ margin: 0 }}>Suggested add-ons / cutouts from takeoff</h2>
        <p className="muted small" style={{ margin: "0.25rem 0 0" }}>
          Cutouts are fabrication add-ons — not material square footage deductions.
        </p>
      </div>
      <ul className="ie-takeoff-addon-review-list">
        {reviews.map((review) => (
          <li key={review.key} className={`ie-takeoff-addon-review-item ie-takeoff-addon-review-item--${review.status}`}>
            <div className="ie-takeoff-addon-review-main">
              <strong>{review.label}</strong>
              <span className="muted small">{review.type.replace(/_/g, " ")}</span>
            </div>
            <label className="ie-takeoff-addon-review-status">
              Review
              <select
                value={review.status}
                onChange={(e) =>
                  update(review.key, { status: e.target.value as TakeoffSuggestedAddOnReviewStatus })
                }
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {review.status === "accepted" && review.mappedAddOnKey ? (
              <p className="muted small ie-takeoff-addon-review-map">
                Maps to add-on: <strong>{catalogLabel(review.mappedAddOnKey)}</strong> — set qty in Add-ons section.
              </p>
            ) : null}
            {review.status === "needs_follow_up" ? (
              <label className="ie-takeoff-addon-review-note">
                Follow-up note
                <input
                  value={review.note ?? ""}
                  onChange={(e) => update(review.key, { note: e.target.value })}
                  placeholder="What still needs confirmation?"
                />
              </label>
            ) : null}
          </li>
        ))}
      </ul>
      {onAllReviewed && !allDone ? (
        <button type="button" className="btn secondary btn-sm" onClick={onAllReviewed}>
          Mark all reviewed (ignored)
        </button>
      ) : null}
    </div>
  );
}
