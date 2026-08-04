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
import { buildLocalReviewTakeoffDraft } from "../lib/localReviewTakeoffFixture.mjs";
import {
  TAKEOFF_REVIEW_READY,
  TAKEOFF_REVIEW_DRAFT_SAVED,
  TAKEOFF_WATERFALL_CHANGED,
  summarizeTakeoffDraftForReady,
  postTakeoffParentMessage,
  loadLocalReviewDraft,
  saveLocalReviewDraft
} from "../lib/takeoffReviewReadyContract.mjs";
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
  patchRunGeometry,
  renameRoom,
  reassignRun,
  sfFrom
} from "../lib/consolidatedWorksheetRows.mjs";
import {
  applyLocalBacksplashToggle,
  applyLocalExposedEdgeConfirm,
  formatTakeoffSaveStatus,
  isTakeoffWorksheetDirty,
  nextExplicitMutationRevision,
  pieceRequiresExposedEdgeConfirmation,
  reconcileSuccessfulTakeoffSave,
  saveTakeoffDraftExplicit
} from "../lib/takeoffExplicitSave.mjs";
import ExposedSidesDialog from "./ExposedSidesDialog";
import ExposedSidesTrigger from "./ExposedSidesEditor";
import {
  isTakeoffJobTerminal,
  resultVersionOf,
  shouldAcceptServerDraft,
  shouldPollTakeoffJob,
  takeoffPollBackoffMs
} from "../lib/takeoffDraftConcurrency.mjs";
import { getSupabase } from "../lib/supabase";
import TakeoffPlanPreviewPanel, {
  type PlanPreviewFileMeta
} from "./TakeoffPlanPreviewPanel";

type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";
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
  finishedEdgeTotalIn?: number | null;
  finishedEdgeApproved?: boolean;
  frontEdgeLengthIn?: number | null;
  leftExposed?: boolean | null;
  rightExposed?: boolean | null;
  backExposed?: boolean | null;
  frontExposed?: boolean | null;
  pieceTopology?: string | null;
  attachedSide?: string | null;
  exposedSides?: {
    front?: boolean;
    back?: boolean;
    left?: boolean;
    right?: boolean;
  } | null;
  finishedEdge?: unknown;
  pieceType?: string;
  isBacksplash?: boolean;
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
    // AUDIT-005: never use targetOrigin "*". Skip when no exact Studio origin is known.
    if (!window.parent || window.parent === window) return;
    const env = (import.meta as unknown as { env?: Record<string, string> }).env || {};
    const isDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
    let targetOrigin: string | null = null;
    try {
      const configured = String(
        env.VITE_HEAD_URL_ELITE100_ESTIMATE_STUDIO || env.VITE_HEAD_URL_ESTIMATE_STUDIO || ""
      ).trim();
      if (configured) targetOrigin = new URL(configured).origin;
    } catch {
      targetOrigin = null;
    }
    if (!targetOrigin) {
      try {
        if (document.referrer) targetOrigin = new URL(document.referrer).origin;
      } catch {
        /* ignore */
      }
    }
    if (!targetOrigin && isDev) {
      targetOrigin = "http://localhost:5191";
    }
    if (!targetOrigin) {
      if (isDev) {
        console.warn(
          "[takeoff] skipped parent postMessage: configure VITE_HEAD_URL_ELITE100_ESTIMATE_STUDIO"
        );
      }
      return;
    }
    const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
    window.parent.postMessage(
      {
        type: "eliteos-takeoff-approved",
        takeoffJobId,
        source: "consolidated-review",
        reviewStatus: "approved",
        approvedResultId: p.approvedResultId ?? null,
        estimateScopeRefreshRequired: true,
        payload
      },
      targetOrigin
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
      const params = new URLSearchParams(window.location.search);
      const id = params.get("takeoffJobId");
      if (id) return id;
      if (params.get("localReview") === "1") return "local-review-takeoff";
      return null;
    } catch {
      return null;
    }
  }, []);

  const localReview = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("localReview") === "1";
    } catch {
      return false;
    }
  }, []);

  const quoteFlowSetScope = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("quoteFlowSetScope") === "1";
    } catch {
      return false;
    }
  }, []);

  const urlWorkspace = useMemo(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const modeRaw = String(params.get("mode") || "").toLowerCase();
      const mode =
        modeRaw === "readonly"
          ? "readonly"
          : modeRaw === "editable"
            ? "editable"
            : "auto";
      return {
        mode: mode as "editable" | "readonly" | "auto",
        revisionNumber: params.get("revisionNumber"),
        publishedRevisionNumber: params.get("publishedRevisionNumber"),
        approvalStatus: params.get("approvalStatus"),
        isRevisionDraft: params.get("isRevisionDraft") === "1"
      };
    } catch {
      return {
        mode: "auto" as const,
        revisionNumber: null,
        publishedRevisionNumber: null,
        approvalStatus: null,
        isRevisionDraft: false
      };
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
  const [jobReviewStatus, setJobReviewStatus] = useState<string | null>(null);
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
  const [edgeDialogRunId, setEdgeDialogRunId] = useState<string | null>(null);
  const [unsavedEdgeRunIds, setUnsavedEdgeRunIds] = useState<Set<string>>(() => new Set());
  const [newerResultNotice, setNewerResultNotice] = useState(false);
  const pendingServerTakeoffRef = useRef<any | null>(null);
  const pendingAiResultIdRef = useRef<string | null>(null);
  const autoMergeInFlightRef = useRef(false);
  const draftRef = useRef(draft);
  const excludedRef = useRef(excludedRunIds);
  const deletedRoomIdsRef = useRef(deletedRoomIds);
  const deletedRunIdsRef = useRef(deletedRunIds);
  const saveStatusRef = useRef(saveStatus);
  const canonicalDraftRef = useRef<any | null>(null);
  const canonicalExcludedRef = useRef<Set<string>>(new Set());
  const saveInFlightRef = useRef(false);
  const latestResultIdRef = useRef<string | null>(null);
  const latestClientMutationRevisionRef = useRef(0);
  const latestLocalSaveAtRef = useRef<string | null>(null);
  const lastServerResultVersionRef = useRef<string | null>(null);
  const loadSequenceRef = useRef(0);
  const appliedLoadSequenceRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const edgeTriggerFocusRef = useRef<string | null>(null);
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
    if (localReview) {
      const params = new URLSearchParams(window.location.search);
      const withWf = params.get("withWaterfall") === "1";
      const sinkLen = Number(params.get("sinkWallLengthIn") || "");
      const revisionNumber = params.get("revisionNumber") || "1";
      const persisted = loadLocalReviewDraft(takeoffJobId, revisionNumber);
      const seeded =
        persisted ||
        buildLocalReviewTakeoffDraft({
          withWaterfall: withWf,
          sinkWallLengthIn: Number.isFinite(sinkLen) && sinkLen > 0 ? sinkLen : undefined
        });
      setDraft(seeded);
      draftRef.current = seeded;
      canonicalDraftRef.current = structuredClone(seeded);
      setAuthToken("local-review-token");
      setAuthChecked(true);
      setDisplayStatus("Local review fixture");
      setAiPhase("ready");
      setJobReviewStatus(
        urlWorkspace.approvalStatus === "approved" || urlWorkspace.mode === "readonly"
          ? "approved"
          : "draft"
      );
      setApproveStatus(
        urlWorkspace.approvalStatus === "approved" || urlWorkspace.mode === "readonly"
          ? "approved"
          : "idle"
      );
      setSaveStatus("saved");
      setPlanFile({
        quoteFileId: "local-review-plan",
        originalFilename: "Munsterman Plan.svg",
        mimeType: "image/svg+xml",
        status: "ready"
      });
      const summary = summarizeTakeoffDraftForReady(seeded);
      const readyPayload = {
        revisionNumber: Number(revisionNumber) || 1,
        mode:
          urlWorkspace.mode === "readonly" ||
          urlWorkspace.approvalStatus === "approved"
            ? "readonly"
            : "editable",
        roomCount: summary.roomCount,
        pieceCount: summary.pieceCount,
        savedState: "saved",
        waterfalls: summary.waterfalls,
        isRevisionDraft: urlWorkspace.isRevisionDraft
      };
      const emitReady = () =>
        postTakeoffParentMessage(TAKEOFF_REVIEW_READY, readyPayload, {
          localReview: true,
          takeoffJobId
        });
      emitReady();
      const t1 = window.setTimeout(emitReady, 100);
      const t2 = window.setTimeout(emitReady, 500);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }
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
  }, [localReview, urlWorkspace.approvalStatus, urlWorkspace.mode, urlWorkspace.isRevisionDraft, takeoffJobId]);

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
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    const requestSequence = ++loadSequenceRef.current;
    const requestMutationRevision = latestClientMutationRevisionRef.current;
    const localDirty = isTakeoffWorksheetDirty({
      localDraft: draftRef.current,
      canonicalDraft: canonicalDraftRef.current,
      localExcludedRunIds: excludedRef.current,
      canonicalExcludedRunIds: canonicalExcludedRef.current
    });
    const job = (await labApiGet(
      `/api/takeoff-jobs/${encodeURIComponent(jobId)}`,
      token,
      { signal: controller.signal }
    )) as any;
    const latest = (await labApiGet(
      `/api/takeoff-jobs/${encodeURIComponent(jobId)}/results/latest`,
      token,
      { signal: controller.signal }
    ).catch(() => null)) as any;
    if (controller.signal.aborted) return;
    // Authoritative estimator draft only — never treat pending AI as this payload.
    const result =
      latest?.normalizedTakeoffJson ||
      job?.latestResult?.normalizedTakeoffJson ||
      job?.resultSummary?.normalizedTakeoffJson ||
      null;

    const jobStatus = String(job?.status ?? "").toLowerCase();
    const reviewStatus = String(job?.reviewStatus ?? latest?.reviewStatus ?? "").toLowerCase();
    setJobReviewStatus(reviewStatus || null);
    const usableServer = hasUsableTakeoffGeometry(result);
    const pendingAiAvailable = Boolean(latest?.pendingAiAvailable && latest?.pendingAiDraft);
    const acceptServerDraft =
      opts?.discardLocal === true ||
      shouldAcceptServerDraft({
        requestMutationRevision,
        currentMutationRevision: latestClientMutationRevisionRef.current,
        requestSequence,
        latestAppliedSequence: appliedLoadSequenceRef.current,
        serverSavedAt: latest?.savedAt ?? null,
        latestLocalSaveAt: latestLocalSaveAtRef.current
      });
    const previousResultId = latestResultIdRef.current;
    if (latest?.resultId) {
      const incomingId = String(latest.resultId);
      if (
        localDirty &&
        !opts?.discardLocal &&
        previousResultId &&
        incomingId !== previousResultId
      ) {
        setNewerResultNotice(true);
      }
      latestResultIdRef.current = incomingId;
    }
    const serverRevision = Number(latest?.clientMutationRevision) || 0;
    latestClientMutationRevisionRef.current = Math.max(
      latestClientMutationRevisionRef.current,
      serverRevision
    );
    lastServerResultVersionRef.current =
      resultVersionOf(latest) ?? lastServerResultVersionRef.current;

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
      // height → per-run eligibility (persists on next Save draft).
      const cleaned = healTakeoffDraft(
        applyDeletionTombstones(result, {
          deletedRoomIds: rs.deletedRoomIds ?? [],
          deletedRunIds: rs.deletedRunIds ?? []
        })
      );
      activeDraft = cleaned;
      draftRef.current = cleaned;
      setDraft(cleaned);
      canonicalDraftRef.current = structuredClone(cleaned);
      canonicalExcludedRef.current = new Set(excludedRef.current);
      setUnsavedEdgeRunIds(new Set());
      setSaveStatus("idle");
      appliedLoadSequenceRef.current = requestSequence;
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
    } else if (result && acceptServerDraft) {
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
      canonicalDraftRef.current = structuredClone(cleaned);
      canonicalExcludedRef.current = new Set(excludedRef.current);
      setUnsavedEdgeRunIds(new Set());
      setSaveStatus("idle");
      appliedLoadSequenceRef.current = requestSequence;
      applyPendingAiFromLatest(latest);
    } else if (result) {
      // A local edit or newer hydration happened after this request began.
      // Keep the editable draft; only surface pending AI metadata.
      unionLocalTombstones(latest?.reviewState || {});
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
        pendingAiAvailable,
        draftNeedsReview:
          saveStatus === "dirty" ||
          saveStatus === "error" ||
          (reviewStatus === "needs_review" && usableServer)
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

  const markWorksheetDirty = useCallback(() => {
    setSaveStatus("dirty");
    setSaveError(null);
  }, []);

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

  /** Local-only draft mutation — never POSTs corrections. No-op in readonly mode. */
  const updateDraft = useCallback(
    (next: any) => {
      if (urlWorkspace.mode === "readonly") return;
      const snapshot = structuredClone(next);
      draftRef.current = snapshot;
      setDraft(snapshot);
      markWorksheetDirty();
    },
    [markWorksheetDirty, urlWorkspace.mode]
  );

  // Estimate Options → Takeoff: add left/right waterfall on first eligible island.
  useEffect(() => {
    function onStudioMessage(ev: MessageEvent) {
      const data = ev.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== "STUDIO_REQUEST_ADD_ISLAND_WATERFALL") return;
      if (urlWorkspace.mode === "readonly") return;
      const side = data.side === "right" ? "right" : "left";
      const next = structuredClone(draftRef.current || createEmptyManualTakeoffDraft());
      let added = false;
      for (const r of next.rooms || []) {
        for (const a of r.areas || []) {
          for (const piece of a.runs || []) {
            if (!/island/i.test(String(piece.label || ""))) continue;
            const list = Array.isArray(piece.waterfallPanels) ? piece.waterfallPanels : [];
            if (list.some((p: any) => p.side === side)) continue;
            list.push({
              id: `wf-${piece.id}-${side}`,
              side,
              panelWidthIn: Number(piece.depthIn) || 36,
              panelHeightIn: 36,
              quantity: 1,
              included: true
            });
            piece.waterfallPanels = list;
            piece.waterfallSegmentLengthsIn = {
              ...(piece.waterfallSegmentLengthsIn || {}),
              [side]: 36
            };
            added = true;
            break;
          }
          if (added) break;
        }
        if (added) break;
      }
      if (added) updateDraft(next);
    }
    window.addEventListener("message", onStudioMessage);
    return () => window.removeEventListener("message", onStudioMessage);
  }, [updateDraft, urlWorkspace.mode]);

  /**
   * Save draft is the sole normal correction writer.
   * Double-click is coalesced by saveInFlightRef.
   * Clean worksheets skip POST (client no-op → Saved).
   * Readonly mode never mutates.
   */
  const persistDraft = useCallback(async () => {
    if (urlWorkspace.mode === "readonly") return;
    if (localReview) {
      setSaveStatus("saving");
      await new Promise((r) => setTimeout(r, 120));
      canonicalDraftRef.current = structuredClone(draftRef.current);
      canonicalExcludedRef.current = new Set(excludedRef.current);
      const revisionNumber =
        new URLSearchParams(window.location.search).get("revisionNumber") || "1";
      saveLocalReviewDraft(takeoffJobId, revisionNumber, draftRef.current);
      setSaveStatus("saved");
      setSaveError(null);
      const summary = summarizeTakeoffDraftForReady(draftRef.current);
      postTakeoffParentMessage(
        TAKEOFF_REVIEW_DRAFT_SAVED,
        {
          revisionNumber: Number(revisionNumber) || 1,
          mode: "editable",
          roomCount: summary.roomCount,
          pieceCount: summary.pieceCount,
          savedState: "saved",
          waterfalls: summary.waterfalls
        },
        { localReview: true, takeoffJobId }
      );
      postTakeoffParentMessage(
        TAKEOFF_WATERFALL_CHANGED,
        { waterfalls: summary.waterfalls },
        { localReview: true, takeoffJobId }
      );
      return;
    }
    if (!authToken || !takeoffJobId || !draftRef.current) return;
    if (saveInFlightRef.current) return;
    if (saveStatus === "conflict") return;
    const dirty = isTakeoffWorksheetDirty({
      localDraft: draftRef.current,
      canonicalDraft: canonicalDraftRef.current,
      localExcludedRunIds: excludedRef.current,
      canonicalExcludedRunIds: canonicalExcludedRef.current
    });
    if (!dirty) {
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 1200);
      return;
    }
    saveInFlightRef.current = true;
    setSaveStatus("saving");
    setSaveError(null);
    const snapshot = structuredClone(draftRef.current);
    const revision = nextExplicitMutationRevision(latestClientMutationRevisionRef.current);
    try {
      const response = await saveTakeoffDraftExplicit({
        saveCorrection: (body) => saveTakeoffCorrection(authToken, takeoffJobId, body),
        takeoffResult: snapshot,
        baseResultId: latestResultIdRef.current,
        clientMutationRevision: revision,
        reviewState: buildReviewState(),
        correctionNotes: "Consolidated worksheet Save draft",
        canonicalDraft: canonicalDraftRef.current,
        localExcludedRunIds: excludedRef.current,
        canonicalExcludedRunIds: canonicalExcludedRef.current,
        skipIfUnchanged: false
      });
      const adopted = reconcileSuccessfulTakeoffSave({
        response,
        healDraft: healTakeoffDraft,
        fallbackDraft: snapshot,
        excludedRunIds: excludedRef.current
      });
      // Atomic success reconciliation — draft, result id, revision, dirty baseline together.
      if (!adopted.resultId) {
        setSaveStatus("error");
        setSaveError("The Takeoff draft could not be saved. Your edits remain on this screen.");
        return;
      }
      latestResultIdRef.current = adopted.resultId;
      if (adopted.clientMutationRevision != null) {
        latestClientMutationRevisionRef.current = adopted.clientMutationRevision;
      }
      if (adopted.savedAt) latestLocalSaveAtRef.current = adopted.savedAt;
      lastServerResultVersionRef.current =
        resultVersionOf(response) ?? lastServerResultVersionRef.current;
      draftRef.current = adopted.draft;
      setDraft(adopted.draft);
      canonicalDraftRef.current = adopted.canonicalDraft;
      canonicalExcludedRef.current = adopted.canonicalExcludedRunIds;
      setUnsavedEdgeRunIds(new Set());
      setNewerResultNotice(false);
      setAiPhase("ready");
      setJobReviewStatus("needs_review");
      if (approveStatus === "approved") {
        setApproveStatus("idle");
        setDisplayStatus("Previous Takeoff approved · Current draft needs estimator review");
      } else {
        setDisplayStatus("Needs estimator review");
      }
      setSaveStatus("saved");
      window.setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 1200);
      // Physical Takeoff facts changed. Studio projects draft Scope and
      // recalculates once from this signal — commercial edits never do.
      const savedSummary = summarizeTakeoffDraftForReady(adopted.draft);
      postTakeoffParentMessage(
        TAKEOFF_REVIEW_DRAFT_SAVED,
        {
          revisionNumber:
            Number(new URLSearchParams(window.location.search).get("revisionNumber")) || 1,
          mode: "editable",
          roomCount: savedSummary.roomCount,
          pieceCount: savedSummary.pieceCount,
          savedState: "saved",
          waterfalls: savedSummary.waterfalls
        },
        { takeoffJobId }
      );
    } catch (e) {
      if (e instanceof LabApiError && e.status === 409) {
        // Keep local draft + current baseResultId. Review latest draft reloads
        // the server head; do not silently rebase and replay.
        setSaveStatus("conflict");
        setSaveError("The Takeoff draft changed while you were editing.");
        setDisplayStatus("Needs estimator review");
        setJobReviewStatus("needs_review");
      } else {
        setSaveStatus("error");
        setSaveError(e instanceof LabApiError ? e.message : "Save failed");
      }
    } finally {
      saveInFlightRef.current = false;
    }
  }, [authToken, takeoffJobId, buildReviewState, approveStatus, saveStatus, urlWorkspace.mode]);

  /** Confirm exposed edges — local draft only; zero correction requests. */
  const confirmExposedEdges = useCallback(
    (row: PieceRow, finishedEdgePayload: Record<string, unknown>) => {
      if (urlWorkspace.mode === "readonly") return;
      const next = applyLocalExposedEdgeConfirm(
        draftRef.current || createEmptyManualTakeoffDraft(),
        { roomId: row.roomId, areaId: row.areaId, runId: row.runId },
        finishedEdgePayload
      );
      updateDraft(next);
      setUnsavedEdgeRunIds((prev) => {
        const n = new Set(prev);
        n.add(row.runId);
        return n;
      });
      if (jobReviewStatus === "approved" || approveStatus === "approved") {
        setDisplayStatus("Previous Takeoff approved · Current draft needs estimator review");
      } else {
        setDisplayStatus("Needs estimator review");
      }
    },
    [updateDraft, jobReviewStatus, approveStatus, urlWorkspace.mode]
  );

  const closeEdgeDialog = useCallback(() => {
    const triggerId = edgeTriggerFocusRef.current;
    setEdgeDialogRunId(null);
    edgeTriggerFocusRef.current = null;
    window.requestAnimationFrame(() => {
      if (triggerId) document.getElementById(triggerId)?.focus();
    });
  }, []);

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
    // Local merge only — Save draft is the sole correction writer.
    updateDraft(healed);
    pendingServerTakeoffRef.current = null;
    pendingAiResultIdRef.current = null;
    setPendingAiResultId(null);
    setPendingAiMerge(false);
    setPendingAiPreview(preview);
    setAiAppendNotice(
      "AI findings were added locally. Save draft to persist. Estimator-owned geometry and removals were preserved."
    );
  }, [
    authToken,
    takeoffJobId,
    updateDraft,
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
    if (localReview) return;
    if (!authToken || !takeoffJobId) return;
    void loadWorkspace(authToken, takeoffJobId).catch((e) => {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setLoadError(e instanceof LabApiError ? e.message : "Unable to load Takeoff");
    });
  }, [authToken, takeoffJobId, loadWorkspace, localReview]);

  // Warn on browser navigation when the Takeoff draft has unsaved edits.
  // Readonly mode never warns — publish remounts must not trip beforeunload.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (urlWorkspace.mode === "readonly") return;
      const dirty =
        saveStatusRef.current === "dirty" ||
        saveStatusRef.current === "saving" ||
        isTakeoffWorksheetDirty({
          localDraft: draftRef.current,
          canonicalDraft: canonicalDraftRef.current,
          localExcludedRunIds: excludedRef.current,
          canonicalExcludedRunIds: canonicalExcludedRef.current
        });
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [urlWorkspace.mode]);

  useEffect(
    () => () => {
      loadAbortRef.current?.abort();
      pollAbortRef.current?.abort();
    },
    []
  );

  // Keep worksheet table scrolled to the leftmost columns on job load.
  useEffect(() => {
    if (tableWrapRef.current) tableWrapRef.current.scrollLeft = 0;
  }, [takeoffJobId]);

  // Poll job STATUS only while AI processing is genuinely non-terminal. The
  // full editable draft is fetched once when the result version changes — never
  // every 20 seconds, never after a local correction save.
  useEffect(() => {
    if (!authToken || !takeoffJobId) return;
    if (approveStatus === "approved") return;
    if (aiPhase !== "queued" && aiPhase !== "processing") return;
    let stopped = false;
    let timer: number | null = null;
    let inFlight = false;
    let errors = 0;
    pollAbortRef.current?.abort();
    const controller = new AbortController();
    pollAbortRef.current = controller;

    const schedule = (delayMs: number) => {
      if (stopped) return;
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void tick(), delayMs);
    };

    const tick = async () => {
      if (stopped || inFlight) return;
      if (
        !shouldPollTakeoffJob({
          jobStatus: aiPhase,
          reviewStatus: approveStatus,
          visibilityState: document.visibilityState
        })
      ) {
        return;
      }
      inFlight = true;
      try {
        const job = (await labApiGet(
          `/api/takeoff-jobs/${encodeURIComponent(takeoffJobId)}`,
          authToken,
          { signal: controller.signal }
        )) as any;
        if (stopped || controller.signal.aborted) return;
        errors = 0;
        const status = String(job?.status ?? "").toLowerCase();
        const review = String(job?.reviewStatus ?? "").toLowerCase();
        if (isTakeoffJobTerminal(status, review)) {
          if (status === "failed" || status === "cancelled" || status === "canceled") {
            setAiPhase("failed");
            return;
          }
          setAiPhase("ready");
          const nextVersion = resultVersionOf(job);
          if (nextVersion && nextVersion !== lastServerResultVersionRef.current) {
            const dirtyLocal = isTakeoffWorksheetDirty({
              localDraft: draftRef.current,
              canonicalDraft: canonicalDraftRef.current,
              localExcludedRunIds: excludedRef.current,
              canonicalExcludedRunIds: canonicalExcludedRef.current
            });
            if (dirtyLocal || saveStatusRef.current === "dirty") {
              setNewerResultNotice(true);
            } else {
              await loadWorkspace(authToken, takeoffJobId, { forceServer: false });
            }
          }
          return;
        }
        schedule(10_000);
      } catch (error) {
        if (stopped || controller.signal.aborted) return;
        errors += 1;
        schedule(takeoffPollBackoffMs(errors - 1));
      } finally {
        inFlight = false;
      }
    };

    void tick();
    function onVisibility() {
      if (document.visibilityState === "visible") void tick();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      controller.abort();
      if (timer != null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authToken, takeoffJobId, aiPhase, approveStatus, loadWorkspace]);


  const handleRemoveRoom = useCallback(
    async (roomId: string, roomName: string, pieceCount: number) => {
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
        excludedRef.current = next;
        return next;
      });
      updateDraft(pack.takeoff);
    },
    [updateDraft]
  );

  const handleRemovePiece = useCallback(
    async (roomId: string, runId: string) => {
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
        excludedRef.current = next;
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
    if (urlWorkspace.mode === "readonly") return;
    if (!authToken || !takeoffJobId || !draft) return;
    if (approveStatus === "approving" || approveStatus === "approved") return;
    if (localReview) {
      setApproveStatus("approving");
      await new Promise((r) => setTimeout(r, 150));
      setApproveStatus("approved");
      setJobReviewStatus("approved");
      setApproveMsg("Local review: measurements approved (fixture).");
      const summary = summarizeTakeoffDraftForReady(draftRef.current);
      const countertopSf = Number(
        (draftRef.current?.rooms || []).reduce((sum: number, room: any) => {
          for (const area of room.areas || []) {
            for (const run of area.runs || []) {
              if (run?.included === false) continue;
              const len = Number(run.lengthIn) || 0;
              const depth = Number(run.depthIn) || 0;
              const qty = Number(run.quantity) || 1;
              if (len > 0 && depth > 0) sum += (len * depth * qty) / 144;
            }
          }
          return sum;
        }, 0)
      );
      notifyParentApproved(takeoffJobId, {
        ok: true,
        localReview: true,
        estimateId: "local-review-estimate",
        summary: {
          countertopSf: Math.round(countertopSf * 100) / 100,
          backsplashSf: 8.75,
          exposedEdgeLf: 26.25,
          pieceCount: summary.pieceCount,
          waterfalls: summary.waterfalls
        }
      });
      return;
    }
    if (blocking.length > 0) return;

    const dirty =
      isTakeoffWorksheetDirty({
        localDraft: draftRef.current,
        canonicalDraft: canonicalDraftRef.current,
        localExcludedRunIds: excludedRef.current,
        canonicalExcludedRunIds: canonicalExcludedRef.current
      }) ||
      saveStatus === "dirty" ||
      saveStatus === "conflict" ||
      unsavedEdgeRunIds.size > 0;
    if (dirty || saveStatus === "saving") {
      setApproveStatus("error");
      setApproveMsg("Save the Takeoff draft before approval.");
      return;
    }

    const unconfirmedEdge = rows.filter(
      (r) =>
        pieceRequiresExposedEdgeConfirmation({
          included: r.included,
          pieceType: (r as PieceRow & { pieceType?: string }).pieceType,
          isBacksplash: (r as PieceRow & { isBacksplash?: boolean }).isBacksplash
        }) && !r.finishedEdgeApproved
    );
    if (unconfirmedEdge.length > 0) {
      setApproveStatus("error");
      setApproveMsg(
        `Confirm exposed edges for ${unconfirmedEdge.length} countertop piece${
          unconfirmedEdge.length === 1 ? "" : "s"
        } before approving Takeoff.`
      );
      return;
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
    rows,
    approveStatus,
    blocking.length,
    advisory.length,
    saveStatus,
    unsavedEdgeRunIds,
    buildReviewState,
    urlWorkspace.mode
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

  const isReadonly =
    urlWorkspace.mode === "readonly" ||
    (urlWorkspace.mode === "auto" &&
      (jobReviewStatus === "approved" || approveStatus === "approved"));

  const readonlyTitle = (() => {
    const rev = urlWorkspace.revisionNumber
      ? `Revision R${urlWorkspace.revisionNumber}`
      : null;
    if (urlWorkspace.approvalStatus === "published") {
      return rev ? `Published measurements — ${rev}` : "Published measurements";
    }
    if (isReadonly) {
      return rev ? `Approved Takeoff — ${rev}` : "Approved Takeoff";
    }
    if (urlWorkspace.isRevisionDraft && urlWorkspace.revisionNumber) {
      return `Editing Revision R${urlWorkspace.revisionNumber}`;
    }
    return "Takeoff review";
  })();

  return (
    <div
      className="ctr-shell"
      data-testid="consolidated-takeoff-review"
      data-mode={isReadonly ? "readonly" : "editable"}
    >
      <header className="ctr-header">
        <div>
          <h1 data-testid="ctr-workspace-title">{readonlyTitle}</h1>
          {isReadonly &&
          urlWorkspace.publishedRevisionNumber &&
          urlWorkspace.revisionNumber &&
          String(urlWorkspace.revisionNumber) !== String(urlWorkspace.publishedRevisionNumber) ? (
            <p className="ctr-muted" data-testid="ctr-dual-revision-notice">
              Viewing approved measurements R{urlWorkspace.revisionNumber}. Current customer
              publication: R{urlWorkspace.publishedRevisionNumber}.
            </p>
          ) : null}
          <p className="ctr-muted">
            {isReadonly ? (
              <>
                Mode: <strong data-testid="ctr-status">Read-only</strong>
              </>
            ) : (
              <>
                Status: <strong data-testid="ctr-status">{displayStatus}</strong>
              </>
            )}
            {!isReadonly && saveStatus !== "idle" ? (
              <>
                {" · "}
                <span data-testid="ctr-save-status">
                  {formatTakeoffSaveStatus(saveStatus) || saveStatus}
                </span>
              </>
            ) : null}
            {saveError ? <span className="ctr-error"> — {saveError}</span> : null}
            {saveStatus === "conflict" || newerResultNotice ? (
              <button
                type="button"
                className="ctr-btn-secondary"
                data-testid="ctr-review-latest-draft-header"
                style={{ marginLeft: 8 }}
                onClick={() => {
                  setSaveError(null);
                  setNewerResultNotice(false);
                  if (authToken && takeoffJobId) {
                    void loadWorkspace(authToken, takeoffJobId, {
                      forceServer: true,
                      discardLocal: true
                    }).then(() => {
                      canonicalDraftRef.current = structuredClone(draftRef.current);
                      canonicalExcludedRef.current = new Set(excludedRef.current);
                      setUnsavedEdgeRunIds(new Set());
                      setSaveStatus("idle");
                    });
                  }
                }}
              >
                Review latest draft
              </button>
            ) : null}
            {newerResultNotice ? (
              <span className="ctr-muted" data-testid="ctr-newer-result-notice">
                {" "}
                A newer Takeoff result is available.
              </span>
            ) : null}
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

            <div className="ctr-table-wrap" ref={tableWrapRef} data-testid="ctr-table-wrap">
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
                    <th className="ctr-col-edge">Exposed edges</th>
                    <th className="ctr-col-incl">Included</th>
                    <th className="ctr-col-cutouts">Cutouts</th>
                    <th className="ctr-col-notes">Notes</th>
                    <th className="ctr-col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {roomSections.length === 0 ? (
                    <tr data-testid="ctr-empty-worksheet">
                      <td colSpan={12} className="ctr-muted">
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
                        <td colSpan={12}>
                          <div className="ctr-room-header">
                            <input
                              id={`ctr-room-name-${section.id}`}
                              name={`room-name-${section.id}`}
                              className="ctr-room-rename"
                              aria-label="Room name"
                              data-testid="ctr-room-name"
                              value={section.name}
                              readOnly={isReadonly}
                              disabled={isReadonly}
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
                              hidden={isReadonly}
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
                          <td colSpan={12} className="ctr-muted">
                            No pieces in this room yet.
                          </td>
                        </tr>
                      ) : null}
                      {section.pieces.map((row) => {
                        const rowControlKey = `${row.roomId}-${row.areaId}-${row.runId}`;
                        const bsId = `ctr-bs-${rowControlKey}`;
                        const inclId = `ctr-incl-${rowControlKey}`;
                        const cutId = `ctr-cutouts-${rowControlKey}`;
                        const rowLocked = isReadonly || approveStatus === "approved";
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
                          id={`ctr-room-${row.runId}`}
                          name={`room-${row.runId}`}
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
                          id={`ctr-piece-${row.runId}`}
                          name={`piece-${row.runId}`}
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
                          id={`ctr-length-${row.runId}`}
                          name={`length-${row.runId}`}
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
                                patchRunGeometry(
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
                          id={`ctr-depth-${row.runId}`}
                          name={`depth-${row.runId}`}
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
                                patchRunGeometry(
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
                          id={`ctr-qty-${row.runId}`}
                          name={`quantity-${row.runId}`}
                          className="ctr-dim-input"
                          type="number"
                          min={1}
                          value={row.quantity}
                          aria-label="Quantity"
                          data-testid="ctr-quantity"
                          onChange={(e) =>
                            updateDraft(
                              patchRunGeometry(
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
                            name={`backsplash-${row.runId}`}
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
                                applyLocalBacksplashToggle(
                                  draft,
                                  {
                                    roomId: row.roomId,
                                    areaId: row.areaId,
                                    runId: row.runId
                                  },
                                  e.target.checked,
                                  row.lengthIn
                                )
                              )
                            }
                          />
                          <span className="ctr-bs-toggle-label">
                            {row.backsplashEligible ? "Include" : "No backsplash"}
                          </span>
                        </label>
                      </td>
                      <td className="ctr-col-edge">
                        <ExposedSidesTrigger
                          row={{
                            ...row,
                            localUnsavedEdge: unsavedEdgeRunIds.has(row.runId)
                          }}
                          triggerId={`ctr-edge-trigger-${row.runId}`}
                          dialogId="ctr-exposed-edges-dialog"
                          open={edgeDialogRunId === row.runId}
                          disabled={rowLocked}
                          onOpen={() => {
                            edgeTriggerFocusRef.current = `ctr-edge-trigger-${row.runId}`;
                            setEdgeDialogRunId(row.runId);
                          }}
                        />
                      </td>
                      <td className="ctr-col-incl">
                        <label htmlFor={inclId} className="ctr-bs-toggle">
                          <input
                            id={inclId}
                            name={`include-${row.runId}`}
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
                                excludedRef.current = next;
                                return next;
                              });
                              markWorksheetDirty();
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
                          id={`ctr-notes-${row.runId}`}
                          name={`notes-${row.runId}`}
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
                        {!isReadonly ? (
                        <button
                          type="button"
                          className="ctr-btn-secondary ctr-remove"
                          data-testid="ctr-remove-piece"
                          aria-label={`Remove piece ${row.pieceName}`}
                          onClick={() => handleRemovePiece(row.roomId, row.runId)}
                        >
                          Remove piece
                        </button>
                        ) : null}
                      </td>
                    </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <section
              className="ctr-waterfall-physical"
              data-testid="ctr-waterfall-physical-scope"
              aria-label="Waterfall physical scope"
            >
              <h2 className="ctr-section-title">Waterfall panels (Takeoff physical scope)</h2>
              {(() => {
                const summary = summarizeTakeoffDraftForReady(draft);
                if (!summary.waterfalls.length) {
                  return (
                    <p className="ctr-muted" data-testid="ctr-waterfall-empty">
                      No waterfall panel geometry yet. On an island piece, add a left/right
                      waterfall panel here when this estimate includes or may offer a waterfall.
                    </p>
                  );
                }
                return (
                  <ul className="ctr-waterfall-list">
                    {summary.waterfalls.map((wf) => (
                      <li
                        key={wf.id}
                        className="ctr-waterfall-card"
                        data-testid="ctr-waterfall-panel"
                        data-waterfall-id={wf.id}
                      >
                        <strong data-testid="ctr-waterfall-label">
                          {wf.pieceLabel} — {String(wf.side).charAt(0).toUpperCase() + String(wf.side).slice(1)}{" "}
                          waterfall
                        </strong>
                        <dl className="ctr-waterfall-facts">
                          <div>
                            <dt>Room</dt>
                            <dd>{wf.roomName}</dd>
                          </div>
                          <div>
                            <dt>Related piece</dt>
                            <dd>{wf.pieceLabel}</dd>
                          </div>
                          <div>
                            <dt>Side</dt>
                            <dd>{wf.side}</dd>
                          </div>
                          <div>
                            <dt>Panel width (in)</dt>
                            <dd>
                              <input
                                type="number"
                                data-testid="ctr-waterfall-width"
                                disabled={isReadonly}
                                value={wf.panelWidthIn}
                                onChange={(e) => {
                                  const nextW = Number(e.target.value) || 0;
                                  const next = structuredClone(draftRef.current);
                                  for (const room of next.rooms || []) {
                                    for (const area of room.areas || []) {
                                      for (const run of area.runs || []) {
                                        if (String(run.id) !== String(wf.pieceId)) continue;
                                        run.waterfallPanels = (run.waterfallPanels || []).map(
                                          (p: any) =>
                                            String(p.id) === String(wf.id) ||
                                            String(p.side) === String(wf.side)
                                              ? { ...p, panelWidthIn: nextW }
                                              : p
                                        );
                                        run.waterfallSegmentLengthsIn = {
                                          ...(run.waterfallSegmentLengthsIn || {}),
                                          [wf.side]:
                                            run.waterfallPanels.find(
                                              (p: any) => String(p.side) === String(wf.side)
                                            )?.panelHeightIn ||
                                            run.waterfallSegmentLengthsIn?.[wf.side] ||
                                            36
                                        };
                                      }
                                    }
                                  }
                                  updateDraft(next);
                                }}
                              />
                            </dd>
                          </div>
                          <div>
                            <dt>Panel height (in)</dt>
                            <dd>
                              <input
                                type="number"
                                data-testid="ctr-waterfall-height"
                                disabled={isReadonly}
                                value={wf.panelHeightIn}
                                onChange={(e) => {
                                  const nextH = Number(e.target.value) || 0;
                                  const next = structuredClone(draftRef.current);
                                  for (const room of next.rooms || []) {
                                    for (const area of room.areas || []) {
                                      for (const run of area.runs || []) {
                                        if (String(run.id) !== String(wf.pieceId)) continue;
                                        run.waterfallPanels = (run.waterfallPanels || []).map(
                                          (p: any) =>
                                            String(p.id) === String(wf.id) ||
                                            String(p.side) === String(wf.side)
                                              ? { ...p, panelHeightIn: nextH }
                                              : p
                                        );
                                        run.waterfallSegmentLengthsIn = {
                                          ...(run.waterfallSegmentLengthsIn || {}),
                                          [wf.side]: nextH
                                        };
                                      }
                                    }
                                  }
                                  updateDraft(next);
                                }}
                              />
                            </dd>
                          </div>
                          <div>
                            <dt>Quantity</dt>
                            <dd data-testid="ctr-waterfall-qty">{wf.quantity}</dd>
                          </div>
                          <div>
                            <dt>Included</dt>
                            <dd>{wf.includedInScope ? "Yes" : "No"}</dd>
                          </div>
                        </dl>
                      </li>
                    ))}
                  </ul>
                );
              })()}
              {!isReadonly ? (
                <div className="ctr-waterfall-island-actions" data-testid="ctr-island-waterfall-actions">
                  {(draft?.rooms || []).flatMap((room: any) =>
                    (room.areas || []).flatMap((area: any) =>
                      (area.runs || [])
                        .filter((run: any) => /island/i.test(String(run.label || "")))
                        .map((run: any) => {
                          const panels = Array.isArray(run.waterfallPanels) ? run.waterfallPanels : [];
                          const hasLeft = panels.some((p: any) => p.side === "left");
                          const hasRight = panels.some((p: any) => p.side === "right");
                          return (
                            <div key={run.id} className="ctr-island-waterfall-row" data-testid="ctr-island-waterfall-row">
                              <strong>{run.label}</strong>
                              {!hasLeft ? (
                                <button
                                  type="button"
                                  className="ctr-btn-secondary"
                                  data-testid="ctr-add-left-waterfall"
                                  onClick={() => {
                                    const next = structuredClone(
                                      draftRef.current || createEmptyManualTakeoffDraft()
                                    );
                                    for (const r of next.rooms || []) {
                                      for (const a of r.areas || []) {
                                        for (const piece of a.runs || []) {
                                          if (String(piece.id) !== String(run.id)) continue;
                                          const list = Array.isArray(piece.waterfallPanels)
                                            ? piece.waterfallPanels
                                            : [];
                                          list.push({
                                            id: `wf-${piece.id}-left`,
                                            side: "left",
                                            panelWidthIn: Number(piece.depthIn) || 36,
                                            panelHeightIn: 36,
                                            quantity: 1,
                                            included: true
                                          });
                                          piece.waterfallPanels = list;
                                          piece.waterfallSegmentLengthsIn = {
                                            ...(piece.waterfallSegmentLengthsIn || {}),
                                            left: 36
                                          };
                                        }
                                      }
                                    }
                                    updateDraft(next);
                                  }}
                                >
                                  Add left waterfall
                                </button>
                              ) : null}
                              {!hasRight ? (
                                <button
                                  type="button"
                                  className="ctr-btn-secondary"
                                  data-testid="ctr-add-right-waterfall"
                                  onClick={() => {
                                    const next = structuredClone(
                                      draftRef.current || createEmptyManualTakeoffDraft()
                                    );
                                    for (const r of next.rooms || []) {
                                      for (const a of r.areas || []) {
                                        for (const piece of a.runs || []) {
                                          if (String(piece.id) !== String(run.id)) continue;
                                          const list = Array.isArray(piece.waterfallPanels)
                                            ? piece.waterfallPanels
                                            : [];
                                          list.push({
                                            id: `wf-${piece.id}-right`,
                                            side: "right",
                                            panelWidthIn: Number(piece.depthIn) || 36,
                                            panelHeightIn: 36,
                                            quantity: 1,
                                            included: true
                                          });
                                          piece.waterfallPanels = list;
                                          piece.waterfallSegmentLengthsIn = {
                                            ...(piece.waterfallSegmentLengthsIn || {}),
                                            right: 36
                                          };
                                        }
                                      }
                                    }
                                    updateDraft(next);
                                  }}
                                >
                                  Add right waterfall
                                </button>
                              ) : null}
                            </div>
                          );
                        })
                    )
                  )}
                </div>
              ) : null}
            </section>

            <div className="ctr-actions">
              {!isReadonly ? (
                <>
              <button
                type="button"
                className="ctr-btn-secondary"
                data-testid="ctr-add-room"
                onClick={() => {
                  const next = addRoom(draftRef.current || createEmptyManualTakeoffDraft());
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
                  updateDraft(
                    addPiece(draftRef.current || createEmptyManualTakeoffDraft(), roomId)
                  );
                }}
              >
                Add piece
              </button>
              <button
                type="button"
                className="ctr-btn-secondary"
                data-testid="ctr-save-draft"
                disabled={
                  saveStatus === "saving" ||
                  saveStatus === "conflict" ||
                  (!localReview &&
                    !isTakeoffWorksheetDirty({
                      localDraft: draft,
                      canonicalDraft: canonicalDraftRef.current,
                      localExcludedRunIds: excludedRunIds,
                      canonicalExcludedRunIds: canonicalExcludedRef.current
                    }))
                }
                onClick={() => void persistDraft()}
              >
                {saveStatus === "saving" ? "Saving…" : "Save draft"}
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
                </>
              ) : null}

              {!isReadonly && blocking.length ? (
                <ul className="ctr-issues ctr-issues--block" data-testid="ctr-blocking">
                  {blocking.map((b) => (
                    <li key={`${b.code}-${b.path}`}>{b.message}</li>
                  ))}
                </ul>
              ) : null}
              {!isReadonly && advisory.length ? (
                <ul className="ctr-issues ctr-issues--warn" data-testid="ctr-advisory">
                  {advisory.map((b) => (
                    <li key={`${b.code}-${b.path}`}>{b.message}</li>
                  ))}
                </ul>
              ) : null}

              {!isReadonly && approveMsg ? (
                <p
                  className={
                    approveStatus === "error" ? "ctr-approve-msg ctr-approve-msg--error" : "ctr-approve-msg"
                  }
                  data-testid="ctr-approve-msg"
                >
                  {approveMsg}
                </p>
              ) : null}

              {!isReadonly && approvalDiag ? (
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

              {!isReadonly ? (
              <button
                type="button"
                className="ctr-btn-primary"
                data-testid="ctr-approve-build"
                disabled={
                  approveStatus === "approving" ||
                  approveStatus === "approved" ||
                  displayStatus === "Takeoff failed" ||
                  !hasUsableTakeoffGeometry(draft) ||
                  Boolean(blocking.length) ||
                  saveStatus === "dirty" ||
                  saveStatus === "saving" ||
                  saveStatus === "conflict" ||
                  unsavedEdgeRunIds.size > 0
                }
                onClick={() => void handleApproveClick()}
              >
                {approveButtonLabel({
                  approveStatus,
                  advisoryCount: advisory.length,
                  blockingCount: blocking.length,
                  isRevisionDraft: urlWorkspace.isRevisionDraft,
                  quoteFlowSetScope
                })}
              </button>
              ) : null}
            </div>
            {summary ? (
              <p className="ctr-muted" data-testid="ctr-server-summary">
                Server: {String(summary.includedPieces ?? "")} pieces ·{" "}
                {Number(summary.countertopSf ?? 0).toFixed?.(2) ?? summary.countertopSf} SF
              </p>
            ) : null}
          </main>
        </div>

      <ExposedSidesDialog
        open={Boolean(edgeDialogRunId)}
        row={
          edgeDialogRunId
            ? (() => {
                const r = rows.find((x) => x.runId === edgeDialogRunId);
                return r ? { ...r, roomName: r.roomName } : null;
              })()
            : null
        }
        triggerId={edgeTriggerFocusRef.current}
        onConfirm={(payload) => {
          const r = rows.find((x) => x.runId === edgeDialogRunId);
          if (r) confirmExposedEdges(r, payload);
          closeEdgeDialog();
        }}
        onCancel={() => closeEdgeDialog()}
      />

    </div>
  );
}
