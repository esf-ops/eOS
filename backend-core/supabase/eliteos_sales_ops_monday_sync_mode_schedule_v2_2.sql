-- Expand sales_ops_monday_sync_state.sync_mode for the Brain Vercel Cron schedule.
-- Existing CHECK only allowed ('full', 'incremental'). LIGHT_ACCOUNT / DEEP_REFRESH
-- / reproject progress rows must persist without rewriting applied v2 history.
--
-- Non-destructive: drop-and-replace CHECK to a wider allow-list. No table/column drops.

alter table public.sales_ops_monday_sync_state
  drop constraint if exists sales_ops_monday_sync_mode_chk;

alter table public.sales_ops_monday_sync_state
  add constraint sales_ops_monday_sync_mode_chk
  check (
    sync_mode in (
      'full',
      'incremental',
      'reproject',
      'light',
      'deep'
    )
  );
