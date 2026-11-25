/**
 * Live Inventory head — registration / governance smoke.
 * Run: node backend-core/src/liveInventory/liveInventoryRegistration.test.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EOS_HEAD_SLUGS, isKnownHeadSlug } from "../auth/eosGovernanceConstants.js";
import { resolveHeadDeploymentUrl } from "../me/headDeploymentUrls.js";
import { HEAD_LAUNCHER_CATALOG } from "../me/launcherHeads.js";
import { LIVE_INVENTORY_HEAD_SLUG, LIVE_INVENTORY_HEAD_URL_ENV } from "./liveInventoryConstants.js";

const here = dirname(fileURLToPath(import.meta.url));

console.log("\nliveInventoryRegistration.test.mjs\n");

assert.equal(LIVE_INVENTORY_HEAD_SLUG, "live_inventory");
assert.equal(isKnownHeadSlug(LIVE_INVENTORY_HEAD_SLUG), true);
assert.ok(EOS_HEAD_SLUGS.includes(LIVE_INVENTORY_HEAD_SLUG));
assert.ok(HEAD_LAUNCHER_CATALOG.some((h) => h.slug === LIVE_INVENTORY_HEAD_SLUG));
console.log("ok: slug registered in governance + launcher");

{
  const prev = process.env[LIVE_INVENTORY_HEAD_URL_ENV];
  process.env[LIVE_INVENTORY_HEAD_URL_ENV] = "https://live-inventory.eliteosfab.com";
  assert.equal(resolveHeadDeploymentUrl(LIVE_INVENTORY_HEAD_SLUG), "https://live-inventory.eliteosfab.com");
  if (prev == null) delete process.env[LIVE_INVENTORY_HEAD_URL_ENV];
  else process.env[LIVE_INVENTORY_HEAD_URL_ENV] = prev;
  console.log("ok: HEAD_URL_LIVE_INVENTORY resolves");
}

{
  const apiSrc = readFileSync(join(here, "../slabInventory/slabInventoryApi.js"), "utf8");
  assert.ok(apiSrc.includes("requireAnyHeadAccess"), "slab inventory API must accept live_inventory via requireAnyHeadAccess");
  assert.ok(apiSrc.includes("live_inventory") || apiSrc.includes("LIVE_INVENTORY_HEAD_SLUG"));
  console.log("ok: slab inventory read APIs accept live_inventory head");
}

{
  const mwSrc = readFileSync(join(here, "../auth/headAccessMiddleware.js"), "utf8");
  assert.ok(mwSrc.includes("export function requireAnyHeadAccess"));
  console.log("ok: requireAnyHeadAccess exported");
}

console.log("\nAll live inventory registration checks passed.\n");
