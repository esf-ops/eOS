import type { ChartData } from "./chartTypes";

/**
 * Elite starter org chart (v1 planning demo).
 * Keep aligned with `backend-core/src/orgDirectory/orgDirectoryStarter.js`.
 *
 * Relationship convention (matches `chartUtils.ts`):
 * - `fromSeatId` = report / child seat
 * - `toSeatId` = manager / parent seat
 */
export function buildEliteStarterChartData(): ChartData {
  const departments = [
    { id: "dept_owner", name: "Leadership", color: "#1e3a5f", sortOrder: 1 },
    { id: "dept_gtm", name: "Go-to-Market", color: "#2563eb", sortOrder: 2 },
    { id: "dept_ops", name: "Operations", color: "#059669", sortOrder: 3 },
    { id: "dept_install", name: "Install & Production", color: "#d97706", sortOrder: 4 },
    { id: "dept_partner", name: "Partnerships", color: "#7c3aed", sortOrder: 5 }
  ];

  const seats = [
    {
      id: "seat_eric",
      personName: "Eric Krob",
      title: "Owner",
      departmentId: "dept_owner",
      branch: "Company",
      status: "filled" as const,
      notes: "",
      recommendedHeads: ["executive", "reports"]
    },
    {
      id: "seat_chris",
      personName: "Chris Henely",
      title: "Strategic Operations",
      departmentId: "dept_ops",
      branch: "Dyersville",
      status: "filled" as const,
      notes: "Dyersville lane leadership",
      recommendedHeads: ["executive", "brain_health", "system_admin"]
    },
    {
      id: "seat_marshal",
      personName: "Marshal",
      title: "Go-to-Market Lead",
      departmentId: "dept_gtm",
      branch: "Company",
      status: "filled" as const,
      notes: "",
      recommendedHeads: ["sales", "quote", "quote_library"]
    },
    {
      id: "seat_adam",
      personName: "Adam Jennett",
      title: "Iowa City Branch",
      departmentId: "dept_gtm",
      branch: "Iowa City",
      status: "filled" as const,
      notes: "",
      recommendedHeads: ["sales", "quote_library"]
    },
    {
      id: "seat_george",
      personName: "George Robinson",
      title: "Install / Shop / Production",
      departmentId: "dept_install",
      branch: "Company",
      status: "filled" as const,
      notes: "",
      recommendedHeads: ["production", "shop_tv", "install"]
    },
    {
      id: "seat_dean",
      personName: "Dean Happel",
      title: "Fox Partnership Advisor",
      departmentId: "dept_partner",
      branch: "Fox",
      status: "advisor" as const,
      notes: "Partner / advisory context",
      recommendedHeads: []
    },
    {
      id: "seat_open_estimator",
      personName: "",
      title: "Estimator (Open)",
      departmentId: "dept_gtm",
      branch: "Dyersville",
      status: "open" as const,
      notes: "Future hire",
      recommendedHeads: ["quote", "quote_library"]
    },
    {
      id: "seat_open_ops",
      personName: "",
      title: "Production Manager (Open)",
      departmentId: "dept_install",
      branch: "Dyersville",
      status: "future" as const,
      notes: "",
      recommendedHeads: ["production", "shop_tv"]
    }
  ];

  const relationships = [
    { id: "rel_1", fromSeatId: "seat_chris", toSeatId: "seat_eric", type: "direct" as const, label: "" },
    { id: "rel_2", fromSeatId: "seat_marshal", toSeatId: "seat_eric", type: "direct" as const, label: "" },
    { id: "rel_3", fromSeatId: "seat_adam", toSeatId: "seat_marshal", type: "direct" as const, label: "" },
    { id: "rel_4", fromSeatId: "seat_george", toSeatId: "seat_chris", type: "direct" as const, label: "" },
    { id: "rel_5", fromSeatId: "seat_dean", toSeatId: "seat_eric", type: "partner_context" as const, label: "Fox workflow" },
    { id: "rel_6", fromSeatId: "seat_open_estimator", toSeatId: "seat_marshal", type: "direct" as const, label: "" },
    { id: "rel_7", fromSeatId: "seat_open_ops", toSeatId: "seat_george", type: "dotted" as const, label: "Future dotted line" }
  ];

  return { departments, seats, relationships };
}
