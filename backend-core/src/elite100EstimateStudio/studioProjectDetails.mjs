/**
 * Studio project details (metadata) — name/address/notes.
 * Distinct from pricing geometry and Account Directory location.
 */

export const PROJECT_DETAILS_MAX_NAME = 200;
export const PROJECT_DETAILS_MAX_ADDRESS = 400;
export const PROJECT_DETAILS_MAX_NOTES = 4000;

/** Scope keys that are project metadata only (never pricing geometry). */
export const PROJECT_METADATA_SCOPE_KEYS = Object.freeze([
  "projectName",
  "projectAddress",
  "estimatorNotes"
]);

const PLACEHOLDER_PROJECT_NAMES = new Set([
  "untitled project",
  "unknown",
  "test",
  "project",
  "project not named",
  "n/a",
  "na",
  "none"
]);

function str(v) {
  if (v == null) return "";
  return String(v).trim();
}

/**
 * Staff-facing label when project name is missing.
 * @param {unknown} projectName
 */
export function projectNameDisplayLabel(projectName) {
  const n = str(projectName);
  return n || "Project not named";
}

/**
 * @param {unknown} name
 * @returns {boolean}
 */
export function isBlankProjectName(name) {
  return !str(name);
}

/**
 * Names that must not be used as customer-facing publication project names.
 * @param {unknown} name
 * @param {{ customerName?: unknown, estimateId?: unknown, intakeCaseId?: unknown }} [ctx]
 */
export function isDisallowedCustomerFacingProjectName(name, ctx = {}) {
  const n = str(name);
  if (!n) return true;
  if (PLACEHOLDER_PROJECT_NAMES.has(n.toLowerCase())) return true;
  const customer = str(ctx.customerName);
  if (customer && n.toLowerCase() === customer.toLowerCase()) return true;
  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(n) ||
    /^[0-9a-f]{32}$/i.test(n);
  if (uuidLike) return true;
  const est = str(ctx.estimateId);
  if (est && (n === est || n.toLowerCase() === est.slice(0, 8).toLowerCase())) return true;
  const intake = str(ctx.intakeCaseId);
  if (intake && n === intake) return true;
  return false;
}

/**
 * Normalize a project-details patch from the client (draft save — blank name allowed).
 * @param {object} body
 * @returns {{
 *   projectName: string,
 *   projectAddress: string,
 *   estimatorNotes: string|undefined,
 *   errors: string[]
 * }}
 */
export function normalizeProjectDetailsDraft(body = {}) {
  /** @type {string[]} */
  const errors = [];
  const hasName = Object.prototype.hasOwnProperty.call(body, "projectName");
  const hasAddress = Object.prototype.hasOwnProperty.call(body, "projectAddress");
  const hasNotes = Object.prototype.hasOwnProperty.call(body, "estimatorNotes") ||
    Object.prototype.hasOwnProperty.call(body, "internalNotes");

  let projectName = hasName ? str(body.projectName) : undefined;
  let projectAddress = hasAddress ? str(body.projectAddress) : undefined;
  let estimatorNotes = hasNotes
    ? str(body.estimatorNotes ?? body.internalNotes)
    : undefined;

  if (projectName != null && projectName.length > PROJECT_DETAILS_MAX_NAME) {
    errors.push(`Project name must be at most ${PROJECT_DETAILS_MAX_NAME} characters.`);
    projectName = projectName.slice(0, PROJECT_DETAILS_MAX_NAME);
  }
  if (projectAddress != null && projectAddress.length > PROJECT_DETAILS_MAX_ADDRESS) {
    errors.push(`Project address must be at most ${PROJECT_DETAILS_MAX_ADDRESS} characters.`);
    projectAddress = projectAddress.slice(0, PROJECT_DETAILS_MAX_ADDRESS);
  }
  if (estimatorNotes != null && estimatorNotes.length > PROJECT_DETAILS_MAX_NOTES) {
    errors.push(`Project notes must be at most ${PROJECT_DETAILS_MAX_NOTES} characters.`);
    estimatorNotes = estimatorNotes.slice(0, PROJECT_DETAILS_MAX_NOTES);
  }

  return {
    projectName: projectName ?? "",
    projectAddress: projectAddress ?? "",
    estimatorNotes,
    errors,
    touched: {
      projectName: hasName,
      projectAddress: hasAddress,
      estimatorNotes: hasNotes
    }
  };
}

/**
 * Publication / customer-facing validation for project name.
 * @param {object|null|undefined} scope
 * @param {{ estimateId?: unknown, intakeCaseId?: unknown }} [ctx]
 * @returns {{ ok: true, projectName: string } | { ok: false, blocker: object }}
 */
export function validateProjectNameForPublication(scope, ctx = {}) {
  const projectName = str(scope?.projectName);
  if (!projectName) {
    return {
      ok: false,
      blocker: {
        code: "project_name_required",
        title: "Project name required",
        message: "Add a project name before publishing this Digital Estimate.",
        action: "edit_project_details",
        field: "projectName"
      }
    };
  }
  if (projectName.length > PROJECT_DETAILS_MAX_NAME) {
    return {
      ok: false,
      blocker: {
        code: "project_name_invalid",
        title: "Project name too long",
        message: `Project name must be at most ${PROJECT_DETAILS_MAX_NAME} characters.`,
        action: "edit_project_details",
        field: "projectName"
      }
    };
  }
  if (
    isDisallowedCustomerFacingProjectName(projectName, {
      customerName: scope?.customerName,
      estimateId: ctx.estimateId,
      intakeCaseId: ctx.intakeCaseId
    })
  ) {
    return {
      ok: false,
      blocker: {
        code: "project_name_required",
        title: "Project name required",
        message:
          "Enter a meaningful project name before publishing. Placeholder or system names are not allowed.",
        action: "edit_project_details",
        field: "projectName"
      }
    };
  }
  return { ok: true, projectName };
}

/**
 * True when a scope patch only touches project metadata keys (plus empty wrappers).
 * @param {object} cleanPatch — already stripped of forbidden authority keys
 */
export function isProjectMetadataOnlyScopePatch(cleanPatch) {
  if (!cleanPatch || typeof cleanPatch !== "object") return false;
  const keys = Object.keys(cleanPatch).filter((k) => {
    const v = cleanPatch[k];
    if (v === undefined) return false;
    return true;
  });
  if (!keys.length) return false;
  return keys.every((k) => PROJECT_METADATA_SCOPE_KEYS.includes(k));
}
