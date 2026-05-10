import fs from "node:fs/promises";
import path from "node:path";

import { XMLParser, XMLBuilder } from "fast-xml-parser";

import {
  buildJobFormsAllFieldsCommand,
  assertNoBlockingMorawareErrors,
  normalizeJobFormsFromSdkParsed,
  computeWorksheetSqFtMetrics
} from "./morawareJobFormsSdk.js";

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function toInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Moraware's API endpoint accepts XML POST bodies and returns XML.
 * Make.com "Parse response" yields an object with `_attributes`; we emulate that
 * shape so your downstream mapping logic is deterministic.
 *
 * Parsing approach:
 * - Use `fast-xml-parser` with `ignoreAttributes: false` so tag attributes are preserved.
 * - Convert attributes to an `_attributes` object (Make.com-like) for stable access.
 * - Avoid prototype pollution by creating plain objects only (parser already does).
 */
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  suppressEmptyNode: true,
  suppressBooleanAttributes: false,
  format: false
});

function normalizeAttributes(node) {
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(normalizeAttributes);

  const out = {};
  const attrs = {};

  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith("@_")) attrs[k.slice(2)] = v;
    else out[k] = normalizeAttributes(v);
  }

  if (Object.keys(attrs).length > 0) out._attributes = attrs;
  return out;
}

export function parseXmlToObject(xmlText) {
  const parsed = xmlParser.parse(xmlText);
  return normalizeAttributes(parsed);
}

async function httpPostXml({ url, xmlBody, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "text/xml; charset=utf-8",
        "accept": "application/xml,text/xml,*/*"
      },
      body: xmlBody,
      signal: controller.signal
    });

    const text = await res.text();
    if (!res.ok) {
      const snippet = text.slice(0, 800);
      throw new Error(`Moraware HTTP ${res.status} ${res.statusText}. Body: ${snippet}`);
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** When `MORAWARE_DISCOVERY_QUIET_LOGS=1`, suppress verbose Moraware response logging (default off — unchanged for sync). */
function morawareDiscoveryQuietLogs() {
  return String(process.env.MORAWARE_DISCOVERY_QUIET_LOGS ?? "").trim() === "1";
}

async function withRetries(fn, { retries, minDelayMs, maxDelayMs }) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > retries) throw err;

      const backoff = Math.min(maxDelayMs, minDelayMs * 2 ** (attempt - 1));
      const jitter = Math.floor(Math.random() * Math.min(250, backoff));
      await sleep(backoff + jitter);
    }
  }
}

/** Never combine pagingSpec with exact job / account / purchaseOrder id filters (Moraware rejects). */
export function shouldOmitPaging(filterXml) {
  return /<(job|account|purchaseOrder)\s+[^>]*id=/.test(String(filterXml));
}

export function buildMorawareCommandXml({ sessionId, innerXml }) {
  // We intentionally build raw XML strings because Moraware's command format is strict
  // and we want the request body to be obvious for debugging.
  const attrs = [
    `xmlns="http://www.moraware.com/schemas/command/v5"`,
    `version="5"`,
    sessionId ? `sessionId="${sessionId}"` : null
  ]
    .filter(Boolean)
    .join(" ");

  return `<MorawareCommand ${attrs}>\n${innerXml}\n</MorawareCommand>`;
}

function buildSessionCreateXml({ userName, password, accountId }) {
  return (
    `<MorawareCommand xmlns="http://www.moraware.com/schemas/command/v5" version="5" userName="${userName}" password="${password}" accountId="${accountId}">\n` +
    `  <sessionCreate/>\n` +
    `</MorawareCommand>`
  );
}

function pickFirstArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

/** Parse numeric Sq.Ft. from worksheet cell text (commas, decimals). */
function parseWorksheetSqFtNumber(raw) {
  if (raw == null) return NaN;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  const s = String(raw).trim();
  if (!s) return NaN;
  const m = s.match(/[\d,]+(?:\.\d+)?/);
  if (!m) return NaN;
  return Number.parseFloat(m[0].replace(/,/g, ""));
}

function xmlLeafText(node) {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node).trim();
  if (Array.isArray(node)) return xmlLeafText(node[0]);
  if (typeof node === "object") {
    const t = node._text ?? node["#text"];
    if (t != null) return String(t).trim();
  }
  return "";
}

function jobFormDisplayName(form) {
  const n =
    xmlLeafText(form?.name) ||
    xmlLeafText(form?.Name) ||
    String(form?._attributes?.name ?? "").trim();
  return n || "(unnamed form)";
}

/** Case-sensitive "Sq.Ft." or any label containing "Sq" (PDF / worksheet columns). */
function isWorksheetSqFtFieldName(fieldName) {
  if (fieldName === "Sq.Ft.") return true;
  return fieldName.includes("Sq");
}

/** Label from jobFormField row or nested jobFormField on hybrid payloads. */
function worksheetSqFtRowLabel(row) {
  if (!row || typeof row !== "object") return "";
  const jff = row.jobFormField ?? row.JobFormField;
  if (jff) {
    return (
      xmlLeafText(jff.name) ||
      xmlLeafText(jff.Name) ||
      String(jff._attributes?.name ?? "").trim()
    );
  }
  return (
    xmlLeafText(row.name) ||
    xmlLeafText(row.Name) ||
    String(row._attributes?.name ?? "").trim()
  );
}

/** Value on jobFormField row / jobFormFieldValue sibling. */
function worksheetSqFtRowValue(row) {
  if (!row || typeof row !== "object") return "";
  return (
    xmlLeafText(row.value) ||
    xmlLeafText(row.Value) ||
    String(row._attributes?.value ?? "").trim()
  );
}

/** jobFormFields.jobFormField[] from nested-include jobFormQuery (Casey pattern). */
function pickJobFormFieldRows(form) {
  const bag = form?.jobFormFields ?? form?.JobFormFields;
  return pickFirstArray(bag?.jobFormField ?? bag?.JobFormField ?? bag).filter(
    (r) => r && typeof r === "object"
  );
}

/**
 * Sum Sq.Ft. worksheet cells: iterate jobFormField rows; match "Sq.Ft." or contains "Sq".
 */
export function aggregateWorksheetSqFtFromJobFormFields(rows, formName) {
  let sum = 0;
  for (const row of pickFirstArray(rows)) {
    const fieldName = worksheetSqFtRowLabel(row);
    if (!fieldName) continue;
    if (!isWorksheetSqFtFieldName(fieldName)) continue;

    const value = worksheetSqFtRowValue(row);
    const n = parseWorksheetSqFtNumber(value);
    if (!Number.isFinite(n)) continue;

    console.log("Form:", formName, "| Found Field:", fieldName, "| Value:", value);
    sum += n;
  }
  return sum;
}

function _isEmptyObject(v) {
  return !v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).length === 0;
}

function buildPagingSpecInnerXml(firstRecord, pageSize) {
  return (
    `    <pagingSpec xmlns="">\n` +
    `      <firstRecord>${firstRecord}</firstRecord>\n` +
    `      <pageSize>${pageSize}</pageSize>\n` +
    `      <calculateTotalRecords>false</calculateTotalRecords>\n` +
    `    </pagingSpec>\n`
  );
}

/** Account-scoped listing: filter only or filter + include — never pagingSpec. */
function buildAccountScopedJobQueryInnerXml({ accountId, includeCreationDate, includeFields }) {
  const rawDump = (process.env.MORAWARE_RAW_JOB_DUMP || "true").toLowerCase() === "true";
  const includeLines = [
    "      <name/>",
    "      <jobStatus/>",
    includeCreationDate ? "      <creationDate/>" : null,
    "      <salesperson/>",
    "      <jobCustomField/>",
    "      <allCustomFields/>"
  ].filter(Boolean);

  const filter = `    <filter xmlns="">\n      <account id="${accountId}"/>\n    </filter>\n`;
  const includeBlock =
    rawDump || !includeFields
      ? ""
      : `    <include xmlns="">\n${includeLines.join("\n")}\n    </include>\n`;

  return `  <jobQuery>\n${filter}${includeBlock}  </jobQuery>`;
}

/**
 * Broad / global job listing (no account/job filter): include then pagingSpec child elements only.
 */
function buildGlobalPagedJobQueryInnerXml({ firstRecord, pageSize, includeCreationDate }) {
  const includeLines = [
    "      <name/>",
    "      <jobStatus/>",
    includeCreationDate ? "      <creationDate/>" : null,
    "      <account>\n        <name/>\n      </account>",
    "      <salesperson>\n        <name/>\n      </salesperson>",
    "      <jobCustomField/>",
    "      <allCustomFields/>"
  ].filter(Boolean);

  return (
    `  <jobQuery>\n` +
    `    <include xmlns="">\n` +
    `${includeLines.join("\n")}\n` +
    `    </include>\n` +
    buildPagingSpecInnerXml(firstRecord, pageSize) +
    `  </jobQuery>`
  );
}

/** Per-job header: filter before include; nested account / salesperson / notes (Discovery V2 parity). */
function buildJobHeaderByIdQueryInnerXml({ jobId }) {
  return (
    `  <jobQuery>\n` +
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
    `  </jobQuery>`
  );
}

export function buildJobIncludeAllCommand(jobId) {
  const jid = String(jobId ?? "").trim();
  if (!jid) throw new Error("buildJobIncludeAllCommand: jobId required");
  return (
    `<jobQuery>\n` +
    `  <filter xmlns="">\n` +
    `    <job id="${jid}"/>\n` +
    `  </filter>\n` +
    `  <include xmlns="">\n` +
    `    <all/>\n` +
    `  </include>\n` +
    `</jobQuery>`
  );
}

/** Step B — list job forms for a job. */
function buildJobFormListQueryInnerXml({ jobId }) {
  return (
    `  <jobFormQuery>\n` +
    `    <filter xmlns="">\n` +
    `      <job id="${jobId}"/>\n` +
    `    </filter>\n` +
    `    <include xmlns="">\n` +
    `      <jobForm/>\n` +
    `    </include>\n` +
    `  </jobFormQuery>`
  );
}

/** Nested shotgun jobFormQuery: jobFormFields → jobFormField → name + value (Casey pattern). */
function buildJobFormDetailQueryInnerXml({ jobFormId }) {
  return (
    `  <jobFormQuery>\n` +
    `    <filter xmlns="">\n` +
    `      <jobForm id="${jobFormId}"/>\n` +
    `    </filter>\n` +
    `    <include xmlns="">\n` +
    `      <name/>\n` +
    `      <jobFormFields>\n` +
    `        <jobFormField>\n` +
    `          <name/>\n` +
    `          <value/>\n` +
    `        </jobFormField>\n` +
    `      </jobFormFields>\n` +
    `    </include>\n` +
    `  </jobFormQuery>`
  );
}

/**
 * Production SDK all-fields jobForm fetch (single HTTP round-trip per job).
 * Optional debug: set options.debugDir or env MORAWARE_DEBUG_JOBFORMS_DIR to write raw + normalized JSON.
 */
export async function fetchJobFormsAllFields(client, jobId, options = {}) {
  const jid = String(jobId ?? "").trim();
  if (!jid) throw new Error("fetchJobFormsAllFields: jobId required");
  await client.ensureSession();
  const inner = buildJobFormsAllFieldsCommand(jid);
  const { data, rawXml } = await client.morawareCommand(inner);
  assertNoBlockingMorawareErrors(data);
  const norm = normalizeJobFormsFromSdkParsed(data);
  const metrics = computeWorksheetSqFtMetrics(norm.forms);
  const debugDir = options.debugDir ?? process.env.MORAWARE_DEBUG_JOBFORMS_DIR;
  if (debugDir && String(debugDir).trim()) {
    const dir = String(debugDir).trim();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `jobforms-${jid}-raw.xml`), rawXml, "utf8");
    await fs.writeFile(
      path.join(dir, `jobforms-${jid}-normalized.json`),
      JSON.stringify({ forms: norm.forms, metrics }, null, 2),
      "utf8"
    );
  }
  return { ...norm, metrics, rawXml, parsed: data };
}

export async function fetchJobOperationalAll(client, jobId, options = {}) {
  const jid = String(jobId ?? "").trim();
  if (!jid) throw new Error("fetchJobOperationalAll: jobId required");
  await client.ensureSession();
  const inner = buildJobIncludeAllCommand(jid);
  const { data, rawXml } = await client.morawareCommand(inner);
  assertNoBlockingMorawareErrors(data);
  const debugDir = options.debugDir ?? process.env.MORAWARE_DEBUG_OPERATIONAL_DIR;
  if (debugDir && String(debugDir).trim()) {
    const dir = String(debugDir).trim();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `job-operational-${jid}-raw.xml`), rawXml, "utf8");
    await fs.writeFile(
      path.join(dir, `job-operational-${jid}-parsed.json`),
      JSON.stringify(data ?? { error: "no parsed body" }, null, 2),
      "utf8"
    );
  }
  return { rawXml, parsed: data };
}

export class MorawareClient {
  constructor() {
    this.baseUrl = requiredEnv("MORAWARE_API_URL");
    this.userName = requiredEnv("MORAWARE_USERNAME");
    this.password = requiredEnv("MORAWARE_PASSWORD");
    this.accountId = String(process.env.MORAWARE_ACCOUNT_ID ?? "").trim();

    this.timeoutMs = toInt(process.env.MORAWARE_TIMEOUT_MS, 30_000);
    this.retries = toInt(process.env.MORAWARE_RETRIES, 3);
    this.minRetryDelayMs = toInt(process.env.MORAWARE_MIN_RETRY_DELAY_MS, 750);
    this.maxRetryDelayMs = toInt(process.env.MORAWARE_MAX_RETRY_DELAY_MS, 8_000);

    this.sessionId = null;
    this._loggedXmlSnippet = false;
    this._loggedFirstJobKeys = false;
  }

  async ensureSession() {
    if (this.sessionId) return this.sessionId;

    const xml = buildSessionCreateXml({
      userName: this.userName,
      password: this.password,
      accountId: this.accountId
    });

    const text = await withRetries(
      () => httpPostXml({ url: this.baseUrl, xmlBody: xml, timeoutMs: this.timeoutMs }),
      { retries: this.retries, minDelayMs: this.minRetryDelayMs, maxDelayMs: this.maxRetryDelayMs }
    );

    const obj = parseXmlToObject(text);
    const id =
      obj?.MorawareResponse?.sessionCreate?._attributes?.id ||
      obj?.MorawareResponse?.sessionCreate?.[0]?._attributes?.id ||
      obj?.MorawareResponse?.sessionCreate?.session?._attributes?.id ||
      obj?.MorawareResponse?.sessionCreate?.[0]?.session?.[0]?._attributes?.id;

    if (!id) {
      const snippet = text.slice(0, 800);
      throw new Error(
        `Login failed: Could not retrieve a valid Session ID from Moraware. Response: ${snippet}`
      );
    }
    this.sessionId = String(id);
    if (!this.sessionId || this.sessionId === "null" || this.sessionId.trim().length === 0) {
      throw new Error("Failed to capture a valid Moraware Session ID.");
    }
    if (!morawareDiscoveryQuietLogs()) console.log("Login Success. Session ID retrieved.");
    return this.sessionId;
  }

  async morawareCommand(innerXml) {
    const isJobQuery = typeof innerXml === "string" && innerXml.includes("<jobQuery");
    const sessionId = await this.ensureSession();
    if (isJobQuery && (!sessionId || sessionId === "null")) {
      throw new Error("Cannot execute query: No active session.");
    }

    const body = buildMorawareCommandXml({ sessionId, innerXml });
    const debugRawXml = String(process.env.EOS_DEBUG_RAW_XML ?? "").trim() === "1";
    if (debugRawXml) console.log("SENDING XML:", body);

    const text = await withRetries(
      () => httpPostXml({ url: this.baseUrl, xmlBody: body, timeoutMs: this.timeoutMs }),
      { retries: this.retries, minDelayMs: this.minRetryDelayMs, maxDelayMs: this.maxRetryDelayMs }
    );
    if (debugRawXml) console.log("RAW XML RESPONSE:", text);

    if (!this._loggedXmlSnippet) {
      this._loggedXmlSnippet = true;
      if (debugRawXml) console.log(`Moraware raw XML (first 200 chars): ${text.slice(0, 200)}`);
    }

    const data = parseXmlToObject(text);
    if (!morawareDiscoveryQuietLogs()) console.log("FULL SERVER RESPONSE:", data);
    return { rawXml: text, data };
  }

  async morawareCommandWithBody(xmlBody) {
    if (!morawareDiscoveryQuietLogs()) console.log("SENDING XML:", xmlBody);

    const text = await withRetries(
      () => httpPostXml({ url: this.baseUrl, xmlBody: xmlBody, timeoutMs: this.timeoutMs }),
      { retries: this.retries, minDelayMs: this.minRetryDelayMs, maxDelayMs: this.maxRetryDelayMs }
    );

    if (!morawareDiscoveryQuietLogs()) console.log("RAW XML RESPONSE:", text);

    if (!this._loggedXmlSnippet) {
      this._loggedXmlSnippet = true;
      if (!morawareDiscoveryQuietLogs()) console.log(`Moraware raw XML (first 200 chars): ${text.slice(0, 200)}`);
    }

    const data = parseXmlToObject(text);
    if (!morawareDiscoveryQuietLogs()) console.log("FULL SERVER RESPONSE:", data);
    return { rawXml: text, data };
  }

  async getApiVersion() {
    const body =
      `<MorawareCommand xmlns="http://www.moraware.com/schemas/command/v5" version="5" userName="${this.userName}" password="${this.password}" accountId="${this.accountId}">\n` +
      `  <apiVersionQuery/>\n` +
      `</MorawareCommand>`;

    console.log("SENDING XML:", body);

    const text = await withRetries(
      () => httpPostXml({ url: this.baseUrl, xmlBody: body, timeoutMs: this.timeoutMs }),
      { retries: this.retries, minDelayMs: this.minRetryDelayMs, maxDelayMs: this.maxRetryDelayMs }
    );

    const data = parseXmlToObject(text);
    return { rawXml: text, data };
  }

  /**
   * Fetches all jobs for an account and returns minimal job fields:
   * - id, name, jobStatus, creationDate (if included)
   *
   * Pagination support:
   * - Moraware pagination behavior differs by tenant/version; this method supports two strategies.
   *   Configure via env:
   *   - MORAWARE_PAGINATION_MODE: "none" | "pageInfo_page" | "pageInfo_offset"
   *   - MORAWARE_PAGE_SIZE: integer (default 200)
   *
   * If pagination mode is "none", a single request is made.
   */
  async listAccountJobs({ accountId, includeCreationDate = true }) {
    const inner = buildAccountScopedJobQueryInnerXml({
      accountId,
      includeCreationDate,
      includeFields: true
    });

    const { data } = await this.morawareCommand(inner);
    const jq = data?.MorawareResponse?.jobQuery;
    return pickFirstArray(jq?.job);
  }

  /**
   * Fetches all jobs in the system (no account filter) and returns minimal job fields.
   * Use this for "global" Firehose ingestion.
   */
  async listAllJobs({ includeCreationDate = true }) {
    const pageSize = toInt(process.env.MORAWARE_PAGE_SIZE, 100);
    const maxPages = toInt(process.env.MORAWARE_MAX_PAGES || process.env.MORAWARE_MAX_SEARCH_PAGES, 2000);

    const allJobs = [];
    let lastRawXml = null;
    let lastJobQuery = null;

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      const firstRecord = pageIndex * pageSize;
      const inner = buildGlobalPagedJobQueryInnerXml({ firstRecord, pageSize, includeCreationDate });
      const { data, rawXml } = await this.morawareCommand(inner);
      lastRawXml = rawXml;

      const jq = data?.MorawareResponse?.jobQuery;
      lastJobQuery = jq;
      const jobs = pickFirstArray(jq?.job);
      const firstJob = jobs[0];
      if (!_isEmptyObject(firstJob) && !this._loggedFirstJobKeys) {
        this._loggedFirstJobKeys = true;
        if (!morawareDiscoveryQuietLogs()) console.log("Keys found in raw job:", Object.keys(firstJob));
      }

      for (const j of jobs) allJobs.push(j);

      if (jobs.length === 0 || jobs.length < pageSize) break;
    }

    return { jobs: allJobs, rawXml: lastRawXml, jobQuery: lastJobQuery };
  }

  /**
   * Step A — job header row only (for enrichment pipeline).
   */
  async getJobHeader({ jobId }) {
    const inner = buildJobHeaderByIdQueryInnerXml({ jobId });
    const { data, rawXml } = await this.morawareCommand(inner);
    const jq = data?.MorawareResponse?.jobQuery;
    const jobs = pickFirstArray(jq?.job);
    const job = jobs[0] ?? null;
    return { job, rawXml };
  }

  /** Step B — jobForm IDs tied to a job. */
  async listJobFormIdsByJob({ jobId }) {
    const inner = buildJobFormListQueryInnerXml({ jobId });
    const { data } = await this.morawareCommand(inner);
    const jfq = data?.MorawareResponse?.jobFormQuery;
    const forms = pickFirstArray(jfq?.jobForm);
    const ids = [];
    for (const f of forms) {
      const id = f?._attributes?.id ?? f?.id;
      if (id != null && String(id).trim()) ids.push(String(id).trim());
    }
    return ids;
  }

  /** One worksheet: jobFormFields.jobFormField[] + form name. */
  async getJobFormFieldValuesDetail({ jobFormId }) {
    const inner = buildJobFormDetailQueryInnerXml({ jobFormId });
    const { data } = await this.morawareCommand(inner);
    const jfq = data?.MorawareResponse?.jobFormQuery;
    const forms = pickFirstArray(jfq?.jobForm);
    const form = forms[0];
    if (!form || typeof form !== "object") {
      return { formName: "(unnamed form)", jobFormFields: [] };
    }

    const formName = jobFormDisplayName(form);
    const jobFormFields = pickJobFormFieldRows(form);
    return { formName, jobFormFields };
  }

  /**
   * Job header + worksheets: totalSqFt / worksheetSqFtTotal from Sq.Ft. fields across forms.
   */
  async enrichJobWithWorksheetSqFt(job) {
    const d = String(process.env.MORAWARE_DISCOVERY ?? "").trim().toLowerCase();
    if (d === "1" || d === "true" || d === "yes") {
      throw new Error(
        "enrichJobWithWorksheetSqFt must not run in Moraware discovery mode (worksheet enrichment runs only in Firehose)."
      );
    }
    const jobId = String(job?._attributes?.id ?? job?.id ?? "").trim();
    if (!jobId) return job;

    let merged = { ...job };
    try {
      const { job: header } = await this.getJobHeader({ jobId });
      if (header && typeof header === "object") merged = { ...merged, ...header };

      const { forms, metrics } = await fetchJobFormsAllFields(this, jobId, {});
      merged.morawareJobForms = forms;
      merged.morawareJobFormsMetrics = metrics;
      merged.worksheetSqFtTotal = metrics.worksheetSqFt;
      merged.totalSqFt = String(metrics.worksheetSqFt);
      return merged;
    } catch (err) {
      console.warn(`Worksheet Sq.Ft. enrichment failed for jobId=${jobId}`, err);
      return job;
    }
  }

  async getJobDetails({ jobId }) {
    const { job, rawXml } = await this.getJobHeader({ jobId });
    return { job, rawXml };
  }

  async getJobCustomFieldValues({ jobId }) {
    const inner =
      `  <jobCustomFieldValueQuery>\n` +
      `    <filter xmlns="">\n` +
      `      <job id="${jobId}"/>\n` +
      `    </filter>\n` +
      `    <include xmlns="">\n` +
      `      <jobCustomFieldTypeId/>\n` +
      `      <value/>\n` +
      `    </include>\n` +
      `  </jobCustomFieldValueQuery>`;

    const { data } = await this.morawareCommand(inner);
    const q = data?.MorawareResponse?.jobCustomFieldValueQuery;
    return pickFirstArray(q?.jobCustomFieldValue);
  }

  /**
   * Alias for deep job fetch. Returns the job object only.
   */
  async getJob(jobId) {
    const { job } = await this.getJobDetails({ jobId });
    return job;
  }

  async getJobActivities({ jobId }) {
    const inner = `  <jobActivityQuery>\n    <filter>\n      <job id="${jobId}" />\n    </filter>\n    <include>\n      <startDate />\n      <schedTime />\n      <duration />\n      <notes />\n      <status />\n      <jobActivitySeries />\n    </include>\n  </jobActivityQuery>`;
    const { data } = await this.morawareCommand(inner);
    const jaq = data?.MorawareResponse?.jobActivityQuery;
    return pickFirstArray(jaq?.jobActivity);
  }

  /**
   * Fetch Job Forms + field values for a job.
   *
   * XML/JSON parsing notes:
   * - Moraware returns nested structures that can be either a single object or an array depending on cardinality.
   * - We always normalize with `pickFirstArray` at the boundary so downstream code can treat results as arrays.
   *
   * Important:
   * - Tenants differ in which includes are supported. This method requests a conservative include set that is
   *   commonly supported. If you need additional form/template details, we can extend the include list once we
   *   see your specific response structure.
   */
  async getJobForms({ jobId }) {
    const inner =
      `  <jobFormQuery>\n` +
      `    <filter>\n` +
      `      <job id="${jobId}" />\n` +
      `    </filter>\n` +
      `    <include>\n` +
      `      <jobForm />\n` +
      `      <formTemplate />\n` +
      `      <jobFormFieldValue />\n` +
      `    </include>\n` +
      `  </jobFormQuery>`;

    const { data } = await this.morawareCommand(inner);
    const jfq = data?.MorawareResponse?.jobFormQuery;
    return pickFirstArray(jfq?.jobForm);
  }
}

