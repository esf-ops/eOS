import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FIELD_LABELS,
  PROVIDER_MODE_LIVE,
  PROVIDER_MODE_SIMULATED
} from "../../classification/classificationTypes.mjs";
import { getLiveIntakeIntelligenceProvider } from "../../classification/liveIntakeIntelligenceProvider.mjs";
import {
  formatConfidenceWithProvenance,
  provenanceLabel,
  resolveProvenance
} from "../../classification/provenance.mjs";
import { canStartClassification } from "../../classification/stateTransitions.mjs";
import { warningsForRun } from "../../classification/validationWarnings.mjs";
import type { QuoteIntakeCase, QuoteIntakeRepository } from "../../domain/types";
import { formatReceived } from "../../utils/format";

type Props = {
  caseItem: QuoteIntakeCase;
  repo: QuoteIntakeRepository;
  actorLabel: string;
  onCaseMutated: () => void;
};

type RunRow = {
  id: string;
  providerMode?: string;
  providerVersion?: string;
  providerName?: string;
  startedAt?: string;
  completedAt?: string;
  humanReviewState?: string;
  acceptedSnapshotId?: string | null;
  failure?: { message?: string } | null;
  result?: any;
  corrections?: any[];
  warnings?: string[];
  validationWarnings?: any[];
};

export default function ClassificationWorkspace({ caseItem, repo, actorLabel, onCaseMutated }: Props) {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, string>>({});
  const [humanEligibility, setHumanEligibility] = useState<string>("");
  const [humanIntent, setHumanIntent] = useState<string>("");
  const [providerMode, setProviderMode] = useState<string>(PROVIDER_MODE_SIMULATED);
  const [liveAck, setLiveAck] = useState(false);
  const [liveHealth, setLiveHealth] = useState<string>("unchecked");

  const load = useCallback(async () => {
    if (!repo.listClassificationRuns || !repo.getAcceptedSnapshot) return;
    const list = (await repo.listClassificationRuns(caseItem.id)) as RunRow[];
    setRuns(list);
    const latest = list[0];
    setActiveRunId((prev) => (prev && list.some((r) => r.id === prev) ? prev : latest?.id ?? null));
    const snap = await repo.getAcceptedSnapshot(caseItem.id);
    setSnapshot(snap);
  }, [repo, caseItem.id]);

  useEffect(() => {
    void load();
  }, [load, caseItem.latestClassificationRunId, caseItem.acceptedSnapshotId, caseItem.status]);

  const activeRun = runs.find((r) => r.id === activeRunId) ?? null;
  const result = activeRun?.result ?? null;
  const immutable = activeRun?.humanReviewState === "accepted" || activeRun?.humanReviewState === "superseded";
  const canRun =
    canStartClassification(caseItem.status) &&
    !busy &&
    (providerMode !== PROVIDER_MODE_LIVE || liveAck);

  const structuredWarnings = useMemo(() => warningsForRun(activeRun), [activeRun]);
  const blockingWarnings = structuredWarnings.filter((w) => w.severity === "blocking");
  const acceptBlocked = blockingWarnings.length > 0 && !immutable;

  const runProvenance = useMemo(() => {
    if (!activeRun) return null;
    return resolveProvenance({
      dataSource: caseItem.dataSource,
      providerMode: activeRun.providerMode,
      humanReviewState: activeRun.humanReviewState,
      hasClassification: true
    });
  }, [activeRun, caseItem.dataSource]);

  async function checkLiveHealth() {
    const h = await getLiveIntakeIntelligenceProvider().health();
    if (!h.ok) {
      setLiveHealth(h.code === "SERVER_UNAVAILABLE" ? "unavailable" : `error:${h.code}`);
      return;
    }
    if (!h.liveAiEnabled) {
      setLiveHealth("disabled");
      return;
    }
    if (!h.hasApiKey || !h.modelConfigured) {
      setLiveHealth("misconfigured");
      return;
    }
    setLiveHealth("ready");
  }

  useEffect(() => {
    if (providerMode === PROVIDER_MODE_LIVE) void checkLiveHealth();
  }, [providerMode]);

  async function onRun() {
    if (!repo.runClassification) return;
    if (providerMode === PROVIDER_MODE_LIVE && !liveAck) {
      setError("Acknowledge the live-transmission warning before running live classification.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const out = (await repo.runClassification(caseItem.id, {
        actorLabel,
        providerMode
      })) as { runId?: string; ok?: boolean; softFailure?: boolean; code?: string };
      await load();
      if (out?.runId) setActiveRunId(out.runId);
      if (out && out.ok === false) {
        setError(
          out.softFailure
            ? `Live provider unavailable (${out.code ?? "error"}). Case status preserved. Switch to Simulated or start the lab server.`
            : `Classification failed (${out.code ?? "error"}).`
        );
      }
      onCaseMutated();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function applyField(fieldKey: string, action: string, value?: unknown, note?: string) {
    if (!repo.applyClassificationCorrections || !activeRun) return;
    setBusy(true);
    setError(null);
    try {
      await repo.applyClassificationCorrections(
        caseItem.id,
        activeRun.id,
        [{ fieldKey, action, value, note }],
        {
          actorLabel,
          humanEligibility: humanEligibility || undefined,
          humanIntent: humanIntent || undefined
        }
      );
      await load();
      onCaseMutated();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function saveDecisions() {
    if (!repo.applyClassificationCorrections || !activeRun) return;
    setBusy(true);
    setError(null);
    try {
      await repo.applyClassificationCorrections(caseItem.id, activeRun.id, [], {
        actorLabel,
        humanEligibility: humanEligibility || undefined,
        humanIntent: humanIntent || undefined
      });
      await load();
      onCaseMutated();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function onAccept() {
    if (!repo.acceptClassification || !activeRun) return;
    if (acceptBlocked) {
      setError("Acceptance blocked until blocking validation warnings are resolved (re-run or correct integrity issues).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (humanEligibility || humanIntent) {
        await repo.applyClassificationCorrections?.(caseItem.id, activeRun.id, [], {
          actorLabel,
          humanEligibility: humanEligibility || undefined,
          humanIntent: humanIntent || undefined
        });
      }
      await repo.acceptClassification(caseItem.id, activeRun.id, { actorLabel });
      await load();
      onCaseMutated();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!result) return;
    setHumanEligibility(result.humanEligibilityDecision || result.workflowEligibility || "");
    setHumanIntent(result.humanIntentDecision || result.intent || "");
  }, [activeRunId, result?.intent, result?.workflowEligibility, result?.humanEligibilityDecision, result?.humanIntentDecision]);

  const missingOpen = (result?.missingInformation ?? []).filter((m: any) => !m.resolved);
  const blockingCount = missingOpen.filter((m: any) => m.severity === "quote_blocking").length;

  return (
    <section className="qil-detail-block qil-classify" aria-label="Classification workspace">
      <div className="qil-classify-head">
        <h3>Classification</h3>
        <span className={`qil-sim-chip${providerMode === PROVIDER_MODE_LIVE ? " is-live" : ""}`}>
          {providerMode === PROVIDER_MODE_LIVE
            ? "Live Gemini classification · non-authoritative"
            : "Simulated classification · not live AI"}
        </span>
      </div>
      <p className="qil-cell-meta">
        Uses normalized subject, body, addresses, and attachment metadata only. No OCR, takeoff, or
        pricing. Attachment bytes are never transmitted.
      </p>

      <div className="qil-provider-select">
        <label>
          Provider
          <select
            value={providerMode}
            onChange={(e) => {
              setProviderMode(e.target.value);
              setLiveAck(false);
              setError(null);
            }}
          >
            <option value={PROVIDER_MODE_SIMULATED}>Simulated (default)</option>
            <option value={PROVIDER_MODE_LIVE}>Live Gemini (lab server)</option>
          </select>
        </label>
        {providerMode === PROVIDER_MODE_LIVE ? (
          <span className="qil-cell-meta">Server health: {liveHealth}</span>
        ) : null}
      </div>

      {providerMode === PROVIDER_MODE_LIVE ? (
        <div className="qil-live-warning" role="alert">
          <strong>Live transmission warning</strong>
          <p>
            Normalized email subject, plain-text body, and attachment filenames/MIME metadata will be
            sent to the configured Gemini provider through the local lab intelligence server
            (127.0.0.1). Attachment bytes, HTML, and production data are not sent. Results are
            non-authoritative and still require estimator acceptance.
          </p>
          <label className="qil-ack">
            <input
              type="checkbox"
              checked={liveAck}
              onChange={(e) => setLiveAck(e.target.checked)}
            />
            I understand and want to run live classification for this case.
          </label>
        </div>
      ) : null}

      <div className="qil-classify-actions">
        <button type="button" className="qil-btn-primary" disabled={!canRun} onClick={() => void onRun()}>
          {busy
            ? "Working…"
            : providerMode === PROVIDER_MODE_LIVE
              ? "Run live classification"
              : "Run simulated classification"}
        </button>
        {!canStartClassification(caseItem.status) ? (
          <span className="qil-cell-meta">Status {caseItem.status} is outside the Phase 3 classify set.</span>
        ) : null}
      </div>

      {error ? <div className="qil-import-warnings">{error}</div> : null}

      {result ? (
        <div className="qil-classify-summary">
          <h4>Summary</h4>
          <dl className="qil-dl qil-dl-grid">
            <div>
              <dt>Intent</dt>
              <dd>{result.intent}</dd>
            </div>
            <div>
              <dt>Elite 100 candidate</dt>
              <dd>{result.workflowEligibility}</dd>
            </div>
            <div>
              <dt>Overall confidence</dt>
              <dd>
                {formatConfidenceWithProvenance(
                  result.overallConfidence,
                  runProvenance ?? "simulated_classifier"
                )}
              </dd>
            </div>
            <div>
              <dt>Provenance</dt>
              <dd>{runProvenance ? provenanceLabel(runProvenance) : "—"}</dd>
            </div>
            <div>
              <dt>Missing items</dt>
              <dd>
                {missingOpen.length} open ({blockingCount} quote-blocking)
              </dd>
            </div>
            <div>
              <dt>Catalog validation</dt>
              <dd>{result.catalogValidationState}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>
                {activeRun?.providerName} ·{" "}
                <strong>{activeRun?.providerMode === "live" ? "LIVE" : activeRun?.providerMode}</strong> ·{" "}
                {activeRun?.providerVersion}
              </dd>
            </div>
            <div>
              <dt>Run time</dt>
              <dd>{activeRun?.completedAt ? formatReceived(activeRun.completedAt) : "—"}</dd>
            </div>
            <div>
              <dt>Sender claims Elite 100</dt>
              <dd>{result.senderClaimsElite100 ? "Yes" : "No"}</dd>
            </div>
          </dl>
          {result.confidenceReason ? <p className="qil-cell-meta">{result.confidenceReason}</p> : null}
        </div>
      ) : null}

      {structuredWarnings.length ? (
        <div
          className={`qil-validation-warnings${blockingWarnings.length ? " has-blocking" : ""}`}
          role="region"
          aria-label="Validation warnings"
        >
          <h4>Validation warnings ({structuredWarnings.length})</h4>
          <p className="qil-cell-meta">
            Informational warnings may remain visible after a safe sanitize. Blocking warnings prevent
            acceptance until resolved.
          </p>
          <ul className="qil-validation-list">
            {structuredWarnings.map((w, idx) => (
              <li key={`${w.code}-${idx}`} className={w.severity === "blocking" ? "is-blocking" : "is-info"}>
                <div className="qil-validation-head">
                  <strong>{w.code}</strong>
                  <span className="qil-cell-meta">
                    {" "}
                    · {w.severity} · {w.stage} · {w.category}
                  </span>
                </div>
                <div>{w.explanation}</div>
                <div className="qil-cell-meta">
                  {w.fieldKey ? `Field: ${w.fieldKey} · ` : ""}
                  Estimator action required: {w.estimatorActionRequired ? "yes" : "no"}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result?.fields ? (
        <div className="qil-classify-fields">
          <h4>Extracted fields</h4>
          <div className="qil-field-table">
            {result.fields.map((f: any) => {
              const label = FIELD_LABELS[f.key as keyof typeof FIELD_LABELS] ?? f.key;
              const fieldProv = resolveProvenance({
                dataSource: caseItem.dataSource,
                providerMode: activeRun?.providerMode,
                humanReviewState: activeRun?.humanReviewState,
                fieldHumanReviewState: f.humanReviewState,
                hasClassification: true
              });
              return (
                <article key={f.key} className="qil-field-card">
                  <header>
                    <strong>{label}</strong>
                    <span className="qil-cell-meta">
                      {f.unknown ? "unknown" : "extracted"} ·{" "}
                      {f.confidence != null ? `${Math.round(f.confidence * 100)}%` : "—"} ·{" "}
                      {provenanceLabel(fieldProv)} · {f.humanReviewState}
                    </span>
                  </header>
                  <p className="qil-field-value">{f.unknown || f.value == null ? "—" : String(f.value)}</p>
                  {f.evidence ? (
                    <p className="qil-evidence">
                      <span className="qil-evidence-tag">{f.evidence.sourceType}</span>
                      {f.evidence.excerpt}
                    </p>
                  ) : (
                    <p className="qil-cell-meta">No evidence (remains unknown).</p>
                  )}
                  {!immutable ? (
                    <div className="qil-field-actions">
                      <button type="button" className="qil-btn-ghost" disabled={busy} onClick={() => void applyField(f.key, "confirm")}>
                        Confirm
                      </button>
                      <button
                        type="button"
                        className="qil-btn-ghost"
                        disabled={busy}
                        onClick={() => void applyField(f.key, "mark_unknown", null, "Marked unknown")}
                      >
                        Mark unknown
                      </button>
                      <button
                        type="button"
                        className="qil-btn-ghost"
                        disabled={busy}
                        onClick={() => void applyField(f.key, "clear", null, "Cleared")}
                      >
                        Clear
                      </button>
                      <label className="qil-inline-edit">
                        <span className="visually-hidden">Edit {label}</span>
                        <input
                          value={editDrafts[f.key] ?? ""}
                          placeholder="Corrected value"
                          onChange={(e) => setEditDrafts((d) => ({ ...d, [f.key]: e.target.value }))}
                        />
                        <button
                          type="button"
                          className="qil-btn-ghost"
                          disabled={busy || !(editDrafts[f.key] ?? "").trim()}
                          onClick={() => {
                            const v = (editDrafts[f.key] ?? "").trim();
                            const coerced =
                              f.key === "sinkCutoutCount" || f.key === "statedSquareFootage"
                                ? Number(v)
                                : v;
                            void applyField(f.key, "edit", coerced, "Estimator edit");
                          }}
                        >
                          Save edit
                        </button>
                      </label>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {result?.missingInformation ? (
        <div className="qil-classify-missing">
          <h4>Missing information</h4>
          <ul className="qil-missing-list">
            {result.missingInformation.map((m: any) => (
              <li key={m.key} className={m.resolved ? "is-resolved" : ""}>
                <strong>{m.label}</strong>
                <span className="qil-cell-meta">
                  {" "}
                  · {m.severity}
                  {m.resolved ? " · present/unverified" : ""}
                </span>
                <div className="qil-cell-meta">{m.detail}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result && !immutable ? (
        <div className="qil-classify-decisions">
          <h4>Estimator decisions</h4>
          <div className="qil-decision-grid">
            <label>
              Intent decision
              <select value={humanIntent} onChange={(e) => setHumanIntent(e.target.value)}>
                <option value="new_quote_request">new_quote_request</option>
                <option value="quote_revision">quote_revision</option>
                <option value="quote_question">quote_question</option>
                <option value="project_information_update">project_information_update</option>
                <option value="not_quote_related">not_quote_related</option>
                <option value="unclear">unclear</option>
              </select>
            </label>
            <label>
              Elite 100 eligibility decision
              <select value={humanEligibility} onChange={(e) => setHumanEligibility(e.target.value)}>
                <option value="elite_100_candidate">elite_100_candidate</option>
                <option value="non_elite_100_candidate">non_elite_100_candidate</option>
                <option value="program_unknown">program_unknown</option>
                <option value="manual_review_required">manual_review_required</option>
              </select>
            </label>
          </div>
          <div className="qil-classify-actions">
            <button type="button" className="qil-btn-ghost" disabled={busy} onClick={() => void saveDecisions()}>
              Save decisions
            </button>
            <button
              type="button"
              className="qil-btn-primary"
              disabled={busy || acceptBlocked}
              onClick={() => void onAccept()}
              title={acceptBlocked ? "Resolve blocking validation warnings first" : undefined}
            >
              Accept classification
            </button>
          </div>
          {acceptBlocked ? (
            <p className="qil-import-warnings compact" role="alert">
              Acceptance blocked by {blockingWarnings.length} blocking validation warning(s).
            </p>
          ) : null}
          <p className="qil-cell-meta">
            Acceptance freezes a reviewed intake snapshot. It does not create a quote or start takeoff.
          </p>
        </div>
      ) : null}

      {snapshot ? (
        <div className="qil-classify-snapshot">
          <h4>Accepted snapshot</h4>
          <p>
            <code>{snapshot.id}</code> · {formatReceived(snapshot.acceptedAt)} · {snapshot.acceptedBy}
          </p>
          <p className="qil-cell-meta">{snapshot.note}</p>
        </div>
      ) : null}

      <div className="qil-classify-history">
        <h4>Run history</h4>
        {runs.length === 0 ? (
          <p className="qil-cell-meta">No classification runs yet.</p>
        ) : (
          <ol className="qil-timeline">
            {runs.map((r) => {
              const histWarnings = warningsForRun(r);
              return (
                <li key={r.id}>
                  <div className="qil-timeline-time">{r.completedAt ? formatReceived(r.completedAt) : "—"}</div>
                  <div className="qil-timeline-body">
                    <button type="button" className="qil-linkish" onClick={() => setActiveRunId(r.id)}>
                      <strong>{r.id}</strong>
                    </button>
                    <span>
                      {r.providerMode} · {r.humanReviewState}
                      {r.acceptedSnapshotId ? ` · snapshot ${r.acceptedSnapshotId}` : ""}
                      {r.failure ? ` · failed: ${r.failure.message}` : ""}
                      {histWarnings.length ? ` · warnings ${histWarnings.length}` : ""}
                      {r.id === activeRunId ? " · viewing" : ""}
                    </span>
                    {histWarnings.length && r.id === activeRunId ? (
                      <ul className="qil-validation-list compact">
                        {histWarnings.map((w, idx) => (
                          <li key={`${r.id}-w-${idx}`} className={w.severity === "blocking" ? "is-blocking" : "is-info"}>
                            <strong>{w.code}</strong> · {w.severity} · {w.explanation}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
