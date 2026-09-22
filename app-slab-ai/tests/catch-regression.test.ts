import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const roots = [
  join(process.cwd(), "../backend-core/src/slabAi/knowledge/knowledgeSentinel.mjs"),
  join(process.cwd(), "../backend-core/src/slabAi/knowledge/embeddingService.mjs"),
  join(process.cwd(), "../backend-core/src/slabAi/knowledge/knowledgeIngestion.mjs"),
];

describe("supabase builder .catch regression", () => {
  it("does not chain .catch on Postgrest update builders", () => {
    for (const file of roots) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/\.eq\([^)]*\)\s*\n?\s*\.catch\(/);
      expect(src).not.toMatch(/updateKnowledgeDocument\([^)]*\)\s*\.catch\(/);
    }
  });
});
