-- Fix round 2 for the tier-entitlement Task 1 migration. The drop-and-recreate
-- in 20260901101908_organization_tier.sql carried the function body over intact
-- but dropped its explanatory comments; 20260901105344 restored one of them (the
-- email_domain one). This restores the rest. Comments only: every executable
-- statement below is byte-identical to the live definition, same signature, so
-- create or replace -- no grants to reapply.
--
-- The two that matter most are the ones above the hand-written audit_events
-- inserts. organization_id is duplicated *inside* new_value, in addition to the
-- row's own organization_id column, because cleanup() in
-- tests/integration/rls/helpers.ts traces fixture rows by that key. Without the
-- comment the duplication reads as redundant noise and invites removal, and
-- removing it makes the RLS suite leak fixture organizations into the shared
-- unison-uat database.
create or replace function public.provision_organization(
  p_name text,
  p_slug text,
  p_admin_email text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_tier text default 'core'
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
    raise exception 'p_expires_at must be in the future' using errcode = '22023';
  end if;

  if p_expires_at > now() + interval '30 days' then
    raise exception 'p_expires_at must be no more than 30 days in the future'
      using errcode = '22023';
  end if;

  -- The column's check constraint rejects an unknown tier, but doing it here
  -- names the parameter at fault rather than surfacing a constraint violation.
  if p_tier not in ('core', 'framework', 'enterprise', 'strategic-enterprise') then
    raise exception 'p_tier must be a known UNISON tier' using errcode = '22023';
  end if;

  -- email_domain is deliberately left null. It is what
  -- claim_directory_membership() matches on, and a client tenant that carried
  -- one would silently absorb anyone at that domain if Entra ever went
  -- multi-tenant.
  insert into public.organizations (name, slug, status, tier)
  values (p_name, p_slug, 'active', p_tier)
  returning id into new_org;

  -- organizations has no audit trigger (only set_updated_at), so the creation
  -- is recorded explicitly -- the same reason delete_organization() writes its
  -- own row. organization_id is included in new_value (in addition to the
  -- row's own organization_id column) so this row is traceable back to the
  -- fixture the same way the hand-written invitations row below is: cleanup()
  -- in tests/integration/rls/helpers.ts sweeps by that key, so dropping the
  -- duplication leaks fixture rows into the shared database.
  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, new_value
  ) values (
    new_org, auth.uid(), 'organizations', new_org, 'insert',
    jsonb_build_object('name', p_name, 'slug', p_slug, 'tier', p_tier, 'via', 'provisioning', 'organization_id', new_org)
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
  -- created) -- cleanup()'s delivery-events sweep in
  -- tests/integration/rls/helpers.ts needs it to trace this row back to a
  -- fixture, the same way it already does for frameworks, framework_phases and
  -- projects rows.
  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, new_value
  ) values (
    new_org, auth.uid(), 'invitations', new_invitation, 'insert',
    jsonb_build_object('via', 'provisioning', 'role_id', 'owner', 'email', lower(p_admin_email), 'organization_id', new_org)
  );

  return new_org;
end $$;
