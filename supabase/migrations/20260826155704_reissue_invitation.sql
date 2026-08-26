-- Recovery for a specific failure: provision_organization commits, then the
-- email send fails. The raw token existed only in memory, so nobody can enter
-- the tenant -- and no HIMARK administrator can issue a replacement through
-- ordinary writes, because invitations_insert requires owner of that
-- organization and they hold no role there at all.
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

-- revoke ... from public alone does not strip Supabase's default grant to
-- anon (see migration 20260826153200_revoke_anon_provision_organization.sql,
-- which had to fix that gap for provision_organization after the fact) --
-- this function is written to never have that gap in the first place.
revoke all on function public.reissue_invitation(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.reissue_invitation(uuid, text, text, timestamptz) to authenticated, service_role;
