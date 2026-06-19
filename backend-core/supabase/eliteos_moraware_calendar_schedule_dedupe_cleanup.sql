-- eliteOS Moraware Calendar Schedule — one-time duplicate cleanup.
--
-- Run in Supabase SQL editor AFTER verifying duplicates exist.
-- Safe to re-run: only deactivates extra active rows (keeps one winner per stop key).
--
-- Schedule stop key (matches promotion idempotency):
--   organization_id + calendar_date + scheduled_start_time
--   + COALESCE(truck_or_crew_name, 'Unassigned') + activity_type + job_name
--
-- Winner preference: newest promoted_at, then newest created_at.

begin;

with ranked as (
  select
    id,
    row_number() over (
      partition by
        organization_id,
        calendar_date,
        coalesce(scheduled_start_time, ''),
        coalesce(truck_or_crew_name, 'Unassigned'),
        coalesce(activity_type, ''),
        coalesce(job_name, '')
      order by promoted_at desc nulls last, created_at desc, id desc
    ) as rn
  from public.moraware_calendar_schedule_rows
  where is_active = true
)
update public.moraware_calendar_schedule_rows target
set
  is_active = false,
  superseded_at = now(),
  updated_at = now()
from ranked source
where target.id = source.id
  and source.rn > 1;

commit;

-- Verification (should return zero rows):
-- select
--   calendar_date,
--   scheduled_start_time,
--   truck_or_crew_name,
--   activity_type,
--   job_name,
--   count(*) as duplicate_count
-- from public.moraware_calendar_schedule_rows
-- where is_active = true
-- group by 1, 2, 3, 4, 5
-- having count(*) > 1
-- order by duplicate_count desc, calendar_date;
