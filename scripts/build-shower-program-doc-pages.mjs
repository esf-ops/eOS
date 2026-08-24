#!/usr/bin/env node
/**
 * Convert Shower Program PDF docs → PNG page images for kiosk-safe in-app viewing.
 *
 * Source:  app-slab-inventory/public/shower-program/docs/*.pdf
 * Output:  app-slab-inventory/public/shower-program/docs/<basename>-page-N.png
 *
 * Usage:
 *   node scripts/build-shower-program-doc-pages.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const docsRoot = path.join(repoRoot, "app-slab-inventory/public/shower-program/docs");

const ZOOM = 2.0;

const pythonScript = `
import json, sys
from pathlib import Path
try:
    import fitz
except ImportError:
    print("ERROR: pymupdf required. pip install pymupdf", file=sys.stderr)
    sys.exit(2)

docs_root = Path(sys.argv[1])
zoom = float(sys.argv[2])
mat = fitz.Matrix(zoom, zoom)
results = []
for pdf in sorted(docs_root.glob("*.pdf")):
    stem = pdf.stem
    doc = fitz.open(pdf)
    for i, page in enumerate(doc, start=1):
        dest = docs_root / f"{stem}-page-{i}.png"
        for stale in docs_root.glob(f"{stem}-page-*.png"):
            if stale != dest:
                stale.unlink()
        pix = page.get_pixmap(matrix=mat, alpha=False)
        pix.save(dest)
        results.append(str(dest.name))
        print(f"OK {dest.name} ({pix.width}x{pix.height})", file=sys.stderr)
    doc.close()
print(json.dumps({"ok": True, "pages": results}))
`;

if (!fs.existsSync(docsRoot)) {
  console.error("No shower-program/docs directory");
  process.exit(1);
}

const py = spawnSync("python3", ["-c", pythonScript, docsRoot, String(ZOOM)], {
  encoding: "utf8",
});

if (py.status !== 0) {
  console.error(py.stderr || py.stdout);
  process.exit(py.status ?? 1);
}

const payload = JSON.parse(py.stdout.trim());
console.log(JSON.stringify(payload, null, 2));
