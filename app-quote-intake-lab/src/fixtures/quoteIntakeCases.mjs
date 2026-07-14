/**
 * Deterministic fictional Quote Intake Lab cases.
 * All sender emails use example.com. Not production data.
 *
 * Simulated fields (measurements, pricing, confidence, takeoff) are labeled as such.
 */

/** Fixed clock for deterministic turnaround in UI + tests. */
export const FIXTURE_AS_OF = "2026-07-14T15:00:00.000Z";

export const FIXTURE_DATA_NOTICE =
  "Fixture data only · simulated measurements/pricing/takeoff · no production connections";

/**
 * @type {import("../domain/types.js").QuoteIntakeCase[]}
 */
export const QUOTE_INTAKE_FIXTURE_CASES = Object.freeze([
  Object.freeze({
    id: "qil-case-001",
    status: "qil_received",
    priority: "normal",
    receivedAt: "2026-07-14T14:20:00.000Z",
    updatedAt: "2026-07-14T14:20:00.000Z",
    senderName: "Avery Nguyen",
    senderEmail: "avery.nguyen@example.com",
    recipientMailbox: "sales@example.com",
    assignedSalesperson: "Jordan Blake",
    assignedEstimator: null,
    customerAccount: "Northbridge Homes (fixture)",
    projectName: "Maple Court Kitchen",
    projectAddress: "120 Maple Court, Springfield, IL 62704",
    emailSubject: "Quote request — Elite 100 kitchen remodel",
    emailExcerpt:
      "Hi — please quote an Elite 100 kitchen with a standard U-shape. Color Calacatta Mira. Approximate layout attached.",
    attachments: Object.freeze([
      Object.freeze({ id: "att-001a", filename: "maple-court-layout.pdf", contentType: "application/pdf", simulated: true }),
      Object.freeze({ id: "att-001b", filename: "kitchen-photo.jpg", contentType: "image/jpeg", simulated: true })
    ]),
    requestedColor: "Calacatta Mira",
    resolvedPriceGroup: "Group B",
    proposedSquareFootage: null,
    sinkCutoutCount: null,
    edgeProfile: null,
    backsplashScope: null,
    missingInformation: Object.freeze([]),
    aiConfidence: null,
    takeoffState: "not_started",
    quotePreviewState: "none",
    unreadActivityCount: 1,
    internalNotes: "Newly received fixture — awaiting classification.",
    dataSource: "fixture",
    simulatedLabels: Object.freeze(["classification pending", "no measurements yet"]),
    events: Object.freeze([
      Object.freeze({
        id: "evt-001-1",
        at: "2026-07-14T14:20:00.000Z",
        actorType: "system",
        actorLabel: "InboundEmailAdapter (fixture)",
        eventType: "case_created",
        summary: "Fixture case created from synthetic email ingest."
      })
    ])
  }),

  Object.freeze({
    id: "qil-case-002",
    status: "qil_classifying",
    priority: "high",
    receivedAt: "2026-07-14T13:45:00.000Z",
    updatedAt: "2026-07-14T14:50:00.000Z",
    senderName: "Sam Ortiz",
    senderEmail: "sam.ortiz@example.com",
    recipientMailbox: "estimates@example.com",
    assignedSalesperson: "Casey Morgan",
    assignedEstimator: null,
    customerAccount: "Oak & Iron Remodelers (fixture)",
    projectName: "Harbor Lane Island Kitchen",
    projectAddress: "88 Harbor Lane, Madison, WI 53703",
    emailSubject: "Need estimate — kitchen + island (Elite 100)",
    emailExcerpt:
      "Looking for a quick turnaround on Elite 100. Island + perimeter. Prefer Frosted Pearl if available.",
    attachments: Object.freeze([
      Object.freeze({ id: "att-002a", filename: "harbor-lane-plan.pdf", contentType: "application/pdf", simulated: true })
    ]),
    requestedColor: "Frosted Pearl",
    resolvedPriceGroup: null,
    proposedSquareFootage: null,
    sinkCutoutCount: 2,
    edgeProfile: null,
    backsplashScope: "Full height behind range (unconfirmed)",
    missingInformation: Object.freeze(["resolved_price_group", "edge_profile"]),
    aiConfidence: 0.42,
    takeoffState: "not_started",
    quotePreviewState: "none",
    unreadActivityCount: 0,
    internalNotes: "Classifier running (simulated). Island mentioned — expect higher sf.",
    dataSource: "fixture",
    simulatedLabels: Object.freeze(["AI confidence simulated", "price group unresolved"]),
    events: Object.freeze([
      Object.freeze({
        id: "evt-002-1",
        at: "2026-07-14T13:45:00.000Z",
        actorType: "system",
        actorLabel: "system",
        eventType: "case_created",
        summary: "Fixture case received."
      }),
      Object.freeze({
        id: "evt-002-2",
        at: "2026-07-14T14:50:00.000Z",
        actorType: "system",
        actorLabel: "Classifier (simulated)",
        eventType: "status_changed",
        summary: "Status → qil_classifying (simulated)."
      })
    ])
  }),

  Object.freeze({
    id: "qil-case-003",
    status: "qil_takeoff_processing",
    priority: "normal",
    receivedAt: "2026-07-14T11:10:00.000Z",
    updatedAt: "2026-07-14T14:40:00.000Z",
    senderName: "Riley Chen",
    senderEmail: "riley.chen@example.com",
    recipientMailbox: "sales@example.com",
    assignedSalesperson: "Jordan Blake",
    assignedEstimator: null,
    customerAccount: "Lumen Interiors (fixture)",
    projectName: "Cedar Ridge Primary Bath",
    projectAddress: "415 Cedar Ridge Rd, Naperville, IL 60540",
    emailSubject: "Elite 100 vanity tops — please estimate",
    emailExcerpt: "Two vanity runs, one double bowl. Color: Soft Mist. PDF attached.",
    attachments: Object.freeze([
      Object.freeze({ id: "att-003a", filename: "cedar-ridge-vanities.pdf", contentType: "application/pdf", simulated: true })
    ]),
    requestedColor: "Soft Mist",
    resolvedPriceGroup: "Group A",
    proposedSquareFootage: null,
    sinkCutoutCount: 3,
    edgeProfile: "Eased",
    backsplashScope: "4\" backsplash both vanities",
    missingInformation: Object.freeze([]),
    aiConfidence: 0.61,
    takeoffState: "processing_simulated",
    quotePreviewState: "none",
    unreadActivityCount: 0,
    internalNotes: "Takeoff placeholder — Phase 4 will wire TakeoffAdapter. Not a production takeoff job.",
    dataSource: "fixture",
    simulatedLabels: Object.freeze(["takeoff processing simulated", "sf pending"]),
    events: Object.freeze([
      Object.freeze({
        id: "evt-003-1",
        at: "2026-07-14T14:40:00.000Z",
        actorType: "system",
        actorLabel: "TakeoffAdapter (placeholder)",
        eventType: "takeoff_enqueued",
        summary: "Simulated takeoff enqueue — no production API called."
      })
    ])
  }),

  Object.freeze({
    id: "qil-case-004",
    status: "qil_ready_for_review",
    priority: "high",
    receivedAt: "2026-07-13T16:30:00.000Z",
    updatedAt: "2026-07-14T09:15:00.000Z",
    senderName: "Morgan Ellis",
    senderEmail: "morgan.ellis@example.com",
    recipientMailbox: "estimates@example.com",
    assignedSalesperson: "Taylor Reed",
    assignedEstimator: null,
    customerAccount: "Brightpath Builders (fixture)",
    projectName: "Willow Park Kitchen",
    projectAddress: "902 Willow Park Dr, Austin, TX 78745",
    emailSubject: "Elite 100 quote — kitchen with island",
    emailExcerpt:
      "Please quote perimeter + island. Elite 100 Arctic Weave. We need sink cutouts for kitchen + prep.",
    attachments: Object.freeze([
      Object.freeze({ id: "att-004a", filename: "willow-park-plan.pdf", contentType: "application/pdf", simulated: true }),
      Object.freeze({ id: "att-004b", filename: "island-sketch.png", contentType: "image/png", simulated: true })
    ]),
    requestedColor: "Arctic Weave",
    resolvedPriceGroup: "Group C",
    proposedSquareFootage: 62.4,
    sinkCutoutCount: 2,
    edgeProfile: "1/4\" bevel",
    backsplashScope: "4\" along perimeter; none on island",
    missingInformation: Object.freeze([]),
    aiConfidence: 0.88,
    takeoffState: "simulated_complete",
    quotePreviewState: "ready_for_estimator",
    unreadActivityCount: 2,
    internalNotes: "Straightforward Elite 100 kitchen + island. Simulated takeoff complete.",
    dataSource: "fixture",
    simulatedLabels: Object.freeze(["sf simulated", "confidence simulated", "takeoff simulated"]),
    nextAction: "Open review workspace",
    events: Object.freeze([
      Object.freeze({
        id: "evt-004-1",
        at: "2026-07-14T09:15:00.000Z",
        actorType: "system",
        actorLabel: "system",
        eventType: "status_changed",
        summary: "Ready for estimator review (fixture)."
      }),
      Object.freeze({
        id: "evt-004-2",
        at: "2026-07-14T09:12:00.000Z",
        actorType: "system",
        actorLabel: "TakeoffAdapter (simulated)",
        eventType: "takeoff_completed",
        summary: "Simulated takeoff result attached — not from production takeoff tables."
      })
    ])
  }),

  Object.freeze({
    id: "qil-case-005",
    status: "qil_needs_information",
    priority: "urgent",
    receivedAt: "2026-07-13T12:00:00.000Z",
    updatedAt: "2026-07-14T10:05:00.000Z",
    senderName: "Jamie Brooks",
    senderEmail: "jamie.brooks@example.com",
    recipientMailbox: "sales@example.com",
    assignedSalesperson: "Casey Morgan",
    assignedEstimator: "Alex Rivera",
    customerAccount: "Summit Cabinetry (fixture)",
    projectName: "Lakeview Condo Kitchen",
    projectAddress: "2100 Lakeview Ave #1204, Chicago, IL 60614",
    emailSubject: "Quote please — still deciding on color",
    emailExcerpt: "Need an Elite 100 estimate. Not sure on color yet — something light. Measurements in photos.",
    attachments: Object.freeze([
      Object.freeze({ id: "att-005a", filename: "condo-photos.zip", contentType: "application/zip", simulated: true })
    ]),
    requestedColor: null,
    resolvedPriceGroup: null,
    proposedSquareFootage: 41.2,
    sinkCutoutCount: 1,
    edgeProfile: "Eased",
    backsplashScope: "Unknown",
    missingInformation: Object.freeze(["requested_elite_100_color", "resolved_price_group", "backsplash_scope"]),
    aiConfidence: 0.55,
    takeoffState: "simulated_partial",
    quotePreviewState: "blocked_missing_info",
    unreadActivityCount: 1,
    internalNotes: "Missing Elite 100 color — draft follow-up is future Phase 7.",
    dataSource: "fixture",
    simulatedLabels: Object.freeze(["sf simulated", "color missing"]),
    nextAction: "Request missing information (disabled)",
    events: Object.freeze([
      Object.freeze({
        id: "evt-005-1",
        at: "2026-07-14T10:05:00.000Z",
        actorType: "user",
        actorLabel: "Alex Rivera (fixture estimator)",
        eventType: "field_flagged",
        summary: "Marked missing: requested_elite_100_color."
      })
    ])
  }),

  Object.freeze({
    id: "qil-case-006",
    status: "qil_needs_information",
    priority: "normal",
    receivedAt: "2026-07-12T18:40:00.000Z",
    updatedAt: "2026-07-13T21:10:00.000Z",
    senderName: "Drew Patel",
    senderEmail: "drew.patel@example.com",
    recipientMailbox: "estimates@example.com",
    assignedSalesperson: "Taylor Reed",
    assignedEstimator: null,
    customerAccount: "Harborstone LLC (fixture)",
    projectName: "Pinecrest Kitchen Refresh",
    projectAddress: "55 Pinecrest Blvd, Columbus, OH 43215",
    emailSubject: "Elite 100 — Carrara Royale kitchen",
    emailExcerpt: "Color is Carrara Royale. Need quote. Edge preference TBD with homeowner.",
    attachments: Object.freeze([
      Object.freeze({ id: "att-006a", filename: "pinecrest-measure.pdf", contentType: "application/pdf", simulated: true })
    ]),
    requestedColor: "Carrara Royale",
    resolvedPriceGroup: "Group B",
    proposedSquareFootage: 48.0,
    sinkCutoutCount: 1,
    edgeProfile: null,
    backsplashScope: "4\" standard",
    missingInformation: Object.freeze(["edge_profile"]),
    aiConfidence: 0.79,
    takeoffState: "simulated_complete",
    quotePreviewState: "blocked_missing_info",
    unreadActivityCount: 0,
    internalNotes: "Missing edge profile only.",
    dataSource: "fixture",
    simulatedLabels: Object.freeze(["sf simulated", "edge missing"]),
    nextAction: "Request missing information (disabled)",
    events: Object.freeze([
      Object.freeze({
        id: "evt-006-1",
        at: "2026-07-13T21:10:00.000Z",
        actorType: "system",
        actorLabel: "system",
        eventType: "status_changed",
        summary: "Needs information: edge_profile."
      })
    ])
  }),

  Object.freeze({
    id: "qil-case-007",
    status: "qil_needs_manual_takeoff",
    priority: "high",
    receivedAt: "2026-07-12T09:00:00.000Z",
    updatedAt: "2026-07-13T15:30:00.000Z",
    senderName: "Chris Walton",
    senderEmail: "chris.walton@example.com",
    recipientMailbox: "sales@example.com",
    assignedSalesperson: "Jordan Blake",
    assignedEstimator: "Alex Rivera",
    customerAccount: "Fieldstone Homes (fixture)",
    projectName: "Briarwood Spec Kitchen",
    projectAddress: "1700 Briarwood Way, Carmel, IN 46032",
    emailSubject: "Estimate from field sketch — Elite 100",
    emailExcerpt: "Handwritten dimensions on the plan — sorry they're a bit messy. Color Velvet Ash.",
    attachments: Object.freeze([
      Object.freeze({ id: "att-007a", filename: "briarwood-handwritten-plan.pdf", contentType: "application/pdf", simulated: true })
    ]),
    requestedColor: "Velvet Ash",
    resolvedPriceGroup: "Group D",
    proposedSquareFootage: null,
    sinkCutoutCount: null,
    edgeProfile: "Dupont",
    backsplashScope: "None noted",
    missingInformation: Object.freeze(["countertop_measurements", "sink_cutout_count", "total_square_footage"]),
    aiConfidence: 0.22,
    takeoffState: "needs_manual",
    quotePreviewState: "blocked_measurements",
    unreadActivityCount: 3,
    internalNotes: "Unreadable handwritten dimensions — requires manual takeoff (simulated).",
    dataSource: "fixture",
    simulatedLabels: Object.freeze(["measurements unreadable", "confidence simulated low"]),
    nextAction: "Manual takeoff (disabled)",
    events: Object.freeze([
      Object.freeze({
        id: "evt-007-1",
        at: "2026-07-13T15:30:00.000Z",
        actorType: "system",
        actorLabel: "TakeoffAdapter (simulated)",
        eventType: "takeoff_failed_quality",
        summary: "Simulated low-confidence / unreadable plan — routed to manual takeoff."
      })
    ])
  }),

  Object.freeze({
    id: "qil-case-008",
    status: "qil_not_elite_100",
    priority: "low",
    receivedAt: "2026-07-11T14:15:00.000Z",
    updatedAt: "2026-07-11T16:00:00.000Z",
    senderName: "Quinn Harper",
    senderEmail: "quinn.harper@example.com",
    recipientMailbox: "sales@example.com",
    assignedSalesperson: "Casey Morgan",
    assignedEstimator: null,
    customerAccount: "Atelier Custom Stone (fixture)",
    projectName: "Gallery Kitchen — porcelain",
    projectAddress: "44 Atelier Row, Brooklyn, NY 11201",
    emailSubject: "Custom porcelain slab quote request",
    emailExcerpt: "We need a quote on imported porcelain — not Elite 100. Full fabrication scope attached.",
    attachments: Object.freeze([
      Object.freeze({ id: "att-008a", filename: "porcelain-spec.pdf", contentType: "application/pdf", simulated: true })
    ]),
    requestedColor: "Imported porcelain (non–Elite 100)",
    resolvedPriceGroup: null,
    proposedSquareFootage: 70.0,
    sinkCutoutCount: 2,
    edgeProfile: "Miter",
    backsplashScope: "Full height feature wall",
    missingInformation: Object.freeze(["elite_100_program"]),
    aiConfidence: 0.91,
    takeoffState: "not_applicable",
    quotePreviewState: "out_of_scope",
    unreadActivityCount: 0,
    internalNotes: "MVP parks non–Elite 100. Custom Quote Tool is out of scope for this lab.",
    dataSource: "fixture",
    simulatedLabels: Object.freeze(["out of MVP scope", "sf from email claim — simulated"]),
    nextAction: "Route outside lab (disabled)",
    events: Object.freeze([
      Object.freeze({
        id: "evt-008-1",
        at: "2026-07-11T16:00:00.000Z",
        actorType: "system",
        actorLabel: "Classifier (simulated)",
        eventType: "status_changed",
        summary: "Classified as not Elite 100 (fixture)."
      })
    ])
  }),

  Object.freeze({
    id: "qil-case-009",
    status: "qil_in_review",
    priority: "normal",
    receivedAt: "2026-07-11T10:20:00.000Z",
    updatedAt: "2026-07-14T13:00:00.000Z",
    senderName: "Blake Summers",
    senderEmail: "blake.summers@example.com",
    recipientMailbox: "estimates@example.com",
    assignedSalesperson: "Taylor Reed",
    assignedEstimator: "Alex Rivera",
    customerAccount: "Evergreen Realty Staging (fixture)",
    projectName: "Ash Street Spec — revision 2",
    projectAddress: "318 Ash Street, Denver, CO 80205",
    emailSubject: "RE: Elite 100 quote — updated measurements",
    emailExcerpt:
      "Revision to our earlier request (fixture parent qil-case-004 style). Island depth changed — please update.",
    attachments: Object.freeze([
      Object.freeze({ id: "att-009a", filename: "ash-street-rev2.pdf", contentType: "application/pdf", simulated: true })
    ]),
    requestedColor: "Arctic Weave",
    resolvedPriceGroup: "Group C",
    proposedSquareFootage: 64.1,
    sinkCutoutCount: 2,
    edgeProfile: "1/4\" bevel",
    backsplashScope: "4\" perimeter",
    missingInformation: Object.freeze([]),
    aiConfidence: 0.84,
    takeoffState: "simulated_complete",
    quotePreviewState: "in_estimator_review",
    unreadActivityCount: 0,
    internalNotes: "Revision thread fixture. Parent reference: fictional prior case qil-case-004.",
    dataSource: "fixture",
    simulatedLabels: Object.freeze(["revision fixture", "sf simulated"]),
    relatedCaseId: "qil-case-004",
    nextAction: "Continue review (disabled)",
    events: Object.freeze([
      Object.freeze({
        id: "evt-009-1",
        at: "2026-07-14T13:00:00.000Z",
        actorType: "user",
        actorLabel: "Alex Rivera (fixture estimator)",
        eventType: "status_changed",
        summary: "Claimed for review."
      }),
      Object.freeze({
        id: "evt-009-2",
        at: "2026-07-14T12:50:00.000Z",
        actorType: "user",
        actorLabel: "Alex Rivera (fixture estimator)",
        eventType: "field_corrected",
        summary: "Corrected proposed sf 63.8 → 64.1 (simulated AI vs human)."
      })
    ])
  }),

  Object.freeze({
    id: "qil-case-010",
    status: "qil_approved_lab_quote",
    priority: "normal",
    receivedAt: "2026-07-10T15:45:00.000Z",
    updatedAt: "2026-07-13T11:20:00.000Z",
    senderName: "Harper Cole",
    senderEmail: "harper.cole@example.com",
    recipientMailbox: "sales@example.com",
    assignedSalesperson: "Jordan Blake",
    assignedEstimator: "Morgan Lee",
    customerAccount: "Cobalt Design Group (fixture)",
    projectName: "Riverbend Kitchen",
    projectAddress: "9 Riverbend Ct, Des Moines, IA 50309",
    emailSubject: "Elite 100 — Moonstone Kitchen",
    emailExcerpt: "Please proceed with Moonstone, eased edge, single sink, 4\" splash.",
    attachments: Object.freeze([
      Object.freeze({ id: "att-010a", filename: "riverbend.pdf", contentType: "application/pdf", simulated: true })
    ]),
    requestedColor: "Moonstone",
    resolvedPriceGroup: "Group A",
    proposedSquareFootage: 52.75,
    sinkCutoutCount: 1,
    edgeProfile: "Eased",
    backsplashScope: "4\" continuous",
    missingInformation: Object.freeze([]),
    aiConfidence: 0.9,
    takeoffState: "simulated_complete",
    quotePreviewState: "approved_lab",
    unreadActivityCount: 0,
    internalNotes: "Lab quote approved — not a Quote Library / quote_headers record.",
    dataSource: "fixture",
    simulatedLabels: Object.freeze(["lab approval only", "pricing preview not calculated"]),
    nextAction: "Prepare send preview (disabled)",
    events: Object.freeze([
      Object.freeze({
        id: "evt-010-1",
        at: "2026-07-13T11:20:00.000Z",
        actorType: "user",
        actorLabel: "Morgan Lee (fixture estimator)",
        eventType: "lab_quote_approved",
        summary: "Approved lab quote (simulated). No production write."
      })
    ])
  }),

  Object.freeze({
    id: "qil-case-011",
    status: "qil_ready_to_send_lab",
    priority: "normal",
    receivedAt: "2026-07-09T13:00:00.000Z",
    updatedAt: "2026-07-12T17:45:00.000Z",
    senderName: "Evan Brooks",
    senderEmail: "evan.brooks@example.com",
    recipientMailbox: "estimates@example.com",
    assignedSalesperson: "Casey Morgan",
    assignedEstimator: "Morgan Lee",
    customerAccount: "Northstar Properties (fixture)",
    projectName: "Garden District Duplex — Unit A",
    projectAddress: "601 Garden District, New Orleans, LA 70116",
    emailSubject: "Elite 100 quote needed for Unit A kitchen",
    emailExcerpt: "Color Ivory Dust, Group Promo if available. Double sink + cooktop cutout.",
    attachments: Object.freeze([
      Object.freeze({ id: "att-011a", filename: "unit-a.pdf", contentType: "application/pdf", simulated: true })
    ]),
    requestedColor: "Ivory Dust",
    resolvedPriceGroup: "Group Promo",
    proposedSquareFootage: 58.2,
    sinkCutoutCount: 2,
    edgeProfile: "Demilune",
    backsplashScope: "4\" + range to hood",
    missingInformation: Object.freeze([]),
    aiConfidence: 0.86,
    takeoffState: "simulated_complete",
    quotePreviewState: "ready_to_send_lab",
    unreadActivityCount: 0,
    internalNotes: "Communication preview ready — send remains simulated-only in later phases.",
    dataSource: "fixture",
    simulatedLabels: Object.freeze(["ready to send lab only", "no Resend/Outlook"]),
    nextAction: "Send response (disabled)",
    events: Object.freeze([
      Object.freeze({
        id: "evt-011-1",
        at: "2026-07-12T17:45:00.000Z",
        actorType: "system",
        actorLabel: "EmailDeliveryAdapter (placeholder)",
        eventType: "status_changed",
        summary: "Marked ready_to_send_lab — live send not implemented."
      })
    ])
  }),

  Object.freeze({
    id: "qil-case-012",
    status: "qil_sent_simulated",
    priority: "low",
    receivedAt: "2026-07-08T11:30:00.000Z",
    updatedAt: "2026-07-11T09:00:00.000Z",
    senderName: "Nina Alvarez",
    senderEmail: "nina.alvarez@example.com",
    recipientMailbox: "sales@example.com",
    assignedSalesperson: "Taylor Reed",
    assignedEstimator: "Alex Rivera",
    customerAccount: "Copperline Contractors (fixture)",
    projectName: "Station House Kitchen",
    projectAddress: "22 Station House Rd, Portland, OR 97205",
    emailSubject: "Thanks — Elite 100 quote request",
    emailExcerpt: "Confirming we received your lab estimate preview (fixture simulation).",
    attachments: Object.freeze([
      Object.freeze({ id: "att-012a", filename: "station-house.pdf", contentType: "application/pdf", simulated: true })
    ]),
    requestedColor: "Slate Veil",
    resolvedPriceGroup: "Group E",
    proposedSquareFootage: 55.0,
    sinkCutoutCount: 1,
    edgeProfile: "Eased",
    backsplashScope: "None",
    missingInformation: Object.freeze([]),
    aiConfidence: 0.87,
    takeoffState: "simulated_complete",
    quotePreviewState: "sent_simulated",
    unreadActivityCount: 0,
    internalNotes: "Outbound was simulated only. No customer email was sent.",
    dataSource: "fixture",
    simulatedLabels: Object.freeze(["sent_simulated", "not a real delivery"]),
    nextAction: "—",
    events: Object.freeze([
      Object.freeze({
        id: "evt-012-1",
        at: "2026-07-11T09:00:00.000Z",
        actorType: "system",
        actorLabel: "EmailDeliveryAdapter (simulated)",
        eventType: "send_simulated",
        summary: "Recorded simulated send — Resend/Graph not called."
      })
    ])
  }),

  Object.freeze({
    id: "qil-case-013",
    status: "qil_failed",
    priority: "urgent",
    receivedAt: "2026-07-14T08:05:00.000Z",
    updatedAt: "2026-07-14T08:25:00.000Z",
    senderName: "Pat Romero",
    senderEmail: "pat.romero@example.com",
    recipientMailbox: "estimates@example.com",
    assignedSalesperson: "Jordan Blake",
    assignedEstimator: null,
    customerAccount: "Lakeside Cabinets (fixture)",
    projectName: "Corrupted attachment test",
    projectAddress: "1 Lakeside Dr, Minneapolis, MN 55401",
    emailSubject: "Quote — Elite 100 attachment issue",
    emailExcerpt: "Plan should be attached — please confirm you can open it.",
    attachments: Object.freeze([
      Object.freeze({ id: "att-013a", filename: "corrupt-plan.bin", contentType: "application/octet-stream", simulated: true })
    ]),
    requestedColor: "Calacatta Mira",
    resolvedPriceGroup: "Group B",
    proposedSquareFootage: null,
    sinkCutoutCount: null,
    edgeProfile: null,
    backsplashScope: null,
    missingInformation: Object.freeze(["readable_plan_attachment"]),
    aiConfidence: null,
    takeoffState: "failed_simulated",
    quotePreviewState: "none",
    unreadActivityCount: 1,
    internalNotes: "Fixture failure path — attachment processing error simulated.",
    dataSource: "fixture",
    simulatedLabels: Object.freeze(["processing failed", "fixture error path"]),
    nextAction: "Retry processing (disabled)",
    events: Object.freeze([
      Object.freeze({
        id: "evt-013-1",
        at: "2026-07-14T08:25:00.000Z",
        actorType: "system",
        actorLabel: "system",
        eventType: "processing_failed",
        summary: "Simulated failure: unreadable attachment."
      })
    ])
  }),

  Object.freeze({
    id: "qil-case-014",
    status: "qil_processing_attachments",
    priority: "normal",
    receivedAt: "2026-07-14T14:55:00.000Z",
    updatedAt: "2026-07-14T14:58:00.000Z",
    senderName: "Skylar James",
    senderEmail: "skylar.james@example.com",
    recipientMailbox: "sales@example.com",
    assignedSalesperson: "Casey Morgan",
    assignedEstimator: null,
    customerAccount: "Westfield Kitchen Co (fixture)",
    projectName: "Multi-cutout chef kitchen",
    projectAddress: "400 Westfield Pkwy, Raleigh, NC 27607",
    emailSubject: "Elite 100 — chef kitchen with multiple sinks",
    emailExcerpt: "Main sink, prep sink, and bar sink. Color Tempest White. Several PDFs attached.",
    attachments: Object.freeze([
      Object.freeze({ id: "att-014a", filename: "chef-kitchen-p1.pdf", contentType: "application/pdf", simulated: true }),
      Object.freeze({ id: "att-014b", filename: "chef-kitchen-p2.pdf", contentType: "application/pdf", simulated: true }),
      Object.freeze({ id: "att-014c", filename: "sink-schedule.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", simulated: true })
    ]),
    requestedColor: "Tempest White",
    resolvedPriceGroup: null,
    proposedSquareFootage: null,
    sinkCutoutCount: 3,
    edgeProfile: "Half bullnose",
    backsplashScope: "To be confirmed from plan",
    missingInformation: Object.freeze(["resolved_price_group"]),
    aiConfidence: 0.35,
    takeoffState: "awaiting_attachments",
    quotePreviewState: "none",
    unreadActivityCount: 0,
    internalNotes: "Multiple sink cutouts fixture — still extracting attachments (simulated).",
    dataSource: "fixture",
    simulatedLabels: Object.freeze(["attachment processing simulated", "price group unresolved"]),
    events: Object.freeze([
      Object.freeze({
        id: "evt-014-1",
        at: "2026-07-14T14:58:00.000Z",
        actorType: "system",
        actorLabel: "system",
        eventType: "status_changed",
        summary: "Processing attachments (simulated)."
      })
    ])
  })
]);

/**
 * Lab takeoff (Phase 4B+) requires plan MIME + sizeBytes + SHA-256 metadata.
 * Fixtures never store attachment bytes — hashes are synthetic only.
 */
function withPlanAttachmentMetadata(caseRow) {
  const attachments = (caseRow.attachments ?? []).map((att, index) => {
    const mime = String(att.contentType ?? "").toLowerCase();
    const planLike =
      mime === "application/pdf" ||
      mime === "image/jpeg" ||
      mime === "image/png" ||
      mime === "image/webp";
    if (!planLike) return att;
    if (att.contentHash && Number(att.sizeBytes) > 0) return att;
    // Deterministic pseudo-hash from attachment id (not a real file digest).
    const seed = String(att.id || `${caseRow.id}-${index}`);
    let h = "";
    for (let i = 0; i < 64; i++) {
      h += ((seed.charCodeAt(i % seed.length) + i * 17) % 16).toString(16);
    }
    return {
      ...att,
      sizeBytes: att.sizeBytes ?? 2048 + index * 64,
      contentHash: att.contentHash ?? h,
      source: att.source ?? "synthetic_fixture",
      localOnly: att.localOnly ?? true
    };
  });
  return { ...caseRow, attachments };
}

export function getFixtureCases() {
  return QUOTE_INTAKE_FIXTURE_CASES.map(withPlanAttachmentMetadata);
}
