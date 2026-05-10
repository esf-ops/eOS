/**
 * Moraware discovery v2 — schema probes + eOS Brain artifacts (Axios + raw XML).
 * Env: MORAWARE_DISCOVERY=1 MORAWARE_JOB_ID=... MORAWARE_ACCOUNT_ID=...
 * First-form jobForm matrix is diagnostic-only: `MORAWARE_FORCE_FIRST_FORM_MATRIX=1`.
 * JobForm field placement V3 (diagnostic only): requires **both** `MORAWARE_JOBFORM_MATRIX_V3=1` **and** `MORAWARE_FORCE_V3=1`; stops after V3 artifacts (no PDF/Firehose).
 * SDK-aligned forms: Moraware trace shows fields via include `<formField>` → response `formFields.jobField` (no fieldIndicator).
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import axios from "axios";

import {
  buildJobFormsAllFieldsCommand,
  buildJobFormAllFieldsCommand,
  normalizeJobFormsFromSdkParsed,
  computeWorksheetSqFtMetrics,
  assertNoBlockingMorawareErrors
} from "./morawareJobFormsSdk.js";

import { buildMorawareCommandXml, parseXmlToObject } from "./morawareClient.js";
import { buildJobIncludeAllCommand } from "./morawareClient.js";
import { deriveOperationalSummary, normalizeJobOperational } from "./morawareOperational.js";

export {
  buildJobFormsAllFieldsCommand,
  buildJobFormAllFieldsCommand,
  buildJobFormsAllFieldsCommand as buildJobFormsAllFieldsQuery,
  buildJobFormAllFieldsCommand as buildJobFormAllFieldsQuery
} from "./morawareJobFormsSdk.js";

export { shouldOmitPaging } from "./morawareClient.js";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import {
  isSupabaseEnabled,
  isSupabaseWriteEnabled,
  upsertBrainJob,
  upsertBrainForms,
  upsertBrainFields,
  saveSyncRun,
  replaceJobOperational,
  recordFailedJobSync
} from "../backend-core/src/brain/supabaseBrainStore.js";

/** PDF acceptance reference — never injected into normalized brain; comparison only when fixtureMatchEligible. */
/** Reserved — Decor-Ferguson PDF is matched by identity fields only, never by hardcoded live job id. */
export const DEV_ACCEPTANCE_JOB_ID = "";
export const DEV_ACCEPTANCE_FIXTURE = {
  jobName: "319 Decor-Ferguson##$",
  accountName: "Dyersville ESF",
  salesperson: "Casey Schenke",
  worksheetCount: 7,
  sqFtFieldCount: 7,
  totalSqFt: 201.5,
  filesExpected: 11,
  phasesExpected: 3,
  issuesExpected: 3,
  perFormSqFt: [
    { name: 'Job Worksheet- 39" Powder', sqFt: 6.5 },
    { name: 'Job Worksheet- 60" Vanity upper kids', sqFt: 13 },
    { name: 'Job Worksheet- 66" Master', sqFt: 11 },
    { name: "Job Worksheet- Kitchen", sqFt: 104 },
    { name: "Job Worksheet- Kitchen Backsplash", sqFt: 55 },
    { name: "Job Worksheet- Kitchen FH Shelf (Remake)", sqFt: 2 },
    { name: "Job Worksheet- Laundry", sqFt: 10 }
  ]
};

function walkObjectDeep(node, pth, visitor) {
  visitor(pth, node);
  if (node == null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkObjectDeep(item, `${pth}[${i}]`, visitor));
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    const next = pth ? `${pth}.${k}` : k;
    walkObjectDeep(v, next, visitor);
  }
}

function envTruthy(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function jobFormMatrixV3Enabled() {
  return envTruthy(process.env.MORAWARE_JOBFORM_MATRIX_V3) && envTruthy(process.env.MORAWARE_FORCE_V3);
}

export function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

export function getText(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (Array.isArray(value)) return getText(value[0]);
  if (typeof value === "object") {
    const t = value._text ?? value["#text"];
    if (t != null) return String(t).trim();
  }
  return "";
}

export function getAttr(node, attrName) {
  const a = node?._attributes?.[attrName];
  return a != null ? String(a).trim() : "";
}

export function walkObject(node, path, visitor) {
  visitor(path, node);
  if (node == null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkObject(item, `${path}[${i}]`, visitor));
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === "_attributes") continue;
    const next = path ? `${path}.${k}` : k;
    walkObject(v, next, visitor);
  }
}

/** Normalize labels for Sq.Ft. detection: lowercase, trim, strip colon/periods, collapse space, unify sq ft. */
export function normalizeLabel(label) {
  let s = String(label ?? "").trim().toLowerCase();
  s = s.replace(/:/g, " ");
  s = s.replace(/\./g, "");
  s = s.replace(/\s+/g, " ");
  s = s.replace(/sqft/gi, "sq ft");
  s = s.replace(/sq\s*ft/gi, "sq ft");
  s = s.replace(/square\s+feet/gi, "sq ft");
  return s.trim();
}

export function parseMaybeNumber(raw) {
  return parseNumericFieldValue(raw);
}

export function parseNumericFieldValue(raw) {
  if (raw == null) return null;
  if (typeof raw === "boolean") return null;
  const s = String(raw).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === "true" || lower === "false" || lower === "yes" || lower === "no") return null;
  const m = s.match(/[\d,]+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number.parseFloat(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function isSqFtNormalizedLabel(norm, rawLabel) {
  const raw = String(rawLabel ?? "").trim();
  const n = normalizeLabel(raw);
  if (raw === "Sq.Ft." || /^sq\.?\s*ft\.?$/i.test(raw.replace(/\s+/g, " ").trim())) return true;
  if (n === "sq ft" || n.endsWith(" sq ft") || n.includes("sq ft")) return true;
  const collapsed = n.replace(/\s+/g, "");
  if (collapsed === "sqft") return true;
  if (n.includes("square feet")) return true;
  return false;
}

function redactSessionId(xml) {
  return String(xml).replace(/sessionId="[^"]*"/gi, 'sessionId="[REDACTED]"');
}

function safeFilePart(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 96);
}

async function mkdirp(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function timestampFolderName(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function normalizeCompare(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[#$]/g, "")
    .replace(/\s+/g, " ");
}

export function resolveDiscoveryRuntimeMode(inputJobId, expectedJobNameEnv) {
  const explicit = String(process.env.MORAWARE_DISCOVERY_MODE ?? "").trim().toLowerCase();
  if (
    explicit === "exact-job" ||
    explicit === "find-fixture" ||
    explicit === "account-firehose" ||
    explicit === "account-sync" ||
    explicit === "global-sync" ||
    explicit === "operational-discovery"
  ) {
    return explicit;
  }
  if (inputJobId) return "exact-job";
  if (expectedJobNameEnv) return "find-fixture";
  return "account-firehose";
}

/**
 * PDF fixture (Decor-Ferguson) eligibility from API job row only — comparison-only; never merge into brain as facts.
 * Display Tops and other live jobs must return eligible=false.
 */
export function evaluateDecorFergusonPdfFixtureEligibility(job) {
  const breakdown = [];
  if (!job || typeof job !== "object") {
    return {
      eligible: false,
      skippedReason: "No job row from API.",
      breakdown
    };
  }

  const name = normalizeCompare(getText(job.name));
  const account = normalizeCompare(getText(job.account?.name));
  const creationRaw = getText(job.creationDate);
  const creation = normalizeCompare(creationRaw);
  const salesperson = normalizeCompare(getText(job.salesperson?.name));

  if (name.includes("display tops")) {
    return {
      eligible: false,
      skippedReason: "Returned job is Display Tops, not Decor-Ferguson PDF fixture.",
      breakdown: ["display-tops"]
    };
  }

  if (!name.includes("decor") || !name.includes("ferguson")) {
    return {
      eligible: false,
      skippedReason: 'Job name must contain both "decor" and "ferguson" for PDF fixture comparison.',
      breakdown: ["name-mismatch"]
    };
  }
  breakdown.push("name");

  if (account) {
    if (!account.includes("dyersville") && !account.includes("esf")) {
      return {
        eligible: false,
        skippedReason: "Account present but does not contain dyersville or esf.",
        breakdown
      };
    }
    breakdown.push("account");
  }

  if (creationRaw) {
    const dateOk = creation.includes("2024-11-27") || creation.includes("11/27/2024");
    if (!dateOk) {
      return {
        eligible: false,
        skippedReason: "creationDate does not match PDF fixture (2024-11-27 / 11/27/2024).",
        breakdown
      };
    }
    breakdown.push("creationDate");
  }

  if (salesperson) {
    if (!salesperson.includes("casey") || !salesperson.includes("schenke")) {
      return {
        eligible: false,
        skippedReason: "Salesperson does not match Casey Schenke.",
        breakdown
      };
    }
    breakdown.push("salesperson");
  }

  return { eligible: true, skippedReason: "", breakdown };
}

function extractMorawareErrors(parsed) {
  const errors = [];
  walkObject(parsed, "", (pth, node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const ec = node.errorCode ?? node.ErrorCode ?? node._attributes?.errorCode ?? node._attributes?.ErrorCode;
    if (ec === undefined || ec === null || ec === "") return;
    if (
      !/(\.(error|schemaerror|fault))$/i.test(pth) &&
      !/^MorawareResponse\.(error|schemaError|fault)/i.test(pth)
    ) {
      return;
    }
    errors.push({
      path: pth,
      errorCode: String(ec),
      errorCodeDescription: getText(node.errorCodeDescription ?? node.ErrorCodeDescription),
      description: getText(node.description ?? node.Description ?? node.message ?? node.Message)
    });
  });
  return errors;
}

function hasBlockingMorawareError(apiErrors) {
  return apiErrors.some((e) => {
    const c = e.errorCode;
    return c !== "0" && c !== "false" && Number(c) !== 0;
  });
}

function jobRowFromQuery(jq, preferredJobId) {
  if (!jq) return null;
  const jobs = asArray(jq?.job);
  if (preferredJobId) {
    const want = String(preferredJobId).trim();
    const hit = jobs.find((j) => String(j?._attributes?.id ?? j?.id ?? "").trim() === want);
    if (hit) return hit;
  }
  return jobs.find((j) => j && typeof j === "object") || (jq.job && typeof jq.job === "object" ? jq.job : null);
}

export function extractJobNode(parsed, preferredJobId) {
  return jobRowFromQuery(parsed?.MorawareResponse?.jobQuery, preferredJobId);
}

function extractAccountJobIds(parsed) {
  const jq = parsed?.MorawareResponse?.jobQuery;
  return asArray(jq?.job)
    .map((j) => String(j?._attributes?.id ?? j?.id ?? "").trim())
    .filter(Boolean);
}

/** Parse MorawareResponse.jobFormQuery.job.jobForms.jobForm (+ tolerant variants). */
export function extractFormIdsFromJobFormQuery(parsed) {
  const jfq = parsed?.MorawareResponse?.jobFormQuery;
  if (!jfq || typeof jfq !== "object") return [];

  const jobNode = jfq.job && typeof jfq.job === "object" ? jfq.job : null;
  let bag = jobNode?.jobForms ?? jfq.jobForms ?? jobNode?.JobForms ?? jfq.JobForms;
  if (!bag || typeof bag !== "object") {
    const direct = jfq.jobForm ?? jfq.JobForm;
    const rows = asArray(direct);
    return rows.map((r, i) => ({
      id: String(r?._attributes?.id ?? getAttr(r, "id") ?? "").trim(),
      name: getText(r?.name) || null,
      phaseName: null,
      sourcePath: `MorawareResponse.jobFormQuery.jobForm[${i}]`,
      raw: r
    })).filter((x) => x.id);
  }

  const rows = asArray(bag.jobForm ?? bag.JobForm);
  return rows
    .map((r, i) => ({
      id: String(r?._attributes?.id ?? getAttr(r, "id") ?? "").trim(),
      name: getText(r?.name) || null,
      phaseName: getText(r?.phase?.name) || null,
      sourcePath: `MorawareResponse.jobFormQuery.job.jobForms.jobForm[${i}]`,
      raw: r
    }))
    .filter((x) => x.id);
}

/** Collect jobForm-shaped nodes anywhere under MorawareResponse.jobFormQuery. */
export function extractJobFormNodes(parsed) {
  const root = parsed?.MorawareResponse?.jobFormQuery;
  if (!root || typeof root !== "object") return [];

  const seen = new Set();
  const forms = [];

  const pushForm = (node) => {
    if (!node || typeof node !== "object") return;
    const id = String(getAttr(node, "id") ?? node._attributes?.id ?? "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    forms.push(node);
  };

  for (const bag of [
    asArray(root.job?.jobForms?.jobForm),
    asArray(root.jobForms?.jobForm),
    asArray(root.jobForm),
    asArray(root.JobForm)
  ]) {
    for (const row of bag) pushForm(row);
  }

  walkObject(root, "", (pth, node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    if (/jobFormField/i.test(pth)) return;
    if (!/\.jobForm$/i.test(pth) && !/jobForms\.jobForm(\[\d+\])?$/.test(pth)) return;
    pushForm(node);
  });

  return forms;
}

export function extractFormMeta(jobFormNode) {
  if (!jobFormNode || typeof jobFormNode !== "object") {
    return {
      formId: "",
      formName: "",
      formTemplateName: "",
      phaseName: "",
      phaseId: "",
      phaseSeqNum: "",
      jobFormJobId: ""
    };
  }
  const formId = String(
    getAttr(jobFormNode, "id") ?? jobFormNode._attributes?.id ?? jobFormNode.JobFormId ?? ""
  ).trim();
  const formName =
    getText(jobFormNode.jobFormName) ||
    getText(jobFormNode.JobFormName) ||
    getText(jobFormNode.name) ||
    getText(jobFormNode.Name);
  const formTemplateName =
    getText(jobFormNode.formTemplateName) ||
    getText(jobFormNode.FormTemplateName) ||
    getText(jobFormNode.formTemplate?.name) ||
    getText(jobFormNode.FormTemplate?.name);

  const jobRef = jobFormNode.job ?? jobFormNode.Job;
  const jobFormJobId = String(getAttr(jobRef, "id") ?? jobRef?._attributes?.id ?? "").trim();

  let phaseName = "";
  let phaseId = "";
  let phaseSeqNum = "";
  const phases = jobFormNode.jobPhases ?? jobFormNode.JobPhases ?? jobFormNode.phases;
  const phRows = asArray(phases?.jobPhase ?? phases?.JobPhase ?? phases?.phase ?? phases?.Phase);
  for (const ph of phRows) {
    const pn = getText(ph?.name ?? ph?.Name);
    if (pn) {
      phaseName = pn;
      phaseId = String(getAttr(ph, "id") ?? ph?._attributes?.id ?? "").trim();
      phaseSeqNum = String(getAttr(ph, "seqNum") ?? ph?._attributes?.seqNum ?? "").trim();
      break;
    }
  }
  return { formId, formName, formTemplateName, phaseName, phaseId, phaseSeqNum, jobFormJobId };
}

export function extractFieldsFromJobFormNode(jobFormNode, meta) {
  const mBase = extractFormMeta(jobFormNode);
  const formId = meta.formId || mBase.formId;
  const formName = meta.formName || mBase.formName;
  const phaseName = meta.phaseName || mBase.phaseName;
  const formTemplateName =
    meta.formTemplateName !== undefined && meta.formTemplateName !== null && meta.formTemplateName !== ""
      ? meta.formTemplateName
      : mBase.formTemplateName || null;

  const rows = [];

  const formFields = jobFormNode.formFields ?? jobFormNode.FormFields;
  const jobFieldRows = asArray(formFields?.jobField ?? formFields?.JobField);
  for (const row of jobFieldRows) {
    if (!row || typeof row !== "object") continue;

    const label = getText(row.name) || getText(row.Name);
    const valueRaw = row.value ?? row.Value;
    const value =
      typeof valueRaw === "object" && valueRaw !== null ? getText(valueRaw) : String(valueRaw ?? "").trim();

    const fieldId = getAttr(row, "id") || String(row._attributes?.id ?? "").trim();
    const fieldValueId =
      typeof valueRaw === "object" && valueRaw !== null
        ? getAttr(valueRaw, "id") || String(valueRaw._attributes?.id ?? "").trim()
        : "";

    const formFieldDataType = getAttr(row, "dataType") || String(row._attributes?.dataType ?? "").trim();

    const normalizedLabel = normalizeLabel(label);
    const numericValue = parseMaybeNumber(value);

    rows.push({
      formId: formId || null,
      formName: formName || null,
      formTemplateName: formTemplateName || null,
      phaseName: phaseName || null,
      fieldId: fieldId || null,
      label,
      normalizedLabel,
      value,
      numericValue,
      fieldValueId: fieldValueId || null,
      formFieldDataType: formFieldDataType || null,
      sourcePath: "sdk:formFields.jobField",
      extractor: "sdk-formFields-jobField",
      raw: row
    });
  }

  const containers = [
    { root: jobFormNode.fieldValues ?? jobFormNode.FieldValues, keys: ["jobFormFieldValue", "JobFormFieldValue", "fieldValue", "FieldValue"] },
    { root: jobFormNode.jobFormFieldValues ?? jobFormNode.JobFormFieldValues, keys: ["jobFormFieldValue", "JobFormFieldValue"] },
    { root: jobFormNode.jobFormFields ?? jobFormNode.JobFormFields, keys: ["jobFormField", "JobFormField"] }
  ];

  for (const { root, keys } of containers) {
    if (!root || typeof root !== "object") continue;
    for (const k of keys) {
      for (const row of asArray(root[k])) {
        if (!row || typeof row !== "object") continue;

        const label =
          getText(row.jobFormFieldName) ||
          getText(row.JobFormFieldName) ||
          getText(row.fieldName) ||
          getText(row.name) ||
          getText(row.label) ||
          getAttr(row, "jobFormFieldName") ||
          getAttr(row, "name");

        const value =
          getText(row.fieldValue) ||
          getText(row.FieldValue) ||
          getText(row.value) ||
          getText(row.displayValue) ||
          getAttr(row, "fieldValue") ||
          getAttr(row, "value");

        const fieldValueId =
          getText(row.fieldValueId) ||
          getText(row.FieldValueId) ||
          getAttr(row, "fieldValueId");

        const formFieldDataType =
          getText(row.formFieldDataType) ||
          getText(row.FormFieldDataType) ||
          getAttr(row, "formFieldDataType");

        if (!label || value === "") continue;

        const normalizedLabel = normalizeLabel(label);
        const numericValue = parseMaybeNumber(value);

        rows.push({
          formId: formId || null,
          formName: formName || null,
          formTemplateName: formTemplateName || null,
          phaseName: phaseName || null,
          fieldId: null,
          label,
          normalizedLabel,
          value,
          numericValue,
          fieldValueId: fieldValueId || null,
          formFieldDataType: formFieldDataType || null,
          sourcePath: `official:${k}`,
          extractor: "jobForm-official",
          raw: row
        });
      }
    }
  }

  return rows;
}

function countOfficialFieldsFromJobFormQuery(parsed) {
  let n = 0;
  for (const f of extractJobFormNodes(parsed)) {
    const meta = extractFormMeta(f);
    n += extractFieldsFromJobFormNode(f, meta).length;
  }
  return n;
}

function extractCollectionsFromJobQuery(parsed, key, preferredJobId) {
  const jq = parsed?.MorawareResponse?.jobQuery;
  if (!jq) return [];
  const job = jobRowFromQuery(jq, preferredJobId);
  const direct = jq[key];
  const nested = job?.[key];
  const bag = direct ?? nested;
  if (!bag || typeof bag !== "object") return [];
  let singular = "jobActivity";
  if (key === "jobActivities") singular = "jobActivity";
  else if (key === "jobIssues") singular = "jobIssue";
  else if (key === "files") singular = "file";
  else if (key === "phases") singular = "phase";
  else if (key === "jobForms") singular = "jobForm";
  else if (key === "forms") singular = "form";
  const rows = bag[singular];
  return asArray(rows).filter((x) => x && typeof x === "object");
}

function mergeBrainCollections(brain, probeName, parsed, preferredJobId) {
  for (const a of extractCollectionsFromJobQuery(parsed, "jobActivities", preferredJobId)) {
    brain.activities.push({ probeName, raw: a });
  }
  for (const f of extractCollectionsFromJobQuery(parsed, "files", preferredJobId)) {
    brain.files.push({ probeName, raw: f });
  }
  for (const ph of extractCollectionsFromJobQuery(parsed, "phases", preferredJobId)) {
    brain.phases.push({ probeName, raw: ph });
  }
  for (const iss of extractCollectionsFromJobQuery(parsed, "jobIssues", preferredJobId)) {
    brain.issues.push({ probeName, raw: iss });
  }
}

function applyJobInfo(brain, parsed, preferredJobId) {
  const job = extractJobNode(parsed, preferredJobId);
  if (!job) return;
  const jn = getText(job.name);
  if (jn) brain.jobInfo.jobName = jn;
  const an = getText(job.account?.name);
  if (an) brain.jobInfo.accountName = an;
  const sn = getText(job.salesperson?.name);
  if (sn) brain.jobInfo.salespersonName = sn;
  const cd = getText(job.creationDate);
  if (cd) brain.jobInfo.creationDate = cd;
  const notes = getText(job.notes);
  if (notes) brain.jobInfo.notes = notes;
}

function applyAddresses(brain, parsed, preferredJobId) {
  const job = extractJobNode(parsed, preferredJobId);
  if (!job) return;
  const addr =
    getText(job.jobAddress) ||
    getText(job.address) ||
    getText(job.shipToAddress) ||
    getText(job.installAddress);
  if (addr) brain.addresses.jobAddress = addr;
}

function countLeaves(node) {
  let n = 0;
  walkObject(node, "", (_p, v) => {
    if (v == null) return;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") n += 1;
  });
  return n;
}

function appendLeafDump(parsed, probeName, lines) {
  walkObject(parsed, "", (pth, v) => {
    if (v == null) return;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      lines.push(`[${probeName}] ${pth} = ${JSON.stringify(v)}`);
    }
  });
}

export function extractFieldLikeRecordsAggressive(parsed, meta = {}) {
  const out = [];
  if (!parsed || typeof parsed !== "object") return out;

  walkObject(parsed, "", (pth, node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;

    const label =
      getText(node.label) ||
      getText(node.name) ||
      getText(node.jobFormFieldName) ||
      getText(node.fieldName) ||
      getAttr(node, "name") ||
      getAttr(node, "jobFormFieldName");

    let valueRaw =
      node.value ??
      node.fieldValue ??
      node.FieldValue ??
      node.displayValue ??
      node.Value ??
      node.FieldValue;
    if (valueRaw === undefined) {
      valueRaw = getAttr(node, "value") || getAttr(node, "fieldValue") || getAttr(node, "displayValue");
    }

    const value =
      typeof valueRaw === "object" && valueRaw !== null ? getText(valueRaw) : String(valueRaw ?? "").trim();

    const attrLab =
      getAttr(node, "name") ||
      getAttr(node, "label") ||
      getAttr(node, "jobFormFieldName") ||
      node._attributes?.jobFormFieldName;
    const attrVal =
      getAttr(node, "value") ||
      getAttr(node, "fieldValue") ||
      node._attributes?.fieldValue;

    const effectiveLabel = label || (attrLab ? String(attrLab).trim() : "");
    const effectiveVal = value || (attrVal != null ? String(attrVal).trim() : "");

    const pathHints =
      /fieldvalues|fieldvalue|jobformfieldvalues|jobformfields|jobformfieldvalue|jobformfieldname|fieldname|displayvalue|\blabel\b|\bvalue\b|\bname\b|customfields/i.test(
        pth
      );

    if ((!effectiveLabel || effectiveVal === "") && !pathHints) return;
    if (!effectiveLabel || effectiveVal === "") return;

    const normalizedLabel = normalizeLabel(effectiveLabel);
    const numericValue = parseMaybeNumber(effectiveVal);

    out.push({
      formId: meta.formId ?? null,
      formName: meta.formName ?? null,
      phaseName: meta.phaseName ?? null,
      label: effectiveLabel,
      normalizedLabel,
      value: effectiveVal,
      numericValue,
      sourcePath: pth,
      probeName: meta.probeName ?? null,
      raw: node
    });
  });

  return out;
}

function extractAdditionalJobFormValuePaths(parsed, meta = {}) {
  const out = [];
  if (!parsed || typeof parsed !== "object") return out;

  walkObject(parsed, "", (pth, node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;

    const fn =
      getText(node.JobFormFieldName) ||
      getText(node.jobFormFieldName) ||
      getText(node.fieldName) ||
      getText(node.FieldName);
    const fv =
      getText(node.FieldValue) ||
      getText(node.fieldValue) ||
      getText(node.Value) ||
      getText(node.displayValue) ||
      getText(node.DisplayValue);
    if (!fn?.trim() || !fv?.trim()) return;

    const normalizedLabel = normalizeLabel(fn);
    const numericValue = parseMaybeNumber(fv);

    out.push({
      formId: meta.formId ?? null,
      formName: meta.formName ?? null,
      phaseName: meta.phaseName ?? null,
      label: fn.trim(),
      normalizedLabel,
      value: fv.trim(),
      numericValue,
      sourcePath: pth,
      probeName: meta.probeName ?? null,
      extractor: "jobForm-field-name-value-pair",
      raw: node
    });
  });

  return out;
}

function mergedAggressiveJobFormFieldRows(parsed, meta = {}) {
  const a = extractFieldLikeRecordsAggressive(parsed, meta);
  const b = extractAdditionalJobFormValuePaths(parsed, meta);
  const seen = new Set();
  const rows = [];
  for (const row of [...a, ...b]) {
    const k = `${row.sourcePath}\t${row.label}\t${row.value}`;
    if (seen.has(k)) continue;
    seen.add(k);
    rows.push(row);
  }
  return rows;
}

function responseHasNonEmptyFieldStructures(parsed) {
  const nodes = extractJobFormNodes(parsed);
  for (const jf of nodes) {
    const ff = jf.formFields ?? jf.FormFields;
    const jrows = asArray(ff?.jobField ?? ff?.JobField);
    if (
      jrows.some((r) => r && typeof r === "object" && Object.keys(r).some((x) => x !== "_attributes"))
    ) {
      return true;
    }
    const keys = [
      "fieldValues",
      "FieldValues",
      "jobFormFieldValues",
      "JobFormFieldValues",
      "jobFormFields",
      "JobFormFields"
    ];
    for (const k of keys) {
      const bag = jf[k];
      if (!bag || typeof bag !== "object") continue;
      const innerKeys = [
        "jobFormFieldValue",
        "JobFormFieldValue",
        "jobFormField",
        "JobFormField",
        "fieldValue",
        "FieldValue"
      ];
      for (const ik of innerKeys) {
        const rows = asArray(bag[ik]);
        if (
          rows.some((r) => r && typeof r === "object" && Object.keys(r).some((x) => x !== "_attributes"))
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function classifyJobFormProbeSemantics(parsed, aggressiveRowCount) {
  const official = countOfficialFieldsFromJobFormQuery(parsed);
  const structs = responseHasNonEmptyFieldStructures(parsed);
  if (official > 0 || aggressiveRowCount > 0 || structs) {
    return {
      status: "success",
      reason: `fields: official=${official}, aggressiveRows=${aggressiveRowCount}, nonEmptyContainers=${structs}`
    };
  }

  const nodes = extractJobFormNodes(parsed);
  const nm =
    nodes.map((n) => getText(n.name)).find((x) => String(x ?? "").trim().length > 0) ||
    getText(parsed?.MorawareResponse?.jobFormQuery?.jobForm?.name) ||
    getText(parsed?.MorawareResponse?.jobFormQuery?.job?.name);

  if (nm && String(nm).trim()) {
    return { status: "partial", reason: "form metadata (e.g. name) without field rows" };
  }

  return { status: "no-data", reason: "id-only or empty containers" };
}

function countUsefulLeavesForV3(parsed) {
  let n = 0;
  walkObjectDeep(parsed, "", (pth, v) => {
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") return;
    if (/\._attributes\.id$/i.test(pth)) return;
    n += 1;
  });
  return n;
}

function appendV3FormLeafDump(parsed, probeTag, lines) {
  walkObjectDeep(parsed, "", (pth, v) => {
    if (v == null) return;
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") return;
    if (/\._attributes\.id$/i.test(pth)) return;
    lines.push(`[${probeTag}] ${pth} = ${JSON.stringify(v)}`);
  });
}

function scoreJobCandidate(job) {
  if (!job) return { score: 0, breakdown: [] };
  const name = normalizeCompare(getText(job.name));
  const account = normalizeCompare(getText(job.account?.name));
  const sp = normalizeCompare(getText(job.salesperson?.name));
  const cd = normalizeCompare(getText(job.creationDate));
  let score = 0;
  const breakdown = [];
  if (name.includes("decor")) {
    score += 5;
    breakdown.push("name+decor");
  }
  if (name.includes("ferguson")) {
    score += 5;
    breakdown.push("name+ferguson");
  }
  if (account.includes("dyersville")) {
    score += 3;
    breakdown.push("account+dyersville");
  }
  if (account.includes("esf")) {
    score += 3;
    breakdown.push("account+esf");
  }
  if (sp.includes("casey") && sp.includes("schenke")) {
    score += 2;
    breakdown.push("salesperson+casey-schenke");
  }
  if (cd.includes("2024-11-27") || cd.includes("11/27/2024")) {
    score += 2;
    breakdown.push("creationDate");
  }
  return { score, breakdown };
}

/** Decor-Ferguson find-fixture resolver only — stricter weights than account-firehose heuristic scoring. */
const MIN_FIXTURE_SCORE = 20;

function expectedJobNameVeryStrongMatch(returnedName, expectedEnv) {
  if (!expectedEnv) return false;
  const ret = normalizeCompare(returnedName);
  const exp = normalizeCompare(expectedEnv);
  if (!ret || !exp) return false;
  if (ret === exp) return true;
  if (ret.includes(exp) || exp.includes(ret)) return true;
  const sigTokens = exp.split(/\s+/).filter((t) => t.length > 1 && !/^\d+$/.test(t));
  return sigTokens.length >= 2 && sigTokens.every((t) => ret.includes(t));
}

function computeFindFixtureNameGate(job, expectedJobNameEnv) {
  const rawName = getText(job?.name);
  const name = normalizeCompare(rawName);
  const hasDecorFerguson = name.includes("decor") && name.includes("ferguson");
  const strong = expectedJobNameVeryStrongMatch(rawName, expectedJobNameEnv);
  const isFixtureCandidate = hasDecorFerguson || strong;
  const rejectReason = isFixtureCandidate ? "" : "job name does not contain both decor and ferguson";
  return { isFixtureCandidate, rejectReason };
}

function scoreFindFixtureDecorCandidate(job) {
  if (!job) return { score: 0, breakdown: [] };
  const name = normalizeCompare(getText(job.name));
  const account = normalizeCompare(getText(job.account?.name));
  const sp = normalizeCompare(getText(job.salesperson?.name));
  const cd = normalizeCompare(getText(job.creationDate));
  let score = 0;
  const breakdown = [];
  if (name.includes("decor")) {
    score += 10;
    breakdown.push("name+decor");
  }
  if (name.includes("ferguson")) {
    score += 10;
    breakdown.push("name+ferguson");
  }
  if (account.includes("dyersville esf")) {
    score += 5;
    breakdown.push("account+dyersville-esf");
  }
  if (account.includes("dyersville")) {
    score += 3;
    breakdown.push("account+dyersville");
  }
  if (account.includes("esf")) {
    score += 3;
    breakdown.push("account+esf");
  }
  if (cd.includes("2024-11-27") || cd.includes("11/27/2024")) {
    score += 5;
    breakdown.push("creationDate");
  }
  if (sp.includes("casey schenke")) {
    score += 2;
    breakdown.push("salesperson+casey-schenke");
  }
  return { score, breakdown };
}

function buildFindFixtureCandidateRow(rawJob, meta) {
  const { id, source, pageIndex, probeStatus, expectedJobNameEnv } = meta;
  const nameGate = computeFindFixtureNameGate(rawJob, expectedJobNameEnv);
  const { score, breakdown } = scoreFindFixtureDecorCandidate(rawJob);
  const row = {
    id,
    name: getText(rawJob?.name),
    status: getText(rawJob?.jobStatus),
    creationDate: getText(rawJob?.creationDate),
    account: getText(rawJob?.account?.name),
    salesperson: getText(rawJob?.salesperson?.name),
    score,
    breakdown,
    isFixtureCandidate: nameGate.isFixtureCandidate,
    rejectReason: nameGate.rejectReason,
    source,
    pageIndex: pageIndex ?? "",
    probeStatus: probeStatus ?? "",
    rawJob
  };
  return row;
}

function pickSelectableFindFixtureCandidate(pool) {
  const selectable = pool.filter((r) => r.isFixtureCandidate && r.score >= MIN_FIXTURE_SCORE);
  if (!selectable.length) return null;
  return [...selectable].sort((a, b) => b.score - a.score)[0];
}

function printFindFixtureCandidateTable(title, rows) {
  console.log(`\n=== ${title} ===`);
  console.log(
    "id | score | isFixtureCandidate | name | status | creationDate | account | salesperson | rejectReason"
  );
  for (const r of rows) {
    console.log(
      `${r.id} | ${r.score} | ${r.isFixtureCandidate} | ${r.name} | ${r.status} | ${r.creationDate} | ${r.account} | ${r.salesperson} | ${r.rejectReason || ""}`
    );
  }
}

function parseMaxSearchPagesForFixture() {
  const raw = process.env.MORAWARE_MAX_SEARCH_PAGES;
  if (raw === undefined || raw === null || String(raw).trim() === "") return 50;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 50;
}

function isEnvSet(name) {
  const v = process.env[name];
  return v !== undefined && v !== null && String(v).trim() !== "";
}

function parseIsoDateToMsOrNull(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return null;
  const ms = Date.parse(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

function safeMin(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

function safeMax(a, b) {
  if (a == null) return b;
  if (b == null) return a;
  return Math.max(a, b);
}

function clampNumber(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function randInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function pickRandomDistinct(arr, count, excludeSet = new Set()) {
  const out = [];
  const seen = new Set(excludeSet);
  if (!Array.isArray(arr) || arr.length === 0) return out;
  const limit = Math.min(count, arr.length);
  let guard = 0;
  while (out.length < limit && guard < 10_000) {
    guard += 1;
    const v = arr[randInt(arr.length)];
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function envCsvList(name) {
  return String(process.env[name] ?? "")
    .split(",")
    .map((s) => String(s).trim())
    .filter(Boolean);
}

async function readJsonIfExists(p) {
  try {
    const txt = await fs.readFile(p, "utf8");
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function supabaseClientOrNull() {
  const url = String(process.env.SUPABASE_URL ?? "").trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function loadOperationalCandidateJobs(repoRoot, sampleYear = 2026) {
  // Prefer Supabase (if present), fallback to local jobs/index.json.
  const supabase = supabaseClientOrNull();
  if (supabase) {
    const start = `${sampleYear}-01-01`;
    const endExclusive = `${sampleYear + 1}-01-01`;
    const rows = [];
    let from = 0;
    const pageSize = 1000;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase
        .from("brain_jobs")
        .select("job_id,job_name,account_name,creation_date,salesperson_name,worksheet_sqft,form_count,field_count")
        .gte("creation_date", start)
        .lt("creation_date", endExclusive)
        .order("worksheet_sqft", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw new Error(`Supabase read brain_jobs failed: ${error.message}`);
      if (!data || data.length === 0) break;
      rows.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return rows.map((r) => ({
      jobId: String(r.job_id),
      jobName: String(r.job_name ?? ""),
      accountName: String(r.account_name ?? ""),
      creationDate: r.creation_date ? String(r.creation_date) : "",
      salespersonName: String(r.salesperson_name ?? ""),
      worksheetSqFt: Number(r.worksheet_sqft ?? 0) || 0
    }));
  }

  const latestIndexPath = path.join(repoRoot, "debug", "moraware", "latest", "jobs", "index.json");
  const local = await readJsonIfExists(latestIndexPath);
  if (Array.isArray(local)) return local;
  return [];
}

function makeOperationalProbeList(jobId) {
  const probes = [];

  probes.push({
    id: "A1-jobQuery-expanded",
    commandName: "jobQuery",
    innerXml:
      `<jobQuery>\n` +
      `  <filter xmlns="">\n` +
      `    <job id="${jobId}"/>\n` +
      `  </filter>\n` +
      `  <include xmlns="">\n` +
      `    <name/>\n` +
      `    <jobStatus/>\n` +
      `    <creationDate/>\n` +
      `    <account><name/></account>\n` +
      `    <salesperson><name/></salesperson>\n` +
      `    <notes/>\n` +
      `    <jobPhase><all/></jobPhase>\n` +
      `  </include>\n` +
      `</jobQuery>`
  });

  probes.push({
    id: "A2-jobQuery-include-all",
    commandName: "jobQuery",
    innerXml:
      `<jobQuery>\n` +
      `  <filter xmlns="">\n` +
      `    <job id="${jobId}"/>\n` +
      `  </filter>\n` +
      `  <include xmlns="">\n` +
      `    <all/>\n` +
      `  </include>\n` +
      `</jobQuery>`
  });

  probes.push({
    id: "A3-jobQuery-jobPhase-expanded",
    commandName: "jobQuery",
    innerXml:
      `<jobQuery>\n` +
      `  <filter xmlns="">\n` +
      `    <job id="${jobId}"/>\n` +
      `  </filter>\n` +
      `  <include xmlns="">\n` +
      `    <jobPhase>\n` +
      `      <name/>\n` +
      `      <jobStatus/>\n` +
      `      <status/>\n` +
      `      <startDate/>\n` +
      `      <endDate/>\n` +
      `      <assignedTo/>\n` +
      `      <employee/>\n` +
      `      <resource/>\n` +
      `    </jobPhase>\n` +
      `  </include>\n` +
      `</jobQuery>`
  });

  const jobScopedAllInclude = (cmd) => ({
    id: `B-${cmd}`,
    commandName: cmd,
    innerXml:
      `<${cmd}>\n` +
      `  <filter xmlns="">\n` +
      `    <job id="${jobId}"/>\n` +
      `  </filter>\n` +
      `  <include xmlns="">\n` +
      `    <name/>\n` +
      `    <all/>\n` +
      `  </include>\n` +
      `</${cmd}>`
  });

  [
    "jobPhaseQuery",
    "phaseQuery",
    "scheduleQuery",
    "activityQuery",
    "appointmentQuery",
    "employeeQuery",
    "userQuery",
    "resourceQuery",
    "crewQuery",
    "installerQuery",
    "templaterQuery",
    "slabQuery",
    "materialQuery",
    "inventoryQuery",
    "jobMaterialQuery",
    "purchaseOrderQuery",
    "noteQuery",
    "jobNoteQuery",
    "historyQuery",
    "auditQuery",
    "changeOrderQuery",
    "serviceQuery",
    "repairQuery"
  ].forEach((cmd) => probes.push(jobScopedAllInclude(cmd)));

  return probes;
}

function buildOperationalConceptMatchers() {
  const rx = (re) => new RegExp(re, "i");
  return [
    { concept: "templater", re: rx("templater|template\\b") },
    { concept: "installer", re: rx("installer|install\\b") },
    { concept: "customer service", re: rx("customer\\s*service") },
    { concept: "service", re: rx("\\bservice\\b") },
    { concept: "repair", re: rx("repair") },
    { concept: "remake", re: rx("remake") },
    { concept: "change order", re: rx("change\\s*order|\\bchange\\b") },
    { concept: "slab", re: rx("slab") },
    { concept: "material", re: rx("material") },
    { concept: "phase", re: rx("\\bphase\\b") },
    { concept: "status", re: rx("\\bstatus\\b") },
    { concept: "schedule", re: rx("schedule|appointment") },
    { concept: "date", re: rx("\\bdate\\b|startDate|endDate") },
    { concept: "employee", re: rx("employee|assignedTo|crew|resource") },
    { concept: "backsplash", re: rx("back\\s*splash|backsplash") },
    { concept: "electrical cutout", re: rx("electrical\\s*cut|cut\\s*out|cutouts?|outlet|switch") },
    { concept: "full height", re: rx("full\\s*height|fhbs") },
    { concept: "waterfall", re: rx("waterfall") }
  ];
}

/** Moraware requires a <filter/> on jobQuery; broad find-fixture tries these in order until one succeeds. */
const FIND_FIXTURE_BROAD_FILTER_VARIANTS = [
  {
    id: "A_empty",
    filterXml: `    <filter xmlns="">\n    </filter>\n`
  },
  {
    id: "B_selfClosing",
    filterXml: `    <filter xmlns=""/>\n`
  },
  {
    id: "C_all",
    filterXml: `    <filter xmlns="">\n      <all/>\n    </filter>\n`
  },
  {
    id: "D_active",
    filterXml: `    <filter xmlns="">\n      <jobStatus>active</jobStatus>\n    </filter>\n`
  },
  {
    id: "E_complete",
    filterXml: `    <filter xmlns="">\n      <jobStatus>complete</jobStatus>\n    </filter>\n`
  }
];

function buildFindFixtureBroadJobQueryInnerXml(firstRecord, pageSize, filterBlockXml) {
  return (
    `<jobQuery>\n` +
    filterBlockXml +
    `    <include xmlns="">\n` +
    `      <name/>\n` +
    `      <jobStatus/>\n` +
    `      <creationDate/>\n` +
    `      <account>\n` +
    `        <name/>\n` +
    `      </account>\n` +
    `      <salesperson>\n` +
    `        <name/>\n` +
    `      </salesperson>\n` +
    `      <notes/>\n` +
    `    </include>\n` +
    `    <pagingSpec xmlns="" firstRecord="${firstRecord}" pageSize="${pageSize}" calculateTotalRecords="false"/>\n` +
    `  </jobQuery>`
  );
}

function firstBlockingMorawareErrorRecord(apiErrors) {
  const list = apiErrors || [];
  return (
    list.find((e) => {
      const c = e.errorCode;
      return c !== "0" && c !== "false" && Number(c) !== 0;
    }) || null
  );
}

function parseCsvIdList(raw) {
  return String(raw ?? "")
    .split(",")
    .map((s) => String(s).trim())
    .filter(Boolean);
}

function toNumberOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function extractProcessIdsFromParsed(parsed) {
  const out = new Set();
  walkObjectDeep(parsed, "", (pth, node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return;

    // Matches ...process._attributes.id or ...processes.process._attributes.id (case tolerant).
    if (/(^|\.)process(es)?(\.|$)/i.test(pth)) {
      const id = node?._attributes?.id ?? node?._attributes?.Id ?? null;
      if (id != null && String(id).trim()) out.add(String(id).trim());
    }
  });

  // Fallback: look for string-only <process>123</process> shapes.
  walkObjectDeep(parsed, "", (pth, node) => {
    if (!/(^|\.)process(es)?$/i.test(pth)) return;
    if (typeof node === "string" || typeof node === "number") {
      const s = String(node).trim();
      if (s) out.add(s);
    }
  });

  return [...out];
}

async function discoverProcesses(ctx, sendOptions = {}) {
  const probes = [];
  const processIds = new Set();

  const probeDefs = [
    {
      id: "P1-processQuery-filter-empty",
      commandName: "processQuery",
      innerXml:
        `<processQuery>\n` +
        `  <filter xmlns="">\n` +
        `  </filter>\n` +
        `  <include xmlns="">\n` +
        `    <name/>\n` +
        `  </include>\n` +
        `</processQuery>`
    },
    {
      id: "P2-processQuery-include-only",
      commandName: "processQuery",
      innerXml:
        `<processQuery>\n` +
        `  <include xmlns="">\n` +
        `    <name/>\n` +
        `  </include>\n` +
        `</processQuery>`
    },
    {
      id: "P3-processQuery-filter-all",
      commandName: "processQuery",
      innerXml:
        `<processQuery>\n` +
        `  <filter xmlns="">\n` +
        `    <all/>\n` +
        `  </filter>\n` +
        `  <include xmlns="">\n` +
        `    <name/>\n` +
        `  </include>\n` +
        `</processQuery>`
    },
    {
      id: "P4-jobQuery-filter-process-shell",
      commandName: "jobQuery",
      innerXml:
        `<jobQuery>\n` +
        `  <filter xmlns="">\n` +
        `    <process/>\n` +
        `  </filter>\n` +
        `  <include xmlns="">\n` +
        `    <name/>\n` +
        `  </include>\n` +
        `  <pagingSpec xmlns="" firstRecord="0" pageSize="10" calculateTotalRecords="false"/>\n` +
        `</jobQuery>`
    }
  ];

  for (const pd of probeDefs) {
    const res = await sendMorawareCommand(ctx, pd.commandName, pd.innerXml, {
      probeName: pd.id,
      ...sendOptions
    });
    const ids = extractProcessIdsFromParsed(res.parsed || {});
    ids.forEach((id) => processIds.add(id));
    const blockErr = firstBlockingMorawareErrorRecord(res.apiErrors || []);
    probes.push({
      id: pd.id,
      commandName: pd.commandName,
      probeName: res.probeName,
      probeStatus: res.probeStatus,
      httpStatus: res.httpStatus,
      errorCode: blockErr ? String(blockErr.errorCode ?? "") : "0",
      description: blockErr ? String(blockErr.description || blockErr.errorCodeDescription || "") : "",
      processIdsFound: ids
    });
  }

  return { probes, processIds: [...processIds] };
}

export function buildJobQueryByProcessInnerXml(processId, firstRecord, pageSize, processFilterVariantId) {
  const pid = String(processId ?? "").trim();
  const filter =
    processFilterVariantId === "processText"
      ? `  <filter xmlns="">\n    <process>${pid}</process>\n  </filter>\n`
      : `  <filter xmlns="">\n    <process id="${pid}"/>\n  </filter>\n`;

  return (
    `<jobQuery>\n` +
    filter +
    `  <include xmlns="">\n` +
    `    <name/>\n` +
    `    <jobStatus/>\n` +
    `    <creationDate/>\n` +
    `    <account>\n` +
    `      <name/>\n` +
    `    </account>\n` +
    `    <salesperson>\n` +
    `      <name/>\n` +
    `    </salesperson>\n` +
    `    <notes/>\n` +
    `  </include>\n` +
    `  <pagingSpec xmlns="" firstRecord="${firstRecord}" pageSize="${pageSize}" calculateTotalRecords="false"/>\n` +
    `</jobQuery>`
  );
}

/**
 * Collect job rows using the same process-scoped `jobQuery` paging as `global-sync` (see `runMorawareDiscovery`).
 * Read-only; pass `{ quiet: true, skipProbeArtifacts: true }` (defaults) to avoid console/file spam.
 *
 * Honors: `MORAWARE_PROCESS_IDS`, `MORAWARE_MAX_PROCESSES`, `MORAWARE_MAX_SEARCH_PAGES`,
 * `MORAWARE_SEARCH_PAGE_SIZE` (fallback `MORAWARE_PAGE_SIZE`), and optional `MORAWARE_SYNC_START_DATE`,
 * `MORAWARE_SYNC_END_DATE`, `MORAWARE_SYNC_YEAR` filters on `creationDate` from list rows.
 */
export async function collectGlobalSyncStyleJobListSample(client, options = {}) {
  const {
    collectCap = 120,
    maxProcesses: maxProcessesOpt,
    maxPages: maxPagesOpt,
    pageSize: pageSizeOpt,
    quiet = true,
    skipProbeArtifacts = true,
    runDir: runDirOpt
  } = options;

  const maxProcesses = maxProcessesOpt ?? toNumberOr(process.env.MORAWARE_MAX_PROCESSES, 10);
  const maxPages = maxPagesOpt ?? toNumberOr(process.env.MORAWARE_MAX_SEARCH_PAGES, 50);
  const pageSize =
    pageSizeOpt ??
    toNumberOr(process.env.MORAWARE_SEARCH_PAGE_SIZE ?? process.env.MORAWARE_PAGE_SIZE, 100);

  await client.ensureSession();
  const sessionId = client.sessionId;
  const runDir =
    runDirOpt ||
    path.join(os.tmpdir(), "eos-moraware-expanded-sampling", `p${process.pid}-${Date.now()}`);
  await mkdirp(runDir);

  const ctx = {
    sessionId,
    apiUrl: client.baseUrl,
    timeoutMs: client.timeoutMs,
    runDir,
    latestDir: runDir,
    probeIndex: 0,
    probes: [],
    successfulProbeNames: [],
    failedProbeNames: [],
    noDataProbeNames: [],
    partialProbeNames: []
  };

  const sendOpts = { quiet, skipProbeArtifacts };

  const processOverride = parseCsvIdList(process.env.MORAWARE_PROCESS_IDS);
  let processesSource = "discoverProcesses";
  let processesUsed = [];
  if (processOverride.length) {
    processesUsed = processOverride.slice(0, maxProcesses);
    processesSource = "MORAWARE_PROCESS_IDS";
  } else {
    const pd = await discoverProcesses(ctx, sendOpts);
    processesUsed = (pd.processIds || []).slice(0, maxProcesses);
  }

  const diagnostics = {
    processesSource,
    processesUsed: [...processesUsed],
    maxProcesses,
    maxPages,
    pageSize,
    processCount: processesUsed.length
  };

  if (!processesUsed.length) {
    return {
      jobs: [],
      rawJobsCollected: 0,
      diagnostics: { ...diagnostics, reason: "no_process_ids" },
      pagesLog: []
    };
  }

  const jobIds = new Set();
  const collected = [];
  const pagesLog = [];
  const variants = ["processIdAttr", "processText"];

  for (const processId of processesUsed) {
    for (let pageIdx = 0; pageIdx < maxPages; pageIdx += 1) {
      let pageOk = false;
      let pageJobs = [];
      for (const variantId of variants) {
        const inner = buildJobQueryByProcessInnerXml(processId, pageIdx * pageSize, pageSize, variantId);
        const res = await sendMorawareCommand(ctx, "jobQuery", inner, {
          probeName: `EXPANDED-SAMPLE-${processId}-${variantId}-p${pageIdx}`,
          ...sendOpts
        });
        pageJobs = asArray(res.parsed?.MorawareResponse?.jobQuery?.job);
        pagesLog.push({
          processId,
          variantId,
          page: pageIdx,
          firstRecord: pageIdx * pageSize,
          probeStatus: res.probeStatus,
          httpStatus: res.httpStatus,
          jobCount: pageJobs.length
        });
        if (
          res.httpStatus >= 200 &&
          res.httpStatus < 300 &&
          !res.parsed?.parseError &&
          !hasBlockingMorawareError(res.apiErrors || [])
        ) {
          pageOk = true;
          break;
        }
      }
      if (!pageOk) break;

      for (const j of pageJobs) {
        const id = String(j?._attributes?.id ?? j?.id ?? "").trim();
        if (!id || jobIds.has(id)) continue;
        jobIds.add(id);
        collected.push(j);
        if (collected.length >= collectCap) break;
      }
      if (collected.length >= collectCap) break;
      if (pageJobs.length < pageSize) break;
    }
    if (collected.length >= collectCap) break;
  }

  diagnostics.rawJobsCollectedBeforeDateFilter = collected.length;

  const syncYear = String(process.env.MORAWARE_SYNC_YEAR ?? "").trim();
  const syncStartDateRaw = String(process.env.MORAWARE_SYNC_START_DATE ?? "").trim();
  const syncEndDateRaw = String(process.env.MORAWARE_SYNC_END_DATE ?? "").trim();
  const syncStartMs = syncStartDateRaw ? parseIsoDateToMsOrNull(syncStartDateRaw) : null;
  const syncEndMs = syncEndDateRaw ? parseIsoDateToMsOrNull(syncEndDateRaw) : null;
  const dateFilterEnabled = Boolean(syncStartMs != null || syncEndMs != null || syncYear);

  let filtered = collected;
  let rejectedByDate = 0;
  if (dateFilterEnabled) {
    const out = [];
    for (const j of collected) {
      const creationDateRaw = getText(j?.creationDate);
      const creationMs = parseIsoDateToMsOrNull(creationDateRaw);
      let accepted = true;
      if (!creationMs) {
        accepted = false;
      } else {
        if (syncStartMs != null && creationMs < syncStartMs) accepted = false;
        if (accepted && syncEndMs != null && creationMs > syncEndMs) accepted = false;
        if (accepted && syncYear) {
          const y = new Date(creationMs).getUTCFullYear();
          if (String(y) !== syncYear) accepted = false;
        }
      }
      if (accepted) out.push(j);
      else rejectedByDate += 1;
    }
    filtered = out;
  }

  diagnostics.dateFilterEnabled = dateFilterEnabled;
  diagnostics.syncStartDateRaw = syncStartDateRaw || null;
  diagnostics.syncEndDateRaw = syncEndDateRaw || null;
  diagnostics.syncYear = syncYear || null;
  diagnostics.rejectedByDateFilter = rejectedByDate;
  diagnostics.matchedAfterDateFilter = filtered.length;
  if (dateFilterEnabled && collected.length > 0 && filtered.length === 0) {
    diagnostics.hint =
      "All jobs from process pages were rejected by MORAWARE_SYNC_* date/year filters. Unset or widen them for discovery sampling, or set MORAWARE_DISCOVERY_JOB_ID / EOS_DISCOVERY_JOB_ID.";
  }

  return {
    jobs: filtered,
    rawJobsCollected: collected.length,
    diagnostics,
    pagesLog
  };
}

function evaluateJobDetailProbe(parsed, httpStatus, apiErrors, targetJobId) {
  if (httpStatus < 200 || httpStatus >= 300) return { status: "error", reason: `http ${httpStatus}` };
  if (parsed?.parseError) return { status: "error", reason: parsed.parseError };
  if (hasBlockingMorawareError(apiErrors)) {
    const e = apiErrors[0];
    return { status: "error", reason: e?.description || e?.errorCode || "moraware error" };
  }
  const job = extractJobNode(parsed, targetJobId);
  const idOk = getAttr(job, "id") || job?._attributes?.id;
  const nameOk = getText(job?.name);
  const extra =
    getText(job?.creationDate) ||
    getText(job?.salesperson?.name) ||
    getText(job?.account?.name) ||
    getText(job?.notes) ||
    getText(job?.jobStatus);
  if (!(idOk || nameOk)) return { status: "no-data", reason: "missing job id/name" };
  // Success if job name present, or job id plus at least one requested include leaf.
  if (!nameOk && !extra) return { status: "no-data", reason: "no included fields" };
  return { status: "success", reason: "job detail ok" };
}

function evaluateJobFormListProbe(parsed, httpStatus, apiErrors) {
  if (httpStatus < 200 || httpStatus >= 300) return { status: "error", reason: `http ${httpStatus}` };
  if (parsed?.parseError) return { status: "error", reason: parsed.parseError };
  if (hasBlockingMorawareError(apiErrors)) {
    const e = apiErrors[0];
    return { status: "error", reason: e?.description || String(e?.errorCode) };
  }
  const ids = extractFormIdsFromJobFormQuery(parsed);
  if (!ids.length) return { status: "no-data", reason: "no jobForm ids" };
  return { status: "success", reason: `${ids.length} forms` };
}

function evaluateFormDetailProbe(parsed, httpStatus, apiErrors) {
  if (httpStatus < 200 || httpStatus >= 300) return { status: "error", reason: `http ${httpStatus}` };
  if (parsed?.parseError) return { status: "error", reason: parsed.parseError };
  if (hasBlockingMorawareError(apiErrors)) {
    const e = apiErrors[0];
    return { status: "error", reason: e?.description || String(e?.errorCode) };
  }
  const official = countOfficialFieldsFromJobFormQuery(parsed);
  if (official > 0) return { status: "success", reason: `${official} official fields` };

  const fields = extractFieldLikeRecordsAggressive(parsed, {});
  const forms = extractJobFormNodes(parsed);
  const namedShell = forms.some((f) => {
    const m = extractFormMeta(f);
    return Boolean(m.formName || getText(f?.name));
  });
  const formName =
    getText(parsed?.MorawareResponse?.jobFormQuery?.job?.name) ||
    getText(parsed?.MorawareResponse?.jobFormQuery?.jobForm?.name);
  const nonTrivial =
    fields.length > 0 ||
    (formName && formName.length > 0) ||
    namedShell ||
    countLeaves(parsed?.MorawareResponse?.jobFormQuery) > 12;
  if (!nonTrivial) return { status: "no-data", reason: "no fields / empty form" };
  return { status: "success", reason: "form detail data" };
}

function evaluateBulkOfficialJobFormProbe(parsed, httpStatus, apiErrors) {
  if (httpStatus < 200 || httpStatus >= 300) return { status: "error", reason: `http ${httpStatus}` };
  if (parsed?.parseError) return { status: "error", reason: parsed.parseError };
  if (hasBlockingMorawareError(apiErrors)) {
    const e = apiErrors[0];
    return { status: "error", reason: e?.description || String(e?.errorCode) };
  }
  const official = countOfficialFieldsFromJobFormQuery(parsed);
  if (official > 0) return { status: "success", reason: `${official} official fields (bulk)` };

  const forms = extractJobFormNodes(parsed);
  const namedShell = forms.some((f) => {
    const m = extractFormMeta(f);
    return Boolean(m.formName || getText(f?.name));
  });
  if (namedShell) return { status: "success", reason: "bulk forms include names" };

  const idOnly =
    forms.length > 0 &&
    forms.every((f) => {
      const keys = Object.keys(f).filter((k) => k !== "_attributes");
      return keys.length === 0 || (keys.length === 1 && keys[0] === "name" && !getText(f.name));
    });
  if (forms.length && idOnly) return { status: "no-data", reason: "jobForm id shells only" };

  if (!forms.length) return { status: "no-data", reason: "no jobForm nodes" };
  return { status: "no-data", reason: "no extractable fields on bulk job forms" };
}

export async function sendMorawareCommand(ctx, commandName, innerXml, options = {}) {
  const { sessionId, apiUrl, timeoutMs } = ctx;
  const envelope = buildMorawareCommandXml({ sessionId, innerXml });
  const idx = (ctx.probeIndex += 1);
  const probeName = options.probeName || `${commandName}-${idx}`;
  const requestId = `${probeName}#${idx}`;
  const safe = safeFilePart(probeName);
  const quiet = Boolean(options.quiet);
  const skipProbeArtifacts = Boolean(options.skipProbeArtifacts);

  let reqPath = "";
  let resPath = "";
  if (!skipProbeArtifacts) {
    await mkdirp(ctx.runDir);
    reqPath = path.join(ctx.runDir, `probe-${idx}-${safe}-request.xml`);
    resPath = path.join(ctx.runDir, `probe-${idx}-${safe}-response.xml`);
    await fs.writeFile(reqPath, envelope, "utf8");
  }

  if (!quiet) {
    console.log(`[requestId=${requestId}] REQUEST (session redacted):\n${redactSessionId(envelope)}`);
  }

  let rawXml = "";
  let httpStatus = 0;
  try {
    const res = await axios.post(apiUrl, envelope, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        Accept: "application/xml,text/xml,*/*"
      },
      timeout: timeoutMs,
      validateStatus: () => true,
      responseType: "text",
      transformResponse: [(r) => r]
    });
    httpStatus = res.status;
    rawXml = typeof res.data === "string" ? res.data : String(res.data ?? "");
  } catch (err) {
    rawXml = `<!-- transport error -->\n${err?.message || err}`;
    httpStatus = err?.response?.status ?? 0;
    if (err?.response?.data && typeof err.response.data === "string") rawXml = err.response.data;
  }

  if (!skipProbeArtifacts) {
    await fs.writeFile(resPath, rawXml, "utf8");
  }

  if (options.logRawResponseToConsole) {
    console.log(`[requestId=${requestId}] RESPONSE RAW:\n${rawXml}`);
  }

  let parsed = null;
  let parseErr = null;
  try {
    parsed = parseXmlToObject(rawXml);
  } catch (e) {
    parseErr = String(e?.message || e);
    parsed = { parseError: parseErr, rawSnippet: rawXml.slice(0, 500) };
  }

  if (!quiet) {
    console.log(`[requestId=${requestId}] RESPONSE JSON:\n${JSON.stringify(parsed, null, 2)}`);
  }

  const apiErrors = parsed && typeof parsed === "object" ? extractMorawareErrors(parsed) : [];

  let probeStatus = "error";
  let probeReason = "";
  let extractedFieldCount = 0;
  let leafCount = 0;

  const evaluator = options.evaluate;
  if (evaluator) {
    const ev = evaluator({ parsed, httpStatus, apiErrors, probeName });
    probeStatus = ev.status;
    probeReason = ev.reason || "";
  } else {
    if (httpStatus >= 200 && httpStatus < 300 && parsed && !parsed.parseError && !hasBlockingMorawareError(apiErrors)) {
      probeStatus = "success";
    } else if (parsed?.parseError) {
      probeStatus = "error";
      probeReason = parsed.parseError;
    } else if (hasBlockingMorawareError(apiErrors)) {
      probeStatus = "error";
      probeReason = apiErrors[0]?.description || String(apiErrors[0]?.errorCode);
    } else {
      probeStatus = "error";
      probeReason = `http ${httpStatus}`;
    }
  }

  if (parsed && !parsed.parseError) {
    extractedFieldCount = mergedAggressiveJobFormFieldRows(parsed, {}).length;
    leafCount = countLeaves(parsed?.MorawareResponse);
  }

  const record = {
    requestId,
    probeName,
    commandName,
    httpStatus,
    probeStatus,
    probeReason,
    apiErrors,
    parseError: parseErr,
    extractedFieldCount,
    leafCount,
    requestPath: skipProbeArtifacts ? "(not written)" : reqPath,
    responsePath: skipProbeArtifacts ? "(not written)" : resPath
  };
  ctx.probes.push(record);
  if (probeStatus === "success") ctx.successfulProbeNames.push(probeName);
  else if (probeStatus === "no-data") ctx.noDataProbeNames.push(probeName);
  else if (probeStatus === "partial") ctx.partialProbeNames.push(probeName);
  else ctx.failedProbeNames.push(probeName);

  return { parsed, rawXml, httpStatus, probeStatus, probeReason, extractedFieldCount, leafCount, ...record };
}

export function createEmptyBrain(sourceMeta) {
  return {
    source: {
      system: "moraware",
      fetchedAt: new Date().toISOString(),
      jobId: sourceMeta.jobId,
      accountId: sourceMeta.accountId
    },
    jobInfo: {
      jobName: "",
      accountName: "",
      creationDate: "",
      salespersonName: "",
      stone: "",
      notes: ""
    },
    addresses: { jobAddress: "", accountAddress: "" },
    contacts: [],
    activities: [],
    forms: [],
    files: [],
    phases: [],
    issues: [],
    metrics: {
      totalSqFt: 0,
      worksheetSqFt: 0,
      worksheetCount: 0,
      fieldCount: 0,
      formCount: 0,
      sqFtByForm: {},
      sqFtFields: []
    },
    raw: {
      probes: [],
      successfulProbeNames: [],
      failedProbeNames: [],
      noDataProbeNames: []
    }
  };
}

function buildAccountJobIdsOnlyInner(accountId) {
  return `<jobQuery>\n    <filter xmlns="">\n      <account id="${accountId}"/>\n    </filter>\n  </jobQuery>`;
}

function buildJobFormBulkOfficialInner(jobId) {
  return buildJobFormsAllFieldsCommand(jobId);
}

function buildJobFormDetailOfficialInner(formId) {
  return buildJobFormAllFieldsCommand(formId);
}

/** First-form jobForm matrix: diagnostic-only when `MORAWARE_FORCE_FIRST_FORM_MATRIX=1`. */
function firstFormMatrixForced() {
  return envTruthy(process.env.MORAWARE_FORCE_FIRST_FORM_MATRIX);
}

function buildJobFormMatrixQueryInner(formId, includeBlockXml) {
  return (
    `<jobFormQuery>\n` +
    `    <filter xmlns="">\n` +
    `      <jobForm id="${formId}"/>\n` +
    `    </filter>\n` +
    includeBlockXml +
    `  </jobFormQuery>`
  );
}

const FIRST_FORM_MATRIX_INCLUDE_BLOCKS = [
  {
    id: "01",
    name: "sdk-formField-single-form",
    includeXml:
      `    <include xmlns="">\n` +
      `      <name/>\n` +
      `      <job/>\n` +
      `      <formTemplate>\n` +
      `        <name/>\n` +
      `      </formTemplate>\n` +
      `      <jobPhase>\n` +
      `        <all/>\n` +
      `      </jobPhase>\n` +
      `      <formField>\n` +
      `        <name/>\n` +
      `        <value/>\n` +
      `        <dataType/>\n` +
      `      </formField>\n` +
      `    </include>\n`
  }
];

function makeFormProbeRecord(res = {}) {
  const apiErrors = Array.isArray(res.apiErrors) ? res.apiErrors : [];
  const firstError = apiErrors[0] || {};

  return {
    probeName: res.probeName || "",
    status: res.probeStatus || res.status || "",
    errorCode: firstError.errorCode || "",
    errorCodeDescription: firstError.errorCodeDescription || "",
    description: res.probeReason || firstError.description || "",
    extractedFieldCount: Number(res.extractedFieldCount || 0),
    leafCount: Number(res.leafCount || 0)
  };
}

function recordFormProbeResult(formDetailProbeRecords, res = {}) {
  if (!Array.isArray(formDetailProbeRecords)) return;
  formDetailProbeRecords.push(makeFormProbeRecord(res));
}

function evaluateJobFormMatrixProbe(probeLabel) {
  return ({ parsed, httpStatus, apiErrors }) => {
    if (httpStatus < 200 || httpStatus >= 300) {
      console.error(`[JF-MATRIX ${probeLabel}] HTTP status: ${httpStatus}`);
      return { status: "error", reason: `http ${httpStatus}` };
    }
    if (parsed?.parseError) {
      console.error(`[JF-MATRIX ${probeLabel}] XML parse error: ${parsed.parseError}`);
      return { status: "error", reason: parsed.parseError };
    }
    for (let i = 0; i < (apiErrors?.length ?? 0); i += 1) {
      console.error(`[JF-MATRIX ${probeLabel}] Moraware error [${i}]: ${JSON.stringify(apiErrors[i])}`);
    }
    if (hasBlockingMorawareError(apiErrors)) {
      const e = apiErrors[0];
      return { status: "error", reason: e?.description || String(e?.errorCode ?? "moraware error") };
    }
    const merged = mergedAggressiveJobFormFieldRows(parsed, {});
    const sem = classifyJobFormProbeSemantics(parsed, merged.length);
    return { status: sem.status, reason: sem.reason };
  };
}

function evaluateJobFormV3Probe(logTag) {
  return ({ parsed, httpStatus, apiErrors }) => {
    if (httpStatus < 200 || httpStatus >= 300) {
      console.error(`[${logTag}] HTTP status: ${httpStatus}`);
      return { status: "error", reason: `http ${httpStatus}` };
    }
    if (parsed?.parseError) {
      console.error(`[${logTag}] XML parse error: ${parsed.parseError}`);
      return { status: "error", reason: parsed.parseError };
    }
    for (let i = 0; i < (apiErrors?.length ?? 0); i += 1) {
      console.error(`[${logTag}] Moraware error [${i}]: ${JSON.stringify(apiErrors[i])}`);
    }
    if (hasBlockingMorawareError(apiErrors)) {
      const e = apiErrors[0];
      return { status: "error", reason: e?.description || String(e?.errorCode ?? "moraware error") };
    }
    const merged = mergedAggressiveJobFormFieldRows(parsed, {});
    const sem = classifyJobFormProbeSemantics(parsed, merged.length);
    return { status: sem.status, reason: sem.reason };
  };
}

async function copyV3ProbeArtifactsToRaw(runDir, probeKey, formId, reqPath, resPath, parsed) {
  const rawDir = path.join(runDir, "v3-raw");
  await mkdirp(rawDir);
  const base = `${safeFilePart(probeKey)}__${safeFilePart(formId)}`;
  try {
    if (reqPath) await fs.copyFile(reqPath, path.join(rawDir, `${base}-request.xml`));
  } catch (_) {
    /* ignore */
  }
  try {
    if (resPath) await fs.copyFile(resPath, path.join(rawDir, `${base}-response.xml`));
  } catch (_) {
    /* ignore */
  }
  await fs.writeFile(path.join(rawDir, `${base}-parsed.json`), JSON.stringify(parsed ?? {}, null, 2), "utf8");
}

async function mirrorV3ArtifactsToLatest(runDir, latestDir) {
  const rootFiles = [
    "v3-form-names.json",
    "v3-form-field-probes.json",
    "v3-form-leaf-dump.txt",
    "v3-form-fields.json",
    "v3-winning-probe.json",
    "need-sdk-trace.md"
  ];
  await mkdirp(path.join(latestDir, "v3-raw"));
  for (const f of rootFiles) {
    const src = path.join(runDir, f);
    try {
      await fs.access(src);
      await fs.copyFile(src, path.join(latestDir, f));
    } catch (_) {
      /* optional */
    }
  }
  const rawSrc = path.join(runDir, "v3-raw");
  const rawDst = path.join(latestDir, "v3-raw");
  try {
    await fs.rm(rawDst, { recursive: true, force: true });
  } catch (_) {
    /* ignore */
  }
  try {
    await fs.cp(rawSrc, rawDst, { recursive: true });
  } catch (_) {
    /* ignore */
  }
}

function buildNeedSdkTraceMarkdown() {
  return [
    "# Moraware jobForm field inclusion — SDK trace needed",
    "",
    "Raw XML from this V3 matrix still cannot reproduce **GetJobForm** field inclusion behavior.",
    "",
    "The official .NET API exposes:",
    "",
    "```csharp",
    "GetJobForm(int jobFormId_, bool includeJobPhases_, Connection.GetJobForm_FieldInclusionType_Enum fieldIndicator_)",
    "GetJobForms(int jobId_, bool includeJobPhases_, Connection.GetJobForm_FieldInclusionType_Enum fieldIndicator_)",
    "```",
    "",
    "Enum values: **AllFields**, **ExcludeEmptyFields**, **NoFields**.",
    "",
    "We need the **actual XML** emitted by the official SDK **CommandTracer** for `GetJobForm(..., AllFields)`.",
    "",
    "## C# sketch (adjust constructors to your JobTrackerAPI5.dll)",
    "",
    "```csharp",
    "using Moraware.JobTrackerAPI5;",
    "using Moraware.JobTrackerAPI5.DevelopmentAssistance;",
    "",
    "var url = \"https://YOUR_INSTANCE.moraware.com/api.aspx\";",
    "var user = \"YOUR_USER\";",
    "var pass = \"YOUR_PASS\";",
    "",
    "var tracer = new SimpleConsoleCommandTracer(",
    "    true,",
    "    true",
    ");",
    "",
    "var conn = new Connection(",
    "    url,",
    "    user,",
    "    pass,",
    "    tracer",
    ");",
    "",
    "conn.Connect();",
    "",
    "var form = conn.GetJobForm(",
    "    140265,",
    "    true,",
    "    Connection.GetJobForm_FieldInclusionType_Enum.AllFields",
    ");",
    "",
    "conn.Disconnect();",
    "```",
    "",
    "Copy the traced **jobFormQuery** request/response XML back into Axios probes.",
    ""
  ].join("\n");
}



const JOBFORM_V3_PROBE_SPECS = [
  {
    id: "V3-P01-query-attrs-fieldIndicator-all",
    buildInner: (formId) =>
      `<jobFormQuery fieldIndicator="AllFields" includeJobPhases="true">\n` +
      `  <filter xmlns="">\n` +
      `    <jobForm id="${formId}"/>\n` +
      `  </filter>\n` +
      `  <include xmlns="">\n` +
      `    <name/>\n` +
      `  </include>\n` +
      `</jobFormQuery>`
  },
  {
    id: "V3-P02-query-attrs-fieldIndicator-exclude-empty",
    buildInner: (formId) =>
      `<jobFormQuery fieldIndicator="ExcludeEmptyFields" includeJobPhases="true">\n` +
      `  <filter xmlns="">\n` +
      `    <jobForm id="${formId}"/>\n` +
      `  </filter>\n` +
      `  <include xmlns="">\n` +
      `    <name/>\n` +
      `  </include>\n` +
      `</jobFormQuery>`
  },
  {
    id: "V3-P03-query-attrs-fieldInclusionType-all",
    buildInner: (formId) =>
      `<jobFormQuery fieldInclusionType="AllFields" includeJobPhases="true">\n` +
      `  <filter xmlns="">\n` +
      `    <jobForm id="${formId}"/>\n` +
      `  </filter>\n` +
      `  <include xmlns="">\n` +
      `    <name/>\n` +
      `  </include>\n` +
      `</jobFormQuery>`
  },
  {
    id: "V3-P04-query-attrs-fieldInclusionType-exclude-empty",
    buildInner: (formId) =>
      `<jobFormQuery fieldInclusionType="ExcludeEmptyFields" includeJobPhases="true">\n` +
      `  <filter xmlns="">\n` +
      `    <jobForm id="${formId}"/>\n` +
      `  </filter>\n` +
      `  <include xmlns="">\n` +
      `    <name/>\n` +
      `  </include>\n` +
      `</jobFormQuery>`
  },
  {
    id: "V3-P05-filter-jobForm-attrs-fieldIndicator-all",
    buildInner: (formId) =>
      `<jobFormQuery>\n` +
      `  <filter xmlns="">\n` +
      `    <jobForm id="${formId}" fieldIndicator="AllFields" includeJobPhases="true"/>\n` +
      `  </filter>\n` +
      `  <include xmlns="">\n` +
      `    <name/>\n` +
      `  </include>\n` +
      `</jobFormQuery>`
  },
  {
    id: "V3-P06-filter-jobForm-attrs-fieldIndicator-exclude-empty",
    buildInner: (formId) =>
      `<jobFormQuery>\n` +
      `  <filter xmlns="">\n` +
      `    <jobForm id="${formId}" fieldIndicator="ExcludeEmptyFields" includeJobPhases="true"/>\n` +
      `  </filter>\n` +
      `  <include xmlns="">\n` +
      `    <name/>\n` +
      `  </include>\n` +
      `</jobFormQuery>`
  },
  {
    id: "V3-P07-filter-jobForm-attrs-fieldInclusionType-all",
    buildInner: (formId) =>
      `<jobFormQuery>\n` +
      `  <filter xmlns="">\n` +
      `    <jobForm id="${formId}" fieldInclusionType="AllFields" includeJobPhases="true"/>\n` +
      `  </filter>\n` +
      `  <include xmlns="">\n` +
      `    <name/>\n` +
      `  </include>\n` +
      `</jobFormQuery>`
  },
  {
    id: "V3-P08-filter-jobForm-attrs-fieldInclusionType-exclude-empty",
    buildInner: (formId) =>
      `<jobFormQuery>\n` +
      `  <filter xmlns="">\n` +
      `    <jobForm id="${formId}" fieldInclusionType="ExcludeEmptyFields" includeJobPhases="true"/>\n` +
      `  </filter>\n` +
      `  <include xmlns="">\n` +
      `    <name/>\n` +
      `  </include>\n` +
      `</jobFormQuery>`
  },
  {
    id: "V3-P09-include-jobForm-attrs-fieldInclusionType-all",
    buildInner: (formId) =>
      `<jobFormQuery>\n` +
      `  <filter xmlns="">\n` +
      `    <jobForm id="${formId}"/>\n` +
      `  </filter>\n` +
      `  <include xmlns="">\n` +
      `    <jobForm fieldInclusionType="AllFields" includeJobPhases="true"/>\n` +
      `  </include>\n` +
      `</jobFormQuery>`
  },
  {
    id: "V3-P10-include-jobForm-attrs-fieldInclusionType-exclude-empty",
    buildInner: (formId) =>
      `<jobFormQuery>\n` +
      `  <filter xmlns="">\n` +
      `    <jobForm id="${formId}"/>\n` +
      `  </filter>\n` +
      `  <include xmlns="">\n` +
      `    <jobForm fieldInclusionType="ExcludeEmptyFields" includeJobPhases="true"/>\n` +
      `  </include>\n` +
      `</jobFormQuery>`
  },
  {
    id: "V3-P11-query-attrs-no-include-all",
    buildInner: (formId) =>
      `<jobFormQuery fieldIndicator="AllFields" includeJobPhases="true">\n` +
      `  <filter xmlns="">\n` +
      `    <jobForm id="${formId}"/>\n` +
      `  </filter>\n` +
      `</jobFormQuery>`
  },
  {
    id: "V3-P12-query-attrs-no-include-fieldInclusionType-all",
    buildInner: (formId) =>
      `<jobFormQuery fieldInclusionType="AllFields" includeJobPhases="true">\n` +
      `  <filter xmlns="">\n` +
      `    <jobForm id="${formId}"/>\n` +
      `  </filter>\n` +
      `</jobFormQuery>`
  },
  {
    id: "V3-P13-filter-attrs-no-include-all",
    buildInner: (formId) =>
      `<jobFormQuery>\n` +
      `  <filter xmlns="">\n` +
      `    <jobForm id="${formId}" fieldIndicator="AllFields" includeJobPhases="true"/>\n` +
      `  </filter>\n` +
      `</jobFormQuery>`
  },
  {
    id: "V3-P14-filter-attrs-no-include-fieldInclusionType-all",
    buildInner: (formId) =>
      `<jobFormQuery>\n` +
      `  <filter xmlns="">\n` +
      `    <jobForm id="${formId}" fieldInclusionType="AllFields" includeJobPhases="true"/>\n` +
      `  </filter>\n` +
      `</jobFormQuery>`
  },
  {
    id: "V3-P15-element-params-after-filter",
    buildInner: (formId) =>
      `<jobFormQuery>\n` +
      `  <filter xmlns="">\n` +
      `    <jobForm id="${formId}"/>\n` +
      `  </filter>\n` +
      `  <include xmlns="">\n` +
      `    <name/>\n` +
      `  </include>\n` +
      `  <includeJobPhases xmlns="">true</includeJobPhases>\n` +
      `  <fieldIndicator xmlns="">AllFields</fieldIndicator>\n` +
      `</jobFormQuery>`
  },
  {
    id: "V3-P16-element-params-fieldInclusionType-after-filter",
    buildInner: (formId) =>
      `<jobFormQuery>\n` +
      `  <filter xmlns="">\n` +
      `    <jobForm id="${formId}"/>\n` +
      `  </filter>\n` +
      `  <include xmlns="">\n` +
      `    <name/>\n` +
      `  </include>\n` +
      `  <includeJobPhases xmlns="">true</includeJobPhases>\n` +
      `  <fieldInclusionType xmlns="">AllFields</fieldInclusionType>\n` +
      `</jobFormQuery>`
  }
];

async function runJobFormFieldMatrixV3Flow(ctx, brain, jobId, accountIdStr) {
  await mkdirp(path.join(ctx.runDir, "v3-raw"));

  console.log("\n=== JOBFORM FIELD MATRIX V3 ===\n");
  console.log(
    "Note: primary discovery uses SDK-traced jobFormQuery + include/formField; V3 probes are diagnostic-only.\n"
  );

  const a2Inner =
    `<jobQuery>\n` +
    `    <filter xmlns="">\n` +
    `      <job id="${jobId}"/>\n` +
    `    </filter>\n` +
    `    <include xmlns="">\n` +
    `      <name/>\n` +
    `      <jobStatus/>\n` +
    `      <creationDate/>\n` +
    `      <account>\n` +
    `        <name/>\n` +
    `      </account>\n` +
    `      <salesperson>\n` +
    `        <name/>\n` +
    `      </salesperson>\n` +
    `      <notes/>\n` +
    `    </include>\n` +
    `  </jobQuery>`;

  const jobDetailRes = await sendMorawareCommand(ctx, "jobQuery", a2Inner, {
    probeName: "V3-JOB-DETAIL",
    evaluate: ({ parsed, httpStatus, apiErrors }) => evaluateJobDetailProbe(parsed, httpStatus, apiErrors, jobId),
    logRawResponseToConsole: true
  });
  if (jobDetailRes.parsed) {
    applyJobInfo(brain, jobDetailRes.parsed, jobId);
    applyAddresses(brain, jobDetailRes.parsed, jobId);
  }
  await copyV3ProbeArtifactsToRaw(
    ctx.runDir,
    "V3-JOB-DETAIL",
    jobId,
    jobDetailRes.requestPath,
    jobDetailRes.responsePath,
    jobDetailRes.parsed
  );

  const jfListInner =
    `<jobFormQuery>\n` +
    `    <filter xmlns="">\n` +
    `      <job id="${jobId}"/>\n` +
    `    </filter>\n` +
    `    <include xmlns="">\n` +
    `      <jobForm/>\n` +
    `    </include>\n` +
    `  </jobFormQuery>`;

  const jfListRes = await sendMorawareCommand(ctx, "jobFormQuery", jfListInner, {
    probeName: "V3-JF-LIST-BY-JOB",
    evaluate: ({ parsed, httpStatus, apiErrors }) => evaluateJobFormListProbe(parsed, httpStatus, apiErrors),
    logRawResponseToConsole: true
  });
  await copyV3ProbeArtifactsToRaw(
    ctx.runDir,
    "V3-JF-LIST-BY-JOB",
    jobId,
    jfListRes.requestPath,
    jfListRes.responsePath,
    jfListRes.parsed
  );

  const formRows = extractFormIdsFromJobFormQuery(jfListRes.parsed || {});
  const formNameById = new Map();

  for (const row of formRows) {
    const fid = row.id;
    const nameInner =
      `<jobFormQuery>\n` +
      `    <filter xmlns="">\n` +
      `      <jobForm id="${fid}"/>\n` +
      `    </filter>\n` +
      `    <include xmlns="">\n` +
      `      <name/>\n` +
      `    </include>\n` +
      `  </jobFormQuery>`;

    const nmProbe = `V3-FORM-NAME-${fid}`;
    const nr = await sendMorawareCommand(ctx, "jobFormQuery", nameInner, {
      probeName: nmProbe,
      evaluate: evaluateJobFormV3Probe(nmProbe),
      logRawResponseToConsole: true
    });
    await copyV3ProbeArtifactsToRaw(ctx.runDir, nmProbe, fid, nr.requestPath, nr.responsePath, nr.parsed);

    const extractedName =
      getText(extractJobFormNodes(nr.parsed || {})[0]?.name) || row.name || "";
    formNameById.set(fid, extractedName);
  }

  const formNamesExport = formRows.map((r) => ({
    id: r.id,
    name: formNameById.get(r.id) || r.name || ""
  }));

  await fs.writeFile(
    path.join(ctx.runDir, "v3-form-names.json"),
    JSON.stringify(formNamesExport, null, 2),
    "utf8"
  );

  console.log("\n=== FORM NAMES ===");
  console.log("id | name");
  for (const fn of formNamesExport) {
    console.log(`${fn.id} | ${fn.name}`);
  }

  const v3ProbeRows = [];
  const v3FieldRows = [];
  const v3LeafLines = [];
  const executedKeys = new Set();

  async function runOneV3Probe(spec, fid) {
    const k = `${spec.id}|${fid}`;
    if (executedKeys.has(k)) return null;
    executedKeys.add(k);

    const innerXml = spec.buildInner(fid);
    const res = await sendMorawareCommand(ctx, "jobFormQuery", innerXml, {
      probeName: spec.id,
      evaluate: evaluateJobFormV3Probe(spec.id),
      logRawResponseToConsole: true
    });

    await copyV3ProbeArtifactsToRaw(ctx.runDir, spec.id, fid, res.requestPath, res.responsePath, res.parsed);

    appendV3FormLeafDump(res.parsed || {}, `${spec.id}@${fid}`, v3LeafLines);

    const merged = mergedAggressiveJobFormFieldRows(res.parsed || {}, {
      formId: fid,
      formName: formNameById.get(fid) || null,
      probeName: spec.id
    });

    for (const row of merged) {
      v3FieldRows.push({
        ...row,
        formId: fid,
        formName: formNameById.get(fid) || "",
        probeName: spec.id
      });
    }

    const usefulLeafCount = countUsefulLeavesForV3(res.parsed || {});

    v3ProbeRows.push({
      formId: fid,
      formName: formNameById.get(fid) || "",
      probeName: spec.id,
      status: res.probeStatus,
      httpStatus: res.httpStatus,
      errorCode: res.apiErrors?.[0]?.errorCode ?? "",
      usefulLeafCount,
      extractedFieldCount: merged.length,
      description: res.probeReason || ""
    });

    return res;
  }

  let winnerSpec = null;

  outer: for (const row of formRows) {
    const fid = row.id;
    for (const spec of JOBFORM_V3_PROBE_SPECS) {
      const res = await runOneV3Probe(spec, fid);
      if (res?.probeStatus === "success") {
        winnerSpec = spec;
        break outer;
      }
    }
  }

  if (winnerSpec) {
    for (const row of formRows) {
      await runOneV3Probe(winnerSpec, row.id);
    }
  }

  const anySuccess = v3ProbeRows.some((r) => r.status === "success");

  await fs.writeFile(
    path.join(ctx.runDir, "v3-form-field-probes.json"),
    JSON.stringify(v3ProbeRows, null, 2),
    "utf8"
  );
  await fs.writeFile(path.join(ctx.runDir, "v3-form-fields.json"), JSON.stringify(v3FieldRows, null, 2), "utf8");
  await fs.writeFile(path.join(ctx.runDir, "v3-form-leaf-dump.txt"), v3LeafLines.join("\n"), "utf8");

  await fs.writeFile(
    path.join(ctx.runDir, "v3-winning-probe.json"),
    JSON.stringify(
      {
        winningProbe: winnerSpec ? winnerSpec.id : null,
        winnerAppliedToAllForms: Boolean(winnerSpec),
        anyProbeReturnedSuccess: anySuccess,
        jobId,
        accountId: accountIdStr || ""
      },
      null,
      2
    ),
    "utf8"
  );

  if (!anySuccess) {
    await fs.writeFile(path.join(ctx.runDir, "need-sdk-trace.md"), buildNeedSdkTraceMarkdown(), "utf8");
  }

  console.log("\n=== V3 PROBE RESULTS ===");
  console.log(
    "formId | formName | probeName | status | errorCode | usefulLeafCount | extractedFieldCount | description"
  );
  for (const pr of v3ProbeRows) {
    console.log(
      `${pr.formId} | ${pr.formName} | ${pr.probeName} | ${pr.status} | ${pr.errorCode} | ${pr.usefulLeafCount} | ${pr.extractedFieldCount} | ${pr.description}`
    );
  }

  console.log("\n=== V3 FIELD SAMPLE ===");
  console.log("formId | formName | label | value | sourcePath");
  for (const fr of v3FieldRows.slice(0, 60)) {
    console.log(`${fr.formId} | ${fr.formName} | ${fr.label} | ${fr.value} | ${fr.sourcePath}`);
  }

  console.log("\n=== V3 WINNER ===");
  console.log(winnerSpec ? winnerSpec.id : "none");

  await mirrorV3ArtifactsToLatest(ctx.runDir, ctx.latestDir);
}

async function runExactJobFirstFormMatrix(
  ctx,
  jobId,
  leafDumpLines,
  formDetailProbeRecords,
  pushFormProbeRecord
) {
  if (!Array.isArray(formDetailProbeRecords)) {
    throw new TypeError("runExactJobFirstFormMatrix expected formDetailProbeRecords to be an array");
  }

  const artifactFiles = [];

  const recordProbe =
    typeof pushFormProbeRecord === "function"
      ? pushFormProbeRecord
      : (res) => recordFormProbeResult(formDetailProbeRecords, res);

  const jfListInner =
    `<jobFormQuery>\n` +
    `    <filter xmlns="">\n` +
    `      <job id="${jobId}"/>\n` +
    `    </filter>\n` +
    `    <include xmlns="">\n` +
    `      <jobForm/>\n` +
    `    </include>\n` +
    `  </jobFormQuery>`;

  const jfList = await sendMorawareCommand(ctx, "jobFormQuery", jfListInner, {
    probeName: "JF-LIST-BY-JOB",
    evaluate: ({ parsed, httpStatus, apiErrors }) => evaluateJobFormListProbe(parsed, httpStatus, apiErrors)
  });
  recordProbe(jfList);

  for (let i = 0; i < (jfList.apiErrors?.length ?? 0); i += 1) {
    console.error(`[JF-LIST-BY-JOB] Moraware error [${i}]: ${JSON.stringify(jfList.apiErrors[i])}`);
  }

  const listParsedPath = path.join(ctx.runDir, "jf-matrix-00-list-parsed.json");
  await fs.writeFile(listParsedPath, JSON.stringify(jfList.parsed ?? { error: "no parsed body" }, null, 2), "utf8");
  artifactFiles.push("jf-matrix-00-list-parsed.json");

  if (jfList.probeStatus === "success" && jfList.parsed && !jfList.parsed.parseError) {
    appendLeafDump(jfList.parsed, jfList.probeName, leafDumpLines);
  }

  const ids = extractFormIdsFromJobFormQuery(jfList.parsed || {});
  const firstFormId = ids[0]?.id ?? "";
  if (!firstFormId) {
    console.warn("First-form matrix: no jobForm id returned from list probe — skipping matrix probes.");
    const manifest = {
      jobId,
      firstFormId: null,
      listProbeStatus: jfList.probeStatus,
      probes: [],
      note: "JF-LIST did not yield a form id"
    };
    await fs.writeFile(
      path.join(ctx.runDir, "first-form-matrix-manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf8"
    );
    artifactFiles.push("first-form-matrix-manifest.json");
    return { formCandidates: [], artifactFiles };
  }

  console.log(`\n=== FIRST-FORM JOBFORM MATRIX (jobForm id=${firstFormId}) ===\n`);

  const probeRecords = [];

  for (const spec of FIRST_FORM_MATRIX_INCLUDE_BLOCKS) {
    const probeName = `JF-MATRIX-${spec.id}-${spec.name}`;
    const inner = buildJobFormMatrixQueryInner(firstFormId, spec.includeXml);
    const res = await sendMorawareCommand(ctx, "jobFormQuery", inner, {
      probeName,
      evaluate: evaluateJobFormMatrixProbe(`${spec.id}/${spec.name}`)
    });
    recordProbe(res);

    await fs.writeFile(
      path.join(ctx.runDir, `jf-matrix-${spec.id}-parsed.json`),
      JSON.stringify(res.parsed ?? { error: "no parsed body" }, null, 2),
      "utf8"
    );
    artifactFiles.push(`jf-matrix-${spec.id}-parsed.json`);

    if (res.probeStatus === "success" && res.parsed && !res.parsed.parseError) {
      appendLeafDump(res.parsed, res.probeName, leafDumpLines);
    }

    probeRecords.push({
      matrixId: spec.id,
      matrixKey: spec.name,
      probeName: res.probeName,
      httpStatus: res.httpStatus,
      probeStatus: res.probeStatus,
      probeReason: res.probeReason,
      apiErrors: res.apiErrors,
      requestPath: res.requestPath,
      responsePath: res.responsePath,
      parsedJsonRelative: `jf-matrix-${spec.id}-parsed.json`
    });
  }

  const manifest = {
    jobId,
    firstFormId,
    listProbe: {
      probeName: jfList.probeName,
      httpStatus: jfList.httpStatus,
      probeStatus: jfList.probeStatus,
      probeReason: jfList.probeReason,
      apiErrors: jfList.apiErrors,
      requestPath: jfList.requestPath,
      responsePath: jfList.responsePath,
      parsedJsonRelative: "jf-matrix-00-list-parsed.json"
    },
    probes: probeRecords,
    generatedAt: new Date().toISOString()
  };
  await fs.writeFile(
    path.join(ctx.runDir, "first-form-matrix-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
  artifactFiles.push("first-form-matrix-manifest.json");

  const formCandidates = [
    {
      id: firstFormId,
      name: ids[0]?.name ?? null,
      phaseName: ids[0]?.phaseName ?? null,
      sourcePath: "jf-matrix:first-form-only",
      _officialHit: false
    }
  ];

  return { formCandidates, artifactFiles };
}

function buildJobDetailInnerXml(jobId) {
  const filter = `    <filter xmlns="">\n      <job id="${jobId}"/>\n    </filter>\n`;
  const include =
    `    <include xmlns="">\n` +
    `      <name/>\n` +
    `      <jobStatus/>\n` +
    `      <creationDate/>\n` +
    `      <account>\n` +
    `        <name/>\n` +
    `      </account>\n` +
    `      <salesperson>\n` +
    `        <name/>\n` +
    `      </salesperson>\n` +
    `      <notes/>\n` +
    `    </include>\n`;
  return `<jobQuery>\n${filter}${include}  </jobQuery>`;
}

/** find-fixture resolver: job detail without notes (PDF identity scoring only). */
function buildJobQueryFinderCandidateInnerXml(jobId) {
  return (
    `<jobQuery>\n` +
    `    <filter xmlns="">\n` +
    `      <job id="${jobId}"/>\n` +
    `    </filter>\n` +
    `    <include xmlns="">\n` +
    `      <name/>\n` +
    `      <jobStatus/>\n` +
    `      <creationDate/>\n` +
    `      <account>\n` +
    `        <name/>\n` +
    `      </account>\n` +
    `      <salesperson>\n` +
    `        <name/>\n` +
    `      </salesperson>\n` +
    `    </include>\n` +
    `  </jobQuery>`
  );
}

/** Serialize resolver candidates without heavy raw SOAP rows. */
function stripRawJobFromCandidates(rows) {
  return rows.map((r) => {
    const { rawJob, ...rest } = r;
    return rest;
  });
}

function buildFormDetailProbes(formId) {
  return [{ name: "F-SDK-all-fields", innerXml: buildJobFormAllFieldsQuery(formId) }];
}

async function mirrorOutputs(runDir, latestDir, names) {
  for (const fname of names) {
    try {
      await fs.copyFile(path.join(runDir, fname), path.join(latestDir, fname));
    } catch {
      /* optional artifact — primary flow may skip some files */
    }
  }
}

async function writeEntrypointProof(runDir, proof) {
  const sensitive = /PASSWORD|SECRET|TOKEN|KEY/i;
  const envLines = Object.keys(process.env)
    .filter((k) => k.startsWith("MORAWARE_"))
    .sort()
    .map((k) => {
      if (sensitive.test(k)) return `${k}=[REDACTED]`;
      return `${k}=${process.env[k]}`;
    });
  const body = [
    proof?.markerLine || "USING MORAWARE DISCOVERY V2 ENTRYPOINT",
    `importedModulePath: ${proof?.importedModulePath || "(unknown)"}`,
    `timestamp: ${new Date().toISOString()}`,
    "",
    "Moraware-related environment:",
    ...envLines
  ].join("\n");
  await fs.writeFile(path.join(runDir, "entrypoint-proof.txt"), body, "utf8");
}

export async function runMorawareDiscovery({ client, jobId, accountId, entrypointProof }) {
  const apiUrl = client.baseUrl;
  const timeoutMs = client.timeoutMs;
  await client.ensureSession();
  const sessionId = client.sessionId;

  const root = path.join(process.cwd(), "debug", "moraware");
  const runDir = path.join(root, timestampFolderName());
  const latestDir = path.join(root, "latest");
  await mkdirp(runDir);
  await mkdirp(latestDir);
  await writeEntrypointProof(runDir, entrypointProof || {});

  const inputJobId = String(jobId ?? "").trim();
  const accountIdStr = String(accountId ?? "").trim();
  const expectedJobNameEnv = String(process.env.MORAWARE_EXPECTED_JOB_NAME || "").trim();
  const expectedAccountEnv = String(process.env.MORAWARE_EXPECTED_ACCOUNT_NAME || "").trim();
  const expectedCreationEnv = String(process.env.MORAWARE_EXPECTED_CREATION_DATE || "").trim();

  const discoveryRuntimeMode = resolveDiscoveryRuntimeMode(inputJobId, expectedJobNameEnv);
  await fs.writeFile(path.join(runDir, "discovery-mode.txt"), `${discoveryRuntimeMode}\n`, "utf8");

  if (discoveryRuntimeMode === "exact-job" && !inputJobId) {
    throw new Error("MORAWARE_DISCOVERY_MODE=exact-job requires MORAWARE_JOB_ID");
  }
  if (discoveryRuntimeMode === "find-fixture" && !expectedJobNameEnv) {
    throw new Error("find-fixture mode requires MORAWARE_EXPECTED_JOB_NAME");
  }

  let fixtureMatchEligible = false;
  let fixtureSkippedReason = "";
  let discoveryTargetJobId = "";
  let identityMismatchReason = "";
  let broadSearchCandidates = [];
  let broadSearchVariantLog = [];
  let selectedJobSnapshot = null;
  let fixtureSearchResult = "na";
  let fixtureNotFoundReason = "";

  const ctx = {
    sessionId,
    apiUrl,
    timeoutMs,
    runDir,
    latestDir,
    probeIndex: 0,
    probes: [],
    successfulProbeNames: [],
    failedProbeNames: [],
    noDataProbeNames: [],
    partialProbeNames: []
  };

  async function writeJsonToRunAndLatest(fileName, obj) {
    const body = JSON.stringify(obj, null, 2);
    await fs.writeFile(path.join(runDir, fileName), body, "utf8");
    await fs.writeFile(path.join(latestDir, fileName), body, "utf8");
  }

  async function writeTextToRunAndLatest(fileName, text) {
    await fs.writeFile(path.join(runDir, fileName), String(text ?? ""), "utf8");
    await fs.writeFile(path.join(latestDir, fileName), String(text ?? ""), "utf8");
  }

  if (discoveryRuntimeMode === "operational-discovery") {
    if (!ctx) throw new Error("operational-discovery requires initialized discovery ctx");

    console.log("\n>>> MODE operational-discovery: probing Moraware operational APIs for missing Brain concepts.\n");

    const repoRoot = process.cwd();
    const operationalSampleSize = clampNumber(
      process.env.MORAWARE_OPERATIONAL_SAMPLE_SIZE,
      1,
      50,
      10
    );
    console.log("Operational discovery sample size:", operationalSampleSize);
    const sampleJobIdsEnv = envCsvList("MORAWARE_SAMPLE_JOB_IDS");
    const desiredJobId = String(process.env.MORAWARE_JOB_ID ?? "").trim();

    const candidates = await loadOperationalCandidateJobs(repoRoot, 2026);
    const candidatesById = new Map(candidates.map((r) => [String(r.jobId), r]));

    const picked = [];
    const pickedSet = new Set();

    const addJob = (jid) => {
      const id = String(jid ?? "").trim();
      if (!id || pickedSet.has(id)) return;
      pickedSet.add(id);
      picked.push(id);
    };

    for (const jid of sampleJobIdsEnv) addJob(jid);
    if (desiredJobId) addJob(desiredJobId);
    addJob("37565");

    const top5 = [...candidates]
      .sort((a, b) => (b.worksheetSqFt || 0) - (a.worksheetSqFt || 0))
      .slice(0, 5);
    top5.forEach((r) => addJob(r.jobId));

    const remainingIds = candidates.map((r) => String(r.jobId)).filter((id) => !pickedSet.has(id));
    pickRandomDistinct(remainingIds, 5, pickedSet).forEach(addJob);

    const sampleJobs = picked.slice(0, operationalSampleSize);

    const operationalLeafDumpLines = [];
    const probeRecords = [];
    const schemaErrors = [];
    const matches = [];
    const matchers = buildOperationalConceptMatchers();

    for (const jid of sampleJobs) {
      const probeList = makeOperationalProbeList(jid);
      for (const p of probeList) {
        const res = await sendMorawareCommand(ctx, p.commandName, p.innerXml, {
          probeName: `OP-${jid}-${p.id}`
        });

        const blockErr = firstBlockingMorawareErrorRecord(res.apiErrors || []);
        const errorCode = blockErr ? String(blockErr.errorCode ?? "") : "0";
        const description = blockErr
          ? String(blockErr.description || blockErr.errorCodeDescription || res.probeReason || "")
              .replace(/\s+/g, " ")
              .trim()
          : String(res.probeReason || "").replace(/\s+/g, " ").trim();

        probeRecords.push({
          jobId: jid,
          commandName: p.commandName,
          probeId: p.id,
          probeName: res.probeName,
          httpStatus: res.httpStatus,
          probeStatus: res.probeStatus,
          errorCode,
          description,
          requestPath: res.requestPath,
          responsePath: res.responsePath
        });

        if (res.probeStatus !== "success") {
          if (errorCode && errorCode !== "0") {
            schemaErrors.push({
              jobId: jid,
              commandName: p.commandName,
              probeId: p.id,
              errorCode,
              description
            });
          }
          continue;
        }

        if (res.parsed) {
          appendLeafDump(res.parsed, res.probeName, operationalLeafDumpLines);
          walkObjectDeep(res.parsed, "", (pth, v) => {
            if (v == null) return;
            if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") return;
            const valStr = String(v);
            for (const m of matchers) {
              if (!m.re.test(pth) && !m.re.test(valStr)) continue;
              matches.push({
                concept: m.concept,
                command: p.commandName,
                probeId: p.id,
                jobId: jid,
                path: pth,
                sampleValue: valStr.slice(0, 200)
              });
            }
          });
        }
      }
    }

    const seenMatch = new Set();
    const uniqMatches = [];
    for (const m of matches) {
      const k = `${m.concept}|${m.command}|${m.path}|${m.sampleValue}`;
      if (seenMatch.has(k)) continue;
      seenMatch.add(k);
      uniqMatches.push(m);
    }

    const summary = {
      discoveryRuntimeMode,
      sampleJobs: sampleJobs.map((id) => ({ jobId: id, meta: candidatesById.get(id) || null })),
      probesAttempted: probeRecords.length,
      successfulProbes: probeRecords.filter((r) => r.probeStatus === "success").length,
      schemaErrors: schemaErrors.length,
      matchedConcepts: [...new Set(uniqMatches.map((m) => m.concept))],
      notFoundConcepts: matchers
        .map((x) => x.concept)
        .filter((c) => !uniqMatches.some((m) => m.concept === c))
    };

    await writeJsonToRunAndLatest("operational-discovery-summary.json", summary);
    await writeJsonToRunAndLatest("operational-discovery-probes.json", probeRecords);
    await writeJsonToRunAndLatest("operational-schema-errors.json", schemaErrors);
    await writeJsonToRunAndLatest("operational-matches.json", uniqMatches);
    await fs.writeFile(
      path.join(runDir, "operational-leaf-dump.txt"),
      operationalLeafDumpLines.join("\n") + "\n",
      "utf8"
    );
    await fs.writeFile(
      path.join(latestDir, "operational-leaf-dump.txt"),
      operationalLeafDumpLines.join("\n") + "\n",
      "utf8"
    );

    console.log("\n=== OPERATIONAL DISCOVERY SUMMARY ===");
    console.log(`sample jobs: ${sampleJobs.length}`);
    console.log(`probes attempted: ${probeRecords.length}`);
    console.log(`successful probes: ${summary.successfulProbes}`);
    console.log(`schema errors: ${schemaErrors.length}`);
    console.log(`matched concepts: ${summary.matchedConcepts.join(", ") || "(none)"}`);
    console.log("\nconcept | status | command | path | sample value");
    for (const row of uniqMatches.slice(0, 80)) {
      console.log(
        `${row.concept} | matched | ${row.command} | ${row.path} | ${String(row.sampleValue).replace(/\s+/g, " ")}`
      );
    }

    return {
      brain: null,
      discoverySummary: summary,
      runDir,
      allFields: [],
      formCandidates: []
    };
  }

  const brain = createEmptyBrain({ jobId: inputJobId, accountId: accountIdStr });
  const allFields = [];
  const leafDumpLines = [];
  const formDetailProbeRecords = [];
  let jobCandidates = [];
  let ranFirstFormMatrix = false;
  let matrixMirrorExtraFiles = [];
  let sdkJobFormsAllFieldsHit = false;
  let sdkJobFormsAllFieldsParsed = null;
  let sdkNormalizedForms = null;
  let sdkIngestMetrics = null;
  let sdkWarmFormCandidates = [];
  let winningFormProbeName = "";

  console.log("\n=== MORAWARE DISCOVERY V2 ===");
  console.log(`Discovery runtime mode: ${discoveryRuntimeMode}`);
  console.log(`Input Job ID: ${inputJobId || "(none)"}`);
  console.log(`Input Account ID: ${accountIdStr || "(none)"}`);
  console.log(`Expected Job Name (env): ${expectedJobNameEnv || "(not set)"}`);
  console.log(`Expected Account Name (env): ${expectedAccountEnv || "(not set)"}`);
  console.log(`Expected Creation Date (env): ${expectedCreationEnv || "(not set)"}`);
  console.log(`Artifacts: ${runDir}\n`);
  console.log("SDK trace resolved field XML: use include/formField/name/value/dataType (primary jobForm fields path).");

  if (jobFormMatrixV3Enabled()) {
    if (discoveryRuntimeMode !== "exact-job") {
      throw new Error("MORAWARE_JOBFORM_MATRIX_V3=1 requires MORAWARE_DISCOVERY_MODE=exact-job");
    }
    if (!inputJobId) {
      throw new Error("MORAWARE_JOBFORM_MATRIX_V3=1 requires MORAWARE_JOB_ID");
    }

    discoveryTargetJobId = inputJobId;

    await runJobFormFieldMatrixV3Flow(ctx, brain, inputJobId, accountIdStr);

    console.log("\nMORAWARE JOBFORM MATRIX V3 COMPLETE — stopping discovery pipeline here.\n");

    return {
      brain,
      discoverySummary: {
        jobFormMatrixV3: true,
        discoveryRuntimeMode,
        inputJobId,
        runDir
      },
      runDir,
      allFields: [],
      formCandidates: []
    };
  }

  let returnedNameRequested = "";
  let returnedDateRequested = "";
  let returnedAccountRequested = "";
  let returnedSalespersonRequested = "";

  if (discoveryRuntimeMode === "exact-job") {
    discoveryTargetJobId = inputJobId;
    console.log("\n>>> MODE exact-job: single job lookup only (no account resolver / no Decor fixture search).\n");
  } else if (discoveryRuntimeMode === "find-fixture") {
    fixtureSearchResult = "pending";
    broadSearchCandidates = [];
    broadSearchVariantLog = [];
    jobCandidates = [];

    let pickedRow = null;

    if (inputJobId) {
      const inner = buildJobQueryFinderCandidateInnerXml(inputJobId);
      const res = await sendMorawareCommand(ctx, "jobQuery", inner, {
        probeName: "FIND-FIXTURE-ENV-JOB-ID",
        evaluate: ({ parsed, httpStatus, apiErrors }) =>
          evaluateJobDetailProbe(parsed, httpStatus, apiErrors, inputJobId)
      });
      const job = extractJobNode(res.parsed, inputJobId);
      const envRow = buildFindFixtureCandidateRow(job, {
        id: inputJobId,
        source: "env-job-id",
        probeStatus: res.probeStatus,
        expectedJobNameEnv
      });
      printFindFixtureCandidateTable("FIND-FIXTURE ENV JOB ID CANDIDATE", [envRow]);
      if (envRow.isFixtureCandidate && envRow.score >= MIN_FIXTURE_SCORE) {
        pickedRow = envRow;
        fixtureSearchResult = "found";
        console.log(
          `\n>>> find-fixture: using MORAWARE_JOB_ID=${inputJobId} (passes Decor-Ferguson fixture gates and score>=${MIN_FIXTURE_SCORE}).\n`
        );
      } else {
        const subreason = !envRow.isFixtureCandidate
          ? envRow.rejectReason || "fixture name gate failed"
          : `score ${envRow.score} < MIN_FIXTURE_SCORE (${MIN_FIXTURE_SCORE})`;
        console.warn(`Ignoring MORAWARE_JOB_ID=${inputJobId}: ${subreason}.`);
      }
    }

    const searchAccountId = String(process.env.MORAWARE_ACCOUNT_ID ?? accountIdStr ?? "").trim();

    if (!pickedRow && searchAccountId) {
      console.log("\n>>> MODE find-fixture: scanning jobs under account filter…\n");
      const listInner = buildAccountJobIdsOnlyInner(searchAccountId);
      const listRes = await sendMorawareCommand(ctx, "jobQuery", listInner, {
        probeName: "FIND-FIXTURE-ACCOUNT-JOBS",
        evaluate: ({ parsed, httpStatus, apiErrors }) => {
          if (httpStatus < 200 || httpStatus >= 300) return { status: "error", reason: `http ${httpStatus}` };
          if (parsed?.parseError) return { status: "error", reason: parsed.parseError };
          if (hasBlockingMorawareError(apiErrors)) return { status: "error", reason: apiErrors[0]?.description };
          const ids = extractAccountJobIds(parsed);
          if (!ids.length) return { status: "no-data", reason: "no jobs under account" };
          return { status: "success", reason: `${ids.length} job ids` };
        }
      });

      const candidateIds = extractAccountJobIds(listRes.parsed || {});
      const scored = [];
      for (const cid of candidateIds) {
        const inner = buildJobQueryFinderCandidateInnerXml(cid);
        const res = await sendMorawareCommand(ctx, "jobQuery", inner, {
          probeName: `FIND-FIXTURE-JOB-${cid}`,
          evaluate: ({ parsed, httpStatus, apiErrors }) =>
            evaluateJobDetailProbe(parsed, httpStatus, apiErrors, cid)
        });
        const job = extractJobNode(res.parsed, cid);
        scored.push(
          buildFindFixtureCandidateRow(job, {
            id: cid,
            source: "account",
            probeStatus: res.probeStatus,
            expectedJobNameEnv
          })
        );
      }
      jobCandidates = scored.sort((a, b) => b.score - a.score);
      printFindFixtureCandidateTable("FIND-FIXTURE ACCOUNT CANDIDATES", jobCandidates);
      pickedRow = pickSelectableFindFixtureCandidate(jobCandidates);
      if (!pickedRow) {
        console.log(`No Decor-Ferguson fixture candidate found in account ${searchAccountId}.`);
      }
    } else if (!pickedRow && !searchAccountId) {
      console.log("\n>>> MODE find-fixture: no MORAWARE_ACCOUNT_ID — skipping account-scoped scan.\n");
    }

    const maxPages = parseMaxSearchPagesForFixture();
    if (!pickedRow && maxPages > 0) {
      console.log("\n=== BROAD JOB SEARCH (find-fixture, process-scoped) ===\n");

      const processOverride = parseCsvIdList(process.env.MORAWARE_PROCESS_IDS);
      let processesDiscovered = [];
      let processesUsed = [];

      if (processOverride.length) {
        processesUsed = processOverride;
      } else {
        const pd = await discoverProcesses(ctx);
        processesDiscovered = pd.processIds;
        processesUsed = processesDiscovered;
        await writeJsonToRunAndLatest("process-discovery.json", {
          discoveryRuntimeMode,
          probes: pd.probes,
          processesDiscovered: pd.processIds
        });
      }

      const maxProcesses = toNumberOr(process.env.MORAWARE_MAX_PROCESSES, 10);
      processesUsed = processesUsed.slice(0, maxProcesses);

      if (!processesUsed.length) {
        fixtureNotFoundReason =
          "Process discovery returned no process IDs. Set MORAWARE_PROCESS_IDS=1,2,3 to enable process-scoped broad search.";
        console.warn(fixtureNotFoundReason);
      } else {
        const pageSize = Number(process.env.MORAWARE_SEARCH_PAGE_SIZE || process.env.MORAWARE_PAGE_SIZE || 100);
        const seen = new Set();
        const processFilterVariants = ["processIdAttr", "processText"];

        for (const processId of processesUsed) {
          for (let pageIdx = 0; pageIdx < maxPages; pageIdx += 1) {
            const firstRecord = pageIdx * pageSize;
            let pageOk = false;
            let jobs = [];

            for (const variantId of processFilterVariants) {
              const inner = buildJobQueryByProcessInnerXml(processId, firstRecord, pageSize, variantId);
              const res = await sendMorawareCommand(ctx, "jobQuery", inner, {
                probeName: `FIND-FIXTURE-BROAD-PROC-${processId}-${variantId}-p${pageIdx}`,
                evaluate: ({ parsed, httpStatus, apiErrors }) => {
                  if (httpStatus < 200 || httpStatus >= 300) return { status: "error", reason: `http ${httpStatus}` };
                  if (parsed?.parseError) return { status: "error", reason: parsed.parseError };
                  if (hasBlockingMorawareError(apiErrors)) {
                    return { status: "error", reason: apiErrors[0]?.description || String(apiErrors[0]?.errorCode) };
                  }
                  return { status: "success", reason: "broad process page" };
                }
              });

              jobs = asArray(res.parsed?.MorawareResponse?.jobQuery?.job);
              const blockErr = firstBlockingMorawareErrorRecord(res.apiErrors || []);
              const errorCode = blockErr ? String(blockErr.errorCode ?? "") : "0";
              const description = blockErr
                ? String(blockErr.description || blockErr.errorCodeDescription || res.probeReason || "").replace(
                    /\s+/g,
                    " "
                  )
                : String(res.probeReason || "").replace(/\s+/g, " ");

              console.log(
                `BROAD SEARCH process=${processId} ${variantId} ${pageIdx} ${firstRecord} ${res.probeStatus} ${errorCode} ${description.trim()} ${jobs.length}`
              );

              broadSearchVariantLog.push({
                variantName: `process=${processId}:${variantId}`,
                page: pageIdx,
                firstRecord,
                probeStatus: res.probeStatus,
                httpStatus: res.httpStatus,
                errorCode,
                description: description.trim(),
                jobCount: jobs.length,
                probeName: res.probeName
              });

              if (res.probeStatus === "success") {
                pageOk = true;
                break;
              }
            }

            if (!pageOk) break;

            for (const j of jobs) {
              const id = String(j?._attributes?.id ?? j?.id ?? "").trim();
              if (!id || seen.has(id)) continue;
              seen.add(id);
              broadSearchCandidates.push(
                buildFindFixtureCandidateRow(j, {
                  id,
                  source: `broad-process:${processId}`,
                  pageIndex: pageIdx,
                  expectedJobNameEnv
                })
              );
            }

            broadSearchCandidates.sort((a, b) => b.score - a.score);
            pickedRow = pickSelectableFindFixtureCandidate([...jobCandidates, ...broadSearchCandidates]);
            if (pickedRow) break;

            if (jobs.length < pageSize) break;
          }

          if (pickedRow) break;
        }
      }

      printFindFixtureCandidateTable("FIND-FIXTURE BROAD CANDIDATES (accumulated)", broadSearchCandidates);
      if (!pickedRow) {
        pickedRow = pickSelectableFindFixtureCandidate([...jobCandidates, ...broadSearchCandidates]);
      }
    } else if (!pickedRow && maxPages <= 0) {
      console.log("\n>>> MODE find-fixture: MORAWARE_MAX_SEARCH_PAGES<=0 — skipping broad search.\n");
    }

    discoveryTargetJobId = pickedRow?.id ?? "";
    fixtureSearchResult = pickedRow ? "found" : "not_found";
    if (!pickedRow) {
      fixtureNotFoundReason =
        fixtureNotFoundReason ||
        "No job matching Decor-Ferguson was found in account or broad search.";
      console.log(
        "Decor-Ferguson fixture not found. Brain ingestion was not run because no valid target job was resolved."
      );
    }

    selectedJobSnapshot = pickedRow
      ? {
          id: pickedRow.id,
          name: pickedRow.name,
          account: pickedRow.account,
          creationDate: pickedRow.creationDate,
          salesperson: pickedRow.salesperson,
          score: pickedRow.score,
          isFixtureCandidate: pickedRow.isFixtureCandidate,
          source: pickedRow.source
        }
      : null;

    if (discoveryTargetJobId) {
      console.log(
        `\n>>> find-fixture picked job ${discoveryTargetJobId} (${selectedJobSnapshot?.name ?? ""}) source=${selectedJobSnapshot?.source ?? ""}\n`
      );
    }
  } else if (discoveryRuntimeMode === "global-sync") {
    console.log("\n>>> MODE global-sync: process discovery + per-process paged job sync.\n");

    const maxProcesses = toNumberOr(process.env.MORAWARE_MAX_PROCESSES, 10);
    const maxPages = toNumberOr(process.env.MORAWARE_MAX_SEARCH_PAGES, 50);
    const pageSize = toNumberOr(process.env.MORAWARE_SEARCH_PAGE_SIZE, 100);
    const maxJobsToIngest = toNumberOr(process.env.MORAWARE_MAX_JOBS_TO_INGEST, 25);
    const ingestForms = envTruthy(process.env.MORAWARE_INGEST_FORMS ?? "1");
    const startedAt = new Date().toISOString();

    const syncYear = String(process.env.MORAWARE_SYNC_YEAR ?? "").trim();
    const syncStartDateRaw = String(process.env.MORAWARE_SYNC_START_DATE ?? "").trim();
    const syncEndDateRaw = String(process.env.MORAWARE_SYNC_END_DATE ?? "").trim();
    const ingestAllMatching = envTruthy(process.env.MORAWARE_INGEST_ALL_MATCHING_JOBS ?? "");
    const syncStartMs = syncStartDateRaw ? parseIsoDateToMsOrNull(syncStartDateRaw) : null;
    const syncEndMs = syncEndDateRaw ? parseIsoDateToMsOrNull(syncEndDateRaw) : null;
    const dateFilterEnabled = Boolean(syncStartMs != null || syncEndMs != null || syncYear);
    const syncLabel =
      syncYear ||
      (syncStartDateRaw && syncStartDateRaw.match(/^(\d{4})-/) ? syncStartDateRaw.slice(0, 4) : "") ||
      "date";
    const syncPrefix = syncLabel === "2026" ? "sync-2026" : `sync-${syncLabel}`;

    const supabaseWriteEnabled = isSupabaseWriteEnabled() && isSupabaseEnabled();

    const processOverride = parseCsvIdList(process.env.MORAWARE_PROCESS_IDS);
    let processesDiscovered = [];
    let processesUsed = [];
    let processDiscoveryProbes = [];

    if (processOverride.length) {
      processesUsed = processOverride;
      console.log(`Using MORAWARE_PROCESS_IDS override (${processesUsed.length}): ${processesUsed.join(", ")}`);
    } else {
      const pd = await discoverProcesses(ctx);
      processesDiscovered = pd.processIds;
      processesUsed = pd.processIds;
      processDiscoveryProbes = pd.probes;
      await writeJsonToRunAndLatest("process-discovery.json", {
        discoveryRuntimeMode,
        probes: pd.probes,
        processesDiscovered: pd.processIds
      });
    }

    processesUsed = processesUsed.slice(0, maxProcesses);

    if (!processesUsed.length) {
      console.warn("global-sync: no process IDs discovered. Set MORAWARE_PROCESS_IDS=1,2,3 and rerun.");
      // Keep going to artifact write section; do not crash.
      const finishedAt = new Date().toISOString();
      const coverageTxt =
        `MORAWARE GLOBAL SYNC COVERAGE\n` +
        `processes discovered: 0\n` +
        `processes used: 0\n` +
        `job ids discovered: 0\n` +
        `jobs detailed: 0\n` +
        `jobs with forms ingested: 0\n` +
        `forms extracted: 0\n` +
        `fields extracted: 0\n` +
        `worksheetSqFt total across batch: 0\n` +
        `jobs index: jobs/index.json\n` +
        `sample job artifacts:\n` +
        `reason=No processes discovered. Provide MORAWARE_PROCESS_IDS to enable global-sync job paging.\n`;
      await writeTextToRunAndLatest("coverage-report.txt", coverageTxt);
      await writeJsonToRunAndLatest("global-sync-summary.json", {
        discoveryRuntimeMode: "global-sync",
        processCount: 0,
        processesUsed: [],
        jobIdsDiscovered: 0,
        jobsDetailed: 0,
        jobsWithFormsIngested: 0,
        formsExtracted: 0,
        fieldsExtracted: 0,
        worksheetSqFtTotalAcrossBatch: 0,
        maxJobsToIngest,
        pageSize,
        maxPages,
        startedAt,
        finishedAt
      });
      console.log("global-sync: no process IDs discovered. Set MORAWARE_PROCESS_IDS=1,2,3 and rerun.");
      return {
        brain: null,
        discoverySummary: { discoveryRuntimeMode: "global-sync", processesUsed: [], jobIdsDiscovered: 0 },
        runDir,
        allFields: [],
        formCandidates: []
      };
    } else {
      const pagesLog = [];
      const jobCandidatesGlobal = [];
      const jobIds = new Set();
      const processFilterVariants = ["processIdAttr", "processText"];

      for (const processId of processesUsed) {
        for (let pageIdx = 0; pageIdx < maxPages; pageIdx += 1) {
          const firstRecord = pageIdx * pageSize;
          let pageOk = false;
          let jobs = [];
          let chosenVariant = "";

          for (const variantId of processFilterVariants) {
            const inner = buildJobQueryByProcessInnerXml(processId, firstRecord, pageSize, variantId);
            const res = await sendMorawareCommand(ctx, "jobQuery", inner, {
              probeName: `GLOBAL-SYNC-JOBS-${processId}-${variantId}-p${pageIdx}`
            });
            jobs = asArray(res.parsed?.MorawareResponse?.jobQuery?.job);
            const blockErr = firstBlockingMorawareErrorRecord(res.apiErrors || []);
            const errorCode = blockErr ? String(blockErr.errorCode ?? "") : "0";
            const description = blockErr
              ? String(blockErr.description || blockErr.errorCodeDescription || res.probeReason || "").replace(
                  /\s+/g,
                  " "
                )
              : String(res.probeReason || "").replace(/\s+/g, " ");

            pagesLog.push({
              processId,
              variantId,
              page: pageIdx,
              firstRecord,
              probeStatus: res.probeStatus,
              httpStatus: res.httpStatus,
              errorCode,
              description: description.trim(),
              jobCount: jobs.length,
              probeName: res.probeName
            });

            console.log(
              `BROAD SEARCH process=${processId} ${variantId} ${pageIdx} ${firstRecord} ${res.probeStatus} ${errorCode} ${description.trim()} ${jobs.length}`
            );

            if (res.httpStatus >= 200 && res.httpStatus < 300 && !res.parsed?.parseError && !hasBlockingMorawareError(res.apiErrors || [])) {
              pageOk = true;
              chosenVariant = variantId;
              break;
            }
          }

          if (!pageOk) break;

          for (const j of jobs) {
            const id = String(j?._attributes?.id ?? j?.id ?? "").trim();
            if (!id || jobIds.has(id)) continue;
            jobIds.add(id);
            jobCandidatesGlobal.push({
              id,
              name: getText(j?.name),
              status: getText(j?.jobStatus),
              creationDate: getText(j?.creationDate),
              account: getText(j?.account?.name),
              salesperson: getText(j?.salesperson?.name),
              source: `process:${processId}`,
              pageIndex: pageIdx,
              variantId: chosenVariant
            });
          }

          if (jobs.length < pageSize) break;
        }
      }

      await writeJsonToRunAndLatest("global-job-pages.json", pagesLog);
      await writeJsonToRunAndLatest("global-job-candidates.json", jobCandidatesGlobal);

      const jobIdsList = [...jobIds];
      const jobsDirRun = path.join(runDir, "jobs");
      const jobsDirLatest = path.join(latestDir, "jobs");
      await mkdirp(jobsDirRun);
      await mkdirp(jobsDirLatest);

      let jobsDetailed = 0;
      let jobsWithForms = 0;
      let formsExtracted = 0;
      let fieldsExtracted = 0;
      let worksheetSqFtTotalAcrossBatch = 0;
      let operationalActivitiesExtracted = 0;
      let operationalPhasesExtracted = 0;
      let operationalContactsExtracted = 0;

      const jobsIndexRows = [];
      const sampleArtifactPaths = [];

      const failedJobIds = [];
      const failedJobIdSet = new Set();
      const failedStageSet = new Set(); // `${jobId}|${stage}`
      const failedJobsByStage = {};
      const syncCandidates = [];
      const syncRejected = [];
      let jobsMatchingDateFilter = 0;
      let skippedBefore2026Count = 0;
      let skippedMissingCreationDateCount = 0;
      let earliestIngestedMs = null;
      let latestIngestedMs = null;

      let supabaseJobsWritten = 0;
      let supabaseFormsWritten = 0;
      let supabaseFieldsWritten = 0;

      const detailCache = new Map(); // jobId -> { parsed, jobNode }

      const safetyCap = isEnvSet("MORAWARE_MAX_JOBS_TO_INGEST") ? maxJobsToIngest : Infinity;
      const selectedJobIds = [];

      const syncRunIdEnv = String(process.env.EOS_SYNC_RUN_ID ?? "").trim();
      const canRecordFailures = Boolean(syncRunIdEnv) && supabaseWriteEnabled;

      async function recordJobFailure(jobId, syncStage, err, payload) {
        try {
          const jid = String(jobId ?? "").trim();
          if (!jid) return;
          const stageKey = `${jid}|${syncStage}`;
          if (failedStageSet.has(stageKey)) return;
          failedStageSet.add(stageKey);

          if (!failedJobIdSet.has(jid)) {
            failedJobIdSet.add(jid);
            failedJobIds.push(jid);
          }
          failedJobsByStage[syncStage] = (failedJobsByStage[syncStage] || 0) + 1;
          if (!canRecordFailures) return;
          await recordFailedJobSync({
            jobId: jid,
            syncRunId: syncRunIdEnv,
            syncStage,
            errorMessage: String(err?.message || err || ""),
            payload: payload ?? null
          });
        } catch {
          // never crash sync due to failure tracking
        }
      }

      if (dateFilterEnabled || ingestAllMatching) {
        for (const jid of jobIdsList) {
          if (selectedJobIds.length >= safetyCap) break;
          if (!ingestAllMatching && selectedJobIds.length >= maxJobsToIngest) break;

          const detailInner = buildJobDetailInnerXml(jid);
          const detailRes = await sendMorawareCommand(ctx, "jobQuery", detailInner, {
            probeName: `GLOBAL-SYNC-JOB-DETAIL-${jid}`,
            evaluate: ({ parsed, httpStatus, apiErrors }) => evaluateJobDetailProbe(parsed, httpStatus, apiErrors, jid)
          });

          if (detailRes.probeStatus === "success" && detailRes.parsed) jobsDetailed += 1;
          else failedJobIds.push(jid);

          const jobNode = extractJobNode(detailRes.parsed, jid);
          detailCache.set(jid, { parsed: detailRes.parsed, jobNode });

          const creationDateRaw = getText(jobNode?.creationDate);
          const creationMs = parseIsoDateToMsOrNull(creationDateRaw);

          let accepted = true;
          let rejectReason = "";

          if (dateFilterEnabled) {
            if (!creationMs) {
              accepted = false;
              rejectReason = "missing creationDate";
              skippedMissingCreationDateCount += 1;
            } else {
              if (syncStartMs != null && creationMs < syncStartMs) {
                accepted = false;
                rejectReason = `creationDate before start (${syncStartDateRaw})`;
                skippedBefore2026Count += 1;
              }
              if (accepted && syncEndMs != null && creationMs > syncEndMs) {
                accepted = false;
                rejectReason = `creationDate after end (${syncEndDateRaw})`;
              }
              if (accepted && syncYear) {
                const y = new Date(creationMs).getUTCFullYear();
                if (String(y) !== syncYear) {
                  accepted = false;
                  rejectReason = `creationDate not in year ${syncYear}`;
                  if (creationMs < Date.parse(`${syncYear}-01-01T00:00:00Z`)) skippedBefore2026Count += 1;
                }
              }
            }
          }

          const row = {
            jobId: jid,
            jobName: getText(jobNode?.name),
            accountId: String(jobNode?.account?._attributes?.id ?? "").trim(),
            accountName: getText(jobNode?.account?.name),
            creationDate: creationDateRaw,
            jobStatus: getText(jobNode?.jobStatus),
            salespersonName: getText(jobNode?.salesperson?.name),
            accepted,
            rejectReason
          };

          if (accepted) {
            jobsMatchingDateFilter += 1;
            syncCandidates.push(row);
            selectedJobIds.push(jid);
          } else {
            syncRejected.push(row);
          }
        }

        if (dateFilterEnabled) {
          await writeJsonToRunAndLatest(`${syncPrefix}-candidates.json`, syncCandidates);
          await writeJsonToRunAndLatest(`${syncPrefix}-rejected.json`, syncRejected);
        }
      } else {
        selectedJobIds.push(...jobIdsList.slice(0, maxJobsToIngest));
      }

      for (const jid of selectedJobIds) {
        const b = createEmptyBrain({ jobId: jid, accountId: "" });
        const cached = detailCache.get(jid) || { parsed: null, jobNode: null };
        let detailParsed = cached.parsed;
        let jobNode = cached.jobNode || extractJobNode(detailParsed, jid);
        const accountIdFromJob = String(jobNode?.account?._attributes?.id ?? "").trim();
        const jobStatus = getText(jobNode?.jobStatus);
        if (accountIdFromJob) b.source.accountId = accountIdFromJob;
        if (!detailParsed || !jobNode) {
          // Defensive: ensure we have job detail for per-job ingest loop.
          try {
            const detailInner = buildJobDetailInnerXml(jid);
            const detailRes = await sendMorawareCommand(ctx, "jobQuery", detailInner, {
              probeName: `GLOBAL-SYNC-JOB-DETAIL-INGEST-${jid}`,
              evaluate: ({ parsed, httpStatus, apiErrors }) => evaluateJobDetailProbe(parsed, httpStatus, apiErrors, jid)
            });
            if (detailRes.probeStatus === "success" && detailRes.parsed) jobsDetailed += 1;
            detailParsed = detailRes.parsed;
            jobNode = extractJobNode(detailParsed, jid);
            detailCache.set(jid, { parsed: detailParsed, jobNode });
          } catch (e) {
            await recordJobFailure(jid, "job_detail_fetch", e, { probe: "jobQuery", jobId: jid });
            continue;
          }
        }

        try {
          if (detailParsed) {
            applyJobInfo(b, detailParsed, jid);
            applyAddresses(b, detailParsed, jid);
          }
        } catch (e) {
          await recordJobFailure(jid, "job_detail_apply", e, { jobId: jid });
          continue;
        }

        const ingestOperational = envTruthy(process.env.MORAWARE_INGEST_OPERATIONAL ?? "0");
        if (ingestOperational) {
          try {
            const opInner = buildJobIncludeAllCommand(jid);
            const opRes = await sendMorawareCommand(ctx, "jobQuery", opInner, {
              probeName: `GLOBAL-SYNC-OPERATIONAL-${jid}`
            });
            if (opRes.httpStatus >= 200 && opRes.httpStatus < 300 && !opRes.parsed?.parseError) {
              try {
                assertNoBlockingMorawareErrors(opRes.parsed);
                const operational = normalizeJobOperational(jid, opRes.parsed);
                const summary = deriveOperationalSummary(jid, operational);
                const packaged = { ...operational, summary };

                const opRel = `jobs/${jid}.operational.json`;
                const opJson = JSON.stringify(packaged, null, 2);
                await fs.writeFile(path.join(jobsDirRun, `${jid}.operational.json`), opJson, "utf8");
                await fs.writeFile(path.join(jobsDirLatest, `${jid}.operational.json`), opJson, "utf8");

                operationalActivitiesExtracted += Array.isArray(packaged?.activities) ? packaged.activities.length : 0;
                operationalPhasesExtracted += Array.isArray(packaged?.phases) ? packaged.phases.length : 0;
                operationalContactsExtracted += Array.isArray(packaged?.contacts) ? packaged.contacts.length : 0;

                try {
                  const rop = await replaceJobOperational(jid, packaged);
                  if (!rop?.skipped) {
                    // counters can be added later; keep ingestion non-invasive
                  }
                } catch (e) {
                  await recordJobFailure(jid, "operational_supabase_write", e, { jobId: jid });
                }
              } catch {
                // ignore operational parse errors
              }
            }
          } catch {
            // ignore operational ingestion errors
          }
        }

        if (ingestForms) {
          try {
            const sdkInner = buildJobFormsAllFieldsCommand(jid);
            let sdkRes;
            try {
              sdkRes = await sendMorawareCommand(ctx, "jobFormQuery", sdkInner, {
                probeName: `GLOBAL-SYNC-SDK-JOBFORMS-${jid}`
              });
            } catch (e) {
              await recordJobFailure(jid, "job_forms_fetch", e, { probe: "jobFormQuery", jobId: jid });
              sdkRes = null;
            }
            if (sdkRes.httpStatus >= 200 && sdkRes.httpStatus < 300 && !sdkRes.parsed?.parseError) {
              try {
                assertNoBlockingMorawareErrors(sdkRes.parsed);
                let norm;
                try {
                  norm = normalizeJobFormsFromSdkParsed(sdkRes.parsed);
                } catch (e) {
                  await recordJobFailure(jid, "job_forms_normalize", e, { jobId: jid });
                  norm = null;
                }

                if (norm && Array.isArray(norm.forms)) {
                  try {
                    const metrics = computeWorksheetSqFtMetrics(norm.forms);
                    b.forms = norm.forms;
                    b.metrics.formCount = metrics.formCount;
                    b.metrics.fieldCount = metrics.fieldCount;
                    b.metrics.worksheetCount = metrics.worksheetCount;
                    b.metrics.worksheetSqFt = metrics.worksheetSqFt;
                    b.metrics.totalSqFt = metrics.totalSqFt;
                    b.metrics.sqFtByForm = metrics.sqFtByForm;
                    b.metrics.sqFtFields = metrics.sqFtFields;
                    jobsWithForms += 1;
                    formsExtracted += metrics.formCount;
                    fieldsExtracted += metrics.fieldCount;
                    worksheetSqFtTotalAcrossBatch += metrics.worksheetSqFt;
                  } catch (e) {
                    await recordJobFailure(jid, "job_fields_extract", e, { jobId: jid });
                  }
                }
              } catch (e) {
                await recordJobFailure(jid, "job_forms_normalize", e, { jobId: jid });
              }
            }
          } catch (e) {
            await recordJobFailure(jid, "job_fields_extract", e, { jobId: jid });
          }
        }

        const normalizedBrain = {
          source: b.source,
          jobInfo: b.jobInfo,
          forms: b.forms,
          metrics: b.metrics,
          raw: b.raw
        };
        const jobJson = JSON.stringify(normalizedBrain, null, 2);
        const artifactRelPath = `jobs/${jid}.json`;
        await fs.writeFile(path.join(jobsDirRun, `${jid}.json`), jobJson, "utf8");
        await fs.writeFile(path.join(jobsDirLatest, `${jid}.json`), jobJson, "utf8");
        if (sampleArtifactPaths.length < 5) sampleArtifactPaths.push(artifactRelPath);

        jobsIndexRows.push({
          jobId: jid,
          jobName: b.jobInfo.jobName || "",
          accountId: b.source.accountId || "",
          accountName: b.jobInfo.accountName || "",
          creationDate: b.jobInfo.creationDate || "",
          jobStatus: jobStatus || "",
          salespersonName: b.jobInfo.salespersonName || "",
          formCount: b.metrics.formCount || 0,
          fieldCount: b.metrics.fieldCount || 0,
          jobWorksheetForms: b.metrics.worksheetCount || 0,
          worksheetSqFt: b.metrics.worksheetSqFt || 0,
          hasForms: Boolean((b.forms || []).length),
          artifactPath: artifactRelPath
        });

        // Optional Supabase persistence (guarded by SUPABASE_WRITE_ENABLED=1).
        try {
          const rj = await upsertBrainJob(normalizedBrain);
          if (!rj?.skipped) supabaseJobsWritten += Number(rj?.count ?? 1) || 1;
        } catch (e) {
          await recordJobFailure(jid, "brain_supabase_write", e, { jobId: jid, target: "brain_jobs" });
        }

        try {
          const rf = await upsertBrainForms(normalizedBrain);
          if (!rf?.skipped) supabaseFormsWritten += Number(rf?.count ?? 0) || 0;
        } catch (e) {
          await recordJobFailure(jid, "job_forms_supabase_write", e, { jobId: jid, target: "brain_forms" });
        }

        try {
          const rfd = await upsertBrainFields(normalizedBrain);
          if (!rfd?.skipped) supabaseFieldsWritten += Number(rfd?.count ?? 0) || 0;
        } catch (e) {
          await recordJobFailure(jid, "job_fields_supabase_write", e, { jobId: jid, target: "brain_fields" });
        }

        const ingestedCreationMs = parseIsoDateToMsOrNull(b.jobInfo.creationDate);
        earliestIngestedMs = safeMin(earliestIngestedMs, ingestedCreationMs);
        latestIngestedMs = safeMax(latestIngestedMs, ingestedCreationMs);
      }

      await fs.writeFile(path.join(jobsDirRun, "index.json"), JSON.stringify(jobsIndexRows, null, 2), "utf8");
      await fs.writeFile(path.join(jobsDirLatest, "index.json"), JSON.stringify(jobsIndexRows, null, 2), "utf8");

      const finishedAt = new Date().toISOString();
      const summary = {
        discoveryRuntimeMode: "global-sync",
        processCount: processesUsed.length,
        processesUsed,
        jobIdsDiscovered: jobIdsList.length,
        jobsDetailed,
        jobsWithFormsIngested: jobsWithForms,
        formsExtracted,
        fieldsExtracted,
        activitiesExtracted: operationalActivitiesExtracted,
        phasesExtracted: operationalPhasesExtracted,
        contactsExtracted: operationalContactsExtracted,
        worksheetSqFtTotalAcrossBatch,
        jobsMatching2026Filter: dateFilterEnabled ? jobsMatchingDateFilter : null,
        jobsIngested: selectedJobIds.length,
        earliestCreationDateIngested:
          earliestIngestedMs != null ? new Date(earliestIngestedMs).toISOString().slice(0, 10) : null,
        latestCreationDateIngested:
          latestIngestedMs != null ? new Date(latestIngestedMs).toISOString().slice(0, 10) : null,
        skippedBefore2026Count,
        skippedMissingCreationDateCount,
        failedJobIds,
        failedJobsByStage,
        supabaseWriteEnabled,
        supabaseJobsWritten,
        supabaseFormsWritten,
        supabaseFieldsWritten,
        maxJobsToIngest,
        pageSize,
        maxPages,
        startedAt,
        finishedAt
      };
      await writeJsonToRunAndLatest("global-sync-summary.json", summary);

      if (dateFilterEnabled) {
        await writeJsonToRunAndLatest(`${syncPrefix}-summary.json`, summary);
      }

      // Record sync run (optional Supabase; still guarded by SUPABASE_WRITE_ENABLED=1).
      try {
        const status = failedJobIds.length > 0 ? "partial_error" : "success";
        await saveSyncRun(summary, status, null);
      } catch (e) {
        console.warn("Supabase sync run write failed:", e?.message || e);
        try {
          await saveSyncRun(summary, "partial_error", String(e?.message || e));
        } catch {
          /* ignore */
        }
      }

      const coverageTxt =
        `MORAWARE GLOBAL SYNC COVERAGE\n` +
        `processes discovered: ${processesDiscovered.length}\n` +
        `processes used: ${processesUsed.length}\n` +
        `job ids discovered: ${jobIdsList.length}\n` +
        `jobs detailed: ${jobsDetailed}\n` +
        `jobs with forms ingested: ${jobsWithForms}\n` +
        `forms extracted: ${formsExtracted}\n` +
        `fields extracted: ${fieldsExtracted}\n` +
        `worksheetSqFt total across batch: ${worksheetSqFtTotalAcrossBatch}\n` +
        `jobs index: jobs/index.json\n` +
        `sample job artifacts:\n` +
        `${sampleArtifactPaths.map((p) => `- ${p}`).join("\n")}\n`;
      await writeTextToRunAndLatest("coverage-report.txt", coverageTxt);

      console.log("\n=== GLOBAL SYNC SUMMARY ===");
      console.log(`processes discovered: ${processesDiscovered.length}`);
      console.log(`processes used: ${processesUsed.length}`);
      console.log(`job ids discovered: ${jobIdsList.length}`);
      console.log(`jobs detailed: ${jobsDetailed}`);
      console.log(`jobs with forms ingested: ${jobsWithForms}`);
      console.log(`forms extracted: ${formsExtracted}`);
      console.log(`fields extracted: ${fieldsExtracted}`);
      console.log(`worksheetSqFt total across batch: ${worksheetSqFtTotalAcrossBatch}`);

      if (dateFilterEnabled) {
        console.log(`\n=== ${syncLabel} BRAIN SYNC SUMMARY ===`);
        console.log(`job ids discovered: ${jobIdsList.length}`);
        console.log(`jobs detailed: ${jobsDetailed}`);
        console.log(`${syncLabel} jobs found: ${jobsMatchingDateFilter}`);
        console.log(`${syncLabel} jobs ingested: ${selectedJobIds.length}`);
        console.log(`forms extracted: ${formsExtracted}`);
        console.log(`fields extracted: ${fieldsExtracted}`);
        console.log(`worksheetSqFt total: ${worksheetSqFtTotalAcrossBatch}`);
        console.log(
          `earliest date: ${
            earliestIngestedMs != null ? new Date(earliestIngestedMs).toISOString().slice(0, 10) : "(n/a)"
          }`
        );
        console.log(
          `latest date: ${
            latestIngestedMs != null ? new Date(latestIngestedMs).toISOString().slice(0, 10) : "(n/a)"
          }`
        );
        console.log(`failures: ${failedJobIds.length}`);
      }

      // global-sync is an all-jobs ingestion path; stop discovery cleanly here.
      return {
        brain: null,
        discoverySummary: summary,
        runDir,
        allFields: [],
        formCandidates: []
      };
    }
    // (unreachable) global-sync returns above
  } else if (discoveryRuntimeMode === "account-sync") {
    console.log("\n>>> MODE account-sync: ingest jobs for one account id.\n");

    const acct = String(process.env.MORAWARE_ACCOUNT_ID ?? accountIdStr ?? "").trim();
    if (!acct) {
      console.warn("account-sync requires MORAWARE_ACCOUNT_ID.");
      await writeTextToRunAndLatest(
        "coverage-report.txt",
        "MORAWARE ACCOUNT SYNC COVERAGE\nreason=Missing MORAWARE_ACCOUNT_ID\n"
      );
      return { brain: null, discoverySummary: { discoveryRuntimeMode: "account-sync", reason: "missing_account_id" }, runDir };
    }

    const maxJobsToIngest = toNumberOr(process.env.MORAWARE_MAX_JOBS_TO_INGEST, 25);
    const ingestForms = envTruthy(process.env.MORAWARE_INGEST_FORMS ?? "1");

    const listInner = buildAccountJobIdsOnlyInner(acct);
    const listRes = await sendMorawareCommand(ctx, "jobQuery", listInner, {
      probeName: "ACCOUNT-SYNC-ACCOUNT-JOBS"
    });
    const ids = extractAccountJobIds(listRes.parsed || {});
    const jobIdsList = ids.slice(0, maxJobsToIngest);

    const jobsDirRun = path.join(runDir, "jobs");
    const jobsDirLatest = path.join(latestDir, "jobs");
    await mkdirp(jobsDirRun);
    await mkdirp(jobsDirLatest);

    const jobsIndexRows = [];
    let jobsDetailed = 0;
    let jobsWithForms = 0;
    let formsExtracted = 0;
    let fieldsExtracted = 0;
    let worksheetSqFtTotalAcrossBatch = 0;

    for (const jid of jobIdsList) {
      const b = createEmptyBrain({ jobId: jid, accountId: acct });
      const detailInner = buildJobDetailInnerXml(jid);
      const detailRes = await sendMorawareCommand(ctx, "jobQuery", detailInner, {
        probeName: `ACCOUNT-SYNC-JOB-DETAIL-${jid}`,
        evaluate: ({ parsed, httpStatus, apiErrors }) => evaluateJobDetailProbe(parsed, httpStatus, apiErrors, jid)
      });
      const jobNode = extractJobNode(detailRes.parsed, jid);
      const accountIdFromJob = String(jobNode?.account?._attributes?.id ?? acct ?? "").trim();
      const jobStatus = getText(jobNode?.jobStatus);
      if (accountIdFromJob) b.source.accountId = accountIdFromJob;
      if (detailRes.probeStatus === "success" && detailRes.parsed) {
        applyJobInfo(b, detailRes.parsed, jid);
        applyAddresses(b, detailRes.parsed, jid);
        jobsDetailed += 1;
      }

      if (ingestForms) {
        try {
          const sdkInner = buildJobFormsAllFieldsCommand(jid);
          const sdkRes = await sendMorawareCommand(ctx, "jobFormQuery", sdkInner, {
            probeName: `ACCOUNT-SYNC-SDK-JOBFORMS-${jid}`
          });
          if (sdkRes.httpStatus >= 200 && sdkRes.httpStatus < 300 && !sdkRes.parsed?.parseError) {
            try {
              assertNoBlockingMorawareErrors(sdkRes.parsed);
              const norm = normalizeJobFormsFromSdkParsed(sdkRes.parsed);
              const metrics = computeWorksheetSqFtMetrics(norm.forms);
              b.forms = norm.forms;
              b.metrics.formCount = metrics.formCount;
              b.metrics.fieldCount = metrics.fieldCount;
              b.metrics.worksheetCount = metrics.worksheetCount;
              b.metrics.worksheetSqFt = metrics.worksheetSqFt;
              b.metrics.totalSqFt = metrics.totalSqFt;
              b.metrics.sqFtByForm = metrics.sqFtByForm;
              b.metrics.sqFtFields = metrics.sqFtFields;
              jobsWithForms += 1;
              formsExtracted += metrics.formCount;
              fieldsExtracted += metrics.fieldCount;
              worksheetSqFtTotalAcrossBatch += metrics.worksheetSqFt;
            } catch {
              /* ignore */
            }
          }
        } catch {
          /* ignore */
        }
      }

      const normalizedBrain = { source: b.source, jobInfo: b.jobInfo, forms: b.forms, metrics: b.metrics, raw: b.raw };
      const jobJson = JSON.stringify(normalizedBrain, null, 2);
      const artifactRelPath = `jobs/${jid}.json`;
      await fs.writeFile(path.join(jobsDirRun, `${jid}.json`), jobJson, "utf8");
      await fs.writeFile(path.join(jobsDirLatest, `${jid}.json`), jobJson, "utf8");

      jobsIndexRows.push({
        jobId: jid,
        jobName: b.jobInfo.jobName || "",
        accountId: b.source.accountId || acct,
        accountName: b.jobInfo.accountName || "",
        creationDate: b.jobInfo.creationDate || "",
        jobStatus: jobStatus || "",
        salespersonName: b.jobInfo.salespersonName || "",
        formCount: b.metrics.formCount || 0,
        fieldCount: b.metrics.fieldCount || 0,
        jobWorksheetForms: b.metrics.worksheetCount || 0,
        worksheetSqFt: b.metrics.worksheetSqFt || 0,
        hasForms: Boolean((b.forms || []).length),
        artifactPath: artifactRelPath
      });
    }

    await fs.writeFile(path.join(jobsDirRun, "index.json"), JSON.stringify(jobsIndexRows, null, 2), "utf8");
    await fs.writeFile(path.join(jobsDirLatest, "index.json"), JSON.stringify(jobsIndexRows, null, 2), "utf8");

    const summary = {
      discoveryRuntimeMode: "account-sync",
      accountId: acct,
      jobIdsDiscovered: ids.length,
      jobsDetailed,
      jobsWithFormsIngested: jobsWithForms,
      formsExtracted,
      fieldsExtracted,
      worksheetSqFtTotalAcrossBatch
    };
    await writeJsonToRunAndLatest("account-sync-summary.json", summary);
    await writeTextToRunAndLatest(
      "coverage-report.txt",
      `MORAWARE ACCOUNT SYNC COVERAGE\naccountId=${acct}\njob ids discovered: ${ids.length}\njobs detailed: ${jobsDetailed}\njobs with forms ingested: ${jobsWithForms}\nforms extracted: ${formsExtracted}\nfields extracted: ${fieldsExtracted}\nworksheetSqFt total across batch: ${worksheetSqFtTotalAcrossBatch}\njobs index: jobs/index.json\n`
    );

    return { brain: null, discoverySummary: summary, runDir, allFields: [], formCandidates: [] };
  } else {
    /** account-firehose — metadata for many jobs; optional drill job id from env or first row */
    broadSearchCandidates = [];
    broadSearchVariantLog = [];
    jobCandidates = [];
    const fhAccount = String(process.env.MORAWARE_ACCOUNT_ID ?? accountIdStr ?? "").trim();
    const maxFh = Number(process.env.MORAWARE_ACCOUNT_FIREHOSE_MAX_JOBS || 200);

    if (!fhAccount) {
      console.warn("account-firehose: set MORAWARE_ACCOUNT_ID (or ensure MorawareClient account id is passed through).");
      discoveryTargetJobId = inputJobId || "";
    } else {
      console.log(`\n>>> MODE account-firehose: listing up to ${maxFh} jobs for account ${fhAccount}…\n`);
      const listInner = buildAccountJobIdsOnlyInner(fhAccount);
      const listRes = await sendMorawareCommand(ctx, "jobQuery", listInner, {
        probeName: "FIREHOSE-ACCOUNT-JOBS",
        evaluate: ({ parsed, httpStatus, apiErrors }) => {
          if (httpStatus < 200 || httpStatus >= 300) return { status: "error", reason: `http ${httpStatus}` };
          if (parsed?.parseError) return { status: "error", reason: parsed.parseError };
          if (hasBlockingMorawareError(apiErrors)) return { status: "error", reason: apiErrors[0]?.description };
          const ids = extractAccountJobIds(parsed);
          if (!ids.length) return { status: "no-data", reason: "no jobs under account" };
          return { status: "success", reason: `${ids.length} job ids` };
        }
      });

      const candidateIds = extractAccountJobIds(listRes.parsed || {}).slice(0, maxFh);
      const scored = [];
      for (const cid of candidateIds) {
        const inner = buildJobQueryFinderCandidateInnerXml(cid);
        const res = await sendMorawareCommand(ctx, "jobQuery", inner, {
          probeName: `FIREHOSE-JOB-${cid}`,
          evaluate: ({ parsed, httpStatus, apiErrors }) =>
            evaluateJobDetailProbe(parsed, httpStatus, apiErrors, cid)
        });
        const job = extractJobNode(res.parsed, cid);
        const { score, breakdown } = scoreJobCandidate(job);
        const fx = evaluateDecorFergusonPdfFixtureEligibility(job);
        scored.push({
          id: cid,
          name: getText(job?.name),
          status: getText(job?.jobStatus),
          creationDate: getText(job?.creationDate),
          account: getText(job?.account?.name),
          salesperson: getText(job?.salesperson?.name),
          score,
          breakdown,
          probeStatus: res.probeStatus,
          source: "account-firehose",
          fixturePdfRowEligible: fx.eligible,
          rawJob: job
        });
      }
      jobCandidates = scored;
      discoveryTargetJobId = inputJobId || scored[0]?.id || "";
      selectedJobSnapshot = scored[0]
        ? {
            id: scored[0].id,
            name: scored[0].name,
            drillReason: inputJobId ? "MORAWARE_JOB_ID override" : "first account job (firehose preview)",
            fixturePdfRowEligible: scored[0].fixturePdfRowEligible
          }
        : null;
    }
  }

  const identityCheck = {
    discoveryRuntimeMode,
    requestedJobId: inputJobId || "(none)",
    resolvedTargetJobId: discoveryTargetJobId,
    fixtureSearchResult,
    fixtureNotFoundReason: fixtureNotFoundReason || null,
    returnedNameForRequestedId: returnedNameRequested,
    returnedCreationDateForRequestedId: returnedDateRequested,
    returnedAccountForRequestedId: returnedAccountRequested,
    returnedSalespersonForRequestedId: returnedSalespersonRequested,
    expectedJobNameEnv,
    expectedAccountEnv,
    expectedCreationEnv,
    pdfDecorFergusonFixtureEligible: false,
    fixtureSkippedReason: fixtureSkippedReason || null,
    identityResult:
      discoveryRuntimeMode === "find-fixture" && !discoveryTargetJobId
        ? "FIXTURE_SEARCH_NOT_FOUND"
        : "pending",
    resolvedTargetMatchesExpected: false,
    fixtureMatchEligibleBeforeGuard: fixtureMatchEligible,
    broadSearchCandidateCount: broadSearchCandidates.length
  };

  /** Phase 2: job probes A2 job detail + A3 account listing enrichment + B3-B6 */
  let a2 = {
    probeStatus: "no-data",
    parsed: null,
    probeName: "A2-job-detail-skipped",
    apiErrors: [],
    probeReason: "no discoveryTargetJobId"
  };

  if (discoveryTargetJobId) {
    const a2Inner =
      `<jobQuery>\n` +
      `    <filter xmlns="">\n` +
      `      <job id="${discoveryTargetJobId}"/>\n` +
      `    </filter>\n` +
      `    <include xmlns="">\n` +
      `      <name/>\n` +
      `      <jobStatus/>\n` +
      `      <creationDate/>\n` +
      `      <account>\n` +
      `        <name/>\n` +
      `      </account>\n` +
      `      <salesperson>\n` +
      `        <name/>\n` +
      `      </salesperson>\n` +
      `      <notes/>\n` +
      `    </include>\n` +
      `  </jobQuery>`;

    a2 = await sendMorawareCommand(ctx, "jobQuery", a2Inner, {
      probeName: "A2-job-detail",
      evaluate: ({ parsed, httpStatus, apiErrors }) =>
        evaluateJobDetailProbe(parsed, httpStatus, apiErrors, discoveryTargetJobId)
    });
    if (a2.probeStatus === "success" && a2.parsed) {
      applyJobInfo(brain, a2.parsed, discoveryTargetJobId);
      applyAddresses(brain, a2.parsed, discoveryTargetJobId);
      appendLeafDump(a2.parsed, a2.probeName, leafDumpLines);
      extractFieldLikeRecordsAggressive(a2.parsed, { probeName: a2.probeName }).forEach((f) =>
        allFields.push(f)
      );

      const jr = extractJobNode(a2.parsed, discoveryTargetJobId);
      returnedNameRequested = getText(jr?.name);
      returnedDateRequested = getText(jr?.creationDate);
      returnedAccountRequested = getText(jr?.account?.name);
      returnedSalespersonRequested = getText(jr?.salesperson?.name);

      const fx = evaluateDecorFergusonPdfFixtureEligibility(jr);
      fixtureMatchEligible = fx.eligible;
      fixtureSkippedReason = fx.skippedReason || "";

      identityCheck.returnedNameForRequestedId = returnedNameRequested;
      identityCheck.returnedCreationDateForRequestedId = returnedDateRequested;
      identityCheck.returnedAccountForRequestedId = returnedAccountRequested;
      identityCheck.returnedSalespersonForRequestedId = returnedSalespersonRequested;
      identityCheck.pdfDecorFergusonFixtureEligible = fixtureMatchEligible;
      identityCheck.resolvedTargetMatchesExpected = fixtureMatchEligible;
      identityCheck.fixtureMatchEligibleBeforeGuard = fixtureMatchEligible;
      identityCheck.fixtureSkippedReason = fixtureSkippedReason || null;
      identityCheck.identityResult = fixtureMatchEligible ? "PDF_FIXTURE_ELIGIBLE" : "PDF_FIXTURE_NOT_ELIGIBLE";

      if (discoveryRuntimeMode === "exact-job") {
        console.log("\n=== EXACT JOB DISCOVERY ===");
        console.log(`Requested Job ID: ${inputJobId}`);
        console.log(`Returned Job Name: ${returnedNameRequested || "(empty)"}`);
        console.log(`Returned Account: ${returnedAccountRequested || "(empty)"}`);
        console.log(`Returned Creation Date: ${returnedDateRequested || "(empty)"}`);
        console.log(`Returned Salesperson: ${returnedSalespersonRequested || "(empty)"}`);
        console.log(`Fixture Match Eligible: ${fixtureMatchEligible}`);
        console.log(`Fixture Skipped Reason: ${fixtureSkippedReason || "(none)"}`);
        console.log("");
        selectedJobSnapshot = {
          id: discoveryTargetJobId,
          name: returnedNameRequested,
          source: "exact-job"
        };
      }
    }

    if (a2.probeStatus === "success") {
      const sdkInner = buildJobFormsAllFieldsCommand(discoveryTargetJobId);
      const sdkRes = await sendMorawareCommand(ctx, "jobFormQuery", sdkInner, {
        probeName: "SDK-JOBFORMS-ALL-FIELDS-BY-JOB",
        evaluate: ({ parsed, httpStatus, apiErrors }) => {
          if (httpStatus < 200 || httpStatus >= 300) return { status: "error", reason: `http ${httpStatus}` };
          if (parsed?.parseError) return { status: "error", reason: parsed.parseError };
          if (hasBlockingMorawareError(apiErrors)) {
            return { status: "error", reason: apiErrors[0]?.description || String(apiErrors[0]?.errorCode) };
          }
          try {
            assertNoBlockingMorawareErrors(parsed);
          } catch (e) {
            return { status: "error", reason: e?.message || String(e) };
          }
          const normProbe = normalizeJobFormsFromSdkParsed(parsed);
          const fc = normProbe.forms?.length ?? 0;
          const fieldRows = normProbe.fieldsFlat?.length ?? 0;
          if (!fc && !fieldRows) return { status: "no-data", reason: "no forms/fields in SDK response" };
          return { status: "success", reason: `${fc} forms, ${fieldRows} fields (SDK all-fields)` };
        }
      });
      recordFormProbeResult(formDetailProbeRecords, sdkRes);
      sdkJobFormsAllFieldsParsed = sdkRes.parsed ?? null;
      await fs.writeFile(
        path.join(ctx.runDir, "sdk-jobforms-all-fields-response.json"),
        JSON.stringify(sdkJobFormsAllFieldsParsed ?? {}, null, 2),
        "utf8"
      );

      if (sdkRes.probeStatus === "success" && sdkJobFormsAllFieldsParsed) {
        try {
          assertNoBlockingMorawareErrors(sdkJobFormsAllFieldsParsed);
          const norm = normalizeJobFormsFromSdkParsed(sdkJobFormsAllFieldsParsed);
          sdkNormalizedForms = norm.forms;
          sdkIngestMetrics = computeWorksheetSqFtMetrics(norm.forms);
          sdkJobFormsAllFieldsHit =
            (norm.forms?.length ?? 0) > 0 || (norm.fieldsFlat?.length ?? 0) > 0;
          if (sdkJobFormsAllFieldsHit) {
            winningFormProbeName = "SDK-JOBFORMS-ALL-FIELDS-BY-JOB";
            sdkWarmFormCandidates = norm.forms.map((f, i) => ({
              id: f.id,
              name: f.formName,
              formName: f.formName,
              rawFormName: f.rawFormName,
              formTemplateName: f.formTemplateName,
              phaseName: f.phaseName,
              phaseId: f.phaseId,
              phaseSeqNum: f.phaseSeqNum,
              jobFormJobId: f.jobId,
              sourcePath: `sdk-jobForms-bulk[${i}]`,
              raw: null,
              _officialHit: true,
              _sdkBulkHit: true
            }));
            for (const fld of norm.fieldsFlat) {
              allFields.push({
                ...fld,
                extractor: "sdk-jobforms-all-fields"
              });
            }
          }
        } catch (e) {
          sdkJobFormsAllFieldsHit = false;
          sdkNormalizedForms = null;
          sdkIngestMetrics = null;
          sdkWarmFormCandidates = [];
          console.warn(`SDK-JOBFORMS-ALL-FIELDS-BY-JOB normalize blocked: ${e?.message || e}`);
        }
      }
    }

    const childProbes = [
      { name: "B3-activities", key: "jobActivities" },
      { name: "B4-files", key: "files" },
      { name: "B5-phases", key: "phases" },
      { name: "B6-issues", key: "jobIssues" }
    ];

    const bBodies = {
      "B3-activities":
        `<jobQuery>\n` +
        `    <filter xmlns="">\n` +
        `      <job id="${discoveryTargetJobId}"/>\n` +
        `    </filter>\n` +
        `    <include xmlns="">\n` +
        `      <jobActivities>\n` +
        `        <jobActivity>\n` +
        `          <name/>\n` +
        `          <phase><name/></phase>\n` +
        `          <status/>\n` +
        `          <startDate/>\n` +
        `          <scheduledTime/>\n` +
        `          <duration/>\n` +
        `          <assignedTo><name/></assignedTo>\n` +
        `          <notes/>\n` +
        `        </jobActivity>\n` +
        `      </jobActivities>\n` +
        `    </include>\n` +
        `  </jobQuery>`,
      "B4-files":
        `<jobQuery>\n` +
        `    <filter xmlns="">\n` +
        `      <job id="${discoveryTargetJobId}"/>\n` +
        `    </filter>\n` +
        `    <include xmlns="">\n` +
        `      <files>\n` +
        `        <file>\n` +
        `          <name/>\n` +
        `          <phase><name/></phase>\n` +
        `          <description/>\n` +
        `          <fileType/>\n` +
        `          <size/>\n` +
        `          <date/>\n` +
        `        </file>\n` +
        `      </files>\n` +
        `    </include>\n` +
        `  </jobQuery>`,
      "B5-phases":
        `<jobQuery>\n` +
        `    <filter xmlns="">\n` +
        `      <job id="${discoveryTargetJobId}"/>\n` +
        `    </filter>\n` +
        `    <include xmlns="">\n` +
        `      <phases>\n` +
        `        <phase>\n` +
        `          <name/>\n` +
        `          <sequence/>\n` +
        `        </phase>\n` +
        `      </phases>\n` +
        `    </include>\n` +
        `  </jobQuery>`,
      "B6-issues":
        `<jobQuery>\n` +
        `    <filter xmlns="">\n` +
        `      <job id="${discoveryTargetJobId}"/>\n` +
        `    </filter>\n` +
        `    <include xmlns="">\n` +
        `      <jobIssues>\n` +
        `        <jobIssue>\n` +
        `          <status/>\n` +
        `          <category/>\n` +
        `          <subject/>\n` +
        `          <updatedBy/>\n` +
        `          <updatedDate/>\n` +
        `          <updates/>\n` +
        `        </jobIssue>\n` +
        `      </jobIssues>\n` +
        `    </include>\n` +
        `  </jobQuery>`
    };

    for (const bp of childProbes) {
      const inner = bBodies[bp.name];
      const res = await sendMorawareCommand(ctx, "jobQuery", inner, {
        probeName: bp.name,
        evaluate: ({ parsed, httpStatus, apiErrors }) => {
          if (httpStatus < 200 || httpStatus >= 300) return { status: "error", reason: `http ${httpStatus}` };
          if (parsed?.parseError) return { status: "error", reason: parsed.parseError };
          if (hasBlockingMorawareError(apiErrors)) {
            return { status: "error", reason: apiErrors[0]?.description || String(apiErrors[0]?.errorCode) };
          }
          const rows = extractCollectionsFromJobQuery(parsed, bp.key, discoveryTargetJobId);
          if (!rows.length) return { status: "no-data", reason: `no ${bp.key}` };
          return { status: "success", reason: `${rows.length} ${bp.key}` };
        }
      });
      if (res.parsed) appendLeafDump(res.parsed, res.probeName, leafDumpLines);
      if (res.probeStatus === "success" && res.parsed) {
        mergeBrainCollections(brain, res.probeName, res.parsed, discoveryTargetJobId);
      }
    }
  } else {
    console.warn("Skipping job-scoped probes (A2, B3-B6): discoveryTargetJobId is empty.");
  }

  if (
    accountIdStr &&
    discoveryRuntimeMode !== "exact-job" &&
    !(discoveryRuntimeMode === "find-fixture" && !discoveryTargetJobId)
  ) {
    const a3Inner =
      `<jobQuery>\n` +
      `    <filter xmlns="">\n` +
      `      <account id="${accountIdStr}"/>\n` +
      `    </filter>\n` +
      `    <include xmlns="">\n` +
      `      <name/>\n` +
      `      <jobStatus/>\n` +
      `      <creationDate/>\n` +
      `      <account>\n` +
      `        <name/>\n` +
      `      </account>\n` +
      `      <salesperson>\n` +
      `        <name/>\n` +
      `      </salesperson>\n` +
      `      <notes/>\n` +
      `    </include>\n` +
      `  </jobQuery>`;

    const a3 = await sendMorawareCommand(ctx, "jobQuery", a3Inner, {
      probeName: "A3-account-jobs-detail",
      evaluate: ({ parsed, httpStatus, apiErrors }) => {
        if (httpStatus < 200 || httpStatus >= 300) return { status: "error", reason: `http ${httpStatus}` };
        if (parsed?.parseError) return { status: "error", reason: parsed.parseError };
        if (hasBlockingMorawareError(apiErrors)) return { status: "error", reason: apiErrors[0]?.description };
        const ids = extractAccountJobIds(parsed);
        if (!ids.length) return { status: "no-data", reason: "no jobs" };
        return { status: "success", reason: "account job query ok" };
      }
    });
    if (a3.probeStatus === "success" && a3.parsed) {
      if (discoveryTargetJobId) {
        const hit = extractJobNode(a3.parsed, discoveryTargetJobId);
        if (hit) {
          applyJobInfo(brain, a3.parsed, discoveryTargetJobId);
        }
      }
      appendLeafDump(a3.parsed, a3.probeName, leafDumpLines);
    }
  }

  brain.source.jobId = discoveryTargetJobId || "";

  /** Phase 3–5: form field probes (SDK bulk primary; matrix debug only when bulk missed) */
  let formCandidates = sdkWarmFormCandidates.map((c) => ({ ...c }));

  if (!discoveryTargetJobId) {
    console.warn("Skipping form probes: discoveryTargetJobId is empty.");
  } else {
    console.log("\n=== FORM FIELD PROBES ===\n");

    const pushFormProbeRecord = (res) => recordFormProbeResult(formDetailProbeRecords, res);

    let skipLegacyFormPath = Boolean(sdkJobFormsAllFieldsHit);
    const matrixOn = firstFormMatrixForced() && !sdkJobFormsAllFieldsHit;

    if (matrixOn) {
      ranFirstFormMatrix = true;
      const matrixResult = await runExactJobFirstFormMatrix(
        ctx,
        discoveryTargetJobId,
        leafDumpLines,
        formDetailProbeRecords,
        pushFormProbeRecord
      );
      formCandidates = matrixResult.formCandidates;
      matrixMirrorExtraFiles = matrixResult.artifactFiles;
      skipLegacyFormPath = true;
    }

    if (!skipLegacyFormPath) {
      let bulkWinnerProbe = "";
      let bulkWinnerParsed = null;

      const bulkDefs = [{ name: "SDK-JOBFORMS-ALL-FIELDS-FALLBACK" }];

      for (const bd of bulkDefs) {
        const xml = buildJobFormBulkOfficialInner(discoveryTargetJobId);
        const res = await sendMorawareCommand(ctx, "jobFormQuery", xml, {
          probeName: bd.name,
          evaluate: ({ parsed, httpStatus, apiErrors }) =>
            evaluateBulkOfficialJobFormProbe(parsed, httpStatus, apiErrors)
        });
        pushFormProbeRecord(res);
        if (res.parsed) appendLeafDump(res.parsed, res.probeName, leafDumpLines);

        if (res.probeStatus === "success") {
          bulkWinnerProbe = bd.name;
          bulkWinnerParsed = res.parsed;
          winningFormProbeName = bulkWinnerProbe;
          console.log(`\nJOB-LEVEL FORM DATA WINNER: ${bulkWinnerProbe}\n`);
          break;
        }
      }

      if (bulkWinnerParsed) {
        const nodes = extractJobFormNodes(bulkWinnerParsed);
        formCandidates = nodes
          .map((node, i) => {
            const meta = extractFormMeta(node);
            return {
              id: meta.formId,
              name: meta.formName || null,
              phaseName: meta.phaseName || null,
              formTemplateName: meta.formTemplateName || null,
              jobFormJobId: meta.jobFormJobId || null,
              phaseId: meta.phaseId || null,
              phaseSeqNum: meta.phaseSeqNum || null,
              sourcePath: `bulk:${bulkWinnerProbe}[${i}]`,
              raw: node,
              _officialHit: true
            };
          })
          .filter((c) => c.id);

        if (!formCandidates.length) {
          formCandidates = extractFormIdsFromJobFormQuery(bulkWinnerParsed).map((c) => ({
            ...c,
            _officialHit: false,
            raw: c.raw ?? null
          }));
        }

        for (const fc of formCandidates) {
          const node = fc.raw ?? nodes.find((n) => extractFormMeta(n).formId === fc.id);
          const fm = extractFormMeta(node || {});
          fc.name = fm.formName || fc.name;
          fc.phaseName = fm.phaseName || fc.phaseName;
          fc.formTemplateName = fm.formTemplateName || fc.formTemplateName || null;
          fc.jobFormJobId = fm.jobFormJobId || fc.jobFormJobId || null;
          fc.phaseId = fm.phaseId || fc.phaseId || null;
          fc.phaseSeqNum = fm.phaseSeqNum || fc.phaseSeqNum || null;
          const meta = {
            formId: fc.id,
            formName: fc.name,
            phaseName: fc.phaseName,
            formTemplateName: fm.formTemplateName,
            probeName: bulkWinnerProbe
          };
          if (node) {
            extractFieldsFromJobFormNode(node, meta).forEach((row) => allFields.push(row));
          }
          extractFieldLikeRecordsAggressive(bulkWinnerParsed, meta).forEach((row) => allFields.push(row));
        }
      } else {
      const jfListInner =
        `<jobFormQuery>\n` +
        `    <filter xmlns="">\n` +
        `      <job id="${discoveryTargetJobId}"/>\n` +
        `    </filter>\n` +
        `    <include xmlns="">\n` +
        `      <jobForm/>\n` +
        `    </include>\n` +
        `  </jobFormQuery>`;

      const jfList = await sendMorawareCommand(ctx, "jobFormQuery", jfListInner, {
        probeName: "JF-LIST-BY-JOB",
        evaluate: ({ parsed, httpStatus, apiErrors }) => evaluateJobFormListProbe(parsed, httpStatus, apiErrors)
      });
      pushFormProbeRecord(jfList);

      if (jfList.parsed) {
        appendLeafDump(jfList.parsed, jfList.probeName, leafDumpLines);
        formCandidates = extractFormIdsFromJobFormQuery(jfList.parsed).map((c) => ({
          ...c,
          _officialHit: false
        }));
      }

      const detailOfficialDefs = [{ name: "JF-DETAIL-SDK-ALL-FIELDS" }];

      for (const fc of formCandidates) {
        if (!fc.id) continue;
        let gotOfficial = false;
        for (const d of detailOfficialDefs) {
          const xml = buildJobFormDetailOfficialInner(fc.id);
          const res = await sendMorawareCommand(ctx, "jobFormQuery", xml, {
            probeName: `${d.name}-${fc.id}`,
            evaluate: ({ parsed, httpStatus, apiErrors }) =>
              evaluateFormDetailProbe(parsed, httpStatus, apiErrors)
          });
          pushFormProbeRecord(res);
          if (res.parsed) appendLeafDump(res.parsed, res.probeName, leafDumpLines);

          const parsedNodes = extractJobFormNodes(res.parsed || {});
          const primary =
            parsedNodes.find((n) => extractFormMeta(n).formId === fc.id) || parsedNodes[0] || null;
          const fm = extractFormMeta(primary || {});
          fc.name = fm.formName || fc.name;
          fc.phaseName = fm.phaseName || fc.phaseName;
          fc.formTemplateName = fm.formTemplateName ?? fc.formTemplateName ?? null;
          fc.jobFormJobId = fm.jobFormJobId ?? fc.jobFormJobId ?? null;

          const meta = {
            formId: fc.id,
            formName: fc.name,
            phaseName: fc.phaseName,
            formTemplateName: fm.formTemplateName ?? fc.formTemplateName ?? null,
            probeName: res.probeName
          };
          const rows = extractFieldsFromJobFormNode(primary || {}, meta);
          rows.forEach((row) => allFields.push(row));
          extractFieldLikeRecordsAggressive(res.parsed || {}, meta).forEach((row) => allFields.push(row));

          if (rows.length > 0 || countOfficialFieldsFromJobFormQuery(res.parsed || {}) > 0) {
            gotOfficial = true;
            fc._officialHit = true;
            break;
          }
        }
        if (!gotOfficial) {
          fc._officialHit = false;
        }
      }

      let winnerProbeName = "";
      const needsShotgun = !formCandidates.some((fc) => fc._officialHit);
      const firstFormId = formCandidates[0]?.id;

      if (needsShotgun && firstFormId) {
        const probes = buildFormDetailProbes(firstFormId);
        for (const fp of probes) {
          const res = await sendMorawareCommand(ctx, "jobFormQuery", fp.innerXml, {
            probeName: `${fp.name}-${firstFormId}`,
            evaluate: ({ parsed, httpStatus, apiErrors }) => evaluateFormDetailProbe(parsed, httpStatus, apiErrors)
          });
          pushFormProbeRecord(res);
          if (res.parsed) appendLeafDump(res.parsed, res.probeName, leafDumpLines);

          if (res.probeStatus === "success" && !winnerProbeName) {
            winnerProbeName = fp.name;
            winningFormProbeName = winnerProbeName;
            console.log(`\nFORM DETAIL PROBE WINNER: ${winnerProbeName}\n`);
            break;
          }
        }
      }

      const fallbackProbeName = "F-SDK-all-fields";

      for (const fc of formCandidates) {
        if (!fc.id || fc._officialHit) continue;
        const defs = buildFormDetailProbes(fc.id);
        const winnerDef =
          defs.find((p) => p.name === winnerProbeName) || defs.find((p) => p.name === fallbackProbeName);
        if (!winnerDef) continue;
        const res = await sendMorawareCommand(ctx, "jobFormQuery", winnerDef.innerXml, {
          probeName: `${winnerDef.name}-ALL-${fc.id}`,
          evaluate: ({ parsed, httpStatus, apiErrors }) => evaluateFormDetailProbe(parsed, httpStatus, apiErrors)
        });
        pushFormProbeRecord(res);
        if (res.parsed) appendLeafDump(res.parsed, res.probeName, leafDumpLines);

        const parsedNodes = extractJobFormNodes(res.parsed || {});
        const primary =
          parsedNodes.find((n) => extractFormMeta(n).formId === fc.id) || parsedNodes[0] || null;
        const fm = extractFormMeta(primary || {});
        fc.name = fm.formName || fc.name;
        fc.phaseName = fm.phaseName || fc.phaseName;
        fc.formTemplateName = fm.formTemplateName ?? fc.formTemplateName ?? null;
        fc.jobFormJobId = fm.jobFormJobId ?? fc.jobFormJobId ?? null;

        const meta = {
          formId: fc.id,
          formName: fc.name,
          phaseName: fc.phaseName,
          formTemplateName: fm.formTemplateName ?? fc.formTemplateName ?? null,
          probeName: res.probeName
        };
        if (primary) {
          extractFieldsFromJobFormNode(primary, meta).forEach((row) => allFields.push(row));
        }
        extractFieldLikeRecordsAggressive(res.parsed || {}, meta).forEach((row) => allFields.push(row));
      }
    }
    }
  }

  let totalSqFt = 0;
  const sqFtByForm = {};
  const worksheetSqFtByForm = {};
  let worksheetSqFtTotal = 0;
  const sqftLines = [];

  if (sdkJobFormsAllFieldsHit && sdkNormalizedForms?.length && sdkIngestMetrics) {
    brain.forms = sdkNormalizedForms.map((f) => ({
      ...f,
      fields: [...(f.fields || [])],
      fieldsByLabel: { ...(f.fieldsByLabel || {}) }
    }));
    brain.metrics.formCount = sdkIngestMetrics.formCount;
    brain.metrics.fieldCount = sdkIngestMetrics.fieldCount;
    brain.metrics.worksheetCount = sdkIngestMetrics.worksheetCount;
    brain.metrics.worksheetSqFt = sdkIngestMetrics.worksheetSqFt;
    brain.metrics.totalSqFt = sdkIngestMetrics.totalSqFt;
    brain.metrics.sqFtByForm = { ...sdkIngestMetrics.sqFtByForm };
    brain.metrics.sqFtFields = [...sdkIngestMetrics.sqFtFields];

    totalSqFt = sdkIngestMetrics.totalSqFt;
    worksheetSqFtTotal = sdkIngestMetrics.worksheetSqFt;

    for (const form of sdkNormalizedForms) {
      for (const fld of form.fields || []) {
        if (!isSqFtNormalizedLabel(fld.normalizedLabel, fld.label)) continue;
        const n = fld.numericValue;
        if (n == null) continue;
        const formLabel = form.id || form.formName || "unscoped";
        sqFtByForm[String(formLabel)] = (sqFtByForm[String(formLabel)] || 0) + n;
        if (form.formTemplateName === "Job Worksheet") {
          const wk = form.formName || String(form.id || "") || "unscoped";
          worksheetSqFtByForm[wk] = (worksheetSqFtByForm[wk] || 0) + n;
        }
        console.log(
          `SQFT FIELD FOUND | ${fld.formId ?? ""} | ${fld.formName ?? ""} | ${fld.phaseName ?? ""} | ${fld.label} | ${fld.value} | ${n} | ${fld.sourcePath}`
        );
      }
    }
  } else {
    const formsById = new Map(
      formCandidates.filter((c) => c.id).map((c) => [c.id, { ...c, fields: [], fieldsByLabel: {} }])
    );

    for (const f of allFields) {
      const fid = f.formId;
      if (fid && formsById.has(fid)) {
        const slot = formsById.get(fid);
        slot.fields.push(f);
        slot.fieldsByLabel[f.label] = f.value;
        continue;
      }
      const nm = f.formName;
      if (nm) {
        for (const slot of formsById.values()) {
          if (slot.name === nm) {
            slot.fields.push(f);
            slot.fieldsByLabel[f.label] = f.value;
            break;
          }
        }
      }
    }

    brain.forms = [...formsById.values()];
    brain.metrics.formCount = brain.forms.length;
    brain.metrics.fieldCount = allFields.length;
    brain.metrics.worksheetCount = brain.forms.filter((x) => x.formTemplateName === "Job Worksheet").length;

    for (const fld of allFields) {
      if (!isSqFtNormalizedLabel(fld.normalizedLabel, fld.label)) continue;
      const n = fld.numericValue;
      if (n == null) continue;
      totalSqFt += n;
      const formLabel = fld.formId || fld.formName || "unscoped";
      sqFtByForm[String(formLabel)] = (sqFtByForm[String(formLabel)] || 0) + n;
      if (fld.formTemplateName === "Job Worksheet") {
        const wk = fld.formName || String(fld.formId || "") || "unscoped";
        worksheetSqFtByForm[wk] = (worksheetSqFtByForm[wk] || 0) + n;
        worksheetSqFtTotal += n;
      }
      console.log(
        `SQFT FIELD FOUND | ${fld.formId ?? ""} | ${fld.formName ?? ""} | ${fld.phaseName ?? ""} | ${fld.label} | ${fld.value} | ${n} | ${fld.sourcePath}`
      );
    }

    brain.metrics.totalSqFt = totalSqFt;
    brain.metrics.worksheetSqFt = worksheetSqFtTotal;
    brain.metrics.sqFtByForm = { ...sqFtByForm };
  }

  sqftLines.push(...Object.entries(sqFtByForm).map(([formName, sqFt]) => ({ formName, sqFt })));

  if (sdkJobFormsAllFieldsHit && sdkIngestMetrics) {
    console.log("\n=== SDK ALL-FIELDS JOBFORMS ===");
    console.log(`Forms returned: ${brain.forms.length}`);
    console.log(`Fields extracted: ${brain.metrics.fieldCount}`);
    console.log("Worksheet Sq.Ft. fields:");
    for (const [formLabel, sq] of Object.entries(worksheetSqFtByForm).sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      console.log(`${formLabel}: ${sq}`);
    }
    console.log(`Total Sq.Ft. (all forms): ${totalSqFt}`);
    console.log(`Worksheet Sq.Ft. (Job Worksheet template): ${worksheetSqFtTotal}`);
    console.log(`Fixture Match Eligible: ${fixtureMatchEligible}`);
  }

  identityCheck.resolvedTargetJobId = discoveryTargetJobId;
  identityCheck.fixtureMatchEligible = fixtureMatchEligible;
  identityCheck.identityMismatchReason = identityMismatchReason || null;
  identityCheck.sdkBulkJobFormsProbeHit = sdkJobFormsAllFieldsHit;

  let fixtureWorksheetSqFtComparison = null;
  if (fixtureMatchEligible && sdkJobFormsAllFieldsHit && sdkIngestMetrics) {
    const expected = DEV_ACCEPTANCE_FIXTURE.totalSqFt;
    const api = sdkIngestMetrics.worksheetSqFt;
    fixtureWorksheetSqFtComparison = {
      expectedPdfWorksheetSqFt: expected,
      apiWorksheetSqFt: api,
      delta: api - expected,
      match: Math.abs(api - expected) < 0.001
    };
  }
  identityCheck.fixtureWorksheetSqFtComparison = fixtureWorksheetSqFtComparison;

  const pdfFixtureCompareOk = ranFirstFormMatrix ? false : Boolean(fixtureWorksheetSqFtComparison?.match);
  identityCheck.pdfFixtureCompareOk = pdfFixtureCompareOk;
  if (ranFirstFormMatrix) {
    identityCheck.firstFormJobFormMatrixDebug = true;
  }

  brain.raw.probes = ctx.probes.map((r) => ({
    requestId: r.requestId,
    probeName: r.probeName,
    commandName: r.commandName,
    httpStatus: r.httpStatus,
    probeStatus: r.probeStatus,
    probeReason: r.probeReason,
    extractedFieldCount: r.extractedFieldCount,
    leafCount: r.leafCount,
    apiErrors: r.apiErrors,
    parseError: r.parseError,
    requestPath: r.requestPath,
    responsePath: r.responsePath
  }));
  brain.raw.successfulProbeNames = [...ctx.successfulProbeNames];
  brain.raw.failedProbeNames = [...ctx.failedProbeNames];
  brain.raw.noDataProbeNames = [...ctx.noDataProbeNames];

  console.log("\n=== IDENTITY CHECK ===");
  console.log("requested job id | returned name | expected name | result");
  console.log(
    `${inputJobId || "(none)"} | ${returnedNameRequested || "(empty)"} | ${expectedJobNameEnv || "(n/a)"} | ${identityCheck.identityResult}`
  );

  console.log("\n=== ACCOUNT JOB CANDIDATES ===");
  console.log("id | score | name | status | creationDate | account | salesperson");
  for (const jc of jobCandidates) {
    console.log(
      `${jc.id} | ${jc.score} | ${jc.name} | ${jc.status} | ${jc.creationDate} | ${jc.account} | ${jc.salesperson}`
    );
  }

  if (broadSearchCandidates.length) {
    console.log("\n=== BROAD JOB SEARCH (top candidates) ===");
    console.log("id | score | name | status | creationDate | account | salesperson | page");
    for (const bc of broadSearchCandidates.slice(0, 40)) {
      console.log(
        `${bc.id} | ${bc.score} | ${bc.name} | ${bc.status} | ${bc.creationDate} | ${bc.account} | ${bc.salesperson} | ${bc.pageIndex ?? ""}`
      );
    }
  }

  console.log("\nResolved Target Job ID:", discoveryTargetJobId || "(none)");
  console.log("Fixture Match Eligible:", fixtureMatchEligible);
  if (ranFirstFormMatrix) {
    console.log("PDF fixture comparison OK: skipped (first-form jobForm matrix debug)");
  } else {
    console.log("PDF fixture comparison OK:", pdfFixtureCompareOk);
  }

  console.log("\n=== FORM FIELD PROBES ===");
  console.log("probeName | status | errorCode | description | extractedFieldCount | leafCount");
  for (const fr of formDetailProbeRecords) {
    console.log(
      `${fr.probeName} | ${fr.status} | ${fr.errorCode} | ${fr.description} | ${fr.extractedFieldCount} | ${fr.leafCount}`
    );
  }

  console.log("\n=== FIELD DEBUG (sample) ===");
  for (const f of allFields.slice(0, 80)) {
    console.log(`Form: ${f.formName ?? "?"} | Field: ${f.label} | Value: ${f.value}`);
  }

  console.log("\n=== SQFT SUMMARY ===");
  const suppressPdfFixtureSqFt =
    discoveryRuntimeMode === "exact-job"
      ? !fixtureMatchEligible
      : discoveryRuntimeMode === "find-fixture"
        ? !(fixtureSearchResult === "found" && discoveryTargetJobId)
        : true;
  if (ranFirstFormMatrix) {
    console.log("SQFT / PDF fixture comparison skipped (first-form jobForm matrix debug run).");
    console.log(`Extracted worksheet totalSqFt from probes (informational): ${totalSqFt}`);
  } else {
    console.log("WORKSHEET SQFT SUMMARY");
    if (!suppressPdfFixtureSqFt) {
      for (const row of DEV_ACCEPTANCE_FIXTURE.perFormSqFt) {
        console.log(`${row.name}: ${row.sqFt} (PDF reference only)`);
      }
    } else if (discoveryRuntimeMode === "exact-job") {
      console.log("(Skipping Decor-Ferguson PDF Sq.Ft. fixture reference rows: fixtureMatchEligible=false.)");
    } else if (discoveryRuntimeMode === "find-fixture") {
      console.log(
        "(Skipping Decor-Ferguson PDF Sq.Ft. fixture reference rows: no valid Decor-Ferguson fixture target resolved.)"
      );
    } else {
      console.log("(Skipping Decor-Ferguson PDF Sq.Ft. fixture reference rows.)");
    }
    for (const line of sqftLines) {
      console.log(`${line.formName}: ${line.sqFt}`);
    }
    console.log(`TOTAL (all Sq.Ft. fields): ${totalSqFt}`);
    console.log(`WORKSHEET TOTAL (Job Worksheet template): ${worksheetSqFtTotal}`);
    if (!suppressPdfFixtureSqFt) {
      console.log(`EXPECTED PDF WORKSHEET TOTAL: ${DEV_ACCEPTANCE_FIXTURE.totalSqFt}`);
      if (fixtureWorksheetSqFtComparison) {
        console.log(`MATCH (worksheet Sq.Ft. vs PDF): ${fixtureWorksheetSqFtComparison.match}`);
      } else {
        console.log(
          `MATCH: SKIPPED (${!fixtureMatchEligible ? "fixtureMatchEligible=false (identity does not match Decor-Ferguson PDF fixture)" : sdkJobFormsAllFieldsHit ? "worksheet comparison not applicable" : "SDK all-fields ingest unavailable"})`
        );
      }
    } else {
      console.log(
        "MATCH: SKIPPED (PDF worksheet reference suppressed — exact-job requires fixtureMatchEligible, or find-fixture requires a resolved Decor-Ferguson candidate.)"
      );
    }
  }

  const discoverySummary = {
    discoveryRuntimeMode,
    inputJobId,
    discoveryTargetJobId,
    accountId: accountIdStr,
    fixtureMatchEligible,
    fixtureSearchResult,
    fixtureNotFoundReason: fixtureNotFoundReason || null,
    sdkJobFormsAllFieldsHit,
    jobWorksheetSqFtTotal: worksheetSqFtTotal,
    suppressPdfFixtureSqFtComparison: suppressPdfFixtureSqFt,
    identityMismatchReason: identityMismatchReason || null,
    successfulProbes: ctx.successfulProbeNames.length,
    failedProbes: ctx.failedProbeNames.length,
    noDataProbes: ctx.noDataProbeNames.length,
    formCandidateCount: formCandidates.length,
    worksheetFormsWithFields: brain.forms.filter((x) => x.fields.length).length,
    totalSqFtAllSqFtNumericFields: totalSqFt,
    fixtureComparison: fixtureWorksheetSqFtComparison,
    worksheetSqFt: worksheetSqFtTotal,
    pdfTotalExpected: ranFirstFormMatrix || suppressPdfFixtureSqFt ? null : DEV_ACCEPTANCE_FIXTURE.totalSqFt,
    pdfMatch:
      ranFirstFormMatrix
        ? null
        : suppressPdfFixtureSqFt
          ? null
          : fixtureWorksheetSqFtComparison !== null
            ? fixtureWorksheetSqFtComparison.match
            : null,
    activitiesCount: brain.activities.length,
    filesCount: brain.files.length,
    phasesCount: brain.phases.length,
    issuesCount: brain.issues.length,
    extractedFieldRows: allFields.length,
    winningFormProbe: winningFormProbeName || null,
    runDir
  };

  let coverageTxt = "";
  coverageTxt += `MORAWARE DISCOVERY V2 COVERAGE\n`;
  coverageTxt += `discoveryRuntimeMode=${discoveryRuntimeMode}\n`;
  coverageTxt += `fixtureSearchResult=${fixtureSearchResult}\n`;
  if (discoveryRuntimeMode === "find-fixture" && fixtureSearchResult === "not_found") {
    coverageTxt += `discoveryTargetJobId=\n`;
    coverageTxt += `fixtureMatchEligible=false\n`;
    coverageTxt += `sdkJobFormsAllFieldsHit=false\n`;
    coverageTxt += `reason=${fixtureNotFoundReason}\n`;
  }
  if (ranFirstFormMatrix) {
    coverageTxt += `firstFormJobFormMatrixDebug=1\n`;
  }
  coverageTxt += `inputJobId=${inputJobId} discoveryTargetJobId=${discoveryTargetJobId}\n`;
  coverageTxt += `jobName=${brain.jobInfo.jobName}\n`;
  coverageTxt += `accountName=${brain.jobInfo.accountName}\n`;
  coverageTxt += `creationDate=${brain.jobInfo.creationDate}\n`;
  coverageTxt += `salespersonName=${brain.jobInfo.salespersonName}\n`;
  coverageTxt += `forms=${brain.forms.length}\n`;
  coverageTxt += `fields=${brain.metrics.fieldCount}\n`;
  coverageTxt += `jobWorksheetForms=${brain.metrics.worksheetCount}\n`;
  coverageTxt += `worksheetSqFt=${worksheetSqFtTotal}\n`;
  coverageTxt += `fixtureMatchEligible=${fixtureMatchEligible}\n`;
  if (fixtureWorksheetSqFtComparison) {
    coverageTxt += `fixtureComparison=${JSON.stringify(fixtureWorksheetSqFtComparison)}\n`;
  }
  coverageTxt += `sdkJobFormsAllFieldsHit=${sdkJobFormsAllFieldsHit}\n`;

  console.log("\n=== COVERAGE REPORT ===");
  console.log(coverageTxt);

  const formIdsExport = formCandidates.map((c) => ({
    id: c.id,
    name: c.name ?? null,
    phaseName: c.phaseName ?? null,
    sourcePath: c.sourcePath ?? null
  }));

  const outFiles = [
    "entrypoint-proof.txt",
    "discovery-mode.txt",
    "process-discovery.json",
    "global-job-pages.json",
    "global-job-candidates.json",
    "global-sync-summary.json",
    "identity-check.json",
    "job-candidates.json",
    "selected-job.json",
    "broad-search-candidates.json",
    "broad-search-variants.json",
    "discovery-summary.json",
    "probes.json",
    "form-ids.json",
    "form-detail-probes.json",
    "form-leaf-dump.txt",
    "form-fields.json",
    "sqft-summary.json",
    "sdk-jobforms-all-fields-response.json",
    "normalized-job-brain.json",
    "coverage-report.txt",
    ...matrixMirrorExtraFiles
  ];

  const selectedJobExport = {
    discoveryRuntimeMode,
    inputJobId,
    discoveryTargetJobId,
    fixtureMatchEligible,
    fixtureSkippedReason: fixtureSkippedReason || null,
    fixtureSearchResult,
    fixtureNotFoundReason: fixtureNotFoundReason || null,
    selectedJob: selectedJobSnapshot,
    brainJobSummary: {
      jobName: brain.jobInfo.jobName,
      accountName: brain.jobInfo.accountName,
      creationDate: brain.jobInfo.creationDate,
      salespersonName: brain.jobInfo.salespersonName
    }
  };

  await fs.writeFile(path.join(runDir, "identity-check.json"), JSON.stringify(identityCheck, null, 2), "utf8");
  await fs.writeFile(
    path.join(runDir, "job-candidates.json"),
    JSON.stringify(stripRawJobFromCandidates(jobCandidates), null, 2),
    "utf8"
  );
  await fs.writeFile(path.join(runDir, "selected-job.json"), JSON.stringify(selectedJobExport, null, 2), "utf8");
  await fs.writeFile(
    path.join(runDir, "broad-search-candidates.json"),
    JSON.stringify(stripRawJobFromCandidates(broadSearchCandidates), null, 2),
    "utf8"
  );
  await fs.writeFile(
    path.join(runDir, "broad-search-variants.json"),
    JSON.stringify(broadSearchVariantLog, null, 2),
    "utf8"
  );
  await fs.writeFile(path.join(runDir, "discovery-summary.json"), JSON.stringify(discoverySummary, null, 2), "utf8");
  await fs.writeFile(path.join(runDir, "probes.json"), JSON.stringify(brain.raw.probes, null, 2), "utf8");
  await fs.writeFile(path.join(runDir, "form-ids.json"), JSON.stringify(formIdsExport, null, 2), "utf8");
  await fs.writeFile(path.join(runDir, "form-detail-probes.json"), JSON.stringify(formDetailProbeRecords, null, 2), "utf8");
  await fs.writeFile(path.join(runDir, "form-leaf-dump.txt"), leafDumpLines.join("\n"), "utf8");
  await fs.writeFile(path.join(runDir, "form-fields.json"), JSON.stringify(allFields, null, 2), "utf8");
  await fs.writeFile(
    path.join(runDir, "sqft-summary.json"),
    JSON.stringify(
      {
        discoveryRuntimeMode,
        fixtureSearchResult,
        sdkJobFormsAllFieldsHit,
        totalSqFtAllSqFtNumericFields: totalSqFt,
        worksheetSqFtTotal,
        worksheetSqFtExpectedPdf: DEV_ACCEPTANCE_FIXTURE.totalSqFt,
        fixtureComparison: fixtureWorksheetSqFtComparison,
        worksheetSqFtByForm,
        allSqFtByForm: sqFtByForm,
        fixtureMatchEligible
      },
      null,
      2
    ),
    "utf8"
  );
  await fs.writeFile(path.join(runDir, "normalized-job-brain.json"), JSON.stringify(brain, null, 2), "utf8");
  await fs.writeFile(path.join(runDir, "coverage-report.txt"), coverageTxt, "utf8");

  await mirrorOutputs(runDir, latestDir, outFiles);

  console.log(`\nDiscovery v2 complete. Wrote ${runDir} and mirrored to debug/moraware/latest/\n`);

  return { brain, discoverySummary, runDir, allFields, formCandidates };
}
