-- Additive: allow `estimator` on `user_profiles.role` (internal quoting / takeoff testers).
-- Apply manually in Supabase SQL editor when you want the role selectable from eliteOS System Admin Head.

alter table public.user_profiles drop constraint if exists user_profiles_role_check;

alter table public.user_profiles add constraint user_profiles_role_check check (
  role in (
    'admin',
    'super_admin',
    'executive',
    'sales',
    'production',
    'shop_tv',
    'installer',
    'accounting',
    'purchasing',
    'customer_service',
    'hr',
    'safety',
    'marketing',
    'dealer_admin',
    'dealer_user',
    'viewer',
    'finance',
    'estimator'
  )
);
