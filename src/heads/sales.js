export const name = "sales_dashboard";

const STATUS_FIELDS_IN_ORDER = ["Status", "JobStatus_1", "JobStatus_2"];
const STATUS_MATCHERS = ["Lead", "Active", "Quote"];

function toNonEmptyString(value) {
  if (typeof value !== "string") return "";
  const s = value.trim();
  return s.length ? s : "";
}

function findMatchedStatus(job) {
  for (const field of STATUS_FIELDS_IN_ORDER) {
    const status = toNonEmptyString(job?.[field]);
    if (!status) continue;
    for (const needle of STATUS_MATCHERS) {
      if (status.toLowerCase().includes(needle.toLowerCase())) return status;
    }
  }
  return "";
}

function fallbackString(value, fallback) {
  const s = toNonEmptyString(value);
  return s || fallback;
}

/**
 * Sales Dashboard Head:
 * Filters normalized jobs for Lead/Active/Quote and returns a clean shape.
 */
export async function process(normalizedData) {
  const jobs = Array.isArray(normalizedData?.jobs) ? normalizedData.jobs : [];

  return jobs
    .map((job) => ({ job, matchedStatus: findMatchedStatus(job) }))
    .filter(({ matchedStatus }) => Boolean(matchedStatus))
    .map(({ job, matchedStatus }) => ({
      Opportunity_Name: fallbackString(job?.JobName, "TBD"),
      Account_ID: fallbackString(job?.AccountId, "TBD"),
      Sales_Rep: fallbackString(job?.Salesperson, "Unassigned"),
      Square_Footage: fallbackString(job?.Total_Square_Footage, "TBD"),
      Material_Color: fallbackString(job?.Material_1_Color, "TBD"),
      Current_Status: fallbackString(matchedStatus, "TBD")
    }));
}

