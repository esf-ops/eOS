/**
 * Jobs Command Center — read-only QB ↔ Moraware job workspace (v1).
 * Admin / super_admin only until head access is opened more broadly.
 */

export const JOBS_COMMAND_CENTER_HEAD_SLUG = "jobs_command_center";

export const JOBS_COMMAND_CENTER_ROLES = Object.freeze(["admin", "super_admin"]);

export const JOBS_COMMAND_CENTER_PAGE_DEFAULT = 50;
export const JOBS_COMMAND_CENTER_PAGE_MAX = 100;

/** Opaque browser project reference = ad_qb_customer_facts.id (UUID). */
export const PROJECT_REF_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const LINK_BUCKETS = Object.freeze({
  IN_DIRECTORY: "in_directory",
  NOT_IN_DIRECTORY: "not_in_directory",
  MORAWARE_RELATED: "moraware_related",
  NO_MORAWARE: "no_moraware"
});
