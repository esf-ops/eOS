import type { ReactNode } from "react";
import { SYSTEMS } from "../lib/workspaceModel.mjs";

export const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function Unknown({ reason }: { reason?: string | null }) {
  return (
    <span className="ecc-unknown" title={reason ?? "Unknown — source does not provide this value"}>
      Unknown
    </span>
  );
}

export function fmt(value: number | null | undefined, format: string, reason?: string | null) {
  if (value == null) return <Unknown reason={reason} />;
  if (format === "money") return money.format(value);
  if (format === "percent") return `${Math.round(value * 100)}%`;
  if (format === "days") return `${value}d`;
  return value.toLocaleString("en-US");
}

export function text(value: string | null | undefined, reason?: string) {
  return value == null || value === "" ? <Unknown reason={reason} /> : value;
}

export function date(value: string | null | undefined, reason?: string) {
  return value ? new Date(`${String(value).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : <Unknown reason={reason} />;
}

type SystemKey = keyof typeof SYSTEMS | "derived" | null;

/** Small label naming the system that owns a value. */
export function Source({ system }: { system: SystemKey }) {
  if (system === "derived") {
    return (
      <span className="ecc-src ecc-src-derived" title="Computed from source records; not stored or editable">
        Derived
      </span>
    );
  }
  if (!system) {
    return (
      <span className="ecc-src ecc-src-none" title="No source system has been chosen for this field">
        No source yet
      </span>
    );
  }
  const s = SYSTEMS[system];
  return (
    <span className={`ecc-src ecc-src-${system}`} title={s.role}>
      {s.label}
    </span>
  );
}

export function SectionHead({ title, system, children }: { title: string; system?: SystemKey; children?: ReactNode }) {
  return (
    <div className="ecc-card-head">
      <h2>
        {title} {system !== undefined ? <Source system={system} /> : null}
      </h2>
      {children}
    </div>
  );
}

export function Phase2({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ecc-card ecc-phase2" aria-label={`${title} (phase 2)`}>
      <div className="ecc-card-head">
        <h2>
          {title} <Source system="slabos" />
        </h2>
        <span className="ecc-pill ecc-pill-unknown">Phase 2 · not built</span>
      </div>
      <div className="ecc-note">{children}</div>
    </section>
  );
}

export const STAGE_LABEL: Record<string, string> = {
  open: "Quoted",
  sold: "Sold",
  lost: "Lost",
  no_estimate: "No estimate",
};
