-- eliteOS Internal Estimate Phase 2 — durable ESF quote numbers, revisions, archive flags.
--
-- Apply manually in Supabase SQL editor or via your migration runner (additive only).
-- Prerequisite: public.quote_headers exists (eos_quote_platform.sql).
--
-- Includes:
--   - quote_esf_sequences + atomic quote_allocate_esf_sequence()
--   - quote_headers: revision + archive columns (nullable-safe defaults)

-- ---------------------------------------------------------------------------
-- Sequence allocator (branch prefix × organization scope)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quote_esf_sequences (
  organization_key text NOT NULL,
  branch_prefix text NOT NULL,
  next_seq bigint NOT NULL DEFAULT 1 CHECK (next_seq >= 1),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (organization_key, branch_prefix)
);

COMMENT ON TABLE public.quote_esf_sequences IS
  'Atomic ESF quote number sequences per organization_key + branch_prefix (internal estimates).';

CREATE OR REPLACE FUNCTION public.quote_allocate_esf_sequence(p_organization_key text, p_branch_prefix text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seq bigint;
BEGIN
  INSERT INTO public.quote_esf_sequences (organization_key, branch_prefix, next_seq)
  VALUES (p_organization_key, p_branch_prefix, 1)
  ON CONFLICT (organization_key, branch_prefix)
  DO UPDATE SET
    next_seq = public.quote_esf_sequences.next_seq + 1,
    updated_at = now()
  RETURNING next_seq INTO v_seq;
  RETURN v_seq;
END;
$$;

COMMENT ON FUNCTION public.quote_allocate_esf_sequence(text, text) IS
  'Returns next sequence number for ESF-{PREFIX}-{NNNNNN} allocation (internal quotes).';

GRANT EXECUTE ON FUNCTION public.quote_allocate_esf_sequence(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.quote_allocate_esf_sequence(text, text) TO authenticated;

-- Optional security tightening (recommended before GA): if ESF sequences are allocated **only** via Brain (service role),
-- revoke client-callable RPC from JWT-capable roles to prevent sequence burning:
-- REVOKE EXECUTE ON FUNCTION public.quote_allocate_esf_sequence(text, text) FROM authenticated;

-- ---------------------------------------------------------------------------
-- quote_headers extensions
-- ---------------------------------------------------------------------------
ALTER TABLE public.quote_headers
  ADD COLUMN IF NOT EXISTS quote_family_root_id uuid REFERENCES public.quote_headers (id),
  ADD COLUMN IF NOT EXISTS revision_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS revision_label text,
  ADD COLUMN IF NOT EXISTS quote_number_base text,
  ADD COLUMN IF NOT EXISTS is_current_revision boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS revised_from_quote_id uuid REFERENCES public.quote_headers (id),
  ADD COLUMN IF NOT EXISTS revision_note text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by text;

COMMENT ON COLUMN public.quote_headers.quote_family_root_id IS
  'UUID of revision 1 row for this quote family; NULL on legacy rows before backfill.';
COMMENT ON COLUMN public.quote_headers.revision_number IS '1-based revision index within the family.';
COMMENT ON COLUMN public.quote_headers.revision_label IS 'Display label e.g. R1, R2.';
COMMENT ON COLUMN public.quote_headers.quote_number_base IS
  'Stable ESF-{BRANCH}-{NNNNNN} base shared by all revisions; quote_number adds -R{n} when n>1.';
COMMENT ON COLUMN public.quote_headers.is_current_revision IS
  'When false, row is a historical revision snapshot; Quote Library lists latest only by default.';
COMMENT ON COLUMN public.quote_headers.archived_at IS 'Soft-archive timestamp; hidden from default totals/lists.';

CREATE INDEX IF NOT EXISTS idx_quote_headers_family_root ON public.quote_headers (quote_family_root_id)
  WHERE quote_family_root_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quote_headers_archived_at ON public.quote_headers (archived_at)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quote_headers_internal_current
  ON public.quote_headers (quote_source, is_current_revision)
  WHERE quote_source = 'internal_quote';

-- ---------------------------------------------------------------------------
-- Backfill legacy internal quotes (single-row families)
-- ---------------------------------------------------------------------------
UPDATE public.quote_headers qh
SET
  quote_family_root_id = COALESCE(qh.quote_family_root_id, qh.id),
  revision_number = CASE WHEN qh.revision_number IS NULL OR qh.revision_number < 1 THEN 1 ELSE qh.revision_number END,
  revision_label = COALESCE(NULLIF(trim(qh.revision_label), ''), 'R1'),
  quote_number_base = COALESCE(
    qh.quote_number_base,
    CASE
      WHEN qh.quote_number ~ '^ESF-[A-Z]+-[0-9]{6}(-R[0-9]+)?$' THEN regexp_replace(qh.quote_number, '-R[0-9]+$', '')
      ELSE NULL
    END
  ),
  is_current_revision = COALESCE(qh.is_current_revision, true)
WHERE qh.quote_source = 'internal_quote';
