/**
 * Debounced Studio draft autosave controller.
 * One write in flight; preserves edit order; rejects applying stale responses
 * when newer local edits exist. Does not autosave publish/accept/sold.
 */

export type StudioAutosaveStatus = "idle" | "saving" | "saved" | "failed" | "conflict";

export const STUDIO_AUTOSAVE_LABELS: Record<StudioAutosaveStatus, string> = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  failed: "Save failed — Retry",
  conflict: "Another user changed this estimate"
};

export type StudioAutosaveControllerOptions = {
  debounceMs?: number;
  /** Persist function. Return { ok:true } or throw / return conflict. */
  save: () => Promise<{ ok: true } | { ok: false; conflict?: boolean }>;
  onStatus?: (status: StudioAutosaveStatus) => void;
  /** Called after a successful save when no newer edits arrived during the write. */
  onSavedClean?: () => void;
};

export function createStudioAutosaveController(opts: StudioAutosaveControllerOptions) {
  const debounceMs = Math.max(200, Number(opts.debounceMs) || 800);
  let dirty = false;
  let latestEditAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let pendingAfterFlight = false;
  let status: StudioAutosaveStatus = "idle";
  let disposed = false;

  function setStatus(next: StudioAutosaveStatus) {
    status = next;
    opts.onStatus?.(next);
  }

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  async function runSave() {
    if (disposed || inFlight) {
      if (dirty) pendingAfterFlight = true;
      return;
    }
    if (!dirty) return;
    inFlight = true;
    pendingAfterFlight = false;
    const startedAt = latestEditAt;
    setStatus("saving");
    try {
      const result = await opts.save();
      if (disposed) return;
      if (result && result.ok === false && result.conflict) {
        setStatus("conflict");
        dirty = true;
        return;
      }
      // Newer local edits while in flight — keep dirty and schedule another save.
      if (latestEditAt > startedAt) {
        dirty = true;
        setStatus("saving");
        pendingAfterFlight = true;
      } else {
        dirty = false;
        setStatus("saved");
        opts.onSavedClean?.();
      }
    } catch {
      if (!disposed) {
        setStatus("failed");
        dirty = true;
      }
    } finally {
      inFlight = false;
      if (!disposed && pendingAfterFlight && dirty) {
        pendingAfterFlight = false;
        clearTimer();
        timer = setTimeout(() => void runSave(), debounceMs);
      }
    }
  }

  return {
    getStatus: () => status,
    isDirty: () => dirty,
    isInFlight: () => inFlight,
    markDirty() {
      if (disposed) return;
      dirty = true;
      latestEditAt = Date.now();
      if (status !== "saving") setStatus("saving");
      clearTimer();
      timer = setTimeout(() => void runSave(), debounceMs);
    },
    /** Immediate flush — await before navigation / Publish. */
    async flush() {
      if (disposed) return { ok: true as const, skipped: true };
      clearTimer();
      if (!dirty && !inFlight) return { ok: true as const, skipped: true };
      // Wait for in-flight then save once more if still dirty.
      const waitForIdle = async () => {
        for (let i = 0; i < 100 && inFlight; i += 1) {
          await new Promise((r) => setTimeout(r, 50));
        }
      };
      await waitForIdle();
      if (dirty) {
        await runSave();
        await waitForIdle();
      }
      if (status === "conflict") return { ok: false as const, conflict: true };
      if (status === "failed" || dirty) return { ok: false as const, failed: true };
      return { ok: true as const };
    },
    async retry() {
      if (disposed) return;
      dirty = true;
      latestEditAt = Date.now();
      clearTimer();
      await runSave();
    },
    dispose() {
      disposed = true;
      clearTimer();
    }
  };
}

/**
 * Reject applying a save response that is older than current local edits.
 */
export function shouldApplyStudioAutosaveResponse(input: {
  requestStartedAt: number;
  latestEditAt: number;
  localRevision?: number | null;
  responseRevision?: number | null;
}): { apply: boolean; reason: string | null } {
  if (Number(input.latestEditAt) > Number(input.requestStartedAt)) {
    return { apply: false, reason: "local_edits_newer" };
  }
  if (
    input.localRevision != null &&
    input.responseRevision != null &&
    Number(input.responseRevision) < Number(input.localRevision)
  ) {
    return { apply: false, reason: "stale_response_revision" };
  }
  return { apply: true, reason: null };
}
