import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ApiError, apiFetch } from "../lib/api";
import { fetchSchemaHealth, SCHEMA_HEALTH_PATH, type SchemaHealthResp } from "../lib/schemaHealth";
import { supabase } from "../lib/supabase";
import MorawareAdmin from "./MorawareAdmin";
import SalesAccountMappingAdmin from "./SalesAccountMappingAdmin";
import IdentityResolutionReadiness from "./IdentityResolutionReadiness";
import QuotePricingAdminView from "./QuotePricingAdminView";
import QuotePipelinePanel from "./QuotePipelinePanel";

/** User-management router is mounted here and under `/api/admin` (same handlers). */
const USER_MGMT_API = "/api/system-admin";

const PRICING_ADMIN_URL = String(
  (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_HEAD_URL_PRICING_ADMIN ??
    "https://pricing.eliteosfab.com"
)
  .trim()
  .replace(/\/+$/, "");

/**
 * Protected-head shell — brand architecture mirrors Home Launcher /
 * Quote Library / Internal Estimate / Pricing Admin.
 *
 * System Admin already calls `/api/me` for role enforcement, so the
 * topbar user chip can use that payload for display name + email + role
 * without any new backend call. Workspace identity is still derived
 * client-side from the platform default constants (single-tenant today;
 * resolver can pull `organization_logo_url` later).
 *
 * See `docs/eliteos/eliteos-ui-direction.md` §13 (Protected head app
 * shell) for the template this pattern is locked to.
 */
const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";
const DEFAULT_WORKSPACE_SHORT = "ESF";
/** Elite Stone Fabrication logo fallback — keeps the workspace panel
 *  visually anchored even before a backend logo field exists. */
const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

function resolveWorkspaceName(): string {
  return DEFAULT_WORKSPACE_NAME;
}

function resolveWorkspaceShortId(): string {
  return DEFAULT_WORKSPACE_SHORT;
}

function resolveWorkspaceLogoUrl(): string | null {
  return EOS_LOGO_URL || null;
}

function workspaceInitialsValue(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "ES"
  );
}

function homeLauncherUrl(): string {
  const raw = String(import.meta.env.VITE_HEAD_URL_HOME ?? "").trim();
  return raw.replace(/\/+$/, "") || "https://www.eliteosfab.com";
}

function deriveDisplayNameFromEmail(email: string): string {
  const e = String(email || "").trim();
  if (!e) return "";
  const local = e.includes("@") ? e.split("@")[0] : e;
  const words = local.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return e;
  return words.map((w) => w[0]?.toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function userInitialsFor(name: string, email: string): string {
  const n = String(name || "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }
  const e = String(email || "").trim();
  if (e) {
    const local = e.includes("@") ? e.split("@")[0] : e;
    const parts = local.replace(/[._-]+/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return local.slice(0, 2).toUpperCase();
  }
  return "ES";
}

type MainNavView =
  | "people"
  | "organizations"
  | "invite_users"
  | "audit"
  | "diagnostics"
  | "sales_mapping"
  | "moraware"
  | "identity_resolution";

/** Visible near credential actions — admins never observe other users’ secrets. */
const PASSWORD_GOVERNANCE_NOTE =
  "Passwords are managed by Supabase Auth. Admins can invite users or send reset links, but cannot view passwords.";

type HeadCatalogEntry = {
  slug: string;
  title: string;
  description?: string | null;
  ui_alias?: string | null;
};

function privilegedApplicationRole(role: unknown): boolean {
  const r = String(role ?? "").trim().toLowerCase();
  return r === "admin" || r === "super_admin";
}

function headDisplayLabel(slug: string, catalog: HeadCatalogEntry[] | undefined): string {
  const row = catalog?.find((x) => x.slug === slug);
  const title = String(row?.title ?? "").trim();
  const alias = row?.ui_alias ? String(row.ui_alias).replace(/_/g, " ") : "";
  if (title && alias) return `${title} (${alias})`;
  if (title) return title;
  return slug;
}

type MeResp = {
  ok: boolean;
  user: { id: string; email: string; role: string; fullName?: string };
};

type DealerAccessBrief = Record<string, unknown> & {
  dealer_account_id?: string;
  pricing_group_id?: string | null;
  dealer_account_name?: string | null;
  pricing_group_code?: string | null;
  pricing_group_label?: string | null;
};

type AdminRow = Record<string, unknown> & {
  id: string;
  email?: string | null;
  full_name?: string | null;
  role?: string | null;
  department?: string | null;
  user_kind?: string | null;
  is_active?: boolean | null;
  user_kind_normalized?: string;
  dealer_account_name_primary?: string | null;
  pricing_group_summary?: string | null;
  last_login_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  organization_id?: string | null;
  allowed_heads_list?: string[];
  dealer_access?: DealerAccessBrief[];
  auth_summary?: UserAuthSummary | null;
};

type ReferenceResp = {
  ok: boolean;
  heads: string[];
  head_catalog?: HeadCatalogEntry[];
  roles: string[];
  dealers: { id: string; account_name: string }[];
  pricing_groups: { id: string; code: string; label: string | null }[];
};

type UserDetailResp = Record<string, unknown> & {
  ok: boolean;
  profile?: AdminRow & { allowed_heads_list?: string[] };
  head_access_rows?: { head_slug?: string | null; created_at?: string | null }[];
  dealer_account_access?: DealerAccess[];
  login_summary?: { recent: LoginRow[]; total: number };
  action_summary?: { recent: ActionRow[]; total: number };
  auth_summary?: UserAuthSummary;
};

type UserAuthSummary = {
  present?: boolean;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  invited_at?: string | null;
  confirmation_sent_at?: string | null;
  auth_error?: string | null;
};

type DealerAccess = Record<string, unknown> & {
  dealer_account_id: string;
  dealer_role?: string | null;
  can_view_all_dealer_quotes?: boolean;
  can_manage_dealer_users?: boolean;
  is_active?: boolean;
  dealer_account?: { account_name?: string | null };
  pricing_group?: { code?: string | null; label?: string | null } | null;
};

type LoginRow = { created_at?: string; event_type?: string | null };

type ActionRow = { created_at?: string; action_type?: string | null; entity_type?: string | null };

type AuditEventsResp = {
  ok?: boolean;
  auth_events?: Array<Record<string, unknown>>;
  action_events?: Array<Record<string, unknown>>;
  warnings?: string[];
};

type MorawareRunSummary = {
  id?: string | null;
  status?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms?: number | null;
  row_counts?: Record<string, number | null>;
  data_quality_counts?: Record<string, number | null>;
  import_group_id?: string | null;
  chunk_index?: number | null;
  chunk_count?: number | null;
};

type MorawareGroupSummary = {
  import_group_id?: string | null;
  chunk_count?: number | null;
  expected_chunk_count?: number | null;
  successful_chunks?: number | null;
  failed_chunks?: number | null;
  total_row_counts?: Record<string, number | null>;
  data_quality_counts?: Record<string, number | null>;
};

type MorawareSyncStatusResp = {
  ok?: boolean;
  latest_run?: MorawareRunSummary | null;
  last_successful_run?: MorawareRunSummary | null;
  latest_import_group_id?: string | null;
  latest_group?: MorawareGroupSummary | null;
  last_sync_age_seconds?: number | null;
  stale_warning_threshold_seconds?: number | null;
  stale_warning?: boolean;
  latest_group_data_quality_count?: number | null;
  open_historical_data_quality_count?: number | null;
  latest_group_health_status?: string | null;
  row_counts?: Record<string, number | null>;
  data_quality_counts?: Record<string, number | null>;
  data_quality_severity_counts?: Record<string, number | null>;
  recent_error_count?: number;
  known_gaps?: string[];
};

function fmt(dt: unknown) {
  if (!dt) return "—";
  try {
    return new Date(String(dt)).toLocaleString();
  } catch {
    return String(dt);
  }
}

function fmtNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString() : "0";
}

function fmtAge(seconds: unknown) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return "No successful sync yet";
  if (n < 60) return `${Math.round(n)}s ago`;
  if (n < 3600) return `${Math.round(n / 60)}m ago`;
  if (n < 86400) return `${Math.round(n / 3600)}h ago`;
  return `${Math.round(n / 86400)}d ago`;
}

function sumCounts(counts: Record<string, number | null> | undefined | null) {
  return Object.values(counts || {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

function fmtReadableDate(dt: unknown, empty = "Not recorded yet") {
  if (!dt) return empty;
  return fmt(dt);
}

function titleizeToken(value: unknown, fallback = "Not assigned") {
  const s = String(value ?? "").trim();
  if (!s) return fallback;
  return s
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function setupStatus(profile: Pick<AdminRow, "role" | "allowed_heads_list" | "is_active"> | undefined, auth?: UserAuthSummary | null) {
  const hasProfile = Boolean(profile);
  const confirmed = Boolean(auth?.email_confirmed_at);
  const roleAssigned = Boolean(String(profile?.role ?? "").trim());
  const toolsAssigned = Boolean(profile?.allowed_heads_list?.length);
  const active = profile?.is_active !== false;
  const complete = hasProfile && confirmed && roleAssigned && toolsAssigned && active;
  const waitingOnUser = hasProfile && !confirmed && auth?.present !== false;
  return {
    complete,
    waitingOnUser,
    confirmed,
    roleAssigned,
    toolsAssigned,
    active,
    label: complete ? "Ready" : waitingOnUser ? "Invite pending" : "Needs setup",
    pillClass: complete ? "pill-good" : waitingOnUser ? "pill-warn" : "pill-neutral"
  };
}

function inviteStatusLabel(auth?: UserAuthSummary | null) {
  if (auth?.auth_error) return "Auth status unavailable";
  if (!auth?.present) return "No Auth user";
  if (auth.email_confirmed_at) return "Accepted";
  if (auth.invited_at || auth.confirmation_sent_at) return "Invite pending";
  return "Not confirmed";
}

function lastSignInText(row: AdminRow, auth?: UserAuthSummary | null) {
  return fmtReadableDate(auth?.last_sign_in_at ?? row.last_login_at, "No sign-in recorded");
}

function UserSnapshot({ profile, detail }: { profile: AdminRow; detail: UserDetailResp | null }) {
  const normKind = String(profile.user_kind_normalized ?? "").trim();
  const dbKind = String(profile.user_kind ?? "").trim();
  const heads = [...new Set(profile.allowed_heads_list ?? [])].sort((a, b) => a.localeCompare(b));
  const dealers = detail?.dealer_account_access ?? [];
  const auth = detail?.auth_summary ?? profile.auth_summary;
  const readiness = setupStatus(profile, auth);

  return (
    <div className="drawer-section">
      <h4>Overview</h4>
      <div className="readiness-panel">
        <div>
          <div className="readiness-title">Beta setup readiness</div>
          <div className="muted">Profile, Auth, role, tools, and active-account checks.</div>
        </div>
        <span className={`pill ${readiness.pillClass}`}>{readiness.label}</span>
        <div className="readiness-checks">
          <span className={`mini-check ${profile ? "ok" : "missing"}`}>Profile</span>
          <span className={`mini-check ${readiness.confirmed ? "ok" : "missing"}`}>Email confirmed</span>
          <span className={`mini-check ${readiness.roleAssigned ? "ok" : "missing"}`}>Role</span>
          <span className={`mini-check ${readiness.toolsAssigned ? "ok" : "missing"}`}>Tools</span>
          <span className={`mini-check ${readiness.active ? "ok" : "missing"}`}>Active</span>
        </div>
      </div>
      <dl className="detail-dl">
        <dt>Email</dt>
        <dd>{String(profile.email ?? "—")}</dd>
        <dt>Full name</dt>
        <dd>{String(profile.full_name ?? "—")}</dd>
        <dt>Role</dt>
        <dd>{titleizeToken(profile.role)}</dd>
        <dt>Department</dt>
        <dd>{String(profile.department ?? "—")}</dd>
        <dt>Organization</dt>
        <dd>
          {profile.organization_id ? (
            <code style={{ fontSize: 12 }} title={String(profile.organization_id)}>
              {String(profile.organization_id)}
            </code>
          ) : (
            "—"
          )}
        </dd>
        <dt>User kind</dt>
        <dd>
          {(dbKind || normKind || "internal").trim()}
          {normKind && dbKind !== normKind ? (
            <span className="muted" style={{ display: "block", fontSize: 11, marginTop: 2 }}>
              (normalized: {normKind})
            </span>
          ) : null}
        </dd>
        <dt>Account status</dt>
        <dd>
          <span className={`pill ${profile.is_active !== false ? "pill-good" : "pill-bad"}`}>
            {profile.is_active !== false ? "Active" : "Inactive"}
          </span>
        </dd>
        {auth?.present ? (
          <>
            <dt>Invite status</dt>
            <dd className="muted" style={{ fontSize: 12 }}>
              {auth.email_confirmed_at ? (
                <>Accepted · email confirmed {fmt(auth.email_confirmed_at)}</>
              ) : (
                <>Invite pending — use <strong>Resend invite</strong> if the setup link expired.</>
              )}
              {auth.invited_at ? (
                <>
                  <br />
                  Invited {fmt(auth.invited_at)}
                </>
              ) : null}
            </dd>
          </>
        ) : auth?.auth_error ? (
          <>
            <dt>Invite status</dt>
            <dd className="muted" style={{ fontSize: 12 }}>
              Could not load auth flags ({auth.auth_error}). Actions below still call the Brain.
            </dd>
          </>
        ) : null}
        <dt>Setup</dt>
        <dd>
          <span className={`pill ${readiness.pillClass}`}>{readiness.label}</span>
        </dd>
        <dt>Last sign-in</dt>
        <dd>
          {lastSignInText(profile, auth)}
          {!auth?.last_sign_in_at && !profile.last_login_at ? (
            <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
              Sign-in tracking appears after the next recorded launcher/API login event.
            </div>
          ) : null}
        </dd>
        <dt>Created</dt>
        <dd>{fmt(profile.created_at)}</dd>
        <dt>Updated</dt>
        <dd>{fmt(profile.updated_at)}</dd>
        <dt>Assigned tools</dt>
        <dd>
          {heads.length ? (
            <div className="tool-chip-row">
              {heads.map((h) => (
                <span className="tool-chip" key={h}>
                  {headDisplayLabel(h, undefined)}
                </span>
              ))}
            </div>
          ) : (
            "No tools assigned"
          )}
        </dd>
        <dt>Dealer / account access</dt>
        <dd>
          {!dealers.length ? (
            "—"
          ) : (
            <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {dealers.map((d) => {
                const dn = String(d.dealer_account?.account_name ?? "").trim() || "(unnamed)";
                const pr = d.pricing_group;
                const pg =
                  typeof pr === "object" && pr
                    ? [String(pr.code ?? "").trim(), String(pr.label ?? "").trim()].filter(Boolean).join(" · ").trim()
                    : "";
                return (
                  <li key={`${String(d.dealer_account_id)}`} style={{ marginBottom: 6 }}>
                    <strong>{dn}</strong>
                    <div className="muted" style={{ fontSize: 11 }}>
                      id {String(d.dealer_account_id)}
                      {" · "}role {d.dealer_role != null ? String(d.dealer_role) : "(none)"}{" · "}view-all{" "}
                      {String(d.can_view_all_dealer_quotes === true)}{" · "}manage-users{" "}
                      {String(d.can_manage_dealer_users === true)}
                      {pg ? ` · pricing: ${pg}` : " · pricing: —"}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </dd>
        <dt>Pricing group (assignment)</dt>
        <dd>
          {String(profile.pricing_group_summary ?? "—")}
          {dealers.some((x) => x.pricing_group) ? (
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              See per-account detail above — values come from quoting assignments.
            </div>
          ) : null}
        </dd>
      </dl>
      {detail?.head_access_rows?.length ? (
        <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
          Head rows in DB ({detail.head_access_rows.length}) — audits use timestamps below.
          <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>
            {[...detail.head_access_rows].map((hr, idx) => (
              <li key={`${hr.head_slug ?? ""}-${idx}`}>
                <code>{String(hr.head_slug ?? "")}</code> · assigned {fmt(hr.created_at)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function UserLifecycleActions({
  detail,
  selectedId,
  token,
  actorUserId,
  onRefresh,
  onUserDeleted,
  pushToast
}: {
  detail: UserDetailResp | null;
  selectedId: string;
  token: string;
  actorUserId: string;
  onRefresh: () => void | Promise<void>;
  onUserDeleted?: () => void;
  pushToast: (kind: "info" | "error", text: string) => void;
}) {
  const profile = detail?.profile as AdminRow | undefined;
  const auth = detail?.auth_summary;
  const confirmed = Boolean(auth?.email_confirmed_at);
  const inactive = profile?.is_active === false;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const suggestInvite = auth?.present ? !confirmed : false;

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
      await onRefresh();
    } catch (e: unknown) {
      pushToast("error", e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="drawer-section lifecycle-card">
      <h4>Account actions</h4>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
        {suggestInvite
          ? "This account has not confirmed email in Supabase yet — resend the invite instead of a password reset."
          : confirmed
            ? "Confirmed user — password reset sends a recovery link to eliteOS Home."
            : "Auth metadata unavailable — use the actions that match your situation."}
      </p>
      <div className="lifecycle-actions">
        {suggestInvite || !auth?.present ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy !== null}
            onClick={() =>
              void run("resend", async () => {
                const j = (await apiFetch(`${USER_MGMT_API}/users/${encodeURIComponent(selectedId)}/resend-invite`, {
                  token,
                  method: "POST",
                  body: {}
                })) as { code?: string; message?: string };
                pushToast("info", j?.message ?? "Invite sent.");
              })
            }
          >
            {busy === "resend" ? "Sending…" : "Resend invite"}
          </button>
        ) : null}
        {confirmed ? (
          <button
            type="button"
            className="btn"
            disabled={busy !== null}
            onClick={() => {
              if (!window.confirm(`Send password reset for ${String(profile?.email ?? "this user")}?`)) return;
              void run("reset", async () => {
                const j = (await apiFetch(`${USER_MGMT_API}/users/${encodeURIComponent(selectedId)}/send-password-reset`, {
                  token,
                  method: "POST",
                  body: {}
                })) as { code?: string; message?: string };
                pushToast("info", j?.message ?? "Password reset sent.");
              });
            }}
          >
            {busy === "reset" ? "Sending…" : "Send password reset"}
          </button>
        ) : null}
        {!inactive ? (
          <button
            type="button"
            className="btn btn-warn"
            disabled={busy !== null || actorUserId === selectedId}
            onClick={() => {
              if (actorUserId === selectedId) {
                pushToast("error", "You cannot deactivate your own account here.");
                return;
              }
              if (!window.confirm(`Deactivate ${String(profile?.email ?? "this user")}? They will lose launcher access.`))
                return;
              void run("deact", async () => {
                const j = (await apiFetch(`${USER_MGMT_API}/users/${encodeURIComponent(selectedId)}/deactivate`, {
                  token,
                  method: "PATCH",
                  body: {}
                })) as { code?: string; message?: string };
                pushToast("info", j?.message ?? "User deactivated.");
              });
            }}
          >
            {busy === "deact" ? "Updating…" : "Deactivate"}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy !== null}
            onClick={() =>
              void run("react", async () => {
                const j = (await apiFetch(`${USER_MGMT_API}/users/${encodeURIComponent(selectedId)}/reactivate`, {
                  token,
                  method: "PATCH",
                  body: {}
                })) as { code?: string; message?: string };
                pushToast("info", j?.message ?? "User reactivated.");
              })
            }
          >
            {busy === "react" ? "Updating…" : "Reactivate"}
          </button>
        )}
        <button
          type="button"
          className="btn btn-danger-ghost"
          disabled={busy !== null || actorUserId === selectedId}
          onClick={() => {
            setDeleteConfirm("");
            setDeleteOpen(true);
          }}
        >
          Delete test user…
        </button>
      </div>
      {actorUserId === selectedId ? (
        <p className="safety-callout" style={{ marginTop: 10 }}>
          You cannot delete or deactivate your own account from this drawer.
        </p>
      ) : null}
      <p className="safety-callout" style={{ marginTop: 10 }}>
        {PASSWORD_GOVERNANCE_NOTE} Prefer <strong>deactivate</strong> for real users. Hard delete removes Auth + profile
        only when safe.
      </p>

      {deleteOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteOpen(false);
          }}
        >
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h4 style={{ marginTop: 0 }}>Delete user permanently</h4>
            <p className="muted" style={{ fontSize: 13 }}>
              Type <code>DELETE</code> or the user&apos;s email <code>{String(profile?.email ?? "")}</code> to confirm.
              Blocked if the user has quote or audit rows, or is the last admin.
            </p>
            <div className="field">
              <label htmlFor="del-confirm">Confirmation</label>
              <input
                id="del-confirm"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                autoComplete="off"
                placeholder="DELETE or email"
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => setDeleteOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy !== null}
                onClick={() =>
                  void run("delete", async () => {
                    const j = (await apiFetch(`${USER_MGMT_API}/users/${encodeURIComponent(selectedId)}`, {
                      token,
                      method: "DELETE",
                      body: { confirm: deleteConfirm.trim() }
                    })) as { code?: string; message?: string };
                    pushToast("info", j?.message ?? "User deleted.");
                    setDeleteOpen(false);
                    setDeleteConfirm("");
                    onUserDeleted?.();
                  })
                }
              >
                {busy === "delete" ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MorawareSyncStatusCard({
  status,
  loading,
  error,
  onRefresh
}: {
  status: MorawareSyncStatusResp | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
}) {
  const latest = status?.latest_run;
  const success = status?.last_successful_run;
  const group = status?.latest_group;
  const groupRows = group?.total_row_counts || {};
  const rowsSynced = sumCounts(groupRows) || sumCounts(status?.row_counts);
  const latestGroupWarnings = Number(status?.latest_group_data_quality_count ?? sumCounts(group?.data_quality_counts));
  const historicalWarnings = Number(status?.open_historical_data_quality_count ?? sumCounts(status?.data_quality_counts));
  const latestGroupHealthy = status?.latest_group_health_status === "healthy";
  const pillClass = loading ? "pill-neutral" : error ? "pill-bad" : latestGroupHealthy ? "pill-good" : "pill-warn";
  const pillText = loading ? "Checking" : error ? "Unavailable" : latestGroupHealthy ? "Healthy" : "Needs review";

  return (
    <div className="admin-card moraware-sync-card">
      <div className="card-heading-row">
        <div>
          <h3 style={{ marginTop: 0 }}>Moraware Sync Status</h3>
          <p className="muted" style={{ marginTop: 4 }}>
            Aggregate sync health only. This panel does not expose customer, job, credential, or raw payload data.
          </p>
        </div>
        <div className="card-heading-actions">
          <span className={`pill ${pillClass}`}>{pillText}</span>
          <button type="button" className="btn" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {loading && !status ? (
        <p className="muted">Loading Moraware sync health…</p>
      ) : error ? (
        <div className="error-card" style={{ marginBottom: 0 }}>
          <strong>Unable to load Moraware sync health</strong>
          <p>{error}</p>
        </div>
      ) : !status ? (
        <p className="muted">No Moraware sync status loaded yet.</p>
      ) : (
        <>
          <div className="stat-grid moraware-stat-grid">
            <div className="stat-card">
              <div className="stat-value">{fmtAge(status.last_sync_age_seconds)}</div>
              <div className="stat-label">Last success</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{fmtNumber(rowsSynced)}</div>
              <div className="stat-label">Rows in latest group</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                {group ? `${fmtNumber(group.successful_chunks)}/${fmtNumber(group.expected_chunk_count || group.chunk_count)}` : "—"}
              </div>
              <div className="stat-label">Chunks successful</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{fmtNumber(latestGroupWarnings)}</div>
              <div className="stat-label">Latest group warnings</div>
            </div>
            <div className="stat-card stat-card-muted">
              <div className="stat-value">{fmtNumber(historicalWarnings)}</div>
              <div className="stat-label">Historical open warnings</div>
            </div>
          </div>

          <div className="moraware-sync-grid">
            <div>
              <h4>Latest run</h4>
              <dl className="compact-dl">
                <dt>Status</dt>
                <dd>{titleizeToken(latest?.status, "Unknown")}</dd>
                <dt>Started</dt>
                <dd>{fmt(latest?.started_at)}</dd>
                <dt>Finished</dt>
                <dd>{fmt(latest?.finished_at)}</dd>
                <dt>Last success</dt>
                <dd>{fmt(success?.finished_at)}</dd>
              </dl>
            </div>
            <div>
              <h4>Latest chunk group</h4>
              <dl className="compact-dl">
                <dt>Group ID</dt>
                <dd className="mono-break">{status.latest_import_group_id || "No chunk group recorded"}</dd>
                <dt>Chunk count</dt>
                <dd>{group ? `${fmtNumber(group.chunk_count)} recorded / ${fmtNumber(group.expected_chunk_count || group.chunk_count)} expected` : "—"}</dd>
                <dt>Failed chunks</dt>
                <dd>{fmtNumber(group?.failed_chunks)}</dd>
              </dl>
            </div>
          </div>

          <div className="moraware-sync-grid">
            <div>
              <h4>Rows synced</h4>
              <div className="readiness-checks">
                {Object.entries(groupRows).length ? (
                  Object.entries(groupRows).map(([key, value]) => (
                    <span key={key} className="mini-check ok">
                      {titleizeToken(key)}: {fmtNumber(value)}
                    </span>
                  ))
                ) : (
                  <span className="mini-check missing">No latest group row counts</span>
                )}
              </div>
            </div>
            <div>
              <h4>Known gaps</h4>
              <div className="readiness-checks">
                {(status.known_gaps || []).map((gap) => (
                  <span key={gap} className="mini-check missing">
                    {gap}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function App() {
  const [sessionToken, setSessionToken] = useState("");
  const [session, setSession] = useState<Session | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  const [me, setMe] = useState<MeResp | null>(null);

  const [schemaHealthResult, setSchemaHealthResult] = useState<SchemaHealthResp | null>(null);
  const [schemaHealthProbeError, setSchemaHealthProbeError] = useState<string | null>(null);
  const [schemaHealthDevMeta, setSchemaHealthDevMeta] = useState<{
    path: string;
    url: string;
    httpStatus: number | null;
    detail?: string;
  } | null>(null);
  const [morawareStatus, setMorawareStatus] = useState<MorawareSyncStatusResp | null>(null);
  const [morawareStatusLoading, setMorawareStatusLoading] = useState(false);
  const [morawareStatusError, setMorawareStatusError] = useState("");
  const [reference, setReference] = useState<ReferenceResp | null>(null);
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [listError, setListError] = useState("");
  const [toast, setToast] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [activeView, setActiveView] = useState<MainNavView>("people");
  const [diagnosticsTab, setDiagnosticsTab] = useState<"overview" | "quote_pipeline" | "legacy_pricing">("overview");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetailResp | null>(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [headFilter, setHeadFilter] = useState<string>("");
  const [dealerFilter, setDealerFilter] = useState<string>("");
  const [pricingFilter, setPricingFilter] = useState<string>("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("");
  const [inviteKind, setInviteKind] = useState<string>("internal");
  const [inviteDepartment, setInviteDepartment] = useState("");
  const [inviteOrganizationId, setInviteOrganizationId] = useState("");
  const [inviteHeadPick, setInviteHeadPick] = useState<Record<string, boolean>>({});
  const [inviteBusy, setInviteBusy] = useState(false);
  const [auditUserId, setAuditUserId] = useState("");
  const [auditTool, setAuditTool] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditOutcome, setAuditOutcome] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [auditBusy, setAuditBusy] = useState(false);
  const [auditEvents, setAuditEvents] = useState<AuditEventsResp | null>(null);
  const [auditError, setAuditError] = useState("");

  /**
   * Protected-head topbar identity. All values are derived from data that
   * is *already* loaded by this head (`session.user` and `/api/me`) — no
   * new backend call is added by the shell pass. Role is shown because
   * `/api/me` is already the source of truth for head authorization here.
   */
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const homeBase = useMemo(() => homeLauncherUrl(), []);
  const workspaceName = useMemo(() => resolveWorkspaceName(), []);
  const workspaceShortId = useMemo(() => resolveWorkspaceShortId(), []);
  const workspaceLogoUrl = useMemo(() => resolveWorkspaceLogoUrl(), []);
  const workspaceInitials = useMemo(() => workspaceInitialsValue(workspaceName), [workspaceName]);

  const sessionEmail = useMemo(() => String(session?.user?.email ?? ""), [session?.user?.email]);
  const meEmail = useMemo(() => String(me?.user?.email ?? ""), [me?.user?.email]);
  const meFullName = useMemo(() => String(me?.user?.fullName ?? ""), [me?.user?.fullName]);
  const meRole = useMemo(() => String(me?.user?.role ?? ""), [me?.user?.role]);
  const userDisplayName = useMemo(
    () => meFullName || deriveDisplayNameFromEmail(meEmail || sessionEmail) || "Signed in",
    [meFullName, meEmail, sessionEmail]
  );
  const userDisplayEmail = useMemo(() => meEmail || sessionEmail, [meEmail, sessionEmail]);
  const userDisplayInitials = useMemo(
    () => userInitialsFor(meFullName, meEmail || sessionEmail),
    [meFullName, meEmail, sessionEmail]
  );

  /** Close user menu on outside click / Escape. */
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!userMenuRef.current) return;
      if (!userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [userMenuOpen]);

  function pushToast(kind: "info" | "error", text: string) {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 4500);
  }

  const canOperate = privilegedApplicationRole(me?.user?.role);

  const loadMorawareStatus = useCallback(async (token: string) => {
    setMorawareStatusLoading(true);
    setMorawareStatusError("");
    try {
      const status = (await apiFetch("/api/moraware-sync/status", { token })) as MorawareSyncStatusResp;
      setMorawareStatus(status);
    } catch (e: unknown) {
      setMorawareStatus(null);
      setMorawareStatusError(e instanceof ApiError ? e.message : String((e as Error)?.message ?? e));
    } finally {
      setMorawareStatusLoading(false);
    }
  }, []);

  const loadCore = useCallback(
    async (token: string) => {
      setListError("");
      const m = (await apiFetch("/api/me", { token })) as MeResp;
      setMe(m);
      if (!privilegedApplicationRole(m.user.role)) {
        setRows([]);
        setReference(null);
        setSchemaHealthResult(null);
        setSchemaHealthProbeError(null);
        setSchemaHealthDevMeta(null);
        setMorawareStatus(null);
        setMorawareStatusError("");
        setSelectedId(null);
        setDetail(null);
        setListError("This head requires admin or super_admin role.");
        return;
      }

      setSchemaHealthResult(null);
      setSchemaHealthProbeError(null);
      if (import.meta.env.DEV) setSchemaHealthDevMeta(null);

      const ref = (await apiFetch(`${USER_MGMT_API}/reference`, { token })) as ReferenceResp;
      setReference(ref);

      const probe = await fetchSchemaHealth(token);
      if (probe.outcome === "ok") {
        setSchemaHealthResult(probe.data);
        if (import.meta.env.DEV) {
          setSchemaHealthDevMeta({ path: SCHEMA_HEALTH_PATH, url: probe.url, httpStatus: 200 });
        }
      } else {
        const detail =
          probe.outcome === "http_error"
            ? `HTTP ${probe.httpStatus}: ${probe.detail}`
            : probe.outcome === "network_error"
              ? probe.message
              : probe.detail;
        setSchemaHealthProbeError(detail);
        const httpStatus =
          probe.outcome === "http_error"
            ? probe.httpStatus
            : probe.outcome === "invalid_body"
              ? 200
              : null;
        if (import.meta.env.DEV) {
          setSchemaHealthDevMeta({
            path: SCHEMA_HEALTH_PATH,
            url: probe.url,
            httpStatus,
            detail
          });
        }
      }
      const roster = (await apiFetch(`${USER_MGMT_API}/users`, { token })) as { ok?: boolean; rows?: AdminRow[] };
      setRows(Array.isArray(roster.rows) ? roster.rows : []);
      await loadMorawareStatus(token);
    },
    [loadMorawareStatus, setMe]
  );

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      const t = s?.access_token ?? "";
      if (!mounted) return;
      setSession(s);
      setSessionToken(t);
      if (t) void loadCore(t).catch((e: unknown) => setListError(String((e as Error)?.message ?? e)));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((evt, sess) => {
      setSession(sess);
      setSessionToken(sess?.access_token ?? "");
      if (evt === "SIGNED_OUT" || !sess?.access_token) {
        setMe(null);
        setRows([]);
        setDetail(null);
        setReference(null);
        setSchemaHealthResult(null);
        setSchemaHealthProbeError(null);
        setSchemaHealthDevMeta(null);
        setMorawareStatus(null);
        setMorawareStatusError("");
        setMorawareStatusLoading(false);
        setSelectedId(null);
        return;
      }
      /** Keep token aligned with silent refresh — avoid refetching the full admin roster on rotation. */
      if (evt === "TOKEN_REFRESHED") return;
      /** `getSession()` above runs the initial roster load; skip duplicate startup work. */
      if (evt === "INITIAL_SESSION") return;
      if (mounted)
        void loadCore(sess.access_token).catch((e: unknown) => {
          setMe(null);
          setListError(String((e as Error)?.message ?? e));
        });
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadCore]);

  useEffect(() => {
    async function loadDetail() {
      const token = String(sessionToken ?? "").trim();
      if (!token || !canOperate || !selectedId) {
        setDetail(null);
        return;
      }
      try {
        const d = (await apiFetch(`${USER_MGMT_API}/users/${encodeURIComponent(selectedId)}`, {
          token
        })) as UserDetailResp;
        setDetail(d);
      } catch (e: unknown) {
        if (e instanceof ApiError) pushToast("error", e.message);
      }
    }
    void loadDetail();
  }, [selectedId, sessionToken, canOperate]);

  const departments = useMemo(() => {
    const ds = [...new Set(rows.map((r) => String(r.department ?? "").trim()).filter(Boolean))];
    ds.sort((a, b) => a.localeCompare(b));
    return ds;
  }, [rows]);

  const rosterStats = useMemo(() => {
    const total = rows.length;
    let active = 0;
    let internal = 0;
    let dealer = 0;
    let admins = 0;
    for (const r of rows) {
      if (r.is_active !== false) active++;
      const rl = String(r.role ?? "").trim().toLowerCase();
      if (rl === "admin" || rl === "super_admin") admins++;
      const kind = String(r.user_kind_normalized ?? "internal");
      if (kind === "dealer_partner") dealer++;
      else internal++;
    }
    return { total, active, internal, dealer, admins };
  }, [rows]);

  /**
   * Organizations tab — frontend-only derivation from already-loaded data.
   *
   * We do **not** add a new backend call. The signed-in admin's row is
   * looked up in the roster (which `/api/system-admin/users` already
   * returned), and its `organization_id` is treated as the current
   * workspace organization. Falls back to the most common
   * `organization_id` on the roster, then to "(no organization context)".
   *
   * All counts below are derived from the same roster payload — no
   * speculative joins, no fake metrics. If the data isn't there, the
   * readiness panel calls it out instead of inventing numbers.
   */
  const meUserId = String(me?.user?.id ?? "");
  const workspaceOrgId = useMemo(() => {
    if (!rows.length) return "";
    const mine = meUserId
      ? rows.find((r) => String(r.id ?? "") === meUserId)
      : undefined;
    const fromMe = String(mine?.organization_id ?? "").trim();
    if (fromMe) return fromMe;
    /** Fall back to the most-common org_id on the roster so a misconfigured
     *  admin profile (no org assigned to me) still shows a useful context. */
    const counts = new Map<string, number>();
    for (const r of rows) {
      const id = String(r.organization_id ?? "").trim();
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    let best = "";
    let bestN = 0;
    for (const [id, n] of counts) {
      if (n > bestN) {
        best = id;
        bestN = n;
      }
    }
    return best;
  }, [rows, meUserId]);

  const orgMembers = useMemo(() => {
    if (!rows.length) return [] as AdminRow[];
    if (!workspaceOrgId) {
      /** No detectable workspace org — surface every roster member that
       *  is assigned to *some* organization so admins can see the shape. */
      return rows.filter((r) => Boolean(String(r.organization_id ?? "").trim()));
    }
    return rows.filter((r) => String(r.organization_id ?? "").trim() === workspaceOrgId);
  }, [rows, workspaceOrgId]);

  const orgStats = useMemo(() => {
    const total = orgMembers.length;
    let active = 0;
    let inactive = 0;
    let admins = 0;
    let internal = 0;
    let dealer = 0;
    for (const r of orgMembers) {
      if (r.is_active === false) inactive++;
      else active++;
      const rl = String(r.role ?? "").trim().toLowerCase();
      if (rl === "admin" || rl === "super_admin") admins++;
      const kind = String(r.user_kind_normalized ?? "internal");
      if (kind === "dealer_partner") dealer++;
      else internal++;
    }
    const unassigned = rows.filter((r) => !String(r.organization_id ?? "").trim()).length;
    const otherOrgIds = new Set<string>();
    for (const r of rows) {
      const id = String(r.organization_id ?? "").trim();
      if (id && id !== workspaceOrgId) otherOrgIds.add(id);
    }
    return { total, active, inactive, admins, internal, dealer, unassigned, otherOrgs: otherOrgIds.size };
  }, [orgMembers, rows, workspaceOrgId]);

  const unassignedMembers = useMemo(
    () => rows.filter((r) => !String(r.organization_id ?? "").trim()),
    [rows]
  );

  /**
   * Lightweight cross-link from the Organizations tab into People & access.
   * Reuses the existing `selectedId` / drawer flow — no new edit surface
   * is introduced here. Switching tabs preserves all in-flight admin state.
   */
  const openUserInPeople = useCallback((userId: string) => {
    setSelectedId(String(userId));
    setActiveView("people");
  }, []);

  const referenceHeadsKey = useMemo(() => (reference?.heads ?? []).join("|"), [reference?.heads]);

  useEffect(() => {
    const h = reference?.heads ?? [];
    setInviteHeadPick((prev) => {
      const next: Record<string, boolean> = {};
      for (const slug of h) next[slug] = prev[slug] === true;
      return next;
    });
  }, [referenceHeadsKey]);

  const schemaTablesHealthy = useMemo(() => {
    const t = schemaHealthResult?.tables;
    if (!t || typeof t !== "object") return null;
    return (
      !!t.user_profiles &&
      !!t.dealer_accounts &&
      !!t.pricing_groups &&
      !!t.user_head_access &&
      !!t.user_account_access &&
      !!t.dealer_user_settings
    );
  }, [schemaHealthResult]);

  const schemaProbePending = schemaHealthResult === null && schemaHealthProbeError === null;

  const filteredRows = useMemo(() => {
    let out = [...rows];
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((r) => {
        const name = String(r.full_name ?? "").toLowerCase();
        const mail = String(r.email ?? "").toLowerCase();
        return name.includes(q) || mail.includes(q);
      });
    }
    if (roleFilter) out = out.filter((r) => String(r.role ?? "") === roleFilter);
    if (departmentFilter) out = out.filter((r) => String(r.department ?? "") === departmentFilter);
    if (kindFilter === "internal") out = out.filter((r) => String(r.user_kind_normalized ?? "internal") === "internal");
    if (kindFilter === "dealer") out = out.filter((r) => String(r.user_kind_normalized ?? "") === "dealer_partner");
    if (activeFilter === "active") out = out.filter((r) => r.is_active !== false);
    if (activeFilter === "inactive") out = out.filter((r) => r.is_active === false);
    if (headFilter) {
      out = out.filter((r) => (Array.isArray(r.allowed_heads_list) ? r.allowed_heads_list : []).includes(headFilter));
    }
    if (dealerFilter) {
      out = out.filter((r) =>
        (r.dealer_access ?? []).some((d) => String(d.dealer_account_id ?? "") === dealerFilter)
      );
    }
    if (pricingFilter) {
      out = out.filter((r) =>
        (r.dealer_access ?? []).some((d) => String(d.pricing_group_id ?? "") === pricingFilter)
      );
    }
    return out;
  }, [
    rows,
    search,
    roleFilter,
    departmentFilter,
    kindFilter,
    activeFilter,
    headFilter,
    dealerFilter,
    pricingFilter
  ]);

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    setLoginBusy(true);
    try {
      const res = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (res.error) throw res.error;
    } catch (err: unknown) {
      const m = typeof err === "object" && err && "message" in err ? String((err as { message?: string }).message) : String(err);
      setAuthError(m);
    } finally {
      setLoginBusy(false);
    }
  }

  async function refreshAll() {
    const t = String(sessionToken ?? "").trim();
    if (!t) return;
    try {
      await loadCore(t);
      if (selectedId) {
        const d = (await apiFetch(`${USER_MGMT_API}/users/${encodeURIComponent(selectedId)}`, { token: t })) as UserDetailResp;
        setDetail(d);
      }
    } catch (e: unknown) {
      pushToast("error", e instanceof ApiError ? e.message : String(e));
    }
  }

  async function loadAuditEvents() {
    const t = String(sessionToken ?? "").trim();
    if (!t) return;
    const params = new URLSearchParams();
    if (auditUserId) params.set("user_id", auditUserId);
    if (auditTool) params.set("tool_slug", auditTool);
    if (auditAction.trim()) params.set("action_type", auditAction.trim());
    if (auditOutcome) params.set("outcome", auditOutcome);
    if (auditFrom) params.set("date_from", auditFrom);
    if (auditTo) params.set("date_to", auditTo);
    setAuditBusy(true);
    setAuditError("");
    try {
      const res = (await apiFetch(`${USER_MGMT_API}/audit-events?${params.toString()}`, { token: t })) as AuditEventsResp;
      setAuditEvents(res);
    } catch (e: unknown) {
      setAuditError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setAuditBusy(false);
    }
  }

  /**
   * Sign-out path is shared between the user menu and any direct button.
   * The fire-and-forget audit log call (`/api/auth/log-event`) is preserved
   * exactly so existing audit/governance behavior does not regress.
   */
  async function handleSignOut() {
    const t = String(sessionToken ?? "").trim();
    if (t) {
      try {
        await apiFetch("/api/auth/log-event", {
          token: t,
          method: "POST",
          body: { event_type: "sign_out", tool_slug: "system_admin" }
        });
      } catch {
        /* best-effort audit only */
      }
    }
    void supabase.auth.signOut();
    setPassword("");
    setSelectedId(null);
    setSchemaHealthResult(null);
    setSchemaHealthProbeError(null);
    setSchemaHealthDevMeta(null);
    setMorawareStatus(null);
    setMorawareStatusError("");
    setMorawareStatusLoading(false);
    setUserMenuOpen(false);
  }

  if (!session) {
    return (
      <div className="shell">
        <header className="topbar" role="banner">
          <a
            href={homeBase}
            className="brand-row brand-row-link"
            aria-label={`eliteOS System Admin — ${workspaceName}`}
          >
            <span className="brand-mark" aria-hidden>
              {workspaceLogoUrl ? <img src={workspaceLogoUrl} alt="" /> : null}
            </span>
            <span className="brand-text">
              <span className="brand-wordmark">eliteOS</span>
              <span className="brand-sub">System Admin · {workspaceName}</span>
            </span>
          </a>
        </header>
        <main className="main" role="main">
          <section className="auth-panel auth-panel-standalone" aria-label="Sign in">
            <header className="auth-panel-header">
              <p className="auth-panel-eyebrow">System Admin · {workspaceName}</p>
              <h2 className="auth-panel-title">Sign in to continue</h2>
              <p className="auth-panel-sub">
                Use your eliteOS staff account. Only admin and super_admin roles can operate this management head — backend authorization is enforced on every API call.
              </p>
            </header>
            <form onSubmit={submitLogin} className="auth-form">
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
                </div>
                <div className="field">
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
              </div>
              {authError ? (
                <div className="banner banner-bad" role="alert" style={{ marginTop: 12 }}>
                  {authError}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={loginBusy || !email || !password}
                className="btn btn-primary"
                style={{ marginTop: 16 }}
              >
                {loginBusy ? "Signing in…" : "Sign in"}
              </button>
            </form>
            <p className="auth-trust">
              Authenticated through Supabase. No service-role keys are used in the browser; admins never manage other accounts&apos; plaintext secrets from this UI.
            </p>
          </section>
        </main>
      </div>
    );
  }

  const profileDrawer = detail?.profile as AdminRow | undefined;

  return (
    <div className="shell">
      <header className="topbar" role="banner">
        <a
          href={homeBase}
          className="brand-row brand-row-link"
          aria-label={`eliteOS System Admin — ${workspaceName}`}
        >
          <span className="brand-mark" aria-hidden>
            {workspaceLogoUrl ? <img src={workspaceLogoUrl} alt="" /> : null}
          </span>
          <span className="brand-text">
            <span className="brand-wordmark">eliteOS</span>
            <span className="brand-sub">System Admin · {workspaceName}</span>
          </span>
        </a>
        <div className="topbar-actions">
          <div className="topbar-account-wrap" ref={userMenuRef}>
            <button
              type="button"
              className={`topbar-account${userMenuOpen ? " is-open" : ""}`}
              aria-label="Open account menu"
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((v) => !v)}
            >
              <span className="topbar-avatar" aria-hidden>{userDisplayInitials}</span>
              <span className="topbar-account-text">
                <span className="topbar-account-name">{userDisplayName}</span>
                {userDisplayEmail && userDisplayEmail.toLowerCase() !== userDisplayName.toLowerCase() ? (
                  <span className="topbar-account-role">{userDisplayEmail}</span>
                ) : null}
              </span>
              <span className="topbar-account-caret" aria-hidden>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </button>
            {userMenuOpen ? (
              <div className="user-menu" role="menu" aria-label="Account menu">
                <div className="user-menu-header">
                  <p className="user-menu-name">{userDisplayName}</p>
                  {userDisplayEmail ? <p className="user-menu-email">{userDisplayEmail}</p> : null}
                  {meRole ? (
                    <p className="user-menu-role">
                      <span className="role-badge">{titleizeToken(meRole)}</span>
                    </p>
                  ) : null}
                  <p className="user-menu-workspace">
                    <span>Workspace ·</span>{" "}
                    <strong>{workspaceName}</strong>
                    <span className="user-menu-sep" aria-hidden>·</span>
                    <span>on slabOS</span>
                  </p>
                </div>
                <div className="user-menu-list">
                  <a
                    href={homeBase}
                    className="user-menu-item"
                    role="menuitem"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <span className="user-menu-icon" aria-hidden>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 11.5L12 4l9 7.5" />
                        <path d="M5 10v10h14V10" />
                        <path d="M10 20v-6h4v6" />
                      </svg>
                    </span>
                    <span className="user-menu-label">
                      <span>Open Home</span>
                      <span className="user-menu-meta">eliteOS Launcher</span>
                    </span>
                    <span className="user-menu-shortcut" aria-hidden>↗</span>
                  </a>
                  <button
                    type="button"
                    className="user-menu-item"
                    role="menuitem"
                    onClick={() => {
                      setUserMenuOpen(false);
                      void refreshAll();
                    }}
                  >
                    <span className="user-menu-icon" aria-hidden>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12a9 9 0 1 1-3-6.7" />
                        <path d="M21 4v5h-5" />
                      </svg>
                    </span>
                    <span className="user-menu-label">
                      <span>Reload data</span>
                      <span className="user-menu-meta">Roster, reference, diagnostics</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="user-menu-item is-disabled"
                    role="menuitem"
                    aria-disabled="true"
                    disabled
                    title="Profile / Preferences is coming soon"
                  >
                    <span className="user-menu-icon" aria-hidden>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="8" r="3.5" />
                        <path d="M5 20c1.5-3.5 4.2-5 7-5s5.5 1.5 7 5" />
                      </svg>
                    </span>
                    <span className="user-menu-label">
                      <span>Profile &amp; preferences</span>
                      <span className="user-menu-meta">Coming soon</span>
                    </span>
                  </button>
                </div>
                <div className="user-menu-footer">
                  <button
                    type="button"
                    className="user-menu-item user-menu-signout"
                    role="menuitem"
                    onClick={() => void handleSignOut()}
                  >
                    <span className="user-menu-icon" aria-hidden>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                    </span>
                    <span className="user-menu-label">Sign out</span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <section className="sa-hero" aria-labelledby="sa-hero-title">
        <div className="hero-aurora" aria-hidden />
        <div className="sa-hero-grid">
          <div className="sa-hero-main">
            <p className="hero-eyebrow">Internal tool · System Admin</p>
            <h1 id="sa-hero-title" className="hero-title">Governance console</h1>
            <p className="hero-sub">
              Users, roles, head access, invites, lifecycle actions, and platform diagnostics. Backend authorization is the source of truth — every action here calls{" "}
              <code className="hero-domain-code">{USER_MGMT_API}</code>.
            </p>
            {!canOperate && listError ? (
              <p className="hero-domain muted-note">
                <span className="hero-warn-pill" aria-hidden /> {listError}
              </p>
            ) : null}
          </div>

          <aside className="hero-workspace" aria-label={`Workspace · ${workspaceName}`}>
            <p className="hero-workspace-eyebrow">Workspace</p>
            <div className="hero-workspace-card">
              <div className="hero-workspace-mark">
                {workspaceLogoUrl ? (
                  <img
                    src={workspaceLogoUrl}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                      const fallback = (e.currentTarget.parentElement as HTMLElement | null)?.querySelector(
                        ".hero-workspace-initials"
                      ) as HTMLElement | null;
                      if (fallback) fallback.style.display = "flex";
                    }}
                  />
                ) : null}
                <span
                  className="hero-workspace-initials"
                  aria-hidden={workspaceLogoUrl ? "true" : "false"}
                  style={workspaceLogoUrl ? { display: "none" } : undefined}
                >
                  {workspaceInitials}
                </span>
              </div>
              <div className="hero-workspace-text">
                <p className="hero-workspace-name">{workspaceName}</p>
                <p className="hero-workspace-meta">
                  <span>on </span>
                  <span className="hero-workspace-platform">slabOS</span>
                  <span className="hero-workspace-sep" aria-hidden>·</span>
                  <span>{workspaceShortId}</span>
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {canOperate ? (
        <nav className="sa-subnav" aria-label="System admin">
          {(
            [
              ["people", "People & access"],
              ["organizations", "Organizations"],
              ["invite_users", "Invite users"],
              ["audit", "Audit"],
              ["diagnostics", "Diagnostics"]
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`nav-pill ${activeView === id ? "nav-pill-active" : ""}`}
              onClick={() => {
                if (id === "diagnostics") setDiagnosticsTab("overview");
                setActiveView(id);
                if (id !== "people") {
                  setSelectedId(null);
                  setDetail(null);
                }
              }}
            >
              {label}
            </button>
          ))}
          <span className="nav-pill-sep" aria-hidden="true" />
          <button
            type="button"
            className={`nav-pill ${activeView === "sales_mapping" ? "nav-pill-active" : ""}`}
            onClick={() => {
              setSelectedId(null);
              setDetail(null);
              setActiveView("sales_mapping");
            }}
          >
            Sales mapping
          </button>
          <button
            type="button"
            className={`nav-pill ${activeView === "moraware" ? "nav-pill-active" : ""}`}
            onClick={() => {
              setSelectedId(null);
              setDetail(null);
              setActiveView("moraware");
            }}
          >
            Moraware
          </button>
          <button
            type="button"
            className={`nav-pill ${activeView === "identity_resolution" ? "nav-pill-active" : ""}`}
            onClick={() => {
              setSelectedId(null);
              setDetail(null);
              setActiveView("identity_resolution");
            }}
          >
            Identity resolution
          </button>
        </nav>
      ) : null}

      {!canOperate ? (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Access denied</h2>
          <p className="muted">Only admin or super_admin roles can operate this management head.</p>
        </div>
      ) : (
      <div className={`layout ${activeView === "people" ? "layout-with-drawer" : ""}`}>
          <div className="panel">
            {activeView === "sales_mapping" ? (
              <SalesAccountMappingAdmin token={sessionToken} />
            ) : activeView === "moraware" ? (
              <MorawareAdmin token={sessionToken} />
            ) : activeView === "identity_resolution" ? (
              <IdentityResolutionReadiness token={sessionToken} />
            ) : activeView === "people" ? (
              <>
                <h2 style={{ marginTop: 0 }}>People &amp; access</h2>
                <p className="muted">
                  Roster, roles, head access, and dealer assignments. Select a user to open the detail drawer for
                  lifecycle actions, audit snippets, and assignments.
                </p>

                {listError && canOperate ? (
                  <div className="error-card">
                    <strong>Unable to load users</strong>
                    <p>{listError}</p>
                    <button type="button" className="btn" onClick={() => void refreshAll()}>
                      Retry
                    </button>
                  </div>
                ) : null}

                <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-value">{rosterStats.total}</div>
                <div className="stat-label">Total users</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{rosterStats.active}</div>
                <div className="stat-label">Active</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{rosterStats.internal}</div>
                <div className="stat-label">Internal</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{rosterStats.dealer}</div>
                <div className="stat-label">Dealer users</div>
              </div>
                <div className="stat-card">
                <div className="stat-value">{rosterStats.admins}</div>
                <div className="stat-label">Admin / super_admin</div>
              </div>
            </div>

            <div className="filters">
              <div className="field" style={{ marginBottom: 0, minWidth: 200 }}>
                <label>Search name / email</label>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Role</label>
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                  <option value="">All roles</option>
                  {(reference?.roles ?? []).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Department</label>
                <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
                  <option value="">Any</option>
                  {departments.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Kind</label>
                <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="internal">Internal</option>
                  <option value="dealer">Dealer/partner</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Status</label>
                <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Allowed head</label>
                <select value={headFilter} onChange={(e) => setHeadFilter(e.target.value)}>
                  <option value="">Any head</option>
                  {(reference?.heads ?? []).map((h) => (
                    <option key={h} value={h}>
                      {headDisplayLabel(h, reference?.head_catalog)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0, minWidth: 160 }}>
                <label>Dealer account</label>
                <select value={dealerFilter} onChange={(e) => setDealerFilter(e.target.value)}>
                  <option value="">Any dealer</option>
                  {(reference?.dealers ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.account_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0, minWidth: 160 }}>
                <label>Pricing group</label>
                <select value={pricingFilter} onChange={(e) => setPricingFilter(e.target.value)}>
                  <option value="">Any group</option>
                  {(reference?.pricing_groups ?? []).map((g) => (
                    <option key={g.id} value={g.id}>
                      {(g.code || "").trim()}
                      {(g.label ? ` — ${g.label}` : "").trim()}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn" onClick={() => void refreshAll()}>
                Reload
              </button>
            </div>

            <p className="muted" style={{ marginBottom: 10 }}>
              Showing {filteredRows.length} of {rows.length} roster {rows.length === 1 ? "user" : "users"} matching
              filters.
            </p>

            <div className="table-scroll">
              <table className="simple">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Invite status</th>
                    <th>Setup</th>
                    <th>Assigned tools</th>
                    <th>Kind</th>
                    <th>Account status</th>
                    <th>Last sign-in</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => {
                    const auth = r.auth_summary;
                    const setup = setupStatus(r, auth);
                    const hl = [...new Set(r.allowed_heads_list ?? [])].sort((a, b) => a.localeCompare(b));
                    const shown = hl.slice(0, 3);
                    const tail = hl.length > 3 ? `+${hl.length - 3}` : "";
                    return (
                      <tr
                        key={String(r.id)}
                        className={r.id === selectedId ? "simple-row-selected" : ""}
                        onClick={() => setSelectedId(String(r.id))}
                      >
                        <td className="user-cell">
                          <strong>{String(r.full_name || r.email || "Unnamed user")}</strong>
                          <span>
                            {String(r.department || "No department")}
                            {r.organization_id ? ` · org ${String(r.organization_id).slice(0, 8)}...` : ""}
                          </span>
                        </td>
                        <td>{String(r.email ?? "")}</td>
                        <td>
                          <span className="role-badge">{titleizeToken(r.role)}</span>
                        </td>
                        <td>
                          <span className={`pill ${auth?.email_confirmed_at ? "pill-good" : auth?.present ? "pill-warn" : "pill-neutral"}`}>
                            {inviteStatusLabel(auth)}
                          </span>
                        </td>
                        <td>
                          <span className={`pill ${setup.pillClass}`}>{setup.label}</span>
                        </td>
                        <td className="tools-cell">
                          {hl.length ? (
                            <div className="tool-chip-row compact">
                              {shown.map((h) => (
                                <span className="tool-chip" key={h}>
                                  {titleizeToken(h)}
                                </span>
                              ))}
                              {tail ? <span className="tool-chip muted-chip">{tail}</span> : null}
                            </div>
                          ) : (
                            <span className="muted">No tools assigned</span>
                          )}
                        </td>
                        <td>{titleizeToken(r.user_kind_normalized ?? "internal")}</td>
                        <td>
                          <span className={`pill ${r.is_active !== false ? "pill-good" : "pill-bad"}`}>
                            {r.is_active !== false ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          {lastSignInText(r, auth)}
                          {!auth?.last_sign_in_at && !r.last_login_at ? (
                            <div className="muted table-helper">No tracked session yet</div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredRows.length === 0 ? (
                <div className="empty-state">
                  <strong>No users match these filters.</strong>
                  <p>Clear filters or reload the roster to confirm there are no matching accounts.</p>
                </div>
              ) : null}
            </div>
              </>
            ) : activeView === "invite_users" ? (
              <>
                <h2 style={{ marginTop: 0 }}>Invite users</h2>
                <p className="muted">
                  Sends a Supabase invite email (no credential fields appear here). Production redirects use eliteOS Home
                  at <code>www.eliteosfab.com/auth/callback</code> — not localhost unless explicitly configured.
                </p>
                <div className="readiness-panel invite-readiness">
                  <div>
                    <div className="readiness-title">Beta invite checklist</div>
                    <div className="muted">Create the profile, choose a role, assign tools intentionally, then send the setup link.</div>
                  </div>
                  <div className="readiness-checks">
                    <span className={`mini-check ${inviteEmail.trim() ? "ok" : "missing"}`}>Email</span>
                    <span className={`mini-check ${(inviteRole || "viewer").trim() ? "ok" : "missing"}`}>Role</span>
                    <span className={`mini-check ${Object.values(inviteHeadPick).some(Boolean) ? "ok" : "missing"}`}>
                      Tools optional
                    </span>
                    <span className="mini-check ok">Home callback</span>
                  </div>
                </div>

                <div className="invite-panel">
              <strong>Invite user</strong>
              <p className="safety-callout" style={{ marginTop: 8 }}>
                {PASSWORD_GOVERNANCE_NOTE}
              </p>
              <div className="muted" style={{ marginBottom: 10 }}>
                Sends a Supabase invite email (no credential fields for invitees appear here). The user will be routed to
                eliteOS Home (<code>www.eliteosfab.com</code>) to finish setup—not localhost.
              </div>
              <div className="field" style={{ marginBottom: 6 }}>
                <label>Email</label>
                <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 6 }}>
                <label>Full name (optional)</label>
                <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 6 }}>
                <label>Starting role</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                  <option value="">viewer (default)</option>
                  {(reference?.roles ?? []).map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginBottom: 6 }}>
                <label>User kind</label>
                <select value={inviteKind} onChange={(e) => setInviteKind(e.target.value)}>
                  <option value="internal">internal</option>
                  <option value="dealer_partner">dealer_partner</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 6 }}>
                <label>Department (optional)</label>
                <input value={inviteDepartment} onChange={(e) => setInviteDepartment(e.target.value)} placeholder="e.g. Sales" />
              </div>
              <div className="field" style={{ marginBottom: 6 }}>
                <label>Organization ID (optional UUID)</label>
                <input
                  value={inviteOrganizationId}
                  onChange={(e) => setInviteOrganizationId(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  autoComplete="off"
                />
              </div>
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Initial tool access</label>
                <div className="head-grid" style={{ marginTop: 6 }}>
                  {(reference?.heads ?? []).map((slug) => (
                    <label key={slug} style={{ fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={inviteHeadPick[slug] === true}
                        onChange={(e) =>
                          setInviteHeadPick((s) => ({
                            ...s,
                            [slug]: e.target.checked
                          }))
                        }
                      />{" "}
                      {headDisplayLabel(slug, reference?.head_catalog)}
                    </label>
                  ))}
                </div>
                <small className="muted">
                  Assign only the tools this beta user should test. If every tool is unchecked, eliteOS leaves{" "}
                  <code>user_head_access</code> empty so launcher defaults (role + user kind) apply until you assign tools
                  here.
                </small>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={inviteBusy || !inviteEmail.trim()}
                onClick={async () => {
                  const t = sessionToken.trim();
                  if (!t) return;
                  setInviteBusy(true);
                  try {
                    const picked = Object.entries(inviteHeadPick)
                      .filter(([, on]) => on)
                      .map(([slug]) => slug);
                    const inviteRes = (await apiFetch(`${USER_MGMT_API}/users/invite`, {
                      token: t,
                      method: "POST",
                      body: {
                        email: inviteEmail.trim(),
                        full_name: inviteName.trim() || undefined,
                        role: inviteRole || undefined,
                        user_kind: inviteKind,
                        department: inviteDepartment.trim() || undefined,
                        organization_id: inviteOrganizationId.trim() || undefined,
                        ...(picked.length ? { initial_heads: picked } : {})
                      }
                    })) as { setup_hint?: string };
                    pushToast(
                      "info",
                      typeof inviteRes?.setup_hint === "string" && inviteRes.setup_hint.trim()
                        ? inviteRes.setup_hint.trim()
                        : "Invite sent. The user will be routed to eliteOS Home to finish setup."
                    );
                    setInviteEmail("");
                    setInviteName("");
                    setInviteRole("");
                    setInviteDepartment("");
                    setInviteOrganizationId("");
                    await refreshAll();
                  } catch (e: unknown) {
                    pushToast("error", e instanceof ApiError ? e.message : String(e));
                  } finally {
                    setInviteBusy(false);
                  }
                }}
              >
                {inviteBusy ? "Sending…" : "Send invite"}
              </button>
            </div>
              </>
            ) : activeView === "organizations" ? (
              <>
                <h2 style={{ marginTop: 0 }}>Organizations</h2>
                <p className="muted">
                  Read-only governance view of the current workspace. Membership lives on each user profile (<code>user_profiles.organization_id</code>); edits still flow through{" "}
                  <strong>People &amp; access</strong> and <strong>Invite users</strong>.
                </p>

                {/* 1. Current organization / workspace card */}
                <section className="org-workspace-card" aria-label={`Workspace · ${workspaceName}`}>
                  <div className="org-workspace-mark">
                    {workspaceLogoUrl ? (
                      <img
                        src={workspaceLogoUrl}
                        alt=""
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = "none";
                          const fallback = (e.currentTarget.parentElement as HTMLElement | null)?.querySelector(
                            ".org-workspace-initials"
                          ) as HTMLElement | null;
                          if (fallback) fallback.style.display = "flex";
                        }}
                      />
                    ) : null}
                    <span
                      className="org-workspace-initials hero-workspace-initials"
                      aria-hidden={workspaceLogoUrl ? "true" : "false"}
                      style={workspaceLogoUrl ? { display: "none" } : undefined}
                    >
                      {workspaceInitials}
                    </span>
                  </div>
                  <div className="org-workspace-body">
                    <p className="org-workspace-eyebrow">Current workspace</p>
                    <h3 className="org-workspace-name">{workspaceName}</h3>
                    <p className="org-workspace-meta">
                      <span className="pill pill-good">Active tenant</span>
                      <span className="user-menu-sep" aria-hidden>·</span>
                      <span>on <strong>slabOS</strong></span>
                      <span className="user-menu-sep" aria-hidden>·</span>
                      <span>{workspaceShortId}</span>
                    </p>
                    <dl className="org-workspace-dl">
                      <dt>Organization ID</dt>
                      <dd>
                        {workspaceOrgId ? (
                          <code className="mono-break" title={workspaceOrgId}>{workspaceOrgId}</code>
                        ) : (
                          <span className="muted">Not yet derivable from loaded roster — assign at least one user (including yourself) an <code>organization_id</code> through People &amp; access or Invite users.</span>
                        )}
                      </dd>
                      <dt>Tenant context</dt>
                      <dd className="muted">
                        Used for user assignment today and future tenant-aware routing / pricing / settings.
                      </dd>
                    </dl>
                  </div>
                </section>

                {/* 2. Organization stats — real counts only, never invented */}
                <div className="stat-grid org-stat-grid">
                  <div className="stat-card">
                    <div className="stat-value">{orgStats.total}</div>
                    <div className="stat-label">Assigned to this org</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{orgStats.active}</div>
                    <div className="stat-label">Active</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{orgStats.inactive}</div>
                    <div className="stat-label">Inactive</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{orgStats.admins}</div>
                    <div className="stat-label">Admin / super_admin</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{orgStats.internal}</div>
                    <div className="stat-label">Internal</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{orgStats.dealer}</div>
                    <div className="stat-label">Dealer / partner</div>
                  </div>
                  <div className={`stat-card${orgStats.unassigned > 0 ? " stat-card-warn" : " stat-card-muted"}`}>
                    <div className="stat-value">{orgStats.unassigned}</div>
                    <div className="stat-label">Missing org_id</div>
                  </div>
                  {orgStats.otherOrgs > 0 ? (
                    <div className="stat-card stat-card-muted">
                      <div className="stat-value">{orgStats.otherOrgs}</div>
                      <div className="stat-label">Other organizations seen</div>
                    </div>
                  ) : null}
                </div>

                {/* 4. Missing organization_id readiness — only when non-zero */}
                {unassignedMembers.length > 0 ? (
                  <div className="admin-card org-warn-card">
                    <div className="card-heading-row">
                      <div>
                        <h3 style={{ marginTop: 0 }}>
                          Users missing organization assignment{" "}
                          <span className="pill pill-warn" style={{ marginLeft: 6 }}>
                            {unassignedMembers.length}
                          </span>
                        </h3>
                        <p className="muted" style={{ marginTop: 4 }}>
                          Assigning every roster user an <code>organization_id</code> keeps tenant-aware routing, pricing,
                          and future SaaS settings reliable. Edit assignment from the People &amp; access drawer or set it
                          at invite time. Nothing is auto-assigned here.
                        </p>
                      </div>
                      <div className="card-heading-actions">
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            setSelectedId(null);
                            setDetail(null);
                            setActiveView("people");
                          }}
                        >
                          Open People &amp; access
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => {
                            setSelectedId(null);
                            setDetail(null);
                            setActiveView("invite_users");
                          }}
                        >
                          Invite a user
                        </button>
                      </div>
                    </div>
                    <div className="table-scroll" style={{ marginTop: 12 }}>
                      <table className="simple">
                        <thead>
                          <tr>
                            <th>User</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {unassignedMembers.map((r) => (
                            <tr key={String(r.id)} onClick={() => openUserInPeople(String(r.id))}>
                              <td className="user-cell">
                                <strong>{String(r.full_name || r.email || "Unnamed user")}</strong>
                                <span>{String(r.department || "No department")}</span>
                              </td>
                              <td>{String(r.email ?? "")}</td>
                              <td>
                                <span className="role-badge">{titleizeToken(r.role)}</span>
                              </td>
                              <td>
                                <span className={`pill ${r.is_active !== false ? "pill-good" : "pill-bad"}`}>
                                  {r.is_active !== false ? "Active" : "Inactive"}
                                </span>
                              </td>
                              <td>
                                <button
                                  type="button"
                                  className="btn-link"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openUserInPeople(String(r.id));
                                  }}
                                >
                                  Manage in People &amp; access →
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {/* 3. Members in this organization */}
                <div className="admin-card">
                  <div className="card-heading-row">
                    <div>
                      <h3 style={{ marginTop: 0 }}>Members in {workspaceName}</h3>
                      <p className="muted" style={{ marginTop: 4 }}>
                        {workspaceOrgId
                          ? `Users with organization_id = ${workspaceOrgId.slice(0, 8)}… (${orgMembers.length}). Detail editing stays in People & access.`
                          : `No workspace organization ID detected yet — listing every roster member assigned to any organization (${orgMembers.length}).`}
                      </p>
                    </div>
                    <div className="card-heading-actions">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setSelectedId(null);
                          setDetail(null);
                          setActiveView("people");
                        }}
                      >
                        Open People &amp; access
                      </button>
                    </div>
                  </div>

                  {!orgMembers.length ? (
                    <div className="empty-state">
                      <strong>No members loaded for this workspace yet.</strong>
                      <p>
                        Roster is either empty or no users carry an <code>organization_id</code>. Invite a user or assign
                        one from People &amp; access to start building the workspace directory.
                      </p>
                    </div>
                  ) : (
                    <div className="table-scroll">
                      <table className="simple">
                        <thead>
                          <tr>
                            <th>Member</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Tools</th>
                            <th>Organization ID</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {orgMembers.map((r) => {
                            const heads = [...new Set(r.allowed_heads_list ?? [])];
                            const orgId = String(r.organization_id ?? "").trim();
                            return (
                              <tr key={String(r.id)} onClick={() => openUserInPeople(String(r.id))}>
                                <td className="user-cell">
                                  <strong>{String(r.full_name || r.email || "Unnamed user")}</strong>
                                  <span>
                                    {String(r.department || "No department")}
                                    {" · "}
                                    {titleizeToken(r.user_kind_normalized ?? "internal")}
                                  </span>
                                </td>
                                <td>{String(r.email ?? "")}</td>
                                <td>
                                  <span className="role-badge">{titleizeToken(r.role)}</span>
                                </td>
                                <td>
                                  <span className={`pill ${r.is_active !== false ? "pill-good" : "pill-bad"}`}>
                                    {r.is_active !== false ? "Active" : "Inactive"}
                                  </span>
                                </td>
                                <td className="muted">
                                  {heads.length ? `${heads.length} tool${heads.length === 1 ? "" : "s"}` : "None"}
                                </td>
                                <td>
                                  {orgId ? (
                                    <code className="mono-break" title={orgId} style={{ fontSize: 11 }}>
                                      {orgId.slice(0, 8)}…
                                    </code>
                                  ) : (
                                    <span className="muted">—</span>
                                  )}
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="btn-link"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openUserInPeople(String(r.id));
                                    }}
                                  >
                                    Manage in People &amp; access →
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                    Edit user details, head access, dealer access, and pricing groups in <strong>People &amp; access</strong>.
                    Set an initial organization at invite time in <strong>Invite users</strong>.
                  </p>
                </div>

                {/* 5. Readiness / future setup panel */}
                <div className="admin-card org-readiness-card">
                  <h3 style={{ marginTop: 0 }}>Organization governance · readiness</h3>
                  <div className="org-readiness-grid">
                    <div>
                      <h4 className="org-readiness-heading">Available now</h4>
                      <ul className="org-readiness-list">
                        <li>
                          <span className="mini-check ok">In place</span>{" "}
                          <code>user_profiles.organization_id</code> stores tenant membership per user.
                        </li>
                        <li>
                          <span className="mini-check ok">In place</span>{" "}
                          Assign / update <code>organization_id</code> from <strong>People &amp; access</strong> drawer
                          (profile edit) — backend-validated.
                        </li>
                        <li>
                          <span className="mini-check ok">In place</span>{" "}
                          Set initial <code>organization_id</code> when inviting from <strong>Invite users</strong>.
                        </li>
                        <li>
                          <span className="mini-check ok">In place</span>{" "}
                          Single-tenant workspace fallback (<strong>{workspaceName}</strong>) wired into the protected-head
                          app shell.
                        </li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="org-readiness-heading">Planned (future Tenant Settings head)</h4>
                      <ul className="org-readiness-list">
                        <li>
                          <span className="mini-check missing">Planned</span>{" "}
                          First-class organization directory (read / create / archive organizations).
                        </li>
                        <li>
                          <span className="mini-check missing">Planned</span>{" "}
                          Workspace branding (display name, logo, accent colour overrides).
                        </li>
                        <li>
                          <span className="mini-check missing">Planned</span>{" "}
                          Branch / location settings, time zones, and operating-hours metadata.
                        </li>
                        <li>
                          <span className="mini-check missing">Planned</span>{" "}
                          Tenant-aware integration config (Moraware, Monday, partner APIs) — moved out of System Admin.
                        </li>
                        <li>
                          <span className="mini-check missing">Planned</span>{" "}
                          SaaS onboarding flow (org creation → admin invite → head provisioning).
                        </li>
                      </ul>
                    </div>
                  </div>
                  <p className="safety-callout" style={{ marginTop: 12 }}>
                    Visibility on this tab is not authorization. Edits to <code>organization_id</code> still flow through
                    backend <code>{USER_MGMT_API}/users/:id/profile</code> with role/head-access enforcement; this view is
                    intentionally read-only.
                  </p>
                </div>
              </>
            ) : activeView === "audit" ? (
              <>
                <h2 style={{ marginTop: 0 }}>Audit / activity</h2>
                <p className="muted">
                  Auth/session events are written to <code>eos_login_log</code>; meaningful user actions are written to{" "}
                  <code>eos_action_log</code>. Exact Supabase password entry is not exposed to Brain, so eliteOS treats
                  the first authenticated API/session event as the durable sign-in/seen signal.
                </p>
                <div className="filters audit-filters">
                  <div className="field" style={{ marginBottom: 0, minWidth: 220 }}>
                    <label>User</label>
                    <select value={auditUserId} onChange={(e) => setAuditUserId(e.target.value)}>
                      <option value="">All users</option>
                      {rows.map((r) => (
                        <option key={r.id} value={r.id}>
                          {String(r.full_name || r.email || r.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Tool</label>
                    <select value={auditTool} onChange={(e) => setAuditTool(e.target.value)}>
                      <option value="">All tools</option>
                      {(reference?.heads ?? []).map((h) => (
                        <option key={h} value={h}>
                          {headDisplayLabel(h, reference?.head_catalog)}
                        </option>
                      ))}
                      <option value="home">eliteOS Home</option>
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Action type</label>
                    <input value={auditAction} onChange={(e) => setAuditAction(e.target.value)} placeholder="e.g. user_invite" />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>Outcome</label>
                    <select value={auditOutcome} onChange={(e) => setAuditOutcome(e.target.value)}>
                      <option value="">Any</option>
                      <option value="success">Success</option>
                      <option value="failed">Failed</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>From</label>
                    <input type="date" value={auditFrom} onChange={(e) => setAuditFrom(e.target.value)} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label>To</label>
                    <input type="date" value={auditTo} onChange={(e) => setAuditTo(e.target.value)} />
                  </div>
                  <button type="button" className="btn btn-primary" onClick={() => void loadAuditEvents()} disabled={auditBusy}>
                    {auditBusy ? "Loading…" : "Load activity"}
                  </button>
                </div>
                {auditError ? (
                  <div className="error-card">
                    <strong>Unable to load audit activity</strong>
                    <p>{auditError}</p>
                  </div>
                ) : null}
                {auditEvents?.warnings?.length ? (
                  <div className="banner banner-warn">{auditEvents.warnings.join(" ")}</div>
                ) : null}
                <div className="audit-grid">
                  <div className="admin-card">
                    <h3 style={{ marginTop: 0 }}>Auth / session events</h3>
                    <p className="muted">Sign-in/session seen, launcher opened, tool access loaded, and sign-out events.</p>
                    <div className="activity-list">
                      {(auditEvents?.auth_events ?? []).map((ev, idx) => (
                        <div className="activity-row" key={`${String(ev.id ?? "")}-${idx}`}>
                          <strong>{titleizeToken(ev.event_type, "Auth event")}</strong>
                          <span>{fmt(ev.created_at)}</span>
                          <span className="muted">
                            {String(ev.user_email ?? ev.email ?? "unknown user")}
                            {ev.tool_slug ? ` · ${String(ev.tool_slug)}` : ""}
                          </span>
                        </div>
                      ))}
                      {auditEvents && !auditEvents.auth_events?.length ? <div className="empty-state">No auth events match these filters.</div> : null}
                    </div>
                  </div>
                  <div className="admin-card">
                    <h3 style={{ marginTop: 0 }}>Action log</h3>
                    <p className="muted">Governance and workflow actions recorded server-side.</p>
                    <div className="activity-list">
                      {(auditEvents?.action_events ?? []).map((ev, idx) => (
                        <div className="activity-row" key={`${String(ev.id ?? "")}-${idx}`}>
                          <strong>{titleizeToken(ev.action_type, "Action")}</strong>
                          <span>{fmt(ev.created_at)}</span>
                          <span className="muted">
                            {String(ev.actor_email ?? ev.user_email ?? "unknown user")}
                            {ev.tool_slug || ev.head ? ` · ${String(ev.tool_slug ?? ev.head)}` : ""}
                            {ev.entity_type ? ` · ${String(ev.entity_type)}` : ""}
                          </span>
                        </div>
                      ))}
                      {auditEvents && !auditEvents.action_events?.length ? <div className="empty-state">No action events match these filters.</div> : null}
                    </div>
                  </div>
                </div>
              </>
            ) : activeView === "diagnostics" ? (
              <>
                <h2 style={{ marginTop: 0 }}>Admin tools / diagnostics</h2>
                <p className="muted">
                  Schema checks and legacy admin diagnostics. Quote workflow belongs in Quote Library; pricing belongs in
                  Pricing Admin.
                </p>
                <div className="subnav-tabs">
                  <button
                    type="button"
                    className={`btn ${diagnosticsTab === "overview" ? "btn-primary" : ""}`}
                    onClick={() => setDiagnosticsTab("overview")}
                  >
                    Overview
                  </button>
                  <button
                    type="button"
                    className={`btn ${diagnosticsTab === "quote_pipeline" ? "btn-primary" : ""}`}
                    onClick={() => setDiagnosticsTab("quote_pipeline")}
                  >
                    Quote pipeline diagnostics
                  </button>
                  <button
                    type="button"
                    className={`btn ${diagnosticsTab === "legacy_pricing" ? "btn-primary" : ""}`}
                    onClick={() => setDiagnosticsTab("legacy_pricing")}
                  >
                    Legacy quote pricing
                  </button>
                </div>
                {diagnosticsTab === "overview" ? (
                  <>
                    <div
                      className={`schema-card ${
                        schemaHealthProbeError ? "api-issue"
                        : schemaProbePending ? ""
                        : schemaTablesHealthy ? "healthy"
                        : "setup"
                      }${schemaProbePending && !schemaHealthProbeError ? " schema-card-pending" : ""}`}
                    >
                      <strong>User Management Schema</strong>
                      {schemaProbePending ? (
                        <div className="muted" style={{ marginTop: 6 }}>
                          Checking extension tables…
                        </div>
                      ) : schemaHealthProbeError ? (
                        <div style={{ marginTop: 8 }}>
                          <div className="schema-lead schema-lead--info">Schema health could not be checked. Backend/API issue.</div>
                          <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                            Confirm <code>VITE_BACKEND_URL</code> points at backend-core (no trailing <code>/api</code>),
                            redeploy/restart the API, then reload. Details are not interpreted as missing SQL migrations.
                          </div>
                          {import.meta.env.DEV ? (
                            <div className="muted" style={{ marginTop: 8, fontSize: 12, wordBreak: "break-word" }}>
                              {schemaHealthProbeError}
                            </div>
                          ) : null}
                        </div>
                      ) : schemaTablesHealthy ? (
                        <div className="muted" style={{ marginTop: 6 }}>
                          Healthy — User Management Schema reachable.
                        </div>
                      ) : (
                        <div style={{ marginTop: 8 }}>
                          <div className="schema-lead schema-lead--warn">Setup required</div>
                          <div className="muted" style={{ marginTop: 4 }}>
                            Run <code style={{ fontSize: 12 }}>backend-core/supabase/user_management_schema.sql</code> on
                            your Supabase project (admin SQL).
                          </div>
                          {schemaHealthResult?.missing?.length ? (
                            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                              Missing or unreachable tables:{" "}
                              <span className="schema-missing-list">{schemaHealthResult.missing.join(", ")}</span>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>

                    {import.meta.env.DEV && schemaHealthDevMeta ? (
                      <details className="dev-debug">
                        <summary>
                          Schema health (dev) —{" "}
                          {schemaHealthDevMeta.httpStatus != null ? `HTTP ${schemaHealthDevMeta.httpStatus}` : "no status"}{" "}
                          · path {schemaHealthDevMeta.path}
                        </summary>
                        <pre>
                          {JSON.stringify(
                            {
                              path: schemaHealthDevMeta.path,
                              url: schemaHealthDevMeta.url,
                              httpStatus: schemaHealthDevMeta.httpStatus,
                              detail: schemaHealthDevMeta.detail ?? null,
                              ...(schemaHealthResult ?
                                { tables: schemaHealthResult.tables, missing: schemaHealthResult.missing }
                              : {})
                            },
                            null,
                            2
                          )}
                        </pre>
                      </details>
                    ) : null}

                    <MorawareSyncStatusCard
                      status={morawareStatus}
                      loading={morawareStatusLoading}
                      error={morawareStatusError}
                      onRefresh={() => {
                        if (sessionToken) void loadMorawareStatus(sessionToken);
                      }}
                    />

                    <div className="admin-card">
                      <h3 style={{ marginTop: 0 }}>Pricing Admin head</h3>
                      <p className="muted" style={{ marginTop: 6 }}>
                        Pricing configuration belongs in the eliteOS Pricing Admin Head — not in System Admin long term.
                      </p>
                      <a className="admin-card-link" href={PRICING_ADMIN_URL} target="_blank" rel="noreferrer">
                        Open Pricing Admin →
                      </a>
                    </div>

                    <div className="admin-card">
                      <h3 style={{ marginTop: 0 }}>Quote Library boundary</h3>
                      <p className="muted" style={{ marginTop: 6 }}>
                        Quote Library owns quote search, filters, status workflow, revision history, and sold-job handoff
                        documentation. Pipeline diagnostics here are temporary.
                      </p>
                    </div>
                  </>
                ) : diagnosticsTab === "quote_pipeline" ? (
                  <>
                    <p className="safety-callout">
                      Quote workflow will move to the dedicated eliteOS <strong>Quote Library</strong> head. This view
                      remains for engineering diagnostics only.
                    </p>
                    <QuotePipelinePanel token={sessionToken} />
                  </>
                ) : (
                  <>
                    <p className="safety-callout">
                      Pricing configuration belongs in the{" "}
                      <a className="admin-card-link" href={PRICING_ADMIN_URL} target="_blank" rel="noreferrer">
                        eliteOS Pricing Admin Head
                      </a>
                      . The screen below is a legacy diagnostic tied to backend admin routes — prefer Pricing Admin for
                      real changes.
                    </p>
                    <QuotePricingAdminView token={sessionToken} />
                  </>
                )}
              </>
            ) : null}
          </div>

          {activeView === "people" ? (
          <aside className="drawer">
            {!selectedId ? (
              <p className="muted">Select a user from the roster for actions and summaries.</p>
            ) : !profileDrawer ? (
              <p className="muted">Loading…</p>
            ) : (
              <>
                <h3 style={{ marginTop: 0 }}>{String(profileDrawer.full_name || profileDrawer.email || selectedId)}</h3>
                <UserSnapshot profile={profileDrawer} detail={detail} />

                <UserLifecycleActions
                  detail={detail}
                  selectedId={selectedId}
                  token={sessionToken}
                  actorUserId={String(me?.user?.id ?? "")}
                  onRefresh={() => void refreshAll()}
                  onUserDeleted={() => {
                    setSelectedId(null);
                    setDetail(null);
                  }}
                  pushToast={pushToast}
                />

                <div className="drawer-section">
                  <h4>Edit profile</h4>
                  <ProfileForm
                    roles={reference?.roles ?? []}
                    profile={profileDrawer}
                    token={sessionToken}
                    onDone={() => void refreshAll()}
                  />
                </div>

                <div className="drawer-section">
                  <h4>Assign allowed heads</h4>
                  <HeadSelector
                    heads={reference?.heads ?? []}
                    headCatalog={reference?.head_catalog}
                    selected={Array.isArray(profileDrawer?.allowed_heads_list) ? profileDrawer?.allowed_heads_list : []}
                    userId={selectedId}
                    token={sessionToken}
                    onSaved={() => void refreshAll()}
                  />
                </div>

                <div className="drawer-section">
                  <h4>Dealer access</h4>
                  <DealerForm dealers={reference?.dealers ?? []} userId={selectedId} token={sessionToken} onDone={() => void refreshAll()} />
                </div>

                <div className="drawer-section">
                  <h4>Pricing group</h4>
                  <PricingForm
                    accessRows={(detail?.dealer_account_access as DealerAccess[] | undefined) ?? []}
                    pricingGroups={reference?.pricing_groups ?? []}
                    userId={selectedId}
                    token={sessionToken}
                    onDone={() => void refreshAll()}
                  />
                </div>

                <div className="drawer-section">
                  <h4>Login summary (recent)</h4>
                  <p className="muted">{detail?.login_summary?.total ?? 0} logged</p>
                  <ul style={{ paddingLeft: 18, margin: "6px 0 0", fontSize: 12 }}>
                    {(detail?.login_summary?.recent ?? []).map((evt, idx) => (
                      <li key={`${evt.created_at ?? ""}-${idx}`}>
                        <span>{fmt(evt.created_at)}</span>
                        {" · "}
                        <span>{String(evt.event_type ?? "login")}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="drawer-section">
                  <h4>Action summary (recent)</h4>
                  <p className="muted">{detail?.action_summary?.total ?? 0} audited</p>
                  <ul style={{ paddingLeft: 18, margin: "6px 0 0", fontSize: 12 }}>
                    {(detail?.action_summary?.recent ?? []).map((evt, idx) => (
                      <li key={`${evt.created_at ?? ""}-${idx}`}>
                        <span>{fmt(evt.created_at)}</span>
                        {" · "}
                        <span>{String(evt.action_type ?? "")}</span>
                        {" · "}
                        <span className="muted">{String(evt.entity_type ?? "")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </aside>
          ) : null}
        </div>
      )}
      {toast ? <div className={`toast ${toast.kind === "error" ? "error" : ""}`}>{toast.text}</div> : null}
    </div>
  );
}

function ProfileForm({
  roles,
  profile,
  token,
  onDone
}: {
  roles: string[];
  profile: AdminRow;
  token: string;
  onDone: () => void;
}) {
  const [role, setRole] = useState(String(profile.role ?? ""));
  const [department, setDepartment] = useState(String(profile.department ?? ""));
  const [organizationId, setOrganizationId] = useState(String(profile.organization_id ?? ""));
  const [fullName, setFullName] = useState(String(profile.full_name ?? ""));

  const roleOptions = useMemo(() => {
    const r = String(profile.role ?? "").trim();
    const set = new Set(roles.filter(Boolean));
    if (r) set.add(r);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [roles, profile.role]);

  useEffect(() => {
    setRole(String(profile.role ?? ""));
    setDepartment(String(profile.department ?? ""));
    setOrganizationId(String(profile.organization_id ?? ""));
    setFullName(String(profile.full_name ?? ""));
  }, [profile]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch(`${USER_MGMT_API}/users/${encodeURIComponent(profile.id)}/profile`, {
      token,
      method: "POST",
      body: {
        role,
        department: department.trim() || null,
        organization_id: organizationId.trim() || null,
        full_name: fullName.trim()
      }
    });
    onDone();
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <div className="field">
        <label>Full name</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="field">
        <label>Role</label>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {roleOptions.map((rVal) => (
            <option key={rVal} value={rVal}>
              {rVal}
            </option>
          ))}
        </select>
      </div>
      <small className="muted">Validated against canonical role list.</small>
      <div className="field">
        <label>Department</label>
        <input value={department} onChange={(e) => setDepartment(e.target.value)} />
      </div>
      <div className="field">
        <label>Organization ID (UUID or empty)</label>
        <input value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} placeholder="Clear field to unset" />
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
        Active / inactive status is managed under <strong>Account actions</strong> (deactivate or reactivate) so changes stay aligned with admin audit rules.
      </p>
      <button type="submit" className="btn btn-primary" style={{ marginTop: 10 }}>
        Save profile
      </button>
    </form>
  );
}

function HeadSelector({
  heads,
  headCatalog,
  selected,
  userId,
  token,
  onSaved
}: {
  heads: string[];
  headCatalog?: HeadCatalogEntry[];
  selected: string[];
  userId: string;
  token: string;
  onSaved: () => void;
}) {
  const initial = heads.reduce(
    (m, h) => {
      m[h] = selected.includes(h);
      return m;
    },
    {} as Record<string, boolean>
  );
  const [state, setState] = useState(initial);

  useEffect(() => {
    const next = heads.reduce(
      (m, h) => {
        m[h] = selected.includes(h);
        return m;
      },
      {} as Record<string, boolean>
    );
    setState(next);
  }, [heads, selected]);

  async function save() {
    const picked = Object.entries(state).filter(([, ok]) => ok).map(([h]) => h);
    await apiFetch(`${USER_MGMT_API}/users/${encodeURIComponent(userId)}/head-access`, {
      token,
      method: "POST",
      body: { heads: picked }
    });
    onSaved();
  }

  return (
    <>
      <div className="head-grid">
        {heads.map((h) => (
          <label key={h}>
            <input
              type="checkbox"
              checked={state[h] === true}
              onChange={(e) => setState((s) => ({ ...s, [h]: e.target.checked }))}
            />{" "}
            {headDisplayLabel(h, headCatalog)}
          </label>
        ))}
      </div>
      <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => void save()}>
        Save heads
      </button>
    </>
  );
}

function DealerForm({
  dealers,
  userId,
  token,
  onDone
}: {
  dealers: { id: string; account_name: string }[];
  userId: string;
  token: string;
  onDone: () => void;
}) {
  const [dealerId, setDealerId] = useState("");
  const [viewerAll, setViewerAll] = useState(false);
  const [manageUsers, setManageUsers] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dealerId) return;
    await apiFetch(`${USER_MGMT_API}/users/${encodeURIComponent(userId)}/dealer-access`, {
      token,
      method: "POST",
      body: {
        dealer_account_id: dealerId,
        pricing_group_id: null,
        can_view_all_dealer_quotes: viewerAll,
        can_manage_dealer_users: manageUsers
      }
    });
    setDealerId("");
    setViewerAll(false);
    setManageUsers(false);
    onDone();
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <div className="field">
        <label>Dealer account</label>
        <select value={dealerId} onChange={(e) => setDealerId(e.target.value)}>
          <option value="">Select…</option>
          {dealers.map((d) => (
            <option key={d.id} value={d.id}>{d.account_name}</option>
          ))}
        </select>
      </div>
      <label style={{ fontSize: 13 }}>
        <input type="checkbox" checked={viewerAll} onChange={(e) => setViewerAll(e.target.checked)} /> can_view_all_dealer_quotes
      </label>
      <br />
      <label style={{ fontSize: 13 }}>
        <input type="checkbox" checked={manageUsers} onChange={(e) => setManageUsers(e.target.checked)} /> can_manage_dealer_users
      </label>
      <button type="submit" disabled={!dealerId} className="btn" style={{ display: "block", marginTop: 10 }}>
        Upsert dealer access
      </button>
    </form>
  );
}

function PricingForm({
  accessRows,
  pricingGroups,
  userId,
  token,
  onDone
}: {
  accessRows: DealerAccess[];
  pricingGroups: { id: string; code: string; label: string | null }[];
  userId: string;
  token: string;
  onDone: () => void;
}) {
  const [dealerId, setDealerId] = useState("");
  const [pgId, setPgId] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dealerId) return;
    await apiFetch(`${USER_MGMT_API}/users/${encodeURIComponent(userId)}/pricing-group`, {
      token,
      method: "POST",
      body: {
        dealer_account_id: dealerId,
        pricing_group_id: pgId.trim() === "" ? null : pgId
      }
    });
    setPgId("");
    onDone();
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <div className="field">
        <label>Assigned dealer</label>
        <select value={dealerId} onChange={(e) => setDealerId(e.target.value)}>
          <option value="">Select…</option>
          {accessRows.map((a) => (
            <option key={String(a.dealer_account_id)} value={String(a.dealer_account_id)}>
              {(a.dealer_account?.account_name && String(a.dealer_account.account_name)) ||
                `Dealer ${String(a.dealer_account_id).slice(0, 8)}…`}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Pricing group</label>
        <select value={pgId} onChange={(e) => setPgId(e.target.value)}>
          <option value="">None</option>
          {pricingGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {(g.code || "").trim()}
              {(g.label ? ` · ${g.label}` : "").trim()}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={!dealerId} className="btn">
        Save pricing
      </button>
    </form>
  );
}
