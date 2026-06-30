import React from "react";
import EosStatusPill from "./EosStatusPill";

interface Props {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  status?: React.ReactNode;
  statusTone?: "warn" | "success" | "info" | "neutral";
  actions?: React.ReactNode;
  className?: string;
}

export default function EosPanelHead({
  title,
  subtitle,
  status,
  statusTone = "neutral",
  actions,
  className = "",
}: Props) {
  return (
    <div className={`eos-panel-head eos-takeoff-panel-head${className ? ` ${className}` : ""}`}>
      <div className="eos-panel-head-main">
        {typeof title === "string" ? <h2 className="eos-panel-title">{title}</h2> : title}
        {subtitle ? (
          typeof subtitle === "string" ? <p className="eos-panel-subtitle">{subtitle}</p> : subtitle
        ) : null}
      </div>
      <div className="eos-panel-head-aside">
        {status ? (
          typeof status === "string" ? <EosStatusPill tone={statusTone}>{status}</EosStatusPill> : status
        ) : null}
        {actions}
      </div>
    </div>
  );
}
