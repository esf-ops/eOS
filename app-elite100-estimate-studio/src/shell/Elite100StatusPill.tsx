import React from "react";

export type Elite100StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warn"
  | "danger"
  | "accent";

export type Elite100StatusPillProps = {
  label: string;
  tone?: Elite100StatusTone;
  testId?: string;
  title?: string;
};

/** Compact operational status pill — presentation only. */
export default function Elite100StatusPill({
  label,
  tone = "neutral",
  testId,
  title,
}: Elite100StatusPillProps) {
  return (
    <span
      className={`e100-status-pill e100-status-pill--${tone}`}
      data-testid={testId}
      title={title || label}
    >
      {label}
    </span>
  );
}
