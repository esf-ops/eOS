/**
 * Moraware calendar / install schedule report-feed contract.
 *
 * Moraware calendar UI rows (Truck A/B/D/E/H, named installers, etc.) are NOT
 * mirrored by brain_job_activities today. This feed lands typed rows in
 * moraware_calendar_schedule_rows via the existing report-feed staging lane.
 *
 * Exact Moraware view/export id and column headers must be confirmed from a
 * live Elite export before locking expected_column_hash in moraware_report_feeds.
 */

export const CALENDAR_SCHEDULE_REPORT_TYPE = "calendar_schedule_rows";

/** Default Moraware machines/calendar view from discovery docs — override via env. */
export const CALENDAR_SCHEDULE_DEFAULT_VIEW_ID = Number(
  String(process.env.MORAWARE_CALENDAR_SCHEDULE_VIEW_ID ?? "146").trim()
) || 146;

/** Column header aliases observed across Moraware calendar/report exports. */
export const CALENDAR_SCHEDULE_COLUMN_ALIASES = Object.freeze({
  calendarDate: ["Calendar Date", "Date", "Start Date", "Activity Date", "Sched Date"],
  scheduledStartTime: ["Sched Time", "Start Time", "Scheduled Time", "Time", "Start"],
  scheduledEndTime: ["End Time", "Scheduled End", "Finish Time"],
  duration: ["Duration", "Duration Minutes", "Duration (min)"],
  truckOrCrewName: ["Assigned To", "Resource", "Truck", "Crew", "Machine", "Installer"],
  assignedResourceName: ["Assigned To", "Resource Name", "Resource", "Machine"],
  activityType: ["Activity Type", "Type", "Activity"],
  activityTypeName: ["Activity Type Name", "Activity", "Activity Description"],
  activityStatus: ["Status", "Activity Status", "Job Status"],
  jobName: ["Job Name", "Job", "Job #"],
  accountName: ["Account Name", "Account", "Customer"],
  customerName: ["Customer Name", "Customer", "Homeowner"],
  addressLine1: ["Address", "Address Line 1", "Street", "Job Address"],
  city: ["City"],
  state: ["State", "ST"],
  postalCode: ["Zip", "Postal Code", "ZIP"],
  sqft: ["Sq Ft", "Sqft", "Square Feet", "Total Sq Ft"],
  material: ["Material", "Stone", "Product"],
  color: ["Color", "Material Color"],
  installType: ["Install Type", "Type of Install"],
  notes: ["Notes", "Activity Notes", "Job Notes"]
});

/** Minimum columns required before a calendar feed run may promote. */
export const CALENDAR_SCHEDULE_REQUIRED_FIELDS = Object.freeze([
  "calendarDate",
  "jobName"
]);
