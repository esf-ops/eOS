/**
 * CSP builder for Digital Estimate HTML — Supabase images allowed, no wildcards.
 * Run: node app-digital-estimate/src/htmlCsp.test.mjs
 */
import assert from "node:assert/strict";
import {
  buildDigitalEstimateHtmlCsp,
  extractImgSrcDirective,
  imgSrcAllowsOrigin,
  imgSrcAllowsUrl,
  imgSrcHasWildcardHttps,
  supabaseOriginFromUrl,
} from "./htmlCsp.mjs";

console.log("\nhtmlCsp.test.mjs\n");

const SUPABASE = "https://wbxbzhxsdlkpqsviyzkt.supabase.co";
const BACKEND = "https://api.eliteosfab.com";

{
  assert.equal(supabaseOriginFromUrl(SUPABASE), SUPABASE);
  assert.equal(supabaseOriginFromUrl(`${SUPABASE}/storage/v1/object/public/x`), SUPABASE);
  assert.equal(supabaseOriginFromUrl(""), null);
  assert.equal(supabaseOriginFromUrl("not-a-url"), null);
  assert.equal(supabaseOriginFromUrl("http://insecure.example"), null);
  console.log("ok: supabaseOriginFromUrl");
}

{
  const csp = buildDigitalEstimateHtmlCsp({
    isProd: true,
    backendOrigin: BACKEND,
    supabaseOrigin: SUPABASE,
  });
  assert.ok(imgSrcAllowsOrigin(csp, SUPABASE), "CSP allows configured Supabase origin");
  assert.equal(imgSrcHasWildcardHttps(csp), false, "CSP does not allow wildcard image origins");
  assert.match(csp, /script-src 'self'/);
  assert.doesNotMatch(csp, /script-src[^;]*https:/);
  assert.match(csp, new RegExp(`connect-src 'self' ${BACKEND.replace(/\./g, "\\.")}`));
  assert.equal(imgSrcHasWildcardHttps(csp), false);
  const imgTokens = (extractImgSrcDirective(csp) || "").replace(/^img-src\s+/i, "").split(/\s+/);
  assert.ok(!imgTokens.includes("*") && !imgTokens.includes("https:") && !imgTokens.includes("http:"));

  const thumb = `${SUPABASE}/storage/v1/object/public/eliteos-slab-images/org/mat/thumb-600.jpg`;
  const preview = `${SUPABASE}/storage/v1/object/public/eliteos-slab-images/org/mat/preview.jpg`;
  assert.equal(imgSrcAllowsUrl(csp, thumb), true, "thumbnail URL loads under policy");
  assert.equal(imgSrcAllowsUrl(csp, preview), true, "preview URL loads under policy");
  assert.equal(
    imgSrcAllowsUrl(csp, "https://evil.example/x.jpg"),
    false,
    "unknown external image origin remains blocked",
  );
  assert.equal(imgSrcAllowsUrl(csp, "data:image/png;base64,aaa"), true, "data: fallback allowed");
  console.log("ok: CSP allows Supabase; blocks wildcards/unknown; script/connect unchanged");
}

{
  const without = buildDigitalEstimateHtmlCsp({
    isProd: true,
    backendOrigin: BACKEND,
    supabaseOrigin: null,
  });
  assert.equal(imgSrcAllowsOrigin(without, SUPABASE), false);
  assert.equal(imgSrcHasWildcardHttps(without), false);
  console.log("ok: missing VITE_SUPABASE_URL keeps img-src tight (no Supabase)");
}

console.log("\nhtmlCsp.test.mjs PASSED\n");
