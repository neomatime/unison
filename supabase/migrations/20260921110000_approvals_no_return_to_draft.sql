-- The content lock in 20260921100000 checked only the OLD status, so a member
-- could set a submitted approval back to 'Draft' (a status-only update touches no
-- locked column), then edit and delete it. A submitted approval never returns to
-- Draft: the decide flow moves it to Approved, Changes Requested, Rejected or
-- Withdrawn, and nothing legitimate sets Draft.
create or replace function public.approvals_lock_content() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.status <> 'Draft' then
    if new.status = 'Draft' then
      raise exception 'approvals_content_locked: a submitted approval cannot return to Draft'
        using errcode = '23514';
    end if;
    if new.title       is distinct from old.title
    or new.description is distinct from old.description
    or new.priority    is distinct from old.priority
    or new.due_date    is distinct from old.due_date then
      raise exception 'approvals_content_locked: only a Draft approval can be edited'
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
