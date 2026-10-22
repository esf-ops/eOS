import { jobRow } from "../lib/eccModel.mjs";
import { AgingTable } from "./ProjectDetail";
import { Phase2, STAGE_LABEL, SectionHead, Source, date, fmt, text } from "./common";
import type { DrillTarget } from "./Workspace";

type ListProps = {
  customers: any[];
  drill: DrillTarget | null;
  onClearDrill: () => void;
  onOpenCustomer: (key: string) => void;
};

export function CustomerList({ customers, drill, onClearDrill, onOpenCustomer }: ListProps) {
  const customerDrill = drill?.kind === "customers" ? drill : null;
  const ids = customerDrill ? new Set(customerDrill.ids) : null;
  const visible = ids ? customers.filter((c) => ids.has(c.key)) : customers;
  return (
    <section className="ecc-card">
      <SectionHead title="Customers" system="account_directory">
        {customerDrill ? (
          <span className="ecc-chip">
            From metric: {customerDrill.label} ({customerDrill.ids.length})
            <button type="button" aria-label="Clear drill-down" onClick={onClearDrill}>
              ×
            </button>
          </span>
        ) : (
          <span className="ecc-muted">Production: the Account Directory list with these columns added</span>
        )}
      </SectionHead>
      <table className="ecc-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>
              Owner <Source system="monday" />
            </th>
            <th className="num">Projects</th>
            <th className="num">
              Open pipeline <Source system="quickbooks" />
            </th>
            <th className="num">
              Open A/R <Source system="quickbooks" />
            </th>
            <th className="num">Overdue</th>
            <th>Collection</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((c) => (
            <tr key={c.key}>
              <td>
                <button type="button" className="ecc-link" onClick={() => onOpenCustomer(c.key)}>
                  {text(c.name)}
                </button>
                {!c.linked ? <div className="ecc-sub ecc-flag">Not in Account Directory</div> : null}
              </td>
              <td>{text(c.accountOwner?.name, "No Monday owner")}</td>
              <td className="num">{c.projectIds.length}</td>
              <td className="num">{fmt(c.openPipeline.value, "money", "Estimate total not in mirror")}</td>
              <td className="num">{fmt(c.openAr, "money")}</td>
              <td className="num">{fmt(c.aging.overdueBalance, "money")}</td>
              <td>
                <span className={`ecc-pill ecc-collect-${c.aging.collectionAttention.code}`}>{c.aging.collectionAttention.label}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

type DetailProps = {
  customer: any;
  opps: any[];
  asOf: string;
  onBack: () => void;
  onOpenProject: (id: string) => void;
};

export function CustomerDetail({ customer: c, opps, asOf, onBack, onOpenProject }: DetailProps) {
  const projects = opps.filter((o) => c.projectIds.includes(o.id)).map((o) => jobRow(o, asOf));
  return (
    <>
      <div className="ecc-crumbs">
        <button type="button" className="ecc-link" onClick={onBack}>
          ← Customers
        </button>
      </div>
      <section className="ecc-card">
        <div className="ecc-detail-head">
          <div>
            <p className="ecc-kicker">
              Customer <Source system="account_directory" />
            </p>
            <h1>{text(c.name)}</h1>
            <p className="ecc-lead">
              {c.linked ? "Linked to QuickBooks by exact customer ID." : "QuickBooks customer with no Account Directory record — link it in Account Directory; never matched by name."}
            </p>
          </div>
          {c.linked ? (
            <span className="ecc-muted" title="Production: opens this account in Account Directory → Account 360">
              Account 360 ↗
            </span>
          ) : null}
        </div>
        <dl className="ecc-facts">
          <div>
            <dt>
              Account owner <Source system="monday" />
            </dt>
            <dd>{text(c.accountOwner?.name, "No Monday owner")}</dd>
          </div>
          <div>
            <dt>
              Open A/R <Source system="quickbooks" />
            </dt>
            <dd>{fmt(c.openAr, "money")}</dd>
          </div>
          <div>
            <dt>
              Overdue <Source system="quickbooks" />
            </dt>
            <dd>{fmt(c.aging.overdueBalance, "money")}</dd>
          </div>
          <div>
            <dt>
              Open pipeline <Source system="quickbooks" />
            </dt>
            <dd>{fmt(c.openPipeline.value, "money", "Estimate total not in mirror")}</dd>
          </div>
        </dl>
      </section>

      <section className="ecc-card">
        <SectionHead title="Quotes & Jobs" system="quickbooks">
          <span className="ecc-muted">{projects.length} QuickBooks jobs</span>
        </SectionHead>
        <table className="ecc-table compact">
          <thead>
            <tr>
              <th>Project</th>
              <th>
                Stage <Source system="derived" />
              </th>
              <th className="num">Revs</th>
              <th className="num">Current / sold</th>
              <th>First quoted</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>
                  <button type="button" className="ecc-link" onClick={() => onOpenProject(p.id)}>
                    {text(p.project)}
                  </button>
                </td>
                <td>
                  <span className={`ecc-pill ecc-stage-${p.stage}`}>{STAGE_LABEL[p.stage]}</span>
                </td>
                <td className="num">{p.revisions}</td>
                <td className="num">{fmt(p.soldAmount ?? p.currentTotal, "money", "Total not in mirror")}</td>
                <td>{date(p.firstQuotedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="ecc-two-col">
        <section className="ecc-card">
          <SectionHead title="A/R aging" system="quickbooks">
            <span className="ecc-muted">{c.aging.collectionAttention.label}</span>
          </SectionHead>
          <AgingTable aging={c.aging} />
          <p className="ecc-note">{c.aging.collectionAttention.reason}</p>
          {c.unfiledInvoices.length ? (
            <>
              <h3 className="ecc-h3">Not filed under a job</h3>
              <table className="ecc-table compact">
                <tbody>
                  {c.unfiledInvoices.map((i: any) => (
                    <tr key={i.refNumber}>
                      <td>{i.refNumber}</td>
                      <td>Due {date(i.dueDate, "No due date")}</td>
                      <td className="num">{fmt(i.balance, "money")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </section>

        <section className="ecc-card">
          <SectionHead title="Moraware jobs" system="moraware">
            <span className="ecc-muted">Exact Moraware account links only</span>
          </SectionHead>
          {c.morawareJobs.length ? (
            <table className="ecc-table compact">
              <tbody>
                {c.morawareJobs.map((j: any) => (
                  <tr key={j.sourceJobId}>
                    <td>
                      {j.name}
                      <div className="ecc-sub">{j.sourceJobId} · created {date(j.createdAt)}</div>
                    </td>
                    <td>{j.status}</td>
                    <td>
                      {j.projectId ? (
                        <button type="button" className="ecc-link" onClick={() => onOpenProject(j.projectId)}>
                          Linked project
                        </button>
                      ) : (
                        <span className="ecc-muted">No project link</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="ecc-muted">{c.linked ? "No Moraware jobs on linked Moraware accounts." : "Not available until the customer is in Account Directory."}</p>
          )}
        </section>
      </div>

      <Phase2 title="Customer follow-ups and assignments">
        Account 360 already holds account-level follow-ups and notes. Phase 2 adds an optional project reference so a follow-up can sit on
        a specific quote without a second follow-up system.
      </Phase2>
    </>
  );
}
