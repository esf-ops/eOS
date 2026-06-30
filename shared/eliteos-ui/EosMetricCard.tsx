import React from "react";

type Accent = "default" | "success" | "warn";

interface Props {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  accent?: Accent;
}

export default function EosMetricCard({ label, value, unit, sub, accent = "default" }: Props) {
  const accentClass =
    accent === "success"
      ? " eos-metric-card--success"
      : accent === "warn"
        ? " eos-metric-card--warn"
        : "";
  return (
    <div className={`eos-metric-card summary-card${accentClass}`}>
      <div className="eos-metric-card-label summary-card-label">{label}</div>
      <div className="eos-metric-card-value summary-card-value">
        {value}
        {unit ? <span className="eos-metric-card-unit summary-card-unit">{unit}</span> : null}
      </div>
      {sub ? <div className="eos-metric-card-sub summary-card-sub">{sub}</div> : null}
    </div>
  );
}

interface GridProps {
  children: React.ReactNode;
  className?: string;
}

export function EosMetricGrid({ children, className = "" }: GridProps) {
  return <div className={`eos-metric-grid summary-grid${className ? ` ${className}` : ""}`}>{children}</div>;
}
