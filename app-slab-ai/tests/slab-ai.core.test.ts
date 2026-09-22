import { describe, expect, it } from "vitest";
import { getToolById, listCatalog, requireToolById, searchTools } from "../src/lib/ai-tools/registry";
import { remnantPitchSchema } from "../src/lib/ai-tools/remnant-pitch/schema";
import { machineTroubleshooterSchema } from "../src/lib/ai-tools/machine-troubleshooter/schema";
import { quoteScopeSchema } from "../src/lib/ai-tools/quote-scope/schema";
import { stoneCareSchema } from "../src/lib/ai-tools/stone-care/schema";
import { prepareGeneration, validateToolInput } from "../src/lib/ai/generate";
import { buildMockContent } from "../src/lib/ai/mock";
import { getAIProviderConfig, getModelIdForClass } from "../src/lib/ai/provider";
import { remnantPitchSystemPrompt } from "../src/lib/ai-tools/remnant-pitch/prompt";
import { machineTroubleshooterSystemPrompt } from "../src/lib/ai-tools/machine-troubleshooter/prompt";
import { quoteScopeSystemPrompt } from "../src/lib/ai-tools/quote-scope/prompt";

describe("slabOS AI registry", () => {
  it("lists live and coming-soon tools", () => {
    const catalog = listCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(4);
    expect(catalog.some((t) => t.id === "remnant-pitch")).toBe(true);
    expect(catalog.some((t) => t.status === "coming-soon")).toBe(true);
  });

  it("looks up tools by id", () => {
    expect(getToolById("stone-care")?.slug).toBe("stone-care");
  });

  it("rejects unknown tool ids", () => {
    expect(() => requireToolById("not-a-real-tool")).toThrow(/Unknown tool/);
  });

  it("rejects coming-soon tools for generation", () => {
    expect(() => requireToolById("commercial-bid")).toThrow(/not available/);
  });

  it("searches by keyword", () => {
    const hits = searchTools("cnc");
    expect(hits.some((t) => t.id === "machine-troubleshooter")).toBe(true);
  });
});

describe("schema validation", () => {
  it("accepts valid remnant pitch input", () => {
    const parsed = remnantPitchSchema.safeParse({
      materialType: "Quartz",
      colorName: "TEST-COLOR-SENTINEL",
      lengthIn: 48,
      widthIn: 26,
      thickness: "3 cm",
      finish: "Polished",
      quantity: 1,
      possibleApplication: "vanity",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid remnant dimensions", () => {
    const parsed = remnantPitchSchema.safeParse({
      materialType: "Quartz",
      colorName: "X",
      lengthIn: -1,
      widthIn: 10,
      thickness: "3 cm",
      finish: "Polished",
      quantity: 1,
      possibleApplication: "vanity",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires machine observations", () => {
    const parsed = machineTroubleshooterSchema.safeParse({
      manufacturer: "TEST-OEM",
      model: "TEST-MODEL",
      machineType: "bridge-saw",
      material: "Quartz",
      materialThickness: "3 cm",
      bladeOrTool: "TEST-BLADE",
      operation: "straight cut",
      symptom: "quartz-chipping",
      operatorObservations: "",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("provider selection", () => {
  it("enters mock mode without API key", () => {
    const prevKey = process.env.OPENAI_API_KEY;
    const prevMock = process.env.AI_MOCK_MODE;
    const prevNode = process.env.NODE_ENV;
    process.env.OPENAI_API_KEY = "";
    process.env.AI_MOCK_MODE = "";
    process.env.NODE_ENV = "development";
    const cfg = getAIProviderConfig();
    expect(cfg.mockMode).toBe(true);
    expect(cfg.provider).toBe("mock");
    process.env.OPENAI_API_KEY = prevKey;
    process.env.AI_MOCK_MODE = prevMock;
    process.env.NODE_ENV = prevNode;
  });

  it("routes model classes", () => {
    process.env.AI_MODEL_FAST = "fast-model-sentinel";
    process.env.AI_MODEL_REASONING = "reason-model-sentinel";
    expect(getModelIdForClass("fast")).toBe("fast-model-sentinel");
    expect(getModelIdForClass("reasoning")).toBe("reason-model-sentinel");
    delete process.env.AI_MODEL_FAST;
    delete process.env.AI_MODEL_REASONING;
  });
});

describe("mock generation", () => {
  it("builds fixture content for all live tools", () => {
    const remnant = requireToolById("remnant-pitch");
    const content = buildMockContent(remnant, {
      materialType: "Quartz",
      colorName: "SENTINEL-WHITE",
      lengthIn: 36,
      widthIn: 22,
      thickness: "3 cm",
      finish: "Polished",
      quantity: 1,
      possibleApplication: "vanity",
    });
    expect(content).toContain("Opportunity Summary");
    expect(content.toLowerCase()).not.toMatch(/\$\d/);
  });

  it("machine mock avoids invented authoritative setpoints language", () => {
    const tool = requireToolById("machine-troubleshooter");
    const content = buildMockContent(tool, {
      manufacturer: "TEST-OEM",
      model: "TEST-MODEL",
      machineType: "cnc",
      material: "Porcelain",
      materialThickness: "12 mm",
      bladeOrTool: "TEST-TOOL",
      operation: "polish",
      symptom: "porcelain-chipping",
      operatorObservations: "chip on exit edge",
    });
    expect(content).toContain("Verify");
    expect(content.toLowerCase()).toContain("never bypass");
    expect(content).not.toMatch(/set RPM to \d+/i);
  });

  it("quote mock does not invent pricing math", () => {
    const tool = requireToolById("quote-scope");
    const content = buildMockContent(tool, {
      customerProjectName: "TEST-PROJECT",
      projectType: "residential-kitchen",
      roomArea: "Kitchen",
      materialColor: "TEST-COLOR",
      thickness: "3 cm",
      edgeProfile: "Eased",
      sinkCutouts: 1,
      cooktopCutouts: 0,
      faucetHoles: 1,
      tearOut: false,
      templateRequired: true,
      installationRequired: true,
    });
    expect(content).toContain("Exclusions");
    expect(content.toLowerCase()).toContain("no price");
    expect(quoteScopeSystemPrompt.toLowerCase()).toContain("never");
    expect(quoteScopeSystemPrompt.toLowerCase()).toContain("pricing");
  });
});

const testAuth = {
  userId: "00000000-0000-4000-8000-000000000001",
  organizationId: "00000000-0000-4000-8000-000000000099",
  role: "viewer",
  displayName: "TEST",
  head: "slab_ai" as const,
  accessToken: null,
  authMode: "dev_bypass" as const,
};

describe("prepareGeneration contract", () => {
  it("validates and prepares mock generation", async () => {
    process.env.AI_MOCK_MODE = "1";
    process.env.SLAB_AI_DEV_AUTH_BYPASS = "1";
    process.env.NODE_ENV = "development";
    const prepared = await prepareGeneration({
      toolId: "stone-care",
      formData: {
        material: "Granite",
        productColor: "TEST-BLACK",
        materialClass: "natural",
        finish: "Polished",
        application: "Kitchen",
        environment: "indoor",
        sealingStatus: "sealed",
      },
      auth: testAuth,
    });
    expect(prepared.mockMode).toBe(true);
    expect(prepared.tool.id).toBe("stone-care");
    expect(prepared.executionContext.organization.id).toBe(testAuth.organizationId);
    const values = validateToolInput(prepared.tool, prepared.values);
    expect(stoneCareSchema.safeParse(values).success).toBe(true);
  });

  it("rejects unknown tools", async () => {
    await expect(prepareGeneration({ toolId: "nope", formData: {}, auth: testAuth })).rejects.toThrow(
      /Unknown tool/
    );
  });
});

describe("safety prompts", () => {
  it("remnant prompt forbids invented pricing", () => {
    expect(remnantPitchSystemPrompt).toMatch(/Do NOT invent pricing/i);
  });

  it("machine prompt forbids fabricated setpoints and safety bypass", () => {
    expect(machineTroubleshooterSystemPrompt).toMatch(/Do NOT fabricate authoritative RPM/i);
    expect(machineTroubleshooterSystemPrompt).toMatch(/Never instruct users to bypass/i);
  });
});
