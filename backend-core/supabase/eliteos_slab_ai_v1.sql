-- eliteOS slabOS AI Studio v1 — generation history, feedback, knowledge
-- Additive only. Manual apply required — do NOT run automatically.
-- Apply via Supabase SQL editor or authenticated CLI against the verified eliteOS production project.
-- See docs/eliteos/FEATURE_DECISIONS.md §368.
--
-- Security model:
--   Tables are organization-scoped. RLS enabled; no anon/authenticated policies grant access.
--   Brain (service role) reads/writes after requireAuth + requireHeadAccess("slab_ai")
--   and explicit organization_id checks in application code.
--
-- Graceful degradation:
--   Brain routes treat missing tables as 503/installed:false so the head still boots before apply.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Generation history
-- ---------------------------------------------------------------------------
create table if not exists public.slab_ai_generations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  tool_id text not null,
  prompt_version text not null default '0.0.0',
  provider text,
  model text,
  model_class text,
  status text not null default 'started'
    check (status in ('started', 'completed', 'failed', 'aborted')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  latency_ms integer,
  title text,
  input_snapshot jsonb not null default '{}'::jsonb,
  output_content text,
  warnings jsonb not null default '[]'::jsonb,
  assumptions jsonb not null default '[]'::jsonb,
  source_metadata jsonb not null default '[]'::jsonb,
  usage_metadata jsonb not null default '{}'::jsonb,
  retrieval_count integer not null default 0,
  action_count integer not null default 0,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_slab_ai_generations_org_created
  on public.slab_ai_generations (organization_id, created_at desc);

create index if not exists idx_slab_ai_generations_org_user_created
  on public.slab_ai_generations (organization_id, user_id, created_at desc);

create index if not exists idx_slab_ai_generations_tool
  on public.slab_ai_generations (organization_id, tool_id);

comment on table public.slab_ai_generations is
  'slabOS AI Studio generation history. Org-scoped; Brain service-role writes after slab_ai head gate. Does not store system prompts or secrets.';

-- ---------------------------------------------------------------------------
-- Feedback
-- ---------------------------------------------------------------------------
create table if not exists public.slab_ai_generation_feedback (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.slab_ai_generations(id) on delete cascade,
  organization_id uuid not null,
  user_id uuid not null,
  rating text not null check (rating in ('up', 'down')),
  comment text,
  created_at timestamptz not null default now(),
  unique (generation_id, user_id)
);

create index if not exists idx_slab_ai_feedback_org_created
  on public.slab_ai_generation_feedback (organization_id, created_at desc);

comment on table public.slab_ai_generation_feedback is
  'Thumbs feedback for slabOS AI generations. Org-scoped; one rating per user per generation.';

-- ---------------------------------------------------------------------------
-- Knowledge documents + passages (lightweight grounding foundation)
-- ---------------------------------------------------------------------------
create table if not exists public.slab_ai_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  title text not null,
  source_type text not null
    check (source_type in (
      'sop', 'machine_manual', 'tooling_manual', 'material_care',
      'manufacturer', 'safety', 'quote_policy', 'install_standard', 'other'
    )),
  source_uri text,
  manufacturer text,
  material text,
  machine_model text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_slab_ai_knowledge_docs_org_active
  on public.slab_ai_knowledge_documents (organization_id, is_active);

create index if not exists idx_slab_ai_knowledge_docs_type
  on public.slab_ai_knowledge_documents (organization_id, source_type);

create table if not exists public.slab_ai_knowledge_passages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  document_id uuid not null references public.slab_ai_knowledge_documents(id) on delete cascade,
  locator text,
  text text not null,
  keywords text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_slab_ai_knowledge_passages_org_doc
  on public.slab_ai_knowledge_passages (organization_id, document_id);

create index if not exists idx_slab_ai_knowledge_passages_keywords
  on public.slab_ai_knowledge_passages using gin (keywords);

comment on table public.slab_ai_knowledge_documents is
  'Approved knowledge documents for slabOS AI grounding. Org-scoped. Not a full DMS — ingestion can expand later.';

comment on table public.slab_ai_knowledge_passages is
  'Chunked passages for keyword/org-scoped retrieval. Future vector indexes can extend without replacing this contract.';

-- ---------------------------------------------------------------------------
-- RLS — deny browser Data API; Brain uses service role after app-level org checks
-- ---------------------------------------------------------------------------
alter table public.slab_ai_generations enable row level security;
alter table public.slab_ai_generation_feedback enable row level security;
alter table public.slab_ai_knowledge_documents enable row level security;
alter table public.slab_ai_knowledge_passages enable row level security;

-- No policies for anon/authenticated → default deny via Data API.
-- Service role bypasses RLS (Brain only).
