/**
 * Approval / archive / supersede lifecycle for Knowledge Hub.
 */
import {
  getKnowledgeDocument,
  updateKnowledgeDocument,
} from "./knowledgeRepository.mjs";
import { pickStr, isUuid } from "./knowledgeConstants.mjs";

export async function approveKnowledgeDocument(db, { organizationId, documentId, userId, note }) {
  const got = await getKnowledgeDocument(db, { organizationId, documentId });
  if (!got.ok) return got;
  const doc = got.document;
  if (!["review_required", "rejected", "archived"].includes(doc.status) && doc.status !== "approved") {
    if (doc.status === "processing" || doc.status === "uploaded" || doc.status === "processing_failed") {
      return { ok: false, status: 409, error: "Document must finish processing and reach review before approval." };
    }
  }
  if (doc.status === "review_required" || doc.status === "rejected" || doc.status === "archived") {
    // ok
  } else if (doc.status === "approved" && doc.is_current) {
    return { ok: true, document: doc, already: true };
  }

  const sourceGroupId = doc.source_group_id || doc.id;

  // Demote prior current versions in the same source group
  const { data: siblings } = await db
    .from("slab_ai_knowledge_documents")
    .select("id,status,is_current,version")
    .eq("organization_id", organizationId)
    .eq("source_group_id", sourceGroupId)
    .neq("id", documentId);

  for (const sib of siblings || []) {
    if (sib.is_current || sib.status === "approved") {
      await updateKnowledgeDocument(db, {
        organizationId,
        documentId: sib.id,
        patch: {
          is_current: false,
          status: sib.status === "approved" ? "archived" : sib.status,
          superseded_by: documentId,
        },
      });
    }
  }

  const updated = await updateKnowledgeDocument(db, {
    organizationId,
    documentId,
    patch: {
      status: "approved",
      is_current: true,
      is_active: true,
      approved_by: userId,
      approved_at: new Date().toISOString(),
      rejected_by: null,
      rejected_at: null,
      review_note: pickStr(note) || doc.review_note || null,
      superseded_by: null,
    },
  });
  return updated;
}

export async function rejectKnowledgeDocument(db, { organizationId, documentId, userId, note }) {
  const got = await getKnowledgeDocument(db, { organizationId, documentId });
  if (!got.ok) return got;
  return updateKnowledgeDocument(db, {
    organizationId,
    documentId,
    patch: {
      status: "rejected",
      is_current: false,
      rejected_by: userId,
      rejected_at: new Date().toISOString(),
      review_note: pickStr(note) || null,
    },
  });
}

export async function archiveKnowledgeDocument(db, { organizationId, documentId, userId, note }) {
  const got = await getKnowledgeDocument(db, { organizationId, documentId });
  if (!got.ok) return got;
  return updateKnowledgeDocument(db, {
    organizationId,
    documentId,
    patch: {
      status: "archived",
      is_current: false,
      is_active: false,
      review_note: pickStr(note) || got.document.review_note || null,
      metadata: {
        ...(got.document.metadata || {}),
        archived_by: userId,
        archived_at: new Date().toISOString(),
      },
    },
  });
}

export async function restoreKnowledgeDocument(db, { organizationId, documentId, userId }) {
  const got = await getKnowledgeDocument(db, { organizationId, documentId });
  if (!got.ok) return got;
  // Restore to review_required so it must be re-approved (never auto-trust)
  return updateKnowledgeDocument(db, {
    organizationId,
    documentId,
    patch: {
      status: "review_required",
      is_active: true,
      is_current: false,
      review_note: `Restored by ${userId} — requires re-approval`,
    },
  });
}

/**
 * Soft-delete preference: archive. Hard delete only for never-approved failed uploads.
 */
export async function deleteKnowledgeDocument(db, { organizationId, documentId }) {
  if (!isUuid(documentId)) return { ok: false, status: 400, error: "Invalid id" };
  const got = await getKnowledgeDocument(db, { organizationId, documentId });
  if (!got.ok) return got;
  const doc = got.document;
  if (doc.status === "approved" || doc.approved_at) {
    return {
      ok: false,
      status: 409,
      error: "Approved sources cannot be hard-deleted. Archive instead.",
    };
  }

  await db
    .from("slab_ai_knowledge_passages")
    .delete()
    .eq("organization_id", organizationId)
    .eq("document_id", documentId);

  if (doc.storage_bucket && doc.storage_path) {
    await db.storage.from(doc.storage_bucket).remove([doc.storage_path]).catch(() => null);
  }

  const { error } = await db
    .from("slab_ai_knowledge_documents")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", documentId);
  if (error) throw error;
  return { ok: true, deleted: true };
}
