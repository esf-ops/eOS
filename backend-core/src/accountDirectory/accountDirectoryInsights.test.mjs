import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccountDirectoryMemoryStore } from "./accountDirectoryMemoryStore.mjs";
import { attachAccountDirectoryRoutes } from "./accountDirectoryApi.js";
import { ACCOUNT_DIRECTORY_HEAD_SLUG } from "./accountDirectoryAuth.mjs";
import {
  computeAccountMomentum,
  computeAccountOutlook,
  computeEstimateWinRate,
  computeOpenOpportunity,
  computeQuoteToOrderRatio,
  INSIGHT_IDS
} from "./accountDirectoryInsights.mjs";
import { ACCOUNT_360_FORBIDDEN_SENTINEL_KEYS } from "./accountDirectoryStaffSafeFinancials.mjs";

const here = dirname(fileURLToPath(import.meta.url));

{
  const none = computeEstimateWinRate({
    internalItems: [
      { id: "1", quote_status: "sent", quote_number: "Q-1", grand_total: 100 },
      { id: "2", quote_status: "draft", quote_number: "Q-2", grand_total: 50 }
    ]
  });
  assert.equal(none.card.state, "unavailable");
  assert.match(none.card.interpretation, /incomplete/i);
  assert.equal(none.evidence.excluded.openInternal, 2);

  const subset = computeEstimateWinRate({
    internalItems: [
      { id: "w", quote_status: "sold", quote_number: "S-1", grand_total: 10 },
      { id: "l", quote_status: "lost", quote_number: "L-1", grand_total: 10 },
      { id: "l2", quote_status: "lost", quote_number: "L-2", grand_total: 10 },
      { id: "o", quote_status: "sent", quote_number: "O-1", grand_total: 999 }
    ]
  });
  assert.equal(subset.card.state, "ok");
  assert.equal(subset.card.value, 33.3);
  assert.equal(subset.evidence.included.closedEligible, 3);
  assert.equal(subset.evidence.excluded.openInternal, 1);
  console.log("ok: win rate unavailable without lost; open estimates excluded; subset math");
}

{
  const zero = computeQuoteToOrderRatio({
    estimates: { count: 0, amount: 0 },
    salesOrders: { count: 2, amount: 100 },
    period: "YTD"
  });
  assert.equal(zero.card.state, "unavailable");
  const ratio = computeQuoteToOrderRatio({
    estimates: { count: 147, amount: 896375.43 },
    salesOrders: { count: 48, amount: 265314.2 },
    period: "YTD"
  });
  assert.equal(ratio.card.value, 29.6);
  assert.match(ratio.card.interpretation, /not a close rate/i);
  assert.equal(
    ratio.evidence.limitations.some((l) => /not linked one-to-one/i.test(l)),
    true
  );
  console.log("ok: quote-to-order ratio math and zero denominator");
}

{
  const missing = computeQuoteToOrderRatio({ period: "YTD" });
  assert.equal(missing.card.state, "unavailable");
  assert.match(missing.card.interpretation, /missing/i);
  console.log("ok: missing quote dollars stay unavailable, not zero");
}

{
  const insuff = computeAccountMomentum({ comparable: { quoted: { status: "incomparable" } } });
  assert.equal(insuff.card.value, "Insufficient history");
  const growing = computeAccountMomentum({
    comparable: {
      quoted: { status: "comparable", percent: 22 },
      salesOrders: { status: "comparable", percent: 14 },
      invoiced: { status: "comparable", percent: 11 }
    }
  });
  assert.equal(growing.card.value, "Growing");
  const mixed = computeAccountMomentum({
    comparable: {
      quoted: { status: "comparable", percent: 22 },
      salesOrders: { status: "comparable", percent: -14 },
      invoiced: { status: "comparable", percent: 11 }
    }
  });
  assert.equal(mixed.card.value, "Mixed");
  const liveShape = computeAccountMomentum({
    comparable: {
      available: true,
      change: {
        quotes: { status: "down", percent: -59.8 },
        salesOrders: { status: "down", percent: -50 },
        invoiced: { status: "down", percent: -45.3 }
      }
    }
  });
  assert.equal(liveShape.card.value, "Slowing");
  assert.equal(liveShape.card.state, "ok");
  const noPrior = computeAccountMomentum({
    comparable: {
      available: true,
      change: {
        quotes: { status: "unavailable_rate", percent: null },
        salesOrders: { status: "unavailable_rate", percent: null },
        invoiced: { status: "unavailable_rate", percent: null }
      }
    }
  });
  assert.equal(noPrior.card.value, "Insufficient history");
  console.log("ok: momentum equivalent-period Growing/Mixed/insufficient");
}

{
  const open = computeOpenOpportunity({
    internalItems: [
      { id: "a", quote_status: "sent", grand_total: 100 },
      { id: "b", quote_status: "sold", grand_total: 500 },
      { id: "c", quote_status: "lost", grand_total: 40 },
      { id: "old", quote_status: "draft", grand_total: 10, is_current_revision: false }
    ],
    studioItems: [{ id: "s", status: "priced", grand_total: null }]
  });
  assert.equal(open.card.value, 2);
  assert.equal(open.evidence.records.some((r) => r.status === "sold"), false);
  assert.equal(open.evidence.records.some((r) => r.status === "draft"), false);
  console.log("ok: open opportunity excludes sold/lost");
}

{
  const outlook = computeAccountOutlook({
    momentumCard: { state: "ok", value: "Growing" }
  });
  assert.equal(outlook.card.value, "Growing");
  assert.match(outlook.evidence.rejectedForecast, /rejected|history/i);
  console.log("ok: numeric forecast rejected; outlook follows momentum");
}

{
  const json = JSON.stringify({
    cards: INSIGHT_IDS,
    sentinels: ACCOUNT_360_FORBIDDEN_SENTINEL_KEYS
  });
  for (const key of ["gross_profit", "cogs", "payroll", "listid"]) {
    assert.equal(new RegExp(key, "i").test(JSON.stringify(computeQuoteToOrderRatio({
      estimates: { amount: 10, count: 1 },
      salesOrders: { amount: 3, count: 1 }
    }))), false);
  }
  assert.ok(json);
  console.log("ok: insight payloads omit owner-sensitive fields");
}

{
  const apiSrc = readFileSync(join(here, "accountDirectoryApi.js"), "utf8");
  assert.ok(apiSrc.includes("/insights"));
  const routes = new Map();
  const app = {
    get(path) {
      routes.set(`GET ${path}`, true);
    },
    post() {},
    patch() {},
    delete() {}
  };
  attachAccountDirectoryRoutes(app, {
    requireAuth: () => (req, res, next) => next(),
    requireHeadAccess: (slug) => {
      assert.equal(slug, ACCOUNT_DIRECTORY_HEAD_SLUG);
      return (req, res, next) => next();
    },
    getSupabase: () => ({}),
    store: createAccountDirectoryMemoryStore()
  });
  assert.ok(routes.has("GET /api/account-directory/accounts/:accountId/insights"));
  assert.ok(routes.has("GET /api/account-directory/accounts/:accountId/insights/:insightId/evidence"));
  console.log("ok: insights routes registered");
}

console.log("accountDirectoryInsights.test.mjs — all passed");
