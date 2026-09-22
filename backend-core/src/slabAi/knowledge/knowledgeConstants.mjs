/**
 * Constants / validation for slabOS Knowledge Hub ingestion.
 */

export const SLAB_AI_KNOWLEDGE_BUCKET = "eliteos-slab-ai-knowledge";
export const MAX_KNOWLEDGE_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

export const KNOWLEDGE_SOURCE_TYPES = [
  "sop",
  "machine_manual",
  "tooling_manual",
  "material_care",
  "manufacturer",
  "safety",
  "quote_policy",
  "install_standard",
  "training",
  "customer_care_policy",
  "sales_policy",
  "other",
];

export const KNOWLEDGE_SOURCE_TYPE_LABELS = {
  sop: "Company SOP",
  machine_manual: "Machine Manual",
  tooling_manual: "Tooling / Blade Documentation",
  material_care: "Material Technical Documentation",
  manufacturer: "Manufacturer Care Guide",
  safety: "Safety Document",
  quote_policy: "Quote / Sales Policy",
  install_standard: "Installation Standard",
  training: "Training Document",
  customer_care_policy: "Customer Care Policy",
  sales_policy: "Sales Policy",
  other: "General Reference",
};

export const KNOWLEDGE_AUTHORITIES = [
  "company_policy",
  "manufacturer_primary",
  "tooling_supplier",
  "internal_training",
  "general_reference",
];

export const KNOWLEDGE_STATUSES = [
  "uploaded",
  "processing",
  "review_required",
  "approved",
  "rejected",
  "archived",
  "processing_failed",
];

/** Only these are eligible for AI retrieval. */
export const RETRIEVABLE_STATUSES = new Set(["approved"]);

export const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".txt", ".md", ".markdown"]);

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/octet-stream", // allow when extension is trusted; magic-byte check follows
]);

export const KNOWLEDGE_ADMIN_ROLES = ["admin", "super_admin", "executive"];

export function pickStr(v) {
  return String(v ?? "").trim();
}

export function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v ?? "")
  );
}

export function sanitizeStorageFilename(filename) {
  const base = pickStr(filename).replace(/[/\\]/g, "_").replace(/[^\w.\- ()]/g, "_");
  return (base || "document.bin").slice(0, 180);
}

export function extensionOf(filename) {
  const m = pickStr(filename).toLowerCase().match(/(\.[a-z0-9]+)$/);
  return m ? m[1] : "";
}

/**
 * Validate extension + MIME + size. Returns { ok, error?, kind? }.
 */
export function validateKnowledgeFile({ filename, mimeType, sizeBytes }) {
  const ext = extensionOf(filename);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `Unsupported file type (${ext || "unknown"}). Use PDF, DOCX, TXT, or Markdown.` };
  }
  const size = Number(sizeBytes) || 0;
  if (size <= 0) return { ok: false, error: "File is empty." };
  if (size > MAX_KNOWLEDGE_FILE_BYTES) {
    return { ok: false, error: `File exceeds ${Math.round(MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024))} MB limit.` };
  }
  const mime = pickStr(mimeType).toLowerCase() || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    // Soft: allow octet-stream; reject clearly wrong types
    if (mime.startsWith("image/") || mime.includes("javascript") || mime.includes("zip") || mime.includes("executable")) {
      return { ok: false, error: `MIME type not allowed: ${mime}` };
    }
  }
  // Extension/MIME consistency (when MIME is specific)
  if (mime === "application/pdf" && ext !== ".pdf") {
    return { ok: false, error: "MIME type does not match file extension." };
  }
  if (mime.includes("wordprocessingml") && ext !== ".docx") {
    return { ok: false, error: "MIME type does not match file extension." };
  }
  let kind = "txt";
  if (ext === ".pdf") kind = "pdf";
  else if (ext === ".docx") kind = "docx";
  else if (ext === ".md" || ext === ".markdown") kind = "markdown";
  return { ok: true, kind, ext, mime };
}

/**
 * Magic-byte sniff for PDF / ZIP(DOCX) / text.
 */
export function sniffFileKind(bytes) {
  if (!bytes || bytes.length < 4) return { kind: "unknown", empty: true };
  const b0 = bytes[0];
  const b1 = bytes[1];
  const b2 = bytes[2];
  const b3 = bytes[3];
  // %PDF
  if (b0 === 0x25 && b1 === 0x50 && b2 === 0x44 && b3 === 0x46) return { kind: "pdf" };
  // PK zip (docx)
  if (b0 === 0x50 && b1 === 0x4b) return { kind: "docx_or_zip" };
  // UTF-8 BOM
  if (b0 === 0xef && b1 === 0xbb && b2 === 0xbf) return { kind: "text" };
  // Heuristic: printable
  let printable = 0;
  const sample = Math.min(bytes.length, 512);
  for (let i = 0; i < sample; i++) {
    const c = bytes[i];
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127) || c >= 128) printable += 1;
  }
  if (printable / sample > 0.85) return { kind: "text" };
  return { kind: "unknown" };
}

export function buildKnowledgeStoragePath({ organizationId, documentId, version, filename }) {
  const safe = sanitizeStorageFilename(filename);
  const ver = Math.max(1, Number(version) || 1);
  return `${organizationId}/${documentId}/v${ver}/${safe}`;
}

export function canAdministerKnowledge(user) {
  const role = pickStr(user?.role || user?.user_role).toLowerCase();
  return KNOWLEDGE_ADMIN_ROLES.includes(role);
}
