-- Client-centric CRM extensions. Existing clients, tasks, documents and commercial
-- tables remain authoritative; these tables only cover relationship concepts that
-- did not previously have a durable home.

alter table public.clients
  add column if not exists logo_url text,
  add column if not exists relationship_started_on date;

create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null,
  full_name text not null check (length(trim(full_name)) > 0),
  job_title text,
  email text,
  phone text,
  relationship_role text not null default 'Contact'
    check (relationship_role in ('Primary Contact','Decision Maker','Champion','Technical','Billing','Contact')),
  preferred_communication text
    check (preferred_communication is null or preferred_communication in ('Email','Phone','Meeting','Teams','Other')),
  is_primary boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (client_id, organization_id)
    references public.clients(id, organization_id) on delete cascade
);

create unique index client_contacts_one_primary_idx
  on public.client_contacts(organization_id, client_id)
  where is_primary and archived_at is null;
create index client_contacts_client_idx
  on public.client_contacts(client_id, organization_id, archived_at);

create table public.client_interactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null,
  contact_id uuid,
  team_member_id uuid,
  interaction_type text not null
    check (interaction_type in ('Phone Call','Meeting','Email','Client Visit','Follow-up','General Note')),
  occurred_at timestamptz not null,
  summary text not null check (length(trim(summary)) > 0),
  next_action text,
  next_action_due_at timestamptz,
  concern_recorded boolean not null default false,
  confidentiality text not null default 'Internal'
    check (confidentiality in ('Internal','Confidential')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (client_id, organization_id)
    references public.clients(id, organization_id) on delete cascade,
  foreign key (contact_id, organization_id)
    references public.client_contacts(id, organization_id) on delete set null (contact_id),
  foreign key (team_member_id, organization_id)
    references public.team_members(id, organization_id) on delete set null (team_member_id)
);

create index client_interactions_client_idx
  on public.client_interactions(client_id, organization_id, occurred_at desc)
  where archived_at is null;
create index client_interactions_next_action_idx
  on public.client_interactions(organization_id, next_action_due_at)
  where next_action is not null and archived_at is null;

create table public.client_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  milestone_type text not null default 'Important Client Event'
    check (milestone_type in ('Onboarding Anniversary','Partnership Anniversary','Contract Renewal','Relationship Review','Important Client Event')),
  milestone_date date not null,
  recurring_annually boolean not null default false,
  notes text,
  status text not null default 'Upcoming'
    check (status in ('Upcoming','Complete','Cancelled')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (client_id, organization_id)
    references public.clients(id, organization_id) on delete cascade
);

create index client_milestones_client_idx
  on public.client_milestones(client_id, organization_id, milestone_date)
  where archived_at is null;

create table public.client_recommendation_dismissals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null,
  recommendation_key text not null check (length(trim(recommendation_key)) > 0),
  dismissed_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  unique (organization_id, recommendation_key, dismissed_by),
  foreign key (client_id, organization_id)
    references public.clients(id, organization_id) on delete cascade
);

create index client_recommendation_dismissals_client_idx
  on public.client_recommendation_dismissals(client_id, organization_id, dismissed_by);

alter table public.client_contacts enable row level security;
alter table public.client_interactions enable row level security;
alter table public.client_milestones enable row level security;
alter table public.client_recommendation_dismissals enable row level security;

create policy client_contacts_select on public.client_contacts for select to authenticated
  using (public.is_member_of(organization_id));
create policy client_contacts_insert on public.client_contacts for insert to authenticated
  with check (public.is_member_of(organization_id));
create policy client_contacts_update on public.client_contacts for update to authenticated
  using (public.is_member_of(organization_id)) with check (public.is_member_of(organization_id));

create policy client_interactions_select on public.client_interactions for select to authenticated
  using (
    public.is_member_of(organization_id)
    and (
      confidentiality = 'Internal'
      or created_by = auth.uid()
      or public.has_role(organization_id, array['owner','admin'])
    )
  );
create policy client_interactions_insert on public.client_interactions for insert to authenticated
  with check (public.is_member_of(organization_id) and created_by = auth.uid());
create policy client_interactions_update on public.client_interactions for update to authenticated
  using (created_by = auth.uid() or public.has_role(organization_id, array['owner','admin']))
  with check (public.is_member_of(organization_id));

create policy client_milestones_select on public.client_milestones for select to authenticated
  using (public.is_member_of(organization_id));
create policy client_milestones_insert on public.client_milestones for insert to authenticated
  with check (public.is_member_of(organization_id) and created_by = auth.uid());
create policy client_milestones_update on public.client_milestones for update to authenticated
  using (created_by = auth.uid() or public.has_role(organization_id, array['owner','admin']))
  with check (public.is_member_of(organization_id));

create policy client_recommendation_dismissals_select on public.client_recommendation_dismissals for select to authenticated
  using (dismissed_by = auth.uid() and public.is_member_of(organization_id));
create policy client_recommendation_dismissals_insert on public.client_recommendation_dismissals for insert to authenticated
  with check (dismissed_by = auth.uid() and public.is_member_of(organization_id));
create policy client_recommendation_dismissals_delete on public.client_recommendation_dismissals for delete to authenticated
  using (dismissed_by = auth.uid() and public.is_member_of(organization_id));

create trigger client_contacts_set_updated_at before update on public.client_contacts
  for each row execute function public.set_updated_at();
create trigger client_interactions_set_updated_at before update on public.client_interactions
  for each row execute function public.set_updated_at();
create trigger client_milestones_set_updated_at before update on public.client_milestones
  for each row execute function public.set_updated_at();

create trigger client_contacts_audit after insert or update or delete on public.client_contacts
  for each row execute function public.record_audit_event();
create trigger client_interactions_audit after insert or update or delete on public.client_interactions
  for each row execute function public.record_audit_event();
create trigger client_milestones_audit after insert or update or delete on public.client_milestones
  for each row execute function public.record_audit_event();

revoke all on public.client_contacts, public.client_interactions,
  public.client_milestones, public.client_recommendation_dismissals from anon;
grant select, insert, update on public.client_contacts, public.client_interactions,
  public.client_milestones to authenticated;
grant select, insert, delete on public.client_recommendation_dismissals to authenticated;
