-- Backfill canonical Quote Name from stored email subject for Quote Flow takeoff jobs.
-- Safe / deterministic only: subject present, quoteName empty, not user-set.
-- Does not invent names. Does not overwrite intentional estimator names.

UPDATE public.quote_takeoff_jobs j
SET metadata =
  jsonb_set(
    jsonb_set(
      jsonb_set(
        coalesce(j.metadata, '{}'::jsonb),
        '{quoteFlow,quoteName}',
        to_jsonb(trim(j.metadata->'quoteFlow'->>'requestSubject')),
        true
      ),
      '{quoteFlow,quoteNameUserSet}',
      'false'::jsonb,
      true
    ),
    '{quoteFlow,quoteNameSource}',
    '"backfill_subject"'::jsonb,
    true
  )
WHERE j.metadata ? 'quoteFlow'
  AND nullif(trim(j.metadata->'quoteFlow'->>'requestSubject'), '') IS NOT NULL
  AND length(trim(j.metadata->'quoteFlow'->>'requestSubject')) >= 3
  AND trim(j.metadata->'quoteFlow'->>'requestSubject') !~* '\.(pdf|png|jpe?g|webp|heic|tif{1,2}|gif|bmp)$'
  AND (
    j.metadata->'quoteFlow'->>'quoteName' IS NULL
    OR trim(j.metadata->'quoteFlow'->>'quoteName') = ''
  )
  AND coalesce(j.metadata->'quoteFlow'->>'quoteNameUserSet', 'false') IS DISTINCT FROM 'true';
