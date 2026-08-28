import React, { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost, ApiError } from "../lib/api";

type Access = {
  isOrgAdmin?: boolean;
  canPublishPlans?: boolean;
};

type PlanRow = {
  id: string;
  userId: string;
  planName?: string;
  versionNumber?: number;
  status?: string;
  effectiveStartDate?: string;
  effectiveEndDate?: string;
  updatedAt?: string;
  approvedBy?: string | null;
  isPrototype?: boolean;
  territoryName?: string | null;
  managerUserId?: string | null;
};

type PeriodTarget = {
  period: string;
  label: string;
  year: string;
  installedTarget: number;
  rollingThreeMonthTarget: number;
  qualifiedPipelineTarget: number;
};

type MetricTarget = {
  metricKey: string;
  label: string;
  unit: string;
  cadence: string;
  targetValue: number;
  warningThreshold: number;
  sourceAuthority: string;
  displayOrder?: number;
};

type PlanBundle = {
  plan: Record<string, unknown>;
  periodTargets: PeriodTarget[];
  metricTargets: MetricTarget[];
  insights?: Record<string, unknown>;
  planCopy?: Record<string, string>;
  events?: Array<Record<string, unknown>>;
  acknowledgement?: { acknowledgedAt?: string } | null;
};

const fmt = new Intl.NumberFormat("en-US");

function asText(v: unknown) {
  return v == null ? "" : String(v);
}

function periodFromDate(value: string) {
  const s = String(value || "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 7);
  return "";
}

function addMonths(period: string, delta: number) {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7)) - 1 + delta;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function enumerateMonths(start: string, end: string) {
  const a = periodFromDate(start);
  const b = periodFromDate(end);
  if (!a || !b || a > b) return [];
  const out: string[] = [];
  let cur = a;
  while (cur <= b && out.length < 240) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function toPeriodRow(period: string, installedTarget = 0, extras: Partial<PeriodTarget> = {}): PeriodTarget {
  return {
    period,
    label: extras.label || MONTH_LABELS[Number(period.slice(5, 7)) - 1] || period,
    year: extras.year || period.slice(0, 4),
    installedTarget: Number(installedTarget || 0),
    rollingThreeMonthTarget: Number(extras.rollingThreeMonthTarget || 0),
    qualifiedPipelineTarget: Number(extras.qualifiedPipelineTarget || 0)
  };
}

function mergeMonths(existing: PeriodTarget[], start: string, end: string) {
  const byPeriod = new Map(existing.filter((r) => r.period).map((r) => [r.period, r]));
  return enumerateMonths(start, end).map((period) => byPeriod.get(period) || toPeriodRow(period, 0));
}

function SalesPlanPreview({ bundle }: { bundle: PlanBundle }) {
  const plan = bundle.plan || {};
  const copy = bundle.planCopy || {};
  return (
    <div className="plan-preview-body">
      <p className="kicker">{asText(plan.territoryName) || "Sales territory"}</p>
      <h2>{asText(plan.headline) || asText(plan.planName)}</h2>
      <p>{asText(copy.introduction) || asText(plan.subtitle)}</p>
      <div className="plan-preview-stats">
        <div>
          <span>North star</span>
          <strong>{fmt.format(Number(plan.northStarTarget || 0))}</strong>
          <small>{asText(plan.northStarMetric)}</small>
        </div>
        <div>
          <span>Version</span>
          <strong>v{asText(plan.versionNumber || 1)}</strong>
          <small>{asText(plan.status)}</small>
        </div>
      </div>
      {(bundle.metricTargets || []).slice(0, 6).map((m) => (
        <div className="plan-preview-metric" key={m.metricKey}>
          <strong>{m.targetValue}</strong>
          <span>
            {m.label} · {m.cadence}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function PlanAdmin({
  token,
  access,
  onChanged
}: {
  token: string;
  access: Access;
  onChanged?: () => void;
}) {
  const canPublish = Boolean(access.canPublishPlans);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [templates, setTemplates] = useState<Array<Record<string, unknown>>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<PlanBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PlanBundle & { banner?: string } | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterManager, setFilterManager] = useState("");
  const [createUserId, setCreateUserId] = useState("");
  const [createSource, setCreateSource] = useState<"blank" | "prototype" | string>("blank");
  const [people, setPeople] = useState<Array<{ userId: string; salespersonLabel?: string | null }>>([]);

  const [form, setForm] = useState({
    planName: "",
    territoryName: "",
    managerUserId: "",
    startDate: "",
    endDate: "",
    northStarMetric: "",
    northStarTarget: "",
    northStarTargetDate: "",
    stretchTarget: "",
    headline: "",
    subtitle: "",
    commissionEnabled: false,
    commissionRules: "",
    introduction: "",
    expectations: "",
    successDefinition: "",
    coaching: "",
    strategicAccounts: "",
    newAccounts: "",
    growthReactivation: "",
    weekly: "",
    monthly: "",
    quarterly: ""
  });
  const [periodRows, setPeriodRows] = useState<PeriodTarget[]>([]);
  const [metricText, setMetricText] = useState("");
  const [rampStart, setRampStart] = useState("");
  const [rampEnd, setRampEnd] = useState("");
  const [rampStartSf, setRampStartSf] = useState("");
  const [rampEndSf, setRampEndSf] = useState("");
  const [milestoneText, setMilestoneText] = useState("");

  const loadList = useCallback(async () => {
    const qs = new URLSearchParams();
    if (filterStatus) qs.set("status", filterStatus);
    if (filterUser) qs.set("userId", filterUser);
    if (filterYear) qs.set("year", filterYear);
    if (filterManager) qs.set("manager", filterManager);
    const data = (await apiGet(`/api/sales-ops/admin/plans${qs.toString() ? `?${qs}` : ""}`, token)) as { plans: PlanRow[] };
    setPlans(data.plans || []);
    const tpl = (await apiGet("/api/sales-ops/admin/templates", token)) as { templates: Array<Record<string, unknown>> };
    setTemplates(tpl.templates || []);
    try {
      const peopleRes = (await apiGet("/api/sales-ops/admin/people", token)) as {
        people: Array<{ userId: string; salespersonLabel?: string | null }>;
      };
      setPeople(peopleRes.people || []);
    } catch {
      setPeople([]);
    }
  }, [token, filterStatus, filterUser, filterYear, filterManager]);

  const loadPlan = useCallback(
    async (planId: string) => {
      const data = (await apiGet(`/api/sales-ops/admin/plans/${planId}`, token)) as PlanBundle;
      setBundle(data);
      const plan = data.plan || {};
      const copy = (data.planCopy || {}) as Record<string, string>;
      const expectations = (plan.accountExpectations || {}) as Record<string, string>;
      const rhythms = (plan.rhythms || {}) as Record<string, string>;
      setForm({
        planName: asText(plan.planName),
        territoryName: asText(plan.territoryName),
        managerUserId: asText(plan.managerUserId),
        startDate: asText(plan.startDate).slice(0, 10),
        endDate: asText(plan.endDate).slice(0, 10),
        northStarMetric: asText(plan.northStarMetric),
        northStarTarget: asText(plan.northStarTarget),
        northStarTargetDate: asText(plan.northStarTargetDate).slice(0, 10),
        stretchTarget: asText(plan.stretchTarget),
        headline: asText(plan.headline),
        subtitle: asText(plan.subtitle),
        commissionEnabled: Boolean(plan.commissionEnabled),
        commissionRules: JSON.stringify(plan.commissionRules || {}, null, 2),
        introduction: copy.introduction || "",
        expectations: copy.expectations || "",
        successDefinition: copy.successDefinition || "",
        coaching: copy.coaching || "",
        strategicAccounts: expectations.strategicAccounts || "",
        newAccounts: expectations.newAccounts || "",
        growthReactivation: expectations.growthReactivation || "",
        weekly: rhythms.weekly || "",
        monthly: rhythms.monthly || "",
        quarterly: rhythms.quarterly || ""
      });
      setPeriodRows(mergeMonths(data.periodTargets || [], asText(plan.startDate), asText(plan.endDate)));
      const periods = data.periodTargets || [];
      setRampStart(periods[0]?.period || asText(plan.startDate).slice(0, 7));
      setRampEnd(periods[periods.length - 1]?.period || asText(plan.endDate).slice(0, 7));
      setMetricText(JSON.stringify(data.metricTargets || [], null, 2));
    },
    [token]
  );

  useEffect(() => {
    void loadList().catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) return;
    void loadPlan(selectedId).catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, [selectedId, loadPlan]);

  const status = asText(bundle?.plan?.status);
  const editable = status === "draft";
  const prototype = Boolean(bundle?.plan?.isPrototype);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (selectedId) await loadPlan(selectedId);
      await loadList();
      onChanged?.();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function createPlan(e: FormEvent) {
    e.preventDefault();
    if (!createUserId.trim()) return;
    await run(async () => {
      const payload: Record<string, unknown> = { userId: createUserId.trim() };
      if (createSource === "prototype") payload.usePrototype = true;
      else if (createSource !== "blank") payload.templateId = createSource;
      const created = (await apiPost("/api/sales-ops/admin/plans", token, payload)) as PlanBundle;
      setSelectedId(asText(created.plan?.id));
    });
  }

  async function saveDraft(e: FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    let periodTargets: PeriodTarget[] = periodRows;
    let metricTargets: MetricTarget[] = [];
    try {
      metricTargets = JSON.parse(metricText || "[]");
    } catch {
      setError("KPI targets must be valid JSON.");
      return;
    }
    let commissionRules = {};
    try {
      commissionRules = form.commissionRules ? JSON.parse(form.commissionRules) : {};
    } catch {
      setError("Commission rules must be valid JSON.");
      return;
    }
    await run(async () => {
      await apiPatch(`/api/sales-ops/admin/plans/${selectedId}`, token, {
        planName: form.planName,
        territoryName: form.territoryName || null,
        managerUserId: form.managerUserId || null,
        startDate: form.startDate,
        endDate: form.endDate,
        effectiveStartDate: form.startDate,
        effectiveEndDate: form.endDate,
        northStarMetric: form.northStarMetric,
        northStarTarget: Number(form.northStarTarget || 0),
        northStarTargetDate: form.northStarTargetDate || null,
        stretchTarget: form.stretchTarget === "" ? null : Number(form.stretchTarget),
        headline: form.headline,
        subtitle: form.subtitle,
        commissionEnabled: form.commissionEnabled,
        commissionRules,
        accountExpectations: {
          strategicAccounts: form.strategicAccounts,
          newAccounts: form.newAccounts,
          growthReactivation: form.growthReactivation
        },
        rhythms: { weekly: form.weekly, monthly: form.monthly, quarterly: form.quarterly },
        periodTargets,
        metricTargets,
        planCopy: {
          introduction: form.introduction,
          expectations: form.expectations,
          successDefinition: form.successDefinition,
          coaching: form.coaching
        }
      });
    });
  }

  const years = useMemo(() => {
    const set = new Set(plans.map((p) => String(p.effectiveStartDate || "").slice(0, 4)).filter(Boolean));
    return [...set].sort();
  }, [plans]);

  return (
    <div className="plan-admin">
      <div className="section-heading">
        <div>
          <p className="kicker">Plan Admin</p>
          <h2>Draft, review, and publish sales plans.</h2>
        </div>
        <p>Published versions are immutable. Material changes require Create Revision. Managers can author drafts for assigned reports; only admin/executive/super_admin can approve or publish.</p>
      </div>
      {error && <div className="field-error">{error}</div>}

      <form className="admin-panel" onSubmit={(e) => void createPlan(e)}>
        <p className="kicker">Create plan</p>
        <label>
          Salesperson
          {people.length ? (
            <select value={createUserId} onChange={(e) => setCreateUserId(e.target.value)}>
              <option value="">Select a mapped salesperson</option>
              {people.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.salespersonLabel || p.userId}
                </option>
              ))}
            </select>
          ) : (
            <input value={createUserId} onChange={(e) => setCreateUserId(e.target.value)} placeholder="Salesperson user UUID" />
          )}
        </label>
        <label>
          Starting point
          <select value={createSource} onChange={(e) => setCreateSource(e.target.value)}>
            <option value="blank">Blank draft</option>
            <option value="prototype">Prototype Cedar Valley blueprint (reference)</option>
            {templates
              .filter((t) => t.templateKey !== "prototype_cedar_valley_sales_plan_2026_2028")
              .map((t) => (
                <option key={asText(t.id)} value={asText(t.id)}>
                  {asText(t.templateName)}
                </option>
              ))}
          </select>
        </label>
        <button className="primary-button" type="submit" disabled={busy}>
          Create draft
        </button>
      </form>

      <div className="plan-admin-filters">
        <label>
          Salesperson
          <input value={filterUser} onChange={(e) => setFilterUser(e.target.value)} placeholder="User UUID" />
        </label>
        <label>
          Status
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All</option>
            {["draft", "in_review", "approved", "active", "superseded", "archived"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Year
          <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
            <option value="">All</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          Manager
          <input value={filterManager} onChange={(e) => setFilterManager(e.target.value)} placeholder="Manager UUID" />
        </label>
      </div>

      <div className="plan-admin-layout">
        <div className="plan-admin-list">
          {plans.map((p) => (
            <button
              type="button"
              key={p.id}
              className={selectedId === p.id ? "active" : ""}
              onClick={() => setSelectedId(p.id)}
            >
              <strong>{p.planName || "Untitled"}</strong>
              <span>
                v{p.versionNumber || 1} · {p.status}
                {p.isPrototype ? " · Prototype" : ""}
              </span>
              <small>
                {p.effectiveStartDate || "—"} → {p.effectiveEndDate || "open"} · {String(p.updatedAt || "").slice(0, 10)}
              </small>
            </button>
          ))}
          {plans.length === 0 && <p>No plans match the current filters.</p>}
        </div>

        {bundle && (
          <form className="plan-editor" onSubmit={(e) => void saveDraft(e)}>
            <div className="plan-editor-status">
              <span className={`status-chip status-${status}`}>{status || "unknown"}</span>
              {prototype && <span className="status-chip prototype">Draft / Prototype</span>}
              <span>v{asText(bundle.plan.versionNumber)}</span>
            </div>

            <section>
              <p className="kicker">1. Plan identity</p>
              <div className="field-grid two">
                <label>
                  Plan name
                  <input value={form.planName} disabled={!editable} onChange={(e) => setForm({ ...form, planName: e.target.value })} />
                </label>
                <label>
                  Territory
                  <input value={form.territoryName} disabled={!editable} onChange={(e) => setForm({ ...form, territoryName: e.target.value })} />
                </label>
                <label>
                  Manager user id
                  <input value={form.managerUserId} disabled={!editable} onChange={(e) => setForm({ ...form, managerUserId: e.target.value })} />
                </label>
                <label>
                  Salesperson
                  <input value={asText(bundle.plan.userId)} disabled />
                </label>
                <label>
                  Start
                  <input
                    type="date"
                    value={form.startDate}
                    disabled={!editable}
                    onChange={(e) => {
                      const startDate = e.target.value;
                      setForm({ ...form, startDate });
                      setPeriodRows((rows) => mergeMonths(rows, startDate, form.endDate));
                    }}
                  />
                </label>
                <label>
                  End
                  <input
                    type="date"
                    value={form.endDate}
                    disabled={!editable}
                    onChange={(e) => {
                      const endDate = e.target.value;
                      setForm({ ...form, endDate });
                      setPeriodRows((rows) => mergeMonths(rows, form.startDate, endDate));
                    }}
                  />
                </label>
              </div>
            </section>

            <section>
              <p className="kicker">2. North star</p>
              <div className="field-grid two">
                <label>
                  Metric
                  <input value={form.northStarMetric} disabled={!editable} onChange={(e) => setForm({ ...form, northStarMetric: e.target.value })} />
                </label>
                <label>
                  Target
                  <input value={form.northStarTarget} disabled={!editable} onChange={(e) => setForm({ ...form, northStarTarget: e.target.value })} />
                </label>
                <label>
                  Target date
                  <input type="date" value={form.northStarTargetDate} disabled={!editable} onChange={(e) => setForm({ ...form, northStarTargetDate: e.target.value })} />
                </label>
                <label>
                  Stretch
                  <input value={form.stretchTarget} disabled={!editable} onChange={(e) => setForm({ ...form, stretchTarget: e.target.value })} />
                </label>
              </div>
            </section>

            <section>
              <p className="kicker">3. Monthly goals</p>
              <p className="workspace-muted">Each calendar month is stored as its own target. Ramp generation writes those month values; it is not the runtime formula.</p>
              {editable && (
                <div className="field-grid four ramp-controls">
                  <label>
                    Ramp start month
                    <input type="month" value={rampStart} onChange={(e) => setRampStart(e.target.value)} />
                  </label>
                  <label>
                    Start SF
                    <input value={rampStartSf} onChange={(e) => setRampStartSf(e.target.value)} />
                  </label>
                  <label>
                    Ramp end month
                    <input type="month" value={rampEnd} onChange={(e) => setRampEnd(e.target.value)} />
                  </label>
                  <label>
                    End SF
                    <input value={rampEndSf} onChange={(e) => setRampEndSf(e.target.value)} />
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        apiPost(`/api/sales-ops/admin/plans/${selectedId}/generate-ramp`, token, {
                          startMonth: rampStart,
                          startSf: Number(rampStartSf),
                          endMonth: rampEnd,
                          endSf: Number(rampEndSf)
                        })
                      )
                    }
                  >
                    Generate ramp
                  </button>
                </div>
              )}
              {editable && (
                <div className="milestone-draft">
                  <label>
                    Milestone anchors (draft interpolation)
                    <textarea
                      className="json-area"
                      value={milestoneText}
                      onChange={(e) => setMilestoneText(e.target.value)}
                      placeholder={"YYYY-MM 1000\nYYYY-MM 1500"}
                    />
                  </label>
                  <p className="workspace-muted">
                    Writes one explicit stored target per month between the first and last anchor. Generated values are a
                    draft. They are not an approved or published plan.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(() => {
                        const anchors = milestoneText
                          .split("\n")
                          .map((line) => line.trim())
                          .filter(Boolean)
                          .map((line) => {
                            const m = line.match(/^(\d{4}-\d{2})\s+([\d.]+)$/);
                            return m ? { period: m[1], sf: Number(m[2]) } : null;
                          })
                          .filter((row): row is { period: string; sf: number } => Boolean(row));
                        return apiPost(`/api/sales-ops/admin/plans/${selectedId}/generate-ramp`, token, { anchors });
                      })
                    }
                  >
                    Generate milestone draft
                  </button>
                </div>
              )}
              <div className="month-goal-table" role="table" aria-label="Monthly square-foot goals">
                <div className="month-goal-head" role="row">
                  <span>Month</span>
                  <span>Goal SF</span>
                </div>
                {periodRows.map((row, idx) => (
                  <label key={row.period} className="month-goal-row" role="row">
                    <span>
                      {row.label} {row.year}
                      <small>{row.period}</small>
                    </span>
                    <input
                      inputMode="decimal"
                      disabled={!editable}
                      value={String(row.installedTarget)}
                      onChange={(e) => {
                        const next = [...periodRows];
                        next[idx] = { ...row, installedTarget: Number(e.target.value || 0) };
                        setPeriodRows(next);
                      }}
                    />
                  </label>
                ))}
                {periodRows.length === 0 && <p>Set start and end dates to create one target per month.</p>}
              </div>
            </section>

            <section>
              <p className="kicker">4. KPI standards</p>
              <textarea className="json-area" value={metricText} disabled={!editable} onChange={(e) => setMetricText(e.target.value)} />
            </section>

            <section>
              <p className="kicker">5. Account expectations</p>
              <label>
                Strategic accounts
                <textarea value={form.strategicAccounts} disabled={!editable} onChange={(e) => setForm({ ...form, strategicAccounts: e.target.value })} />
              </label>
              <label>
                New accounts
                <textarea value={form.newAccounts} disabled={!editable} onChange={(e) => setForm({ ...form, newAccounts: e.target.value })} />
              </label>
              <label>
                Growth / reactivation
                <textarea value={form.growthReactivation} disabled={!editable} onChange={(e) => setForm({ ...form, growthReactivation: e.target.value })} />
              </label>
            </section>

            <section>
              <p className="kicker">6. Rhythms</p>
              <label>
                Weekly
                <textarea value={form.weekly} disabled={!editable} onChange={(e) => setForm({ ...form, weekly: e.target.value })} />
              </label>
              <label>
                Monthly review
                <textarea value={form.monthly} disabled={!editable} onChange={(e) => setForm({ ...form, monthly: e.target.value })} />
              </label>
              <label>
                Quarterly review
                <textarea value={form.quarterly} disabled={!editable} onChange={(e) => setForm({ ...form, quarterly: e.target.value })} />
              </label>
            </section>

            <section>
              <p className="kicker">7. Commission</p>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.commissionEnabled}
                  disabled={!editable}
                  onChange={(e) => setForm({ ...form, commissionEnabled: e.target.checked })}
                />
                Enable commission visibility for this plan
              </label>
              <label>
                Plan / rule reference (JSON)
                <textarea className="json-area" value={form.commissionRules} disabled={!editable} onChange={(e) => setForm({ ...form, commissionRules: e.target.value })} />
              </label>
            </section>

            <section>
              <p className="kicker">8. Plan copy</p>
              <label>
                Introduction
                <textarea value={form.introduction} disabled={!editable} onChange={(e) => setForm({ ...form, introduction: e.target.value })} />
              </label>
              <label>
                Expectations
                <textarea value={form.expectations} disabled={!editable} onChange={(e) => setForm({ ...form, expectations: e.target.value })} />
              </label>
              <label>
                Success definition
                <textarea value={form.successDefinition} disabled={!editable} onChange={(e) => setForm({ ...form, successDefinition: e.target.value })} />
              </label>
              <label>
                Coaching / context
                <textarea value={form.coaching} disabled={!editable} onChange={(e) => setForm({ ...form, coaching: e.target.value })} />
              </label>
            </section>

            <section>
              <p className="kicker">9. Review & history</p>
              <ul className="plan-timeline">
                {(bundle.events || []).map((ev) => (
                  <li key={asText(ev.id)}>
                    <strong>{asText(ev.eventType)}</strong>
                    <span>{String(ev.createdAt || "").slice(0, 16)}</span>
                  </li>
                ))}
              </ul>
              {bundle.acknowledgement?.acknowledgedAt && (
                <p>Acknowledged {String(bundle.acknowledgement.acknowledgedAt).slice(0, 16)}</p>
              )}
            </section>

            <div className="plan-admin-actions">
              <button className="primary-button" type="submit" disabled={!editable || busy}>
                Save draft
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const data = (await apiGet(`/api/sales-ops/admin/plans/${selectedId}/preview`, token)) as PlanBundle & {
                      banner?: string;
                    };
                    setPreview(data);
                  })
                }
              >
                Preview as salesperson
              </button>
              <button type="button" disabled={!editable || busy} onClick={() => void run(() => apiPost(`/api/sales-ops/admin/plans/${selectedId}/submit-review`, token, {}))}>
                Submit for review
              </button>
              <button type="button" disabled={!canPublish || status !== "in_review" || busy} onClick={() => void run(() => apiPost(`/api/sales-ops/admin/plans/${selectedId}/approve`, token, {}))}>
                Approve
              </button>
              <button type="button" disabled={!canPublish || status !== "approved" || busy} onClick={() => void run(() => apiPost(`/api/sales-ops/admin/plans/${selectedId}/publish`, token, {}))}>
                Publish / schedule
              </button>
              <button
                type="button"
                disabled={!["approved", "active", "superseded"].includes(status) || busy}
                onClick={() =>
                  void run(async () => {
                    const data = (await apiPost(`/api/sales-ops/admin/plans/${selectedId}/revise`, token, {})) as PlanBundle;
                    setSelectedId(asText(data.plan?.id));
                  })
                }
              >
                Create revision
              </button>
              <button type="button" disabled={status === "archived" || busy} onClick={() => void run(() => apiPost(`/api/sales-ops/admin/plans/${selectedId}/archive`, token, {}))}>
                Archive
              </button>
            </div>
          </form>
        )}
      </div>

      {preview && (
        <div className="modal-backdrop" onMouseDown={(event) => event.currentTarget === event.target && setPreview(null)}>
          <section className="insight-modal" role="dialog">
            <button className="modal-close" type="button" onClick={() => setPreview(null)}>
              <span />
              Close
            </button>
            <div className="modal-content">
              <div className="preview-banner">Preview Mode — not the salesperson’s active plan</div>
              <SalesPlanPreview bundle={preview} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
