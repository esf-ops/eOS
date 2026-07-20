-- ============================================================================
-- DESTRUCTIVE OPERATION — ONE-TIME MANUAL EXECUTION ONLY
-- ============================================================================
-- File: eliteos_workforce_scorecard_history_reset_v1.sql
--
-- WARNING:
--   • This permanently deletes HR Weekly Operations Scorecard HISTORY data.
--   • Intended for a one-time reset so weeks can be re-entered under the
--     corrected Thursday–Wednesday calendar (earliest: June 25–July 1, 2026).
--   • Do NOT run automatically during deploy.
--   • Copy/paste into the Supabase SQL Editor and run manually after review.
--
-- PRESERVED (not deleted):
--   • users / auth
--   • organizations
--   • workforce_grading_sections (section definitions)
--   • workforce_department_user_access (department assignments)
--   • workforce_roster_members (employee/roster records)
--   • workforce_mistake_categories
--   • workforce_grade_settings
--   • HR head permissions / user_head_access
--
-- DELETED (for Elite Stone Fabrication only):
--   • workforce_mistakes
--   • workforce_section_week_values
--   • workforce_section_week_snapshots
--   • workforce_grade_week_snapshots (legacy person-week grade freezes)
--
-- Organization scope:
--   Deletes only rows for organization_key = 'elite_stone_fabrication'.
--   If that key does not exist in your environment, stop and confirm the org
--   before changing the WHERE clause below.
-- ============================================================================

-- Resolve target organization
do $$
declare
  v_org_id uuid;
  v_mistakes int;
  v_values int;
  v_section_snaps int;
  v_person_snaps int;
begin
  select o.id
    into v_org_id
  from public.organizations o
  where o.organization_key = 'elite_stone_fabrication'
  limit 1;

  if v_org_id is null then
    raise exception
      'eliteos_workforce_scorecard_history_reset_v1: organization_key elite_stone_fabrication not found. Aborting — no rows deleted.';
  end if;

  raise notice 'Resetting scorecard history for organization_id=%', v_org_id;

  -- Child / transactional history first
  delete from public.workforce_mistakes
  where organization_id = v_org_id;
  get diagnostics v_mistakes = row_count;

  delete from public.workforce_section_week_values
  where organization_id = v_org_id;
  get diagnostics v_values = row_count;

  delete from public.workforce_section_week_snapshots
  where organization_id = v_org_id;
  get diagnostics v_section_snaps = row_count;

  -- Legacy person-based weekly grade freezes (if table exists / has rows)
  begin
    delete from public.workforce_grade_week_snapshots
    where organization_id = v_org_id;
    get diagnostics v_person_snaps = row_count;
  exception
    when undefined_table then
      v_person_snaps := 0;
      raise notice 'workforce_grade_week_snapshots not present — skipped';
  end;

  raise notice
    'Deleted mistakes=%, week_values=%, section_snapshots=%, person_snapshots=%',
    v_mistakes, v_values, v_section_snaps, v_person_snaps;

  raise notice
    'Preserved grading sections, department access, roster, categories, settings, users, and organizations.';
end $$;
