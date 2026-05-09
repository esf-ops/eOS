/**
 * Backfill brain_fields.normalized_label from existing label + raw_json.
 * Default DRY_RUN=1: no DB updates. Set DRY_RUN=0 to apply.
 */
/* eslint-disable no-console */
import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import {
  computeNormalizedLabelForBrainFieldRow,
  isNormalizedLabelMissingOrUnusable
} from "../brain/brainFieldNormalizedLabel.js";

function requiredEnv(name) {
  const v = String(process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

async function fetchAllPaged(queryBuilder, { pageSize = 1000 } = {}) {
  const rows = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await queryBuilder.range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    from += data.length;
  }
  return rows;
}

async function run() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "../../..");
  const latestDir = path.join(repoRoot, "debug", "moraware", "latest");
  await fs.mkdir(latestDir, { recursive: true });

  // Default dry run; set DRY_RUN=0 to write updates.
  const dryRun = String(process.env.DRY_RUN ?? "1").trim() !== "0";

  const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const rows = await fetchAllPaged(
    supabase.from("brain_fields").select("id,job_id,field_id,label,normalized_label,raw_json").order("id", { ascending: true }),
    { pageSize: 1000 }
  );

  const candidates = [];
  for (const row of rows) {
    if (!isNormalizedLabelMissingOrUnusable(row.normalized_label)) continue;
    const computed = computeNormalizedLabelForBrainFieldRow(row);
    if (!computed) continue;
    if (computed === String(row.normalized_label ?? "").trim()) continue;
    candidates.push({ id: row.id, job_id: row.job_id, from: row.normalized_label, to: computed });
  }

  let updated = 0;
  const errors = [];

  if (!dryRun) {
    const batchSize = 50;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const chunk = candidates.slice(i, i + batchSize);
      for (const c of chunk) {
        const { error } = await supabase.from("brain_fields").update({ normalized_label: c.to }).eq("id", c.id);
        if (error) {
          errors.push({ id: c.id, message: error.message });
        } else {
          updated++;
        }
      }
    }
  }

  const summary = {
    meta: {
      generatedAt: new Date().toISOString(),
      dryRun,
      dryRunHint: dryRun ? "No rows updated (set DRY_RUN=0 to apply)" : "Updates applied"
    },
    totals: {
      brain_fields_scanned: rows.length,
      rows_needing_backfill: candidates.length,
      rows_updated: dryRun ? 0 : updated,
      errors: errors.length
    },
    sample_changes: candidates.slice(0, 30),
    errors: errors.slice(0, 50)
  };

  const jsonPath = path.join(latestDir, "brain-field-label-backfill-summary.json");
  const txtPath = path.join(latestDir, "brain-field-label-backfill-summary.txt");
  await fs.writeFile(jsonPath, JSON.stringify(summary, null, 2), "utf8");
  const txt =
    `brain_fields normalized_label backfill\n` +
    `dryRun: ${dryRun}\n` +
    `scanned: ${rows.length}\n` +
    `would_update / updated: ${candidates.length} (${dryRun ? "dry" : "live updated: " + updated})\n` +
    `errors: ${errors.length}\n` +
    `\nfirst 20 changes:\n` +
    JSON.stringify(candidates.slice(0, 20), null, 2) +
    `\n`;
  await fs.writeFile(txtPath, txt, "utf8");

  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${txtPath}`);
  console.log(
    `scanned=${rows.length} candidates=${candidates.length} dryRun=${dryRun} updated=${updated} errors=${errors.length}`
  );
}

run().catch((e) => {
  console.error(e?.stack || e);
  process.exitCode = 1;
});
