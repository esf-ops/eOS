export type RelationshipType = "direct" | "dotted" | "advisory" | "partner_context";
export type SeatStatus = "filled" | "open" | "future" | "advisor";

export type Department = {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
};

export type Seat = {
  id: string;
  personName: string;
  title: string;
  departmentId: string | null;
  branch: string;
  status: SeatStatus;
  notes: string;
  recommendedHeads: string[];
};

export type Relationship = {
  id: string;
  fromSeatId: string;
  toSeatId: string;
  type: RelationshipType;
  label: string;
};

export type ChartData = {
  departments: Department[];
  seats: Seat[];
  relationships: Relationship[];
};

export const RECOMMENDED_HEAD_OPTIONS = [
  { slug: "home", label: "Home" },
  { slug: "system_admin", label: "System Admin" },
  { slug: "quote", label: "Internal Estimate" },
  { slug: "quote_library", label: "Quote Library" },
  { slug: "pricing_admin", label: "Pricing Admin" },
  { slug: "sales", label: "Sales" },
  { slug: "brain_health", label: "Brain Health" },
  { slug: "executive", label: "Executive" },
  { slug: "production", label: "Production Flow" },
  { slug: "shop_tv", label: "Shop Floor TV" },
  { slug: "install", label: "Install" },
  { slug: "purchasing", label: "Purchasing" },
  { slug: "customer_service", label: "Customer Service" },
  { slug: "finance", label: "Accounting / Finance" },
  { slug: "reports", label: "Reports" },
  { slug: "hr", label: "Training / HR (future)" }
] as const;

export const MORAWARE_PLANNING_NOTE = "Moraware Admin lives in System Admin today — list as planning reference only.";
