/**
 * Persistence helpers for slab_ai_generations / feedback.
 */

function isMissingTable(error) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("schema cache") || String(error?.code) === "42P01";
}

export async function insertGeneration(db, row) {
  const payload = { ...row };
  const { data, error } = await db.from("slab_ai_generations").insert(payload).select("id").limit(1);
  if (error) {
    if (isMissingTable(error)) return { ok: false, installed: false, error: error.message };
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data?.[0]?.id };
}

export async function updateGeneration(db, { id, organizationId, patch }) {
  const { data, error } = await db
    .from("slab_ai_generations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", organizationId)
    .select("id")
    .limit(1);
  if (error) {
    if (isMissingTable(error)) return { ok: false, installed: false, error: error.message };
    return { ok: false, error: error.message };
  }
  if (!data?.[0]) return { ok: false, error: "Not found", status: 404 };
  return { ok: true, id: data[0].id };
}

export async function listGenerations(db, { organizationId, userId, limit = 40 }) {
  const lim = Math.min(80, Math.max(1, Number(limit) || 40));
  const { data, error } = await db
    .from("slab_ai_generations")
    .select(
      "id,organization_id,user_id,tool_id,prompt_version,provider,model,model_class,status,started_at,completed_at,latency_ms,title,output_content,warnings,assumptions,source_metadata,retrieval_count,action_count,created_at"
    )
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(lim);
  if (error) {
    if (isMissingTable(error)) return { ok: false, installed: false, rows: [] };
    throw error;
  }
  return {
    ok: true,
    installed: true,
    rows: (data || []).map((r) => ({
      id: r.id,
      toolId: r.tool_id,
      promptVersion: r.prompt_version,
      provider: r.provider,
      model: r.model,
      modelClass: r.model_class,
      status: r.status,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      latencyMs: r.latency_ms,
      title: r.title,
      preview: String(r.output_content || "").slice(0, 280),
      warnings: r.warnings || [],
      assumptions: r.assumptions || [],
      sources: r.source_metadata || [],
      retrievalCount: r.retrieval_count,
      actionCount: r.action_count,
      createdAt: r.created_at
    }))
  };
}

export async function getGeneration(db, { organizationId, userId, id, allowOrgAdmin = false }) {
  let q = db.from("slab_ai_generations").select("*").eq("id", id).eq("organization_id", organizationId).limit(1);
  if (!allowOrgAdmin) q = q.eq("user_id", userId);
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error)) return { ok: false, installed: false };
    throw error;
  }
  const row = data?.[0];
  if (!row) return { ok: false, error: "Not found", status: 404 };
  return { ok: true, generation: row };
}

export async function upsertFeedback(db, { generationId, organizationId, userId, rating, comment }) {
  const gen = await getGeneration(db, { organizationId, userId, id: generationId });
  if (!gen.ok) return gen;

  const { error } = await db.from("slab_ai_generation_feedback").upsert(
    {
      generation_id: generationId,
      organization_id: organizationId,
      user_id: userId,
      rating,
      comment: comment ? String(comment).slice(0, 500) : null,
      created_at: new Date().toISOString()
    },
    { onConflict: "generation_id,user_id" }
  );
  if (error) {
    if (isMissingTable(error)) return { ok: false, installed: false, error: error.message };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
