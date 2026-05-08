import 'dotenv/config';
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ingestFirehose } from "./firehose.js";
import { MorawareClient, aggregateWorksheetSqFtFromJobFormFields } from "./morawareClient.js";
import { runMorawareDiscovery } from "./morawareDiscovery.js";
import { normalizePayload } from "./normalize.js";
import { runSwitchboard } from "./router.js";
import * as debugHead from "./heads/debug.js";
import * as salesHead from "./heads/sales.js";

export { aggregateWorksheetSqFtFromJobFormFields };

const DISCOVERY_V2_MODULE_PATH = fileURLToPath(new URL("./morawareDiscovery.js", import.meta.url));

/** If this banner ever appears in logs, Discovery V2 routing failed — must throw instead of logging. */
export const LEGACY_MORAWARE_DISCOVERY_MODE_BANNER = "=== MORAWARE DISCOVERY MODE ===";

/** Never call this from new code — replaced legacy `console.log("=== MORAWARE DISCOVERY MODE ===")`. */
export function logLegacyMorawareDiscoveryMode() {
  throw new Error(
    "Old Moraware discovery path reached. Discovery V2 is not wired correctly."
  );
}

export function morawareDiscoveryModeEnabled() {
  const v = String(process.env.MORAWARE_DISCOVERY ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function pickFirstArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function toNonEmptyString(v) {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return s.length ? s : "";
}

function extractSalesperson(job) {
  const attrSp =
    job?._attributes?.salesperson ??
    job?._attributes?.Salesperson ??
    job?._attributes?.salesPerson ??
    job?._attributes?.SalesPerson;
  if (typeof attrSp === "string" && attrSp.trim().length) return attrSp.trim();

  const sp = job?.salesperson;
  if (typeof sp === "string") return toNonEmptyString(sp);
  if (!sp || typeof sp !== "object") return "";

  const name =
    sp?.name ??
    sp?.Name ??
    sp?.salespersonName ??
    sp?._attributes?.name ??
    sp?._attributes?.id ??
    sp?.[0]?.name ??
    sp?.[0]?._attributes?.name;
  return toNonEmptyString(name);
}

function extractSqFt(job) {
  // Moraware v6-style container: jobCustomFields (may repeat as rows or nest jobCustomFieldValue)
  const fieldsRoot = job?.jobCustomFields;
  if (fieldsRoot && typeof fieldsRoot === "object") {
    const fromNested = pickFirstArray(
      fieldsRoot.jobCustomFieldValue ?? fieldsRoot.jobCustomField ?? fieldsRoot
    );
    for (const e of fromNested) {
      if (!e || typeof e !== "object") continue;
      const typeId =
        e?.jobCustomFieldTypeId ??
        e?._attributes?.jobCustomFieldTypeId ??
        e?._attributes?.id ??
        e?.id;
      if (String(typeId) !== "3") continue;
      const v =
        e?.value ??
        e?._text ??
        e?.fieldValue ??
        e?.Value ??
        e?._attributes?.value ??
        e?._attributes?.fieldValue;
      const s = toNonEmptyString(String(v ?? ""));
      if (s) return s;
    }
  }

  // Preferred (nested shotgun): jobCustomFieldValues.jobCustomFieldValue[]
  const nestedValues = pickFirstArray(job?.jobCustomFieldValues?.jobCustomFieldValue);
  for (const e of nestedValues) {
    if (!e || typeof e !== "object") continue;
    const typeId =
      e?.jobCustomFieldTypeId ??
      e?._attributes?.jobCustomFieldTypeId ??
      e?._attributes?.customFieldTypeId ??
      e?.customFieldTypeId;
    if (String(typeId) !== "3") continue;
    const v =
      e?.value ??
      e?._text ??
      e?.fieldValue ??
      e?.Value ??
      e?._attributes?.value ??
      e?._attributes?.fieldValue;
    const s = toNonEmptyString(String(v ?? ""));
    if (s) return s;
  }

  // Variant A: jobCustomField (may contain _attributes.id or jobCustomFieldTypeId)
  const cfEntries = pickFirstArray(job?.jobCustomField);
  for (const e of cfEntries) {
    if (!e || typeof e !== "object") continue;
    const id =
      e?._attributes?.id ??
      e?.id ??
      e?._attributes?.jobCustomFieldTypeId ??
      e?.jobCustomFieldTypeId ??
      e?.jobCustomFieldType?._attributes?.id;
    if (id != null && String(id) !== "3") continue;

    const v =
      e?.value ??
      e?.Value ??
      e?._text ??
      e?._attributes?.value ??
      e?._attributes?.fieldValue;
    const s = toNonEmptyString(String(v ?? ""));
    if (s) return s;
  }

  // Variant B: jobCustomFieldValue array with jobCustomFieldTypeId + value
  const cfValueEntries = pickFirstArray(job?.jobCustomFieldValue);
  for (const e of cfValueEntries) {
    if (!e || typeof e !== "object") continue;
    const typeId =
      e?.jobCustomFieldTypeId ??
      e?._attributes?.jobCustomFieldTypeId ??
      e?._attributes?.customFieldTypeId ??
      e?.customFieldTypeId;
    if (String(typeId) !== "3") continue;
    const v =
      e?.value ??
      e?._text ??
      e?.fieldValue ??
      e?.Value ??
      e?._attributes?.value ??
      e?._attributes?.fieldValue;
    const s = toNonEmptyString(String(v ?? ""));
    if (s) return s;
  }

  const cfvEntries = pickFirstArray(job?.jobCustomFieldValues);
  for (const e of cfvEntries) {
    if (!e || typeof e !== "object") continue;
    const id = e?._attributes?.id ?? e?.id ?? e?._attributes?.jobCustomFieldTypeId;
    if (String(id) !== "3") continue;
    const v =
      e?._text ??
      e?.value ??
      e?.fieldValue ??
      e?._attributes?.value ??
      e?._attributes?.fieldValue;
    const s = toNonEmptyString(String(v ?? ""));
    if (s) return s;
  }

  return "";
}

/**
 * For each job from Firehose: Casey-pattern nested jobQuery for salesperson, then per jobFormId nested
 * jobFormFields.jobFormField include. Sq.Ft.: exact "Sq.Ft." or name contains "Sq"; totals via aggregateWorksheetSqFtFromJobFormFields.
 */
async function enrichAllJobsWithWorksheetSqFt(jobs, client, concurrency) {
  if (!Array.isArray(jobs) || jobs.length === 0) return jobs;

  const out = new Array(jobs.length);
  let idx = 0;
  const workerCount = Math.max(1, Math.min(concurrency, jobs.length));

  async function worker() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const i = idx;
      idx += 1;
      if (i >= jobs.length) return;
      try {
        out[i] = await client.enrichJobWithWorksheetSqFt(jobs[i]);
      } catch (err) {
        console.warn(`Worksheet enrichment failed at index ${i}`, err);
        out[i] = jobs[i];
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return out;
}

function extractCustomFieldValue(job, targetId) {
  const containers = [
    job?.jobCustomField,
    job?.jobCustomFieldValues,
    job?.jobCustomFieldValue,
    job?.customFieldValues,
    job?.customFieldValue
  ];

  for (const c of containers) {
    const arr = pickFirstArray(c);
    for (const entry of arr) {
      if (!entry || typeof entry !== "object") continue;
      const id =
        entry?._attributes?.id ??
        entry?.id ??
        entry?.customFieldType?._attributes?.id ??
        entry?.customFieldType?.id;
      if (String(id) !== String(targetId)) continue;

      const value =
        entry?._attributes?.value ??
        entry?.value ??
        entry?.fieldValue ??
        entry?.FieldValue ??
        entry?.text ??
        entry?._text ??
        entry?.jobCustomFieldValue ??
        entry?.jobCustomFieldValues ??
        entry?._attributes?.fieldValue ??
        entry?._attributes?.FieldValue;

      const s = toNonEmptyString(String(value ?? ""));
      if (s) return s;
    }
  }

  return "";
}

function parseArgs(argv) {
  const args = { mapping: "eos_mapping.csv" };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--mapping" || a === "-m") {
      args.mapping = argv[i + 1];
      i += 1;
      continue;
    }
    if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    process.stdout.write(
      [
        "Usage:",
        "  node src/index.js [--mapping eos_mapping.csv]",
        "",
        "Env vars (required):",
        "  MORAWARE_API_URL",
        "  MORAWARE_USERNAME",
        "  MORAWARE_PASSWORD",
        "",
        "Discovery (schema probes + eOS Brain artifact):",
        "  MORAWARE_DISCOVERY=1 MORAWARE_ACCOUNT_ID=668 MORAWARE_EXPECTED_JOB_NAME=\"319 Decor-Ferguson\" node src/index.js",
        "  MORAWARE_JOB_ID is optional (resolver uses account + expected name).",
        "",
        "Notes:",
        "  - This runs Firehose -> Normalizer -> Switchboard Router",
        "  - Switchboard writes output-[head].json files in the project root",
        ""
      ].join("\n")
    );
    return;
  }

  const client = new MorawareClient();
  await client.ensureSession();

  if (morawareDiscoveryModeEnabled()) {
    const jobEnv = process.env.MORAWARE_JOB_ID;
    const jobId = jobEnv === undefined || jobEnv === null ? "" : String(jobEnv).trim();
    const accountFromEnv = String(process.env.MORAWARE_ACCOUNT_ID ?? "").trim();
    const accountId = accountFromEnv || String(client.accountId || "").trim();

    console.log("DISCOVERY ENV CHECK", {
      MORAWARE_DISCOVERY: process.env.MORAWARE_DISCOVERY,
      MORAWARE_DISCOVERY_MODE: process.env.MORAWARE_DISCOVERY_MODE || "",
      MORAWARE_JOB_ID: process.env.MORAWARE_JOB_ID || "",
      MORAWARE_ACCOUNT_ID: process.env.MORAWARE_ACCOUNT_ID || "",
      MORAWARE_EXPECTED_JOB_NAME: process.env.MORAWARE_EXPECTED_JOB_NAME || ""
    });

    console.log("USING MORAWARE DISCOVERY V2 ENTRYPOINT");

    await runMorawareDiscovery({
      client,
      jobId,
      accountId,
      entrypointProof: {
        markerLine: "USING MORAWARE DISCOVERY V2 ENTRYPOINT",
        importedModulePath:
          path.relative(process.cwd(), DISCOVERY_V2_MODULE_PATH).replace(/\\/g, "/") || "src/morawareDiscovery.js"
      }
    });

    console.log("MORAWARE DISCOVERY V2 COMPLETE - exiting before Firehose/Switchboard");
    process.exit(0);
  }

  // Diagnostic: query job-level custom field types immediately after login.
  const diagCustomFieldTypes =
    (process.env.MORAWARE_DIAG_CUSTOM_FIELD_TYPES || "false").toLowerCase() === "true";
  if (diagCustomFieldTypes) {
    const response = await client.morawareCommand(
      `  <jobCustomFieldTypeQuery>\n` +
        `    <include xmlns="">\n` +
        `      <name/>\n` +
        `    </include>\n` +
        `  </jobCustomFieldTypeQuery>`
    );
    console.log("MAPPING DATA:", JSON.stringify(response.data, null, 2));
    process.exit(0);
  }

  // Phase 1: Firehose ingestion (job list)
  if (morawareDiscoveryModeEnabled()) {
    throw new Error(
      "Discovery mode leaked into Firehose (MORAWARE_DISCOVERY is set). src/index.js must exit in the discovery branch."
    );
  }
  console.log("Step 1: Starting Firehose (All Accounts)...");
  const rawPayload = await ingestFirehose({ client });
  const concurrency = Number.parseInt(process.env.MORAWARE_CONCURRENCY || "6", 10);

  // Casey pattern: jobFormQuery uses nested jobFormFields → jobFormField (name + value) per formId.
  rawPayload.jobs = await enrichAllJobsWithWorksheetSqFt(
    Array.isArray(rawPayload.jobs) ? rawPayload.jobs : [],
    client,
    concurrency
  );

  const rawJobsCount = Array.isArray(rawPayload?.jobs) ? rawPayload.jobs.length : 0;
  console.log(`Step 2: Firehose + worksheet enrichment finished. ${rawJobsCount} jobs.`);

  // Final mapping calibration: extract native salesperson + Sq Ft (custom field type id "3")
  const jobs = Array.isArray(rawPayload?.jobs) ? rawPayload.jobs : [];
  for (const job of jobs) {
    const id = String(job?._attributes?.id ?? job?.id ?? "");
    if (id === "37565") {
      console.log("DEBUG: Full Structure for 37565:", JSON.stringify(job, null, 2));
      break;
    }
  }

  const preferred =
    jobs.find((j) => String(j?._attributes?.id ?? j?.id ?? "") === "37565") || jobs[0] || null;

  if (preferred) {
    const preferredId = String(preferred?._attributes?.id ?? preferred?.id ?? "");
    const hasJobCf =
      pickFirstArray(preferred?.jobCustomFieldValues?.jobCustomFieldValue).length > 0 ||
      (preferred?.jobCustomFields &&
        typeof preferred.jobCustomFields === "object" &&
        Object.keys(preferred.jobCustomFields).length > 0);
    if (!hasJobCf) {
      console.log("No custom field data returned for job " + preferredId);
    }

    const mapped = {
      id: String(preferred?._attributes?.id ?? preferred?.id ?? ""),
      name: String(preferred?.name ?? preferred?.JobName ?? ""),
      status: String(
        preferred?._attributes?.jobStatus ??
          preferred?._attributes?.status ??
          preferred?.jobStatus ??
          preferred?.status ??
          ""
      ),
      salesperson: toNonEmptyString(preferred?.salesperson?.name) || extractSalesperson(preferred) || "",
      totalSqFt:
        toNonEmptyString(preferred?.totalSqFt) ||
        (Number.isFinite(preferred?.worksheetSqFtTotal)
          ? String(preferred.worksheetSqFtTotal)
          : "") ||
        extractSqFt(preferred) ||
        extractCustomFieldValue(preferred, "3")
    };

    console.log("Full Job Data Sample:", JSON.stringify(preferred, null, 2));
    await fs.writeFile(
      path.join(process.cwd(), "output-debug_head.json"),
      JSON.stringify(mapped),
      "utf8"
    );
    return;
  }

  // Phase 2: Normalization (CSV-driven key translation)
  console.log("Step 3: Normalizing data...");
  const mappingCsvPath = path.isAbsolute(args.mapping)
    ? args.mapping
    : path.join(process.cwd(), args.mapping);
  const normalizedData = await normalizePayload({ rawPayload, mappingCsvPath });

  // Phase 3: Switchboard Router (plumbing only; single debug head for now)
  console.log("Step 4: Routing to Switchboard...");
  await runSwitchboard({
    normalizedData,
    heads: [debugHead, salesHead],
    outputDir: process.cwd()
  });
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exitCode = 1;
});

