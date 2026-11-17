-- The Team page lists only people who sign in with a Microsoft account of the organisation (their HIMARK work account).
-- Append-only: earlier migrations are not edited. Nothing is deleted: profiles added by hand stay in the table, they are simply
-- not listed until that person signs in with Microsoft (the existing login link then connects them).

-- 1. Who in this organisation has a Microsoft sign-in. Callable by members of the organisation only.
create or replace function public.team_microsoft_user_ids(p_organization_id uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.user_id
  from public.memberships m
  where m.organization_id = p_organization_id
    and m.status = 'active'
    and exists (select 1 from public.memberships me where me.organization_id = p_organization_id and me.user_id = auth.uid() and me.status = 'active')
    and exists (select 1 from auth.identities i where i.user_id = m.user_id and i.provider = 'azure')
$$;
revoke all on function public.team_microsoft_user_ids(uuid) from public, anon;
grant execute on function public.team_microsoft_user_ids(uuid) to authenticated, service_role;

-- 2. A person who becomes an active member with a Microsoft sign-in gets a Team profile if they have none yet.
create or replace function private.membership_create_team_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare u record;
begin
  if new.status <> 'active' then return new; end if;
  select au.email, coalesce(nullif(au.raw_user_meta_data->>'full_name', ''), nullif(au.raw_user_meta_data->>'name', ''), au.email) as full_name
    into u from auth.users au
    where au.id = new.user_id and exists (select 1 from auth.identities i where i.user_id = au.id and i.provider = 'azure');
  if u.email is null then return new; end if;
  if not exists (select 1 from public.team_members t where t.organization_id = new.organization_id and (t.user_id = new.user_id or lower(t.email) = lower(u.email))) then
    insert into public.team_members (organization_id, user_id, full_name, email, status)
    values (new.organization_id, new.user_id, u.full_name, u.email, 'Active');
  end if;
  return new;
end $$;
revoke all on function private.membership_create_team_profile() from public, anon, authenticated;

drop trigger if exists memberships_create_team_profile on public.memberships;
create trigger memberships_create_team_profile after insert or update of status on public.memberships
  for each row execute function private.membership_create_team_profile();
