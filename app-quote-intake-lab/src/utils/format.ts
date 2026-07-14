import {
  caseValueProvenance,
  formatConfidenceWithProvenance,
  formatSfWithProvenance
} from "../classification/provenance.mjs";
import { statusLabel } from "../domain/statuses.mjs";
import type { QuoteIntakeCase, QuoteIntakePriority, QuoteIntakeStatus } from "../domain/types";

type ProvenanceKind =
  | "fixture_simulated"
  | "simulated_classifier"
  | "live_unreviewed"
  | "live_confirmed"
  | "human_corrected"
  | "human_accepted";

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

/** @deprecated Prefer formatSfForCase — asterisk is fixture-only. */
export function formatSf(value: number | null | undefined, kind: ProvenanceKind = "fixture_simulated"): string {
  return formatSfWithProvenance(value, kind);
}

/** @deprecated Prefer formatConfidenceForCase — asterisk is fixture-only. */
export function formatConfidence(
  value: number | null | undefined,
  kind: ProvenanceKind = "fixture_simulated"
): string {
  return formatConfidenceWithProvenance(value, kind);
}

export function formatSfForCase(caseRow: QuoteIntakeCase): string {
  return formatSfWithProvenance(caseRow.proposedSquareFootage, caseValueProvenance(caseRow));
}

export function formatConfidenceForCase(caseRow: QuoteIntakeCase): string {
  return formatConfidenceWithProvenance(caseRow.aiConfidence, caseValueProvenance(caseRow));
}

export function missingFieldLabel(key: string): string {
  const map: Record<string, string> = {
    requested_elite_100_color: "Elite 100 color",
    requested_color_or_price_group: "Requested color or price-group instruction",
    resolved_price_group: "Price group",
    edge_profile: "Edge profile",
    backsplash_scope: "Backsplash scope",
    countertop_measurements: "Countertop measurements",
    sink_cutout_count: "Sink cutout count",
    total_square_footage: "Total square footage",
    total_sf_or_measurements: "Total SF or measurements for takeoff",
    readable_plan_attachment: "Readable plan attachment",
    elite_100_program: "Elite 100 program eligibility",
    customer_account: "Customer / account",
    project_name: "Project name",
    project_address: "Project address",
    sender_contact: "Sender contact information"
  };
  return map[key] ?? key.replace(/_/g, " ");
}

export function caseTitle(c: QuoteIntakeCase): string {
  return `${c.customerAccount} · ${c.projectName}`;
}
