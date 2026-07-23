import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiGet } from "./lib/api";
import {
  addAlias,
  addContact,
  addLocation,
  archiveAccount,
  createAccount,
  createProspect,
  fetchAccountDirectoryPermissions,
  getAccount,
  linkQuickBooks,
  listAccounts,
  restoreAccount,
  updateAccount
} from "./lib/accountDirectoryApi";
import { getSupabase } from "./lib/supabase";
import type {
  AccountDetail,
  AccountDirectoryPermissions,
  AccountListItem,
  AccountTab
} from "./lib/types";
import {
  draftFromAccountDetail,
  emptyAccountWriteDraft,
  serializeAccountWritePayload,
  validateAccountDisplayName,
  type AccountWriteDraft
} from "./lib/accountDirectoryForm";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";

const NAV_TABS: { id: AccountTab; label: string }[] = [
  { id: "accounts", label: "Accounts" },
  { id: "prospects", label: "Prospects" },
  { id: "needs_review", label: "Needs review" },
  { id: "archived", label: "Archived" }
];

const DETAIL_TABS = [
  "Overview",
  "Contacts",
  "Locations",
  "Aliases",
  "External links",
  "Audit history"
] as const;

type DetailTab = (typeof DETAIL_TABS)[number];

type ListState = "idle" | "loading" | "empty" | "no-results" | "error" | "permission-denied";

type ModalKind =
  | "new-account"
  | "new-prospect"
  | "edit"
  | "add-contact"
  | "add-location"
  | "add-alias"
  | "link-qb"
  | "archive-confirm"
  | null;

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

function formatCityState(city?: string | null, state?: string | null): string {
  return [city, state].map((x) => String(x ?? "").trim()).filter(Boolean).join(", ") || "—";
}

function formatUpdatedAt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function defaultPermissions(): AccountDirectoryPermissions {
  return {
    canView: true,
    canCreate: true,
    canEdit: true,
    canArchive: true,
    canRestore: true,
    canLinkQuickBooks: false
  };
}

type ModalFormState = AccountWriteDraft & {
  /** Contact name / location label / alias / optional QB display name */
  auxLabel: string;
  /** Contact role / postal / alias source / QB List ID */
  auxExtra: string;
};

function emptyForm(): ModalFormState {
  return { ...emptyAccountWriteDraft(), auxLabel: "", auxExtra: "" };
}

export default function AccountDirectoryApp() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userMetaName, setUserMetaName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [userJobTitle, setUserJobTitle] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AccountTab>("accounts");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [items, setItems] = useState<AccountListItem[]>([]);
  const [listState, setListState] = useState<ListState>("idle");
  const [listError, setListError] = useState<string | null>(null);

  const [permissions, setPermissions] = useState<AccountDirectoryPermissions>(defaultPermissions());
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("Overview");
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [modal, setModal] = useState<ModalKind>(null);
  const [form, setForm] = useState<ModalFormState>(emptyForm());
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSessionToken(data.session?.access_token ?? null);
      const u = data.session?.user;
      setUserEmail(u?.email ?? "");
      setUserMetaName(String(u?.user_metadata?.full_name ?? u?.user_metadata?.name ?? "").trim());
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionToken(session?.access_token ?? null);
      const u = session?.user;
      setUserEmail(u?.email ?? "");
      setUserMetaName(String(u?.user_metadata?.full_name ?? u?.user_metadata?.name ?? "").trim());
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!sessionToken) return;
    let cancelled = false;
    (async () => {
      try {
        const me = (await apiGet("/api/me", sessionToken)) as {
          user?: { role?: string; job_title?: string; department?: string };
        };
        if (!cancelled) {
          setUserRole(String(me?.user?.role ?? "").trim());
          setUserJobTitle(String(me?.user?.job_title ?? "").trim());
          setUserDepartment(String(me?.user?.department ?? "").trim());
        }
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  const loadPermissions = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const res = await fetchAccountDirectoryPermissions(sessionToken);
      setPermissions({ ...defaultPermissions(), ...(res.permissions ?? {}) });
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 403) {
        setPermissions({ canView: false });
      }
    } finally {
      setPermissionsLoaded(true);
    }
  }, [sessionToken]);

  const loadList = useCallback(async () => {
    if (!sessionToken) return;
    setListState("loading");
    setListError(null);
    try {
      const res = await listAccounts(sessionToken, {
        tab: activeTab,
        search: search.trim() || undefined,
        status: statusFilter || undefined
      });
      const next = res.items ?? [];
      setItems(next);
      if (!permissions.canView && permissionsLoaded) {
        setListState("permission-denied");
      } else if (!next.length) {
        setListState(search.trim() || statusFilter ? "no-results" : "empty");
      } else {
        setListState("idle");
      }
    } catch (e: unknown) {
      setItems([]);
      if (e instanceof ApiError && e.status === 403) {
        setListState("permission-denied");
        setListError(e.message);
      } else {
        setListState("error");
        setListError(e instanceof ApiError ? e.message : String(e));
      }
    }
  }, [activeTab, permissions.canView, permissionsLoaded, search, sessionToken, statusFilter]);

  const loadDetail = useCallback(
    async (accountId: string) => {
      if (!sessionToken) return;
      setDetailBusy(true);
      setDetailError(null);
      try {
        const res = await getAccount(sessionToken, accountId);
        setDetail(res.account ?? null);
        if (!res.account) setDetailError("Account not found.");
      } catch (e: unknown) {
        setDetail(null);
        setDetailError(e instanceof ApiError ? e.message : String(e));
      } finally {
        setDetailBusy(false);
      }
    },
    [sessionToken]
  );

  useEffect(() => {
    if (!sessionToken) return;
    void loadPermissions();
  }, [loadPermissions, sessionToken]);

  useEffect(() => {
    if (!sessionToken || !permissionsLoaded) return;
    void loadList();
  }, [loadList, permissionsLoaded, sessionToken]);

  useEffect(() => {
    if (!selectedId || !sessionToken) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedId);
  }, [loadDetail, selectedId, sessionToken]);

  const signIn = useCallback(async () => {
    setAuthError(null);
    if (!supabase) {
      setAuthError("Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
      return;
    }
    setAuthBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail.trim(),
        password: authPassword
      });
      if (error) throw error;
      setSessionToken(data.session?.access_token ?? null);
    } catch (e: unknown) {
      setAuthError(String((e as Error)?.message || e));
    } finally {
      setAuthBusy(false);
    }
  }, [authEmail, authPassword, supabase]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setSessionToken(null);
    setItems([]);
    setSelectedId(null);
    setDetail(null);
  }, [supabase]);

  const openModal = useCallback(
    (kind: ModalKind, seed?: Partial<ModalFormState>) => {
      setFormError(null);
      if (kind === "edit" && detail) {
        setForm({
          ...emptyForm(),
          ...draftFromAccountDetail(detail)
        });
      } else if (seed) {
        setForm({ ...emptyForm(), ...seed });
      } else {
        setForm(emptyForm());
      }
      setModal(kind);
    },
    [detail]
  );

  const closeModal = useCallback(() => {
    if (formBusy) return;
    setModal(null);
    setFormError(null);
  }, [formBusy]);

  const submitForm = useCallback(async () => {
    if (!sessionToken || !modal || formBusy) return;

    const accountModals = modal === "new-account" || modal === "new-prospect" || modal === "edit";
    if (accountModals) {
      const err = validateAccountDisplayName(form.displayName);
      if (err) {
        setFormError(err);
        return;
      }
    }

    const auxLabel = form.auxLabel.trim();
    if (
      (modal === "add-contact" || modal === "add-location" || modal === "add-alias") &&
      !auxLabel
    ) {
      setFormError("Name is required.");
      return;
    }
    if (modal === "link-qb" && !form.auxExtra.trim()) {
      setFormError("QuickBooks List ID is required.");
      return;
    }

    setFormBusy(true);
    setFormError(null);
    try {
      if (modal === "new-account") {
        const payload = serializeAccountWritePayload(form);
        const res = await createAccount(sessionToken, payload);
        if (res.account?.id) {
          setSelectedId(res.account.id);
          setActiveTab("accounts");
        }
        setActionMessage("Account created.");
      } else if (modal === "new-prospect") {
        const payload = serializeAccountWritePayload(form);
        const res = await createProspect(sessionToken, payload);
        if (res.account?.id) {
          setSelectedId(res.account.id);
          setActiveTab("prospects");
        }
        setActionMessage("Prospect created.");
      } else if (modal === "edit" && selectedId) {
        const payload = serializeAccountWritePayload(form, {
          rowVersion: detail?.rowVersion != null ? Number(detail.rowVersion) : undefined
        });
        await updateAccount(sessionToken, selectedId, payload);
        await loadDetail(selectedId);
        setActionMessage("Account updated.");
      } else if (modal === "add-contact" && selectedId) {
        await addContact(sessionToken, selectedId, {
          name: auxLabel,
          email: form.primaryEmail?.trim() || undefined,
          phone: form.primaryPhone?.trim() || undefined,
          role: form.auxExtra.trim() || undefined
        });
        await loadDetail(selectedId);
        setActionMessage("Contact added.");
      } else if (modal === "add-location" && selectedId) {
        await addLocation(sessionToken, selectedId, {
          label: auxLabel,
          line1: form.primaryEmail?.trim() || undefined,
          city: form.city?.trim() || undefined,
          state: form.state?.trim() || undefined,
          postalCode: form.auxExtra.trim() || undefined
        });
        await loadDetail(selectedId);
        setActionMessage("Location added.");
      } else if (modal === "add-alias" && selectedId) {
        await addAlias(sessionToken, selectedId, {
          alias: auxLabel,
          source: form.auxExtra.trim() || undefined
        });
        await loadDetail(selectedId);
        setActionMessage("Alias added.");
      } else if (modal === "link-qb" && selectedId) {
        await linkQuickBooks(sessionToken, selectedId, {
          externalId: form.auxExtra.trim(),
          externalDisplayName: form.displayName.trim() || form.auxLabel.trim() || undefined
        });
        await loadDetail(selectedId);
        setActionMessage("QuickBooks linked.");
      } else if (modal === "archive-confirm" && selectedId) {
        await archiveAccount(sessionToken, selectedId);
        setSelectedId(null);
        setActiveTab("archived");
        setActionMessage("Account archived.");
      }
      setModal(null);
      setForm(emptyForm());
      await loadList();
    } catch (e: unknown) {
      setFormError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setFormBusy(false);
    }
  }, [detail, form, formBusy, loadDetail, loadList, modal, selectedId, sessionToken]);

  const handleRestore = useCallback(async () => {
    if (!sessionToken || !selectedId) return;
    setFormBusy(true);
    setFormError(null);
    try {
      await restoreAccount(sessionToken, selectedId);
      setActiveTab("accounts");
      setActionMessage("Account restored.");
      await loadList();
      await loadDetail(selectedId);
    } catch (e: unknown) {
      setFormError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setFormBusy(false);
    }
  }, [loadDetail, loadList, selectedId, sessionToken]);

  const userDisplayName = userMetaName || deriveDisplayNameFromEmail(userEmail) || userEmail || "Staff";
  const userDisplayEmail = userEmail;
  const userDisplayInitials = useMemo(
    () => userInitialsFor(userMetaName, userEmail),
    [userMetaName, userEmail]
  );
  const chipSubtitle = useMemo(() => {
    const roleTitle = (userJobTitle || userDepartment || userRole || "").trim();
    if (roleTitle) return roleTitle.replace(/_/g, " ");
    if (userDisplayEmail && userDisplayEmail.toLowerCase() !== userDisplayName.toLowerCase()) {
      return userDisplayEmail;
    }
    return "";
  }, [userDepartment, userDisplayEmail, userDisplayName, userJobTitle, userRole]);

  const menuItems: EliteosTopbarMenuItem[] = [
    {
      label: "Open Home",
      meta: "eliteOS Launcher",
      href: homeLauncherUrl(),
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M3 11.5L12 4l9 7.5" />
          <path d="M5 10v10h14V10" />
        </svg>
      )
    },
    {
      label: "Refresh list",
      meta: "Reload accounts",
      onClick: () => void loadList(),
      disabled: listState === "loading",
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 4v5h-5" />
        </svg>
      )
    }
  ];

  const modalTitle =
    modal === "new-account"
      ? "New account"
      : modal === "new-prospect"
        ? "New prospect"
        : modal === "edit"
          ? "Edit account"
          : modal === "add-contact"
            ? "Add contact"
            : modal === "add-location"
              ? "Add location"
              : modal === "add-alias"
                ? "Add alias"
                : modal === "archive-confirm"
                  ? "Archive account"
                  : modal === "link-qb"
                    ? "Link QuickBooks"
                    : "";

  const showPrimaryNew = activeTab !== "archived" && permissions.canCreate;

  return (
    <div className="shell">
      {sessionToken ? (
        <EliteosTopbar
          appName="Account Directory"
          organizationName={DEFAULT_WORKSPACE_NAME}
          logoSrc={EOS_LOGO_URL}
          homeHref="/"
          userName={userDisplayName}
          userEmail={userDisplayEmail}
          userSubtitle={chipSubtitle}
          initials={userDisplayInitials}
          menuItems={menuItems}
          onSignOut={() => void signOut()}
        />
      ) : (
        <EliteosTopbar
          appName="Account Directory"
          organizationName={DEFAULT_WORKSPACE_NAME}
          logoSrc={EOS_LOGO_URL}
          homeHref="/"
        />
      )}

      <main className="main" role="main">
        {!supabase ? (
          <div className="banner banner-warn" role="alert">
            Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>.
          </div>
        ) : null}

        {!sessionToken ? (
          <section className="auth-panel auth-panel-standalone" aria-label="Sign in">
            <header className="auth-panel-header">
              <p className="auth-panel-eyebrow">Account Directory · {DEFAULT_WORKSPACE_NAME}</p>
              <h2 className="auth-panel-title">Sign in to continue</h2>
              <p className="auth-panel-sub">
                Manage accounts, contacts, locations, and external links for your organization.
              </p>
            </header>
            <div className="field-grid">
              <label className="field">
                Email
                <input value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} autoComplete="username" />
              </label>
              <label className="field">
                Password
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
            </div>
            {authError ? (
              <div className="banner banner-error" role="alert">
                {authError}
              </div>
            ) : null}
            <button type="button" className="btn btn-primary" disabled={authBusy} onClick={() => void signIn()}>
              {authBusy ? "Signing in…" : "Sign in"}
            </button>
          </section>
        ) : (
          <>
            <header className="page-header">
              <div>
                <p className="hero-eyebrow">Organization accounts</p>
                <h1 className="page-title">Account Directory</h1>
                <p className="page-sub">Accounts, prospects, contacts, and external system links.</p>
              </div>
              <div className="page-header-actions">
                {showPrimaryNew ? (
                  <button type="button" className="btn btn-primary" onClick={() => openModal("new-account")}>
                    New account
                  </button>
                ) : null}
                {permissions.canCreate && activeTab !== "archived" ? (
                  <button type="button" className="btn btn-secondary" onClick={() => openModal("new-prospect")}>
                    New prospect
                  </button>
                ) : null}
              </div>
            </header>

            <nav className="ad-nav" aria-label="Account views">
              {NAV_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={activeTab === tab.id ? "ad-nav-tab ad-nav-tab-active" : "ad-nav-tab"}
                  aria-current={activeTab === tab.id ? "page" : undefined}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSelectedId(null);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {actionMessage ? (
              <div className="banner banner-info" role="status">
                {actionMessage}
                <button type="button" className="banner-dismiss" onClick={() => setActionMessage(null)}>
                  Dismiss
                </button>
              </div>
            ) : null}

            <section className="list-toolbar" aria-label="Search and filters">
              <label className="field field-search">
                Search
                <input
                  type="search"
                  placeholder="Account name, contact, email…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <label className="field">
                Status
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  <option value="prospect">Prospect</option>
                  <option value="needs_review">Needs review</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <button type="button" className="btn btn-secondary" onClick={() => void loadList()}>
                Apply
              </button>
            </section>

            <div className={selectedId ? "ad-layout ad-layout-split" : "ad-layout"}>
              <section className="list-panel" aria-label="Account list">
                {listState === "loading" ? <p className="loading">Loading accounts…</p> : null}

                {listState === "permission-denied" ? (
                  <div className="state-panel state-panel-denied" role="alert">
                    <h2>Permission denied</h2>
                    <p>You do not have access to Account Directory for this organization.</p>
                    {listError ? <p className="muted">{listError}</p> : null}
                  </div>
                ) : null}

                {listState === "error" ? (
                  <div className="state-panel state-panel-error" role="alert">
                    <h2>Unable to load accounts</h2>
                    <p>{listError || "Something went wrong."}</p>
                    <button type="button" className="btn btn-primary" onClick={() => void loadList()}>
                      Retry
                    </button>
                  </div>
                ) : null}

                {listState === "empty" ? (
                  <div className="empty-state">
                    <h2>No accounts yet</h2>
                    <p>
                      {activeTab === "prospects"
                        ? "Create a prospect to track early-stage relationships."
                        : activeTab === "needs_review"
                          ? "Accounts flagged for review will appear here."
                          : activeTab === "archived"
                            ? "Archived accounts will appear here."
                            : "Create your first account to get started."}
                    </p>
                    {permissions.canCreate && activeTab !== "archived" ? (
                      <button type="button" className="btn btn-primary" onClick={() => openModal("new-account")}>
                        New account
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {listState === "no-results" ? (
                  <div className="empty-state">
                    <h2>No matching accounts</h2>
                    <p>Try clearing search or status filters.</p>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setSearch("");
                        setStatusFilter("");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                ) : null}

                {listState === "idle" && items.length > 0 ? (
                  <div className="table-wrap">
                    <table className="ad-table">
                      <thead>
                        <tr>
                          <th scope="col">Account name</th>
                          <th scope="col">Primary contact</th>
                          <th scope="col">Primary email</th>
                          <th scope="col">Primary phone</th>
                          <th scope="col">City / state</th>
                          <th scope="col">Status</th>
                          <th scope="col">QuickBooks</th>
                          <th scope="col">Last updated</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr
                            key={item.id}
                            className={selectedId === item.id ? "ad-row ad-row-selected" : "ad-row"}
                            onClick={() => setSelectedId(item.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setSelectedId(item.id);
                              }
                            }}
                            tabIndex={0}
                            role="button"
                            aria-pressed={selectedId === item.id}
                          >
                            <td className="ad-cell-name">{item.name}</td>
                            <td>{item.primaryContact || "—"}</td>
                            <td>{item.primaryEmail || "—"}</td>
                            <td>{item.primaryPhone || "—"}</td>
                            <td>{formatCityState(item.city, item.state)}</td>
                            <td>
                              <span className="status-pill">{statusLabel(item.status)}</span>
                            </td>
                            <td>{item.quickbooksLinked ? "Linked" : "—"}</td>
                            <td>{formatUpdatedAt(item.updatedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>

              {selectedId ? (
                <aside className="detail-drawer" aria-label="Account detail">
                  <header className="detail-drawer-head">
                    <div>
                      <p className="hero-eyebrow">Account detail</p>
                      <h2 className="detail-title">{detail?.name ?? "Loading…"}</h2>
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelectedId(null)}>
                      Close
                    </button>
                  </header>

                  <div className="detail-actions">
                    {permissions.canEdit ? (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openModal("edit")}>
                        Edit
                      </button>
                    ) : null}
                    {permissions.canEdit ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openModal("add-contact")}
                        >
                          Add contact
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openModal("add-location")}
                        >
                          Add location
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openModal("add-alias")}>
                          Add alias
                        </button>
                      </>
                    ) : null}
                    {permissions.canLinkQuickBooks ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={formBusy}
                        onClick={() => openModal("link-qb", { displayName: detail?.name || detail?.displayName || "" })}
                      >
                        Link QuickBooks
                      </button>
                    ) : (
                      <span className="chip chip-muted" title="You do not have permission to link QuickBooks">
                        QuickBooks restricted
                      </span>
                    )}
                    {activeTab === "archived" && permissions.canRestore ? (
                      <button type="button" className="btn btn-primary btn-sm" disabled={formBusy} onClick={() => void handleRestore()}>
                        Restore
                      </button>
                    ) : null}
                    {activeTab !== "archived" && permissions.canArchive ? (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openModal("archive-confirm")}>
                        Archive
                      </button>
                    ) : null}
                  </div>

                  <nav className="detail-tabs" aria-label="Detail sections">
                    {DETAIL_TABS.map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        className={detailTab === tab ? "detail-tab detail-tab-active" : "detail-tab"}
                        aria-current={detailTab === tab ? "true" : undefined}
                        onClick={() => setDetailTab(tab)}
                      >
                        {tab}
                      </button>
                    ))}
                  </nav>

                  {detailBusy ? <p className="loading">Loading account…</p> : null}
                  {detailError ? (
                    <div className="banner banner-error" role="alert">
                      {detailError}
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadDetail(selectedId)}>
                        Retry
                      </button>
                    </div>
                  ) : null}
                  {formError && !modal ? (
                    <div className="banner banner-error" role="alert">
                      {formError}
                    </div>
                  ) : null}

                  {detail && !detailBusy ? (
                    <div className="detail-body">
                      {detailTab === "Overview" ? (
                        <dl className="detail-dl">
                          <dt>Account name</dt>
                          <dd>{detail.name}</dd>
                          <dt>Primary contact</dt>
                          <dd>{detail.primaryContact || "—"}</dd>
                          <dt>Primary email</dt>
                          <dd>{detail.primaryEmail || "—"}</dd>
                          <dt>Primary phone</dt>
                          <dd>{detail.primaryPhone || "—"}</dd>
                          <dt>City / state</dt>
                          <dd>{formatCityState(detail.city, detail.state)}</dd>
                          <dt>Status</dt>
                          <dd>{statusLabel(detail.status)}</dd>
                          <dt>QuickBooks</dt>
                          <dd>{detail.quickbooksLinked ? "Linked" : "Not linked"}</dd>
                          <dt>Last updated</dt>
                          <dd>{formatUpdatedAt(detail.updatedAt)}</dd>
                          {detail.notes ? (
                            <>
                              <dt>Notes</dt>
                              <dd>{detail.notes}</dd>
                            </>
                          ) : null}
                        </dl>
                      ) : null}

                      {detailTab === "Contacts" ? (
                        <DetailList
                          empty="No contacts on file."
                          items={(detail.contacts ?? []).map((c) => ({
                            id: c.id,
                            title: c.name,
                            meta: [c.role, c.email, c.phone].filter(Boolean).join(" · ")
                          }))}
                        />
                      ) : null}

                      {detailTab === "Locations" ? (
                        <DetailList
                          empty="No locations on file."
                          items={(detail.locations ?? []).map((l) => ({
                            id: l.id,
                            title: l.label || l.line1 || "Location",
                            meta: [l.line1, l.line2, formatCityState(l.city, l.state), l.postalCode]
                              .filter(Boolean)
                              .join(" · ")
                          }))}
                        />
                      ) : null}

                      {detailTab === "Aliases" ? (
                        <DetailList
                          empty="No aliases on file."
                          items={(detail.aliases ?? []).map((a) => ({
                            id: a.id,
                            title: a.alias,
                            meta: a.source || ""
                          }))}
                        />
                      ) : null}

                      {detailTab === "External links" ? (
                        <DetailList
                          empty="No external links on file."
                          items={(detail.externalLinks ?? []).map((link) => ({
                            id: link.id,
                            title: link.system,
                            meta: link.externalId,
                            href: link.url || undefined
                          }))}
                        />
                      ) : null}

                      {detailTab === "Audit history" ? (
                        <DetailList
                          empty="No audit history yet."
                          items={(detail.auditHistory ?? []).map((entry) => ({
                            id: entry.id,
                            title: entry.action,
                            meta: [formatUpdatedAt(entry.at), entry.actor, entry.detail].filter(Boolean).join(" · ")
                          }))}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </aside>
              ) : null}
            </div>
          </>
        )}
      </main>

      {modal ? (
        <div className="modal-backdrop" role="presentation" onClick={closeModal}>
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ad-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-head">
              <h2 id="ad-modal-title">{modalTitle}</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeModal}>
                Close
              </button>
            </header>

            {modal === "archive-confirm" ? (
              <p>Archive this account? You can restore it later from the Archived tab.</p>
            ) : modal === "link-qb" ? (
              <div className="field-grid">
                <label className="field">
                  Display name (optional)
                  <input
                    value={form.displayName}
                    onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                  />
                </label>
                <label className="field">
                  QuickBooks List ID
                  <input
                    value={form.auxExtra}
                    onChange={(e) => setForm((f) => ({ ...f, auxExtra: e.target.value }))}
                    autoFocus
                    required
                  />
                </label>
              </div>
            ) : (
              <div className="field-grid">
                <label className="field">
                  {modal === "add-contact"
                    ? "Contact name"
                    : modal === "add-location"
                      ? "Location label"
                      : modal === "add-alias"
                        ? "Alias"
                        : "Account name"}
                  <input
                    value={
                      modal === "add-contact" || modal === "add-location" || modal === "add-alias"
                        ? form.auxLabel
                        : form.displayName
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      if (modal === "add-contact" || modal === "add-location" || modal === "add-alias") {
                        setForm((f) => ({ ...f, auxLabel: v }));
                        return;
                      }
                      setForm((f) => ({ ...f, displayName: v }));
                      if (formError === "Account name is required." && v.trim()) {
                        setFormError(null);
                      }
                    }}
                    autoFocus
                  />
                </label>
                {modal !== "add-alias" ? (
                  <>
                    <label className="field">
                      {modal === "add-location" ? "Address line 1" : "Primary email"}
                      <input
                        value={form.primaryEmail}
                        onChange={(e) => setForm((f) => ({ ...f, primaryEmail: e.target.value }))}
                      />
                    </label>
                    <label className="field">
                      {modal === "add-location" ? "Postal code" : "Primary phone"}
                      <input
                        value={modal === "add-location" ? form.auxExtra : form.primaryPhone}
                        onChange={(e) =>
                          setForm((f) =>
                            modal === "add-location"
                              ? { ...f, auxExtra: e.target.value }
                              : { ...f, primaryPhone: e.target.value }
                          )
                        }
                      />
                    </label>
                  </>
                ) : null}
                {modal === "new-account" || modal === "new-prospect" || modal === "edit" ? (
                  <>
                    <label className="field">
                      City
                      <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
                    </label>
                    <label className="field">
                      State
                      <input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
                    </label>
                  </>
                ) : null}
                {modal === "add-alias" ? (
                  <label className="field">
                    Source (optional)
                    <input value={form.auxExtra} onChange={(e) => setForm((f) => ({ ...f, auxExtra: e.target.value }))} />
                  </label>
                ) : null}
                {modal === "add-contact" ? (
                  <label className="field">
                    Role (optional)
                    <input value={form.auxExtra} onChange={(e) => setForm((f) => ({ ...f, auxExtra: e.target.value }))} />
                  </label>
                ) : null}
              </div>
            )}

            {formError ? (
              <div className="banner banner-error" role="alert">
                {formError}
              </div>
            ) : null}

            <footer className="modal-foot">
              <button type="button" className="btn btn-secondary" disabled={formBusy} onClick={closeModal}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={formBusy} onClick={() => void submitForm()}>
                {formBusy ? "Saving…" : modal === "archive-confirm" ? "Archive" : "Save"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DetailList(props: {
  empty: string;
  items: { id: string; title: string; meta?: string; href?: string }[];
}) {
  if (!props.items.length) return <p className="muted">{props.empty}</p>;
  return (
    <ul className="detail-list">
      {props.items.map((item) => (
        <li key={item.id} className="detail-list-item">
          {item.href ? (
            <a href={item.href} target="_blank" rel="noreferrer" className="detail-list-title">
              {item.title}
            </a>
          ) : (
            <span className="detail-list-title">{item.title}</span>
          )}
          {item.meta ? <span className="detail-list-meta">{item.meta}</span> : null}
        </li>
      ))}
    </ul>
  );
}
