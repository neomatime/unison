-- Creating a tenant cannot be done with ordinary writes: organizations has no
-- insert policy at all, and invitations_insert requires owner of the target
-- organization -- which a HIMARK administrator provisioning a client is not.
-- One transaction, so a tenant can never exist without frameworks or without a
-- way in.
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

  -- email_domain is deliberately left null. It is what
  -- claim_directory_membership() matches on, and a client tenant that carried
  -- one would silently absorb anyone at that domain if Entra ever went
  -- multi-tenant.
  insert into public.organizations (name, slug, status)
  values (p_name, p_slug, 'active')
  returning id into new_org;

  -- organizations has no audit trigger (only set_updated_at), so the creation
  -- is recorded explicitly -- the same reason delete_organization() writes its
  -- own row.
  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, new_value
  ) values (
    new_org, auth.uid(), 'organizations', new_org, 'insert',
    jsonb_build_object('name', p_name, 'slug', p_slug, 'via', 'provisioning')
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

  -- invitations has no audit trigger either.
  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, new_value
  ) values (
    new_org, auth.uid(), 'invitations', new_invitation, 'insert',
    jsonb_build_object('via', 'provisioning', 'role_id', 'owner', 'email', lower(p_admin_email))
  );

  return new_org;
end $$;

revoke all on function public.provision_organization(text, text, text, text, timestamptz) from public;
grant execute on function public.provision_organization(text, text, text, text, timestamptz) to authenticated, service_role;
