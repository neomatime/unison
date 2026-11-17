-- Access rights for people who are in the Microsoft 365 directory but have not signed in to UNISON yet.
-- An Owner or Admin picks a role for such a person from Settings, Users & access; it is kept here and applied when the person's
-- membership is created on their first Microsoft sign-in (claim_directory_membership). Owner cannot be granted ahead of time.

create table if not exists public.pending_access (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(email) and email like '%_@_%'),
  role_id text not null check (role_id in ('admin', 'member')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  primary key (organization_id, email)
);
alter table public.pending_access enable row level security;
create policy pending_access_select on public.pending_access for select to authenticated using (public.has_role(organization_id, array['owner','admin']));
create policy pending_access_insert on public.pending_access for insert to authenticated with check (public.has_role(organization_id, array['owner','admin']));
create policy pending_access_update on public.pending_access for update to authenticated using (public.has_role(organization_id, array['owner','admin'])) with check (public.has_role(organization_id, array['owner','admin']));
create policy pending_access_delete on public.pending_access for delete to authenticated using (public.has_role(organization_id, array['owner','admin']));
grant select, insert, update, delete on public.pending_access to authenticated;

-- When a membership is created, the role chosen in advance (if any) replaces the default, and the entry is used up.
create or replace function private.membership_apply_pending_access() returns trigger
language plpgsql security definer set search_path = '' as $$
declare chosen text;
begin
  select pa.role_id into chosen
  from public.pending_access pa
  join auth.users u on lower(u.email) = pa.email
  where pa.organization_id = new.organization_id and u.id = new.user_id;
  if chosen is not null then
    new.role_id := chosen;
    delete from public.pending_access pa using auth.users u
      where pa.organization_id = new.organization_id and u.id = new.user_id and lower(u.email) = pa.email;
  end if;
  return new;
end $$;
revoke all on function private.membership_apply_pending_access() from public, anon, authenticated;

drop trigger if exists memberships_apply_pending_access on public.memberships;
create trigger memberships_apply_pending_access before insert on public.memberships
  for each row execute function private.membership_apply_pending_access();
