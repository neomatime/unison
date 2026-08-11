-- Membership lookup, not JWT claims: revocation takes effect immediately.
-- security definer is load-bearing — the policy on memberships reads
-- memberships, which recurses without the bypass.
create or replace function public.is_member_of(org uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and organization_id = org
      and status = 'active'
  );
$$;

create or replace function public.has_role(org uuid, roles text[]) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where user_id = auth.uid()
      and organization_id = org
      and status = 'active'
      and role_id = any(roles)
  );
$$;

revoke execute on function public.is_member_of(uuid) from public, anon;
revoke execute on function public.has_role(uuid, text[]) from public, anon;
grant execute on function public.is_member_of(uuid) to authenticated;
grant execute on function public.has_role(uuid, text[]) to authenticated;

-- organizations
create policy organizations_select on public.organizations
  for select to authenticated using (public.is_member_of(id));

create policy organizations_update on public.organizations
  for update to authenticated
  using (public.has_role(id, array['owner','admin']))
  with check (public.has_role(id, array['owner','admin']));

-- memberships
create policy memberships_select on public.memberships
  for select to authenticated using (public.is_member_of(organization_id));

create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (public.has_role(organization_id, array['owner','admin']));

create policy memberships_update on public.memberships
  for update to authenticated
  using (public.has_role(organization_id, array['owner','admin']))
  with check (public.has_role(organization_id, array['owner','admin']));

-- invitations
create policy invitations_select on public.invitations
  for select to authenticated using (public.has_role(organization_id, array['owner','admin']));

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (public.has_role(organization_id, array['owner','admin']));

create policy invitations_update on public.invitations
  for update to authenticated
  using (public.has_role(organization_id, array['owner','admin']))
  with check (public.has_role(organization_id, array['owner','admin']));

-- audit_events: readable by admins, written only by triggers and the service role
create policy audit_events_select on public.audit_events
  for select to authenticated using (public.has_role(organization_id, array['owner','admin']));

revoke all on public.organizations, public.memberships, public.invitations, public.audit_events from anon;
