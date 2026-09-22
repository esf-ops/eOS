/**
 * Sentinel demo knowledge — always approved+current for org demos.
 */
export async function ensureSentinelKnowledge(db, organizationId) {
  if (!organizationId) return { ok: false, skipped: true };

  const title = "SENTINEL CNC Edge Breakout SOP (demo)";
  const { data: existing } = await db
    .from("slab_ai_knowledge_documents")
    .select("id,status")
    .eq("organization_id", organizationId)
    .eq("title", title)
    .limit(1);

  if (existing?.[0]?.id) {
    try {
      await db
        .from("slab_ai_knowledge_documents")
        .update({
          status: "approved",
          is_current: true,
          is_active: true,
          authority: "company_policy",
          source_group_id: existing[0].id,
        })
        .eq("id", existing[0].id)
        .eq("organization_id", organizationId);
    } catch {
      /* Phase 2 schema without hub columns */
    }
    return { ok: true, documentId: existing[0].id, seeded: false };
  }

  const row = {
    organization_id: organizationId,
    title,
    source_type: "sop",
    manufacturer: "SENTINEL-OEM",
    machine_model: "SENTINEL-CNC-1",
    material: "Porcelain / Quartz",
    metadata: { sentinel: true, purpose: "dev_demo_only" },
    is_active: true,
    status: "approved",
    is_current: true,
    authority: "company_policy",
    version: 1,
    chunk_count: 3,
  };

  const { data: docRows, error: dErr } = await db
    .from("slab_ai_knowledge_documents")
    .insert(row)
    .select("id")
    .limit(1);

  if (dErr) {
    // Retry without Phase 3 columns
    const { data: legacy, error: lErr } = await db
      .from("slab_ai_knowledge_documents")
      .insert({
        organization_id: organizationId,
        title,
        source_type: "sop",
        manufacturer: "SENTINEL-OEM",
        machine_model: "SENTINEL-CNC-1",
        material: "Porcelain / Quartz",
        metadata: { sentinel: true, purpose: "dev_demo_only" },
        is_active: true,
      })
      .select("id")
      .limit(1);
    if (lErr) {
      const msg = String(lErr.message || "").toLowerCase();
      if (msg.includes("does not exist")) return { ok: false, installed: false };
      throw lErr;
    }
    const documentId = legacy?.[0]?.id;
    if (!documentId) return { ok: false, error: "insert failed" };
    await insertPassages(db, organizationId, documentId);
    return { ok: true, documentId, seeded: true };
  }

  const documentId = docRows?.[0]?.id;
  if (!documentId) return { ok: false, error: "insert failed" };

  await db
    .from("slab_ai_knowledge_documents")
    .update({ source_group_id: documentId })
    .eq("id", documentId)
    .catch(() => null);

  await insertPassages(db, organizationId, documentId);
  return { ok: true, documentId, seeded: true };
}

async function insertPassages(db, organizationId, documentId) {
  await db.from("slab_ai_knowledge_passages").insert([
    {
      organization_id: organizationId,
      document_id: documentId,
      locator: "page 1 · §3.2 Immediate checks",
      page_number: 1,
      section_title: "§3.2 Immediate checks",
      keywords: ["porcelain", "chipping", "cnc", "breakout", "water", "support"],
      sort_order: 1,
      search_text:
        "sentinel sop porcelain edge breakout coolant support guards interlocks tooling",
      text:
        "SENTINEL SOP: For porcelain edge breakout, stop the cycle, verify workpiece support at the cut exit, and confirm coolant is reaching the tool tip. Do not bypass guards or interlocks. Compare spindle and feed settings to the tooling supplier sheet before changing parameters — this SOP does not publish numeric RPM or feed values. Maximum spindle RPM (sentinel demo value): 4200.",
    },
    {
      organization_id: organizationId,
      document_id: documentId,
      locator: "page 2 · §4 Escalation",
      page_number: 2,
      section_title: "§4 Escalation",
      keywords: ["escalation", "maintenance", "supervisor"],
      sort_order: 2,
      search_text: "escalation supervisor maintenance tooling supplier",
      text:
        "SENTINEL SOP: If breakout continues after support and coolant checks, escalate to the shift supervisor and maintenance. Contact the tooling supplier for blade/tool condition guidance. Never invent manufacturer setpoints from memory.",
    },
    {
      organization_id: organizationId,
      document_id: documentId,
      locator: "Care appendix A",
      section_title: "Care appendix A",
      keywords: ["quartz", "care", "cleaning", "seal"],
      sort_order: 3,
      search_text: "quartz porcelain care cleaning ph-neutral",
      text:
        "SENTINEL care note: Clean quartz and porcelain surfaces with pH-neutral cleaner. Avoid abrasive powders. Manufacturer care instructions supersede this general shop note.",
    },
  ]);
}
