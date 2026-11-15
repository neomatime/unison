-- An event can carry an agenda: an ordered list of items, each a title and an optional length in minutes
-- ([{"title": "Intro", "minutes": 5}, ...]). Empty for every existing event. Additive: no row or policy changes.

alter table public.calendar_events
  add column agenda jsonb not null default '[]'::jsonb
    check (jsonb_typeof(agenda) = 'array' and jsonb_array_length(agenda) <= 20);
