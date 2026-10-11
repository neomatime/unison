-- Stage 1 fix: a team profile is linked to a sign-in by its work email.
-- Nothing in the app ever set team_members.user_id, so "My tasks" (tasks assigned to the signed-in person's profile) and the
-- default assignee of a follow-up could never find anyone. The database now links a profile to the active member of the same
-- organisation whose sign-in email matches (ignoring case). Append-only: earlier migrations are not edited.

create or replace function private.login_for_team_email(p_org uuid, p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.user_id
  from public.memberships m
  join auth.users u on u.id = m.user_id
  where m.organization_id = p_org and m.status = 'active' and lower(u.email) = lower(p_email)
  limit 1
$$;
revoke all on function private.login_for_team_email(uuid, text) from public, anon, authenticated;

-- 1. A profile that is created or whose email changes, and is not linked yet, is linked when a matching member exists.
create or replace function private.team_member_link_login() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.user_id is null and new.email is not null then
    new.user_id := private.login_for_team_email(new.organization_id, new.email);
  end if;
  return new;
end $$;
revoke all on function private.team_member_link_login() from public, anon, authenticated;

drop trigger if exists team_members_link_login on public.team_members;
create trigger team_members_link_login before insert or update of email, user_id on public.team_members
  for each row execute function private.team_member_link_login();

-- 2. A person who becomes an active member later (an accepted invitation) is linked to the profile already waiting for them.
create or replace function private.membership_link_team_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' then
    update public.team_members t
    set user_id = new.user_id
    where t.organization_id = new.organization_id
      and t.user_id is null
      and lower(t.email) = (select lower(u.email) from auth.users u where u.id = new.user_id);
  end if;
  return new;
end $$;
revoke all on function private.membership_link_team_member() from public, anon, authenticated;

drop trigger if exists memberships_link_team_member on public.memberships;
create trigger memberships_link_team_member after insert or update of status on public.memberships
  for each row execute function private.membership_link_team_member();

-- 3. One-off: link the profiles that already exist.
update public.team_members t
set user_id = private.login_for_team_email(t.organization_id, t.email)
where t.user_id is null and private.login_for_team_email(t.organization_id, t.email) is not null;
