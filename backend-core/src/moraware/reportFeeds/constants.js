/** Report feed contracts — versioned integration metadata, not runtime secrets. */

// ── View 219: Sales Worksheet Facts ──────────────────────────────────────────

export const SALES_WORKSHEET_FACTS_VIEW_ID = 219;

export const SALES_WORKSHEET_FACTS_EXPORT_PATH =
  "/sys/report/?view=219&spreadsheet=1&exportType=AllPages&table=Report";

export const SALES_WORKSHEET_FACTS_HTML_PATH = "/sys/report/?view=219";

export const SALES_WORKSHEET_FACTS_REPORT_TYPE = "sales_worksheet_facts";

/**
 * Expected business columns for Sales Worksheet Facts (view 219).
 * Full 76-column real Moraware export shape (verified 2026-05-30).
 *
 * Columns 1-15 are core worksheet/sales fields mapped to prepared facts.
 * Columns 16-75 are activity/install/CS status fields stored in raw_row only (v1).
 * Column 76 is the sqft total (mapped to total_worksheet_sqft).
 *
 * Branch/location is intentionally absent from this view — derived later
 * through Account Mapping / Identity Enrichment.
 */
export const SALES_WORKSHEET_FACTS_EXPECTED_COLUMNS = [
  // Core worksheet fields (mapped to prepared-fact columns)
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
  // Activity / customer service / install status fields (raw_row only in v1)
  "Last Customer Service - Basic in Job Status",
  "Last Customer Service - Basic in Job Date",
  "Last Customer Service - Basic in Job Sched Time",
  "Last Customer Service - Basic in Job Assigned To",
  "Last Customer Service - Basic in Job Notes",
  "Last Customer Service - Challenging in Job Status",
  "Last Customer Service - Challenging in Job Date",
  "Last Customer Service - Challenging in Job Sched Time",
  "Last Customer Service - Challenging in Job Assigned To",
  "Last Customer Service - Challenging in Job Notes",
  "First Install - Quartz Basic in Job Status",
  "First Install - Quartz Basic in Job Date",
  "First Install - Quartz Basic in Job Sched Time",
  "First Install - Quartz Basic in Job Assigned To",
  "First Install - Quartz Basic in Job Notes",
  "First Install - Quartz Challenging in Job Status",
  "First Install - Quartz Challenging in Job Date",
  "First Install - Quartz Challenging in Job Sched Time",
  "First Install - Quartz Challenging in Job Assigned To",
  "First Install - Quartz Challenging in Job Notes",
  "First Install - Granite Basic in Job Status",
  "First Install - Granite Basic in Job Date",
  "First Install - Granite Basic in Job Sched Time",
  "First Install - Granite Basic in Job Assigned To",
  "First Install - Granite Basic in Job Notes",
  "First Install - Granite Challenging in Job Status",
  "First Install - Granite Challenging in Job Date",
  "First Install - Granite Challenging in Job Sched Time",
  "First Install - Granite Challenging in Job Assigned To",
  "First Install - Granite Challenging in Job Notes",
  "First Install - Quartzite/Marble in Job Status",
  "First Install - Quartzite/Marble in Job Date",
  "First Install - Quartzite/Marble in Job Sched Time",
  "First Install - Quartzite/Marble in Job Assigned To",
  "First Install - Quartzite/Marble in Job Notes",
  "First Install - Waterfalls in Job Status",
  "First Install - Waterfalls in Job Date",
  "First Install - Waterfalls in Job Sched Time",
  "First Install - Waterfalls in Job Assigned To",
  "First Install - Waterfalls in Job Notes",
  "First Install - Special Edge in Job Status",
  "First Install - Special Edge in Job Date",
  "First Install - Special Edge in Job Sched Time",
  "First Install - Special Edge in Job Assigned To",
  "First Install - Special Edge in Job Notes",
  "First Install - Fireplace/Shower Walls in Job Status",
  "First Install - Fireplace/Shower Walls in Job Date",
  "First Install - Fireplace/Shower Walls in Job Sched Time",
  "First Install - Fireplace/Shower Walls in Job Assigned To",
  "First Install - Fireplace/Shower Walls in Job Notes",
  "First Customer Service - Basic in Job Status",
  "First Customer Service - Basic in Job Date",
  "First Customer Service - Basic in Job Sched Time",
  "First Customer Service - Basic in Job Assigned To",
  "First Customer Service - Basic in Job Notes",
  "First Customer Service - Challenging in Job Status",
  "First Customer Service - Challenging in Job Date",
  "First Customer Service - Challenging in Job Sched Time",
  "First Customer Service - Challenging in Job Assigned To",
  "First Customer Service - Challenging in Job Notes",
  // Sqft total (mapped to total_worksheet_sqft in prepared facts)
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

// ── View 220: Sales Worksheet History Facts ───────────────────────────────────

export const SALES_WORKSHEET_HISTORY_FACTS_VIEW_ID = 220;

export const SALES_WORKSHEET_HISTORY_FACTS_EXPORT_PATH =
  "/sys/report/?view=220&spreadsheet=1&exportType=AllPages&table=Report";

export const SALES_WORKSHEET_HISTORY_FACTS_HTML_PATH = "/sys/report/?view=220";

export const SALES_WORKSHEET_HISTORY_FACTS_REPORT_TYPE = "sales_worksheet_history_facts";

/**
 * Expected business columns for Sales Worksheet History Facts (view 220).
 * 34-column historical export — verified from live run 2026-05-31.
 * Header hash: ca05eadcaeea16417f017e857f48a89ed42ee2033242d80ee635e8002d0dd000
 *
 * View 220 is the historical worksheet export (date-ranged) used for YoY / trend analytics.
 * It is a leaner shape than view 219 — no activity/install/CS status columns, but adds
 * worksheet detail columns (sink, faucet, stove, shop comments, worksite conditions).
 *
 * Key difference from view 219:
 *   - "Job Status" is ABSENT — job_status will be null in prepared facts from this view.
 *   - "Account Status" is present — raw_row only in v1.
 *   - Sink / faucet / stove / shop comment / worksite condition columns — raw_row only in v1.
 *
 * Column mapping:
 *   Cols 1, 4–6, 8–11 + col 34 → typed prepared-fact fields (same as view 219 mapping).
 *   Cols 2–3, 7, 12–33 → raw_row only in v1.
 *
 * Row hashes include reportType so view 220 rows never collide with view 219 hashes even
 * when both views contain the same underlying worksheet line.
 */
export const SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMNS = [
  // Core identity + worksheet fields (mapped to prepared-fact columns)
  "Account Name",
  "Account Salesperson",           // raw_row only in v1
  "Account Status",                // raw_row only in v1
  "Job Name",
  "Job Creation Date",
  "Job Salesperson",
  "Job Notes",                     // raw_row only in v1
  "Stone",
  "Job Worksheet - Form Name",     // row hash discriminator + raw_row
  "Job Worksheet - Room",
  "Job Worksheet - Color",
  "Job Worksheet - Edge",          // raw_row only in v1
  "Job Worksheet - Thickness",     // raw_row only in v1
  "Job Worksheet - Back Splash Type",    // raw_row only in v1
  "Job Worksheet - Back Splash Height",  // raw_row only in v1
  // Sink / faucet / stove / finish fields (raw_row only in v1)
  "Job Worksheet - Sink Type",
  "Job Worksheet - We have the sink",
  "Job Worksheet - ESF Provided Sink Make & Model",
  "Job Worksheet - Faucet Type",
  "Job Worksheet - We have Faucet",
  "Job Worksheet - ESF Provided Faucet Make & Model",
  "Job Worksheet - Faucet at Jobsite",
  "Job Worksheet - Not Provided by ESF Sink Make & Model",
  "Job Worksheet - Not Provided by ESF Faucet Make & Model",
  "Job Worksheet - Stove Type",
  "Job Worksheet - Stove Ripper Needed",
  "Job Worksheet - Stove Ripper NOT Needed",
  "Job Worksheet - Make & Model",
  "Job Worksheet - Stone Care Kit",
  "Job Worksheet - Dry Treat",
  "Job Worksheet - Shop Comments",
  "Job Worksheet - More Shop Comments",
  "Job Worksheet - Special Worksite Conditions",
  // Sqft total (mapped to total_worksheet_sqft in prepared facts)
  "Total Job Worksheet - Sq.Ft. by Job Creation Date"
];

/**
 * SHA-256 hash of the normalized (lowercase, |-joined) view 220 header row.
 * Verified from live export 2026-05-31 (22,899 rows, 562,602.50 total sqft).
 */
export const SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMN_HASH =
  "ca05eadcaeea16417f017e857f48a89ed42ee2033242d80ee635e8002d0dd000";

export const SALES_WORKSHEET_HISTORY_FACTS_FEED_SEED = {
  name: "eliteOS - Sales Worksheet History Facts",
  moraware_view_id: SALES_WORKSHEET_HISTORY_FACTS_VIEW_ID,
  report_type: SALES_WORKSHEET_HISTORY_FACTS_REPORT_TYPE,
  export_path: SALES_WORKSHEET_HISTORY_FACTS_EXPORT_PATH,
  html_path: SALES_WORKSHEET_HISTORY_FACTS_HTML_PATH,
  expected_columns: SALES_WORKSHEET_HISTORY_FACTS_EXPECTED_COLUMNS,
  cadence: "manual",
  notes:
    "Historical worksheet export (date-ranged) for YoY / trend analytics. " +
    "Separate feed from view 219; dashboard queries must scope by report_feed_id. " +
    "Job Status absent from this view; job_status will be null in prepared facts."
};
