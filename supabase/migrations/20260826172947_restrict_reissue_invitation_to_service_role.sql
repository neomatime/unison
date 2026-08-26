-- Two fixes, applied together because they touch the same two functions.
--
-- 1. The escalation chain (CRITICAL). provision_organization writes, for every
--    tenant it creates, exactly the owner invitation reissue_invitation's
--    guard 2 demands as proof that a reissue is a *re*-issue. Guard 2 is
--    therefore satisfied by construction for every tenant the product will
--    ever contain, and blocks only organizations this function never created.
--    Composed with list_provisioned_organizations (which hands any HIMARK
--    owner/admin the (id, admin_email) pair for every organization), the
--    caller-chosen p_token_hash, and the signed-out accept-invitation flow
--    (lib/invitations/create-invited-account.ts creates a *pre-confirmed*
--    account for the invited address with a caller-chosen password), any
--    HIMARK owner or admin could take owner access to any client tenant whose
--    administrator had not yet signed up -- without ever touching that
--    administrator's mailbox.
--
--    The cut: reissue_invitation has zero application callers (grep across
--    app/, features/, lib/ finds it only in comment and copy strings), so
--    dropping `authenticated` from its grant costs the product nothing today
--    and removes the caller-chosen-token primitive from every user-reachable
--    path. It stays available to a platform operator through a service-role
--    script, which is what a recovery tool should be.
--
--    provision_organization's grant is deliberately NOT touched: it has a real
--    application caller (features/internal-provisioning/actions/provision-organization.ts)
--    and revoking it would break the feature.
--
-- 2. p_expires_at was unvalidated in both functions (IMPORTANT). A year-3000
--    value mints an owner invitation that never lapses; a backdated one
--    creates a dead tenant whose already-expired invitation still occupies the
--    invitations_one_pending_per_email slot, recoverable only through
--    reissue_invitation. Both functions now clamp it: strictly in the future,
--    at most 30 days ahead, errcode 22023 (invalid_parameter_value). The clamp
--    sits *after* every authorisation check in each function so it can never
--    act as an oracle for a caller who is not entitled to be there at all.
create or replace function public.provision_organization(
  p_name text,
  p_slug text,
  p_admin_email text,
  p_token_hash text,
  p_expires_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  himark_id uuid;
  new_org uuid;
  new_invitation uuid;
  fw record;
  fw_id uuid;
  phase_name text;
  idx integer;
begin
  select id into himark_id
  from public.organizations
  where slug = 'himark' and status = 'active';

  if himark_id is null then
    raise exception 'internal organization not found' using errcode = '42501';
  end if;

  -- service_role is permitted the same way delete_organization permits it, so
  -- scripts and fixtures have a sanctioned path that is not a relaxed policy.
  if auth.role() is distinct from 'service_role'
     and not public.has_role(himark_id, array['owner', 'admin']) then
    raise exception 'only a HIMARK administrator may provision an organization'
      using errcode = '42501';
  end if;

  -- Applied unconditionally, service_role included: an expiry outside this
  -- window is a malformed invitation whichever caller supplies it.
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'p_expires_at must be in the future'
      using errcode = '22023';
  end if;

  if p_expires_at > now() + interval '30 days' then
    raise exception 'p_expires_at must be no more than 30 days in the future'
      using errcode = '22023';
  end if;

  -- email_domain is deliberately left null. It is what
  -- claim_directory_membership() matches on, and a client tenant that carried
  -- one would silently absorb anyone at that domain if Entra ever went
  -- multi-tenant.
  insert into public.organizations (name, slug, status)
  values (p_name, p_slug, 'active')
  returning id into new_org;

  -- organizations has no audit trigger (only set_updated_at), so the creation
  -- is recorded explicitly -- the same reason delete_organization() writes its
  -- own row. organization_id is included in new_value (in addition to the
  -- row's own organization_id column) so this row is traceable back to the
  -- fixture the same way the hand-written invitations row below is.
  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, new_value
  ) values (
    new_org, auth.uid(), 'organizations', new_org, 'insert',
    jsonb_build_object('name', p_name, 'slug', p_slug, 'via', 'provisioning', 'organization_id', new_org)
  );

  -- projects.framework_id is not null, so a tenant without frameworks meets a
  -- New Project form it cannot submit. frameworks and framework_phases both
  -- carry record_audit_event triggers, so these rows audit themselves.
  for fw in select * from (values
    ('Business / Technology Change', 'Enterprise', 'v3.2'),
    ('Automation Implementation',    'Technology', 'v2.4'),
    ('Client Onboarding',            'Operations', 'v4.1'),
    ('Regulatory Change',            'Compliance', 'v2.8'),
    ('Digital Transformation',       'Enterprise', 'v5.0'),
    ('Product Launch',               'Commercial', 'v1.9')
  ) as t(name, type, version)
  loop
    insert into public.frameworks (organization_id, name, type, version)
    values (new_org, fw.name, fw.type, fw.version)
    returning id into fw_id;

    idx := 1;
    foreach phase_name in array (
      case when fw.name = 'Client Onboarding'
        then array['Welcome','Company Setup','Information & Documentation','Agreements','Review & Approval','Go Live / Handover']
        else array['Initiate','Discover','Design','Build','Test','Ready','Deploy','Measure']
      end
    ) loop
      insert into public.framework_phases (framework_id, organization_id, name, position)
      values (fw_id, new_org, phase_name, idx);
      idx := idx + 1;
    end loop;
  end loop;

  insert into public.invitations (
    organization_id, email, role_id, token_hash, expires_at, invited_by
  ) values (
    new_org, lower(p_admin_email), 'owner', p_token_hash, p_expires_at, auth.uid()
  )
  returning id into new_invitation;

  -- invitations has no audit trigger either. organization_id is included in
  -- new_value because this row's own organization_id column is set to
  -- null (audit_events rows are org-scoped by the actor's authority, and a
  -- HIMARK admin calling this function is never a member of the tenant just
  -- created) -- cleanup()'s delivery-events sweep needs it to trace this row
  -- back to a fixture, the same way it already does for frameworks,
  -- framework_phases and projects rows.
  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, new_value
  ) values (
    new_org, auth.uid(), 'invitations', new_invitation, 'insert',
    jsonb_build_object('via', 'provisioning', 'role_id', 'owner', 'email', lower(p_admin_email), 'organization_id', new_org)
  );

  return new_org;
end $$;

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

  -- Same clamp as provision_organization, and the reason it matters more here:
  -- an unbounded p_expires_at on this path is a permanent owner invitation
  -- into an existing tenant rather than a 7-day one.
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'p_expires_at must be in the future'
      using errcode = '22023';
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

-- create or replace preserves the grants the function already had, so the
-- revoke has to be explicit. anon and public are restated rather than assumed:
-- if this function is ever dropped and recreated, Supabase's default grant to
-- anon comes back, and this line is what a future reader copies.
revoke all on function public.reissue_invitation(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.reissue_invitation(uuid, text, text, timestamptz) to service_role;
