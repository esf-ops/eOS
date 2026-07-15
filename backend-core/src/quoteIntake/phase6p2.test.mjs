/**
 * Phase 6P.2 — persistence, factory, audit, supabase repo, migration text.
 * Run: node backend-core/src/quoteIntake/phase6p2.test.mjs
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { InMemoryQuoteIntakeRepository } from "./quoteIntakeRepository.mjs";
import { SupabaseQuoteIntakeRepository } from "./supabaseQuoteIntakeRepository.mjs";
import {
  createQuoteIntakeRepository,
  readQuoteIntakeRepositoryMode
} from "./quoteIntakeRepositoryFactory.mjs";
import { sanitizeQuoteIntakeAuditMetadata } from "./quoteIntakeAuditSanitize.mjs";
import { FakeQuoteIntakeSupabaseClient } from "./fakeQuoteIntakeSupabase.mjs";
import {
  AUTOMATION_PATH,
  AUTOMATION_REASON_CODE,
  QUOTE_INTAKE_CASE_STATUS
} from "./quoteIntakeTypes.mjs";
import { maybeAttachQuoteIntakeRoutes } from "./quoteIntakeRoutes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const SHA =
  "0833ca1afd77665f24590158535e90b60b6e78d3e176de6a34a336d97deae9cb";
const SHA2 =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

console.log("\nphase6p2.test.mjs\n");

// ── Factory / selection ─────────────────────────────────────────────────────
{
  assert.equal(readQuoteIntakeRepositoryMode({}), "memory");
  assert.equal(readQuoteIntakeRepositoryMode({ QUOTE_INTAKE_REPOSITORY: "memory" }), "memory");
  assert.equal(readQuoteIntakeRepositoryMode({ QUOTE_INTAKE_REPOSITORY: "supabase" }), "supabase");
  assert.throws(
    () => readQuoteIntakeRepositoryMode({ QUOTE_INTAKE_REPOSITORY: "postgres" }),
    /Invalid/
  );

  const mem = createQuoteIntakeRepository({ env: { QUOTE_INTAKE_REPOSITORY: "memory" } });
  assert.equal(mem.mode, "memory");
  assert.ok(mem.repository instanceof InMemoryQuoteIntakeRepository);

  assert.throws(
    () => createQuoteIntakeRepository({ env: { QUOTE_INTAKE_REPOSITORY: "supabase" } }),
    (e) => e.code === "quote_intake_persistence_misconfigured"
  );

  const fake = new FakeQuoteIntakeSupabaseClient();
  const sb = createQuoteIntakeRepository({
    env: { QUOTE_INTAKE_REPOSITORY: "supabase" },
    supabaseClient: fake
  });
  assert.equal(sb.mode, "supabase");
  assert.ok(sb.repository instanceof SupabaseQuoteIntakeRepository);
  console.log("ok: repository selection + fail-closed supabase config");
}

// ── Audit sanitizer ─────────────────────────────────────────────────────────
{
  assert.deepEqual(sanitizeQuoteIntakeAuditMetadata({ status: "qil_received", attachmentCount: 1 }), {
    status: "qil_received",
    attachmentCount: 1
  });
  assert.throws(
    () => sanitizeQuoteIntakeAuditMetadata({ subject: "Secret project" }),
    (e) => e.code === "prohibited_audit_metadata"
  );
  assert.throws(
    () => sanitizeQuoteIntakeAuditMetadata({ body: "hello", token: "xyz" }),
    (e) => e.code === "prohibited_audit_metadata"
  );
  console.log("ok: audit sanitizer rejects prohibited fields");
}

// ── Memory: attachment hash dedupe + audit immutable ────────────────────────
{
  const repo = new InMemoryQuoteIntakeRepository();
  const c = repo.createCase({
    organizationId: ORG_A,
    attachments: [
      { sha256: SHA, safeFilename: "a.pdf" },
      { sha256: SHA, safeFilename: "a-dup.pdf" },
      { sha256: SHA2 }
    ]
  });
  assert.equal(c.attachments.length, 2);
  assert.throws(() => repo.updateAuditEvent(), /append-only/);
  assert.throws(() => repo.deleteAuditEvent(), /append-only/);
  console.log("ok: memory attachment hash dedupe + audit immutable API");
}

// ── Null Message-ID does not conflict ───────────────────────────────────────
{
  const repo = new InMemoryQuoteIntakeRepository();
  const a = repo.createCase({ organizationId: ORG_A, sourceMessage: {} });
  const b = repo.createCase({ organizationId: ORG_A, sourceMessage: {} });
  assert.notEqual(a.id, b.id);
  console.log("ok: null Message-ID values do not conflict");
}

// ── Supabase repo contract parity ───────────────────────────────────────────
async function assertRepoParity(repo) {
  const created = await repo.createCase({
    organizationId: ORG_A,
    createdByUserId: "user-1",
    sourceMessage: {
      internetMessageId: "<parity@example.com>",
      contentHash: "parity-hash-1"
    },
    attachments: [{ sha256: SHA, mimeType: "application/pdf", sizeBytes: 10 }]
  });
  assert.equal(created.organizationId, ORG_A);
  assert.equal(created.status, QUOTE_INTAKE_CASE_STATUS.RECEIVED);
  assert.equal(created.attachments.length, 1);

  await assert.rejects(
    async () =>
      repo.createCase({
        organizationId: ORG_A,
        sourceMessage: { internetMessageId: "<parity@example.com>" }
      }),
    (e) => e.code === "duplicate_message" && e.existingCaseId === created.id
  );

  // Same content hash + different Message-ID must NOT merge (content-hash is fallback only).
  const sameHashDifferentMsg = await repo.createCase({
    organizationId: ORG_A,
    sourceMessage: {
      internetMessageId: "<other-msg@example.com>",
      contentHash: "parity-hash-1"
    }
  });
  assert.notEqual(sameHashDifferentMsg.id, created.id);

  // Other org can reuse same Message-ID
  const other = await repo.createCase({
    organizationId: ORG_B,
    sourceMessage: { internetMessageId: "<parity@example.com>" }
  });
  assert.equal(other.organizationId, ORG_B);

  assert.equal(await repo.getCase(ORG_B, created.id), null);
  assert.ok(await repo.getCase(ORG_A, created.id));

  const decision = await repo.recordAutomationDecision({
    organizationId: ORG_A,
    intakeCaseId: created.id,
    path: AUTOMATION_PATH.MANUAL_REVIEW,
    reasonCodes: [AUTOMATION_REASON_CODE.SUBJECT_MARKER_MISSING],
    actorUserId: "user-1"
  });
  assert.equal(decision.path, AUTOMATION_PATH.MANUAL_REVIEW);
  assert.equal((await repo.getCase(ORG_A, created.id)).status, QUOTE_INTAKE_CASE_STATUS.MANUAL_REVIEW);

  const link1 = await repo.createTakeoffLink({
    organizationId: ORG_A,
    intakeCaseId: created.id,
    idempotencyKey: `${created.id}|${SHA}`,
    attachmentSha256: SHA,
    takeoffJobId: null
  });
  const link2 = await repo.createTakeoffLink({
    organizationId: ORG_A,
    intakeCaseId: created.id,
    idempotencyKey: `${created.id}|${SHA}`
  });
  assert.equal(link1.id, link2.id);

  const events = await repo.listAuditEvents(ORG_A, created.id);
  assert.ok(events.length >= 2);
  assert.throws(() => repo.updateAuditEvent(), /append-only/);
  assert.throws(() => repo.deleteAuditEvent(), /append-only/);

  // Child org spoof attempt (supabase only meaningful; memory ignores separate insert)
}

{
  const memory = new InMemoryQuoteIntakeRepository();
  await assertRepoParity(memory);
  console.log("ok: memory repository contract");
}

{
  const fake = new FakeQuoteIntakeSupabaseClient();
  const repo = new SupabaseQuoteIntakeRepository({ client: fake });
  await assertRepoParity(repo);

  // Concurrent unique race → deterministic duplicate
  const fake2 = new FakeQuoteIntakeSupabaseClient();
  const repo2 = new SupabaseQuoteIntakeRepository({ client: fake2 });
  await repo2.createCase({
    organizationId: ORG_A,
    sourceMessage: { internetMessageId: "<race@example.com>" }
  });
  fake2._forceUniqueOnNextCaseInsert = true;
  // Pre-check finds existing before insert — still duplicate_message
  await assert.rejects(
    async () =>
      repo2.createCase({
        organizationId: ORG_A,
        sourceMessage: { internetMessageId: "<race@example.com>" }
      }),
    (e) => e.code === "duplicate_message"
  );

  // Forced race when no pre-existing lookup: clear and force on first insert after partial check
  const fake3 = new FakeQuoteIntakeSupabaseClient();
  const repo3 = new SupabaseQuoteIntakeRepository({ client: fake3 });
  // Seed duplicate so after forced 23505 lookup finds it
  await repo3.createCase({
    organizationId: ORG_A,
    sourceMessage: { contentHash: "race-hash" }
  });
  // Bypass pre-check by using a new hash, then force unique on insert — won't find after
  fake3._forceUniqueOnNextCaseInsert = true;
  await assert.rejects(
    async () =>
      repo3.createCase({
        organizationId: ORG_A,
        sourceMessage: { contentHash: "brand-new-hash" }
      }),
    (e) => e.code === "duplicate_message"
  );

  // Child cross-org insert rejected by fake org trigger
  const parent = await repo.createCase({
    organizationId: ORG_A,
    sourceMessage: { contentHash: "child-parent" }
  });
  const { error: childErr } = await fake
    .from("quote_intake_attachments")
    .insert({
      organization_id: ORG_B,
      intake_case_id: parent.id,
      sha256: SHA2
    })
    .select()
    .single();
  assert.equal(childErr?.code, "23514");

  console.log("ok: supabase repository contract + race + child org guard");
}

// ── Never silent supabase→memory fallback ───────────────────────────────────
{
  /** @type {Map<string, Function[]>} */
  const routes = new Map();
  const app = {
    get(path, ...h) {
      routes.set(`GET ${path}`, h);
    },
    post(path, ...h) {
      routes.set(`POST ${path}`, h);
    }
  };
  const result = maybeAttachQuoteIntakeRoutes(app, {
    requireAuth: () => (_r, _s, n) => n(),
    headAccess: (_r, _s, n) => n(),
    env: {
      QUOTE_INTAKE_API_ENABLED: "1",
      QUOTE_INTAKE_REPOSITORY: "supabase"
      // no getSupabase
    }
  });
  assert.equal(result.mounted, false);
  assert.equal(result.code, "quote_intake_persistence_misconfigured");
  assert.equal(routes.size, 0);
  console.log("ok: supabase misconfig does not fall back to memory / does not mount");
}

// ── Migration file checks ───────────────────────────────────────────────────
{
  const sqlPath = join(
    __dirname,
    "../../supabase/eliteos_quote_intake_v1.sql"
  );
  const sql = readFileSync(sqlPath, "utf8");
  assert.ok(sql.includes("create table if not exists public.quote_intake_cases"));
  assert.ok(sql.includes("quote_intake_attachments"));
  assert.ok(sql.includes("quote_intake_automation_decisions"));
  assert.ok(sql.includes("quote_intake_audit_events"));
  assert.ok(sql.includes("quote_intake_takeoff_links"));
  assert.ok(sql.includes("enable row level security"));
  assert.ok(sql.includes("quote_intake_user_organization_id"));
  assert.ok(sql.includes("uq_quote_intake_cases_org_internet_message_id"));
  assert.ok(sql.includes("uq_quote_intake_cases_org_content_hash"));
  assert.ok(sql.includes("uq_quote_intake_attachments_case_sha256"));
  assert.ok(sql.includes("uq_quote_intake_takeoff_links_org_idempotency"));
  assert.ok(sql.includes("append-only"));
  assert.ok(sql.includes("revoke all on table public.quote_intake_cases from anon"));
  assert.ok(!sql.includes("references public.quote_takeoff_jobs"));
  assert.ok(!/create table[^;]*quote_headers/i.test(sql));
  assert.ok(sql.includes("No changes to quote_headers"));
  console.log("ok: migration contains RLS, dedupe indexes, no takeoff FK");
}

// ── Package boundary ────────────────────────────────────────────────────────
{
  const files = readdirSync(__dirname).filter(
    (f) => (f.endsWith(".mjs") || f.endsWith(".js")) && !f.includes(".test.")
  );
  const forbidden = [
    "internalQuoteTakeoffImport",
    "import-from-takeoff",
    "geminiTakeoffProvider",
    "openAiTakeoffProvider",
    "exayardTakeoffProvider",
    "takeoffExtractionService",
    "createTakeoffWorkspace",
    "runAiTakeoffExtraction",
    "@supabase/supabase-js",
    "quotePersist",
    "quoteCalculator",
    "quoteDelivery",
    "emailClient",
    "microsoft",
    "graph.microsoft"
  ];
  for (const file of files) {
    const src = readFileSync(join(__dirname, file), "utf8");
    for (const needle of forbidden) {
      assert.equal(src.includes(needle), false, `${file} must not reference ${needle}`);
    }
  }
  console.log("ok: no Graph/Gemini/Takeoff provider/IE/pricing/delivery deps");
}

// ── Security audit regressions (6P.2 closeout) ──────────────────────────────
{
  const sqlPath = join(__dirname, "../../supabase/eliteos_quote_intake_v1.sql");
  const sql = readFileSync(sqlPath, "utf8");

  // No SECURITY DEFINER functions (all invoker + fixed search_path).
  assert.equal(/security\s+definer/i.test(sql), false);
  assert.ok(sql.includes("set search_path = public"));
  assert.ok(sql.includes("security invoker"));
  assert.ok(sql.includes("revoke all on function public.quote_intake_user_organization_id() from public"));
  assert.ok(sql.includes("revoke all on function public.quote_intake_audit_immutable() from public"));
  assert.ok(sql.includes("revoke all on function public.quote_intake_enforce_child_org() from public"));
  assert.ok(sql.includes("revoke all on function public.quote_intake_cases_org_immutable() from public"));
  assert.ok(sql.includes("revoke all on function public.quote_intake_touch_updated_at() from public"));

  // RLS helper: after PUBLIC revoke, narrow authenticated EXECUTE (never anon/PUBLIC).
  {
    const helper = "quote_intake_user_organization_id";
    const revokePublicIdx = sql.indexOf(
      `revoke all on function public.${helper}() from public`
    );
    const revokeAnonIdx = sql.indexOf(`revoke all on function public.${helper}() from anon`);
    const grantAuthIdx = sql.indexOf(
      `grant execute on function public.${helper}() to authenticated`
    );
    const grantServiceIdx = sql.indexOf(
      `grant execute on function public.${helper}() to service_role`
    );
    assert.ok(revokePublicIdx >= 0, "RLS helper must revoke PUBLIC EXECUTE");
    assert.ok(revokeAnonIdx >= 0, "RLS helper must revoke anon EXECUTE");
    assert.ok(grantAuthIdx >= 0, "RLS helper must grant EXECUTE to authenticated");
    assert.ok(grantServiceIdx >= 0, "RLS helper may grant EXECUTE to service_role");
    assert.ok(
      revokePublicIdx < grantAuthIdx && revokeAnonIdx < grantAuthIdx,
      "authenticated EXECUTE grant must follow PUBLIC/anon revoke"
    );
    assert.equal(
      /grant\s+execute\s+on\s+function\s+public\.quote_intake_user_organization_id\(\)\s+to\s+anon\b/i.test(
        sql
      ),
      false,
      "RLS helper must not GRANT EXECUTE to anon"
    );
    assert.equal(
      /grant\s+execute\s+on\s+function\s+public\.quote_intake_user_organization_id\(\)\s+to\s+public\b/i.test(
        sql
      ),
      false,
      "RLS helper must not GRANT EXECUTE to PUBLIC"
    );
  }

  // Trigger-only functions: no authenticated EXECUTE grant; revoke JWT roles.
  for (const triggerFn of [
    "quote_intake_audit_immutable",
    "quote_intake_touch_updated_at",
    "quote_intake_enforce_child_org",
    "quote_intake_cases_org_immutable"
  ]) {
    assert.equal(
      new RegExp(
        `grant\\s+execute\\s+on\\s+function\\s+public\\.${triggerFn}\\(\\)\\s+to\\s+authenticated\\b`,
        "i"
      ).test(sql),
      false,
      `${triggerFn} must not GRANT EXECUTE to authenticated`
    );
    assert.ok(
      sql.includes(`revoke all on function public.${triggerFn}() from anon, authenticated`),
      `${triggerFn} must revoke anon/authenticated EXECUTE`
    );
  }

  // Cases UPDATE policy has USING + WITH CHECK
  assert.ok(
    /create policy quote_intake_cases_update_org[\s\S]*using \([\s\S]*with check \(/i.test(sql)
  );

  // Org immutable + child org enforcement
  assert.ok(sql.includes("quote_intake_cases_org_immutable"));
  assert.ok(sql.includes("quote_intake_enforce_child_org"));

  // Authenticated table privileges: cases SELECT/INSERT/UPDATE; children SELECT/INSERT;
  // no DELETE; no audit/child UPDATE.
  assert.ok(sql.includes("grant select, insert, update on table public.quote_intake_cases to authenticated"));
  assert.ok(sql.includes("grant select, insert on table public.quote_intake_attachments to authenticated"));
  assert.ok(
    sql.includes("grant select, insert on table public.quote_intake_automation_decisions to authenticated")
  );
  assert.ok(sql.includes("grant select, insert on table public.quote_intake_audit_events to authenticated"));
  assert.ok(sql.includes("grant select, insert on table public.quote_intake_takeoff_links to authenticated"));
  assert.ok(sql.includes("revoke delete on table public.quote_intake_cases from authenticated"));
  assert.ok(sql.includes("revoke delete on table public.quote_intake_attachments from authenticated"));
  assert.ok(sql.includes("revoke delete on table public.quote_intake_automation_decisions from authenticated"));
  assert.ok(sql.includes("revoke delete on table public.quote_intake_audit_events from authenticated"));
  assert.ok(sql.includes("revoke delete on table public.quote_intake_takeoff_links from authenticated"));
  assert.ok(sql.includes("revoke update on table public.quote_intake_attachments from authenticated"));
  assert.ok(sql.includes("revoke update on table public.quote_intake_automation_decisions from authenticated"));
  assert.ok(sql.includes("revoke update on table public.quote_intake_audit_events from authenticated"));
  assert.ok(sql.includes("revoke update on table public.quote_intake_takeoff_links from authenticated"));
  assert.ok(sql.includes("quote_intake_audit_events are append-only"));

  // Content-hash unique index requires Message-ID absent
  assert.ok(
    /uq_quote_intake_cases_org_content_hash[\s\S]*internet_message_id is null/i.test(sql)
  );

  console.log(
    "ok: migration security audit (search_path, RLS helper EXECUTE, trigger grants, table privileges, dedupe)"
  );
}

{
  // Memory/API-off must not call getSupabase or construct supabase repo.
  let getSupabaseCalls = 0;
  const explodingGetSupabase = () => {
    getSupabaseCalls += 1;
    throw new Error("SUPABASE credentials must not be required");
  };

  const mem = createQuoteIntakeRepository({
    env: { QUOTE_INTAKE_REPOSITORY: "memory" },
    getSupabase: explodingGetSupabase
  });
  assert.equal(mem.mode, "memory");
  assert.ok(mem.repository instanceof InMemoryQuoteIntakeRepository);
  assert.equal(getSupabaseCalls, 0);
  assert.equal(mem.repository instanceof SupabaseQuoteIntakeRepository, false);

  const routes = new Map();
  const app = {
    get(path, ...h) {
      routes.set(`GET ${path}`, h);
    },
    post(path, ...h) {
      routes.set(`POST ${path}`, h);
    }
  };
  const off = maybeAttachQuoteIntakeRoutes(app, {
    requireAuth: () => (_r, _s, n) => n(),
    getSupabase: explodingGetSupabase,
    env: { QUOTE_INTAKE_API_ENABLED: "0", QUOTE_INTAKE_REPOSITORY: "supabase" }
  });
  assert.equal(off.mounted, false);
  assert.equal(getSupabaseCalls, 0);
  assert.equal(routes.size, 0);
  console.log("ok: API-off / memory selection never touches Supabase credentials");
}

{
  // Every supabase repo write/read uses trusted org filter (spot-check via fake filters).
  const fake = new FakeQuoteIntakeSupabaseClient();
  const repo = new SupabaseQuoteIntakeRepository({ client: fake });
  const created = await repo.createCase({
    organizationId: ORG_A,
    sourceMessage: { internetMessageId: "<sec@example.com>" }
  });
  // Cross-org get/list empty
  assert.equal(await repo.getCase(ORG_B, created.id), null);
  assert.equal((await repo.listCases(ORG_B)).length, 0);
  await assert.rejects(
    async () =>
      repo.recordAutomationDecision({
        organizationId: ORG_B,
        intakeCaseId: created.id,
        path: AUTOMATION_PATH.MANUAL_REVIEW
      }),
    (e) => e.code === "case_not_found" || e.statusCode === 404
  );
  console.log("ok: service-role repo methods require trusted org filter");
}

{
  // Content-hash fallback: absent Message-ID duplicates; distinct Message-IDs do not.
  for (const makeRepo of [
    () => new InMemoryQuoteIntakeRepository(),
    () => new SupabaseQuoteIntakeRepository({ client: new FakeQuoteIntakeSupabaseClient() })
  ]) {
    const repo = makeRepo();
    const a = await repo.createCase({
      organizationId: ORG_A,
      sourceMessage: { contentHash: "fallback-hash" }
    });
    await assert.rejects(
      async () =>
        repo.createCase({
          organizationId: ORG_A,
          sourceMessage: { contentHash: "fallback-hash" }
        }),
      (e) => e.code === "duplicate_message"
    );
    const b = await repo.createCase({
      organizationId: ORG_A,
      sourceMessage: {
        internetMessageId: "<fb1@example.com>",
        contentHash: "fallback-hash"
      }
    });
    const c = await repo.createCase({
      organizationId: ORG_A,
      sourceMessage: {
        internetMessageId: "<fb2@example.com>",
        contentHash: "fallback-hash"
      }
    });
    assert.notEqual(a.id, b.id);
    assert.notEqual(b.id, c.id);
  }
  console.log("ok: content-hash fallback semantics (Message-ID absent only)");
}

console.log("\nAll phase6p2 tests passed.\n");
