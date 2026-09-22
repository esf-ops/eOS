import express from "express";
import { logAction } from "../auth/auditLog.js";
import { requireRole } from "../auth/authMiddleware.js";
import { resolveOrganizationContext } from "../organizations/organizationContext.js";
import {
  canAdministerKnowledge,
  KNOWLEDGE_SOURCE_TYPES,
  KNOWLEDGE_AUTHORITIES,
  KNOWLEDGE_SOURCE_TYPE_LABELS,
  isUuid,
  pickStr,
} from "./knowledge/knowledgeConstants.mjs";
import { ingestKnowledgeUpload, processKnowledgeDocument } from "./knowledge/knowledgeIngestion.mjs";
import { backfillOrganizationEmbeddings } from "./knowledge/embeddingService.mjs";
import { getEmbeddingConfig } from "./knowledge/embeddingProvider.mjs";
import { getOcrConfig } from "./knowledge/ocrProvider.mjs";
import { HYBRID_RANKING } from "./knowledge/hybridRanking.mjs";
import {
  approveKnowledgeDocument,
  rejectKnowledgeDocument,
  archiveKnowledgeDocument,
  restoreKnowledgeDocument,
  deleteKnowledgeDocument,
} from "./knowledge/knowledgeApproval.mjs";
import {
  listKnowledgeDocuments,
  getKnowledgeDocument,
  listPassagesForDocument,
  getPassageWithContext,
  toPublicDocumentDto,
  SLAB_AI_KNOWLEDGE_BUCKET,
} from "./knowledge/knowledgeRepository.mjs";
import { searchApprovedKnowledge } from "./knowledge/knowledgeRetrieval.mjs";

const HEAD = "slab_ai";
const jsonParser = express.json({ limit: "35mb" });
const jsonSmall = express.json({ limit: "256kb" });

function jsonNoStore(res) {
  res.setHeader("Cache-Control", "no-store");
}

/**
 * @param {import("express").Express} app
 * @param {{ requireAuth: Function, requireHeadAccess: Function, getSupabase: Function }} deps
 */
export function attachSlabAiKnowledgeRoutes(app, { requireAuth, requireHeadAccess, getSupabase }) {
  const headAccess = requireHeadAccess(HEAD, { getSupabase });
  const guard = [requireAuth(), headAccess];
  const adminGuard = [
    requireAuth(),
    headAccess,
    requireRole(["admin", "super_admin", "executive"]),
  ];
  const db = () => getSupabase();

  async function orgId(req) {
    const ctx = await resolveOrganizationContext({ req, supabase: db(), mode: "authenticated" });
    return ctx.organizationId || req.user?.organization_id || null;
  }

  app.get("/api/slab-ai/knowledge/meta", ...guard, async (req, res) => {
    jsonNoStore(res);
    res.json({
      ok: true,
      canAdministerKnowledge: canAdministerKnowledge(req.user),
      sourceTypes: KNOWLEDGE_SOURCE_TYPES.map((id) => ({
        id,
        label: KNOWLEDGE_SOURCE_TYPE_LABELS[id] || id,
      })),
      authorities: KNOWLEDGE_AUTHORITIES,
      bucket: SLAB_AI_KNOWLEDGE_BUCKET,
    });
  });

  app.get("/api/slab-ai/knowledge/documents", ...adminGuard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });
      const result = await listKnowledgeDocuments(db(), {
        organizationId,
        status: pickStr(req.query.status) || undefined,
        limit: req.query.limit,
      });
      if (result.installed === false) {
        return res.status(503).json({
          ok: false,
          installed: false,
          error: "Apply eliteos_slab_ai_v1.sql and eliteos_slab_ai_knowledge_hub_v1.sql",
        });
      }
      res.json({ ok: true, rows: (result.rows || []).map(toPublicDocumentDto) });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/slab-ai/knowledge/documents/:id", ...adminGuard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });
      const result = await getKnowledgeDocument(db(), {
        organizationId,
        documentId: pickStr(req.params.id),
      });
      if (result.installed === false) return res.status(503).json(result);
      if (!result.ok) return res.status(result.status || 404).json(result);
      const passages = await listPassagesForDocument(db(), {
        organizationId,
        documentId: result.document.id,
        limit: 50,
      });
      res.json({
        ok: true,
        document: toPublicDocumentDto(result.document),
        passages: passages.passages || [],
        passagePreviewCount: (passages.passages || []).length,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  /**
   * Upload: JSON { filename, mimeType, fileBase64, title, sourceType, ... }
   */
  app.post("/api/slab-ai/knowledge/documents/upload", ...adminGuard, jsonParser, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });
      const body = req.body || {};
      const b64 = pickStr(body.fileBase64 || body.contentBase64);
      if (!b64) return res.status(400).json({ ok: false, error: "fileBase64 is required" });
      let bytes;
      try {
        bytes = Buffer.from(b64, "base64");
      } catch {
        return res.status(400).json({ ok: false, error: "Invalid base64 payload" });
      }

      const result = await ingestKnowledgeUpload({
        db: db(),
        organizationId,
        userId: req.user.id,
        filename: pickStr(body.filename || body.fileName),
        mimeType: pickStr(body.mimeType),
        bytes,
        title: body.title,
        sourceType: body.sourceType,
        authority: body.authority,
        manufacturer: body.manufacturer,
        material: body.material,
        machineModel: body.machineModel,
        toolingBrand: body.toolingBrand,
        materialBrand: body.materialBrand,
        replaceOfDocumentId: body.replaceOfDocumentId || body.replaceOf || null,
      });

      if (!result.ok) {
        return res.status(result.status || 400).json(result);
      }

      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "slab_ai_knowledge_upload",
        entityType: "slab_ai_knowledge_document",
        entityId: result.document?.id,
        entityLabel: result.document?.title,
        metadata: {
          status: result.document?.status,
          duplicate: Boolean(result.duplicateWarning),
          mode: "write_admin",
        },
        req,
      });

      res.status(201).json({
        ok: true,
        document: toPublicDocumentDto(result.document),
        duplicateWarning: result.duplicateWarning,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/slab-ai/knowledge/documents/:id/reprocess", ...adminGuard, jsonSmall, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });
      const id = pickStr(req.params.id);
      const forceOcr = Boolean(req.body?.forceOcr) || pickStr(req.query.forceOcr) === "1";
      const result = await processKnowledgeDocument({
        db: db(),
        organizationId,
        documentId: id,
        forceOcr,
      });
      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "slab_ai_knowledge_reprocess",
        entityType: "slab_ai_knowledge_document",
        entityId: id,
        metadata: { ok: result.ok, forceOcr, ocrStatus: result.ocrStatus || null },
        req,
      });
      if (!result.ok) return res.status(result.status || 422).json(result);
      res.json({ ok: true, document: toPublicDocumentDto(result.document), processing: result });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/slab-ai/knowledge/embeddings/backfill", ...adminGuard, jsonSmall, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });
      const result = await backfillOrganizationEmbeddings(db(), {
        organizationId,
        limit: req.body?.limit,
        dryRun: Boolean(req.body?.dryRun),
        force: Boolean(req.body?.force),
      });
      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "slab_ai_knowledge_embedding_backfill",
        entityType: "slab_ai_knowledge",
        entityId: null,
        metadata: {
          dry_run: Boolean(req.body?.dryRun),
          documents: result.documentsProcessed || result.documentsNeedingEmbed || 0,
        },
        req,
      });
      if (!result.ok) return res.status(result.installed === false ? 503 : 500).json(result);
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.get("/api/slab-ai/knowledge/retrieval-config", ...adminGuard, async (_req, res) => {
    jsonNoStore(res);
    res.json({
      ok: true,
      embedding: getEmbeddingConfig(),
      ocr: { ...getOcrConfig(), apiKey: undefined },
      ranking: HYBRID_RANKING,
    });
  });

  app.post("/api/slab-ai/knowledge/documents/:id/approve", ...adminGuard, jsonSmall, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });
      const result = await approveKnowledgeDocument(db(), {
        organizationId,
        documentId: pickStr(req.params.id),
        userId: req.user.id,
        note: req.body?.note,
      });
      if (!result.ok) return res.status(result.status || 400).json(result);
      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "slab_ai_knowledge_approve",
        entityType: "slab_ai_knowledge_document",
        entityId: result.document.id,
        entityLabel: result.document.title,
        afterJson: { status: "approved", version: result.document.version },
        req,
      });
      res.json({ ok: true, document: toPublicDocumentDto(result.document) });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/slab-ai/knowledge/documents/:id/reject", ...adminGuard, jsonSmall, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });
      const result = await rejectKnowledgeDocument(db(), {
        organizationId,
        documentId: pickStr(req.params.id),
        userId: req.user.id,
        note: req.body?.note,
      });
      if (!result.ok) return res.status(result.status || 400).json(result);
      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "slab_ai_knowledge_reject",
        entityType: "slab_ai_knowledge_document",
        entityId: result.document.id,
        req,
      });
      res.json({ ok: true, document: toPublicDocumentDto(result.document) });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/slab-ai/knowledge/documents/:id/archive", ...adminGuard, jsonSmall, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });
      const result = await archiveKnowledgeDocument(db(), {
        organizationId,
        documentId: pickStr(req.params.id),
        userId: req.user.id,
        note: req.body?.note,
      });
      if (!result.ok) return res.status(result.status || 400).json(result);
      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "slab_ai_knowledge_archive",
        entityType: "slab_ai_knowledge_document",
        entityId: result.document.id,
        req,
      });
      res.json({ ok: true, document: toPublicDocumentDto(result.document) });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.post("/api/slab-ai/knowledge/documents/:id/restore", ...adminGuard, jsonSmall, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });
      const result = await restoreKnowledgeDocument(db(), {
        organizationId,
        documentId: pickStr(req.params.id),
        userId: req.user.id,
      });
      if (!result.ok) return res.status(result.status || 400).json(result);
      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "slab_ai_knowledge_restore",
        entityType: "slab_ai_knowledge_document",
        entityId: result.document.id,
        req,
      });
      res.json({ ok: true, document: toPublicDocumentDto(result.document) });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  app.delete("/api/slab-ai/knowledge/documents/:id", ...adminGuard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });
      const id = pickStr(req.params.id);
      const result = await deleteKnowledgeDocument(db(), { organizationId, documentId: id });
      if (!result.ok) return res.status(result.status || 400).json(result);
      await logAction({
        user: req.user,
        head: HEAD,
        actionType: "slab_ai_knowledge_delete",
        entityType: "slab_ai_knowledge_document",
        entityId: id,
        req,
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  /** Passage preview for AI citations — any slab_ai user; org-scoped; approved docs only for non-admins */
  app.get("/api/slab-ai/knowledge/passages/:id", ...guard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });
      const result = await getPassageWithContext(db(), {
        organizationId,
        passageId: pickStr(req.params.id),
      });
      if (result.installed === false) return res.status(503).json(result);
      if (!result.ok) return res.status(result.status || 404).json(result);

      const admin = canAdministerKnowledge(req.user);
      const doc = result.document;
      const retrievable =
        doc &&
        (doc.status === "approved" || (!doc.status && doc.is_active)) &&
        doc.is_current !== false;

      if (!admin && !retrievable) {
        return res.status(403).json({ ok: false, error: "Passage is not available." });
      }

      res.json({
        ok: true,
        passage: {
          id: result.passage.id,
          text: result.passage.text,
          locator: result.passage.locator,
          pageNumber: result.passage.page_number ?? null,
          sectionTitle: result.passage.section_title || null,
          sortOrder: result.passage.sort_order,
        },
        document: doc
          ? {
              id: doc.id,
              title: doc.title,
              sourceType: doc.source_type,
              version: doc.version || 1,
              authority: doc.authority || "general_reference",
              manufacturer: doc.manufacturer || null,
              status: doc.status,
            }
          : null,
        neighbors: (result.neighbors || []).map((n) => ({
          id: n.id,
          locator: n.locator,
          text: String(n.text || "").slice(0, 800),
          sortOrder: n.sort_order,
        })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  /** Admin retrieval diagnostics */
  app.get("/api/slab-ai/knowledge/search-debug", ...adminGuard, async (req, res) => {
    try {
      jsonNoStore(res);
      const organizationId = await orgId(req);
      if (!organizationId) return res.status(400).json({ ok: false, error: "Organization context required." });
      const result = await searchApprovedKnowledge({
        db: db(),
        organizationId,
        query: pickStr(req.query.q),
        sourceTypes: pickStr(req.query.sourceTypes)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        manufacturer: pickStr(req.query.manufacturer) || undefined,
        machineModel: pickStr(req.query.machineModel) || undefined,
        material: pickStr(req.query.material) || undefined,
        limit: req.query.limit,
        debug: true,
        mode: pickStr(req.query.mode) || "hybrid",
      });
      res.json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message || e) });
    }
  });

  console.log("[slab-ai] knowledge hub routes mounted");
}
