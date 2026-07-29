/**
 * One authoritative Estimate Record review family.
 * All harness screens derive from this — no independent hard-coded summary totals.
 *
 * Geometry → Scope → calculation → commercial → publication → customer DE → revisions
 */
export const REVIEW_CUSTOMER_URL =
  "http://127.0.0.1:5193/review-digital-estimate.html#fixture=munsterman";

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function pieceSf(piece) {
  const len = Number(piece.lengthIn) || 0;
  const depth = Number(piece.depthIn) || 0;
  const qty = Number(piece.quantity) || 1;
  if (len > 0 && depth > 0) return round2((len * depth * qty) / 144);
  return 0;
}

/** Canonical geometry — shared by Takeoff + Verified Estimate. */
export const CANONICAL_PIECES = {
  kitchen: [
    { id: "left", name: "Left run", lengthIn: 69.5, depthIn: 36, quantity: 1 },
    { id: "back", name: "Back run", lengthIn: 112.5, depthIn: 25.5, quantity: 1 },
    { id: "sink", name: "Sink wall", lengthIn: 96, depthIn: 24, quantity: 1 },
    { id: "island", name: "Kitchen Island", lengthIn: 96, depthIn: 36, quantity: 1 }
  ],
  bath: [{ id: "vanity", name: "Vanity Top", lengthIn: 37, depthIn: 22.5, quantity: 1 }]
};

export const CANONICAL_OPENINGS = {
  kitchenSink: 1,
  vanityBarSink: 1,
  cooktop: 1,
  outlet: 0
};

export const BACKSPLASH_SF = 8.75;
export const EDGE_LF = 26.25;

/** Piece SF contracts (exact). */
export const EXPECTED_PIECE_SF = {
  "Left run": 17.38,
  "Back run": 19.92,
  "Sink wall": 16,
  "Kitchen Island": 24,
  "Vanity Top": 5.78
};

export const EXPECTED_COUNTERTOP_SF = round2(
  Object.values(EXPECTED_PIECE_SF).reduce((s, n) => s + n, 0)
); // 83.08

export function vanityPackageLabel(code) {
  const raw = String(code || "").trim();
  const m = raw.match(/^(\d+)_([SD])$/i);
  if (!m) {
    if (/vanity program/i.test(raw)) return raw;
    return raw || "Governed Vanity Program";
  }
  const bowl = m[2].toUpperCase() === "D" ? "Double" : "Single";
  return `${m[1]}-inch ${bowl}-Bowl Vanity Program`;
}

function formatEstimatorDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  try {
    return d.toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return String(iso);
  }
}

function buildRooms(sinkWallLengthIn = 96) {
  const kitchenPieces = CANONICAL_PIECES.kitchen.map((p) => {
    const lengthIn = p.name === "Sink wall" ? sinkWallLengthIn : p.lengthIn;
    const piece = { ...p, lengthIn, included: true, pieceType: "counter" };
    return { ...piece, squareFeet: pieceSf(piece), sqft: pieceSf(piece) };
  });
  const bathPieces = CANONICAL_PIECES.bath.map((p) => {
    const piece = { ...p, included: true, pieceType: "counter" };
    return { ...piece, squareFeet: pieceSf(piece), sqft: pieceSf(piece) };
  });
  const kitchenSf = round2(kitchenPieces.reduce((s, p) => s + p.squareFeet, 0));
  const bathSf = round2(bathPieces.reduce((s, p) => s + p.squareFeet, 0));
  return {
    kitchenPieces,
    bathPieces,
    kitchenSf,
    bathSf,
    countertopSf: round2(kitchenSf + bathSf)
  };
}

/** Base room/program lines before custom commercial lines (exact). */
export const BASE_ROOM_EXACT = 4122;

/** Sums to BASE_ROOM_EXACT with Vanity Program (no separate vanity material/opening). */
const BASE_LINE_AMOUNTS = [
  { key: "ct", label: "Countertop Material", amount: 1500, percentageEligible: true },
  { key: "tax", label: "Material Use Tax", amount: 72, percentageEligible: true },
  { key: "bs", label: "Backsplash", amount: 350, percentageEligible: true },
  { key: "ksink", label: "Kitchen sink cutout", amount: 200, percentageEligible: true },
  { key: "cook", label: "Cooktop cutout", amount: 150, percentageEligible: true }
];

const VANITY_PROGRAM_LINE = {
  key: "vanity_program",
  label: "Bathroom Vanity Program",
  amount: 1850,
  percentageEligible: true
};

/**
 * Recalculate commercial totals from current custom lines + %.
 * Internal-only excluded from customer totals.
 */
export function recalculateCommercialAuthority(args = {}) {
  const lines = Array.isArray(args.customLines) ? args.customLines : [];
  const percentage = Math.min(100, Math.max(0, Number(args.percentage) || 0));
  const active = args.active !== false && percentage > 0;
  const vanityApplied = args.vanityApplied !== false;

  const roomBase = vanityApplied
    ? [...BASE_LINE_AMOUNTS, VANITY_PROGRAM_LINE]
    : [
        ...BASE_LINE_AMOUNTS,
        { key: "vsink", label: "Vanity/bar sink cutout", amount: 100, percentageEligible: true },
        {
          key: "vanity_mat",
          label: "Bathroom vanity material",
          amount: 1750,
          percentageEligible: true
        }
      ];

  // Sanity: vanity path sums to BASE_ROOM_EXACT
  const roomSum = round2(roomBase.reduce((s, l) => s + l.amount, 0));
  const baseExactTotal = roomSum;

  const customerLines = lines.filter(
    (l) => l && l.commercialRole !== "internal_only" && l.customerVisible !== false
  );
  const internalLines = lines.filter((l) => l && l.commercialRole === "internal_only");

  function lineAmount(l) {
    const raw = round2((Number(l.quantity) || 0) * (Number(l.unitPriceExact ?? l.unitPrice) || 0));
    if (l.commercialRole === "credit" || l.commercialRole === "discount") {
      return raw > 0 ? -raw : raw;
    }
    return raw;
  }

  const eligibleExtras = [];
  const ineligibleExtras = [];
  for (const l of customerLines) {
    const amount = lineAmount(l);
    const row = {
      key: `custom_${l.id}`,
      label: l.description || "Custom line",
      amount,
      percentageEligible: l.percentageEligible !== false && amount >= 0
    };
    if (row.percentageEligible) eligibleExtras.push(row);
    else ineligibleExtras.push(row);
  }

  const eligibleBasis = round2(
    baseExactTotal + eligibleExtras.reduce((s, l) => s + l.amount, 0)
  );
  const commercialAdjustmentExact = active ? round2(eligibleBasis * (percentage / 100)) : 0;
  const ineligibleSum = round2(ineligibleExtras.reduce((s, l) => s + l.amount, 0));
  const adjustedExactTotal = round2(eligibleBasis + commercialAdjustmentExact + ineligibleSum);
  const customerDisplayTotal = Math.round(adjustedExactTotal / 10) * 10;

  const factor = active ? 1 + percentage / 100 : 1;
  const customerSafeGroups = [
    ...roomBase.map((l) => ({
      key: l.key,
      label: l.label,
      amount: round2(l.amount * factor),
      baseAmount: l.amount
    })),
    ...eligibleExtras.map((l) => ({
      key: l.key,
      label: l.label,
      amount: round2(l.amount * factor),
      baseAmount: l.amount
    })),
    ...ineligibleExtras.map((l) => ({
      key: l.key,
      label: l.label,
      amount: l.amount,
      baseAmount: l.amount
    }))
  ];

  return {
    baseExactTotal,
    eligibleBasisExact: eligibleBasis,
    commercialAdjustmentExact,
    percentage: active ? percentage : 0,
    nonPercentageCommercialExact: ineligibleSum,
    adjustedExactTotal,
    customerDisplayTotal,
    customerConfiguredExactTotal: adjustedExactTotal,
    customerConfiguredDisplayTotal: customerDisplayTotal,
    customerSafeGroups,
    internalOnlyTotal: round2(internalLines.reduce((s, l) => s + Math.abs(lineAmount(l)), 0)),
    vanityApplied
  };
}

const DEFAULT_CUSTOM_LINES = [
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

function buildVerifiedRooms(geo) {
  return [
    {
      id: "kitchen",
      name: "Kitchen",
      countertopSf: geo.kitchenSf,
      backsplashSf: round2(BACKSPLASH_SF - 1.03),
      exposedEdgeLf: EDGE_LF - 3.08,
      openingsByType: {
        kitchenSink: CANONICAL_OPENINGS.kitchenSink,
        vanityBarSink: 0,
        cooktop: CANONICAL_OPENINGS.cooktop,
        outlet: 0
      },
      pieces: geo.kitchenPieces.map((p) => ({
        id: p.id,
        name: p.name,
        type: "counter",
        lengthIn: p.lengthIn,
        depthIn: p.depthIn,
        quantity: p.quantity,
        squareFeet: p.squareFeet,
        included: true
      }))
    },
    {
      id: "bath",
      name: "Bathroom",
      countertopSf: geo.bathSf,
      backsplashSf: 1.03,
      exposedEdgeLf: 3.08,
      openingsByType: {
        kitchenSink: 0,
        vanityBarSink: CANONICAL_OPENINGS.vanityBarSink,
        cooktop: 0,
        outlet: 0
      },
      pieces: geo.bathPieces.map((p) => ({
        id: p.id,
        name: p.name,
        type: "counter",
        lengthIn: p.lengthIn,
        depthIn: p.depthIn,
        quantity: p.quantity,
        squareFeet: p.squareFeet,
        included: true
      }))
    }
  ];
}

function buildCommercial(authority, editable, waterfalls = [], scopeDetection = null) {
  return {
    editable,
    revisionNumber: 1,
    customLines: DEFAULT_CUSTOM_LINES.map((l) => ({ ...l })),
    estimateAdjustment: {
      active: authority.percentage > 0,
      percentage: authority.percentage,
      reason: "Spahn & Rose account pricing",
      source: "trusted_account",
      verifiedBaseExact: authority.baseExactTotal,
      eligibleAdditionalChargesExact: round2(
        (authority.eligibleBasisExact || 0) - (authority.baseExactTotal || 0)
      ),
      eligibleBasisExact: authority.eligibleBasisExact,
      baseExactTotal: authority.baseExactTotal,
      exactAdjustment: authority.commercialAdjustmentExact,
      nonPercentageCommercialExact: authority.nonPercentageCommercialExact,
      adjustedExactTotal: authority.adjustedExactTotal,
      customerDisplayTotal: authority.customerDisplayTotal,
      presentation: "distributed"
    },
    vanityPrograms: [
      {
        roomId: "bath",
        roomName: "Bathroom",
        applyProgram: true,
        useStandardPricing: false,
        selectedProgram: "37_S",
        selectedProgramLabel: vanityPackageLabel("37_S"),
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
        permittedMaterials: ["Group Promo materials"],
        permittedSinkUpgrades: ["Oval bisque", "Rectangular white", "Rectangular bisque"],
        permittedEdgeUpgrades: ["Eased", "Small Ogee"],
        serverPrice: 1850,
        warnings: [],
        includedScope: [
          "Vanity top",
          "Included backsplash",
          "1 vanity/bar sink opening",
          "Included sink configuration"
        ]
      }
    ],
    waterfalls,
    scopeDetection: scopeDetection || {
      vanityDetected: true,
      vanityApproved: true,
      islandDetected: true,
      islandLabel: "Kitchen Island",
      waterfallGeometryPresent: waterfalls.length > 0,
      waterfallApproved: waterfalls.length > 0
    },
    published: !editable
  };
}

function buildAiSummary(geo, authority, publication = null) {
  const rooms = buildVerifiedRooms(geo);
  // Bathroom backsplash share: 37*4/144 = 1.03; kitchen gets the rest of 8.75
  rooms[0].backsplashSf = round2(BACKSPLASH_SF - 1.03);
  rooms[1].backsplashSf = 1.03;
  return {
    measurements: {
      countertopSf: geo.countertopSf,
      backsplashSf: BACKSPLASH_SF,
      exposedEdgeLf: EDGE_LF,
      openingsByType: { ...CANONICAL_OPENINGS }
    },
    rooms,
    pricing: {
      baseExactTotal: authority.baseExactTotal,
      commercialAdjustmentExact: authority.commercialAdjustmentExact,
      adjustedExactTotal: authority.adjustedExactTotal,
      customerDisplayTotal: authority.customerDisplayTotal,
      customerConfiguredExactTotal: authority.customerConfiguredExactTotal,
      customerConfiguredDisplayTotal: authority.customerConfiguredDisplayTotal,
      exactTotal: authority.adjustedExactTotal,
      customerSafeGroups: authority.customerSafeGroups,
      warnings: [],
      unresolvedItems: []
    },
    publication
  };
}

export function buildScenario(name) {
  const geo = buildRooms(name === "r2" || name === "revision-history" ? 120 : 96);
  const authority = recalculateCommercialAuthority({
    customLines: DEFAULT_CUSTOM_LINES,
    percentage: 3,
    active: true,
    vanityApplied: true
  });

  if (name === "draft") {
    const draftGeo = buildRooms(96);
    return {
      name,
      stage: "draft",
      measurementsApproved: false,
      estimateRevision: 1,
      publishedRevision: null,
      customerUrl: null,
      commercial: {
        editable: true,
        revisionNumber: 1,
        customLines: [],
        estimateAdjustment: {
          active: false,
          percentage: 0,
          reason: "",
          source: "manual",
          baseExactTotal: 0,
          eligibleBasisExact: 0,
          exactAdjustment: 0,
          adjustedExactTotal: 0,
          customerDisplayTotal: null
        },
        vanityPrograms: [
          {
            roomId: "bath",
            roomName: "Bathroom",
            applyProgram: false,
            useStandardPricing: true,
            selectedProgram: null,
            selectedProgramLabel: null,
            physicalFacts: {
              widthIn: 37,
              depthIn: 22.5,
              quantity: 1,
              bowlCount: 1,
              sinkOpenings: 1,
              backsplash: "37 × 4″",
              sameTrip: true
            },
            eligible: true,
            eligibilityReasons: ["37″ × 22.5″ single bowl", "Same trip confirmed in Takeoff"],
            tripConfirmed: true,
            sameTripConfirmed: true,
            serverPrice: 1850,
            warnings: [],
            permittedMaterials: [],
            permittedSinkUpgrades: [],
            permittedEdgeUpgrades: [],
            includedScope: [
              "vanity top",
              "included backsplash",
              "vanity sink opening",
              "included white oval sink"
            ]
          }
        ],
        waterfalls: [],
        scopeDetection: {
          vanityDetected: true,
          vanityApproved: false,
          islandDetected: true,
          islandLabel: "Kitchen Island",
          waterfallGeometryPresent: false,
          waterfallApproved: false
        },
        published: false
      },
      aiSummary: {
        measurements: {
          countertopSf: draftGeo.countertopSf,
          backsplashSf: BACKSPLASH_SF,
          exposedEdgeLf: EDGE_LF,
          openingsByType: { ...CANONICAL_OPENINGS }
        },
        rooms: [],
        pricing: {
          baseExactTotal: null,
          customerDisplayTotal: null,
          customerSafeGroups: [],
          warnings: [],
          unresolvedItems: []
        }
      },
      takeoffMode: "editable",
      takeoffQuery: "localReview=1&mode=editable&takeoffJobId=local-review-takeoff&revisionNumber=1",
      revisions: [
        {
          revision: 1,
          status: "draft",
          createdAt: formatEstimatorDate("2026-07-29T13:00:00.000Z"),
          countertopSf: draftGeo.countertopSf,
          backsplashSf: BACKSPLASH_SF,
          openingsSummary: "Kitchen sink 1 · Vanity/bar 1 · Cooktop 1",
          displayTotal: null
        }
      ],
      comparison: null,
      publishEligible: false,
      authority: null
    };
  }

  const aiSummary = buildAiSummary(geo, authority);

  if (name === "approved" || name === "commercial") {
    const editableCommercial = name === "commercial";
    return {
      name,
      stage: editableCommercial ? "revision_draft" : "approved",
      measurementsApproved: true,
      estimateRevision: 1,
      publishedRevision: null,
      customerUrl: null,
      commercial: buildCommercial(authority, editableCommercial),
      aiSummary,
      authority,
      takeoffMode: editableCommercial ? "editable" : "readonly",
      takeoffQuery: editableCommercial
        ? "localReview=1&mode=editable&takeoffJobId=local-review-takeoff&revisionNumber=1"
        : "localReview=1&mode=readonly&approvalStatus=approved&takeoffJobId=local-review-takeoff&revisionNumber=1",
      revisions: [
        {
          revision: 1,
          status: editableCommercial ? "draft" : "approved",
          createdAt: formatEstimatorDate("2026-07-29T13:00:00.000Z"),
          approvedAt: editableCommercial
            ? null
            : formatEstimatorDate("2026-07-29T14:00:00.000Z"),
          countertopSf: geo.countertopSf,
          backsplashSf: BACKSPLASH_SF,
          edgeLf: EDGE_LF,
          openingsSummary: "Kitchen sink 1 · Vanity/bar 1 · Cooktop 1 · Outlet 0",
          displayTotal: authority.customerDisplayTotal,
          exactTotal: authority.adjustedExactTotal,
          customLinesSummary: "Tear Out $750 · Crane $350 · credit · internal",
          percentageSummary: "3.00% distributed",
          vanitySummary: vanityPackageLabel("37_S"),
          waterfallSummary: "None",
          customerActivity: "Not published"
        }
      ],
      comparison: null,
      publishEligible: !editableCommercial
    };
  }

  if (name === "published") {
    const base = buildScenario("commercial");
    const publication = {
      publishedAt: "2026-07-29T15:10:00.000Z",
      publishedAtLabel: formatEstimatorDate("2026-07-29T15:10:00.000Z"),
      pricingValidThrough: "2026-08-28",
      customerActivityLabel: "Not viewed",
      customerActivityState: "waiting",
      lastCustomerActivityAt: null,
      customerConfiguredTotal: null,
      customerDifference: null,
      reviewRequested: false
    };
    return {
      ...base,
      name: "published",
      stage: "published",
      customerUrl: REVIEW_CUSTOMER_URL,
      publishedRevision: 1,
      aiSummary: { ...base.aiSummary, publication },
      commercial: { ...base.commercial, editable: false, published: true },
      takeoffMode: "readonly",
      takeoffQuery:
        "localReview=1&mode=readonly&approvalStatus=approved&takeoffJobId=local-review-takeoff&revisionNumber=1",
      revisions: [
        {
          ...base.revisions[0],
          status: "published",
          publishedAt: formatEstimatorDate("2026-07-29T15:10:00.000Z"),
          isActivePublication: true,
          customerActivity: "Not viewed"
        }
      ]
    };
  }

  if (name === "r2" || name === "revision-history" || name === "r2-approved") {
    const published = buildScenario("published");
    const waterfalls = [
      {
        id: "wf-island-left",
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
        // labor 600 + polish 225 + miter (36/12)*65=195 + material ceil(9)*45=405 → 1425
        total: 1425
      }
    ];
    const r2Approved = name === "r2-approved";
    const r2Authority = recalculateCommercialAuthority({
      customLines: DEFAULT_CUSTOM_LINES,
      percentage: 3,
      active: true,
      vanityApplied: true
    });
    // Rough R2 bump for sink wall growth — keep named fields consistent.
    const r2Exact = round2(r2Authority.adjustedExactTotal + 180);
    const r2Display = Math.round(r2Exact / 10) * 10;
    return {
      name,
      stage: r2Approved ? "approved" : "revision_draft",
      measurementsApproved: r2Approved,
      estimateRevision: 2,
      publishedRevision: 1,
      customerUrl: REVIEW_CUSTOMER_URL,
      commercial: buildCommercial(r2Authority, !r2Approved, waterfalls, {
        vanityDetected: true,
        vanityApproved: r2Approved,
        islandDetected: true,
        waterfallGeometryPresent: true,
        waterfallApproved: r2Approved
      }),
      authority: {
        ...r2Authority,
        adjustedExactTotal: r2Exact,
        customerDisplayTotal: r2Display,
        customerConfiguredExactTotal: r2Exact,
        customerConfiguredDisplayTotal: r2Display
      },
      aiSummary: {
        ...buildAiSummary(geo, {
          ...r2Authority,
          adjustedExactTotal: r2Exact,
          customerDisplayTotal: r2Display,
          customerConfiguredExactTotal: r2Exact,
          customerConfiguredDisplayTotal: r2Display
        }),
        publication: published.aiSummary.publication,
        comparison: {
          changedItems: [
            { kind: "geometry", label: "Sink wall", from: "96", to: "120" },
            { kind: "waterfall", label: "Kitchen Island — Left waterfall", from: "none", to: "added" },
            { kind: "commercial", label: "Crane custom line", from: "none", to: "$350" },
            { kind: "percentage", label: "3% rule", from: "3.00%", to: "retained" }
          ],
          previousExactTotal: authority.adjustedExactTotal,
          revisedExactTotal: r2Exact,
          exactDifference: round2(r2Exact - authority.adjustedExactTotal),
          previousDisplayTotal: authority.customerDisplayTotal,
          revisedDisplayTotal: r2Display
        }
      },
      takeoffMode: r2Approved ? "readonly" : "editable",
      takeoffQuery: r2Approved
        ? "localReview=1&mode=readonly&approvalStatus=approved&withWaterfall=1&sinkWallLengthIn=120&takeoffJobId=local-review-takeoff&revisionNumber=2&publishedRevisionNumber=1"
        : "localReview=1&mode=editable&isRevisionDraft=1&withWaterfall=1&sinkWallLengthIn=120&takeoffJobId=local-review-takeoff&revisionNumber=2&publishedRevisionNumber=1",
      revisions: [
        { ...published.revisions[0], isActivePublication: true },
        {
          revision: 2,
          status: r2Approved ? "approved" : "draft",
          basedOnRevision: 1,
          createdAt: formatEstimatorDate("2026-07-29T16:00:00.000Z"),
          approvedAt: r2Approved ? formatEstimatorDate("2026-07-29T16:30:00.000Z") : null,
          countertopSf: geo.countertopSf,
          backsplashSf: BACKSPLASH_SF,
          edgeLf: EDGE_LF,
          openingsSummary: "Kitchen sink 1 · Vanity/bar 1 · Cooktop 1 · Outlet 0",
          displayTotal: r2Approved ? r2Display : null,
          exactTotal: r2Approved ? r2Exact : null,
          customLinesSummary: "Tear Out · Crane $350",
          percentageSummary: "3.00% retained",
          vanitySummary: vanityPackageLabel("37_S"),
          waterfallSummary: "Kitchen Island — Left (optional)",
          customerActivity: "R1 still active",
          changedItemCount: 4,
          summary: r2Approved
            ? "R2 approved — R1 remains published until R2 publication succeeds."
            : "Editing Revision R2 — R1 remains published until R2 is successfully published."
        }
      ],
      comparison: {
        changedItems: [
          { kind: "geometry", label: "Sink wall", from: "96", to: "120" },
          { kind: "waterfall", label: "Kitchen Island — Left waterfall", from: "none", to: "added" },
          { kind: "commercial", label: "Crane custom line", from: "none", to: "$350" },
          { kind: "percentage", label: "3% rule", from: "3.00%", to: "retained" }
        ],
        previousExactTotal: authority.adjustedExactTotal,
        revisedExactTotal: r2Exact,
        exactDifference: round2(r2Exact - authority.adjustedExactTotal),
        previousDisplayTotal: authority.customerDisplayTotal,
        revisedDisplayTotal: r2Display
      },
      publishEligible: r2Approved,
      showPublishRevised: r2Approved,
      revisionBanner: r2Approved
        ? "R2 estimate approved. R1 remains the active customer publication until R2 is published."
        : "Editing Revision R2. Based on approved revision R1. R1 remains published until R2 is successfully published."
    };
  }

  return buildScenario("approved");
}

/** Cross-surface contract helpers for tests. */
export function deriveTakeoffCountertopSf(sinkWallLengthIn = 96) {
  return buildRooms(sinkWallLengthIn).countertopSf;
}
