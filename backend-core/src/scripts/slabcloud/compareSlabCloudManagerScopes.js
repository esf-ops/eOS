#!/usr/bin/env node
/**
 * compareSlabCloudManagerScopes — SlabCloud manager-scope diagnostic (read-only).
 *
 * PURPOSE
 * ───────
 * Determine why slabOS has fewer slabs than the public ESF manager page
 * (https://slabcloud.com/inventory/esf/manager.php) by probing every known
 * type/filter variant of the kbyd company code endpoint.
 *
 * KEY DISCOVERY (2026-06-05)
 * ──────────────────────────
 * The public manager URL is /inventory/esf/manager.php, but the browser console
 * on that page logs:
 *   company    kbyd     ← the API company code is "kbyd", NOT "esf"
 *   edges      true
 *   showZoom   true
 *   filterOpen true
 *   measure    true
 *
 * The missing inventory is likely from type/filter scope: our sync fetches
 * type=Slab only, but the manager supports Remnants, Full Slabs, etc.
 * Do NOT blindly change company code from kbyd to esf.
 *
 * SAFETY
 * ──────
 * READ ONLY. No Supabase writes. No SlabCloud writes. No cookies/auth/PHPSESSID.
 * GET/HEAD requests only (plus optional no-write Supabase read for comparison).
 *
 * ENV VARS
 * ────────
 *   SLABCLOUD_BASE_URL              default https://slabcloud.com
 *   SLABCLOUD_COMPANY_CODE          default kbyd
 *   SLABCLOUD_TIMEOUT_MS            default 15000
 *   SLABCLOUD_DETAIL_SAMPLE_MAX     default 20 (max color names to detail-fetch per variant)
 *   SLABCLOUD_PUBLIC_HAR_FILE       optional: path to a .har JSON file for UUID comparison
 *   SLABCLOUD_ORGANIZATION_ID       optional: enables Supabase comparison (read-only)
 *   SUPABASE_URL                    optional: required for Supabase comparison
 *   SUPABASE_SERVICE_ROLE_KEY       optional: required for Supabase comparison
 *   SLABCLOUD_SKIP_MANAGER_PAGE     "1" to skip the manager.php HTML fetch
 *   SLABCLOUD_SKIP_DETAILS          "1" to skip per-name detail sampling
 *
 * OUTPUTS
 * ───────
 *   debug/slabcloud/slabcloud-manager-scope-diagnostic.json
 *
 * USAGE
 * ─────
 *   npm run eos:slabcloud:manager-scope-diagnostic
 *   # Or with HAR comparison:
 *   SLABCLOUD_PUBLIC_HAR_FILE=/path/to/esf-manager.har \
 *     SLABCLOUD_ORGANIZATION_ID=<org-uuid> \
 *     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     npm run eos:slabcloud:manager-scope-diagnostic
 */

import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  fetchJson,
  buildRequestHeaders,
  assertNoAuthHeaders,
  DEFAULT_SLABCLOUD_BASE_URL,
  DEFAULT_SLABCLOUD_COMPANY_CODE,
} from "../../slabcloud/slabCloudClient.js";

import {
  buildEndpointVariants,
  extractHarImageUuids,
  compareUuidSets,
  analyzeEndpointRows,
  generateDetailVariantUrl,
  extractScriptUrls,
  extractEmbeddedConfigSnippets,
  compareHarToSupabase,
} from "../../slabcloud/slabCloudManagerScopeDiagnostic.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../..");

// ── Helpers ───────────────────────────────────────────────────────────────────

function env(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}
function envInt(name, fallback) {
  const v = env(name, "");
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}
function envBool(name) {
  const v = env(name, "0");
  return v === "1" || v.toLowerCase() === "true";
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch raw text (HTML or plain). Uses the same read-only headers — no auth, no cookies.
 */
async function fetchText(url, { timeoutMs = 15000, fetchImpl = globalThis.fetch } = {}) {
  const headers = buildRequestHeaders();
  assertNoAuthHeaders(headers);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: "GET", headers, redirect: "follow", signal: controller.signal });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status, text: await res.text() };
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err && err.name === "AbortError";
    return { ok: false, status: 0, text: "", error: isTimeout ? `timeout after ${timeoutMs}ms` : String(err?.message || err) };
  }
}

/** Fetch a single endpoint variant; on error record warning and return null. */
async function fetchVariant(variant, { timeoutMs, warnings }) {
  try {
    const rows = await fetchJson(variant.url, {
      headers: buildRequestHeaders(),
      timeoutMs,
      retries: 1,
      retryDelayMs: 800,
    });
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    const msg = `${variant.label}: ${err?.message || String(err)}`;
    warnings.push({ type: "endpoint_error", variant: variant.label, url: variant.url, message: err?.message || String(err) });
    console.warn(`  ⚠  ${msg}`);
    return null;
  }
}

/** Fetch detail rows for up to maxSample unique names from a summary variant. */
async function fetchDetailSample(names, { baseUrl, companyCode, type, timeoutMs, maxSample, warnings }) {
  const toFetch = [...new Set(names)].slice(0, maxSample);
  const results = [];
  for (const name of toFetch) {
    await delay(200); // gentle pacing
    const url = generateDetailVariantUrl(baseUrl, companyCode, name, type);
    try {
      const rows = await fetchJson(url, {
        headers: buildRequestHeaders(),
        timeoutMs,
        retries: 1,
        retryDelayMs: 600,
      });
      const arr = Array.isArray(rows) ? rows : [];
      const analysis = analyzeEndpointRows(arr);
      results.push({ name, url, ...analysis });
    } catch (err) {
      warnings.push({ type: "detail_error", name, url, message: err?.message || String(err) });
      results.push({ name, url, error: err?.message || String(err), row_count: 0, distinct_slab_id_count: 0 });
    }
  }
  return results;
}

/** Read Supabase slab_inventory + slab_images external_slab_ids (read-only). */
async function readSupabaseSlabIds(orgId) {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key || !orgId) return null;
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

    const [invRes, imgRes] = await Promise.all([
      db.from("slab_inventory")
        .select("external_slab_id")
        .eq("organization_id", orgId)
        .not("external_slab_id", "is", null),
      db.from("slab_images")
        .select("external_slab_id")
        .eq("organization_id", orgId)
        .not("external_slab_id", "is", null),
    ]);

    const invIds = (invRes.data ?? []).map((r) => String(r.external_slab_id));
    const imgIds = (imgRes.data ?? []).map((r) => String(r.external_slab_id));

    return { invIds, imgIds, invError: invRes.error?.message || null, imgError: imgRes.error?.message || null };
  } catch (err) {
    return { invIds: [], imgIds: [], error: String(err?.message || err) };
  }
}

// ── Known manager console evidence (hardcoded — from browser observation) ─────

const MANAGER_CONSOLE_EVIDENCE = {
  note: "Observed from browser DevTools console on https://slabcloud.com/inventory/esf/manager.php (2026-06-05). Not auth-scraped — manually documented.",
  company: "kbyd",
  edges: true,
  showZoom: true,
  filterOpen: true,
  measure: true,
  infoFields: ["(array — not captured in full; log showed field labels)"],
  interpretation:
    "company=kbyd confirms the API company code is NOT 'esf' even though the URL path is /inventory/esf/manager.php. " +
    "edges=true matches our ?edges=true param. measure=true indicates the page has measurement/zoom UI (inspiration only, not to copy).",
};

// ── Main diagnostic ───────────────────────────────────────────────────────────

async function main() {
  const baseUrl = env("SLABCLOUD_BASE_URL", DEFAULT_SLABCLOUD_BASE_URL);
  const companyCode = env("SLABCLOUD_COMPANY_CODE", DEFAULT_SLABCLOUD_COMPANY_CODE);
  const timeoutMs = envInt("SLABCLOUD_TIMEOUT_MS", 15000);
  const detailSampleMax = envInt("SLABCLOUD_DETAIL_SAMPLE_MAX", 20);
  const harFile = env("SLABCLOUD_PUBLIC_HAR_FILE", "");
  const orgId = env("SLABCLOUD_ORGANIZATION_ID", "");
  const skipManagerPage = envBool("SLABCLOUD_SKIP_MANAGER_PAGE");
  const skipDetails = envBool("SLABCLOUD_SKIP_DETAILS");

  console.log("SlabCloud manager-scope diagnostic (READ ONLY)");
  console.log(`  Base URL:          ${baseUrl}`);
  console.log(`  Company code:      ${companyCode}`);
  console.log(`  Timeout:           ${timeoutMs}ms`);
  console.log(`  Detail sample max: ${skipDetails ? "skipped" : detailSampleMax}`);
  console.log(`  HAR file:          ${harFile || "(none)"}`);
  console.log(`  Supabase compare:  ${orgId ? "yes (read-only)" : "skipped (no org id)"}`);
  console.log("");

  const warnings = [];
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    companyCode,
    managerConsoleEvidence: MANAGER_CONSOLE_EVIDENCE,
    managerPageHtml: null,
    endpointVariants: [],
    harComparison: null,
    supabaseComparison: null,
    summary: null,
    warnings,
  };

  // 1. Manager page HTML (optional, best-effort)
  if (!skipManagerPage) {
    console.log("→ Fetching manager.php HTML (no auth, no cookies)…");
    const managerUrl = `${baseUrl.replace(/\/+$/, "")}/inventory/esf/manager.php`;
    const { ok, status, text, error } = await fetchText(managerUrl, { timeoutMs, fetchImpl: globalThis.fetch });
    if (ok) {
      const scriptUrls = extractScriptUrls(text);
      const configSnippets = extractEmbeddedConfigSnippets(text);
      const managerJsUrls = scriptUrls.filter((u) => u.toLowerCase().includes("manager"));
      report.managerPageHtml = {
        url: managerUrl,
        status,
        html_length: text.length,
        script_urls: scriptUrls.slice(0, 20),
        manager_js_urls: managerJsUrls,
        embedded_config_snippets: configSnippets,
      };
      console.log(`  ✓  manager.php fetched (${text.length} bytes, ${scriptUrls.length} script tags, ${managerJsUrls.length} manager.js URLs)`);
    } else {
      const msg = `manager.php fetch failed: status=${status}${error ? ` error=${error}` : ""}`;
      warnings.push({ type: "manager_page_error", url: managerUrl, message: msg });
      report.managerPageHtml = { url: managerUrl, status, error: error || `HTTP ${status}` };
      console.warn(`  ⚠  ${msg}`);
    }
    console.log("");
  }

  // 2. Load HAR file if provided
  let harIds = new Set();
  if (harFile) {
    console.log(`→ Loading HAR file: ${harFile}`);
    try {
      const harText = await fs.readFile(harFile, "utf8");
      harIds = extractHarImageUuids(harText);
      console.log(`  ✓  Extracted ${harIds.size} unique image UUIDs from HAR`);
      report.harComparison = {
        har_file: harFile,
        har_unique_image_uuid_count: harIds.size,
        har_uuid_sample: [...harIds].slice(0, 10),
        endpoint_comparisons: [],
      };
    } catch (err) {
      const msg = `Could not read HAR file: ${err?.message || String(err)}`;
      warnings.push({ type: "har_file_error", file: harFile, message: msg });
      console.warn(`  ⚠  ${msg}`);
    }
    console.log("");
  }

  // 3. Probe all endpoint variants
  const variants = buildEndpointVariants(baseUrl, companyCode);
  console.log(`→ Probing ${variants.length} endpoint variants…`);

  // Collect all SlabIDs across all slab variants for aggregate comparison
  const allEndpointSlabIds = new Set();

  for (const variant of variants) {
    console.log(`  ${variant.label}`);
    const rows = await fetchVariant(variant, { timeoutMs, warnings });

    if (rows === null) {
      report.endpointVariants.push({
        label: variant.label,
        url: variant.url,
        kind: variant.kind,
        type: variant.type,
        status: "error",
      });
      continue;
    }

    const analysis = analyzeEndpointRows(rows);
    console.log(`    rows=${rows.length}  distinct_slab_ids=${analysis.distinct_slab_id_count}  names=${analysis.distinct_name_count}  materials=${analysis.distinct_material_count}`);

    // Collect slab IDs for aggregate HAR comparison
    if (variant.kind === "slabs") {
      for (const row of rows) {
        if (row.SlabID) allEndpointSlabIds.add(String(row.SlabID).toLowerCase());
      }
    }

    // Per-name detail sampling (slab variants only, if enabled)
    let detailSamples = null;
    if (!skipDetails && variant.kind === "slabs" && analysis.distinct_name_count > 0) {
      const namesToSample = [...new Set(rows.map((r) => r.Name).filter(Boolean))];
      if (namesToSample.length > 0) {
        console.log(`    ↳ detail-sampling up to ${detailSampleMax} names…`);
        detailSamples = await fetchDetailSample(namesToSample, {
          baseUrl, companyCode, type: variant.type, timeoutMs, maxSample: detailSampleMax, warnings,
        });
        const totalDetailRows = detailSamples.reduce((s, d) => s + (d.row_count || 0), 0);
        const totalDetailIds = new Set(detailSamples.flatMap((d) => {
          const ids = [];
          // pull sample_slab_ids if available
          return ids;
        }));
        console.log(`    ↳ detail total rows=${totalDetailRows} across ${detailSamples.length} sampled names`);
      }
    }

    // HAR comparison per variant
    let harComp = null;
    if (harIds.size > 0 && variant.kind === "slabs") {
      const variantSlabIds = rows.map((r) => r.SlabID).filter(Boolean);
      harComp = compareUuidSets(variantSlabIds, harIds);
      console.log(`    ↳ HAR: ${harComp.endpoint_ids_in_har_count}/${harIds.size} HAR UUIDs matched, ${harComp.har_ids_missing_from_endpoint_count} HAR UUIDs missing from endpoint`);
    }

    report.endpointVariants.push({
      label: variant.label,
      url: variant.url,
      kind: variant.kind,
      type: variant.type,
      status: "ok",
      analysis,
      detail_samples: detailSamples,
      har_comparison: harComp,
    });

    await delay(400); // gentle pacing between variants
  }

  // 4. Aggregate HAR comparison (all slab endpoint IDs combined)
  if (harIds.size > 0 && report.harComparison) {
    const aggComp = compareUuidSets(allEndpointSlabIds, harIds);
    report.harComparison.aggregate_all_slab_variants = aggComp;
    console.log("");
    console.log(`→ HAR aggregate comparison (all slab variants combined):`);
    console.log(`    endpoint_ids_total=${aggComp.endpoint_id_count}`);
    console.log(`    har_uuids=${aggComp.har_id_count}`);
    console.log(`    matched=${aggComp.endpoint_ids_in_har_count}`);
    console.log(`    har_missing_from_all_endpoints=${aggComp.har_ids_missing_from_endpoint_count}`);
  }

  // 5. Optional Supabase read-only comparison
  if (orgId) {
    console.log("");
    console.log("→ Reading slab_inventory / slab_images from Supabase (read-only)…");
    const dbResult = await readSupabaseSlabIds(orgId);
    if (dbResult) {
      console.log(`    slab_inventory rows: ${dbResult.invIds.length}`);
      console.log(`    slab_images rows:    ${dbResult.imgIds.length}`);

      if (harIds.size > 0) {
        const comparison = compareHarToSupabase(harIds, dbResult.invIds, dbResult.imgIds);
        report.supabaseComparison = {
          organization_id: orgId,
          ...comparison,
          slab_inventory_error: dbResult.invError || null,
          slab_images_error: dbResult.imgError || null,
        };
        console.log(`    HAR missing from slab_inventory: ${comparison.har_missing_from_slab_inventory_count}`);
        console.log(`    slab_inventory not in HAR:       ${comparison.slab_inventory_not_seen_in_har_count}`);
      } else {
        // No HAR — just record raw counts
        report.supabaseComparison = {
          organization_id: orgId,
          slab_inventory_id_count: dbResult.invIds.length,
          slab_images_id_count: dbResult.imgIds.length,
          note: "No HAR file provided — cross-comparison skipped",
          slab_inventory_error: dbResult.invError || null,
          slab_images_error: dbResult.imgError || null,
        };
      }
    }
  }

  // 6. Build terminal summary / recommendations
  const slabVariants = report.endpointVariants.filter((v) => v.kind === "slabs" && v.status === "ok");
  const defaultSlabVariant = slabVariants.find((v) => v.label === "slabs?type=Slab&edges=true");
  const defaultCount = defaultSlabVariant?.analysis?.row_count ?? 0;

  const additionalCounts = slabVariants
    .filter((v) => v.label !== "slabs?type=Slab&edges=true")
    .map((v) => ({ label: v.label, rows: v.analysis?.row_count ?? 0 }))
    .filter((v) => v.rows > 0);

  const largestVariant = slabVariants.reduce(
    (best, v) => (!best || (v.analysis?.row_count ?? 0) > (best.analysis?.row_count ?? 0) ? v : best),
    null
  );

  const possibleNewSlabs = slabVariants.reduce((sum, v) => {
    if (v.label === "slabs?type=Slab&edges=true") return sum;
    return sum + (v.analysis?.distinct_slab_id_count ?? 0);
  }, 0);

  report.summary = {
    company_code_recommendation:
      `KEEP kbyd. Manager console confirms company=kbyd. ` +
      `The /inventory/esf/ URL slug is a display slug, not the API company code. ` +
      `Do NOT change SLABCLOUD_API_COMPANY_CODE to "esf".`,
    current_type_filter: "Slab (type=Slab&edges=true — current slabOS default)",
    current_sync_slab_count_summary: defaultCount,
    missing_inventory_hypothesis:
      possibleNewSlabs > 0
        ? `LIKELY YES — type=Remnant, type=Full Slab, or other variants may return additional slabs (${possibleNewSlabs} additional summary-level IDs seen across non-Slab variants). Investigate before adding a second sync lane.`
        : "Type/filter scope difference detected but additional row counts need detail-level verification.",
    needs_separate_sync_lane:
      "Unknown until diagnostic is reviewed. If Remnant or Full Slab types return distinct SlabIDs not in type=Slab, a second sync lane (separate type) may be needed. Do NOT add without operator review.",
    best_matching_endpoint: largestVariant?.label ?? defaultSlabVariant?.label ?? "slabs?type=Slab&edges=true",
    recommended_config: {
      SLABCLOUD_PUBLIC_SLUG: "esf",
      SLABCLOUD_API_COMPANY_CODE: "kbyd",
      SLABCLOUD_ASSET_COMPANY_CODE: "kbyd",
      SLABCLOUD_INVENTORY_TYPES:
        "(pending diagnostic review) — currently: Slab. May need Remnant, Full Slab, or All depending on findings.",
    },
    magnify_measurement_ux_note:
      "measure=true / showZoom=true in the manager config means the manager page has a zoom/measure UI. " +
      "This is UX inspiration only — do NOT copy or reverse-engineer the manager.js implementation. " +
      "Any slabOS measurement UI must be an original eliteOS design.",
    variant_row_counts: slabVariants.map((v) => ({
      label: v.label,
      rows: v.analysis?.row_count ?? 0,
      distinct_slab_ids: v.analysis?.distinct_slab_id_count ?? 0,
    })),
    additional_non_slab_type_counts: additionalCounts,
    warning_count: warnings.length,
  };

  // 7. Write JSON output
  const outDir = path.join(repoRoot, "debug/slabcloud");
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "slabcloud-manager-scope-diagnostic.json");
  await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  // 8. Terminal summary
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("SUMMARY");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`Company code:        KEEP kbyd (manager console confirms company=kbyd)`);
  console.log(`Current sync type:   Slab → ${defaultCount} summary-level rows`);
  console.log(`Best endpoint:       ${report.summary.best_matching_endpoint}`);
  if (additionalCounts.length > 0) {
    console.log("Other type variants:");
    for (const v of additionalCounts) {
      console.log(`  ${v.label}: ${v.rows} rows`);
    }
  }
  console.log(`Missing inventory:   ${report.summary.missing_inventory_hypothesis}`);
  console.log(`Sync lane change:    ${report.summary.needs_separate_sync_lane}`);
  console.log(`Warnings:            ${warnings.length}`);
  console.log(`Output:              ${outPath}`);
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("No writes performed. Review output JSON before changing sync config.");
  console.log("");

  if (warnings.length > 0) {
    console.log(`Warnings (${warnings.length}):`);
    for (const w of warnings) {
      console.warn(`  ⚠  [${w.type}] ${w.message || w.variant || ""}`);
    }
  }
}

// ── Guard: only run when invoked directly (not when imported for testing) ─────

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  main().catch((err) => {
    console.error("\nFATAL:", err?.stack || String(err));
    process.exit(1);
  });
}
