/**
 * exayardTakeoffProvider — Exayard platform takeoff provider for AI Takeoff Lab.
 *
 * Implements the shared extraction provider interface but runs the Exayard REST
 * workflow (upload → analysis → poll) instead of an LLM prompt. Returns a
 * placeholder TakeoffResult with empty rooms; raw Exayard assessment JSON is
 * stored separately for a future normalization pass.
 *
 * Security: EXAYARD_API_KEY is never logged.
 */
import crypto from "node:crypto";
import {
  exayardSetupError,
  readExayardConfig,
  runExayardTakeoffWorkflow,
  buildExayardSafeWorkflowMeta,
} from "./exayardClient.mjs";
import { TAKEOFF_SCHEMA_VERSION } from "./takeoffContract.mjs";

/** Default countertop prompt for analysis/propose (OpenAPI: minLength 1). */
export const EXAYARD_DEFAULT_TAKEOFF_PROMPT =
  "Identify and measure all countertop surface areas, backsplashes, and related linear edges from the attached plan.";

/**
 * @param {import("./takeoffAiProvider.mjs").ExtractionInput & {
 *   exayardProjectId?: string|null,
 *   takeoffJobId?: string|null,
 *   fetchFn?: typeof fetch,
 * }} input
 */
export async function exayardTakeoffProvider(input) {
  const { organizationId } = readExayardConfig();
  if (!organizationId) {
    throw exayardSetupError(
      "EXAYARD_ORGANIZATION_ID is not configured. Set it in backend-core server environment.",
      { code: "missing_organization_id" }
    );
  }

  const workflow = await runExayardTakeoffWorkflow({
    fileBuffer:        input.fileBuffer,
    mimeType:          input.mimeType || "application/pdf",
    filename:          input.originalFilename || "plan.pdf",
    existingProjectId: input.exayardProjectId ?? null,
    takeoffJobId:      input.takeoffJobId ?? null,
    prompt:            EXAYARD_DEFAULT_TAKEOFF_PROMPT,
    fetchFn:           input.fetchFn,
    pollConfig:        input.pollConfig,
  });

  const parsed = {
    schemaVersion: TAKEOFF_SCHEMA_VERSION,
    id:            crypto.randomUUID(),
    status:        "draft",
    rooms:         [],
    confidence:    "low",
    projectAssumptions: [
      "Exayard raw result captured — normalization pending.",
      "Countertop measurements were not mapped into eliteOS TakeoffResult rooms yet.",
    ],
    source: {
      fileName: input.originalFilename ?? null,
      provider: "exayard",
    },
  };

  const safeMeta = buildExayardSafeWorkflowMeta(workflow);

  return {
    rawText:           JSON.stringify(workflow.rawAssessment ?? workflow),
    parsed,
    parseError:        null,
    modelUsed:         "exayard-platform",
    usage:             {},
    provider:          "exayard",
    exayardWorkflow:   safeMeta,
    exayardRaw:        workflow.rawAssessment ?? null,
    exayardRawCaptured: true,
  };
}
