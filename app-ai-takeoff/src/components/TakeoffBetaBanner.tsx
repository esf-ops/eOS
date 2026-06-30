import React from "react";
import { TAKEOFF_BETA_LABEL } from "../lib/takeoffBeta";

export default function TakeoffBetaBanner() {
  return (
    <div className="takeoff-beta-banner" role="note">
      <span className="takeoff-beta-badge">Beta</span>
      <span>{TAKEOFF_BETA_LABEL}</span>
    </div>
  );
}
