-- eliteOS Workforce Quality — Managerial Financial Metrics (additive)
-- Manual apply: Supabase SQL editor → paste → run once (IF NOT EXISTS / DROP IF EXISTS safe).
--
-- Prerequisites:
--   eliteos_workforce_quality_sections_v1.sql
--   eliteos_workforce_department_access_v1.sql
--   eliteos_workforce_executive_dashboard_access_v1.sql (recommended if already applied)
--
-- 1) Widens workforce_department_user_access.department_slug CHECK to allow
--    access scope `managerial_financials`.
-- 2) Seeds three non-graded currency sections for elite_stone_fabrication.
--
-- Does not modify or delete existing department assignments or week values.
-- Application code excludes these section IDs from standard weekly report content
-- and from normal department → section mistake mapping.

-- ── Access scope CHECK (include executive_dashboard + managerial_financials) ──

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
      'executive_dashboard',
      'managerial_financials'
    )
  );

comment on table public.workforce_department_user_access is
  'Org-scoped department, executive_dashboard, and managerial_financials access assignments for Weekly Operations Scorecard.';

-- ── Seed managerial financial sections (ESF; idempotent) ─────────────────────

insert into public.workforce_grading_sections (
  id,
  organization_id,
  name,
  goal_display,
  goal_numeric,
  metric_kind,
  grading_enabled,
  sort_order,
  unit_label,
  is_active
)
select
  v.id,
  o.id,
  v.name,
  v.goal_display,
  v.goal_numeric,
  v.metric_kind,
  v.grading_enabled,
  v.sort_order,
  v.unit_label,
  true
from public.organizations o
cross join (
  values
    ('b2000001-0001-4001-8001-000000000014'::uuid, 'Line of Credit Balance', '—', null::numeric, 'currency', false, 140, 'USD'),
    ('b2000001-0001-4001-8001-000000000015'::uuid, 'Accounts Receivable over 45 Days', '—', null::numeric, 'currency', false, 150, 'USD'),
    ('b2000001-0001-4001-8001-000000000016'::uuid, 'Accounts Payable over 30 Days', '—', null::numeric, 'currency', false, 160, 'USD')
) as v(id, name, goal_display, goal_numeric, metric_kind, grading_enabled, sort_order, unit_label)
where o.organization_key = 'elite_stone_fabrication'
on conflict (id) do update set
  name = excluded.name,
  goal_display = excluded.goal_display,
  goal_numeric = excluded.goal_numeric,
  metric_kind = excluded.metric_kind,
  grading_enabled = excluded.grading_enabled,
  sort_order = excluded.sort_order,
  unit_label = excluded.unit_label,
  is_active = excluded.is_active,
  updated_at = now();
