import { describe, expect, it } from "vitest";
import {
  buildOperationalSources,
  detectOperationalConflicts,
  filterValidatedOperationalSources,
  OPERATIONAL_LIMITS,
  serializeOperationalContext,
  type AIAccountSummary,
} from "@/lib/ai/operationalContext";
import { listActions, getAction } from "@/lib/ai/actions";
import { getToolById } from "@/lib/ai-tools/registry";
import { accountBriefSchema } from "@/lib/ai-tools/account-brief/schema";

describe("Phase 5 operational actions", () => {
  it("registers only read-mode actions", () => {
    const actions = listActions();
    expect(actions.length).toBeGreaterThanOrEqual(5);
    for (const a of actions) {
      expect(a.mode).toBe("read");
    }
  });

  it("account and inventory actions declare domain heads", () => {
    expect(getAction("searchAccounts")?.requiredHead).toBe("account_directory");
    expect(getAction("retrieveAccount")?.requiredHead).toBe("account_directory");
    expect(getAction("listAccountJobs")?.requiredHead).toBe("account_directory");
    expect(getAction("searchMaterials")?.requiredHead).toBe("slab_inventory");
  });

  it("quote scope allowlists quote + account actions", () => {
    const tool = getToolById("quote-scope");
    expect(tool?.allowedActions).toEqual(
      expect.arrayContaining(["searchQuotes", "retrieveQuote", "searchAccounts", "retrieveAccount"])
    );
    expect(tool?.knowledgeEnabled).toBe(true);
  });

  it("account brief requires selected account uuid", () => {
    const tool = getToolById("account-brief");
    expect(tool?.status).toBe("live");
    expect(tool?.knowledgeEnabled).toBe(false);
    expect(accountBriefSchema.safeParse({ accountId: "" }).success).toBe(false);
    expect(
      accountBriefSchema.safeParse({ accountId: "11111111-1111-4111-8111-111111111111" }).success
    ).toBe(true);
  });
});

describe("operational context assembly", () => {
  const account: AIAccountSummary = {
    accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    accountName: "ABC Builders — Cedar Rapids",
    branch: "Cedar",
    retrievedAt: "2026-09-22T12:00:00.000Z",
    sourceSystem: "account_directory",
  };

  it("builds server provenance for accounts/quotes/jobs", () => {
    const sources = buildOperationalSources({
      accounts: [account],
      quotes: [
        {
          quoteId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          quoteNumber: "ESF-CEDAR-1042",
          status: "Estimate Sent",
          accountName: "ABC Builders",
          customerName: "ABC Builders",
          projectName: "Kitchen",
          projectAddress: null,
          estimatedSqft: null,
          recordedTotal: null,
          rooms: [],
          lineHints: [],
          authority: "read-only",
          retrievedAt: "2026-09-22T12:00:00.000Z",
        },
      ],
      jobs: [{ jobId: "78342", jobName: "Job 78342", status: "Template Complete" }],
    });
    expect(sources.map((s) => s.type)).toEqual(["account", "quote", "job"]);
    expect(sources[1].label).toBe("ESF-CEDAR-1042");
  });

  it("rejects fabricated operational references", () => {
    const authorized = buildOperationalSources({ accounts: [account] });
    const filtered = filterValidatedOperationalSources(
      [
        { entityId: account.accountId, label: account.accountName, type: "account" },
        { entityId: "ffffffff-ffff-4fff-8fff-ffffffffffff", label: "Fake Quote", type: "quote" },
      ],
      authorized
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].entityId).toBe(account.accountId);
  });

  it("detects account/quote identity conflicts", () => {
    const warnings = detectOperationalConflicts({
      formValues: { customerProjectName: "XYZ Cabinets", materialColor: "Taj Mahal" },
      account,
      quote: {
        quoteId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        quoteNumber: "ESF-1",
        status: "draft",
        accountName: "Other Co",
        accountDirectoryAccountId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        customerName: "Other Co",
        projectName: "Bath",
        projectAddress: null,
        estimatedSqft: null,
        recordedTotal: null,
        rooms: [],
        lineHints: [{ description: "Calacatta quartz", quantity: 1, unit: "ea" }],
        authority: "read-only",
      },
    });
    expect(warnings.some((w) => /different Account Directory/i.test(w))).toBe(true);
    expect(warnings.some((w) => /differs from quote customer/i.test(w))).toBe(true);
    expect(warnings.some((w) => /material/i.test(w))).toBe(true);
  });

  it("serializes with deterministic limits and truncation notice", () => {
    const json = serializeOperationalContext({
      accounts: [account],
      jobs: Array.from({ length: 20 }, (_, i) => ({ jobId: String(i), jobName: `Job ${i}` })),
      truncated: true,
    });
    const parsed = JSON.parse(json.includes("…[truncated]") ? json.slice(0, json.indexOf("\n…")) : json);
    expect(parsed.jobs.length).toBeLessThanOrEqual(OPERATIONAL_LIMITS.maxJobs);
    expect(parsed.truncated).toBe(true);
    expect(parsed.instruction).toMatch(/truncated/i);
  });

  it("does not invent missing job status in serialization", () => {
    const json = serializeOperationalContext({
      jobs: [{ jobId: "1", jobName: "Only name" }],
    });
    expect(json).not.toMatch(/Template Complete/);
    expect(json).toContain("Only name");
  });
});

describe("multi-source eval cases (contract)", () => {
  it("knowledge-only tools stay free of operational allowlists", () => {
    const machine = getToolById("machine-troubleshooter");
    expect(machine?.knowledgeEnabled).toBe(true);
    expect(machine?.allowedActions || []).toHaveLength(0);
  });

  it("account brief is operational-only", () => {
    const brief = getToolById("account-brief");
    expect(brief?.knowledgeEnabled).toBe(false);
    expect(brief?.allowedActions).toEqual(
      expect.arrayContaining(["retrieveAccount", "searchAccounts", "listAccountJobs"])
    );
  });

  it("quote scope can combine ops + knowledge", () => {
    const qs = getToolById("quote-scope");
    expect(qs?.knowledgeEnabled).toBe(true);
    expect(qs?.allowedActions).toEqual(expect.arrayContaining(["retrieveQuote", "retrieveAccount"]));
  });
});
