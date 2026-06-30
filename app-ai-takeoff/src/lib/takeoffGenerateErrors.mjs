/**
 * Maps AI takeoff generation failures to estimator-friendly copy + advanced diagnostics.
 * Pure JS so node tests can import without a TS build step.
 */

/** @typedef {{ title: string, body: string, canRetry: boolean, advanced: Record<string, string> }} AiGenerateErrorView */

/**
 * @param {unknown} err
 * @param {{
 *   endpoint: string,
 *   jobId: string|null,
 *   provider?: string|null,
 *   model?: string|null,
 * }} ctx
 * @returns {AiGenerateErrorView}
 */
export function mapAiGenerateError(err, ctx) {
  const timestamp = new Date().toISOString();
  const advanced = {
    timestamp,
    endpoint: ctx.endpoint,
    jobId: ctx.jobId ?? "—",
    provider: ctx.provider ?? "—",
    model: ctx.model ?? "—",
  };

  if (err && typeof err === "object" && err.name === "LabApiError") {
    const apiErr = /** @type {{ status?: number, message?: string, body?: unknown, headers?: Record<string, string> }} */ (err);
    advanced.httpStatus = String(apiErr.status ?? "—");
    if (apiErr.headers?.["x-vercel-error"]) {
      advanced["X-Vercel-Error"] = apiErr.headers["x-vercel-error"];
    }
    if (apiErr.message) advanced.rawMessage = apiErr.message.slice(0, 500);

    const isTimeout =
      apiErr.status === 504 ||
      apiErr.headers?.["x-vercel-error"] === "FUNCTION_INVOCATION_TIMEOUT";

    if (isTimeout) {
      return {
        title: "AI takeoff could not start",
        body: "We couldn't reach the takeoff service. Try again, or report the issue if it keeps happening.",
        canRetry: true,
        advanced,
      };
    }

    if (apiErr.status === 409) {
      return {
        title: "Generation already in progress",
        body: "This takeoff is already generating. Wait for it to finish, or try again in a moment.",
        canRetry: false,
        advanced,
      };
    }

    return {
      title: "AI takeoff could not start",
      body: "We couldn't reach the takeoff service. Try again, or report the issue if it keeps happening.",
      canRetry: true,
      advanced,
    };
  }

  if (err instanceof TypeError || (err instanceof Error && /fetch|network|load failed/i.test(err.message))) {
    advanced.httpStatus = "—";
    advanced.rawMessage = err instanceof Error ? err.message.slice(0, 500) : String(err);
    return {
      title: "AI takeoff could not start",
      body: "We couldn't reach the takeoff service. Try again, or report the issue if it keeps happening.",
      canRetry: true,
      advanced,
    };
  }

  advanced.rawMessage = err instanceof Error ? err.message.slice(0, 500) : String(err ?? "unknown");
  return {
    title: "AI takeoff could not start",
    body: "We couldn't reach the takeoff service. Try again, or report the issue if it keeps happening.",
    canRetry: true,
    advanced,
  };
}

/** @returns {boolean} */
export function isGenerateInFlight(aiStep) {
  return aiStep === "sending" || aiStep === "generating" || aiStep === "recomputing" || aiStep === "polling";
}
