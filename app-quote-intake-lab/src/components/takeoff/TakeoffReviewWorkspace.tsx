import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { QuoteIntakeAttachment, QuoteIntakeCase, QuoteIntakeRepository } from "../../domain/types";
import {
  DEFAULT_SIMULATED_SCENARIO_ID,
  listSimulatedScenarioOptions,
  scenarioLabel
} from "../../takeoff/scenarioCatalog.mjs";
import { getLiveGeminiTakeoffAdapter } from "../../takeoff/liveGeminiTakeoffAdapter.mjs";
import { sha256Hex } from "../../takeoff/sha256.mjs";
import {
  SYNTHETIC_LIVE_GATE_MESSAGE,
  isApprovedSyntheticLiveHash
} from "../../takeoff/syntheticLiveAllowlist.mjs";
import {
  resolveTakeoffWorkspaceMode,
  takeoffWorkspaceBannerCopy
} from "../../takeoff/takeoffWorkspaceProvenance.mjs";
import {
  evaluateTakeoffEligibility,
  groupWarningsBySeverity,
  warningRequiredAction
} from "../../takeoff/takeoffEligibility.mjs";
import {
  TAKEOFF_PROVENANCE,
  formatMeasuredTakeoffSf,
  formatTakeoffSf,
  labelTakeoffStatus,
  runProvenanceNote,
  sfDifference
} from "../../takeoff/takeoffDisplay.mjs";
import { caseTitle, formatReceived } from "../../utils/format";
import TakeoffCorrectionPanel from "./TakeoffCorrectionPanel";

const LIVE_PROGRESS_STAGES = [
  "Uploading synthetic attachment",
  "Inventory pass",
  "Evidence pass",
  "Geometry/verification pass",
  "Deterministic calculation",
  "Persisting run"
] as const;

type TakeoffRun = {
  id: string;
  caseId: string;
  attachmentId?: string;
  attachmentContentHash?: string;
  acceptedIntakeSnapshotId?: string;
  provider?: { name?: string; mode?: string; version?: string; note?: string };
  startedAt?: string;
  completedAt?: string | null;
  labTakeoffStatus?: string;
  scenarioId?: string;
  pages?: unknown[];
  rooms?: TakeoffRoom[];
  evidence?: TakeoffEvidence[];
  warnings?: TakeoffWarning[];
  calculation?: Record<string, number | string | null | undefined>;
  confidence?: string | null;
  failure?: { code?: string; message?: string } | null;
  humanReviewState?: string;
  liveMeta?: {
    inventoryPromptVersion?: string;
    evidencePromptVersion?: string;
    geometryPromptVersion?: string;
    passes?: Record<string, unknown>;
  };
};

type TakeoffRoom = {
  id: string;
  name: string;
  roomType?: string;
  confidence?: string;
  measuredCountertopSf?: number;
  measuredBacksplashSf?: number;
  pieces?: TakeoffPiece[];
};

type TakeoffPiece = {
  id: string;
  label: string;
  measurement?: {
    lengthIn?: number | null;
    depthIn?: number | null;
    shape?: string;
    pieceType?: string;
    measuredSf?: number;
    evidenceIds?: string[];
  };
  cutouts?: Array<{ type?: string; label?: string }>;
  backsplashScope?: string | null;
  requiresEstimatorReview?: boolean;
  notes?: string[];
};

type TakeoffEvidence = {
  id: string;
  pageNumber?: number;
  label?: string;
  value?: unknown;
  unit?: string | null;
  simulatedNote?: string;
  locationNote?: string;
};

type TakeoffWarning = {
  code: string;
  severity: string;
  message: string;
  roomId?: string | null;
  pieceId?: string | null;
  field?: string | null;
  blocking?: boolean;
  estimatorActionRequired?: boolean;
};

type Props = {
  caseItem: QuoteIntakeCase;
  repo: QuoteIntakeRepository;
  actorLabel: string;
  onBackToQueue: () => void;
  onCaseMutated: () => void;
  /** Notifies app shell when workspace provenance mode changes (topbar / isolation banner). */
  onWorkspaceModeChange?: (mode: "simulated" | "live") => void;
};

function ProvenanceChip({ children }: { children: string }) {
  return <span className="qil-toff-prov">{children}</span>;
}

export default function TakeoffReviewWorkspace({
  caseItem,
  repo,
  actorLabel,
  onBackToQueue,
  onCaseMutated,
  onWorkspaceModeChange
}: Props) {
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const [runs, setRuns] = useState<TakeoffRun[]>([]);
  const [inspectRunId, setInspectRunId] = useState<string | null>(null);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState(DEFAULT_SIMULATED_SCENARIO_ID);
  const [providerMode, setProviderMode] = useState<"simulated" | "live">("simulated");
  const [liveAck, setLiveAck] = useState(false);
  const [liveHealth, setLiveHealth] = useState<string>("idle");
  const [liveHealthDetail, setLiveHealthDetail] = useState<string>("");
  const [liveProgress, setLiveProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>({});
  const [correctionMode, setCorrectionMode] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const bytesReadForRunRef = useRef(false);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scenarios = useMemo(() => listSimulatedScenarioOptions(), []);

  const load = useCallback(async () => {
    const snap = repo.getAcceptedSnapshot ? await repo.getAcceptedSnapshot(caseItem.id) : null;
    setSnapshot(snap);
    const list = (repo.listTakeoffRuns ? await repo.listTakeoffRuns(caseItem.id) : []) as TakeoffRun[];
    setRuns(list);
    setInspectRunId((prev) => (prev && list.some((r) => r.id === prev) ? prev : list[0]?.id ?? null));
  }, [repo, caseItem.id]);

  useEffect(() => {
    void load();
  }, [load, caseItem.latestTakeoffRunId, caseItem.acceptedSnapshotId]);

  // Provider selection never carries silently between cases.
  useEffect(() => {
    setProviderMode("simulated");
    setLiveAck(false);
    setLiveHealth("idle");
    setLiveHealthDetail("");
    setLiveProgress(null);
    setError(null);
    setCorrectionMode(false);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    bytesReadForRunRef.current = false;
  }, [caseItem.id]);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  async function refreshLiveHealth() {
    const h = await getLiveGeminiTakeoffAdapter().health();
    if (!h.ok) {
      setLiveHealth(h.status ?? "unavailable");
      setLiveHealthDetail(String(h.code ?? ""));
      return;
    }
    setLiveHealth("ready");
    setLiveHealthDetail(
      `provider=${h.provider ?? "gemini"} · modelConfigured=${h.modelConfigured ? "yes" : "no"}`
    );
  }

  useEffect(() => {
    if (providerMode === "live") void refreshLiveHealth();
  }, [providerMode]);

  const gate = useMemo(
    () =>
      evaluateTakeoffEligibility({
        caseItem,
        acceptedSnapshot: snapshot as object | null,
        selectedAttachmentId
      }),
    [caseItem, snapshot, selectedAttachmentId]
  );

  useEffect(() => {
    const supported = gate.supportedAttachments as QuoteIntakeAttachment[];
    if (!selectedAttachmentId && supported.length === 1) {
      setSelectedAttachmentId(supported[0].id);
    }
  }, [gate.supportedAttachments, selectedAttachmentId]);

  const supportedAttachments = gate.supportedAttachments as QuoteIntakeAttachment[];
  const selectedAttachment: QuoteIntakeAttachment | null =
    supportedAttachments.find((a) => a.id === (selectedAttachmentId ?? gate.selectedAttachmentId)) ?? null;

  const inspectRun = runs.find((r) => r.id === inspectRunId) ?? null;
  const latestId = caseItem.latestTakeoffRunId ?? runs[0]?.id ?? null;
  const inspectingHistorical = Boolean(inspectRun && latestId && inspectRun.id !== latestId);

  const workspaceMode = useMemo(
    () =>
      resolveTakeoffWorkspaceMode({
        providerSelection: providerMode,
        selectedRun: inspectRun
      }),
    [providerMode, inspectRun]
  );
  const workspaceBanner = useMemo(() => takeoffWorkspaceBannerCopy(workspaceMode), [workspaceMode]);

  useEffect(() => {
    onWorkspaceModeChange?.(workspaceMode);
  }, [workspaceMode, onWorkspaceModeChange]);

  const statedSf =
    caseItem.statedSquareFootage ?? caseItem.proposedSquareFootage ?? null;
  const calc = inspectRun?.calculation ?? null;
  const runFailed =
    inspectRun?.labTakeoffStatus === "qil_takeoff_failed" || Boolean(inspectRun?.failure);
  const measuredCt = runFailed ? null : (calc?.measuredCountertopSf ?? null);
  const measuredBs = runFailed ? null : (calc?.measuredBacksplashSf ?? null);
  const measuredFhb = runFailed ? null : (calc?.measuredFhbSf ?? null);
  const measuredCombined = runFailed ? null : (calc?.measuredCombinedSf ?? null);
  const providerProposed = runFailed ? null : (calc?.providerProposedCombinedSf ?? null);
  const sinkCount = runFailed ? null : (calc?.sinkCutoutCount ?? null);
  /** measured − stated and measured − provider (positive means measured larger). */
  const measuredMinusStated = runFailed
    ? null
    : sfDifference(statedSf as number | null, measuredCombined as number | null);
  const measuredMinusProvider = runFailed
    ? null
    : sfDifference(providerProposed as number | null, measuredCombined as number | null);

  const warningGroups = useMemo(() => {
    const grouped = groupWarningsBySeverity(inspectRun?.warnings ?? []);
    return {
      approval_blocking: grouped.approval_blocking as TakeoffWarning[],
      estimator_review: grouped.estimator_review as TakeoffWarning[],
      informational: grouped.informational as TakeoffWarning[]
    };
  }, [inspectRun]);

  const evidenceById = useMemo(() => {
    const map = new Map<string, TakeoffEvidence>();
    for (const e of inspectRun?.evidence ?? []) {
      if (e?.id) map.set(e.id, e);
    }
    return map;
  }, [inspectRun]);

  const selectedIsApprovedSynthetic = isApprovedSyntheticLiveHash(selectedAttachment?.contentHash);
  const canRunSimulated = Boolean(repo.runTakeoff) && !busy && gate.canRun;
  const canRunLive =
    Boolean(repo.runTakeoff) &&
    !busy &&
    gate.canRun &&
    providerMode === "live" &&
    liveAck &&
    selectedIsApprovedSynthetic &&
    liveHealth === "ready";

  function clearProgressTimer() {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }

  function startApproxProgress() {
    clearProgressTimer();
    let idx = 0;
    setLiveProgress(`${LIVE_PROGRESS_STAGES[0]} (approximate)`);
    progressTimerRef.current = setInterval(() => {
      idx = Math.min(idx + 1, LIVE_PROGRESS_STAGES.length - 1);
      setLiveProgress(`${LIVE_PROGRESS_STAGES[idx]} (approximate)`);
      if (idx >= LIVE_PROGRESS_STAGES.length - 1) clearProgressTimer();
    }, 4500);
  }

  async function onRunSimulated() {
    if (!repo.runTakeoff || !canRunSimulated) return;
    const attachmentId = selectedAttachmentId ?? gate.selectedAttachmentId;
    if (!attachmentId) {
      setError("Select exactly one supported plan attachment.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const out = (await repo.runTakeoff(caseItem.id, {
        selectedAttachmentId: attachmentId,
        actorLabel,
        scenarioId,
        providerMode: "simulated",
        transmissionAcknowledgmentPlaceholder: true
      })) as { runId?: string; ok?: boolean; status?: string; run?: TakeoffRun };
      await load();
      if (out?.runId) setInspectRunId(out.runId);
      if (out && out.ok === false) {
        setError(
          out.run?.failure?.message
            ? `Simulated takeoff failed: ${out.run.failure.message}`
            : `Simulated takeoff ended in ${labelTakeoffStatus(out.status)}.`
        );
      }
      onCaseMutated();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function onRunLive() {
    if (!repo.runTakeoff || !canRunLive || !selectedAttachment) return;
    if (!liveAck) {
      setError("Acknowledge the live transmission warning before running live takeoff.");
      return;
    }
    if (!selectedIsApprovedSynthetic) {
      setError(SYNTHETIC_LIVE_GATE_MESSAGE);
      return;
    }
    if (!repo.getAttachmentBytes) {
      setError("Attachment byte access is unavailable in this repository.");
      return;
    }

    setBusy(true);
    setError(null);
    startApproxProgress();
    let contentBytes: Uint8Array | null = null;
    try {
      contentBytes = await repo.getAttachmentBytes(caseItem.id, selectedAttachment.id);
      bytesReadForRunRef.current = true;
      if (!contentBytes?.byteLength) {
        throw Object.assign(new Error("Selected attachment bytes were not found in local storage."), {
          code: "ATTACHMENT_BYTES_MISSING"
        });
      }
      const actualHash = await sha256Hex(contentBytes);
      if (actualHash !== String(selectedAttachment.contentHash ?? "").toLowerCase()) {
        throw Object.assign(new Error("Computed SHA-256 does not match persisted attachment metadata."), {
          code: "HASH_MISMATCH"
        });
      }

      const out = (await repo.runTakeoff(caseItem.id, {
        selectedAttachmentId: selectedAttachment.id,
        actorLabel,
        providerMode: "live",
        liveTransmissionAcknowledged: true,
        contentBytes
      })) as { runId?: string; ok?: boolean; status?: string; run?: TakeoffRun; code?: string };

      contentBytes = null;
      setLiveProgress("Persisting run");
      await load();
      if (out?.runId) setInspectRunId(out.runId);
      if (out && out.ok === false) {
        setError(
          out.run?.failure?.message
            ? `Live takeoff failed: ${out.run.failure.code ?? "ERROR"} — ${out.run.failure.message}`
            : `Live takeoff ended in ${labelTakeoffStatus(out.status)} (${out.code ?? "error"}).`
        );
      }
      onCaseMutated();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      contentBytes = null;
      clearProgressTimer();
      setLiveProgress(null);
      setBusy(false);
    }
  }

  async function onPreviewSyntheticPlan() {
    if (!selectedAttachment || !repo.getAttachmentBytes || previewBusy) return;
    if (!isApprovedSyntheticLiveHash(selectedAttachment.contentHash)) {
      setError(SYNTHETIC_LIVE_GATE_MESSAGE);
      return;
    }
    setPreviewBusy(true);
    setError(null);
    try {
      const bytes = await repo.getAttachmentBytes(caseItem.id, selectedAttachment.id);
      if (!bytes?.byteLength) throw new Error("Local attachment bytes unavailable for preview.");
      const hash = await sha256Hex(bytes);
      if (hash !== String(selectedAttachment.contentHash).toLowerCase()) {
        throw new Error("Preview hash mismatch — refusing to open local preview.");
      }
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        const copy = new Uint8Array(bytes.byteLength);
        copy.set(bytes);
        const blob = new Blob([copy], { type: "application/pdf" });
        return URL.createObjectURL(blob);
      });
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setPreviewBusy(false);
    }
  }

  function closePreview() {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }

  function toggleRoom(roomId: string) {
    setExpandedRooms((prev) => ({ ...prev, [roomId]: !(prev[roomId] ?? true) }));
  }

  const inspectIsLive = inspectRun?.provider?.mode === "live";

  return (
    <div className="qil-toff-workspace" data-testid="takeoff-review-workspace">
      <header className="qil-toff-workspace-header">
        <div className="qil-toff-workspace-header-text">
          <p className="qil-eyebrow">
            Takeoff Review · {caseItem.id}
            {caseItem.dataSource === "imported" ? (
              <span className="qil-source-pill">Imported</span>
            ) : (
              <span className="qil-source-pill is-fixture">Fixture</span>
            )}
          </p>
          <h1>{caseTitle(caseItem)}</h1>
          <p className="qil-toff-workspace-sub">
            <span>{caseItem.customerAccount}</span>
            <span aria-hidden="true">·</span>
            <span>{caseItem.projectName}</span>
            <span aria-hidden="true">·</span>
            <span>{caseItem.projectAddress}</span>
          </p>
        </div>
        <button type="button" className="qil-btn-secondary" onClick={onBackToQueue}>
          Back to queue
        </button>
      </header>

      <div
        className={`qil-toff-sim-banner${workspaceBanner.isLive ? " is-live" : ""}`}
        role="status"
      >
        <strong>{workspaceBanner.title}</strong>
        {workspaceBanner.lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>

      {!gate.canOpenWorkspace ? (
        <section className="qil-toff-gate" aria-label="Takeoff eligibility">
          <h2>Takeoff Review unavailable</h2>
          <ul>
            {gate.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <button type="button" className="qil-btn-secondary" onClick={onBackToQueue}>
            Back to queue
          </button>
        </section>
      ) : (
        <div className="qil-toff-panes">
          <aside className="qil-toff-pane qil-toff-pane-plan" aria-label="Plan attachment pane">
            <h2>Plan attachment</h2>
            <p className="qil-cell-meta">
              Select exactly one supported attachment by metadata. Simulated mode never reads bytes. Live mode reads
              local IndexedDB bytes only after acknowledgment and Run.
            </p>
            <p className="qil-cell-meta qil-toff-inline-warn">{SYNTHETIC_LIVE_GATE_MESSAGE}</p>

            <ul className="qil-toff-att-list">
              {supportedAttachments.map((att) => {
                const checked = (selectedAttachmentId ?? gate.selectedAttachmentId) === att.id;
                return (
                  <li key={att.id}>
                    <label className={checked ? "is-selected" : undefined}>
                      <input
                        type="radio"
                        name="toff-att"
                        checked={checked}
                        onChange={() => setSelectedAttachmentId(att.id)}
                      />
                      <span>
                        <strong>{att.filename}</strong>
                        <small>
                          {att.contentType}
                          {att.sizeBytes != null ? ` · ${att.sizeBytes} bytes` : ""}
                          {att.contentHash ? ` · sha256:${att.contentHash.slice(0, 12)}…` : ""}
                        </small>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            {gate.requiresAttachmentSelection && !selectedAttachmentId ? (
              <p className="qil-toff-inline-warn">Multiple attachments require selection.</p>
            ) : null}

            <div className="qil-toff-plan-placeholder" aria-label="Plan preview">
              <p className="qil-toff-plan-placeholder-title">
                {selectedIsApprovedSynthetic
                  ? "Local synthetic plan preview"
                  : "Plan preview limited to approved synthetic fixtures"}
              </p>
              <p>
                Preview loads from local IndexedDB only — no network. Not synchronized with evidence overlays yet.
              </p>
              {selectedAttachment ? (
                <dl className="qil-dl qil-toff-att-meta">
                  <div>
                    <dt>Filename</dt>
                    <dd>{selectedAttachment.filename}</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>{selectedAttachment.contentType}</dd>
                  </div>
                  <div>
                    <dt>Size</dt>
                    <dd>{selectedAttachment.sizeBytes != null ? `${selectedAttachment.sizeBytes} bytes` : "—"}</dd>
                  </div>
                  <div>
                    <dt>Hash</dt>
                    <dd className="qil-mono">{selectedAttachment.contentHash ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Live allowlist</dt>
                    <dd>{selectedIsApprovedSynthetic ? "Approved synthetic" : "Blocked for live"}</dd>
                  </div>
                </dl>
              ) : null}
              <div className="qil-toff-run-actions">
                <button
                  type="button"
                  className="qil-btn-secondary"
                  disabled={!selectedIsApprovedSynthetic || previewBusy || busy}
                  onClick={() => void onPreviewSyntheticPlan()}
                >
                  {previewBusy ? "Loading preview…" : "Preview synthetic plan"}
                </button>
                {previewUrl ? (
                  <button type="button" className="qil-btn-secondary" onClick={closePreview}>
                    Close preview
                  </button>
                ) : null}
              </div>
              {previewUrl ? (
                <iframe
                  title="Local synthetic plan preview"
                  className="qil-toff-plan-preview"
                  src={previewUrl}
                />
              ) : null}
            </div>

            {inspectRun?.evidence?.length ? (
              <section className="qil-toff-evidence-list">
                <h3>{inspectIsLive ? "Live evidence references" : "Simulated evidence references"}</h3>
                <p className="qil-cell-meta">
                  {inspectIsLive
                    ? "Provider-extracted evidence — verify against the plan; not authoritative for SF."
                    : "Fixture callouts — not extracted from the attachment."}
                </p>
                <ul>
                  {(inspectRun.evidence as TakeoffEvidence[]).map((ev) => (
                    <li key={ev.id}>
                      <strong>{ev.label}</strong>
                      <span>
                        {String(ev.value ?? "—")}
                        {ev.unit ? ` ${ev.unit}` : ""} · page {ev.pageNumber ?? "?"}
                      </span>
                      <small>{ev.simulatedNote ?? "Simulated fixture evidence."}</small>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </aside>

          <section className="qil-toff-pane qil-toff-pane-results" aria-label="Takeoff results">
            {correctionMode && inspectRun ? (
              <TakeoffCorrectionPanel
                caseItem={caseItem}
                repo={repo}
                sourceRun={inspectRun}
                actorLabel={actorLabel}
                onExit={() => setCorrectionMode(false)}
                onMutated={onCaseMutated}
              />
            ) : null}

            {!correctionMode ? (
            <>
            <section className="qil-toff-block">
              <h2>Run controls</h2>
              <fieldset className="qil-toff-provider-select" disabled={busy}>
                <legend>Takeoff provider</legend>
                <label>
                  <input
                    type="radio"
                    name="toff-provider"
                    checked={providerMode === "simulated"}
                    onChange={() => {
                      setProviderMode("simulated");
                      setLiveAck(false);
                      setLiveProgress(null);
                    }}
                  />
                  Simulated takeoff (default)
                </label>
                <label>
                  <input
                    type="radio"
                    name="toff-provider"
                    checked={providerMode === "live"}
                    onChange={() => setProviderMode("live")}
                  />
                  Live Gemini takeoff
                </label>
              </fieldset>

              {providerMode === "simulated" ? (
                <>
                  <label className="qil-toff-scenario">
                    <span>Simulated test scenario</span>
                    <select
                      value={scenarioId}
                      onChange={(e) => setScenarioId(e.target.value)}
                      disabled={busy}
                    >
                      {scenarios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="qil-cell-meta">
                    The selected scenario does <strong>not</strong> inspect the attachment. Geometry comes from a
                    deterministic lab fixture. Never treat this as live AI takeoff evidence.
                  </p>
                  <div className="qil-toff-run-actions">
                    <button
                      type="button"
                      className="qil-btn-primary"
                      disabled={!canRunSimulated}
                      onClick={() => void onRunSimulated()}
                    >
                      {busy ? "Running simulated takeoff…" : "Run simulated takeoff"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="qil-toff-live-health" role="status">
                    <strong>Server / takeoff health:</strong>{" "}
                    <span data-testid="live-takeoff-health">{liveHealth}</span>
                    {liveHealthDetail ? <span className="qil-cell-meta"> · {liveHealthDetail}</span> : null}
                    <button
                      type="button"
                      className="qil-btn-secondary"
                      disabled={busy}
                      onClick={() => void refreshLiveHealth()}
                    >
                      Refresh
                    </button>
                  </div>
                  <p className="qil-cell-meta">{SYNTHETIC_LIVE_GATE_MESSAGE}</p>
                  {!selectedIsApprovedSynthetic ? (
                    <p className="qil-toff-inline-warn">
                      Selected attachment is not an approved synthetic fixture hash — live run disabled.
                    </p>
                  ) : null}
                  <div className="qil-toff-live-ack" data-testid="live-takeoff-ack">
                    <h3>Live transmission acknowledgment</h3>
                    <ul>
                      <li>The selected attachment will be sent to Gemini via the isolated lab server.</li>
                      <li>
                        File: {selectedAttachment?.filename ?? "—"} · {selectedAttachment?.contentType ?? "—"} ·{" "}
                        {selectedAttachment?.sizeBytes != null
                          ? `${selectedAttachment.sizeBytes} bytes`
                          : "—"}
                      </li>
                      <li className="qil-mono">
                        SHA-256: {selectedAttachment?.contentHash ?? "—"}
                      </li>
                      <li>Only the selected attachment will be sent.</li>
                      <li>
                        Optional classification hints (stated SF / sink count) may be included; email body is not
                        uploaded as plan bytes.
                      </li>
                      <li>No pricing or Quote Library data is sent.</li>
                      <li>Results remain non-authoritative — estimator review and acceptance are required.</li>
                    </ul>
                    <label>
                      <input
                        type="checkbox"
                        checked={liveAck}
                        disabled={busy || !selectedIsApprovedSynthetic}
                        onChange={(e) => setLiveAck(e.target.checked)}
                      />
                      I acknowledge this synthetic attachment will be transmitted to Gemini through the lab
                      loopback server.
                    </label>
                  </div>
                  <div className="qil-toff-run-actions">
                    <button
                      type="button"
                      className="qil-btn-primary"
                      disabled={!canRunLive}
                      onClick={() => void onRunLive()}
                    >
                      {busy ? "Running live takeoff…" : "Run live takeoff"}
                    </button>
                  </div>
                  {liveProgress ? (
                    <p className="qil-toff-live-progress" role="status" data-testid="live-takeoff-progress">
                      {liveProgress}
                    </p>
                  ) : null}
                </>
              )}

              {!gate.canRun ? (
                <span className="qil-cell-meta">
                  {gate.reasons.find((r) => r.includes("selection") || r.includes("Selected")) ??
                    "Complete eligibility requirements to run."}
                </span>
              ) : null}
              {error ? <p className="qil-toff-error">{error}</p> : null}
              <span className="visually-hidden" data-testid="bytes-read-flag">
                {bytesReadForRunRef.current ? "bytes-read" : "bytes-unread"}
              </span>
            </section>

            {inspectRun ? (
              <>
                {inspectingHistorical ? (
                  <p className="qil-toff-historical" role="status">
                    Inspecting historical run {inspectRun.id} — latest remains {latestId}.
                  </p>
                ) : null}

                {inspectRun.labTakeoffStatus === "qil_takeoff_manual_review" ? (
                  <div className="qil-toff-manual" role="status">
                    <strong>Manual review required</strong>
                    <span>
                      Simulated scenario surfaced missing/conflicting/irregular geometry. This is not a system
                      crash.
                    </span>
                  </div>
                ) : null}

                {inspectRun.labTakeoffStatus === "qil_takeoff_failed" ? (
                  <div className="qil-toff-failed" role="alert">
                    <strong>Failed run — no measured result produced</strong>
                    <span>
                      {inspectRun.failure?.code ?? "TAKEOFF_FAILURE"}:{" "}
                      {inspectRun.failure?.message ?? "Safe failure metadata only."}
                    </span>
                    <span className="qil-cell-meta">
                      Measured CT / backsplash / combined SF / sink count are unavailable (shown as —), not zero.
                      Prior successful runs and overlay values are retained when present. Retry creates a new
                      immutable run.
                    </span>
                  </div>
                ) : null}

                <section className="qil-toff-block">
                  <h2>Takeoff summary</h2>
                  <p className="qil-cell-meta">{runProvenanceNote(inspectRun)}</p>
                  <p className="qil-toff-run-meta">
                    <span>
                      State: <strong>{labelTakeoffStatus(inspectRun.labTakeoffStatus)}</strong>
                    </span>
                    <span>
                      Provider: {inspectRun.provider?.name} · {inspectRun.provider?.mode} ·{" "}
                      {inspectRun.provider?.version}
                    </span>
                    {inspectIsLive ? (
                      <span>
                        Live prompts: {inspectRun.liveMeta?.inventoryPromptVersion ?? "—"} /{" "}
                        {inspectRun.liveMeta?.evidencePromptVersion ?? "—"} /{" "}
                        {inspectRun.liveMeta?.geometryPromptVersion ?? "—"}
                      </span>
                    ) : (
                      <span>Scenario: {scenarioLabel(inspectRun.scenarioId)}</span>
                    )}
                    <span>Completed: {formatReceived(inspectRun.completedAt ?? inspectRun.startedAt ?? "")}</span>
                    <span className="qil-mono">
                      Attachment hash: {(inspectRun.attachmentContentHash ?? "").slice(0, 16)}…
                    </span>
                    <ProvenanceChip>{TAKEOFF_PROVENANCE.UNREVIEWED}</ProvenanceChip>
                    <ProvenanceChip>
                      {inspectIsLive ? TAKEOFF_PROVENANCE.LIVE_GEMINI : TAKEOFF_PROVENANCE.SIMULATED_TAKEOFF}
                    </ProvenanceChip>
                    <ProvenanceChip>{TAKEOFF_PROVENANCE.DETERMINISTIC}</ProvenanceChip>
                    <ProvenanceChip>{TAKEOFF_PROVENANCE.PROVIDER_TOTALS_NON_AUTHORITATIVE}</ProvenanceChip>
                  </p>

                  <div className="qil-toff-compare" aria-label="Stated versus measured comparison">
                    <article>
                      <h3>Customer-stated SF</h3>
                      <p className="qil-toff-sf">{formatTakeoffSf(statedSf as number | null)}</p>
                      <ProvenanceChip>{TAKEOFF_PROVENANCE.EMAIL_STATED}</ProvenanceChip>
                      <ProvenanceChip>{TAKEOFF_PROVENANCE.CLASSIFICATION}</ProvenanceChip>
                    </article>
                    <article>
                      <h3>Provider-proposed SF</h3>
                      <p className="qil-toff-sf">{formatTakeoffSf(providerProposed as number | null)}</p>
                      <ProvenanceChip>
                        {inspectIsLive ? TAKEOFF_PROVENANCE.LIVE_GEMINI : TAKEOFF_PROVENANCE.SIMULATED_PROVIDER}
                      </ProvenanceChip>
                      <span className="qil-cell-meta">Non-authoritative audit only</span>
                    </article>
                    <article>
                      <h3>Measured countertop SF</h3>
                      <p className="qil-toff-sf">{formatTakeoffSf(measuredCt as number | null)}</p>
                      <ProvenanceChip>{TAKEOFF_PROVENANCE.DETERMINISTIC}</ProvenanceChip>
                    </article>
                    <article>
                      <h3>Measured standard backsplash SF</h3>
                      <p className="qil-toff-sf">{formatTakeoffSf(measuredBs as number | null)}</p>
                      <ProvenanceChip>{TAKEOFF_PROVENANCE.DETERMINISTIC}</ProvenanceChip>
                    </article>
                    <article>
                      <h3>Measured full-height backsplash SF</h3>
                      <p className="qil-toff-sf">{formatTakeoffSf(measuredFhb as number | null)}</p>
                      <ProvenanceChip>{TAKEOFF_PROVENANCE.DETERMINISTIC}</ProvenanceChip>
                    </article>
                    <article>
                      <h3>Measured combined SF</h3>
                      <p className="qil-toff-sf is-emphasis">{formatTakeoffSf(measuredCombined as number | null)}</p>
                      <ProvenanceChip>{TAKEOFF_PROVENANCE.DETERMINISTIC}</ProvenanceChip>
                    </article>
                    <article>
                      <h3>Difference (measured − stated)</h3>
                      <p className="qil-toff-sf">
                        {measuredMinusStated == null ? "—" : formatTakeoffSf(measuredMinusStated)}
                      </p>
                      <span className="qil-cell-meta">Email-stated vs deterministic measured</span>
                    </article>
                    <article>
                      <h3>Difference (measured − provider)</h3>
                      <p className="qil-toff-sf">
                        {measuredMinusProvider == null ? "—" : formatTakeoffSf(measuredMinusProvider)}
                      </p>
                      <span className="qil-cell-meta">Provider proposal is not authoritative</span>
                    </article>
                    <article>
                      <h3>Sink cutout count</h3>
                      <p className="qil-toff-sf">{sinkCount == null ? "—" : String(sinkCount)}</p>
                      <span className="qil-cell-meta">Count only — not deducted from measured SF</span>
                    </article>
                  </div>
                </section>

                <section className="qil-toff-block">
                  <h2>Rooms and pieces</h2>
                  {!inspectRun.rooms?.length ? (
                    <p className="qil-cell-meta">No rooms on this run.</p>
                  ) : (
                    <ul className="qil-toff-rooms">
                      {(inspectRun.rooms as TakeoffRoom[]).map((room) => {
                        const open = expandedRooms[room.id] ?? true;
                        return (
                          <li key={room.id} className="qil-toff-room">
                            <button
                              type="button"
                              className="qil-toff-room-toggle"
                              aria-expanded={open}
                              onClick={() => toggleRoom(room.id)}
                            >
                              <span>
                                {room.name}
                                {room.roomType ? ` · ${room.roomType}` : ""}
                              </span>
                              <span className="qil-cell-meta">
                                CT {formatTakeoffSf(room.measuredCountertopSf)} · splash{" "}
                                {formatTakeoffSf(room.measuredBacksplashSf)} · conf {room.confidence ?? "—"}
                              </span>
                            </button>
                            {open ? (
                              <ul className="qil-toff-pieces">
                                {(room.pieces ?? []).map((piece) => {
                                  const m = piece.measurement;
                                  const evIds = m?.evidenceIds ?? [];
                                  return (
                                    <li key={piece.id} className="qil-toff-piece">
                                      <header>
                                        <strong>{piece.label}</strong>
                                        <span className="qil-cell-meta">
                                          {m?.pieceType ?? "—"} · {m?.shape ?? "—"}
                                          {piece.requiresEstimatorReview ? " · needs review" : ""}
                                        </span>
                                      </header>
                                      <dl className="qil-dl qil-dl-grid qil-toff-piece-dl">
                                        <div>
                                          <dt>Length</dt>
                                          <dd>{m?.lengthIn != null ? `${m.lengthIn} in` : "—"}</dd>
                                        </div>
                                        <div>
                                          <dt>Depth</dt>
                                          <dd>{m?.depthIn != null ? `${m.depthIn} in` : "—"}</dd>
                                        </div>
                                        <div>
                                          <dt>Piece SF</dt>
                                          <dd>{formatTakeoffSf(m?.measuredSf)}</dd>
                                        </div>
                                        <div>
                                          <dt>Backsplash</dt>
                                          <dd>{piece.backsplashScope ?? "—"}</dd>
                                        </div>
                                        <div>
                                          <dt>Cutouts</dt>
                                          <dd>
                                            {(piece.cutouts ?? []).length
                                              ? (piece.cutouts ?? [])
                                                  .map((c) => c.label || c.type || "cutout")
                                                  .join(", ")
                                              : "—"}
                                          </dd>
                                        </div>
                                        <div>
                                          <dt>Evidence</dt>
                                          <dd>
                                            {evIds.length
                                              ? evIds
                                                  .map((id) => evidenceById.get(id)?.label ?? id)
                                                  .join(", ")
                                              : "—"}
                                          </dd>
                                        </div>
                                        <div>
                                          <dt>Review state</dt>
                                          <dd>{inspectRun.humanReviewState ?? "unreviewed"}</dd>
                                        </div>
                                      </dl>
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                <section className="qil-toff-block">
                  <h2>Warnings and blockers</h2>
                  {(
                    [
                      ["approval_blocking", "Approval blocking", warningGroups.approval_blocking],
                      ["estimator_review", "Estimator review", warningGroups.estimator_review],
                      ["informational", "Informational", warningGroups.informational]
                    ] as const
                  ).map(([key, title, list]) =>
                    !list.length ? (
                      <p key={key} className="qil-cell-meta qil-toff-warn-empty">
                        {title}: none
                      </p>
                    ) : (
                    <div key={key} className={`qil-toff-warn-group sev-${key}`}>
                      <h3>
                        {title} <span>({list.length})</span>
                      </h3>
                        <ul className="qil-toff-warn-list">
                          {list.map((w, idx) => (
                            <li key={`${w.code}-${idx}`} className={`sev-${w.severity}`}>
                              <div className="qil-toff-warn-head">
                                <code>{w.code}</code>
                                <span>{w.severity}</span>
                              </div>
                              <p>{w.message}</p>
                              <dl className="qil-dl qil-toff-warn-meta">
                                <div>
                                  <dt>Affected</dt>
                                  <dd>
                                    {[w.roomId, w.pieceId, w.field].filter(Boolean).join(" · ") || "—"}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Required action</dt>
                                  <dd>{warningRequiredAction(w, { takeoffMode: workspaceMode })}</dd>
                                </div>
                                <div>
                                  <dt>Source</dt>
                                  <dd>
                                    {inspectIsLive ? "Live Gemini takeoff provider" : "Simulated takeoff provider"}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Blocks future approval</dt>
                                  <dd>{w.blocking ? "Yes" : "No"}</dd>
                                </div>
                              </dl>
                            </li>
                          ))}
                        </ul>
                    </div>
                    )
                  )}
                </section>

                <div className="qil-toff-run-actions" style={{ marginBottom: "1rem" }}>
                  <button
                    type="button"
                    className="qil-btn-primary"
                    disabled={busy || inspectRun.labTakeoffStatus === "qil_takeoff_failed"}
                    onClick={() => setCorrectionMode(true)}
                  >
                    Enter correction mode
                  </button>
                </div>
              </>
            ) : (
              <section className="qil-toff-block">
                <h2>Takeoff summary</h2>
                <p className="qil-cell-meta">
                  No takeoff runs yet. Choose Simulated or Live Gemini, then run.
                </p>
              </section>
            )}

            <section className="qil-toff-block">
              <h2>Run history</h2>
              {!runs.length ? (
                <p className="qil-cell-meta">No persisted runs for this case.</p>
              ) : (
                <ul className="qil-toff-history">
                  {runs.map((run) => {
                    const isLatest = run.id === latestId;
                    const att = caseItem.attachments.find((a) => a.id === run.attachmentId);
                    const selected = run.id === inspectRunId;
                    const counts = countWarningBuckets(run.warnings);
                    return (
                      <li key={run.id}>
                        <button
                          type="button"
                          className={`qil-toff-history-item${selected ? " is-selected" : ""}`}
                          onClick={() => setInspectRunId(run.id)}
                        >
                          <span className="qil-toff-history-top">
                            <strong>{run.id}</strong>
                            {isLatest ? <span className="qil-toff-latest">Latest</span> : null}
                          </span>
                          <span className="qil-cell-meta">
                            {formatReceived(run.completedAt ?? run.startedAt ?? "")} ·{" "}
                            <strong>{run.provider?.mode === "live" ? "Live Gemini" : "Simulated"}</strong> ·{" "}
                            {run.provider?.mode}/{run.provider?.version}
                            {run.provider?.mode === "live"
                              ? ""
                              : ` · ${scenarioLabel(run.scenarioId)}`}{" "}
                            · {labelTakeoffStatus(run.labTakeoffStatus)}
                          </span>
                          <span className="qil-cell-meta">
                            Measured{" "}
                            {formatMeasuredTakeoffSf(run, run.calculation?.measuredCombinedSf as number | null)} ·
                            warnings {counts.total} (block {counts.approval_blocking}) · hash{" "}
                            {(run.attachmentContentHash ?? "").slice(0, 12)}… · {att?.filename ?? run.attachmentId}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="qil-toff-block" aria-label="Downstream integration note">
              <p className="qil-cell-meta qil-toff-downstream-note">
                Downstream integrations are unavailable in the isolated lab. No Internal Estimate import, pricing,
                or Quote Library actions.
              </p>
            </section>
            </>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}

function countWarningBuckets(warnings: TakeoffWarning[] | undefined) {
  const list = warnings ?? [];
  return {
    informational: list.filter((w) => w.severity === "informational").length,
    estimator_review: list.filter((w) => w.severity === "estimator_review").length,
    approval_blocking: list.filter((w) => w.severity === "approval_blocking").length,
    total: list.length
  };
}
