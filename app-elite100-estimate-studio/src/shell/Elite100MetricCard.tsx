import React from "react";

export type Elite100MetricCardProps = {
  label: string;
  value: string | number;
  testId?: string;
  emphasize?: boolean;
  empty?: boolean;
  onClick?: () => void;
};

/** Metric tile for command-center summaries — presentation only. */
export default function Elite100MetricCard({
  label,
  value,
  testId,
  emphasize = false,
  empty = false,
  onClick,
}: Elite100MetricCardProps) {
  const className = [
    "e100-metric-card",
    emphasize ? "e100-metric-card--primary" : "e100-metric-card--secondary",
    empty ? "e100-metric-card--zero" : "",
    onClick ? "e100-metric-card--interactive" : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (onClick) {
    return (
      <button type="button" className={className} data-testid={testId} onClick={onClick}>
        <span className="e100-metric-card__value">{value}</span>
        <span className="e100-metric-card__label">{label}</span>
      </button>
    );
  }

  return (
    <div className={className} data-testid={testId} role="listitem">
      <span className="e100-metric-card__value">{value}</span>
      <span className="e100-metric-card__label">{label}</span>
    </div>
  );
}
