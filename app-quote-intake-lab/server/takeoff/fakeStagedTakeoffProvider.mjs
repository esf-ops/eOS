/**
 * Fake staged Gemini responses for Phase 4B.4A tests — zero network / zero cost.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GT_PATH = join(__dirname, "../../fixtures/takeoff/qil-synth-kitchen-island-plan.ground-truth.json");

export function loadGroundTruth() {
  return JSON.parse(readFileSync(GT_PATH, "utf8"));
}

/** Valid extraction aligned to the synthetic kitchen+island PDF ground truth. */
export function fakeValidSyntheticStagedProvider() {
  const gt = loadGroundTruth();
  const room = gt.rooms[0];
  const main = room.pieces[0];
  const island = room.pieces[1];

  return {
    inventory: async () => ({
      pageCount: 1,
      pages: [{ pageNumber: 1, role: "plan", notes: ["Synthetic kitchen plan"] }],
      countertopContentPresent: true,
      dimensionsAppearReadable: true,
      roomLabelsVisible: ["Kitchen"],
      confidence: "high",
      warnings: []
    }),
    evidence: async () => ({
      evidence: [
        {
          id: "ev-main-l",
          pageNumber: 1,
          label: "Main run length",
          value: main.lengthIn,
          unit: "in",
          confidence: "high",
          locationNote: "Main run label",
          bboxNorm: { x: 0.1, y: 0.2, w: 0.4, h: 0.05 }
        },
        {
          id: "ev-main-d",
          pageNumber: 1,
          label: "Main run depth",
          value: main.depthIn,
          unit: "in",
          confidence: "high",
          locationNote: "Main run label",
          bboxNorm: { x: 0.1, y: 0.25, w: 0.3, h: 0.05 }
        },
        {
          id: "ev-island-l",
          pageNumber: 1,
          label: "Island length",
          value: island.lengthIn,
          unit: "in",
          confidence: "high",
          locationNote: "Island label",
          bboxNorm: { x: 0.1, y: 0.4, w: 0.3, h: 0.05 }
        },
        {
          id: "ev-island-d",
          pageNumber: 1,
          label: "Island depth",
          value: island.depthIn,
          unit: "in",
          confidence: "high",
          locationNote: "Island label",
          bboxNorm: { x: 0.1, y: 0.45, w: 0.3, h: 0.05 }
        },
        {
          id: "ev-splash-h",
          pageNumber: 1,
          label: "Backsplash height",
          value: room.backsplash.heightIn,
          unit: "in",
          confidence: "high",
          locationNote: "Backsplash note",
          bboxNorm: { x: 0.1, y: 0.55, w: 0.2, h: 0.04 }
        },
        {
          id: "ev-sink",
          pageNumber: 1,
          label: "Sink cutout",
          value: 1,
          unit: "count",
          confidence: "high",
          locationNote: "Sink annotation",
          bboxNorm: { x: 0.3, y: 0.22, w: 0.1, h: 0.04 }
        }
      ],
      warnings: []
    }),
    geometry: async () => ({
      pages: [{ pageNumber: 1, role: "plan", notes: [] }],
      rooms: [
        {
          id: room.id,
          name: room.name,
          confidence: "high",
          sourcePages: [1],
          backsplashScope: room.backsplash.scope,
          backsplashLinearIn: room.backsplash.linearIn,
          backsplashHeightIn: room.backsplash.heightIn,
          pieces: [
            {
              id: main.id,
              label: main.label,
              lengthIn: main.lengthIn,
              depthIn: main.depthIn,
              shape: "rect",
              pieceType: "counter",
              evidenceIds: ["ev-main-l", "ev-main-d", "ev-sink"],
              cutouts: [{ type: "sink", label: "Undermount sink" }],
              notes: [],
              requiresEstimatorReview: false
            },
            {
              id: island.id,
              label: island.label,
              lengthIn: island.lengthIn,
              depthIn: island.depthIn,
              shape: "rect",
              pieceType: "counter",
              evidenceIds: ["ev-island-l", "ev-island-d"],
              cutouts: [],
              notes: [],
              requiresEstimatorReview: false
            }
          ]
        }
      ],
      providerProposedTotals: {
        countertopSf: gt.expected.countertopSf,
        backsplashSf: gt.expected.backsplashSf,
        combinedSf: gt.expected.combinedSf,
        nonAuthoritative: true
      },
      confidence: "high",
      missingDimensions: [],
      contradictions: [],
      warnings: []
    })
  };
}

export function fakeMissingDimensionStagedProvider() {
  const base = fakeValidSyntheticStagedProvider();
  return {
    ...base,
    geometry: async () => {
      const g = await base.geometry();
      g.rooms[0].pieces[0].depthIn = null;
      g.missingDimensions = ["Main run depth unreadable"];
      return g;
    }
  };
}

export function fakeConflictingDimensionStagedProvider() {
  const base = fakeValidSyntheticStagedProvider();
  return {
    ...base,
    geometry: async () => {
      const g = await base.geometry();
      g.contradictions = ["Main run length labeled both 120 in and 118 in"];
      return g;
    }
  };
}

export function fakeIrregularGeometryStagedProvider() {
  const base = fakeValidSyntheticStagedProvider();
  return {
    ...base,
    geometry: async () => {
      const g = await base.geometry();
      g.rooms[0].pieces[0].notes = ["Irregular curved cove — unsupported geometry"];
      g.rooms[0].pieces[0].requiresEstimatorReview = true;
      g.warnings = [
        {
          code: "UNSUPPORTED_GEOMETRY",
          severity: "approval_blocking",
          message: "Irregular geometry requires manual takeoff."
        }
      ];
      return g;
    }
  };
}

export function fakeNoCountertopStagedProvider() {
  return {
    inventory: async () => ({
      pageCount: 1,
      pages: [{ pageNumber: 1, role: "other", notes: ["Cabinet elevations only"] }],
      countertopContentPresent: false,
      dimensionsAppearReadable: false,
      roomLabelsVisible: [],
      confidence: "low",
      warnings: []
    }),
    evidence: async () => ({ evidence: [], warnings: [] }),
    geometry: async () => ({ rooms: [], warnings: [] })
  };
}

export function fakeInvalidJsonStagedProvider() {
  return {
    inventory: async () => {
      const err = new Error("inventory pass returned invalid JSON.");
      err.statusCode = 502;
      err.code = "INVALID_JSON";
      throw err;
    }
  };
}

export function fakeTimeoutStagedProvider() {
  return {
    inventory: async () => {
      const err = new Error("Gemini inventory timed out.");
      err.statusCode = 504;
      err.code = "PROVIDER_TIMEOUT";
      throw err;
    }
  };
}

export function fakeRateLimitStagedProvider() {
  return {
    inventory: async () => {
      const err = new Error("Gemini inventory failed (429).");
      err.statusCode = 429;
      err.code = "RATE_LIMITED";
      throw err;
    }
  };
}

export function fakeUnsupportedEvidenceStagedProvider() {
  const base = fakeValidSyntheticStagedProvider();
  return {
    ...base,
    evidence: async () => ({
      evidence: [
        {
          id: "ev-bad-page",
          pageNumber: 999,
          label: "Off-page dim",
          value: 120,
          unit: "in",
          confidence: "high"
        }
      ],
      warnings: []
    })
  };
}

export function testTakeoffConfig(overrides = {}) {
  const { takeoff: takeoffOverrides, ...rest } = overrides;
  return {
    liveAiEnabled: false,
    provider: "gemini",
    model: "",
    verificationModel: "",
    verificationEnabled: true,
    timeoutMs: 60_000,
    maxConcurrency: 2,
    maxBodyBytes: 256_000,
    allowedOrigin: "http://127.0.0.1:5196",
    labRequestToken: "test-token",
    host: "127.0.0.1",
    port: 5197,
    hasApiKey: false,
    apiKeySource: null,
    _apiKey: null,
    ...rest,
    takeoff: {
      liveEnabled: true,
      provider: "gemini",
      model: "test-model-not-called",
      verificationModel: "test-model-not-called",
      timeoutMs: 90_000,
      maxAttachmentBytes: 4_000_000,
      maxBodyBytes: 6_000_000,
      maxPages: 20,
      maxConcurrency: 1,
      ...(takeoffOverrides ?? {})
    }
  };
}
