import type { SlabAIAuthContext } from "@/lib/ai/executionContext";
import { toKnowledgeSource } from "./citations";
import type { KnowledgePassage, KnowledgeSearchInput } from "./types";

/**
 * Retrieve approved knowledge via Brain. Org scope enforced server-side.
 */
export async function retrieveKnowledge(
  auth: SlabAIAuthContext,
  input: KnowledgeSearchInput
): Promise<{ passages: KnowledgePassage[]; installed: boolean; error?: string }> {
  if (!auth.organizationId && auth.authMode !== "dev_bypass") {
    return { passages: [], installed: true, error: "Organization context required for knowledge retrieval." };
  }

  const base = brainBaseUrl();
  const params = new URLSearchParams();
  params.set("q", input.query.slice(0, 200));
  params.set("mode", input.mode || "hybrid");
  if (input.sourceTypes?.length) params.set("sourceTypes", input.sourceTypes.join(","));
  if (input.limit) params.set("limit", String(input.limit));
  if (input.seedSentinel) params.set("seed_sentinel", "1");
  if (input.manufacturer) params.set("manufacturer", input.manufacturer.slice(0, 80));
  if (input.machineModel) params.set("machineModel", input.machineModel.slice(0, 80));
  if (input.material) params.set("material", input.material.slice(0, 80));

  if (auth.authMode === "dev_bypass" || !auth.accessToken) {
    return { passages: localDevFixtures(input.query), installed: true };
  }

  const res = await fetch(`${base}/api/slab-ai/knowledge/search?${params}`, {
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (res.status === 503) {
    return { passages: localDevFixtures(input.query), installed: false, error: "Knowledge tables not installed; using local sentinel fixtures." };
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { passages: [], installed: true, error: body.error || `Knowledge search failed (${res.status})` };
  }

  const data = (await res.json()) as {
    passages?: Array<{
      id: string;
      text: string;
      locator?: string | null;
      relevance?: number;
      source: Record<string, unknown>;
    }>;
  };

  const passages: KnowledgePassage[] = (data.passages || []).map((p) => ({
    id: String(p.id),
    text: String(p.text || ""),
    locator: p.locator ?? null,
    relevance: p.relevance,
    pageNumber: (p as { pageNumber?: number }).pageNumber ?? null,
    sectionTitle: (p as { sectionTitle?: string }).sectionTitle ?? null,
    source: toKnowledgeSource(p.source),
  }));

  return { passages, installed: true };
}

function brainBaseUrl(): string {
  const raw = String(process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001").trim();
  return raw.replace(/\/+$/, "").replace(/\/api$/i, "");
}

/** Controlled local fixtures when Brain knowledge tables are not applied yet. */
function localDevFixtures(query: string): KnowledgePassage[] {
  const q = query.toLowerCase();
  const fixtures: KnowledgePassage[] = [
    {
      id: "passage-sentinel-cnc-1",
      locator: "§3.2 Immediate checks",
      relevance: 3,
      text:
        "SENTINEL SOP: For porcelain edge breakout, stop the cycle, verify workpiece support at the cut exit, and confirm coolant is reaching the tool tip. Do not bypass guards or interlocks. Compare spindle and feed settings to the tooling supplier sheet before changing parameters — this SOP does not publish numeric RPM or feed values.",
      source: {
        id: "doc-sentinel-cnc",
        title: "SENTINEL CNC Edge Breakout SOP (demo)",
        sourceType: "sop",
        manufacturer: "SENTINEL-OEM",
        machineModel: "SENTINEL-CNC-1",
        organizationId: null,
      },
    },
    {
      id: "passage-sentinel-care-1",
      locator: "Care appendix A",
      relevance: 2,
      text:
        "SENTINEL care note: Clean quartz and porcelain surfaces with pH-neutral cleaner. Avoid abrasive powders. Manufacturer care instructions supersede this general shop note.",
      source: {
        id: "doc-sentinel-care",
        title: "SENTINEL Material Care Note (demo)",
        sourceType: "material_care",
        manufacturer: "SENTINEL-OEM",
        organizationId: null,
      },
    },
  ];

  if (!q) return fixtures.slice(0, 1);
  return fixtures.filter((p) => {
    const hay = `${p.text} ${p.source.title} ${p.source.sourceType}`.toLowerCase();
    return q.split(/\s+/).some((t) => t.length > 2 && hay.includes(t));
  });
}
