/**
 * Lovable customer quote UI — adapted from hub-spoke-hub q.$token.tsx.
 * Pricing / accept / Supabase / client totals removed. Brain APIs only.
 */
import { useEffect, useId, useMemo, useState } from "react";
import {
  buildSelectionItems,
  groupColorsByPricingGroup,
  mapEliteOsToLovableViewModel,
  type CustomerInfoDraft,
  type LovableColor,
  type LovableRoom,
} from "./lovableViewModel";
import {
  fetchCurrentReviewRequest,
  formatDate,
  reviewUiEnabled,
  saveConfigurationSelections,
  submitReviewRequest,
  type ConfigurationState,
  type CustomerReviewRequest,
} from "./publicConfigApi";

type Props = {
  state: ConfigurationState;
  onState: (next: ConfigurationState) => void;
  onFatal: () => void;
};

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${muted ? "text-muted-foreground" : "text-foreground"}`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function GroupChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-background text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function ColorPickerModal({
  room,
  onSelect,
  onClose,
}: {
  room: LovableRoom;
  onSelect: (color: LovableColor) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => groupColorsByPricingGroup(room.colors), [room.colors]);
  const [activeGroup, setActiveGroup] = useState(() => groups[0]?.label || "All");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    if (!groups.some((g) => g.label === activeGroup) && groups[0]) {
      setActiveGroup(groups[0].label);
    }
  }, [groups, activeGroup]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const pool =
      activeGroup === "All"
        ? room.colors
        : groups.find((g) => g.label === activeGroup)?.colors || room.colors;
    return pool.filter((c) =>
      query
        ? (c.name + " " + c.collectionLabel + " " + c.pricingGroupLabel)
            .toLowerCase()
            .includes(query)
        : true,
    );
  }, [q, room.colors, groups, activeGroup]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
      data-testid="de-color-modal"
    >
      <div
        className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-background shadow-2xl sm:h-[85vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Pick a color for ${room.name}`}
      >
        <div className="border-b border-border px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                {room.name} · pick a color
              </div>
              <div className="mt-0.5 text-lg font-semibold text-foreground">Elite 100 collection</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Close
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search color"
              data-testid="de-color-search"
              className="w-56 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <GroupChip
              active={activeGroup === "All"}
              label={`All (${room.colors.length})`}
              onClick={() => setActiveGroup("All")}
            />
            {groups.map((g) => (
              <GroupChip
                key={g.label}
                active={activeGroup === g.label}
                label={`${g.label} (${g.colors.length})`}
                onClick={() => setActiveGroup(g.label)}
              />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map((c) => {
              const selected = c.id === room.selectedColorId;
              return (
                <button
                  key={c.optionKey}
                  type="button"
                  disabled={!c.selectable}
                  onClick={() => onSelect(c)}
                  data-testid="de-color-card"
                  data-group={c.pricingGroupLabel}
                  className={`group overflow-hidden rounded-xl border text-left transition ${
                    selected
                      ? "border-foreground shadow-sm ring-2 ring-foreground/20"
                      : "border-border hover:border-foreground/40 hover:shadow-sm"
                  } disabled:opacity-50`}
                >
                  <div
                    className="h-28 w-full border-b border-border/60 bg-cover bg-center"
                    style={{
                      backgroundImage: c.imageFull
                        ? `url(${c.imageFull})`
                        : c.imageThumb
                          ? `url(${c.imageThumb})`
                          : undefined,
                      background:
                        !c.imageFull && !c.imageThumb
                          ? "linear-gradient(135deg,#ebe8e0,#d5d2c8)"
                          : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  />
                  <div className="px-3 py-2">
                    <div className="truncate text-xs font-medium text-foreground">{c.name}</div>
                    <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {c.pricingGroupLabel}
                      {c.includedInBaseline ? " · Included" : " · Upgrade may apply"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {!filtered.length ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No colors match &quot;{q || activeGroup}&quot;.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReviewRequestModal({
  rooms,
  onSubmit,
  onClose,
  busy,
}: {
  rooms: LovableRoom[];
  onSubmit: (message: string) => void;
  onClose: () => void;
  busy: boolean;
}) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="review-modal-title"
      >
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Request a review</div>
        <div id="review-modal-title" className="mt-1 text-lg font-semibold text-foreground">
          Send your selections to your estimator
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          This is not an order or acceptance. Pricing and availability remain subject to estimator review.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Rooms: {rooms.map((r) => r.name).join(", ")}
        </p>
        <label className="mt-4 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Optional note
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="Anything your estimator should know…"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onSubmit(message.trim())}
            className="rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send for review"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomerRoomCard({
  room,
  onPickColor,
  onRename,
}: {
  room: LovableRoom;
  onPickColor: () => void;
  onRename: (name: string) => void;
}) {
  const color = room.colors.find((c) => c.id === room.selectedColorId) || room.colors[0];
  const thumb = color?.imageThumb || color?.imageFull || null;

  return (
    <div className="rounded-2xl border border-border bg-background p-6 shadow-sm" data-testid="de-room-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Room</div>
          {room.customerMayEditLabel ? (
            <input
              className="mt-0.5 w-full rounded-md border border-transparent bg-transparent text-lg font-semibold text-foreground outline-none hover:border-border focus:border-border focus:bg-background focus:px-2"
              value={room.name}
              aria-label="Room name"
              data-testid="de-room-label"
              onChange={(e) => onRename(e.target.value)}
            />
          ) : (
            <div className="mt-0.5 text-lg font-semibold text-foreground">{room.name}</div>
          )}
          {room.sourceName && room.sourceName !== room.name ? (
            <div className="mt-1 text-[11px] text-muted-foreground">
              From estimate: {room.sourceName}
            </div>
          ) : null}
        </div>
        <div
          className="h-16 w-16 shrink-0 rounded-lg border border-border bg-cover bg-center shadow-inner"
          style={{
            backgroundImage: thumb ? `url(${thumb})` : undefined,
            background: !thumb ? "linear-gradient(135deg,#ebe8e0,#d5d2c8)" : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl bg-muted/40 px-3 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Countertop
          </dt>
          <dd className="mt-0.5 font-medium tabular-nums text-foreground" data-testid="de-room-counter-sf">
            {room.countertopSf != null ? `${room.countertopSf.toFixed(2)} SF` : "—"}
          </dd>
        </div>
        <div className="rounded-xl bg-muted/40 px-3 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Backsplash
          </dt>
          <dd className="mt-0.5 font-medium tabular-nums text-foreground" data-testid="de-room-backsplash-sf">
            {room.backsplashSf != null && room.backsplashSf > 0
              ? `${room.backsplashSf.toFixed(2)} SF`
              : "Not included"}
          </dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Measurements are locked and cannot be edited here.
      </p>

      <div className="mt-5">
        <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Material / color
        </div>
        <button
          type="button"
          onClick={onPickColor}
          data-testid="de-open-color-modal"
          className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-left transition hover:border-foreground/40"
        >
          <span className="flex items-center gap-3">
            <span
              className="h-10 w-10 rounded-md border border-border/60 bg-cover bg-center"
              style={{
                backgroundImage: thumb ? `url(${thumb})` : undefined,
                background: !thumb ? "linear-gradient(135deg,#ebe8e0,#d5d2c8)" : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
            <span>
              <span className="block text-sm font-medium text-foreground">
                {color?.name || room.selectedColorName || "Choose a color"}
              </span>
              <span className="block text-xs text-muted-foreground">
                {color?.pricingGroupLabel || "Elite 100"}
                {color?.includedInBaseline ? " · Included" : " · Upgrade may apply"}
              </span>
            </span>
          </span>
          <span className="text-xs font-medium text-muted-foreground">Change</span>
        </button>
        {room.baselineLabel ? (
          <div className="mt-2 text-xs text-muted-foreground">
            Original finish · {room.baselineLabel}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ConfigurationView({ state, onState, onFatal }: Props) {
  const formId = useId();
  const config = state.configuration;
  const [qty, setQty] = useState<Record<string, number>>(() => ({
    ...(config?.currentSelections || {}),
  }));
  const [infoDraft, setInfoDraft] = useState<CustomerInfoDraft>(() => ({
    customerName: config?.customerInfoDraft?.customerName || config?.sourceProject?.customerName || state.estimate?.project?.customerName || "",
    projectName: config?.customerInfoDraft?.projectName || config?.sourceProject?.projectName || state.estimate?.project?.projectName || "",
    phone: config?.customerInfoDraft?.phone || "",
    email: config?.customerInfoDraft?.email || "",
    projectAddress:
      config?.customerInfoDraft?.projectAddress ||
      config?.sourceProject?.projectAddress ||
      state.estimate?.project?.projectAddress ||
      "",
  }));
  const [roomLabels, setRoomLabels] = useState<Record<string, string>>(
    () => ({ ...(config?.roomLabelDrafts || {}) }),
  );
  const [latestCalc, setLatestCalc] = useState(config?.latestCalculation ?? null);
  const [rowVersion, setRowVersion] = useState(state.session?.rowVersion ?? 1);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pickerRoomId, setPickerRoomId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewRequest, setReviewRequest] = useState<CustomerReviewRequest | null>(null);
  const requestSeq = useMemo(() => ({ n: 0 }), []);

  useEffect(() => {
    if (!reviewUiEnabled()) return;
    let alive = true;
    void fetchCurrentReviewRequest()
      .then((r) => {
        if (alive && r.reviewRequest) setReviewRequest(r.reviewRequest);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (state.lifecycle !== "active" || !config || !state.estimate) {
    const title =
      state.lifecycle === "expired"
        ? "Pricing expired"
        : state.lifecycle === "revoked"
          ? "Link revoked"
          : state.lifecycle === "superseded"
            ? "Estimate updated"
            : "This estimate isn’t available";
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div
          className="max-w-md rounded-2xl border border-border bg-card p-6 text-center"
          data-testid="de-lifecycle-state"
          data-lifecycle={state.lifecycle || "invalid"}
        >
          <div className="text-lg font-semibold">{title}</div>
          <p className="mt-2 text-sm text-muted-foreground">
            {state.message || "This estimate is unavailable."}
          </p>
        </div>
      </div>
    );
  }

  const vm = mapEliteOsToLovableViewModel(state, qty, latestCalc, infoDraft, roomLabels);
  if (!vm) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading your estimate…
      </div>
    );
  }

  const pickerRoom = vm.rooms.find((r) => r.id === pickerRoomId) ?? null;

  function selectColor(roomId: string, color: LovableColor) {
    const nextQty = { ...qty };
    const room = vm!.rooms.find((r) => r.id === roomId);
    for (const c of room?.colors || []) nextQty[c.optionKey] = 0;
    nextQty[color.optionKey] = 1;
    setQty(nextQty);
    setSaveState("idle");
    setPickerRoomId(null);
    void onSave({ qtyOverride: nextQty });
  }

  async function onSave(opts?: {
    qtyOverride?: Record<string, number>;
  }): Promise<number | null> {
    setSaveState("saving");
    setSaveError(null);
    const seq = ++requestSeq.n;
    const effectiveQty = opts?.qtyOverride || qty;
    const roomsForItems = mapEliteOsToLovableViewModel(
      state,
      effectiveQty,
      latestCalc,
      infoDraft,
      roomLabels,
    )?.rooms || vm!.rooms;
    const items = buildSelectionItems(effectiveQty, roomsForItems);
    try {
      const result = await saveConfigurationSelections({
        items,
        expectedRowVersion: rowVersion,
        idempotencyKey: `sel-${formId}-${Date.now()}-${seq}`,
        customerInfoDraft: infoDraft,
        roomLabelDrafts: roomLabels,
      });
      if (seq !== requestSeq.n) return null;
      const nextRowVersion = result.session?.rowVersion ?? rowVersion;
      if (result.session?.rowVersion != null) setRowVersion(result.session.rowVersion);
      if (result.calculation) setLatestCalc(result.calculation as typeof latestCalc);
      setSaveState("saved");
      onState({
        ...state,
        session: state.session
          ? { ...state.session, rowVersion: nextRowVersion }
          : state.session,
        configuration: state.configuration
          ? {
              ...state.configuration,
              latestCalculation: (result.calculation as typeof latestCalc) || latestCalc,
              currentSelections: effectiveQty,
              customerInfoDraft: infoDraft,
              roomLabelDrafts: roomLabels,
            }
          : state.configuration,
      });
      return nextRowVersion;
    } catch (e) {
      if (seq !== requestSeq.n) return null;
      const status = (e as Error & { status?: number }).status;
      if (status === 401 || status === 403 || status === 404) {
        onFatal();
        return null;
      }
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : "Unable to save");
      return null;
    }
  }

  async function onSendReview(note: string) {
    if (!reviewUiEnabled()) return;
    setReviewBusy(true);
    setReviewError(null);
    try {
      const reviewRowVersion = saveState === "saved" ? rowVersion : await onSave();
      if (reviewRowVersion == null) return;
      const result = await submitReviewRequest({
        expectedRowVersion: reviewRowVersion,
        idempotencyKey: `review-${formId}-${reviewRequest?.requestReference || "new"}`,
        customerNote: note || undefined,
      });
      setReviewRequest(result.reviewRequest);
      setReviewOpen(false);
    } catch (e) {
      const status = (e as Error & { status?: number }).status;
      if (status === 401 || status === 403 || status === 404) {
        onFatal();
        return;
      }
      setReviewError(e instanceof Error ? e.message : "Unable to send for review");
    } finally {
      setReviewBusy(false);
    }
  }

  const summaryCard = (
    <div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">Your estimate</div>
      <div className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
        {vm.updatedTotalLabel}
      </div>
      <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
        <Row label="Original estimate" value={vm.originalTotalLabel} muted />
        {vm.materialUpgradeLabel ? (
          <Row label="Material / option changes" value={vm.materialUpgradeLabel} />
        ) : (
          <Row label="Change from original" value={vm.changeFromOriginalLabel} />
        )}
        <div className="flex items-center justify-between border-t border-border pt-3 text-base font-semibold">
          <span>Updated estimate</span>
          <span data-testid="de-updated-total">{vm.updatedTotalLabel}</span>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Pricing valid through {formatDate(vm.pricingValidThrough)}. Totals calculated by your estimator
        system — not final acceptance.
      </p>
      <div className="mt-5 space-y-2">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saveState === "saving"}
          className="w-full rounded-lg bg-foreground py-3 text-sm font-semibold text-background transition hover:bg-foreground/90 disabled:opacity-60"
        >
          {saveState === "saving" ? "Saving…" : "Save selections"}
        </button>
        <span className="block text-center text-xs text-muted-foreground" role="status">
          {saveState === "saved" ? "Selection saved" : null}
          {saveState === "error" ? saveError || "Unable to save" : null}
        </span>
        {reviewUiEnabled() ? (
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            disabled={Boolean(reviewRequest) && !reviewRequest?.currentSelectionsDifferFromSubmitted}
            className="w-full rounded-lg border border-border bg-background py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {reviewRequest ? "Request already sent" : "Request estimator review"}
          </button>
        ) : null}
        {reviewError ? <p className="text-center text-xs text-destructive">{reviewError}</p> : null}
      </div>
      {reviewRequest ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
          <div className="font-medium text-foreground">{reviewRequest.statusLabel}</div>
          <div className="mt-1 text-muted-foreground">
            Ref {reviewRequest.requestReference} · {formatDate(reviewRequest.requestedAt)}
          </div>
          <p className="mt-2 text-muted-foreground">
            {reviewRequest.nonAcceptanceNotice ||
              "Submitted for review — not an order or acceptance."}
          </p>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="min-h-screen bg-[oklch(0.98_0.005_260)] pb-28 lg:pb-10">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="text-sm font-semibold tracking-tight text-foreground">
            Elite Surfaces &amp; Fabrication
          </div>
          <span className="text-xs text-muted-foreground">Elite 100 Digital Estimate</span>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Your project</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
          {vm.customerName}
        </h1>
        {vm.projectName ? (
          <p className="mt-1 text-sm text-muted-foreground">{vm.projectName}</p>
        ) : null}
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Confirm your project details and choose approved Elite 100 colors for each room. Totals
          update from eliteOS when you save — measurements stay locked.
        </p>
        {vm.lockedScopeNotice ? (
          <p className="mt-2 max-w-2xl text-xs text-muted-foreground">{vm.lockedScopeNotice}</p>
        ) : null}

        <section
          className="mt-8 rounded-2xl border border-border bg-background p-6 shadow-sm"
          data-testid="de-customer-info"
          aria-label="Customer and project information"
        >
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            Customer information
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Started from your estimator&apos;s records. Suggested corrections are saved with your
            selections for review — they do not change source accounts directly.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {(
              [
                ["customerName", "Customer name"],
                ["projectName", "Project / job name"],
                ["phone", "Phone"],
                ["email", "Email"],
                ["projectAddress", "Project address"],
              ] as const
            ).map(([field, label]) => {
              const sourceVal = String(vm.sourceProject[field] || "");
              const draftVal = infoDraft[field] || "";
              const changed = Boolean(draftVal) && draftVal !== sourceVal;
              return (
                <label
                  key={field}
                  className={field === "projectAddress" ? "sm:col-span-2 grid gap-1 text-sm" : "grid gap-1 text-sm"}
                >
                  <span className="text-xs font-medium text-muted-foreground">{label}</span>
                  <input
                    className="rounded-md border border-border bg-background px-3 py-2"
                    value={draftVal}
                    data-testid={`de-info-${field}`}
                    onChange={(e) => {
                      setInfoDraft((prev) => ({ ...prev, [field]: e.target.value }));
                      setSaveState("idle");
                    }}
                  />
                  {sourceVal ? (
                    <span className="text-[11px] text-muted-foreground">
                      {changed ? `Suggested change · estimator value: ${sourceVal}` : "Matches estimate"}
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {vm.rooms.map((room) => (
              <CustomerRoomCard
                key={room.id}
                room={room}
                onPickColor={() => setPickerRoomId(room.id)}
                onRename={(name) => {
                  setRoomLabels((prev) => ({ ...prev, [room.id]: name }));
                  setSaveState("idle");
                }}
              />
            ))}

            {vm.addons.length ? (
              <div className="rounded-2xl border border-border bg-background p-6">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Options</div>
                <div className="mt-1 text-lg font-semibold text-foreground">Approved add-ons</div>
                <ul className="mt-4 space-y-3">
                  {vm.addons.map((opt) => {
                    const unresolved =
                      !opt.selectable ||
                      opt.availabilityState === "unavailable" ||
                      opt.availabilityState === "review_required";
                    return (
                      <li
                        key={opt.optionKey}
                        className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
                      >
                        <div>
                          <div className="text-sm font-medium text-foreground">{opt.displayLabel}</div>
                          {opt.includedInBaseline ? (
                            <div className="text-[11px] text-muted-foreground">Included</div>
                          ) : null}
                          {unresolved ? (
                            <div className="text-[11px] text-muted-foreground">
                              Requires estimator review
                            </div>
                          ) : null}
                        </div>
                        {unresolved ? (
                          <span className="text-xs text-muted-foreground">Unavailable</span>
                        ) : (
                          <input
                            type="number"
                            className="w-16 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                            min={opt.minQty}
                            max={opt.maxQty}
                            value={qty[opt.optionKey] ?? opt.quantity}
                            onChange={(e) => {
                              setQty((q) => ({
                                ...q,
                                [opt.optionKey]: Number(e.target.value) || 0,
                              }));
                              setSaveState("idle");
                            }}
                            aria-label={`Quantity for ${opt.displayLabel}`}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {vm.lineItems.length ? (
              <div className="rounded-2xl border border-border bg-background p-6">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Included</div>
                <ul className="mt-3 space-y-2 text-sm">
                  {vm.lineItems.map((li, i) => (
                    <li key={`${li.label}-${i}`} className="flex justify-between gap-3">
                      <span>{li.label}</span>
                      <span className="tabular-nums text-muted-foreground">{li.amountLabel}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <aside className="hidden lg:sticky lg:top-6 lg:block lg:self-start">{summaryCard}</aside>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background p-4 shadow-[0_-8px_28px_rgba(0,0,0,0.08)] lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Updated</div>
            <div className="text-lg font-semibold tabular-nums">{vm.updatedTotalLabel}</div>
          </div>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saveState === "saving"}
            className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-60"
          >
            {saveState === "saving" ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {pickerRoom ? (
        <ColorPickerModal
          room={pickerRoom}
          onSelect={(c) => selectColor(pickerRoom.id, c)}
          onClose={() => setPickerRoomId(null)}
        />
      ) : null}

      {reviewOpen ? (
        <ReviewRequestModal
          rooms={vm.rooms}
          busy={reviewBusy}
          onClose={() => setReviewOpen(false)}
          onSubmit={(note) => void onSendReview(note)}
        />
      ) : null}
    </div>
  );
}
