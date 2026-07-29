/**
 * Local-only Digital Estimate review fixture state + fetch mock.
 * Mounts production ConfigurationView — never used by production App routing.
 * Totals/openings/SF must match the studio coherent Estimate Record family.
 */
import type { ConfigurationState } from "../publicConfigApi";

/** Must match studio munstermanFixtures recalculateCommercialAuthority defaults. */
const BASE = 5280;
const WATERFALL_DELTA = 980;
const VANITY_UPGRADE_DELTA = 25;
const VANITY_LABEL = "37-inch Single-Bowl Vanity Program";
const EXPECTED_COUNTERTOP_SF = 83.08;
const KITCHEN_SF = 77.3;
const BATH_SF = 5.78;

const ADJUSTED_LINES = [
  { label: "Countertop Material", amount: 1545 },
  { label: "Material Use Tax", amount: 74.16 },
  { label: "Backsplash", amount: 360.5 },
  { label: "Kitchen sink cutout", amount: 206 },
  { label: "Cooktop cutout", amount: 154.5 },
  { label: "Bathroom Vanity Program", amount: 1905.5 },
  { label: "Tear Out", amount: 772.5 },
  { label: "Crane", amount: 360.5 },
  { label: "Courtesy credit", amount: -100 }
];

export function buildDigitalEstimateFixtureState(): ConfigurationState {
  return {
    lifecycle: "active",
    estimate: {
      id: "local-review-pub",
      publicToken: "fixture-munsterman",
      revision: 1,
      displayTotal: BASE,
      project: {
        customerName: "Munsterman",
        projectName: "Munsterman Plan",
        projectAddress: "Local review"
      },
      lineItems: ADJUSTED_LINES
    } as any,
    session: {
      id: "local-review-session",
      status: "active",
      rowVersion: 1,
      expiresAt: null
    },
    configuration: {
      envelopeId: "local-env",
      envelopeVersion: 1,
      pricingValidThrough: "2026-08-28",
      lockedScopeNotice: `${VANITY_LABEL} applied. Physical width, depth, and bowl count are locked. One approved vanity sink is included. Choose only permitted upgrades.`,
      sourceProject: {
        customerName: "Munsterman",
        projectName: "Munsterman Plan"
      },
      customerInfoDraft: {
        customerName: "Munsterman",
        projectName: "Munsterman Plan",
        phone: "",
        email: "",
        projectAddress: ""
      },
      rooms: [
        {
          roomKey: "kitchen",
          displayName: "Kitchen",
          measurementsLocked: true,
          measurementStatus: "locked",
          countertopIncluded: true,
          backsplashIncluded: true,
          customerMayEditLabel: false
        },
        {
          roomKey: "bath",
          displayName: "Bathroom",
          measurementsLocked: true,
          measurementStatus: "locked",
          countertopIncluded: true,
          backsplashIncluded: true,
          customerMayEditLabel: false,
          vanityProgramApplied: true,
          vanityProgramLabel: VANITY_LABEL,
          approvedSinkOpenings: 1,
          physicalFactsLocked: {
            widthIn: 37,
            depthIn: 22.5,
            bowlCount: 1
          }
        }
      ],
      groups: [
        { id: "g-mat", groupKey: "material_color", displayLabel: "Material", required: false },
        { id: "g-sink", groupKey: "sink", displayLabel: "Sink", required: false },
        { id: "g-edge", groupKey: "edge", displayLabel: "Edge", required: false },
        { id: "g-spec", groupKey: "specialty", displayLabel: "Specialty", required: false }
      ],
      options: [
        {
          optionKey: "mat-promo-calacatta",
          displayLabel: "Group Promo — Calacatta look",
          groupKey: "material_color",
          roomKey: "bath",
          availabilityState: "available",
          customerPriceTreatment: "included",
          minQty: 0,
          maxQty: 1,
          defaultQty: 1,
          selectable: true,
          includedInBaseline: true,
          selected: true,
          role: "material",
          visibleDelta: 0
        },
        {
          optionKey: "sink:bath:included-vanity",
          displayLabel: "Included vanity sink (program)",
          groupKey: "sink",
          roomKey: "bath",
          availabilityState: "available",
          customerPriceTreatment: "included",
          minQty: 0,
          maxQty: 1,
          defaultQty: 1,
          selectable: true,
          includedInBaseline: true,
          selected: true,
          role: "sink",
          sourceKind: "esf",
          visibleDelta: 0
        },
        {
          optionKey: "vanity-sink-rect-white",
          displayLabel: "Rectangular white sink upgrade",
          groupKey: "sink",
          roomKey: "bath",
          availabilityState: "available",
          customerPriceTreatment: "upgrade",
          minQty: 0,
          maxQty: 1,
          defaultQty: 0,
          selectable: true,
          role: "sink",
          sourceKind: "esf",
          visibleDelta: VANITY_UPGRADE_DELTA,
          priceEffectLabel: `+$${VANITY_UPGRADE_DELTA}`,
          priceEffectCents: VANITY_UPGRADE_DELTA * 100
        },
        {
          optionKey: "edge-eased-bath",
          displayLabel: "Eased edge",
          groupKey: "edge",
          roomKey: "bath",
          availabilityState: "available",
          customerPriceTreatment: "included",
          minQty: 0,
          maxQty: 1,
          defaultQty: 1,
          selectable: true,
          includedInBaseline: true,
          selected: true,
          role: "edge",
          visibleDelta: 0
        },
        {
          optionKey: "wf-kitchen-island-left",
          displayLabel: "Kitchen Island — Left waterfall",
          groupKey: "specialty",
          roomKey: "kitchen",
          availabilityState: "available",
          customerPriceTreatment: "upgrade",
          minQty: 0,
          maxQty: 1,
          defaultQty: 0,
          selectable: true,
          role: "specialty",
          description:
            "Optional waterfall panel. Dimensions are locked from approved Takeoff (36″ × 36″, 2–3″ miter, backside polish).",
          visibleDelta: WATERFALL_DELTA,
          priceEffectLabel: `+$${WATERFALL_DELTA}`,
          priceEffectCents: WATERFALL_DELTA * 100
        }
      ] as any,
      materials: [
        {
          materialId: "mat-1",
          optionKey: "mat-promo-calacatta",
          displayName: "Group Promo — Calacatta look",
          pricingGroupLabel: "Group Promo",
          collectionLabel: "Promo",
          availabilityState: "available",
          selectable: true,
          includedInBaseline: true
        }
      ] as any,
      products: [],
      productDrafts: {
        bath: {
          sink: {
            source: "esf",
            optionKey: "sink:bath:included-vanity",
            productId: null,
            variantId: null,
            manufacturer: "Program",
            model: "Included",
            finish: "",
            notes: "One approved vanity sink included with Vanity Program",
            displayLabel: "Included vanity sink (program)"
          }
        }
      },
      currentSelections: {
        "mat-promo-calacatta": 1,
        "edge-eased-bath": 1,
        "sink:bath:included-vanity": 1,
        "wf-kitchen-island-left": 0,
        "vanity-sink-rect-white": 0
      },
      latestCalculation: {
        baselineDisplayTotal: BASE,
        configuredDisplayTotal: BASE,
        displayDelta: 0,
        pricingValidThrough: "2026-08-28",
        rooms: [
          { roomKey: "kitchen", displayName: "Kitchen", chargeableCounterSf: KITCHEN_SF },
          { roomKey: "bath", displayName: "Bathroom", chargeableCounterSf: BATH_SF }
        ],
        totals: {
          baselineDisplayTotal: BASE,
          configuredDisplayTotal: BASE,
          displayDelta: 0
        },
        lineItems: ADJUSTED_LINES,
        estimateWideAdjustmentApplied: true,
        percentage: 3,
        countertopSf: EXPECTED_COUNTERTOP_SF,
        openingsByType: {
          kitchenSink: 1,
          vanityBarSink: 1,
          cooktop: 1,
          outlet: 0
        }
      },
      baselineDisplayTotal: BASE
    }
  };
}

function calcFromSelections(selections: Record<string, number>) {
  let total = BASE;
  if ((selections["wf-kitchen-island-left"] || 0) > 0) total += WATERFALL_DELTA;
  if ((selections["vanity-sink-rect-white"] || 0) > 0) total += VANITY_UPGRADE_DELTA;
  return {
    baselineDisplayTotal: BASE,
    configuredDisplayTotal: total,
    displayDelta: total - BASE,
    pricingValidThrough: "2026-08-28",
    rooms: [
      { roomKey: "kitchen", displayName: "Kitchen", chargeableCounterSf: KITCHEN_SF },
      { roomKey: "bath", displayName: "Bathroom", chargeableCounterSf: BATH_SF }
    ],
    totals: {
      baselineDisplayTotal: BASE,
      configuredDisplayTotal: total,
      displayDelta: total - BASE
    },
    estimateWideAdjustmentApplied: true,
    percentage: 3,
    lineItems: [
      ...ADJUSTED_LINES,
      ...((selections["wf-kitchen-island-left"] || 0) > 0
        ? [{ label: "Kitchen Island — Left waterfall", amount: WATERFALL_DELTA }]
        : []),
      ...((selections["vanity-sink-rect-white"] || 0) > 0
        ? [{ label: "Rectangular white sink upgrade", amount: VANITY_UPGRADE_DELTA }]
        : [])
    ],
    countertopSf: EXPECTED_COUNTERTOP_SF,
    openingsByType: {
      kitchenSink: 1,
      vanityBarSink: 1,
      cooktop: 1,
      outlet: 0
    }
  };
}

/** Install fetch mock for DE public APIs while review page is open. */
export function installDigitalEstimateReviewFetchMock() {
  const original = window.fetch.bind(window);
  let rowVersion = 1;
  (window as any).__deReviewSelections = {
    "mat-promo-calacatta": 1,
    "edge-eased-bath": 1,
    "sink:bath:included-vanity": 1,
    "wf-kitchen-island-left": 0,
    "vanity-sink-rect-white": 0
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(typeof input === "string" ? input : (input as Request).url || input);
    if (!url.includes("/api/public-digital-estimate/")) {
      return original(input, init);
    }

    if (url.includes("/selections") || url.includes("/recalculate")) {
      let body: any = {};
      try {
        body = init?.body ? JSON.parse(String(init.body)) : {};
      } catch {
        body = {};
      }
      const selections: Record<string, number> = {};
      for (const item of body.items || []) {
        selections[String(item.optionKey)] = Number(item.quantity) || 0;
      }
      if (!Object.keys(selections).length) {
        Object.assign(selections, (window as any).__deReviewSelections);
      }
      if (
        (selections["vanity-sink-rect-white"] || 0) === 0 &&
        (selections["sink:bath:included-vanity"] || 0) === 0
      ) {
        selections["sink:bath:included-vanity"] = 1;
      }
      (window as any).__deReviewSelections = selections;
      rowVersion += 1;
      const calculation = calcFromSelections(selections);
      return new Response(
        JSON.stringify({
          ok: true,
          session: { id: "local-review-session", status: "active", rowVersion },
          calculation,
          currentSelections: selections,
          missingInformationRequirements: []
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.includes("/review-requests")) {
      return new Response(
        JSON.stringify({
          ok: true,
          reviewRequest: { id: "rr-1", status: "open", createdAt: new Date().toISOString() }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  return () => {
    window.fetch = original;
  };
}
