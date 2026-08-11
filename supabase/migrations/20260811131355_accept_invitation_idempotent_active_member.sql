create or replace function public.accept_invitation(raw_token text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  invitation public.invitations;
  caller_email text;
  caller_verified boolean;
  existing_membership public.memberships;
  new_membership_id uuid;
  membership_old_value jsonb;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select email, (email_confirmed_at is not null)
    into caller_email, caller_verified
  from auth.users where id = auth.uid();

  if not caller_verified then
    raise exception 'email not verified' using errcode = '28000';
  end if;

  select * into invitation from public.invitations
  where token_hash = extensions.digest(raw_token, 'sha256')::text
  for update;

  if invitation.id is null then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  if invitation.status <> 'pending' then
    raise exception 'invitation is no longer pending' using errcode = 'P0001';
  end if;
  if invitation.expires_at < now() then
    -- Do not persist status = 'expired' here: the raise below aborts this
    -- entire transaction, which would roll back any update made earlier in
    -- the same call. Expiring stale invitations must happen out-of-band --
    -- e.g. on the invitation-sending path, or a scheduled sweep -- and is
    -- tracked as follow-up work, not solved inside this RPC.
    raise exception 'invitation has expired' using errcode = 'P0001';
  end if;
  if lower(invitation.email) is distinct from lower(caller_email) then
    raise exception 'invitation was issued to a different address' using errcode = '28000';
  end if;

  select * into existing_membership from public.memberships
  where organization_id = invitation.organization_id and user_id = auth.uid()
  for update;

  if existing_membership.id is not null and existing_membership.status = 'active' then
    -- Idempotent success: accepting an invitation for a membership the
    -- caller already actively holds is a repeat, not an error -- people
    -- double-click email links, and mail clients prefetch them. Consume
    -- the invitation and return normally without touching the membership
    -- row. Because nothing raises in this branch, this update actually
    -- persists (unlike the raise-then-rollback branches elsewhere in this
    -- function), which also prevents the stale row from permanently
    -- blocking future invitations to this address.
    update public.invitations
    set status = 'accepted', accepted_at = now()
    where id = invitation.id;

    return invitation.organization_id;
  end if;

  if existing_membership.id is not null then
    if existing_membership.status in ('suspended', 'removed') then
      -- Deliberate administrative state; an invitation must never
      -- reactivate it. Only an administrator restores this, so the
      -- invitation is deliberately left 'pending' (known, accepted gap).
      raise exception 'membership exists in a state that invitation acceptance cannot override' using errcode = '42501';
    end if;

    -- Only remaining possibility per the memberships status check
    -- constraint is 'invited': a placeholder row being activated, not a
    -- real existing membership being mutated.
    membership_old_value := jsonb_build_object('status', existing_membership.status, 'role_id', existing_membership.role_id);

    update public.memberships
    set status = 'active', role_id = invitation.role_id
    where id = existing_membership.id
    returning id into new_membership_id;
  else
    membership_old_value := null;

    insert into public.memberships (organization_id, user_id, role_id, status)
    values (invitation.organization_id, auth.uid(), invitation.role_id, 'active')
    returning id into new_membership_id;
  end if;

  update public.invitations
  set status = 'accepted', accepted_at = now()
  where id = invitation.id;

  insert into public.audit_events (organization_id, actor_id, resource, resource_id, action, old_value, new_value)
  values (
    invitation.organization_id,
    auth.uid(),
    'memberships',
    new_membership_id,
    'insert',
    membership_old_value,
    jsonb_build_object('via', 'invitation', 'invitation_id', invitation.id, 'role_id', invitation.role_id, 'status', 'active')
  );

  return invitation.organization_id;
end $$;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
