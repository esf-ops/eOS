import { useMemo, useState } from "react";
import { colorReport, filterJobRows, jobRow } from "../lib/eccModel.mjs";
import { projectFinancials } from "../lib/workspaceModel.mjs";
import { STAGE_LABEL, SectionHead, Source, Unknown, fmt, text } from "./common";
import type { Dataset, DrillTarget, Period } from "./Workspace";

type Props = {
  dataset: Dataset;
  period: Period;
  drill: DrillTarget | null;
  onClearDrill: () => void;
  onOpenProject: (id: string) => void;
  onOpenCustomer: (key: string) => void;
  customerKeyFor: (projectId: string) => string | null;
};

export default function QuotesJobs({ dataset, period, drill, onClearDrill, onOpenProject, onOpenCustomer, customerKeyFor }: Props) {
  const [filters, setFilters] = useState({ branch: "", salesRep: "", stage: "", color: "", search: "" });
  const asOf = dataset.asOf;
  const rows = useMemo(() => dataset.opportunities.map((o) => jobRow(o, asOf)), [dataset, asOf]);
  const openArById = useMemo(
    () => Object.fromEntries(dataset.opportunities.map((o) => [o.id, projectFinancials(o, asOf).openAr as number])),
    [dataset, asOf],
  );
  const projectDrill = drill?.kind === "projects" ? drill : null;
  const visible = useMemo(() => filterJobRows(rows, { ...filters, ids: projectDrill?.ids ?? null }), [rows, filters, projectDrill]);
  const branches = [...new Set(rows.map((r) => r.branch).filter(Boolean))] as string[];
  const reps = [...new Set(rows.map((r) => r.salesRep).filter(Boolean))] as string[];
  const colorOptions = colorReport(dataset.opportunities, period).rows.map((c) => ({ key: c.key, label: c.label }));

  return (
    <section className="ecc-card" aria-labelledby="ecc-jobs-h">
      <SectionHead title="Quotes & Jobs">
        {projectDrill ? (
          <span className="ecc-chip">
            From metric: {projectDrill.label} ({projectDrill.ids.length})
            <button type="button" aria-label="Clear drill-down" onClick={onClearDrill}>
              ×
            </button>
          </span>
        ) : (
          <span className="ecc-muted">One row per QuickBooks job · revisions collapse into the row</span>
        )}
      </SectionHead>
      <div className="ecc-filters">
        <input
          type="search"
          placeholder="Search customer, project, estimate #"
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
        />
        <select value={filters.branch} onChange={(e) => setFilters({ ...filters, branch: e.target.value })}>
          <option value="">All branches</option>
          {branches.map((b) => (
            <option key={b}>{b}</option>
          ))}
          <option value="__unknown">Unknown branch</option>
        </select>
        <select value={filters.salesRep} onChange={(e) => setFilters({ ...filters, salesRep: e.target.value })}>
          <option value="">All sales reps</option>
          {reps.map((r) => (
            <option key={r}>{r}</option>
          ))}
          <option value="__unknown">No sales rep</option>
        </select>
        <select value={filters.stage} onChange={(e) => setFilters({ ...filters, stage: e.target.value })}>
          <option value="">All stages</option>
          {Object.entries(STAGE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select value={filters.color} onChange={(e) => setFilters({ ...filters, color: e.target.value })}>
          <option value="">All colors</option>
          {colorOptions.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="ecc-table-wrap">
        <table className="ecc-table">
          <thead>
            <tr>
              <th>
                Project <Source system="quickbooks" />
              </th>
              <th>
                Customer <Source system="account_directory" />
              </th>
              <th>Branch</th>
              <th>Sales rep</th>
              <th>
                Account owner <Source system="monday" />
              </th>
              <th>
                Stage <Source system="derived" />
              </th>
              <th className="num">Revs</th>
              <th className="num">Current / sold</th>
              <th className="num">Open A/R</th>
              <th>Colors</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const ck = customerKeyFor(r.id);
              return (
                <tr key={r.id}>
                  <td>
                    <button type="button" className="ecc-link" onClick={() => onOpenProject(r.id)}>
                      {text(r.project)}
                    </button>
                    <div className="ecc-sub">{text(r.currentRef)}{r.ageDays != null ? ` · first quoted ${r.ageDays}d ago` : ""}</div>
                  </td>
                  <td>
                    {ck ? (
                      <button type="button" className="ecc-link" onClick={() => onOpenCustomer(ck)}>
                        {text(r.customer)}
                      </button>
                    ) : (
                      text(r.customer)
                    )}
                    {!r.customerLinked ? <div className="ecc-sub ecc-flag">Not in Account Directory</div> : null}
                  </td>
                  <td>{r.branch ?? <Unknown reason={r.branchRaw ? `QuickBooks class "${r.branchRaw}" is not mapped` : "No QuickBooks class"} />}</td>
                  <td>
                    {text(r.salesRep, "No SalesRepRef on the QuickBooks estimate")}
                    {r.salesRep && !r.salesRepMapped ? <div className="ecc-sub">QB initials · unmapped</div> : null}
                  </td>
                  <td>{text(r.accountOwner, "No Monday owner for the linked account")}</td>
                  <td>
                    <span className={`ecc-pill ecc-stage-${r.stage}`}>{STAGE_LABEL[r.stage]}</span>
                  </td>
                  <td className="num">{r.revisions}</td>
                  <td className="num">{fmt(r.soldAmount ?? r.currentTotal, "money", "Total not in mirror")}</td>
                  <td className="num">{openArById[r.id] > 0 ? fmt(openArById[r.id], "money") : <span className="ecc-muted">—</span>}</td>
                  <td>{r.colors == null ? <Unknown reason="No estimate line detail" /> : r.colors.length ? r.colors.join(", ") : <span className="ecc-muted">Unmatched text</span>}</td>
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={10} className="ecc-muted">
                  No jobs match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
