#!/usr/bin/env node
/**
 * Backfill / refresh slab_piece_geometry for active Slabsmith pieces.
 * Same idempotent job the 15-minute cron runs; use for the initial backfill.
 *
 *   npm run eos:slab-geometry:derive -- [--limit=2000] [--features=2000] [--dry-run]
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { runSlabGeometryDerivation, selectPendingGeometryWork } from "../../slabInventory/slabPieceGeometryJob.js";

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), "../../../.env"), quiet: true });

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);
const limit = Number(args.get("limit") ?? 2000);
const dryRun = args.get("dry-run") === "true";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY: MISSING");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

if (dryRun) {
  const work = await selectPendingGeometryWork(db);
  console.log(JSON.stringify({ dry_run: true, active_pieces: work.active_pieces, active_with_photo: work.active_with_photo, derived: work.derived, pending: work.pending.length }));
} else {
  const featureLimit = Number(args.get("features") ?? 2000);
  const result = await runSlabGeometryDerivation({ db, limit, concurrency: 6, featureLimit });
  console.log(JSON.stringify(result));
}
