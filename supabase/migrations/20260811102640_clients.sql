-- NOTE (final fix wave, added after this migration was originally applied):
-- this file creates a trigram index below using public.gin_trgm_ops, but
-- the pg_trgm extension was never created by any migration -- it only
-- existed on this project because it predated the Task 1 schema reset. A
-- fresh replay of this history onto a new project would fail here.
-- Appending a later "create extension" migration cannot fix that, because
-- migrations replay in filename order and this file sorts first. The only
-- way to make a from-scratch replay succeed is to make this migration
-- self-sufficient, so this line was added in-place rather than only as a
-- new migration further down the history.
-- This is a deliberate edit to an already-applied migration file. It is
-- safe because `create extension if not exists` is a no-op against this
-- live project (pg_trgm is already installed here), so nothing changes for
-- the database this history has actually been run against; it only changes
-- what a *future* fresh replay onto a new project would do. See also
-- 20260817165022_ensure_pg_trgm_extension.sql, which independently records
-- extension provisioning as its own migration for discoverability and as a
-- backstop if this file is ever reverted.
create extension if not exists pg_trgm with schema public;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  industry text,
  website text,
  contact_name text,
  contact_email text,
  contact_phone text,
  owner_id uuid references auth.users(id) on delete set null,
  service text,
  billing_email text,
  notes text,
  status text not null default 'Onboarding'
    check (status in ('Onboarding','Active','Archived')),
  health text not null default 'New'
    check (health in ('New','Healthy','Watch','Stable','At Risk')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_org_active on public.clients (organization_id, archived_at);
create index clients_name_trgm on public.clients using gin (name public.gin_trgm_ops);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

alter table public.clients enable row level security;

create policy clients_select on public.clients
  for select to authenticated using (public.is_member_of(organization_id));

create policy clients_insert on public.clients
  for insert to authenticated with check (public.is_member_of(organization_id));

create policy clients_update on public.clients
  for update to authenticated
  using (public.is_member_of(organization_id))
  with check (public.is_member_of(organization_id));

revoke all on public.clients from anon;

-- Audit as a trigger, not a convention: an action cannot forget to record.
create or replace function public.record_audit_event() returns trigger
language plpgsql security definer set search_path = ''
as $$
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
  return coalesce(new, old);
end $$;

create trigger clients_audit
  after insert or update or delete on public.clients
  for each row execute function public.record_audit_event();
