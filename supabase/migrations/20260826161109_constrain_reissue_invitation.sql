-- reissue_invitation as introduced in 20260826155704 checked only "is the
-- caller a HIMARK owner/admin", which the spec described as "the same
-- authorisation check as provision_organization". That was wrong for this
-- function specifically: provision_organization can only ever create a
-- *fresh* organization, but reissue_invitation reaches into *existing*
-- organizations the caller otherwise has no relationship to. Left
-- unconstrained, any HIMARK admin could call it against HIMARK's own
-- organization id to mint themselves an owner invitation (accept_invitation
-- does not check who issued an invitation), landing an active owner
-- membership in HIMARK -- exactly the escalation
-- 20260811161320_restrict_role_changes_to_owners.sql exists to prevent. The
-- same primitive could also inject an owner invitation into any tenant with
-- no prior relationship, authority HIMARK admins hold nowhere else (contrast
-- delete_organization, which requires owner of the *target* organization).
--
-- Two guards close this, applied unconditionally -- including to
-- service_role -- right after the existing HIMARK authorisation check:
--   1. Refuse when the target is HIMARK itself. This function exists to
--      recover client tenants; HIMARK's own ordinary invitation path already
--      works and needs no recovery primitive.
--   2. Require a prior owner-role invitation already exists for that exact
--      (organization_id, lower(email)) pair, regardless of status. That is
--      what makes this a *re*-issue rather than a fresh grant of control --
--      the caller can only replace an invitation provision_organization
--      already created, to the address it was originally sent to. Checked
--      status-agnostically on purpose: the recoverable cases are both a
--      still-pending invitation whose email failed to send, and one that has
--      since expired because the client never saw it.
create or replace function public.reissue_invitation(
  p_organization_id uuid,
  p_email text,
  p_token_hash text,
  p_expires_at timestamptz
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

  if auth.role() is distinct from 'service_role'
     and not public.has_role(himark_id, array['owner', 'admin']) then
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
    p_organization_id, lower(p_email), 'owner', p_token_hash, p_expires_at, auth.uid()
  )
  returning id into new_invitation;

  -- invitations has no audit trigger, so this function writes its own row.
  -- organization_id is included in new_value (matching the fix applied to
  -- provision_organization's hand-written invitations audit row in migration
  -- 20260826153239) because this row's own organization_id column is nulled
  -- out once delete_organization() runs (on delete set null) -- without the
  -- key inside the JSONB, cleanup()'s delivery-events sweep in
  -- tests/integration/rls/helpers.ts could never trace this row back to its
  -- fixture organization, and it would leak into the shared database.
  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, new_value
  ) values (
    p_organization_id, auth.uid(), 'invitations', new_invitation, 'insert',
    jsonb_build_object('via', 'reissue', 'role_id', 'owner', 'email', lower(p_email), 'organization_id', p_organization_id)
  );
end $$;
