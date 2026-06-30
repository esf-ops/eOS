import React from "react";

type Tone = "warn" | "info" | "success";

interface Props {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
  role?: React.AriaRole;
}

export default function EosAlertBanner({ children, tone = "info", className = "", role = "status" }: Props) {
  return (
    <div className={`eos-alert-banner eos-alert-banner--${tone}${className ? ` ${className}` : ""}`} role={role}>
      {children}
    </div>
  );
}
