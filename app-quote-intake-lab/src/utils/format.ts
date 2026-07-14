import { statusLabel } from "../domain/statuses.mjs";
import type { QuoteIntakeCase, QuoteIntakePriority, QuoteIntakeStatus } from "../domain/types";

export function labelStatus(status: QuoteIntakeStatus | string): string {
  return statusLabel(status);
}

export function labelPriority(priority: QuoteIntakePriority | string): string {
  switch (priority) {
    case "urgent":
      return "Urgent";
    case "high":
      return "High";
    case "low":
      return "Low";
    default:
      return "Normal";
  }
}

export function formatReceived(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function formatSf(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} sf*`;
}

export function formatConfidence(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%*`;
}

export function missingFieldLabel(key: string): string {
  const map: Record<string, string> = {
    requested_elite_100_color: "Elite 100 color",
    resolved_price_group: "Price group",
    edge_profile: "Edge profile",
    backsplash_scope: "Backsplash scope",
    countertop_measurements: "Countertop measurements",
    sink_cutout_count: "Sink cutout count",
    total_square_footage: "Total square footage",
    readable_plan_attachment: "Readable plan attachment",
    elite_100_program: "Elite 100 program eligibility"
  };
  return map[key] ?? key.replace(/_/g, " ");
}

export function caseTitle(c: QuoteIntakeCase): string {
  return `${c.customerAccount} · ${c.projectName}`;
}
