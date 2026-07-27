/**
 * Legacy coordinator module — queue autosave removed.
 * Helpers live in takeoffExplicitSave.mjs (explicit Save draft model).
 * Kept as a thin re-export so older import paths do not break mid-migration.
 */
export {
  formatTakeoffSaveStatus,
  pieceRequiresExposedEdgeConfirmation,
  invalidateFinishedEdgeConfirmation,
  applyRunPatchWithEdgeInvalidation
} from "./takeoffExplicitSave.mjs";
