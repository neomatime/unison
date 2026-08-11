create or replace function public.accept_invitation(raw_token text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  invitation public.invitations;
  caller_email text;
  caller_verified boolean;
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
    update public.invitations set status = 'expired' where id = invitation.id;
    raise exception 'invitation has expired' using errcode = 'P0001';
  end if;
  if lower(invitation.email) <> lower(caller_email) then
    raise exception 'invitation was issued to a different address' using errcode = '28000';
  end if;

  insert into public.memberships (organization_id, user_id, role_id, status)
  values (invitation.organization_id, auth.uid(), invitation.role_id, 'active')
  on conflict (organization_id, user_id)
  do update set status = 'active', role_id = excluded.role_id;

  update public.invitations
  set status = 'accepted', accepted_at = now()
  where id = invitation.id;

  insert into public.audit_events (organization_id, actor_id, resource, resource_id, action, new_value)
  values (invitation.organization_id, auth.uid(), 'memberships', invitation.id, 'insert',
          jsonb_build_object('via', 'invitation', 'role_id', invitation.role_id));

  return invitation.organization_id;
end $$;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
