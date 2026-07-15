/**
 * Build a synthetic .eml that embeds the committed kitchen+island plan PDF.
 *
 * Usage: node fixtures/takeoff/generateSyntheticTakeoffEml.mjs
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PDF_PATH = join(__dirname, "qil-synth-kitchen-island-plan.pdf");
const GT_PATH = join(__dirname, "qil-synth-kitchen-island-plan.ground-truth.json");
const OUT_PATH = join(__dirname, "../../src/fixtures/eml/synth-kitchen-island-live-takeoff.eml");

const pdf = readFileSync(PDF_PATH);
const gt = JSON.parse(readFileSync(GT_PATH, "utf8"));
const hash = createHash("sha256").update(pdf).digest("hex");
if (hash !== gt.contentHash) {
  throw new Error(`PDF hash ${hash} does not match ground truth ${gt.contentHash}`);
}

const b64 = pdf.toString("base64");
const folded = b64.replace(/(.{76})/g, "$1\r\n").replace(/\r\n$/, "");

const body = [
  "Synthetic Quote Intake Lab — live takeoff fixture email.",
  "",
  "Customer: Example Homes LLC",
  "Project: Maple Court Kitchen",
  "Address: 100 Example Way, Exampleville, EX 00000",
  "Requested Elite 100 color: Calacatta Mira",
  "Edge: eased",
  "Sink cutouts: 1",
  "Stated countertop SF: 39.25",
  "Standard 4-inch backsplash along the main run.",
  "",
  "Please run AI takeoff on the attached synthetic plan PDF.",
  "This is not a real customer request. example.com identities only.",
  `Plan SHA-256: ${hash}`,
  ""
].join("\r\n");

const eml = [
  "Message-ID: <synth-kitchen-island-live-takeoff@example.com>",
  "Date: Tue, 14 Jul 2026 20:00:00 +0000",
  "From: Avery Nguyen <avery.nguyen@example.com>",
  "To: sales@example.com",
  "Subject: Elite 100 quote request — Maple Court Kitchen (synthetic live takeoff fixture)",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="QILSYNTHLIVE"',
  "",
  "--QILSYNTHLIVE",
  'Content-Type: text/plain; charset="utf-8"',
  "Content-Transfer-Encoding: 7bit",
  "",
  body,
  "--QILSYNTHLIVE",
  'Content-Type: application/pdf; name="qil-synth-kitchen-island-plan.pdf"',
  "Content-Transfer-Encoding: base64",
  'Content-Disposition: attachment; filename="qil-synth-kitchen-island-plan.pdf"',
  "",
  folded,
  "",
  "--QILSYNTHLIVE--",
  ""
].join("\r\n");

writeFileSync(OUT_PATH, eml, "utf8");
console.log(`[qil-synth-eml] wrote ${OUT_PATH}`);
console.log(`[qil-synth-eml] pdfBytes=${pdf.length} sha256=${hash}`);
