/**
 * Brain Agent head wiring — proves primary chat path is Brain Agent,
 * not legacy Skill/intent orchestration.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  BRAIN_AGENT_CHAT_PATH,
  LEGACY_ASSISTANT_PATH,
  buildBrainAgentContext,
  canShowBrainAgentDebug,
  formatEvidenceForDisplay,
  answerStateBanner,
  sanitizeDebugPayload,
  mergeResolvedFromEvidence,
} from "@/lib/brainAgent";
import type { BrainEvidenceItem } from "@/lib/brainAgent";

describe("A — primary chat path is Brain Agent", () => {
  it("exports Brain Agent path, not legacy assistant, as primary constant", () => {
    expect(BRAIN_AGENT_CHAT_PATH).toBe("/api/ai/brain-agent/run");
    expect(LEGACY_ASSISTANT_PATH).toBe("/api/ai/assistant");
    expect(BRAIN_AGENT_CHAT_PATH).not.toBe(LEGACY_ASSISTANT_PATH);
  });

  it("AssistantWorkspace source posts to Brain Agent path only", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.resolve(__dirname, "../src/components/assistant/AssistantWorkspace.tsx"),
      "utf8"
    );
    expect(src).toContain("BRAIN_AGENT_CHAT_PATH");
    expect(src).toContain("Ask eliteOS");
    expect(src).not.toMatch(/fetch\(\s*["']\/api\/ai\/assistant["']/);
    expect(src).not.toMatch(/classifyIntent|deterministicPlan|planAssistantTurn|runAssistant/);
  });
});

describe("B — multi-turn context without regex classification", () => {
  it("passes recent messages and resolved entities; no pronoun resolver", () => {
    const ctx = buildBrainAgentContext({
      resolved: {
        accountId: "11111111-1111-4111-8111-111111111111",
        accountLabel: "Garman Built",
      },
      recentMessages: [
        { role: "user", text: "What's going on with Garman Built?" },
        { role: "assistant", text: "Garman Built has 3 open jobs." },
        { role: "user", text: "Show me their latest quote." },
      ],
      latestEvidence: [
        {
          evidenceId: "ev_abc1234567890",
          sourceDomain: "account",
          entityType: "account",
          entityId: "11111111-1111-4111-8111-111111111111",
          data: { accountName: "Garman Built" },
        },
      ],
    });

    expect(ctx.accountLabel).toBe("Garman Built");
    expect(ctx.recentMessages?.map((m) => m.text)).toContain("Show me their latest quote.");
    expect(ctx.priorEvidenceRefs?.[0]?.label).toMatch(/Garman Built/);
    // No regex pronoun fields
    expect(JSON.stringify(ctx)).not.toMatch(/pronoun|coref|resolveTheir/i);
  });
});

describe("C — agent evidence is rendered as readable rows", () => {
  it("formats company and knowledge evidence without dumping raw objects", () => {
    const evidence: BrainEvidenceItem[] = [
      {
        evidenceId: "ev_quote0011111111",
        sourceDomain: "quote",
        entityType: "quote",
        entityId: "22222222-2222-4222-8222-222222222222",
        data: { quoteNumber: "18472", accountName: "Garman Built" },
      },
      {
        evidenceId: "ev_job001111111111",
        sourceDomain: "job",
        entityType: "job",
        entityId: "12345",
        data: { jobNumber: "12345", label: "Job 12345" },
      },
      {
        evidenceId: "ev_know00111111111",
        sourceDomain: "knowledge",
        entityType: "passage",
        entityId: "p1",
        data: { title: "Install standards — seams" },
      },
    ];
    const formatted = formatEvidenceForDisplay(evidence);
    expect(formatted.company.some((c) => c.label.includes("18472"))).toBe(true);
    expect(formatted.company.some((c) => /12345/.test(c.label))).toBe(true);
    expect(formatted.knowledge.some((k) => /seams/i.test(k.label))).toBe(true);
    expect(JSON.stringify(formatted)).not.toContain("calculation_snapshot");
  });

  it("merges resolved entity chips from evidence", () => {
    const next = mergeResolvedFromEvidence(
      {},
      [
        {
          evidenceId: "ev_acc00111111111",
          sourceDomain: "account",
          entityType: "account",
          entityId: "a1",
          data: { accountName: "Garman Built" },
        },
      ]
    );
    expect(next.accountId).toBe("a1");
    expect(next.accountLabel).toBe("Garman Built");
  });
});

describe("D — abstention states", () => {
  it("renders insufficient evidence banner", () => {
    const b = answerStateBanner("INSUFFICIENT_EVIDENCE");
    expect(b?.tone).toBe("info");
    expect(b?.label.toLowerCase()).toMatch(/authoritative|enough/);
  });

  it("renders capability unavailable", () => {
    const b = answerStateBanner("CAPABILITY_UNAVAILABLE");
    expect(b?.label.toLowerCase()).toMatch(/expose|available|agent/);
  });
});

describe("E — permission failure rendering", () => {
  it("renders permission denied distinctly", () => {
    const b = answerStateBanner("PERMISSION_DENIED");
    expect(b?.tone).toBe("deny");
    expect(b?.label.toLowerCase()).toMatch(/authorized|access/);
  });
});

describe("F — debug trace is admin-only", () => {
  it("allows admin / super_admin / executive only", () => {
    expect(canShowBrainAgentDebug("admin")).toBe(true);
    expect(canShowBrainAgentDebug("super_admin")).toBe(true);
    expect(canShowBrainAgentDebug("executive")).toBe(true);
    expect(canShowBrainAgentDebug("viewer")).toBe(false);
    expect(canShowBrainAgentDebug("salesperson")).toBe(false);
    expect(canShowBrainAgentDebug(null)).toBe(false);
  });

  it("sanitizes debug payload — no tokens / secrets keys", () => {
    const clean = sanitizeDebugPayload({
      ok: true,
      answerState: "SUPPORTED",
      toolCalls: 2,
      durationMs: 400,
      planner: "live",
      toolTrace: [{ capability: "brain.search_entities", ok: true }],
      validation: { ok: true, state: "SUPPORTED" },
      evidence: [{ evidenceId: "ev_1" }],
      accessToken: "secret-should-not-appear",
      serviceRoleKey: "nope",
    } as Record<string, unknown>);
    expect(clean.toolCalls).toBe(2);
    expect(clean.evidenceCount).toBe(1);
    expect(clean).not.toHaveProperty("accessToken");
    expect(clean).not.toHaveProperty("serviceRoleKey");
    expect(JSON.stringify(clean)).not.toMatch(/secret-should-not/);
  });
});

describe("G — Skill routes remain independent", () => {
  it("tools page still exists and is not the home page", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const toolsPage = await fs.readFile(
      path.resolve(__dirname, "../src/app/tools/page.tsx"),
      "utf8"
    );
    const homePage = await fs.readFile(path.resolve(__dirname, "../src/app/page.tsx"), "utf8");
    expect(toolsPage.length).toBeGreaterThan(20);
    expect(homePage).toContain("AssistantWorkspace");
    expect(homePage).not.toContain("ToolDirectory");
  });

  it("legacy assistant route is marked non-primary", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const route = await fs.readFile(
      path.resolve(__dirname, "../src/app/api/ai/assistant/route.ts"),
      "utf8"
    );
    expect(route).toMatch(/LEGACY/i);
    expect(route).toContain("legacyAssistant: true");
  });

  it("brain-agent proxy does not call classifyIntent / planAssistantTurn", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const route = await fs.readFile(
      path.resolve(__dirname, "../src/app/api/ai/brain-agent/run/route.ts"),
      "utf8"
    );
    expect(route).toContain("/api/brain-agent/run");
    expect(route).not.toMatch(/classifyIntent|planAssistantTurn|deterministicPlan|runAssistant/);
    expect(route).toContain("intentRouting: false");
  });
});

describe("Brain Agent proxy route behavior", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("proxies to Brain and tags path=brain-agent (not legacy)", async () => {
    process.env.SLAB_AI_DEV_AUTH_BYPASS = "";

    // Mock resolveSlabAiAuth via brain /api/slab-ai/context + brain run
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/slab-ai/context")) {
        return new Response(
          JSON.stringify({
            ok: true,
            userId: "u1",
            organizationId: "o1",
            role: "admin",
            displayName: "Admin",
            head: "slab_ai",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/api/brain-agent/run")) {
        const body = JSON.parse(String(init?.body || "{}")) as {
          message?: string;
          context?: { recentMessages?: unknown[] };
          debug?: boolean;
        };
        expect(body.message).toBe("Pull up Garman Built");
        expect(Array.isArray(body.context?.recentMessages)).toBe(true);
        expect(body.debug).toBe(true);
        return new Response(
          JSON.stringify({
            ok: true,
            answer: "Garman Built [ev_abc]",
            answerState: "SUPPORTED",
            evidence: [
              {
                evidenceId: "ev_abc123456789012",
                sourceDomain: "account",
                entityType: "account",
                entityId: "a1",
                data: { accountName: "Garman Built" },
              },
            ],
            toolCalls: 1,
            toolTrace: [{ capability: "brain.search_entities", ok: true }],
            durationMs: 120,
            planner: "live",
            validation: { ok: true, state: "SUPPORTED" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    }) as typeof fetch;

    const { POST } = await import("@/app/api/ai/brain-agent/run/route");
    const req = new Request("http://localhost/api/ai/brain-agent/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-token",
      },
      body: JSON.stringify({
        message: "Pull up Garman Built",
        context: {
          recentMessages: [{ role: "user", text: "Pull up Garman Built" }],
        },
        debug: true,
      }),
    });

    const res = await POST(req as unknown as import("next/server").NextRequest);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.path).toBe("brain-agent");
    expect(json.legacyAssistant).toBe(false);
    expect(json.answerState).toBe("SUPPORTED");
    expect(json.toolTrace).toBeTruthy();
  });

  it("strips toolTrace for non-admin debug requests", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/slab-ai/context")) {
        return new Response(
          JSON.stringify({
            ok: true,
            userId: "u2",
            organizationId: "o1",
            role: "viewer",
            head: "slab_ai",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url.includes("/api/brain-agent/run")) {
        return new Response(
          JSON.stringify({
            ok: true,
            answer: "denied path",
            answerState: "INSUFFICIENT_EVIDENCE",
            toolTrace: [{ capability: "secret", ok: false }],
            evidence: [],
            toolCalls: 0,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    const { POST } = await import("@/app/api/ai/brain-agent/run/route");
    const req = new Request("http://localhost/api/ai/brain-agent/run", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer viewer-token",
      },
      body: JSON.stringify({ message: "Anything", debug: true }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.toolTrace).toBeUndefined();
  });
});
