-- Task 9b: restrict role changes to owners.
--
-- memberships_update lets any owner/admin write role_id, so an admin could
-- promote themselves to owner and lock out the real owner. A row policy's
-- WITH CHECK sees only the NEW row and USING sees only the OLD row -- neither
-- can compare the two directly -- so this is closed with a BEFORE UPDATE
-- trigger rather than a policy expression. The trigger composes with the
-- existing memberships_update policy rather than replacing it: the policy
-- still gates who may touch the row at all, the trigger additionally gates
-- whether role_id may move.
create or replace function public.enforce_membership_role_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.role_id is distinct from old.role_id
     and not public.has_role(old.organization_id, array['owner']) then
    raise exception 'only an owner may change role_id' using errcode = '42501';
  end if;
  return new;
end $$;

revoke execute on function public.enforce_membership_role_change() from public;
revoke execute on function public.enforce_membership_role_change() from anon;
revoke execute on function public.enforce_membership_role_change() from authenticated;

create trigger memberships_enforce_role_change
  before update on public.memberships
  for each row execute function public.enforce_membership_role_change();

-- memberships_insert: an admin could previously insert role_id = 'owner'
-- directly, reaching the same takeover by a different route than update.
drop policy memberships_insert on public.memberships;
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (
    public.has_role(organization_id, array['owner'])
    or (public.has_role(organization_id, array['admin']) and role_id <> 'owner')
  );

-- invitations_insert: same hole, one step removed -- an admin issues an
-- 'owner' invitation and accept_invitation() (which does not check who
-- issued the invitation) turns it into a real owner membership once
-- accepted.
drop policy invitations_insert on public.invitations;
create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (
    public.has_role(organization_id, array['owner'])
    or (public.has_role(organization_id, array['admin']) and role_id <> 'owner')
  );
