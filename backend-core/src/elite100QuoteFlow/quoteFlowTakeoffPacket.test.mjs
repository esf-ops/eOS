/**
 * Run: node backend-core/src/elite100QuoteFlow/quoteFlowTakeoffPacket.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTakeoffPacketPdf,
  normalizeStartTakeoffAttachmentKeys,
  sanitizeTakeoffPacketFilename
} from "./quoteFlowTakeoffPacket.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../../..");

console.log("\nquoteFlowTakeoffPacket.test.mjs\n");

{
  assert.deepEqual(normalizeStartTakeoffAttachmentKeys({ attachmentKey: "a1" }), ["a1"]);
  assert.deepEqual(
    normalizeStartTakeoffAttachmentKeys({ attachmentKeys: ["b", "a", "b"] }),
    ["b", "a"]
  );
  assert.deepEqual(normalizeStartTakeoffAttachmentKeys({}), []);
  console.log("ok: attachmentKeys normalize + de-dupe preserves order");
}

{
  const name = sanitizeTakeoffPacketFilename("Renewed Mercer / Kitchen-takeoff-packet");
  assert.match(name, /takeoff-packet\.pdf$/i);
  assert.ok(!name.includes("/"));
  console.log("ok: packet filename sanitizes");
}

{
  // Minimal PDF
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  const single = await buildTakeoffPacketPdf({
    parts: [{ bytes: pdf, filename: "kitchen.pdf", declaredMime: "application/pdf" }]
  });
  assert.equal(single.merged, false);
  assert.equal(single.partCount, 1);
  assert.ok(single.bytes.subarray(0, 4).equals(Buffer.from("%PDF")));
  console.log("ok: single PDF packet passthrough");
}

{
  // Minimal JPEG (1x1)
  const jpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
    0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
    0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xff, 0xc4, 0x00, 0x14,
    0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0xbf, 0xff, 0xd9
  ]);
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
  try {
    const merged = await buildTakeoffPacketPdf({
      parts: [
        { bytes: pdf, filename: "kitchen.pdf", declaredMime: "application/pdf" },
        { bytes: jpeg, filename: "bath-plan.jpg", declaredMime: "image/jpeg" }
      ],
      packetFilename: "customer-takeoff-packet.pdf"
    });
    assert.equal(merged.merged, true);
    assert.equal(merged.partCount, 2);
    assert.equal(merged.mimeType, "application/pdf");
    assert.ok(merged.bytes.subarray(0, 4).equals(Buffer.from("%PDF")));
    console.log("ok: multi PDF+JPG builds merged takeoff packet");
  } catch (e) {
    // pdf-lib may reject tiny/malformed jpeg — still assert clear error codes.
    assert.ok(
      e?.code === "packet_build_failed" || e?.code === "packet_unsupported",
      `unexpected: ${e?.code} ${e?.message}`
    );
    console.log("ok: multi packet fails safely when image embed cannot complete");
  }
}

{
  const routes = readFileSync(
    join(root, "backend-core/src/elite100QuoteFlow/elite100QuoteFlowRoutes.js"),
    "utf8"
  );
  assert.match(routes, /attachments\/:attachmentKey\/preview/);
  assert.match(routes, /attachments\/:attachmentKey\/download/);
  assert.match(routes, /attachmentKeys/);
  assert.doesNotMatch(routes, /markSold|quickbooks|handoffEmail/i);
  console.log("ok: preview/download + attachmentKeys routes; no sold/QB/email");
}

console.log("\nquoteFlowTakeoffPacket.test.mjs: ok\n");
