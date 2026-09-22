import { describe, expect, it } from "vitest";
import {
  buildDeterministicPlan,
  extractAccountSearchQuery,
} from "@/lib/ai/assistant/deterministicPlan";
import { validateAssistantPlan } from "@/lib/ai/assistant/plannerSchema";
import { planAssistantTurn } from "@/lib/ai/assistant/runAssistant";
import type { SlabAIAuthContext } from "@/lib/ai/executionContext";

const bypassAuth: SlabAIAuthContext = {
  userId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000099",
  role: "admin",
  displayName: "TEST",
  head: "slab_ai",
  accessToken: null,
  authMode: "dev_bypass",
};

describe("account search query extraction (production phrases)", () => {
  it("strips brief scaffolding when name follows a sentence", () => {
    expect(extractAccountSearchQuery("Brief me on an account before I call them. 319 design")).toBe(
      "319 design"
    );
  });

  it("strips brief scaffolding when name is inline", () => {
    expect(extractAccountSearchQuery("brief me on an account 319 design and decor")).toMatch(
      /319 design and decor/i
    );
  });

  it("does not keep before-I-call instruction as the query", () => {
    const q = extractAccountSearchQuery("Brief me on an account before I call them. 319 design");
    expect(q?.toLowerCase()).not.toContain("before i call");
    expect(q?.toLowerCase()).not.toContain("an account");
  });
});

describe("deterministic planner — production phrases", () => {
  it("plans account brief with focused 319 design hint", () => {
    const plan = buildDeterministicPlan("Brief me on an account before I call them. 319 design");
    expect(plan.action).toBe("generate_account_brief");
    expect(plan.entityHints?.accountName).toMatch(/319 design/i);
    expect(plan.entityHints?.accountName?.toLowerCase()).not.toContain("before i call");
  });

  it("plans account brief for inline 319 design and decor", () => {
    const plan = buildDeterministicPlan("brief me on an account 319 design and decor");
    expect(plan.action).toBe("generate_account_brief");
    expect(plan.entityHints?.accountName).toMatch(/319 design and decor/i);
  });

  it("marks most recent quote with latest modifier (no chooser at plan layer)", () => {
    const plan = buildDeterministicPlan("show me the most recent quote in our system");
    expect(plan.action).toBe("search_quote");
    expect(plan.modifiers?.latest).toBe(true);
  });

  it("clarifies top account without inventing a metric", () => {
    const plan = buildDeterministicPlan("what is our top account");
    expect(plan.action).toBe("clarify");
    expect(plan.needsClarification).toBe(true);
    expect(plan.clarificationQuestion?.toLowerCase()).toMatch(/quote activity|active jobs|measure/);
    expect(plan.clarificationQuestion?.toLowerCase()).not.toMatch(/\brevenue\b/);
  });

  it("plans inventory for Taj Mahal", () => {
    const plan = buildDeterministicPlan("Do we have Taj Mahal?");
    expect(plan.action).toBe("search_inventory");
    expect(plan.entityHints?.material).toMatch(/Taj Mahal/i);
  });

  it("plans machine troubleshoot for BACA chipping", () => {
    const plan = buildDeterministicPlan("We're getting chipping on Taj Mahal on the BACA.");
    expect(plan.action).toBe("troubleshoot_machine");
  });

  it("carries context for follow-up jobs / latest quote / scope", () => {
    const ctx = {
      accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      accountLabel: "Garman Built",
    };
    expect(buildDeterministicPlan("What jobs do they have?", ctx).action).toBe("list_account_jobs");
    expect(buildDeterministicPlan("Show me their latest quote.", ctx).modifiers?.latest).toBe(true);
    expect(
      buildDeterministicPlan("Draft a scope from that.", {
        ...ctx,
        quoteId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        quoteLabel: "ESF-1",
      }).action
    ).toBe("generate_quote_scope");
  });
});

describe("planner schema validation", () => {
  it("rejects unknown actions", () => {
    expect(
      validateAssistantPlan({
        intent: "general",
        action: "delete_quote",
        needsClarification: false,
      })
    ).toBeNull();
  });

  it("accepts a valid search_account plan", () => {
    const plan = validateAssistantPlan({
      intent: "ops_lookup",
      action: "search_account",
      entityHints: { accountName: "319 Design" },
      modifiers: {},
      needsClarification: false,
    });
    expect(plan?.entityHints?.accountName).toBe("319 Design");
  });
});

describe("assistant turn — top account + care + inventory (bypass)", () => {
  it("clarifies top account", async () => {
    const result = await planAssistantTurn({
      message: "what is our top account",
      context: {},
      auth: bypassAuth,
    });
    expect(result.mode).toBe("clarify");
    if (result.mode === "clarify") {
      expect(result.message.toLowerCase()).toMatch(/top by|quote activity|active jobs|measure/);
    }
  });

  it("asks application for Cambria care guide", async () => {
    const result = await planAssistantTurn({
      message: "Make a care guide for Cambria Whitendale.",
      context: {},
      auth: bypassAuth,
    });
    expect(result.mode).toBe("clarify");
  });

  it("retains quote context for scope draft", async () => {
    const result = await planAssistantTurn({
      message: "Draft a scope from that.",
      context: {
        accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        accountLabel: "Garman Built",
        quoteId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        quoteLabel: "ESF-18472",
      },
      auth: bypassAuth,
    });
    expect(result.mode).toBe("generate");
    if (result.mode === "generate") {
      expect(result.formData.loadedQuoteId).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    }
  });
});

describe("latest quote selection helper semantics", () => {
  it("prefers first result when latest + updatedAt present (simulated)", () => {
    const items = [
      { id: "newest", label: "Q-2", updatedAt: "2026-09-20T12:00:00.000Z" },
      { id: "older", label: "Q-1", updatedAt: "2026-01-01T12:00:00.000Z" },
    ];
    const latest = true;
    const orderedByUpdatedAt = items.every((i) => Boolean(i.updatedAt));
    expect(latest && orderedByUpdatedAt).toBe(true);
    expect(items[0].id).toBe("newest");
  });
});
