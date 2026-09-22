import { describe, expect, it } from "vitest";
import {
  classifyIntent,
  extractEntityHints,
  inferMachineFields,
  inferStoneCareFields,
  skillIdForIntent,
} from "@/lib/ai/assistant/intent";
import type { AssistantThreadContext } from "@/lib/ai/assistant/types";

describe("assistant intent classification", () => {
  const empty: AssistantThreadContext = {};

  it("classifies care guide requests", () => {
    expect(classifyIntent("Make a care guide for Cambria Whitendale.", empty)).toBe("stone_care");
  });

  it("classifies pull-up as ops lookup (load context, not brief)", () => {
    expect(classifyIntent("Pull up ABC Builders.", empty)).toBe("ops_lookup");
  });

  it("classifies brief language as account brief", () => {
    expect(classifyIntent("Brief me on ABC Builders before I call.", empty)).toBe("account_brief");
  });

  it("uses quote context for scope follow-ups", () => {
    expect(
      classifyIntent("Turn that into a scope I can send the customer.", {
        quoteId: "q1",
        quoteLabel: "ESF-1",
      })
    ).toBe("quote_scope");
  });

  it("classifies latest quote follow-up with account context", () => {
    expect(
      classifyIntent("Show me their latest quote.", { accountId: "a1", accountLabel: "ABC" })
    ).toBe("ops_lookup");
  });

  it("classifies shop chipping as machine troubleshooter", () => {
    expect(classifyIntent("We're getting chipping on a Taj Mahal miter on the BACA.", empty)).toBe(
      "machine_troubleshooter"
    );
  });

  it("classifies inventory questions", () => {
    expect(classifyIntent("Do we have any Taj Mahal that could work for a vanity?", empty)).toBe(
      "inventory_search"
    );
  });
});

describe("entity & field inference", () => {
  it("infers Cambria Whitendale stone care fields and asks only for application", () => {
    const message = "Make a care guide for Cambria Whitendale.";
    const hints = extractEntityHints(message);
    expect(hints.manufacturer).toMatch(/Cambria/i);
    expect(hints.productColor).toMatch(/Whitendale/i);
    expect(hints.material).toBe("Quartz");
    const inferred = inferStoneCareFields(message, hints);
    expect(inferred.fields.manufacturer).toMatch(/Cambria/i);
    expect(inferred.fields.productColor).toMatch(/Whitendale/i);
    expect(inferred.fields.material).toBe("Quartz");
    expect(inferred.missing.some((q) => q.field === "application")).toBe(true);
    expect(inferred.missing.some((q) => q.field === "productColor")).toBe(false);
  });

  it("infers machine/material from chipping message and asks for blade when missing", () => {
    const message = "We're getting exit chipping on a 3cm Taj Mahal miter on the BACA.";
    const inferred = inferMachineFields(message);
    expect(inferred.fields.manufacturer).toMatch(/BACA/i);
    expect(String(inferred.fields.material)).toMatch(/Quartzite/i);
    expect(inferred.fields.operation).toMatch(/Miter/i);
    expect(inferred.missing.some((q) => q.field === "bladeOrTool")).toBe(true);
  });

  it("maps intents to existing skill ids", () => {
    expect(skillIdForIntent("stone_care")).toBe("stone-care");
    expect(skillIdForIntent("quote_scope")).toBe("quote-scope");
    expect(skillIdForIntent("inventory_search")).toBeNull();
  });
});

describe("assistant turn planning (dev bypass)", () => {
  it("asks application clarify for care guide without inventing manufacturer docs", async () => {
    const { planAssistantTurn } = await import("@/lib/ai/assistant/runAssistant");
    const result = await planAssistantTurn({
      message: "Make a care guide for Cambria Whitendale.",
      context: {},
      auth: {
        userId: "00000000-0000-4000-8000-000000000001",
        organizationId: "00000000-0000-4000-8000-000000000099",
        role: "admin",
        displayName: "TEST",
        head: "slab_ai",
        accessToken: null,
        authMode: "dev_bypass",
      },
    });
    expect(result.mode).toBe("clarify");
    if (result.mode === "clarify") {
      expect(result.questions.some((q) => q.field === "application")).toBe(true);
      expect(result.suggestedFields?.manufacturer).toMatch(/Cambria/i);
    }
  });

  it("generates stone-care after application is provided", async () => {
    const { planAssistantTurn } = await import("@/lib/ai/assistant/runAssistant");
    const result = await planAssistantTurn({
      message: "Make a care guide for Cambria Whitendale.",
      context: {},
      clarifyAnswers: { application: "kitchen countertop" },
      auth: {
        userId: "00000000-0000-4000-8000-000000000001",
        organizationId: "00000000-0000-4000-8000-000000000099",
        role: "admin",
        displayName: "TEST",
        head: "slab_ai",
        accessToken: null,
        authMode: "dev_bypass",
      },
    });
    expect(result.mode).toBe("generate");
    if (result.mode === "generate") {
      expect(result.skillId).toBe("stone-care");
      expect(result.formData.application).toBe("kitchen countertop");
      expect(result.formData.productColor).toMatch(/Whitendale/i);
    }
  });

  it("retains account context for quote-scope follow-up", async () => {
    const { planAssistantTurn } = await import("@/lib/ai/assistant/runAssistant");
    const result = await planAssistantTurn({
      message: "Draft a scope from that.",
      context: {
        accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        accountLabel: "ABC Builders",
        quoteId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        quoteLabel: "ESF-18472",
      },
      auth: {
        userId: "00000000-0000-4000-8000-000000000001",
        organizationId: "00000000-0000-4000-8000-000000000099",
        role: "admin",
        displayName: "TEST",
        head: "slab_ai",
        accessToken: null,
        authMode: "dev_bypass",
      },
    });
    expect(result.mode).toBe("generate");
    if (result.mode === "generate") {
      expect(result.skillId).toBe("quote-scope");
      expect(result.formData.loadedQuoteId).toBe("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
      expect(result.context.accountId).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    }
  });

  it("asks machine clarifiers for chipping without fabricating setpoints", async () => {
    const { planAssistantTurn } = await import("@/lib/ai/assistant/runAssistant");
    const result = await planAssistantTurn({
      message: "We are getting chipping on a Taj Mahal miter.",
      context: {},
      auth: {
        userId: "00000000-0000-4000-8000-000000000001",
        organizationId: "00000000-0000-4000-8000-000000000099",
        role: "admin",
        displayName: "TEST",
        head: "slab_ai",
        accessToken: null,
        authMode: "dev_bypass",
      },
    });
    expect(result.mode).toBe("clarify");
    if (result.mode === "clarify") {
      expect(result.questions.some((q) => q.field === "manufacturer" || q.field === "bladeOrTool")).toBe(
        true
      );
    }
  });

  it("reports inventory requires brain auth in bypass mode (no invented qty)", async () => {
    const { planAssistantTurn } = await import("@/lib/ai/assistant/runAssistant");
    const result = await planAssistantTurn({
      message: "Do we have Taj Mahal?",
      context: {},
      auth: {
        userId: "00000000-0000-4000-8000-000000000001",
        organizationId: "00000000-0000-4000-8000-000000000099",
        role: "admin",
        displayName: "TEST",
        head: "slab_ai",
        accessToken: null,
        authMode: "dev_bypass",
      },
    });
    expect(result.mode).toBe("message");
    if (result.mode === "message") {
      expect(result.message.toLowerCase()).toMatch(/inventory|brain|slab_inventory/);
    }
  });
});
