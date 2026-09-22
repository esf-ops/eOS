-- eliteOS slabOS AI Knowledge Hub Phase 4 — hybrid retrieval (pgvector) + OCR provenance
-- Additive only. Manual apply after eliteos_slab_ai_v1.sql + eliteos_slab_ai_knowledge_hub_v1.sql.
-- See docs/eliteos/FEATURE_DECISIONS.md §370.
--
-- Requires: create extension vector (Supabase: enable pgvector)
-- Embedding model default: OpenAI text-embedding-3-small (1536 dims)
-- Distance: cosine (<=> with vector_cosine_ops)
-- Index: HNSW when extension available

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- Documents: OCR provenance / status
-- ---------------------------------------------------------------------------
alter table public.slab_ai_knowledge_documents
  add column if not exists extraction_method text not null default 'native',
  add column if not exists ocr_status text not null default 'not_required',
  add column if not exists ocr_provider text,
  add column if not exists ocr_page_count integer,
  add column if not exists ocr_error text,
  add column if not exists ocr_completed_at timestamptz,
  add column if not exists embedding_status text not null default 'pending',
  add column if not exists embedding_error text,
  add column if not exists embedded_at timestamptz;

do $$
begin
  alter table public.slab_ai_knowledge_documents
    drop constraint if exists slab_ai_knowledge_documents_extraction_method_check;
  alter table public.slab_ai_knowledge_documents
    add constraint slab_ai_knowledge_documents_extraction_method_check
    check (extraction_method in ('native', 'ocr', 'mixed'));
exception when others then
  raise notice 'extraction_method check: %', SQLERRM;
end $$;

do $$
begin
  alter table public.slab_ai_knowledge_documents
    drop constraint if exists slab_ai_knowledge_documents_ocr_status_check;
  alter table public.slab_ai_knowledge_documents
    add constraint slab_ai_knowledge_documents_ocr_status_check
    check (ocr_status in ('not_required', 'pending', 'complete', 'failed', 'skipped_limit'));
exception when others then
  raise notice 'ocr_status check: %', SQLERRM;
end $$;

do $$
begin
  alter table public.slab_ai_knowledge_documents
    drop constraint if exists slab_ai_knowledge_documents_embedding_status_check;
  alter table public.slab_ai_knowledge_documents
    add constraint slab_ai_knowledge_documents_embedding_status_check
    check (embedding_status in ('pending', 'complete', 'failed', 'not_required', 'partial'));
exception when others then
  raise notice 'embedding_status check: %', SQLERRM;
end $$;

-- ---------------------------------------------------------------------------
-- Passages: embeddings + OCR origin
-- ---------------------------------------------------------------------------
alter table public.slab_ai_knowledge_passages
  add column if not exists extraction_origin text not null default 'native',
  add column if not exists embedding vector(1536),
  add column if not exists embedding_model text,
  add column if not exists embedding_dimensions integer,
  add column if not exists embedding_version text,
  add column if not exists embedding_status text not null default 'pending',
  add column if not exists embedded_at timestamptz,
  add column if not exists embedding_error text;

do $$
begin
  alter table public.slab_ai_knowledge_passages
    drop constraint if exists slab_ai_knowledge_passages_extraction_origin_check;
  alter table public.slab_ai_knowledge_passages
    add constraint slab_ai_knowledge_passages_extraction_origin_check
    check (extraction_origin in ('native', 'ocr'));
exception when others then
  raise notice 'extraction_origin check: %', SQLERRM;
end $$;

do $$
begin
  alter table public.slab_ai_knowledge_passages
    drop constraint if exists slab_ai_knowledge_passages_embedding_status_check;
  alter table public.slab_ai_knowledge_passages
    add constraint slab_ai_knowledge_passages_embedding_status_check
    check (embedding_status in ('pending', 'complete', 'failed', 'not_required', 'stale'));
exception when others then
  raise notice 'passage embedding_status check: %', SQLERRM;
end $$;

-- HNSW cosine index (partial: only completed embeddings)
create index if not exists idx_slab_ai_knowledge_passages_embedding_hnsw
  on public.slab_ai_knowledge_passages
  using hnsw (embedding vector_cosine_ops)
  where embedding is not null and embedding_status = 'complete';

create index if not exists idx_slab_ai_knowledge_passages_embed_status
  on public.slab_ai_knowledge_passages (organization_id, embedding_status);

comment on column public.slab_ai_knowledge_passages.embedding is
  'OpenAI text-embedding-3-small (1536) cosine vector. Derived artifact — regenerate on model change.';

comment on column public.slab_ai_knowledge_documents.ocr_status is
  'OCR lifecycle. OCR text still requires human approval before retrieval.';

-- ---------------------------------------------------------------------------
-- Vector match RPC — always org-scoped + approved/current/active join
-- ---------------------------------------------------------------------------
create or replace function public.slab_ai_match_knowledge_passages(
  p_organization_id uuid,
  p_query_embedding vector(1536),
  p_match_count int default 12,
  p_source_types text[] default null,
  p_embedding_model text default null
)
returns table (
  passage_id uuid,
  document_id uuid,
  text text,
  locator text,
  page_number int,
  section_title text,
  sort_order int,
  extraction_origin text,
  distance float,
  title text,
  source_type text,
  authority text,
  manufacturer text,
  material text,
  machine_model text,
  version int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id as passage_id,
    p.document_id,
    p.text,
    p.locator,
    p.page_number,
    p.section_title,
    p.sort_order,
    p.extraction_origin,
    (p.embedding <=> p_query_embedding) as distance,
    d.title,
    d.source_type,
    d.authority,
    d.manufacturer,
    d.material,
    d.machine_model,
    d.version
  from public.slab_ai_knowledge_passages p
  inner join public.slab_ai_knowledge_documents d
    on d.id = p.document_id
   and d.organization_id = p.organization_id
  where p.organization_id = p_organization_id
    and p.embedding is not null
    and p.embedding_status = 'complete'
    and (p_embedding_model is null or p.embedding_model = p_embedding_model)
    and d.status = 'approved'
    and d.is_current = true
    and d.is_active = true
    and (p_source_types is null or d.source_type = any (p_source_types))
  order by p.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_match_count, 12), 40));
$$;

revoke all on function public.slab_ai_match_knowledge_passages(uuid, vector, int, text[], text) from public;
grant execute on function public.slab_ai_match_knowledge_passages(uuid, vector, int, text[], text) to service_role;

comment on function public.slab_ai_match_knowledge_passages is
  'Brain-only semantic retrieval. Filters approved+current+active org docs before ranking.';
