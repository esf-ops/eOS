/**
 * Consolidated estimator Takeoff review — one worksheet + Approve & Build Estimate.
 * Activated with ?consolidated=1&takeoffJobId=… (Studio embed).
 * Reuses existing Takeoff job / Gemini draft / corrections / approve-and-build APIs.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  approveAndBuildEstimate,
  generateAiTakeoffDraft,
  labApiGet,
  LabApiError,
  saveTakeoffCorrection,
  type ApprovalBlockerItem
} from "../lib/api";
import {
  approveButtonLabel,
  runConsolidatedApproveClick
} from "../lib/consolidatedApproveClick.mjs";
import {
  addManualPiece,
  addManualRoom,
  collectManualOwnershipIds,
  createEmptyManualTakeoffDraft,
  deriveConsolidatedWorksheetStatus,
  hasUsableTakeoffGeometry,
  markRunEstimatorOwned
} from "../lib/emptyManualTakeoffDraft.mjs";
import {
  applyDeletionTombstones,
  ensureUniqueTakeoffIdentity,
  hasEstimatorOwnedGeometry,
  removePieceFromTakeoff,
  removeRoomFromTakeoff,
  saveMergeTakeoffDrafts,
  summarizeAiFindingsPreview
} from "@takeoff-core/takeoffAuthoritativeResult.mjs";
import {
  normalizeTakeoffBacksplashEligibility,
  provisionalEligibleBacksplashSf
} from "@takeoff-core/takeoffBacksplashEligibility.mjs";
import {
  normalizeTakeoffCutoutScope,
  setCutoutNote,
  setCutoutQuantity,
  TAKEOFF_CUTOUT_TYPES,
  toggleCutoutEntry
} from "@takeoff-core/takeoffCutoutScope.mjs";
import {
  flattenPieces,
  patchRun,
  renameRoom,
  reassignRun,
  sfFrom
} from "../lib/consolidatedWorksheetRows.mjs";
import { getSupabase } from "../lib/supabase";
import TakeoffPlanPreviewPanel, {
  type PlanPreviewFileMeta
} from "./TakeoffPlanPreviewPanel";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";
type ApproveStatus = "idle" | "approving" | "approved" | "error";
type AiPhase = "unknown" | "queued" | "processing" | "ready" | "failed" | "disabled";

type ApprovalDiagnostic = {
  confirmAdvisories: boolean;
  httpStatus: number | null;
  reviewStatus: string | null;
  errorCode: string | null;
  message: string | null;
  blockingCount: number;
  advisoryCount: number;
};

type CutoutEntry = {
  type: string;
  quantity: number;
  source?: string;
  note?: string;
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
  backsplashEligible: boolean;
  included: boolean;
  cutouts: CutoutEntry[];
  cutoutsSummary: string;
  sideSplashLeftEligible: boolean;
  sideSplashRightEligible: boolean;
  note: string;
  lowConfidence: boolean;
};

/**
 * Unique ids + per-run backsplash eligibility (legacy height → eligible) +
 * structured cutouts (legacy "sink:1" strings / object maps → typed entries).
 */
function healTakeoffDraft(takeoff: any) {
  const unique = ensureUniqueTakeoffIdentity(takeoff).takeoff;
  const eligible = normalizeTakeoffBacksplashEligibility(unique).takeoff;
  return normalizeTakeoffCutoutScope(eligible).takeoff;
}

function addPiece(result: any, roomId: string): any {
  return addManualPiece(result, roomId);
}

function addRoom(result: any): any {
  return addManualRoom(result || createEmptyManualTakeoffDraft(), {
    name: "New room",
    roomType: "Kitchen"
  });
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

  const [draft, setDraft] = useState<any | null>(() => createEmptyManualTakeoffDraft());
  const [excludedRunIds, setExcludedRunIds] = useState<Set<string>>(new Set());
  const [deletedRoomIds, setDeletedRoomIds] = useState<Set<string>>(new Set());
  const [deletedRunIds, setDeletedRunIds] = useState<Set<string>>(new Set());
  const [planFile, setPlanFile] = useState<PlanPreviewFileMeta | null>(null);
  const [displayStatus, setDisplayStatus] = useState("Takeoff processing");
  const [aiPhase, setAiPhase] = useState<AiPhase>("unknown");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [approveStatus, setApproveStatus] = useState<ApproveStatus>("idle");
  const [approveMsg, setApproveMsg] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<ApprovalBlockerItem[]>([]);
  const [advisory, setAdvisory] = useState<ApprovalBlockerItem[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [approvalDiag, setApprovalDiag] = useState<ApprovalDiagnostic | null>(null);
  const [pendingAiMerge, setPendingAiMerge] = useState(false);
  const [pendingAiPreview, setPendingAiPreview] = useState<{
    rooms: Array<{
      id: string;
      name: string;
      pieces: Array<{
        id: string;
        name: string;
        lengthIn: number;
        depthIn: number;
        quantity: number;
        sf: number;
      }>;
    }>;
  }>({ rooms: [] });
  const [pendingAiResultId, setPendingAiResultId] = useState<string | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [planCollapsed, setPlanCollapsed] = useState(false);
  const [aiAppendNotice, setAiAppendNotice] = useState<string | null>(null);
  const pendingServerTakeoffRef = useRef<any | null>(null);
  const pendingAiResultIdRef = useRef<string | null>(null);
  const autoMergeInFlightRef = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const draftRef = useRef(draft);
  const excludedRef = useRef(excludedRunIds);
  const deletedRoomIdsRef = useRef(deletedRoomIds);
  const deletedRunIdsRef = useRef(deletedRunIds);
  const saveStatusRef = useRef(saveStatus);
  draftRef.current = draft;
  excludedRef.current = excludedRunIds;
  deletedRoomIdsRef.current = deletedRoomIds;
  deletedRunIdsRef.current = deletedRunIds;
  saveStatusRef.current = saveStatus;

  const mergeTombstones = useCallback(
    () => ({
      deletedRoomIds: [...deletedRoomIdsRef.current],
      deletedRunIds: [...deletedRunIdsRef.current]
    }),
    []
  );

  const hydrateReviewMeta = useCallback((rs: any) => {
    setExcludedRunIds(new Set(rs?.excludedRunIds ?? []));
    setDeletedRoomIds(new Set(rs?.deletedRoomIds ?? []));
    setDeletedRunIds(new Set(rs?.deletedRunIds ?? []));
  }, []);

  const unionLocalTombstones = useCallback((rs: any) => {
    setDeletedRoomIds((prev) => {
      const next = new Set(prev);
      for (const id of rs?.deletedRoomIds ?? []) next.add(String(id));
      return next;
    });
    setDeletedRunIds((prev) => {
      const next = new Set(prev);
      for (const id of rs?.deletedRunIds ?? []) next.add(String(id));
      return next;
    });
    if (Array.isArray(rs?.excludedRunIds)) {
      setExcludedRunIds(new Set(rs.excludedRunIds));
    }
  }, []);

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

  const applyPendingAiFromLatest = useCallback((latest: any) => {
    if (latest?.pendingAiAvailable && latest?.pendingAiDraft) {
      pendingServerTakeoffRef.current = latest.pendingAiDraft;
      pendingAiResultIdRef.current = latest.pendingAiResultId
        ? String(latest.pendingAiResultId)
        : null;
      setPendingAiResultId(pendingAiResultIdRef.current);
      setPendingAiMerge(true);
      setPendingAiPreview(
        latest.pendingAiPreview?.rooms
          ? latest.pendingAiPreview
          : summarizeAiFindingsPreview(latest.pendingAiDraft)
      );
      return true;
    }
    setPendingAiMerge(false);
    pendingServerTakeoffRef.current = null;
    pendingAiResultIdRef.current = null;
    setPendingAiResultId(null);
    return false;
  }, []);

  const loadWorkspace = useCallback(async (
    token: string,
    jobId: string,
    opts?: { forceServer?: boolean; discardLocal?: boolean }
  ) => {
    setLoadError(null);
    const job = (await labApiGet(
      `/api/takeoff-jobs/${encodeURIComponent(jobId)}`,
      token
    )) as any;
    const latest = (await labApiGet(
      `/api/takeoff-jobs/${encodeURIComponent(jobId)}/results/latest`,
      token
    ).catch(() => null)) as any;
    // Authoritative estimator draft only — never treat pending AI as this payload.
    const result =
      latest?.normalizedTakeoffJson ||
      job?.latestResult?.normalizedTakeoffJson ||
      job?.resultSummary?.normalizedTakeoffJson ||
      null;

    const jobStatus = String(job?.status ?? "").toLowerCase();
    const reviewStatus = String(job?.reviewStatus ?? latest?.reviewStatus ?? "").toLowerCase();
    const usableServer = hasUsableTakeoffGeometry(result);
    const pendingAiAvailable = Boolean(latest?.pendingAiAvailable && latest?.pendingAiDraft);

    if (jobStatus === "failed" || jobStatus === "error") setAiPhase("failed");
    else if (jobStatus === "processing" || jobStatus === "pending" || jobStatus === "queued") {
      setAiPhase(jobStatus === "queued" || jobStatus === "pending" ? "queued" : "processing");
    } else if (usableServer || reviewStatus === "needs_review" || reviewStatus === "approved") {
      setAiPhase("ready");
    } else {
      setAiPhase("queued");
    }

    const dirty =
      saveStatusRef.current === "dirty" || saveStatusRef.current === "saving";
    let activeDraft = draftRef.current || createEmptyManualTakeoffDraft();
    const localOwned =
      hasEstimatorOwnedGeometry(activeDraft) || hasUsableTakeoffGeometry(activeDraft);

    if (opts?.discardLocal && result) {
      // Legacy replace path — load authoritative server draft (not pending AI).
      const rs = latest?.reviewState || {};
      hydrateReviewMeta(rs);
      // Self-heal missing/duplicated run ids and legacy area-level backsplash
      // height → per-run eligibility (persists on next autosave).
      const cleaned = healTakeoffDraft(
        applyDeletionTombstones(result, {
          deletedRoomIds: rs.deletedRoomIds ?? [],
          deletedRunIds: rs.deletedRunIds ?? []
        })
      );
      activeDraft = cleaned;
      setDraft(cleaned);
      applyPendingAiFromLatest(latest);
    } else if (result && usableServer && dirty && !opts?.forceServer && localOwned) {
      // Keep unsaved local estimator draft; still surface pending AI from server.
      unionLocalTombstones(latest?.reviewState || {});
      applyPendingAiFromLatest(latest);
      if (!pendingAiAvailable) {
        // Fallback: dirty + no pending payload metadata (older servers).
        setPendingAiMerge(false);
      }
    } else if (result && localOwned && dirty && !opts?.forceServer) {
      unionLocalTombstones(latest?.reviewState || {});
      applyPendingAiFromLatest(latest);
    } else if (result) {
      const rs = latest?.reviewState || {};
      hydrateReviewMeta(rs);
      const cleaned = healTakeoffDraft(
        applyDeletionTombstones(result, {
          deletedRoomIds: [
            ...deletedRoomIdsRef.current,
            ...((rs.deletedRoomIds as string[]) || [])
          ],
          deletedRunIds: [
            ...deletedRunIdsRef.current,
            ...((rs.deletedRunIds as string[]) || [])
          ]
        })
      );
      activeDraft = cleaned;
      draftRef.current = cleaned;
      setDraft(cleaned);
      applyPendingAiFromLatest(latest);
    } else if (!hasUsableTakeoffGeometry(activeDraft)) {
      activeDraft = createEmptyManualTakeoffDraft();
      setDraft(activeDraft);
      applyPendingAiFromLatest(latest);
    } else {
      applyPendingAiFromLatest(latest);
    }

    setDisplayStatus(
      deriveConsolidatedWorksheetStatus({
        jobStatus,
        reviewStatus,
        hasUsableGeometry: hasUsableTakeoffGeometry(activeDraft) || usableServer,
        pendingAiAvailable
      })
    );

    const file = job?.file || latest?.file;
    if (file?.quoteFileId || file?.id) {
      setPlanFile({
        quoteFileId: String(file.quoteFileId || file.id),
        originalFilename: String(file.originalFilename || file.filename || "plan.pdf"),
        mimeType: file.mimeType ?? "application/pdf",
        status: String(file.status ?? "ready")
      });
    }
  }, [hydrateReviewMeta, unionLocalTombstones, applyPendingAiFromLatest]);

  const persistDraftWithResult = useCallback(
    async (
      takeoffResult: any,
      opts?: {
        aiHandling?: {
          lastMergedAiResultId?: string | null;
          dismissAiResultId?: string | null;
          sourceResultId?: string | null;
        } | null;
        correctionNotes?: string;
      }
    ) => {
      if (!authToken || !takeoffJobId || !takeoffResult) return;
      draftRef.current = takeoffResult;
      setDraft(takeoffResult);
      setSaveStatus("saving");
      setSaveError(null);
      try {
        const ownership = collectManualOwnershipIds(takeoffResult);
        const roomCompleteness: Record<string, boolean> = {};
        for (const room of takeoffResult?.rooms ?? []) {
          if (room?.id) roomCompleteness[room.id] = true;
        }
        await saveTakeoffCorrection(authToken, takeoffJobId, {
          takeoffResult,
          correctionNotes: opts?.correctionNotes ?? "Consolidated worksheet autosave",
          reviewState: {
            excludedRunIds: [...excludedRef.current],
            excludedRoomIds: [],
            deletedRoomIds: [...deletedRoomIdsRef.current],
            deletedRunIds: [...deletedRunIdsRef.current],
            roomCompleteness,
            flagResolutions: {},
            referenceTotalAcks: {},
            evidenceAcks: {},
            manualRoomIds: ownership.manualRoomIds,
            manualRunIds: ownership.manualRunIds
          },
          aiHandling: opts?.aiHandling ?? null
        });
        setSaveStatus("saved");
        window.setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 1200);
      } catch (e) {
        setSaveStatus("error");
        setSaveError(e instanceof LabApiError ? e.message : "Save failed");
        throw e;
      }
    },
    [authToken, takeoffJobId]
  );

  const handleAutoAppendAi = useCallback(async () => {
    if (!authToken || !takeoffJobId) return;
    const local = draftRef.current || createEmptyManualTakeoffDraft();
    let serverAi = pendingServerTakeoffRef.current;
    let pendingId = pendingAiResultIdRef.current;
    if (!serverAi) {
      const latest = (await labApiGet(
        `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}/results/latest`,
        authToken
      ).catch(() => null)) as any;
      if (latest?.pendingAiAvailable && latest?.pendingAiDraft) {
        serverAi = latest.pendingAiDraft;
        pendingId = latest.pendingAiResultId ? String(latest.pendingAiResultId) : null;
      }
      if (latest?.reviewState) unionLocalTombstones(latest.reviewState);
    }
    if (!serverAi) {
      setPendingAiMerge(false);
      pendingServerTakeoffRef.current = null;
      pendingAiResultIdRef.current = null;
      setPendingAiResultId(null);
      return;
    }
    const preview = summarizeAiFindingsPreview(serverAi);
    const { merged } = saveMergeTakeoffDrafts(local, serverAi, mergeTombstones());
    // AI drafts can carry duplicate/placeholder run ids and legacy height-only
    // backsplash — heal identity + eligibility before persisting.
    const healed = healTakeoffDraft(merged);
    await persistDraftWithResult(healed, {
      correctionNotes: "Auto-append AI findings (non-destructive)",
      aiHandling: pendingId
        ? {
            lastMergedAiResultId: pendingId,
            sourceResultId: pendingId
          }
        : null
    });
    pendingServerTakeoffRef.current = null;
    pendingAiResultIdRef.current = null;
    setPendingAiResultId(null);
    setPendingAiMerge(false);
    setPendingAiPreview(preview);
    setAiAppendNotice(
      "AI findings were added. Estimator-owned geometry and removals were preserved."
    );
    await loadWorkspace(authToken, takeoffJobId, { forceServer: false });
  }, [
    authToken,
    takeoffJobId,
    persistDraftWithResult,
    loadWorkspace,
    mergeTombstones,
    unionLocalTombstones
  ]);

  // Automatic non-destructive AI append — no manual merge step for estimators.
  useEffect(() => {
    if (!pendingAiMerge || !authToken || !takeoffJobId) return;
    if (autoMergeInFlightRef.current) return;
    if (saveStatusRef.current === "saving") return;
    autoMergeInFlightRef.current = true;
    void handleAutoAppendAi()
      .catch((e) =>
        setLoadError(e instanceof LabApiError ? e.message : "AI append failed")
      )
      .finally(() => {
        autoMergeInFlightRef.current = false;
      });
  }, [pendingAiMerge, authToken, takeoffJobId, handleAutoAppendAi]);

  useEffect(() => {
    if (!authToken || !takeoffJobId) return;
    void loadWorkspace(authToken, takeoffJobId).catch((e) => {
      setLoadError(e instanceof LabApiError ? e.message : "Unable to load Takeoff");
    });
  }, [authToken, takeoffJobId, loadWorkspace]);

  // Keep polling after draft is ready so a later AI completion surfaces as pending.
  // Prefer event-driven refresh; poll slowly and pause when the tab is hidden.
  useEffect(() => {
    if (!authToken || !takeoffJobId) return;
    if (approveStatus === "approved") return;
    if (aiPhase === "failed") return;
    let cancelled = false;
    const tick = () => {
      if (cancelled || document.hidden) return;
      void loadWorkspace(authToken, takeoffJobId).catch(() => {});
    };
    tick();
    const timer = window.setInterval(tick, 20_000);
    function onVisibility() {
      if (!document.hidden) tick();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authToken, takeoffJobId, aiPhase, approveStatus, loadWorkspace]);
  const buildReviewState = useCallback(() => {
    const roomCompleteness: Record<string, boolean> = {};
    for (const room of draftRef.current?.rooms ?? []) {
      if (room?.id) roomCompleteness[room.id] = true;
    }
    const ownership = collectManualOwnershipIds(draftRef.current);
    return {
      excludedRunIds: [...excludedRef.current],
      excludedRoomIds: [],
      deletedRoomIds: [...deletedRoomIdsRef.current],
      deletedRunIds: [...deletedRunIdsRef.current],
      roomCompleteness,
      flagResolutions: {},
      referenceTotalAcks: {},
      evidenceAcks: {},
      manualRoomIds: ownership.manualRoomIds,
      manualRunIds: ownership.manualRunIds
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

  const handleRemoveRoom = useCallback(
    (roomId: string, roomName: string, pieceCount: number) => {
      if (pieceCount > 0) {
        const ok = window.confirm(
          `Remove room "${roomName}" and its ${pieceCount} piece${
            pieceCount === 1 ? "" : "s"
          }? This cannot be undone by AI refresh.`
        );
        if (!ok) return;
      }
      const pack = removeRoomFromTakeoff(draftRef.current || createEmptyManualTakeoffDraft(), roomId);
      setDeletedRoomIds((prev) => {
        const next = new Set(prev);
        for (const id of pack.deletedRoomIds) next.add(id);
        return next;
      });
      setDeletedRunIds((prev) => {
        const next = new Set(prev);
        for (const id of pack.deletedRunIds) next.add(id);
        return next;
      });
      setExcludedRunIds((prev) => {
        const next = new Set(prev);
        for (const id of pack.deletedRunIds) next.delete(id);
        return next;
      });
      updateDraft(pack.takeoff);
    },
    [updateDraft]
  );

  const handleRemovePiece = useCallback(
    (roomId: string, runId: string) => {
      const pack = removePieceFromTakeoff(
        draftRef.current || createEmptyManualTakeoffDraft(),
        roomId,
        runId
      );
      setDeletedRunIds((prev) => {
        const next = new Set(prev);
        for (const id of pack.deletedRunIds) next.add(id);
        return next;
      });
      setExcludedRunIds((prev) => {
        const next = new Set(prev);
        next.delete(runId);
        return next;
      });
      updateDraft(pack.takeoff);
    },
    [updateDraft]
  );

  const rows = useMemo<PieceRow[]>(
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

  /** Rooms including empty ones — Add Room must be visible immediately. */
  const roomSections = useMemo(() => {
    const rooms = Array.isArray(draft?.rooms) ? draft.rooms : [];
    return rooms.map((room: any) => ({
      id: String(room.id),
      name: String(room.name || "Room"),
      pieces: rows.filter((r) => r.roomId === room.id)
    }));
  }, [draft, rows]);

  useEffect(() => {
    if (!roomOptions.length) {
      setSelectedRoomId(null);
      return;
    }
    if (!selectedRoomId || !roomOptions.some((r: { id: string }) => r.id === selectedRoomId)) {
      setSelectedRoomId(roomOptions[0].id);
    }
  }, [roomOptions, selectedRoomId]);

  const localSummary = useMemo(() => {
    const included = rows.filter((r) => r.included);
    return {
      rooms: roomOptions.length,
      includedPieces: included.length,
      countertopSf: included.reduce((s, r) => s + r.countertopSf, 0),
      // Provisional 4" preview for eligible runs only — not customer pricing authority.
      backsplashSf: provisionalEligibleBacksplashSf(included),
      blockingCount: blocking.length,
      advisoryCount: advisory.length
    };
  }, [rows, roomOptions.length, blocking, advisory]);

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
            {saveStatus !== "idle" ? (
              <>
                {" · "}
                <span data-testid="ctr-save-status">{saveStatus}</span>
              </>
            ) : null}
            {saveError ? <span className="ctr-error"> — {saveError}</span> : null}
          </p>
        </div>
      </header>

      {loadError ? (
        <div className="ctr-state ctr-error" role="alert">
          {loadError}
        </div>
      ) : null}

      {aiPhase === "queued" || aiPhase === "processing" || aiPhase === "unknown" ? (
        <div className="ctr-state" role="status" data-testid="ctr-ai-banner">
          AI Takeoff is processing. You may build or edit the takeoff now. AI findings will be
          added when ready.
        </div>
      ) : null}
      {aiPhase === "failed" ? (
        <div className="ctr-state ctr-warn" role="status" data-testid="ctr-ai-failed-banner">
          AI Takeoff failed. Retry AI Takeoff or continue building the takeoff manually.
        </div>
      ) : null}
      {pendingAiMerge ? (
        <div className="ctr-state" role="status" data-testid="ctr-pending-ai-append">
          AI findings are ready and are being added automatically. Estimator-owned geometry and
          removals stay authoritative.
        </div>
      ) : null}
      {aiAppendNotice ? (
        <div className="ctr-state" role="status" data-testid="ctr-ai-append-notice">
          {aiAppendNotice}
          {(pendingAiPreview.rooms ?? []).length ? (
            <div className="ctr-ai-findings" data-testid="ctr-ai-findings-preview">
              <div className="ctr-ai-findings-title">Recently appended AI findings</div>
              <ul className="ctr-ai-findings-list">
                {(pendingAiPreview.rooms ?? []).map((room) => (
                  <li key={room.id || room.name} className="ctr-ai-findings-room">
                    <strong>{room.name}</strong>
                    {(room.pieces ?? []).length === 0 ? (
                      <span className="ctr-muted"> — no pieces</span>
                    ) : (
                      <ul>
                        {(room.pieces ?? []).map((piece) => (
                          <li key={piece.id || `${room.id}-${piece.name}`}>
                            {piece.name}
                            {piece.lengthIn || piece.depthIn
                              ? ` · ${piece.lengthIn || "—"}×${piece.depthIn || "—"} in`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="ctr-plan-toolbar">
        <button
          type="button"
          className="ctr-btn-secondary"
          data-testid="ctr-toggle-plan"
          aria-pressed={planCollapsed}
          onClick={() => setPlanCollapsed((v) => !v)}
        >
          {planCollapsed ? "Show plan preview" : "Hide plan preview"}
        </button>
      </div>

      <div className={planCollapsed ? "ctr-layout ctr-layout--plan-collapsed" : "ctr-layout"}>
          <aside className="ctr-plan" data-testid="ctr-plan-preview">
            <TakeoffPlanPreviewPanel token={authToken} file={planFile} refreshKey={takeoffJobId} />
          </aside>

          <main className="ctr-main">
            <div className="ctr-summary" data-testid="ctr-summary">
              <span>{localSummary.rooms} rooms</span>
              <span>{localSummary.includedPieces} pieces</span>
              <span>{localSummary.countertopSf.toFixed(2)} SF countertop</span>
              <span>{localSummary.backsplashSf.toFixed(2)} SF backsplash (eligible @ 4″)</span>
              {blocking.length ? (
                <span className="ctr-badge ctr-badge--block">{blocking.length} blocking</span>
              ) : null}
              {advisory.length ? (
                <span className="ctr-badge ctr-badge--warn">{advisory.length} advisory</span>
              ) : null}
            </div>

            <p className="ctr-muted ctr-backsplash-help" data-testid="ctr-backsplash-help">
              Mark the countertop runs that meet a wall or cabinet. Islands and open edges
              should be left off.
            </p>

            <div className="ctr-table-wrap">
              <table className="ctr-table" data-testid="ctr-worksheet">
                <thead>
                  <tr>
                    <th className="ctr-col-room">Room</th>
                    <th className="ctr-col-piece">Piece</th>
                    <th className="ctr-col-dim">Length (in)</th>
                    <th className="ctr-col-dim">Depth (in)</th>
                    <th className="ctr-col-qty">Quantity</th>
                    <th className="ctr-col-sf">Square feet</th>
                    <th className="ctr-col-bs">Backsplash</th>
                    <th className="ctr-col-incl">Included</th>
                    <th className="ctr-col-cutouts">Cutouts</th>
                    <th className="ctr-col-notes">Notes</th>
                    <th className="ctr-col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roomSections.length === 0 ? (
                    <tr data-testid="ctr-empty-worksheet">
                      <td colSpan={11} className="ctr-muted">
                        No rooms yet. Add a room, then add a piece to start measuring.
                      </td>
                    </tr>
                  ) : null}
                  {roomSections.map((section) => (
                    <React.Fragment key={section.id}>
                      <tr
                        className={
                          selectedRoomId === section.id
                            ? "ctr-room ctr-room--selected"
                            : "ctr-room"
                        }
                        data-testid="ctr-room"
                        data-room-id={section.id}
                        onClick={() => setSelectedRoomId(section.id)}
                      >
                        <td colSpan={11}>
                          <div className="ctr-room-header">
                            <input
                              className="ctr-room-rename"
                              aria-label="Room name"
                              data-testid="ctr-room-name"
                              value={section.name}
                              onChange={(e) =>
                                updateDraft(renameRoom(draft, section.id, e.target.value))
                              }
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="ctr-muted">
                              {section.pieces.length === 0
                                ? "Empty room — add a piece to measure"
                                : `${section.pieces.length} piece${
                                    section.pieces.length === 1 ? "" : "s"
                                  }`}
                            </span>
                            <button
                              type="button"
                              className="ctr-btn-secondary ctr-room-add-piece"
                              data-testid="ctr-room-add-piece"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRoomId(section.id);
                                updateDraft(
                                  addPiece(draft || createEmptyManualTakeoffDraft(), section.id)
                                );
                              }}
                            >
                              Add piece
                            </button>
                            <button
                              type="button"
                              className="ctr-btn-secondary ctr-remove"
                              data-testid="ctr-remove-room"
                              aria-label={`Remove room ${section.name}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveRoom(section.id, section.name, section.pieces.length);
                              }}
                            >
                              Remove room
                            </button>
                          </div>
                        </td>
                      </tr>
                      {section.pieces.length === 0 ? (
                        <tr
                          className="ctr-room-empty"
                          data-testid="ctr-room-empty"
                          data-room-id={section.id}
                        >
                          <td colSpan={11} className="ctr-muted">
                            No pieces in this room yet.
                          </td>
                        </tr>
                      ) : null}
                      {section.pieces.map((row) => {
                        const rowControlKey = `${row.roomId}-${row.areaId}-${row.runId}`;
                        const bsId = `ctr-bs-${rowControlKey}`;
                        const inclId = `ctr-incl-${rowControlKey}`;
                        const cutId = `ctr-cutouts-${rowControlKey}`;
                        const rowLocked = approveStatus === "approved";
                        return (
                    <tr
                      key={row.key}
                      className={[
                        row.included ? "" : "ctr-row--excluded",
                        row.lowConfidence ? "ctr-row--low" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <td className="ctr-col-room">
                        <select
                          aria-label="Room"
                          value={row.roomId}
                          disabled={rowLocked}
                          onChange={(e) => {
                            const to = e.target.value;
                            updateDraft(reassignRun(draft, row.roomId, row.runId, to));
                          }}
                        >
                          {roomOptions.map((r: { id: string; name: string }) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="ctr-col-piece">
                        <input
                          className="ctr-piece-name"
                          value={row.pieceName}
                          aria-label="Piece name"
                          data-testid="ctr-piece-name"
                          onChange={(e) =>
                            updateDraft(
                              markRunEstimatorOwned(
                                patchRun(
                                  draft,
                                  { roomId: row.roomId, areaId: row.areaId, runId: row.runId },
                                  { label: e.target.value }
                                ),
                                row.roomId,
                                row.runId
                              )
                            )
                          }
                        />
                      </td>
                      <td className="ctr-col-dim">
                        <input
                          className="ctr-dim-input"
                          type="number"
                          step="0.1"
                          value={row.lengthIn || ""}
                          aria-label="Length inches"
                          data-testid="ctr-length"
                          onChange={(e) => {
                            const lengthIn = Number(e.target.value) || 0;
                            updateDraft(
                              markRunEstimatorOwned(
                                patchRun(
                                  draft,
                                  { roomId: row.roomId, areaId: row.areaId, runId: row.runId },
                                  { lengthIn, sf: sfFrom(lengthIn, row.depthIn) }
                                ),
                                row.roomId,
                                row.runId
                              )
                            );
                          }}
                        />
                      </td>
                      <td className="ctr-col-dim">
                        <input
                          className="ctr-dim-input"
                          type="number"
                          step="0.1"
                          value={row.depthIn || ""}
                          aria-label="Depth inches"
                          data-testid="ctr-depth"
                          onChange={(e) => {
                            const depthIn = Number(e.target.value) || 0;
                            updateDraft(
                              markRunEstimatorOwned(
                                patchRun(
                                  draft,
                                  { roomId: row.roomId, areaId: row.areaId, runId: row.runId },
                                  { depthIn, sf: sfFrom(row.lengthIn, depthIn) }
                                ),
                                row.roomId,
                                row.runId
                              )
                            );
                          }}
                        />
                      </td>
                      <td className="ctr-col-qty">
                        <input
                          className="ctr-dim-input"
                          type="number"
                          min={1}
                          value={row.quantity}
                          aria-label="Quantity"
                          data-testid="ctr-quantity"
                          onChange={(e) =>
                            updateDraft(
                              patchRun(
                                draft,
                                { roomId: row.roomId, areaId: row.areaId, runId: row.runId },
                                { quantity: Number(e.target.value) || 1 }
                              )
                            )
                          }
                        />
                      </td>
                      <td className="ctr-col-sf ctr-sf" data-testid="ctr-sqft">
                        {row.countertopSf.toFixed(2)}
                      </td>
                      <td className="ctr-col-bs">
                        <label className="ctr-bs-toggle" htmlFor={bsId}>
                          <input
                            id={bsId}
                            type="checkbox"
                            checked={row.backsplashEligible}
                            aria-label="Include backsplash for this run"
                            data-testid="ctr-backsplash-eligible"
                            data-room-id={row.roomId}
                            data-area-id={row.areaId}
                            data-run-id={row.runId}
                            disabled={rowLocked}
                            onChange={(e) =>
                              updateDraft(
                                markRunEstimatorOwned(
                                  patchRun(
                                    draft,
                                    {
                                      roomId: row.roomId,
                                      areaId: row.areaId,
                                      runId: row.runId
                                    },
                                    {
                                      backsplashEligible: e.target.checked,
                                      backsplashEligibilitySource: "estimator_confirmed",
                                      backsplashEligibilityUpdatedAt: new Date().toISOString()
                                    }
                                  ),
                                  row.roomId,
                                  row.runId
                                )
                              )
                            }
                          />
                          <span className="ctr-bs-toggle-label">
                            {row.backsplashEligible ? "Include" : "No backsplash"}
                          </span>
                        </label>
                      </td>
                      <td className="ctr-col-incl">
                        <label htmlFor={inclId} className="ctr-bs-toggle">
                          <input
                            id={inclId}
                            type="checkbox"
                            checked={row.included}
                            aria-label="Include piece"
                            data-testid="ctr-include-piece"
                            disabled={rowLocked}
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
                          <span className="ctr-bs-toggle-label">
                            {row.included ? "Yes" : "No"}
                          </span>
                        </label>
                      </td>
                      <td className="ctr-col-cutouts">
                        <details
                          className="ctr-cutouts-pop"
                          id={cutId}
                          data-testid="ctr-cutouts"
                          data-room-id={row.roomId}
                          data-area-id={row.areaId}
                          data-run-id={row.runId}
                        >
                          <summary
                            className="ctr-cutouts-summary"
                            data-testid="ctr-cutouts-summary"
                            aria-label={`Cutouts for ${row.pieceName}`}
                          >
                            {row.cutoutsSummary}
                          </summary>
                          <div className="ctr-cutouts-menu" data-testid="ctr-cutouts-menu">
                            {TAKEOFF_CUTOUT_TYPES.map(
                              (opt: { type: string; label: string }) => {
                                const entry = row.cutouts.find(
                                  (c: CutoutEntry) => c.type === opt.type
                                );
                                const checked = Boolean(entry);
                                const boxId = `${cutId}-${opt.type}`;
                                return (
                                  <div key={opt.type} className="ctr-cutouts-option">
                                    <label className="ctr-bs-toggle" htmlFor={boxId}>
                                      <input
                                        id={boxId}
                                        type="checkbox"
                                        checked={checked}
                                        disabled={rowLocked}
                                        data-testid={`ctr-cutout-${opt.type}`}
                                        onChange={(e) =>
                                          updateDraft(
                                            markRunEstimatorOwned(
                                              patchRun(
                                                draft,
                                                {
                                                  roomId: row.roomId,
                                                  areaId: row.areaId,
                                                  runId: row.runId
                                                },
                                                {
                                                  cutouts: toggleCutoutEntry(
                                                    row.cutouts,
                                                    opt.type,
                                                    e.target.checked
                                                  )
                                                }
                                              ),
                                              row.roomId,
                                              row.runId
                                            )
                                          )
                                        }
                                      />
                                      <span className="ctr-bs-toggle-label">{opt.label}</span>
                                    </label>
                                    {checked ? (
                                      <input
                                        type="number"
                                        min={1}
                                        className="ctr-cutouts-qty"
                                        aria-label={`${opt.label} quantity`}
                                        value={entry?.quantity ?? 1}
                                        disabled={rowLocked}
                                        onChange={(e) =>
                                          updateDraft(
                                            patchRun(
                                              draft,
                                              {
                                                roomId: row.roomId,
                                                areaId: row.areaId,
                                                runId: row.runId
                                              },
                                              {
                                                cutouts: setCutoutQuantity(
                                                  row.cutouts,
                                                  opt.type,
                                                  Number(e.target.value) || 1
                                                )
                                              }
                                            )
                                          )
                                        }
                                      />
                                    ) : null}
                                    {checked && opt.type === "other" ? (
                                      <input
                                        className="ctr-cutouts-note"
                                        placeholder="Describe the opening (required)"
                                        aria-label="Other cutout note"
                                        data-testid="ctr-cutout-other-note"
                                        value={entry?.note ?? ""}
                                        disabled={rowLocked}
                                        onChange={(e) =>
                                          updateDraft(
                                            patchRun(
                                              draft,
                                              {
                                                roomId: row.roomId,
                                                areaId: row.areaId,
                                                runId: row.runId
                                              },
                                              {
                                                cutouts: setCutoutNote(
                                                  row.cutouts,
                                                  "other",
                                                  e.target.value
                                                )
                                              }
                                            )
                                          )
                                        }
                                      />
                                    ) : null}
                                  </div>
                                );
                              }
                            )}
                            <div className="ctr-cutouts-sidesplash">
                              <span className="ctr-cutouts-side-title">Side splash eligible</span>
                              <label className="ctr-bs-toggle" htmlFor={`${cutId}-ss-left`}>
                                <input
                                  id={`${cutId}-ss-left`}
                                  type="checkbox"
                                  checked={row.sideSplashLeftEligible}
                                  disabled={rowLocked}
                                  data-testid="ctr-sidesplash-left"
                                  onChange={(e) =>
                                    updateDraft(
                                      patchRun(
                                        draft,
                                        {
                                          roomId: row.roomId,
                                          areaId: row.areaId,
                                          runId: row.runId
                                        },
                                        { sideSplashLeftEligible: e.target.checked }
                                      )
                                    )
                                  }
                                />
                                <span className="ctr-bs-toggle-label">Left</span>
                              </label>
                              <label className="ctr-bs-toggle" htmlFor={`${cutId}-ss-right`}>
                                <input
                                  id={`${cutId}-ss-right`}
                                  type="checkbox"
                                  checked={row.sideSplashRightEligible}
                                  disabled={rowLocked}
                                  data-testid="ctr-sidesplash-right"
                                  onChange={(e) =>
                                    updateDraft(
                                      patchRun(
                                        draft,
                                        {
                                          roomId: row.roomId,
                                          areaId: row.areaId,
                                          runId: row.runId
                                        },
                                        { sideSplashRightEligible: e.target.checked }
                                      )
                                    )
                                  }
                                />
                                <span className="ctr-bs-toggle-label">Right</span>
                              </label>
                            </div>
                          </div>
                        </details>
                      </td>
                      <td className="ctr-col-notes">
                        <input
                          className="ctr-note-input"
                          value={row.note}
                          aria-label="Notes"
                          data-testid="ctr-notes"
                          onChange={(e) =>
                            updateDraft(
                              patchRun(
                                draft,
                                { roomId: row.roomId, areaId: row.areaId, runId: row.runId },
                                { notes: e.target.value ? [e.target.value] : [] }
                              )
                            )
                          }
                        />
                      </td>
                      <td className="ctr-col-actions">
                        <button
                          type="button"
                          className="ctr-btn-secondary ctr-remove"
                          data-testid="ctr-remove-piece"
                          aria-label={`Remove piece ${row.pieceName}`}
                          onClick={() => handleRemovePiece(row.roomId, row.runId)}
                        >
                          Remove piece
                        </button>
                      </td>
                    </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="ctr-actions">
              <button
                type="button"
                className="ctr-btn-secondary"
                data-testid="ctr-add-room"
                onClick={() => {
                  const next = addRoom(draft || createEmptyManualTakeoffDraft());
                  const newId = next.rooms?.[next.rooms.length - 1]?.id;
                  if (newId) setSelectedRoomId(String(newId));
                  updateDraft(next);
                }}
              >
                Add room
              </button>
              <button
                type="button"
                className="ctr-btn-secondary"
                data-testid="ctr-add-piece"
                disabled={!selectedRoomId && !roomOptions[0]?.id}
                onClick={() => {
                  const roomId = selectedRoomId || roomOptions[0]?.id;
                  if (!roomId) return;
                  updateDraft(addPiece(draft || createEmptyManualTakeoffDraft(), roomId));
                }}
              >
                Add piece
              </button>
              <button
                type="button"
                className="ctr-btn-secondary"
                data-testid="ctr-save-draft"
                onClick={() => void persistDraft()}
              >
                Save draft
              </button>
              {aiPhase === "failed" ? (
                <button
                  type="button"
                  className="ctr-btn-secondary"
                  data-testid="ctr-retry-ai"
                  disabled={retryBusy || !authToken || !takeoffJobId}
                  onClick={() => {
                    if (!authToken || !takeoffJobId) return;
                    setRetryBusy(true);
                    void generateAiTakeoffDraft(authToken, takeoffJobId)
                      .then(() => loadWorkspace(authToken, takeoffJobId))
                      .catch((e) =>
                        setLoadError(e instanceof LabApiError ? e.message : "Retry AI failed")
                      )
                      .finally(() => setRetryBusy(false));
                  }}
                >
                  {retryBusy ? "Retrying…" : "Retry AI Takeoff"}
                </button>
              ) : null}

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
                  displayStatus === "Takeoff failed" ||
                  !hasUsableTakeoffGeometry(draft) ||
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
    </div>
  );
}
