/**
 * Demo/starter org chart for Elite Stone Fabrication — not production business logic.
 */

export function buildEliteStarterChartData() {
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
      status: "filled",
      notes: "",
      recommendedHeads: ["executive", "reports"]
    },
    {
      id: "seat_struct_advisory",
      personName: "",
      title: "Advisory Board / Partner Advisors",
      departmentId: "dept_owner",
      branch: "",
      status: "structural",
      notes: "Planning group — not an employee seat",
      recommendedHeads: []
    },
    {
      id: "seat_struct_ops",
      personName: "",
      title: "Operating Leadership",
      departmentId: "dept_owner",
      branch: "",
      status: "structural",
      notes: "Operating leadership lane",
      recommendedHeads: []
    },
    {
      id: "seat_dean",
      personName: "Dean Happel",
      title: "Fox Partnership Advisor",
      departmentId: "dept_partner",
      branch: "Fox",
      status: "advisor",
      notes: "Advisory context — not a separate employee record",
      recommendedHeads: []
    },
    {
      id: "seat_chris",
      personName: "Chris Henely",
      title: "Strategic Operations",
      departmentId: "dept_ops",
      branch: "Dyersville",
      status: "filled",
      notes: "Dyersville lane leadership",
      recommendedHeads: ["executive", "brain_health", "system_admin"]
    },
    {
      id: "seat_marshal",
      personName: "Marshal",
      title: "Go-to-Market Lead",
      departmentId: "dept_gtm",
      branch: "Company",
      status: "filled",
      notes: "",
      recommendedHeads: ["sales", "quote", "quote_library"]
    },
    {
      id: "seat_adam",
      personName: "Adam Jennett",
      title: "Iowa City Branch",
      departmentId: "dept_gtm",
      branch: "Iowa City",
      status: "filled",
      notes: "",
      recommendedHeads: ["sales", "quote_library"]
    },
    {
      id: "seat_george",
      personName: "George Robinson",
      title: "Install / Shop / Production",
      departmentId: "dept_install",
      branch: "Company",
      status: "filled",
      notes: "",
      recommendedHeads: ["production", "shop_tv", "install"]
    },
    {
      id: "seat_open_estimator",
      personName: "",
      title: "Estimator (Open)",
      departmentId: "dept_gtm",
      branch: "Dyersville",
      status: "open",
      notes: "Future hire",
      recommendedHeads: ["quote", "quote_library"]
    },
    {
      id: "seat_open_ops",
      personName: "",
      title: "Production Manager (Open)",
      departmentId: "dept_install",
      branch: "Dyersville",
      status: "future",
      notes: "",
      recommendedHeads: ["production", "shop_tv"]
    }
  ];

  const relationships = [
    { id: "rel_1", fromSeatId: "seat_struct_advisory", toSeatId: "seat_eric", type: "direct", label: "" },
    { id: "rel_2", fromSeatId: "seat_struct_ops", toSeatId: "seat_eric", type: "direct", label: "" },
    { id: "rel_3", fromSeatId: "seat_dean", toSeatId: "seat_struct_advisory", type: "direct", label: "" },
    { id: "rel_4", fromSeatId: "seat_chris", toSeatId: "seat_struct_ops", type: "direct", label: "" },
    { id: "rel_5", fromSeatId: "seat_marshal", toSeatId: "seat_struct_ops", type: "direct", label: "" },
    { id: "rel_6", fromSeatId: "seat_adam", toSeatId: "seat_marshal", type: "direct", label: "" },
    { id: "rel_7", fromSeatId: "seat_george", toSeatId: "seat_chris", type: "direct", label: "" },
    { id: "rel_8", fromSeatId: "seat_open_estimator", toSeatId: "seat_marshal", type: "direct", label: "" },
    { id: "rel_9", fromSeatId: "seat_open_ops", toSeatId: "seat_george", type: "dotted", label: "" },
    { id: "rel_10", fromSeatId: "seat_adam", toSeatId: "seat_struct_advisory", type: "advisory", label: "" },
    { id: "rel_11", fromSeatId: "seat_george", toSeatId: "seat_struct_advisory", type: "advisory", label: "" }
  ];

  return { departments, seats, relationships };
}
