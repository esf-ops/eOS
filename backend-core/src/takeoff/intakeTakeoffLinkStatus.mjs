/**
 * Keep intake→takeoff link relationship_status aligned with job reality.
 * Pure-ish helper with small I/O — never throws to callers (best-effort).
 */
import { TAKEOFF_LINK_RELATIONSHIP_STATUS } from "../quoteIntake/quoteIntakeTypes.mjs";

/**
 * @param {string} jobStatus
 * @param {string} [reviewStatus]
 * @param {string} [phase]
 */
export function deriveIntakeLinkStatusFromJob(jobStatus, reviewStatus = "", phase = "") {
  const status = String(jobStatus ?? "").toLowerCase();
  const review = String(reviewStatus ?? "").toLowerCase();
  const p = String(phase ?? "").toLowerCase();
  if (status === "failed" || status === "error" || p === "failed") {
    return TAKEOFF_LINK_RELATIONSHIP_STATUS.FAILED;
  }
  if (review === "approved") return TAKEOFF_LINK_RELATIONSHIP_STATUS.READY;
  if (status === "completed") return TAKEOFF_LINK_RELATIONSHIP_STATUS.READY;
  // Prefer phase for early AI lifecycle — startAi marks status=processing while phase=queued.
  if (status === "pending" || status === "queued" || p === "queued" || !p) {
    return TAKEOFF_LINK_RELATIONSHIP_STATUS.QUEUED;
  }
  if (status === "processing" || p === "extraction" || p === "download" || p === "persist") {
    return TAKEOFF_LINK_RELATIONSHIP_STATUS.PROCESSING;
  }
  return TAKEOFF_LINK_RELATIONSHIP_STATUS.QUEUED;
}

/**
 * Best-effort update of all intake links for a takeoff job.
 * @param {{
 *   supabase: object,
 *   organizationId: string,
 *   takeoffJobId: string,
 *   relationshipStatus: string,
 *   completedAt?: string|null
 * }} input
 */
export async function updateIntakeTakeoffLinkStatus(input) {
  const organizationId = String(input.organizationId ?? "").trim();
  const takeoffJobId = String(input.takeoffJobId ?? "").trim();
  const relationshipStatus = String(input.relationshipStatus ?? "").trim();
  if (!organizationId || !takeoffJobId || !relationshipStatus) return { updated: 0 };

  const patch = {
    relationship_status: relationshipStatus
  };
  if (
    relationshipStatus === TAKEOFF_LINK_RELATIONSHIP_STATUS.READY ||
    relationshipStatus === TAKEOFF_LINK_RELATIONSHIP_STATUS.FAILED
  ) {
    patch.completed_at = input.completedAt || new Date().toISOString();
  }

  try {
    const { data, error } = await input.supabase
      .from("quote_intake_takeoff_links")
      .update(patch)
      .eq("organization_id", organizationId)
      .eq("takeoff_job_id", takeoffJobId)
      .select("id");
    if (error) {
      console.warn("[intakeTakeoffLinkStatus] update failed", error.code || error.message);
      return { updated: 0, error: error.code || "update_failed" };
    }
    return { updated: Array.isArray(data) ? data.length : 0 };
  } catch (e) {
    console.warn("[intakeTakeoffLinkStatus] update threw", e?.message || String(e));
    return { updated: 0, error: "update_threw" };
  }
}

/**
 * Sync link from a loaded job row (open-estimate / worker / extraction).
 */
export async function syncIntakeTakeoffLinkFromJob(supabase, job) {
  if (!job?.id || !job?.organization_id) return { updated: 0 };
  const proc =
    job.metadata && typeof job.metadata === "object" && job.metadata.processing
      ? job.metadata.processing
      : {};
  const relationshipStatus = deriveIntakeLinkStatusFromJob(
    job.status,
    job.review_status,
    proc.phase || proc.asyncStatus
  );
  return updateIntakeTakeoffLinkStatus({
    supabase,
    organizationId: job.organization_id,
    takeoffJobId: job.id,
    relationshipStatus,
    completedAt:
      relationshipStatus === TAKEOFF_LINK_RELATIONSHIP_STATUS.READY ||
      relationshipStatus === TAKEOFF_LINK_RELATIONSHIP_STATUS.FAILED
        ? new Date().toISOString()
        : null
  });
}
