import { buildTakeoffRequest } from "./buildTakeoffRequest.mjs";
import { applyDeterministicMeasurements } from "./labMeasurementCalc.mjs";
import {
  LAB_TAKEOFF_STATUS,
  PROVIDER_MODE_SIMULATED,
  PROVIDER_NAME_SIMULATED,
  PROVIDER_VERSION_SIMULATED
} from "./takeoffTypes.mjs";
import { buildSimulatedGeometry, resolveScenarioId } from "./simulatedScenarios.mjs";
import { validateLabTakeoffRun } from "./validateLabTakeoff.mjs";

/**
 * Deterministic SimulatedTakeoffAdapter — no network, no attachment-byte parsing.
 */
export class SimulatedTakeoffAdapter {
  constructor() {
    /** @type {Map<string, import("./takeoffTypes.mjs").TakeoffRun>} */
    this._runs = new Map();
  }

  get name() {
    return PROVIDER_NAME_SIMULATED;
  }

  get mode() {
    return PROVIDER_MODE_SIMULATED;
  }

  get version() {
    return PROVIDER_VERSION_SIMULATED;
  }

  /**
   * @param {Parameters<typeof buildTakeoffRequest>[0]} input
   */
  async run(input) {
    // Never read attachment bytes — buildTakeoffRequest rejects `bytes`.
    const request = buildTakeoffRequest(input);
    const startedAt = new Date().toISOString();
    const scenarioId = resolveScenarioId(request.scenarioId, request.attachment.contentHash);
    const runId = `qil-toff-${compactStamp(startedAt)}-${scenarioId.slice(-12)}-${Math.random()
      .toString(16)
      .slice(2, 8)}`;

    const geometry = buildSimulatedGeometry(scenarioId);
    const { rooms, calculation } = applyDeterministicMeasurements(
      geometry.rooms,
      geometry.providerTotals
    );

    /** @type {import("./takeoffTypes.mjs").TakeoffRun} */
    let run = {
      id: runId,
      caseId: request.caseId,
      acceptedIntakeSnapshotId: request.acceptedIntakeSnapshotId,
      attachmentId: request.attachment.attachmentId,
      attachmentContentHash: request.attachment.contentHash,
      provider: {
        name: PROVIDER_NAME_SIMULATED,
        mode: PROVIDER_MODE_SIMULATED,
        version: PROVIDER_VERSION_SIMULATED,
        note: "Deterministic simulated takeoff — does not read plan bytes or call Gemini."
      },
      startedAt,
      completedAt: new Date().toISOString(),
      labTakeoffStatus: LAB_TAKEOFF_STATUS.SIMULATING,
      humanReviewState: "unreviewed",
      pages: geometry.pages,
      rooms,
      evidence: geometry.evidence,
      warnings: [...(geometry.seedWarnings ?? [])],
      corrections: [],
      calculation,
      confidence: geometry.confidence,
      failure: null,
      acceptedSnapshotId: null,
      scenarioId
    };

    const validated = validateLabTakeoffRun(run);
    run = {
      ...run,
      warnings: validated.warnings,
      labTakeoffStatus: geometry.forceManual
        ? LAB_TAKEOFF_STATUS.MANUAL_REVIEW
        : validated.labTakeoffStatus
    };

    // Freeze a deep clone so later mutation cannot rewrite history in tests.
    const frozen = structuredCloneJson(run);
    this._runs.set(runId, frozen);

    return {
      ok: run.labTakeoffStatus !== LAB_TAKEOFF_STATUS.FAILED,
      runId,
      status: run.labTakeoffStatus,
      run: frozen
    };
  }

  async getRun(runId) {
    return this._runs.get(runId) ?? null;
  }

  async listRuns(caseId) {
    return [...this._runs.values()]
      .filter((r) => r.caseId === caseId)
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  }
}

export function getSimulatedTakeoffAdapter() {
  return new SimulatedTakeoffAdapter();
}

function compactStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "00000000";
  return d.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

function structuredCloneJson(v) {
  return JSON.parse(JSON.stringify(v));
}
