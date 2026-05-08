export const name = "debug_head";

/**
 * Placeholder Head:
 * Returns a minimal sample of the normalized payload to prove the pipeline works.
 * Intentionally returns a full, unmodified record so nested attributes/customFields
 * remain visible for mapping calibration.
 *
 * Heuristic:
 * - If `normalizedData.jobs` is an array, return only the first job record (as-is).
 * - Else if normalizedData is an array, return only the first item (as-is).
 * - Else return the value unchanged.
 */
export async function process(normalizedData) {
  if (Array.isArray(normalizedData?.jobs)) {
    const first = normalizedData.jobs[0];
    return first ?? { message: "No jobs found to display" };
  }
  if (Array.isArray(normalizedData)) {
    return normalizedData[0] ?? null;
  }
  return normalizedData;
}

