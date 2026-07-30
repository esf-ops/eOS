/**
 * Estimate Record section components for the persistent AI estimator page.
 * Display + form controls only — pricing stays server-authoritative.
 */
import React, { useState } from "react";
import {
  EstimatorWarnings,
  MeasurementRevisionComparison,
  PublicationActivitySummary,
  StartingPriceBreakdown,
  VerifiedMeasurementTotals,
  VerifiedRoomScope,
  type VerifiedRoom
} from "../AiEstimatorReadViews";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v: unknown): string {
  if (v == null || v === "") return "—";
  return `$${num(v).toFixed(2)}`;
}

export function EstimateRecordHeader(props: {
  title: string;
  planFilename: string;
  estimateRevision: number | null;
  publishedRevision: number | null;
  measurementStatus: string;
  publicationStatus: string;
  customerActivityLabel?: string | null;
  revisionBanner?: string | null;
  draftSaveStatus?: string | null;
  onViewPlan?: (() => void) | null;
  onBackToQueue?: (() => void) | null;
}) {
  return (
    <header
      className="eq-ai-compact-header eq-estimate-record-header"
      data-testid="eq-estimate-record-header"
      aria-label="Estimate record"
    >
      <div className="eq-cell-primary" data-testid="eq-ai-header-title">
        {props.title || props.planFilename || "Estimate"}
      </div>
      <div className="eq-cell-meta" data-testid="eq-ai-header-plan">
        Plan: {props.planFilename || "—"}
      </div>
      <div className="eq-estimate-record-status" data-testid="eq-estimate-record-status">
        <span data-testid="eq-record-revision">
          Revision R{props.estimateRevision ?? "—"}
        </span>
        <span data-testid="eq-record-measurement-status">{props.measurementStatus}</span>
        <span data-testid="eq-record-publication-status">{props.publicationStatus}</span>
        {props.publishedRevision != null ? (
          <span data-testid="eq-record-published-revision">
            Customer publication: R{props.publishedRevision}
          </span>
        ) : null}
        {props.customerActivityLabel ? (
          <span data-testid="eq-record-customer-activity">
            Customer status: {props.customerActivityLabel}
          </span>
        ) : null}
      </div>
      {props.revisionBanner ? (
        <div className="eq-ai-revision-banner" data-testid="eq-ai-revision-banner" role="status">
          {props.revisionBanner}
        </div>
      ) : null}
      {props.draftSaveStatus ? (
        <div className="eq-cell-meta" data-testid="eq-ai-draft-save-status" role="status">
          {props.draftSaveStatus}
        </div>
      ) : null}
      <div className="eq-action-row">
        {props.onViewPlan ? (
          <button type="button" className="eq-btn-secondary" onClick={props.onViewPlan}>
            View plan
          </button>
        ) : null}
        {props.onBackToQueue ? (
          <button type="button" className="eq-btn-ghost" onClick={props.onBackToQueue}>
            Back to Estimate Queue
          </button>
        ) : null}
      </div>
    </header>
  );
}

export function CollapsibleRecordSection(props: {
  testId: string;
  title: string;
  status?: string | null;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(props.defaultExpanded !== false);
  return (
    <section
      className="eq-record-section"
      data-testid={props.testId}
      data-expanded={expanded ? "1" : "0"}
    >
      <div className="eq-record-section__head">
        <h2 className="eq-ai-section-title">{props.title}</h2>
        {props.status ? (
          <span className="eq-record-section__status" data-testid={`${props.testId}-status`}>
            {props.status}
          </span>
        ) : null}
        <button
          type="button"
          className="eq-btn-ghost"
          data-testid={`${props.testId}-collapse`}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      {expanded ? <div className="eq-record-section__body">{props.children}</div> : null}
    </section>
  );
}

export function VerifiedEstimateSection(props: {
  waiting: boolean;
  draftMode?: boolean;
  aiSummary: any;
  estimateRevision: number | null;
  publishedRevision: number | null;
  activeReview: { eligible: boolean; blockers: Array<{ code?: string; message?: string }> } | null;
  calculationStatus?: string | null;
  lastCalculatedAt?: string | null;
}) {
  if (props.waiting) {
    return (
      <CollapsibleRecordSection
        testId="eq-verified-estimate-section"
        title="Live Estimate"
        status="Waiting for measurements"
        defaultExpanded
      >
        <p className="eq-muted" data-testid="eq-verified-waiting">
          Measurements will appear here as soon as Takeoff has scope.
        </p>
      </CollapsibleRecordSection>
    );
  }
  const s = props.aiSummary;
  const m = s?.measurements;
  const rooms = (s?.rooms || []) as VerifiedRoom[];
  const pricing = s?.pricing || {};
  const draft = Boolean(props.draftMode);
  const statusLabel = draft
    ? props.calculationStatus || "Draft estimate"
    : `Frozen R${props.estimateRevision ?? "—"}`;
  return (
    <CollapsibleRecordSection
      testId="eq-verified-estimate-section"
      title="Live Estimate"
      status={statusLabel}
      defaultExpanded
    >
      {draft ? (
        <p className="eq-footnote" data-testid="eq-live-estimate-draft-label">
          Draft estimate — totals update as you edit. Approval freezes this revision.
        </p>
      ) : (
        <p className="eq-footnote" data-testid="eq-live-estimate-approved-label">
          Approved Estimate — R{props.estimateRevision ?? "—"} is frozen. Editing starts the next
          revision automatically.
        </p>
      )}
      {props.lastCalculatedAt ? (
        <p className="eq-footnote" data-testid="eq-live-estimate-calculated-at">
          Last calculated {props.lastCalculatedAt}
        </p>
      ) : null}
      <VerifiedMeasurementTotals
        countertopSf={num(m?.countertopSf)}
        backsplashSf={num(m?.backsplashSf)}
        exposedEdgeLf={num(m?.exposedEdgeLf)}
        openingsByType={m?.openingsByType || {}}
        startingTotal={pricing.customerDisplayTotal ?? null}
        revision={props.estimateRevision}
      />
      <section
        className="eq-ai-authority-totals"
        data-testid="eq-verified-authority-totals"
        aria-label="Authoritative totals"
      >
        <h3 className="eq-ai-section-title">
          {draft ? "Draft estimate total" : "Authoritative totals"}
        </h3>
        <dl className="eq-summary-dl eq-summary-dl--grid">
          <div>
            <dt>Verified base estimate</dt>
            <dd data-testid="eq-verified-base-exact">{money(pricing.baseExactTotal)}</dd>
          </div>
          <div>
            <dt>Commercial adjustments</dt>
            <dd data-testid="eq-verified-commercial-adj">
              {money(pricing.commercialAdjustmentExact)}
            </dd>
          </div>
          <div>
            <dt>{draft ? "Draft exact total" : "Current estimator total"}</dt>
            <dd data-testid="eq-verified-adjusted-exact">{money(pricing.adjustedExactTotal)}</dd>
          </div>
          <div>
            <dt>Customer display total</dt>
            <dd data-testid="eq-verified-customer-display">
              {money(pricing.customerDisplayTotal)}
            </dd>
          </div>
        </dl>
      </section>
      <VerifiedRoomScope rooms={rooms} defaultExpanded />
      <StartingPriceBreakdown
        groups={pricing.customerSafeGroups || []}
        startingTotal={pricing.customerDisplayTotal ?? null}
      />
      <EstimatorWarnings
        warnings={pricing.warnings}
        unresolvedItems={pricing.unresolvedItems}
        blockers={
          props.activeReview && !props.activeReview.eligible
            ? props.activeReview.blockers
            : pricing.activeReviewBlockers
        }
      />
      {s?.comparison ? <MeasurementRevisionComparison comparison={s.comparison} /> : null}
    </CollapsibleRecordSection>
  );
}

export function DigitalEstimateSection(props: {
  stage: string;
  measurementsApproved: boolean;
  estimateRevision: number | null;
  publishedRevision: number | null;
  customerUrl: string | null;
  aiSummary: any;
  publishBusy: boolean;
  publishError: string | null;
  publishLabel: string;
  eligible: boolean;
  estimateId: string | null;
  showPublishRevised: boolean;
  onPublish: () => void;
  onCopy: () => void;
  onCreateRevision: () => void;
}) {
  const pub = props.aiSummary?.publication;
  const hasActivePublication = Boolean(props.customerUrl);
  const editingNewerDraft =
    hasActivePublication &&
    props.publishedRevision != null &&
    props.estimateRevision != null &&
    props.estimateRevision > props.publishedRevision;

  let status = "Not published";
  if (props.stage === "published" && props.customerUrl) status = "Published";
  else if (editingNewerDraft && props.measurementsApproved) {
    status = `R${props.publishedRevision} published · R${props.estimateRevision} ready`;
  } else if (editingNewerDraft) {
    status = `R${props.publishedRevision} published · R${props.estimateRevision} draft`;
  } else if (props.measurementsApproved) status = "Ready to publish";
  else if (props.stage === "publishing") status = "Publishing…";
  else if (hasActivePublication) status = "Published";

  return (
    <CollapsibleRecordSection
      testId="eq-digital-estimate-section"
      title="Digital Estimate"
      status={status}
      defaultExpanded
    >
      {editingNewerDraft ? (
        <div className="eq-de-dual-revision" data-testid="eq-de-r1-active-r2-draft">
          <p data-testid="eq-de-active-publication-banner">
            Current customer publication: R{props.publishedRevision} · Published
            {props.customerUrl ? " · customer link and activity remain available" : ""}.
          </p>
          <p data-testid="eq-de-new-revision-banner">
            New estimator revision: R{props.estimateRevision}{" "}
            {props.measurementsApproved ? "Approved" : "Draft"}
            {props.measurementsApproved
              ? " — eligible for revised publication when ready."
              : " — not yet eligible for revised publication."}
          </p>
          <p className="eq-footnote" data-testid="eq-de-r1-remains-active">
            R{props.publishedRevision} remains active while R{props.estimateRevision} is being
            edited.
          </p>
        </div>
      ) : null}

      {!props.measurementsApproved && !hasActivePublication ? (
        <p className="eq-muted" data-testid="eq-de-waiting">
          Publish becomes available after measurements are approved.
        </p>
      ) : null}

      {!props.measurementsApproved && hasActivePublication && !editingNewerDraft ? (
        <p className="eq-muted" data-testid="eq-de-waiting">
          Publish becomes available after measurements are approved.
        </p>
      ) : null}

      {props.measurementsApproved && !props.customerUrl ? (
        <div data-testid="eq-de-ready-to-publish">
          <p>
            Approved revision: R{props.estimateRevision ?? "—"} · Starting total:{" "}
            {money(props.aiSummary?.pricing?.customerDisplayTotal)}
          </p>
          {props.publishError ? (
            <div className="eq-state eq-state--error" role="alert" data-testid="eq-ai-publish-error">
              {props.publishError}
            </div>
          ) : null}
          <div className="eq-action-row eq-ai-stage-actions">
            <button
              type="button"
              className="eq-btn-primary"
              disabled={props.publishBusy || !props.estimateId || !props.eligible}
              data-testid="eq-publish-digital-estimate"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                props.onPublish();
              }}
            >
              {props.publishBusy ? "Publishing…" : props.publishLabel}
            </button>
            <button
              type="button"
              className="eq-btn-ghost"
              data-testid="eq-edit-estimate"
              onClick={props.onCreateRevision}
            >
              Edit Estimate
            </button>
          </div>
        </div>
      ) : null}

      {props.customerUrl ? (
        <div data-testid="eq-ai-published-estimate">
          <PublicationActivitySummary
            publishedRevision={props.publishedRevision}
            publishedAt={pub?.publishedAt ?? null}
            pricingValidThrough={pub?.pricingValidThrough ?? null}
            startingTotal={
              editingNewerDraft
                ? props.aiSummary?.publication?.publishedDisplayTotal ??
                  props.aiSummary?.pricing?.customerDisplayTotal ??
                  null
                : props.aiSummary?.pricing?.customerDisplayTotal ?? null
            }
            customerActivityLabel={pub?.customerActivityLabel ?? null}
            customerActivityState={pub?.customerActivityState ?? null}
            lastCustomerActivityAt={pub?.lastCustomerActivityAt ?? null}
            customerConfiguredTotal={pub?.customerConfiguredTotal ?? null}
            customerDifference={pub?.customerDifference ?? null}
            reviewRequested={Boolean(pub?.reviewRequested)}
            currentPublishedRevision={props.publishedRevision}
            hasNewerApprovedRevision={Boolean(props.showPublishRevised)}
            newerApprovedRevision={props.showPublishRevised ? props.estimateRevision : null}
          />
          <p className="eq-muted" data-testid="eq-ai-customer-url">
            {props.customerUrl}
          </p>
          <div className="eq-action-row eq-ai-stage-actions">
            <a
              className="eq-btn-primary"
              href={props.customerUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="eq-open-customer-preview"
            >
              Open Customer Estimate
            </a>
            <button
              type="button"
              className="eq-btn-secondary"
              data-testid="eq-copy-customer-link"
              onClick={props.onCopy}
            >
              Copy Customer Link
            </button>
            <button
              type="button"
              className="eq-btn-ghost"
              data-testid="eq-edit-estimate"
              onClick={props.onCreateRevision}
            >
              Edit Estimate
            </button>
            {props.showPublishRevised ? (
              <button
                type="button"
                className="eq-btn-primary"
                data-testid="eq-publish-revised-estimate"
                disabled={props.publishBusy}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  props.onPublish();
                }}
              >
                {props.publishBusy ? "Publishing…" : "Publish Revised Estimate"}
              </button>
            ) : editingNewerDraft && !props.measurementsApproved ? (
              <p className="eq-muted" data-testid="eq-de-r2-awaits-approval">
                R{props.estimateRevision} publication waits for measurement approval.
              </p>
            ) : null}
          </div>
          {props.publishError ? (
            <div
              className="eq-state eq-state--error"
              role="alert"
              data-testid="eq-ai-publish-revised-error"
            >
              {props.publishError}
            </div>
          ) : null}
        </div>
      ) : null}
    </CollapsibleRecordSection>
  );
}
