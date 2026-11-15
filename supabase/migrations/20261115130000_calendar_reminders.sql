-- Reminders for calendar events: "remind me N minutes before". The reminder arrives as an ordinary notification (the bell),
-- for the person who owns or created the event.
--
-- There is no scheduler for this: the notifications API calls deliver_calendar_reminders() whenever the bell loads or
-- refreshes, and the function writes a notification for each event whose reminder time has come. Each reminder is written
-- once per start time (dedupe_key), so rescheduling an event reminds again, and a repeat call changes nothing.
--
-- Additive: new nullable columns, a new function. No existing row or policy changes.

alter table public.calendar_events
  add column reminder_minutes smallint check (reminder_minutes is null or reminder_minutes in (5, 10, 15, 30, 60, 120, 1440));

alter table public.notifications add column dedupe_key text;
create unique index notifications_dedupe_key_idx on public.notifications(user_id, dedupe_key) where dedupe_key is not null;

create or replace function public.deliver_calendar_reminders(p_organization_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  delivered integer;
begin
  with due as (
    select e.id, e.title, e.start_at, e.reminder_minutes, e.teams_join_url
    from public.calendar_events e
    where e.organization_id = p_organization_id
      and e.archived_at is null
      and e.status in ('Tentative', 'Confirmed')
      and e.reminder_minutes is not null
      and e.start_at > now()
      and e.start_at - make_interval(mins => e.reminder_minutes) <= now()
      and (
        e.created_by = auth.uid()
        or e.owner_id in (select m.id from public.team_members m where m.user_id = auth.uid() and m.organization_id = p_organization_id)
      )
  ), written as (
    insert into public.notifications (organization_id, user_id, title, body, category, href, dedupe_key)
    select
      p_organization_id,
      auth.uid(),
      'Starting soon: ' || due.title,
      to_char(due.start_at at time zone 'Africa/Johannesburg', 'Dy DD Mon, HH24:MI') || case when due.teams_join_url is not null then ' · Microsoft Teams meeting' else '' end,
      'Operations',
      '/operations/calendar/' || due.id,
      'calendar-reminder:' || due.id || ':' || extract(epoch from due.start_at)::bigint
    from due
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
    returning 1
  )
  select count(*) into delivered from written;
  return delivered;
end;
$$;

revoke all on function public.deliver_calendar_reminders(uuid) from public;
grant execute on function public.deliver_calendar_reminders(uuid) to authenticated;
