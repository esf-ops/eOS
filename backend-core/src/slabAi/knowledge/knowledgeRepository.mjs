/**
 * Persistence helpers for Knowledge Hub documents / passages.
 */
import {
  SLAB_AI_KNOWLEDGE_BUCKET,
  pickStr,
  isUuid,
  RETRIEVABLE_STATUSES,
} from "./knowledgeConstants.mjs";

function missingTable(err) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("could not find");
}

export async function listKnowledgeDocuments(db, { organizationId, status, limit = 50 }) {
  let q = db
    .from("slab_ai_knowledge_documents")
    .select(
      "id,organization_id,title,source_type,status,version,source_group_id,is_current,is_active,authority,manufacturer,material,machine_model,tooling_brand,material_brand,file_name,mime_type,file_size_bytes,content_sha256,chunk_count,uploaded_by,approved_by,approved_at,rejected_by,rejected_at,review_note,processing_error,processed_at,retrieval_count,last_retrieved_at,created_at,updated_at,superseded_by"
    )
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(Math.min(100, Math.max(1, Number(limit) || 50)));

  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    if (missingTable(error)) return { ok: false, installed: false, rows: [] };
    throw error;
  }
  return { ok: true, installed: true, rows: data || [] };
}

export async function getKnowledgeDocument(db, { organizationId, documentId }) {
  if (!isUuid(documentId)) return { ok: false, status: 400, error: "Invalid document id" };
  const { data, error } = await db
    .from("slab_ai_knowledge_documents")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .maybeSingle();
  if (error) {
    if (missingTable(error)) return { ok: false, installed: false };
    throw error;
  }
  if (!data) return { ok: false, status: 404, error: "Document not found" };
  return { ok: true, document: data };
}

export async function listPassagesForDocument(db, { organizationId, documentId, limit = 200 }) {
  const { data, error } = await db
    .from("slab_ai_knowledge_passages")
    .select("id,document_id,locator,text,keywords,sort_order,page_number,section_title,extraction_origin,embedding_status,created_at")
    .eq("organization_id", organizationId)
    .eq("document_id", documentId)
    .order("sort_order", { ascending: true })
    .limit(Math.min(500, Math.max(1, Number(limit) || 200)));
  if (error) {
    if (String(error.message || "").includes("extraction_origin")) {
      const legacy = await db
        .from("slab_ai_knowledge_passages")
        .select("id,document_id,locator,text,keywords,sort_order,page_number,section_title,created_at")
        .eq("organization_id", organizationId)
        .eq("document_id", documentId)
        .order("sort_order", { ascending: true })
        .limit(Math.min(500, Math.max(1, Number(limit) || 200)));
      if (legacy.error) {
        if (missingTable(legacy.error)) return { ok: false, installed: false, passages: [] };
        throw legacy.error;
      }
      return { ok: true, passages: legacy.data || [] };
    }
    if (missingTable(error)) return { ok: false, installed: false, passages: [] };
    throw error;
  }
  return { ok: true, passages: data || [] };
}

export async function findDuplicateByHash(db, { organizationId, contentSha256, excludeId }) {
  if (!contentSha256) return null;
  let q = db
    .from("slab_ai_knowledge_documents")
    .select("id,title,status,version,file_name")
    .eq("organization_id", organizationId)
    .eq("content_sha256", contentSha256)
    .limit(5);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q;
  return data?.[0] || null;
}

export async function insertKnowledgeDocument(db, row) {
  const { data, error } = await db
    .from("slab_ai_knowledge_documents")
    .insert(row)
    .select("*")
    .limit(1);
  if (error) {
    if (missingTable(error)) return { ok: false, installed: false };
    throw error;
  }
  return { ok: true, document: data?.[0] };
}

export async function updateKnowledgeDocument(db, { organizationId, documentId, patch }) {
  const { data, error } = await db
    .from("slab_ai_knowledge_documents")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .select("*")
    .limit(1);
  if (error) {
    if (missingTable(error)) return { ok: false, installed: false };
    throw error;
  }
  if (!data?.[0]) return { ok: false, status: 404, error: "Document not found" };
  return { ok: true, document: data[0] };
}

/**
 * Replace passages for a document (idempotent reprocess).
 */
export async function replacePassages(db, { organizationId, documentId, passages }) {
  const { error: delErr } = await db
    .from("slab_ai_knowledge_passages")
    .delete()
    .eq("organization_id", organizationId)
    .eq("document_id", documentId);
  if (delErr) {
    if (missingTable(delErr)) return { ok: false, installed: false };
    throw delErr;
  }
  if (!passages?.length) return { ok: true, count: 0 };

  const rows = passages.map((p) => ({
    organization_id: organizationId,
    document_id: documentId,
    locator: p.locator,
    text: p.text,
    search_text: p.searchText || p.text?.toLowerCase() || "",
    keywords: p.keywords || [],
    sort_order: p.sortOrder,
    page_number: p.pageNumber ?? null,
    section_title: p.sectionTitle ?? null,
    extraction_origin: p.extractionOrigin || "native",
    embedding_status: "pending",
  }));

  // Insert in batches
  for (let i = 0; i < rows.length; i += 40) {
    const slice = rows.slice(i, i + 40);
    let { error } = await db.from("slab_ai_knowledge_passages").insert(slice);
    if (error && (String(error.message || "").includes("extraction_origin") || String(error.message || "").includes("embedding_status"))) {
      // Phase 3 schema without Phase 4 columns
      const legacy = slice.map(({ extraction_origin, embedding_status, ...rest }) => rest);
      ({ error } = await db.from("slab_ai_knowledge_passages").insert(legacy));
    }
    if (error) throw error;
  }
  return { ok: true, count: rows.length };
}

export async function getPassageWithContext(db, { organizationId, passageId }) {
  if (!isUuid(passageId)) return { ok: false, status: 400, error: "Invalid passage id" };
  const { data: passage, error } = await db
    .from("slab_ai_knowledge_passages")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", passageId)
    .maybeSingle();
  if (error) {
    if (missingTable(error)) return { ok: false, installed: false };
    throw error;
  }
  if (!passage) return { ok: false, status: 404, error: "Passage not found" };

  const { data: doc } = await db
    .from("slab_ai_knowledge_documents")
    .select("id,title,source_type,status,version,authority,manufacturer,machine_model,material,is_current,is_active")
    .eq("organization_id", organizationId)
    .eq("id", passage.document_id)
    .maybeSingle();

  // Surrounding passages
  const { data: neighbors } = await db
    .from("slab_ai_knowledge_passages")
    .select("id,locator,text,sort_order,page_number,section_title")
    .eq("organization_id", organizationId)
    .eq("document_id", passage.document_id)
    .gte("sort_order", Math.max(1, (passage.sort_order || 1) - 1))
    .lte("sort_order", (passage.sort_order || 1) + 1)
    .order("sort_order", { ascending: true });

  return {
    ok: true,
    passage,
    document: doc,
    neighbors: neighbors || [],
  };
}

export async function bumpRetrievalStats(db, { organizationId, documentIds }) {
  const ids = [...new Set((documentIds || []).filter(isUuid))];
  if (!ids.length) return;
  for (const id of ids) {
    const { data } = await db
      .from("slab_ai_knowledge_documents")
      .select("retrieval_count")
      .eq("organization_id", organizationId)
      .eq("id", id)
      .maybeSingle();
    const next = (Number(data?.retrieval_count) || 0) + 1;
    await db
      .from("slab_ai_knowledge_documents")
      .update({ retrieval_count: next, last_retrieved_at: new Date().toISOString() })
      .eq("organization_id", organizationId)
      .eq("id", id);
  }
}

export function toPublicDocumentDto(doc) {
  if (!doc) return null;
  return {
    id: doc.id,
    title: doc.title,
    sourceType: doc.source_type,
    status: doc.status || (doc.is_active ? "approved" : "archived"),
    version: doc.version || 1,
    sourceGroupId: doc.source_group_id || doc.id,
    isCurrent: doc.is_current !== false,
    isActive: doc.is_active !== false,
    authority: doc.authority || "general_reference",
    manufacturer: doc.manufacturer || null,
    material: doc.material || null,
    machineModel: doc.machine_model || null,
    toolingBrand: doc.tooling_brand || null,
    materialBrand: doc.material_brand || null,
    fileName: doc.file_name || null,
    mimeType: doc.mime_type || null,
    fileSizeBytes: doc.file_size_bytes != null ? Number(doc.file_size_bytes) : null,
    chunkCount: doc.chunk_count || 0,
    uploadedBy: doc.uploaded_by || null,
    approvedBy: doc.approved_by || null,
    approvedAt: doc.approved_at || null,
    rejectedBy: doc.rejected_by || null,
    rejectedAt: doc.rejected_at || null,
    reviewNote: doc.review_note || null,
    processingError: doc.processing_error || null,
    processedAt: doc.processed_at || null,
    extractionPreview: doc.extraction_preview || null,
    retrievalCount: doc.retrieval_count || 0,
    lastRetrievedAt: doc.last_retrieved_at || null,
    supersededBy: doc.superseded_by || null,
    contentSha256: doc.content_sha256 || null,
    extractionMethod: doc.extraction_method || "native",
    ocrStatus: doc.ocr_status || "not_required",
    ocrProvider: doc.ocr_provider || null,
    ocrPageCount: doc.ocr_page_count != null ? Number(doc.ocr_page_count) : null,
    ocrError: doc.ocr_error || null,
    embeddingStatus: doc.embedding_status || null,
    embeddingError: doc.embedding_error || null,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
  };
}

export function isRetrievableDocument(doc) {
  if (!doc) return false;
  const status = doc.status || (doc.is_active ? "approved" : "archived");
  return (
    RETRIEVABLE_STATUSES.has(status) &&
    doc.is_active !== false &&
    doc.is_current !== false
  );
}

export { SLAB_AI_KNOWLEDGE_BUCKET };
