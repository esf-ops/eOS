-- =============================================================================
-- eliteOS — job_title additive migration
-- =============================================================================
-- Adds a human-facing job title / display title column to user_profiles.
-- This is SEPARATE from `role`, which controls permissions.
--
-- MANUAL APPLY ONLY — do NOT run automatically via any script or CI step.
-- Apply once against the target Supabase project using the SQL editor or CLI.
--
-- Safe to re-run: uses IF NOT EXISTS guards throughout.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add job_title to user_profiles
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_profiles'
      AND column_name  = 'job_title'
  ) THEN
    ALTER TABLE public.user_profiles
      ADD COLUMN job_title text;

    COMMENT ON COLUMN public.user_profiles.job_title IS
      'Human-facing job title / display title. Display-only — does NOT affect permissions. '
      'Permission role is controlled by the `role` column and enforced by the backend.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
-- • job_title is nullable text with no constraint — freeform, display-only.
-- • The backend profile update endpoint (POST /api/admin/users/:userId/profile
--   and PATCH /api/admin/users/:userId) gracefully degrades: if this column is
--   not yet applied, the update proceeds without it and no error is surfaced to
--   callers.
-- • Users cannot set their own job_title via Profile & Preferences.
--   Only System Admin (admin or super_admin role, system_admin head access) can
--   write this field through the admin profile update endpoint.
-- • RLS: user_profiles already has RLS. This column inherits the same policy
--   (admins can update any row; users can read their own row).
-- =============================================================================
