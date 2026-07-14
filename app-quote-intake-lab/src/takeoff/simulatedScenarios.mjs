/**
 * Synthetic lab takeoff scenarios — deterministic, no real plans or customer data.
 * Evidence always states simulated fixture provenance.
 */

import { warn } from "./validateLabTakeoff.mjs";
import { TAKEOFF_WARNING_SEVERITY } from "./takeoffTypes.mjs";

/** Stable SHA-256-looking hashes (hex) for synthetic plan metadata only — not real file digests. */
export const SYNTHETIC_PLAN_HASHES = Object.freeze({
  "qil-synth-straight-kitchen":
    "a111111111111111111111111111111111111111111111111111111111111111",
  "qil-synth-l-kitchen": "a222222222222222222222222222222222222222222222222222222222222222",
  "qil-synth-kitchen-island":
    "a333333333333333333333333333333333333333333333333333333333333333",
  "qil-synth-multi-room": "a444444444444444444444444444444444444444444444444444444444444444",
  "qil-synth-sink-cutouts": "a555555555555555555555555555555555555555555555555555555555555555",
  "qil-synth-standard-splash":
    "a666666666666666666666666666666666666666666666666666666666666666",
  "qil-synth-fhb": "a777777777777777777777777777777777777777777777777777777777777777",
  "qil-synth-missing-dim": "a888888888888888888888888888888888888888888888888888888888888888",
  "qil-synth-conflict-dim": "a999999999999999999999999999999999999999999999999999999999999999",
  "qil-synth-irregular": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
});

export const SCENARIO_IDS = Object.freeze(Object.keys(SYNTHETIC_PLAN_HASHES));

/**
 * Resolve scenario from explicit id or attachment contentHash.
 * @param {string|undefined} scenarioId
 * @param {string|undefined} contentHash
 */
export function resolveScenarioId(scenarioId, contentHash) {
  if (scenarioId && SCENARIO_IDS.includes(scenarioId)) return scenarioId;
  const hash = String(contentHash ?? "").toLowerCase();
  for (const [id, h] of Object.entries(SYNTHETIC_PLAN_HASHES)) {
    if (h === hash) return id;
  }
  // Default deterministic scenario for unknown synthetic hashes
  return "qil-synth-straight-kitchen";
}

function sevid(scenario, n, label, value, unit = "in") {
  return {
    id: `${scenario}-ev-${n}`,
    pageNumber: 1,
    label,
    value,
    unit,
    confidence: "high",
    locationNote: "Synthetic lab fixture callout (not from a real plan).",
    simulatedNote: "Simulated fixture evidence — no plan file was read."
  };
}

function piece(opts) {
  return {
    id: opts.id,
    label: opts.label,
    roomId: opts.roomId,
    areaId: opts.areaId,
    measurement: {
      lengthIn: opts.lengthIn,
      depthIn: opts.depthIn,
      shape: opts.shape ?? "rect",
      pieceType: opts.pieceType ?? "counter",
      measuredSf: 0,
      evidenceIds: opts.evidenceIds ?? []
    },
    cutouts: opts.cutouts ?? [],
    notes: opts.notes ?? ["Synthetic simulated geometry."],
    requiresEstimatorReview: opts.requiresEstimatorReview ?? false,
    backsplashScope: opts.backsplashScope ?? null
  };
}

/**
 * @param {string} scenarioId
 * @returns {{
 *   pages: any[],
 *   rooms: any[],
 *   evidence: any[],
 *   seedWarnings: any[],
 *   providerTotals: {providerProposedCountertopSf?:number|null,providerProposedBacksplashSf?:number|null,providerProposedCombinedSf?:number|null},
 *   confidence: string,
 *   forceManual?: boolean
 * }}
 */
export function buildSimulatedGeometry(scenarioId) {
  switch (scenarioId) {
    case "qil-synth-straight-kitchen":
      return straightKitchen();
    case "qil-synth-l-kitchen":
      return lKitchen();
    case "qil-synth-kitchen-island":
      return kitchenIsland();
    case "qil-synth-multi-room":
      return multiRoom();
    case "qil-synth-sink-cutouts":
      return sinkCutouts();
    case "qil-synth-standard-splash":
      return standardSplash();
    case "qil-synth-fhb":
      return fullHeightSplash();
    case "qil-synth-missing-dim":
      return missingDimension();
    case "qil-synth-conflict-dim":
      return conflictingDimension();
    case "qil-synth-irregular":
      return irregularGeometry();
    default:
      return straightKitchen();
  }
}

function straightKitchen() {
  const id = "qil-synth-straight-kitchen";
  const evidence = [sevid(id, 1, "dimension length", 120), sevid(id, 2, "dimension depth", 25.5)];
  return {
    pages: [{ pageNumber: 1, role: "plan", notes: ["Synthetic straight-run kitchen fixture."] }],
    rooms: [
      {
        id: `${id}-room-kitchen`,
        name: "Kitchen",
        roomType: "kitchen",
        sourcePages: [1],
        confidence: "high",
        pieces: [
          piece({
            id: `${id}-piece-a`,
            label: "Main run",
            roomId: `${id}-room-kitchen`,
            lengthIn: 120,
            depthIn: 25.5,
            evidenceIds: [evidence[0].id, evidence[1].id]
          })
        ],
        measuredCountertopSf: 0,
        measuredBacksplashSf: 0,
        areaMeta: { areaId: `${id}-area`, backsplashScope: "no_stone" }
      }
    ],
    evidence,
    seedWarnings: [],
    // Intentional variance vs measured (120*25.5/144 = 21.25) — provider non-authoritative
    providerTotals: {
      providerProposedCountertopSf: 22.5,
      providerProposedBacksplashSf: 0,
      providerProposedCombinedSf: 22.5
    },
    confidence: "high"
  };
}

function lKitchen() {
  const id = "qil-synth-l-kitchen";
  const evidence = [
    sevid(id, 1, "dimension length A", 96),
    sevid(id, 2, "dimension depth A", 25.5),
    sevid(id, 3, "dimension length B", 84),
    sevid(id, 4, "dimension depth B", 25.5)
  ];
  const roomId = `${id}-room-kitchen`;
  return {
    pages: [{ pageNumber: 1, role: "plan", notes: ["Synthetic L-shaped kitchen fixture."] }],
    rooms: [
      {
        id: roomId,
        name: "Kitchen",
        roomType: "kitchen",
        sourcePages: [1],
        confidence: "high",
        pieces: [
          piece({
            id: `${id}-piece-a`,
            label: "Leg A",
            roomId,
            lengthIn: 96,
            depthIn: 25.5,
            evidenceIds: [evidence[0].id, evidence[1].id]
          }),
          piece({
            id: `${id}-piece-b`,
            label: "Leg B",
            roomId,
            lengthIn: 84,
            depthIn: 25.5,
            evidenceIds: [evidence[2].id, evidence[3].id]
          })
        ],
        measuredCountertopSf: 0,
        measuredBacksplashSf: 0,
        areaMeta: {
          areaId: `${id}-area`,
          backsplashScope: "no_stone",
          cornerDeductions: [{ depthA_in: 25.5, depthB_in: 25.5 }]
        }
      }
    ],
    evidence,
    seedWarnings: [],
    providerTotals: {
      providerProposedCountertopSf: 27.5,
      providerProposedBacksplashSf: 0,
      providerProposedCombinedSf: 27.5
    },
    confidence: "high"
  };
}

function kitchenIsland() {
  const id = "qil-synth-kitchen-island";
  const evidence = [
    sevid(id, 1, "dimension perimeter length", 140),
    sevid(id, 2, "dimension island length", 72),
    sevid(id, 3, "dimension depth", 25.5)
  ];
  const roomId = `${id}-room-kitchen`;
  return {
    pages: [{ pageNumber: 1, role: "plan", notes: ["Synthetic kitchen + island fixture."] }],
    rooms: [
      {
        id: roomId,
        name: "Kitchen",
        roomType: "kitchen",
        sourcePages: [1],
        confidence: "medium",
        pieces: [
          piece({
            id: `${id}-piece-wall`,
            label: "Wall run",
            roomId,
            lengthIn: 140,
            depthIn: 25.5,
            evidenceIds: [evidence[0].id, evidence[2].id]
          }),
          piece({
            id: `${id}-piece-island`,
            label: "Island",
            roomId,
            lengthIn: 72,
            depthIn: 36,
            evidenceIds: [evidence[1].id],
            notes: ["Synthetic island; depth from fixture table."]
          })
        ],
        measuredCountertopSf: 0,
        measuredBacksplashSf: 0,
        areaMeta: { areaId: `${id}-area`, backsplashScope: "no_stone" }
      }
    ],
    evidence,
    seedWarnings: [],
    providerTotals: {
      providerProposedCountertopSf: 43,
      providerProposedBacksplashSf: 0,
      providerProposedCombinedSf: 43
    },
    confidence: "medium"
  };
}

function multiRoom() {
  const id = "qil-synth-multi-room";
  const evidence = [
    sevid(id, 1, "dimension kitchen length", 100),
    sevid(id, 2, "dimension bath length", 48),
    sevid(id, 3, "dimension depth", 25.5)
  ];
  return {
    pages: [
      { pageNumber: 1, role: "plan", notes: ["Synthetic multi-room page 1."] },
      { pageNumber: 2, role: "plan", notes: ["Synthetic multi-room page 2."] }
    ],
    rooms: [
      {
        id: `${id}-room-kitchen`,
        name: "Kitchen",
        roomType: "kitchen",
        sourcePages: [1],
        confidence: "high",
        pieces: [
          piece({
            id: `${id}-piece-k`,
            label: "Kitchen run",
            roomId: `${id}-room-kitchen`,
            lengthIn: 100,
            depthIn: 25.5,
            evidenceIds: [evidence[0].id, evidence[2].id]
          })
        ],
        measuredCountertopSf: 0,
        measuredBacksplashSf: 0,
        areaMeta: { backsplashScope: "no_stone" }
      },
      {
        id: `${id}-room-bath`,
        name: "Bath 1",
        roomType: "bathroom",
        sourcePages: [2],
        confidence: "medium",
        pieces: [
          piece({
            id: `${id}-piece-b`,
            label: "Vanity top",
            roomId: `${id}-room-bath`,
            lengthIn: 48,
            depthIn: 22,
            evidenceIds: [evidence[1].id]
          })
        ],
        measuredCountertopSf: 0,
        measuredBacksplashSf: 0,
        areaMeta: { backsplashScope: "no_stone" }
      }
    ],
    evidence,
    seedWarnings: [],
    providerTotals: {
      providerProposedCountertopSf: 25,
      providerProposedBacksplashSf: 0,
      providerProposedCombinedSf: 25
    },
    confidence: "medium"
  };
}

function sinkCutouts() {
  const id = "qil-synth-sink-cutouts";
  const evidence = [sevid(id, 1, "dimension length", 110), sevid(id, 2, "cutout callout", "2 sinks", null)];
  const roomId = `${id}-room-kitchen`;
  return {
    pages: [{ pageNumber: 1, role: "plan", notes: ["Synthetic sink-cutout fixture."] }],
    rooms: [
      {
        id: roomId,
        name: "Kitchen",
        roomType: "kitchen",
        sourcePages: [1],
        confidence: "high",
        pieces: [
          piece({
            id: `${id}-piece-a`,
            label: "Sink wall",
            roomId,
            lengthIn: 110,
            depthIn: 25.5,
            evidenceIds: [evidence[0].id, evidence[1].id],
            cutouts: [
              { type: "sink", label: "Sink 1", confidence: "high" },
              { type: "sink", label: "Sink 2", confidence: "high" }
            ]
          })
        ],
        measuredCountertopSf: 0,
        measuredBacksplashSf: 0,
        areaMeta: { backsplashScope: "no_stone" }
      }
    ],
    evidence,
    seedWarnings: [
      warn(
        "CUTOUT_SCOPE_ONLY",
        TAKEOFF_WARNING_SEVERITY.INFORMATIONAL,
        "Sink cutouts are count/scope only — area is not deducted from measured SF.",
        false,
        false,
        roomId,
        `${id}-piece-a`,
        "cutouts"
      )
    ],
    providerTotals: {
      providerProposedCountertopSf: 19.48,
      providerProposedBacksplashSf: 0,
      providerProposedCombinedSf: 19.48
    },
    confidence: "high"
  };
}

function standardSplash() {
  const id = "qil-synth-standard-splash";
  const evidence = [
    sevid(id, 1, "dimension length", 120),
    sevid(id, 2, "dimension depth", 25.5),
    sevid(id, 3, "backsplash linear", 120),
    sevid(id, 4, "backsplash height", 4)
  ];
  const roomId = `${id}-room-kitchen`;
  return {
    pages: [{ pageNumber: 1, role: "plan", notes: ["Synthetic standard backsplash fixture."] }],
    rooms: [
      {
        id: roomId,
        name: "Kitchen",
        roomType: "kitchen",
        sourcePages: [1],
        confidence: "high",
        pieces: [
          piece({
            id: `${id}-piece-a`,
            label: "Main run",
            roomId,
            lengthIn: 120,
            depthIn: 25.5,
            evidenceIds: [evidence[0].id, evidence[1].id],
            backsplashScope: "standard"
          }),
          piece({
            id: `${id}-piece-splash`,
            label: "Standard splash",
            roomId,
            lengthIn: 120,
            depthIn: 4,
            pieceType: "splash",
            evidenceIds: [evidence[2].id, evidence[3].id],
            backsplashScope: "standard"
          })
        ],
        measuredCountertopSf: 0,
        measuredBacksplashSf: 0,
        areaMeta: {
          backsplashScope: "standard",
          backsplashLinearIn: 120,
          backsplashHeightIn: 4
        }
      }
    ],
    evidence,
    seedWarnings: [],
    providerTotals: {
      providerProposedCountertopSf: 21.25,
      providerProposedBacksplashSf: 3.5,
      providerProposedCombinedSf: 24.75
    },
    confidence: "high"
  };
}

function fullHeightSplash() {
  const id = "qil-synth-fhb";
  const evidence = [
    sevid(id, 1, "dimension length", 60),
    sevid(id, 2, "dimension depth", 25.5),
    sevid(id, 3, "fhb height", 48)
  ];
  const roomId = `${id}-room-kitchen`;
  return {
    pages: [{ pageNumber: 1, role: "plan", notes: ["Synthetic full-height backsplash fixture."] }],
    rooms: [
      {
        id: roomId,
        name: "Kitchen",
        roomType: "kitchen",
        sourcePages: [1],
        confidence: "medium",
        pieces: [
          piece({
            id: `${id}-piece-a`,
            label: "Cooktop run",
            roomId,
            lengthIn: 60,
            depthIn: 25.5,
            evidenceIds: [evidence[0].id, evidence[1].id]
          }),
          piece({
            id: `${id}-piece-fhb`,
            label: "Full-height splash",
            roomId,
            lengthIn: 60,
            depthIn: 48,
            pieceType: "fhb",
            evidenceIds: [evidence[2].id],
            backsplashScope: "full_height"
          })
        ],
        measuredCountertopSf: 0,
        measuredBacksplashSf: 0,
        areaMeta: { backsplashScope: "full_height" }
      }
    ],
    evidence,
    seedWarnings: [],
    providerTotals: {
      providerProposedCountertopSf: 10.63,
      // FHB is tracked as measuredFhbSf; provider audit total is combined-only.
      providerProposedBacksplashSf: 0,
      providerProposedCombinedSf: 31
    },
    confidence: "medium"
  };
}

function missingDimension() {
  const id = "qil-synth-missing-dim";
  const evidence = [sevid(id, 1, "dimension length", 90)];
  const roomId = `${id}-room-kitchen`;
  return {
    pages: [{ pageNumber: 1, role: "plan", notes: ["Synthetic missing-depth fixture."] }],
    rooms: [
      {
        id: roomId,
        name: "Kitchen",
        roomType: "kitchen",
        sourcePages: [1],
        confidence: "low",
        pieces: [
          piece({
            id: `${id}-piece-a`,
            label: "Incomplete run",
            roomId,
            lengthIn: 90,
            depthIn: null,
            evidenceIds: [evidence[0].id],
            requiresEstimatorReview: true
          })
        ],
        measuredCountertopSf: 0,
        measuredBacksplashSf: 0,
        areaMeta: { backsplashScope: "needs_review" }
      }
    ],
    evidence,
    seedWarnings: [
      warn(
        "MISSING_DIMENSION",
        TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING,
        "Synthetic fixture deliberately omits depth for manual review.",
        true,
        true,
        roomId,
        `${id}-piece-a`,
        "depthIn"
      )
    ],
    providerTotals: {
      providerProposedCountertopSf: null,
      providerProposedBacksplashSf: null,
      providerProposedCombinedSf: null
    },
    confidence: "low",
    forceManual: true
  };
}

function conflictingDimension() {
  const id = "qil-synth-conflict-dim";
  const evidence = [
    sevid(id, 1, "dimension length A", 100),
    sevid(id, 2, "dimension length conflicting", 112),
    sevid(id, 3, "dimension depth", 25.5)
  ];
  const roomId = `${id}-room-kitchen`;
  return {
    pages: [{ pageNumber: 1, role: "plan", notes: ["Synthetic conflicting-dimension fixture."] }],
    rooms: [
      {
        id: roomId,
        name: "Kitchen",
        roomType: "kitchen",
        sourcePages: [1],
        confidence: "low",
        pieces: [
          piece({
            id: `${id}-piece-a`,
            label: "Conflicted run",
            roomId,
            lengthIn: 100,
            depthIn: 25.5,
            evidenceIds: [evidence[0].id, evidence[1].id, evidence[2].id],
            requiresEstimatorReview: true,
            notes: ["Fixture encodes two conflicting length callouts; used 100 in."]
          })
        ],
        measuredCountertopSf: 0,
        measuredBacksplashSf: 0,
        areaMeta: { backsplashScope: "no_stone" }
      }
    ],
    evidence,
    seedWarnings: [
      warn(
        "CONFLICTING_DIMENSION",
        TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING,
        "Synthetic fixture provides conflicting length evidence (100 in vs 112 in).",
        true,
        true,
        roomId,
        `${id}-piece-a`,
        "lengthIn"
      )
    ],
    providerTotals: {
      providerProposedCountertopSf: 19.88,
      providerProposedBacksplashSf: 0,
      providerProposedCombinedSf: 19.88
    },
    confidence: "low",
    forceManual: true
  };
}

function irregularGeometry() {
  const id = "qil-synth-irregular";
  const evidence = [sevid(id, 1, "dimension approximate arc", "unsupported", null)];
  const roomId = `${id}-room-kitchen`;
  return {
    pages: [{ pageNumber: 1, role: "plan", notes: ["Synthetic irregular/unsupported geometry fixture."] }],
    rooms: [
      {
        id: roomId,
        name: "Kitchen",
        roomType: "kitchen",
        sourcePages: [1],
        confidence: "low",
        pieces: [
          piece({
            id: `${id}-piece-curve`,
            label: "Unsupported curved section",
            roomId,
            lengthIn: 80,
            depthIn: 25.5,
            evidenceIds: [evidence[0].id],
            requiresEstimatorReview: true,
            notes: ["Synthetic unsupported geometry — requires manual takeoff."]
          })
        ],
        measuredCountertopSf: 0,
        measuredBacksplashSf: 0,
        areaMeta: { backsplashScope: "needs_review" }
      }
    ],
    evidence,
    seedWarnings: [
      warn(
        "UNSUPPORTED_GEOMETRY",
        TAKEOFF_WARNING_SEVERITY.APPROVAL_BLOCKING,
        "Synthetic fixture models irregular/unsupported geometry requiring manual review.",
        true,
        true,
        roomId,
        `${id}-piece-curve`,
        "shape"
      )
    ],
    providerTotals: {
      providerProposedCountertopSf: 14.17,
      providerProposedBacksplashSf: 0,
      providerProposedCombinedSf: 14.17
    },
    confidence: "low",
    forceManual: true
  };
}
