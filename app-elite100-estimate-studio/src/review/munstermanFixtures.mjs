/**
 * Deterministic Estimate Record fixture payloads for local review only.
 * Pure browser-safe objects — does not import node:crypto backend modules.
 * Never imported by production StudioApp routing.
 */

export const REVIEW_CUSTOMER_URL =
  "http://127.0.0.1:5193/review-digital-estimate.html#fixture=munsterman";

const BASE_GROUPS = [
  { label: "Countertop Material", amount: 3150 },
  { label: "Material Use Tax", amount: 72 },
  { label: "Backsplash", amount: 450 },
  { label: "Kitchen sink cutout", amount: 200 },
  { label: "Vanity/bar sink cutout", amount: 100 },
  { label: "Cooktop cutout", amount: 150 }
];

function scaleGroups(pct) {
  const f = 1 + pct / 100;
  return BASE_GROUPS.map((g) => ({
    ...g,
    amount: Math.round(g.amount * f * 100) / 100
  }));
}

function vanityCard(overrides = {}) {
  return {
    roomId: "bath",
    roomName: "Bathroom",
    applyProgram: true,
    useStandardPricing: false,
    selectedProgram: "37_S",
    eligible: true,
    eligibilityReasons: ["37″ × 22.5″ single bowl", "Group Promo eligible"],
    additionalTrips: 0,
    physicalFacts: {
      widthIn: 37,
      depthIn: 22.5,
      quantity: 1,
      bowlCount: 1,
      sinkOpenings: 1,
      backsplash: "37 × 4″",
      sameTrip: true
    },
    permittedCustomerOptions: ["Group Promo materials"],
    serverPrice: 1850,
    warnings: [],
    ...overrides
  };
}

function commercialBase(editable, lines, waterfalls = []) {
  return {
    editable,
    revisionNumber: 1,
    customLines: lines,
    estimateAdjustment: {
      active: true,
      percentage: 3,
      reason: "Spahn & Rose account pricing",
      source: "manual",
      baseExactTotal: 4872,
      eligibleBasisExact: 4872,
      exactAdjustment: 146.16,
      adjustedExactTotal: 5018.16,
      customerDisplayTotal: 5020
    },
    vanityPrograms: [vanityCard()],
    waterfalls,
    published: false
  };
}

const COMMERCIAL_LINES = [
  {
    id: "tear",
    description: "Tear Out",
    category: "Tear-out",
    quantity: 1,
    unitPriceExact: 750,
    amountExact: 750,
    customerVisible: true,
    internalOnly: false,
    percentageEligible: true,
    commercialRole: "customer_charge",
    reason: "Tear Out preset"
  },
  {
    id: "crane",
    description: "Crane",
    category: "Crane",
    quantity: 1,
    unitPriceExact: 350,
    amountExact: 350,
    customerVisible: true,
    internalOnly: false,
    percentageEligible: true,
    commercialRole: "customer_charge",
    reason: "Job-site crane"
  },
  {
    id: "credit",
    description: "Courtesy credit",
    category: "Discount/Credit",
    quantity: 1,
    unitPriceExact: 100,
    amountExact: -100,
    customerVisible: true,
    internalOnly: false,
    percentageEligible: false,
    commercialRole: "credit",
    reason: "Estimator credit"
  },
  {
    id: "internal",
    description: "Internal material hold",
    category: "Other",
    quantity: 1,
    unitPriceExact: 200,
    amountExact: 200,
    customerVisible: false,
    internalOnly: true,
    percentageEligible: false,
    commercialRole: "internal_only",
    reason: "Internal only"
  }
];

function approvedSummary() {
  return {
    measurements: {
      countertopSf: 59.08,
      backsplashSf: 8.75,
      exposedEdgeLf: 26.25,
      openingsByType: {
        kitchen_sink: 1,
        vanity_bar_sink: 1,
        cooktop: 1,
        outlet: 0
      }
    },
    rooms: [
      {
        id: "kitchen",
        name: "Kitchen",
        countertopSf: 52,
        backsplashSf: 5.79,
        pieces: [
          { name: "Left run", lengthIn: 69.5, depthIn: 36, quantity: 1 },
          { name: "Back run", lengthIn: 112.5, depthIn: 25.5, quantity: 1 },
          { name: "Sink wall", lengthIn: 96, depthIn: 24, quantity: 1 },
          { name: "Kitchen Island", lengthIn: 96, depthIn: 36, quantity: 1 }
        ]
      },
      {
        id: "bath",
        name: "Bathroom",
        countertopSf: 7.08,
        backsplashSf: 2.96,
        pieces: [{ name: "Vanity Top", lengthIn: 37, depthIn: 22.5, quantity: 1 }]
      }
    ],
    pricing: {
      customerDisplayTotal: 5020,
      exactTotal: 5018.16,
      customerSafeGroups: [
        ...scaleGroups(3),
        { label: "Tear Out", amount: 772.5 },
        { label: "Crane", amount: 360.5 }
      ],
      warnings: [],
      unresolvedItems: []
    },
    publication: null
  };
}

export function buildScenario(name) {
  if (name === "draft") {
    return {
      name,
      stage: "draft",
      measurementsApproved: false,
      estimateRevision: 1,
      publishedRevision: null,
      customerUrl: null,
      estimate: { id: "local-review-estimate", revision: 1, status: "needs_takeoff_approval" },
      commercial: {
        editable: true,
        revisionNumber: 1,
        customLines: [],
        estimateAdjustment: { active: false, percentage: 0, reason: "", source: "manual" },
        vanityPrograms: [],
        waterfalls: [],
        published: false
      },
      aiSummary: {
        measurements: null,
        rooms: [],
        pricing: { customerDisplayTotal: null, customerSafeGroups: [], warnings: [], unresolvedItems: [] }
      },
      takeoffMode: "editable",
      takeoffQuery: "localReview=1&mode=editable&takeoffJobId=local-review-takeoff&revisionNumber=1",
      revisions: [
        {
          revision: 1,
          status: "draft",
          createdAt: "2026-07-29T13:00:00.000Z",
          countertopSf: null,
          backsplashSf: null,
          displayTotal: null
        }
      ],
      comparison: null,
      publishEligible: false
    };
  }

  if (name === "approved" || name === "commercial") {
    return {
      name,
      stage: "approved",
      measurementsApproved: true,
      estimateRevision: 1,
      publishedRevision: null,
      customerUrl: null,
      estimate: { id: "local-review-estimate", revision: 1, status: "approved" },
      commercial: commercialBase(true, COMMERCIAL_LINES),
      aiSummary: approvedSummary(),
      takeoffMode: "readonly",
      takeoffQuery:
        "localReview=1&mode=readonly&approvalStatus=approved&takeoffJobId=local-review-takeoff&revisionNumber=1",
      revisions: [
        {
          revision: 1,
          status: "approved",
          createdAt: "2026-07-29T13:00:00.000Z",
          approvedAt: "2026-07-29T14:00:00.000Z",
          countertopSf: 59.08,
          backsplashSf: 8.75,
          edgeLf: 26.25,
          openingsSummary: "Kitchen sink 1 · Vanity/bar 1 · Cooktop 1",
          displayTotal: 5020,
          customLinesSummary: "Tear Out $750 · Crane $350 · credit · internal",
          percentageSummary: "3.00% distributed",
          vanitySummary: "Bathroom 37_S applied",
          waterfallSummary: "None",
          customerActivity: "Not published"
        }
      ],
      comparison: null,
      publishEligible: true
    };
  }

  if (name === "published") {
    const base = buildScenario("commercial");
    base.name = "published";
    base.stage = "published";
    base.customerUrl = REVIEW_CUSTOMER_URL;
    base.publishedRevision = 1;
    base.aiSummary.publication = {
      publishedAt: "2026-07-29T15:10:00.000Z",
      pricingValidThrough: "2026-08-28",
      customerActivityLabel: "Not viewed",
      customerActivityState: "waiting",
      lastCustomerActivityAt: null,
      customerConfiguredTotal: null,
      customerDifference: null,
      reviewRequested: false
    };
    base.revisions[0] = {
      ...base.revisions[0],
      status: "published",
      publishedAt: "2026-07-29T15:10:00.000Z",
      isActivePublication: true,
      customerActivity: "Not viewed"
    };
    base.commercial = { ...base.commercial, editable: false, published: true };
    return base;
  }

  if (name === "r2" || name === "revision-history") {
    const published = buildScenario("published");
    const waterfalls = [
      {
        id: "wf-left",
        roomId: "kitchen",
        roomName: "Kitchen",
        pieceId: "island",
        pieceLabel: "Kitchen Island",
        side: "left",
        panelWidthIn: 36,
        panelHeightIn: 36,
        quantity: 1,
        miterKey: "2-3in",
        backsidePolish: true,
        customerOptional: true,
        includedInScope: true,
        total: null
      }
    ];
    return {
      name,
      stage: "revision_draft",
      measurementsApproved: false,
      estimateRevision: 2,
      publishedRevision: 1,
      customerUrl: REVIEW_CUSTOMER_URL,
      estimate: { id: "local-review-estimate-r2", revision: 2, status: "draft" },
      commercial: commercialBase(true, COMMERCIAL_LINES, waterfalls),
      aiSummary: {
        ...published.aiSummary,
        comparison: {
          changedItems: [
            { kind: "geometry", label: "Sink wall length", from: "96", to: "120" },
            { kind: "waterfall", label: "Kitchen Island — Left waterfall", from: "none", to: "added" },
            { kind: "commercial", label: "Crane custom line", from: "none", to: "$350" },
            { kind: "percentage", label: "3% rule", from: "3.00%", to: "3.00% retained" }
          ]
        }
      },
      takeoffMode: "editable",
      takeoffQuery:
        "localReview=1&mode=editable&isRevisionDraft=1&withWaterfall=1&sinkWallLengthIn=120&takeoffJobId=local-review-takeoff&revisionNumber=2&publishedRevisionNumber=1",
      revisions: [
        { ...published.revisions[0], isActivePublication: true },
        {
          revision: 2,
          status: "draft",
          basedOnRevision: 1,
          createdAt: "2026-07-29T16:00:00.000Z",
          countertopSf: 62.5,
          backsplashSf: 8.75,
          edgeLf: 26.25,
          displayTotal: null,
          customLinesSummary: "Tear Out · Crane $350",
          percentageSummary: "3.00% retained",
          vanitySummary: "Bathroom 37_S",
          waterfallSummary: "Kitchen Island — Left (optional)",
          customerActivity: "R1 still active",
          changedItemCount: 4,
          summary: "Editing measurement revision R2 — R1 remains published until R2 publish succeeds."
        }
      ],
      comparison: {
        changedItems: [
          { kind: "geometry", label: "Sink wall", from: "96", to: "120" },
          { kind: "waterfall", label: "Kitchen Island — Left waterfall", from: "none", to: "added" },
          { kind: "commercial", label: "Crane custom line", from: "none", to: "$350" },
          { kind: "percentage", label: "3% rule", from: "3.00%", to: "retained" }
        ],
        previousExactTotal: 5018.16,
        revisedExactTotal: 5480,
        exactDifference: 461.84,
        previousDisplayTotal: 5020,
        revisedDisplayTotal: 5480
      },
      publishEligible: false,
      revisionBanner:
        "Editing measurement revision R2. Based on approved revision R1. R1 remains published until R2 is successfully published."
    };
  }

  return buildScenario("approved");
}
