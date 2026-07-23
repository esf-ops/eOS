import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiGet } from "./lib/api";
import {
  addAlias,
  addContact,
  addLocation,
  archiveAccount,
  createAccount,
  createProspect,
  fetchAccountDirectoryPermissions,
  fetchAccountDirectorySummary,
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
  AccountSummary
} from "./lib/types";
import {
  draftFromAccountDetail,
  emptyAccountWriteDraft,
  serializeAccountWritePayload,
  validateAccountDisplayName,
  type AccountWriteDraft
} from "./lib/accountDirectoryForm";
import {
  activityLabel,
  buildPageNumbers,
  formatResultRange,
  initials,
  parseUrlState,
  serializeUrlState,
  type UrlState
} from "./lib/accountDirectoryWorkspace";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";

const NAV_TABS: { id: string; label: string }[] = [
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
  "Activity"
] as const;

type DetailTab = (typeof DETAIL_TABS)[number];

const SORT_OPTIONS = [
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "updated_desc", label: "Recently updated" },
  { value: "updated_asc", label: "Oldest updated" }
];

const PAGE_SIZE_OPTIONS = [25, 50, 100];

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

type ModalFormState = AccountWriteDraft & {
  auxLabel: string;
  auxExtra: string;
};

/* ──────────────── Utility helpers ──────────────── */

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
  if (status === "needs_review") return "Needs review";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusPillClass(status: string): string {
  if (status === "active") return "status-pill status-pill-active";
  if (status === "prospect") return "status-pill status-pill-prospect";
  if (status === "needs_review") return "status-pill status-pill-needs-review";
  if (status === "archived") return "status-pill status-pill-archived";
  return "status-pill status-pill-default";
}

function monogramClass(status: string): string {
  if (status === "active") return "monogram monogram-active";
  if (status === "prospect") return "monogram monogram-prospect";
  if (status === "needs_review") return "monogram monogram-needs-review";
  if (status === "archived") return "monogram monogram-archived";
  return "monogram monogram-default";
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

function emptyForm(): ModalFormState {
  return { ...emptyAccountWriteDraft(), auxLabel: "", auxExtra: "" };
}

function hasActiveFilters(u: UrlState): boolean {
  return Boolean(u.search || u.status || u.linked || u.missingContact || u.missingLocation);
}

type FilterChipDef = { key: string; label: string };

function activeFilterChips(u: UrlState): FilterChipDef[] {
  const chips: FilterChipDef[] = [];
  if (u.search) chips.push({ key: "search", label: `"${u.search}"` });
  if (u.status) chips.push({ key: "status", label: statusLabel(u.status) });
  if (u.linked === "true") chips.push({ key: "linked", label: "QB linked" });
  if (u.missingContact === "true") chips.push({ key: "missingContact", label: "Missing contact" });
  if (u.missingLocation === "true") chips.push({ key: "missingLocation", label: "Missing location" });
  return chips;
}

/* ──────────────── Main App ──────────────── */

export default function AccountDirectoryApp() {
  const supabase = getSupabase();

  /* ─── Auth state ─── */
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

  /* ─── URL-driven state ─── */
  const [urlState, setUrlState] = useState<UrlState>(() => parseUrlState(window.location.search));
  const [searchInput, setSearchInput] = useState(urlState.search);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ─── List state ─── */
  const [items, setItems] = useState<AccountListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [listState, setListState] = useState<ListState>("idle");
  const [listError, setListError] = useState<string | null>(null);

  /* ─── Summary ─── */
  const [summary, setSummary] = useState<AccountSummary | null>(null);

  /* ─── Permissions ─── */
  const [permissions, setPermissions] = useState<AccountDirectoryPermissions>(defaultPermissions());
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  /* ─── Detail panel ─── */
  const [detail, setDetail] = useState<AccountDetail | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("Overview");
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  /* ─── Modals ─── */
  const [modal, setModal] = useState<ModalKind>(null);
  const [form, setForm] = useState<ModalFormState>(emptyForm());
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  /* ─── Derived ─── */
  const totalPages = Math.max(Math.ceil(total / urlState.pageSize), 1);
  const hasPreviousPage = urlState.page > 1;
  const hasNextPage = urlState.page < totalPages;
  const filterKey = useMemo(
    () =>
      JSON.stringify({
        tab: urlState.tab,
        page: urlState.page,
        pageSize: urlState.pageSize,
        search: urlState.search,
        status: urlState.status,
        linked: urlState.linked,
        missingContact: urlState.missingContact,
        missingLocation: urlState.missingLocation,
        sort: urlState.sort
      }),
    [urlState]
  );

  /* ─── URL sync ─── */
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const url = serializeUrlState(urlState);
    const current = window.location.search || "";
    if (url !== current) {
      history.pushState(null, "", url || window.location.pathname);
    }
  }, [urlState]);

  useEffect(() => {
    function onPopstate() {
      const next = parseUrlState(window.location.search);
      setUrlState(next);
      setSearchInput(next.search);
    }
    window.addEventListener("popstate", onPopstate);
    return () => window.removeEventListener("popstate", onPopstate);
  }, []);

  /* ─── Auth effects ─── */
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

  /* ─── Data loading ─── */
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

  const loadSummary = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const res = await fetchAccountDirectorySummary(sessionToken);
      if (res.summary) setSummary(res.summary);
    } catch {
      /* summary is enhancement-only, ignore errors */
    }
  }, [sessionToken]);

  const loadList = useCallback(async () => {
    if (!sessionToken) return;
    setListState((prev) => (prev === "idle" || prev === "no-results" || prev === "empty" ? "loading" : "loading"));
    setListError(null);
    try {
      const res = await listAccounts(sessionToken, {
        tab: urlState.tab,
        search: urlState.search || undefined,
        status: urlState.status || undefined,
        page: urlState.page,
        pageSize: urlState.pageSize,
        sort: urlState.sort !== "name_asc" ? urlState.sort : undefined,
        linked: urlState.linked || undefined,
        missingContact: urlState.missingContact || undefined,
        missingLocation: urlState.missingLocation || undefined
      });
      const next = res.items ?? [];
      setItems(next);
      setTotal(res.total ?? next.length);
      if (!permissions.canView && permissionsLoaded) {
        setListState("permission-denied");
      } else if (!next.length) {
        setListState(hasActiveFilters(urlState) ? "no-results" : "empty");
      } else {
        setListState("idle");
      }
    } catch (e: unknown) {
      setItems([]);
      setTotal(0);
      if (e instanceof ApiError && e.status === 403) {
        setListState("permission-denied");
        setListError(e.message);
      } else {
        setListState("error");
        setListError(e instanceof ApiError ? e.message : String(e));
      }
    }
  }, [sessionToken, urlState, permissions.canView, permissionsLoaded]); // eslint-disable-line

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
    void loadSummary();
  }, [filterKey, permissionsLoaded, sessionToken]); // eslint-disable-line

  useEffect(() => {
    if (!urlState.account || !sessionToken) {
      setDetail(null);
      return;
    }
    void loadDetail(urlState.account);
    setDetailTab("Overview");
  }, [urlState.account, sessionToken]); // eslint-disable-line

  /* ─── Filter/pagination helpers ─── */
  function updateFilters(patch: Partial<UrlState>) {
    const isPageChange = Object.keys(patch).every((k) => k === "page");
    setUrlState((prev) => ({
      ...prev,
      ...patch,
      page: isPageChange ? (patch.page ?? prev.page) : 1
    }));
  }

  function selectAccount(id: string | null) {
    setUrlState((prev) => ({ ...prev, account: id }));
  }

  function clearAllFilters() {
    setSearchInput("");
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    setUrlState((prev) => ({
      ...prev,
      search: "",
      status: "",
      linked: "",
      missingContact: "",
      missingLocation: "",
      page: 1
    }));
  }

  function removeChip(key: string) {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (key === "search") setSearchInput("");
    setUrlState((prev) => ({
      ...prev,
      [key]: "",
      page: 1
    }));
  }

  function handleSearchInput(value: string) {
    setSearchInput(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setUrlState((prev) => ({ ...prev, search: value, page: 1 }));
    }, 300);
  }

  /* ─── Auth actions ─── */
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
    selectAccount(null);
    setDetail(null);
  }, [supabase]); // eslint-disable-line

  /* ─── Modal actions ─── */
  const openModal = useCallback(
    (kind: ModalKind, seed?: Partial<ModalFormState>) => {
      setFormError(null);
      if (kind === "edit" && detail) {
        setForm({ ...emptyForm(), ...draftFromAccountDetail(detail) });
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

    const isAccountModal = modal === "new-account" || modal === "new-prospect" || modal === "edit";
    if (isAccountModal) {
      const err = validateAccountDisplayName(form.displayName);
      if (err) {
        setFormError(err);
        return;
      }
    }

    const auxLabel = form.auxLabel.trim();
    if ((modal === "add-contact" || modal === "add-location" || modal === "add-alias") && !auxLabel) {
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
        const res = await createAccount(sessionToken, serializeAccountWritePayload(form));
        if (res.account?.id) {
          selectAccount(res.account.id);
          setUrlState((prev) => ({ ...prev, tab: "accounts", account: res.account?.id ?? null }));
        }
        setActionMessage("Account created.");
      } else if (modal === "new-prospect") {
        const res = await createProspect(sessionToken, serializeAccountWritePayload(form));
        if (res.account?.id) {
          setUrlState((prev) => ({ ...prev, tab: "prospects", account: res.account?.id ?? null }));
        }
        setActionMessage("Prospect created.");
      } else if (modal === "edit" && urlState.account) {
        await updateAccount(sessionToken, urlState.account, {
          ...serializeAccountWritePayload(form),
          rowVersion: detail?.rowVersion != null ? Number(detail.rowVersion) : undefined
        });
        await loadDetail(urlState.account);
        setActionMessage("Account updated.");
      } else if (modal === "add-contact" && urlState.account) {
        await addContact(sessionToken, urlState.account, {
          name: auxLabel,
          email: form.primaryEmail?.trim() || undefined,
          phone: form.primaryPhone?.trim() || undefined,
          role: form.auxExtra.trim() || undefined
        });
        await loadDetail(urlState.account);
        setActionMessage("Contact added.");
      } else if (modal === "add-location" && urlState.account) {
        await addLocation(sessionToken, urlState.account, {
          label: auxLabel,
          line1: form.primaryEmail?.trim() || undefined,
          city: form.city?.trim() || undefined,
          state: form.state?.trim() || undefined,
          postalCode: form.auxExtra.trim() || undefined
        });
        await loadDetail(urlState.account);
        setActionMessage("Location added.");
      } else if (modal === "add-alias" && urlState.account) {
        await addAlias(sessionToken, urlState.account, {
          alias: auxLabel,
          source: form.auxExtra.trim() || undefined
        });
        await loadDetail(urlState.account);
        setActionMessage("Alias added.");
      } else if (modal === "link-qb" && urlState.account) {
        await linkQuickBooks(sessionToken, urlState.account, {
          externalId: form.auxExtra.trim(),
          externalDisplayName: form.displayName.trim() || form.auxLabel.trim() || undefined
        });
        await loadDetail(urlState.account);
        setActionMessage("QuickBooks linked.");
      } else if (modal === "archive-confirm" && urlState.account) {
        await archiveAccount(sessionToken, urlState.account);
        selectAccount(null);
        setUrlState((prev) => ({ ...prev, tab: "archived", account: null }));
        setActionMessage("Account archived.");
      }
      setModal(null);
      setForm(emptyForm());
      await loadList();
      await loadSummary();
    } catch (e: unknown) {
      setFormError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setFormBusy(false);
    }
  }, [detail, form, formBusy, loadDetail, loadList, loadSummary, modal, urlState.account, sessionToken]); // eslint-disable-line

  const handleRestore = useCallback(async () => {
    if (!sessionToken || !urlState.account) return;
    setFormBusy(true);
    try {
      await restoreAccount(sessionToken, urlState.account);
      setUrlState((prev) => ({ ...prev, tab: "accounts" }));
      setActionMessage("Account restored.");
      await loadList();
      await loadDetail(urlState.account);
      await loadSummary();
    } catch (e: unknown) {
      setFormError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setFormBusy(false);
    }
  }, [loadDetail, loadList, loadSummary, urlState.account, sessionToken]); // eslint-disable-line

  /* ─── Topbar ─── */
  const userDisplayName = userMetaName || deriveDisplayNameFromEmail(userEmail) || userEmail || "Staff";
  const userDisplayInitials = useMemo(() => userInitialsFor(userMetaName, userEmail), [userMetaName, userEmail]);
  const chipSubtitle = useMemo(() => {
    const roleTitle = (userJobTitle || userDepartment || userRole || "").trim();
    if (roleTitle) return roleTitle.replace(/_/g, " ");
    return userEmail.toLowerCase() !== userDisplayName.toLowerCase() ? userEmail : "";
  }, [userDepartment, userEmail, userDisplayName, userJobTitle, userRole]);

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

  /* ─── Modal title ─── */
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

  const showPrimaryNew = urlState.tab !== "archived" && permissions.canCreate;

  /* ─── Scroll to top on page change ─── */
  const listPanelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (listPanelRef.current) {
      listPanelRef.current.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [urlState.page]);

  /* ─── Live region count for accessibility ─── */
  const liveCount =
    listState === "idle" && total > 0 ? `${total.toLocaleString()} accounts` : "";

  return (
    <div className="shell">
      {sessionToken ? (
        <EliteosTopbar
          appName="Account Directory"
          organizationName={DEFAULT_WORKSPACE_NAME}
          logoSrc={EOS_LOGO_URL}
          homeHref="/"
          userName={userDisplayName}
          userEmail={userEmail}
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
        {/* Supabase config warning */}
        {!supabase ? (
          <div className="banner banner-warn" role="alert">
            Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code>.
          </div>
        ) : null}

        {!sessionToken ? (
          /* ─── Auth panel ─── */
          <section className="auth-panel" aria-label="Sign in">
            <p className="auth-panel-eyebrow">Account Directory · {DEFAULT_WORKSPACE_NAME}</p>
            <h2 className="auth-panel-title">Sign in to continue</h2>
            <p className="auth-panel-sub">
              Manage accounts, contacts, locations, and external links for your organization.
            </p>
            <div className="field-grid">
              <label className="field">
                Email
                <input
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  autoComplete="username"
                  onKeyDown={(e) => e.key === "Enter" && void signIn()}
                />
              </label>
              <label className="field">
                Password
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  autoComplete="current-password"
                  onKeyDown={(e) => e.key === "Enter" && void signIn()}
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
            {/* ─── Page header ─── */}
            <header className="page-header">
              <div className="page-header-left">
                <p className="hero-eyebrow">Organization Accounts</p>
                <h1 className="page-title">Account Directory</h1>
                <p className="page-sub">
                  Manage accounts, contacts, locations, and external links.
                  {total > 0 ? (
                    <>
                      {" "}
                      <span className="page-sub-count" aria-live="polite" aria-atomic="true">
                        {total.toLocaleString()} total
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="page-header-actions">
                {showPrimaryNew ? (
                  <button type="button" className="btn btn-primary" onClick={() => openModal("new-account")}>
                    New account
                  </button>
                ) : null}
                {permissions.canCreate && urlState.tab !== "archived" ? (
                  <button type="button" className="btn btn-secondary" onClick={() => openModal("new-prospect")}>
                    New prospect
                  </button>
                ) : null}
              </div>
            </header>

            {/* ─── Summary strip ─── */}
            {summary ? (
              <SummaryStrip
                summary={summary}
                urlState={urlState}
                onApply={(patch) => {
                  setSearchInput("");
                  if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                  setUrlState((prev) => ({
                    ...prev,
                    search: "",
                    linked: "",
                    missingContact: "",
                    missingLocation: "",
                    status: "",
                    ...patch,
                    page: 1
                  }));
                }}
              />
            ) : null}

            {/* ─── Nav tabs ─── */}
            <nav className="ad-nav" aria-label="Account views">
              {NAV_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={urlState.tab === tab.id ? "ad-nav-tab ad-nav-tab-active" : "ad-nav-tab"}
                  aria-current={urlState.tab === tab.id ? "page" : undefined}
                  onClick={() => updateFilters({ tab: tab.id, status: "", page: 1 })}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* ─── Action message ─── */}
            {actionMessage ? (
              <div className="banner banner-success" role="status" aria-live="polite">
                {actionMessage}
                <button type="button" className="banner-dismiss" onClick={() => setActionMessage(null)}>
                  ✕
                </button>
              </div>
            ) : null}

            {/* ─── Sticky toolbar ─── */}
            <section className="list-toolbar" aria-label="Search and filters">
              <label className="field field-search">
                <span>Search</span>
                <input
                  type="search"
                  placeholder="Account name, contact, email…"
                  value={searchInput}
                  aria-label="Search accounts"
                  onChange={(e) => handleSearchInput(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Status</span>
                <select
                  value={urlState.status}
                  aria-label="Filter by status"
                  onChange={(e) => updateFilters({ status: e.target.value })}
                >
                  <option value="">All statuses</option>
                  <option value="active">Active</option>
                  <option value="prospect">Prospect</option>
                  <option value="needs_review">Needs review</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className="field">
                <span>QB linked</span>
                <select
                  value={urlState.linked}
                  aria-label="Filter by QuickBooks linked"
                  onChange={(e) => updateFilters({ linked: e.target.value })}
                >
                  <option value="">All</option>
                  <option value="true">Linked only</option>
                  <option value="false">Not linked</option>
                </select>
              </label>
              <label className="field">
                <span>Missing</span>
                <select
                  value={urlState.missingContact === "true" ? "contact" : urlState.missingLocation === "true" ? "location" : ""}
                  aria-label="Filter by missing data"
                  onChange={(e) => {
                    const v = e.target.value;
                    updateFilters({
                      missingContact: v === "contact" ? "true" : "",
                      missingLocation: v === "location" ? "true" : ""
                    });
                  }}
                >
                  <option value="">None</option>
                  <option value="contact">Missing contact</option>
                  <option value="location">Missing location</option>
                </select>
              </label>
              <label className="field">
                <span>Sort</span>
                <select
                  value={urlState.sort}
                  aria-label="Sort order"
                  onChange={(e) => updateFilters({ sort: e.target.value })}
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Per page</span>
                <select
                  value={urlState.pageSize}
                  aria-label="Rows per page"
                  onChange={(e) => updateFilters({ pageSize: Number(e.target.value) })}
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              {hasActiveFilters(urlState) ? (
                <div className="toolbar-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={clearAllFilters}>
                    Clear filters
                  </button>
                </div>
              ) : null}
            </section>

            {/* ─── Active filter chips ─── */}
            {activeFilterChips(urlState).length > 0 ? (
              <div className="filter-chips" role="list" aria-label="Active filters">
                {activeFilterChips(urlState).map((chip) => (
                  <span key={chip.key} className="filter-chip" role="listitem">
                    {chip.label}
                    <button
                      type="button"
                      className="filter-chip-remove"
                      aria-label={`Remove filter: ${chip.label}`}
                      onClick={() => removeChip(chip.key)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            {/* ─── Hidden live region for screen reader count updates ─── */}
            <div aria-live="polite" aria-atomic="true" className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)" }}>
              {liveCount}
            </div>

            {/* ─── Layout split ─── */}
            <div className={urlState.account ? "ad-layout ad-layout-split" : "ad-layout"}>
              {/* ─── List panel ─── */}
              <section
                className="list-panel"
                ref={listPanelRef}
                aria-label="Account list"
                aria-busy={listState === "loading"}
              >
                {/* Loading bar (only during pagination / filter changes with existing items) */}
                {listState === "loading" && items.length > 0 ? <div className="list-loading-bar" aria-hidden="true" /> : null}

                {/* Full loading skeleton */}
                {listState === "loading" && items.length === 0 ? (
                  <div className="skeleton-rows" aria-label="Loading accounts">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="skeleton-row">
                        <div className="skeleton-block" style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                          <div className="skeleton-block" style={{ height: 14, width: "55%", borderRadius: 4 }} />
                          <div className="skeleton-block" style={{ height: 11, width: "35%", borderRadius: 4 }} />
                        </div>
                        <div className="skeleton-block" style={{ height: 22, width: 60, borderRadius: 12 }} />
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* Permission denied */}
                {listState === "permission-denied" ? (
                  <div className="state-panel state-panel-denied" role="alert">
                    <h2>Permission denied</h2>
                    <p>You do not have access to Account Directory for this organization.</p>
                    {listError ? <p className="muted">{listError}</p> : null}
                  </div>
                ) : null}

                {/* Error */}
                {listState === "error" ? (
                  <div className="state-panel" role="alert">
                    <h2>Unable to load accounts</h2>
                    <p>{listError || "Something went wrong. Please try again."}</p>
                    <button type="button" className="btn btn-primary" onClick={() => void loadList()}>
                      Retry
                    </button>
                  </div>
                ) : null}

                {/* Empty */}
                {listState === "empty" ? (
                  <div className="empty-state">
                    <h2>
                      {urlState.tab === "prospects"
                        ? "No prospects yet"
                        : urlState.tab === "needs_review"
                          ? "No accounts need review"
                          : urlState.tab === "archived"
                            ? "No archived accounts"
                            : "No accounts yet"}
                    </h2>
                    <p>
                      {urlState.tab === "prospects"
                        ? "Create a prospect to track early-stage relationships."
                        : urlState.tab === "needs_review"
                          ? "Accounts flagged for review will appear here."
                          : urlState.tab === "archived"
                            ? "Archived accounts will appear here."
                            : "Create your first account to get started."}
                    </p>
                    {permissions.canCreate && urlState.tab !== "archived" ? (
                      <button type="button" className="btn btn-primary" onClick={() => openModal("new-account")}>
                        New account
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {/* No results */}
                {listState === "no-results" ? (
                  <div className="empty-state">
                    <h2>No matching accounts</h2>
                    <p>Try adjusting your search or removing filters.</p>
                    <button type="button" className="btn btn-secondary" onClick={clearAllFilters}>
                      Clear filters
                    </button>
                  </div>
                ) : null}

                {/* Table (desktop) + Cards (mobile) */}
                {(listState === "idle" || (listState === "loading" && items.length > 0)) && items.length > 0 ? (
                  <>
                    {/* Desktop table */}
                    <div className="table-wrap">
                      <table className="ad-table" aria-label="Accounts">
                        <thead>
                          <tr>
                            <th scope="col">Account</th>
                            <th scope="col">Primary contact</th>
                            <th scope="col">Email</th>
                            <th scope="col">Phone</th>
                            <th scope="col">Location</th>
                            <th scope="col">Status</th>
                            <th scope="col">QuickBooks</th>
                            <th scope="col">Last updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => (
                            <tr
                              key={item.id}
                              className={
                                urlState.account === item.id ? "ad-row ad-row-selected" : "ad-row"
                              }
                              onClick={() => selectAccount(urlState.account === item.id ? null : item.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  selectAccount(urlState.account === item.id ? null : item.id);
                                }
                              }}
                              tabIndex={0}
                              role="row"
                              aria-selected={urlState.account === item.id}
                            >
                              <td>
                                <div className="ad-cell-name">
                                  <span className={monogramClass(item.status)} aria-hidden="true">
                                    {initials(item.displayName ?? item.name)}
                                  </span>
                                  <div className="ad-cell-name-text">
                                    <div className="ad-cell-primary">{item.displayName ?? item.name}</div>
                                    {item.legalName && item.legalName !== (item.displayName ?? item.name) ? (
                                      <div className="ad-cell-secondary">{item.legalName}</div>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                              <td>{item.primaryContact || <span className="ad-cell-muted">—</span>}</td>
                              <td>{item.primaryEmail || <span className="ad-cell-muted">—</span>}</td>
                              <td>{item.primaryPhone || <span className="ad-cell-muted">—</span>}</td>
                              <td>{formatCityState(item.city, item.state)}</td>
                              <td>
                                <span className={statusPillClass(item.status)}>{statusLabel(item.status)}</span>
                              </td>
                              <td>
                                {item.quickbooksLinked ? (
                                  <span className="qb-badge">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    Linked
                                  </span>
                                ) : (
                                  <span className="ad-cell-muted">—</span>
                                )}
                              </td>
                              <td>{formatUpdatedAt(item.updatedAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="account-cards" role="list" aria-label="Accounts">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className={
                            urlState.account === item.id
                              ? "account-card account-card-selected"
                              : "account-card"
                          }
                          role="listitem"
                          tabIndex={0}
                          onClick={() => selectAccount(urlState.account === item.id ? null : item.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              selectAccount(urlState.account === item.id ? null : item.id);
                            }
                          }}
                          aria-pressed={urlState.account === item.id}
                        >
                          <span className={`${monogramClass(item.status)} monogram-sm`} aria-hidden="true">
                            {initials(item.displayName ?? item.name)}
                          </span>
                          <div className="account-card-info">
                            <div className="account-card-name">{item.displayName ?? item.name}</div>
                            <div className="account-card-meta">
                              {[item.primaryContact, formatCityState(item.city, item.state)]
                                .filter((x) => x && x !== "—")
                                .join(" · ") || formatCityState(item.city, item.state)}
                            </div>
                          </div>
                          <div className="account-card-badge">
                            <span className={statusPillClass(item.status)}>{statusLabel(item.status)}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pagination */}
                    <PaginationBar
                      page={urlState.page}
                      totalPages={totalPages}
                      total={total}
                      pageSize={urlState.pageSize}
                      hasPreviousPage={hasPreviousPage}
                      hasNextPage={hasNextPage}
                      onPage={(p) => updateFilters({ page: p })}
                    />
                  </>
                ) : null}
              </section>

              {/* ─── Profile panel ─── */}
              {urlState.account ? (
                <ProfilePanel
                  accountId={urlState.account}
                  detail={detail}
                  detailBusy={detailBusy}
                  detailError={detailError}
                  detailTab={detailTab}
                  formBusy={formBusy}
                  formError={formError}
                  permissions={permissions}
                  activeTab={urlState.tab}
                  onTabChange={setDetailTab}
                  onClose={() => selectAccount(null)}
                  onEdit={() => openModal("edit")}
                  onAddContact={() => openModal("add-contact")}
                  onAddLocation={() => openModal("add-location")}
                  onAddAlias={() => openModal("add-alias")}
                  onLinkQb={() =>
                    openModal("link-qb", { displayName: detail?.name || detail?.displayName || "" })
                  }
                  onArchive={() => openModal("archive-confirm")}
                  onRestore={() => void handleRestore()}
                  onRetry={() => void loadDetail(urlState.account!)}
                />
              ) : null}
            </div>
          </>
        )}
      </main>

      {/* ─── Modal ─── */}
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
              <button type="button" className="btn btn-ghost btn-sm" onClick={closeModal} aria-label="Close dialog">
                ✕
              </button>
            </header>

            {modal === "archive-confirm" ? (
              <p>
                Archive <strong>{detail?.displayName ?? detail?.name}</strong>? You can restore it later
                from the Archived tab.
              </p>
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
                  QuickBooks List ID <span style={{ color: "var(--eos-accent)" }}>*</span>
                  <input
                    value={form.auxExtra}
                    onChange={(e) => setForm((f) => ({ ...f, auxExtra: e.target.value }))}
                    autoFocus
                    required
                    placeholder="e.g. 123456"
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
                  {modal !== "add-alias" && modal !== "add-contact" && modal !== "add-location" ? (
                    <span style={{ color: "var(--eos-accent)" }}> *</span>
                  ) : null}
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
                      if (formError === "Account name is required." && v.trim()) setFormError(null);
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
              <button
                type="button"
                className={modal === "archive-confirm" ? "btn btn-danger" : "btn btn-primary"}
                disabled={formBusy}
                onClick={() => void submitForm()}
              >
                {formBusy ? "Saving…" : modal === "archive-confirm" ? "Archive" : "Save"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ──────────────── Sub-components ──────────────── */

function SummaryStrip({
  summary,
  urlState,
  onApply
}: {
  summary: AccountSummary;
  urlState: UrlState;
  onApply: (patch: Partial<UrlState>) => void;
}) {
  const items: { key: string; label: string; count: number; patch: Partial<UrlState> }[] = [
    { key: "total", label: "Total", count: summary.total, patch: { tab: "accounts", status: "", linked: "", missingContact: "", missingLocation: "" } },
    { key: "active", label: "Active", count: summary.active, patch: { tab: "accounts", status: "active", linked: "", missingContact: "", missingLocation: "" } },
    { key: "prospects", label: "Prospects", count: summary.prospects, patch: { tab: "prospects", status: "", linked: "", missingContact: "", missingLocation: "" } },
    { key: "needsReview", label: "Needs review", count: summary.needsReview, patch: { tab: "needs_review", status: "", linked: "", missingContact: "", missingLocation: "" } },
    { key: "archived", label: "Archived", count: summary.archived, patch: { tab: "archived", status: "", linked: "", missingContact: "", missingLocation: "" } },
    { key: "qbLinked", label: "QB linked", count: summary.quickbooksLinked, patch: { linked: "true", missingContact: "", missingLocation: "" } },
    { key: "noContact", label: "No contact", count: summary.missingPrimaryContact, patch: { missingContact: "true", missingLocation: "", linked: "" } },
    { key: "noLocation", label: "No location", count: summary.missingPrimaryLocation, patch: { missingLocation: "true", missingContact: "", linked: "" } }
  ];

  function isActive(patch: Partial<UrlState>): boolean {
    if (patch.missingContact === "true") return urlState.missingContact === "true";
    if (patch.missingLocation === "true") return urlState.missingLocation === "true";
    if (patch.linked === "true") return urlState.linked === "true";
    if (patch.status === "active") return urlState.tab === "accounts" && urlState.status === "active";
    if (patch.tab) return urlState.tab === patch.tab && !urlState.status && !urlState.linked && !urlState.missingContact && !urlState.missingLocation;
    return false;
  }

  return (
    <div className="summary-strip" role="list" aria-label="Account directory overview">
      {items.map((item, idx) => (
        <React.Fragment key={item.key}>
          {idx === 5 ? <div className="summary-sep" aria-hidden="true" /> : null}
          <button
            type="button"
            className={isActive(item.patch) ? "summary-item summary-item-active" : "summary-item"}
            role="listitem"
            aria-pressed={isActive(item.patch)}
            onClick={() => onApply(item.patch)}
          >
            <span className="summary-count">{item.count.toLocaleString()}</span>
            <span className="summary-label">{item.label}</span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

function PaginationBar({
  page,
  totalPages,
  total,
  pageSize,
  hasPreviousPage,
  hasNextPage,
  onPage
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1 && total <= pageSize) return null;
  const pages = buildPageNumbers(page, totalPages) as (number | string)[];

  return (
    <div className="pagination" role="navigation" aria-label="Pagination">
      <span className="pagination-info" aria-live="polite" aria-atomic="true">
        {formatResultRange(page, pageSize, total)}
      </span>
      <div className="pagination-controls">
        <button
          type="button"
          className="page-btn"
          onClick={() => onPage(1)}
          disabled={!hasPreviousPage}
          aria-label="First page"
        >
          «
        </button>
        <button
          type="button"
          className="page-btn"
          onClick={() => onPage(page - 1)}
          disabled={!hasPreviousPage}
          aria-label="Previous page"
        >
          ‹
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="page-ellipsis" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={page === p ? "page-btn page-btn-active" : "page-btn"}
              onClick={() => onPage(p as number)}
              aria-label={`Page ${p}`}
              aria-current={page === p ? "page" : undefined}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          className="page-btn"
          onClick={() => onPage(page + 1)}
          disabled={!hasNextPage}
          aria-label="Next page"
        >
          ›
        </button>
        <button
          type="button"
          className="page-btn"
          onClick={() => onPage(totalPages)}
          disabled={!hasNextPage}
          aria-label="Last page"
        >
          »
        </button>
      </div>
    </div>
  );
}

function ProfilePanel({
  accountId,
  detail,
  detailBusy,
  detailError,
  detailTab,
  formBusy,
  formError,
  permissions,
  activeTab,
  onTabChange,
  onClose,
  onEdit,
  onAddContact,
  onAddLocation,
  onAddAlias,
  onLinkQb,
  onArchive,
  onRestore,
  onRetry
}: {
  accountId: string;
  detail: AccountDetail | null;
  detailBusy: boolean;
  detailError: string | null;
  detailTab: DetailTab;
  formBusy: boolean;
  formError: string | null;
  permissions: AccountDirectoryPermissions;
  activeTab: string;
  onTabChange: (tab: DetailTab) => void;
  onClose: () => void;
  onEdit: () => void;
  onAddContact: () => void;
  onAddLocation: () => void;
  onAddAlias: () => void;
  onLinkQb: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onRetry: () => void;
}) {
  const name = detail?.displayName ?? detail?.name ?? "Loading…";
  const legalName = detail?.legalName;
  const showLegal = legalName && legalName !== name;

  return (
    <aside className="profile-panel" aria-label="Account profile">
      <div className="profile-head">
        <div className="profile-head-row">
          {detail ? (
            <span className={`${monogramClass(detail.status)} monogram-lg`} aria-hidden="true">
              {initials(name)}
            </span>
          ) : (
            <span className="monogram monogram-lg monogram-default" aria-hidden="true">?</span>
          )}
          <div className="profile-head-info">
            <h2 className="profile-name">{name}</h2>
            {showLegal ? <p className="profile-legal">{legalName}</p> : null}
            {detail ? (
              <div className="profile-status-row">
                <span className={statusPillClass(detail.status)}>{statusLabel(detail.status)}</span>
                {detail.quickbooksLinked ? <span className="qb-badge">QB</span> : null}
              </div>
            ) : null}
          </div>
          <button type="button" className="profile-close" onClick={onClose} aria-label="Close profile">
            ✕ Close
          </button>
        </div>

        {/* Action buttons */}
        {detail ? (
          <div className="profile-actions">
            {permissions.canEdit ? (
              <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit}>
                Edit
              </button>
            ) : null}
            {permissions.canEdit ? (
              <>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onAddContact}>
                  + Contact
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onAddLocation}>
                  + Location
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onAddAlias}>
                  + Alias
                </button>
              </>
            ) : null}
            {permissions.canLinkQuickBooks ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={formBusy}
                onClick={onLinkQb}
              >
                Link QB
              </button>
            ) : (
              <span className="chip chip-muted" title="You do not have permission to link QuickBooks">
                QuickBooks restricted
              </span>
            )}
            {activeTab === "archived" && permissions.canRestore ? (
              <button type="button" className="btn btn-primary btn-sm" disabled={formBusy} onClick={onRestore}>
                Restore
              </button>
            ) : null}
            {activeTab !== "archived" && permissions.canArchive ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onArchive}>
                Archive
              </button>
            ) : null}
          </div>
        ) : null}

        {/* Profile tabs */}
        <nav className="profile-tabs" aria-label="Profile sections">
          {DETAIL_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={detailTab === tab ? "profile-tab profile-tab-active" : "profile-tab"}
              aria-current={detailTab === tab ? "true" : undefined}
              onClick={() => onTabChange(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Body */}
      <div className="profile-body">
        {detailBusy ? (
          <div className="skeleton-rows">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton-row">
                <div className="skeleton-block" style={{ height: 14, flex: 1, borderRadius: 4 }} />
              </div>
            ))}
          </div>
        ) : null}

        {detailError ? (
          <div className="banner banner-error" role="alert">
            {detailError}
            <button type="button" className="btn btn-secondary btn-sm banner-dismiss" onClick={onRetry}>
              Retry
            </button>
          </div>
        ) : null}

        {formError ? (
          <div className="banner banner-error" role="alert">
            {formError}
          </div>
        ) : null}

        {detail && !detailBusy ? (
          <>
            {detailTab === "Overview" ? (
              <>
                <DataHealth detail={detail} />
                <dl className="detail-dl">
                  <dt>Account name</dt>
                  <dd>{detail.displayName ?? detail.name}</dd>
                  {showLegal ? (
                    <>
                      <dt>Legal name</dt>
                      <dd>{legalName}</dd>
                    </>
                  ) : null}
                  <dt>Primary contact</dt>
                  <dd>{detail.primaryContact || "—"}</dd>
                  <dt>Primary email</dt>
                  <dd>{detail.primaryEmail || "—"}</dd>
                  <dt>Primary phone</dt>
                  <dd>{detail.primaryPhone || "—"}</dd>
                  <dt>Location</dt>
                  <dd>{formatCityState(detail.city, detail.state)}</dd>
                  <dt>Status</dt>
                  <dd>
                    <span className={statusPillClass(detail.status)}>{statusLabel(detail.status)}</span>
                  </dd>
                  <dt>QuickBooks</dt>
                  <dd>
                    {detail.quickbooksLinked ? (
                      <span className="qb-badge">Linked</span>
                    ) : (
                      <span className="chip chip-muted">Not linked</span>
                    )}
                  </dd>
                  {detail.source ? (
                    <>
                      <dt>Source</dt>
                      <dd>{detail.source}</dd>
                    </>
                  ) : null}
                  <dt>Last updated</dt>
                  <dd>{formatUpdatedAt(detail.updatedAt)}</dd>
                  {detail.notes ? (
                    <>
                      <dt>Notes</dt>
                      <dd>{detail.notes}</dd>
                    </>
                  ) : null}
                </dl>
              </>
            ) : null}

            {detailTab === "Contacts" ? (
              <DetailList
                empty="No contacts on file."
                items={(detail.contacts ?? []).map((c) => ({
                  id: c.id,
                  title: c.name,
                  meta: [c.role, c.email, c.phone].filter(Boolean).join(" · "),
                  badge: c.isPrimary ? "Primary" : undefined
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
                    .join(" · "),
                  badge: l.isPrimary ? "Primary" : undefined
                }))}
              />
            ) : null}

            {detailTab === "Aliases" ? (
              <DetailList
                empty="No aliases on file."
                items={(detail.aliases ?? []).map((a) => ({
                  id: a.id,
                  title: a.alias,
                  meta: a.source ? `Source: ${a.source}` : ""
                }))}
              />
            ) : null}

            {detailTab === "External links" ? (
              <DetailList
                empty="No external links on file."
                items={(detail.externalLinks ?? []).map((link) => ({
                  id: link.id,
                  title: link.system || "External system",
                  meta: [
                    link.isActive === false ? "Inactive" : "Linked",
                    link.externalDisplayName || null,
                    link.sourceSnapshotDate ? `Snapshot ${formatUpdatedAt(link.sourceSnapshotDate)}` : null,
                    link.linkedAt ? `Linked ${formatUpdatedAt(link.linkedAt)}` : null,
                    link.linkedBy || null,
                    link.externalId ? `ID ${link.externalId}` : null
                  ]
                    .filter(Boolean)
                    .join(" · "),
                  href: link.url || undefined
                }))}
              />
            ) : null}

            {detailTab === "Activity" ? (
              detail.auditHistory && detail.auditHistory.length > 0 ? (
                <ol className="activity-list" aria-label="Account activity">
                  {detail.auditHistory.map((entry) => (
                    <li key={entry.id} className="activity-item">
                      <span className="activity-dot" aria-hidden="true" />
                      <div>
                        <div className="activity-label">{activityLabel(entry.action)}</div>
                        <div className="activity-meta">
                          {[formatUpdatedAt(entry.at), entry.actor, entry.detail]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="muted">No activity recorded yet.</p>
              )
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}

function DataHealth({ detail }: { detail: AccountDetail }) {
  const hasPrimaryContact =
    detail.hasPrimaryContact != null
      ? detail.hasPrimaryContact
      : Boolean(detail.contacts?.some((c) => c.isPrimary) || detail.primaryContact);
  const hasPrimaryLocation =
    detail.hasPrimaryLocation != null
      ? detail.hasPrimaryLocation
      : Boolean(detail.locations?.some((l) => l.isPrimary) || detail.city);
  const isQbLinked = Boolean(detail.quickbooksLinked);

  return (
    <div className="data-health">
      <p className="data-health-title">Data health</p>
      <div className="data-health-row">
        <span className={`health-item ${hasPrimaryContact ? "health-ok" : "health-warn"}`}>
          {hasPrimaryContact ? "✓" : "✗"} Primary contact
        </span>
        <span className={`health-item ${hasPrimaryLocation ? "health-ok" : "health-warn"}`}>
          {hasPrimaryLocation ? "✓" : "✗"} Primary location
        </span>
        <span className={`health-item ${isQbLinked ? "health-ok" : "health-warn"}`}>
          {isQbLinked ? "✓" : "✗"} QB linked
        </span>
      </div>
    </div>
  );
}

function DetailList({
  empty,
  items
}: {
  empty: string;
  items: { id: string; title: string; meta?: string; href?: string; badge?: string }[];
}) {
  if (!items.length) return <p className="muted">{empty}</p>;
  return (
    <ul className="detail-list">
      {items.map((item) => (
        <li key={item.id} className="detail-list-item">
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            {item.href ? (
              <a href={item.href} target="_blank" rel="noreferrer" className="detail-list-title">
                {item.title}
              </a>
            ) : (
              <span className="detail-list-title">{item.title}</span>
            )}
            {item.badge ? <span className="chip chip-muted" style={{ fontSize: "0.68rem" }}>{item.badge}</span> : null}
          </div>
          {item.meta ? <span className="detail-list-meta">{item.meta}</span> : null}
        </li>
      ))}
    </ul>
  );
}
