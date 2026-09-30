/**
 * Supabase pricing-policy repository against a real local (non-production) Supabase.
 * Only approved, active, in-effect policy versions supply rates; rows that merely exist
 * are ignored; two approved schedules are refused rather than guessed.
 *
 *   PRICING_IT_SUPABASE_URL=http://127.0.0.1:54321 PRICING_IT_SERVICE_KEY=... \
 *   node --test backend-core/src/digitalEstimate/configuration/pricingPolicyRepository.supabase.integration.test.mjs
 *
 * Skips unless the URL is loopback. Uses random synthetic org ids and deletes its rows.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { createSupabasePricingPolicyRepository } from "./pricingPolicyRepository.mjs";

const url = process.env.PRICING_IT_SUPABASE_URL || "";
const key = process.env.PRICING_IT_SERVICE_KEY || "";
const loopback = (() => {
  try {
    return ["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
})();
const skip = !url || !key || !loopback ? "set PRICING_IT_SUPABASE_URL (loopback) and PRICING_IT_SERVICE_KEY" : false;

const db = skip ? null : createClient(url, key, { auth: { persistSession: false } });
const orgs = [];

async function policy(org, { status = "active", approved = true, effectiveTo = null, rates = { group_b: 90 } } = {}) {
  const { data: p, error: pe } = await db
    .from("digital_estimate_pricing_policy_versions")
    .insert({
      organization_id: org,
      version_label: `it-${status}-${approved ? "approved" : "unapproved"}-${randomUUID().slice(0, 6)}`,
      status,
      approved_at: approved ? new Date().toISOString() : null,
      effective_to: effectiveTo
    })
    .select("id")
    .single();
  if (pe) throw pe;
  const { data: s, error: se } = await db
    .from("digital_estimate_material_schedules")
    .insert({ organization_id: org, policy_version_id: p.id, schedule_code: "direct", display_name: "Direct/Retail" })
    .select("id")
    .single();
  if (se) throw se;
  const rows = Object.entries(rates).map(([group_code, rate_per_sqft]) => ({
    organization_id: org,
    schedule_id: s.id,
    group_code,
    display_name: group_code,
    rate_per_sqft
  }));
  if (rows.length) {
    const { error: re } = await db.from("digital_estimate_material_group_rates").insert(rows);
    if (re) throw re;
  }
  return p.id;
}

function newOrg() {
  const id = randomUUID();
  orgs.push(id);
  return id;
}

test.after(async () => {
  if (!db || !orgs.length) return;
  await db.from("digital_estimate_pricing_policy_versions").delete().in("organization_id", orgs);
});

test("no policy rows → {} (caller uses built-in defaults)", { skip }, async () => {
  const repo = createSupabasePricingPolicyRepository({ db });
  assert.deepEqual(await repo.getBaseRates(newOrg(), "direct"), {});
});

test("draft, unapproved and expired versions are ignored", { skip }, async () => {
  const org = newOrg();
  await policy(org, { status: "draft", approved: false, rates: { group_b: 1 } });
  await policy(org, { status: "active", approved: false, rates: { group_b: 2 } });
  await policy(org, { status: "active", approved: true, effectiveTo: "2020-01-01T00:00:00Z", rates: { group_b: 3 } });
  await policy(org, { status: "superseded", approved: true, rates: { group_b: 4 } });
  const repo = createSupabasePricingPolicyRepository({ db });
  assert.deepEqual(await repo.getBaseRates(org, "direct"), {});
});

test("the single approved, active, in-effect version supplies the rates", { skip }, async () => {
  const org = newOrg();
  await policy(org, { status: "draft", approved: false, rates: { group_b: 1 } });
  await policy(org, { rates: { group_b: 90, group_c: 110 } });
  const repo = createSupabasePricingPolicyRepository({ db });
  assert.deepEqual(await repo.getBaseRates(org, "direct"), { group_b: 90, group_c: 110 });
  assert.deepEqual(await repo.getBaseRates(org, "wholesale"), {});
});

test("two approved schedules in effect → ambiguous_rate_schedule, not a guess", { skip }, async () => {
  const org = newOrg();
  await policy(org, { rates: { group_b: 90 } });
  await policy(org, { rates: { group_b: 95 } });
  const repo = createSupabasePricingPolicyRepository({ db });
  await assert.rejects(repo.getBaseRates(org, "direct"), (e) => e.code === "ambiguous_rate_schedule");
});

test("approved schedule without active rates → empty_rate_schedule", { skip }, async () => {
  const org = newOrg();
  await policy(org, { rates: {} });
  const repo = createSupabasePricingPolicyRepository({ db });
  await assert.rejects(repo.getBaseRates(org, "direct"), (e) => e.code === "empty_rate_schedule");
});

test("another org's approved rates never leak", { skip }, async () => {
  const a = newOrg();
  const b = newOrg();
  await policy(a, { rates: { group_b: 90 } });
  const repo = createSupabasePricingPolicyRepository({ db });
  assert.deepEqual(await repo.getBaseRates(b, "direct"), {});
});

test("query failure is thrown, not swallowed", { skip }, async () => {
  const broken = createClient("http://127.0.0.1:1", key, { auth: { persistSession: false } });
  const repo = createSupabasePricingPolicyRepository({ db: broken });
  await assert.rejects(repo.getBaseRates(newOrg(), "direct"));
});
