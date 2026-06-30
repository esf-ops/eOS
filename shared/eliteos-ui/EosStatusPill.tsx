import React from "react";

type Tone = "warn" | "success" | "info" | "neutral";

interface Props {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}

export default function EosStatusPill({ children, tone = "neutral", className = "" }: Props) {
  return (
    <span className={`eos-status-pill eos-status-pill--${tone}${className ? ` ${className}` : ""}`}>
      {children}
    </span>
  );
}
