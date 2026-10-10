-- The daily CRM loop, part 1: contacts, the activity timeline, and the columns and
-- rules the conversion function (part 2) and the record pages rest on.

-- ---------------------------------------------------------------------------
-- contacts: a person at a client or at a lead. Exactly one parent.
-- ---------------------------------------------------------------------------
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid,
  lead_id uuid,
  full_name text not null check (length(trim(full_name)) > 0),
  email text,
  phone text,
  job_title text,
  notes text,
  is_primary boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint contacts_one_parent check ((client_id is null) <> (lead_id is null)),
  constraint contacts_client_id_organization_id_fkey foreign key (client_id, organization_id)
    references public.clients(id, organization_id) on delete cascade,
  constraint contacts_lead_id_organization_id_fkey foreign key (lead_id, organization_id)
    references public.leads(id, organization_id) on delete cascade
);

create unique index contacts_one_primary_per_client on public.contacts(client_id)
  where is_primary and archived_at is null and client_id is not null;
create unique index contacts_one_primary_per_lead on public.contacts(lead_id)
  where is_primary and archived_at is null and lead_id is not null;
create index contacts_client_idx on public.contacts(client_id, organization_id);
create index contacts_lead_idx on public.contacts(lead_id, organization_id);

alter table public.contacts enable row level security;
create policy contacts_select on public.contacts for select to authenticated
  using (public.is_member_of(organization_id));
create policy contacts_insert on public.contacts for insert to authenticated
  with check (public.is_member_of(organization_id));
create policy contacts_update on public.contacts for update to authenticated
  using (public.is_member_of(organization_id)) with check (public.is_member_of(organization_id));

-- Supabase's default privileges grant everything to anon and authenticated; narrow them.
-- No delete: a contact is archived, and goes only with its parent.
revoke all on public.contacts from anon, authenticated;
grant select, insert, update on public.contacts to authenticated;

create trigger contacts_set_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();
create trigger contacts_audit after insert or update or delete on public.contacts
  for each row execute function public.record_audit_event();

-- ---------------------------------------------------------------------------
-- activities: one entry on a record's timeline. Logged by a person, or a system event.
-- ---------------------------------------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null constraint activities_kind_check check (kind in ('call','meeting','email','note','lead.converted','client.created_from_lead','opportunity.created_from_lead','opportunity.stage_changed','quote.sent','quote.accepted')),
  subject text not null check (length(trim(subject)) > 0),
  body text,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  lead_id uuid,
  client_id uuid,
  opportunity_id uuid,
  quote_id uuid,
  constraint activities_one_parent check (num_nonnulls(lead_id, client_id, opportunity_id, quote_id) = 1),
  constraint activities_organization_id_created_by_fkey foreign key (organization_id, created_by)
    references public.memberships(organization_id, user_id) on delete set null (created_by),
  constraint activities_lead_id_organization_id_fkey foreign key (lead_id, organization_id)
    references public.leads(id, organization_id) on delete cascade,
  constraint activities_client_id_organization_id_fkey foreign key (client_id, organization_id)
    references public.clients(id, organization_id) on delete cascade,
  constraint activities_opportunity_id_organization_id_fkey foreign key (opportunity_id, organization_id)
    references public.sales_opportunities(id, organization_id) on delete cascade,
  constraint activities_quote_id_organization_id_fkey foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id) on delete cascade
);

create index activities_lead_idx on public.activities(lead_id, occurred_at desc) where lead_id is not null;
create index activities_client_idx on public.activities(client_id, occurred_at desc) where client_id is not null;
create index activities_opportunity_idx on public.activities(opportunity_id, occurred_at desc) where opportunity_id is not null;
create index activities_quote_idx on public.activities(quote_id, occurred_at desc) where quote_id is not null;

alter table public.activities enable row level security;

create policy activities_select on public.activities for select to authenticated
  using (public.is_member_of(organization_id));

-- A member inserts only a LOGGED kind, only as themselves (authorship cannot be
-- forged), and not in the future. System kinds have no insert path for members.
create policy activities_insert on public.activities for insert to authenticated
  with check (
    public.is_member_of(organization_id)
    and kind in ('call','meeting','email','note')
    and created_by = (select auth.uid())
    and occurred_at <= now() + interval '5 minutes'
  );

-- The author may change their own logged entry, and an owner or admin any logged entry.
create policy activities_update on public.activities for update to authenticated
  using (
    public.is_member_of(organization_id)
    and kind in ('call','meeting','email','note')
    and (created_by = (select auth.uid()) or public.has_role(organization_id, array['owner','admin']))
  )
  with check (
    public.is_member_of(organization_id)
    and kind in ('call','meeting','email','note')
    and occurred_at <= now() + interval '5 minutes'
  );

create policy activities_delete on public.activities for delete to authenticated
  using (
    public.is_member_of(organization_id)
    and kind in ('call','meeting','email','note')
    and (created_by = (select auth.uid()) or public.has_role(organization_id, array['owner','admin']))
  );

revoke all on public.activities from anon, authenticated;
grant select, insert, update, delete on public.activities to authenticated;

-- What may change on a logged entry: its kind (within the logged kinds), subject, body and time.
-- Id, parent, author and details are fixed. created_by may become null only through the
-- foreign key action that follows removing a member: referential actions run as the table
-- owner, while members run as authenticated (or anon), so a direct change to created_by,
-- including setting it to null, by a member is refused.
create or replace function public.activities_freeze() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.created_at is distinct from old.created_at
     or new.lead_id is distinct from old.lead_id
     or new.client_id is distinct from old.client_id
     or new.opportunity_id is distinct from old.opportunity_id
     or new.quote_id is distinct from old.quote_id
     or new.details is distinct from old.details
     or (new.created_by is distinct from old.created_by
         and (new.created_by is not null or current_user in ('authenticated', 'anon'))) then
    raise exception 'activities_frozen: only the kind, subject, body and time of a logged entry can change'
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger activities_freeze before update on public.activities
  for each row execute function public.activities_freeze();
-- Inserts are the log itself; only changes to it are audited.
create trigger activities_audit after update or delete on public.activities
  for each row execute function public.record_audit_event();

-- The signed-in member, or null when there is none (a service-role write) or the
-- caller is not a member of that organisation. Used to stamp system entries.
create or replace function public.activity_actor(p_organization_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.user_id from public.memberships m
  where m.organization_id = p_organization_id and m.user_id = (select auth.uid())
  limit 1
$$;
revoke all on function public.activity_actor(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- System entries from triggers. security definer because members cannot insert a
-- system kind themselves; EXECUTE is revoked so they cannot be called as RPCs.
-- ---------------------------------------------------------------------------
create or replace function public.log_opportunity_stage_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.activities(organization_id, kind, subject, details, created_by, opportunity_id)
    values (
      new.organization_id, 'opportunity.stage_changed',
      'Stage changed from ' || old.stage || ' to ' || new.stage,
      jsonb_build_object('from', old.stage, 'to', new.stage),
      public.activity_actor(new.organization_id), new.id
    );
  end if;
  return new;
end $$;

create trigger sales_opportunities_log_stage after update on public.sales_opportunities
  for each row execute function public.log_opportunity_stage_change();

create or replace function public.log_quote_milestones() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.sent_at is not null and (tg_op = 'INSERT' or old.sent_at is null) then
    insert into public.activities(organization_id, kind, subject, occurred_at, created_by, quote_id)
    values (new.organization_id, 'quote.sent', 'Quote ' || new.quote_number || ' sent', new.sent_at,
            public.activity_actor(new.organization_id), new.id);
  end if;
  if new.accepted_at is not null and (tg_op = 'INSERT' or old.accepted_at is null) then
    insert into public.activities(organization_id, kind, subject, occurred_at, created_by, quote_id)
    values (new.organization_id, 'quote.accepted', 'Quote ' || new.quote_number || ' accepted', new.accepted_at,
            public.activity_actor(new.organization_id), new.id);
  end if;
  return new;
end $$;

create trigger quotes_log_milestones after insert or update on public.quotes
  for each row execute function public.log_quote_milestones();

revoke all on function public.log_opportunity_stage_change() from public, anon, authenticated;
revoke all on function public.log_quote_milestones() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Columns and checks on existing tables. Production holds no CRM rows, so the
-- checks apply cleanly.
-- ---------------------------------------------------------------------------
alter table public.tasks add column lead_id uuid, add column opportunity_id uuid;
alter table public.tasks
  add constraint tasks_lead_id_organization_id_fkey foreign key (lead_id, organization_id)
    references public.leads(id, organization_id) on delete set null (lead_id),
  add constraint tasks_opportunity_id_organization_id_fkey foreign key (opportunity_id, organization_id)
    references public.sales_opportunities(id, organization_id) on delete set null (opportunity_id);
create index tasks_lead_idx on public.tasks(lead_id, organization_id) where lead_id is not null;
create index tasks_opportunity_idx on public.tasks(opportunity_id, organization_id) where opportunity_id is not null;

alter table public.leads
  add column converted_at timestamptz,
  add column converted_client_id uuid,
  add column converted_opportunity_id uuid;
alter table public.leads
  add constraint leads_converted_client_id_organization_id_fkey foreign key (converted_client_id, organization_id)
    references public.clients(id, organization_id) on delete set null (converted_client_id),
  add constraint leads_converted_opportunity_id_organization_id_fkey foreign key (converted_opportunity_id, organization_id)
    references public.sales_opportunities(id, organization_id) on delete set null (converted_opportunity_id),
  -- A lead is Converted only through conversion, which sets converted_at.
  add constraint leads_converted_status_check check ((status = 'Converted') = (converted_at is not null));

-- A member cannot convert, un-convert or re-point a lead by hand: only the conversion
-- function (security definer, so it runs as the owner), the service role and referential
-- actions (which run as the owner) may touch these columns. Members run as authenticated.
create or replace function public.leads_guard_conversion() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') and (
       (tg_op = 'INSERT' and (
          new.status = 'Converted'
          or new.converted_at is not null
          or new.converted_client_id is not null
          or new.converted_opportunity_id is not null))
       or (tg_op = 'UPDATE' and (
          new.converted_at is distinct from old.converted_at
          or new.converted_client_id is distinct from old.converted_client_id
          or new.converted_opportunity_id is distinct from old.converted_opportunity_id
          or (new.status = 'Converted') is distinct from (old.status = 'Converted')))
     ) then
    raise exception 'leads_conversion_guarded: a lead is converted by using Convert lead on its page'
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger leads_guard_conversion before insert or update on public.leads
  for each row execute function public.leads_guard_conversion();
revoke all on function public.leads_guard_conversion() from public, anon, authenticated;

alter table public.sales_opportunities
  add constraint sales_opportunities_lost_reason_check
  check (stage <> 'Lost' or nullif(trim(lost_reason), '') is not null);

-- ---------------------------------------------------------------------------
-- Reads and one helper, security invoker so RLS scopes every row.
-- ---------------------------------------------------------------------------
create or replace function public.record_timeline(
  p_kind text,
  p_id uuid,
  p_limit integer default 20,
  p_before timestamptz default null,
  p_before_id uuid default null
) returns setof public.activities
language sql stable security invoker set search_path = '' as $$
  select a.*
  from public.activities a
  where (
      case p_kind
        when 'lead' then a.lead_id = p_id
        when 'quote' then a.quote_id = p_id
        when 'opportunity' then
          a.opportunity_id = p_id
          or a.quote_id in (select q.id from public.quotes q where q.opportunity_id = p_id)
        when 'client' then
          a.client_id = p_id
          or a.lead_id in (select l.id from public.leads l where l.converted_client_id = p_id)
          or a.opportunity_id in (select o.id from public.sales_opportunities o where o.client_id = p_id)
          or a.quote_id in (select q.id from public.quotes q where q.client_id = p_id)
        else false
      end
    )
    and (p_before is null or (a.occurred_at, a.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
  order by a.occurred_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
$$;

-- Makes one contact the primary for its parent. Two statements in one transaction:
-- the partial unique index is checked per row, so the old primary must clear first.
create or replace function public.set_primary_contact(p_contact_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  c public.contacts%rowtype;
begin
  select * into c from public.contacts where id = p_contact_id and archived_at is null;
  if not found then
    raise exception 'CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Lock the parent's contacts so concurrent callers queue instead of colliding on the index.
  perform 1 from public.contacts
    where organization_id = c.organization_id
      and ((c.client_id is not null and client_id = c.client_id) or (c.lead_id is not null and lead_id = c.lead_id))
    for update;
  update public.contacts
    set is_primary = false
    where organization_id = c.organization_id and is_primary and archived_at is null and id <> c.id
      and ((c.client_id is not null and client_id = c.client_id) or (c.lead_id is not null and lead_id = c.lead_id));
  update public.contacts set is_primary = true where id = c.id;
end $$;

revoke all on function public.record_timeline(text, uuid, integer, timestamptz, uuid) from public, anon;
revoke all on function public.set_primary_contact(uuid) from public, anon;
grant execute on function public.record_timeline(text, uuid, integer, timestamptz, uuid) to authenticated;
grant execute on function public.set_primary_contact(uuid) to authenticated;
