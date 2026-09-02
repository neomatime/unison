-- reissue_invitation has been service_role only since 20260826172947, which is
-- why it is not part of the account-takeover path provision_organization was.
-- What it still had was null attribution: invited_by and audit_events.actor_id
-- came from auth.uid(), which a service-role call does not have. The only
-- supported recovery path for a failed provisioning email therefore recorded
-- that an owner invitation was minted and not by whom.
--
-- Adding a parameter makes a new function, so this is a drop-and-recreate.
drop function public.reissue_invitation(uuid, text, text, timestamptz);

create function public.reissue_invitation(
  p_organization_id uuid,
  p_email text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_actor_id uuid
) returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  himark_id uuid;
  new_invitation uuid;
  prior_owner_invitation uuid;
begin
  select id into himark_id
  from public.organizations
  where slug = 'himark' and status = 'active';

  if himark_id is null then
    raise exception 'internal organization not found' using errcode = '42501';
  end if;

  if p_actor_id is null then
    raise exception 'p_actor_id is required' using errcode = '22023';
  end if;

  -- Unconditional, for the same reason as provision_organization: service_role
  -- is the only caller, so a bypass for it would be no check at all.
  if not public.has_role_for(himark_id, p_actor_id, array['owner', 'admin']) then
    raise exception 'only a HIMARK administrator may reissue an invitation'
      using errcode = '42501';
  end if;

  if p_organization_id = himark_id then
    raise exception 'reissue_invitation cannot target HIMARK''s own organization; use the ordinary invitation path'
      using errcode = '42501';
  end if;

  select id into prior_owner_invitation
  from public.invitations
  where organization_id = p_organization_id
    and lower(email) = lower(p_email)
    and role_id = 'owner'
  limit 1;

  if prior_owner_invitation is null then
    raise exception 'no prior owner invitation exists for that organization and address'
      using errcode = '42501';
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'p_expires_at must be in the future' using errcode = '22023';
  end if;

  if p_expires_at > now() + interval '30 days' then
    raise exception 'p_expires_at must be no more than 30 days in the future'
      using errcode = '22023';
  end if;

  -- Must be status, not expires_at. invitations_one_pending_per_email is a
  -- partial unique index on (organization_id, lower(email)) where status =
  -- 'pending', so backdating expires_at would leave the old row occupying the
  -- slot and the insert below would fail with 23505.
  update public.invitations
  set status = 'expired'
  where organization_id = p_organization_id
    and lower(email) = lower(p_email)
    and status = 'pending';

  insert into public.invitations (
    organization_id, email, role_id, token_hash, expires_at, invited_by
  ) values (
    p_organization_id, lower(p_email), 'owner', p_token_hash, p_expires_at, p_actor_id
  )
  returning id into new_invitation;

  -- invitations has no audit trigger, so this function writes its own row.
  -- organization_id is repeated inside new_value because the row's own column is
  -- nulled by delete_organization's on-delete-set-null; without the key in the
  -- JSONB, cleanup()'s sweep in tests/integration/rls/helpers.ts could never
  -- trace this row back to its fixture and it would leak into a shared database.
  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, new_value
  ) values (
    p_organization_id, p_actor_id, 'invitations', new_invitation, 'insert',
    jsonb_build_object('via', 'reissue', 'role_id', 'owner', 'email', lower(p_email), 'organization_id', p_organization_id)
  );
end $$;

revoke all on function public.reissue_invitation(uuid, text, text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function public.reissue_invitation(uuid, text, text, timestamptz, uuid)
  to service_role;
