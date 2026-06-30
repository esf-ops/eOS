import React from "react";

type Tone = "default" | "info" | "success" | "warn" | "muted";

interface Props {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
  role?: React.AriaRole;
}

export default function EosSectionCard({
  children,
  tone = "default",
  className = "",
  role,
}: Props) {
  const toneClass =
    tone === "info"
      ? " eos-section-card--info"
      : tone === "muted"
        ? " eos-section-card--muted"
        : "";
  return (
    <section className={`eos-section-card${toneClass}${className ? ` ${className}` : ""}`} role={role}>
      {children}
    </section>
  );
}
