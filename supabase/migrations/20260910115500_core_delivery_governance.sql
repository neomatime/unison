-- Phase 2: tenant-scoped delivery governance.  History rows are append-only;
-- operational records are editable by active members and protected by direct
-- organisation predicates in every RLS policy.

create table public.governance_gates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  framework_id uuid not null,
  phase_id uuid not null,
  name text not null,
  description text,
  position integer not null default 0,
  approval_required boolean not null default true,
  evidence_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (framework_id, phase_id, name),
  unique (id, organization_id),
  foreign key (framework_id, organization_id) references public.frameworks(id, organization_id) on delete cascade,
  foreign key (framework_id, phase_id) references public.framework_phases(framework_id, id) on delete cascade
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid,
  framework_id uuid,
  gate_id uuid,
  title text not null,
  description text,
  status text not null default 'Draft' check (status in ('Draft','Pending','Approved','Changes Requested','Rejected','Withdrawn')),
  priority text not null default 'Medium' check (priority in ('Low','Medium','High','Critical')),
  requested_by uuid references auth.users(id) on delete set null,
  approver_id uuid,
  due_date date,
  submitted_at timestamptz,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete cascade,
  foreign key (framework_id, organization_id) references public.frameworks(id, organization_id) on delete cascade,
  foreign key (gate_id, organization_id) references public.governance_gates(id, organization_id) on delete set null (gate_id),
  foreign key (organization_id, approver_id) references public.memberships(organization_id, user_id) on delete set null (approver_id),
  check (project_id is not null or framework_id is not null)
);

create table public.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  approval_id uuid not null,
  action text not null check (action in ('Submitted','Approved','Changes Requested','Rejected','Reassigned','Delegated','Withdrawn')),
  actor_id uuid references auth.users(id) on delete set null,
  assignee_id uuid,
  comment text,
  created_at timestamptz not null default now(),
  foreign key (approval_id, organization_id) references public.approvals(id, organization_id) on delete cascade,
  foreign key (organization_id, assignee_id) references public.memberships(organization_id, user_id) on delete set null (assignee_id)
);

create table public.governance_artefacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid,
  framework_id uuid,
  gate_id uuid,
  approval_id uuid,
  name text not null,
  storage_path text,
  external_url text,
  notes text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete cascade,
  foreign key (framework_id, organization_id) references public.frameworks(id, organization_id) on delete cascade,
  foreign key (gate_id, organization_id) references public.governance_gates(id, organization_id) on delete cascade,
  foreign key (approval_id, organization_id) references public.approvals(id, organization_id) on delete cascade,
  check (storage_path is not null or external_url is not null),
  check (project_id is not null or framework_id is not null or approval_id is not null)
);

create table public.project_risks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  title text not null,
  description text,
  probability text not null default 'Possible' check (probability in ('Rare','Unlikely','Possible','Likely','Almost Certain')),
  impact text not null default 'Moderate' check (impact in ('Minor','Moderate','Major','Severe')),
  status text not null default 'Open' check (status in ('Open','Mitigating','Accepted','Closed')),
  owner_id uuid,
  mitigation text,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete cascade,
  foreign key (organization_id, owner_id) references public.memberships(organization_id, user_id) on delete set null (owner_id)
);

create table public.project_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  title text not null,
  decision text not null,
  rationale text,
  decided_by uuid,
  decided_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (project_id, organization_id) references public.projects(id, organization_id) on delete cascade,
  foreign key (organization_id, decided_by) references public.memberships(organization_id, user_id) on delete set null (decided_by)
);

create table public.framework_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  framework_id uuid not null,
  version text,
  snapshot jsonb not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (framework_id, organization_id) references public.frameworks(id, organization_id) on delete cascade
);

create table public.delivery_item_phase_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  delivery_item_id uuid not null references public.delivery_items(id) on delete cascade,
  from_phase_id uuid references public.framework_phases(id) on delete set null,
  to_phase_id uuid references public.framework_phases(id) on delete set null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index governance_gates_framework_idx on public.governance_gates(framework_id, phase_id, position);
create index approvals_org_status_idx on public.approvals(organization_id, status, due_date);
create index approval_decisions_approval_idx on public.approval_decisions(approval_id, created_at);
create index governance_artefacts_project_idx on public.governance_artefacts(project_id, created_at);
create index project_risks_project_idx on public.project_risks(project_id, status);
create index project_decisions_project_idx on public.project_decisions(project_id, decided_at desc);
create index framework_versions_framework_idx on public.framework_versions(framework_id, created_at desc);
create index delivery_item_phase_history_item_idx on public.delivery_item_phase_history(delivery_item_id, changed_at desc);

alter table public.governance_gates enable row level security;
alter table public.approvals enable row level security;
alter table public.approval_decisions enable row level security;
alter table public.governance_artefacts enable row level security;
alter table public.project_risks enable row level security;
alter table public.project_decisions enable row level security;
alter table public.framework_versions enable row level security;
alter table public.delivery_item_phase_history enable row level security;

do $$ declare table_name text; begin
  foreach table_name in array array['governance_gates','approvals','approval_decisions','governance_artefacts','project_risks','project_decisions'] loop
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_member_of(organization_id))', table_name, table_name);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.is_member_of(organization_id))', table_name, table_name);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.is_member_of(organization_id)) with check (public.is_member_of(organization_id))', table_name, table_name);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (public.is_member_of(organization_id))', table_name, table_name);
  end loop;
end $$;

create policy framework_versions_select on public.framework_versions for select to authenticated using (public.is_member_of(organization_id));
create policy delivery_item_phase_history_select on public.delivery_item_phase_history for select to authenticated using (public.is_member_of(organization_id));

create or replace function public.record_framework_version() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if row(new.name,new.type,new.version,new.archived_at,new.level_1_label,new.level_2_label)
     is distinct from row(old.name,old.type,old.version,old.archived_at,old.level_1_label,old.level_2_label) then
    insert into public.framework_versions(organization_id, framework_id, version, snapshot, changed_by)
    values (new.organization_id, new.id, new.version, to_jsonb(old), auth.uid());
  end if;
  return new;
end $$;

create or replace function public.record_delivery_item_phase() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.current_phase_id is distinct from old.current_phase_id then
    insert into public.delivery_item_phase_history(organization_id, delivery_item_id, from_phase_id, to_phase_id, changed_by)
    values (new.organization_id, new.id, old.current_phase_id, new.current_phase_id, auth.uid());
  end if;
  return new;
end $$;

create trigger frameworks_version_history after update on public.frameworks
for each row execute function public.record_framework_version();
create trigger delivery_items_phase_history after update on public.delivery_items
for each row execute function public.record_delivery_item_phase();

create trigger governance_gates_set_updated_at before update on public.governance_gates for each row execute function public.set_updated_at();
create trigger approvals_set_updated_at before update on public.approvals for each row execute function public.set_updated_at();
create trigger governance_artefacts_set_updated_at before update on public.governance_artefacts for each row execute function public.set_updated_at();
create trigger project_risks_set_updated_at before update on public.project_risks for each row execute function public.set_updated_at();
create trigger project_decisions_set_updated_at before update on public.project_decisions for each row execute function public.set_updated_at();

create trigger governance_gates_audit after insert or update or delete on public.governance_gates for each row execute function public.record_audit_event();
create trigger approvals_audit after insert or update or delete on public.approvals for each row execute function public.record_audit_event();
create trigger approval_decisions_audit after insert or update or delete on public.approval_decisions for each row execute function public.record_audit_event();
create trigger governance_artefacts_audit after insert or update or delete on public.governance_artefacts for each row execute function public.record_audit_event();
create trigger project_risks_audit after insert or update or delete on public.project_risks for each row execute function public.record_audit_event();
create trigger project_decisions_audit after insert or update or delete on public.project_decisions for each row execute function public.record_audit_event();

revoke all on public.governance_gates, public.approvals, public.approval_decisions,
  public.governance_artefacts, public.project_risks, public.project_decisions,
  public.framework_versions, public.delivery_item_phase_history from anon;
grant select, insert, update, delete on public.governance_gates, public.approvals,
  public.approval_decisions, public.governance_artefacts, public.project_risks,
  public.project_decisions to authenticated;
grant select on public.framework_versions, public.delivery_item_phase_history to authenticated;
