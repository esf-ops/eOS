/**
 * Lab takeoff correction domain (Phase 4B.3).
 * Corrections never mutate the source TakeoffRun.
 */

export const REVIEWED_TAKEOFF_SCHEMA_VERSION = "qil_reviewed_takeoff_v1";

export const TAKEOFF_REVIEW_STATE = Object.freeze({
  UNREVIEWED: "unreviewed",
  CORRECTION_DRAFT: "correction_draft",
  READY_FOR_ACCEPTANCE: "ready_for_acceptance",
  ACCEPTED_LAB_SNAPSHOT: "accepted_lab_snapshot",
  SUPERSEDED_SNAPSHOT: "superseded_snapshot"
});

export const PIECE_REVIEW_STATUS = Object.freeze({
  UNREVIEWED: "unreviewed",
  CONFIRMED: "confirmed",
  CORRECTED: "corrected",
  EXCLUDED: "excluded",
  ADDED: "added"
});

export const CORRECTION_OP = Object.freeze({
  CONFIRM_PIECE: "confirm_piece",
  EDIT_PIECE: "edit_piece",
  REASSIGN_PIECE: "reassign_piece",
  EXCLUDE_PIECE: "exclude_piece",
  RESTORE_PIECE: "restore_piece",
  ADD_PIECE: "add_piece",
  ADD_ROOM: "add_room",
  RENAME_ROOM: "rename_room",
  MARK_ROOM_REVIEWED: "mark_room_reviewed",
  EDIT_BACKSPLASH: "edit_backsplash",
  SET_SINK_COUNT: "set_sink_count",
  CONFIRM_SINK_COUNT: "confirm_sink_count",
  CONFIRM_EVIDENCE: "confirm_evidence",
  MARK_EVIDENCE_UNSUPPORTED: "mark_evidence_unsupported",
  ADD_EVIDENCE_NOTE: "add_evidence_note",
  RESOLVE_WARNING: "resolve_warning",
  RESET_PIECE: "reset_piece",
  REOPEN_SINK_CONFIRMATION: "reopen_sink_confirmation",
  REOPEN_ROOM_REVIEW: "reopen_room_review",
  REOPEN_WARNING_RESOLUTION: "reopen_warning_resolution"
});

export const SUPPORTED_CORRECTION_SHAPES = Object.freeze(["rect", "tri"]);
export const SUPPORTED_PIECE_TYPES = Object.freeze(["counter", "splash", "fhb"]);
