-- User rights management: per-person overrides on top of the role defaults, data-access scopes, restrictions, and an append-only
-- activity history. Rights for someone who has not signed in yet are kept against their email and move to their login when their
-- membership is created. The defaults here must match features/rights/model.ts (tests/unit/rights-model.test.ts checks them).

create table if not exists public.user_rights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  overrides jsonb not null default '{}'::jsonb,
  scopes jsonb not null default '{}'::jsonb,
  restrictions jsonb not null default '[]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  constraint user_rights_one_subject check ((user_id is null) <> (email is null)),
  constraint user_rights_email_lower check (email is null or email = lower(email)),
  constraint user_rights_shapes check (jsonb_typeof(overrides) = 'object' and jsonb_typeof(scopes) = 'object' and jsonb_typeof(restrictions) = 'array')
);
create unique index if not exists user_rights_user_key on public.user_rights (organization_id, user_id) where user_id is not null;
create unique index if not exists user_rights_email_key on public.user_rights (organization_id, email) where email is not null;

create table if not exists public.rights_audit (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subject_user_id uuid,
  subject_email text,
  subject_name text not null,
  actor_id uuid references auth.users(id) on delete set null default auth.uid(),
  actor_name text not null,
  kind text not null check (kind in ('rights.updated', 'rights.reset', 'role.changed')),
  summary text not null,
  changes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists rights_audit_org_time on public.rights_audit (organization_id, created_at desc);

-- The rule itself, with no dependence on who is signed in so it can be tested directly.
create or replace function public.rights_value(p_role text, p_restrictions jsonb, p_overrides jsonb, p_module text, p_action text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  allowed boolean;
  can_view boolean;
  over jsonb;
begin
  if p_role = 'owner' then return true; end if;
  if p_role not in ('admin', 'member') then return false; end if;
  if p_restrictions ? 'financial' and p_module in ('invoices', 'expenses', 'forecasting') then return false; end if;
  if p_restrictions ? 'admin' and ((p_module = 'settings' and p_action = 'edit') or (p_module = 'team' and p_action <> 'view')) then return false; end if;

  over := p_overrides -> p_module -> p_action;
  if over is not null and jsonb_typeof(over) = 'boolean' then
    allowed := (over #>> '{}')::boolean;
  elsif p_role = 'admin' then
    allowed := true;
  else
    allowed := p_module <> 'settings' and p_action in ('view', 'create', 'edit', 'export');
  end if;

  if allowed and p_action <> 'view' then
    over := p_overrides -> p_module -> 'view';
    if over is not null and jsonb_typeof(over) = 'boolean' then
      can_view := (over #>> '{}')::boolean;
    elsif p_role = 'admin' then
      can_view := true;
    else
      can_view := p_module <> 'settings';
    end if;
    return can_view;
  end if;
  return allowed;
end $$;

-- Whether the signed-in person has this right in this organisation.
create or replace function public.has_right(p_organization_id uuid, p_module text, p_action text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  member_role text;
  mine record;
begin
  select m.role_id into member_role from public.memberships m
    where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.status = 'active';
  if member_role is null then return false; end if;
  select ur.restrictions, ur.overrides into mine from public.user_rights ur
    where ur.organization_id = p_organization_id and ur.user_id = auth.uid();
  return public.rights_value(member_role, coalesce(mine.restrictions, '[]'::jsonb), coalesce(mine.overrides, '{}'::jsonb), p_module, p_action);
end $$;
revoke all on function public.has_right(uuid, text, text) from public, anon;
grant execute on function public.has_right(uuid, text, text) to authenticated, service_role;

-- May the signed-in person change this person's rights? Owner: anyone but another Owner. Admin: a Member (or someone who has not
-- signed in yet and is not set to Admin) only. Nobody changes their own.
create or replace function public.rights_editable(p_organization_id uuid, p_user_id uuid, p_email text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  actor text;
  target text;
begin
  select m.role_id into actor from public.memberships m
    where m.organization_id = p_organization_id and m.user_id = auth.uid() and m.status = 'active';
  if actor is null or actor not in ('owner', 'admin') then return false; end if;
  if p_user_id is not null then
    if p_user_id = auth.uid() then return false; end if;
    select m.role_id into target from public.memberships m
      where m.organization_id = p_organization_id and m.user_id = p_user_id and m.status = 'active';
  else
    select coalesce((select pa.role_id from public.pending_access pa where pa.organization_id = p_organization_id and pa.email = lower(p_email)), 'member') into target;
  end if;
  if target is null or target = 'owner' then return false; end if;
  if actor = 'owner' then return true; end if;
  return target = 'member';
end $$;
revoke all on function public.rights_editable(uuid, uuid, text) from public, anon;
grant execute on function public.rights_editable(uuid, uuid, text) to authenticated, service_role;

alter table public.user_rights enable row level security;
alter table public.rights_audit enable row level security;

-- A person can read their own rights (the app needs them); Owners and Admins read everyone's.
create policy user_rights_select on public.user_rights for select to authenticated
  using (user_id = auth.uid() or public.has_role(organization_id, array['owner', 'admin']));
create policy user_rights_insert on public.user_rights for insert to authenticated
  with check (public.rights_editable(organization_id, user_id, email));
create policy user_rights_update on public.user_rights for update to authenticated
  using (public.rights_editable(organization_id, user_id, email))
  with check (public.rights_editable(organization_id, user_id, email));
create policy user_rights_delete on public.user_rights for delete to authenticated
  using (public.rights_editable(organization_id, user_id, email));
grant select, insert, update, delete on public.user_rights to authenticated;

-- The history is append-only: nobody edits or deletes it.
create policy rights_audit_select on public.rights_audit for select to authenticated
  using (public.has_role(organization_id, array['owner', 'admin']));
create policy rights_audit_insert on public.rights_audit for insert to authenticated
  with check (public.has_role(organization_id, array['owner', 'admin']) and actor_id = auth.uid());
grant select, insert on public.rights_audit to authenticated;

-- When a person's membership is created, rights chosen before they signed in move to their login.
create or replace function private.membership_adopt_pending_rights() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.user_rights ur set user_id = new.user_id, email = null
  from auth.users u
  where u.id = new.user_id and ur.organization_id = new.organization_id and ur.email is not null and ur.email = lower(u.email)
    and not exists (select 1 from public.user_rights x where x.organization_id = new.organization_id and x.user_id = new.user_id);
  return new;
end $$;
revoke all on function private.membership_adopt_pending_rights() from public, anon, authenticated;

drop trigger if exists memberships_adopt_pending_rights on public.memberships;
create trigger memberships_adopt_pending_rights after insert on public.memberships
  for each row execute function private.membership_adopt_pending_rights();
