import React, { useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "../lib/api";

const SCHEMA_HEALTH = "/api/admin/identity-resolution/schema-health";
const SUMMARY = "/api/admin/identity-resolution/summary";

type SchemaHealthResp = {
  ok: boolean;
  installed?: boolean;
  requiredTables?: string[];
  missingTables?: string[];
  message?: string;
};

type Counts = {
  entities: number;
  sourceRecords: number;
  activeLinks: number;
  needsReviewSuggestions: number;
  auditEvents: number;
};

type SummaryResp = {
  ok: boolean;
  installed?: boolean;
  missingTables?: string[];
  message?: string;
  counts: Counts | null;
  resolverReadiness?: {
    identityResolverModuleLoaded?: boolean;
    normalizeEntityNameSample?: string;
    note?: string;
  };
};

export default function IdentityResolutionReadiness({ token }: { token: string }) {
  const [schema, setSchema] = useState<SchemaHealthResp | null>(null);
  const [summary, setSummary] = useState<SummaryResp | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    try {
      const [sHealth, sSum] = await Promise.all([
        apiFetch(SCHEMA_HEALTH, { token }) as Promise<SchemaHealthResp>,
        apiFetch(SUMMARY, { token }) as Promise<SummaryResp>
      ]);
      setSchema(sHealth);
      setSummary(sSum);
    } catch (e) {
      setSchema(null);
      setSummary(null);
      setErr(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const installed = schema?.installed === true && (schema.missingTables?.length ?? 0) === 0;
  const missing = schema?.missingTables?.length ? schema.missingTables : summary?.missingTables ?? [];

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Identity Resolution (foundation)</h2>
      <p className="muted" style={{ marginBottom: 12 }}>
        Readiness only: schema detection and row counts. This is <strong>not</strong> an active mapping workflow—no
        approve/reject or source matching here. Sales Account Mapping Admin continues to own sales crosswalk review.
      </p>

      <p className="muted" style={{ marginBottom: 16, fontSize: 13 }}>
        Architecture reference (repo): <code style={{ fontSize: 12 }}>docs/EOS_BRAIN_IDENTITY_RESOLUTION_ARCHITECTURE.md</code>
        {" · "}
        Additive SQL proposal: <code style={{ fontSize: 12 }}>backend-core/supabase/eos_identity_resolution.sql</code>
      </p>

      {err ? (
        <div className="panel" style={{ borderColor: "rgba(248,113,113,0.35)" }}>
          <strong>Could not load readiness</strong>
          <p className="muted" style={{ marginTop: 8 }}>
            {err}
          </p>
        </div>
      ) : null}

      <div
        className={`schema-card ${installed ? "healthy" : schema ? "setup" : ""}`}
        style={!schema && !err ? { borderColor: "rgba(255,255,255,0.08)" } : undefined}
      >
        <strong>Identity Resolution schema</strong>
        {!schema && !err ? (
          <div className="muted" style={{ marginTop: 6 }}>
            Checking tables…
          </div>
        ) : schema && !installed ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ color: "#fcd34d" }}>Not installed</div>
            <p className="muted" style={{ marginTop: 6 }}>
              {schema.message ?? "Identity Resolution schema has not been applied yet."}
            </p>
            {missing.length ? (
              <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                Missing tables:{" "}
                <span style={{ color: "#fed7aa" }}>{missing.join(", ")}</span>
              </div>
            ) : null}
          </div>
        ) : schema && installed ? (
          <div className="muted" style={{ marginTop: 6 }}>
            {schema.message ?? "Identity Resolution schema is installed."}
          </div>
        ) : null}
      </div>

      {installed && summary?.counts ? (
        <div className="stat-grid" style={{ marginTop: 16 }}>
          <div className="stat-card">
            <div className="stat-value">{summary.counts.entities}</div>
            <div className="stat-label">Canonical entities</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.counts.sourceRecords}</div>
            <div className="stat-label">Source records</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.counts.activeLinks}</div>
            <div className="stat-label">Active links</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.counts.needsReviewSuggestions}</div>
            <div className="stat-label">Suggestions (needs_review)</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{summary.counts.auditEvents}</div>
            <div className="stat-label">Audit events</div>
          </div>
        </div>
      ) : null}

      {installed && summary && !summary.counts && summary.message ? (
        <p className="muted" style={{ marginTop: 12, color: "#fdba74" }}>
          {summary.message}
        </p>
      ) : null}

      {summary?.resolverReadiness ? (
        <div className="panel" style={{ marginTop: 16 }}>
          <strong>Resolver module (non-invasive)</strong>
          <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
            {summary.resolverReadiness.note}
          </p>
          {summary.resolverReadiness.normalizeEntityNameSample != null ? (
            <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              Sample <code>normalizeEntityName</code>: <code>{summary.resolverReadiness.normalizeEntityNameSample}</code>
            </p>
          ) : null}
        </div>
      ) : null}

      <button type="button" className="btn" style={{ marginTop: 14 }} onClick={() => void load()}>
        Refresh
      </button>
    </div>
  );
}
