/**
 * Embed passages after chunking. Failures do not corrupt extraction.
 */
import {
  createEmbeddingProvider,
  buildPassageEmbedText,
  vectorToPgLiteral,
  getEmbeddingConfig,
} from "./embeddingProvider.mjs";

/**
 * Embed all passages for a document. Idempotent — skips complete+current model.
 */
export async function embedDocumentPassages(db, { organizationId, documentId, force = false }) {
  const cfg = getEmbeddingConfig();
  let provider;
  try {
    provider = createEmbeddingProvider();
  } catch (e) {
    try {
      await db
        .from("slab_ai_knowledge_documents")
        .update({
          embedding_status: "failed",
          embedding_error: String(e.message || e).slice(0, 240),
        })
        .eq("organization_id", organizationId)
        .eq("id", documentId);
    } catch {
      /* schema may lack embedding columns */
    }
    return { ok: false, error: String(e.message || e), code: e.code || "EMBEDDING_UNAVAILABLE" };
  }

  const { data: doc } = await db
    .from("slab_ai_knowledge_documents")
    .select("id,title,manufacturer,machine_model")
    .eq("organization_id", organizationId)
    .eq("id", documentId)
    .maybeSingle();

  if (!doc) return { ok: false, error: "Document not found", status: 404 };

  let q = db
    .from("slab_ai_knowledge_passages")
    .select("id,text,section_title,embedding_status,embedding_model,embedding_version")
    .eq("organization_id", organizationId)
    .eq("document_id", documentId)
    .order("sort_order", { ascending: true });

  const { data: passages, error } = await q;
  if (error) {
    return { ok: false, error: error.message, installed: !String(error.message).includes("does not exist") };
  }

  const todo = (passages || []).filter((p) => {
    if (force) return true;
    if (p.embedding_status === "complete" && p.embedding_model === provider.model) return false;
    return true;
  });

  if (!todo.length) {
    await db
      .from("slab_ai_knowledge_documents")
      .update({ embedding_status: "complete", embedded_at: new Date().toISOString(), embedding_error: null })
      .eq("id", documentId)
      .eq("organization_id", organizationId);
    return { ok: true, embedded: 0, skipped: (passages || []).length };
  }

  let embedded = 0;
  let failed = 0;
  const batchSize = 16;
  for (let i = 0; i < todo.length; i += batchSize) {
    const slice = todo.slice(i, i + batchSize);
    const texts = slice.map((p) =>
      buildPassageEmbedText({
        title: doc.title,
        sectionTitle: p.section_title,
        text: p.text,
        manufacturer: doc.manufacturer,
        machineModel: doc.machine_model,
      })
    );
    try {
      const vectors = await provider.embedBatch(texts);
      for (let j = 0; j < slice.length; j++) {
        const vec = vectors[j];
        if (!vec?.length) {
          failed += 1;
          continue;
        }
        const { error: uErr } = await db
          .from("slab_ai_knowledge_passages")
          .update({
            embedding: vectorToPgLiteral(vec),
            embedding_model: provider.model,
            embedding_dimensions: provider.dimensions,
            embedding_version: provider.version,
            embedding_status: "complete",
            embedded_at: new Date().toISOString(),
            embedding_error: null,
          })
          .eq("organization_id", organizationId)
          .eq("id", slice[j].id);
        if (uErr) {
          // Column may not exist yet
          if (String(uErr.message || "").includes("does not exist") || String(uErr.message || "").includes("embedding")) {
            return { ok: false, installed: false, error: "Apply eliteos_slab_ai_hybrid_retrieval_v1.sql" };
          }
          failed += 1;
        } else {
          embedded += 1;
        }
      }
    } catch (e) {
      failed += slice.length;
      for (const p of slice) {
        try {
          await db
            .from("slab_ai_knowledge_passages")
            .update({
              embedding_status: "failed",
              embedding_error: String(e.message || e).slice(0, 200),
            })
            .eq("id", p.id)
            .eq("organization_id", organizationId);
        } catch {
          /* ignore per-passage status write failures */
        }
      }
    }
  }

  const status = failed && embedded ? "partial" : failed ? "failed" : "complete";
  await db
    .from("slab_ai_knowledge_documents")
    .update({
      embedding_status: status,
      embedding_error: failed ? `${failed} passage(s) failed to embed` : null,
      embedded_at: new Date().toISOString(),
    })
    .eq("id", documentId)
    .eq("organization_id", organizationId);

  return { ok: failed === 0, embedded, failed, status };
}

/**
 * Backfill embeddings for org passages missing current model vectors.
 */
export async function backfillOrganizationEmbeddings(db, { organizationId, limit = 50, dryRun = false, force = false }) {
  const cfg = getEmbeddingConfig();
  const lim = Math.min(200, Math.max(1, Number(limit) || 50));

  let q = db
    .from("slab_ai_knowledge_passages")
    .select("id,document_id,embedding_status,embedding_model")
    .eq("organization_id", organizationId)
    .limit(lim * 3);

  const { data: rows, error } = await q;
  if (error) {
    if (String(error.message || "").includes("does not exist")) {
      return { ok: false, installed: false, error: "Hybrid retrieval migration not applied." };
    }
    throw error;
  }

  const needDocIds = new Set();
  for (const r of rows || []) {
    if (force || r.embedding_status !== "complete" || r.embedding_model !== cfg.model) {
      needDocIds.add(r.document_id);
    }
  }
  const docIds = [...needDocIds].slice(0, lim);
  if (dryRun) {
    return { ok: true, dryRun: true, documentsNeedingEmbed: docIds.length, model: cfg.model };
  }

  const results = [];
  for (const documentId of docIds) {
    results.push(await embedDocumentPassages(db, { organizationId, documentId, force }));
  }
  return {
    ok: true,
    model: cfg.model,
    documentsProcessed: docIds.length,
    results,
  };
}
