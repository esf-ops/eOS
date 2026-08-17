/**
 * Account Directory internal follow-ups — Account 360 staff reminders on canonical AD UUIDs.
 * No QuickBooks / Moraware / calendar / email writes.
 */

import { ACCOUNT_DIRECTORY_CAPABILITIES, roleHasCapability } from "./accountDirectoryAuth.mjs";
import { AccountDirectoryError } from "./accountDirectoryErrors.mjs";
import { isAccountDirectoryUuid, loadStaffDisplayNames } from "./accountDirectoryNotes.mjs";

export const AD_FOLLOW_UP_TITLE_MAX = 200;
export const AD_FOLLOW_UP_DETAILS_MAX = 4000;
export const AD_FOLLOW_UPS_PAGE_DEFAULT = 25;
export const AD_FOLLOW_UPS_PAGE_MAX = 50;
export const AD_FOLLOW_UP_STATUSES = Object.freeze(["open", "completed"]);
export const AD_FOLLOW_UP_AUTHOR_FALLBACK = "Staff";
export const AD_ASSIGNABLE_STAFF_MAX = 200;

function requireUuid(value, label) {
  const id = String(value ?? "").trim();
  if (!isAccountDirectoryUuid(id)) {
    throw new AccountDirectoryError("invalid_id", `${label} is invalid.`, 400);
  }
  return id;
}

function requireCap(role, capability) {
  if (!roleHasCapability(role, capability)) {
    throw new AccountDirectoryError("forbidden", "Permission denied for this Account Directory action.", 403);
  }
}

function boundedPage(rawPage, rawLimit) {
  const page = Math.max(1, Number.parseInt(String(rawPage ?? "1"), 10) || 1);
  const parsed = Number.parseInt(String(rawLimit ?? ""), 10);
  const limit = Number.isFinite(parsed)
    ? Math.min(AD_FOLLOW_UPS_PAGE_MAX, Math.max(1, parsed))
    : AD_FOLLOW_UPS_PAGE_DEFAULT;
  return { page, limit };
}

export function parseFollowUpStatusFilter(raw) {
  const status = String(raw ?? "open").trim().toLowerCase() || "open";
  if (status === "all" || status === "open" || status === "completed") return status;
  throw new AccountDirectoryError("invalid_status", "Status must be open, completed, or all.");
}

/**
 * @param {unknown} raw
 */
export function validateFollowUpTitle(raw) {
  if (raw == null) {
    throw new AccountDirectoryError("follow_up_title_required", "Title is required.");
  }
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw new AccountDirectoryError("follow_up_title_invalid", "Title is invalid.");
  }
  const title = String(raw).trim();
  if (!title) {
    throw new AccountDirectoryError("follow_up_title_required", "Title is required.");
  }
  if (title.length > AD_FOLLOW_UP_TITLE_MAX) {
    throw new AccountDirectoryError(
      "follow_up_title_too_long",
      `Title must be ${AD_FOLLOW_UP_TITLE_MAX} characters or fewer.`
    );
  }
  return title;
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function validateFollowUpDetails(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw new AccountDirectoryError("follow_up_details_invalid", "Details are invalid.");
  }
  const details = String(raw).trim();
  if (!details) return null;
  if (details.length > AD_FOLLOW_UP_DETAILS_MAX) {
    throw new AccountDirectoryError(
      "follow_up_details_too_long",
      `Details must be ${AD_FOLLOW_UP_DETAILS_MAX} characters or fewer.`
    );
  }
  return details;
}

/**
 * @param {unknown} raw
 * @returns {string} ISO timestamp
 */
export function validateFollowUpDueAt(raw) {
  if (raw == null || raw === "") {
    throw new AccountDirectoryError("follow_up_due_required", "Due date is required.");
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new AccountDirectoryError("follow_up_due_invalid", "Due date is invalid.");
  }
  return parsed.toISOString();
}

function localYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Derived display state. Clock authority for overdue; local calendar day for due today.
 * @param {string | Date} dueAt
 * @param {{ status?: string, now?: Date }} [opts]
 */
export function followUpDueState(dueAt, opts = {}) {
  if (String(opts.status || "").toLowerCase() === "completed") return "completed";
  const due = dueAt instanceof Date ? dueAt : new Date(dueAt);
  const now = opts.now instanceof Date ? opts.now : new Date();
  if (Number.isNaN(due.getTime()) || Number.isNaN(now.getTime())) return "upcoming";
  if (due.getTime() < now.getTime()) return "overdue";
  if (localYmd(due) === localYmd(now)) return "due_today";
  return "upcoming";
}

function publicPerson(displayName) {
  const name = String(displayName || "").trim();
  return { displayName: name || AD_FOLLOW_UP_AUTHOR_FALLBACK };
}

/**
 * @param {any} row
 * @param {Map<string, string>} names
 * @param {{ now?: Date, actorUserId?: string|null, actorDisplayName?: string|null }} [ctx]
 */
export function toPublicFollowUp(row, names = new Map(), ctx = {}) {
  const assignedTo = row?.assignedTo ? String(row.assignedTo) : "";
  const createdBy = row?.createdBy ? String(row.createdBy) : "";
  const assigneeName = assignedTo ? names.get(assignedTo) : "";
  const authorName =
    (createdBy ? names.get(createdBy) : "") ||
    (String(createdBy) === String(ctx.actorUserId || "") ? ctx.actorDisplayName : null);
  return {
    id: row.id,
    title: row.title,
    details: row.details ?? null,
    dueAt: row.dueAt,
    status: row.status,
    dueState: followUpDueState(row.dueAt, { status: row.status, now: ctx.now }),
    completedAt: row.completedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    assignedTo: assignedTo || null,
    assignee: assignedTo ? publicPerson(assigneeName) : null,
    author: publicPerson(authorName),
    rowVersion: Number(row.rowVersion || 1)
  };
}

async function requireAccount(store, organizationId, accountId) {
  const account = await store.getAccount(organizationId, accountId);
  if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
  return account;
}

async function requireCurrentFollowUp(store, organizationId, accountId, followUpId) {
  const current = await store.getAccountFollowUp(organizationId, followUpId);
  if (!current || current.accountId !== accountId || current.archivedAt) {
    throw new AccountDirectoryError("not_found", "Follow-up not found on this account.", 404);
  }
  return current;
}

/**
 * Org-scoped active staff for assignment. id + displayName only.
 */
export async function listAssignableStaff(params) {
  requireCap(params.role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
  const accountId = requireUuid(params.accountId, "Account id");
  await requireAccount(params.store, params.organizationId, accountId);
  if (typeof params.listOrgStaff === "function") {
    const rows = await params.listOrgStaff(params.organizationId);
    return {
      items: (rows || [])
        .map((row) => ({
          id: String(row.id || ""),
          displayName: String(row.displayName || row.fullName || row.full_name || "").trim() || AD_FOLLOW_UP_AUTHOR_FALLBACK
        }))
        .filter((row) => isAccountDirectoryUuid(row.id))
        .slice(0, AD_ASSIGNABLE_STAFF_MAX)
    };
  }
  if (typeof params.getSupabase !== "function") return { items: [] };
  try {
    const { data, error } = await params
      .getSupabase()
      .from("user_profiles")
      .select("id, full_name")
      .eq("organization_id", params.organizationId)
      .eq("is_active", true)
      .order("full_name", { ascending: true })
      .limit(AD_ASSIGNABLE_STAFF_MAX);
    if (error || !Array.isArray(data)) return { items: [] };
    return {
      items: data
        .map((row) => ({
          id: String(row.id || ""),
          displayName: String(row.full_name || "").trim() || AD_FOLLOW_UP_AUTHOR_FALLBACK
        }))
        .filter((row) => isAccountDirectoryUuid(row.id))
    };
  } catch {
    return { items: [] };
  }
}

async function resolveAssignedTo(params, raw) {
  if (raw == null || raw === "") return null;
  const id = requireUuid(raw, "Assignee");
  if (params.actorUserId && id === String(params.actorUserId)) return id;
  if (typeof params.assertAssigneeInOrg === "function") {
    const ok = await params.assertAssigneeInOrg(params.organizationId, id);
    if (!ok) {
      throw new AccountDirectoryError("assignee_invalid", "Assignee must be an active user in this organization.", 400);
    }
    return id;
  }
  if (typeof params.getSupabase === "function") {
    try {
      const { data, error } = await params
        .getSupabase()
        .from("user_profiles")
        .select("id")
        .eq("id", id)
        .eq("organization_id", params.organizationId)
        .eq("is_active", true)
        .maybeSingle();
      if (error || !data?.id) {
        throw new AccountDirectoryError("assignee_invalid", "Assignee must be an active user in this organization.", 400);
      }
      return id;
    } catch (err) {
      if (err instanceof AccountDirectoryError) throw err;
      throw new AccountDirectoryError("assignee_invalid", "Assignee must be an active user in this organization.", 400);
    }
  }
  throw new AccountDirectoryError("assignee_invalid", "Assignee must be an active user in this organization.", 400);
}

async function writeFollowUpAudit({
  store,
  logAction,
  getSupabase,
  organizationId,
  accountId,
  followUpId,
  action,
  actorUserId,
  requestId,
  role,
  dueAt,
  status,
  assignedTo
}) {
  let row = null;
  try {
    row = await store.insertAuditEvent({
      organizationId,
      accountId,
      entityType: "follow_up",
      entityId: followUpId,
      action,
      actorUserId: actorUserId ?? null,
      changedFields: ["id"],
      oldValues: null,
      newValues: {
        followUpId,
        dueAt: dueAt ?? null,
        status: status ?? null,
        assignedTo: assignedTo ?? null
      },
      requestId: requestId ?? null
    });
  } catch {
    row = null;
  }
  if (typeof logAction === "function" && getSupabase) {
    try {
      await logAction({
        supabase: getSupabase(),
        user: actorUserId ? { id: actorUserId } : null,
        toolSlug: "account_directory",
        action,
        metadata: {
          entityType: "follow_up",
          entityId: followUpId,
          accountId,
          changedFields: ["id"],
          role: role ?? null
        }
      });
    } catch {
      /* platform action log is best-effort */
    }
  }
  return row;
}

async function toPublic(params, row) {
  const names = await loadStaffDisplayNames(params, [row.createdBy, row.assignedTo]);
  return toPublicFollowUp(row, names, {
    now: params.now,
    actorUserId: params.actorUserId,
    actorDisplayName: params.actorDisplayName
  });
}

function handleUpdateResult(result) {
  if (!result.ok && result.code === "conflict") {
    throw new AccountDirectoryError("conflict", "Follow-up was updated elsewhere. Reload and try again.", 409);
  }
  if (!result.ok) {
    throw new AccountDirectoryError("not_found", "Follow-up not found on this account.", 404);
  }
  return result.followUp;
}

export async function listAccountFollowUps(params) {
  requireCap(params.role, ACCOUNT_DIRECTORY_CAPABILITIES.VIEW);
  const accountId = requireUuid(params.accountId, "Account id");
  await requireAccount(params.store, params.organizationId, accountId);
  const status = parseFollowUpStatusFilter(params.status);
  const { page, limit } = boundedPage(params.page, params.pageSize ?? params.limit);
  const result = await params.store.listAccountFollowUps(params.organizationId, accountId, {
    page,
    limit,
    status,
    includeArchived: false
  });
  const names = await loadStaffDisplayNames(params, [
    ...(result.items || []).flatMap((row) => [row.createdBy, row.assignedTo])
  ]);
  return {
    items: (result.items || []).map((row) =>
      toPublicFollowUp(row, names, {
        now: params.now,
        actorUserId: params.actorUserId,
        actorDisplayName: params.actorDisplayName
      })
    ),
    pagination: result.pagination || { page, limit, has_more: false },
    status
  };
}

export async function createAccountFollowUp(params) {
  requireCap(params.role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
  const accountId = requireUuid(params.accountId, "Account id");
  await requireAccount(params.store, params.organizationId, accountId);
  const title = validateFollowUpTitle(params.payload?.title);
  const details = validateFollowUpDetails(params.payload?.details);
  const dueAt = validateFollowUpDueAt(params.payload?.dueAt ?? params.payload?.due_at);
  const assignedTo = await resolveAssignedTo(params, params.payload?.assignedTo ?? params.payload?.assigned_to);
  const row = await params.store.insertAccountFollowUp({
    organizationId: params.organizationId,
    accountId,
    title,
    details,
    dueAt,
    status: "open",
    assignedTo,
    createdBy: params.actorUserId ?? null,
    updatedBy: params.actorUserId ?? null
  });
  await writeFollowUpAudit({
    store: params.store,
    logAction: params.logAction,
    getSupabase: params.getSupabase,
    organizationId: params.organizationId,
    accountId,
    followUpId: row.id,
    action: "add_follow_up",
    actorUserId: params.actorUserId,
    requestId: params.requestId,
    role: params.role,
    dueAt,
    status: "open",
    assignedTo
  });
  return toPublic(params, row);
}

export async function updateAccountFollowUp(params) {
  requireCap(params.role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
  const accountId = requireUuid(params.accountId, "Account id");
  const followUpId = requireUuid(params.followUpId, "Follow-up id");
  await requireAccount(params.store, params.organizationId, accountId);
  await requireCurrentFollowUp(params.store, params.organizationId, accountId, followUpId);
  const title = validateFollowUpTitle(params.payload?.title);
  const details = validateFollowUpDetails(params.payload?.details);
  const dueAt = validateFollowUpDueAt(params.payload?.dueAt ?? params.payload?.due_at);
  const hasAssignedTo =
    params.payload != null &&
    (Object.prototype.hasOwnProperty.call(params.payload, "assignedTo") ||
      Object.prototype.hasOwnProperty.call(params.payload, "assigned_to"));
  /** @type {Record<string, unknown>} */
  const patch = { title, details, dueAt, updatedBy: params.actorUserId ?? null };
  if (hasAssignedTo) {
    patch.assignedTo = await resolveAssignedTo(params, params.payload?.assignedTo ?? params.payload?.assigned_to);
  }
  const result = await params.store.updateAccountFollowUp(
    params.organizationId,
    followUpId,
    patch,
    params.payload?.rowVersion
  );
  const row = handleUpdateResult(result);
  await writeFollowUpAudit({
    store: params.store,
    logAction: params.logAction,
    getSupabase: params.getSupabase,
    organizationId: params.organizationId,
    accountId,
    followUpId,
    action: "update_follow_up",
    actorUserId: params.actorUserId,
    requestId: params.requestId,
    role: params.role,
    dueAt,
    status: row.status,
    assignedTo: row.assignedTo ?? null
  });
  return toPublic(params, row);
}

export async function completeAccountFollowUp(params) {
  requireCap(params.role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
  const accountId = requireUuid(params.accountId, "Account id");
  const followUpId = requireUuid(params.followUpId, "Follow-up id");
  await requireAccount(params.store, params.organizationId, accountId);
  const current = await requireCurrentFollowUp(params.store, params.organizationId, accountId, followUpId);
  if (current.status === "completed") {
    throw new AccountDirectoryError("already_completed", "Follow-up is already completed.", 409);
  }
  const completedAt = (params.now instanceof Date ? params.now : new Date()).toISOString();
  const result = await params.store.updateAccountFollowUp(
    params.organizationId,
    followUpId,
    {
      status: "completed",
      completedAt,
      completedBy: params.actorUserId ?? null,
      updatedBy: params.actorUserId ?? null
    },
    params.payload?.rowVersion
  );
  const row = handleUpdateResult(result);
  await writeFollowUpAudit({
    store: params.store,
    logAction: params.logAction,
    getSupabase: params.getSupabase,
    organizationId: params.organizationId,
    accountId,
    followUpId,
    action: "complete_follow_up",
    actorUserId: params.actorUserId,
    requestId: params.requestId,
    role: params.role,
    dueAt: row.dueAt,
    status: "completed",
    assignedTo: row.assignedTo ?? null
  });
  return toPublic(params, row);
}

export async function reopenAccountFollowUp(params) {
  requireCap(params.role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
  const accountId = requireUuid(params.accountId, "Account id");
  const followUpId = requireUuid(params.followUpId, "Follow-up id");
  await requireAccount(params.store, params.organizationId, accountId);
  const current = await requireCurrentFollowUp(params.store, params.organizationId, accountId, followUpId);
  if (current.status !== "completed") {
    throw new AccountDirectoryError("not_completed", "Follow-up is not completed.", 409);
  }
  const result = await params.store.updateAccountFollowUp(
    params.organizationId,
    followUpId,
    {
      status: "open",
      completedAt: null,
      completedBy: null,
      updatedBy: params.actorUserId ?? null
    },
    params.payload?.rowVersion
  );
  const row = handleUpdateResult(result);
  await writeFollowUpAudit({
    store: params.store,
    logAction: params.logAction,
    getSupabase: params.getSupabase,
    organizationId: params.organizationId,
    accountId,
    followUpId,
    action: "reopen_follow_up",
    actorUserId: params.actorUserId,
    requestId: params.requestId,
    role: params.role,
    dueAt: row.dueAt,
    status: "open",
    assignedTo: row.assignedTo ?? null
  });
  return toPublic(params, row);
}

export async function archiveAccountFollowUp(params) {
  requireCap(params.role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
  const accountId = requireUuid(params.accountId, "Account id");
  const followUpId = requireUuid(params.followUpId, "Follow-up id");
  await requireAccount(params.store, params.organizationId, accountId);
  await requireCurrentFollowUp(params.store, params.organizationId, accountId, followUpId);
  const result = await params.store.updateAccountFollowUp(
    params.organizationId,
    followUpId,
    {
      archivedAt: new Date().toISOString(),
      archivedBy: params.actorUserId ?? null,
      updatedBy: params.actorUserId ?? null
    },
    params.payload?.rowVersion
  );
  const row = handleUpdateResult(result);
  await writeFollowUpAudit({
    store: params.store,
    logAction: params.logAction,
    getSupabase: params.getSupabase,
    organizationId: params.organizationId,
    accountId,
    followUpId,
    action: "archive_follow_up",
    actorUserId: params.actorUserId,
    requestId: params.requestId,
    role: params.role,
    dueAt: row.dueAt,
    status: row.status,
    assignedTo: row.assignedTo ?? null
  });
  return { id: row.id, archived: true };
}
