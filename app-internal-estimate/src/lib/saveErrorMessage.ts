import { ApiError } from "@quote-lib/api";

export type SaveErrorInfo = {
  userMessage: string;
  diagnostic?: string;
};

export function friendlyApiErrorMessage(e: unknown, route: string, action: "save" | "calculate" | "load"): SaveErrorInfo {
  if (e instanceof ApiError) {
    const raw = String(e.message || "").trim();
    const diag = `${route} → HTTP ${e.status}${raw ? ` (${raw})` : ""}`;

    if (e.status === 401) {
      if (raw === "Invalid token" || raw === "Missing bearer token") {
        return {
          userMessage:
            action === "save"
              ? "Save failed because your session could not be verified. Please sign out and sign back in, then try again."
              : "Your session could not be verified. Please sign out and sign back in.",
          diagnostic: diag
        };
      }
      return {
        userMessage:
          action === "save"
            ? "Save failed because your session expired. Please sign in again before saving."
            : "Your session expired. Please sign in again.",
        diagnostic: diag
      };
    }

    if (e.status === 403) {
      return {
        userMessage:
          "You are signed in, but your account does not have access to save internal estimates. Contact your administrator.",
        diagnostic: diag
      };
    }

    if (e.status === 503) {
      return {
        userMessage: "Quote storage is not available in this environment yet. Try again later or contact support.",
        diagnostic: diag
      };
    }

    return {
      userMessage: action === "save" ? `Save failed: ${raw || "Server error"}` : raw || "Request failed",
      diagnostic: diag
    };
  }

  return {
    userMessage: action === "save" ? "Save failed unexpectedly. Please try again." : String(e)
  };
}
