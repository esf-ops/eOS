import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, ApiError } from "./lib/api";
import { getSupabase } from "./lib/supabase";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";
const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";
const HOME_URL = String(import.meta.env.VITE_HOME_URL || "https://www.eliteosfab.com").replace(/\/+$/, "");

type MoneyFamily = { count: number; amount: number };
type Badge = { code: string; label: string };

type ProjectRow = {
  projectRef: string;
  fullName?: string | null;
  customerName?: string | null;
  jobName?: string | null;
  isActive?: boolean;
  account?: { id: string; name?: string | null } | null;
  directoryLinked?: boolean;
  morawareAccountLinked?: boolean;
  morawareJobLinked?: boolean;
  openAr?: number;
  estimates?: MoneyFamily;
  salesOrders?: MoneyFamily;
  invoices?: MoneyFamily;
  payments?: MoneyFamily;
  badges?: Badge[];
};

type ProjectDetail = ProjectRow & {
  ownership?: { money?: string; production?: string; identity?: string };
  quickbooks?: {
    summaries?: {
      estimates?: MoneyFamily;
      salesOrders?: MoneyFamily;
      invoices?: MoneyFamily;
      payments?: MoneyFamily;
    };
    transactions?: Array<{
      id: string;
      type: string;
      referenceNumber?: string | null;
      date?: string | null;
      amount?: number | null;
    }>;
    openAr?: {
      total?: number;
      invoiceCount?: number;
      aging?: { collectionAttention?: { code?: string; label?: string; reason?: string } };
      rows?: Array<{ balance: number; dueDate?: string | null; referenceNumber?: string | null }>;
    };
  };
  moraware?: {
    linkState?: string;
    note?: string;
    jobs?: Array<{
      sourceJobId?: string | null;
      jobName?: string | null;
      statusName?: string | null;
      salespersonName?: string | null;
      createdAt?: string | null;
      installAt?: string | null;
      completedAt?: string | null;
    }>;
  };
};

type ListPayload = {
  ok?: boolean;
  projects?: ProjectRow[];
  page?: number;
  pageSize?: number;
  total?: number;
  meta?: { note?: string; unavailable?: boolean };
};

type DetailPayload = { ok?: boolean; project?: ProjectDetail };

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function familyLabel(f?: MoneyFamily) {
  if (!f || !f.count) return "—";
  return `${f.count} · ${money(f.amount)}`;
}

export default function JobsCommandCenterApp() {
  const [token, setToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const orgName = DEFAULT_WORKSPACE_NAME;
  const [q, setQ] = useState("");
  const [bucket, setBucket] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<ListPayload | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setAuthReady(true);
      return;
    }
    let cancelled = false;
    const applySession = (session: { access_token?: string; user?: { email?: string; user_metadata?: Record<string, unknown> } } | null) => {
      if (cancelled) return;
      const t = session?.access_token || null;
      setToken(t);
      setUserEmail(session?.user?.email || null);
      const meta = session?.user?.user_metadata || {};
      const name = String(meta.full_name || meta.name || meta.display_name || "").trim();
      setUserName(name || null);
      setAuthReady(true);
    };
    sb.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => applySession(session));
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const loadList = useCallback(async () => {
    if (!token) return;
    setListLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "50" });
      if (q.trim()) params.set("q", q.trim());
      if (bucket) params.set("bucket", bucket);
      const body = (await apiGet(`/api/jobs-command-center/projects?${params}`, token)) as ListPayload;
      setList(body);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      setListError(msg);
      setList(null);
    } finally {
      setListLoading(false);
    }
  }, [token, page, q, bucket]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!token || !selectedRef) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const body = (await apiGet(`/api/jobs-command-center/projects/${selectedRef}`, token)) as DetailPayload;
        if (!cancelled) setDetail(body.project || null);
      } catch (e) {
        if (!cancelled) {
          setDetail(null);
          setDetailError(e instanceof ApiError ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, selectedRef]);

  const menuItems: EliteosTopbarMenuItem[] = useMemo(
    () => [{ id: "home", label: "Open Home", onSelect: () => { window.location.href = HOME_URL; } }],
    []
  );

  async function signOut() {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    window.location.href = HOME_URL;
  }

  if (!authReady) {
    return <div className="jcc-boot">Loading…</div>;
  }

  if (!token) {
    return (
      <div className="shell">
        <div className="jcc-gate">
          <h1>Jobs Command Center</h1>
          <p>Sign in from eliteOS Home to continue. Admin access required.</p>
          <a className="jcc-btn" href={HOME_URL}>
            Open Home
          </a>
        </div>
      </div>
    );
  }

  const projects = list?.projects || [];
  const total = list?.total ?? projects.length;

  return (
    <div className="shell">
      <EliteosTopbar
        appName="Jobs Command Center"
        organizationName={orgName}
        logoSrc={EOS_LOGO_URL}
        homeHref={HOME_URL}
        userDisplayName={userName || userEmail || "User"}
        userEmail={userEmail || undefined}
        userRoleLabel="Admin"
        menuItems={menuItems}
        onSignOut={() => void signOut()}
      />

      <main className="main">
        <header className="jcc-hero">
          <div>
            <p className="jcc-eyebrow">eliteOS · Admin preview</p>
            <h1>Jobs Command Center</h1>
            <p className="jcc-lede">
              One row per QuickBooks Customer:Job. Money from QuickBooks. Production from Moraware when the Account
              Directory link exists. Exact IDs only — no guessing.
            </p>
          </div>
          {list?.meta?.note ? <p className="jcc-note">{list.meta.note}</p> : null}
        </header>

        <div className={`jcc-layout ${selectedRef ? "has-detail" : ""}`}>
          <section className="jcc-panel" aria-labelledby="jcc-list-h">
            <div className="jcc-toolbar">
              <h2 id="jcc-list-h">All jobs</h2>
              <div className="jcc-filters">
                <input
                  type="search"
                  placeholder="Search customer or job"
                  value={q}
                  onChange={(e) => {
                    setPage(1);
                    setQ(e.target.value);
                  }}
                />
                <select
                  value={bucket}
                  onChange={(e) => {
                    setPage(1);
                    setBucket(e.target.value);
                  }}
                >
                  <option value="">All</option>
                  <option value="in_directory">In Account Directory</option>
                  <option value="not_in_directory">Not in Directory</option>
                  <option value="moraware_related">Moraware account linked</option>
                  <option value="no_moraware">No Moraware link</option>
                </select>
              </div>
            </div>

            {listError ? <div className="jcc-error">{listError}</div> : null}
            {listLoading ? <div className="jcc-muted">Loading jobs…</div> : null}

            <div className="jcc-table-wrap">
              <table className="jcc-table">
                <thead>
                  <tr>
                    <th>Job</th>
                    <th>Account</th>
                    <th>Estimates</th>
                    <th>Sales orders</th>
                    <th>Open A/R</th>
                    <th>Moraware</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((p) => (
                    <tr
                      key={p.projectRef}
                      className={selectedRef === p.projectRef ? "is-selected" : ""}
                      onClick={() => setSelectedRef(p.projectRef)}
                    >
                      <td>
                        <div className="jcc-job-name">{p.jobName || p.fullName || "Untitled job"}</div>
                        <div className="jcc-muted">{p.customerName}</div>
                      </td>
                      <td>{p.account?.name || <span className="jcc-warn">Not in Directory</span>}</td>
                      <td>{familyLabel(p.estimates)}</td>
                      <td>{familyLabel(p.salesOrders)}</td>
                      <td>{p.openAr ? money(p.openAr) : "—"}</td>
                      <td>
                        {p.morawareAccountLinked ? (
                          <span className="jcc-pill ok">Account linked</span>
                        ) : (
                          <span className="jcc-pill">No link</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!listLoading && projects.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="jcc-muted">
                        No QuickBooks jobs found for this filter.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="jcc-pager">
              <span className="jcc-muted">
                Page {page} · {total} total
              </span>
              <div>
                <button type="button" className="jcc-btn ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </button>
                <button
                  type="button"
                  className="jcc-btn ghost"
                  disabled={page * 50 >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </section>

          {selectedRef ? (
            <section className="jcc-panel jcc-detail" aria-labelledby="jcc-detail-h">
              <div className="jcc-toolbar">
                <h2 id="jcc-detail-h">Job detail</h2>
                <button type="button" className="jcc-btn ghost" onClick={() => setSelectedRef(null)}>
                  Close
                </button>
              </div>
              {detailLoading ? <div className="jcc-muted">Loading detail…</div> : null}
              {detailError ? <div className="jcc-error">{detailError}</div> : null}
              {detail ? (
                <div className="jcc-detail-body">
                  <h3>{detail.jobName || detail.fullName}</h3>
                  <p className="jcc-muted">{detail.customerName}</p>
                  <p className="jcc-ownership">
                    Money: QuickBooks · Production: Moraware · Identity: Account Directory
                  </p>

                  <div className="jcc-stat-grid">
                    <div>
                      <span>Estimates</span>
                      <strong>{familyLabel(detail.quickbooks?.summaries?.estimates)}</strong>
                    </div>
                    <div>
                      <span>Sales orders</span>
                      <strong>{familyLabel(detail.quickbooks?.summaries?.salesOrders)}</strong>
                    </div>
                    <div>
                      <span>Invoices</span>
                      <strong>{familyLabel(detail.quickbooks?.summaries?.invoices)}</strong>
                    </div>
                    <div>
                      <span>Open A/R</span>
                      <strong>{money(detail.quickbooks?.openAr?.total)}</strong>
                    </div>
                  </div>

                  {detail.quickbooks?.openAr?.aging?.collectionAttention ? (
                    <p className="jcc-note">
                      Collection: {detail.quickbooks.openAr.aging.collectionAttention.label} —{" "}
                      {detail.quickbooks.openAr.aging.collectionAttention.reason}
                    </p>
                  ) : null}

                  <h4>QuickBooks transactions</h4>
                  <ul className="jcc-txn-list">
                    {(detail.quickbooks?.transactions || []).slice(0, 40).map((t) => (
                      <li key={t.id}>
                        <span className="jcc-pill">{t.type}</span>
                        <span>{t.referenceNumber || "—"}</span>
                        <span>{t.date || "—"}</span>
                        <strong>{money(t.amount)}</strong>
                      </li>
                    ))}
                    {(detail.quickbooks?.transactions || []).length === 0 ? (
                      <li className="jcc-muted">No mirrored transactions on this job.</li>
                    ) : null}
                  </ul>

                  <h4>Moraware</h4>
                  <p className="jcc-note">{detail.moraware?.note}</p>
                  <ul className="jcc-txn-list">
                    {(detail.moraware?.jobs || []).map((j, idx) => (
                      <li key={j.sourceJobId || `${j.jobName || "job"}-${idx}`}>
                        <span>{j.jobName || j.sourceJobId}</span>
                        <span className="jcc-pill">{j.statusName || "status unknown"}</span>
                        <span>{j.salespersonName || "—"}</span>
                      </li>
                    ))}
                    {(detail.moraware?.jobs || []).length === 0 ? (
                      <li className="jcc-muted">No related Moraware jobs to show.</li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </main>
    </div>
  );
}
