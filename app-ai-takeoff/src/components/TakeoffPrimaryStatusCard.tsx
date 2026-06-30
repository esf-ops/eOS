import EosSectionCard from "@eliteos-ui/EosSectionCard";
import EosStatusPill from "@eliteos-ui/EosStatusPill";
import React from "react";
import type { PrimaryCtaConfig } from "../lib/takeoffWorkflowUi";
import { longRunningGenerationHint } from "../lib/takeoffGenerationProgress.mjs";

export interface GenerationProgressDisplay {
  state: "indeterminate" | "determinate" | "complete" | "failed";
  percent: number | null;
  label: string;
  stepIndex: number | null;
  stepTotal: number;
  indeterminate: boolean;
}

interface SecondaryAction {
  label: string;
  onClick: () => void;
}

interface Props {
  taskTitle: string;
  statusLabel: string;
  statusHint?: string;
  nextAction: string;
  primaryCta: PrimaryCtaConfig;
  onPrimaryAction: (action: PrimaryCtaConfig["action"]) => void;
  secondaryActions?: SecondaryAction[];
  footerNotes?: React.ReactNode;
  generationProgress?: GenerationProgressDisplay | null;
  generationElapsedMs?: number;
}

function statusTone(label: string): "success" | "warn" | "info" | "neutral" {
  const lower = label.toLowerCase();
  if (lower.includes("approved") || lower.includes("imported")) return "success";
  if (lower.includes("needs") || lower.includes("draft")) return "warn";
  if (lower.includes("review complete") || lower.includes("generating")) return "info";
  return "neutral";
}

export default function TakeoffPrimaryStatusCard({
  taskTitle,
  statusLabel,
  statusHint,
  nextAction,
  primaryCta,
  onPrimaryAction,
  secondaryActions = [],
  footerNotes,
  generationProgress = null,
  generationElapsedMs = 0,
}: Props) {
  const showPrimary = primaryCta.action !== "none";
  const showGenerationPanel = Boolean(generationProgress && generationProgress.state !== "complete");
  const longHint = showGenerationPanel ? longRunningGenerationHint(generationElapsedMs) : null;
  const isFailedProgress = generationProgress?.state === "failed";

  return (
    <EosSectionCard className="takeoff-primary-status lab-card">
      <div className="takeoff-primary-status-head">
        <div>
          <p className="takeoff-primary-status-step">{taskTitle}</p>
          <div className="takeoff-primary-status-row">
            <EosStatusPill tone={statusTone(statusLabel)}>{statusLabel}</EosStatusPill>
            {statusHint && !showGenerationPanel ? (
              <span className="takeoff-primary-status-hint">{statusHint}</span>
            ) : null}
          </div>
        </div>
      </div>

      {showGenerationPanel ? (
        <div
          className={`takeoff-generation-progress${isFailedProgress ? " takeoff-generation-progress--failed" : ""}`}
          role="status"
          aria-live="polite"
        >
          <p className="takeoff-generation-progress-title">
            {isFailedProgress ? "AI takeoff could not finish" : "Generating AI takeoff…"}
          </p>
          {!isFailedProgress ? (
            <>
              <p className="takeoff-generation-progress-phase">{generationProgress.label}</p>
              {generationProgress.stepIndex != null ? (
                <p className="takeoff-generation-progress-step">
                  Step {generationProgress.stepIndex} of {generationProgress.stepTotal}
                </p>
              ) : null}
              <div
                className={`takeoff-generation-progress-bar${
                  generationProgress.indeterminate ? " takeoff-generation-progress-bar--indeterminate" : ""
                }`}
                aria-hidden={generationProgress.indeterminate}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={generationProgress.percent ?? undefined}
                role="progressbar"
              >
                <div
                  className="takeoff-generation-progress-bar-fill"
                  style={
                    generationProgress.indeterminate || generationProgress.percent == null
                      ? undefined
                      : { width: `${generationProgress.percent}%` }
                  }
                />
              </div>
              <p className="takeoff-generation-progress-helper">
                This can take a moment for large or multi-page plans.
              </p>
              {longHint ? <p className="takeoff-generation-progress-long">{longHint}</p> : null}
            </>
          ) : null}
        </div>
      ) : (
        <p className="takeoff-primary-status-next">{nextAction}</p>
      )}

      <div className="takeoff-primary-status-actions">
        {showPrimary ? (
          <button
            type="button"
            className="btn primary takeoff-primary-status-cta"
            disabled={primaryCta.disabled}
            title={primaryCta.title}
            onClick={() => onPrimaryAction(primaryCta.action)}
          >
            {primaryCta.label}
          </button>
        ) : null}
        {secondaryActions.map((action) => (
          <button
            key={action.label}
            type="button"
            className="btn secondary btn-sm takeoff-primary-status-secondary"
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>

      {footerNotes ? <div className="takeoff-primary-status-footer">{footerNotes}</div> : null}
    </EosSectionCard>
  );
}
