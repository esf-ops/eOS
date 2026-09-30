import assert from "node:assert/strict";
import { loopbackAlignedUrl } from "./loopbackHostAlignment.ts";

const link = "http://localhost:5190/e/TOKEN?x=1#frag";
assert.equal(loopbackAlignedUrl(link, "http://127.0.0.1:3001"), "http://127.0.0.1:5190/e/TOKEN?x=1#frag");
assert.equal(loopbackAlignedUrl("http://127.0.0.1:5190/e/T", "http://localhost:3001"), "http://localhost:5190/e/T");
assert.equal(loopbackAlignedUrl("http://127.0.0.1:5190/e/T", "http://127.0.0.1:3001"), null, "already aligned");
assert.equal(loopbackAlignedUrl("https://estimate.eliteosfab.com/e/T", "https://api.eliteosfab.com"), null, "deployed hosts untouched");
assert.equal(loopbackAlignedUrl("http://localhost:5190/e/T", "https://api.eliteosfab.com"), null, "remote API untouched");
assert.equal(loopbackAlignedUrl("http://localhost:5190/e/T", ""), null, "same-origin API untouched");
console.log("loopbackHostAlignment.test.ts: ok");
