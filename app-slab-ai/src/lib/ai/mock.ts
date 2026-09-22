import type { SlabAITool } from "@/lib/ai-tools/types";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function buildMockContent(tool: SlabAITool, values: Record<string, unknown>): string {
  switch (tool.id) {
    case "remnant-pitch":
      return mockRemnant(values);
    case "machine-troubleshooter":
      return mockMachine(values);
    case "quote-scope":
      return mockQuote(values);
    case "stone-care":
      return mockCare(values);
    case "account-brief":
      return mockAccountBrief(values);
    default:
      return `### Output\n\nMock response for **${tool.title}**.\n`;
  }
}

export async function* streamMockContent(
  tool: SlabAITool,
  values: Record<string, unknown>,
  signal?: AbortSignal,
  contentOverride?: string
): AsyncGenerator<string> {
  const content = contentOverride ?? buildMockContent(tool, values);
  const chunks = content.match(/[\s\S]{1,48}/g) ?? [content];
  for (const chunk of chunks) {
    if (signal?.aborted) {
      throw Object.assign(new Error("Generation aborted"), { code: "ABORTED", status: 499 });
    }
    yield chunk;
    await delay(12);
  }
}

export function buildMockStructuredResult(
  tool: SlabAITool,
  values: Record<string, unknown>,
  opts: {
    passages: Array<{ id: string; source: { id: string; title: string; sourceType: string; manufacturer?: string | null }; locator?: string | null }>;
    warnings: string[];
    evidenceMode?: "verified" | "general" | "mixed" | "none";
    quote?: { quoteNumber?: string | null; projectName?: string | null } | null;
  }
) {
  let content = buildMockContent(tool, values);
  if (opts.quote?.quoteNumber) {
    content = `> Loaded from Quote ${opts.quote.quoteNumber}${opts.quote.projectName ? ` · ${opts.quote.projectName}` : ""}\n\n${content}`;
  }
  if (tool.id === "machine-troubleshooter") {
    if (opts.passages.length) {
      const body = buildMockContent(tool, values)
        .replace(/^### Diagnosis[\s\S]*?(?=### General Diagnostic Reasoning)/, "")
        .replace(/### Sources[\s\S]*?(?=### Safety Notes)/, "### Safety Notes");
      content = [
        "### Diagnosis",
        "",
        "Symptom reviewed against approved shop documentation.",
        "",
        "### Verified Manufacturer / Tooling Guidance",
        "",
        opts.passages
          .map((p) => `- **${p.source.title}**${p.locator ? ` (${p.locator})` : ""}: ${p.source.manufacturer || "approved source"}`)
          .join("\n"),
        "",
        "### General Diagnostic Reasoning",
        "",
        "(Inference layered on top of verified sources.)",
        "",
        body.replace("### General Diagnostic Reasoning\n\n", ""),
        "",
        "### Sources",
        "",
        ...opts.passages.map((p) => `- ${p.source.title}${p.locator ? ` — ${p.locator}` : ""}`),
      ].join("\n");
    } else {
      content = buildMockContent(tool, values);
      if (!content.includes("No approved technical source")) {
        content = `### General Diagnostic Reasoning\n\nNo approved technical source was found. Verify all numeric settings against manufacturer/tooling documentation.\n\n${content}`;
      }
    }
  }
  if (tool.id === "stone-care" && opts.passages.length) {
    content = `${content}\n\n### Sources used\n\n${opts.passages.map((p) => `- ${p.source.title}`).join("\n")}`;
  }

  return {
    content,
    sources: opts.passages.map((p) => ({
      id: p.source.id,
      title: p.source.title,
      locator: p.locator ?? null,
      sourceType: p.source.sourceType,
      manufacturer: p.source.manufacturer ?? null,
      version: null as number | null,
      authority: null as string | null,
      passageId: p.id as string | null,
    })),
    operationalSources: [] as Array<{
      type: string;
      entityId: string;
      label: string;
      fieldsUsed?: string[];
      retrievedAt: string;
      sourceSystem?: string | null;
    }>,
    warnings: opts.warnings,
    assumptions: [] as string[],
    evidenceMode: opts.evidenceMode,
    confidence: opts.passages.length ? ("medium" as const) : ("low" as const),
    contextInspector: {
      knowledgeCount: opts.passages.length,
      operationalCount: 0,
      actionsCalled: [] as string[],
      truncated: false,
    },
  };
}

function mockRemnant(values: Record<string, unknown>): string {
  const color = String(values.colorName ?? "Remnant");
  const material = String(values.materialType ?? "Stone");
  const L = Number(values.lengthIn ?? 0);
  const W = Number(values.widthIn ?? 0);
  const focus = String(values.possibleApplication ?? "miscellaneous");
  const area = ((L * W) / 144).toFixed(1);
  const vanityFit = L >= 30 && W >= 18;
  const deskFit = L >= 48 && W >= 24;

  return `### Opportunity Summary

This **${material}** remnant (**${color}**, approx. **${area} sq ft** face at ${L}" × ${W}") is positioned for smaller, high-visibility projects. Preferred focus: **${focus.replace(/-/g, " ")}**.

### Retail Listing

**${color} ${material} Remnant** — ${L}" × ${W}", ${values.thickness ?? "thickness TBD"}, ${values.finish ?? "finish TBD"}.
Ideal for a compact vanity, bar top, or custom accent when dimensions allow. Quantity: ${values.quantity ?? 1}.

### Suggested Applications

${vanityFit ? `- Vanity tops (dimensions support many single-vanity layouts)` : `- Vanity: **unlikely** at ${L}" × ${W}" — confirm template before promising`}
${deskFit ? `- Desk / tabletop accents` : `- Full desk tops: dimensions are tight; consider shelves or smaller accents instead`}
- Fireplace hearth pieces (verify depth against surround)
- Custom shelves or miscellaneous fabricator projects

### Social Post

Leftover doesn't mean leftover potential. This ${color} ${material} remnant (${L}" × ${W}") is ready for a vanity, bar, or custom piece. Message us for a cut check — no price invented here, just real sizes.

### Sales Email

Subject: ${color} remnant available (${L}" × ${W}")

Hi — we have a ${material} remnant in ${color} measuring roughly ${L}" × ${W}" (${values.thickness}). Based on size, it is best suited for smaller applications such as a vanity or accent piece. Happy to review your template against the piece before we commit.

### Assumptions

- Dimensions and finish are as provided by the user.
- No inventory hold or price is implied.
- Application fit is approximate pending template verification.
`;
}

function mockMachine(values: Record<string, unknown>): string {
  const symptom = String(values.symptom ?? "other");
  return `### Diagnosis

Symptom **${symptom}** on ${values.manufacturer ?? "machine"} ${values.model ?? ""} cutting ${values.material ?? "material"} (${values.materialThickness ?? "thickness TBD"}) with ${values.bladeOrTool ?? "tooling"}.

### General Diagnostic Reasoning

1. Tooling condition / wear relative to ${values.material ?? "the material"}
2. Fixturing or support allowing vibration during ${values.operation ?? "the cut"}
3. Coolant / water delivery inconsistency (verify, do not assume pressure values)
4. Parameter mismatch vs manufacturer/tooling documentation (**verify — do not invent setpoints**)

### Immediate Safe Checks

- Stop and secure the machine using normal shop procedure (do **not** bypass guards or interlocks).
- Inspect the cut edge and note where the defect starts.
- Confirm blade/tool identity: ${values.bladeOrTool ?? "as installed"}.
- Confirm water is flowing to the cut zone (qualitative check only).
- Operator-reported RPM/feed (${values.currentRpm || "n/a"} / ${values.currentFeedRate || "n/a"}) are **unverified** — compare to manufacturer/tooling specs before changing anything.

### Suggested Diagnostic Sequence

1. Document symptom (${symptom}) with photos and piece ID.
2. Verify tooling condition and mounting.
3. Verify fixturing/support and water delivery.
4. Compare current settings to **manufacturer/tooling documentation** (do not invent RPM/feed).
5. Make one controlled change at a time after verification.
6. Escalate if defect persists or safety systems are involved.

### Escalation

Stop and escalate to **supervisor / maintenance** if vibration is abnormal, guards/interlocks are involved, or you cannot verify setpoints. Contact **tooling supplier** for blade/tool recommendations and **machine manufacturer** for machine-specific tolerances.

### Sources

No approved technical source was attached to this mock run — treat numeric guidance as unverified.

### Safety Notes

- Never bypass guards, interlocks, or lockout/tagout.
- This assistant does **not** replace the machine manual or trained maintenance.
- Numeric setpoints require verification against approved documentation.
`;
}

function mockQuote(values: Record<string, unknown>): string {
  const name = String(values.customerProjectName ?? "Project");
  return `### Project Overview

**${name}** — ${values.projectType ?? "project"} in ${values.roomArea ?? "the specified area"} using ${values.materialColor ?? "selected material"} (${values.thickness ?? "thickness TBD"}, ${values.edgeProfile ?? "edge TBD"}).

### Included Scope

- Fabrication of countertop surfaces as described
- Edge profile: ${values.edgeProfile}
- Cutouts: ${values.sinkCutouts ?? 0} sink, ${values.cooktopCutouts ?? 0} cooktop, ${values.faucetHoles ?? 0} faucet hole(s)
${values.templateRequired ? "- Field template" : "- Template not included as selected"}
${values.installationRequired ? "- Professional installation" : "- Installation not included as selected"}
${values.tearOut ? "- Existing top tear-out as noted" : ""}

### Material Scope

Material/color: **${values.materialColor}**. Group/tier: ${values.materialGroup || "not specified"}. Approximate area context: ${values.approximateSqFt ?? "not provided"} sq ft (narrative only — **not a price calculation**).

### Fabrication Scope

Shop fabrication including profiling, cutouts, and finish work consistent with the selected edge and thickness. Backsplash: ${values.backsplash || "as confirmed"}. Waterfalls: ${values.waterfallPanels || "none noted"}.

### Installation Scope

${values.installationRequired ? "Installation of fabricated tops onto prepared cabinets/substrates within normal fabrication tolerances." : "Installation excluded per intake."}

### Customer Responsibilities

- Cabinet installation complete and level within agreed tolerances before template/install
- Provide customer-supplied items on time: ${values.customerSuppliedItems || "none noted"}
- Site access, utilities, and decision-maker availability

### Assumptions

- Layout matches the described rooms/areas
- No structural, plumbing, or electrical work is included unless separately contracted
- Pricing will come from eliteOS / company quote systems — **this draft invents no prices**

### Exclusions

- Plumbing, electrical, and cabinet modifications
- Repair of out-of-level cabinets beyond normal shimming
- Unspecified tear-out, wall repair, or paint
- Taxes, permits, and third-party products not listed

### Optional Items / Clarifications

- Confirm splash height, seam locations, and sink model before final fabrication
- Confirm whether cooktop is customer-supplied

### Customer-Friendly Proposal Narrative

Thank you for the opportunity to fabricate ${values.materialColor} surfaces for ${name}. This scope covers fabrication${values.installationRequired ? " and installation" : ""} as outlined above. Final pricing will be provided on your formal estimate from our quoting system; this document is scope language only.
`;
}

function mockCare(values: Record<string, unknown>): string {
  const material = String(values.material ?? "your surface");
  const natural = values.materialClass === "natural";
  return `### About Your Material

Your **${values.productColor ?? material}** ${material} surface (${values.finish ?? "selected finish"}) is intended for ${values.application ?? "its stated application"} (${values.environment ?? "indoor/outdoor as noted"}). ${values.manufacturer ? `Manufacturer noted: ${values.manufacturer}.` : "Manufacturer-specific limits were not supplied — general guidance below; manufacturer instructions supersede this document."}

### Daily Cleaning

Wipe with a soft cloth and mild pH-neutral cleaner or warm water. Dry to reduce spotting. Avoid abrasive pads.

### Products to Avoid

Avoid harsh chemicals, bleach, oven cleaners, and abrasive powders unless the manufacturer explicitly approves them. Do not assume warranty coverage for chemical damage.

### Heat & Impact

Use trivets for hot cookware and cutting boards for prep. Stone and engineered surfaces can be damaged by thermal shock or impact even when they feel durable.

### Sealing

Sealing status on file: **${values.sealingStatus ?? "unknown"}**. Follow manufacturer guidance for resealing intervals. If status is unknown, ask your fabricator before applying sealers.

### Natural Characteristics

${
  natural
    ? "Natural stone may show veining, fissures, pits, mineral variation, color movement, texture variation, resin/fill, and shade variation. These are characteristics of natural materials, not defects by themselves."
    : "Engineered materials typically offer more consistency than natural stone, but shade and pattern movement can still occur between slabs and lots. Resin/fill appearance varies by product."
}

### Customer Expectations

Surfaces are fabricated from real materials. Exact matches to a small sample or screen photo are not guaranteed. Manufacturer care instructions supersede this general guide. This document is not a warranty or legal contract.

### When to Contact Us

Contact your fabricator for chips, cracks, unusual staining, seam issues, or if you need product-specific manufacturer documentation.
`;
}

function mockAccountBrief(values: Record<string, unknown>): string {
  const id = String(values.accountId || "").trim();
  if (!id) {
    return `### Account Snapshot\n\nNo account selected. Search and select an Account Directory record before generating a brief.\n`;
  }
  return `### Account Snapshot

Selected account ID: \`${id}\`. Use the company data block for authoritative name, status, branch, and salesperson when present.

### Recent Quote Activity

Summarize only quotes supplied in operational context. If none were returned, say none were available in retrieved company data.

### Active Work

Summarize Moraware prepared jobs only when present. Do not invent install dates.

### Recent Changes

Note relationship health signals if supplied. Otherwise state that no change summary was available.

### Open Questions / Follow-Up Areas

${values.focusQuestion ? `Focus: ${values.focusQuestion}` : "Confirm open quotes, upcoming work, and missing contacts/locations if flagged."}

### Source Data Used

List only authorized company-data entities (account / quotes / jobs) from operational context — not invented CRM systems.
`;
}
