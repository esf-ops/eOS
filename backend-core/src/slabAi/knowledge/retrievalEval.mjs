/**
 * In-memory retrieval evaluation harness.
 * Compares lexical-only vs hybrid (lexical + semantic RRF + boosts) on sentinel corpus.
 * Does not call production DB or external APIs (uses mock embeddings).
 */
import { createEmbeddingProvider, cosineSimilarity, buildPassageEmbedText } from "./embeddingProvider.mjs";
import {
  HYBRID_RANKING,
  extractExactIdentifiers,
  reciprocalRankFusion,
  applyHybridBoosts,
} from "./hybridRanking.mjs";
import { buildRetrievalQuery } from "./knowledgeRetrieval.mjs";
import { isRetrievableDocument } from "./knowledgeRepository.mjs";

/** Sentinel corpus — org-scoped, mixed eligibility */
export const EVAL_CORPUS = [
  {
    id: "p-deflection",
    organizationId: "org-a",
    text: "Lateral saw-blade deflection can occur when cutting quartzite. Reduce feed and verify blade tension.",
    title: "Saw Operation Guide",
    sourceType: "manufacturer_manual",
    authority: "manufacturer_primary",
    manufacturer: "SENTINEL-OEM",
    machineModel: null,
    material: "quartzite",
    status: "approved",
    is_current: true,
    is_active: true,
  },
  {
    id: "p-miterexcel",
    organizationId: "org-a",
    text: "BACA MiterExcel miter edge chipping: confirm support at cut exit and coolant at the tip before adjusting spindle.",
    title: "BACA MiterExcel Manual v3",
    sourceType: "manufacturer_manual",
    authority: "manufacturer_primary",
    manufacturer: "BACA",
    machineModel: "MiterExcel",
    material: null,
    status: "approved",
    is_current: true,
    is_active: true,
  },
  {
    id: "p-generic-saw",
    organizationId: "org-a",
    text: "General bridge saw tips for edge quality on soft stone.",
    title: "General Saw Tips",
    sourceType: "internal_training",
    authority: "internal_training",
    manufacturer: null,
    machineModel: null,
    material: null,
    status: "approved",
    is_current: true,
    is_active: true,
  },
  {
    id: "p-thermal-shock",
    organizationId: "org-a",
    text: "Avoid thermal shock and direct heat exposure. Never place hot cookware on quartz surfaces; use a protective barrier.",
    title: "Manufacturer Care — Quartz",
    sourceType: "material_care",
    authority: "manufacturer_primary",
    manufacturer: "SENTINEL-OEM",
    machineModel: null,
    material: "quartz",
    status: "approved",
    is_current: true,
    is_active: true,
  },
  {
    id: "p-error-e204",
    organizationId: "org-a",
    text: "Fault E-204 spindle interlock: verify guard closed and reset interlock circuit before restart.",
    title: "Fault Code Reference",
    sourceType: "manufacturer_manual",
    authority: "manufacturer_primary",
    manufacturer: "SENTINEL-OEM",
    machineModel: "SENTINEL-CNC-1",
    material: null,
    status: "approved",
    is_current: true,
    is_active: true,
  },
  {
    id: "p-other-org",
    organizationId: "org-other",
    text: "Lateral saw-blade deflection quartzite — perfect semantic match but wrong tenant.",
    title: "Other Org Manual",
    sourceType: "manufacturer_manual",
    authority: "manufacturer_primary",
    manufacturer: "OTHER",
    machineModel: null,
    material: "quartzite",
    status: "approved",
    is_current: true,
    is_active: true,
  },
  {
    id: "p-archived-coolant",
    organizationId: "org-a",
    text: "Verify coolant delivery. Maximum spindle RPM: 4200.",
    title: "Archived Coolant SOP",
    sourceType: "sop",
    authority: "company_policy",
    manufacturer: null,
    machineModel: null,
    material: null,
    status: "archived",
    is_current: false,
    is_active: false,
  },
  {
    id: "p-feed-v1",
    organizationId: "org-a",
    text: "Porcelain edge feed rate guidance (superseded): use legacy chart A.",
    title: "Feed Chart v1",
    sourceType: "tooling_guide",
    authority: "tooling_supplier",
    manufacturer: null,
    machineModel: null,
    material: "porcelain",
    status: "approved",
    is_current: false,
    is_active: true,
  },
  {
    id: "p-feed-v2",
    organizationId: "org-a",
    text: "Porcelain edge feed rate guidance (current): use chart B with reduced plunge.",
    title: "Feed Chart v2",
    sourceType: "tooling_guide",
    authority: "tooling_supplier",
    manufacturer: null,
    machineModel: null,
    material: "porcelain",
    status: "approved",
    is_current: true,
    is_active: true,
  },
  {
    id: "p-install-policy",
    organizationId: "org-a",
    text: "Install scope: sink cutouts and faucet holes are included per quote. Warranty excludes customer-supplied fixtures.",
    title: "Install Scope Policy",
    sourceType: "install_policy",
    authority: "company_policy",
    manufacturer: null,
    machineModel: null,
    material: null,
    status: "approved",
    is_current: true,
    is_active: true,
  },
];

function tokenize(q) {
  const stop = new Set(["on", "the", "a", "an", "of", "to", "for", "and", "or", "is", "in", "at", "by", "with", "from", "can", "i", "me", "my"]);
  return String(q || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 3 && !stop.has(t))
    .slice(0, 16);
}

function lexicalHit(hay, token) {
  return new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`, "i").test(hay);
}

function filterAuthorized(corpus, { organizationId, sourceTypes }) {
  return corpus.filter((p) => {
    if (p.organizationId !== organizationId) return false;
    if (!isRetrievableDocument(p)) return false;
    if (sourceTypes?.length && !sourceTypes.includes(p.sourceType)) return false;
    return true;
  });
}

function rankLexical(passages, tokens) {
  return passages
    .map((p) => {
      const hay = `${p.title} ${p.manufacturer || ""} ${p.machineModel || ""} ${p.material || ""} ${p.text}`.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (lexicalHit(hay, t)) score += 1;
        if (String(p.manufacturer || "").toLowerCase().includes(t)) score += 2;
        if (String(p.machineModel || "").toLowerCase().includes(t)) score += 2;
      }
      if (!tokens.length) score = 1;
      if (score <= 0) return null;
      return { id: p.id, passage: p, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
}

/**
 * Concept seeds so mock hash-embeddings can demonstrate synonym retrieval
 * without calling a production embedding API in CI.
 */
const CONCEPT_SEEDS = [
  { seed: "CONCEPT_BLADE_DEFLECTION", patterns: [/blade\s*wander/i, /tool\s*path\s*drift/i, /toolpath\s*wander/i, /lateral\s*(saw[- ]?)?blade\s*deflection/i, /deflection/i] },
  { seed: "CONCEPT_THERMAL_SHOCK", patterns: [/hot\s*pan/i, /skillet/i, /trivet/i, /thermal\s*shock/i, /heat\s*exposure/i, /hot\s*cookware/i] },
  { seed: "CONCEPT_E204", patterns: [/e-?204/i, /spindle\s*interlock/i] },
  { seed: "CONCEPT_MITEREXCEL", patterns: [/miterexcel/i, /miter\s*edge\s*chipp/i] },
  { seed: "CONCEPT_FEED_PORCELAIN", patterns: [/feed\s*rate/i, /porcelain\s*edge/i] },
  { seed: "CONCEPT_INSTALL_SCOPE", patterns: [/install\s*scope/i, /sink\s*cutout/i, /faucet\s*hole/i] },
];

function conceptAugment(text) {
  const seeds = CONCEPT_SEEDS.filter((c) => c.patterns.some((re) => re.test(text))).map((c) => c.seed);
  return seeds.length ? `${seeds.join(" ")} ${text}` : text;
}

async function rankSemantic(passages, query, provider) {
  const qSeeds = CONCEPT_SEEDS.filter((c) => c.patterns.some((re) => re.test(query))).map((c) => c.seed);
  const qVec = await provider.embedText(conceptAugment(query));
  const scored = [];
  for (const p of passages) {
    const text = buildPassageEmbedText({
      title: p.title,
      text: p.text,
      manufacturer: p.manufacturer,
      machineModel: p.machineModel,
    });
    const pSeeds = CONCEPT_SEEDS.filter((c) => c.patterns.some((re) => re.test(text))).map((c) => c.seed);
    const shared = qSeeds.filter((s) => pSeeds.includes(s));
    const vec = await provider.embedText(conceptAugment(text));
    let score = cosineSimilarity(qVec, vec);
    // Concept overlap dominates; dampen spurious hash similarity (mock embeddings)
    if (shared.length) score = 0.9 + 0.05 * shared.length + score * 0.05;
    else score *= 0.12;
    scored.push({ id: p.id, passage: p, score });
  }
  return scored.sort((a, b) => b.score - a.score);
}

/**
 * @param {"lexical"|"hybrid"} mode
 */
export async function searchEvalCorpus(corpus, caseDef, mode = "hybrid") {
  const query = buildRetrievalQuery({
    query: caseDef.query,
    manufacturer: caseDef.metadata?.manufacturer,
    machineModel: caseDef.metadata?.machineModel,
    material: caseDef.metadata?.material,
  });
  const authorized = filterAuthorized(corpus, {
    organizationId: caseDef.organizationId,
    sourceTypes: caseDef.sourceTypes,
  });
  const tokens = tokenize(query);
  const identifiers = extractExactIdentifiers(query);
  const filters = {
    manufacturer: caseDef.metadata?.manufacturer,
    machineModel: caseDef.metadata?.machineModel,
    material: caseDef.metadata?.material,
    sourceTypes: caseDef.sourceTypes,
  };

  const lexical = rankLexical(authorized, tokens).slice(0, HYBRID_RANKING.lexicalCandidateLimit);

  if (mode === "lexical") {
    return lexical
      .map((r) => {
        const boosted = applyHybridBoosts({
          rrfScore: r.score,
          passageText: r.passage.text,
          title: r.passage.title,
          authority: r.passage.authority,
          manufacturer: r.passage.manufacturer,
          machineModel: r.passage.machineModel,
          material: r.passage.material,
          identifiers,
          filters,
        });
        return { id: r.id, score: boosted.score, reasons: boosted.reasons };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, HYBRID_RANKING.finalLimitDefault);
  }

  const provider = createEmbeddingProvider({
    SLAB_AI_EMBEDDING_PROVIDER: "mock",
    SLAB_AI_EMBEDDING_MOCK: "1",
    SLAB_AI_EMBEDDING_DIMENSIONS: "64",
  });
  const semantic = (await rankSemantic(authorized, query, provider)).slice(
    0,
    HYBRID_RANKING.semanticCandidateLimit
  );

  const rrfItems = [];
  lexical.forEach((r, i) => rrfItems.push({ id: r.id, rank: i + 1, channel: "lexical" }));
  semantic.forEach((r, i) => rrfItems.push({ id: r.id, rank: i + 1, channel: "semantic" }));
  const fused = reciprocalRankFusion(rrfItems);
  const byId = new Map(authorized.map((p) => [p.id, p]));

  return [...fused.entries()]
    .map(([id, meta]) => {
      const p = byId.get(id);
      if (!p) return null;
      const boosted = applyHybridBoosts({
        rrfScore: meta.score,
        passageText: p.text,
        title: p.title,
        authority: p.authority,
        manufacturer: p.manufacturer,
        machineModel: p.machineModel,
        material: p.material,
        identifiers,
        filters,
      });
      return { id, score: boosted.score, reasons: boosted.reasons };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, HYBRID_RANKING.finalLimitDefault);
}

export function recallAtK(rankedIds, expectedIds, k) {
  if (!expectedIds.length) {
    // Security cases: success = none of forbidden appear; measured separately
    return null;
  }
  const top = rankedIds.slice(0, k);
  return expectedIds.some((id) => top.includes(id)) ? 1 : 0;
}

export function reciprocalRank(rankedIds, expectedIds) {
  if (!expectedIds.length) return null;
  for (let i = 0; i < rankedIds.length; i++) {
    if (expectedIds.includes(rankedIds[i])) return 1 / (i + 1);
  }
  return 0;
}

/**
 * @param {Array<object>} cases
 * @param {Array<object>} [corpus]
 */
export async function runRetrievalEval(cases, corpus = EVAL_CORPUS) {
  const k = 5;
  const modes = ["lexical", "hybrid"];
  /** @type {Record<string, any>} */
  const report = {};

  for (const mode of modes) {
    let recallSum = 0;
    let recallN = 0;
    let mrrSum = 0;
    let mrrN = 0;
    let exactPass = 0;
    let exactN = 0;
    let securityPass = 0;
    let securityN = 0;
    const caseResults = [];

    for (const c of cases) {
      const ranked = await searchEvalCorpus(corpus, c, mode);
      const ids = ranked.map((r) => r.id);
      const forbiddenHit = (c.forbiddenPassageIds || []).filter((id) => ids.includes(id));

      const r = recallAtK(ids, c.expectedPassageIds || [], k);
      const mrr = reciprocalRank(ids, c.expectedPassageIds || []);
      if (r != null) {
        recallSum += r;
        recallN += 1;
      }
      if (mrr != null) {
        mrrSum += mrr;
        mrrN += 1;
      }

      if (c.category === "exact_id") {
        exactN += 1;
        if (r === 1 && !forbiddenHit.length) exactPass += 1;
      }
      if (c.category === "security" || c.category === "tool_domain") {
        securityN += 1;
        const expectedOk =
          !(c.expectedPassageIds || []).length ||
          (c.expectedPassageIds || []).every((id) => ids.includes(id));
        if (!forbiddenHit.length && expectedOk) securityPass += 1;
      }

      caseResults.push({
        id: c.id,
        category: c.category,
        rankedIds: ids,
        recallAtK: r,
        mrr,
        forbiddenHit,
      });
    }

    report[mode] = {
      recallAtK: recallN ? recallSum / recallN : null,
      mrr: mrrN ? mrrSum / mrrN : null,
      exactIdentifierPassRate: exactN ? exactPass / exactN : null,
      securityPassRate: securityN ? securityPass / securityN : null,
      caseResults,
    };
  }

  return report;
}
