/**
 * Build calculate/submit bodies for partner-quote APIs.
 * Totals always come from backend responses — never computed here for authority.
 */

export const PARTNER_MATERIAL_GROUPS = [
  "Group Promo",
  "Group A",
  "Group B",
  "Group C",
  "Group D",
  "Group E",
  "Group F"
] as const;

export type PartnerFormState = {
  customerName: string;
  projectName: string;
  projectAddress: string;
  city: string;
  state: string;
  zip: string;
  roomName: string;
  measurementMode: "manual" | "simple_runs";
  countertopSf: string;
  backsplashSf: string;
  runLengthIn: string;
  runDepthIn: string;
  materialGroup: string;
  notes: string;
};

export function defaultFormState(): PartnerFormState {
  return {
    customerName: "",
    projectName: "",
    projectAddress: "",
    city: "",
    state: "",
    zip: "",
    roomName: "Main area",
    measurementMode: "manual",
    countertopSf: "",
    backsplashSf: "",
    runLengthIn: "",
    runDepthIn: "",
    materialGroup: "Group B",
    notes: ""
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Simple run SF: length × depth / 144 (no corner logic in v1 shell). */
function sqftFromRun(lengthIn: number, depthIn: number): number {
  if (lengthIn <= 0 || depthIn <= 0) return 0;
  return round2((lengthIn * depthIn) / 144);
}

export function buildPartnerQuotePayload(form: PartnerFormState): Record<string, unknown> {
  let countertop = Number(form.countertopSf) || 0;
  let backsplash = Number(form.backsplashSf) || 0;
  if (form.measurementMode === "simple_runs") {
    const len = Number(form.runLengthIn) || 0;
    const dep = Number(form.runDepthIn) || 0;
    countertop = sqftFromRun(len, dep);
    backsplash = 0;
  }
  const roomName = String(form.roomName || "Main area").trim() || "Main area";
  const materialGroup = String(form.materialGroup || "Group B").trim();
  return {
    engine: "rooms",
    materialGroup,
    customer_name: form.customerName.trim() || null,
    project_name: form.projectName.trim() || null,
    project_address: form.projectAddress.trim() || null,
    city: form.city.trim() || null,
    state: form.state.trim() || null,
    zip: form.zip.trim() || null,
    notes: form.notes.trim() || null,
    rooms: [
      {
        name: roomName,
        materialGroup,
        countertopSqft: round2(countertop),
        backsplashSqft: round2(backsplash),
        calcMode: "Manual Sq Ft"
      }
    ]
  };
}

export function partnerContextQuery(partnerAccountId: string | null): string {
  const id = String(partnerAccountId || "").trim();
  return id ? `?partnerAccountId=${encodeURIComponent(id)}` : "";
}

export function partnerBodyExtras(partnerAccountId: string | null): Record<string, unknown> {
  const id = String(partnerAccountId || "").trim();
  return id ? { partnerAccountId: id } : {};
}
