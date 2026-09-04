import React, { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import OfficialScopeEditor, { roomsFromOfficialScope } from "../estimates/OfficialScopeEditor";
import type { QuoteFlowScopeRoom } from "../lib/quoteFlowEstimatesApi";
import {
  filterQueueItems,
  formatQueueTime,
  groupQueueItems,
  isMeaningfulQuoteName,
  QUOTE_NAME_REQUIRED_LABEL,
  resolveCanonicalQuoteName,
  resolveDefaultEstimateName,
  resolveQueueCustomer,
  resolveQueueGroupKey,
  resolveQueueSubtitle,
  resolveQueueTitle
} from "../lib/queueGrouping.mjs";
import {
  archiveQuoteFlowQueueItem,
  fetchQuoteFlowQueue,
  fetchQuoteFlowQueueDetail,
  restoreQuoteFlowQueueItem,
  saveQuoteFlowQuoteName,
  setQuoteFlowManualScope,
  setQuoteFlowScope,
  type QuoteFlowQueueItem
} from "../lib/quoteFlowQueueApi";
import {
  aiTakeoffHeadUrl,
  isAllowedTakeoffMessageOrigin,
  isValidTakeoffApprovedMessage,
  requestSaveDraftFromIframe,
  requestSetScopePayloadFromIframe,
  TAKEOFF_REVIEW_DIRTY,
  TAKEOFF_REVIEW_DRAFT_SAVED,
  QUOTE_FLOW_REQUEST_SAVE_DRAFT,
  REVIEW_DISCARD_CONFIRM,
  SET_SCOPE_PAYLOAD_REQUIRED_ERROR,
  SET_SCOPE_SAVE_REQUIRED_ERROR
} from "../lib/takeoffPostMessageOrigins.mjs";

type Props = {
  authToken: string;
  onOpenEstimates?: (estimateId?: string | null) => void;
  onOpenInbox?: (messageKey?: string | null) => void;
};

type DetailMode = "idle" | "review" | "manual" | "success";
type FilterKey = "all_active" | "ready" | "manual" | "processing" | "failed";
type ArchiveView = "active" | "archived" | "all";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all_active", label: "All active" },
  { key: "ready", label: "Ready for AI review" },
  { key: "manual", label: "Manual scope needed" },
  { key: "processing", label: "Processing" },
  { key: "failed", label: "Failed" }
];

const ARCHIVE_VIEWS: { key: ArchiveView; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
  { key: "all", label: "All" }
];

function resolveClientQueueItemKey(row: QuoteFlowQueueItem): string {
  const existing = String(row.queueItemKey || "").trim();
  if (existing) return existing;
  const takeoff = String(row.takeoffJobId || "").trim();
  if (takeoff) return `takeoff:${takeoff}`;
  const intake = String(row.intakeCaseId || "").trim();
  if (intake) return `intake:${intake}`;
  const message = String(row.messageKey || "").trim();
  if (message) return `message:${message}`;
  return "";
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body && typeof e.body === "object" ? (e.body as Record<string, unknown>) : null;
    if (body?.error) return String(body.error);
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "Request failed";
}

function statusPillClass(statusKey: string | undefined): string {
  const k = String(statusKey || "");
  if (k === "takeoff_failed") return "qf-pill qf-pill--error";
  if (k === "takeoff_queued" || k === "takeoff_processing") return "qf-pill qf-pill--active";
  if (k === "ready_for_review") return "qf-pill qf-pill--ready";
  if (k === "manual_scope_needed") return "qf-pill qf-pill--go";
  if (k === "scope_set") return "qf-pill qf-pill--done";
  return "qf-pill";
}

function ProcessedPlanPacketCard({ item }: { item: QuoteFlowQueueItem | null }) {
  if (!item) return null;
  const packetMerged = item.packetMerged === true || (item.packetFileCount || 0) > 1;
  const files = Array.isArray(item.packetFiles) ? item.packetFiles : [];
  const planName = item.selectedPlanFilename || item.takeoffPlanFilename || item.planFilename;
  if (!packetMerged && !planName && !item.requestSubject && !item.senderLabel) return null;

  return (
    <div className="qf-queue__packet-card" data-testid="qf-queue-packet-card">
      <h3>Processed plan packet</h3>
      <dl className="qf-queue__packet-dl">
        <dt>Type</dt>
        <dd data-testid="qf-queue-packet-type">
          {packetMerged ? "Multi-file packet" : "Single file"}
        </dd>
        {item.requestSubject || item.subject ? (
          <>
            <dt>Source request</dt>
            <dd data-testid="qf-queue-packet-source">{item.requestSubject || item.subject}</dd>
          </>
        ) : null}
        {item.senderLabel || item.customerDisplay ? (
          <>
            <dt>Sender</dt>
            <dd>{item.senderLabel || item.customerDisplay}</dd>
          </>
        ) : null}
        {packetMerged ? (
          <>
            <dt>Files included</dt>
            <dd>
              <ul className="qf-queue__packet-files" data-testid="qf-queue-packet-files">
                {(files.length ? files : [{ filename: planName }]).map((f, idx) => (
                  <li key={`${f?.filename || "f"}-${idx}`}>{f?.filename || "Attachment"}</li>
                ))}
              </ul>
            </dd>
            {item.packetFilename ? (
              <>
                <dt>Packet file</dt>
                <dd>{item.packetFilename}</dd>
              </>
            ) : null}
          </>
        ) : planName ? (
          <>
            <dt>Plan processed</dt>
            <dd data-testid="qf-queue-packet-plan">{planName}</dd>
          </>
        ) : null}
        {item.takeoffStartedAt || item.startedAt ? (
          <>
            <dt>Started</dt>
            <dd>{formatQueueTime(item.takeoffStartedAt || item.startedAt)}</dd>
          </>
        ) : null}
        {item.takeoffReturnedAt || item.returnedAt ? (
          <>
            <dt>Returned</dt>
            <dd>{formatQueueTime(item.takeoffReturnedAt || item.returnedAt)}</dd>
          </>
        ) : null}
        {item.takeoffJobIdShort || item.takeoffJobId ? (
          <>
            <dt>Takeoff job</dt>
            <dd>{item.takeoffJobIdShort || String(item.takeoffJobId).slice(0, 8) + "…"}</dd>
          </>
        ) : null}
      </dl>
      {item.nextActionHelper ? (
        <p className="qf-muted" data-testid="qf-queue-packet-helper">
          {item.nextActionHelper}
        </p>
      ) : null}
    </div>
  );
}

export default function EstimateQueuePage(props: Props) {
  const { authToken, onOpenEstimates, onOpenInbox } = props;
  const [items, setItems] = useState<QuoteFlowQueueItem[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [detail, setDetail] = useState<QuoteFlowQueueItem | null>(null);
  const [detailMode, setDetailMode] = useState<DetailMode>("idle");
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [setScopeBusy, setSetScopeBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const [successName, setSuccessName] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all_active");
  const [archiveView, setArchiveView] = useState<ArchiveView>("active");
  const [search, setSearch] = useState("");
  const [estimateName, setEstimateName] = useState("");
  const [manualRooms, setManualRooms] = useState<QuoteFlowScopeRoom[]>(() =>
    roomsFromOfficialScope([])
  );
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveConfirmKey, setArchiveConfirmKey] = useState<string | null>(null);
  const [reviewDirty, setReviewDirty] = useState(false);
  const [reviewSaveBusy, setReviewSaveBusy] = useState(false);
  const archiveViewRef = useRef<ArchiveView>("active");
  const inFlightRef = useRef(false);
  const listInFlightRef = useRef(false);
  const successJobIdRef = useRef<string | null>(null);
  const selectedJobIdRef = useRef<string | null>(null);
  const detailModeRef = useRef<DetailMode>("idle");
  const estimateNameByJobRef = useRef<Record<string, string>>({});
  const estimateNameUserEditedRef = useRef<Record<string, boolean>>({});
  const takeoffIframeRef = useRef<HTMLIFrameElement | null>(null);
  const reviewDirtyRef = useRef(false);
  const reviewCloseBtnRef = useRef<HTMLButtonElement | null>(null);

  selectedJobIdRef.current = selectedJobId;
  detailModeRef.current = detailMode;
  archiveViewRef.current = archiveView;
  reviewDirtyRef.current = reviewDirty;

  const allGrouped = useMemo(() => groupQueueItems(items), [items]);
  const visibleRows = useMemo(
    () => filterQueueItems(items, filter, search) as QuoteFlowQueueItem[],
    [items, filter, search]
  );
  const visibleGrouped = useMemo(() => groupQueueItems(visibleRows), [visibleRows]);
  const showSyncing = isRefreshing || setScopeBusy;

  const selectedListRow = useMemo(
    () => items.find((r) => r.takeoffJobId === selectedJobId) || null,
    [items, selectedJobId]
  );
  const workspaceItem = detail || selectedListRow;

  const takeoffSrc = useMemo(() => {
    if (!selectedJobId || detailMode !== "review") return null;
    const params = new URLSearchParams({
      takeoffJobId: String(selectedJobId),
      consolidated: "1",
      mode: "editable",
      persistentWorkspace: "1",
      quoteFlowSetScope: "1"
    });
    return `${aiTakeoffHeadUrl()}/?${params.toString()}`;
  }, [selectedJobId, detailMode]);

  function syncEstimateNameForItem(item: QuoteFlowQueueItem | null, jobId: string | null) {
    if (!jobId) {
      setEstimateName("");
      return;
    }
    if (estimateNameUserEditedRef.current[jobId]) {
      const remembered = estimateNameByJobRef.current[jobId];
      if (remembered != null) {
        setEstimateName(remembered);
        return;
      }
    }
    if (item?.quoteNameUserSet && isMeaningfulQuoteName(item.quoteName || "")) {
      const durable = String(item.quoteName || "").trim();
      estimateNameUserEditedRef.current[jobId] = true;
      estimateNameByJobRef.current[jobId] = durable;
      setEstimateName(durable);
      return;
    }
    const canonical = resolveCanonicalQuoteName(item || {});
    const next =
      canonical.quoteNameRequired || canonical.displayTitle === QUOTE_NAME_REQUIRED_LABEL
        ? ""
        : canonical.displayTitle;
    setEstimateName(next);
    estimateNameByJobRef.current[jobId] = next;
  }

  function onEstimateNameChange(value: string) {
    setEstimateName(value);
    if (selectedJobId) {
      estimateNameByJobRef.current[selectedJobId] = value;
      estimateNameUserEditedRef.current[selectedJobId] = true;
    }
  }

  async function persistQuoteNameIfNeeded(opts: { quiet?: boolean } = {}) {
    const jobId = selectedJobId;
    if (!jobId || !authToken) return false;
    const name = String(estimateName || "").trim();
    if (!isMeaningfulQuoteName(name)) {
      if (!opts.quiet) {
        setError(
          "Enter a meaningful Quote Name before saving. Plan filenames cannot be used as the quote identity."
        );
      }
      return false;
    }
    try {
      const res = await saveQuoteFlowQuoteName(authToken, jobId, {
        quoteName: name,
        userSet: true
      });
      const saved = String(res.quoteName || name).trim();
      estimateNameByJobRef.current[jobId] = saved;
      estimateNameUserEditedRef.current[jobId] = true;
      setEstimateName(saved);
      setItems((prev) =>
        prev.map((row) =>
          row.takeoffJobId === jobId
            ? {
                ...row,
                quoteName: saved,
                quoteNameUserSet: true,
                quoteNameRequired: false,
                estimateName: saved,
                defaultEstimateName: saved,
                requestTitle: saved
              }
            : row
        )
      );
      setDetail((prev) =>
        prev && prev.takeoffJobId === jobId
          ? {
              ...prev,
              quoteName: saved,
              quoteNameUserSet: true,
              quoteNameRequired: false,
              estimateName: saved,
              defaultEstimateName: saved,
              requestTitle: saved
            }
          : prev
      );
      return true;
    } catch (e) {
      if (!opts.quiet) setError(errorMessage(e));
      return false;
    }
  }

  async function loadList(mode: "initial" | "refresh" = "refresh") {
    if (listInFlightRef.current) return;
    listInFlightRef.current = true;
    const isInitial = mode === "initial";
    if (isInitial) setInitialLoading(true);
    else setIsRefreshing(true);
    setError(null);
    try {
      // Default active filter — already-scoped items excluded by API.
      const res = await fetchQuoteFlowQueue(authToken, {
        filter: "active",
        archiveView: archiveViewRef.current
      });
      const rows = Array.isArray(res.items) ? res.items : [];
      setItems(rows);

      const jobId = selectedJobIdRef.current;
      const modeNow = detailModeRef.current;
      if (
        jobId &&
        successJobIdRef.current !== jobId &&
        !rows.some((r) => r.takeoffJobId === jobId) &&
        modeNow !== "success"
      ) {
        setSelectedJobId(null);
        setDetail(null);
        setDetailMode("idle");
        setEstimateName("");
      }
    } catch (e) {
      if (items.length === 0) {
        setError(errorMessage(e));
        setItems([]);
      } else {
        setError(errorMessage(e));
      }
    } finally {
      listInFlightRef.current = false;
      setInitialLoading(false);
      setIsRefreshing(false);
    }
  }

  const archiveViewBootRef = useRef(true);

  useEffect(() => {
    archiveViewRef.current = archiveView;
    void loadList("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  useEffect(() => {
    archiveViewRef.current = archiveView;
    if (archiveViewBootRef.current) {
      archiveViewBootRef.current = false;
      return;
    }
    void loadList("refresh");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveView]);

  async function runArchive(queueItemKey: string, skipConfirm = false) {
    const key = String(queueItemKey || "").trim();
    if (!key || archiveBusy) return;
    const row = items.find((r) => resolveClientQueueItemKey(r) === key) || null;
    if (!skipConfirm && row?.recentProcessing === true) {
      setArchiveConfirmKey(key);
      return;
    }
    setArchiveBusy(true);
    setArchiveConfirmKey(null);
    setError(null);
    try {
      const res = await archiveQuoteFlowQueueItem(authToken, key);
      setNotice("Removed from active Estimate Queue.");
      if (archiveViewRef.current === "active") {
        setItems((prev) => prev.filter((r) => resolveClientQueueItemKey(r) !== key));
      } else {
        setItems((prev) =>
          prev.map((r) =>
            resolveClientQueueItemKey(r) === key
              ? {
                  ...r,
                  archived: true,
                  archivedAt: res.archivedAt || new Date().toISOString()
                }
              : r
          )
        );
      }
      const jobId = row?.takeoffJobId;
      if (jobId && selectedJobIdRef.current === jobId && archiveViewRef.current === "active") {
        setSelectedJobId(null);
        setDetail(null);
        setDetailMode("idle");
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setArchiveBusy(false);
    }
  }

  async function runRestore(queueItemKey: string) {
    const key = String(queueItemKey || "").trim();
    if (!key || archiveBusy) return;
    setArchiveBusy(true);
    setError(null);
    try {
      await restoreQuoteFlowQueueItem(authToken, key);
      setNotice("Restored to active Estimate Queue.");
      if (archiveViewRef.current === "archived") {
        setItems((prev) => prev.filter((r) => resolveClientQueueItemKey(r) !== key));
      } else {
        setItems((prev) =>
          prev.map((r) =>
            resolveClientQueueItemKey(r) === key
              ? { ...r, archived: false, archivedAt: null }
              : r
          )
        );
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setArchiveBusy(false);
    }
  }

  function applyScopeSuccess(res: {
    estimateId?: string | null;
    message?: string;
    alreadyScoped?: boolean;
    reused?: boolean;
    projectName?: string | null;
    estimateName?: string | null;
  }) {
    const id = res.estimateId || null;
    const name =
      String(res.projectName || res.estimateName || estimateName || "").trim() ||
      "Untitled quote request";
    setEstimateId(id);
    setSuccessName(name);
    setNotice(res.message || "Scope is set for this estimate.");
    setError(null);
    setDetailMode("success");
    setReviewDirty(false);
    setReviewSaveBusy(false);
    successJobIdRef.current = selectedJobId;
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            alreadyScoped: true,
            estimateId: id || prev.estimateId,
            projectName: name,
            estimateName: name,
            requestTitle: name,
            status: { key: "scope_set", label: "Scope set" },
            action: "view_estimates",
            actionLabel: "Open in Estimates"
          }
        : prev
    );
  }

  async function openReview(takeoffJobId: string, seedItem?: QuoteFlowQueueItem | null) {
    setSelectedJobId(takeoffJobId);
    setDetailMode("review");
    setReviewDirty(false);
    setReviewSaveBusy(false);
    setNotice(null);
    setEstimateId(null);
    successJobIdRef.current = null;
    if (seedItem) {
      setDetail(seedItem);
      syncEstimateNameForItem(seedItem, takeoffJobId);
    }
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetchQuoteFlowQueueDetail(authToken, takeoffJobId);
      setDetail(res.item);
      syncEstimateNameForItem(res.item, takeoffJobId);
      if (res.item.alreadyScoped) {
        applyScopeSuccess({
          estimateId: res.item.estimateId,
          message: "Scope is set for this estimate.",
          alreadyScoped: true,
          reused: true,
          projectName: resolveDefaultEstimateName(res.item)
        });
      }
    } catch (e) {
      if (!seedItem) setDetail(null);
      setError(errorMessage(e));
    } finally {
      setDetailLoading(false);
    }
  }

  function requestReviewSaveDraft() {
    if (!selectedJobId || !takeoffIframeRef.current?.contentWindow) return;
    setReviewSaveBusy(true);
    void persistQuoteNameIfNeeded({ quiet: true });
    try {
      takeoffIframeRef.current.contentWindow.postMessage(
        { type: QUOTE_FLOW_REQUEST_SAVE_DRAFT, takeoffJobId: selectedJobId },
        "*"
      );
    } catch {
      setReviewSaveBusy(false);
    }
    window.setTimeout(() => setReviewSaveBusy(false), 4000);
  }

  function closeReviewWorkspace(opts: { force?: boolean } = {}) {
    if (!opts.force && reviewDirtyRef.current) {
      const ok =
        typeof window !== "undefined" &&
        window.confirm(REVIEW_DISCARD_CONFIRM);
      if (!ok) return false;
    }
    setDetailMode("idle");
    setReviewDirty(false);
    setReviewSaveBusy(false);
    return true;
  }

  async function openManualScope(row: QuoteFlowQueueItem) {
    const jobId = row.takeoffJobId || "";
    if (!jobId) return;
    setSelectedJobId(jobId);
    setDetailMode("manual");
    setNotice(null);
    setEstimateId(null);
    successJobIdRef.current = null;
    setManualRooms(roomsFromOfficialScope([]));
    setDetail(row);
    syncEstimateNameForItem(row, jobId);
    setDetailLoading(true);
    setError(null);
    try {
      const res = await fetchQuoteFlowQueueDetail(authToken, jobId);
      setDetail(res.item);
      syncEstimateNameForItem(res.item, jobId);
      if (res.item.alreadyScoped) {
        applyScopeSuccess({
          estimateId: res.item.estimateId,
          message: "Scope is set for this estimate.",
          alreadyScoped: true,
          reused: true,
          projectName: resolveDefaultEstimateName(res.item)
        });
      }
    } catch (e) {
      const msg = errorMessage(e);
      if (!/not found|404/i.test(msg)) setError(msg);
    } finally {
      setDetailLoading(false);
    }
  }

  function selectRow(row: QuoteFlowQueueItem) {
    const jobId = row.takeoffJobId || "";
    if (!jobId) return;
    if (
      detailModeRef.current === "review" &&
      reviewDirtyRef.current &&
      jobId !== selectedJobIdRef.current
    ) {
      if (typeof window !== "undefined" && !window.confirm(REVIEW_DISCARD_CONFIRM)) {
        return;
      }
      setReviewDirty(false);
    }
    setSelectedJobId(jobId);
    setDetail(row);
    setNotice(null);
    setEstimateId(null);
    successJobIdRef.current = null;
    setError(null);
    syncEstimateNameForItem(row, jobId);
    if (row.canReviewTakeoff || row.action === "review_takeoff") {
      void openReview(jobId, row);
    } else if (row.action === "create_manual_scope" || row.status?.key === "manual_scope_needed") {
      void openManualScope(row);
    } else if (row.status?.key === "takeoff_failed" || row.action === "needs_decision") {
      // Failed: open workspace idle so estimator chooses AI retry path (Inbox) or Manual.
      setDetailMode("idle");
    } else {
      setDetailMode("idle");
    }
  }

  function resolvedNameForSubmit(): string {
    const typed = String(estimateName || "").trim();
    if (isMeaningfulQuoteName(typed)) return typed;
    const canonical = resolveCanonicalQuoteName(workspaceItem || {});
    if (canonical.quoteName && isMeaningfulQuoteName(canonical.quoteName)) {
      return canonical.quoteName;
    }
    return "";
  }

  async function runSetScope() {
    if (!selectedJobId || inFlightRef.current || setScopeBusy) return;
    inFlightRef.current = true;
    setSetScopeBusy(true);
    setError(null);
    setNotice(null);
    const name = resolvedNameForSubmit();
    if (!isMeaningfulQuoteName(name)) {
      setError(
        "Enter a meaningful Quote Name before setting scope. Plan filenames cannot be used as the quote identity."
      );
      inFlightRef.current = false;
      setSetScopeBusy(false);
      return;
    }
    await persistQuoteNameIfNeeded({ quiet: true });
    const saveDraftFirstMsg = "Save draft first, then Set Scope.";
    try {
      // Set Scope must represent exactly what the estimator sees in Review Takeoff.
      // Prefer live worksheet payload; when dirty, persist first and refuse on save failure.
      let payload = await requestSetScopePayloadFromIframe(
        takeoffIframeRef.current,
        selectedJobId,
        { timeoutMs: 8000 }
      );

      if (!payload?.takeoffResult) {
        setError(SET_SCOPE_PAYLOAD_REQUIRED_ERROR);
        return;
      }

      const needsPersist =
        payload.dirty === true || reviewDirtyRef.current === true;

      if (needsPersist) {
        const saved = await requestSaveDraftFromIframe(
          takeoffIframeRef.current,
          selectedJobId,
          { timeoutMs: 20000 }
        );
        if (!saved?.ok) {
          setError(saved?.error || SET_SCOPE_SAVE_REQUIRED_ERROR);
          return;
        }
        setReviewDirty(false);
        // Re-read worksheet after save so Set Scope uses the confirmed editor state.
        payload = await requestSetScopePayloadFromIframe(
          takeoffIframeRef.current,
          selectedJobId,
          { timeoutMs: 8000 }
        );
        if (!payload?.takeoffResult) {
          setError(SET_SCOPE_PAYLOAD_REQUIRED_ERROR);
          return;
        }
      }

      const res = await setQuoteFlowScope(authToken, selectedJobId, {
        confirm: true,
        projectName: name,
        estimateName: name,
        takeoffResult: payload.takeoffResult,
        reviewState: payload.reviewState || undefined
      });
      applyScopeSuccess({ ...res, projectName: res.projectName || name });
      await loadList("refresh");
      // Do not refetch takeoff detail after success — avoids stale 404 noise.
    } catch (e) {
      const msg = errorMessage(e);
      if (/already.?scoped|Scope is already set|Open in Estimates/i.test(msg)) {
        applyScopeSuccess({
          estimateId: estimateId || detail?.estimateId,
          message: "Scope is set for this estimate.",
          alreadyScoped: true,
          reused: true,
          projectName: name
        });
        await loadList("refresh");
        return;
      }
      // Only after backend confirms no live payload and no saved/approved review.
      if (
        /No saved result|takeoff_not_ready|Review measurements before setting scope|No usable measurements|takeoff_already_approved|Approved Takeoff measurements cannot be changed|Edit Measurements/i.test(
          msg
        )
      ) {
        setError(saveDraftFirstMsg);
        return;
      }
      setError(msg);
    } finally {
      inFlightRef.current = false;
      setSetScopeBusy(false);
    }
  }

  async function runManualSetScope() {
    if (!selectedJobId || inFlightRef.current || setScopeBusy) return;
    inFlightRef.current = true;
    setSetScopeBusy(true);
    setError(null);
    setNotice(null);
    const name = resolvedNameForSubmit();
    if (!isMeaningfulQuoteName(name)) {
      setError(
        "Enter a meaningful Quote Name before setting scope. Plan filenames cannot be used as the quote identity."
      );
      inFlightRef.current = false;
      setSetScopeBusy(false);
      return;
    }
    await persistQuoteNameIfNeeded({ quiet: true });
    try {
      const res = await setQuoteFlowManualScope(authToken, selectedJobId, {
        confirm: true,
        rooms: manualRooms,
        projectName: name,
        estimateName: name
      });
      applyScopeSuccess({ ...res, projectName: res.projectName || name });
      await loadList("refresh");
    } catch (e) {
      const msg = errorMessage(e);
      if (/already.?scoped|Scope is already set|Open in Estimates/i.test(msg)) {
        applyScopeSuccess({
          estimateId: estimateId || detail?.estimateId,
          message: "Scope is set for this estimate.",
          alreadyScoped: true,
          reused: true,
          projectName: name
        });
        await loadList("refresh");
      } else {
        setError(msg);
      }
    } finally {
      inFlightRef.current = false;
      setSetScopeBusy(false);
    }
  }

  useEffect(() => {
    if (!selectedJobId || detailMode !== "review") return;
    function onMessage(event: MessageEvent) {
      if (!isAllowedTakeoffMessageOrigin(event.origin)) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (
        data.type === TAKEOFF_REVIEW_DIRTY &&
        String(data.takeoffJobId || "") === String(selectedJobId)
      ) {
        setReviewDirty(data.dirty === true);
        return;
      }
      if (
        data.type === TAKEOFF_REVIEW_DRAFT_SAVED &&
        String(data.takeoffJobId || "") === String(selectedJobId)
      ) {
        setReviewDirty(false);
        setReviewSaveBusy(false);
        return;
      }
      // Legacy approved handoff only — footer Set Scope trigger is removed.
      if (isValidTakeoffApprovedMessage(data, selectedJobId)) {
        void runSetScope();
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, selectedJobId, detailMode, estimateName]);

  useEffect(() => {
    if (detailMode !== "review") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [detailMode]);

  useEffect(() => {
    if (detailMode !== "review") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeReviewWorkspace();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailMode]);

  useEffect(() => {
    if (detailMode === "review") {
      reviewCloseBtnRef.current?.focus?.();
    }
  }, [detailMode, selectedJobId]);

  function renderRow(row: QuoteFlowQueueItem) {
    const jobId = row.takeoffJobId || "";
    const queueItemKey = resolveClientQueueItemKey(row);
    const active = Boolean(jobId && jobId === selectedJobId);
    const title = resolveQueueTitle(row);
    const customer = resolveQueueCustomer(row);
    const when =
      formatQueueTime(row.returnedAt || row.takeoffReturnedAt) ||
      formatQueueTime(row.receivedAt) ||
      formatQueueTime(row.startedAt || row.takeoffStartedAt);
    const nextLabel = row.nextAction?.label || row.actionLabel || row.status?.label || "Open";
    const rowAction = row.rowAction || row.action;
    const isArchived = row.archived === true;
    const sourceSubject = row.requestSubject || row.subject || null;
    const packetMerged = row.packetMerged === true || (row.packetFileCount || 0) > 1;
    const packetFiles = Array.isArray(row.packetFiles) ? row.packetFiles : [];

    return (
      <li key={queueItemKey || jobId || row.intakeCaseId || title}>
        <div
          className={active ? "qf-inbox__row-card is-active" : "qf-inbox__row-card"}
          data-testid="qf-queue-row"
          data-takeoff-job-id={jobId}
          data-queue-item-key={queueItemKey}
          data-archived={isArchived ? "1" : "0"}
          data-status={row.status?.key || ""}
          data-group={resolveQueueGroupKey(row)}
          data-row-action={rowAction || ""}
          data-packet-merged={packetMerged ? "1" : "0"}
        >
          <button type="button" className="qf-inbox__row-main" onClick={() => selectRow(row)}>
            <span className="qf-inbox__row-title" data-testid="qf-queue-row-title">
              {title}
            </span>
            {customer ? (
              <span className="qf-inbox__row-meta" data-testid="qf-queue-row-sender">
                Sender: {customer}
              </span>
            ) : null}
            {when ? (
              <span className="qf-inbox__row-meta" data-testid="qf-queue-row-received">
                {row.returnedAt || row.takeoffReturnedAt ? "Returned: " : "Received: "}
                {when}
              </span>
            ) : null}
            {sourceSubject ? (
              <span className="qf-inbox__row-meta" data-testid="qf-queue-row-source">
                Source: {sourceSubject}
              </span>
            ) : null}
            {row.sourceMailboxLabel ? (
              <span className="qf-inbox__row-meta">Inbox: {row.sourceMailboxLabel}</span>
            ) : null}
            {packetMerged ? (
              <span className="qf-inbox__row-meta" data-testid="qf-queue-row-packet">
                {row.packetSummaryLabel ||
                  `AI Takeoff packet: ${row.packetFileCount || packetFiles.length || 0} files`}
              </span>
            ) : row.selectedPlanFilename || row.planFilename ? (
              <span className="qf-inbox__row-meta" data-testid="qf-queue-row-plan">
                Plan processed: {row.selectedPlanFilename || row.planFilename}
              </span>
            ) : null}
            {packetMerged && packetFiles.length ? (
              <ul className="qf-queue__packet-files" data-testid="qf-queue-row-packet-files">
                {packetFiles.map((f, idx) => (
                  <li key={`${f.filename || "file"}-${idx}`}>{f.filename || "Attachment"}</li>
                ))}
              </ul>
            ) : null}
            {packetMerged && row.packetFilename ? (
              <span className="qf-inbox__row-meta qf-muted">Packet file: {row.packetFilename}</span>
            ) : null}
            {row.summary?.label ? (
              <span className="qf-inbox__row-meta" data-testid="qf-queue-row-summary">
                {row.summary.label}
              </span>
            ) : null}
            <span className="qf-inbox__row-status-line">
              <span
                className={statusPillClass(row.status?.key)}
                data-testid="qf-queue-row-status"
                data-status={row.status?.key || ""}
              >
                {row.status?.label || "Ready for review"}
              </span>
              {isArchived ? (
                <span className="qf-pill" data-testid="qf-queue-archived-badge">
                  Archived
                </span>
              ) : null}
              <span className="qf-inbox__next" data-testid="qf-queue-row-next">
                Next action: {nextLabel}
              </span>
            </span>
            {row.nextActionHelper ? (
              <span className="qf-inbox__row-meta qf-queue__next-helper" data-testid="qf-queue-row-helper">
                {row.nextActionHelper}
              </span>
            ) : null}
          </button>
          <div className="qf-queue__row-actions">
            {rowAction === "review_takeoff" && jobId && !isArchived ? (
              <button
                type="button"
                className="qf-btn-primary"
                data-testid="qf-queue-review"
                onClick={() => void openReview(jobId, row)}
              >
                Review Takeoff
              </button>
            ) : null}
            {rowAction === "create_manual_scope" && !isArchived ? (
              <button
                type="button"
                className="qf-btn-primary"
                data-testid="qf-queue-manual-scope"
                onClick={() => void openManualScope(row)}
              >
                Create Manual Scope
              </button>
            ) : null}
            {rowAction === "needs_decision" && !isArchived ? (
              <button
                type="button"
                className="qf-btn-secondary"
                data-testid="qf-queue-needs-decision"
                onClick={() => selectRow(row)}
              >
                Needs decision
              </button>
            ) : null}
            {rowAction === "waiting" && !isArchived ? (
              <span className="qf-muted" data-testid="qf-queue-waiting">
                Waiting on AI Takeoff
              </span>
            ) : null}
            {isArchived ? (
              <button
                type="button"
                className="qf-btn-secondary"
                data-testid="qf-queue-restore"
                disabled={archiveBusy || !queueItemKey}
                onClick={() => void runRestore(queueItemKey)}
              >
                Restore
              </button>
            ) : (
              <button
                type="button"
                className="qf-btn-secondary"
                data-testid="qf-queue-archive"
                disabled={archiveBusy || !queueItemKey}
                onClick={() => void runArchive(queueItemKey)}
              >
                Remove from queue
              </button>
            )}
          </div>
        </div>
      </li>
    );
  }

  function renderSection(
    testId: string,
    title: string,
    rows: QuoteFlowQueueItem[],
    empty: string
  ) {
    if (filter !== "all_active" && rows.length === 0) return null;
    return (
      <div className="qf-inbox__section" data-testid={testId}>
        <h3 className="qf-inbox__section-title">
          {title}
          <span className="qf-inbox__section-count">{rows.length}</span>
        </h3>
        {rows.length === 0 ? (
          <p className="qf-muted qf-inbox__section-empty">{empty}</p>
        ) : (
          <ul className="qf-inbox__rows">{rows.map(renderRow)}</ul>
        )}
      </div>
    );
  }

  function renderEstimateNameField() {
    const needsName =
      !isMeaningfulQuoteName(estimateName) &&
      (workspaceItem?.quoteNameRequired === true ||
        resolveCanonicalQuoteName(workspaceItem || {}).quoteNameRequired);
    return (
      <label className="qf-queue__estimate-name" data-testid="qf-queue-estimate-name">
        <span>Quote name</span>
        <input
          type="text"
          value={estimateName}
          onChange={(e) => onEstimateNameChange(e.target.value)}
          onBlur={() => {
            void persistQuoteNameIfNeeded({ quiet: true });
          }}
          placeholder="Required — e.g. Smith Residence - Kitchen"
          data-testid="qf-queue-estimate-name-input"
          aria-invalid={needsName || undefined}
        />
        {needsName ? (
          <span className="qf-queue__estimate-name-hint" data-testid="qf-queue-quote-name-required">
            A Quote Name is required before Set Scope. Plan filenames are not used as the quote
            identity.
          </span>
        ) : null}
      </label>
    );
  }

  const showSuccess = detailMode === "success";
  const showFullLoading = initialLoading && items.length === 0;
  const showEmpty = !initialLoading && visibleRows.length === 0;
  const workspaceTitle =
    showSuccess && successName
      ? successName
      : estimateName || resolveQueueTitle(workspaceItem || {});
  const workspaceSubtitle = resolveQueueSubtitle(workspaceItem || {}, workspaceTitle);

  return (
    <section className="qf-page qf-page--command qf-page--queue" data-testid="qf-queue-page">
      <header className="qf-command-header" data-testid="qf-queue-command-header">
        <div className="qf-command-header__titles">
          <h1>Estimate Queue</h1>
          <p className="qf-muted">
            Create official estimate scope from AI Takeoff measurements or manual dimensions. Once
            scope is set, the request moves to Estimates.
          </p>
        </div>
        <div className="qf-command-header__actions">
          {showSyncing ? (
            <span className="qf-inbox__syncing" data-testid="qf-queue-syncing">
              Syncing…
            </span>
          ) : null}
          <button
            type="button"
            className="qf-btn-secondary"
            data-testid="qf-queue-refresh"
            onClick={() => void loadList("refresh")}
            disabled={initialLoading || isRefreshing}
          >
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <div className="qf-stats qf-stats--command" data-testid="qf-queue-stats">
        <div className="qf-stat">
          <span className="qf-stat__value">{allGrouped.stats.readyForReview}</span>
          <span className="qf-stat__label">Ready for AI review</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{allGrouped.stats.manualScopeNeeded}</span>
          <span className="qf-stat__label">Manual scope needed</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{allGrouped.stats.processing}</span>
          <span className="qf-stat__label">AI Takeoff processing</span>
        </div>
        <div className="qf-stat">
          <span className="qf-stat__value">{allGrouped.stats.failed}</span>
          <span className="qf-stat__label">Failed / needs attention</span>
        </div>
      </div>

      <div className="qf-inbox-toolbar" data-testid="qf-queue-filters">
        <div className="qf-filter-chips" role="tablist" aria-label="Queue archive view">
          {ARCHIVE_VIEWS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              className={archiveView === f.key ? "qf-chip is-active" : "qf-chip"}
              data-testid={`qf-queue-archive-view-${f.key}`}
              aria-selected={archiveView === f.key}
              onClick={() => setArchiveView(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="qf-filter-chips" role="tablist" aria-label="Queue filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              className={filter === f.key ? "qf-chip is-active" : "qf-chip"}
              data-testid={`qf-queue-filter-${f.key}`}
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="qf-inbox-search">
          <span className="qf-visually-hidden">Search</span>
          <input
            type="search"
            data-testid="qf-queue-search"
            placeholder="Search customer, project, plan…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      {error ? (
        <div className="qf-error-box" data-testid="qf-queue-error">
          {error}
        </div>
      ) : null}
      {notice ? (
        <p className="qf-notice" data-testid="qf-queue-notice">
          {notice}
        </p>
      ) : null}

      {archiveConfirmKey ? (
        <div className="qf-confirm" data-testid="qf-queue-archive-confirm">
          <p>
            Archive this item from the queue? This does not cancel the AI job.
          </p>
          <div className="qf-confirm__actions">
            <button
              type="button"
              className="qf-btn-secondary"
              data-testid="qf-queue-archive-confirm-no"
              onClick={() => setArchiveConfirmKey(null)}
              disabled={archiveBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              className="qf-btn-primary"
              data-testid="qf-queue-archive-confirm-yes"
              disabled={archiveBusy}
              onClick={() => void runArchive(archiveConfirmKey, true)}
            >
              Archive
            </button>
          </div>
        </div>
      ) : null}

      <div className="qf-queue qf-queue--scope qf-queue--command" data-testid="qf-queue">
        <div className="qf-queue__list" data-testid="qf-queue-list">
          <div className="qf-inbox__list-head">
            <h2>Scope creation</h2>
            <span className="qf-muted">{visibleRows.length} shown</span>
          </div>
          {showFullLoading ? (
            <p className="qf-muted" data-testid="qf-queue-initial-loading">
              Loading queue…
            </p>
          ) : null}
          {showEmpty ? (
            <div className="qf-inbox__empty" data-testid="qf-queue-empty">
              <p className="qf-muted">
                {search
                  ? "No requests match this search."
                  : filter !== "all_active"
                    ? "No requests in this filter."
                    : archiveView === "archived"
                      ? "No archived queue items."
                      : archiveView === "all"
                        ? "No queue items."
                        : "No active queue items."}
              </p>
            </div>
          ) : null}
          {!showEmpty ? (
            <>
              {renderSection(
                "qf-queue-group-ready",
                "Ready for AI review",
                visibleGrouped.ready as QuoteFlowQueueItem[],
                "No takeoffs ready for review."
              )}
              {renderSection(
                "qf-queue-group-manual",
                "Manual scope needed",
                visibleGrouped.manual as QuoteFlowQueueItem[],
                "No manual-scope requests."
              )}
              {renderSection(
                "qf-queue-group-processing",
                "AI Takeoff processing",
                visibleGrouped.processing as QuoteFlowQueueItem[],
                "No AI Takeoffs in progress."
              )}
              {renderSection(
                "qf-queue-group-failed",
                "Failed / needs attention",
                visibleGrouped.failed as QuoteFlowQueueItem[],
                "No failed takeoffs."
              )}
            </>
          ) : null}
        </div>

        <div
          className={
            detailMode === "review"
              ? "qf-queue__detail qf-queue__detail--review"
              : detailMode === "manual"
                ? "qf-queue__detail qf-queue__detail--manual"
                : "qf-queue__detail"
          }
          data-testid="qf-queue-detail"
        >
          {!selectedJobId && detailMode === "idle" ? (
            <div
              className="qf-placeholder qf-placeholder--command"
              data-testid="qf-queue-empty-workspace"
            >
              <h2>Select a request to create scope</h2>
              <p>
                Create scope for this request using AI measurements or manual entry. Review Takeoff
                verifies dimensions; Create Manual Scope builds rooms and pieces by hand.
              </p>
            </div>
          ) : detailLoading && !workspaceItem ? (
            <p className="qf-muted">Loading…</p>
          ) : showSuccess ? (
            <div className="qf-queue__success" data-testid="qf-queue-scope-set">
              <h2>{successName || workspaceTitle}</h2>
              <p className="qf-notice">Scope is set for this estimate.</p>
              <p className="qf-muted">
                This request has left the Estimate Queue and is available in Estimates.
              </p>
              <div className="qf-inbox__detail-actions">
                <button
                  type="button"
                  className="qf-btn-primary"
                  data-testid="qf-queue-goto-estimates"
                  onClick={() => onOpenEstimates?.(estimateId || workspaceItem?.estimateId)}
                >
                  Open in Estimates
                </button>
                <button
                  type="button"
                  className="qf-btn-secondary"
                  onClick={() => {
                    setSelectedJobId(null);
                    setDetail(null);
                    setDetailMode("idle");
                    setNotice(null);
                    setSuccessName(null);
                    setEstimateName("");
                    successJobIdRef.current = null;
                  }}
                >
                  Back to queue
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="qf-queue__workspace-summary" data-testid="qf-queue-workspace-summary">
                <div className="qf-queue__detail-sticky">
                  <div className="qf-queue__detail-head">
                    <div>
                      <h2 data-testid="qf-queue-workspace-title">{workspaceTitle}</h2>
                      {workspaceSubtitle ? (
                        <p className="qf-muted" data-testid="qf-queue-workspace-subtitle">
                          {workspaceSubtitle}
                        </p>
                      ) : null}
                      <span
                        className={statusPillClass(workspaceItem?.status?.key)}
                        data-testid="qf-queue-detail-status"
                      >
                        {workspaceItem?.status?.label || "Needs scope"}
                      </span>
                      {workspaceItem?.summary?.label ? (
                        <span className="qf-queue__summary-chip">{workspaceItem.summary.label}</span>
                      ) : null}
                      <p className="qf-muted qf-queue__method-hint">
                        Create scope for this request using AI measurements or manual entry.
                      </p>
                    </div>
                    <div className="qf-queue__workspace-actions" data-testid="qf-queue-workspace-actions">
                      {workspaceItem?.canReviewTakeoff && selectedJobId ? (
                        <button
                          type="button"
                          className={
                            detailMode === "review" ? "qf-btn-primary" : "qf-btn-secondary"
                          }
                          data-testid="qf-queue-review"
                          onClick={() => void openReview(selectedJobId, workspaceItem)}
                        >
                          Review AI Takeoff
                        </button>
                      ) : null}
                      {workspaceItem?.canCreateManualScope ? (
                        <button
                          type="button"
                          className={
                            detailMode === "manual" ? "qf-btn-primary" : "qf-btn-secondary"
                          }
                          data-testid="qf-queue-manual-scope"
                          onClick={() => workspaceItem && void openManualScope(workspaceItem)}
                        >
                          Create Manual Scope
                        </button>
                      ) : null}
                      {workspaceItem?.status?.key === "takeoff_failed" ? (
                        <button
                          type="button"
                          className="qf-btn-secondary"
                          data-testid="qf-queue-choose-plan"
                          onClick={() => onOpenInbox?.(workspaceItem.messageKey)}
                        >
                          Choose another plan
                        </button>
                      ) : null}
                      {detailMode === "review" ? null : detailMode === "manual" ? (
                        <button
                          type="button"
                          className="qf-btn-primary"
                          data-testid="qf-queue-set-scope"
                          disabled={setScopeBusy}
                          onClick={() => void runManualSetScope()}
                        >
                          {setScopeBusy ? "Setting scope…" : "Set Scope"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <ProcessedPlanPacketCard item={workspaceItem} />

                  {(detailMode === "review" || detailMode === "manual" || detailMode === "idle") &&
                  workspaceItem
                    ? renderEstimateNameField()
                    : null}

                  {detailMode === "review" ? (
                    <p className="qf-muted" data-testid="qf-queue-set-scope-hint">
                      Review measurements. Save draft if needed, then Set Scope from the Quote Flow
                      header.
                    </p>
                  ) : null}
                  {detailMode === "review" ? (
                    <p className="qf-muted" data-testid="qf-queue-review-open-hint">
                      Review Takeoff is open in the full workspace. Close it to return to the queue
                      list.
                    </p>
                  ) : null}
                  {detailMode === "manual" ? (
                    <p className="qf-muted" data-testid="qf-queue-manual-hint">
                      {workspaceItem?.status?.key === "takeoff_failed"
                        ? workspaceItem.failureReason
                          ? `Takeoff failed: ${workspaceItem.failureReason}`
                          : "AI Takeoff failed. Enter rooms and pieces manually, or choose another plan in Inbox."
                        : "Add rooms and pieces, then click Set Scope to create the official estimate scope."}
                    </p>
                  ) : null}
                  {detailMode === "idle" && workspaceItem?.action === "waiting" ? (
                    <p className="qf-muted" data-testid="qf-queue-waiting">
                      Waiting on AI Takeoff. Scope creation unlocks when measurements are ready.
                    </p>
                  ) : null}
                  {detailMode === "idle" &&
                  (workspaceItem?.status?.key === "takeoff_failed" ||
                    workspaceItem?.action === "needs_decision") ? (
                    <p className="qf-muted" data-testid="qf-queue-failed-reason">
                      {workspaceItem.failureReason
                        ? `Takeoff failed: ${workspaceItem.failureReason}`
                        : "AI Takeoff needs a decision. Choose another plan in Inbox, or create scope manually."}
                    </p>
                  ) : null}
                </div>
              </div>

              {detailMode === "manual" ? (
                <div className="qf-queue-manual-builder" data-testid="qf-queue-manual-builder">
                  <OfficialScopeEditor
                    rooms={manualRooms}
                    onChange={setManualRooms}
                    disabled={setScopeBusy}
                    heading="Manual scope"
                    hint="Add rooms and pieces with length, depth, and quantity. This creates official estimate scope — not a price."
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {detailMode === "review" && takeoffSrc ? (
        <div
          className="qf-queue-review-modal-backdrop"
          data-testid="qf-queue-review-modal-backdrop"
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            if (reviewDirtyRef.current) return;
            closeReviewWorkspace();
          }}
        >
          <div
            className="qf-queue-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qf-queue-review-modal-title"
            data-testid="qf-queue-review-modal"
          >
            <header className="qf-queue-review-modal__header" data-testid="qf-queue-review-workspace">
              <div className="qf-queue-review-modal__header-top">
                <div>
                  <p className="qf-queue-review-modal__eyebrow">Review Takeoff</p>
                  <h2 id="qf-queue-review-modal-title" data-testid="qf-queue-review-modal-title">
                    {workspaceTitle}
                  </h2>
                  {workspaceSubtitle ? (
                    <p className="qf-muted" data-testid="qf-queue-review-modal-subtitle">
                      {workspaceSubtitle}
                    </p>
                  ) : null}
                  <div className="qf-queue-review-modal__meta">
                    <span
                      className={statusPillClass(workspaceItem?.status?.key)}
                      data-testid="qf-queue-review-modal-status"
                    >
                      {workspaceItem?.status?.label || "AI Takeoff returned"}
                    </span>
                    {workspaceItem?.senderLabel || workspaceItem?.customerDisplay ? (
                      <span className="qf-muted" data-testid="qf-queue-review-modal-sender">
                        {workspaceItem.senderLabel || workspaceItem.customerDisplay}
                      </span>
                    ) : null}
                    {workspaceItem?.selectedPlanFilename ||
                    workspaceItem?.takeoffPlanFilename ||
                    workspaceItem?.planFilename ||
                    workspaceItem?.packetSummaryLabel ? (
                      <span className="qf-muted" data-testid="qf-queue-review-modal-plan">
                        {workspaceItem.packetSummaryLabel ||
                          workspaceItem.selectedPlanFilename ||
                          workspaceItem.takeoffPlanFilename ||
                          workspaceItem.planFilename}
                      </span>
                    ) : null}
                    {reviewDirty ? (
                      <span className="qf-queue-review-modal__dirty" data-testid="qf-queue-review-dirty">
                        Unsaved changes
                      </span>
                    ) : null}
                  </div>
                </div>
                <div
                  className="qf-queue-review-modal__actions"
                  data-testid="qf-queue-review-modal-actions"
                >
                  <button
                    type="button"
                    className="qf-btn-secondary"
                    data-testid="qf-queue-review-save-draft"
                    disabled={setScopeBusy || reviewSaveBusy}
                    onClick={() => requestReviewSaveDraft()}
                    aria-label="Save draft"
                  >
                    {reviewSaveBusy ? "Saving…" : "Save Draft"}
                  </button>
                  <button
                    type="button"
                    className="qf-btn-primary"
                    data-testid="qf-queue-set-scope"
                    disabled={setScopeBusy || workspaceItem?.alreadyScoped === true}
                    onClick={() => void runSetScope()}
                    title="Save verified measurements as official estimate scope"
                    aria-label="Set Scope"
                  >
                    {setScopeBusy
                      ? "Setting scope…"
                      : workspaceItem?.alreadyScoped
                        ? "Scope is set"
                        : "Set Scope"}
                  </button>
                  <button
                    ref={reviewCloseBtnRef}
                    type="button"
                    className="qf-btn-secondary"
                    data-testid="qf-queue-review-modal-close"
                    onClick={() => closeReviewWorkspace()}
                    aria-label="Back to Queue"
                  >
                    Back to Queue
                  </button>
                </div>
              </div>

              {error ? (
                <div className="qf-error-box" role="alert">
                  {error}
                </div>
              ) : null}
              {notice ? (
                <p className="qf-notice" data-testid="qf-queue-review-notice">
                  {notice}
                </p>
              ) : null}

              <div className="qf-queue-review-modal__name-row">
                {renderEstimateNameField()}
                <p className="qf-muted qf-queue-review-modal__hint" data-testid="qf-queue-set-scope-hint">
                  Review measurements beside the plan. Save Draft if needed, then Set Scope.
                </p>
              </div>
            </header>

            <div className="qf-queue-review-modal__body">
              <div className="qf-queue__frame-wrap qf-queue__frame-wrap--review-modal">
                <iframe
                  ref={takeoffIframeRef}
                  title="Takeoff review"
                  src={takeoffSrc}
                  className="qf-queue__frame"
                  data-testid="qf-queue-takeoff-iframe"
                  allow="fullscreen"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
