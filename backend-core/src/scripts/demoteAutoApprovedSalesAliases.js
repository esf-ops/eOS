import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

function repoRootFromHere() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "../../..");
}

function normalizeSpaces(s) {
  return String(s ?? "")
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function requiredEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function supabaseServerClient() {
  const url = requiredEnv("SUPABASE_URL");
  const key = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function looksManuallyApprovedNotes(notes) {
  const n = String(notes ?? "").toLowerCase();
  if (!n) return false;
  return n.includes("mapping admin") || n.includes("manual approval") || n.includes("approved via sales account mapping admin");
}

function isAutoImportLikeAliasRow(r) {
  // Heuristics (conservative):
  // - approved=true
  // - created_by is null (no human)
  // - raw_suggestion exists (came from scripts)
  // - notes do NOT indicate manual approval
  if (r.approved !== true) return false;
  if (r.created_by != null) return false;
  if (r.raw_suggestion == null) return false;
  if (looksManuallyApprovedNotes(r.notes)) return false;
  return true;
}

function isAutoImportLikeAssignmentRow(r) {
  // Conservative: only touch rows that clearly look system-generated:
  // - approved=true and approved_by is null and notes does NOT indicate manual/admin approval
  if (r.approved !== true) return false;
  if (r.approved_by != null) return false;
  if (looksManuallyApprovedNotes(r.notes)) return false;
  // If notes are empty, treat as auto-like; if notes mention Mapping Admin, skip.
  return true;
}

async function main() {
  const repoRoot = repoRootFromHere();
  const debugDir = path.join(repoRoot, "debug/sales/latest");
  await fs.mkdir(debugDir, { recursive: true });

  const writeEnabled = String(process.env.SALES_ALIAS_DEMOTE_WRITE ?? "").trim() === "1";
  const mode = writeEnabled ? "write" : "dry-run";

  const outJsonPath = path.join(
    debugDir,
    writeEnabled ? "sales-auto-approved-demotion-write.json" : "sales-auto-approved-demotion-dry-run.json"
  );
  const outTxtPath = path.join(
    debugDir,
    writeEnabled ? "sales-auto-approved-demotion-write.txt" : "sales-auto-approved-demotion-dry-run.txt"
  );

  const report = {
    generatedAt: new Date().toISOString(),
    mode,
    env: { writeEnabled },
    counts: {
      totalApprovedAliases: 0,
      wouldDemoteAliases: 0,
      demotedAliases: 0,
      skippedManualAliases: 0,
      skippedNonAutoAliases: 0,
      totalApprovedAssignments: 0,
      wouldDemoteAssignments: 0,
      demotedAssignments: 0,
      skippedAssignmentsNotSafe: 0,
      errors: 0
    },
    examples: {
      wouldDemoteAliases: [],
      wouldDemoteAssignments: []
    },
    warnings: []
  };

  // Requires Supabase env even for dry-run (this script is about DB state).
  const supabase = supabaseServerClient();

  // ---- Aliases ----
  const { data: aliasRows, error: aliasErr } = await supabase
    .from("sales_account_aliases")
    .select(
      "id,approved,moraware_account_name,monday_account_name,assigned_salesperson,branch,match_type,confidence,notes,created_by,created_at,updated_at,raw_suggestion"
    )
    .eq("approved", true)
    .order("updated_at", { ascending: false })
    .limit(5000);
  if (aliasErr) throw aliasErr;

  report.counts.totalApprovedAliases = (aliasRows ?? []).length;

  const wouldDemote = [];
  for (const r of aliasRows ?? []) {
    if (looksManuallyApprovedNotes(r.notes) || r.created_by != null) {
      report.counts.skippedManualAliases += 1;
      continue;
    }
    if (!isAutoImportLikeAliasRow(r)) {
      report.counts.skippedNonAutoAliases += 1;
      continue;
    }
    wouldDemote.push(r);
  }

  report.counts.wouldDemoteAliases = wouldDemote.length;
  report.examples.wouldDemoteAliases = wouldDemote.slice(0, 30).map((r) => ({
    id: r.id,
    moraware_account_name: r.moraware_account_name,
    monday_account_name: r.monday_account_name,
    assigned_salesperson: r.assigned_salesperson,
    branch: r.branch,
    match_type: r.match_type,
    confidence: r.confidence
  }));

  if (writeEnabled) {
    for (const r of wouldDemote) {
      const note = normalizeSpaces(r.notes);
      const nextNotes = note
        ? `${note} | Demoted from auto-approved import; requires Mapping Admin review.`
        : "Demoted from auto-approved import; requires Mapping Admin review.";
      const { error } = await supabase
        .from("sales_account_aliases")
        .update({ approved: false, notes: nextNotes, updated_at: new Date().toISOString() })
        .eq("id", r.id);
      if (error) {
        report.counts.errors += 1;
        report.warnings.push(`Alias demote failed id=${String(r.id)}: ${String(error.message || error)}`);
      } else {
        report.counts.demotedAliases += 1;
      }
    }
  }

  // ---- Assignments (optional, conservative) ----
  // Only demote assignments that clearly look auto-imported and are not tied to a human approval.
  const { data: asgRows, error: asgErr } = await supabase
    .from("sales_account_assignments")
    .select(
      "id,sales_account_master_id,assigned_salesperson,branch,assignment_type,active,approved,approved_by,approved_at,notes,created_at,updated_at"
    )
    .eq("approved", true)
    .eq("assignment_type", "current_owner")
    .order("updated_at", { ascending: false })
    .limit(5000);
  if (asgErr) {
    report.warnings.push(`Could not read sales_account_assignments (skipping): ${String(asgErr.message || asgErr)}`);
  } else {
    report.counts.totalApprovedAssignments = (asgRows ?? []).length;
    const wouldDemoteAsg = (asgRows ?? []).filter(isAutoImportLikeAssignmentRow);
    report.counts.wouldDemoteAssignments = wouldDemoteAsg.length;
    report.examples.wouldDemoteAssignments = wouldDemoteAsg.slice(0, 30).map((r) => ({
      id: r.id,
      sales_account_master_id: r.sales_account_master_id,
      assigned_salesperson: r.assigned_salesperson,
      branch: r.branch,
      active: r.active,
      approved_by: r.approved_by,
      notes: r.notes ?? null
    }));

    if (writeEnabled) {
      for (const r of wouldDemoteAsg) {
        // Only demote if approved_by is null (already checked) and notes do not indicate manual approval.
        const { error } = await supabase
          .from("sales_account_assignments")
          .update({ approved: false, active: false, updated_at: new Date().toISOString(), notes: normalizeSpaces(r.notes) })
          .eq("id", r.id);
        if (error) {
          report.counts.errors += 1;
          report.warnings.push(`Assignment demote failed id=${String(r.id)}: ${String(error.message || error)}`);
        } else {
          report.counts.demotedAssignments += 1;
        }
      }
    }
  }

  await fs.writeFile(outJsonPath, JSON.stringify(report, null, 2));

  const txt = [
    "Sales Auto-Approved Mapping Demotion",
    `Generated: ${report.generatedAt}`,
    `Mode: ${mode} (set SALES_ALIAS_DEMOTE_WRITE=1 to write)`,
    "",
    "Aliases:",
    `- totalApprovedAliases: ${report.counts.totalApprovedAliases}`,
    `- wouldDemoteAliases: ${report.counts.wouldDemoteAliases}`,
    `- demotedAliases: ${report.counts.demotedAliases}`,
    `- skippedManualAliases: ${report.counts.skippedManualAliases}`,
    `- skippedNonAutoAliases: ${report.counts.skippedNonAutoAliases}`,
    "",
    "Assignments (current_owner):",
    `- totalApprovedAssignments: ${report.counts.totalApprovedAssignments}`,
    `- wouldDemoteAssignments: ${report.counts.wouldDemoteAssignments}`,
    `- demotedAssignments: ${report.counts.demotedAssignments}`,
    "",
    `Errors: ${report.counts.errors}`,
    "",
    "Examples (aliases to demote):",
    ...(report.examples.wouldDemoteAliases.length
      ? report.examples.wouldDemoteAliases.slice(0, 15).map(
          (r) =>
            `- ${r.moraware_account_name} => ${r.monday_account_name || "—"} :: owner=${r.assigned_salesperson || "—"} branch=${r.branch || "—"} (${r.match_type || "—"}, ${r.confidence || "—"})`
        )
      : ["- (none)"]),
    "",
    ...(report.warnings.length ? ["Warnings:", ...report.warnings.slice(0, 60).map((w) => `- ${w}`), ""] : [])
  ].join("\n");

  await fs.writeFile(outTxtPath, txt + "\n");
  console.log(`Wrote ${outJsonPath}`);
  console.log(`Wrote ${outTxtPath}`);
}

main().catch((e) => {
  console.error("demoteAutoApprovedSalesAliases failed:", e);
  process.exitCode = 1;
});

