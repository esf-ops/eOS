/**
 * Embedding provider abstraction for slabOS Knowledge Hub.
 * Server-side only — never called from the browser.
 *
 * Production provider: OpenAI text-embedding-3-small (1536 dims)
 * Test provider: deterministic mock (hash → unit vector)
 */

import { createHash } from "node:crypto";

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
export const DEFAULT_EMBEDDING_VERSION = "v1";

/**
 * @typedef {{ id: string, model: string, dimensions: number, version: string,
 *   embedText(text: string): Promise<number[]>,
 *   embedBatch(texts: string[]): Promise<number[][]> }} EmbeddingProvider
 */

export function getEmbeddingConfig(env = process.env) {
  const provider = String(env.SLAB_AI_EMBEDDING_PROVIDER || env.EMBEDDING_PROVIDER || "openai").trim().toLowerCase();
  const model = String(env.SLAB_AI_EMBEDDING_MODEL || env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL).trim();
  const dimensions = Number(env.SLAB_AI_EMBEDDING_DIMENSIONS || env.EMBEDDING_DIMENSIONS || DEFAULT_EMBEDDING_DIMENSIONS) || DEFAULT_EMBEDDING_DIMENSIONS;
  const version = String(env.SLAB_AI_EMBEDDING_VERSION || DEFAULT_EMBEDDING_VERSION).trim();
  const apiKey =
    String(env.SLAB_AI_EMBEDDING_API_KEY || env.EMBEDDING_API_KEY || env.OPENAI_API_KEY || "").trim() || null;
  const ollamaBaseUrl = String(env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").trim().replace(/\/+$/, "");
  const mock =
    String(env.SLAB_AI_EMBEDDING_MOCK || "").trim() === "1" ||
    provider === "mock" ||
    (!apiKey && provider !== "ollama" && provider !== "local" && String(env.NODE_ENV) !== "production");
  return {
    provider: mock ? "mock" : provider,
    model,
    dimensions,
    version,
    apiKey,
    ollamaBaseUrl,
    mock,
  };
}

/**
 * @returns {EmbeddingProvider}
 */
export function createEmbeddingProvider(env = process.env) {
  const cfg = getEmbeddingConfig(env);
  if (cfg.mock || cfg.provider === "mock") {
    return createMockEmbeddingProvider(cfg);
  }
  if (cfg.provider === "openai") {
    if (!cfg.apiKey) {
      throw Object.assign(new Error("Embedding provider requires SLAB_AI_EMBEDDING_API_KEY or OPENAI_API_KEY"), {
        code: "EMBEDDING_UNAVAILABLE",
      });
    }
    return createOpenAiEmbeddingProvider(cfg);
  }
  if (cfg.provider === "ollama" || cfg.provider === "local") {
    return createOllamaEmbeddingProvider(cfg);
  }
  throw Object.assign(new Error(`Unsupported embedding provider: ${cfg.provider}`), {
    code: "EMBEDDING_UNSUPPORTED",
  });
}

function createMockEmbeddingProvider(cfg) {
  return {
    id: "mock",
    model: cfg.model || "mock-embedding",
    dimensions: cfg.dimensions,
    version: cfg.version,
    async embedText(text) {
      return mockVector(text, cfg.dimensions);
    },
    async embedBatch(texts) {
      return texts.map((t) => mockVector(t, cfg.dimensions));
    },
  };
}

function mockVector(text, dims) {
  const hash = createHash("sha256").update(String(text || "")).digest();
  const out = new Array(dims);
  for (let i = 0; i < dims; i++) {
    const b = hash[i % hash.length];
    out[i] = ((b / 255) * 2 - 1) * (1 / Math.sqrt(dims));
  }
  // L2 normalize
  let norm = 0;
  for (const v of out) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return out.map((v) => v / norm);
}

function createOpenAiEmbeddingProvider(cfg) {
  return {
    id: "openai",
    model: cfg.model,
    dimensions: cfg.dimensions,
    version: cfg.version,
    async embedText(text) {
      const [v] = await this.embedBatch([text]);
      return v;
    },
    async embedBatch(texts) {
      const cleaned = texts.map((t) => String(t || "").slice(0, 8000));
      if (!cleaned.length) return [];
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: cfg.model,
          input: cleaned,
          dimensions: cfg.dimensions === 1536 ? undefined : cfg.dimensions,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw Object.assign(new Error(`Embedding API failed (${res.status})`), {
          code: "EMBEDDING_FAILED",
          detail: body.slice(0, 200),
        });
      }
      const data = await res.json();
      const rows = Array.isArray(data.data) ? data.data : [];
      rows.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      return rows.map((r) => r.embedding);
    },
  };
}

/**
 * Local / Ollama embeddings.
 * Vectors must not be mixed with OpenAI vectors unless dimensions+version match an explicit migration.
 */
function createOllamaEmbeddingProvider(cfg) {
  const base = cfg.ollamaBaseUrl || "http://127.0.0.1:11434";
  const model = cfg.model || "nomic-embed-text";
  return {
    id: "ollama",
    model,
    dimensions: cfg.dimensions,
    version: cfg.version,
    async embedText(text) {
      const [v] = await this.embedBatch([text]);
      return v;
    },
    async embedBatch(texts) {
      const out = [];
      for (const text of texts) {
        const res = await fetch(`${base}/api/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt: String(text || "").slice(0, 8000) }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw Object.assign(new Error(`Ollama embedding failed (${res.status})`), {
            code: "EMBEDDING_FAILED",
            detail: body.slice(0, 200),
          });
        }
        const data = await res.json();
        const vec = data.embedding;
        if (!Array.isArray(vec)) {
          throw Object.assign(new Error("Ollama embedding response missing embedding array"), {
            code: "EMBEDDING_FAILED",
          });
        }
        if (cfg.dimensions && vec.length !== cfg.dimensions) {
          throw Object.assign(
            new Error(
              `Embedding dimension mismatch: got ${vec.length}, expected ${cfg.dimensions}. Do not mix incompatible vector spaces — bump SLAB_AI_EMBEDDING_VERSION and re-embed.`
            ),
            { code: "EMBEDDING_DIMENSION_MISMATCH" }
          );
        }
        out.push(vec);
      }
      return out;
    },
  };
}

/** Build text to embed — title + section + passage, not raw secrets. */
export function buildPassageEmbedText({ title, sectionTitle, text, manufacturer, machineModel }) {
  return [
    title ? `Document: ${title}` : null,
    manufacturer ? `Manufacturer: ${manufacturer}` : null,
    machineModel ? `Model: ${machineModel}` : null,
    sectionTitle ? `Section: ${sectionTitle}` : null,
    String(text || "").slice(0, 6000),
  ]
    .filter(Boolean)
    .join("\n");
}

export function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

export function vectorToPgLiteral(vec) {
  return `[${vec.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}
