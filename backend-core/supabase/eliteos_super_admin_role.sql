-- Additive: allow optional `super_admin` application role (launcher + governance parity).
-- Apply manually in Supabase SQL editor when you intend to use super_admin accounts.
-- Safe to re-run: drops and recreates the same widened check constraint.

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
    'finance'
  )
);
