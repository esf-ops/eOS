/**
 * Studio V2 — embedded AI Takeoff Review (iframe of production Takeoff head).
 * Reuses ConsolidatedTakeoffReview via ?consolidated=1&studioV2Finish=1.
 * Does not mount the legacy estimate workspace or its approval handoff.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiPost, ApiError } from "../lib/api";
import {
  aiTakeoffHeadUrl,
  isAllowedTakeoffMessageOrigin,
  isValidTakeoffApprovedMessage
} from "./takeoffPostMessageOrigins.mjs";

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body && typeof e.body === "object" ? (e.body as Record<string, unknown>) : null;
    if (body?.error) return String(body.error);
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "Request failed";
}

type Props = {
  authToken: string;
  caseId: string;
  takeoffJobId: string;
  scopeLoaded?: boolean;
  onFinished: (result: Record<string, unknown>) => void;
};

export default function StudioV2TakeoffReviewPanel(props: Props) {
  const { authToken, caseId, takeoffJobId, scopeLoaded = false, onFinished } = props;
  const [finishBusy, setFinishBusy] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finishNotice, setFinishNotice] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  const takeoffSrc = useMemo(() => {
    const params = new URLSearchParams({
      takeoffJobId: String(takeoffJobId),
      consolidated: "1",
      mode: "editable",
      persistentWorkspace: "1",
      studioV2Finish: "1"
    });
    return `${aiTakeoffHeadUrl()}/?${params.toString()}`;
  }, [takeoffJobId]);

  async function runFinish(opts?: { takeoffJobId?: string }) {
    if (inFlightRef.current || finishBusy) return;
    inFlightRef.current = true;
    setFinishBusy(true);
    setFinishError(null);
    setFinishNotice(null);
    try {
      const body = (await apiPost(
        `/api/elite100-studio-v2/cases/${encodeURIComponent(caseId)}/takeoff-finish`,
        authToken,
        {
          confirmed: true,
          takeoffJobId: opts?.takeoffJobId || takeoffJobId,
          clientMutationId: `v2-finish-${caseId}-${Date.now()}`
        }
      )) as Record<string, unknown>;
      setFinishNotice(
        String(body.message || "Takeoff scope is loaded into this draft.")
      );
      onFinished(body);
    } catch (e) {
      setFinishError(errorMessage(e));
    } finally {
      inFlightRef.current = false;
      setFinishBusy(false);
    }
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isAllowedTakeoffMessageOrigin(event.origin)) return;
      if (!isValidTakeoffApprovedMessage(event.data, takeoffJobId)) return;
      void runFinish({ takeoffJobId });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, caseId, takeoffJobId]);

  return (
    <section
      className="studio-v2-panel studio-v2-takeoff-review"
      data-testid="studio-v2-takeoff-review"
      id="studio-v2-takeoff-review"
    >
      <div className="studio-v2-panel__head">
        <div>
          <h2>AI Takeoff Review</h2>
          <p className="muted studio-v2-scope-editor__hint">
            Verify measurements while viewing the plan. When ready, click{" "}
            <strong>Use these measurements</strong> to load scope into this Studio V2 draft.
          </p>
        </div>
        <button
          type="button"
          className="eq-btn-primary"
          data-testid="studio-v2-use-measurements"
          disabled={finishBusy}
          onClick={() => void runFinish()}
          title="Save approved takeoff and load measurements into this draft"
        >
          {finishBusy ? "Loading measurements…" : "Use these measurements"}
        </button>
      </div>

      {scopeLoaded ? (
        <p className="studio-v2-notice" data-testid="studio-v2-takeoff-loaded">
          Takeoff scope is loaded into this draft.
        </p>
      ) : (
        <p className="muted" data-testid="studio-v2-takeoff-review-hint">
          Review measurements before using them in Studio V2.
        </p>
      )}

      {finishError ? (
        <div className="error-box" data-testid="studio-v2-takeoff-finish-error">
          {finishError}
        </div>
      ) : null}
      {finishNotice ? (
        <p className="studio-v2-notice" data-testid="studio-v2-takeoff-finish-notice">
          {finishNotice}
        </p>
      ) : null}

      <div className="studio-v2-takeoff-review__frame-wrap">
        <iframe
          title="AI Takeoff Review"
          src={takeoffSrc}
          className="studio-v2-takeoff-review__frame"
          data-testid="studio-v2-takeoff-review-iframe"
          allow="fullscreen"
        />
      </div>
    </section>
  );
}
