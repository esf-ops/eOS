/**
 * Lab-facing labels for SimulatedTakeoffAdapter scenarios (Phase 4B.2).
 * Scenario selection does not inspect attachment bytes.
 */

import { SCENARIO_IDS } from "./simulatedScenarios.mjs";

/** Default: simple representative kitchen (not a failure scenario). */
export const DEFAULT_SIMULATED_SCENARIO_ID = "qil-synth-straight-kitchen";

const LABELS = Object.freeze({
  "qil-synth-straight-kitchen": {
    label: "Straight kitchen (simple)",
    blurb: "Single straight counter run — baseline happy path."
  },
  "qil-synth-l-kitchen": {
    label: "L-shaped kitchen",
    blurb: "L-shape with corner deduction."
  },
  "qil-synth-kitchen-island": {
    label: "Kitchen + island",
    blurb: "Perimeter plus island pieces."
  },
  "qil-synth-multi-room": {
    label: "Multi-room (kitchen + bath)",
    blurb: "Two rooms in one simulated plan."
  },
  "qil-synth-sink-cutouts": {
    label: "Sink cutouts",
    blurb: "Cutout count only — no SF deduction."
  },
  "qil-synth-standard-splash": {
    label: "Standard backsplash",
    blurb: "Countertop plus standard splash SF."
  },
  "qil-synth-fhb": {
    label: "Full-height backsplash",
    blurb: "Includes full-height backsplash SF."
  },
  "qil-synth-missing-dim": {
    label: "Missing dimension → manual review",
    blurb: "Forces manual-review status (not a crash)."
  },
  "qil-synth-conflict-dim": {
    label: "Conflicting dimensions → manual review",
    blurb: "Conflicting evidence → manual review."
  },
  "qil-synth-irregular": {
    label: "Irregular geometry → manual review",
    blurb: "Unsupported geometry → manual review."
  }
});

/**
 * @returns {Array<{ id: string, label: string, blurb: string }>}
 */
export function listSimulatedScenarioOptions() {
  return SCENARIO_IDS.map((id) => ({
    id,
    label: LABELS[id]?.label ?? id,
    blurb: LABELS[id]?.blurb ?? "Synthetic simulated scenario."
  }));
}

/**
 * @param {string|null|undefined} scenarioId
 */
export function scenarioLabel(scenarioId) {
  const id = String(scenarioId ?? "");
  return LABELS[id]?.label ?? (id || "—");
}
