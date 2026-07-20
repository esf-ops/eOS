import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "./lib/api";
import { hrApiErrorMessage } from "./lib/hrRoles";
import { getSupabase } from "./lib/supabase";
import EliteosTopbar from "../../shared/eliteos-ui/EliteosTopbar";
import type { EliteosTopbarMenuItem } from "../../shared/eliteos-ui/EliteosTopbar";
import EosAlertBanner from "../../shared/eliteos-ui/EosAlertBanner";

const EOS_LOGO_URL =
  "https://www.elitestonefabrication.com/wp-content/uploads/2021/09/cropped-ESF-Horizontal-Logo-500x150-px_09_09.png";

const DEFAULT_WORKSPACE_NAME = "Elite Stone Fabrication";

type WeekOption = { weekStart: string; weekEnd: string; weekLabel: string; isCurrentWeek?: boolean };

type WeekValue = {
  actualNumeric?: number | null;
  actualDisplay?: string | null;
  valuePayload?: Record<string, unknown>;
};

type ExecutiveSummary = {
  overallGrade?: string | null;
  overallPerformanceLabel?: string | null;
  gradeCounts?: { A: number; B: number; C: number; D: number; F: number };
  totalMistakes?: number;
  worstPerformingArea?: string | null;
  quoteVolume?: number | null;
  quoteVolumeDisplay?: string | null;
  productionSf?: number | null;
  productionGoalSf?: number | null;
  productionDisplay?: string | null;
  medianLeadTime?: number | null;
  medianLeadTimeGoal?: number | null;
  medianLeadTimeDisplay?: string | null;
};

type SectionRow = {
  sectionId: string;
  name: string;
  goalDisplay: string;
  metricKind: string;
  gradingEnabled: boolean;
  incidentCount: number;
  detailMistakeCount?: number;
  quickCount?: number | null;
  isMetricTotal?: boolean;
  actualDisplay: string;
  letterGrade: string | null;
  priorLetterGrade?: string | null;
  trend: string;
  trendLabel?: string | null;
  weekValue?: WeekValue;
};

type MistakeLogEntry = {
  id: string;
  entryKind?: string;
  sectionId: string;
  sectionName?: string | null;
  departmentSlug?: string | null;
  weekStart?: string | null;
  occurredAt: string;
  severity: string | null;
  jobCustomer: string | null;
  personInvolved: string | null;
  description: string | null;
  loggedByName?: string | null;
  updatedByName?: string | null;
  updatedAt?: string | null;
};

type MistakeLogWeek = WeekOption & { mistakes: MistakeLogEntry[] };

type DepartmentInfo = {
  slug: string;
  name: string;
  sectionIds: string[];
};

type ScorecardPayload = {
  ok?: boolean;
  viewMode?: "executive" | "department";
  fullAccess?: boolean;
  executiveDashboardAccess?: boolean;
  canManageDepartments?: boolean;
  canGenerateReport?: boolean;
  departments?: DepartmentInfo[];
  weekStart?: string;
  weekLabel?: string;
  weekOptions?: WeekOption[];
  overallGrade?: string | null;
  executiveSummary?: ExecutiveSummary;
  narrative?: string;
  rows?: SectionRow[];
  warning?: string;
  schemaReady?: boolean;
};

type EligibleUser = {
  userId: string;
  displayName: string;
  email?: string | null;
  isActive?: boolean;
  hasHrHeadAccess?: boolean;
};

type DepartmentAssignment = {
  id: string;
  userId: string;
  userName: string;
  userEmail?: string | null;
  departmentSlug: string;
  departmentName: string;
  accessType?: "executive_dashboard" | "department";
  hasHrHeadAccess?: boolean;
  isActive?: boolean;
};

type AccessOption = {
  slug: string;
  name: string;
  accessType: "executive_dashboard" | "department";
  description: string;
  sectionIds?: string[];
};

type DepartmentGroup = {
  slug: string;
  name: string;
  sectionIds: string[];
};

type ModalKind = "mistake" | "metric" | "editMistake" | null;

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
  if (e) return e.includes("@") ? e.split("@")[0].slice(0, 2).toUpperCase() : e.slice(0, 2).toUpperCase();
  return "HR";
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isCountSection(kind: string): boolean {
  return kind === "count";
}

function isMetricTotalSection(row: SectionRow): boolean {
  return row.isMetricTotal === true || ["days", "currency", "production", "hours"].includes(row.metricKind);
}

function metricActionLabel(kind: string): string {
  if (kind === "days") return "Update Lead Times";
  if (kind === "currency") return "Update Quoting Value";
  if (kind === "production") return "Update Production";
  if (kind === "hours") return "Update Downtime";
  return "Update Metric";
}

function payloadFromWeekValue(row: SectionRow): Record<string, unknown> {
  return row.weekValue?.valuePayload ?? {};
}

function formatCurrency(value: number | null | undefined, fallback = "—"): string {
  if (value == null || !Number.isFinite(value)) return fallback;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function trendClass(trend: string): string {
  if (trend === "up") return "hr-section-trend--up";
  if (trend === "down") return "hr-section-trend--down";
  return "hr-section-trend--flat";
}

function GradeChip({ grade }: { grade: string | null }) {
  if (!grade) return <span className="hr-grade-chip hr-grade-chip--neutral">—</span>;
  return <span className={`hr-grade-chip hr-grade-chip--${grade.toLowerCase()}`}>{grade}</span>;
}

export default function HrApp() {
  const supabase = getSupabase();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userMetaName, setUserMetaName] = useState("");
  const [userJobTitle, setUserJobTitle] = useState("");
  const [userDepartment, setUserDepartment] = useState("");
  const [userRole, setUserRole] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardPayload | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState("");
  const [reportText, setReportText] = useState("");
  const [reportHtml, setReportHtml] = useState("");
  const [reportBusy, setReportBusy] = useState(false);

  const [mistakesLog, setMistakesLog] = useState<MistakeLogWeek[]>([]);
  const [priorWeeksOpen, setPriorWeeksOpen] = useState(false);
  const [logBusy, setLogBusy] = useState(false);

  const [modalKind, setModalKind] = useState<ModalKind>(null);
  const [activeSection, setActiveSection] = useState<SectionRow | null>(null);
  const [editingMistake, setEditingMistake] = useState<MistakeLogEntry | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const [quickCounts, setQuickCounts] = useState<Record<string, string>>({});
  const [quickSaveBusy, setQuickSaveBusy] = useState<Record<string, boolean>>({});

  const [mistakeDate, setMistakeDate] = useState("");
  const [mistakeJob, setMistakeJob] = useState("");
  const [mistakeDescription, setMistakeDescription] = useState("");
  const [mistakeSeverity, setMistakeSeverity] = useState("minor");
  const [mistakePerson, setMistakePerson] = useState("");
  const [mistakeNotes, setMistakeNotes] = useState("");

  const [metricMedian, setMetricMedian] = useState("");
  const [metricAverage, setMetricAverage] = useState("");
  const [metricCurrency, setMetricCurrency] = useState("");
  const [metricWeeklySf, setMetricWeeklySf] = useState("");
  const [metricDailySf, setMetricDailySf] = useState("");
  const [metricHours, setMetricHours] = useState("");

  const [deptAccessOpen, setDeptAccessOpen] = useState(false);
  const [deptAccessBusy, setDeptAccessBusy] = useState(false);
  const [deptAssignBusy, setDeptAssignBusy] = useState(false);
  const [eligibleUsers, setEligibleUsers] = useState<EligibleUser[]>([]);
  const [deptAssignments, setDeptAssignments] = useState<DepartmentAssignment[]>([]);
  const [deptGroups, setDeptGroups] = useState<DepartmentGroup[]>([]);
  const [accessOptions, setAccessOptions] = useState<AccessOption[]>([]);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignDeptSlug, setAssignDeptSlug] = useState("");

  const [logFilterDepartment, setLogFilterDepartment] = useState("");
  const [logFilterSection, setLogFilterSection] = useState("");

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

  const loadMistakesLog = useCallback(async () => {
    if (!sessionToken) return;
    setLogBusy(true);
    try {
      const weekQ = selectedWeekStart
        ? `?week_start=${encodeURIComponent(selectedWeekStart)}&weeks=52`
        : "?weeks=52";
      const res = (await apiGet(`/api/hr/workforce/mistakes/log${weekQ}`, sessionToken)) as {
        weeks?: MistakeLogWeek[];
      };
      setMistakesLog(res.weeks ?? []);
    } catch {
      setMistakesLog([]);
    } finally {
      setLogBusy(false);
    }
  }, [sessionToken, selectedWeekStart]);

  const loadScorecard = useCallback(async () => {
    if (!sessionToken) return;
    setBusy(true);
    setErr(null);
    try {
      const weekQ = selectedWeekStart ? `?week_start=${encodeURIComponent(selectedWeekStart)}` : "";
      const res = (await apiGet(`/api/hr/workforce/dashboard${weekQ}`, sessionToken)) as ScorecardPayload;
      setScorecard(res);
      if (!selectedWeekStart && res.weekStart) setSelectedWeekStart(res.weekStart);

      const nextQuick: Record<string, string> = {};
      for (const row of res.rows ?? []) {
        if (isCountSection(row.metricKind)) {
          const saved = row.quickCount ?? row.incidentCount ?? 0;
          nextQuick[row.sectionId] = String(saved);
        }
      }
      setQuickCounts(nextQuick);
      await loadMistakesLog();
    } catch (e: unknown) {
      setErr(hrApiErrorMessage(e, "Unable to load weekly scorecard."));
    } finally {
      setBusy(false);
    }
  }, [sessionToken, selectedWeekStart, loadMistakesLog]);

  const loadDepartmentAccess = useCallback(async () => {
    if (!sessionToken) return;
    setDeptAccessBusy(true);
    try {
      const [usersRes, assignRes] = await Promise.all([
        apiGet("/api/hr/workforce/departments/eligible-users", sessionToken) as Promise<{
          users?: Array<{
            userId?: string;
            user_id?: string;
            displayName?: string;
            display_name?: string;
            email?: string | null;
            isActive?: boolean;
            is_active?: boolean;
            hasHrHeadAccess?: boolean;
            has_hr_head_access?: boolean;
          }>;
        }>,
        apiGet("/api/hr/workforce/departments/assignments", sessionToken) as Promise<{
          assignments?: DepartmentAssignment[];
          departmentGroups?: DepartmentGroup[];
          accessOptions?: AccessOption[];
        }>
      ]);
      setEligibleUsers(
        (usersRes.users ?? []).map((u) => ({
          userId: String(u.userId ?? u.user_id ?? ""),
          displayName: String(u.displayName ?? u.display_name ?? u.email ?? "User"),
          email: u.email ?? null,
          isActive: u.isActive !== false && u.is_active !== false,
          hasHrHeadAccess: Boolean(u.hasHrHeadAccess ?? u.has_hr_head_access)
        })).filter((u) => u.userId)
      );
      setDeptAssignments(assignRes.assignments ?? []);
      setDeptGroups(assignRes.departmentGroups ?? []);
      setAccessOptions(assignRes.accessOptions ?? []);
    } catch (e: unknown) {
      setErr(hrApiErrorMessage(e, "Unable to load department access."));
    } finally {
      setDeptAccessBusy(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    if (!sessionToken) return;
    void loadScorecard();
  }, [sessionToken, loadScorecard]);

  useEffect(() => {
    if (!sessionToken || !scorecard?.canManageDepartments) return;
    void loadDepartmentAccess();
  }, [sessionToken, scorecard?.canManageDepartments, loadDepartmentAccess]);

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
    setScorecard(null);
    setMistakesLog([]);
  }, [supabase]);

  const closeModal = () => {
    setModalKind(null);
    setActiveSection(null);
    setEditingMistake(null);
  };

  const openMistakeModal = (section: SectionRow) => {
    setActiveSection(section);
    setEditingMistake(null);
    setModalKind("mistake");
    setMistakeDate(new Date().toISOString().slice(0, 10));
    setMistakeJob("");
    setMistakeDescription("");
    setMistakeSeverity("minor");
    setMistakePerson("");
    setMistakeNotes("");
  };

  const openEditMistakeModal = (mistake: MistakeLogEntry) => {
    setEditingMistake(mistake);
    setActiveSection(null);
    setModalKind("editMistake");
    setMistakeDate(mistake.occurredAt.slice(0, 10));
    setMistakeJob(mistake.jobCustomer ?? "");
    setMistakeDescription(mistake.description ?? "");
    setMistakeSeverity(mistake.severity ?? "minor");
    setMistakePerson(mistake.personInvolved ?? "");
    setMistakeNotes("");
  };

  const openMetricModal = (section: SectionRow) => {
    setActiveSection(section);
    setModalKind("metric");
    const payload = payloadFromWeekValue(section);
    setMetricMedian(payload.median_days != null ? String(payload.median_days) : "");
    setMetricAverage(payload.average_days != null ? String(payload.average_days) : "");
    setMetricCurrency(payload.currency != null ? String(payload.currency) : "");
    setMetricWeeklySf(payload.weekly_sf != null ? String(payload.weekly_sf) : "");
    setMetricDailySf(payload.daily_sf != null ? String(payload.daily_sf) : "");
    setMetricHours(payload.hours != null ? String(payload.hours) : section.incidentCount != null ? String(section.incidentCount) : "");
  };

  const refreshAfterChange = useCallback(async () => {
    await loadScorecard();
  }, [loadScorecard]);

  const submitMistake = useCallback(async () => {
    if (!sessionToken || !activeSection) return;
    setSaveBusy(true);
    setErr(null);
    try {
      await apiPost("/api/hr/workforce/mistakes", sessionToken, {
        section_id: activeSection.sectionId,
        occurred_at: mistakeDate ? `${mistakeDate}T12:00:00.000Z` : undefined,
        job_customer: mistakeJob.trim() || null,
        description: mistakeDescription.trim() || null,
        severity: mistakeSeverity,
        person_involved: mistakePerson.trim() || null,
        notes: mistakeNotes.trim() || null
      });
      setSuccess(`Mistake logged for ${activeSection.name}.`);
      closeModal();
      await refreshAfterChange();
    } catch (e: unknown) {
      setErr(hrApiErrorMessage(e, "Unable to log mistake."));
    } finally {
      setSaveBusy(false);
    }
  }, [
    sessionToken,
    activeSection,
    mistakeDate,
    mistakeJob,
    mistakeDescription,
    mistakeSeverity,
    mistakePerson,
    mistakeNotes,
    refreshAfterChange
  ]);

  const submitEditMistake = useCallback(async () => {
    if (!sessionToken || !editingMistake) return;
    setSaveBusy(true);
    setErr(null);
    try {
      await apiPatch(`/api/hr/workforce/mistakes/${editingMistake.id}`, sessionToken, {
        occurred_at: mistakeDate ? `${mistakeDate}T12:00:00.000Z` : undefined,
        job_customer: mistakeJob.trim() || null,
        description: mistakeDescription.trim() || null,
        severity: mistakeSeverity,
        person_involved: mistakePerson.trim() || null,
        notes: mistakeNotes.trim() || null
      });
      setSuccess("Mistake updated.");
      closeModal();
      await refreshAfterChange();
    } catch (e: unknown) {
      setErr(hrApiErrorMessage(e, "Unable to update mistake."));
    } finally {
      setSaveBusy(false);
    }
  }, [
    sessionToken,
    editingMistake,
    mistakeDate,
    mistakeJob,
    mistakeDescription,
    mistakeSeverity,
    mistakePerson,
    mistakeNotes,
    refreshAfterChange
  ]);

  const deleteMistake = useCallback(
    async (mistake: MistakeLogEntry) => {
      if (!sessionToken || mistake.entryKind === "quick_count") return;
      if (!window.confirm("Delete this mistake entry?")) return;
      setErr(null);
      try {
        await apiDelete(`/api/hr/workforce/mistakes/${mistake.id}`, sessionToken);
        setSuccess("Mistake deleted.");
        await refreshAfterChange();
      } catch (e: unknown) {
        setErr(hrApiErrorMessage(e, "Unable to delete mistake."));
      }
    },
    [sessionToken, refreshAfterChange]
  );

  const saveQuickCount = useCallback(
    async (section: SectionRow) => {
      if (!sessionToken) return;
      const raw = quickCounts[section.sectionId] ?? "";
      const count = Math.max(0, Math.round(Number(raw)));
      if (!Number.isFinite(count)) {
        setErr("Enter a valid count.");
        return;
      }
      setQuickSaveBusy((prev) => ({ ...prev, [section.sectionId]: true }));
      setErr(null);
      try {
        await apiPost(`/api/hr/workforce/sections/${section.sectionId}/quick-count`, sessionToken, {
          week_start: scorecard?.weekStart ?? selectedWeekStart,
          count
        });
        setSuccess(`${section.name}: count saved (${count}).`);
        await refreshAfterChange();
      } catch (e: unknown) {
        setErr(hrApiErrorMessage(e, "Unable to save count."));
      } finally {
        setQuickSaveBusy((prev) => ({ ...prev, [section.sectionId]: false }));
      }
    },
    [sessionToken, quickCounts, scorecard?.weekStart, selectedWeekStart, refreshAfterChange]
  );

  const submitMetric = useCallback(async () => {
    if (!sessionToken || !activeSection) return;
    setSaveBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = { week_start: scorecard?.weekStart ?? selectedWeekStart };
      const kind = activeSection.metricKind;
      if (kind === "days") {
        body.median_days = metricMedian;
        body.average_days = metricAverage;
      } else if (kind === "currency") {
        body.currency = metricCurrency;
      } else if (kind === "production") {
        body.weekly_sf = metricWeeklySf;
        body.daily_sf = metricDailySf || undefined;
      } else if (kind === "hours") {
        body.hours = metricHours;
      }
      await apiPost(`/api/hr/workforce/sections/${activeSection.sectionId}/value`, sessionToken, body);
      setSuccess(`${activeSection.name} updated.`);
      closeModal();
      await refreshAfterChange();
    } catch (e: unknown) {
      setErr(hrApiErrorMessage(e, "Unable to save metric."));
    } finally {
      setSaveBusy(false);
    }
  }, [
    sessionToken,
    activeSection,
    scorecard?.weekStart,
    selectedWeekStart,
    metricMedian,
    metricAverage,
    metricCurrency,
    metricWeeklySf,
    metricDailySf,
    metricHours,
    refreshAfterChange
  ]);

  const assignDepartment = useCallback(async () => {
    if (!sessionToken || !assignUserId || !assignDeptSlug) return;
    setDeptAssignBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      await apiPost("/api/hr/workforce/departments/assignments", sessionToken, {
        user_id: assignUserId,
        department_slug: assignDeptSlug
      });
      const label =
        assignDeptSlug === "executive_dashboard" ? "Executive Dashboard access" : "Department access";
      setSuccess(`${label} assigned.`);
      setAssignUserId("");
      setAssignDeptSlug("");
      await loadDepartmentAccess();
      await loadScorecard();
    } catch (e: unknown) {
      setErr(hrApiErrorMessage(e, "Unable to assign access."));
    } finally {
      setDeptAssignBusy(false);
    }
  }, [sessionToken, assignUserId, assignDeptSlug, loadDepartmentAccess, loadScorecard]);

  const removeDepartmentAssignment = useCallback(
    async (assignment: DepartmentAssignment) => {
      if (!sessionToken) return;
      if (!window.confirm(`Remove ${assignment.userName} from ${assignment.departmentName}?`)) return;
      setErr(null);
      setSuccess(null);
      try {
        await apiDelete(`/api/hr/workforce/departments/assignments/${assignment.id}`, sessionToken);
        setSuccess("Access assignment removed.");
        await loadDepartmentAccess();
        await loadScorecard();
      } catch (e: unknown) {
        setErr(hrApiErrorMessage(e, "Unable to remove access assignment."));
      }
    },
    [sessionToken, loadDepartmentAccess, loadScorecard]
  );

  const generateReport = useCallback(async () => {
    if (!sessionToken) return;
    setReportBusy(true);
    setErr(null);
    setSuccess(null);
    try {
      const res = (await apiPost("/api/hr/workforce/report/generate", sessionToken, {
        week_start: scorecard?.weekStart ?? selectedWeekStart
      })) as { reportText?: string; reportHtml?: string; overallGrade?: string | null };
      setReportText(res.reportText ?? "");
      setReportHtml(res.reportHtml ?? "");
      setSuccess(`Weekly report frozen. Overall grade: ${res.overallGrade ?? "—"}`);
    } catch (e: unknown) {
      setErr(hrApiErrorMessage(e, "Unable to generate weekly report."));
    } finally {
      setReportBusy(false);
    }
  }, [sessionToken, scorecard?.weekStart, selectedWeekStart]);

  const copyReport = useCallback(async () => {
    if (!reportText) return;
    try {
      await navigator.clipboard.writeText(reportText);
      setSuccess("Report copied to clipboard.");
    } catch {
      setErr("Unable to copy report.");
    }
  }, [reportText]);

  const userDisplayName = useMemo(
    () => userMetaName || deriveDisplayNameFromEmail(userEmail) || "Signed in",
    [userMetaName, userEmail]
  );
  const chipSubtitle = useMemo(() => {
    const roleTitle = (userJobTitle || userDepartment || userRole || "").trim();
    return roleTitle ? roleTitle.replace(/_/g, " ") : userEmail.trim();
  }, [userDepartment, userEmail, userJobTitle, userRole]);

  const rows = scorecard?.rows ?? [];
  const gradeRows = rows.filter((row) => !isMetricTotalSection(row));
  const metricRows = rows.filter((row) => isMetricTotalSection(row));
  const weekOptions = scorecard?.weekOptions ?? [];
  const executiveSummary = scorecard?.executiveSummary;
  const narrative = scorecard?.narrative ?? "";
  const gradeCounts = executiveSummary?.gradeCounts ?? { A: 0, B: 0, C: 0, D: 0, F: 0 };

  const viewMode = scorecard?.viewMode ?? (scorecard?.fullAccess ? "executive" : "department");
  const isDepartmentView = viewMode === "department";
  const isExecutiveView = viewMode === "executive" || Boolean(scorecard?.fullAccess);
  const departmentNames = (scorecard?.departments ?? []).map((d) => d.name).join(", ");
  const heroWeekLabel =
    weekOptions.find((w) => w.weekStart === (scorecard?.weekStart ?? selectedWeekStart))?.weekLabel ??
    scorecard?.weekLabel ??
    "";

  const allLoadedMistakes = useMemo(
    () => mistakesLog.flatMap((week) => week.mistakes ?? []),
    [mistakesLog]
  );

  const showAttributionColumns = useMemo(
    () => allLoadedMistakes.some((m) => m.loggedByName || m.updatedByName),
    [allLoadedMistakes]
  );

  const logSectionOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of allLoadedMistakes) {
      if (m.sectionId) map.set(m.sectionId, m.sectionName ?? m.sectionId);
    }
    for (const row of rows) {
      map.set(row.sectionId, row.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [allLoadedMistakes, rows]);

  const logDepartmentOptions = useMemo(() => {
    const slugs = new Set<string>();
    for (const m of allLoadedMistakes) {
      if (m.departmentSlug) slugs.add(m.departmentSlug);
    }
    for (const g of deptGroups) slugs.add(g.slug);
    return [...slugs]
      .map((slug) => {
        const fromGroup = deptGroups.find((g) => g.slug === slug);
        const fromDept = scorecard?.departments?.find((d) => d.slug === slug);
        return { slug, name: fromGroup?.name ?? fromDept?.name ?? slug };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allLoadedMistakes, deptGroups, scorecard?.departments]);

  const filterMistakes = useCallback(
    (mistakes: MistakeLogEntry[]) =>
      mistakes.filter((m) => {
        if (logFilterDepartment && m.departmentSlug !== logFilterDepartment) return false;
        if (logFilterSection && m.sectionId !== logFilterSection) return false;
        return true;
      }),
    [logFilterDepartment, logFilterSection]
  );

  const selectedWeekLog = useMemo(() => {
    const ws = scorecard?.weekStart ?? selectedWeekStart;
    return mistakesLog.find((w) => w.weekStart === ws) ?? mistakesLog[0] ?? null;
  }, [mistakesLog, scorecard?.weekStart, selectedWeekStart]);

  const priorWeekLogs = useMemo(() => {
    const ws = scorecard?.weekStart ?? selectedWeekStart;
    return mistakesLog.filter((w) => w.weekStart !== ws);
  }, [mistakesLog, scorecard?.weekStart, selectedWeekStart]);

  const recentMistakesForSection = useCallback(
    (sectionId: string) =>
      (selectedWeekLog?.mistakes ?? [])
        .filter((m) => m.sectionId === sectionId && m.entryKind !== "quick_count")
        .slice(0, 3),
    [selectedWeekLog]
  );

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
      label: "Refresh",
      meta: "Reload scorecard",
      onClick: () => void loadScorecard(),
      disabled: busy,
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 4v5h-5" />
        </svg>
      )
    }
  ];

  const renderSectionCard = (row: SectionRow, variant: "grade" | "metric") => {
    const recentMistakes = variant === "grade" && isCountSection(row.metricKind) ? recentMistakesForSection(row.sectionId) : [];
    return (
    <article key={row.sectionId} className={`hr-section-card hr-section-card--${variant}`}>
      <header className="hr-section-card-head">
        <h2>{row.name}</h2>
        <GradeChip grade={row.letterGrade} />
      </header>
      {row.trendLabel ? (
        <p className={`hr-section-trend ${trendClass(row.trend)}`}>{row.trendLabel}</p>
      ) : null}
      <dl className="hr-section-metrics">
        <div>
          <dt>Goal</dt>
          <dd>{row.goalDisplay}</dd>
        </div>
        <div>
          <dt>Actual</dt>
          <dd>{row.actualDisplay}</dd>
        </div>
      </dl>

      {variant === "grade" && isCountSection(row.metricKind) ? (
        <div className="hr-quick-count">
          <label className="hr-quick-count-label">
            This week&apos;s count
            <div className="hr-quick-count-row">
              <input
                type="number"
                min={0}
                step={1}
                value={quickCounts[row.sectionId] ?? String(row.incidentCount ?? 0)}
                onChange={(e) => setQuickCounts((prev) => ({ ...prev, [row.sectionId]: e.target.value }))}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={Boolean(quickSaveBusy[row.sectionId]) || busy}
                onClick={() => void saveQuickCount(row)}
              >
                {quickSaveBusy[row.sectionId] ? "Saving…" : "Save"}
              </button>
            </div>
          </label>
        </div>
      ) : null}

      {recentMistakes.length ? (
        <div className="hr-section-recent-wrap">
          <p className="hr-section-recent-title">Recent detailed entries</p>
          <ul className="hr-section-recent">
            {recentMistakes.map((m) => (
              <li key={m.id}>
                <strong>{formatDate(m.occurredAt)}</strong>
                {m.jobCustomer ? ` · ${m.jobCustomer}` : ""}
                {m.description ? <p>{m.description}</p> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <footer className="hr-section-card-foot">
        {variant === "grade" && isCountSection(row.metricKind) ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => openMistakeModal(row)}>
            + Log Mistake
          </button>
        ) : null}
        {variant === "metric" ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => openMetricModal(row)}>
            {metricActionLabel(row.metricKind)}
          </button>
        ) : null}
      </footer>
    </article>
  );
  };

  const renderMistakeRow = (mistake: MistakeLogEntry) => {
    const isQuick = mistake.entryKind === "quick_count";
    return (
      <tr key={mistake.id} className={isQuick ? "hr-mistake-row hr-mistake-row--quick" : "hr-mistake-row"}>
        <td>{formatDate(mistake.occurredAt)}</td>
        <td>{mistake.sectionName ?? "—"}</td>
        <td>{mistake.jobCustomer ?? "—"}</td>
        <td>{mistake.description ?? "—"}</td>
        <td>{mistake.severity ?? "—"}</td>
        <td>{mistake.personInvolved ?? "—"}</td>
        {showAttributionColumns ? (
          <>
            <td className="hr-mistakes-attribution">{mistake.loggedByName ?? "—"}</td>
            <td className="hr-mistakes-attribution">
              {mistake.updatedByName
                ? `${mistake.updatedByName}${mistake.updatedAt ? ` · ${formatDateTime(mistake.updatedAt)}` : ""}`
                : "—"}
            </td>
          </>
        ) : null}
        <td className="hr-mistake-actions">
          {isQuick ? (
            <span className="hr-mistake-tag">Quick count</span>
          ) : (
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEditMistakeModal(mistake)}>
                Edit
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void deleteMistake(mistake)}>
                Delete
              </button>
            </>
          )}
        </td>
      </tr>
    );
  };

  const mistakeTableColSpan = showAttributionColumns ? 9 : 7;

  const renderMistakeLogFilters = () =>
    isExecutiveView ? (
      <div className="hr-mistakes-filters">
        <label className="field">
          Department
          <select value={logFilterDepartment} onChange={(e) => setLogFilterDepartment(e.target.value)}>
            <option value="">All departments</option>
            {logDepartmentOptions.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Section
          <select value={logFilterSection} onChange={(e) => setLogFilterSection(e.target.value)}>
            <option value="">All sections</option>
            {logSectionOptions.map(([sectionId, name]) => (
              <option key={sectionId} value={sectionId}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
    ) : null;

  const renderMistakeTable = (mistakes: MistakeLogEntry[]) => {
    const filtered = filterMistakes(mistakes);
    return (
    <div className="hr-mistakes-table-wrap">
      <table className="hr-mistakes-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Section</th>
            <th>Job / customer</th>
            <th>Description</th>
            <th>Severity</th>
            <th>Person</th>
            {showAttributionColumns ? (
              <>
                <th>Entered by</th>
                <th>Updated by</th>
              </>
            ) : null}
            <th />
          </tr>
        </thead>
        <tbody>
          {filtered.length ? (
            filtered.map(renderMistakeRow)
          ) : (
            <tr>
              <td colSpan={mistakeTableColSpan} className="hr-mistakes-empty">
                No detailed mistakes logged for this week.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
  };

  return (
    <div className="shell">
      {sessionToken ? (
        <EliteosTopbar
          appName="HR"
          organizationName={DEFAULT_WORKSPACE_NAME}
          logoSrc={EOS_LOGO_URL}
          homeHref="/"
          userName={userDisplayName}
          userEmail={userEmail.trim()}
          userSubtitle={chipSubtitle}
          initials={userInitialsFor(userMetaName, userEmail)}
          menuItems={menuItems}
          onSignOut={() => void signOut()}
        />
      ) : (
        <EliteosTopbar appName="HR" organizationName={DEFAULT_WORKSPACE_NAME} logoSrc={EOS_LOGO_URL} homeHref="/" />
      )}

      <main className="main" role="main">
        {!sessionToken ? (
          <div className="auth-panel auth-panel-standalone">
            <div className="auth-panel-header">
              <p className="auth-panel-eyebrow">eliteOS · HR Head</p>
              <h1 className="auth-panel-title">Weekly Operations Scorecard</h1>
              <p className="auth-panel-sub">Sign in to grade operational sections and generate weekly reports.</p>
            </div>
            <div className="field-grid">
              <label className="field">
                Email
                <input type="email" autoComplete="username" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} />
              </label>
              <label className="field">
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void signIn();
                  }}
                />
              </label>
            </div>
            {authError ? <div className="banner banner-error">{authError}</div> : null}
            <button type="button" className="btn btn-primary" disabled={authBusy} onClick={() => void signIn()}>
              {authBusy ? "Signing in…" : "Sign in"}
            </button>
          </div>
        ) : (
          <>
            <section className="hr-scorecard-hero">
              <div>
                <p className="hero-eyebrow">HR Head · Operations</p>
                <h1 className="hero-title">
                  {isDepartmentView ? "Department Quality Entry" : "Weekly Operations Scorecard"}
                </h1>
                <p className="hero-sub">
                  {isDepartmentView
                    ? [departmentNames, heroWeekLabel].filter(Boolean).join(" · ") ||
                      "Enter weekly counts and log detailed mistakes for your assigned departments."
                    : "Enter weekly counts and metrics, log detailed mistakes, and freeze the end-of-week report."}
                </p>
              </div>
              <div className="hr-scorecard-controls">
                <label className="field">
                  Week
                  <select value={selectedWeekStart} onChange={(e) => setSelectedWeekStart(e.target.value)} disabled={busy}>
                    {weekOptions.map((w) => (
                      <option key={w.weekStart} value={w.weekStart}>
                        {w.weekLabel}
                      </option>
                    ))}
                  </select>
                </label>
                {!isDepartmentView && scorecard?.overallGrade ? (
                  <div className="hr-overall-grade">
                    <span>Overall company grade</span>
                    <strong className={`hr-grade-badge hr-grade-badge--sm hr-grade-badge--${scorecard.overallGrade.toLowerCase()}`}>
                      {scorecard.overallGrade}
                    </strong>
                  </div>
                ) : null}
              </div>
            </section>

            {scorecard?.warning ? <EosAlertBanner tone="warn">{scorecard.warning}</EosAlertBanner> : null}
            {err ? <div className="banner banner-error">{err}</div> : null}
            {success ? <EosAlertBanner tone="success">{success}</EosAlertBanner> : null}

            {!isDepartmentView && executiveSummary ? (
              <section className="hr-exec-summary">
                <h2 className="hr-scorecard-section-title">Executive Summary</h2>
                <div className="hr-exec-summary-grid">
                  <article className="hr-exec-stat hr-exec-stat--hero">
                    <span>Overall Grade</span>
                    <GradeChip grade={executiveSummary.overallGrade ?? scorecard?.overallGrade ?? null} />
                  </article>
                  <article className="hr-exec-stat"><span>A grades</span><strong>{gradeCounts.A}</strong></article>
                  <article className="hr-exec-stat"><span>B grades</span><strong>{gradeCounts.B}</strong></article>
                  <article className="hr-exec-stat"><span>C grades</span><strong>{gradeCounts.C}</strong></article>
                  <article className="hr-exec-stat"><span>D grades</span><strong>{gradeCounts.D}</strong></article>
                  <article className="hr-exec-stat"><span>F grades</span><strong>{gradeCounts.F}</strong></article>
                  <article className="hr-exec-stat"><span>Total mistakes</span><strong>{executiveSummary.totalMistakes ?? 0}</strong></article>
                  <article className="hr-exec-stat"><span>Worst area</span><strong>{executiveSummary.worstPerformingArea ?? "—"}</strong></article>
                  <article className="hr-exec-stat">
                    <span>Quote volume</span>
                    <strong>{executiveSummary.quoteVolumeDisplay ?? formatCurrency(executiveSummary.quoteVolume ?? null)}</strong>
                  </article>
                  <article className="hr-exec-stat">
                    <span>Production SF</span>
                    <strong>
                      {executiveSummary.productionDisplay ??
                        (executiveSummary.productionSf != null
                          ? `${executiveSummary.productionSf.toLocaleString()} SF`
                          : "—")}
                    </strong>
                  </article>
                  <article className="hr-exec-stat">
                    <span>Median lead time</span>
                    <strong>
                      {executiveSummary.medianLeadTimeDisplay ??
                        (executiveSummary.medianLeadTime != null ? `${executiveSummary.medianLeadTime} days` : "—")}
                    </strong>
                  </article>
                </div>
                {narrative ? <p className="hr-exec-narrative">{narrative}</p> : null}
              </section>
            ) : null}

            {!isDepartmentView && scorecard?.canGenerateReport !== false ? (
            <div className="hr-scorecard-actions">
              <button type="button" className="btn btn-primary" disabled={reportBusy || busy} onClick={() => void generateReport()}>
                {reportBusy ? "Generating…" : "Generate Weekly Report"}
              </button>
              {reportText ? (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => void copyReport()}>
                    Copy Report
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
                    Print
                  </button>
                </>
              ) : null}
            </div>
            ) : null}

            {!isDepartmentView && (reportText || reportHtml) ? (
              <section className="hr-report-panel">
                <h2 className="hr-report-title">Weekly report</h2>
                {reportHtml ? (
                  <div className="hr-report-html" dangerouslySetInnerHTML={{ __html: reportHtml }} />
                ) : (
                  <pre className="hr-report-text">{reportText}</pre>
                )}
              </section>
            ) : null}

            {isExecutiveView && scorecard?.canManageDepartments ? (
              <section className="hr-dept-access">
                <button
                  type="button"
                  className="hr-dept-access-toggle"
                  onClick={() => setDeptAccessOpen((v) => !v)}
                  aria-expanded={deptAccessOpen}
                >
                  {deptAccessOpen ? "Hide Department Access" : "Department Access"}
                  {deptAssignments.length ? ` (${deptAssignments.length})` : ""}
                </button>
                {deptAccessOpen ? (
                  <div className="hr-dept-access-panel">
                    <p className="hr-dept-access-intro">
                      Assign Executive Dashboard for full company scorecard access, or department groups for limited
                      operational entry. Eligible users come from active eliteOS application users in this organization
                      (preferably with HR Head access).
                    </p>
                    <div className="hr-dept-access-legend">
                      <p>
                        <strong>Executive Dashboard</strong> — Full company scorecard, all mistakes, executive summary,
                        and weekly report access.
                      </p>
                      <p>
                        <strong>Department groups</strong> — Limited entry and visibility for assigned operational
                        sections.
                      </p>
                    </div>
                    <div className="hr-dept-access-form">
                      <label className="field">
                        User
                        <select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} disabled={deptAccessBusy}>
                          <option value="">Select user…</option>
                          {eligibleUsers.map((user) => (
                            <option key={user.userId} value={user.userId}>
                              {user.displayName}
                              {user.email ? ` (${user.email})` : ""}
                              {user.hasHrHeadAccess ? "" : " — no HR Head access"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        Access
                        <select value={assignDeptSlug} onChange={(e) => setAssignDeptSlug(e.target.value)} disabled={deptAccessBusy}>
                          <option value="">Select access…</option>
                          {(accessOptions.length
                            ? accessOptions
                            : [
                                {
                                  slug: "executive_dashboard",
                                  name: "Executive Dashboard",
                                  accessType: "executive_dashboard" as const,
                                  description: "Full company scorecard access."
                                },
                                ...(deptGroups.length ? deptGroups : scorecard?.departments ?? []).map((g) => ({
                                  slug: g.slug,
                                  name: g.name,
                                  accessType: "department" as const,
                                  description: "Limited department entry."
                                }))
                              ]
                          ).map((opt) => (
                            <option key={opt.slug} value={opt.slug}>
                              {opt.accessType === "executive_dashboard" ? `${opt.name} (full access)` : opt.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={deptAssignBusy || deptAccessBusy || !assignUserId || !assignDeptSlug}
                        onClick={() => void assignDepartment()}
                      >
                        {deptAssignBusy ? "Assigning…" : "Assign"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={deptAccessBusy || deptAssignBusy}
                        onClick={() => void loadDepartmentAccess()}
                      >
                        {deptAccessBusy ? "Refreshing…" : "Refresh users"}
                      </button>
                    </div>
                    {assignDeptSlug ? (
                      <p className="hr-dept-access-meta">
                        {(accessOptions.find((o) => o.slug === assignDeptSlug)?.description ??
                          (assignDeptSlug === "executive_dashboard"
                            ? "Full company scorecard, all mistakes, executive summary, and weekly report access."
                            : "Limited entry and visibility for assigned operational sections."))}
                      </p>
                    ) : null}
                    {deptAccessBusy ? <p className="hr-dept-access-meta">Loading assignments…</p> : null}
                    {deptAssignments.length ? (
                      <ul className="hr-dept-access-list">
                        {deptAssignments.map((a) => (
                          <li key={a.id}>
                            <div className="hr-dept-access-item">
                              <strong>{a.userName}</strong>
                              <span>
                                {a.departmentName}
                                {a.accessType === "executive_dashboard" ? " · Full scorecard" : ""}
                                {a.userEmail ? ` · ${a.userEmail}` : ""}
                                {a.hasHrHeadAccess === false ? " · No HR Head access" : ""}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={deptAccessBusy}
                              onClick={() => void removeDepartmentAssignment(a)}
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="hr-dept-access-empty">No access assignments yet.</p>
                    )}
                  </div>
                ) : null}
              </section>
            ) : null}

            {gradeRows.length ? (
            <section className="hr-scorecard-section">
              <h2 className="hr-scorecard-section-title">{isDepartmentView ? "Your sections" : "Grades"}</h2>
              <div className="hr-scorecard-grid">{gradeRows.map((row) => renderSectionCard(row, "grade"))}</div>
            </section>
            ) : null}

            {metricRows.length ? (
            <section className="hr-scorecard-section">
              <h2 className="hr-scorecard-section-title">Totals / Metrics</h2>
              <div className="hr-scorecard-grid">{metricRows.map((row) => renderSectionCard(row, "metric"))}</div>
            </section>
            ) : null}

            <section className="hr-mistakes-log">
              <div className="hr-mistakes-log-head">
                <h2 className="hr-scorecard-section-title">Mistakes Log</h2>
                {logBusy ? <span className="hr-mistakes-log-meta">Updating…</span> : null}
              </div>

              {renderMistakeLogFilters()}

              <div className="hr-mistakes-week-block">
                <h3>{selectedWeekLog?.weekLabel ?? scorecard?.weekLabel ?? "Selected week"}</h3>
                {renderMistakeTable(selectedWeekLog?.mistakes ?? [])}
              </div>

              {priorWeekLogs.length ? (
                <div className="hr-mistakes-prior">
                  <button type="button" className="hr-mistakes-prior-toggle" onClick={() => setPriorWeeksOpen((v) => !v)}>
                    {priorWeeksOpen ? "Hide previous weeks" : `Show previous weeks (${priorWeekLogs.length})`}
                  </button>
                  {priorWeeksOpen
                    ? priorWeekLogs.map((week) => (
                        <div key={week.weekStart} className="hr-mistakes-week-block hr-mistakes-week-block--prior">
                          <h3>{week.weekLabel}</h3>
                          {renderMistakeTable(week.mistakes)}
                        </div>
                      ))
                    : null}
                </div>
              ) : null}
            </section>
          </>
        )}
      </main>

      {modalKind && (activeSection || editingMistake) ? (
        <div className="hr-modal-backdrop" onClick={closeModal} role="presentation">
          <div className="hr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <header className="hr-modal-head">
              <h2>
                {modalKind === "mistake"
                  ? `Log mistake — ${activeSection?.name ?? ""}`
                  : modalKind === "editMistake"
                    ? "Edit mistake"
                    : activeSection?.name ?? ""}
              </h2>
              <button type="button" className="hr-modal-close" onClick={closeModal} aria-label="Close">
                ×
              </button>
            </header>

            {modalKind === "mistake" || modalKind === "editMistake" ? (
              <div className="field-grid">
                <label className="field">
                  Date
                  <input type="date" value={mistakeDate} onChange={(e) => setMistakeDate(e.target.value)} />
                </label>
                <label className="field">
                  Job / customer
                  <input value={mistakeJob} onChange={(e) => setMistakeJob(e.target.value)} placeholder="Optional" />
                </label>
                <label className="field hr-field-full">
                  Description
                  <textarea rows={3} value={mistakeDescription} onChange={(e) => setMistakeDescription(e.target.value)} />
                </label>
                <label className="field">
                  Severity
                  <select value={mistakeSeverity} onChange={(e) => setMistakeSeverity(e.target.value)}>
                    <option value="minor">Minor</option>
                    <option value="moderate">Moderate</option>
                    <option value="major">Major</option>
                  </select>
                </label>
                <label className="field">
                  Person involved
                  <input value={mistakePerson} onChange={(e) => setMistakePerson(e.target.value)} placeholder="Optional" />
                </label>
                {modalKind === "mistake" ? (
                  <label className="field hr-field-full">
                    Notes
                    <textarea rows={2} value={mistakeNotes} onChange={(e) => setMistakeNotes(e.target.value)} placeholder="Optional" />
                  </label>
                ) : null}
              </div>
            ) : (
              <div className="field-grid">
                {activeSection?.metricKind === "days" ? (
                  <>
                    <label className="field">
                      Median days
                      <input type="number" step="0.1" value={metricMedian} onChange={(e) => setMetricMedian(e.target.value)} />
                    </label>
                    <label className="field">
                      Average days
                      <input type="number" step="0.1" value={metricAverage} onChange={(e) => setMetricAverage(e.target.value)} />
                    </label>
                  </>
                ) : null}
                {activeSection?.metricKind === "currency" ? (
                  <label className="field hr-field-full">
                    Weekly quoting value (USD)
                    <input type="number" step="0.01" value={metricCurrency} onChange={(e) => setMetricCurrency(e.target.value)} />
                  </label>
                ) : null}
                {activeSection?.metricKind === "production" ? (
                  <>
                    <label className="field">
                      Weekly sqft
                      <input type="number" value={metricWeeklySf} onChange={(e) => setMetricWeeklySf(e.target.value)} />
                    </label>
                    <label className="field">
                      Daily sqft
                      <input type="number" value={metricDailySf} onChange={(e) => setMetricDailySf(e.target.value)} placeholder="Optional" />
                    </label>
                  </>
                ) : null}
                {activeSection?.metricKind === "hours" ? (
                  <label className="field">
                    Downtime hours
                    <input type="number" step="0.1" value={metricHours} onChange={(e) => setMetricHours(e.target.value)} />
                  </label>
                ) : null}
              </div>
            )}

            <footer className="hr-modal-foot">
              <button type="button" className="btn btn-secondary" onClick={closeModal}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saveBusy}
                onClick={() =>
                  void (modalKind === "mistake"
                    ? submitMistake()
                    : modalKind === "editMistake"
                      ? submitEditMistake()
                      : submitMetric())
                }
              >
                {saveBusy ? "Saving…" : "Save"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
