/**
 * Local-only Digital Estimate review fixture state + fetch mock.
 * Mounts production ConfigurationView — never used by production App routing.
 */
import type { ConfigurationState } from "../publicConfigApi";

const BASE = 5020;
const WATERFALL_DELTA = 980; // includes 3% distributed into authoritative total
const VANITY_UPGRADE_DELTA = 25;

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
      lineItems: [
        { label: "Countertop Material", amount: 3244.5 },
        { label: "Material Use Tax", amount: 74.16 },
        { label: "Backsplash", amount: 463.5 },
        { label: "Kitchen sink cutout", amount: 206 },
        { label: "Vanity/bar sink cutout", amount: 103 },
        { label: "Cooktop cutout", amount: 154.5 },
        { label: "Tear Out", amount: 772.5 },
        { label: "Crane", amount: 360.5 },
        { label: "Bathroom Vanity Program", amount: 1850 }
      ]
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
      lockedScopeNotice: "Physical measurements are locked. Choose only permitted upgrades.",
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
          customerMayEditLabel: false
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
          defaultQty: 0,
          selectable: true,
          role: "material",
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
      currentSelections: {
        "edge-eased-bath": 1,
        "wf-kitchen-island-left": 0,
        "vanity-sink-rect-white": 0
      },
      latestCalculation: {
        baselineDisplayTotal: BASE,
        configuredDisplayTotal: BASE,
        displayDelta: 0,
        pricingValidThrough: "2026-08-28",
        rooms: [
          { roomKey: "kitchen", displayName: "Kitchen", chargeableCounterSf: 52 },
          { roomKey: "bath", displayName: "Bathroom", chargeableCounterSf: 7.08 }
        ],
        totals: {
          baselineDisplayTotal: BASE,
          configuredDisplayTotal: BASE,
          displayDelta: 0
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
      { roomKey: "kitchen", displayName: "Kitchen", chargeableCounterSf: 52 },
      { roomKey: "bath", displayName: "Bathroom", chargeableCounterSf: 7.08 }
    ],
    totals: {
      baselineDisplayTotal: BASE,
      configuredDisplayTotal: total,
      displayDelta: total - BASE
    },
    // Prove 3% is baked into authoritative totals — no surcharge line.
    estimateWideAdjustmentApplied: true,
    percentage: 3,
    lineItems: [
      { label: "Countertop Material", amount: 3244.5 },
      { label: "Material Use Tax", amount: 74.16 },
      { label: "Backsplash", amount: 463.5 },
      { label: "Kitchen sink cutout", amount: 206 },
      { label: "Vanity/bar sink cutout", amount: 103 },
      { label: "Cooktop cutout", amount: 154.5 },
      { label: "Tear Out", amount: 772.5 },
      { label: "Crane", amount: 360.5 },
      { label: "Bathroom Vanity Program", amount: 1850 },
      ...((selections["wf-kitchen-island-left"] || 0) > 0
        ? [{ label: "Kitchen Island — Left waterfall", amount: WATERFALL_DELTA }]
        : []),
      ...((selections["vanity-sink-rect-white"] || 0) > 0
        ? [{ label: "Rectangular white sink upgrade", amount: VANITY_UPGRADE_DELTA }]
        : [])
    ]
  };
}

/** Install fetch mock for DE public APIs while review page is open. */
export function installDigitalEstimateReviewFetchMock() {
  const original = window.fetch.bind(window);
  let rowVersion = 1;
  (window as any).__deReviewSelections = {
    "edge-eased-bath": 1,
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

    if (url.includes("/final-acceptance")) {
      return new Response(
        JSON.stringify({
          ok: true,
          finalAcceptance: { id: "fa-1", acceptedAt: new Date().toISOString() }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    if (url.includes("/session") || url.includes("/configuration")) {
      return new Response(JSON.stringify(buildDigitalEstimateFixtureState()), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
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
