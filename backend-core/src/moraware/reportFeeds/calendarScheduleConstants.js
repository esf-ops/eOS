/**
 * Moraware calendar / install schedule report-feed contract (view 222).
 *
 * Moraware calendar UI rows (Truck A/B/D/E/H, named installers, etc.) are NOT
 * mirrored by brain_job_activities today. This feed lands typed rows in
 * moraware_calendar_schedule_rows via the existing report-feed staging lane.
 *
 * Export URL:
 *   /sys/report/?view=222&spreadsheet=1&exportType=AllPages&table=Report
 *
 * The export repeats one row per worksheet line for the same scheduled stop.
 * Promotion aggregates worksheet lines into one Install Dashboard stop using
 * Activity Date + Sched Time + Assigned To + Activity Type + Job Name.
 *
 * "First Install - ..." columns may appear in live exports; they are optional
 * raw_row fields and are NOT part of the core expected_columns contract.
 */

import { computeHeaderHash } from "./hashUtils.js";

export const CALENDAR_SCHEDULE_REPORT_TYPE = "calendar_schedule_rows";

export const CALENDAR_SCHEDULE_VIEW_ID = 222;

export const CALENDAR_SCHEDULE_EXPORT_PATH =
  "/sys/report/?view=222&spreadsheet=1&exportType=AllPages&table=Report";

export const CALENDAR_SCHEDULE_HTML_PATH = "/sys/report/?view=222";

/** Default Moraware calendar schedule view — override via env for staging only. */
export const CALENDAR_SCHEDULE_DEFAULT_VIEW_ID = Number(
  String(process.env.MORAWARE_CALENDAR_SCHEDULE_VIEW_ID ?? String(CALENDAR_SCHEDULE_VIEW_ID)).trim()
) || CALENDAR_SCHEDULE_VIEW_ID;

/**
 * Core expected columns for view 222 (verified 2026-06-11).
 * Live exports may include additional "First Install - ..." columns; those are
 * allowed as unexpected headers when expected_column_hash is null.
 */
export const CALENDAR_SCHEDULE_EXPECTED_COLUMNS = Object.freeze([
  "Job Activity",
  "Activity Type",
  "Activity Status",
  "Activity Date",
  "Sched Time",
  "Duration",
  "Assigned To",
  "Job Name",
  "Job Status",
  "Job Creation Date",
  "Job Salesperson",
  "Job Notes",
  "Stone",
  "Contact Name",
  "Address Line 1",
  "Address Line 2",
  "City",
  "State/Province",
  "Zip/Postal Code",
  "Phone1",
  "Phone2",
  "Cell",
  "Email",
  "Address Notes",
  "Account Name",
  "Account Salesperson",
  "Job Worksheet - Sq.Ft.",
  "Job Worksheet - Color",
  "Job Worksheet - Edge",
  "Job Worksheet - Form Name",
  "Job Worksheet - Room",
  "Job Worksheet - Thickness",
  "Number of Job Activities by Activity Date"
]);

/**
 * Hash of the core expected columns only (NBSP/trailing-space normalized, lowercased).
 * Use this when the feed contract locks to the core column set. Live exports with
 * extra "First Install - ..." columns should leave expected_column_hash NULL in
 * moraware_report_feeds so validation checks required columns without failing on extras.
 */
export const CALENDAR_SCHEDULE_CORE_COLUMN_HASH = computeHeaderHash(CALENDAR_SCHEDULE_EXPECTED_COLUMNS);

/** Column header aliases — view 222 primary headers first, legacy fallbacks retained. */
export const CALENDAR_SCHEDULE_COLUMN_ALIASES = Object.freeze({
  jobActivity: ["Job Activity"],
  calendarDate: ["Activity Date", "Calendar Date", "Date", "Start Date", "Sched Date"],
  scheduledStartTime: ["Sched Time", "Start Time", "Scheduled Time", "Time", "Start"],
  scheduledEndTime: ["End Time", "Scheduled End", "Finish Time"],
  duration: ["Duration", "Duration Minutes", "Duration (min)"],
  truckOrCrewName: ["Assigned To", "Resource", "Truck", "Crew", "Machine", "Installer"],
  assignedResourceName: ["Assigned To", "Resource Name", "Resource", "Machine"],
  activityType: ["Activity Type", "Type", "Activity"],
  activityTypeName: ["Activity Type", "Activity Type Name", "Activity Description"],
  activityStatus: ["Activity Status", "Status"],
  jobStatus: ["Job Status"],
  jobName: ["Job Name", "Job", "Job #"],
  jobCreationDate: ["Job Creation Date"],
  jobSalesperson: ["Job Salesperson"],
  accountName: ["Account Name", "Account", "Customer"],
  accountSalesperson: ["Account Salesperson"],
  customerName: ["Contact Name", "Customer Name", "Customer", "Homeowner"],
  addressLine1: ["Address Line 1", "Address", "Street", "Job Address"],
  addressLine2: ["Address Line 2"],
  city: ["City"],
  state: ["State/Province", "State", "ST"],
  postalCode: ["Zip/Postal Code", "Zip", "Postal Code", "ZIP"],
  phone1: ["Phone1", "Phone 1"],
  phone2: ["Phone2", "Phone 2"],
  cell: ["Cell"],
  email: ["Email"],
  sqft: ["Job Worksheet - Sq.Ft.", "Sq Ft", "Sqft", "Square Feet", "Total Sq Ft"],
  color: ["Job Worksheet - Color", "Color", "Material Color"],
  edge: ["Job Worksheet - Edge", "Edge"],
  formName: ["Job Worksheet - Form Name"],
  room: ["Job Worksheet - Room", "Room"],
  thickness: ["Job Worksheet - Thickness", "Thickness"],
  material: ["Stone", "Material", "Product"],
  installType: ["Activity Type", "Install Type", "Type of Install"],
  jobNotes: ["Job Notes"],
  addressNotes: ["Address Notes"],
  notes: ["Job Notes", "Address Notes", "Notes", "Activity Notes"],
  activityCount: ["Number of Job Activities by Activity Date"]
});

/** Minimum logical fields before a calendar feed row may promote. */
export const CALENDAR_SCHEDULE_REQUIRED_FIELDS = Object.freeze(["calendarDate", "jobName"]);

export const CALENDAR_SCHEDULE_FEED_SEED = {
  name: "eliteOS - Install Calendar Schedule (view 222)",
  moraware_view_id: CALENDAR_SCHEDULE_VIEW_ID,
  report_type: CALENDAR_SCHEDULE_REPORT_TYPE,
  export_path: CALENDAR_SCHEDULE_EXPORT_PATH,
  html_path: CALENDAR_SCHEDULE_HTML_PATH,
  expected_columns: CALENDAR_SCHEDULE_EXPECTED_COLUMNS,
  expected_column_hash: null,
  cadence: "manual",
  notes:
    "Moraware view 222 install-day calendar export. Worksheet lines aggregate to one stop per " +
    "Activity Date + Sched Time + Assigned To + Activity Type + Job Name. Optional First Install " +
    "columns remain in raw_row only. Set expected_column_hash after profiling a full export if " +
    "you want strict header-lock validation."
};
