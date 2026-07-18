import React, { useEffect, useMemo, useState } from "react";
import {
  classifyQuoteIntakeError,
  createQuoteIntakeApiClient
} from "../lib/quoteIntakeApi.mjs";
import {
  caseCustomerProjectLabel,
  caseStatusLabel,
  safeText
} from "../lib/quoteIntakeFormat.mjs";
import { deriveEstimateTakeoffDisplayStatus } from "../lib/estimateTakeoffStatus.mjs";
import type { QuoteIntakeCaseDto } from "../lib/quoteIntakeTypes";
import { apiGet, ApiError } from "../lib/api";
import EstimateScopePanel from "./EstimateScopePanel";

type Props = {
  authToken: string;
  caseId: string;
  initialFocus?: "takeoff" | "scope" | "digital" | "review" | null;
  onBackToQueue: () => void;
};

type ReadyState = {
  kind: "ready";
  takeoffJobId: string;
  linkStatus: string;
  created: boolean;
  reused: boolean;
  attachmentName: string;
  persistenceWarning: string | null;
  caseRow: QuoteIntakeCaseDto | null;
  displayStatus: string;
  scopeRefreshKey: number;
};

type OpenState =
  | { kind: "resolving" }
  | ReadyState
  | { kind: "error"; message: string; code?: string };

function aiTakeoffHeadUrl(): string {
  const raw = String(import.meta.env.VITE_HEAD_URL_AI_TAKEOFF ?? "").trim();
  return raw.replace(/\/+$/, "") || "http://localhost:5186";
}

/**
 * Linked Takeoff workspace — resolves/creates intake→takeoff link, then embeds
 * the existing production AI Takeoff review UI for that job id.
 */
export default function EstimateTakeoffWorkspace({
  authToken,
  caseId,
  initialFocus = "takeoff",
  onBackToQueue
}: Props) {
  const client = useMemo(() => createQuoteIntakeApiClient(), []);
  const [state, setState] = useState<OpenState>({ kind: "resolving" });

  useEffect(() => {
    let cancelled = false;
    async function open() {
      setState({ kind: "resolving" });
      try {
        const opened = await client.openEstimate(authToken, caseId);
        if (cancelled) return;
        const takeoffJobId = String(opened.takeoffJobId ?? "").trim();
        if (!takeoffJobId) {
          setState({
            kind: "error",
            message: "Open Estimate did not return a takeoff job.",
            code: "takeoff_unavailable"
          });
          return;
        }

        let caseRow: QuoteIntakeCaseDto | null = null;
        try {
          caseRow = (await client.getCase(authToken, caseId)) as QuoteIntakeCaseDto;
        } catch {
          caseRow = null;
        }

        let jobStatus = "";
        let reviewStatus = "";
        try {
          const job = (await apiGet(
            `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}`,
            authToken
          )) as { status?: string; reviewStatus?: string };
          jobStatus = String(job.status ?? "");
          reviewStatus = String(job.reviewStatus ?? "");
        } catch {
          // Non-fatal — link still usable; embed Takeoff head for details.
        }

        setState({
          kind: "ready",
          takeoffJobId,
          linkStatus: String(opened.linkStatus ?? "queued"),
          created: Boolean(opened.created),
          reused: Boolean(opened.reused),
          attachmentName: String(opened.attachmentName ?? "plan.pdf"),
          persistenceWarning:
            typeof opened.persistenceWarning === "string" ? opened.persistenceWarning : null,
          caseRow,
          displayStatus: deriveEstimateTakeoffDisplayStatus({
            takeoffJobId,
            linkStatus: opened.linkStatus,
            jobStatus,
            reviewStatus
          }),
          scopeRefreshKey: 0
        });
      } catch (err) {
        if (cancelled) return;
        const classified = classifyQuoteIntakeError(err);
        const code =
          err && typeof err === "object" && "body" in err
            ? String((err as { body?: { code?: string } }).body?.code ?? "")
            : "";
        const message =
          err instanceof ApiError
            ? err.message
            : classified.message || "Unable to open estimate";
        setState({ kind: "error", message, code: code || classified.kind });
      }
    }
    void open();
    return () => {
      cancelled = true;
    };
  }, [authToken, caseId, client]);

  useEffect(() => {
    if (state.kind !== "ready") return;
    const focus = initialFocus || "takeoff";
    window.setTimeout(() => {
      if (focus === "scope" || focus === "digital") {
        document
          .querySelector('[data-testid="estimate-scope-panel"]')
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (focus === "review") {
        document
          .querySelector('[data-testid="estimate-digital-estimate-panel"], [data-testid="estimate-scope-panel"]')
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        document
          .querySelector('[data-testid="eq-takeoff-iframe"]')
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 120);
  }, [state.kind, initialFocus]);

  const takeoffSrc =
    state.kind === "ready"
      ? `${aiTakeoffHeadUrl()}/?takeoffJobId=${encodeURIComponent(state.takeoffJobId)}&consolidated=1`
      : null;

  useEffect(() => {
    if (state.kind !== "ready") return;
    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== "eliteos-takeoff-approved") return;
      if (String(data.takeoffJobId ?? "") !== state.takeoffJobId) return;
      setState((prev) => {
        if (prev.kind !== "ready") return prev;
        return {
          ...prev,
          displayStatus: "Approved",
          scopeRefreshKey: prev.scopeRefreshKey + 1
        };
      });
      window.setTimeout(() => {
        document
          .querySelector('[data-testid="estimate-scope-panel"]')
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [state]);

  return (
    <div className="eq-workspace" data-testid="estimate-takeoff-workspace">
      <header className="eq-header">
        <div>
          <h1 className="eq-title">Estimate workspace</h1>
          <p className="eq-subtitle">
            Linked production AI Takeoff review for this Estimate Queue case.
          </p>
        </div>
        <div className="eq-header-actions">
          <button type="button" className="eq-btn-secondary" onClick={onBackToQueue}>
            Back to Estimate Queue
          </button>
        </div>
      </header>

      {state.kind === "resolving" ? (
        <div className="eq-state" role="status" data-testid="eq-open-resolving">
          Resolving Takeoff link for this case…
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="eq-state eq-state--error" role="alert" data-testid="eq-open-error">
          <strong>Could not open estimate.</strong> {state.message}
          {state.code ? <p className="eq-muted">Code: {state.code}</p> : null}
          <div className="eq-action-row">
            <button type="button" className="eq-btn-secondary" onClick={onBackToQueue}>
              Back to Estimate Queue
            </button>
          </div>
        </div>
      ) : null}

      {state.kind === "ready" ? (
        <>
          {state.persistenceWarning ? (
            <div className="eq-state eq-state--warn" role="status">
              {state.persistenceWarning}
            </div>
          ) : null}
          <section className="eq-case-context" aria-label="Case context">
            <div>
              <div className="eq-cell-primary">
                {state.caseRow ? caseCustomerProjectLabel(state.caseRow) : "Estimate case"}
              </div>
              <div className="eq-cell-meta">Case {caseId}</div>
            </div>
            <div>
              <div className="eq-muted">Intake status</div>
              <div>{state.caseRow ? caseStatusLabel(state.caseRow) : "—"}</div>
            </div>
            <div>
              <div className="eq-muted">Attachment</div>
              <div>{safeText(state.attachmentName, "plan.pdf")}</div>
            </div>
            <div>
              <div className="eq-muted">Takeoff status</div>
              <div data-testid="eq-takeoff-display-status">{state.displayStatus}</div>
            </div>
            <div>
              <div className="eq-muted">Takeoff job</div>
              <div>
                <code data-testid="eq-linked-takeoff-job">{state.takeoffJobId}</code>
                <span className="eq-muted">
                  {" "}
                  · {state.reused ? "reused link" : state.created ? "created" : "linked"}
                </span>
              </div>
            </div>
          </section>

          <div className="eq-takeoff-frame-wrap">
            <iframe
              title="AI Takeoff review"
              className="eq-takeoff-frame"
              data-testid="eq-takeoff-iframe"
              src={takeoffSrc ?? undefined}
              referrerPolicy="no-referrer"
            />
          </div>
          <p className="eq-footnote">
            Review the plan and edit the Takeoff worksheet above. Click{" "}
            <strong>Approve Takeoff &amp; Build Estimate</strong> to seed Estimate Scope below.
          </p>

          <EstimateScopePanel
            authToken={authToken}
            caseId={caseId}
            takeoffJobId={state.takeoffJobId}
            takeoffDisplayStatus={state.displayStatus}
            refreshKey={state.scopeRefreshKey}
            customerHint={
              state.caseRow
                ? String(state.caseRow.customerName || state.caseRow.customer || "")
                : ""
            }
            projectHint={
              state.caseRow ? String(state.caseRow.projectName || state.caseRow.project || "") : ""
            }
          />
        </>
      ) : null}
    </div>
  );
}
