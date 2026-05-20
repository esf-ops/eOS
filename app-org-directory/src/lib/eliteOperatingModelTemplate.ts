import type { ChartData, Department, Relationship, Seat } from "./chartTypes";
import { layoutOperatingModelPositions } from "./eliteOperatingModelLayout";

const D = {
  leadership: "dept_eom_leadership",
  advisory: "dept_eom_advisory",
  operating: "dept_eom_operating",
  sales: "dept_eom_sales",
  production: "dept_eom_production",
  bizops: "dept_eom_bizops",
  finance: "dept_eom_finance",
  purchasing: "dept_eom_purchasing",
  programming: "dept_eom_programming",
  custsvc: "dept_eom_custsvc",
  people: "dept_eom_people",
  systems: "dept_eom_systems",
  dyersville: "dept_eom_dyersville",
  iowacity: "dept_eom_iowacity",
  lisbon: "dept_eom_lisbon",
  fox: "dept_eom_fox"
} as const;

function departments(): Department[] {
  return [
    { id: D.leadership, name: "Leadership", color: "#1e3a5f", sortOrder: 1 },
    { id: D.advisory, name: "Advisory / Partner Context", color: "#7c3aed", sortOrder: 2 },
    { id: D.operating, name: "Operating Leadership", color: "#0f766e", sortOrder: 3 },
    { id: D.sales, name: "Sales / Revenue", color: "#2563eb", sortOrder: 4 },
    { id: D.production, name: "Production / Operations", color: "#d97706", sortOrder: 5 },
    { id: D.bizops, name: "Business Operations / Admin", color: "#64748b", sortOrder: 6 },
    { id: D.finance, name: "Finance / Accounting", color: "#059669", sortOrder: 7 },
    { id: D.purchasing, name: "Purchasing / Materials", color: "#ca8a04", sortOrder: 8 },
    { id: D.programming, name: "Programming / CAD", color: "#0891b2", sortOrder: 9 },
    { id: D.custsvc, name: "Customer Service / Project Coordination", color: "#db2777", sortOrder: 10 },
    { id: D.people, name: "People / Training / Safety", color: "#dc2626", sortOrder: 11 },
    { id: D.systems, name: "Strategic Systems / eliteOS", color: "#4f46e5", sortOrder: 12 },
    { id: D.dyersville, name: "Dyersville", color: "#475569", sortOrder: 13 },
    { id: D.iowacity, name: "Iowa City", color: "#475569", sortOrder: 14 },
    { id: D.lisbon, name: "Lisbon", color: "#475569", sortOrder: 15 },
    { id: D.fox, name: "Fox Partnership", color: "#9333ea", sortOrder: 16 }
  ];
}

function structural(id: string, title: string, departmentId: string, notes: string): Seat {
  return {
    id,
    personName: "",
    title,
    departmentId,
    branch: "",
    status: "structural",
    notes,
    recommendedHeads: []
  };
}

function filled(
  id: string,
  personName: string,
  title: string,
  departmentId: string,
  branch: string,
  recommendedHeads: string[],
  notes = ""
): Seat {
  return {
    id,
    personName,
    title,
    departmentId,
    branch,
    status: "filled",
    notes,
    recommendedHeads
  };
}

function advisor(id: string, personName: string, title: string, departmentId: string, branch: string, notes: string): Seat {
  return {
    id,
    personName,
    title,
    departmentId,
    branch,
    status: "advisor",
    notes,
    recommendedHeads: []
  };
}

function placeholder(id: string, title: string, departmentId: string, branch = ""): Seat {
  return {
    id,
    personName: "",
    title,
    departmentId,
    branch,
    status: "open",
    notes: "Planning placeholder — assign when ready",
    recommendedHeads: []
  };
}

function futureRole(id: string, title: string, departmentId: string, branch = ""): Seat {
  return {
    id,
    personName: "",
    title,
    departmentId,
    branch,
    status: "future",
    notes: "Future role — planning only",
    recommendedHeads: []
  };
}

function direct(from: string, to: string, id: string): Relationship {
  return { id, fromSeatId: from, toSeatId: to, type: "direct", label: "" };
}

/**
 * Elite operating model template — planning starting point only.
 * Not HR truth, ownership, payroll, or permissions.
 */
export function buildEliteOperatingModelTemplate(): ChartData {
  const seats: Seat[] = [
    filled("seat_eom_eric", "Eric Krob", "Owner", D.leadership, "Company", ["executive", "reports"]),

    structural(
      "seat_eom_advisory",
      "Advisory Board / Partner Advisors",
      D.advisory,
      "Advisory and partner context — not day-to-day operating management"
    ),
    advisor(
      "seat_eom_dean_adv",
      "Dean Happel",
      "Fox Partnership / Partner Advisor Context",
      D.fox,
      "Fox",
      "Advisory context — not a separate employee record"
    ),
    advisor(
      "seat_eom_adam_adv",
      "Adam Jennett",
      "Iowa City / Partner Advisor Context",
      D.iowacity,
      "Iowa City",
      "Advisory context — not a separate employee record"
    ),
    advisor(
      "seat_eom_george_adv",
      "George Robinson",
      "Shop / Install / Partner Advisor Context",
      D.advisory,
      "Company",
      "Advisory context — not a separate employee record"
    ),

    structural("seat_eom_ops", "Operating Leadership", D.operating, "Main operating branch under the owner"),

    structural("seat_eom_bucket_sales", "Sales / Revenue", D.sales, ""),
    filled(
      "seat_eom_chris",
      "Chris Henely",
      "Strategic Operations / Dyersville",
      D.dyersville,
      "Dyersville",
      ["executive", "brain_health", "system_admin"]
    ),
    filled(
      "seat_eom_marshal",
      "Marshal Tolly",
      "Go-to-Market / Sales & Partnerships",
      D.sales,
      "Company",
      ["sales", "quote", "quote_library"]
    ),
    filled(
      "seat_eom_adam_ops",
      "Adam Jennett",
      "Iowa City Branch",
      D.iowacity,
      "Iowa City",
      ["sales", "quote_library"]
    ),
    structural("seat_eom_sales_exec", "Sales Executives", D.sales, "Group lane for sales leadership"),
    structural("seat_eom_inside_sales", "Inside Sales", D.sales, "Group lane for inside sales"),
    placeholder("seat_eom_estimating", "Estimating / Quote Support", D.sales, "Dyersville"),

    structural("seat_eom_bucket_production", "Production / Operations", D.production, ""),
    filled(
      "seat_eom_george_ops",
      "George Robinson",
      "Install / Shop / Production",
      D.production,
      "Company",
      ["production", "shop_tv", "install"]
    ),
    structural("seat_eom_shop", "Shop / Fabrication", D.production, ""),
    structural("seat_eom_install_lane", "Install / Field Operations", D.production, ""),
    structural("seat_eom_template_lane", "Template", D.production, ""),
    structural("seat_eom_quality", "Quality / Rework", D.production, ""),
    futureRole("seat_eom_prod_mgr", "Production Manager (Open)", D.production, "Dyersville"),

    structural("seat_eom_bucket_bizops", "Business Operations / Admin", D.bizops, ""),
    placeholder("seat_eom_office_admin", "Office Admin / Executive Support", D.bizops),
    placeholder("seat_eom_scheduling", "Scheduling / Coordination", D.bizops),
    placeholder("seat_eom_gen_admin", "General Administration", D.bizops),

    structural("seat_eom_bucket_finance", "Finance / Accounting", D.finance, ""),
    placeholder("seat_eom_accounting", "Accounting", D.finance),
    placeholder("seat_eom_billing", "Billing / Collections", D.finance),
    placeholder("seat_eom_payroll_prep", "Payroll Prep / Finance Support", D.finance),

    structural("seat_eom_bucket_purchasing", "Purchasing / Materials", D.purchasing, ""),
    placeholder("seat_eom_purchasing", "Purchasing / Material Readiness", D.purchasing),
    placeholder("seat_eom_inventory", "Inventory / Slab Coordination", D.purchasing),
    placeholder("seat_eom_vendor", "Vendor Coordination", D.purchasing),

    structural("seat_eom_bucket_programming", "Programming / CAD", D.programming, ""),
    placeholder("seat_eom_cad", "CAD / Layout", D.programming),
    placeholder("seat_eom_saw", "Saw / Titan Programming", D.programming),
    placeholder("seat_eom_job_packet", "Job Packet Readiness", D.programming),

    structural("seat_eom_bucket_custsvc", "Customer Service / Project Coordination", D.custsvc, ""),
    placeholder("seat_eom_customer_comm", "Customer Communication", D.custsvc),
    placeholder("seat_eom_service", "Service / Warranty Intake", D.custsvc),
    placeholder("seat_eom_project_coord", "Project Coordination", D.custsvc),

    structural("seat_eom_bucket_people", "People / Training / Safety", D.people, ""),
    placeholder("seat_eom_training", "Training / SOPs", D.people),
    placeholder("seat_eom_safety", "Safety / Compliance", D.people),
    placeholder("seat_eom_hiring", "Hiring / Onboarding", D.people),

    structural("seat_eom_bucket_systems", "Strategic Systems / eliteOS", D.systems, ""),
    placeholder("seat_eom_systems_role", "Systems / Process (Open)", D.systems, "Company")
  ];

  const relationships: Relationship[] = [
    direct("seat_eom_advisory", "seat_eom_eric", "rel_eom_1"),
    direct("seat_eom_ops", "seat_eom_eric", "rel_eom_2"),
    direct("seat_eom_dean_adv", "seat_eom_advisory", "rel_eom_3"),
    direct("seat_eom_adam_adv", "seat_eom_advisory", "rel_eom_4"),
    direct("seat_eom_george_adv", "seat_eom_advisory", "rel_eom_5"),

    direct("seat_eom_bucket_sales", "seat_eom_ops", "rel_eom_10"),
    direct("seat_eom_bucket_production", "seat_eom_ops", "rel_eom_11"),
    direct("seat_eom_bucket_bizops", "seat_eom_ops", "rel_eom_12"),
    direct("seat_eom_bucket_finance", "seat_eom_ops", "rel_eom_13"),
    direct("seat_eom_bucket_purchasing", "seat_eom_ops", "rel_eom_14"),
    direct("seat_eom_bucket_programming", "seat_eom_ops", "rel_eom_15"),
    direct("seat_eom_bucket_custsvc", "seat_eom_ops", "rel_eom_16"),
    direct("seat_eom_bucket_people", "seat_eom_ops", "rel_eom_17"),
    direct("seat_eom_bucket_systems", "seat_eom_ops", "rel_eom_18"),

    direct("seat_eom_chris", "seat_eom_bucket_sales", "rel_eom_20"),
    direct("seat_eom_marshal", "seat_eom_bucket_sales", "rel_eom_21"),
    direct("seat_eom_adam_ops", "seat_eom_bucket_sales", "rel_eom_21b"),
    direct("seat_eom_sales_exec", "seat_eom_bucket_sales", "rel_eom_22"),
    direct("seat_eom_inside_sales", "seat_eom_bucket_sales", "rel_eom_23"),
    direct("seat_eom_estimating", "seat_eom_bucket_sales", "rel_eom_24"),

    direct("seat_eom_george_ops", "seat_eom_bucket_production", "rel_eom_30"),
    direct("seat_eom_shop", "seat_eom_bucket_production", "rel_eom_31"),
    direct("seat_eom_install_lane", "seat_eom_bucket_production", "rel_eom_32"),
    direct("seat_eom_template_lane", "seat_eom_bucket_production", "rel_eom_33"),
    direct("seat_eom_quality", "seat_eom_bucket_production", "rel_eom_34"),
    direct("seat_eom_prod_mgr", "seat_eom_george_ops", "rel_eom_35"),

    direct("seat_eom_office_admin", "seat_eom_bucket_bizops", "rel_eom_40"),
    direct("seat_eom_scheduling", "seat_eom_bucket_bizops", "rel_eom_41"),
    direct("seat_eom_gen_admin", "seat_eom_bucket_bizops", "rel_eom_42"),

    direct("seat_eom_accounting", "seat_eom_bucket_finance", "rel_eom_50"),
    direct("seat_eom_billing", "seat_eom_bucket_finance", "rel_eom_51"),
    direct("seat_eom_payroll_prep", "seat_eom_bucket_finance", "rel_eom_52"),

    direct("seat_eom_purchasing", "seat_eom_bucket_purchasing", "rel_eom_60"),
    direct("seat_eom_inventory", "seat_eom_bucket_purchasing", "rel_eom_61"),
    direct("seat_eom_vendor", "seat_eom_bucket_purchasing", "rel_eom_62"),

    direct("seat_eom_cad", "seat_eom_bucket_programming", "rel_eom_70"),
    direct("seat_eom_saw", "seat_eom_bucket_programming", "rel_eom_71"),
    direct("seat_eom_job_packet", "seat_eom_bucket_programming", "rel_eom_72"),

    direct("seat_eom_customer_comm", "seat_eom_bucket_custsvc", "rel_eom_80"),
    direct("seat_eom_service", "seat_eom_bucket_custsvc", "rel_eom_81"),
    direct("seat_eom_project_coord", "seat_eom_bucket_custsvc", "rel_eom_82"),

    direct("seat_eom_training", "seat_eom_bucket_people", "rel_eom_90"),
    direct("seat_eom_safety", "seat_eom_bucket_people", "rel_eom_91"),
    direct("seat_eom_hiring", "seat_eom_bucket_people", "rel_eom_92"),

    direct("seat_eom_systems_role", "seat_eom_bucket_systems", "rel_eom_100")
  ];

  const chart: ChartData = {
    departments: departments(),
    seats,
    relationships,
    layout: { nodePositions: {} }
  };

  chart.layout = { nodePositions: layoutOperatingModelPositions(chart) };
  return chart;
}
