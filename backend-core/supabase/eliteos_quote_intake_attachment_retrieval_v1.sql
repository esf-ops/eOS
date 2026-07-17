-- eliteOS Quote Intake — attachment retrieval metadata (Part 1 real-PDF fix)
--
-- DO NOT APPLY AUTOMATICALLY. Manual apply only after review:
--   Supabase SQL editor → paste → run once (IF NOT EXISTS / additive only).
--
-- Purpose:
--   The real-PDF handoff failure ("no_supported_pdf") happened because mailbox
--   import only ever persisted an attachment row when a PDF's bytes were fetched
--   and validated at import time. Any classification miss or byte failure left the
--   case with attachments: [] and no evidence of what arrived.
--
--   This migration lets import persist a metadata-only row for EVERY attachment
--   (supported or not) and defer byte retrieval + SHA-256 to Open Estimate.
--
-- Scope:
--   Additive columns on public.quote_intake_attachments only.
--   Existing quote_intake_* migration (eliteos_quote_intake_v1.sql) is NOT modified.
--   No changes to Digital Estimate, Studio estimate, or any pricing tables.

-- 1) sha256 is now populated only after server-side byte retrieval, so it must
--    be nullable at import time. Preserve the hex-format check when present.
alter table public.quote_intake_attachments
  alter column sha256 drop not null;

alter table public.quote_intake_attachments
  drop constraint if exists quote_intake_attachments_sha256_check;

alter table public.quote_intake_attachments
  add constraint quote_intake_attachments_sha256_check
  check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$');

-- 2) Classification + retrieval evidence captured at import time.
alter table public.quote_intake_attachments
  add column if not exists is_inline boolean not null default false;

alter table public.quote_intake_attachments
  add column if not exists attachment_kind text
    check (
      attachment_kind is null
      or attachment_kind in ('file', 'inline', 'item', 'pdf_candidate')
    );

alter table public.quote_intake_attachments
  add column if not exists support_classification text
    check (
      support_classification is null
      or support_classification in (
        'direct_pdf', 'inline_ignored', 'unsupported_item', 'metadata_only'
      )
    );

alter table public.quote_intake_attachments
  add column if not exists retrieval_state text not null default 'pending'
    check (retrieval_state in (
      'pending', 'not_applicable', 'retrieved', 'failed', 'unavailable'
    ));

-- Immutable provider message id per attachment (denormalized copy of the case's
-- graph_immutable_message_id) so byte retrieval never needs the client to supply it.
alter table public.quote_intake_attachments
  add column if not exists provider_message_id text
    check (
      provider_message_id is null
      or char_length(provider_message_id) between 1 and 2048
    );

-- 3) With sha256 nullable, dedupe metadata-only rows by provider attachment id.
create unique index if not exists uq_quote_intake_attachments_case_source_att
  on public.quote_intake_attachments (intake_case_id, source_attachment_id)
  where source_attachment_id is not null and trim(source_attachment_id) <> '';

comment on column public.quote_intake_attachments.support_classification is
  'Server-side attachment classification: direct_pdf | inline_ignored | unsupported_item | metadata_only.';
comment on column public.quote_intake_attachments.retrieval_state is
  'Byte retrieval lifecycle: pending (supported, not yet fetched) | not_applicable | retrieved | failed | unavailable.';
