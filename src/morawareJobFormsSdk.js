/**
 * Shared Moraware SDK-aligned jobForm ingestion (bulk by job id).
 * XML shape from CommandTracer: include formField → response formFields.jobField[].
 */

function pickFirstArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function leafText(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (Array.isArray(value)) return leafText(value[0]);
  if (typeof value === "object") {
    const t = value._text ?? value["#text"];
    if (t != null) return String(t).trim();
  }
  return "";
}

export function normalizeMorawareLabel(label) {
  let s = String(label ?? "").trim().toLowerCase();
  s = s.replace(/:/g, " ");
  s = s.replace(/\./g, "");
  s = s.replace(/\s+/g, " ");
  s = s.replace(/sqft/gi, "sq ft");
  s = s.replace(/sq\s*ft/gi, "sq ft");
  s = s.replace(/square\s+feet/gi, "sq ft");
  return s.trim();
}

export function isSqFtMorawareLabel(normalizedLabel, rawLabel) {
  const raw = String(rawLabel ?? "").trim();
  const n = normalizeMorawareLabel(raw);
  if (raw === "Sq.Ft." || /^sq\.?\s*ft\.?$/i.test(raw.replace(/\s+/g, " ").trim())) return true;
  if (n === "sq ft" || n.endsWith(" sq ft") || n.includes("sq ft")) return true;
  const collapsed = n.replace(/\s+/g, "");
  if (collapsed === "sqft") return true;
  if (n.includes("square feet")) return true;
  return Boolean(normalizedLabel && normalizedLabel.includes("sq ft"));
}

function parseMaybeNumber(raw) {
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

function walkObject(node, path, visitor) {
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

export function extractMorawareErrorsSdk(parsed) {
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
      errorCodeDescription: leafText(node.errorCodeDescription ?? node.ErrorCodeDescription),
      description: leafText(node.description ?? node.Description ?? node.message ?? node.Message)
    });
  });
  return errors;
}

export function hasBlockingMorawareErrorSdk(apiErrors) {
  return apiErrors.some((e) => {
    const c = e.errorCode;
    return c !== "0" && c !== "false" && Number(c) !== 0;
  });
}

export function assertNoBlockingMorawareErrors(parsed) {
  if (parsed?.parseError) {
    throw new Error(`Moraware XML parse error: ${parsed.parseError}`);
  }
  const apiErrors = extractMorawareErrorsSdk(parsed);
  if (hasBlockingMorawareErrorSdk(apiErrors)) {
    const e = apiErrors[0];
    throw new Error(
      `Moraware API error: ${e?.description || e?.errorCode || JSON.stringify(e)}`
    );
  }
}

/** Primary SDK-traced bulk query: all forms + fields for one job. */
export function buildJobFormsAllFieldsCommand(jobId) {
  return (
    `<jobFormQuery>\n` +
    `  <filter xmlns="">\n` +
    `    <job id="${jobId}"/>\n` +
    `  </filter>\n` +
    `  <include xmlns="">\n` +
    `    <name/>\n` +
    `    <job/>\n` +
    `    <formTemplate>\n` +
    `      <name/>\n` +
    `    </formTemplate>\n` +
    `    <jobPhase>\n` +
    `      <all/>\n` +
    `    </jobPhase>\n` +
    `    <formField>\n` +
    `      <name/>\n` +
    `      <value/>\n` +
    `      <dataType/>\n` +
    `    </formField>\n` +
    `  </include>\n` +
    `</jobFormQuery>`
  );
}

/** Single jobForm + fields (same include shape). */
export function buildJobFormAllFieldsCommand(formId) {
  return (
    `<jobFormQuery>\n` +
    `  <filter xmlns="">\n` +
    `    <jobForm id="${formId}"/>\n` +
    `  </filter>\n` +
    `  <include xmlns="">\n` +
    `    <name/>\n` +
    `    <job/>\n` +
    `    <formTemplate>\n` +
    `      <name/>\n` +
    `    </formTemplate>\n` +
    `    <jobPhase>\n` +
    `      <all/>\n` +
    `    </jobPhase>\n` +
    `    <formField>\n` +
    `      <name/>\n` +
    `      <value/>\n` +
    `      <dataType/>\n` +
    `    </formField>\n` +
    `  </include>\n` +
    `</jobFormQuery>`
  );
}

/**
 * Parse MorawareResponse.jobFormQuery.job.jobForms.jobForm[] into production form rows + flat field list.
 */
export function normalizeJobFormsFromSdkParsed(parsed) {
  const jfq = parsed?.MorawareResponse?.jobFormQuery;
  const jobNode =
    jfq?.job && typeof jfq.job === "object" && !Array.isArray(jfq.job) ? jfq.job : null;
  const bag = jobNode?.jobForms ?? jfq?.jobForms;
  const jobForms = pickFirstArray(bag?.jobForm ?? bag?.JobForm);
  const resolvedJobId = String(jobNode?._attributes?.id ?? "").trim();

  const forms = [];
  const fieldsFlat = [];

  for (const node of jobForms) {
    if (!node || typeof node !== "object") continue;
    const formId = String(node?._attributes?.id ?? "").trim();
    const rawFormName = leafText(node?.name);
    const formTemplateName = leafText(node?.formTemplate?.name);
    const templateId = String(node?.formTemplate?._attributes?.id ?? "").trim();
    const jobFormJobId = String(node?.job?._attributes?.id ?? "").trim() || resolvedJobId;

    const phases = node.jobPhases ?? node.JobPhases;
    const phRows = pickFirstArray(phases?.jobPhase ?? phases?.JobPhase);
    const ph0 = phRows[0] ?? {};
    const phaseId = String(ph0?._attributes?.id ?? "").trim();
    const phaseName = leafText(ph0?.name);
    const phaseSeqNum = String(ph0?._attributes?.seqNum ?? "").trim();

    const formName = rawFormName || formTemplateName || (formId ? `Form ${formId}` : "Form");

    const fields = [];
    const fieldsByLabel = {};

    const ff = node.formFields ?? node.FormFields;
    const rows = pickFirstArray(ff?.jobField ?? ff?.JobField);

    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const fieldId = String(row?._attributes?.id ?? "").trim();
      const label = leafText(row.name);
      const valueRaw = row.value ?? row.Value;
      const value =
        typeof valueRaw === "object" && valueRaw !== null ? leafText(valueRaw) : String(valueRaw ?? "").trim();
      const fieldValueId =
        typeof valueRaw === "object" && valueRaw !== null
          ? String(valueRaw?._attributes?.id ?? "").trim()
          : "";
      const dataType = String(row?._attributes?.dataType ?? "").trim();
      const normalizedLabel = normalizeMorawareLabel(label);
      const numericValue = parseMaybeNumber(value);

      const fieldObj = {
        formId: formId || null,
        formName,
        formTemplateName: formTemplateName || null,
        phaseName: phaseName || null,
        fieldId: fieldId || null,
        label,
        normalizedLabel,
        value,
        numericValue,
        fieldValueId: fieldValueId || null,
        dataType: dataType || null,
        sourcePath: "sdk:formFields.jobField"
      };
      fields.push(fieldObj);
      fieldsByLabel[label] = value;
      fieldsFlat.push(fieldObj);
    }

    forms.push({
      id: formId,
      name: formName,
      formName,
      rawFormName,
      formTemplateName,
      templateId,
      templateName: formTemplateName,
      jobId: jobFormJobId || null,
      phaseId: phaseId || null,
      phaseName: phaseName || null,
      phaseSeqNum: phaseSeqNum || null,
      fields,
      fieldsByLabel,
      sourcePath: "sdk:job.jobForms.jobForm"
    });
  }

  return { forms, fieldsFlat, jobId: resolvedJobId };
}

export function computeWorksheetSqFtMetrics(formsNormalized) {
  let worksheetSqFt = 0;
  let totalSqFt = 0;
  const sqFtByForm = {};
  const sqFtFields = [];
  let worksheetCount = 0;
  let fieldCount = 0;
  const formCount = formsNormalized.length;

  for (const form of formsNormalized) {
    fieldCount += form.fields?.length ?? 0;
    const isJobWorksheet = form.formTemplateName === "Job Worksheet";
    if (isJobWorksheet) worksheetCount += 1;

    for (const fld of form.fields || []) {
      if (!isSqFtMorawareLabel(fld.normalizedLabel, fld.label)) continue;
      sqFtFields.push({
        ...fld,
        formName: form.name,
        formTemplateName: form.formTemplateName
      });
      const n = fld.numericValue;
      if (n == null) continue;
      totalSqFt += n;
      if (isJobWorksheet) {
        worksheetSqFt += n;
        sqFtByForm[form.name] = (sqFtByForm[form.name] || 0) + n;
      }
    }
  }

  return {
    totalSqFt,
    worksheetSqFt,
    sqFtByForm,
    worksheetCount,
    fieldCount,
    formCount,
    sqFtFields
  };
}
