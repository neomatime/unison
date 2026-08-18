-- memberships_update lets any owner/admin set status to 'removed' (or
-- role_id away from 'owner') on any row in their organization, including
-- the last remaining active owner's own membership.
-- enforce_membership_role_change only guards *who* may change role_id, not
-- whether the resulting state leaves the organization without an owner.
-- Once the last active owner is gone, nothing can ever grant 'owner' again
-- -- granting owner itself requires being an owner (memberships_update's
-- USING/WITH CHECK, and the role_id-change trigger) -- so the organization
-- becomes permanently unrecoverable without service-role access.
--
-- This is a companion trigger, not an extension of
-- enforce_membership_role_change: that trigger is a *permission* check (who
-- may move role_id at all), this one is a *data-integrity invariant* (the
-- org must always retain at least one active owner) that applies
-- regardless of who is making the change or which column moved it --
-- role_id leaving 'owner' or status leaving 'active' are both ways a row
-- stops counting as an active owner, and either can trip this guard.
-- Keeping them separate keeps each trigger's job and error message legible
-- rather than overloading one function with two different kinds of checks.
--
-- This must not block legitimate operations: an owner may still demote
-- themselves (role_id or status) when a second active owner exists, since
-- the exists-check below excludes only the row being updated (`id <>
-- old.id`) and would find that other owner. Admins removing ordinary
-- members never match the `old.role_id = 'owner'` guard condition at all,
-- so those updates never reach the exists-check.
create or replace function public.enforce_last_owner_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.role_id = 'owner' and old.status = 'active'
     and (new.role_id is distinct from 'owner' or new.status is distinct from 'active') then
    if not exists (
      select 1 from public.memberships
      where organization_id = old.organization_id
        and role_id = 'owner'
        and status = 'active'
        and id <> old.id
    ) then
      raise exception 'an organization must always have at least one active owner' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

revoke execute on function public.enforce_last_owner_guard() from public;
revoke execute on function public.enforce_last_owner_guard() from anon;
revoke execute on function public.enforce_last_owner_guard() from authenticated;

create trigger memberships_enforce_last_owner
  before update on public.memberships
  for each row execute function public.enforce_last_owner_guard();
