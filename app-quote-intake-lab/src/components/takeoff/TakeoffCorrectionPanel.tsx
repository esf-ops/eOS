import { useEffect, useMemo, useState } from "react";
import type { QuoteIntakeCase, QuoteIntakeRepository } from "../../domain/types";
import { warningKey } from "../../takeoff/approvalGate.mjs";
import { CORRECTION_OP } from "../../takeoff/correctionTypes.mjs";
import { hasMaterialCorrections } from "../../takeoff/reviewedFingerprint.mjs";
import {
  TAKEOFF_PROVENANCE,
  formatTakeoffSf,
  labelTakeoffStatus,
  reviewedSfProvenance
} from "../../takeoff/takeoffDisplay.mjs";
import { formatReceived } from "../../utils/format";

type Props = {
  caseItem: QuoteIntakeCase;
  repo: QuoteIntakeRepository;
  sourceRun: any;
  actorLabel: string;
  onExit: () => void;
  onMutated: () => void;
};

function shortFp(fp?: string | null) {
  if (!fp) return "—";
  const s = String(fp);
  return s.length > 12 ? s.slice(-12) : s;
}

export default function TakeoffCorrectionPanel({
  caseItem,
  repo,
  sourceRun,
  actorLabel,
  onExit,
  onMutated
}: Props) {
  const [draft, setDraft] = useState<any>(null);
  const [projection, setProjection] = useState<any>(null);
  const [gate, setGate] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [inspectSnapId, setInspectSnapId] = useState<string | null>(null);
  const [editPieceId, setEditPieceId] = useState<string | null>(null);
  const [lengthDraft, setLengthDraft] = useState("");
  const [depthDraft, setDepthDraft] = useState("");
  const [addLabel, setAddLabel] = useState("Added run");
  const [addL, setAddL] = useState("24");
  const [addD, setAddD] = useState("25.5");
  const [directSf, setDirectSf] = useState("");
  const [directReason, setDirectReason] = useState("");
  const [sinkDraft, setSinkDraft] = useState("");
  const [warnNotes, setWarnNotes] = useState<Record<string, string>>({});

  const latestSnapId = caseItem.latestReviewedTakeoffSnapshotId ?? null;
  const inspectSnap = snapshots.find((s) => s.id === inspectSnapId) ?? null;
  const acceptedLocked = Boolean(
    draft?.frozen || draft?.reviewState === "accepted_lab_snapshot" || draft?.acceptedSnapshotId
  );
  const acceptedSnap =
    snapshots.find((s) => s.id === (draft?.acceptedSnapshotId ?? latestSnapId)) ?? null;
  const material = Boolean(draft && projection && hasMaterialCorrections(sourceRun, draft, projection));
  const sfProv = reviewedSfProvenance({ accepted: acceptedLocked, material });

  async function refresh(currentDraftId?: string) {
    if (!repo.beginTakeoffCorrection) return;
    const begun = (await repo.beginTakeoffCorrection(caseItem.id, sourceRun.id, {
      actorLabel
    })) as any;
    setDraft(begun.draft);
    const draftId = currentDraftId ?? begun.draft.id;
    if (repo.evaluateTakeoffAcceptance) {
      const g = await repo.evaluateTakeoffAcceptance(caseItem.id, draftId);
      setGate(g);
      setProjection((g as any).projection);
    }
    if (repo.listReviewedTakeoffSnapshots) {
      setSnapshots((await repo.listReviewedTakeoffSnapshots(caseItem.id)) as any[]);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseItem.id, sourceRun.id]);

  useEffect(() => {
    if (projection?.sinkCount != null) setSinkDraft(String(projection.sinkCount));
  }, [projection?.sinkCount]);

  const originalCalc = sourceRun.calculation ?? {};
  const reviewedCalc = acceptedLocked
    ? (acceptedSnap?.calculation ?? projection?.calculation ?? {})
    : (projection?.calculation ?? {});
  const dirty = Boolean(draft?.dirty);

  const includedCount = useMemo(() => {
    let n = 0;
    for (const room of projection?.rooms ?? []) n += (room.pieces ?? []).length;
    return n;
  }, [projection]);
  const excludedCount = projection?.excludedPieces?.length ?? 0;
  const addedCount = projection?.addedPieceIds?.length ?? 0;
  const resolvedWarnCount = Object.keys(projection?.warningResolutions ?? {}).length;

  async function applyOp(operation: Record<string, unknown>) {
    if (!repo.applyTakeoffCorrection || !draft || acceptedLocked) return;
    setBusy(true);
    setError(null);
    try {
      const out = (await repo.applyTakeoffCorrection(caseItem.id, draft.id, operation, {
        actorLabel
      })) as any;
      setDraft(out.draft);
      setProjection(out.projection);
      if (repo.evaluateTakeoffAcceptance) {
        setGate(await repo.evaluateTakeoffAcceptance(caseItem.id, out.draft.id));
      }
      onMutated();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    if (!repo.saveTakeoffCorrectionDraft || !draft || acceptedLocked) return;
    setBusy(true);
    try {
      const saved = await repo.saveTakeoffCorrectionDraft(caseItem.id, draft.id, { actorLabel });
      setDraft(saved);
      onMutated();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function onDiscard() {
    if (!repo.discardTakeoffCorrectionDraft || !draft || acceptedLocked) return;
    if (!window.confirm("Discard this unaccepted correction draft?")) return;
    setBusy(true);
    try {
      await repo.discardTakeoffCorrectionDraft(caseItem.id, draft.id, { actorLabel });
      onMutated();
      onExit();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function onAccept() {
    if (!repo.acceptReviewedTakeoff || !draft || acceptedLocked) return;
    setBusy(true);
    setError(null);
    try {
      const result = (await repo.acceptReviewedTakeoff(caseItem.id, draft.id, {
        actorLabel
      })) as any;
      if (result?.ok === false) {
        setError(
          result.message ??
            "The latest accepted snapshot already represents these reviewed values. No new snapshot was created."
        );
        setAcceptOpen(false);
        return;
      }
      setAcceptOpen(false);
      setDraft(result.draft);
      if (repo.listReviewedTakeoffSnapshots) {
        setSnapshots((await repo.listReviewedTakeoffSnapshots(caseItem.id)) as any[]);
      }
      setProjection(result.gate?.projection ?? projection);
      setGate(result.gate ?? gate);
      onMutated();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function onCreateRevision() {
    if (!repo.createTakeoffRevision) return;
    setBusy(true);
    setError(null);
    try {
      const out = (await repo.createTakeoffRevision(caseItem.id, { actorLabel })) as any;
      setDraft(out.draft);
      if (repo.evaluateTakeoffAcceptance) {
        const g = await repo.evaluateTakeoffAcceptance(caseItem.id, out.draft.id);
        setGate(g);
        setProjection((g as any).projection);
      }
      if (repo.listReviewedTakeoffSnapshots) {
        setSnapshots((await repo.listReviewedTakeoffSnapshots(caseItem.id)) as any[]);
      }
      onMutated();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }

  const providerPieces = useMemo(() => {
    const list: Array<{ room: any; piece: any }> = [];
    for (const room of sourceRun.rooms ?? []) {
      for (const piece of room.pieces ?? []) list.push({ room, piece });
    }
    return list;
  }, [sourceRun]);

  const projectedPiece = (pieceId: string) => {
    for (const room of projection?.rooms ?? []) {
      const p = (room.pieces ?? []).find((x: any) => x.id === pieceId);
      if (p) return { room, piece: p };
    }
    return null;
  };

  return (
    <section className="qil-toff-correction" aria-label="Takeoff correction mode">
      <header className="qil-toff-correction-head">
        <div>
          <h2>{acceptedLocked ? "Accepted review (locked)" : "Correction mode"}</h2>
          <p className="qil-cell-meta">
            Source run stays immutable. Corrections apply to a reviewed projection only.{" "}
            {acceptedLocked ? (
              <span className="qil-toff-draft-chip">Accepted draft frozen</span>
            ) : (
              <span className={`qil-toff-draft-chip${dirty ? " is-dirty" : ""}`}>
                {dirty ? "Unsaved draft" : "Saved draft"}
              </span>
            )}{" "}
            <span className="qil-toff-prov">
              {acceptedLocked ? TAKEOFF_PROVENANCE.ACCEPTED_SNAPSHOT : TAKEOFF_PROVENANCE.UNACCEPTED_DRAFT}
            </span>
            {acceptedSnap ? (
              <>
                {" "}
                · snapshot <code>{acceptedSnap.id}</code> · {formatReceived(acceptedSnap.acceptedAt)} ·{" "}
                {acceptedSnap.acceptedBy}
              </>
            ) : null}
            {draft?.parentSnapshotId ? (
              <>
                {" "}
                · revising parent <code>{draft.parentSnapshotId}</code>
              </>
            ) : null}
          </p>
        </div>
        <div className="qil-toff-correction-actions">
          <button type="button" className="qil-btn-secondary" disabled={busy} onClick={onExit}>
            Back to takeoff review
          </button>
          {!acceptedLocked ? (
            <>
              <button type="button" className="qil-btn-secondary" disabled={busy} onClick={() => void onSave()}>
                Save draft
              </button>
              <button
                type="button"
                className="qil-btn-secondary"
                disabled={busy}
                onClick={() => void onDiscard()}
              >
                Discard draft
              </button>
              <button
                type="button"
                className="qil-btn-primary"
                disabled={busy || !gate?.ready}
                onClick={() => setAcceptOpen(true)}
              >
                Accept reviewed takeoff
              </button>
            </>
          ) : (
            <button
              type="button"
              className="qil-btn-primary"
              disabled={busy}
              onClick={() => void onCreateRevision()}
            >
              Create revision
            </button>
          )}
        </div>
      </header>

      {error ? <p className="qil-toff-error">{error}</p> : null}

      <div className="qil-toff-compare qil-toff-compare-correction" aria-label="SF provenance comparison">
        <article>
          <h3>Email-stated SF</h3>
          <p className="qil-toff-sf">
            {formatTakeoffSf(caseItem.statedSquareFootage ?? caseItem.proposedSquareFootage)}
          </p>
          <span className="qil-toff-prov">{TAKEOFF_PROVENANCE.EMAIL_STATED}</span>
        </article>
        <article>
          <h3>Simulated provider SF</h3>
          <p className="qil-toff-sf">{formatTakeoffSf(originalCalc.providerProposedCombinedSf)}</p>
          <span className="qil-toff-prov">{TAKEOFF_PROVENANCE.SIMULATED_PROVIDER}</span>
        </article>
        <article>
          <h3>Original deterministic SF</h3>
          <p className="qil-toff-sf">{formatTakeoffSf(originalCalc.measuredCombinedSf)}</p>
          <span className="qil-toff-prov">{TAKEOFF_PROVENANCE.ORIGINAL_DETERMINISTIC}</span>
        </article>
        <article className="is-primary-reviewed">
          <h3>{sfProv.title}</h3>
          <p className="qil-toff-sf is-emphasis">{formatTakeoffSf(reviewedCalc.measuredCombinedSf)}</p>
          {sfProv.chips.map((chip) => (
            <span key={chip} className="qil-toff-prov">
              {chip}
            </span>
          ))}
        </article>
      </div>

      {!acceptedLocked ? (
        <div className="qil-toff-blockers" aria-label="Acceptance blockers">
          <h3>
            Remaining blockers <span>({gate?.blockers?.length ?? 0})</span>
          </h3>
          {gate?.ready ? (
            <p className="qil-cell-meta">Ready for acceptance.</p>
          ) : (
            <ul>
              {(gate?.blockers ?? ["Evaluating…"]).map((b: string) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="qil-cell-meta" role="status">
          Correction draft is frozen. Create a revision to make material changes before accepting again.
        </p>
      )}

      <div className="qil-toff-block">
        <h3>Sink cutout count</h3>
        <p className="qil-cell-meta">
          Original provider count: {originalCalc.sinkCutoutCount ?? 0} · Count does not alter SF
        </p>
        {projection?.sinkConfirmed ? (
          <div className="qil-toff-inline-form">
            <span className="qil-toff-draft-chip">Confirmed · {projection.sinkCount ?? 0}</span>
            {!acceptedLocked ? (
              <button
                type="button"
                className="qil-btn-secondary"
                disabled={busy}
                onClick={() => void applyOp({ type: CORRECTION_OP.REOPEN_SINK_CONFIRMATION })}
              >
                Edit / Reopen
              </button>
            ) : null}
          </div>
        ) : (
          <div className="qil-toff-inline-form">
            <label>
              Corrected count
              <input
                value={sinkDraft}
                onChange={(e) => setSinkDraft(e.target.value)}
                disabled={busy || acceptedLocked}
              />
            </label>
            <button
              type="button"
              className="qil-btn-secondary"
              disabled={busy || acceptedLocked}
              onClick={() =>
                void applyOp({
                  type: CORRECTION_OP.SET_SINK_COUNT,
                  sinkCount: Number(sinkDraft || 0),
                  note: "Estimator corrected sink count"
                })
              }
            >
              Apply count
            </button>
            <button
              type="button"
              className="qil-btn-primary"
              disabled={busy || acceptedLocked}
              onClick={() =>
                void applyOp({
                  type: CORRECTION_OP.CONFIRM_SINK_COUNT,
                  sinkCount: Number(sinkDraft || projection?.sinkCount || 0),
                  note: "Estimator confirmed sink count"
                })
              }
            >
              Confirm sink count
            </button>
          </div>
        )}
      </div>

      <div className="qil-toff-block">
        <h3>Pieces</h3>
        <ul className="qil-toff-corr-pieces">
          {providerPieces.map(({ room, piece }) => {
            const proj = projectedPiece(piece.id);
            const status = projection?.pieceStatus?.[piece.id] ?? "unreviewed";
            const excluded = status === "excluded";
            const pieceDone = status === "confirmed" || status === "corrected" || status === "added";
            const editing = editPieceId === piece.id;
            return (
              <li key={piece.id} className={`qil-toff-corr-piece status-${status}`}>
                <header>
                  <strong>{piece.label}</strong>
                  <span className="qil-cell-meta">
                    {room.name} · {status}
                    {excluded ? " · excluded" : ""}
                  </span>
                </header>
                <dl className="qil-dl qil-dl-grid">
                  <div>
                    <dt>Original provider</dt>
                    <dd>
                      {piece.measurement?.lengthIn ?? "—"} × {piece.measurement?.depthIn ?? "—"} in →{" "}
                      {formatTakeoffSf(piece.measurement?.measuredSf)}
                    </dd>
                  </div>
                  <div>
                    <dt>Reviewed / corrected</dt>
                    <dd className={proj && !excluded && status === "corrected" ? "is-corrected" : undefined}>
                      {excluded
                        ? "Excluded from reviewed totals"
                        : `${proj?.piece.measurement?.lengthIn ?? "—"} × ${
                            proj?.piece.measurement?.depthIn ?? "—"
                          } in → ${formatTakeoffSf(proj?.piece.measurement?.measuredSf)}`}
                    </dd>
                  </div>
                </dl>
                {!acceptedLocked ? (
                  <div className="qil-toff-corr-piece-actions">
                    {!excluded ? (
                      <>
                        {pieceDone ? (
                          <span className="qil-toff-draft-chip">Confirmed</span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void applyOp({ type: CORRECTION_OP.CONFIRM_PIECE, pieceId: piece.id })
                            }
                          >
                            Confirm piece
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setEditPieceId(piece.id);
                            setLengthDraft(
                              String(proj?.piece.measurement?.lengthIn ?? piece.measurement?.lengthIn ?? "")
                            );
                            setDepthDraft(
                              String(proj?.piece.measurement?.depthIn ?? piece.measurement?.depthIn ?? "")
                            );
                          }}
                        >
                          Edit dims
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void applyOp({ type: CORRECTION_OP.EXCLUDE_PIECE, pieceId: piece.id })}
                        >
                          Exclude
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void applyOp({ type: CORRECTION_OP.RESTORE_PIECE, pieceId: piece.id })}
                      >
                        Restore
                      </button>
                    )}
                  </div>
                ) : null}
                {editing && !excluded && !acceptedLocked ? (
                  <div className="qil-toff-inline-form">
                    <label>
                      Length
                      <input value={lengthDraft} onChange={(e) => setLengthDraft(e.target.value)} />
                    </label>
                    <label>
                      Depth
                      <input value={depthDraft} onChange={(e) => setDepthDraft(e.target.value)} />
                    </label>
                    <button
                      type="button"
                      className="qil-btn-primary"
                      disabled={busy}
                      onClick={() => {
                        void applyOp({
                          type: CORRECTION_OP.EDIT_PIECE,
                          pieceId: piece.id,
                          patch: {
                            lengthIn: Number(lengthDraft),
                            depthIn: Number(depthDraft),
                            clearDirectSf: true
                          },
                          note: "Estimator corrected dimensions"
                        }).then(() => setEditPieceId(null));
                      }}
                    >
                      Apply dims
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        {!acceptedLocked ? (
          <div className="qil-toff-add-piece">
            <h4>Add missing piece</h4>
            <div className="qil-toff-inline-form">
              <label>
                Label
                <input value={addLabel} onChange={(e) => setAddLabel(e.target.value)} />
              </label>
              <label>
                Length
                <input value={addL} onChange={(e) => setAddL(e.target.value)} />
              </label>
              <label>
                Depth
                <input value={addD} onChange={(e) => setAddD(e.target.value)} />
              </label>
              <button
                type="button"
                className="qil-btn-secondary"
                disabled={busy || !(sourceRun.rooms ?? [])[0]}
                onClick={() => {
                  const roomId = sourceRun.rooms[0].id;
                  const id = `qil-added-${Date.now().toString(16)}`;
                  void applyOp({
                    type: CORRECTION_OP.ADD_PIECE,
                    roomId,
                    piece: {
                      id,
                      label: addLabel,
                      roomId,
                      measurement: {
                        lengthIn: Number(addL),
                        depthIn: Number(addD),
                        shape: "rect",
                        pieceType: "counter",
                        measuredSf: 0,
                        evidenceIds: []
                      },
                      cutouts: [],
                      notes: ["Estimator-added piece"],
                      requiresEstimatorReview: false
                    }
                  });
                }}
              >
                Add geometry piece
              </button>
            </div>
            <div className="qil-toff-inline-form">
              <label>
                Direct SF
                <input value={directSf} onChange={(e) => setDirectSf(e.target.value)} />
              </label>
              <label>
                Reason (required)
                <input value={directReason} onChange={(e) => setDirectReason(e.target.value)} />
              </label>
              <button
                type="button"
                className="qil-btn-secondary"
                disabled={busy || !directReason.trim()}
                onClick={() => {
                  const roomId = sourceRun.rooms[0].id;
                  const id = `qil-direct-${Date.now().toString(16)}`;
                  void applyOp({
                    type: CORRECTION_OP.ADD_PIECE,
                    roomId,
                    note: directReason,
                    piece: {
                      id,
                      label: "Estimator direct SF",
                      roomId,
                      measurement: {
                        directSf: Number(directSf),
                        directSfReason: directReason,
                        provenance: "estimator_entered",
                        pieceType: "counter",
                        shape: "rect",
                        lengthIn: null,
                        depthIn: null,
                        measuredSf: 0,
                        evidenceIds: []
                      },
                      cutouts: [],
                      notes: [directReason],
                      requiresEstimatorReview: true
                    }
                  });
                }}
              >
                Add direct-SF piece
              </button>
            </div>
            <p className="qil-cell-meta">
              Direct SF is human-entered — never attributed to AI. Material correction only after a piece is
              added.
            </p>
          </div>
        ) : null}
      </div>

      <div className="qil-toff-block">
        <h3>Rooms</h3>
        <ul className="qil-toff-corr-rooms">
          {(projection?.rooms ?? sourceRun.rooms ?? []).map((room: any) => {
            const reviewed = Boolean(projection?.roomReviewed?.[room.id]);
            return (
              <li key={room.id}>
                <strong>{room.name}</strong>
                <span className="qil-cell-meta">
                  CT {formatTakeoffSf(room.measuredCountertopSf)} · {reviewed ? "Reviewed" : "needs review"}
                </span>
                {reviewed ? (
                  <>
                    <span className="qil-toff-draft-chip">Reviewed</span>
                    {!acceptedLocked ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void applyOp({ type: CORRECTION_OP.REOPEN_ROOM_REVIEW, roomId: room.id })
                        }
                      >
                        Reopen review
                      </button>
                    ) : null}
                  </>
                ) : !acceptedLocked ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void applyOp({ type: CORRECTION_OP.MARK_ROOM_REVIEWED, roomId: room.id })}
                  >
                    Mark room reviewed
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="qil-toff-block">
        <h3>Warnings</h3>
        <ul className="qil-toff-corr-warns">
          {(sourceRun.warnings ?? []).map((w: any, idx: number) => {
            const key = warningKey(w);
            const res = projection?.warningResolutions?.[key];
            return (
              <li key={`${key}-${idx}`} className={`sev-${w.severity}`}>
                <code>{w.code}</code> · {w.severity}
                <p>{w.message}</p>
                {w.severity === "approval_blocking" ? (
                  <p className="qil-cell-meta">Blocking — fix with a correction (cannot dismiss).</p>
                ) : null}
                {res ? (
                  <div className="qil-toff-inline-form">
                    <span className="qil-toff-draft-chip">
                      Resolved · {res.resolutionKind}
                    </span>
                    <p className="qil-cell-meta">{res.note}</p>
                    {!acceptedLocked ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void applyOp({
                            type: CORRECTION_OP.REOPEN_WARNING_RESOLUTION,
                            warningKey: key
                          })
                        }
                      >
                        Reopen resolution
                      </button>
                    ) : null}
                  </div>
                ) : !acceptedLocked ? (
                  <div className="qil-toff-inline-form">
                    <label>
                      Resolution note
                      <input
                        value={warnNotes[key] ?? ""}
                        onChange={(e) => setWarnNotes((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy || !String(warnNotes[key] ?? "").trim()}
                      onClick={() =>
                        void applyOp({
                          type: CORRECTION_OP.RESOLVE_WARNING,
                          warningKey: key,
                          severity: w.severity,
                          resolutionKind:
                            w.severity === "approval_blocking" ? "fixed_by_correction" : "acknowledged",
                          note: warnNotes[key]
                        })
                      }
                    >
                      {w.severity === "approval_blocking" ? "Mark fixed by correction" : "Acknowledge"}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="qil-toff-block">
        <h3>Accepted snapshots</h3>
        {!snapshots.length ? (
          <p className="qil-cell-meta">No accepted lab takeoff snapshots yet.</p>
        ) : (
          <ul className="qil-toff-history">
            {snapshots.map((s) => {
              const isLatest = s.id === latestSnapId;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`qil-toff-history-item${inspectSnapId === s.id ? " is-selected" : ""}`}
                    onClick={() => setInspectSnapId(s.id)}
                  >
                    <span className="qil-toff-history-top">
                      <strong>{s.id}</strong>
                      {isLatest ? <span className="qil-toff-latest">Latest</span> : null}
                      <span className="qil-toff-prov">Accepted</span>
                      {!isLatest ? <span className="qil-toff-prov">Superseded by revision</span> : null}
                      <span className="qil-toff-prov">
                        {s.materiallyCorrected
                          ? TAKEOFF_PROVENANCE.HUMAN_CORRECTED
                          : "Review-only"}
                      </span>
                      <span className="qil-toff-prov">fp {shortFp(s.snapshotFingerprint)}</span>
                    </span>
                    <span className="qil-cell-meta">
                      {formatReceived(s.acceptedAt)} · {s.acceptedBy} · reviewed{" "}
                      {formatTakeoffSf(s.calculation?.measuredCombinedSf)} · source run {s.sourceRunId}
                      {s.parentSnapshotId ? ` · parent ${s.parentSnapshotId}` : ""}
                      {s.sourceRunId !== sourceRun.id ? " · based on older run" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {inspectSnap ? (
          <div className="qil-toff-snap-inspect">
            <h4>Inspect snapshot</h4>
            <p className="qil-cell-meta">
              {inspectSnap.schemaVersion} · fingerprint {inspectSnap.snapshotFingerprint} · sink{" "}
              {inspectSnap.sinkCutoutCount} ·{" "}
              {inspectSnap.materiallyCorrected ? "Materially corrected" : "Review-only"}
              {inspectSnap.parentSnapshotId ? ` · parent ${inspectSnap.parentSnapshotId}` : ""}
            </p>
            <p>
              Accepted reviewed {formatTakeoffSf(inspectSnap.calculation?.measuredCombinedSf)} · original
              deterministic{" "}
              {formatTakeoffSf(inspectSnap.calculation?.originalDeterministicCombinedSf)} · provider{" "}
              {formatTakeoffSf(inspectSnap.calculation?.providerProposedCombinedSf)}
            </p>
          </div>
        ) : null}
      </div>

      <p className="qil-cell-meta qil-toff-downstream-note">
        Downstream integrations are unavailable in the isolated lab. No Internal Estimate import, pricing, or
        Quote Library actions.
      </p>

      {acceptOpen ? (
        <div className="qil-toff-accept-dialog" role="dialog" aria-modal="true">
          <div className="qil-toff-accept-card">
            <h3>Accept reviewed takeoff?</h3>
            <p>
              Acceptance creates an immutable lab <code>qil_reviewed_takeoff_v1</code> snapshot only. It does
              not price, quote, or import to Internal Estimate. Source run remains unchanged.
            </p>
            <ul className="qil-toff-accept-summary">
              <li>
                Draft reviewed SF: <strong>{formatTakeoffSf(reviewedCalc.measuredCombinedSf)}</strong>
              </li>
              <li>Sink count: {projection?.sinkCount ?? "—"}</li>
              <li>
                Pieces: {includedCount} included · {excludedCount} excluded · {addedCount} added
              </li>
              <li>Resolved warnings: {resolvedWarnCount}</li>
              <li>Remaining blockers: {(gate?.blockers ?? []).length}</li>
              <li>
                Source run: <code>{sourceRun.id}</code>
              </li>
              <li>
                Attachment hash: <code>{shortFp(sourceRun.attachmentContentHash)}</code>
              </li>
              <li>Provenance: {material ? "Material corrections present" : "Review-only (no material correction)"}</li>
            </ul>
            {(gate?.blockers ?? []).length ? (
              <ul>
                {(gate?.blockers ?? []).map((b: string) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
            <div className="qil-toff-correction-actions">
              <button type="button" className="qil-btn-secondary" onClick={() => setAcceptOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="qil-btn-primary"
                disabled={busy || !gate?.ready}
                onClick={() => void onAccept()}
              >
                Confirm acceptance
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <span className="visually-hidden">{labelTakeoffStatus(caseItem.latestTakeoffState)}</span>
    </section>
  );
}
