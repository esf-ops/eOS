/**
 * Consolidated estimator Takeoff review — one worksheet + Approve & Build Estimate.
 * Activated with ?consolidated=1&takeoffJobId=… (Studio embed).
 * Reuses existing Takeoff job / Gemini draft / corrections / approve-and-build APIs.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  approveAndBuildEstimate,
  labApiGet,
  LabApiError,
  saveTakeoffCorrection,
  type ApprovalBlockerItem
} from "../lib/api";
import {
  approveButtonLabel,
  runConsolidatedApproveClick
} from "../lib/consolidatedApproveClick.mjs";
import { getSupabase } from "../lib/supabase";
import TakeoffPlanPreviewPanel, {
  type PlanPreviewFileMeta
} from "./TakeoffPlanPreviewPanel";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";
type ApproveStatus = "idle" | "approving" | "approved" | "error";

type ApprovalDiagnostic = {
  confirmAdvisories: boolean;
  httpStatus: number | null;
  reviewStatus: string | null;
  errorCode: string | null;
  message: string | null;
  blockingCount: number;
  advisoryCount: number;
};

type PieceRow = {
  key: string;
  roomId: string;
  roomName: string;
  areaId: string;
  runId: string;
  pieceName: string;
  lengthIn: number;
  depthIn: number;
  quantity: number;
  countertopSf: number;
  backsplashHeightIn: number;
  included: boolean;
  cutoutsLabel: string;
  note: string;
  lowConfidence: boolean;
};

function sfFrom(lengthIn: number, depthIn: number): number {
  const l = Number(lengthIn) || 0;
  const d = Number(depthIn) || 0;
  if (l <= 0 || d <= 0) return 0;
  return Math.round(((l * d) / 144) * 100) / 100;
}

function flattenPieces(result: any, excludedRunIds: Set<string>): PieceRow[] {
  const rows: PieceRow[] = [];
  for (const room of result?.rooms ?? []) {
    for (const area of room.areas ?? []) {
      for (const run of area.runs ?? []) {
        const cutouts = run.cutouts || {};
        const parts = Object.entries(cutouts)
          .filter(([, v]) => Number(v) > 0)
          .map(([k, v]) => `${k}:${v}`);
        rows.push({
          key: `${room.id}:${run.id}`,
          roomId: room.id,
          roomName: room.name || "Room",
          areaId: area.id,
          runId: run.id,
          pieceName: run.label || area.label || "Piece",
          lengthIn: Number(run.lengthIn) || 0,
          depthIn: Number(run.depthIn) || 0,
          quantity: Number(run.quantity) || 1,
          countertopSf: sfFrom(Number(run.lengthIn) || 0, Number(run.depthIn) || 0),
          backsplashHeightIn: Number(area.backsplashHeightIn ?? area.backsplashHeight ?? 0) || 0,
          included: !excludedRunIds.has(run.id),
          cutoutsLabel: parts.join(", "),
          note: String(run.notes?.[0] ?? run.note ?? ""),
          lowConfidence:
            Boolean(run.requiresEstimatorReview) ||
            String(run.confidence ?? "").toLowerCase() === "low"
        });
      }
    }
  }
  return rows;
}

function patchRun(
  result: any,
  roomId: string,
  runId: string,
  patch: Record<string, unknown>
): any {
  return {
    ...result,
    rooms: (result.rooms ?? []).map((room: any) => {
      if (room.id !== roomId) return room;
      return {
        ...room,
        areas: (room.areas ?? []).map((area: any) => ({
          ...area,
          runs: (area.runs ?? []).map((run: any) =>
            run.id === runId ? { ...run, ...patch } : run
          )
        }))
      };
    })
  };
}

function renameRoom(result: any, roomId: string, name: string): any {
  return {
    ...result,
    rooms: (result.rooms ?? []).map((room: any) =>
      room.id === roomId ? { ...room, name } : room
    )
  };
}

function reassignRun(result: any, fromRoomId: string, runId: string, toRoomId: string): any {
  if (fromRoomId === toRoomId) return result;
  let moved: any = null;
  const stripped = {
    ...result,
    rooms: (result.rooms ?? []).map((room: any) => {
      if (room.id !== fromRoomId) return room;
      return {
        ...room,
        areas: (room.areas ?? []).map((area: any) => ({
          ...area,
          runs: (area.runs ?? []).filter((r: any) => {
            if (r.id === runId) {
              moved = r;
              return false;
            }
            return true;
          })
        }))
      };
    })
  };
  if (!moved) return result;
  return {
    ...stripped,
    rooms: (stripped.rooms ?? []).map((room: any) => {
      if (room.id !== toRoomId) return room;
      const areas =
        room.areas?.length > 0
          ? [...room.areas]
          : [{ id: `${room.id}-a1`, label: "Main", runs: [], backsplashScope: "stone" }];
      areas[0] = { ...areas[0], runs: [...(areas[0].runs ?? []), moved] };
      return { ...room, areas };
    })
  };
}

function addPiece(result: any, roomId: string): any {
  const id = `run-${crypto.randomUUID?.() ?? String(Date.now())}`;
  return {
    ...result,
    rooms: (result.rooms ?? []).map((room: any) => {
      if (room.id !== roomId) return room;
      const areas = room.areas?.length
        ? room.areas
        : [{ id: `${room.id}-a1`, label: "Main", runs: [], backsplashScope: "stone" }];
      const first = {
        ...areas[0],
        runs: [
          ...(areas[0].runs ?? []),
          {
            id,
            label: "New piece",
            lengthIn: 0,
            depthIn: 25.5,
            pieceType: "counter",
            quantity: 1
          }
        ]
      };
      return { ...room, areas: [first, ...areas.slice(1)] };
    })
  };
}

function notifyParentApproved(takeoffJobId: string, payload: unknown) {
  try {
    const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    window.parent?.postMessage(
      {
        type: "eliteos-takeoff-approved",
        takeoffJobId,
        source: "consolidated-review",
        reviewStatus: "approved",
        approvedResultId: p.approvedResultId ?? null,
        estimateScopeRefreshRequired: true,
        payload
      },
      "*"
    );
  } catch {
    /* ignore */
  }
}

export default function ConsolidatedTakeoffReview() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const takeoffJobId = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("takeoffJobId");
    } catch {
      return null;
    }
  }, []);

  const [draft, setDraft] = useState<any | null>(null);
  const [excludedRunIds, setExcludedRunIds] = useState<Set<string>>(new Set());
  const [planFile, setPlanFile] = useState<PlanPreviewFileMeta | null>(null);
  const [displayStatus, setDisplayStatus] = useState("Processing");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [approveStatus, setApproveStatus] = useState<ApproveStatus>("idle");
  const [approveMsg, setApproveMsg] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<ApprovalBlockerItem[]>([]);
  const [advisory, setAdvisory] = useState<ApprovalBlockerItem[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [approvalDiag, setApprovalDiag] = useState<ApprovalDiagnostic | null>(null);
  const saveTimer = useRef<number | null>(null);
  const draftRef = useRef(draft);
  const excludedRef = useRef(excludedRunIds);
  draftRef.current = draft;
  excludedRef.current = excludedRunIds;

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setAuthChecked(true);
      return;
    }
    let alive = true;
    void supabase.auth.getSession().then(({ data }: any) => {
      if (!alive) return;
      setAuthToken(data.session?.access_token ?? null);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e: string, sess: any) => {
      setAuthToken(sess?.access_token ?? null);
    });
    return () => {
      alive = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const loadWorkspace = useCallback(async (token: string, jobId: string) => {
    setLoadError(null);
    const job = (await labApiGet(
      `/api/takeoff-jobs/${encodeURIComponent(jobId)}`,
      token
    )) as any;
    const latest = (await labApiGet(
      `/api/takeoff-jobs/${encodeURIComponent(jobId)}/results/latest`,
      token
    ).catch(() => null)) as any;
    const result =
      latest?.normalizedTakeoffJson ||
      job?.latestResult?.normalizedTakeoffJson ||
      job?.resultSummary?.normalizedTakeoffJson ||
      null;
    if (!result) {
      setDraft(null);
      setDisplayStatus(
        String(job?.status ?? "").toLowerCase() === "failed" ? "Failed" : "Processing"
      );
      return;
    }
    setDraft(result);
    const rs = latest?.reviewState || {};
    setExcludedRunIds(new Set(rs.excludedRunIds ?? []));
    setApproveStatus("idle");
    setApproveMsg(null);
    setBlocking([]);
    setAdvisory([]);
    setApprovalDiag(null);
    const review = String(job?.reviewStatus ?? latest?.reviewStatus ?? "").toLowerCase();
    const status = String(job?.status ?? "").toLowerCase();
    if (status === "failed" || status === "error") setDisplayStatus("Failed");
    else if (review === "approved") setDisplayStatus("Approved");
    else if (status === "processing" || status === "pending") setDisplayStatus("Processing");
    else setDisplayStatus("Needs review");

    const file = job?.file || latest?.file;
    if (file?.quoteFileId || file?.id) {
      setPlanFile({
        quoteFileId: String(file.quoteFileId || file.id),
        originalFilename: String(file.originalFilename || file.filename || "plan.pdf"),
        mimeType: file.mimeType ?? "application/pdf",
        status: String(file.status ?? "ready")
      });
    }
  }, []);

  useEffect(() => {
    if (!authToken || !takeoffJobId) return;
    void loadWorkspace(authToken, takeoffJobId).catch((e) => {
      setLoadError(e instanceof LabApiError ? e.message : "Unable to load Takeoff");
    });
  }, [authToken, takeoffJobId, loadWorkspace]);

  const buildReviewState = useCallback(() => {
    const roomCompleteness: Record<string, boolean> = {};
    for (const room of draftRef.current?.rooms ?? []) {
      if (room?.id) roomCompleteness[room.id] = true;
    }
    return {
      excludedRunIds: [...excludedRef.current],
      excludedRoomIds: [],
      roomCompleteness,
      flagResolutions: {},
      referenceTotalAcks: {},
      evidenceAcks: {}
    };
  }, []);

  const persistDraft = useCallback(async () => {
    if (!authToken || !takeoffJobId || !draftRef.current) return;
    setSaveStatus("saving");
    setSaveError(null);
    try {
      await saveTakeoffCorrection(authToken, takeoffJobId, {
        takeoffResult: draftRef.current,
        reviewState: buildReviewState(),
        correctionNotes: "Consolidated worksheet autosave"
      });
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 1200);
    } catch (e) {
      setSaveStatus("error");
      setSaveError(e instanceof LabApiError ? e.message : "Save failed");
    }
  }, [authToken, takeoffJobId, buildReviewState]);

  const scheduleSave = useCallback(() => {
    setSaveStatus("dirty");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void persistDraft();
    }, 600);
  }, [persistDraft]);

  const updateDraft = useCallback(
    (next: any) => {
      setDraft(next);
      scheduleSave();
    },
    [scheduleSave]
  );

  const rows = useMemo(
    () => (draft ? flattenPieces(draft, excludedRunIds) : []),
    [draft, excludedRunIds]
  );

  const roomOptions = useMemo(
    () =>
      (draft?.rooms ?? []).map((r: any) => ({
        id: r.id,
        name: r.name || "Room"
      })),
    [draft]
  );

  const localSummary = useMemo(() => {
    const included = rows.filter((r) => r.included);
    return {
      rooms: new Set(included.map((r) => r.roomId)).size,
      includedPieces: included.length,
      countertopSf: included.reduce((s, r) => s + r.countertopSf, 0),
      backsplashSf: 0,
      blockingCount: blocking.length,
      advisoryCount: advisory.length
    };
  }, [rows, blocking, advisory]);

  const handleApproveClick = useCallback(async () => {
    if (!authToken || !takeoffJobId || !draft) return;
    if (approveStatus === "approving" || approveStatus === "approved") return;
    if (blocking.length > 0) return;

    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      await persistDraft();
    }

    const result = await runConsolidatedApproveClick({
      blockingCount: blocking.length,
      advisoryCount: advisory.length,
      takeoffResult: draftRef.current,
      reviewState: buildReviewState(),
      confirmFn: (message) => window.confirm(message),
      approveFn: async (body) => {
        // Only enter Approving… after the user confirms (or when no dialog is needed).
        setApproveStatus("approving");
        setApproveMsg("Approving…");
        return approveAndBuildEstimate(authToken, takeoffJobId, {
          takeoffResult: body.takeoffResult,
          reviewState: body.reviewState,
          confirmAdvisories: true,
          acceptAdvisoryWarnings: true
        });
      }
    });

    setApprovalDiag(result.diagnostic as ApprovalDiagnostic);

    if (result.cancelled || result.skipped) {
      setApproveStatus("idle");
      setApproveMsg(result.cancelled ? "Approval cancelled." : result.diagnostic.message);
      return;
    }

    if (!result.ok) {
      const body = (result.response || {}) as Record<string, unknown>;
      const hard = (body.hardBlockers as ApprovalBlockerItem[]) || [];
      const adv = (body.advisory as ApprovalBlockerItem[]) || [];
      setBlocking(hard);
      setAdvisory(adv);
      setApproveStatus("error");
      setApproveMsg(
        [
          `HTTP ${result.diagnostic.httpStatus ?? "—"}`,
          result.diagnostic.errorCode ? `code: ${result.diagnostic.errorCode}` : null,
          result.diagnostic.message,
          `blocking: ${result.diagnostic.blockingCount}`,
          `advisory: ${result.diagnostic.advisoryCount}`
        ]
          .filter(Boolean)
          .join(" · ")
      );
      return;
    }

    const res = result.response as Record<string, unknown>;
    setApproveStatus("approved");
    setDisplayStatus("Approved");
    setSummary((res.consolidatedSummary as Record<string, unknown>) || null);
    setAdvisory((res.advisory as ApprovalBlockerItem[]) || []);
    setBlocking([]);
    setApproveMsg(
      res.idempotent
        ? "Takeoff already approved — Estimate Scope ready."
        : "Takeoff approved — continuing to Estimate Scope."
    );
    // Notify parent from the successful promise (not only postMessage side-effects).
    notifyParentApproved(takeoffJobId, res);
  }, [
    authToken,
    takeoffJobId,
    draft,
    approveStatus,
    blocking.length,
    advisory.length,
    persistDraft,
    buildReviewState
  ]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabase();
    if (!supabase) return;
    setAuthBusy(true);
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword
    });
    setAuthBusy(false);
    if (error) setAuthError(error.message);
  };

  if (!authChecked) {
    return <div className="ctr-shell ctr-state">Loading…</div>;
  }

  if (!authToken) {
    return (
      <div className="ctr-shell">
        <form className="ctr-signin" onSubmit={signIn}>
          <h1>Elite 100 Takeoff review</h1>
          <p>Sign in to review the Gemini Takeoff draft.</p>
          <label>
            Email
            <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              required
            />
          </label>
          {authError ? <p className="ctr-error">{authError}</p> : null}
          <button type="submit" disabled={authBusy}>
            {authBusy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    );
  }

  if (!takeoffJobId) {
    return (
      <div className="ctr-shell ctr-state ctr-error" role="alert">
        Missing takeoffJobId.
      </div>
    );
  }

  return (
    <div className="ctr-shell" data-testid="consolidated-takeoff-review">
      <header className="ctr-header">
        <div>
          <h1>Takeoff review</h1>
          <p className="ctr-muted">
            Status: <strong data-testid="ctr-status">{displayStatus}</strong>
            {" · "}
            <span data-testid="ctr-save-status">{saveStatus}</span>
            {saveError ? <span className="ctr-error"> — {saveError}</span> : null}
          </p>
        </div>
      </header>

      {loadError ? (
        <div className="ctr-state ctr-error" role="alert">
          {loadError}
        </div>
      ) : null}

      {!draft ? (
        <div className="ctr-state" role="status" data-testid="ctr-processing">
          {displayStatus === "Failed"
            ? "Takeoff processing failed."
            : "Gemini Takeoff is processing — this worksheet appears when the draft is ready."}
        </div>
      ) : (
        <div className="ctr-layout">
          <aside className="ctr-plan">
            <TakeoffPlanPreviewPanel token={authToken} file={planFile} refreshKey={takeoffJobId} />
          </aside>

          <main className="ctr-main">
            <div className="ctr-summary" data-testid="ctr-summary">
              <span>{localSummary.rooms} rooms</span>
              <span>{localSummary.includedPieces} pieces</span>
              <span>{localSummary.countertopSf.toFixed(2)} SF CT</span>
              {blocking.length ? (
                <span className="ctr-badge ctr-badge--block">{blocking.length} blocking</span>
              ) : null}
              {advisory.length ? (
                <span className="ctr-badge ctr-badge--warn">{advisory.length} advisory</span>
              ) : null}
            </div>

            <div className="ctr-table-wrap">
              <table className="ctr-table" data-testid="ctr-worksheet">
                <thead>
                  <tr>
                    <th>Room</th>
                    <th>Piece</th>
                    <th>L (in)</th>
                    <th>D (in)</th>
                    <th>Qty</th>
                    <th>SF</th>
                    <th>BS H</th>
                    <th>Incl</th>
                    <th>Cutouts</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.key}
                      className={[
                        row.included ? "" : "ctr-row--excluded",
                        row.lowConfidence ? "ctr-row--low" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <td>
                        <select
                          aria-label="Room"
                          value={row.roomId}
                          onChange={(e) => {
                            const to = e.target.value;
                            updateDraft(reassignRun(draft, row.roomId, row.runId, to));
                          }}
                        >
                          {roomOptions.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <input
                          className="ctr-room-rename"
                          aria-label="Rename room"
                          value={row.roomName}
                          onChange={(e) => updateDraft(renameRoom(draft, row.roomId, e.target.value))}
                        />
                      </td>
                      <td>
                        <input
                          value={row.pieceName}
                          aria-label="Piece name"
                          onChange={(e) =>
                            updateDraft(
                              patchRun(draft, row.roomId, row.runId, { label: e.target.value })
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.1"
                          value={row.lengthIn || ""}
                          aria-label="Length inches"
                          onChange={(e) => {
                            const lengthIn = Number(e.target.value) || 0;
                            updateDraft(
                              patchRun(draft, row.roomId, row.runId, {
                                lengthIn,
                                sf: sfFrom(lengthIn, row.depthIn)
                              })
                            );
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.1"
                          value={row.depthIn || ""}
                          aria-label="Depth inches"
                          onChange={(e) => {
                            const depthIn = Number(e.target.value) || 0;
                            updateDraft(
                              patchRun(draft, row.roomId, row.runId, {
                                depthIn,
                                sf: sfFrom(row.lengthIn, depthIn)
                              })
                            );
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min={1}
                          value={row.quantity}
                          aria-label="Quantity"
                          onChange={(e) =>
                            updateDraft(
                              patchRun(draft, row.roomId, row.runId, {
                                quantity: Number(e.target.value) || 1
                              })
                            )
                          }
                        />
                      </td>
                      <td className="ctr-sf">{row.countertopSf.toFixed(2)}</td>
                      <td>
                        <input
                          type="number"
                          step="0.5"
                          value={row.backsplashHeightIn || ""}
                          aria-label="Backsplash height"
                          onChange={(e) => {
                            const h = Number(e.target.value) || 0;
                            setDraft((prev: any) => ({
                              ...prev,
                              rooms: (prev.rooms ?? []).map((room: any) =>
                                room.id !== row.roomId
                                  ? room
                                  : {
                                      ...room,
                                      areas: (room.areas ?? []).map((area: any) =>
                                        area.id === row.areaId
                                          ? { ...area, backsplashHeightIn: h }
                                          : area
                                      )
                                    }
                              )
                            }));
                            scheduleSave();
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={row.included}
                          aria-label="Include piece"
                          onChange={(e) => {
                            setExcludedRunIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.delete(row.runId);
                              else next.add(row.runId);
                              return next;
                            });
                            scheduleSave();
                          }}
                        />
                      </td>
                      <td>
                        <input
                          value={row.cutoutsLabel}
                          aria-label="Cutouts"
                          placeholder="sink:1"
                          onChange={(e) => {
                            const label = e.target.value;
                            const cutouts: Record<string, number> = {};
                            for (const part of label.split(",")) {
                              const [k, v] = part.split(":").map((s) => s.trim());
                              if (k && v) cutouts[k] = Number(v) || 0;
                            }
                            updateDraft(patchRun(draft, row.roomId, row.runId, { cutouts }));
                          }}
                        />
                      </td>
                      <td>
                        <input
                          value={row.note}
                          aria-label="Note"
                          onChange={(e) =>
                            updateDraft(
                              patchRun(draft, row.roomId, row.runId, {
                                notes: e.target.value ? [e.target.value] : []
                              })
                            )
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ctr-actions">
              <button
                type="button"
                className="ctr-btn-secondary"
                data-testid="ctr-add-piece"
                onClick={() => {
                  const roomId = roomOptions[0]?.id;
                  if (!roomId || !draft) return;
                  updateDraft(addPiece(draft, roomId));
                }}
              >
                Add piece
              </button>

              {blocking.length ? (
                <ul className="ctr-issues ctr-issues--block" data-testid="ctr-blocking">
                  {blocking.map((b) => (
                    <li key={`${b.code}-${b.path}`}>{b.message}</li>
                  ))}
                </ul>
              ) : null}
              {advisory.length ? (
                <ul className="ctr-issues ctr-issues--warn" data-testid="ctr-advisory">
                  {advisory.map((b) => (
                    <li key={`${b.code}-${b.path}`}>{b.message}</li>
                  ))}
                </ul>
              ) : null}

              {approveMsg ? (
                <p
                  className={
                    approveStatus === "error" ? "ctr-approve-msg ctr-approve-msg--error" : "ctr-approve-msg"
                  }
                  data-testid="ctr-approve-msg"
                >
                  {approveMsg}
                </p>
              ) : null}

              {approvalDiag ? (
                <div className="ctr-approve-diag" data-testid="ctr-approve-diag">
                  <div className="ctr-approve-diag-title">Last approval request</div>
                  <ul>
                    <li>confirmAdvisories: {String(approvalDiag.confirmAdvisories)}</li>
                    <li>HTTP status: {approvalDiag.httpStatus ?? "—"}</li>
                    <li>returned reviewStatus: {approvalDiag.reviewStatus ?? "—"}</li>
                    <li>returned error code: {approvalDiag.errorCode ?? "—"}</li>
                    <li>
                      blocking: {approvalDiag.blockingCount} · advisory: {approvalDiag.advisoryCount}
                    </li>
                  </ul>
                </div>
              ) : null}

              <button
                type="button"
                className="ctr-btn-primary"
                data-testid="ctr-approve-build"
                disabled={
                  approveStatus === "approving" ||
                  approveStatus === "approved" ||
                  displayStatus === "Processing" ||
                  displayStatus === "Failed" ||
                  Boolean(blocking.length)
                }
                onClick={() => void handleApproveClick()}
              >
                {approveButtonLabel({
                  approveStatus,
                  advisoryCount: advisory.length,
                  blockingCount: blocking.length
                })}
              </button>
            </div>
            {summary ? (
              <p className="ctr-muted" data-testid="ctr-server-summary">
                Server: {String(summary.includedPieces ?? "")} pieces ·{" "}
                {Number(summary.countertopSf ?? 0).toFixed?.(2) ?? summary.countertopSf} SF
              </p>
            ) : null}
          </main>
        </div>
      )}
    </div>
  );
}
