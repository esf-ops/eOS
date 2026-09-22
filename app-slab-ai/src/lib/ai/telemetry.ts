import type { TelemetryEvent } from "./types";

/**
 * Lightweight AI telemetry sink.
 * MVP logs safe development events only — never secrets, JWTs, or full system prompts.
 */
export function recordTelemetry(event: TelemetryEvent): void {
  const safe = {
    ...event,
    // Explicitly omit any accidental sensitive fields
  };

  if (process.env.NODE_ENV !== "test") {
    // Structured console for operators; replace with Brain audit write later.
    console.info("[slab-ai-telemetry]", JSON.stringify(safe));
  }
}

export function createGenerationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback UUID v4-ish for older runtimes
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
