-- The daily CRM loop, hygiene after review of 20261010100000. Append-only: that
-- migration is already applied, so these changes are made here.

-- ---------------------------------------------------------------------------
-- A system entry derived from a quote's own timestamps must not be forgeable.
-- A member can write sent_at and accepted_at on a quote, so the trigger no longer
-- trusts them alone: an entry is written only when the quote's status agrees with
-- the timestamp (sent_at needs Sent or Accepted, accepted_at needs Accepted), and the
-- entry's time is capped at now so a timestamp in the future cannot be back-dated
-- into the timeline's future. Nothing else about the function changes.
-- ---------------------------------------------------------------------------
create or replace function public.log_quote_milestones() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.sent_at is not null and new.status in ('Sent', 'Accepted')
     and (tg_op = 'INSERT' or old.sent_at is null) then
    insert into public.activities(organization_id, kind, subject, occurred_at, created_by, quote_id)
    values (new.organization_id, 'quote.sent', 'Quote ' || new.quote_number || ' sent', least(new.sent_at, now()),
            public.activity_actor(new.organization_id), new.id);
  end if;
  if new.accepted_at is not null and new.status = 'Accepted'
     and (tg_op = 'INSERT' or old.accepted_at is null) then
    insert into public.activities(organization_id, kind, subject, occurred_at, created_by, quote_id)
    values (new.organization_id, 'quote.accepted', 'Quote ' || new.quote_number || ' accepted', least(new.accepted_at, now()),
            public.activity_actor(new.organization_id), new.id);
  end if;
  return new;
end $$;

-- create or replace keeps the existing ACL; stated again so the intent is on the page.
revoke all on function public.log_quote_milestones() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- activities_freeze is a trigger function; it was still executable by PUBLIC.
-- ---------------------------------------------------------------------------
revoke all on function public.activities_freeze() from public, anon, authenticated;
