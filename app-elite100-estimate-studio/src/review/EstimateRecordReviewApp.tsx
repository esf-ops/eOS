/**
 * Local-only Estimate Record review harness.
 * Mounts production Estimate Record components + EliteosTopbar + Takeoff iframe.
 * Not imported by StudioApp production routing.
 */
import React, { useEffect, useMemo, useState } from "react";
import EliteosTopbar from "../../../shared/eliteos-ui/EliteosTopbar";
import {
  DigitalEstimateSection,
  EstimateRecordHeader,
  VerifiedEstimateSection
} from "../estimateQueue/estimateRecord/EstimateRecordSections";
import {
  CommercialConfigurationSection,
  EstimateRevisionHistory
} from "../estimateQueue/estimateRecord/CommercialConfigurationSection";
import { buildScenario, REVIEW_CUSTOMER_URL, recalculateCommercialAuthority } from "./munstermanFixtures.mjs";

function takeoffBaseUrl(): string {
  try {
    const u = new URLSearchParams(window.location.search).get("takeoffOrigin");
    if (u) return u.replace(/\/$/, "");
  } catch {
    /* ignore */
  }
  // Prefer same-origin Vite proxy so review screenshots include iframe pixels.
  try {
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}/__takeoff`;
    }
  } catch {
    /* ignore */
  }
  return "http://127.0.0.1:5186";
}

function scenarioFromQuery(): string {
  try {
    return new URLSearchParams(window.location.search).get("scenario") || "approved";
  } catch {
    return "approved";
  }
}

function waterfallServerPrice(w: {
  panelWidthIn?: number;
  panelHeightIn?: number;
  legHeightIn?: number;
  quantity?: number;
  miterKey?: string;
  backsidePolish?: boolean;
}) {
  const width = Number(w.panelWidthIn) || 0;
  const height = Number(w.panelHeightIn ?? w.legHeightIn) || 0;
  const qty = Math.max(1, Number(w.quantity) || 1);
  const miterKey = String(w.miterKey || "2-3in");
  const polish = Boolean(w.backsidePolish);
  const miterRates: Record<string, number> = { "2-3in": 65, "4in": 70, "5in": 75, "6in": 80 };
  const measuredSf = Math.round(((width * height) / 144) * 100) / 100;
  const billedSf = Math.ceil(measuredSf);
  const material = billedSf * 45;
  const labor = 600 * qty;
  const polishAmt = polish ? 225 * qty : 0;
  const miterLf = Math.round((height / 12) * 100) / 100;
  const miter = Math.round(miterLf * (miterRates[miterKey] || 65) * 100) / 100;
  return Math.round((material + labor + polishAmt + miter) * 100) / 100;
}

export default function EstimateRecordReviewApp() {
  const initial = scenarioFromQuery();
  const [scenarioName, setScenarioName] = useState(initial);
  const [scenario, setScenario] = useState(() => buildScenario(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [commercialDirty, setCommercialDirty] = useState(false);
  const [takeoffReady, setTakeoffReady] = useState<Record<string, unknown> | null>(null);
  const [iframeEpoch, setIframeEpoch] = useState(0);
  const [store, setStore] = useState(() => ({
    customLineItems: scenario.commercial?.customLines || [],
    estimateWideAdjustment: scenario.commercial?.estimateAdjustment || {},
    published: Boolean(scenario.customerUrl)
  }));

  const takeoffSrc = useMemo(() => {
    return `${takeoffBaseUrl()}/?consolidated=1&${scenario.takeoffQuery}&_e=${iframeEpoch}`;
  }, [scenario.takeoffQuery, iframeEpoch]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const data = ev.data;
      if (!data || typeof data !== "object") return;
      if (data.source !== "consolidated-review") return;
      const expectedRev = Number(scenario.estimateRevision) || 1;
      if (data.type === "TAKEOFF_REVIEW_READY") {
        if (data.revisionNumber != null && Number(data.revisionNumber) !== expectedRev) return;
        setTakeoffReady(data);
        (window as any).__takeoffReviewReady = data;
        return;
      }
      if (data.type === "TAKEOFF_REVIEW_DRAFT_SAVED" || data.type === "TAKEOFF_WATERFALL_CHANGED") {
        const incoming = Array.isArray(data.waterfalls) ? data.waterfalls : [];
        if (!incoming.length) return;
        setScenario((prev) => {
          const prevWfs = prev.commercial?.waterfalls || [];
          const merged = incoming.map((wf: any) => {
            const existing = prevWfs.find((p: any) => String(p.id) === String(wf.id)) || {};
            const next = {
              ...existing,
              id: wf.id,
              roomId: wf.roomId,
              roomName: wf.roomName,
              pieceId: wf.pieceId,
              pieceLabel: wf.pieceLabel,
              side: wf.side,
              panelWidthIn: wf.panelWidthIn,
              panelHeightIn: wf.panelHeightIn,
              legHeightIn: wf.panelHeightIn,
              quantity: wf.quantity,
              includedInScope: wf.includedInScope !== false,
              miterKey: existing.miterKey || "2-3in",
              backsidePolish: existing.backsidePolish !== false,
              customerOptional: existing.customerOptional !== false,
              estimatorNote: existing.estimatorNote || ""
            };
            return { ...next, total: waterfallServerPrice(next) };
          });
          return {
            ...prev,
            commercial: {
              ...prev.commercial,
              waterfalls: merged,
              scopeDetection: {
                ...(prev.commercial?.scopeDetection || {}),
                islandDetected: true,
                waterfallGeometryPresent: true
              }
            }
          };
        });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [scenario.estimateRevision]);

  function switchScenario(name: string) {
    const next = buildScenario(name);
    setScenarioName(name);
    setScenario(next);
    setError(null);
    setCommercialDirty(false);
    setTakeoffReady(null);
    setIframeEpoch((n) => n + 1);
    setStore({
      customLineItems: next.commercial?.customLines || [],
      estimateWideAdjustment: next.commercial?.estimateAdjustment || {},
      published: Boolean(next.customerUrl)
    });
    const url = new URL(window.location.href);
    url.searchParams.set("scenario", name);
    window.history.replaceState({}, "", url.toString());
  }

  function saveCommercial(payload: {
    customLineItems: unknown[];
    estimateWideAdjustment: Record<string, unknown>;
    roomConfigurations?: Record<string, unknown>;
  }) {
    setBusy(true);
    setError(null);
    window.setTimeout(() => {
      const mappedLines = payload.customLineItems.map((l: any) => ({
        id: l.id,
        description: l.description,
        category: l.category,
        quantity: l.quantity,
        unitPriceExact: l.unitPrice,
        amountExact: (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0),
        customerVisible: l.customerVisible,
        internalOnly: l.commercialRole === "internal_only",
        percentageEligible: l.percentageEligible,
        commercialRole: l.commercialRole,
        roomId: l.roomId,
        reason: l.reason
      }));
      const authority = recalculateCommercialAuthority({
        customLines: mappedLines,
        percentage: Number(payload.estimateWideAdjustment?.percentage) || 0,
        active: payload.estimateWideAdjustment?.active !== false,
        vanityApplied: true
      });
      setStore((s) => ({
        ...s,
        customLineItems: payload.customLineItems,
        estimateWideAdjustment: payload.estimateWideAdjustment,
        roomConfigurations: payload.roomConfigurations
      }));
      setScenario((prev) => {
        const commercial = {
          ...prev.commercial,
          customLines: mappedLines,
          estimateAdjustment: {
            ...prev.commercial.estimateAdjustment,
            ...payload.estimateWideAdjustment,
            baseExactTotal: authority.baseExactTotal,
            eligibleBasisExact: authority.eligibleBasisExact,
            exactAdjustment: authority.commercialAdjustmentExact,
            nonPercentageCommercialExact: authority.nonPercentageCommercialExact,
            adjustedExactTotal: authority.adjustedExactTotal,
            customerDisplayTotal: authority.customerDisplayTotal,
            presentation: "distributed"
          },
          waterfalls:
            payload.roomConfigurations &&
            Object.values(payload.roomConfigurations).some(
              (cfg: any) => Array.isArray(cfg?.waterfalls) && cfg.waterfalls.length
            )
              ? prev.commercial.waterfalls?.length
                ? prev.commercial.waterfalls
                : [
                    {
                      id: "wf-left",
                      roomId: "kitchen",
                      roomName: "Kitchen",
                      pieceId: "island",
                      pieceLabel: "Kitchen Island",
                      side: "left",
                      panelWidthIn: 36,
                      panelHeightIn: 36,
                      quantity: 1,
                      miterKey: "2-3in",
                      backsidePolish: true,
                      customerOptional: true,
                      includedInScope: true
                    }
                  ]
              : prev.commercial.waterfalls
        };
        const aiSummary = {
          ...prev.aiSummary,
          pricing: {
            ...prev.aiSummary.pricing,
            baseExactTotal: authority.baseExactTotal,
            commercialAdjustmentExact: authority.commercialAdjustmentExact,
            adjustedExactTotal: authority.adjustedExactTotal,
            customerDisplayTotal: authority.customerDisplayTotal,
            customerConfiguredExactTotal: authority.customerConfiguredExactTotal,
            customerConfiguredDisplayTotal: authority.customerConfiguredDisplayTotal,
            exactTotal: authority.adjustedExactTotal,
            customerSafeGroups: authority.customerSafeGroups
          }
        };
        return { ...prev, commercial, aiSummary, authority };
      });
      setBusy(false);
      setCommercialDirty(false);
    }, 200);
  }

  function publish() {
    setBusy(true);
    window.setTimeout(() => {
      setBusy(false);
      setStore((s) => ({ ...s, published: true }));
      setScenario((prev) => ({
        ...prev,
        stage: "published",
        customerUrl: REVIEW_CUSTOMER_URL,
        publishedRevision: prev.estimateRevision,
        aiSummary: {
          ...prev.aiSummary,
          publication: {
            publishedAt: new Date().toISOString(),
            pricingValidThrough: "2026-08-28",
            customerActivityLabel: "Not viewed",
            customerActivityState: "waiting",
            lastCustomerActivityAt: null,
            customerConfiguredTotal: null,
            customerDifference: null,
            reviewRequested: false
          }
        }
      }));
    }, 250);
  }

  const commercialEditable =
    scenario.stage === "approved" ||
    scenario.stage === "revision_draft" ||
    scenario.stage === "draft" ||
    (scenario.stage === "published" && scenarioName === "r2");

  return (
    <div className="shell eq-shell" data-testid="estimate-record-review-harness" data-scenario={scenarioName}>
      <EliteosTopbar
        appName="Estimate Studio"
        organizationName="Elite Stone Fabrication"
        userName="Review Estimator"
        userEmail="review@eliteos.local"
        initials="RE"
        menuItems={[{ label: "Local review only", disabled: true }]}
        onSignOut={() => undefined}
      />
      <div className="eq-review-devbar" data-testid="eq-review-devbar" role="navigation">
        <span>Local review harness</span>
        {(
          [
            ["draft", "01 Draft"],
            ["approved", "02 Approved"],
            ["commercial", "03 Commercial"],
            ["published", "04 Published"],
            ["revision-history", "05 Revision history"],
            ["r2", "06 R2 waterfall"]
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={scenarioName === id ? "eq-btn-primary" : "eq-btn-secondary"}
            data-testid={`eq-review-scenario-${id}`}
            onClick={() => switchScenario(id)}
          >
            {label}
          </button>
        ))}
        <a className="eq-btn-ghost" href={REVIEW_CUSTOMER_URL} target="_blank" rel="noreferrer">
          07 Customer DE
        </a>
      </div>

      <main className="eq-workspace eq-ai-estimator-workspace" data-estimate-record="1">
        <EstimateRecordHeader
          title="Munsterman Plan"
          planFilename="Munsterman Plan.pdf"
          estimateRevision={scenario.estimateRevision}
          publishedRevision={scenario.publishedRevision}
          measurementStatus={
            scenario.measurementsApproved ? "Measurements approved" : "Measurements draft"
          }
          publicationStatus={scenario.customerUrl ? "Digital Estimate published" : "Not published"}
          customerActivityLabel={scenario.aiSummary?.publication?.customerActivityLabel || null}
          revisionBanner={scenario.revisionBanner || null}
          draftSaveStatus={commercialDirty ? "Commercial changes unsaved" : "Saved"}
          onViewPlan={() => undefined}
          onBackToQueue={() => undefined}
        />

        <section
          className="eq-record-section"
          data-testid="eq-ai-takeoff-surface"
          data-expanded="1"
        >
          <div className="eq-record-section__head">
            <h2 className="eq-ai-section-title">AI Takeoff Review</h2>
            <span className="eq-record-section__status">
              {scenario.takeoffMode === "readonly" ? "Read-only" : "Editable"}
            </span>
          </div>
          <div className="eq-record-section__body">
            <div className="eq-takeoff-frame-wrap">
              <iframe
                key={`${scenarioName}-${iframeEpoch}`}
                title="Consolidated Takeoff Review"
                className="eq-takeoff-iframe"
                data-testid="eq-takeoff-iframe"
                data-takeoff-ready={takeoffReady ? "1" : "0"}
                data-takeoff-revision={String(takeoffReady?.revisionNumber ?? "")}
                data-takeoff-mode={String(takeoffReady?.mode ?? "")}
                src={takeoffSrc}
              />
            </div>
            {(scenario.stage === "approved" || scenario.stage === "published") && (
              <div className="eq-action-row">
                <button
                  type="button"
                  className="eq-btn-secondary"
                  data-testid="eq-create-measurement-revision"
                  onClick={() => switchScenario("r2")}
                >
                  Create Measurement Revision
                </button>
              </div>
            )}
          </div>
        </section>

        <VerifiedEstimateSection
          waiting={!scenario.measurementsApproved && scenario.stage === "draft"}
          aiSummary={scenario.aiSummary}
          estimateRevision={scenario.estimateRevision}
          publishedRevision={scenario.publishedRevision}
          activeReview={{ eligible: scenario.publishEligible, blockers: [] }}
        />

        <CommercialConfigurationSection
          editable={Boolean(scenario.commercial?.editable ?? commercialEditable)}
          commercial={scenario.commercial}
          busy={busy}
          error={error}
          dirty={commercialDirty}
          measurementsApproved={scenario.measurementsApproved}
          roomOptions={[
            { id: "kitchen", name: "Kitchen" },
            { id: "bath", name: "Bathroom" }
          ]}
          onDirtyChange={setCommercialDirty}
          onSave={saveCommercial}
        />

        <DigitalEstimateSection
          stage={scenario.stage}
          measurementsApproved={scenario.measurementsApproved}
          estimateRevision={scenario.estimateRevision}
          publishedRevision={scenario.publishedRevision}
          customerUrl={scenario.customerUrl}
          aiSummary={scenario.aiSummary}
          publishBusy={busy}
          publishError={null}
          publishLabel="Publish Digital Estimate"
          eligible={scenario.publishEligible}
          estimateId="local-review-estimate"
          showPublishRevised={Boolean(scenario.showPublishRevised)}
          onPublish={publish}
          onCopy={() => {
            void navigator.clipboard?.writeText(scenario.customerUrl || REVIEW_CUSTOMER_URL);
            setCopied(true);
          }}
          onCreateRevision={() => switchScenario("r2")}
        />
        {copied ? (
          <p className="eq-muted" data-testid="eq-copy-confirm">
            Customer link copied.
          </p>
        ) : null}

        <EstimateRevisionHistory
          revisions={scenario.revisions}
          comparison={scenario.comparison}
          onViewSnapshot={() => undefined}
          onCompare={() => undefined}
        />

        <pre className="eq-review-store" data-testid="eq-review-store" hidden>
          {JSON.stringify({ store, takeoffReady })}
        </pre>
        <button
          type="button"
          hidden
          data-testid="eq-review-remount-takeoff"
          onClick={() => {
            setTakeoffReady(null);
            setIframeEpoch((n) => n + 1);
          }}
        >
          Remount Takeoff
        </button>
      </main>
    </div>
  );
}
