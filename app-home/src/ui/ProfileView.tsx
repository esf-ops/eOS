import React, { useCallback, useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// Types (minimal shapes of what ProfileView needs)
// ---------------------------------------------------------------------------

type ProfileUser = {
  id?: string;
  email?: string;
  role?: string;
  fullName?: string;
  full_name?: string;
  department?: string;
  organization_id?: string | null;
  organization_name?: string | null;
  user_kind?: string;
  isActive?: boolean;
};

type ProfileHead = {
  slug: string;
  label: string;
  title?: string;
  enabled: boolean;
};

export type UserPreferences = {
  default_landing_head: string | null;
  table_density: "comfortable" | "compact";
  open_heads_in_new_tab: boolean;
  show_advanced_panels_default: boolean;
};

type ProfileViewProps = {
  user: ProfileUser | null | undefined;
  heads: ProfileHead[];
  prefs: UserPreferences;
  loading: boolean;
  /** Non-empty when /api/me or /api/me/heads failed. Used to show truthful error states. */
  loadError?: string;
  /** Email from Supabase session — shown as fallback if /api/me data is unavailable. */
  sessionEmail?: string;
  onBack: () => void;
  onSave: (prefs: UserPreferences) => Promise<void>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HEAD_TITLES: Record<string, string> = {
  quote: "Estimating Tool",
  quote_library: "Quote Library",
  pricing_admin: "Pricing Admin",
  system_admin: "System Admin",
  sales: "Sales Dashboard",
  executive: "Executive Dashboard",
  brain_health: "System Health",
  public_quote: "Public Quote Tool",
  production: "Production Dashboard",
  shop_tv: "Shop Floor TV",
  install: "Install",
  purchasing: "Purchasing",
  customer_service: "Customer Service",
  hr: "HR",
  safety: "Safety",
  org_directory: "Org Directory"
};

function headTitle(slug: string): string {
  return HEAD_TITLES[slug] ?? slug;
}

function initialsFromUser(user: ProfileUser | null | undefined): string {
  const n = (user?.full_name ?? user?.fullName ?? "").trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase();
  }
  const e = (user?.email ?? "").trim();
  return e ? e.slice(0, 2).toUpperCase() : "?";
}

function formatRole(role?: string): string {
  if (!role) return "—";
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatUserKind(kind?: string): string {
  if (!kind) return "Internal";
  if (kind === "dealer_partner") return "Dealer / Partner";
  return kind.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Toggle component
// ---------------------------------------------------------------------------

function PrefToggle({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="pref-toggle-label">
      <input
        type="checkbox"
        className="pref-toggle-input sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className={`pref-toggle-track ${checked ? "is-on" : ""}`} aria-hidden>
        <span className="pref-toggle-thumb" />
      </span>
      <span className="pref-toggle-state">{checked ? "On" : "Off"}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// ProfileView
// ---------------------------------------------------------------------------

export default function ProfileView({
  user,
  heads,
  prefs,
  loading,
  loadError = "",
  sessionEmail = "",
  onBack,
  onSave
}: ProfileViewProps) {
  const [draft, setDraft] = useState<UserPreferences>(prefs);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Re-sync draft when parent prefs update (e.g. after backend hydration completes)
  useEffect(() => {
    setDraft(prefs);
  }, [prefs]);

  // Derived flags for truthful display of error states
  const apiAvailable = !loadError;
  // Heads failed to load if the API errored AND heads came back empty (they travel together)
  const headsFailed = Boolean(loadError) && heads.length === 0;

  const displayName =
    (user?.full_name ?? user?.fullName ?? "").trim() ||
    (user?.email ?? sessionEmail ?? "").trim() ||
    "—";
  const displayEmail = (user?.email ?? sessionEmail ?? "").trim();
  const initials = user
    ? initialsFromUser(user)
    : sessionEmail
      ? sessionEmail.slice(0, 2).toUpperCase()
      : "?";
  // Filter out public_quote from preference selects and display — it is not user-navigated
  const assignedHeads = heads.filter((h) => h.enabled && h.slug !== "public_quote");

  const dirty = JSON.stringify(draft) !== JSON.stringify(prefs);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    setSaveError("");
    try {
      await onSave(draft);
      setSaved(true);
      const t = window.setTimeout(() => setSaved(false), 3500);
      return () => window.clearTimeout(t);
    } catch {
      setSaveError("Could not reach server. Changes saved locally on this device.");
    } finally {
      setSaving(false);
    }
  }, [draft, onSave]);

  return (
    <div className="profile-view">

      {/* ── Hero bar ── */}
      <div className="profile-hero-bar">
        <div className="profile-hero-bar-left">
          <button
            type="button"
            className="btn btn-quiet profile-back-btn"
            onClick={onBack}
            aria-label="Back to launcher"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Launcher
          </button>
          <span className="profile-hero-divider" aria-hidden>/</span>
          <h1 className="profile-hero-title">Profile &amp; preferences</h1>
        </div>
      </div>

      {/* ── Content grid ── */}
      <div className="profile-layout">

        {/* ── My Profile card ── */}
        <section className="profile-card" aria-label="My profile">
          <div className="profile-card-ident">
            <div className="profile-avatar-lg" aria-hidden>{loading ? "…" : initials}</div>
            <div className="profile-card-ident-text">
              <p className="profile-card-display-name">{loading ? "Loading…" : displayName}</p>
              {displayEmail ? <p className="profile-card-email">{displayEmail}</p> : null}
              <span
                className={`profile-status-badge ${
                  user?.isActive !== false ? "is-active" : "is-inactive"
                }`}
              >
                {loading ? "—" : user?.isActive !== false ? "Active" : "Inactive"}
              </span>
            </div>
          </div>

          {/* Banner when profile data could not be loaded */}
          {!loading && loadError ? (
            <div className="profile-unavailable-banner" role="alert">
              <strong>Profile data unavailable.</strong> Could not reach the server
              ({loadError}). Showing session identity only. Try refreshing — if this
              persists, check your connection or contact System Admin.
            </div>
          ) : null}

          <div className="profile-fields">
            <div className="profile-field-row">
              <span className="profile-field-label">Full name</span>
              <span className="profile-field-value">{loading ? "—" : displayName}</span>
            </div>
            <div className="profile-field-row">
              <span className="profile-field-label">Email</span>
              <span className="profile-field-value">{loading ? "—" : displayEmail || "—"}</span>
            </div>
            <div className="profile-field-row">
              <span className="profile-field-label">Role</span>
              <span className="profile-field-value">
                {loading ? "—" : !apiAvailable ? (
                  <span className="profile-field-unavailable">Unavailable</span>
                ) : (
                  <span className="profile-role-chip">{formatRole(user?.role)}</span>
                )}
              </span>
            </div>
            <div className="profile-field-row">
              <span className="profile-field-label">User type</span>
              <span className="profile-field-value">
                {loading ? "—" : !apiAvailable ? (
                  <span className="profile-field-unavailable">Unavailable</span>
                ) : formatUserKind(user?.user_kind)}
              </span>
            </div>
            {!loadError && (user?.organization_name || user?.organization_id) ? (
              <div className="profile-field-row">
                <span className="profile-field-label">Workspace</span>
                <span className="profile-field-value">
                  {user?.organization_name
                    ? user.organization_name
                    : <code className="profile-field-code">{user?.organization_id}</code>
                  }
                </span>
              </div>
            ) : null}
          </div>

          <p className="profile-readonly-note">
            Name and role are set by System Admin. Contact your admin to request changes.
          </p>
        </section>

        {/* ── Preferences card ── */}
        <section className="profile-card" aria-label="Preferences">
          <h2 className="profile-section-title">Preferences</h2>
          <p className="profile-section-description">
            Personal UI settings. These affect your eliteOS experience only.
            {loadError ? (
              <span className="profile-prefs-local-note">
                {" "}Saved locally on this device until the server is available.
              </span>
            ) : null}
          </p>

          <div className="profile-prefs">

            {/* Table density */}
            <div className="pref-row">
              <div className="pref-row-meta">
                <span className="pref-row-label">Table density</span>
                <span className="pref-row-desc">Row spacing in data tables across eliteOS</span>
              </div>
              <div className="pref-density-group" role="radiogroup" aria-label="Table density">
                {(["comfortable", "compact"] as const).map((d) => (
                  <label
                    key={d}
                    className={`pref-density-btn ${draft.table_density === d ? "is-selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="table_density"
                      value={d}
                      className="sr-only"
                      checked={draft.table_density === d}
                      onChange={() => setDraft((p) => ({ ...p, table_density: d }))}
                    />
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </label>
                ))}
              </div>
            </div>

            {/* Open in new tab */}
            <div className="pref-row">
              <div className="pref-row-meta">
                <span className="pref-row-label">Open tools in new tab</span>
                <span className="pref-row-desc">When you click Open from the launcher</span>
              </div>
              <PrefToggle
                checked={draft.open_heads_in_new_tab}
                onChange={(v) => setDraft((p) => ({ ...p, open_heads_in_new_tab: v }))}
                label="Open tools in new tab"
              />
            </div>

            {/* Show advanced panels */}
            <div className="pref-row">
              <div className="pref-row-meta">
                <span className="pref-row-label">Show advanced panels by default</span>
                <span className="pref-row-desc">Technical detail sections and diagnostics</span>
              </div>
              <PrefToggle
                checked={draft.show_advanced_panels_default}
                onChange={(v) => setDraft((p) => ({ ...p, show_advanced_panels_default: v }))}
                label="Show advanced panels by default"
              />
            </div>

            {/* Default landing tool */}
            {assignedHeads.length > 0 ? (
              <div className="pref-row">
                <div className="pref-row-meta">
                  <span className="pref-row-label">Default tool</span>
                  <span className="pref-row-desc">Highlighted in the launcher as your primary tool</span>
                </div>
                <select
                  className="pref-select"
                  value={draft.default_landing_head ?? ""}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, default_landing_head: e.target.value || null }))
                  }
                  aria-label="Default tool"
                >
                  <option value="">None</option>
                  {assignedHeads.map((h) => (
                    <option key={h.slug} value={h.slug}>
                      {headTitle(h.slug)}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

          </div>
        </section>

        {/* ── Access summary card ── */}
        <section className="profile-card profile-card-access" aria-label="Access summary">
          <h2 className="profile-section-title">Access summary</h2>
          <p className="profile-section-description">
            Read-only. Access is managed by System Admin and enforced by the backend.
          </p>

          {!loading && headsFailed ? (
            <div className="profile-unavailable-banner" role="alert">
              <strong>Access summary unavailable.</strong> Could not load your tool assignments.
              Try refreshing or contact System Admin if this persists.
            </div>
          ) : (
            <div className="profile-fields">
              <div className="profile-field-row">
                <span className="profile-field-label">Role</span>
                <span className="profile-field-value">
                  {loading ? "—" : !apiAvailable ? (
                    <span className="profile-field-unavailable">Unavailable</span>
                  ) : (
                    <span className="profile-role-chip">{formatRole(user?.role)}</span>
                  )}
                </span>
              </div>
              {!loadError && (user?.organization_name || user?.organization_id) ? (
                <div className="profile-field-row">
                  <span className="profile-field-label">Workspace</span>
                  <span className="profile-field-value">
                    {user?.organization_name
                      ? user.organization_name
                      : <code className="profile-field-code">{user?.organization_id}</code>
                    }
                  </span>
                </div>
              ) : null}
              <div className="profile-field-row profile-field-row-heads">
                <span className="profile-field-label">Assigned tools</span>
                <span className="profile-field-value">
                  {loading ? "—" : assignedHeads.length > 0 ? (
                    <span className="profile-heads-list">
                      {assignedHeads.map((h) => (
                        <span key={h.slug} className="profile-head-chip">{headTitle(h.slug)}</span>
                      ))}
                    </span>
                  ) : (
                    "None assigned"
                  )}
                </span>
              </div>
            </div>
          )}
        </section>

        {/* ── Data & privacy note ── */}
        <div className="profile-privacy-note" role="note">
          <div className="profile-privacy-note-icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="profile-privacy-note-body">
            <p>
              <strong>Preferences affect your eliteOS experience only.</strong> They are stored
              per-account on the server when available; otherwise saved locally on this device.
            </p>
            <p>
              Roles, tool access, organization assignment, and partner access are controlled by
              System Admin. Backend authorization is always the source of truth — preferences never
              affect what you can access.
            </p>
          </div>
        </div>

      </div>

      {/* ── Save bar ── */}
      <div
        className={`profile-save-bar ${dirty || saved || saveError ? "is-visible" : ""}`}
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="profile-save-bar-messages">
          {saveError ? (
            <span className="save-msg is-error">{saveError}</span>
          ) : saved ? (
            <span className="save-msg is-success">Preferences saved</span>
          ) : dirty ? (
            <span className="save-msg is-pending">Unsaved changes</span>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handleSave()}
          disabled={saving || !dirty}
        >
          {saving ? "Saving…" : "Save preferences"}
        </button>
      </div>

    </div>
  );
}
