create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid,
  full_name text not null,
  email text not null,
  job_title text,
  delivery_role text,
  department text,
  team_name text,
  manager_id uuid,
  capacity_percent smallint not null default 0 check (capacity_percent between 0 and 150),
  availability text not null default 'Available' check (availability in ('Available','Partial','Busy','Unavailable')),
  availability_note text,
  status text not null default 'Active' check (status in ('Active','Inactive','Invited')),
  access_role text not null default 'Member' check (access_role in ('Owner','Admin','Member')),
  joined_on date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (organization_id, user_id) references public.memberships(organization_id, user_id) on delete set null (user_id),
  foreign key (manager_id, organization_id) references public.team_members(id, organization_id) on delete set null (manager_id)
);

create unique index team_members_org_email_unique on public.team_members(organization_id, lower(email));
create index team_members_org_status_idx on public.team_members(organization_id, status, archived_at);
create index team_members_org_user_idx on public.team_members(organization_id, user_id);
create index team_members_manager_idx on public.team_members(manager_id, organization_id);

create table public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  team_member_id uuid not null,
  delivery_role text not null,
  allocation_percent smallint not null default 0 check (allocation_percent between 0 and 150),
  start_date date not null,
  end_date date,
  status text not null default 'Planned' check (status in ('Planned','Active','Complete','Cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (end_date is null or end_date >= start_date),
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete cascade,
  foreign key (team_member_id, organization_id) references public.team_members(id, organization_id) on delete cascade
);

create index project_assignments_org_idx on public.project_assignments(organization_id, status);
create index project_assignments_project_idx on public.project_assignments(project_id, organization_id);
create index project_assignments_member_idx on public.project_assignments(team_member_id, organization_id);

create table public.client_onboardings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid,
  client_name text not null,
  owner_id uuid,
  onboarding_type text not null default 'Standard Client',
  stage text not null default 'Welcome' check (stage in ('Welcome','Company Setup','Information & Documentation','Agreements','Review & Approval','Go Live / Handover')),
  progress_percent smallint not null default 0 check (progress_percent between 0 and 100),
  health text not null default 'On Track' check (health in ('On Track','Watch','At Risk')),
  priority text not null default 'Normal' check (priority in ('Normal','High','Critical')),
  start_date date,
  target_go_live date,
  required_documents integer not null default 0 check (required_documents >= 0),
  notes text,
  status text not null default 'Active' check (status in ('Draft','Active','Paused','Complete')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (client_id, organization_id) references public.clients(id, organization_id) on delete set null (client_id),
  foreign key (owner_id, organization_id) references public.team_members(id, organization_id) on delete set null (owner_id)
);

create index client_onboardings_org_idx on public.client_onboardings(organization_id, status, archived_at);
create index client_onboardings_client_idx on public.client_onboardings(client_id, organization_id);
create index client_onboardings_owner_idx on public.client_onboardings(owner_id, organization_id);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  vendor_type text not null default 'Other',
  service_category text,
  region text,
  owner_id uuid,
  primary_contact text,
  contact_email text,
  phone text,
  contract_start date,
  contract_end date,
  contract_value numeric(14,2) check (contract_value is null or contract_value >= 0),
  renewal_notice_days integer check (renewal_notice_days is null or renewal_notice_days >= 0),
  sla_percent numeric(5,2) check (sla_percent is null or sla_percent between 0 and 100),
  data_sensitivity text not null default 'Low' check (data_sensitivity in ('Low','Moderate','High','Restricted')),
  risk_level text not null default 'Low' check (risk_level in ('Low','Medium','High','Critical')),
  compliance_status text not null default 'Not assessed' check (compliance_status in ('Current','Review due','Gap open','Not assessed')),
  status text not null default 'Active' check (status in ('Active','Under Review','At Risk','Suspended')),
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id),
  check (contract_end is null or contract_start is null or contract_end >= contract_start),
  foreign key (owner_id, organization_id) references public.team_members(id, organization_id) on delete set null (owner_id)
);

create index vendors_org_idx on public.vendors(organization_id, status, archived_at);
create index vendors_owner_idx on public.vendors(owner_id, organization_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  project_id uuid,
  client_id uuid,
  onboarding_id uuid,
  assignee_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  priority text not null default 'Medium' check (priority in ('Low','Medium','High','Critical')),
  status text not null default 'Planned' check (status in ('Backlog','Planned','In Progress','Blocked','Complete','Cancelled')),
  due_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete set null (project_id),
  foreign key (client_id, organization_id) references public.clients(id, organization_id) on delete set null (client_id),
  foreign key (onboarding_id, organization_id) references public.client_onboardings(id, organization_id) on delete set null (onboarding_id),
  foreign key (assignee_id, organization_id) references public.team_members(id, organization_id) on delete set null (assignee_id)
);

create index tasks_org_idx on public.tasks(organization_id, status, due_at, archived_at);
create index tasks_project_idx on public.tasks(project_id, organization_id);
create index tasks_client_idx on public.tasks(client_id, organization_id);
create index tasks_onboarding_idx on public.tasks(onboarding_id, organization_id);
create index tasks_assignee_idx on public.tasks(assignee_id, organization_id);
create index tasks_created_by_idx on public.tasks(created_by);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  event_type text not null default 'Internal',
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  owner_id uuid,
  project_id uuid,
  client_id uuid,
  onboarding_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'Confirmed' check (status in ('Tentative','Confirmed','Cancelled','Complete')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  check (end_at >= start_at),
  foreign key (owner_id, organization_id) references public.team_members(id, organization_id) on delete set null (owner_id),
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete set null (project_id),
  foreign key (client_id, organization_id) references public.clients(id, organization_id) on delete set null (client_id),
  foreign key (onboarding_id, organization_id) references public.client_onboardings(id, organization_id) on delete set null (onboarding_id)
);

create index calendar_events_org_idx on public.calendar_events(organization_id, start_at, archived_at);
create index calendar_events_owner_idx on public.calendar_events(owner_id, organization_id);
create index calendar_events_project_idx on public.calendar_events(project_id, organization_id);
create index calendar_events_client_idx on public.calendar_events(client_id, organization_id);
create index calendar_events_onboarding_idx on public.calendar_events(onboarding_id, organization_id);
create index calendar_events_created_by_idx on public.calendar_events(created_by);

alter table public.team_members enable row level security;
alter table public.project_assignments enable row level security;
alter table public.client_onboardings enable row level security;
alter table public.vendors enable row level security;
alter table public.tasks enable row level security;
alter table public.calendar_events enable row level security;

create policy team_members_select on public.team_members for select to authenticated using (public.is_member_of(organization_id));
create policy team_members_insert on public.team_members for insert to authenticated with check (public.has_role(organization_id, array['owner','admin']));
create policy team_members_update on public.team_members for update to authenticated using (public.has_role(organization_id, array['owner','admin'])) with check (public.has_role(organization_id, array['owner','admin']));

create policy project_assignments_select on public.project_assignments for select to authenticated using (public.is_member_of(organization_id));
create policy project_assignments_insert on public.project_assignments for insert to authenticated with check (public.is_member_of(organization_id));
create policy project_assignments_update on public.project_assignments for update to authenticated using (public.is_member_of(organization_id)) with check (public.is_member_of(organization_id));

create policy client_onboardings_select on public.client_onboardings for select to authenticated using (public.is_member_of(organization_id));
create policy client_onboardings_insert on public.client_onboardings for insert to authenticated with check (public.is_member_of(organization_id));
create policy client_onboardings_update on public.client_onboardings for update to authenticated using (public.is_member_of(organization_id)) with check (public.is_member_of(organization_id));

create policy vendors_select on public.vendors for select to authenticated using (public.is_member_of(organization_id));
create policy vendors_insert on public.vendors for insert to authenticated with check (public.is_member_of(organization_id));
create policy vendors_update on public.vendors for update to authenticated using (public.is_member_of(organization_id)) with check (public.is_member_of(organization_id));

create policy tasks_select on public.tasks for select to authenticated using (public.is_member_of(organization_id));
create policy tasks_insert on public.tasks for insert to authenticated with check (public.is_member_of(organization_id));
create policy tasks_update on public.tasks for update to authenticated using (public.is_member_of(organization_id)) with check (public.is_member_of(organization_id));

create policy calendar_events_select on public.calendar_events for select to authenticated using (public.is_member_of(organization_id));
create policy calendar_events_insert on public.calendar_events for insert to authenticated with check (public.is_member_of(organization_id));
create policy calendar_events_update on public.calendar_events for update to authenticated using (public.is_member_of(organization_id)) with check (public.is_member_of(organization_id));

create trigger team_members_set_updated_at before update on public.team_members for each row execute function public.set_updated_at();
create trigger project_assignments_set_updated_at before update on public.project_assignments for each row execute function public.set_updated_at();
create trigger client_onboardings_set_updated_at before update on public.client_onboardings for each row execute function public.set_updated_at();
create trigger vendors_set_updated_at before update on public.vendors for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at before update on public.tasks for each row execute function public.set_updated_at();
create trigger calendar_events_set_updated_at before update on public.calendar_events for each row execute function public.set_updated_at();

create trigger team_members_audit after insert or update or delete on public.team_members for each row execute function public.record_audit_event();
create trigger project_assignments_audit after insert or update or delete on public.project_assignments for each row execute function public.record_audit_event();
create trigger client_onboardings_audit after insert or update or delete on public.client_onboardings for each row execute function public.record_audit_event();
create trigger vendors_audit after insert or update or delete on public.vendors for each row execute function public.record_audit_event();
create trigger tasks_audit after insert or update or delete on public.tasks for each row execute function public.record_audit_event();
create trigger calendar_events_audit after insert or update or delete on public.calendar_events for each row execute function public.record_audit_event();

revoke all on public.team_members, public.project_assignments, public.client_onboardings, public.vendors, public.tasks, public.calendar_events from anon;
grant select, insert, update on public.team_members, public.project_assignments, public.client_onboardings, public.vendors, public.tasks, public.calendar_events to authenticated;
