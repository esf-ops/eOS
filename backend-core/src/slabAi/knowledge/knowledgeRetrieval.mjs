/**
 * Hybrid retrieval: authorized filters → lexical + semantic → RRF → boosts.
 * Semantic never bypasses org/approval/current/active/source-type gates.
 */
import { pickStr, RETRIEVABLE_STATUSES } from "./knowledgeConstants.mjs";
import { bumpRetrievalStats, isRetrievableDocument } from "./knowledgeRepository.mjs";
import {
  createEmbeddingProvider,
  getEmbeddingConfig,
  cosineSimilarity,
  vectorToPgLiteral,
} from "./embeddingProvider.mjs";
import {
  HYBRID_RANKING,
  extractExactIdentifiers,
  reciprocalRankFusion,
  applyHybridBoosts,
} from "./hybridRanking.mjs";

function tokenize(q) {
  const stop = new Set(["on", "the", "a", "an", "of", "to", "for", "and", "or", "is", "in", "at", "by", "with", "from"]);
  return pickStr(q)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !stop.has(t))
    .slice(0, 16);
}

/**
 * Controlled retrieval query from tool form context.
 */
export function buildRetrievalQuery({ query, manufacturer, machineModel, material, tooling, symptom, operation }) {
  const parts = [
    pickStr(manufacturer),
    pickStr(machineModel),
    pickStr(material),
    pickStr(tooling),
    pickStr(operation),
    pickStr(symptom),
    pickStr(query),
  ].filter(Boolean);
  return parts.join(" ").slice(0, 400);
}

/**
 * @param {object} args
 */
export async function searchApprovedKnowledge(args) {
  const {
    db,
    organizationId,
    query,
    sourceTypes,
    authorities,
    manufacturer,
    machineModel,
    material,
    limit = 6,
    debug = false,
    mode = "hybrid", // lexical | semantic | hybrid
  } = args;

  if (!organizationId) {
    return { ok: false, error: "Organization context required", status: 400, passages: [] };
  }

  const searchQuery = buildRetrievalQuery({
    query,
    manufacturer,
    machineModel,
    material,
  });
  const tokens = tokenize(searchQuery);
  const identifiers = extractExactIdentifiers(searchQuery);
  const lim = Math.min(HYBRID_RANKING.finalLimitMax, Math.max(1, Number(limit) || HYBRID_RANKING.finalLimitDefault));
  const filters = { manufacturer, machineModel, material, sourceTypes, authorities };

  const diagnostics = debug
    ? {
        query: searchQuery.slice(0, 240),
        tokens,
        identifiers,
        filters,
        mode,
        lexicalCandidates: [],
        semanticCandidates: [],
        degraded: null,
        candidateDocs: 0,
        selected: 0,
      }
    : null;

  // --- Authorized document set (must filter BEFORE scoring) ---
  const docsResult = await loadAuthorizedDocuments(db, {
    organizationId,
    sourceTypes,
    authorities,
    manufacturer,
    machineModel,
    material,
  });
  if (docsResult.installed === false) {
    return { ok: false, installed: false, error: "knowledge tables unavailable", status: 503, passages: [] };
  }
  const docs = docsResult.docs;
  if (diagnostics) diagnostics.candidateDocs = docs.length;
  if (!docs.length) {
    return { ok: true, installed: true, passages: [], documents: [], diagnostics, mode };
  }

  const docIds = docs.map((d) => d.id);
  const docMap = new Map(docs.map((d) => [d.id, d]));

  const { data: passages, error: pErr } = await db
    .from("slab_ai_knowledge_passages")
    .select(
      "id,document_id,locator,text,keywords,organization_id,sort_order,page_number,section_title,search_text,extraction_origin,embedding,embedding_status,embedding_model"
    )
    .eq("organization_id", organizationId)
    .in("document_id", docIds)
    .order("sort_order", { ascending: true })
    .limit(500);

  if (pErr) {
    // Fallback without embedding columns
    const legacy = await db
      .from("slab_ai_knowledge_passages")
      .select("id,document_id,locator,text,keywords,organization_id,sort_order,page_number,section_title,search_text")
      .eq("organization_id", organizationId)
      .in("document_id", docIds)
      .order("sort_order", { ascending: true })
      .limit(400);
    if (legacy.error) throw legacy.error;
    return finalizeLexicalOnly(legacy.data || [], docMap, tokens, identifiers, filters, lim, organizationId, db, diagnostics, "legacy_schema");
  }

  const authorizedPassages = (passages || []).filter((p) => {
    const doc = docMap.get(p.document_id);
    return doc && isRetrievableDocument(doc);
  });

  // --- Lexical channel ---
  const lexicalRanked = rankLexical(authorizedPassages, docMap, tokens).slice(0, HYBRID_RANKING.lexicalCandidateLimit);
  if (diagnostics) {
    diagnostics.lexicalCandidates = lexicalRanked.map((r, i) => ({
      passageId: r.id,
      rank: i + 1,
      score: r.score,
    }));
  }

  if (mode === "lexical") {
    return finalizeFromRanked(lexicalRanked, docMap, identifiers, filters, lim, organizationId, db, diagnostics, "lexical");
  }

  // --- Semantic channel ---
  let semanticRanked = [];
  let semanticDegraded = null;
  try {
    semanticRanked = await rankSemantic({
      db,
      organizationId,
      query: searchQuery,
      sourceTypes,
      authorizedPassages,
      docMap,
      limit: HYBRID_RANKING.semanticCandidateLimit,
    });
  } catch (e) {
    semanticDegraded = String(e.message || e).slice(0, 160);
    if (diagnostics) diagnostics.degraded = { semantic: semanticDegraded };
  }

  if (diagnostics) {
    diagnostics.semanticCandidates = semanticRanked.map((r, i) => ({
      passageId: r.id,
      rank: i + 1,
      score: r.score,
      distance: r.distance,
    }));
  }

  if (mode === "semantic") {
    if (!semanticRanked.length) {
      return finalizeFromRanked(lexicalRanked, docMap, identifiers, filters, lim, organizationId, db, diagnostics, "lexical_fallback");
    }
    return finalizeFromRanked(semanticRanked, docMap, identifiers, filters, lim, organizationId, db, diagnostics, "semantic");
  }

  // --- Hybrid RRF ---
  if (!semanticRanked.length) {
    return finalizeFromRanked(lexicalRanked, docMap, identifiers, filters, lim, organizationId, db, diagnostics, "hybrid_lexical_only");
  }

  const rrfItems = [];
  lexicalRanked.forEach((r, i) => rrfItems.push({ id: r.id, rank: i + 1, channel: "lexical" }));
  semanticRanked.forEach((r, i) => rrfItems.push({ id: r.id, rank: i + 1, channel: "semantic" }));
  const fused = reciprocalRankFusion(rrfItems);

  const byId = new Map(authorizedPassages.map((p) => [p.id, p]));
  const merged = [...fused.entries()]
    .map(([id, meta]) => {
      const p = byId.get(id);
      if (!p) return null;
      const doc = docMap.get(p.document_id);
      if (!doc) return null;
      const boosted = applyHybridBoosts({
        rrfScore: meta.score,
        passageText: p.text,
        title: doc.title,
        authority: doc.authority,
        manufacturer: doc.manufacturer,
        machineModel: doc.machine_model,
        material: doc.material,
        identifiers,
        filters,
      });
      return {
        id,
        passage: p,
        doc,
        score: boosted.score,
        reasons: [
          ...(meta.channels.includes("lexical") ? ["lexical candidate"] : []),
          ...(meta.channels.includes("semantic") ? ["semantic candidate"] : []),
          ...boosted.reasons,
        ],
        lexicalRank: meta.lexicalRank,
        semanticRank: meta.semanticRank,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, lim);

  return emitResults(merged, lim, organizationId, db, diagnostics, "hybrid");
}

async function loadAuthorizedDocuments(db, opts) {
  let docQ = db
    .from("slab_ai_knowledge_documents")
    .select(
      "id,title,source_type,source_uri,manufacturer,material,machine_model,metadata,organization_id,status,is_current,is_active,authority,version,tooling_brand,material_brand"
    )
    .eq("organization_id", opts.organizationId)
    .eq("is_active", true)
    .eq("status", "approved")
    .eq("is_current", true)
    .limit(120);

  if (opts.sourceTypes?.length) docQ = docQ.in("source_type", opts.sourceTypes.slice(0, 10));
  if (opts.authorities?.length) docQ = docQ.in("authority", opts.authorities.slice(0, 6));
  if (pickStr(opts.manufacturer)) docQ = docQ.ilike("manufacturer", `%${pickStr(opts.manufacturer).slice(0, 60)}%`);
  if (pickStr(opts.machineModel)) docQ = docQ.ilike("machine_model", `%${pickStr(opts.machineModel).slice(0, 60)}%`);
  if (pickStr(opts.material)) docQ = docQ.ilike("material", `%${pickStr(opts.material).slice(0, 60)}%`);

  const { data, error } = await docQ;
  if (error) {
    const msg = String(error.message || "").toLowerCase();
    if (msg.includes("does not exist") || msg.includes("column")) {
      const legacy = await db
        .from("slab_ai_knowledge_documents")
        .select("id,title,source_type,source_uri,manufacturer,material,machine_model,metadata,organization_id,is_active")
        .eq("organization_id", opts.organizationId)
        .eq("is_active", true)
        .limit(80);
      if (legacy.error) {
        if (String(legacy.error.message || "").toLowerCase().includes("does not exist")) {
          return { installed: false, docs: [] };
        }
        throw legacy.error;
      }
      return {
        installed: true,
        docs: (legacy.data || []).map((d) => ({
          ...d,
          status: "approved",
          is_current: true,
          authority: "general_reference",
          version: 1,
        })),
      };
    }
    throw error;
  }
  return { installed: true, docs: (data || []).filter(isRetrievableDocument) };
}

function rankLexical(passages, docMap, tokens) {
  return passages
    .map((p) => {
      const doc = docMap.get(p.document_id);
      if (!doc) return null;
      const hay = `${doc.title} ${doc.manufacturer || ""} ${doc.material || ""} ${doc.machine_model || ""} ${p.text} ${p.search_text || ""} ${(p.keywords || []).join(" ")} ${p.section_title || ""}`.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        const re = new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`, "i");
        if (re.test(hay)) score += 1;
        if ((p.keywords || []).some((k) => String(k).toLowerCase() === t)) score += 2;
        if (String(doc.manufacturer || "").toLowerCase().includes(t)) score += 2;
        if (String(doc.machine_model || "").toLowerCase().includes(t)) score += 2;
      }
      if (!tokens.length) score = 1;
      if (score <= 0) return null;
      return { id: p.id, passage: p, doc, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

async function rankSemantic({ db, organizationId, query, sourceTypes, authorizedPassages, docMap, limit }) {
  const cfg = getEmbeddingConfig();
  let queryVec;
  try {
    const provider = createEmbeddingProvider();
    queryVec = await provider.embedText(query || " ");
  } catch {
    return [];
  }

  // Prefer RPC (filters approval in SQL)
  try {
    const { data, error } = await db.rpc("slab_ai_match_knowledge_passages", {
      p_organization_id: organizationId,
      p_query_embedding: vectorToPgLiteral(queryVec),
      p_match_count: limit,
      p_source_types: sourceTypes?.length ? sourceTypes : null,
      p_embedding_model: cfg.model,
    });
    if (!error && Array.isArray(data)) {
      const allowed = new Set(authorizedPassages.map((p) => p.id));
      return data
        .filter((row) => allowed.has(row.passage_id))
        .map((row) => {
          const passage = authorizedPassages.find((p) => p.id === row.passage_id);
          const doc = docMap.get(row.document_id);
          if (!passage || !doc) return null;
          return {
            id: row.passage_id,
            passage,
            doc,
            score: 1 / (1 + Number(row.distance) || 0),
            distance: Number(row.distance),
          };
        })
        .filter(Boolean);
    }
  } catch {
    /* fall through to in-memory */
  }

  // In-memory cosine over already-authorized passages that have embeddings
  const scored = [];
  for (const p of authorizedPassages) {
    if (p.embedding_status !== "complete" || !p.embedding) continue;
    if (p.embedding_model && p.embedding_model !== cfg.model) continue;
    const vec = parseEmbedding(p.embedding);
    if (!vec) continue;
    const sim = cosineSimilarity(queryVec, vec);
    scored.push({
      id: p.id,
      passage: p,
      doc: docMap.get(p.document_id),
      score: sim,
      distance: 1 - sim,
    });
  }
  return scored.filter((s) => s.doc).sort((a, b) => b.score - a.score).slice(0, limit);
}

function parseEmbedding(raw) {
  if (Array.isArray(raw)) return raw.map(Number);
  if (typeof raw === "string") {
    try {
      const cleaned = raw.replace(/^\[/, "").replace(/\]$/, "");
      return cleaned.split(",").map((x) => Number(x.trim()));
    } catch {
      return null;
    }
  }
  return null;
}

function finalizeLexicalOnly(passages, docMap, tokens, identifiers, filters, lim, organizationId, db, diagnostics, mode) {
  const ranked = rankLexical(passages, docMap, tokens);
  return finalizeFromRanked(ranked, docMap, identifiers, filters, lim, organizationId, db, diagnostics, mode);
}

function finalizeFromRanked(ranked, docMap, identifiers, filters, lim, organizationId, db, diagnostics, mode) {
  const merged = ranked.slice(0, lim).map((r, i) => {
    const boosted = applyHybridBoosts({
      rrfScore: r.score,
      passageText: r.passage.text,
      title: r.doc.title,
      authority: r.doc.authority,
      manufacturer: r.doc.manufacturer,
      machineModel: r.doc.machine_model,
      material: r.doc.material,
      identifiers,
      filters,
    });
    return {
      id: r.id,
      passage: r.passage,
      doc: r.doc,
      score: boosted.score,
      reasons: boosted.reasons,
      lexicalRank: mode.includes("lexical") || mode === "hybrid" ? i + 1 : null,
      semanticRank: mode.includes("semantic") ? i + 1 : null,
    };
  });
  // Re-sort after boosts for lexical-only path
  merged.sort((a, b) => b.score - a.score);
  return emitResults(merged.slice(0, lim), lim, organizationId, db, diagnostics, mode);
}

function emitResults(merged, lim, organizationId, db, diagnostics, mode) {
  const top = merged.slice(0, lim);
  if (diagnostics) {
    diagnostics.selected = top.length;
    diagnostics.sourceIds = top.map((t) => t.doc.id);
    diagnostics.mode = mode;
  }

  void bumpRetrievalStats(db, {
    organizationId,
    documentIds: top.map((t) => t.doc.id),
  });

  const passages = top.map((t) => ({
    id: t.passage.id,
    text: String(t.passage.text || "").slice(0, 2500),
    locator:
      pickStr(t.passage.locator) ||
      [t.passage.page_number != null ? `page ${t.passage.page_number}` : null, t.passage.section_title]
        .filter(Boolean)
        .join(" · ") ||
      null,
    pageNumber: t.passage.page_number ?? null,
    sectionTitle: t.passage.section_title || null,
    relevance: Math.round(t.score * 1000) / 1000,
    lexicalRank: t.lexicalRank,
    semanticRank: t.semanticRank,
    retrievalReasons: t.reasons,
    extractionOrigin: t.passage.extraction_origin || "native",
    source: {
      id: t.doc.id,
      title: t.doc.title,
      sourceType: t.doc.source_type,
      sourceUri: t.doc.source_uri || null,
      organizationId: t.doc.organization_id,
      manufacturer: t.doc.manufacturer || null,
      material: t.doc.material || null,
      machineModel: t.doc.machine_model || null,
      authority: t.doc.authority || "general_reference",
      version: t.doc.version || 1,
      metadata: t.doc.metadata || {},
    },
  }));

  return {
    ok: true,
    installed: true,
    mode,
    passages,
    documents: [...new Map(top.map((t) => [t.doc.id, t.doc])).values()].map((d) => ({
      id: d.id,
      title: d.title,
      sourceType: d.source_type,
      authority: d.authority || "general_reference",
      version: d.version || 1,
      manufacturer: d.manufacturer || null,
    })),
    diagnostics,
  };
}

export { RETRIEVABLE_STATUSES, HYBRID_RANKING };
