-- eliteOS slabOS AI Knowledge Hub v1 — additive evolution of eliteos_slab_ai_v1 knowledge tables
-- Manual apply required. Does NOT drop Phase 2 tables.
-- See docs/eliteos/FEATURE_DECISIONS.md §369.
--
-- Storage bucket (create privately in Supabase dashboard if missing):
--   eliteos-slab-ai-knowledge  (public = false)
-- Path convention (enforced in Brain, not by path alone):
--   {organization_id}/{document_id}/v{version}/{safe_filename}

-- ---------------------------------------------------------------------------
-- Documents: lifecycle, storage, versioning, authority
-- ---------------------------------------------------------------------------
alter table public.slab_ai_knowledge_documents
  add column if not exists status text not null default 'approved',
  add column if not exists version integer not null default 1,
  add column if not exists source_group_id uuid,
  add column if not exists is_current boolean not null default true,
  add column if not exists superseded_by uuid,
  add column if not exists authority text not null default 'general_reference',
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists content_sha256 text,
  add column if not exists uploaded_by uuid,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_by uuid,
  add column if not exists rejected_at timestamptz,
  add column if not exists review_note text,
  add column if not exists processing_error text,
  add column if not exists processed_at timestamptz,
  add column if not exists chunk_count integer not null default 0,
  add column if not exists extraction_preview text,
  add column if not exists tooling_brand text,
  add column if not exists material_brand text,
  add column if not exists retrieval_count integer not null default 0,
  add column if not exists last_retrieved_at timestamptz;

-- Backfill: Phase 2 sentinel / existing active docs are treated as approved current versions
update public.slab_ai_knowledge_documents
set status = 'approved',
    is_current = true,
    authority = coalesce(nullif(authority, ''), 'general_reference')
where status is null or status = 'approved';

update public.slab_ai_knowledge_documents
set source_group_id = id
where source_group_id is null;

-- Status check (drop prior loose constraint if we add a named one)
do $$
begin
  alter table public.slab_ai_knowledge_documents
    drop constraint if exists slab_ai_knowledge_documents_status_check;
  alter table public.slab_ai_knowledge_documents
    add constraint slab_ai_knowledge_documents_status_check
    check (status in (
      'uploaded',
      'processing',
      'review_required',
      'approved',
      'rejected',
      'archived',
      'processing_failed'
    ));
exception when others then
  raise notice 'status check: %', SQLERRM;
end $$;

do $$
begin
  alter table public.slab_ai_knowledge_documents
    drop constraint if exists slab_ai_knowledge_documents_authority_check;
  alter table public.slab_ai_knowledge_documents
    add constraint slab_ai_knowledge_documents_authority_check
    check (authority in (
      'company_policy',
      'manufacturer_primary',
      'tooling_supplier',
      'internal_training',
      'general_reference'
    ));
exception when others then
  raise notice 'authority check: %', SQLERRM;
end $$;

-- Expand source_type allowlist (recreate check)
do $$
begin
  alter table public.slab_ai_knowledge_documents
    drop constraint if exists slab_ai_knowledge_documents_source_type_check;
  alter table public.slab_ai_knowledge_documents
    add constraint slab_ai_knowledge_documents_source_type_check
    check (source_type in (
      'sop',
      'machine_manual',
      'tooling_manual',
      'material_care',
      'manufacturer',
      'safety',
      'quote_policy',
      'install_standard',
      'training',
      'customer_care_policy',
      'sales_policy',
      'other'
    ));
exception when others then
  raise notice 'source_type check: %', SQLERRM;
end $$;

create index if not exists idx_slab_ai_knowledge_docs_org_status
  on public.slab_ai_knowledge_documents (organization_id, status, is_current);

create index if not exists idx_slab_ai_knowledge_docs_org_sha
  on public.slab_ai_knowledge_documents (organization_id, content_sha256)
  where content_sha256 is not null;

create index if not exists idx_slab_ai_knowledge_docs_source_group
  on public.slab_ai_knowledge_documents (organization_id, source_group_id, version desc);

-- ---------------------------------------------------------------------------
-- Passages: provenance + searchable text
-- ---------------------------------------------------------------------------
alter table public.slab_ai_knowledge_passages
  add column if not exists page_number integer,
  add column if not exists section_title text,
  add column if not exists search_text text,
  add column if not exists char_start integer,
  add column if not exists char_end integer;

create index if not exists idx_slab_ai_knowledge_passages_search
  on public.slab_ai_knowledge_passages
  using gin (to_tsvector('english', coalesce(search_text, text)));

comment on column public.slab_ai_knowledge_documents.status is
  'Lifecycle: uploaded/processing/review_required/approved/rejected/archived/processing_failed. Only approved+is_current+is_active is AI-retrievable.';

comment on column public.slab_ai_knowledge_documents.authority is
  'Semantic authority class for conflict resolution — not a fake confidence score.';

comment on column public.slab_ai_knowledge_documents.content_sha256 is
  'SHA-256 of original bytes for org-scoped duplicate detection.';
