-- Addresses the Team page never lists, even though they are in the Microsoft 365 directory (shared mailboxes, service accounts).
-- Owners and Admins manage the list; every member can read it. Hiding is not deleting: nothing in team_members changes.

create table if not exists public.team_hidden_addresses (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email = lower(email) and email like '%_@_%'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  primary key (organization_id, email)
);
alter table public.team_hidden_addresses enable row level security;
create policy team_hidden_select on public.team_hidden_addresses for select to authenticated using (public.is_member_of(organization_id));
create policy team_hidden_insert on public.team_hidden_addresses for insert to authenticated with check (public.has_role(organization_id, array['owner','admin']));
create policy team_hidden_delete on public.team_hidden_addresses for delete to authenticated using (public.has_role(organization_id, array['owner','admin']));
grant select, insert, delete on public.team_hidden_addresses to authenticated;

-- The shared enquiries mailbox is not a person.
insert into public.team_hidden_addresses (organization_id, email)
select o.id, 'info@himark.co.za' from public.organizations o where o.email_domain = 'himark.co.za'
on conflict do nothing;
