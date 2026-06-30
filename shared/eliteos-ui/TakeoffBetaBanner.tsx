import React from "react";
import { TAKEOFF_BETA_LABEL } from "./takeoffBetaCopy";

interface Props {
  compact?: boolean;
  className?: string;
}

export default function TakeoffBetaBanner({ compact = false, className = "" }: Props) {
  return (
    <div
      className={`eos-beta-banner takeoff-beta-banner ie-takeoff-beta-banner${compact ? " eos-beta-banner--compact" : ""}${className ? ` ${className}` : ""}`}
      role="note"
    >
      <span className="eos-beta-badge takeoff-beta-badge ie-takeoff-beta-badge">Beta</span>
      <span>{TAKEOFF_BETA_LABEL}</span>
    </div>
  );
}
