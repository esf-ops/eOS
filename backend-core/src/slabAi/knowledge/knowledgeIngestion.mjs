/**
 * Knowledge ingestion orchestration:
 * validate → store → extract → chunk → review_required
 */
import { createHash, randomUUID } from "node:crypto";
import {
  SLAB_AI_KNOWLEDGE_BUCKET,
  buildKnowledgeStoragePath,
  validateKnowledgeFile,
  sniffFileKind,
  pickStr,
  isUuid,
} from "./knowledgeConstants.mjs";
import { extractKnowledgeText, normalizeExtractedText } from "./knowledgeExtraction.mjs";
import { chunkKnowledgeBlocks } from "./knowledgeChunking.mjs";
import {
  findDuplicateByHash,
  insertKnowledgeDocument,
  updateKnowledgeDocument,
  replacePassages,
  getKnowledgeDocument,
} from "./knowledgeRepository.mjs";
import { shouldInvokeOcr, createOcrProvider, getOcrConfig } from "./ocrProvider.mjs";
import { embedDocumentPassages } from "./embeddingService.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Upload bytes + create document row at status=uploaded, then process.
 */
export async function ingestKnowledgeUpload(args) {
  const {
    db,
    organizationId,
    userId,
    filename,
    mimeType,
    bytes,
    title,
    sourceType,
    authority,
    manufacturer,
    material,
    machineModel,
    toolingBrand,
    materialBrand,
    replaceOfDocumentId,
  } = args;

  const validation = validateKnowledgeFile({
    filename,
    mimeType,
    sizeBytes: bytes?.length || 0,
  });
  if (!validation.ok) return { ok: false, status: 400, error: validation.error };

  const sniff = sniffFileKind(bytes);
  if (validation.kind === "pdf" && sniff.kind !== "pdf") {
    return { ok: false, status: 400, error: "File content is not a valid PDF." };
  }
  if (validation.kind === "docx" && sniff.kind !== "docx_or_zip") {
    return { ok: false, status: 400, error: "File content is not a valid DOCX." };
  }

  const hash = sha256(bytes);
  const duplicate = await findDuplicateByHash(db, {
    organizationId,
    contentSha256: hash,
    excludeId: replaceOfDocumentId || null,
  });

  let version = 1;
  let sourceGroupId = null;
  let supersedeTarget = null;

  if (replaceOfDocumentId) {
    if (!isUuid(replaceOfDocumentId)) {
      return { ok: false, status: 400, error: "Invalid replace document id" };
    }
    const prev = await getKnowledgeDocument(db, { organizationId, documentId: replaceOfDocumentId });
    if (!prev.ok) return prev;
    sourceGroupId = prev.document.source_group_id || prev.document.id;
    version = (Number(prev.document.version) || 1) + 1;
    supersedeTarget = prev.document;
  }

  const documentId = randomUUID();
  if (!sourceGroupId) sourceGroupId = documentId;

  const storagePath = buildKnowledgeStoragePath({
    organizationId,
    documentId,
    version,
    filename,
  });

  const { error: upErr } = await db.storage.from(SLAB_AI_KNOWLEDGE_BUCKET).upload(storagePath, bytes, {
    contentType: validation.mime || mimeType || "application/octet-stream",
    upsert: false,
  });
  if (upErr) {
    const msg = String(upErr.message || upErr);
    if (/bucket|not found|does not exist/i.test(msg)) {
      return {
        ok: false,
        status: 503,
        error: "Knowledge storage bucket is not configured. Create private bucket eliteos-slab-ai-knowledge.",
      };
    }
    return { ok: false, status: 500, error: "Failed to store document." };
  }

  const row = {
    id: documentId,
    organization_id: organizationId,
    title: pickStr(title) || pickStr(filename).replace(/\.[^.]+$/, "") || "Untitled",
    source_type: pickStr(sourceType) || "other",
    authority: pickStr(authority) || "general_reference",
    manufacturer: pickStr(manufacturer) || null,
    material: pickStr(material) || null,
    machine_model: pickStr(machineModel) || null,
    tooling_brand: pickStr(toolingBrand) || null,
    material_brand: pickStr(materialBrand) || null,
    status: "uploaded",
    version,
    source_group_id: sourceGroupId,
    is_current: false, // not current until approved
    is_active: true,
    storage_bucket: SLAB_AI_KNOWLEDGE_BUCKET,
    storage_path: storagePath,
    file_name: pickStr(filename),
    mime_type: validation.mime || mimeType,
    file_size_bytes: bytes.length,
    content_sha256: hash,
    uploaded_by: userId,
    metadata: {
      replaceOfDocumentId: replaceOfDocumentId || null,
      duplicateWarning: duplicate
        ? { id: duplicate.id, title: duplicate.title, status: duplicate.status }
        : null,
    },
  };

  const inserted = await insertKnowledgeDocument(db, row);
  if (!inserted.ok) return inserted;

  const processed = await processKnowledgeDocument({
    db,
    organizationId,
    documentId,
    kind: validation.kind,
  });

  return {
    ok: true,
    document: processed.document || inserted.document,
    duplicateWarning: duplicate || null,
    processing: processed,
  };
}

/**
 * Extract + optional OCR + chunk + embed; set review_required or processing_failed.
 * Embedding failure does not fail the document if extraction succeeded.
 * Idempotent: replaces passages on each run.
 */
export async function processKnowledgeDocument({ db, organizationId, documentId, kind: kindHint, forceOcr = false }) {
  const got = await getKnowledgeDocument(db, { organizationId, documentId });
  if (!got.ok) return got;
  const doc = got.document;

  await updateKnowledgeDocument(db, {
    organizationId,
    documentId,
    patch: { status: "processing", processing_error: null },
  });

  try {
    if (!doc.storage_path || !doc.storage_bucket) {
      throw new Error("Missing storage path");
    }
    const { data: blob, error: dlErr } = await db.storage.from(doc.storage_bucket).download(doc.storage_path);
    if (dlErr || !blob) throw new Error("Unable to download stored file");
    const bytes = Buffer.from(await blob.arrayBuffer());

    let kind = kindHint;
    if (!kind) {
      const ext = String(doc.file_name || "").toLowerCase();
      if (ext.endsWith(".pdf")) kind = "pdf";
      else if (ext.endsWith(".docx")) kind = "docx";
      else if (ext.endsWith(".md") || ext.endsWith(".markdown")) kind = "markdown";
      else kind = "txt";
    }

    let extracted = await extractKnowledgeText(bytes, kind);
    let extractionMethod = "native";
    let ocrStatus = "not_required";
    let ocrProvider = null;
    let ocrPageCount = null;
    let ocrError = null;
    let origin = "native";

    // OCR path for scanned/image-only PDFs
    if (kind === "pdf") {
      const decision = shouldInvokeOcr({
        nativeText: extracted.ok ? extracted.plainText : "",
        pageCount: extracted.pageCount || null,
        forceOcr,
      });
      if (decision.ocr) {
        ocrStatus = "pending";
        try {
          const ocrCfg = getOcrConfig();
          const ocr = createOcrProvider();
          const ocrResult = await ocr.processDocument({
            bytes,
            filename: doc.file_name || "document.pdf",
            pageCountHint: extracted.pageCount || decision.pageCount || undefined,
          });
          const blocks = (ocrResult.pages || []).map((p) => ({
            text: p.text,
            page: p.pageNumber,
            sectionTitle: null,
          }));
          extracted = {
            ok: true,
            plainText: blocks.map((b) => b.text).join("\n\n"),
            blocks,
            pageCount: blocks.length,
          };
          extractionMethod = extracted.ok && decision.nonWs > 0 ? "mixed" : "ocr";
          ocrStatus = "complete";
          ocrProvider = ocrResult.provider || ocr.id;
          ocrPageCount = blocks.length;
          origin = "ocr";
        } catch (e) {
          ocrStatus = e.code === "OCR_PAGE_LIMIT" ? "skipped_limit" : "failed";
          ocrError = String(e.message || e).slice(0, 240);
          if (!extracted.ok) {
            await updateKnowledgeDocument(db, {
              organizationId,
              documentId,
              patch: {
                status: "processing_failed",
                processing_error: ocrError,
                processed_at: new Date().toISOString(),
                chunk_count: 0,
                extraction_method: "ocr",
                ocr_status: ocrStatus,
                ocr_error: ocrError,
              },
            });
            await replacePassages(db, { organizationId, documentId, passages: [] });
            return { ok: false, status: 422, error: ocrError, documentId, code: e.code };
          }
          // Native text existed but OCR failed — continue with native
          extractionMethod = "native";
        }
      }
    }

    if (!extracted.ok) {
      await updateKnowledgeDocument(db, {
        organizationId,
        documentId,
        patch: {
          status: "processing_failed",
          processing_error: extracted.error || "Extraction failed",
          processed_at: new Date().toISOString(),
          chunk_count: 0,
          ocr_status: ocrStatus,
          ocr_error: ocrError,
        },
      });
      await replacePassages(db, { organizationId, documentId, passages: [] });
      return { ok: false, status: 422, error: extracted.error, documentId };
    }

    const chunks = chunkKnowledgeBlocks(extracted.blocks || []).map((c) => ({
      ...c,
      extractionOrigin: origin,
    }));
    if (!chunks.length) {
      await updateKnowledgeDocument(db, {
        organizationId,
        documentId,
        patch: {
          status: "processing_failed",
          processing_error: "No passages produced from extracted text.",
          processed_at: new Date().toISOString(),
          chunk_count: 0,
        },
      });
      return { ok: false, status: 422, error: "No passages produced", documentId };
    }

    await replacePassages(db, { organizationId, documentId, passages: chunks });

    const previewPrefix =
      origin === "ocr" ? "[OCR extracted — verify technical values before approval]\n\n" : "";
    const preview = previewPrefix + normalizeExtractedText(extracted.plainText || "").slice(0, 4000);

    // Embeddings — best effort; do not fail review pipeline
    const embedResult = await embedDocumentPassages(db, { organizationId, documentId });
    const embeddingStatus = embedResult.installed === false ? "not_required" : embedResult.status || (embedResult.ok ? "complete" : "failed");

    const updated = await updateKnowledgeDocument(db, {
      organizationId,
      documentId,
      patch: {
        status: "review_required",
        processing_error: null,
        processed_at: new Date().toISOString(),
        chunk_count: chunks.length,
        extraction_preview: preview,
        extraction_method: extractionMethod,
        ocr_status: ocrStatus,
        ocr_provider: ocrProvider,
        ocr_page_count: ocrPageCount,
        ocr_error: ocrError,
        ocr_completed_at: ocrStatus === "complete" ? new Date().toISOString() : null,
        embedding_status: embeddingStatus,
        embedding_error: embedResult.ok ? null : embedResult.error || null,
        embedded_at: embedResult.ok ? new Date().toISOString() : null,
      },
    });

    return {
      ok: true,
      document: updated.document,
      chunkCount: chunks.length,
      extractionMethod,
      ocrStatus,
      embeddingStatus,
    };
  } catch (e) {
    const safe = "Processing failed. Retry after verifying the file.";
    await updateKnowledgeDocument(db, {
      organizationId,
      documentId,
      patch: {
        status: "processing_failed",
        processing_error: safe,
        processed_at: new Date().toISOString(),
      },
    }).catch(() => null);
    return { ok: false, status: 500, error: safe, detail: String(e?.message || e) };
  }
}
