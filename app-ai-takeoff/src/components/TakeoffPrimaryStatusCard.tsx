import EosSectionCard from "@eliteos-ui/EosSectionCard";
import EosStatusPill from "@eliteos-ui/EosStatusPill";
import React from "react";
import type { PrimaryCtaConfig } from "../lib/takeoffWorkflowUi";

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
}

function statusTone(label: string): "success" | "warn" | "info" | "neutral" {
  const lower = label.toLowerCase();
  if (lower.includes("approved") || lower.includes("imported")) return "success";
  if (lower.includes("needs") || lower.includes("draft")) return "warn";
  if (lower.includes("review complete")) return "info";
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
}: Props) {
  const showPrimary = primaryCta.action !== "none";

  return (
    <EosSectionCard className="takeoff-primary-status lab-card">
      <div className="takeoff-primary-status-head">
        <div>
          <p className="takeoff-primary-status-step">{taskTitle}</p>
          <div className="takeoff-primary-status-row">
            <EosStatusPill tone={statusTone(statusLabel)}>{statusLabel}</EosStatusPill>
            {statusHint ? <span className="takeoff-primary-status-hint">{statusHint}</span> : null}
          </div>
        </div>
      </div>

      <p className="takeoff-primary-status-next">{nextAction}</p>

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
