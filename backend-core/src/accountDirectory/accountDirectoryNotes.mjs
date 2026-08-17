/**
 * Account Directory internal notes — Account 360 staff notes on canonical AD UUIDs.
 * No QuickBooks / Moraware / name-based identity.
 */

import { ACCOUNT_DIRECTORY_CAPABILITIES, roleHasCapability } from "./accountDirectoryAuth.mjs";
import { AccountDirectoryError } from "./accountDirectoryErrors.mjs";

export const AD_NOTE_BODY_MAX = 4000;
export const AD_NOTES_PAGE_DEFAULT = 25;
export const AD_NOTES_PAGE_MAX = 50;
export const AD_NOTE_AUTHOR_FALLBACK = "Staff";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAccountDirectoryUuid(value) {
  return UUID_RE.test(String(value ?? "").trim());
}

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
    ? Math.min(AD_NOTES_PAGE_MAX, Math.max(1, parsed))
    : AD_NOTES_PAGE_DEFAULT;
  return { page, limit };
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function validateNoteBody(raw) {
  if (raw == null) {
    throw new AccountDirectoryError("note_body_required", "Note text is required.");
  }
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw new AccountDirectoryError("note_body_invalid", "Note text is invalid.");
  }
  const body = String(raw).trim();
  if (!body) {
    throw new AccountDirectoryError("note_body_required", "Note text is required.");
  }
  if (body.length > AD_NOTE_BODY_MAX) {
    throw new AccountDirectoryError(
      "note_body_too_long",
      `Note text must be ${AD_NOTE_BODY_MAX} characters or fewer.`
    );
  }
  return body;
}

function publicAuthor(displayName) {
  const name = String(displayName || "").trim();
  return { displayName: name || AD_NOTE_AUTHOR_FALLBACK };
}

/**
 * Safe staff-facing note. Omits user ids, email, and tokens.
 * @param {any} note
 * @param {Map<string, string>} names
 * @param {string | null} [fallbackName]
 */
export function toPublicNote(note, names = new Map(), fallbackName = null) {
  const createdBy = note?.createdBy ? String(note.createdBy) : "";
  const fromMap = createdBy ? names.get(createdBy) : "";
  return {
    id: note.id,
    body: note.body,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    edited: Number(note.rowVersion || 1) > 1,
    author: publicAuthor(fromMap || fallbackName),
    rowVersion: Number(note.rowVersion || 1)
  };
}

/**
 * @param {{
 *   getSupabase?: Function,
 *   resolveStaffDisplayNames?: (ids: string[]) => Promise<Map<string, string>|Record<string,string>>
 * }} deps
 * @param {string[]} userIds
 */
export async function loadStaffDisplayNames(deps, userIds) {
  const ids = [...new Set((userIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  /** @type {Map<string, string>} */
  const map = new Map();
  if (!ids.length) return map;
  if (typeof deps.resolveStaffDisplayNames === "function") {
    const resolved = await deps.resolveStaffDisplayNames(ids);
    if (resolved instanceof Map) {
      for (const [id, name] of resolved) {
        const n = String(name || "").trim();
        if (id && n) map.set(String(id), n);
      }
    } else if (resolved && typeof resolved === "object") {
      for (const [id, name] of Object.entries(resolved)) {
        const n = String(name || "").trim();
        if (id && n) map.set(String(id), n);
      }
    }
    return map;
  }
  if (typeof deps.getSupabase !== "function") return map;
  try {
    const { data, error } = await deps.getSupabase().from("user_profiles").select("id, full_name").in("id", ids);
    if (error || !Array.isArray(data)) return map;
    for (const row of data) {
      const n = String(row?.full_name || "").trim();
      if (row?.id && n) map.set(String(row.id), n);
    }
  } catch {
    /* fail-soft: public notes still render with Staff */
  }
  return map;
}

async function requireAccount(store, organizationId, accountId) {
  const account = await store.getAccount(organizationId, accountId);
  if (!account) throw new AccountDirectoryError("not_found", "Account not found.", 404);
  return account;
}

async function writeNoteAudit({
  store,
  logAction,
  getSupabase,
  organizationId,
  accountId,
  noteId,
  action,
  actorUserId,
  requestId,
  role,
  bodyLength
}) {
  let row = null;
  try {
    row = await store.insertAuditEvent({
      organizationId,
      accountId,
      entityType: "note",
      entityId: noteId,
      action,
      actorUserId: actorUserId ?? null,
      changedFields: ["id"],
      oldValues: null,
      newValues: { noteId, bodyLength: Number(bodyLength) || 0 },
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
          entityType: "note",
          entityId: noteId,
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

async function toPublicPage(deps, items, actorDisplayName, actorUserId) {
  const names = await loadStaffDisplayNames(
    deps,
    items.map((n) => n.createdBy)
  );
  const fallback = actorUserId ? actorDisplayName : null;
  return items.map((note) =>
    toPublicNote(note, names, String(note.createdBy || "") === String(actorUserId || "") ? fallback : null)
  );
}

export async function listAccountNotes(params) {
  requireCap(params.role, ACCOUNT_DIRECTORY_CAPABILITIES.VIEW);
  const accountId = requireUuid(params.accountId, "Account id");
  await requireAccount(params.store, params.organizationId, accountId);
  const { page, limit } = boundedPage(params.page, params.pageSize ?? params.limit);
  const result = await params.store.listAccountNotes(params.organizationId, accountId, {
    page,
    limit,
    includeArchived: false
  });
  const items = await toPublicPage(params, result.items || [], params.actorDisplayName, params.actorUserId);
  return {
    items,
    pagination: result.pagination || { page, limit, has_more: false }
  };
}

export async function createAccountNote(params) {
  requireCap(params.role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
  const accountId = requireUuid(params.accountId, "Account id");
  await requireAccount(params.store, params.organizationId, accountId);
  const body = validateNoteBody(params.payload?.body ?? params.payload?.text);
  const note = await params.store.insertAccountNote({
    organizationId: params.organizationId,
    accountId,
    body,
    createdBy: params.actorUserId ?? null,
    updatedBy: params.actorUserId ?? null
  });
  await writeNoteAudit({
    store: params.store,
    logAction: params.logAction,
    getSupabase: params.getSupabase,
    organizationId: params.organizationId,
    accountId,
    noteId: note.id,
    action: "add_note",
    actorUserId: params.actorUserId,
    requestId: params.requestId,
    role: params.role,
    bodyLength: body.length
  });
  const names = await loadStaffDisplayNames(params, [note.createdBy]);
  return toPublicNote(note, names, params.actorDisplayName);
}

export async function updateAccountNote(params) {
  requireCap(params.role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
  const accountId = requireUuid(params.accountId, "Account id");
  const noteId = requireUuid(params.noteId, "Note id");
  await requireAccount(params.store, params.organizationId, accountId);
  const current = await params.store.getAccountNote(params.organizationId, noteId);
  if (!current || current.accountId !== accountId || current.archivedAt) {
    throw new AccountDirectoryError("not_found", "Note not found on this account.", 404);
  }
  const body = validateNoteBody(params.payload?.body ?? params.payload?.text);
  const result = await params.store.updateAccountNote(
    params.organizationId,
    noteId,
    { body, updatedBy: params.actorUserId ?? null },
    params.payload?.rowVersion
  );
  if (!result.ok && result.code === "conflict") {
    throw new AccountDirectoryError("conflict", "Note was updated elsewhere. Reload and try again.", 409);
  }
  if (!result.ok) {
    throw new AccountDirectoryError("not_found", "Note not found on this account.", 404);
  }
  await writeNoteAudit({
    store: params.store,
    logAction: params.logAction,
    getSupabase: params.getSupabase,
    organizationId: params.organizationId,
    accountId,
    noteId,
    action: "update_note",
    actorUserId: params.actorUserId,
    requestId: params.requestId,
    role: params.role,
    bodyLength: body.length
  });
  const names = await loadStaffDisplayNames(params, [result.note.createdBy]);
  return toPublicNote(result.note, names, params.actorDisplayName);
}

export async function archiveAccountNote(params) {
  requireCap(params.role, ACCOUNT_DIRECTORY_CAPABILITIES.EDIT);
  const accountId = requireUuid(params.accountId, "Account id");
  const noteId = requireUuid(params.noteId, "Note id");
  await requireAccount(params.store, params.organizationId, accountId);
  const current = await params.store.getAccountNote(params.organizationId, noteId);
  if (!current || current.accountId !== accountId || current.archivedAt) {
    throw new AccountDirectoryError("not_found", "Note not found on this account.", 404);
  }
  const result = await params.store.updateAccountNote(
    params.organizationId,
    noteId,
    {
      archivedAt: new Date().toISOString(),
      archivedBy: params.actorUserId ?? null,
      updatedBy: params.actorUserId ?? null
    },
    params.payload?.rowVersion
  );
  if (!result.ok && result.code === "conflict") {
    throw new AccountDirectoryError("conflict", "Note was updated elsewhere. Reload and try again.", 409);
  }
  if (!result.ok) {
    throw new AccountDirectoryError("not_found", "Note not found on this account.", 404);
  }
  await writeNoteAudit({
    store: params.store,
    logAction: params.logAction,
    getSupabase: params.getSupabase,
    organizationId: params.organizationId,
    accountId,
    noteId,
    action: "archive_note",
    actorUserId: params.actorUserId,
    requestId: params.requestId,
    role: params.role,
    bodyLength: String(result.note.body || "").length
  });
  return { id: result.note.id, archived: true };
}
