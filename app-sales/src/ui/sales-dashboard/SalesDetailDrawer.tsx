import React, { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiFetch } from "../../lib/api";
import { detailQueryString } from "../../lib/salesDashboardApi";
import type { AccountDetail, ColorDetail, DashboardDetailResponse } from "../../lib/salesDashboardTypes";
import { useSalesDashboard } from "./SalesDashboardContext";

function fmtSqft(n: number | null | undefined) {
  return `${Math.round(Number(n) || 0).toLocaleString()} sqft`;
}

function fmtPct(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export default function SalesDetailDrawer() {
  const { detail, closeDetail, filters, token, copyAccountSummary, copyColorSummary, copyMsg } = useSalesDashboard();
  const [detailData, setDetailData] = useState<AccountDetail | ColorDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!detail || !token) {
      setDetailData(null);
      setDetailError("");
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setDetailLoading(true);
    setDetailError("");
    setDetailData(null);

    void (async () => {
      try {
        const qs = detailQueryString(filters, detail.type, detail.key);
        const json = (await apiFetch(`/api/sales/dashboard/detail?${qs}`, {
          token,
          signal: ac.signal
        })) as DashboardDetailResponse;
        if (ac.signal.aborted) return;
        if (!json.ok) throw new Error("Detail request failed");
        setDetailData(json.detail);
      } catch (e) {
        if (ac.signal.aborted) return;
        const msg = e instanceof ApiError ? e.message : String((e as Error)?.message ?? e);
        setDetailError(msg);
      } finally {
        if (!ac.signal.aborted) setDetailLoading(false);
      }
    })();

    return () => ac.abort();
  }, [detail, filters, token]);

  if (!detail) return null;

  const account = detail.type === "account" ? (detailData as AccountDetail | null) : null;
  const color = detail.type === "color" ? (detailData as ColorDetail | null) : null;

  return (
    <>
      <button type="button" className="sd-drawer-backdrop" aria-label="Close detail" onClick={closeDetail} />
      <aside className="sd-drawer" role="dialog" aria-label={detail.label}>
        <header className="sd-drawer-head">
          <div>
            <p className="sd-drawer-eyebrow">{detail.type === "account" ? "Account detail" : "Color detail"}</p>
            <h2 className="sd-drawer-title">{detail.label}</h2>
          </div>
          <div className="sd-drawer-head-actions">
            {detail.type === "account" && account ? (
              <button type="button" className="sd-btn sd-btn--ghost sd-btn--sm" onClick={() => copyAccountSummary(account)}>
                {copyMsg || "Copy summary"}
              </button>
            ) : null}
            {detail.type === "color" && color ? (
              <button type="button" className="sd-btn sd-btn--ghost sd-btn--sm" onClick={() => copyColorSummary(color)}>
                {copyMsg || "Copy summary"}
              </button>
            ) : null}
            <button type="button" className="sd-btn sd-btn--ghost" onClick={closeDetail}>Close</button>
          </div>
        </header>
        <div className="sd-drawer-body">
          {detailLoading ? <p className="sd-muted">Loading detail…</p> : null}
          {detailError ? <p className="sd-muted">{detailError}</p> : null}
          {detail.type === "account" && account ? <AccountDetailBody d={account} /> : null}
          {detail.type === "account" && !detailLoading && !account && !detailError ? (
            <p className="sd-muted">No detail available for this account in the current filter set.</p>
          ) : null}
          {detail.type === "color" && color ? <ColorDetailBody d={color} /> : null}
          {detail.type === "color" && !detailLoading && !color && !detailError ? (
            <p className="sd-muted">No detail available for this color in the current filter set.</p>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function AccountDetailBody({ d }: { d: AccountDetail }) {
  return (
    <>
      <section className="sd-drawer-section">
        <h3>Performance summary</h3>
        <dl className="sd-dl">
          <div><dt>Current sqft</dt><dd>{fmtSqft(d.currentSqft)}</dd></div>
          <div><dt>Prior-year sqft</dt><dd>{fmtSqft(d.priorSqft)}</dd></div>
          <div><dt>YoY change</dt><dd>{fmtPct(d.yoyPct)} ({fmtSqft(d.yoySqft)})</dd></div>
          <div><dt>Jobs</dt><dd>{d.jobCount ?? "—"}</dd></div>
          <div><dt>Last job</dt><dd>{d.lastJobDate || "—"}</dd></div>
        </dl>
      </section>
      <section className="sd-drawer-section">
        <h3>Elite 100 mix</h3>
        <dl className="sd-dl">
          <div><dt>Elite 100 share</dt><dd>{d.eliteShare != null ? `${d.eliteShare.toFixed(1)}%` : "—"}</dd></div>
          <div><dt>Out-of-collection</dt><dd>{d.outShare != null ? `${d.outShare.toFixed(1)}%` : "—"}</dd></div>
          <div><dt>Assigned rep</dt><dd>{d.assignedRep || "—"}</dd></div>
          <div><dt>Branch</dt><dd>{d.branch || "—"}</dd></div>
          <div><dt>Attribution</dt><dd>{d.attributionStatus || "—"}</dd></div>
        </dl>
      </section>
      {(d.focusReasons?.length ?? 0) > 0 ? (
        <section className="sd-drawer-section">
          <h3>Attention reasons</h3>
          <ul className="sd-list">{d.focusReasons!.map((r) => <li key={r}>{r.replace(/_/g, " ")}</li>)}</ul>
        </section>
      ) : null}
      {(d.topColors?.length ?? 0) > 0 ? (
        <section className="sd-drawer-section">
          <h3>Top colors</h3>
          <ul className="sd-list">{d.topColors!.map((c) => <li key={`${c.color}-${c.material}`}>{c.color}{c.material ? ` · ${c.material}` : ""} · {fmtSqft(c.sqft)}</li>)}</ul>
        </section>
      ) : null}
      {(d.relatedQuotes?.length ?? 0) > 0 ? (
        <section className="sd-drawer-section">
          <h3>Quote activity</h3>
          <ul className="sd-list">{d.relatedQuotes!.map((q) => <li key={q.id}>{q.quoteNumber} · {q.status} · ${Math.round(q.grandTotal).toLocaleString()}</li>)}</ul>
        </section>
      ) : null}
      {(d.recentJobs?.length ?? 0) > 0 ? (
        <section className="sd-drawer-section">
          <h3>Recent jobs</h3>
          <ul className="sd-list sd-list--compact">
            {d.recentJobs!.slice(0, 8).map((j) => (
              <li key={j.jobId}>{j.reportDate} · {fmtSqft(j.sqft)} · {j.status}{j.color ? ` · ${j.color}` : ""}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {(d.mappingNotes?.length ?? 0) > 0 ? (
        <section className="sd-drawer-section">
          <h3>Data quality notes</h3>
          <ul className="sd-list">{d.mappingNotes!.map((n) => <li key={n}>{n}</li>)}</ul>
        </section>
      ) : null}
    </>
  );
}

function ColorDetailBody({ d }: { d: ColorDetail & { priorSqft?: number; relatedJobs?: Array<{ rep?: string }>; rawColor?: string } }) {
  const topReps = useMemo(() => {
    const reps = new Map<string, number>();
    for (const j of d.relatedJobs ?? []) {
      const rep = j.rep || "Unknown";
      reps.set(rep, (reps.get(rep) || 0) + 1);
    }
    return [...reps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [d.relatedJobs]);

  const mappingStatus =
    d.collectionStatus === "unknown" || d.collectionStatus === "unmapped"
      ? "Needs catalog mapping"
      : d.catalogDisplayName
        ? "Matched to catalog"
        : d.collectionStatus;

  return (
    <>
      <section className="sd-drawer-section">
        <h3>Classification</h3>
        <dl className="sd-dl">
          <div><dt>Collection status</dt><dd>{d.collectionStatus}</dd></div>
          <div><dt>Elite group</dt><dd>{d.eliteGroup || "—"}</dd></div>
          <div><dt>Manufacturer</dt><dd>{d.manufacturer || "—"}</dd></div>
          <div><dt>Catalog match</dt><dd>{d.catalogDisplayName || "—"}</dd></div>
          <div><dt>Mapping status</dt><dd>{mappingStatus}</dd></div>
        </dl>
      </section>
      <section className="sd-drawer-section">
        <h3>Volume impact</h3>
        <dl className="sd-dl">
          <div><dt>Current sqft</dt><dd>{fmtSqft(d.sqft)}</dd></div>
          {d.priorSqft != null ? <div><dt>Prior-year sqft</dt><dd>{fmtSqft(d.priorSqft)}</dd></div> : null}
        </dl>
      </section>
      {(d.topAccounts?.length ?? 0) > 0 ? (
        <section className="sd-drawer-section">
          <h3>Top accounts</h3>
          <ul className="sd-list">{d.topAccounts!.map((a) => <li key={a.account}>{a.account} · {fmtSqft(a.sqft)}</li>)}</ul>
        </section>
      ) : null}
      {topReps.length ? (
        <section className="sd-drawer-section">
          <h3>Top reps</h3>
          <ul className="sd-list">{topReps.map(([rep, count]) => <li key={rep}>{rep} · {count} job{count === 1 ? "" : "s"}</li>)}</ul>
        </section>
      ) : null}
      {(d.relatedJobs?.length ?? 0) > 0 ? (
        <section className="sd-drawer-section">
          <h3>Sample jobs</h3>
          <ul className="sd-list sd-list--compact">
            {(d.relatedJobs as Array<{ jobId: string; account: string; sqft: number; reportDate: string }>).slice(0, 6).map((j) => (
              <li key={j.jobId}>{j.account} · {fmtSqft(j.sqft)} · {j.reportDate}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
