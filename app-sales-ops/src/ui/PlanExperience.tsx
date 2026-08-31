import React from "react";

export type PeriodTarget = {
  period: string;
  label: string;
  year: string;
  installedTarget: number;
  rollingThreeMonthTarget?: number;
  qualifiedPipelineTarget?: number;
};

export type MetricTarget = {
  metricKey: string;
  label: string;
  unit: string;
  cadence: string;
  targetValue: number;
  warningThreshold?: number;
};

export type PlanBundle = {
  plan: Record<string, unknown>;
  periodTargets: PeriodTarget[];
  metricTargets: MetricTarget[];
  insights?: Record<string, unknown>;
  planCopy?: Record<string, string>;
  events?: Array<Record<string, unknown>>;
  bookIntelligence?: BookIntelligence | null;
  banner?: string;
};

export type BookAccount = {
  salesOpsAccountId: string;
  accountName: string;
  market?: string | null;
  branch?: string | null;
  suggestedCategory: string;
  appliedCategory: string;
  overrideCategory?: string | null;
  categoryLabel: string;
  reasonCode: string;
  reasonCopy: string;
  trailingCompletedSf: number | null;
  productionStatus: string;
  trend: string;
  lastContact?: string | null;
  nextContact?: string | null;
  nextStrategicMilestone?: string | null;
  selected?: boolean;
};

export type BookIntelligence = {
  accounts: BookAccount[];
  counts?: Record<string, number>;
  identityGapCount?: number;
  canOpenIdentityReview?: boolean;
  compensation?: CompensationContext | null;
  financialEnrichmentStatus?: string;
  thresholds?: { status?: string };
};

export type CompensationContext = {
  configured?: boolean;
  finallyApproved?: boolean;
  basisLabel?: string;
  selectedProposalId?: string | null;
  proposals?: Array<{
    id: string;
    label: string;
    basis?: string;
    ratePerSf?: number | null;
    effectiveDate?: string | null;
    finallyApproved?: boolean;
  }>;
  eligibleAccountCount?: number;
  showEstimatedCommission?: boolean;
};

const fmt = new Intl.NumberFormat("en-US");
const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

const FOCUS_ORDER = [
  { key: "ANCHOR", title: "Anchor accounts", lead: "Accounts protecting the producing base." },
  { key: "GROWTH_OPPORTUNITY", title: "Growth opportunities", lead: "Accounts with credible upside." },
  { key: "NEEDS_ATTENTION", title: "Needs attention", lead: "Accounts requiring action." },
  { key: "REACTIVATION", title: "Reactivation opportunities", lead: "Previously productive, currently dormant." },
  { key: "NEW_UNPROVEN", title: "New / unproven", lead: "Recently assigned relationships." },
  { key: "IDENTITY_DATA_GAP", title: "Identity / data gap", lead: "Production cannot be shown until identity is approved." }
];

export function asText(v: unknown) {
  return v == null ? "" : String(v);
}

export function periodFromDate(value: string) {
  const s = String(value || "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
  return "";
}

export function monthLongLabel(period: string) {
  const p = periodFromDate(period);
  if (!p) return period;
  return `${LONG_MONTHS[Number(p.slice(5, 7)) - 1] || p.slice(5, 7)} ${p.slice(0, 4)}`;
}

export function productionDisplay(account: BookAccount) {
  if (account.productionStatus === "IDENTITY_APPROVAL_REQUIRED" || account.suggestedCategory === "IDENTITY_DATA_GAP") {
    return "Production unavailable — identity review required";
  }
  if (account.trailingCompletedSf == null || account.productionStatus === "NO_PRODUCTION_EVIDENCE") {
    return "No production evidence";
  }
  return `${fmt.format(account.trailingCompletedSf)} SF trailing`;
}

function GoalPathChart({
  rows,
  milestones,
  actuals
}: {
  rows: PeriodTarget[];
  milestones: Set<string>;
  actuals?: Map<string, number | null>;
}) {
  if (!rows.length) return null;
  const w = 920;
  const h = 220;
  const pad = { l: 48, r: 18, t: 18, b: 36 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const goals = rows.map((r) => Number(r.installedTarget) || 0);
  const actualVals = rows.map((r) => {
    const n = actuals?.get(r.period);
    return n == null ? null : Number(n);
  });
  const max = Math.max(1, ...goals, ...actualVals.filter((n): n is number => n != null));
  const x = (i: number) => pad.l + (rows.length === 1 ? innerW / 2 : (i / (rows.length - 1)) * innerW);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const goalPath = rows.map((r, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(goals[i])}`).join(" ");
  const actualPts = rows
    .map((r, i) => (actualVals[i] == null ? null : `${x(i)},${y(actualVals[i] as number)}`))
    .filter(Boolean);
  return (
    <svg className="goal-path-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Monthly Goal SF path">
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={h - pad.b} stroke="#d8d2c9" />
      <line x1={pad.l} y1={h - pad.b} x2={w - pad.r} y2={h - pad.b} stroke="#d8d2c9" />
      <path d={goalPath} fill="none" stroke="#ba2f29" strokeWidth="3" />
      {actualPts.length > 1 && (
        <polyline points={actualPts.join(" ")} fill="none" stroke="#1d4e3e" strokeWidth="2" strokeDasharray="6 4" />
      )}
      {rows.map((row, i) => {
        const milestone = milestones.has(row.period);
        return (
          <g key={row.period}>
            <circle
              cx={x(i)}
              cy={y(goals[i])}
              r={milestone ? 6 : 3.5}
              fill={milestone ? "#ba2f29" : "#fff"}
              stroke="#ba2f29"
              strokeWidth="2"
            />
            {(i === 0 || i === rows.length - 1 || milestone) && (
              <text x={x(i)} y={h - 12} textAnchor="middle" fill="#8a847e" fontSize="11">
                {row.label} {row.year.slice(2)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export default function PlanExperience({
  bundle,
  book,
  salespersonName,
  performance,
  compensation,
  showCompensation = false,
  banner,
  onIdentityReview
}: {
  bundle: PlanBundle;
  book?: BookIntelligence | null;
  salespersonName: string;
  performance?: {
    currentMonth?: { actualSf?: number | null; goalSf?: number | null; attainmentPct?: number | null; actualStatus?: string };
    months?: Array<{ period: string; actualSf?: number | null }>;
  } | null;
  compensation?: CompensationContext | null;
  showCompensation?: boolean;
  banner?: string;
  onIdentityReview?: (() => void) | null;
}) {
  const plan = bundle.plan || {};
  const copy = bundle.planCopy || {};
  const rows = bundle.periodTargets || [];
  const intel = book || bundle.bookIntelligence || null;
  const comp = compensation || intel?.compensation || null;
  const selected = (intel?.accounts || []).filter((a) => a.selected);
  const focus = selected.length ? selected : intel?.accounts || [];
  const northStarDate = monthLongLabel(asText(plan.northStarTargetDate || plan.endDate));
  const northStar = Number(plan.northStarTarget || 0);
  const current = performance?.currentMonth;
  const actuals = new Map((performance?.months || []).map((m) => [m.period, m.actualSf ?? null]));
  const milestoneSet = new Set(
    rows.filter((r) => [1, 3, 9, 12].includes(Number(r.period.slice(5, 7))) && Number(r.installedTarget) > 0).map((r) => r.period)
  );
  const rhythms = (plan.rhythms || {}) as Record<string, string>;
  const metrics = bundle.metricTargets || [];
  const visibleComp = showCompensation && Boolean(plan.commissionEnabled) && Boolean(comp?.finallyApproved);

  return (
    <article className="plan-experience">
      {banner && <div className="preview-banner">{banner}</div>}
      <header className="plan-experience-hero">
        <p className="kicker">{asText(plan.territoryName) || "Sales territory"}</p>
        <h2>{salespersonName}</h2>
        <p>{asText(copy.introduction) || asText(plan.subtitle)}</p>
      </header>

      <section className="plan-north-star">
        <p className="kicker">Your north star</p>
        <strong>{fmt.format(northStar)} installed SF / month</strong>
        <span>by {northStarDate || "the plan horizon"}</span>
      </section>

      <div className="plan-experience-split">
        <section>
          <p className="kicker">Current position</p>
          <div className="plan-position-grid">
            <div>
              <span>Actual SF</span>
              <strong>
                {current?.actualSf == null ? "Unavailable" : fmt.format(Number(current.actualSf))}
              </strong>
            </div>
            <div>
              <span>Goal SF</span>
              <strong>{current?.goalSf == null ? "—" : fmt.format(Number(current.goalSf))}</strong>
            </div>
            <div>
              <span>Attainment</span>
              <strong>{current?.attainmentPct == null ? "—" : `${Math.round(Number(current.attainmentPct))}%`}</strong>
            </div>
            <div>
              <span>Trend</span>
              <strong>{asText(current?.actualStatus) === "AVAILABLE" ? "Tracked" : "Awaiting evidence"}</strong>
            </div>
          </div>
        </section>
        <section>
          <p className="kicker">How success is measured</p>
          <h3>Completed Installation SF</h3>
          <p>
            {asText(copy.successDefinition) ||
              "Credited square feet from governed Moraware completed-install evidence after Account Directory identity is approved. Unavailable production is not treated as zero."}
          </p>
        </section>
      </div>

      <section>
        <p className="kicker">Your path</p>
        <GoalPathChart rows={rows} milestones={milestoneSet} actuals={actuals} />
        <div className="month-goal-table plan-path-table" role="table" aria-label="Monthly Goal SF">
          <div className="month-goal-head month-goal-head-two" role="row">
            <span>Month</span>
            <span>Goal SF</span>
          </div>
          {rows.map((row) => (
            <div key={row.period} className={`month-goal-row month-goal-row-two${milestoneSet.has(row.period) ? " milestone" : ""}`} role="row">
              <span>
                {monthLongLabel(row.period)}
                {milestoneSet.has(row.period) ? <small>Milestone</small> : null}
              </span>
              <span>{fmt.format(Number(row.installedTarget) || 0)}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <p className="kicker">Focus accounts</p>
        {FOCUS_ORDER.map((group) => {
          const items = focus.filter((a) => a.appliedCategory === group.key);
          if (!items.length) return null;
          return (
            <div className="plan-focus-group" key={group.key}>
              <h3>{group.title}</h3>
              <p>{group.lead}</p>
              <ul>
                {items.map((account) => (
                  <li key={account.salesOpsAccountId}>
                    <strong>{account.accountName}</strong>
                    <span>{productionDisplay(account)}</span>
                    <small>{account.reasonCopy}</small>
                    {account.suggestedCategory === "IDENTITY_DATA_GAP" && onIdentityReview ? (
                      <button type="button" className="text-link" onClick={onIdentityReview}>
                        Open Identity Review
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {!focus.length && <p className="workspace-muted">No book accounts are selected for this plan yet.</p>}
      </section>

      <section>
        <p className="kicker">Activity expectations</p>
        <div className="plan-kpi-cards">
          {metrics.map((m) => (
            <div className="plan-kpi-card" key={m.metricKey}>
              <strong>{m.targetValue}</strong>
              <span>
                {m.label} per {m.cadence === "weekly" ? "week" : "month"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="plan-experience-split">
        <div>
          <p className="kicker">Management rhythm</p>
          <p>
            <strong>Weekly.</strong> {rhythms.weekly || "Account and pipeline check-in."}
          </p>
          <p>
            <strong>Monthly.</strong> {rhythms.monthly || "Goal vs Actual SF and account contribution."}
          </p>
          <p>
            <strong>Quarterly.</strong> {rhythms.quarterly || "Territory strategy and plan revision discussion."}
          </p>
        </div>
        <div>
          <p className="kicker">Expectations</p>
          <p>{asText(copy.expectations)}</p>
          {asText(copy.coaching) ? (
            <>
              <p className="kicker">Coaching context</p>
              <p>{asText(copy.coaching)}</p>
            </>
          ) : null}
        </div>
      </section>

      {visibleComp && (
        <section>
          <p className="kicker">Compensation</p>
          <p>
            Basis: {comp?.basisLabel || "Completed installation SF"}. Eligible accounts: {comp?.eligibleAccountCount ?? 0}{" "}
            approved commissionable accounts.
            {comp?.proposals?.find((p) => p.finallyApproved && p.ratePerSf != null)
              ? ` Rate: ${comp.proposals.find((p) => p.finallyApproved)?.ratePerSf} per SF.`
              : ""}
          </p>
        </section>
      )}
    </article>
  );
}
