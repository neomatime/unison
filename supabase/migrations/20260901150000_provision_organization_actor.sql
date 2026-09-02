-- The caller-chosen token hash (CRITICAL). provisionOrganizationAction generates
-- the token server-side and returns only { organizationId }, so an operator
-- driving the wizard never sees it. The `authenticated` grant is what reopened
-- the hole: the same operator could skip the action, call this RPC directly with
-- a p_token_hash of their choosing and a p_admin_email they do NOT control, then
-- open the invitation signed out -- lib/invitations/create-invited-account.ts
-- mints a PRE-CONFIRMED, platform-wide auth identity for that address with a
-- password they choose. The organisation is a decoy; the account is the prize,
-- and the real owner of that address can never register under it afterwards.
--
-- send-invitation.ts never lets an inviter choose a token. Neither does this now:
-- execute is service_role only, so the only caller is the server action.
--
-- p_token_hash stays a parameter deliberately. Generating it here would mean
-- returning a raw secret in a function result, which is worse if statement
-- logging is ever enabled.
drop function public.provision_organization(text, text, text, text, timestamptz, text);

create function public.provision_organization(
  p_name text,
  p_slug text,
  p_admin_email text,
  p_token_hash text,
  p_expires_at timestamptz,
  p_actor_id uuid,
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

  -- Attribution is not optional. Under service_role auth.uid() is null, so
  -- without this every provisioned tenant would record that an owner invitation
  -- was minted and not by whom. Checked before authorisation because an absent
  -- actor is not a refusal to authorise, it is a malformed call.
  if p_actor_id is null then
    raise exception 'p_actor_id is required' using errcode = '22023';
  end if;

  -- Unconditional. The previous version skipped this check for service_role,
  -- which was sound while an authenticated HIMARK admin was the ordinary caller
  -- and service_role meant scripts. Now service_role is the ONLY caller, so that
  -- branch would mean no authorisation check at all.
  if not public.has_role_for(himark_id, p_actor_id, array['owner', 'admin']) then
    raise exception 'only a HIMARK administrator may provision an organization'
      using errcode = '42501';
  end if;

  -- Applied after authorisation so a malformed expiry can never act as an oracle
  -- for a caller who is not entitled to be here at all.
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

  -- organizations has no audit trigger (only set_updated_at), so the creation is
  -- recorded explicitly. organization_id is repeated inside new_value so the row
  -- stays traceable to its fixture after delete_organization nulls the column.
  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, new_value
  ) values (
    new_org, p_actor_id, 'organizations', new_org, 'insert',
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
    new_org, lower(p_admin_email), 'owner', p_token_hash, p_expires_at, p_actor_id
  )
  returning id into new_invitation;

  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, new_value
  ) values (
    new_org, p_actor_id, 'invitations', new_invitation, 'insert',
    jsonb_build_object('via', 'provisioning', 'role_id', 'owner', 'email', lower(p_admin_email), 'organization_id', new_org)
  );

  return new_org;
end $$;

-- Grants do NOT carry to a new signature, and `revoke ... from public` alone does
-- not strip Supabase's default grant to anon. authenticated is named explicitly
-- because removing it is the entire point of this migration.
revoke all on function public.provision_organization(text, text, text, text, timestamptz, uuid, text)
  from public, anon, authenticated;
grant execute on function public.provision_organization(text, text, text, text, timestamptz, uuid, text)
  to service_role;
