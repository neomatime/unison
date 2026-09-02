-- Fix round 1 for the provisioning security cut (Task 2 review).
--
-- Important 1: frameworks and framework_phases carry record_audit_event()
-- triggers (20260826103710_delivery_frameworks.sql:59,61) that write
-- actor_id = auth.uid() (20260816232306_deletable_organizations.sql:58).
-- Once service_role became the only caller of provision_organization
-- (20260901150000_provision_organization_actor.sql), auth.uid() resolved to
-- null for every framework/phase row those triggers wrote -- six frameworks
-- and forty-six phases per tenant, unattributable, even though the two
-- hand-written audit_events rows (organizations, invitations) were correctly
-- attributed to p_actor_id. The migration's own comment above the seeding
-- loop still claimed these rows "audit themselves", which was only half true
-- afterward: they recorded what, no longer who.
--
-- The fix sets request.jwt.claims for the remainder of this transaction so
-- auth.uid(), read by record_audit_event() inside the trigger, resolves to
-- p_actor_id. It merges rather than overwrites: PostgREST already populates
-- this GUC for every request (a service-role call carries a JWT with
-- "role": "service_role" and no "sub"), and clobbering it instead of merging
-- would discard whatever else is legitimately in there. set_config's third
-- argument (true) makes this transaction-local, so it cannot leak onto a
-- later request that reuses the same pooled connection.
--
-- Verified live against unison-uat before relying on it: a DO block that
-- calls set_config exactly this way, then auth.uid(), resolves to the merged
-- 'sub' -- current_setting('request.jwt.claim.sub', true), which coalesce()
-- prefers first inside auth.uid()'s own definition, is unset for a
-- service-role JWT (confirmed via pg_get_functiondef('auth.uid()'::regprocedure)
-- and by the very bug this migration fixes: if that flattened GUC carried a
-- service-role sub, frameworks/framework_phases audit rows would already have
-- been attributed, not null).
--
-- Important 2: this is also the third time this function's drop-and-recreate
-- has eaten the comments above its two hand-written audit_events inserts.
-- Restored verbatim from 20260901132631_restore_provision_organization_comments.sql.
--
-- The signature is unchanged, so this is create or replace, not a
-- drop-and-recreate -- grants carry across a create or replace and need no
-- restatement. Confirmed rather than assumed: see the ACL check that follows
-- this function definition.
create or replace function public.provision_organization(
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
    new_org, p_actor_id, 'organizations', new_org, 'insert',
    jsonb_build_object('name', p_name, 'slug', p_slug, 'tier', p_tier, 'via', 'provisioning', 'organization_id', new_org)
  );

  -- record_audit_event() -- the trigger frameworks and framework_phases both
  -- carry -- writes actor_id = auth.uid(), which it reads off
  -- request.jwt.claims. Merge p_actor_id into that GUC's 'sub' claim,
  -- transaction-locally, before the seeding loop below runs, so every
  -- framework/phase audit row it causes is attributed the same way the
  -- hand-written organizations/invitations rows are, instead of being left
  -- null the way a bare service-role call otherwise leaves it. See this
  -- migration's header comment for why this merges rather than overwrites,
  -- and for the live verification that it resolves the way auth.uid() expects.
  perform set_config('request.jwt.claims',
    (coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
      || jsonb_build_object('sub', p_actor_id::text))::text, true);

  -- projects.framework_id is not null, so a tenant without frameworks meets a
  -- New Project form it cannot submit. frameworks and framework_phases both
  -- carry record_audit_event triggers, so these rows audit themselves -- and,
  -- because of the set_config immediately above, attribute themselves too.
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
    new_org, p_actor_id, 'invitations', new_invitation, 'insert',
    jsonb_build_object('via', 'provisioning', 'role_id', 'owner', 'email', lower(p_admin_email), 'organization_id', new_org)
  );

  return new_org;
end $$;
