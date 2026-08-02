/**
 * Digital Estimate — customer configuration foundation panel.
 * Selections vs scope-change requests. No browser pricing. No sold conversion.
 */
import React, { useState } from "react";
import type { CustomerConfigurationFoundation } from "./publicConfigApi";

type Props = {
  value: CustomerConfigurationFoundation | null | undefined;
  busy?: boolean;
  onSave: (next: CustomerConfigurationFoundation) => Promise<void> | void;
};

function emptyFoundation(): CustomerConfigurationFoundation {
  return {
    version: 1,
    selectedMaterial: null,
    selectedEdgeProfile: null,
    backsplashPreference: null,
    requestedOpenings: [],
    requestedWaterfalls: [],
    customerNotes: [],
    requiresEstimatorReview: false,
    selectionChanges: { count: 0, items: [] },
    scopeChangeRequests: { count: 0, items: [] },
    lastSavedAt: null,
    canSubmitForFinalReview: false,
    approvedBaselinePreserved: true
  };
}

export default function CustomerConfigurationFoundationPanel(props: Props) {
  const { value, busy, onSave } = props;
  const foundation = value || emptyFoundation();
  const [noteDraft, setNoteDraft] = useState("");
  const [openingType, setOpeningType] = useState<string>("kitchen_sink");
  const [openingQty, setOpeningQty] = useState(1);
  const [waterfallSide, setWaterfallSide] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectionItems = foundation.selectionChanges?.items || [];
  const scopeItems = foundation.scopeChangeRequests?.items || [];

  async function persist(next: CustomerConfigurationFoundation) {
    setError(null);
    setSaving(true);
    try {
      await onSave(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save selections right now.");
    } finally {
      setSaving(false);
    }
  }

  function addNote() {
    const note = noteDraft.trim();
    if (!note) return;
    const next: CustomerConfigurationFoundation = {
      ...foundation,
      customerNotes: [
        ...(foundation.customerNotes || []),
        { id: `note-${Date.now()}`, note, requiresEstimatorReview: true }
      ]
    };
    setNoteDraft("");
    void persist(next);
  }

  function addOpening() {
    const next: CustomerConfigurationFoundation = {
      ...foundation,
      requestedOpenings: [
        ...(foundation.requestedOpenings || []),
        {
          id: `opening-${Date.now()}`,
          type: openingType,
          quantity: Math.max(1, Math.floor(openingQty || 1)),
          roomId: null,
          pieceId: null,
          note: null,
          requiresEstimatorReview: true
        }
      ]
    };
    void persist(next);
  }

  function addWaterfallPlaceholder() {
    const side = waterfallSide.trim() || "front";
    const next: CustomerConfigurationFoundation = {
      ...foundation,
      requestedWaterfalls: [
        ...(foundation.requestedWaterfalls || []),
        {
          id: `waterfall-${Date.now()}`,
          pieceId: null,
          roomId: null,
          side,
          legHeight: null,
          backsidePolishRequested: false,
          note: "Customer waterfall request (not priced yet)",
          requiresEstimatorReview: true,
          priced: false
        }
      ]
    };
    setWaterfallSide("");
    void persist(next);
  }

  return (
    <section
      className="rounded-xl border border-border bg-card p-4 space-y-4"
      data-testid="de-customer-configuration-foundation"
      aria-labelledby="de-customer-config-heading"
    >
      <div>
        <h2 id="de-customer-config-heading" className="text-base font-semibold text-foreground">
          Your selections
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Finish choosing your options. Your estimate updates as selections are saved.
        </p>
      </div>

      <div data-testid="de-your-selections">
        <h3 className="text-sm font-semibold text-foreground">Saved selections</h3>
        {selectionItems.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            No saved selection summary yet. Choose materials and edges in the rooms above, then
            save.
          </p>
        ) : (
          <ul className="mt-2 list-disc pl-5 text-sm text-foreground space-y-1">
            {selectionItems.map((item, i) => (
              <li key={`${item.kind}-${i}`}>{item.label}</li>
            ))}
          </ul>
        )}
      </div>

      <div data-testid="de-review-required-requests">
        <h3 className="text-sm font-semibold text-foreground">Additional scope requests</h3>
        {scopeItems.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground" data-testid="de-no-scope-requests">
            No additional scope requests.
          </p>
        ) : (
          <>
            <p
              className="mt-1 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2"
              data-testid="de-scope-review-warning"
            >
              These requests need Elite review before final approval.
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm text-foreground space-y-1">
              {scopeItems.map((item, i) => (
                <li key={`${item.kind}-${i}`}>{item.label}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-muted-foreground">Add note / request</span>
          <textarea
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            rows={3}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            data-testid="de-foundation-note-input"
            aria-label="Add note or request"
          />
          <button
            type="button"
            className="mt-2 inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm"
            disabled={busy || saving || !noteDraft.trim()}
            onClick={addNote}
            data-testid="de-foundation-add-note"
          >
            Add note
          </button>
        </label>

        <div className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Request additional opening</span>
            <div className="mt-1 flex flex-wrap gap-2">
              <select
                className="rounded-md border border-border bg-background px-2 py-1.5"
                value={openingType}
                onChange={(e) => setOpeningType(e.target.value)}
                data-testid="de-foundation-opening-type"
                aria-label="Opening type"
              >
                <option value="kitchen_sink">Kitchen sink</option>
                <option value="vanity_sink">Vanity sink</option>
                <option value="cooktop">Cooktop</option>
                <option value="outlet">Outlet</option>
                <option value="popup_outlet">Pop-up outlet</option>
                <option value="other">Other</option>
              </select>
              <input
                type="number"
                min={1}
                max={20}
                className="w-20 rounded-md border border-border bg-background px-2 py-1.5"
                value={openingQty}
                onChange={(e) => setOpeningQty(Number(e.target.value) || 1)}
                data-testid="de-foundation-opening-qty"
                aria-label="Opening quantity"
              />
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5"
                disabled={busy || saving}
                onClick={addOpening}
                data-testid="de-foundation-add-opening"
              >
                Add opening request
              </button>
            </div>
          </div>

          <div>
            <span className="text-muted-foreground">Waterfall request (not priced yet)</span>
            <div className="mt-1 flex flex-wrap gap-2">
              <input
                type="text"
                className="min-w-[8rem] flex-1 rounded-md border border-border bg-background px-2 py-1.5"
                placeholder="Side (e.g. left)"
                value={waterfallSide}
                onChange={(e) => setWaterfallSide(e.target.value)}
                data-testid="de-foundation-waterfall-side"
                aria-label="Waterfall side"
              />
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5"
                disabled={busy || saving}
                onClick={addWaterfallPlaceholder}
                data-testid="de-foundation-add-waterfall"
              >
                Request waterfall
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex items-center rounded-md bg-foreground text-background px-3 py-2 text-sm font-medium disabled:opacity-60"
          disabled={busy || saving}
          onClick={() => void persist(foundation)}
          data-testid="de-foundation-save-selections"
        >
          {saving ? "Saving…" : "Save selections"}
        </button>
        {foundation.requiresEstimatorReview && scopeItems.length > 0 ? (
          <span
            className="text-sm text-amber-800"
            data-testid="de-foundation-review-flag"
          >
            Scope requests need Elite review before final approval.
          </span>
        ) : null}
        {foundation.lastSavedAt ? (
          <span className="text-xs text-muted-foreground" data-testid="de-foundation-last-saved">
            Last saved {new Date(foundation.lastSavedAt).toLocaleString()}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-700" role="alert" data-testid="de-foundation-save-error">
          {error}
        </p>
      ) : null}
    </section>
  );
}
