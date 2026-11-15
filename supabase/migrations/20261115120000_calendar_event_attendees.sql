-- An event can list the people invited to it: [{"name": "Thandi Nkosi", "email": "thandi@example.com"}, ...]. When the event
-- has a Microsoft Teams meeting, Teams sends them the invitation. Empty for every existing event. Additive.

alter table public.calendar_events
  add column attendees jsonb not null default '[]'::jsonb
    check (jsonb_typeof(attendees) = 'array' and jsonb_array_length(attendees) <= 50);
