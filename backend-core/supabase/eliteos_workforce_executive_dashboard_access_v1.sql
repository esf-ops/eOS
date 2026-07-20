-- eliteOS Workforce Quality — Executive Dashboard access scope (additive)
-- Manual apply: Supabase SQL editor → paste → run once (IF NOT EXISTS / DROP IF EXISTS safe).
--
-- Prerequisites:
--   eliteos_workforce_department_access_v1.sql
--
-- Widens workforce_department_user_access.department_slug CHECK so managers can assign
-- access_scope slug `executive_dashboard` (full scorecard / report / mistakes visibility).
-- Does not modify or delete existing department assignments.
--
-- Note: `executive_dashboard` is an access scope stored in department_slug for uniqueness
-- with (organization_id, user_id, department_slug). Application code excludes it from
-- normal department → section mapping.

alter table public.workforce_department_user_access
  drop constraint if exists workforce_department_user_access_department_slug_check;

alter table public.workforce_department_user_access
  add constraint workforce_department_user_access_department_slug_check
  check (
    department_slug in (
      'service_quality',
      'outside_partners',
      'plumbing',
      'shop_operations',
      'quoting',
      'machinery',
      'executive_dashboard'
    )
  );

comment on table public.workforce_department_user_access is
  'Org-scoped department group and executive_dashboard access assignments for Weekly Operations Scorecard.';
