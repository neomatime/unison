-- Turns a verified Microsoft sign-in into a membership.
--
-- Takes no arguments: every input comes from the caller's own session, so
-- there is nothing to forge. Only ever INSERTS — never updates — which keeps
-- it clear of enforce_membership_role_change and the last-owner guard rather
-- than fighting them.
create or replace function public.claim_directory_membership()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  caller_email text;
  caller_verified boolean;
  has_azure boolean;
  target_org uuid;
  existing_status text;
  new_membership_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select email, (email_confirmed_at is not null)
    into caller_email, caller_verified
  from auth.users where id = auth.uid();

  if not caller_verified or caller_email is null then
    raise exception 'email not verified' using errcode = '28000';
  end if;

  -- Require a Microsoft identity. Without this, anyone who obtained an address
  -- at a registered domain by another route could grant themselves access.
  -- This function must do exactly one thing.
  select exists (
    select 1 from auth.identities
    where user_id = auth.uid() and provider = 'azure'
  ) into has_azure;

  if not has_azure then
    raise exception 'no directory identity' using errcode = '28000';
  end if;

  select id into target_org
  from public.organizations
  where email_domain = lower(split_part(caller_email, '@', 2))
    and status = 'active';

  -- No organization registered for this domain. An ordinary outcome, not an
  -- incident: return null and let the caller reject cleanly.
  if target_org is null then
    return null;
  end if;

  select status into existing_status
  from public.memberships
  where organization_id = target_org and user_id = auth.uid()
  for update;

  if existing_status = 'active' then
    -- Already a member. Idempotent: change nothing, return the organization.
    return target_org;
  end if;

  -- A revoked account's Entra login still works, so this branch is the only
  -- thing between a removed employee and the data. Raise rather than return
  -- null so the attempt is distinguishable in logs from an unknown domain.
  if existing_status in ('suspended', 'removed') then
    raise exception 'membership revoked' using errcode = '42501';
  end if;

  insert into public.memberships (organization_id, user_id, role_id, status)
  values (target_org, auth.uid(), 'member', 'active')
  returning id into new_membership_id;

  insert into public.audit_events (organization_id, actor_id, resource, resource_id, action, new_value)
  values (
    target_org, auth.uid(), 'memberships', new_membership_id, 'insert',
    jsonb_build_object('via', 'directory', 'role_id', 'member', 'status', 'active')
  );

  return target_org;
end $$;

revoke execute on function public.claim_directory_membership() from public, anon;
grant execute on function public.claim_directory_membership() to authenticated;
