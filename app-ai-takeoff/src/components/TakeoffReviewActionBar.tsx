import React from "react";
import EosStatusPill from "@eliteos-ui/EosStatusPill";

export interface ReviewActionBarPrimaryAction {
  label: string;
  action: string;
  disabled?: boolean;
  loading?: boolean;
  title?: string;
  roomId?: string;
  focusTarget?: { elementId?: string; blockerCode?: string; kind?: string } | null;
}

export interface ReviewActionBarSecondaryAction {
  label: string;
  action: string;
  roomId?: string;
}

export interface TakeoffReviewActionBarProps {
  visible: boolean;
  statusMessage: string;
  roomProgressLabel: string;
  selectedRoomName: string | null;
  selectedRoomVerified: boolean;
  unresolvedBlockerCount: number;
  globalBlockerCount?: number;
  primaryAction: ReviewActionBarPrimaryAction;
  secondaryAction?: ReviewActionBarSecondaryAction | null;
  onPrimaryAction: (action: ReviewActionBarPrimaryAction) => void;
  onSecondaryAction?: (action: ReviewActionBarSecondaryAction) => void;
}

function roomStatusTone(verified: boolean): "success" | "warn" | "neutral" {
  return verified ? "success" : "warn";
}

export default function TakeoffReviewActionBar({
  visible,
  statusMessage,
  roomProgressLabel,
  selectedRoomName,
  selectedRoomVerified,
  unresolvedBlockerCount,
  globalBlockerCount = 0,
  primaryAction,
  secondaryAction,
  onPrimaryAction,
  onSecondaryAction,
}: TakeoffReviewActionBarProps) {
  if (!visible) return null;

  return (
    <div className="takeoff-review-action-bar" role="region" aria-label="Review next steps">
      <div className="takeoff-review-action-bar-inner">
        <div className="takeoff-review-action-bar-main">
          <p className="takeoff-review-action-bar-progress">{roomProgressLabel}</p>
          <p className="takeoff-review-action-bar-message">{statusMessage}</p>
          <div className="takeoff-review-action-bar-meta">
            {selectedRoomName ? (
              <span className="takeoff-review-action-bar-room">
                Room: <strong>{selectedRoomName}</strong>
              </span>
            ) : null}
            <EosStatusPill tone={roomStatusTone(selectedRoomVerified)}>
              {selectedRoomVerified ? "Verified" : "Needs verification"}
            </EosStatusPill>
            {unresolvedBlockerCount > 0 ? (
              <span className="takeoff-review-action-bar-blockers">
                {unresolvedBlockerCount} room blocker{unresolvedBlockerCount !== 1 ? "s" : ""}
              </span>
            ) : null}
            {globalBlockerCount > 0 ? (
              <span className="takeoff-review-action-bar-blockers takeoff-review-action-bar-blockers--global">
                {globalBlockerCount} global item{globalBlockerCount !== 1 ? "s" : ""}
              </span>
            ) : null}
          </div>
        </div>
        <div className="takeoff-review-action-bar-actions">
          {secondaryAction ? (
            <button
              type="button"
              className="btn secondary takeoff-review-action-bar-secondary"
              onClick={() => onSecondaryAction?.(secondaryAction)}
            >
              {secondaryAction.label}
            </button>
          ) : null}
          <button
            type="button"
            className="btn primary takeoff-review-action-bar-primary"
            disabled={primaryAction.disabled}
            title={primaryAction.title}
            onClick={() => onPrimaryAction(primaryAction)}
          >
            {primaryAction.loading ? "…" : null}
            {primaryAction.label}
          </button>
        </div>
      </div>
    </div>
  );
}
