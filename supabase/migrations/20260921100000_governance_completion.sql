-- Governance completion: approval history is append-only, only a Draft approval
-- can be deleted, and a submitted approval's content is locked.
--
-- 1. approval_decisions was created with the same four policies as every other
--    governance table, although its own migration says "History rows are
--    append-only". Drop UPDATE and DELETE (policies and grants). Rows still go
--    away through the on delete cascade from their approval, which is a
--    referential action and not a policy. TRUNCATE is revoked too.
drop policy approval_decisions_update on public.approval_decisions;
drop policy approval_decisions_delete on public.approval_decisions;
revoke update, delete, truncate on public.approval_decisions from authenticated;

-- 2. Only a Draft approval may be deleted. Anything submitted is withdrawn
--    through the decide flow, which keeps its history.
drop policy approvals_delete on public.approvals;
create policy approvals_delete on public.approvals for delete to authenticated
  using (public.is_member_of(organization_id) and status = 'Draft');

-- 3. A submitted approval's content is locked. The decide flow changes only
--    status and decided_at, so it is unaffected; a Draft may still be edited and
--    submitted in the same update because the check reads the OLD status.
create or replace function public.approvals_lock_content() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.status <> 'Draft' and (
       new.title       is distinct from old.title
    or new.description is distinct from old.description
    or new.priority    is distinct from old.priority
    or new.due_date    is distinct from old.due_date
  ) then
    raise exception 'approvals_content_locked: only a Draft approval can be edited'
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger approvals_lock_content before update on public.approvals
  for each row execute function public.approvals_lock_content();
