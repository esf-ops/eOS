/** Report feed contracts — versioned integration metadata, not runtime secrets. */

export const SALES_WORKSHEET_FACTS_VIEW_ID = 219;

export const SALES_WORKSHEET_FACTS_EXPORT_PATH =
  "/sys/report/?view=219&spreadsheet=1&exportType=AllPages&table=Report";

export const SALES_WORKSHEET_FACTS_HTML_PATH = "/sys/report/?view=219";

export const SALES_WORKSHEET_FACTS_REPORT_TYPE = "sales_worksheet_facts";

/**
 * Expected business columns for Sales Worksheet Facts (view 219).
 * Matches the real Moraware export shape. Branch/location is intentionally excluded
 * for v1 — it is not present in this saved report and will be derived later
 * through Account Mapping / Identity Enrichment.
 */
export const SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS = [
  "Account Name",
  "Account Salesperson",
  "Job Name",
  "Job Creation Date",
  "Job Salesperson",
  "Job Status",
  "Job Notes",
  "Stone",
  "Job Worksheet - Form Name",
  "Job Worksheet - Room",
  "Job Worksheet - Color",
  "Job Worksheet - Edge",
  "Job Worksheet - Thickness",
  "Job Worksheet - Back Splash Type",
  "Job Worksheet - Back Splash Height",
  "Total Job Worksheet - Sq.Ft. by Job Creation Date"
];

export const SALES_WORKSHEET_FACTS_FEED_SEED = {
  name: "eliteOS - Sales Worksheet Facts",
  moraware_view_id: SALES_WORKSHEET_FACTS_VIEW_ID,
  report_type: SALES_WORKSHEET_FACTS_REPORT_TYPE,
  export_path: SALES_WORKSHEET_FACTS_EXPORT_PATH,
  html_path: SALES_WORKSHEET_FACTS_HTML_PATH,
  expected_columns: SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS,
  cadence: "manual",
  notes:
    "Additive report-feed lane beside Moraware API sync. CSV supplies business columns; HTML supplies /sys/job and /sys/account IDs."
};
