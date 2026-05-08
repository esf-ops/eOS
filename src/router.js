import fs from "node:fs/promises";
import path from "node:path";

function morawareDiscoveryEnvActive() {
  const v = String(process.env.MORAWARE_DISCOVERY ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function sanitizeFileToken(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Phase 3: Switchboard Router
 *
 * - Accepts normalized JSON data and an array of Head modules.
 * - Calls each head's `process(normalizedData)` function.
 * - Writes each head output to `output-[head_name].json` at the project root.
 */
export async function runSwitchboard({ normalizedData, heads, outputDir = process.cwd() }) {
  if (morawareDiscoveryEnvActive()) {
    throw new Error(
      "runSwitchboard must not run while MORAWARE_DISCOVERY is enabled. Discovery V2 should exit from src/index.js first."
    );
  }
  if (!Array.isArray(heads)) throw new Error("runSwitchboard: heads must be an array");

  const results = [];
  for (const head of heads) {
    const headName = sanitizeFileToken(head?.name || "unnamed-head");
    if (typeof head?.process !== "function") {
      throw new Error(`Head "${headName}" is missing required process(normalizedData) function`);
    }

    const payload = await head.process(normalizedData);
    const outPath = path.join(outputDir, `output-${headName}.json`);
    await fs.writeFile(outPath, JSON.stringify(payload), "utf8");
    results.push({ head: headName, outputPath: outPath });
  }

  return results;
}

