import { useMemo } from "react";
import { projectDetail } from "../lib/workspaceModel.mjs";
import { Phase2, STAGE_LABEL, SectionHead, Source, Unknown, date, fmt, money, text } from "./common";

const AGING_ROWS: Array<[string, string]> = [
  ["current", "Current"],
  ["days1to30", "1–30 days"],
  ["days31to60", "31–60 days"],
  ["days61to90", "61–90 days"],
  ["days90Plus", "90+ days"],
  ["unknown", "No due date"],
];

export function AgingTable({ aging }: { aging: any }) {
  return (
    <table className="ecc-table compact">
      <tbody>
        {AGING_ROWS.map(([k, label]) => (
          <tr key={k}>
            <td>{label}</td>
            <td className="num">{aging.aging[k].count}</td>
            <td className="num">{money.format(aging.aging[k].balance)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Props = {
  opp: any;
  customers: any[];
  asOf: string;
  onBack: () => void;
  onOpenCustomer: (key: string) => void;
};

export default function ProjectDetail({ opp, customers, asOf, onBack, onOpenCustomer }: Props) {
  const d = useMemo(() => projectDetail(opp, customers, asOf), [opp, customers, asOf]);
  const sold = d.opp.sold;
  return (
    <>
      <div className="ecc-crumbs">
        <button type="button" className="ecc-link" onClick={onBack}>
          ← Quotes &amp; Jobs
        </button>
        {d.customer ? (
          <>
            {" / "}
            <button type="button" className="ecc-link" onClick={() => onOpenCustomer(d.customer.key)}>
              {text(d.customer.name)}
            </button>
          </>
        ) : null}
      </div>

      <section className="ecc-card">
        <div className="ecc-detail-head">
          <div>
            <p className="ecc-kicker">
              Project · QuickBooks job <Source system="quickbooks" />
            </p>
            <h1>{text(d.opp.projectName)}</h1>
            <p className="ecc-lead">
              {text(d.customer?.name)} {d.customer && !d.customer.linked ? <span className="ecc-flag">· not in Account Directory</span> : null}
            </p>
          </div>
          <span className={`ecc-pill ecc-stage-${d.stage}`} title="Derived from QuickBooks records; not an editable status">
            {STAGE_LABEL[d.stage]}
          </span>
        </div>
        <dl className="ecc-facts">
          <div>
            <dt>
              Account owner <Source system="monday" />
            </dt>
            <dd>{text(d.opp.accountOwner?.name, "No Monday owner for the linked account")}</dd>
          </div>
          <div>
            <dt>
              Sales rep <Source system="quickbooks" />
            </dt>
            <dd>{text(d.opp.salesRep?.userName ?? d.opp.salesRep?.initials, "No SalesRepRef on the estimate")}</dd>
          </div>
          <div>
            <dt>
              Estimator <Source system={null} />
            </dt>
            <dd>{text(null, "No estimator source chosen yet (QuickBooks field or slabOS assignment)")}</dd>
          </div>
          <div>
            <dt>
              Branch <Source system="quickbooks" />
            </dt>
            <dd>{d.opp.branch?.branchKey ?? <Unknown reason={d.opp.branch?.qbClassName ? `Class "${d.opp.branch.qbClassName}" not mapped` : "No class"} />}</dd>
          </div>
          <div>
            <dt>
              Open A/R <Source system="quickbooks" />
            </dt>
            <dd>{fmt(d.fin.openAr, "money")}</dd>
          </div>
          <div>
            <dt>
              Sales orders <Source system="quickbooks" />
            </dt>
            <dd>{fmt(d.fin.soldTotal.value, "money", "Sales order total not in mirror")}</dd>
          </div>
        </dl>
      </section>

      <div className="ecc-two-col">
        <section className="ecc-card">
          <SectionHead title="Estimate revisions" system="quickbooks">
            <span className="ecc-muted">{d.revisions.length} on this job · newest is current</span>
          </SectionHead>
          <table className="ecc-table compact">
            <thead>
              <tr>
                <th>Estimate</th>
                <th>Date</th>
                <th className="num">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.revisions.map((r: any) => (
                <tr key={r.txnId}>
                  <td>{r.refNumber}</td>
                  <td>{date(r.txnDate)}</td>
                  <td className="num">{fmt(r.total, "money", "Estimate total not in mirror")}</td>
                  <td>
                    {sold?.estimateTxnId === r.txnId ? <span className="ecc-pill ecc-stage-sold">Sold revision</span> : null}
                    {d.current?.txnId === r.txnId && sold?.estimateTxnId !== r.txnId ? <span className="ecc-pill ecc-pill-ok">Current</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="ecc-card">
          <SectionHead title="Sales orders" system="quickbooks">
            {sold ? <span className="ecc-muted">Estimate link: {sold.linkMethod === "linked_txn" ? "QuickBooks LinkedTxn" : "memo reference (flagged)"}</span> : null}
          </SectionHead>
          {d.fin.salesOrders.length ? (
            <table className="ecc-table compact">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {d.fin.salesOrders.map((s: any, i: number) => (
                  <tr key={s.refNumber ?? i}>
                    <td>
                      {text(s.refNumber)}
                      {i > 0 ? <div className="ecc-sub">{s.memo ?? "Change order"}</div> : null}
                    </td>
                    <td>{date(s.date)}</td>
                    <td className="num">{fmt(s.amount, "money", "Sales order total not in mirror")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="ecc-muted">No sales order on this job.</p>
          )}
        </section>
      </div>

      <div className="ecc-two-col">
        <section className="ecc-card">
          <SectionHead title="Invoices & open A/R" system="quickbooks">
            <span className="ecc-muted">Aging by QuickBooks due date</span>
          </SectionHead>
          {d.fin.invoices.length ? (
            <>
              <table className="ecc-table compact">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Due</th>
                    <th className="num">Amount</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {d.fin.invoices.map((i: any) => (
                    <tr key={i.refNumber}>
                      <td>
                        {i.refNumber}
                        {i.termsName ? <div className="ecc-sub">{i.termsName}</div> : null}
                      </td>
                      <td>{date(i.invoiceDate)}</td>
                      <td>{date(i.dueDate, "QuickBooks invoice has no due date — excluded from overdue")}</td>
                      <td className="num">{fmt(i.amount, "money")}</td>
                      <td className="num">{fmt(i.balance, "money")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <AgingTable aging={d.fin.aging} />
              <p className="ecc-note">{d.fin.aging.collectionAttention.label}: {d.fin.aging.collectionAttention.reason}</p>
            </>
          ) : (
            <p className="ecc-muted">QuickBooks has no invoice on this job.</p>
          )}
        </section>

        <section className="ecc-card">
          <SectionHead title="Payments" system="quickbooks">
            <span className="ecc-muted">Collected {fmt(d.fin.collectedTotal.value, "money")}</span>
          </SectionHead>
          {d.fin.payments.length ? (
            <table className="ecc-table compact">
              <tbody>
                {d.fin.payments.map((p: any) => (
                  <tr key={p.refNumber}>
                    <td>{p.refNumber}</td>
                    <td>{date(p.date)}</td>
                    <td className="num">{fmt(p.amount, "money")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="ecc-muted">No payments on this job.</p>
          )}
          <p className="ecc-note">Payment-to-invoice application is not in the mirror yet, so payments are listed, not matched.</p>
        </section>
      </div>

      <section className="ecc-card">
        <SectionHead title="Production" system="moraware" />
        {d.production.linked ? (
          <p>
            Moraware job <strong>{d.production.linked.sourceJobId}</strong> {d.production.linked.name ? `· ${d.production.linked.name}` : ""}{" "}
            {d.production.linked.status ? <span className="ecc-pill ecc-pill-ok">{d.production.linked.status}</span> : null}
            <span className="ecc-sub"> Linked explicitly at handoff.</span>
          </p>
        ) : (
          <p className="ecc-muted">No Moraware job is linked to this project.</p>
        )}
        {d.production.customerJobsNotLinked.length ? (
          <p className="ecc-note">
            This customer has {d.production.customerJobsNotLinked.length} other Moraware job(s). They are shown on the customer, never attached to a
            project by name or date.
          </p>
        ) : null}
      </section>

      <Phase2 title="Follow-ups, assignment and handoff for this project">
        After validation: follow-ups on this project (Account Directory follow-ups with a project reference), estimator assignment, and
        Tanya's handoff record with the Moraware job ID she confirms. Sold stays the QuickBooks sales order; production status stays in
        Moraware.
      </Phase2>
    </>
  );
}
