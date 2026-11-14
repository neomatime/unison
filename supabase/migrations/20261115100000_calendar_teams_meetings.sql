-- A calendar event can carry a Microsoft Teams meeting: the join link people click, and the id of the event Microsoft
-- Graph made for it, so a later edit can keep that event's title and time in step. Both are empty for every existing
-- event and stay empty unless Teams is connected and the meeting option is chosen (see docs/calendar/teams-setup.md).
-- Additive: no existing row or policy changes; the table's row-level security already covers the new columns.

alter table public.calendar_events
  add column teams_join_url text check (teams_join_url is null or teams_join_url ~* '^https://[^[:space:]]+$'),
  add column teams_event_id text;
