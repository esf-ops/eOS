#!/usr/bin/env node
/**
 * Read-only: resolve exact Moraware source_account_id for the final-action plan
 * and write a gitignored operator artifact. Never mutates.
 *
 *   node backend-core/src/scripts/accountDirectoryMorawareFinalActionReadiness.mjs --dry-run
 */

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { createAccountDirectorySupabaseStore } from "../accountDirectory/accountDirectorySupabaseStore.mjs";
import { ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM } from "../accountDirectory/accountDirectoryQuickbooksLinkage.mjs";
import { ACCOUNT_DIRECTORY_MORAWARE_SYSTEM } from "../accountDirectory/accountDirectoryMorawareLinkage.mjs";
import { buildFinalActionReadiness } from "../accountDirectory/accountDirectoryMorawareFinalActionQueue.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(path.join(REPO_ROOT, "package.json"));
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

dotenv.config({ path: path.join(REPO_ROOT, ".env") });
dotenv.config({ path: path.join(REPO_ROOT, "backend-core/.env") });

const DIR = path.join(REPO_ROOT, "local-imports/moraware-qb-full-reconciliation");
const CSV_PATH = path.join(DIR, "moraware-reconciliation-final-actions.csv");
const PLAN_PATH = path.join(DIR, "moraware-final-action-plan.json");
const REPORT_PATH = path.join(DIR, "moraware-final-action-readiness.json");
const PAGE = 1000;
const CANONICAL_ID_RE = /^\d+$/;

function parseCsvFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const header = (rows[0] || []).map((h) => String(h || "").trim());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => String(c || "").trim()))
    .map((r) => {
      const obj = {};
      header.forEach((h, i) => {
        obj[h] = r[i] ?? "";
      });
      return obj;
    });
}

async function fetchAll(supabase, table, columns, apply) {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function resolveOrganizationId(supabase) {
  const fromEnv = String(
    process.env.ACCOUNT_DIRECTORY_SEED_ORGANIZATION_ID ||
      process.env.ACCOUNT_DIRECTORY_MASTER_LIST_ORGANIZATION_ID ||
      process.env.MORAWARE_DEFAULT_ORGANIZATION_ID ||
      ""
  ).trim();
  if (fromEnv) return fromEnv;
  const { data, error } = await supabase.from("account_directory_accounts").select("organization_id");
  if (error) throw error;
  const ids = [...new Set((data || []).map((r) => String(r.organization_id || "").trim()).filter(Boolean))];
  if (ids.length === 1) return ids[0];
  throw new Error("Provide ACCOUNT_DIRECTORY_SEED_ORGANIZATION_ID.");
}

async function main() {
  if (!process.argv.includes("--dry-run")) {
    console.error("Read-only only. Pass --dry-run.");
    process.exit(1);
  }
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`BLOCKED: missing ${CSV_PATH}`);
    process.exit(2);
  }

  const actions = parseCsvFile(CSV_PATH);
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(
    PLAN_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        identityAuthority: false,
        note: "Temporary operator plan. Runtime re-resolves exact Moraware source_account_id from Brain. Not production identity.",
        actions
      },
      null,
      2
    ),
    "utf8"
  );

  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required.");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const organizationId = await resolveOrganizationId(supabase);
  const store = createAccountDirectorySupabaseStore(() => supabase);

  const mwAccounts = await fetchAll(
    supabase,
    "brain_moraware_accounts",
    "source_account_id,account_name,last_seen_at",
    (q) => q.eq("organization_id", organizationId)
  );
  const dates = mwAccounts
    .filter((a) => CANONICAL_ID_RE.test(String(a.source_account_id || "")))
    .map((a) => String(a.last_seen_at || "").slice(0, 10))
    .filter(Boolean)
    .sort();
  const canonicalDay = dates[dates.length - 1] || "";
  const sourceAccounts = mwAccounts
    .filter(
      (a) =>
        CANONICAL_ID_RE.test(String(a.source_account_id || "")) &&
        (!canonicalDay || String(a.last_seen_at || "").slice(0, 10) === canonicalDay)
    )
    .map((a) => ({
      sourceAccountId: String(a.source_account_id),
      accountName: a.account_name || ""
    }));

  const listed = await store.listAccounts(organizationId, { includeArchived: true, limit: 5000, offset: 0 });
  const [qbLinks, allLinks] = await Promise.all([
    store.listAllActiveExternalLinks(organizationId, ACCOUNT_DIRECTORY_QUICKBOOKS_SYSTEM),
    store.listExternalLinksForOrganization(organizationId)
  ]);
  const morawareLinks = (allLinks || []).filter(
    (l) => l.externalSystem === ACCOUNT_DIRECTORY_MORAWARE_SYSTEM && l.isActive !== false
  );

  const readiness = buildFinalActionReadiness({
    actions,
    sourceAccounts,
    morawareLinks,
    qbLinks,
    directoryAccounts: listed.items || []
  });

  const blockedReasons = {};
  for (const row of readiness.rows) {
    if (row.readiness !== "BLOCKED_MORAWARE_SOURCE_ID") continue;
    const reason = row.blocked_reason || "unknown";
    blockedReasons[reason] = (blockedReasons[reason] || 0) + 1;
  }

  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        readOnly: true,
        organizationId,
        canonicalDay,
        sourceAccountCount: sourceAccounts.length,
        counts: readiness.counts,
        blockedReasons,
        rows: readiness.rows
      },
      null,
      2
    ),
    "utf8"
  );

  const c = readiness.counts;
  console.log("");
  console.log(`TOTAL FINAL ACTION ROWS: ${c.total}`);
  console.log("");
  console.log(`ALREADY_LINKED_EXACT: ${c.ALREADY_LINKED_EXACT}`);
  console.log(`READY_CONNECT_EXISTING_AD: ${c.READY_CONNECT_EXISTING_AD}`);
  console.log(`READY_CREATE_FROM_QB_THEN_CONNECT: ${c.READY_CREATE_FROM_QB_THEN_CONNECT}`);
  console.log(`BLOCKED_MORAWARE_SOURCE_ID: ${c.BLOCKED_MORAWARE_SOURCE_ID}`);
  console.log(`NON_EXECUTABLE_BY_PLAN: ${c.NON_EXECUTABLE_BY_PLAN}`);
  if (Object.keys(blockedReasons).length) {
    console.log("");
    console.log("BLOCKED_MORAWARE_SOURCE_ID reasons:");
    for (const [reason, n] of Object.entries(blockedReasons).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${reason}: ${n}`);
    }
  }
  console.log("");
  console.log("PLAN (not identity authority)");
  console.log(PLAN_PATH);
  console.log("READINESS SNAPSHOT");
  console.log(REPORT_PATH);
  console.log("");
  console.log("To enable the Account Directory final review queue locally:");
  console.log(`  ACCOUNT_DIRECTORY_MORAWARE_FINAL_ACTIONS_PATH=${PLAN_PATH}`);
  console.log("  or ACCOUNT_DIRECTORY_MORAWARE_FINAL_ACTIONS_ALLOW_LOCAL=1 (non-production only)");
  console.log("");
  console.log("databaseWrites: 0");
  console.log("QuickBooksWrites: 0");
  console.log("MorawareWrites: 0");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
