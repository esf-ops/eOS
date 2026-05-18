import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";

type SchemaHealth = {
  ok: boolean;
  requiredTables: string[];
  missingTables: string[];
  tableCounts?: Record<string, number | null>;
  message?: string;
};

type SuggestionRow = {
  morawareAccountName: string;
  normalizedMorawareName: string;
  reportTotalSqft: number;
  reportJobCount: number;
  morawareJobSalespeople: string;
  suggestedMondayAccountName: string | null;
  suggestedSalesperson: string | null;
  suggestedBranch: string | null;
  matchType: string;
  confidence: string;
  approvedSuggested: boolean;
  rationale: string;
  alternateMatches: Array<{ mondayAccountName: string; mondaySalesExecutive?: string | null; mondayBranch?: string | null; score?: number }>;
  existingApprovedAlias: any | null;
  currentAssignment: any | null;
  reviewStatus: "approved" | "rejected" | "needs_review" | "unmatched" | "fuzzy" | "unmapped" | "no_match";
};

type SuggestionsResp = {
  ok: boolean;
  total: number;
  limit: number;
  offset: number;
  rows: SuggestionRow[];
  source?: { suggestionsPath?: string; generatedAt?: string | null };
};

type RepsBranchesResp = {
  ok: boolean;
  reps: string[];
  branches: string[];
  houseOptions: string[];
};

type MasterAccountRow = {
  id: string;
  monday_account_name: string;
  normalized_account_name: string | null;
  sales_executive: string | null;
  branch: string | null;
  account_status: string | null;
  account_type: string | null;
};

type MasterAccountsResp = { ok: boolean; total: number; rows: MasterAccountRow[]; message?: string };

type CoverageExample = {
  accountName: string;
  sourceAccountId?: string | null;
  normalizedMorawareName?: string | null;
  jobCount: number;
  status: string;
  mondayAccountName?: string | null;
  assignedSalesperson?: string | null;
  branch?: string | null;
  matchType?: string | null;
};

type CoverageResp = {
  ok: boolean;
  coverage?: {
    totalAccountsSeen: number;
    approvedMappedAccounts: number;
    needsReviewUnmappedAccounts: number;
    rejectedIgnoredAccounts: number;
    totalJobsSeen: number;
    approvedMappedJobs: number;
    needsReviewUnmappedJobs: number;
    rejectedIgnoredJobs: number;
    approvedAccountCoveragePct: number | null;
    approvedJobCoveragePct: number | null;
    blackstoneUnapprovedAccounts: number;
    warning: string;
    blackstone_guardrail: string;
    examples?: {
      needsReviewUnmapped?: CoverageExample[];
      rejectedIgnored?: CoverageExample[];
      approvedMapped?: CoverageExample[];
      blackstoneUnapproved?: CoverageExample[];
    };
    warnings?: string[];
  };
};

const MAP_SCHEMA_HEALTH = "/api/admin/sales-account-mapping/schema-health";
const MAP_SUGGESTIONS = "/api/admin/sales-account-mapping/suggestions";
const MAP_REPS_BRANCHES = "/api/admin/sales-account-mapping/reps-branches";
const MAP_MASTER_ACCOUNTS = "/api/admin/sales-account-mapping/master-accounts";
const MAP_COVERAGE = "/api/admin/sales-account-mapping/coverage";
const MAP_APPROVE = "/api/admin/sales-account-mapping/approve";
const MAP_REJECT = "/api/admin/sales-account-mapping/reject";
const MAP_UNMAPPED = "/api/admin/sales-account-mapping/mark-unmapped";
const MAP_ASSIGN_HOUSE = "/api/admin/sales-account-mapping/assign-house";

function nf(n: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n);
}

function pct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${nf(Number(value))}%`;
}

function pillClass(status: string) {
  const s = String(status);
  if (s === "approved") return "pill pill-good";
  if (s === "rejected") return "pill pill-bad";
  if (s === "unmapped") return "pill pill-warn";
  if (s === "unmatched") return "pill pill-warn";
  if (s === "fuzzy") return "pill pill-warn";
  return "pill";
}

export default function SalesAccountMappingAdmin({ token }: { token: string }) {
  const [schema, setSchema] = useState<SchemaHealth | null>(null);
  const [schemaErr, setSchemaErr] = useState("");
  const [repsBranches, setRepsBranches] = useState<RepsBranchesResp | null>(null);
  const [coverage, setCoverage] = useState<CoverageResp["coverage"] | null>(null);
  const [coverageErr, setCoverageErr] = useState("");

  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [status, setStatus] = useState("needs_review");
  const [search, setSearch] = useState("");
  const [minSqft, setMinSqft] = useState("");
  const [matchType, setMatchType] = useState("");
  const [confidence, setConfidence] = useState("");
  const [salesperson, setSalesperson] = useState("");
  const [branch, setBranch] = useState("");
  const [sortBy, setSortBy] = useState("sqft");
  const [sortDir, setSortDir] = useState("desc");

  const [selected, setSelected] = useState<SuggestionRow | null>(null);
  const [notes, setNotes] = useState("");
  const [assignedSalesperson, setAssignedSalesperson] = useState("");
  const [assignedBranch, setAssignedBranch] = useState("");
  const [pickedMatchType, setPickedMatchType] = useState("");
  const [pickedConfidence, setPickedConfidence] = useState("");

  const [masterSearch, setMasterSearch] = useState("");
  const [masterResults, setMasterResults] = useState<MasterAccountRow[]>([]);
  const [masterBusy, setMasterBusy] = useState(false);
  const [masterPicked, setMasterPicked] = useState<MasterAccountRow | null>(null);

  const schemaMissing = schema ? schema.ok === false && (schema.missingTables?.length ?? 0) > 0 : false;

  const loadSchema = useCallback(async () => {
    setSchemaErr("");
    try {
      const data = (await apiFetch(MAP_SCHEMA_HEALTH, { token })) as SchemaHealth;
      setSchema(data);
    } catch (e) {
      setSchema(null);
      setSchemaErr(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    }
  }, [token]);

  const loadRepsBranches = useCallback(async () => {
    try {
      const data = (await apiFetch(MAP_REPS_BRANCHES, { token })) as RepsBranchesResp;
      setRepsBranches(data);
    } catch {
      setRepsBranches(null);
    }
  }, [token]);

  const loadCoverage = useCallback(async () => {
    setCoverageErr("");
    try {
      const data = (await apiFetch(MAP_COVERAGE, { token })) as CoverageResp;
      setCoverage(data.coverage ?? null);
    } catch (e) {
      setCoverage(null);
      setCoverageErr(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    }
  }, [token]);

  const loadSuggestions = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      if (search.trim()) p.set("search", search.trim());
      if (minSqft.trim()) p.set("minSqft", minSqft.trim());
      if (matchType) p.set("matchType", matchType);
      if (confidence) p.set("confidence", confidence);
      if (salesperson) p.set("salesperson", salesperson);
      if (branch) p.set("branch", branch);
      p.set("sortBy", sortBy);
      p.set("sortDir", sortDir);
      p.set("limit", "200");
      p.set("offset", "0");

      const data = (await apiFetch(`${MAP_SUGGESTIONS}?${p.toString()}`, { token })) as SuggestionsResp;
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [token, status, search, minSqft, matchType, confidence, salesperson, branch, sortBy, sortDir]);

  const loadMaster = useCallback(
    async (q: string) => {
      const query = q.trim();
      if (query.length < 2) {
        setMasterResults([]);
        return;
      }
      setMasterBusy(true);
      try {
        const p = new URLSearchParams();
        p.set("search", query);
        p.set("limit", "50");
        const data = (await apiFetch(`${MAP_MASTER_ACCOUNTS}?${p.toString()}`, { token })) as MasterAccountsResp;
        setMasterResults(data.rows ?? []);
      } catch {
        setMasterResults([]);
      } finally {
        setMasterBusy(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void loadSchema();
    void loadRepsBranches();
    void loadCoverage();
    void loadSuggestions();
  }, [loadSchema, loadRepsBranches, loadCoverage, loadSuggestions]);

  useEffect(() => {
    if (!selected) return;
    setNotes("");
    setMasterPicked(null);
    setMasterSearch(selected.suggestedMondayAccountName ?? "");
    setAssignedSalesperson(selected.suggestedSalesperson ?? "");
    setAssignedBranch(selected.suggestedBranch ?? "");
    setPickedMatchType(selected.matchType ?? "manual");
    setPickedConfidence(selected.confidence ?? "high");
  }, [selected]);

  useEffect(() => {
    const t = window.setTimeout(() => void loadMaster(masterSearch), 250);
    return () => window.clearTimeout(t);
  }, [masterSearch, loadMaster]);

  const derivedSummary = useMemo(() => {
    const sum = (pred: (r: SuggestionRow) => boolean) =>
      rows.filter(pred).reduce((acc, r) => acc + (Number(r.reportTotalSqft || 0) || 0), 0);
    return {
      approvedSqft: sum((r) => r.reviewStatus === "approved"),
      unmatchedSqft: sum((r) => r.reviewStatus === "unmatched" || r.reviewStatus === "no_match"),
      needsReviewCount: rows.filter((r) => r.reviewStatus === "needs_review" || r.reviewStatus === "fuzzy").length
    };
  }, [rows]);

  async function approve() {
    if (!selected) return;
    if (schemaMissing) return;

    const mondayAccountName = masterPicked?.monday_account_name || selected.suggestedMondayAccountName || "";
    const body = {
      morawareAccountName: selected.morawareAccountName,
      mondayAccountName,
      salesAccountMasterId: masterPicked?.id || null,
      assignedSalesperson,
      branch: assignedBranch,
      matchType: pickedMatchType,
      confidence: pickedConfidence,
      notes
    };
    try {
      await apiFetch(MAP_APPROVE, { token, method: "POST", body });
      setSelected(null);
      void loadSchema();
      void loadCoverage();
      void loadSuggestions();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    }
  }

  async function reject() {
    if (!selected) return;
    if (schemaMissing) return;
    try {
      await apiFetch(MAP_REJECT, {
        token,
        method: "POST",
        body: { morawareAccountName: selected.morawareAccountName, reason: notes || "Rejected via admin review" }
      });
      setSelected(null);
      void loadCoverage();
      void loadSuggestions();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    }
  }

  async function markUnmapped() {
    if (!selected) return;
    if (schemaMissing) return;
    try {
      await apiFetch(MAP_UNMAPPED, {
        token,
        method: "POST",
        body: { morawareAccountName: selected.morawareAccountName, reason: notes || "Intentionally unmapped" }
      });
      setSelected(null);
      void loadCoverage();
      void loadSuggestions();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    }
  }

  async function assignHouse(house: string) {
    if (!selected) return;
    if (schemaMissing) return;
    try {
      await apiFetch(MAP_ASSIGN_HOUSE, {
        token,
        method: "POST",
        body: {
          morawareAccountName: selected.morawareAccountName,
          houseAccountName: house,
          branch: assignedBranch || selected.suggestedBranch || "Unmapped",
          notes: notes || `Assigned to ${house}`
        }
      });
      setSelected(null);
      void loadCoverage();
      void loadSuggestions();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    }
  }

  return (
    <div style={{ padding: "18px 20px" }}>
      <h2 style={{ margin: "0 0 6px" }}>Sales Account Mapping</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Review Moraware-to-Monday account matches before Sales Head attribution is trusted. Approvals can set or change
        branch/location and salesperson ownership.
      </p>

      {schemaErr ? <div className="banner banner-bad">Schema health error: {schemaErr}</div> : null}
      {!schema ? (
        <div className="banner">Loading schema health…</div>
      ) : schemaMissing ? (
        <div className="banner banner-warn">
          <strong>Sales attribution schema is not installed yet.</strong>
          <div style={{ marginTop: 8 }}>
            Missing tables: <code>{schema.missingTables.join(", ")}</code>
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            Apply SQL: <code>backend-core/supabase/sales_account_attribution.sql</code> (manual run in Supabase).
          </div>
        </div>
      ) : null}

      {coverageErr ? <div className="banner banner-bad">Coverage error: {coverageErr}</div> : null}

      <div className="cards" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="muted">Approved attribution</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{pct(coverage?.approvedAccountCoveragePct)}</div>
          <div className="muted" style={{ marginTop: 4 }}>
            {nf(coverage?.approvedMappedAccounts ?? 0)} / {nf(coverage?.totalAccountsSeen ?? 0)} accounts
          </div>
        </div>
        <div className="card">
          <div className="muted">Approved job coverage</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{pct(coverage?.approvedJobCoveragePct)}</div>
          <div className="muted" style={{ marginTop: 4 }}>
            {nf(coverage?.approvedMappedJobs ?? 0)} / {nf(coverage?.totalJobsSeen ?? 0)} jobs
          </div>
        </div>
        <div className="card">
          <div className="muted">Needs approval / unmapped</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{nf(coverage?.needsReviewUnmappedAccounts ?? 0)}</div>
          <div className="muted" style={{ marginTop: 4 }}>
            {nf(coverage?.needsReviewUnmappedJobs ?? 0)} jobs
          </div>
        </div>
        <div className="card">
          <div className="muted">Rejected / ignored</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{nf(coverage?.rejectedIgnoredAccounts ?? 0)}</div>
          <div className="muted" style={{ marginTop: 4 }}>
            {nf(coverage?.rejectedIgnoredJobs ?? 0)} jobs
          </div>
        </div>
        <div className="card">
          <div className="muted">Total shown</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{String(rows.length)}</div>
        </div>
        <div className="card">
          <div className="muted">Needs review</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{String(derivedSummary.needsReviewCount)}</div>
        </div>
        <div className="card">
          <div className="muted">Approved Sq.Ft. (shown)</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{nf(derivedSummary.approvedSqft)}</div>
        </div>
        <div className="card">
          <div className="muted">Unmatched Sq.Ft. (shown)</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{nf(derivedSummary.unmatchedSqft)}</div>
        </div>
        <div className="card">
          <div className="muted">Source suggestions total</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{String(total)}</div>
        </div>
      </div>

      {coverage ? (
        <div className="banner banner-warn" style={{ marginTop: 14 }}>
          <strong>Approved mapping coverage controls Sales Head trust.</strong>
          <div style={{ marginTop: 6 }}>{coverage.warning}</div>
          <div className="muted" style={{ marginTop: 6 }}>
            {coverage.blackstone_guardrail}
          </div>
        </div>
      ) : null}

      {coverage?.examples?.needsReviewUnmapped?.length ? (
        <div className="panel" style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div>
              <strong>Top accounts needing approval</strong>
              <div className="muted" style={{ marginTop: 4 }}>
                Brain-derived latest sync coverage; use the review queue below to approve, reject, or mark intentionally unmapped.
              </div>
            </div>
            <button type="button" className="btn" onClick={() => setStatus("needs_review")}>
              Show needs review
            </button>
          </div>
          <div className="table-scroll" style={{ marginTop: 10 }}>
            <table className="simple">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="num">Jobs</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {coverage.examples.needsReviewUnmapped.slice(0, 8).map((r) => (
                  <tr key={`${r.normalizedMorawareName || r.accountName}-${r.sourceAccountId || ""}`}>
                    <td>{r.accountName}</td>
                    <td className="num">{nf(r.jobCount)}</td>
                    <td>
                      <span className="pill pill-warn">{r.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="panel" style={{ marginTop: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ minWidth: 220 }}>
            <label>Search</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Moraware or Monday…" />
          </div>
          <div className="field">
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All</option>
              <option value="needs_review">Needs review</option>
              <option value="approved">Approved</option>
              <option value="unmatched">Unmatched</option>
              <option value="fuzzy">Fuzzy</option>
              <option value="rejected">Rejected</option>
              <option value="unmapped">Unmapped</option>
            </select>
          </div>
          <div className="field">
            <label>Min Sq.Ft.</label>
            <input value={minSqft} onChange={(e) => setMinSqft(e.target.value)} placeholder="0" />
          </div>
          <div className="field">
            <label>Match type</label>
            <input value={matchType} onChange={(e) => setMatchType(e.target.value)} placeholder="exact, fuzzy_suggested…" />
          </div>
          <div className="field">
            <label>Confidence</label>
            <select value={confidence} onChange={(e) => setConfidence(e.target.value)}>
              <option value="">Any</option>
              <option value="high">high</option>
              <option value="medium">medium</option>
              <option value="low">low</option>
              <option value="none">none</option>
            </select>
          </div>
          <div className="field">
            <label>Salesperson</label>
            <select value={salesperson} onChange={(e) => setSalesperson(e.target.value)}>
              <option value="">Any</option>
              {(repsBranches?.reps ?? []).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Branch</label>
            <select value={branch} onChange={(e) => setBranch(e.target.value)}>
              <option value="">Any</option>
              {(repsBranches?.branches ?? []).map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Sort</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="sqft">Sq.Ft.</option>
                <option value="account">Account</option>
                <option value="confidence">Confidence</option>
                <option value="matchType">Match type</option>
                <option value="salesperson">Salesperson</option>
                <option value="branch">Branch</option>
              </select>
              <select value={sortDir} onChange={(e) => setSortDir(e.target.value)}>
                <option value="desc">desc</option>
                <option value="asc">asc</option>
              </select>
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => void loadSuggestions()} disabled={busy}>
            {busy ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? <div className="banner banner-bad" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{error}</div> : null}

      <div className="table-scroll" style={{ marginTop: 14 }}>
        <table className="simple">
          <thead>
            <tr>
              <th>Moraware account</th>
              <th className="num">Report Sq.Ft.</th>
              <th className="num">Jobs</th>
              <th>Suggested Monday</th>
              <th>Suggested owner</th>
              <th>Branch</th>
              <th>Match</th>
              <th>Conf</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.normalizedMorawareName || r.morawareAccountName}>
                <td style={{ maxWidth: 320 }}>
                  <strong>{r.morawareAccountName}</strong>
                  {r.existingApprovedAlias ? (
                    <div className="muted" style={{ marginTop: 3, fontSize: 11 }}>
                      Approved: {String(r.existingApprovedAlias.monday_account_name ?? "—")} · {String(r.existingApprovedAlias.assigned_salesperson ?? "—")}
                    </div>
                  ) : null}
                </td>
                <td className="num">{nf(r.reportTotalSqft)}</td>
                <td className="num">{String(r.reportJobCount)}</td>
                <td style={{ maxWidth: 260 }}>{r.suggestedMondayAccountName || <span className="muted">—</span>}</td>
                <td>{r.suggestedSalesperson || <span className="muted">—</span>}</td>
                <td>{r.suggestedBranch || <span className="muted">—</span>}</td>
                <td>{r.matchType}</td>
                <td>{r.confidence}</td>
                <td>
                  <span className={pillClass(r.reviewStatus)}>{r.reviewStatus}</span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <button type="button" className="btn" onClick={() => setSelected(r)}>
                    Review
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={10} className="muted">
                  {busy ? "Loading…" : "No rows."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="drawer" style={{ width: 520 }}>
          <div className="drawer-top">
            <strong>Review mapping</strong>
            <button type="button" className="btn" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>

          <div className="drawer-section">
            <h4>Moraware account</h4>
            <div style={{ fontWeight: 700 }}>{selected.morawareAccountName}</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Report: {nf(selected.reportTotalSqft)} sf · {selected.reportJobCount} jobs
            </div>
            {selected.morawareJobSalespeople ? (
              <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                Job salespeople observed: {selected.morawareJobSalespeople}
              </div>
            ) : null}
          </div>

          <div className="drawer-section">
            <h4>Suggestion</h4>
            <div className="muted" style={{ fontSize: 12 }}>
              Match: <code>{selected.matchType}</code> · confidence <code>{selected.confidence}</code>
            </div>
            <div style={{ marginTop: 8 }}>
              Monday: <strong>{selected.suggestedMondayAccountName || "—"}</strong>
              <div className="muted" style={{ fontSize: 12 }}>
                Suggested owner: {selected.suggestedSalesperson || "—"} · Branch: {selected.suggestedBranch || "—"}
              </div>
            </div>
            {selected.matchType === "fuzzy_suggested" ? (
              <div className="banner banner-warn" style={{ marginTop: 10 }}>
                Fuzzy suggestion — requires explicit human approval.
              </div>
            ) : null}
          </div>

          <div className="drawer-section">
            <h4>Alternate matches</h4>
            {!selected.alternateMatches?.length ? (
              <div className="muted">—</div>
            ) : (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {selected.alternateMatches.slice(0, 3).map((a) => (
                  <li key={a.mondayAccountName}>
                    <strong>{a.mondayAccountName}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {(a.mondaySalesExecutive ? `owner ${a.mondaySalesExecutive}` : "owner —") +
                        (a.mondayBranch ? ` · branch ${a.mondayBranch}` : "") +
                        (a.score != null ? ` · score ${a.score}` : "")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="drawer-section">
            <h4>Approve / edit</h4>
            <div className="field">
              <label>Monday master account search</label>
              <input value={masterSearch} onChange={(e) => setMasterSearch(e.target.value)} placeholder="Type to search…" />
              {masterBusy ? <div className="muted">Searching…</div> : null}
              {masterResults.length ? (
                <select
                  value={masterPicked?.id ?? ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    const found = masterResults.find((r) => r.id === id) || null;
                    setMasterPicked(found);
                    if (found) {
                      if (!assignedSalesperson) setAssignedSalesperson(found.sales_executive || "");
                      if (!assignedBranch) setAssignedBranch(found.branch || "");
                    }
                  }}
                >
                  <option value="">(use suggestion / none)</option>
                  {masterResults.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.monday_account_name} {m.sales_executive ? `· ${m.sales_executive}` : ""} {m.branch ? `· ${m.branch}` : ""}
                    </option>
                  ))}
                </select>
              ) : null}
              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                If <code>sales_account_master</code> is empty, run the import script in write mode after installing schema. (No UI write-import in v1.)
              </div>
            </div>

            <div className="field">
              <label>Assigned salesperson</label>
              <select value={assignedSalesperson} onChange={(e) => setAssignedSalesperson(e.target.value)}>
                <option value="">Select…</option>
                {(repsBranches?.reps ?? []).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
                {(repsBranches?.houseOptions ?? []).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Branch</label>
              <select value={assignedBranch} onChange={(e) => setAssignedBranch(e.target.value)}>
                <option value="">Select…</option>
                {(repsBranches?.branches ?? []).map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Match type</label>
              <input value={pickedMatchType} onChange={(e) => setPickedMatchType(e.target.value)} placeholder="manual / exact / …" />
            </div>

            <div className="field">
              <label>Confidence</label>
              <select value={pickedConfidence} onChange={(e) => setPickedConfidence(e.target.value)}>
                <option value="high">high</option>
                <option value="medium">medium</option>
                <option value="low">low</option>
              </select>
            </div>

            <div className="field">
              <label>Notes / reason (required when changing approved mapping)</label>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why this mapping/override?" />
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary" onClick={() => void approve()} disabled={schemaMissing}>
                Approve mapping
              </button>
              <button type="button" className="btn" onClick={() => void reject()} disabled={schemaMissing}>
                Reject
              </button>
              <button type="button" className="btn" onClick={() => void markUnmapped()} disabled={schemaMissing}>
                Mark unmapped
              </button>
              {(repsBranches?.houseOptions ?? []).map((h) => (
                <button key={h} type="button" className="btn" onClick={() => void assignHouse(h)} disabled={schemaMissing}>
                  Assign {h}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

