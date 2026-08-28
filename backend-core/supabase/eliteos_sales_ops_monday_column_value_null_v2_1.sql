-- eliteOS Sales Ops Monday mirror v2.1
-- Additive follow-up to eliteos_sales_ops_monday_full_mirror_v2.sql (already applied).
-- Monday empty columns arrive as JSON null; PostgREST maps that to SQL NULL.
-- Allow SQL NULL so empty columns are preserved without failing the census.
-- Does not drop tables, truncate, or rewrite v1.

alter table public.sales_ops_monday_column_values
  alter column value drop not null;
