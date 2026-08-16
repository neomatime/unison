-- Task 16 fix round 1: organizations could not be deleted once they had any
-- clients rows. clients_audit is an AFTER DELETE trigger on `clients` that
-- INSERTs into audit_events (organization_id references organizations). When
-- deleting an organization cascades into deleting its clients rows within
-- the same statement, that trigger's insert references an organization the
-- statement has already removed, and Postgres raises 23503 -- the whole
-- DELETE (including the cascade) rolls back. No application code could ever
-- delete an organization that had children; this was latent only because
-- nothing deletes organizations yet.
--
-- Two changes close this:
--
-- 1. record_audit_event() now tolerates a vanishing parent: if its insert
--    hits a foreign_key_violation (exactly the race above), it retries with
--    organization_id = null instead of aborting the delete. This is general
--    -- it protects any future audit-triggered table cascading off of an
--    organization delete, not just `clients`.
-- 2. audit_events.organization_id becomes nullable with `on delete set
--    null` instead of `on delete cascade`. An organization's audit trail --
--    especially the record of who deleted it -- must outlive the
--    organization itself; a cascade that destroys the evidence of deletion
--    along with the thing deleted defeats the point of an audit log.
--    RLS on audit_events (`has_role(organization_id, ...)`) naturally
--    excludes rows where organization_id is null from every authenticated
--    read, since no membership ever has a null organization_id -- so this
--    does not open any new read path, tenant-scoped or otherwise. Only the
--    service role can see orphaned audit history after an organization is
--    gone, which is the intended retention/compliance shape.
--
-- There is deliberately no delete policy on organizations (or clients) --
-- see rls_helpers_and_policies.sql and clients.sql. delete_organization()
-- below is the one sanctioned path to remove an organization: it is
-- SECURITY DEFINER (so it can act despite no RLS delete policy existing),
-- but re-implements the authorization RLS would otherwise provide by
-- requiring the caller to hold the owner role -- the same principle
-- enforce_membership_role_change applies to role escalation. service_role
-- is also permitted, for trusted server-side/operational use, since it
-- already bypasses RLS everywhere else in this schema.

alter table public.audit_events alter column organization_id drop not null;

alter table public.audit_events
  drop constraint audit_events_organization_id_fkey;

alter table public.audit_events
  add constraint audit_events_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete set null;

create or replace function public.record_audit_event() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  begin
    insert into public.audit_events (
      organization_id, actor_id, resource, resource_id, action, old_value, new_value
    ) values (
      coalesce(new.organization_id, old.organization_id),
      auth.uid(),
      tg_table_name,
      coalesce(new.id, old.id),
      lower(tg_op),
      case when tg_op = 'INSERT' then null else to_jsonb(old) end,
      case when tg_op = 'DELETE' then null else to_jsonb(new) end
    );
  exception when foreign_key_violation then
    -- The organization this row belonged to no longer exists by the time
    -- this AFTER trigger fired -- it is being deleted in the same
    -- statement, cascading into this row first. Record the same event with
    -- organization_id left null rather than losing it or aborting the
    -- delete that triggered it.
    insert into public.audit_events (
      organization_id, actor_id, resource, resource_id, action, old_value, new_value
    ) values (
      null,
      auth.uid(),
      tg_table_name,
      coalesce(new.id, old.id),
      lower(tg_op),
      case when tg_op = 'INSERT' then null else to_jsonb(old) end,
      case when tg_op = 'DELETE' then null else to_jsonb(new) end
    );
  end;
  return coalesce(new, old);
end $$;

create or replace function public.delete_organization(target_org uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  org public.organizations%rowtype;
begin
  select * into org from public.organizations where id = target_org;
  if not found then
    return;
  end if;

  if auth.role() is distinct from 'service_role' and not public.has_role(target_org, array['owner']) then
    raise exception 'only an owner may delete their organization' using errcode = '42501';
  end if;

  -- organizations has no audit trigger of its own (only clients does), so
  -- the deletion itself must be recorded explicitly, before the row is
  -- gone, or there would be no record of who deleted an organization at
  -- all.
  insert into public.audit_events (
    organization_id, actor_id, resource, resource_id, action, old_value, new_value
  ) values (
    target_org, auth.uid(), 'organizations', target_org, 'delete', to_jsonb(org), null
  );

  delete from public.organizations where id = target_org;
end $$;

revoke execute on function public.delete_organization(uuid) from public, anon;
grant execute on function public.delete_organization(uuid) to authenticated, service_role;
