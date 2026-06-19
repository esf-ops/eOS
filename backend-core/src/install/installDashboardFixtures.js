/**
 * Sample install-day payloads for dev/test when Brain Moraware install mapping is incomplete.
 * Clearly labeled via response meta.source = "fixture".
 */

export const FIXTURE_CREWS = Object.freeze([
  {
    id: "truck-1",
    name: "Truck 1",
    truckName: "Truck 1",
    branch: "Dyersville"
  },
  {
    id: "truck-2",
    name: "Truck 2",
    truckName: "Truck 2",
    branch: "Iowa City"
  }
]);

/** @param {string} date @param {string|null} crewId */
export function buildFixtureInstallDay(date, crewId) {
  const crew =
    FIXTURE_CREWS.find((c) => c.id === crewId) ||
    FIXTURE_CREWS[0];

  const jobs = [
    {
      id: "fixture-job-1",
      morawareJobId: "MW-10482",
      scheduledStart: `${date}T08:00:00-05:00`,
      scheduledEnd: `${date}T10:30:00-05:00`,
      sequence: 1,
      customerName: "Anderson Residence",
      accountName: "Anderson Residence",
      jobName: "Kitchen + island",
      status: "Scheduled",
      address: {
        line1: "412 Oak Ridge Dr",
        line2: "",
        city: "Cedar Rapids",
        state: "IA",
        postalCode: "52402",
        latitude: null,
        longitude: null
      },
      mapUrl: "https://maps.google.com/?q=412+Oak+Ridge+Dr+Cedar+Rapids+IA+52402",
      contact: {
        name: "Sarah Anderson",
        phone: "319-555-0142",
        email: "sarah.anderson@example.com"
      },
      scope: {
        sqft: 48,
        rooms: ["Kitchen", "Island"],
        material: "Quartz",
        color: "White Dove",
        edge: "Eased · upgraded miter on island",
        backsplash: "4\" standard",
        sinkNotes: "Blanco Diamond 50/50 · undermount",
        cutoutNotes: "Cooktop cutout · faucet hole",
        waterfall: false,
        fullHeightSplash: false
      },
      notes: ["Verify island overhang with homeowner before template.", "Gate code: 4821"],
      warnings: [],
      riskFlags: []
    },
    {
      id: "fixture-job-2",
      morawareJobId: "MW-10501",
      scheduledStart: `${date}T11:15:00-05:00`,
      scheduledEnd: `${date}T13:00:00-05:00`,
      sequence: 2,
      customerName: "Lincoln Builders — Phase 2",
      accountName: "Lincoln Builders",
      jobName: "Unit 12 bath vanity",
      status: "Scheduled",
      address: {
        line1: "880 Prairie View Ln",
        line2: "Lot 12",
        city: "North Liberty",
        state: "IA",
        postalCode: "52317",
        latitude: null,
        longitude: null
      },
      mapUrl: "https://maps.google.com/?q=880+Prairie+View+Ln+North+Liberty+IA+52317",
      contact: {
        name: "Site super — Mike",
        phone: "319-555-0199",
        email: ""
      },
      scope: {
        sqft: 12,
        rooms: ["Bath"],
        material: "Quartz",
        color: "Classic Gray",
        edge: "Standard eased",
        backsplash: "",
        sinkNotes: "Owner-supplied sink",
        cutoutNotes: "",
        waterfall: false,
        fullHeightSplash: false
      },
      notes: ["Material/color confirmed on PO — verify slab tag on site."],
      warnings: ["Missing contact email"],
      riskFlags: []
    },
    {
      id: "fixture-job-3",
      morawareJobId: "MW-10455",
      scheduledStart: `${date}T14:00:00-05:00`,
      scheduledEnd: null,
      sequence: 3,
      customerName: "Riverfront Condos HOA",
      accountName: "Riverfront Condos HOA",
      jobName: "Club kitchen refresh",
      status: "Scheduled",
      address: {
        line1: "",
        line2: "",
        city: "Iowa City",
        state: "IA",
        postalCode: "",
        latitude: null,
        longitude: null
      },
      mapUrl: "",
      contact: {
        name: "",
        phone: "",
        email: ""
      },
      scope: {
        sqft: null,
        rooms: ["Club kitchen"],
        material: "",
        color: "",
        edge: "",
        backsplash: "",
        sinkNotes: "",
        cutoutNotes: "",
        waterfall: true,
        fullHeightSplash: false
      },
      notes: ["Moraware install activity exists — address/contact pending sync audit."],
      warnings: [
        "Missing address",
        "Missing contact",
        "Missing scheduled end time",
        "Missing sqft",
        "Missing material/color"
      ],
      riskFlags: ["Data audit: incomplete install-day mapping"]
    }
  ];

  return {
    date,
    crew,
    jobs,
    warnings: ["Sample fixture data — not live Moraware schedule"],
    meta: {
      source: "fixture",
      fixtureMode: true
    }
  };
}
