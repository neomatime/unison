create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  status text not null default 'active' check (status in ('active','suspended','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id text not null check (role_id in ('owner','admin','member')),
  status text not null default 'active' check (status in ('invited','active','suspended','removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index memberships_user_lookup on public.memberships (user_id, organization_id) where status = 'active';

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role_id text not null check (role_id in ('owner','admin','member')),
  status text not null default 'pending' check (status in ('pending','accepted','expired','revoked')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index invitations_pending on public.invitations (organization_id, status);
create unique index invitations_one_pending_per_email
  on public.invitations (organization_id, lower(email)) where status = 'pending';

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  resource text not null,
  resource_id uuid,
  action text not null check (action in ('insert','update','delete')),
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_org_time on public.audit_events (organization_id, created_at desc);

alter table public.organizations enable row level security;
alter table public.memberships  enable row level security;
alter table public.invitations  enable row level security;
alter table public.audit_events enable row level security;
