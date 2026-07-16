/**
 * DE.2F — Review request + amendment feature flags (default OFF).
 */

import { isDigitalEstimatePublicConfigurationRuntimeEnabled } from "./publicConfigurationConfig.mjs";
import { isElite100EstimateStudioEnabled } from "../../elite100EstimateStudio/elite100EstimateStudioConfig.mjs";
import { isDigitalEstimateApiEnabled } from "../digitalEstimateConfig.mjs";
import { isDigitalEstimateConfigurationEnabled } from "./configurationConfig.mjs";

export function isDigitalEstimateReviewRequestsEnabled(env = process.env) {
  return String(env.DIGITAL_ESTIMATE_REVIEW_REQUESTS_ENABLED ?? "").trim() === "1";
}

export function isDigitalEstimateAmendmentsEnabled(env = process.env) {
  return String(env.DIGITAL_ESTIMATE_AMENDMENTS_ENABLED ?? "").trim() === "1";
}

export function isDigitalEstimateReviewRequestRuntimeEnabled(env = process.env) {
  return (
    isDigitalEstimatePublicConfigurationRuntimeEnabled(env) &&
    isDigitalEstimateReviewRequestsEnabled(env)
  );
}

export function isDigitalEstimateAmendmentStudioRuntimeEnabled(env = process.env) {
  return (
    isDigitalEstimateApiEnabled(env) &&
    isDigitalEstimateConfigurationEnabled(env) &&
    isElite100EstimateStudioEnabled(env) &&
    isDigitalEstimateAmendmentsEnabled(env)
  );
}

export const REVIEW_STATUS = Object.freeze({
  REQUESTED: "review_requested",
  REVIEWING: "estimator_reviewing",
  CLARIFICATION: "clarification_required",
  AMENDMENT_PREPARED: "amendment_prepared",
  PUBLISHED: "updated_estimate_published",
  CLOSED: "review_closed",
  SUPERSEDED: "review_superseded"
});

export const AMENDMENT_STATUS = Object.freeze({
  DRAFT: "amendment_draft",
  VALIDATING: "amendment_validating",
  READY: "amendment_ready",
  PUBLISHED: "amendment_published",
  SUPERSEDED: "amendment_superseded",
  CANCELLED: "amendment_cancelled",
  FAILED: "amendment_failed"
});

export const CUSTOMER_NOTE_MAX_CHARS = 1000;

export function readSafeDigitalEstimateAmendmentConfig(env = process.env) {
  return {
    reviewRequestsEnabled: isDigitalEstimateReviewRequestsEnabled(env),
    amendmentsEnabled: isDigitalEstimateAmendmentsEnabled(env),
    reviewRequestRuntime: isDigitalEstimateReviewRequestRuntimeEnabled(env),
    amendmentStudioRuntime: isDigitalEstimateAmendmentStudioRuntimeEnabled(env)
  };
}
