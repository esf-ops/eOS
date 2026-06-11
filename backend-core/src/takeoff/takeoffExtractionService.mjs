/**
 * takeoffExtractionService — orchestrates AI takeoff extraction for a workspace.
 *
 * Flow:
 *   1.  Verify AI is enabled (TAKEOFF_AI_ENABLED=1).
 *   2.  Load quote_takeoff_jobs row + verify org ownership.
 *   3.  Verify quote_file_id is set and the file is active.
 *   4.  Set job status = 'processing'.
 *   5.  Download file bytes from private Supabase Storage (service-role key).
 *   6.  Run page inventory pass (v5.4) — classify pages, identify measurement pages.
 *       Non-fatal: if inventory fails, extraction continues without inventory context.
 *   7.  Call AI provider with file bytes + prompt (includes inventory context if available).
 *   8.  Handle JSON parse failure → mark job 'failed' + return extraction_failed error.
 *   9.  Normalize TakeoffResult (enforce status = "draft", add source metadata).
 *  10.  Server-side recompute (computeTakeoffMeasurements) — AI totals never trusted.
 *  11.  Server-side validate (validateTakeoffResult).
 *  12.  Generate import plan (planTakeoffImport).
 *  13.  Insert quote_takeoff_results row (graceful fallback to job.result_summary
 *       if quote_id NOT NULL constraint is not yet relaxed).
 *  14.  Update quote_takeoff_jobs status = 'completed' | 'failed'.
 *  15.  Return normalized result + computed + validation + importPlan + pageInventory.
 *
 * Security:
 *   - storage_path is never returned to the client.
 *   - API key is never logged.
 *   - organizationId always from auth context (passed in; never from request body).
 *   - review_status is ALWAYS 'needs_review' — AI output is never auto-approved.
 *   - No quote mutation. No pricing logic. No Internal Estimate changes.
 *
 * Testability:
 *   providerFn and configOverride params allow full unit testing with mocked AI.
 *   When providerFn is provided, AI config checks (env vars) are skipped.
 *   inventoryProviderFn allows independent testing of the inventory step.
 *   When only providerFn is provided (no inventoryProviderFn), the inventory step
 *   is skipped to preserve existing test behavior.
 */
import { computeTakeoffMeasurements } from "./takeoffMeasurementCalc.mjs";
import { validateTakeoffResult }       from "./takeoffValidator.mjs";
import { planTakeoffImport }           from "./takeoffImportPlanner.mjs";
import { TAKEOFF_SCHEMA_VERSION }      from "./takeoffContract.mjs";
import { evaluateTakeoffQaGate }       from "./takeoffQaGate.mjs";
import { getExtractionProvider, getInventoryProvider, getEvidenceProvider, readExtractionConfig } from "./takeoffAiProvider.mjs";
import { QUOTE_FILE_BUCKET }           from "../files/quoteFileStoragePath.mjs";
import { PROMPT_VERSION }              from "./takeoffExtractionPrompt.mjs";
import { runPageInventory }            from "./takeoffPageInventoryService.mjs";
import { runDimensionEvidence }        from "./takeoffDimensionEvidenceService.mjs";

// ── Helpers ───────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v) {
  return UUID_RE.test(String(v ?? "").trim());
}

function extractionError(message, statusCode = 400, extra = {}) {
  const e = new Error(message);
  e.statusCode = statusCode;
  Object.assign(e, extra);
  return e;
}

async function setJobStatus(supabase, takeoffJobId, organizationId, fields) {
  await supabase
    .from("quote_takeoff_jobs")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId);
}

// ── Service ───────────────────────────────────────────────────────────────────

/**
 * Run AI extraction for a takeoff workspace.
 *
 * @param {{
 *   supabase: object,
 *   organizationId: string,
 *   userId: string|null,
 *   takeoffJobId: string,
 *   providerFn?: Function|null,          optional override for testing
 *   configOverride?: object|null         optional config override for testing
 * }} params
 */
export async function runAiTakeoffExtraction({
  supabase,
  organizationId,
  userId,
  takeoffJobId,
  providerFn              = null,
  configOverride          = null,
  inventoryProviderFn     = null,  // v5.4: injectable for testing; null = use default OpenAI call
  dimensionEvidenceProviderFn = null, // v5.5: injectable for testing; null = use default OpenAI call
}) {
  // 1. Validate inputs.
  if (!isUuid(organizationId)) {
    throw extractionError("organizationId must be a valid UUID");
  }
  if (!isUuid(takeoffJobId)) {
    throw extractionError("takeoffJobId must be a valid UUID");
  }

  // 2. Resolve AI provider + config.
  let config   = configOverride;
  let provider = providerFn;

  if (!provider) {
    config = config ?? readExtractionConfig();
    if (!config.enabled) {
      throw extractionError(
        "AI takeoff extraction is not enabled on this server. " +
        "Set TAKEOFF_AI_ENABLED=1 in the server environment.",
        403
      );
    }
    if (!config.apiKey) {
      const keyVar =
        config.providerName === "gemini" ? "GEMINI_API_KEY"
        : config.providerName === "exayard" ? "EXAYARD_API_KEY"
        : "OPENAI_API_KEY";
      throw extractionError(
        `${keyVar} is not configured on this server. ` +
        `Set ${keyVar} in the server environment.`,
        503
      );
    }
    if (config.providerName === "exayard") {
      const orgId = String(process.env.EXAYARD_ORGANIZATION_ID ?? "").trim();
      if (!orgId) {
        throw extractionError(
          "EXAYARD_ORGANIZATION_ID is not configured on this server. " +
          "Set EXAYARD_ORGANIZATION_ID in the server environment.",
          503
        );
      }
    }
    provider = getExtractionProvider(config.providerName);
  }

  // 3. Load the takeoff job (org-scoped — cross-org returns 404).
  const { data: jobRows, error: jobErr } = await supabase
    .from("quote_takeoff_jobs")
    .select("id,organization_id,quote_file_id,status,source_type,metadata")
    .eq("id", takeoffJobId)
    .eq("organization_id", organizationId)
    .limit(1);

  if (jobErr) {
    throw Object.assign(new Error(`DB error loading job: ${jobErr.message}`), { statusCode: 503 });
  }
  if (!jobRows || jobRows.length === 0) {
    throw extractionError("Takeoff job not found", 404);
  }
  const job = jobRows[0];

  if (!job.quote_file_id) {
    throw extractionError(
      "This takeoff job has no source file. Upload a plan file first, then generate.",
      400
    );
  }

  // 4. Load the source file row (need storage_path for secure download).
  const { data: fileRows, error: fileErr } = await supabase
    .from("quote_files")
    .select(
      "id,organization_id,status,storage_path,storage_bucket," +
      "mime_type,original_filename,file_size_bytes"
    )
    .eq("id", job.quote_file_id)
    .limit(1);

  if (fileErr) {
    throw Object.assign(new Error(`DB error loading file: ${fileErr.message}`), { statusCode: 503 });
  }
  if (!fileRows || fileRows.length === 0) {
    throw extractionError("Source file not found", 404);
  }
  const file = fileRows[0];

  if (String(file.organization_id ?? "") !== organizationId) {
    throw extractionError("Source file does not belong to this organization", 403);
  }
  if (file.status === "deleted") {
    throw extractionError("Source file has been deleted. Upload a new file.", 410);
  }
  if (file.status === "archived") {
    throw extractionError("Source file has been archived. Upload a new file.", 410);
  }

  // 5. Set job status = 'processing'.
  await setJobStatus(supabase, takeoffJobId, organizationId, { status: "processing" });

  // 6. Download file bytes from private Supabase Storage (service-role key — no client access).
  const bucketName  = file.storage_bucket ?? QUOTE_FILE_BUCKET;
  const storagePath = file.storage_path; // never returned to caller

  let fileBuffer;
  try {
    const { data: blob, error: downloadErr } = await supabase.storage
      .from(bucketName)
      .download(storagePath);

    if (downloadErr || !blob) {
      throw new Error(downloadErr?.message ?? "Storage download returned no data");
    }
    const arrayBuffer = await blob.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);
  } catch (e) {
    await setJobStatus(supabase, takeoffJobId, organizationId, {
      status: "failed",
      error_message: `File download failed: ${e instanceof Error ? e.message : String(e)}`,
    });
    throw Object.assign(
      new Error(`Failed to retrieve source file from storage: ${e instanceof Error ? e.message : String(e)}`),
      { statusCode: 503 }
    );
  }

  // 6. Run page inventory pass (v5.4).
  //    Only attempted when:
  //      - inventoryProviderFn is explicitly provided (test/override mode), or
  //      - we are in real AI mode (no providerFn override — production path)
  //    When providerFn is set but inventoryProviderFn is not, we skip inventory
  //    so existing unit tests (which mock only providerFn) remain unaffected.
  //    v5.9: resolve Gemini inventory provider from config when not explicitly injected.
  const effectiveInventoryFn = inventoryProviderFn ?? getInventoryProvider(config?.providerName ?? "openai");
  let pageInventory = null;
  const isExayard = config?.providerName === "exayard";
  const shouldRunInventory = !isExayard && (inventoryProviderFn != null || !providerFn);
  if (shouldRunInventory) {
    try {
      pageInventory = await runPageInventory({
        fileBuffer,
        mimeType:        file.mime_type ?? "",
        originalFilename: file.original_filename,
        modelName:       config?.modelName ?? "gpt-4o",
        apiKey:          config?.apiKey ?? null,
        providerFn:      effectiveInventoryFn,
      });
    } catch (inventoryErr) {
      console.warn(
        `[takeoffExtraction] Page inventory failed for job ${takeoffJobId} — ` +
        `continuing extraction without page context:`,
        inventoryErr.message
      );
      // Non-fatal: extraction proceeds without inventory context in the user message.
    }
  }

  // 6b. Run dimension evidence pass (v5.5).
  //     Same skip logic as inventory: only run when dimensionEvidenceProviderFn is provided
  //     (test/override mode) or when we are in real AI mode (no providerFn override).
  //     v5.9: resolve Gemini evidence provider from config when not explicitly injected.
  const effectiveEvidenceFn = dimensionEvidenceProviderFn ?? getEvidenceProvider(config?.providerName ?? "openai");
  let dimensionEvidence = null;
  const shouldRunEvidence = !isExayard && (dimensionEvidenceProviderFn != null || !providerFn);
  if (shouldRunEvidence) {
    try {
      dimensionEvidence = await runDimensionEvidence({
        fileBuffer,
        mimeType:         file.mime_type ?? "",
        originalFilename: file.original_filename,
        modelName:        config?.modelName ?? "gpt-4o",
        apiKey:           config?.apiKey ?? null,
        pageInventory,                           // v5.5: focus evidence on recommended pages
        providerFn:       effectiveEvidenceFn,
      });
    } catch (evidenceErr) {
      console.warn(
        `[takeoffExtraction] Dimension evidence failed for job ${takeoffJobId} — ` +
        `continuing extraction without evidence table:`,
        evidenceErr.message
      );
      // Non-fatal: extraction proceeds without evidence context in the user message.
    }
  }

  // 7. Call AI provider with file bytes (+ inventory + evidence context if available).
  let providerOutput;
  try {
    providerOutput = await provider({
      fileBuffer,
      mimeType:          file.mime_type ?? "",
      originalFilename:  file.original_filename,
      promptVersion:     PROMPT_VERSION,
      modelName:         config?.modelName ?? "gpt-4o",
      apiKey:            config?.apiKey ?? null,
      pageInventory,     // v5.4: passes recommended pages + dimension hints to extraction model
      dimensionEvidence, // v5.5: passes pre-extracted dimension table to anchor run building
      exayardProjectId:  job.metadata?.exayard?.projectId ?? null,
      takeoffJobId,
    });
  } catch (providerErr) {
    await setJobStatus(supabase, takeoffJobId, organizationId, {
      status: "failed",
      error_message: providerErr instanceof Error ? providerErr.message : String(providerErr),
    });
    throw providerErr;
  }

  const { rawText, parsed, parseError, modelUsed, usage, exayardWorkflow, exayardRaw, exayardRawCaptured } = providerOutput;

  // 8. Handle JSON parse failure — still save a partial failure record.
  if (!parsed || parseError) {
    console.error(
      `[takeoffExtraction] JSON parse failed for job ${takeoffJobId}:`,
      parseError,
      "\nRaw excerpt:", rawText?.slice(0, 600)
    );
    await setJobStatus(supabase, takeoffJobId, organizationId, {
      status: "failed",
      error_message: `AI output could not be parsed as TakeoffResult JSON: ${parseError ?? "unknown"}`,
      result_summary: {
        aiExtraction: true,
        extractionFailed: true,
        parseError,
        modelUsed,
        promptVersion: PROMPT_VERSION,
        usage,
        savedAt: new Date().toISOString(),
      },
    });
    throw extractionError(
      `AI extraction returned invalid JSON. The model response could not be parsed. ` +
      `Review the raw output server-side and adjust the plan file or prompt.`,
      422,
      { code: "extraction_failed", rawExcerpt: rawText?.slice(0, 500) }
    );
  }

  // 9. Normalize — enforce contract fields, status = "draft", add source context.
  const now = new Date().toISOString();
  const normalized = {
    schemaVersion: TAKEOFF_SCHEMA_VERSION,
    id:            parsed.id   ?? crypto.randomUUID(),
    status:        "draft",    // AI output is always 'draft' — estimator must review before use
    rooms:         Array.isArray(parsed.rooms) ? parsed.rooms : [],
    ...(parsed.confidence           != null && { confidence: parsed.confidence }),
    ...(parsed.projectAssumptions   != null && { projectAssumptions: parsed.projectAssumptions }),
    ...(parsed.aiProvidedTotals     != null && { aiProvidedTotals: parsed.aiProvidedTotals }),
    source: parsed.source ?? {
      fileName: file.original_filename,
    },
  };

  // 10. Server-side recompute — AI totals are NEVER used for pricing.
  let computed, validation, importPlan, qaGate;
  try {
    computed    = computeTakeoffMeasurements(normalized);
    validation  = validateTakeoffResult(normalized, computed, dimensionEvidence);
    importPlan  = planTakeoffImport(normalized, computed);
    // v5.8: automatic QA gate — pure function, safe to call here
    try {
      qaGate = evaluateTakeoffQaGate({
        takeoffResult:         normalized,
        computedMeasurements:  computed,
        validationDiagnostics: validation,
        dimensionEvidence:     dimensionEvidence ?? null,
        pageInventory:         pageInventory     ?? null,
      });
    } catch {
      qaGate = null; // non-fatal
    }
  } catch (calcErr) {
    await setJobStatus(supabase, takeoffJobId, organizationId, {
      status: "failed",
      error_message: `Post-extraction computation failed: ${calcErr instanceof Error ? calcErr.message : String(calcErr)}`,
    });
    throw extractionError(
      `Takeoff computation failed after AI extraction: ` +
      `${calcErr instanceof Error ? calcErr.message : String(calcErr)}`,
      422
    );
  }

  const schemaVersion = normalized.schemaVersion ?? TAKEOFF_SCHEMA_VERSION;

  const summary = {
    countertopExactSf:      computed.countertopExactSf,
    backsplashExactSf:      computed.backsplashExactSf,
    combinedExactSf:        computed.combinedExactSf,
    chargeableCountertopSf: computed.chargeableCountertopSf,
    chargeableBacksplashSf: computed.chargeableBacksplashSf,
    roomCount:              normalized.rooms.length,
    errorCount:             validation.errorCount,
    warningCount:           validation.warningCount,
    canImport:              importPlan.canImport,
  };

  // 11. Insert quote_takeoff_results row.
  //     review_status is ALWAYS 'needs_review' — AI never auto-approved.
  //     raw_ai_result_json stores the model's original output plus a _meta envelope
  //     containing promptVersion, modelUsed, and savedAt for run-history queries.
  let rawAiJson = null;
  if (rawText) {
    try { rawAiJson = JSON.parse(rawText); } catch { rawAiJson = { _raw: rawText.slice(0, 5000) }; }
  }
  // Inject eliteOS run metadata as a reserved _meta key so listTakeoffResults
  // can surface promptVersion/modelUsed/pageInventory without a separate DB column.
  const metaEnvelope = {
    promptVersion:    PROMPT_VERSION,
    provider:         config?.providerName ?? "openai", // v5.9: which AI provider was used
    modelUsed,
    savedAt:          now,
    pageInventory:    pageInventory    ?? null, // v5.4: null when inventory was skipped or failed
    dimensionEvidence: dimensionEvidence ?? null, // v5.5: null when evidence was skipped or failed
    qaGate:           qaGate           ?? null, // v5.8: automatic QA gate result
    exayardWorkflow:  exayardWorkflow  ?? null,
    exayardRaw:       exayardRaw       ?? null,
    exayardRawCaptured: Boolean(exayardRawCaptured),
  };
  const augmentedRawAiJson = rawAiJson != null
    ? { ...rawAiJson, _meta: metaEnvelope }
    : { _meta: metaEnvelope };

  const resultPayload = {
    organization_id:              organizationId,
    takeoff_job_id:               takeoffJobId,
    schema_version:               schemaVersion,
    raw_ai_result_json:           augmentedRawAiJson,
    normalized_takeoff_json:      normalized,
    computed_measurements_json:   computed,
    validation_diagnostics_json:  validation,
    import_plan_json:             importPlan,
    review_status:                "needs_review",
    needs_review:                 true,
    reviewed_by_user_id:          null,
    reviewed_at:                  null,
  };

  let resultRowId = null;
  const { data: resultRows, error: resultInsertErr } = await supabase
    .from("quote_takeoff_results")
    .insert(resultPayload)
    .select();

  if (!resultInsertErr && resultRows && resultRows.length > 0) {
    resultRowId = resultRows[0].id;
  } else if (resultInsertErr) {
    const isNotNullViolation =
      resultInsertErr.code === "23502" ||
      String(resultInsertErr.message ?? "").includes("null value in column");
    if (!isNotNullViolation) {
      await setJobStatus(supabase, takeoffJobId, organizationId, { status: "failed" });
      throw Object.assign(
        new Error(`Failed to save extraction result: ${resultInsertErr.message}`),
        { statusCode: 503 }
      );
    }
    console.warn(
      "[takeoffExtraction] quote_takeoff_results.quote_id NOT NULL blocked insert. " +
      "Result stored in quote_takeoff_jobs.result_summary. " +
      "Run: ALTER TABLE public.quote_takeoff_results ALTER COLUMN quote_id DROP NOT NULL;"
    );
  }

  // 12. Update quote_takeoff_jobs: status = 'completed', result_summary with full result.
  const exayardMeta = exayardWorkflow && typeof exayardWorkflow === "object" ? exayardWorkflow : null;
  await setJobStatus(supabase, takeoffJobId, organizationId, {
    status:       "completed",
    review_status: "needs_review",
    metadata: exayardMeta?.projectId ? {
      ...(job.metadata && typeof job.metadata === "object" ? job.metadata : {}),
      exayard: {
        projectId:    exayardMeta.projectId,
        fileId:       exayardMeta.fileId ?? null,
        assessmentId: exayardMeta.assessmentId ?? null,
        status:       exayardMeta.status ?? null,
        updatedAt:    now,
      },
    } : job.metadata,
    result_summary: {
      ...summary,
      savedAt:                    now,
      schemaVersion,
      reviewStatus:               "needs_review",
      modelUsed,
      promptVersion:              PROMPT_VERSION,
      usage,
      aiExtraction:               true,
      exayardRawCaptured:         Boolean(exayardRawCaptured),
      exayardWorkflow:            exayardWorkflow ?? null,
      normalizedTakeoffJson:      normalized,
      computedMeasurementsJson:   computed,
      validationDiagnosticsJson:  validation,
      importPlanJson:             importPlan,
      resultRowId:                resultRowId ?? null,
    },
  });

  // 15. Return result (storage_path never included).
  return {
    ok:                        true,
    takeoffJobId,
    resultRowId:               resultRowId ?? null,  // null when NOT NULL fallback triggered
    savedAt:                   now,
    schemaVersion,
    reviewStatus:              "needs_review",
    normalizedTakeoffJson:     normalized,
    computedMeasurementsJson:  computed,
    validationDiagnosticsJson: validation,
    importPlanJson:            importPlan,
    summary,
    modelUsed,
    promptVersion:             PROMPT_VERSION,
    usage,
    pageInventory:             pageInventory    ?? null, // v5.4: null when skipped or failed
    dimensionEvidence:         dimensionEvidence ?? null, // v5.5: null when skipped or failed
    qaGate:                    qaGate           ?? null, // v5.8: automatic QA gate result
    exayardWorkflow:           exayardWorkflow  ?? null,
    exayardRawCaptured:        Boolean(exayardRawCaptured),
  };
}
