# The Daily CRM Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Contacts, an activity timeline, lead → client conversion, follow-ups from records, and a quick opportunity stage change, all working from the lead, opportunity, client and quote pages.

**Architecture:** Two migrations add `contacts` and `activities`, new columns on `tasks`/`leads`, system-event triggers and two `security invoker` read/helper functions (`record_timeline`, `set_primary_contact`), then one `security definer` function `convert_lead` that does the whole conversion atomically. A new `features/crm-workspace/` holds pure form readers, server actions, queries and three section components (Contacts, Timeline, Follow-ups) that are mounted on the existing record pages. Follow-ups reuse `tasks`.

**Tech Stack:** Next.js 16 App Router (server actions, `useActionState`), React 19, Supabase Postgres 17 with RLS, `node --test --experimental-strip-types`, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-10-crm-daily-loop-design.md`

## Global Constraints

- `unison-uat` (id `nwdzpjzllhhqwawmsxjd`) is production. Every test row is deleted, with its audit events. Rolled-back probes before applying any migration.
- Migrations are append-only; this slice adds two (`20261010100000_crm_contacts_activities.sql`, `20261010110000_crm_convert_lead.sql`), and more only if a review finds a hole. Never edit an applied migration.
- A control in the UI is a claim the product supports it. No role-based behaviour is invented beyond: a logged activity can be edited or deleted only by its author or an owner or admin; system entries can never be changed.
- Secrets live in `.env.local` only; never print or commit them.
- Never `git add -A`, `git checkout .`, `git restore .`, `git stash` or `git clean`; stage explicit paths. The working tree contains unrelated changes under `public/` (icons and brand images) that must not be staged or touched. Commit and push only when the user asks.
- Every task that adds or changes `.ts`/`.tsx` runs `pnpm typecheck` (exit 0) and `pnpm test` before committing (`node --experimental-strip-types` does no type checking and tests are inside tsconfig). `pnpm lint` cannot run (ESLint is not installed); say so rather than claiming it.
- `'use server'` files export only async functions and types. A function imported from a `'use client'` module is never called from a server component. `next build` does not render dynamic routes, so it is not proof of runtime behaviour.
- Files imported by unit tests (`vocabulary.ts`, `fields.ts`) use relative imports with `.ts` extensions only (Node's test runner cannot resolve `@/`).
- Working-tree files are CRLF (git `autocrlf`); use the Edit tool for existing files and do not rewrite whole files' line endings.
- Add `contacts` and `activities` to the audit-event cleanup sweep in `tests/integration/rls/helpers.ts`, or orphaned audit rows leak into production.
- `features/product-ui/components/record-collection-workspace.tsx` must not be modified.

## Review Focus

Failure modes the spec implies but a happy-path test would not exercise, most likely first. Each has a test in the task named.

1. **A company written differently from the existing client** ("ACME  corp" vs "Acme Corp") must still be found as a duplicate. (Task 3: `normalizeCompanyName` unit test; Task 6 uses it.)
2. **Two people click Convert at the same moment.** Exactly one conversion happens and the other is refused, with one client and one opportunity created. (Task 2: concurrency test.)
3. **A lead whose contact name is blank.** Conversion fails cleanly, creates nothing, and says why. This is also how rollback is proved. (Task 2: rollback test; Task 4: message mapping.)
4. **A member is removed from the organisation.** Their logged activities stay, with no author, and removing them does not fail. (Task 1: membership-removal test.)
5. **A malformed or future activity time, or a follow-up due date like 30 February.** Refused with a plain message, never stored. (Task 3: reader tests.)

---

## File map

- Create `supabase/migrations/20261010100000_crm_contacts_activities.sql`, `supabase/migrations/20261010110000_crm_convert_lead.sql`.
- Modify `tests/integration/rls/helpers.ts` (sweep). Create `tests/integration/rls/crm-contacts-activities.test.ts`, `tests/integration/rls/crm-convert-lead.test.ts`.
- Create `features/crm-workspace/`: `types.ts`, `vocabulary.ts`, `fields.ts`, `revalidate.ts`, `server-context.ts`, `actions/{contacts,activities,follow-ups,convert-lead,opportunity-stage}.ts`, `queries/{get-record-workspace,find-matching-clients}.ts`, `components/{workspace-section,form-parts,action-button,occurred-at-field,contacts-section,timeline-section,follow-ups-section,record-workspace,convert-lead-form,stage-control}.tsx`.
- Create `app/(unison)/commercial/leads/[leadId]/convert/page.tsx`.
- Modify `features/commercial-finance/components/phase-six-detail.tsx` (`actions` and `after` props), `phase-six-form.tsx` (lead status options), `features/commercial-finance/actions/phase-six.ts` (guards), the four record pages, `features/clients/components/client-detail.tsx`.
- Tests: `tests/unit/crm-workspace-fields.test.ts`, `crm-workspace-vocabulary.test.ts`, `crm-workspace-ui.test.ts`.
- Docs: `docs/follow-ups.md`, `docs/crm-roadmap.md`.

---

### Task 1: Contacts, activities and the rules (migration A) with RLS tests

**Files:**
- Create: `supabase/migrations/20261010100000_crm_contacts_activities.sql`
- Modify: `tests/integration/rls/helpers.ts` (add `'contacts'`, `'activities'` to the sweep array)
- Create: `tests/integration/rls/crm-contacts-activities.test.ts`

**Interfaces:**
- Produces tables `public.contacts`, `public.activities`; columns `tasks.lead_id`, `tasks.opportunity_id`, `leads.converted_at|converted_client_id|converted_opportunity_id`; functions `public.record_timeline(p_kind text, p_id uuid, p_limit integer default 20, p_before timestamptz default null, p_before_id uuid default null) returns setof public.activities` and `public.set_primary_contact(p_contact_id uuid) returns void` (raises `CONTACT_NOT_FOUND`, SQLSTATE `P0002`); and `public.activity_actor(uuid)`. Constraint names are asserted by later tests, so use them exactly.

- [ ] **Step 1: Write the migration** `supabase/migrations/20261010100000_crm_contacts_activities.sql`:

```sql
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
-- Parent, author and details are fixed. created_by may become null, because removing a
-- member sets it null through a foreign key action, which is an UPDATE this trigger sees.
create or replace function public.activities_freeze() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id
     or new.created_at is distinct from old.created_at
     or new.lead_id is distinct from old.lead_id
     or new.client_id is distinct from old.client_id
     or new.opportunity_id is distinct from old.opportunity_id
     or new.quote_id is distinct from old.quote_id
     or new.details is distinct from old.details
     or (new.created_by is distinct from old.created_by and new.created_by is not null) then
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
```

- [ ] **Step 2: Add the two resources to the cleanup sweep.** In `tests/integration/rls/helpers.ts`, in the `deliveryEvents` `.in('resource', [ ... ])` array, after `'governance_gates',` add:

```ts
        'contacts',
        'activities',
```

- [ ] **Step 3: Write the tests** `tests/integration/rls/crm-contacts-activities.test.ts`:

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let member: U
let other: U
let adminUser: U
let outsider: U
let memberClient: SupabaseClient
let otherClient: SupabaseClient
let adminClient: SupabaseClient
let outsiderClient: SupabaseClient
let clientA: string
let clientA2: string
let clientB: string
let leadA: string
let oppA: string
let quoteA: string
const extraUsers: string[] = []
const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function one(table: string, row: Record<string, unknown>) {
  const { data, error } = await admin.from(table).insert(row).select('id').single()
  if (error) throw new Error(`${table}: ${error.message}`)
  return data.id as string
}

const newOpp = (over: Record<string, unknown> = {}) =>
  one('sales_opportunities', { organization_id: orgA, name: 'Opp', client_name: 'Acme', stage: 'Discovery', ...over })

const logged = (over: Record<string, unknown> = {}) => ({
  organization_id: orgA, kind: 'note', subject: 'A note', created_by: member.id, lead_id: leadA, ...over,
})

before(async () => {
  orgA = await createFixtureOrg('crm-contacts')
  orgB = await createFixtureOrg('crm-contacts-other')
  member = await createFixtureUser(orgA, 'member')
  other = await createFixtureUser(orgA, 'member')
  adminUser = await createFixtureUser(orgA, 'admin')
  outsider = await createFixtureUser(orgB, 'owner')
  memberClient = await signedInClient(member.email, member.password)
  otherClient = await signedInClient(other.email, other.password)
  adminClient = await signedInClient(adminUser.email, adminUser.password)
  outsiderClient = await signedInClient(outsider.email, outsider.password)
  clientA = await one('clients', { organization_id: orgA, name: 'Client A', status: 'Active' })
  clientA2 = await one('clients', { organization_id: orgA, name: 'Client A2', status: 'Active' })
  clientB = await one('clients', { organization_id: orgB, name: 'Client B', status: 'Active' })
  leadA = await one('leads', { organization_id: orgA, company_name: 'Lead A', contact_name: 'Pat' })
  oppA = await newOpp()
  quoteA = await one('quotes', { organization_id: orgA, quote_number: 'CC-1', client_name: 'Acme' })
})

after(async () => {
  await cleanup([orgA, orgB], [member.id, other.id, adminUser.id, outsider.id, ...extraUsers])
})

// ------------------------------------------------------------------ contacts

test('contacts: exactly one parent', async () => {
  const both = await admin.from('contacts').insert({ organization_id: orgA, full_name: 'X', client_id: clientA, lead_id: leadA })
  assert.equal(both.error?.code, '23514')
  assert.match(both.error!.message, /contacts_one_parent/)
  const neither = await admin.from('contacts').insert({ organization_id: orgA, full_name: 'X' })
  assert.equal(neither.error?.code, '23514')
  assert.match(neither.error!.message, /contacts_one_parent/)
})

test('contacts: a blank name is refused', async () => {
  const { error } = await admin.from('contacts').insert({ organization_id: orgA, client_id: clientA, full_name: '   ' })
  assert.equal(error?.code, '23514')
})

test('contacts: a client from another organisation is unrepresentable', async () => {
  const { error } = await admin.from('contacts').insert({ organization_id: orgA, client_id: clientB, full_name: 'X' })
  assert.equal(error?.code, '23503')
  assert.match(error!.message, /contacts_client_id_organization_id_fkey/)
})

test('contacts: one primary per parent, and an archived primary does not block another', async () => {
  const first = await one('contacts', { organization_id: orgA, client_id: clientA2, full_name: 'First', is_primary: true })
  const second = await admin.from('contacts').insert({ organization_id: orgA, client_id: clientA2, full_name: 'Second', is_primary: true })
  assert.equal(second.error?.code, '23505')
  assert.match(second.error!.message, /contacts_one_primary_per_client/)
  await admin.from('contacts').update({ archived_at: new Date().toISOString() }).eq('id', first)
  const third = await admin.from('contacts').insert({ organization_id: orgA, client_id: clientA2, full_name: 'Third', is_primary: true })
  assert.equal(third.error, null)
  const onOther = await admin.from('contacts').insert({ organization_id: orgA, client_id: clientA, full_name: 'Elsewhere', is_primary: true })
  assert.equal(onOther.error, null, 'a different parent has its own primary')
})

test('contacts: a member reads, writes and updates but cannot delete; an outsider can do nothing', async () => {
  const created = await memberClient.from('contacts').insert({ organization_id: orgA, lead_id: leadA, full_name: 'Member made' }).select('id').single()
  assert.equal(created.error, null)
  const updated = await memberClient.from('contacts').update({ job_title: 'CFO' }).eq('id', created.data!.id).select('job_title').single()
  assert.equal(updated.data!.job_title, 'CFO')
  const removed = await memberClient.from('contacts').delete().eq('id', created.data!.id)
  assert.equal(removed.error?.code, '42501', 'there is no delete privilege: contacts are archived')
  assert.match(removed.error!.message, /permission denied for table contacts/)

  const read = await outsiderClient.from('contacts').select('id').eq('organization_id', orgA)
  assert.deepEqual(read.data, [])
  const write = await outsiderClient.from('contacts').insert({ organization_id: orgA, lead_id: leadA, full_name: 'Hijack' })
  assert.equal(write.error?.code, '42501')
  const change = await outsiderClient.from('contacts').update({ full_name: 'Hijacked' }).eq('id', created.data!.id).select('id')
  assert.deepEqual(change.data, [])
})

test('contacts: anon has no privileges', async () => {
  const read = await anonymous.from('contacts').select('id').limit(1)
  assert.match(read.error!.message, /permission denied for table contacts/)
  const write = await anonymous.from('contacts').insert({ organization_id: orgA, full_name: 'X', lead_id: leadA })
  assert.match(write.error!.message, /permission denied for table contacts/)
})

test('set_primary_contact moves the primary in one step and refuses a contact the caller cannot see', async () => {
  const a = await one('contacts', { organization_id: orgA, client_id: clientA2, full_name: 'Prim A' })
  const b = await one('contacts', { organization_id: orgA, client_id: clientA2, full_name: 'Prim B' })
  await memberClient.rpc('set_primary_contact', { p_contact_id: a })
  await memberClient.rpc('set_primary_contact', { p_contact_id: b })
  const { data } = await admin.from('contacts').select('id, is_primary').eq('client_id', clientA2).is('archived_at', null)
  assert.deepEqual(data!.filter((row) => row.is_primary).map((row) => row.id), [b], 'exactly one primary remains')

  const foreign = await outsiderClient.rpc('set_primary_contact', { p_contact_id: a })
  assert.equal(foreign.error?.code, 'P0002')
  assert.match(foreign.error!.message, /CONTACT_NOT_FOUND/)
  const signedOut = await anonymous.rpc('set_primary_contact', { p_contact_id: a })
  assert.match(signedOut.error!.message, /permission denied for function set_primary_contact/)
})

// ------------------------------------------------------------------ activities

test('activities: exactly one parent, and the kind must be known', async () => {
  const none = await admin.from('activities').insert({ organization_id: orgA, kind: 'note', subject: 'x' })
  assert.equal(none.error?.code, '23514')
  assert.match(none.error!.message, /activities_one_parent/)
  const two = await admin.from('activities').insert({ organization_id: orgA, kind: 'note', subject: 'x', lead_id: leadA, client_id: clientA })
  assert.match(two.error!.message, /activities_one_parent/)
  const bad = await admin.from('activities').insert({ organization_id: orgA, kind: 'gossip', subject: 'x', lead_id: leadA })
  assert.equal(bad.error?.code, '23514')
  assert.match(bad.error!.message, /activities_kind_check/)
})

test('activities: a parent from another organisation is unrepresentable', async () => {
  const { error } = await admin.from('activities').insert({ organization_id: orgA, kind: 'note', subject: 'x', client_id: clientB })
  assert.equal(error?.code, '23503')
  assert.match(error!.message, /activities_client_id_organization_id_fkey/)
})

test('activities: a member logs as themselves; forging an author, a system kind or a future time is refused', async () => {
  const ok = await memberClient.from('activities').insert(logged()).select('id').single()
  assert.equal(ok.error, null)

  const forged = await memberClient.from('activities').insert(logged({ created_by: other.id }))
  assert.equal(forged.error?.code, '42501', "a member cannot log as someone else")

  const system = await memberClient.from('activities').insert(logged({ kind: 'lead.converted' }))
  assert.equal(system.error?.code, '42501', 'a member cannot write a system entry')

  const future = await memberClient.from('activities').insert(logged({ occurred_at: new Date(Date.now() + 86_400_000).toISOString() }))
  assert.equal(future.error?.code, '42501', 'an entry cannot be in the future')

  const outsiderWrite = await outsiderClient.from('activities').insert(logged({ created_by: outsider.id }))
  assert.equal(outsiderWrite.error?.code, '42501')
})

test('activities: the author or an admin may edit and delete a logged entry; another member may not', async () => {
  const id = (await memberClient.from('activities').insert(logged({ subject: 'Mine' })).select('id').single()).data!.id

  const byOther = await otherClient.from('activities').update({ subject: 'Hijacked' }).eq('id', id).select('id')
  assert.deepEqual(byOther.data, [], 'another member matches nothing')
  const deleteByOther = await otherClient.from('activities').delete().eq('id', id).select('id')
  assert.deepEqual(deleteByOther.data, [])

  const byAuthor = await memberClient.from('activities').update({ subject: 'Edited' }).eq('id', id).select('subject').single()
  assert.equal(byAuthor.data!.subject, 'Edited')
  const byAdmin = await adminClient.from('activities').update({ body: 'Admin note' }).eq('id', id).select('body').single()
  assert.equal(byAdmin.data!.body, 'Admin note')
  const removed = await adminClient.from('activities').delete().eq('id', id).select('id')
  assert.equal(removed.data!.length, 1)
})

test('activities: system entries cannot be edited or deleted by anyone, even an admin', async () => {
  const id = await one('activities', { organization_id: orgA, kind: 'lead.converted', subject: 'System', lead_id: leadA })
  const edit = await adminClient.from('activities').update({ subject: 'Rewritten' }).eq('id', id).select('id')
  assert.deepEqual(edit.data, [])
  const remove = await adminClient.from('activities').delete().eq('id', id).select('id')
  assert.deepEqual(remove.data, [])
  const stored = await admin.from('activities').select('subject').eq('id', id).single()
  assert.equal(stored.data!.subject, 'System')
})

test('activities: the parent, author and details of an entry are frozen', async () => {
  const id = (await memberClient.from('activities').insert(logged()).select('id').single()).data!.id
  const move = await memberClient.from('activities').update({ lead_id: null, client_id: clientA }).eq('id', id)
  assert.equal(move.error?.code, '23514')
  assert.match(move.error!.message, /activities_frozen/)
  const reassign = await adminClient.from('activities').update({ created_by: adminUser.id }).eq('id', id)
  assert.match(reassign.error!.message, /activities_frozen/)
})

test('removing a member leaves their entries with no author and does not fail', async () => {
  const leaver = await createFixtureUser(orgA, 'member')
  extraUsers.push(leaver.id)
  const leaverClient = await signedInClient(leaver.email, leaver.password)
  const id = (await leaverClient.from('activities').insert(logged({ created_by: leaver.id, subject: 'From a leaver' })).select('id').single()).data!.id

  const removal = await admin.from('memberships').delete().eq('organization_id', orgA).eq('user_id', leaver.id)
  assert.equal(removal.error, null, 'the freeze trigger must allow created_by to become null')
  const after = await admin.from('activities').select('created_by, subject').eq('id', id).single()
  assert.equal(after.data!.created_by, null)
  assert.equal(after.data!.subject, 'From a leaver')
})

test('activities: anon has no privileges', async () => {
  const read = await anonymous.from('activities').select('id').limit(1)
  assert.match(read.error!.message, /permission denied for table activities/)
})

// ------------------------------------------------------------------ triggers

const entries = async (column: string, id: string, kind: string) => {
  const { data } = await admin.from('activities').select('*').eq(column, id).eq('kind', kind)
  return data ?? []
}

test('a stage change writes one entry with from and to, as the member who made it, and nothing else does', async () => {
  const id = await newOpp()
  await memberClient.from('sales_opportunities').update({ stage: 'Qualified' }).eq('id', id)
  const [entry, ...rest] = await entries('opportunity_id', id, 'opportunity.stage_changed')
  assert.equal(rest.length, 0)
  assert.deepEqual(entry.details, { from: 'Discovery', to: 'Qualified' })
  assert.equal(entry.created_by, member.id)
  assert.equal(entry.subject, 'Stage changed from Discovery to Qualified')

  await memberClient.from('sales_opportunities').update({ notes: 'no stage change' }).eq('id', id)
  assert.equal((await entries('opportunity_id', id, 'opportunity.stage_changed')).length, 1, 'an edit that keeps the stage writes nothing')

  await admin.from('sales_opportunities').update({ stage: 'Won' }).eq('id', id)
  const all = await entries('opportunity_id', id, 'opportunity.stage_changed')
  assert.equal(all.length, 2)
  assert.equal(all.find((row) => row.details.to === 'Won')!.created_by, null, 'a service-role change has no author')
})

test('a quote writes sent and accepted once each, from their own timestamps', async () => {
  const id = await one('quotes', { organization_id: orgA, quote_number: 'CQ-EVENTS', client_name: 'Acme', status: 'Sent' })
  assert.equal((await entries('quote_id', id, 'quote.sent')).length, 1, 'created already Sent')
  await admin.from('quotes').update({ notes: 'edit' }).eq('id', id)
  assert.equal((await entries('quote_id', id, 'quote.sent')).length, 1, 'an edit does not re-send')
  await admin.from('quotes').update({ status: 'Accepted' }).eq('id', id)
  assert.equal((await entries('quote_id', id, 'quote.accepted')).length, 1)
  assert.equal((await entries('quote_id', id, 'quote.sent')).length, 1, 'accepting does not add a sent entry')
})

test('the trigger functions cannot be called as RPCs', async () => {
  for (const name of ['log_opportunity_stage_change', 'log_quote_milestones']) {
    const { error } = await memberClient.rpc(name)
    assert.match(error!.message, new RegExp(`permission denied for function ${name}`), name)
  }
})

// ------------------------------------------------------------------ checks and links

test('a lead is Converted only through conversion, and an opportunity cannot be Lost without a reason', async () => {
  const converted = await admin.from('leads').update({ status: 'Converted' }).eq('id', leadA)
  assert.equal(converted.error?.code, '23514')
  assert.match(converted.error!.message, /leads_converted_status_check/)
  const stamped = await admin.from('leads').update({ converted_at: new Date().toISOString() }).eq('id', leadA)
  assert.match(stamped.error!.message, /leads_converted_status_check/, 'converted_at without the status is also refused')

  const lost = await admin.from('sales_opportunities').update({ stage: 'Lost' }).eq('id', oppA)
  assert.equal(lost.error?.code, '23514')
  assert.match(lost.error!.message, /sales_opportunities_lost_reason_check/)
  const blank = await admin.from('sales_opportunities').update({ stage: 'Lost', lost_reason: '   ' }).eq('id', oppA)
  assert.match(blank.error!.message, /sales_opportunities_lost_reason_check/)
  const fine = await admin.from('sales_opportunities').update({ stage: 'Lost', lost_reason: 'Budget' }).eq('id', oppA)
  assert.equal(fine.error, null)
  await admin.from('sales_opportunities').update({ stage: 'Discovery', lost_reason: null }).eq('id', oppA)
})

test('tasks can link to a lead and an opportunity in the same organisation only', async () => {
  const ok = await admin.from('tasks').insert({ organization_id: orgA, title: 'Call', lead_id: leadA, opportunity_id: oppA })
  assert.equal(ok.error, null)
  const foreignLead = await admin.from('leads').insert({ organization_id: orgB, company_name: 'B Lead', contact_name: 'x' }).select('id').single()
  const bad = await admin.from('tasks').insert({ organization_id: orgA, title: 'Bad', lead_id: foreignLead.data!.id })
  assert.equal(bad.error?.code, '23503')
  assert.match(bad.error!.message, /tasks_lead_id_organization_id_fkey/)
})

// ------------------------------------------------------------------ record_timeline

test('record_timeline shows each page what the spec says, newest first, and nothing from another organisation', async () => {
  const c = await one('clients', { organization_id: orgA, name: 'Timeline Co', status: 'Active' })
  const l = await one('leads', { organization_id: orgA, company_name: 'Timeline Co', contact_name: 'Pat' })
  await admin.from('leads').update({ status: 'Converted', converted_at: new Date().toISOString(), converted_client_id: c }).eq('id', l)
  const o = await newOpp({ client_id: c, client_name: 'Timeline Co', lead_id: l })
  const q = await one('quotes', { organization_id: orgA, quote_number: 'CQ-TL', client_name: 'Timeline Co', client_id: c, opportunity_id: o })
  const note = (parent: Record<string, string>, subject: string, at: string) =>
    one('activities', { organization_id: orgA, kind: 'note', subject, occurred_at: at, ...parent })
  await note({ lead_id: l }, 'on lead', '2026-01-01T10:00:00Z')
  await note({ client_id: c }, 'on client', '2026-01-02T10:00:00Z')
  await note({ opportunity_id: o }, 'on opportunity', '2026-01-03T10:00:00Z')
  await note({ quote_id: q }, 'on quote', '2026-01-04T10:00:00Z')

  const subjects = async (kind: string, id: string, client: SupabaseClient = memberClient) =>
    ((await client.rpc('record_timeline', { p_kind: kind, p_id: id })).data ?? []).map((row: any) => row.subject)

  assert.deepEqual(await subjects('lead', l), ['on lead'])
  assert.deepEqual(await subjects('quote', q), ['on quote'])
  assert.deepEqual(await subjects('opportunity', o), ['on quote', 'on opportunity'], 'an opportunity includes its quotes')
  assert.deepEqual(await subjects('client', c), ['on quote', 'on opportunity', 'on client', 'on lead'], 'a client includes its lead, opportunities and quotes')
  assert.deepEqual(await subjects('client', c, outsiderClient), [], 'another organisation sees nothing')
  assert.deepEqual(await subjects('mystery', c), [], 'an unknown kind matches nothing')
})

test('record_timeline pages by a cursor without repeating or skipping entries that share a time', async () => {
  const l = await one('leads', { organization_id: orgA, company_name: 'Paging Co', contact_name: 'Pat' })
  const at = '2026-02-02T10:00:00Z'
  for (let index = 0; index < 5; index += 1) {
    await one('activities', { organization_id: orgA, kind: 'note', subject: `n${index}`, occurred_at: at, lead_id: l })
  }
  const seen: string[] = []
  let cursor: { at: string | null; id: string | null } = { at: null, id: null }
  for (let page = 0; page < 5; page += 1) {
    const { data } = await memberClient.rpc('record_timeline', { p_kind: 'lead', p_id: l, p_limit: 2, p_before: cursor.at, p_before_id: cursor.id })
    if (!data?.length) break
    seen.push(...data.map((row: any) => row.id))
    const last = data[data.length - 1]
    cursor = { at: last.occurred_at, id: last.id }
  }
  assert.equal(seen.length, 5)
  assert.equal(new Set(seen).size, 5, 'no entry is repeated or skipped')
})

test('record_timeline is not callable signed out', async () => {
  const { error } = await anonymous.rpc('record_timeline', { p_kind: 'lead', p_id: leadA })
  assert.match(error!.message, /permission denied for function record_timeline/)
})
```

- [ ] **Step 4: Typecheck the tests.** Run `pnpm typecheck`. Expected: exit 0.

- [ ] **Step 5: CONTROLLER STEP, probe and apply (the implementer stops here and reports).** The controller runs the migration inside a `DO` block that always ends in `raise exception`, against `unison-uat`, to confirm it compiles and behaves; then applies it with the Supabase MCP `apply_migration` (name `crm_contacts_activities`); then verifies `has_table_privilege('authenticated','public.contacts','DELETE')` is false and the function privileges.

- [ ] **Step 6: Run the tests.** `node --test --env-file=.env.local --experimental-strip-types --test-concurrency=1 tests/integration/rls/crm-contacts-activities.test.ts`. Expected: all pass. Then run a read-only SQL check that no fixture organisation, no `@unison.test` user and no `audit_events` with `organization_id is null` for resources `contacts`, `activities`, `leads`, `clients`, `sales_opportunities`, `quotes`, `tasks` remain.

- [ ] **Step 7: Commit** by explicit path: `supabase/migrations/20261010100000_crm_contacts_activities.sql`, `tests/integration/rls/helpers.ts`, `tests/integration/rls/crm-contacts-activities.test.ts`. Message: `feat(crm): contacts and activities tables, system-event triggers, timeline and primary-contact functions`.

---

### Task 2: `convert_lead` (migration B) with RLS tests

**Files:**
- Create: `supabase/migrations/20261010110000_crm_convert_lead.sql`
- Create: `tests/integration/rls/crm-convert-lead.test.ts`

**Interfaces:**
- Consumes Task 1's tables and columns.
- Produces `public.convert_lead(p_lead_id uuid, p_client_id uuid default null) returns jsonb` with keys `client_id`, `contact_id`, `opportunity_id`, `created_client` (boolean). Raises with these message tokens: `LEAD_NOT_FOUND` (SQLSTATE `42501`), `LEAD_ARCHIVED` and `LEAD_ALREADY_CONVERTED` (`23514`), `CLIENT_NOT_FOUND` (`23503`). Task 4 maps them.

- [ ] **Step 1: Write the migration** `supabase/migrations/20261010110000_crm_convert_lead.sql`:

```sql
-- The daily CRM loop, part 2: lead conversion in one transaction.
--
-- security definer, because it writes system timeline entries that members cannot
-- write directly. It therefore checks everything itself: the caller must be a member
-- of the lead's organisation, and every row it touches is scoped to that organisation.

create or replace function public.convert_lead(p_lead_id uuid, p_client_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_lead public.leads%rowtype;
  v_org uuid;
  v_actor uuid;
  v_client_id uuid;
  v_client_name text;
  v_contact_id uuid;
  v_opportunity_id uuid;
  v_created_client boolean := false;
  v_has_primary boolean;
begin
  -- Locking the lead row serialises two simultaneous conversions of the same lead.
  select * into v_lead from public.leads where id = p_lead_id for update;
  -- The same answer for "no such lead" and "not yours", so existence is not revealed.
  if not found or not public.is_member_of(v_lead.organization_id) then
    raise exception 'LEAD_NOT_FOUND' using errcode = '42501';
  end if;
  v_org := v_lead.organization_id;
  if v_lead.archived_at is not null then
    raise exception 'LEAD_ARCHIVED' using errcode = '23514';
  end if;
  if v_lead.converted_at is not null then
    raise exception 'LEAD_ALREADY_CONVERTED' using errcode = '23514';
  end if;
  v_actor := public.activity_actor(v_org);

  -- 1. The client: the chosen one, or a new one made from the lead.
  if p_client_id is not null then
    select c.id, c.name into v_client_id, v_client_name
    from public.clients c
    where c.id = p_client_id and c.organization_id = v_org and c.archived_at is null;
    if v_client_id is null then
      raise exception 'CLIENT_NOT_FOUND' using errcode = '23503';
    end if;
  else
    insert into public.clients(organization_id, name, industry, contact_name, contact_email, contact_phone, status, engagement_type)
    values (
      v_org, v_lead.company_name, v_lead.industry, v_lead.contact_name, v_lead.contact_email, v_lead.contact_phone,
      'Onboarding',
      case when v_lead.engagement_type in ('Retainer', 'Project') then v_lead.engagement_type end
    )
    returning id, name into v_client_id, v_client_name;
    v_created_client := true;
  end if;

  -- 2. Contacts already on the lead move to the client. A moved primary stays primary
  --    only if the client has none.
  select exists(
    select 1 from public.contacts where client_id = v_client_id and is_primary and archived_at is null
  ) into v_has_primary;
  update public.contacts
    set client_id = v_client_id, lead_id = null, is_primary = (is_primary and not v_has_primary)
    where lead_id = v_lead.id and organization_id = v_org and archived_at is null;
  select exists(
    select 1 from public.contacts where client_id = v_client_id and is_primary and archived_at is null
  ) into v_has_primary;

  -- 3. The lead's own contact details become a contact on the client, or reuse one
  --    with the same email. A blank contact name fails the table's check, which
  --    rolls the whole conversion back.
  if nullif(trim(v_lead.contact_email), '') is not null then
    select c.id into v_contact_id
    from public.contacts c
    where c.client_id = v_client_id and c.archived_at is null and lower(c.email) = lower(trim(v_lead.contact_email))
    limit 1;
  end if;
  if v_contact_id is null then
    insert into public.contacts(organization_id, client_id, full_name, email, phone, job_title, is_primary)
    values (
      v_org, v_client_id, v_lead.contact_name, nullif(trim(v_lead.contact_email), ''),
      nullif(trim(v_lead.contact_phone), ''), nullif(trim(v_lead.contact_role), ''), not v_has_primary
    )
    returning id into v_contact_id;
  elsif not v_has_primary then
    update public.contacts set is_primary = true where id = v_contact_id;
  end if;

  -- 4. Follow-ups already on the lead now also belong to the client.
  update public.tasks set client_id = v_client_id where lead_id = v_lead.id and organization_id = v_org;

  -- 5. The opportunity, at the first stage, with the lead's owner and value.
  insert into public.sales_opportunities(organization_id, name, client_id, client_name, lead_id, owner_id, stage, expected_value, currency, notes)
  values (v_org, v_lead.company_name, v_client_id, v_client_name, v_lead.id, v_lead.owner_id, 'Discovery',
          v_lead.estimated_value, v_lead.currency, v_lead.notes)
  returning id into v_opportunity_id;

  -- 6. The lead.
  update public.leads
    set status = 'Converted', converted_at = now(), converted_client_id = v_client_id,
        converted_opportunity_id = v_opportunity_id, last_activity_at = now()
    where id = v_lead.id;

  -- 7. System entries, one on each record.
  insert into public.activities(organization_id, kind, subject, details, created_by, lead_id)
  values (v_org, 'lead.converted', 'Converted to ' || v_client_name,
          jsonb_build_object('client_id', v_client_id, 'opportunity_id', v_opportunity_id), v_actor, v_lead.id);
  if v_created_client then
    insert into public.activities(organization_id, kind, subject, details, created_by, client_id)
    values (v_org, 'client.created_from_lead', 'Created from lead ' || v_lead.company_name,
            jsonb_build_object('lead_id', v_lead.id), v_actor, v_client_id);
  end if;
  insert into public.activities(organization_id, kind, subject, details, created_by, opportunity_id)
  values (v_org, 'opportunity.created_from_lead', 'Created from lead ' || v_lead.company_name,
          jsonb_build_object('lead_id', v_lead.id), v_actor, v_opportunity_id);

  return jsonb_build_object(
    'client_id', v_client_id, 'contact_id', v_contact_id,
    'opportunity_id', v_opportunity_id, 'created_client', v_created_client
  );
end $$;

revoke all on function public.convert_lead(uuid, uuid) from public, anon;
grant execute on function public.convert_lead(uuid, uuid) to authenticated;
```

- [ ] **Step 2: Write the tests** `tests/integration/rls/crm-convert-lead.test.ts`:

```ts
import assert from 'node:assert/strict'
import test, { after, before } from 'node:test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { admin, cleanup, createFixtureOrg, createFixtureUser, signedInClient } from './helpers.ts'

type U = { id: string; email: string; password: string }

let orgA: string
let orgB: string
let member: U
let outsider: U
let memberClient: SupabaseClient
let outsiderClient: SupabaseClient
let clientB: string
const anonymous = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const newLead = async (over: Record<string, unknown> = {}) => {
  const { data, error } = await admin.from('leads')
    .insert({ organization_id: orgA, company_name: 'Convert Co', contact_name: 'Pat Contact', contact_email: 'pat@convert.test', contact_phone: '012', contact_role: 'CFO', industry: 'Mining', estimated_value: 5000, currency: 'USD', notes: 'Lead notes', ...over })
    .select('id').single()
  if (error) throw new Error(error.message)
  return data.id as string
}
const newClient = async (over: Record<string, unknown> = {}) => {
  const { data, error } = await admin.from('clients').insert({ organization_id: orgA, name: 'Existing Co', status: 'Active', ...over }).select('id').single()
  if (error) throw new Error(error.message)
  return data.id as string
}
const convert = (leadId: string, clientId: string | null = null, client: SupabaseClient = memberClient) =>
  client.rpc('convert_lead', { p_lead_id: leadId, p_client_id: clientId })
const count = async (table: string, org = orgA) =>
  (await admin.from(table).select('id', { count: 'exact', head: true }).eq('organization_id', org)).count ?? 0

before(async () => {
  orgA = await createFixtureOrg('crm-convert')
  orgB = await createFixtureOrg('crm-convert-other')
  member = await createFixtureUser(orgA, 'member')
  outsider = await createFixtureUser(orgB, 'owner')
  memberClient = await signedInClient(member.email, member.password)
  outsiderClient = await signedInClient(outsider.email, outsider.password)
  const { data } = await admin.from('clients').insert({ organization_id: orgB, name: 'B Client', status: 'Active' }).select('id').single()
  clientB = data!.id
})

after(async () => {
  await cleanup([orgA, orgB], [member.id, outsider.id])
})

test('converting makes a client, a primary contact and an opportunity from the lead, and links the lead', async () => {
  const leadId = await newLead({ engagement_type: 'Retainer' })
  const { data, error } = await convert(leadId)
  assert.equal(error, null)
  assert.equal(data.created_client, true)

  const client = (await admin.from('clients').select('*').eq('id', data.client_id).single()).data!
  assert.equal(client.name, 'Convert Co')
  assert.equal(client.industry, 'Mining')
  assert.equal(client.contact_name, 'Pat Contact')
  assert.equal(client.status, 'Onboarding')
  assert.equal(client.engagement_type, 'Retainer')

  const contact = (await admin.from('contacts').select('*').eq('id', data.contact_id).single()).data!
  assert.equal(contact.client_id, data.client_id)
  assert.equal(contact.full_name, 'Pat Contact')
  assert.equal(contact.email, 'pat@convert.test')
  assert.equal(contact.job_title, 'CFO')
  assert.equal(contact.is_primary, true)

  const opp = (await admin.from('sales_opportunities').select('*').eq('id', data.opportunity_id).single()).data!
  assert.equal(opp.stage, 'Discovery')
  assert.equal(opp.client_id, data.client_id)
  assert.equal(opp.lead_id, leadId)
  assert.equal(Number(opp.expected_value), 5000)
  assert.equal(opp.currency, 'USD')
  assert.equal(opp.notes, 'Lead notes')

  const lead = (await admin.from('leads').select('*').eq('id', leadId).single()).data!
  assert.equal(lead.status, 'Converted')
  assert.ok(lead.converted_at)
  assert.equal(lead.converted_client_id, data.client_id)
  assert.equal(lead.converted_opportunity_id, data.opportunity_id)
})

test('a lead engagement type the client does not accept is left off, not copied', async () => {
  const { data } = await convert(await newLead({ company_name: 'Odd Engagement Co', engagement_type: 'Something else' }))
  const client = (await admin.from('clients').select('engagement_type').eq('id', data.client_id).single()).data!
  assert.equal(client.engagement_type, null)
})

test('each of the three records gets its own conversion entry, written as the member who converted', async () => {
  const leadId = await newLead({ company_name: 'Entries Co' })
  const { data } = await convert(leadId)
  const read = async (column: string, id: string) =>
    (await admin.from('activities').select('kind, created_by, subject').eq(column, id)).data!
  const onLead = await read('lead_id', leadId)
  assert.deepEqual(onLead.map((row) => row.kind), ['lead.converted'])
  assert.equal(onLead[0].created_by, member.id)
  assert.deepEqual((await read('client_id', data.client_id)).map((row) => row.kind), ['client.created_from_lead'])
  assert.deepEqual((await read('opportunity_id', data.opportunity_id)).map((row) => row.kind), ['opportunity.created_from_lead'])
})

test('converting into an existing client adds to it, reuses a contact with the same email, and writes no client entry', async () => {
  const clientId = await newClient({ name: 'Existing Reuse Co' })
  await admin.from('contacts').insert({ organization_id: orgA, client_id: clientId, full_name: 'Existing Person', email: 'PAT@Convert.test', is_primary: true })
  const leadId = await newLead({ company_name: 'Existing Reuse Co' })
  const before = await count('clients')
  const { data, error } = await convert(leadId, clientId)
  assert.equal(error, null)
  assert.equal(data.created_client, false)
  assert.equal(data.client_id, clientId)
  assert.equal(await count('clients'), before, 'no new client')

  const contacts = (await admin.from('contacts').select('id, full_name').eq('client_id', clientId)).data!
  assert.equal(contacts.length, 1, 'the contact with the same email is reused, whatever its capitals')
  assert.equal(data.contact_id, contacts[0].id)
  assert.equal((await admin.from('activities').select('id').eq('client_id', clientId).eq('kind', 'client.created_from_lead')).data!.length, 0)
  assert.equal((await admin.from('sales_opportunities').select('client_id').eq('id', data.opportunity_id).single()).data!.client_id, clientId)
})

test('a new person at an existing client is added but is not made primary over the existing primary', async () => {
  const clientId = await newClient({ name: 'Has Primary Co' })
  await admin.from('contacts').insert({ organization_id: orgA, client_id: clientId, full_name: 'Boss', email: 'boss@x.test', is_primary: true })
  const { data } = await convert(await newLead({ company_name: 'Has Primary Co', contact_email: 'new@x.test' }), clientId)
  const contact = (await admin.from('contacts').select('is_primary').eq('id', data.contact_id).single()).data!
  assert.equal(contact.is_primary, false)
  const primaries = (await admin.from('contacts').select('id').eq('client_id', clientId).eq('is_primary', true)).data!
  assert.equal(primaries.length, 1)
})

test('contacts and follow-ups already on the lead move to the client; archived contacts stay behind', async () => {
  const leadId = await newLead({ company_name: 'Moves Co', contact_email: null })
  const live = (await admin.from('contacts').insert({ organization_id: orgA, lead_id: leadId, full_name: 'On lead', is_primary: true }).select('id').single()).data!.id
  const archived = (await admin.from('contacts').insert({ organization_id: orgA, lead_id: leadId, full_name: 'Archived on lead', archived_at: new Date().toISOString() }).select('id').single()).data!.id
  const task = (await admin.from('tasks').insert({ organization_id: orgA, title: 'Follow up', lead_id: leadId }).select('id').single()).data!.id

  const { data } = await convert(leadId)
  const moved = (await admin.from('contacts').select('client_id, lead_id, is_primary').eq('id', live).single()).data!
  assert.equal(moved.client_id, data.client_id)
  assert.equal(moved.lead_id, null)
  assert.equal(moved.is_primary, true, 'the primary stays primary on a client with none')
  const stayed = (await admin.from('contacts').select('client_id, lead_id').eq('id', archived).single()).data!
  assert.equal(stayed.lead_id, leadId)
  assert.equal(stayed.client_id, null)

  const followUp = (await admin.from('tasks').select('client_id, lead_id').eq('id', task).single()).data!
  assert.equal(followUp.client_id, data.client_id)
  assert.equal(followUp.lead_id, leadId, 'the follow-up keeps its lead link')
})

test('converting twice is refused and creates nothing more', async () => {
  const leadId = await newLead({ company_name: 'Twice Co' })
  await convert(leadId)
  const clients = await count('clients')
  const opps = await count('sales_opportunities')
  const again = await convert(leadId)
  assert.match(again.error!.message, /LEAD_ALREADY_CONVERTED/)
  assert.equal(await count('clients'), clients)
  assert.equal(await count('sales_opportunities'), opps)
})

test('two people converting the same lead at once: exactly one succeeds and exactly one client is made', async () => {
  const leadId = await newLead({ company_name: 'Race Co' })
  const before = await count('clients')
  const results = await Promise.all([convert(leadId), convert(leadId)])
  const wins = results.filter((result) => !result.error)
  const losses = results.filter((result) => result.error)
  assert.equal(wins.length, 1)
  assert.equal(losses.length, 1)
  assert.match(losses[0].error!.message, /LEAD_ALREADY_CONVERTED/)
  assert.equal(await count('clients'), before + 1)
})

test('a blank contact name fails after the client is created, and everything rolls back', async () => {
  const leadId = await newLead({ company_name: 'Rollback Co', contact_name: '   ', contact_email: null })
  const clients = await count('clients')
  const opps = await count('sales_opportunities')
  const { error } = await convert(leadId)
  assert.ok(error, 'the conversion must fail')
  assert.equal(error!.code, '23514')
  assert.match(error!.message, /contacts/)
  assert.equal(await count('clients'), clients, 'the client created before the failure is rolled back')
  assert.equal(await count('sales_opportunities'), opps)
  const lead = (await admin.from('leads').select('status, converted_at').eq('id', leadId).single()).data!
  assert.equal(lead.status, 'New')
  assert.equal(lead.converted_at, null)
})

test('an archived lead is refused', async () => {
  const leadId = await newLead({ company_name: 'Archived Lead Co', archived_at: new Date().toISOString() })
  const { error } = await convert(leadId)
  assert.match(error!.message, /LEAD_ARCHIVED/)
})

test('a client from another organisation, or an archived client, is refused and nothing is created', async () => {
  const leadId = await newLead({ company_name: 'Refusal Co' })
  const clients = await count('clients')
  const foreign = await convert(leadId, clientB)
  assert.match(foreign.error!.message, /CLIENT_NOT_FOUND/)
  const archivedClient = await newClient({ name: 'Archived Client Co', archived_at: new Date().toISOString() })
  const archived = await convert(leadId, archivedClient)
  assert.match(archived.error!.message, /CLIENT_NOT_FOUND/)
  assert.equal(await count('clients'), clients + 1, 'only the client the test itself made')
  assert.equal((await admin.from('leads').select('status').eq('id', leadId).single()).data!.status, 'New')
})

test('a non-member is told the lead was not found, the same as for a lead that does not exist', async () => {
  const leadId = await newLead({ company_name: 'Hidden Co' })
  const foreign = await convert(leadId, null, outsiderClient)
  assert.equal(foreign.error!.code, '42501')
  assert.match(foreign.error!.message, /LEAD_NOT_FOUND/)
  const missing = await convert('00000000-0000-4000-8000-0000000000aa', null, outsiderClient)
  assert.equal(missing.error!.message, foreign.error!.message)
  assert.equal((await admin.from('leads').select('status').eq('id', leadId).single()).data!.status, 'New')
})

test('a signed-out caller cannot execute it', async () => {
  const { error } = await anonymous.rpc('convert_lead', { p_lead_id: '00000000-0000-4000-8000-0000000000aa' })
  assert.match(error!.message, /permission denied for function convert_lead/)
})
```

- [ ] **Step 3: Typecheck.** `pnpm typecheck`, exit 0.

- [ ] **Step 4: CONTROLLER STEP, probe and apply (the implementer stops here and reports).** Rolled-back probe of the function (call it as a real member inside a transaction that ends in `raise exception`), then `apply_migration` named `crm_convert_lead`, then verify `has_function_privilege('anon','public.convert_lead(uuid,uuid)','EXECUTE')` is false and `authenticated` is true.

- [ ] **Step 5: Run** `node --test --env-file=.env.local --experimental-strip-types --test-concurrency=1 tests/integration/rls/crm-convert-lead.test.ts`. Expected: all pass. Then the read-only leak check as in Task 1.

- [ ] **Step 6: Commit** `supabase/migrations/20261010110000_crm_convert_lead.sql` and `tests/integration/rls/crm-convert-lead.test.ts`: `feat(crm): convert_lead, one transaction from lead to client, contact and opportunity`.

---

### Task 3: Vocabulary and form readers

**Files:**
- Create: `features/crm-workspace/types.ts`, `features/crm-workspace/vocabulary.ts`, `features/crm-workspace/fields.ts`
- Create: `tests/unit/crm-workspace-fields.test.ts`, `tests/unit/crm-workspace-vocabulary.test.ts`

**Interfaces:**
- Produces (used by Tasks 4 to 7):
  - `types.ts`: `ParentKind`, `ActionState`, `Contact`, `TimelineEntry`, `TimelinePage`, `FollowUp`, `TeamMemberOption`, `RecordWorkspace` (below).
  - `vocabulary.ts`: `LOGGED_ACTIVITY_KINDS`, `SYSTEM_ACTIVITY_KINDS`, `OPPORTUNITY_STAGES`, `FOLLOW_UP_PRIORITIES`, `ACTIVITY_LABELS`.
  - `fields.ts`: `readContactFields`, `readActivityFields`, `readFollowUpFields`, `readStageChange`, `readConvertTarget`, `normalizeCompanyName`, `resolveFollowUpAssignee`.

- [ ] **Step 1: Write the failing tests.** `tests/unit/crm-workspace-fields.test.ts`:

```ts
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeCompanyName,
  readActivityFields,
  readContactFields,
  readConvertTarget,
  readFollowUpFields,
  readStageChange,
  resolveFollowUpAssignee,
} from '../../features/crm-workspace/fields.ts'

const form = (entries: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}
const NOW = new Date('2026-10-10T12:00:00.000Z')
const UUID = '3f0c6a52-8a51-4b1f-9f3e-2a4d7c9e1b10'

test('a contact needs a name, and its email must look like one', () => {
  assert.deepEqual(readContactFields(form({ fullName: '  ' })), { error: 'A contact name is required.' })
  assert.deepEqual(readContactFields(form({ fullName: 'Pat', email: 'not-an-email' })), { error: 'Enter a valid email address.' })
  assert.deepEqual(readContactFields(form({ fullName: ' Pat Doe ', email: ' pat@x.co ', phone: '', jobTitle: 'CFO', notes: '' })), {
    full_name: 'Pat Doe', email: 'pat@x.co', phone: null, job_title: 'CFO', notes: null,
  })
  assert.deepEqual(readContactFields(form({ fullName: 'Pat' })), { full_name: 'Pat', email: null, phone: null, job_title: null, notes: null })
})

test('an activity needs a known kind and a subject', () => {
  assert.deepEqual(readActivityFields(form({ kind: 'gossip', subject: 'x' }), NOW), { error: 'Choose a call, meeting, email or note.' })
  assert.deepEqual(readActivityFields(form({ kind: 'lead.converted', subject: 'x' }), NOW), { error: 'Choose a call, meeting, email or note.' })
  assert.deepEqual(readActivityFields(form({ kind: 'call', subject: '  ' }), NOW), { error: 'A subject is required.' })
  assert.deepEqual(readActivityFields(form({ kind: ' call ', subject: ' Rang Pat ', body: ' went well ' }), NOW), {
    kind: 'call', subject: 'Rang Pat', body: 'went well', occurred_at: null,
  })
})

test('an activity time must be a real time and not in the future', () => {
  const at = (occurredAt: string) => readActivityFields(form({ kind: 'note', subject: 's', occurredAt }), NOW)
  assert.equal((at('2026-10-10T09:30:00.000Z') as { occurred_at: string }).occurred_at, '2026-10-10T09:30:00.000Z')
  assert.deepEqual(at('yesterday'), { error: 'Enter a valid date and time.' })
  assert.deepEqual(at('2026-13-45T10:00:00.000Z'), { error: 'Enter a valid date and time.' })
  assert.deepEqual(at('2026-10-11T12:00:00.000Z'), { error: 'An activity cannot be in the future.' })
  assert.equal('error' in at('2026-10-10T12:04:00.000Z'), false, 'within five minutes of now is allowed')
  assert.deepEqual(at('2026-10-10T12:06:00.000Z'), { error: 'An activity cannot be in the future.' })
})

test('a follow-up needs a title and a known priority, and a real due date', () => {
  const read = (over: Record<string, string>) => readFollowUpFields(form({ title: 'Call back', priority: 'Medium', ...over }))
  assert.deepEqual(read({ title: ' ' }), { error: 'A follow-up title is required.' })
  assert.deepEqual(read({ priority: 'Urgent' }), { error: 'Choose a valid priority.' })
  assert.deepEqual(read({ priority: 'medium' }), { error: 'Choose a valid priority.' })
  assert.deepEqual(read({ dueDate: '2026-02-30' }), { error: 'Enter a valid due date.' })
  assert.deepEqual(read({ dueDate: 'next week' }), { error: 'Enter a valid due date.' })
  assert.deepEqual(read({ assigneeId: 'not-a-uuid' }), { error: 'Choose a valid assignee.' })
  assert.deepEqual(read({ priority: ' High ', dueDate: '2026-10-20', assigneeId: UUID }), {
    title: 'Call back', priority: 'High', due_at: '2026-10-20T12:00:00.000Z', assignee_id: UUID,
  })
  assert.deepEqual(read({}), { title: 'Call back', priority: 'Medium', due_at: null, assignee_id: null })
})

test('a stage change needs a known stage, and Lost needs a reason', () => {
  assert.deepEqual(readStageChange(form({ stage: 'Pending' })), { error: 'Choose a valid stage.' })
  assert.deepEqual(readStageChange(form({ stage: 'Lost', lostReason: '  ' })), { error: 'Say why this opportunity was lost.' })
  assert.deepEqual(readStageChange(form({ stage: 'Lost', lostReason: ' Budget ' })), { stage: 'Lost', lost_reason: 'Budget' })
  assert.deepEqual(readStageChange(form({ stage: 'Won', lostReason: 'left over' })), { stage: 'Won', lost_reason: null }, 'a stale reason is not kept')
  assert.deepEqual(readStageChange(form({ stage: 'Proposal' })), { stage: 'Proposal', lost_reason: null })
})

test('the conversion target is a new client, or a valid existing one', () => {
  assert.deepEqual(readConvertTarget(form({})), { clientId: null })
  assert.deepEqual(readConvertTarget(form({ clientId: '' })), { clientId: null })
  assert.deepEqual(readConvertTarget(form({ clientId: 'new' })), { clientId: null })
  assert.deepEqual(readConvertTarget(form({ clientId: UUID })), { clientId: UUID })
  assert.deepEqual(readConvertTarget(form({ clientId: 'abc' })), { error: 'Choose a valid client.' })
})

test('company names that differ only by capitals and spacing are the same company', () => {
  assert.equal(normalizeCompanyName('  Acme   Corp '), 'acme corp')
  assert.equal(normalizeCompanyName('ACME CORP'), normalizeCompanyName('acme\tcorp'))
  assert.equal(normalizeCompanyName('Acme\nCorp'), 'acme corp')
  assert.notEqual(normalizeCompanyName('Acme Corp'), normalizeCompanyName('Acme Corporation'))
  assert.equal(normalizeCompanyName('   '), '')
})

test('a follow-up goes to the person asked for, else the signed-in user, else nobody', () => {
  assert.equal(resolveFollowUpAssignee(UUID, ['a']), UUID)
  assert.equal(resolveFollowUpAssignee(null, ['a', 'b']), 'a')
  assert.equal(resolveFollowUpAssignee(null, []), null)
})
```

`tests/unit/crm-workspace-vocabulary.test.ts`:

```ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  FOLLOW_UP_PRIORITIES,
  LOGGED_ACTIVITY_KINDS,
  OPPORTUNITY_STAGES,
  SYSTEM_ACTIVITY_KINDS,
} from '../../features/crm-workspace/vocabulary.ts'

const migration = (name: string) => readFileSync(join(process.cwd(), 'supabase', 'migrations', name), 'utf8')
const list = (raw: string) => raw.split(',').map((value) => value.trim().replace(/^'|'$/g, ''))

test('the activity kinds in the code are exactly the ones the database allows', () => {
  const sql = migration('20261010100000_crm_contacts_activities.sql')
  const match = sql.match(/kind text not null constraint activities_kind_check check \(kind in \(([^)]*)\)\)/)
  assert.ok(match, 'the activities kind check must be found')
  assert.deepEqual([...LOGGED_ACTIVITY_KINDS, ...SYSTEM_ACTIVITY_KINDS], list(match![1]))
})

test('the logged kinds are the ones the insert policy allows, so the form cannot offer a refused kind', () => {
  const sql = migration('20261010100000_crm_contacts_activities.sql')
  const policy = sql.match(/create policy activities_insert[\s\S]*?kind in \(([^)]*)\)/)
  assert.ok(policy)
  assert.deepEqual([...LOGGED_ACTIVITY_KINDS], list(policy![1]))
})

test('the stages match the sales_opportunities stage check', () => {
  const sql = migration('20260910175724_phase_six_commercial_finance.sql')
  const block = sql.match(/create table public\.sales_opportunities \(([\s\S]*?)\n\);/)
  assert.ok(block)
  const match = block![1].match(/stage text not null default '[^']*'\s*check \(stage in \(([^)]*)\)\)/)
  assert.ok(match)
  assert.deepEqual([...OPPORTUNITY_STAGES], list(match![1]))
})

test('the follow-up priorities match the tasks priority check', () => {
  const sql = migration('20260910171605_phase_four_team_operational_delivery.sql')
  const block = sql.match(/create table public\.tasks \(([\s\S]*?)\n\);/)
  assert.ok(block)
  const match = block![1].match(/priority text not null default '[^']*' check \(priority in \(([^)]*)\)\)/)
  assert.ok(match)
  assert.deepEqual([...FOLLOW_UP_PRIORITIES], list(match![1]))
})
```

- [ ] **Step 2: Run to confirm they fail.** `node --experimental-strip-types --test tests/unit/crm-workspace-fields.test.ts tests/unit/crm-workspace-vocabulary.test.ts`. Expected: FAIL, modules not found.

- [ ] **Step 3: Write `features/crm-workspace/types.ts`:**

```ts
// Shapes shared by the queries, the actions and the section components. No directive
// and no imports, so server and client code can all use it.

export type ParentKind = 'lead' | 'client' | 'opportunity' | 'quote'

/** What every action returns to useActionState. */
export type ActionState = { error?: string; success?: string } | undefined

export type Contact = {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  jobTitle: string | null
  notes: string | null
  isPrimary: boolean
}

export type TimelineEntry = {
  id: string
  kind: string
  subject: string
  body: string | null
  occurredAt: string
  details: Record<string, unknown>
  createdBy: string | null
  /** Display name of the author, or null for a system entry or a removed member. */
  author: string | null
  /** True for system entries, which nobody can edit or delete. */
  system: boolean
}

export type TimelinePage = { entries: TimelineEntry[]; hasMore: boolean }

export type FollowUp = {
  id: string
  title: string
  status: string
  priority: string
  dueAt: string | null
  assignee: string | null
  done: boolean
}

export type TeamMemberOption = { id: string; name: string }

export type RecordWorkspace = {
  kind: ParentKind
  id: string
  currentUserId: string
  /** Owners and admins may edit or delete any logged entry. */
  canModerate: boolean
  /** Where contacts live for this page, or null when there is nowhere to add one. */
  contactParent: { kind: 'client' | 'lead'; id: string } | null
  /** Shown above the contacts when they are not on this record itself. */
  contactsNote: string | null
  contacts: Contact[]
  timeline: TimelinePage
  followUps: FollowUp[]
  teamMembers: TeamMemberOption[]
  defaultAssigneeId: string | null
  /** For a lead page: set once converted. */
  conversion: { convertedAt: string; clientId: string | null; opportunityId: string | null } | null
  /** Facts the page header needs. */
  record: { archived: boolean; status: string | null; stage: string | null; lostReason: string | null }
}
```

- [ ] **Step 4: Write `features/crm-workspace/vocabulary.ts`:**

```ts
// Stated once for the server actions and the client forms. Plain constants with no
// directive. tests/unit/crm-workspace-vocabulary.test.ts reads the matching database
// checks and fails if these drift from them.

/** Matches the logged kinds in activities_kind_check and the activities_insert policy. */
export const LOGGED_ACTIVITY_KINDS = ['call', 'meeting', 'email', 'note'] as const

/** Written only by triggers and convert_lead. */
export const SYSTEM_ACTIVITY_KINDS = [
  'lead.converted',
  'client.created_from_lead',
  'opportunity.created_from_lead',
  'opportunity.stage_changed',
  'quote.sent',
  'quote.accepted',
] as const

/** Matches sales_opportunities_stage_check. */
export const OPPORTUNITY_STAGES = ['Discovery', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'] as const

/** Matches tasks_priority_check. */
export const FOLLOW_UP_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const

export const ACTIVITY_LABELS: Record<string, string> = {
  call: 'Call',
  meeting: 'Meeting',
  email: 'Email',
  note: 'Note',
  'lead.converted': 'Lead converted',
  'client.created_from_lead': 'Client created',
  'opportunity.created_from_lead': 'Opportunity created',
  'opportunity.stage_changed': 'Stage changed',
  'quote.sent': 'Quote sent',
  'quote.accepted': 'Quote accepted',
}
```

- [ ] **Step 5: Write `features/crm-workspace/fields.ts`:**

```ts
// Pure readers for the CRM workspace forms, so the validation the server actions
// depend on is unit testable. Relative imports only: Node's test runner cannot
// resolve '@/', and 'use server' modules cannot be imported by a test.
import { isUuid } from '../../lib/utils/index.ts'
import { isValidIsoDate } from '../delivery/schemas/date.ts'
import { FOLLOW_UP_PRIORITIES, LOGGED_ACTIVITY_KINDS, OPPORTUNITY_STAGES } from './vocabulary.ts'

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim()
const optional = (form: FormData, key: string) => value(form, key) || null
const isOneOf = (options: readonly string[], candidate: string) => options.includes(candidate)

export type ContactFields = {
  full_name: string
  email: string | null
  phone: string | null
  job_title: string | null
  notes: string | null
}

export function readContactFields(form: FormData): ContactFields | { error: string } {
  const fullName = value(form, 'fullName')
  if (!fullName) return { error: 'A contact name is required.' }
  const email = optional(form, 'email')
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return { error: 'Enter a valid email address.' }
  return { full_name: fullName, email, phone: optional(form, 'phone'), job_title: optional(form, 'jobTitle'), notes: optional(form, 'notes') }
}

export type ActivityFields = { kind: string; subject: string; body: string | null; occurred_at: string | null }

/** How far ahead of now a logged time may be, to allow for clocks that differ a little. */
const FUTURE_SLACK_MS = 5 * 60 * 1000

export function readActivityFields(form: FormData, now: Date = new Date()): ActivityFields | { error: string } {
  const kind = value(form, 'kind')
  if (!isOneOf(LOGGED_ACTIVITY_KINDS, kind)) return { error: 'Choose a call, meeting, email or note.' }
  const subject = value(form, 'subject')
  if (!subject) return { error: 'A subject is required.' }

  let occurredAt: string | null = null
  const raw = optional(form, 'occurredAt')
  if (raw) {
    const parsed = new Date(raw)
    // Round-trip: Date accepts some malformed input and rolls it over silently
    // (a month 13 becomes January of the next year), so require the same text back.
    if (Number.isNaN(parsed.getTime()) || !/^\d{4}-\d{2}-\d{2}T/.test(raw) || parsed.toISOString().slice(0, 10) !== raw.slice(0, 10)) {
      return { error: 'Enter a valid date and time.' }
    }
    if (parsed.getTime() > now.getTime() + FUTURE_SLACK_MS) return { error: 'An activity cannot be in the future.' }
    occurredAt = parsed.toISOString()
  }
  return { kind, subject, body: optional(form, 'body'), occurred_at: occurredAt }
}

export type FollowUpFields = {
  title: string
  priority: string
  due_at: string | null
  assignee_id: string | null
}

export function readFollowUpFields(form: FormData): FollowUpFields | { error: string } {
  const title = value(form, 'title')
  if (!title) return { error: 'A follow-up title is required.' }
  const priority = value(form, 'priority')
  if (!isOneOf(FOLLOW_UP_PRIORITIES, priority)) return { error: 'Choose a valid priority.' }
  const dueDate = optional(form, 'dueDate')
  if (dueDate && !isValidIsoDate(dueDate)) return { error: 'Enter a valid due date.' }
  const assigneeId = optional(form, 'assigneeId')
  if (assigneeId && !isUuid(assigneeId)) return { error: 'Choose a valid assignee.' }
  // Noon UTC, so the date reads the same in every timezone from UTC-11 to UTC+11.
  return { title, priority, due_at: dueDate ? `${dueDate}T12:00:00.000Z` : null, assignee_id: assigneeId }
}

export function readStageChange(form: FormData): { stage: string; lost_reason: string | null } | { error: string } {
  const stage = value(form, 'stage')
  if (!isOneOf(OPPORTUNITY_STAGES, stage)) return { error: 'Choose a valid stage.' }
  if (stage !== 'Lost') return { stage, lost_reason: null }
  const reason = value(form, 'lostReason')
  if (!reason) return { error: 'Say why this opportunity was lost.' }
  return { stage, lost_reason: reason }
}

/** '' or 'new' means "create a separate client". */
export function readConvertTarget(form: FormData): { clientId: string | null } | { error: string } {
  const raw = value(form, 'clientId')
  if (!raw || raw === 'new') return { clientId: null }
  if (!isUuid(raw)) return { error: 'Choose a valid client.' }
  return { clientId: raw }
}

/** Company names that differ only by capitals and spacing are the same company. */
export function normalizeCompanyName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** The person asked for, else the signed-in user's own team profile, else nobody. */
export function resolveFollowUpAssignee(requested: string | null, ownProfileIds: readonly string[]): string | null {
  return requested ?? ownProfileIds[0] ?? null
}
```

- [ ] **Step 6: Run.** `node --experimental-strip-types --test tests/unit/crm-workspace-fields.test.ts tests/unit/crm-workspace-vocabulary.test.ts`. Expected: all pass. Prove the drift test bites: temporarily change `'note'` to `'noet'` in `vocabulary.ts`, watch `the activity kinds ...` fail, restore, confirm `git diff` for that file shows only your intended new content.

- [ ] **Step 7: Gates and commit.** `pnpm typecheck` exit 0, `pnpm test` all pass. Commit `features/crm-workspace/types.ts`, `vocabulary.ts`, `fields.ts` and the two tests: `feat(crm): workspace vocabulary and form readers`.

---

### Task 4: Server actions and queries

**Files:**
- Create: `features/crm-workspace/server-context.ts`, `revalidate.ts`
- Create: `features/crm-workspace/actions/{contacts,activities,follow-ups,convert-lead,opportunity-stage}.ts`
- Create: `features/crm-workspace/queries/{get-record-workspace,find-matching-clients}.ts`

**Interfaces:**
- Consumes Task 3's readers and types; the Task 1 and 2 database objects.
- Produces (all actions are `(…bound args, _previous: ActionState, form: FormData) => Promise<ActionState>` shaped for `.bind(null, …)` with `useActionState`, except where stated):
  - `contacts.ts`: `addContactAction(parentKind: 'client' | 'lead', parentId, …)`, `updateContactAction(contactId, …)`, `archiveContactAction(contactId, …)`, `makePrimaryContactAction(contactId, …)`.
  - `activities.ts`: `logActivityAction(parentKind: ParentKind, parentId, …)`, `updateActivityAction(activityId, …)`, `deleteActivityAction(activityId, …)`, and `loadMoreTimelineAction(kind: ParentKind, id: string, beforeAt: string, beforeId: string): Promise<TimelinePage | { error: string }>` (not a form action).
  - `follow-ups.ts`: `addFollowUpAction(parentKind: 'lead' | 'client' | 'opportunity', parentId, …)`, `setFollowUpDoneAction(taskId, done: boolean, …)`.
  - `convert-lead.ts`: `convertLeadAction(leadId, …)` (redirects to the new opportunity on success).
  - `opportunity-stage.ts`: `changeOpportunityStageAction(opportunityId, …)`.
  - `get-record-workspace.ts`: `getRecordWorkspace(kind: ParentKind, id: string): Promise<RecordWorkspace>`, and `fetchTimeline(db, kind, id, cursor?)`.
  - `find-matching-clients.ts`: `findMatchingClients(companyName: string): Promise<Array<{ id: string; name: string }>>`.

- [ ] **Step 1: `features/crm-workspace/server-context.ts`:**

```ts
import 'server-only'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'

/** The signed-in user, their organisation and a database client. `db` is untyped, as elsewhere in the CRM code. */
export async function writeContext() {
  const { organization, user, role } = await getSessionContext()
  return { organization, user, role, db: (await createServerSupabase()) as any }
}
```

- [ ] **Step 2: `features/crm-workspace/revalidate.ts`:**

```ts
import 'server-only'

import { revalidatePath } from 'next/cache'

/** Every page that shows contacts, a timeline or follow-ups, plus the dashboard. */
export function revalidateWorkspacePages() {
  revalidatePath('/commercial/leads/[leadId]', 'page')
  revalidatePath('/commercial/sales/[opportunityId]', 'page')
  revalidatePath('/commercial/quotes/[quoteId]', 'page')
  revalidatePath('/operations/clients/[clientId]', 'page')
  revalidatePath('/overview')
}
```

- [ ] **Step 3: `features/crm-workspace/actions/contacts.ts`:**

```ts
'use server'

import { isUuid } from '@/lib/utils'
import { readContactFields } from '../fields'
import { revalidateWorkspacePages } from '../revalidate'
import { writeContext } from '../server-context'
import type { ActionState } from '../types'

const PARENT_COLUMN = { client: 'client_id', lead: 'lead_id' } as const

export async function addContactAction(
  parentKind: 'client' | 'lead',
  parentId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!(parentKind in PARENT_COLUMN) || !isUuid(parentId)) return { error: 'That record is invalid.' }
  const fields = readContactFields(form)
  if ('error' in fields) return { error: fields.error }
  const { organization, db } = await writeContext()
  const column = PARENT_COLUMN[parentKind]

  const existing = await db
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organization.id)
    .eq(column, parentId)
    .is('archived_at', null)
  if (existing.error) return { error: 'The contact could not be added.' }

  const inserted = await db
    .from('contacts')
    .insert({ organization_id: organization.id, [column]: parentId, ...fields, is_primary: false })
    .select('id')
    .single()
  if (inserted.error) {
    return { error: inserted.error.code === '23503' ? 'That record no longer exists.' : 'The contact could not be added.' }
  }
  // The first contact is primary automatically; later ones only when asked.
  if ((existing.count ?? 0) === 0 || form.get('isPrimary') === 'on') {
    const primary = await db.rpc('set_primary_contact', { p_contact_id: inserted.data.id })
    if (primary.error) return { error: 'The contact was added, but could not be made primary.' }
  }
  revalidateWorkspacePages()
  return { success: 'Contact added.' }
}

export async function updateContactAction(contactId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(contactId)) return { error: 'That contact is invalid.' }
  const fields = readContactFields(form)
  if ('error' in fields) return { error: fields.error }
  const { organization, db } = await writeContext()
  const { data, error } = await db
    .from('contacts')
    .update(fields)
    .eq('id', contactId)
    .eq('organization_id', organization.id)
    .is('archived_at', null)
    .select('id')
    .maybeSingle()
  if (error) return { error: 'The contact could not be updated.' }
  if (!data) return { error: 'That contact no longer exists.' }
  revalidateWorkspacePages()
  return { success: 'Contact updated.' }
}

export async function archiveContactAction(contactId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(contactId)) return { error: 'That contact is invalid.' }
  const { organization, db } = await writeContext()
  const { data, error } = await db
    .from('contacts')
    .update({ archived_at: new Date().toISOString(), is_primary: false })
    .eq('id', contactId)
    .eq('organization_id', organization.id)
    .is('archived_at', null)
    .select('id')
    .maybeSingle()
  if (error) return { error: 'The contact could not be removed.' }
  if (!data) return { error: 'That contact no longer exists.' }
  revalidateWorkspacePages()
  return { success: 'Contact removed.' }
}

export async function makePrimaryContactAction(contactId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(contactId)) return { error: 'That contact is invalid.' }
  const { db } = await writeContext()
  const { error } = await db.rpc('set_primary_contact', { p_contact_id: contactId })
  if (error) return { error: error.code === 'P0002' ? 'That contact no longer exists.' : 'The primary contact could not be changed.' }
  revalidateWorkspacePages()
  return { success: 'Primary contact changed.' }
}
```

- [ ] **Step 4: `features/crm-workspace/actions/activities.ts`:**

```ts
'use server'

import { isUuid } from '@/lib/utils'
import { readActivityFields } from '../fields'
import { fetchTimeline } from '../queries/get-record-workspace'
import { revalidateWorkspacePages } from '../revalidate'
import { writeContext } from '../server-context'
import type { ActionState, ParentKind, TimelinePage } from '../types'

const PARENT_COLUMN = { lead: 'lead_id', client: 'client_id', opportunity: 'opportunity_id', quote: 'quote_id' } as const

export async function logActivityAction(
  parentKind: ParentKind,
  parentId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!(parentKind in PARENT_COLUMN) || !isUuid(parentId)) return { error: 'That record is invalid.' }
  const fields = readActivityFields(form)
  if ('error' in fields) return { error: fields.error }
  const { organization, user, db } = await writeContext()
  const { error } = await db.from('activities').insert({
    organization_id: organization.id,
    kind: fields.kind,
    subject: fields.subject,
    body: fields.body,
    ...(fields.occurred_at ? { occurred_at: fields.occurred_at } : {}),
    created_by: user.id,
    [PARENT_COLUMN[parentKind]]: parentId,
  })
  if (error) return { error: error.code === '23503' ? 'That record no longer exists.' : 'The activity could not be saved.' }
  revalidateWorkspacePages()
  return { success: 'Activity logged.' }
}

export async function updateActivityAction(activityId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(activityId)) return { error: 'That entry is invalid.' }
  const fields = readActivityFields(form)
  if ('error' in fields) return { error: fields.error }
  const { organization, db } = await writeContext()
  const { data, error } = await db
    .from('activities')
    .update({ kind: fields.kind, subject: fields.subject, body: fields.body, ...(fields.occurred_at ? { occurred_at: fields.occurred_at } : {}) })
    .eq('id', activityId)
    .eq('organization_id', organization.id)
    .select('id')
    .maybeSingle()
  if (error) return { error: 'The entry could not be updated.' }
  // RLS expresses "not yours to change", and a system entry, as zero rows.
  if (!data) return { error: 'That entry no longer exists, or is not yours to change.' }
  revalidateWorkspacePages()
  return { success: 'Entry updated.' }
}

export async function deleteActivityAction(activityId: string, _previous: ActionState, _form: FormData): Promise<ActionState> {
  if (!isUuid(activityId)) return { error: 'That entry is invalid.' }
  const { organization, db } = await writeContext()
  const { data, error } = await db
    .from('activities')
    .delete()
    .eq('id', activityId)
    .eq('organization_id', organization.id)
    .select('id')
  if (error) return { error: 'The entry could not be removed.' }
  if (!data || data.length === 0) return { error: 'That entry no longer exists, or is not yours to remove.' }
  revalidateWorkspacePages()
  return { success: 'Entry removed.' }
}

/** Not a form action: the timeline's "Load more" calls it with the last entry shown. */
export async function loadMoreTimelineAction(
  kind: ParentKind,
  id: string,
  beforeAt: string,
  beforeId: string,
): Promise<TimelinePage | { error: string }> {
  if (!(kind in PARENT_COLUMN) || !isUuid(id) || !isUuid(beforeId) || Number.isNaN(new Date(beforeAt).getTime())) {
    return { error: 'That page of the timeline is invalid.' }
  }
  try {
    const { db } = await writeContext()
    return await fetchTimeline(db, kind, id, { at: beforeAt, id: beforeId })
  } catch {
    return { error: 'The timeline could not be loaded.' }
  }
}
```

- [ ] **Step 5: `features/crm-workspace/actions/follow-ups.ts`:**

```ts
'use server'

import { isUuid } from '@/lib/utils'
import { readFollowUpFields, resolveFollowUpAssignee } from '../fields'
import { revalidateWorkspacePages } from '../revalidate'
import { writeContext } from '../server-context'
import type { ActionState } from '../types'

const PARENT_COLUMN = { lead: 'lead_id', client: 'client_id', opportunity: 'opportunity_id' } as const

export async function addFollowUpAction(
  parentKind: 'lead' | 'client' | 'opportunity',
  parentId: string,
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  if (!(parentKind in PARENT_COLUMN) || !isUuid(parentId)) return { error: 'That record is invalid.' }
  const fields = readFollowUpFields(form)
  if ('error' in fields) return { error: fields.error }
  const { organization, user, db } = await writeContext()

  // The signed-in user's own team profile, used when no assignee was chosen.
  const profiles = await db
    .from('team_members')
    .select('id')
    .eq('organization_id', organization.id)
    .eq('user_id', user.id)
    .is('archived_at', null)
  if (profiles.error) return { error: 'The follow-up could not be added.' }
  const assigneeId = resolveFollowUpAssignee(fields.assignee_id, (profiles.data ?? []).map((row: { id: string }) => row.id))

  // A follow-up on an opportunity also belongs to its client, so it shows on the client page.
  let clientId: string | null = parentKind === 'client' ? parentId : null
  if (parentKind === 'opportunity') {
    const opportunity = await db
      .from('sales_opportunities')
      .select('client_id')
      .eq('id', parentId)
      .eq('organization_id', organization.id)
      .maybeSingle()
    if (opportunity.error) return { error: 'The follow-up could not be added.' }
    if (!opportunity.data) return { error: 'That record no longer exists.' }
    clientId = opportunity.data.client_id
  }

  const { error } = await db.from('tasks').insert({
    organization_id: organization.id,
    title: fields.title,
    priority: fields.priority,
    due_at: fields.due_at,
    assignee_id: assigneeId,
    created_by: user.id,
    status: 'Planned',
    [PARENT_COLUMN[parentKind]]: parentId,
    ...(clientId && parentKind !== 'client' ? { client_id: clientId } : {}),
  })
  if (error) return { error: error.code === '23503' ? 'That record no longer exists.' : 'The follow-up could not be added.' }
  revalidateWorkspacePages()
  return { success: 'Follow-up added.' }
}

export async function setFollowUpDoneAction(
  taskId: string,
  done: boolean,
  _previous: ActionState,
  _form: FormData,
): Promise<ActionState> {
  if (!isUuid(taskId)) return { error: 'That follow-up is invalid.' }
  const { organization, db } = await writeContext()
  const { data, error } = await db
    .from('tasks')
    .update({ status: done ? 'Complete' : 'Planned', completed_at: done ? new Date().toISOString() : null })
    .eq('id', taskId)
    .eq('organization_id', organization.id)
    .select('id')
    .maybeSingle()
  if (error) return { error: 'The follow-up could not be updated.' }
  if (!data) return { error: 'That follow-up no longer exists.' }
  revalidateWorkspacePages()
  return { success: done ? 'Follow-up completed.' : 'Follow-up reopened.' }
}
```

- [ ] **Step 6: `features/crm-workspace/actions/convert-lead.ts`:**

```ts
'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { isUuid } from '@/lib/utils'
import { readConvertTarget } from '../fields'
import { revalidateWorkspacePages } from '../revalidate'
import { writeContext } from '../server-context'
import type { ActionState } from '../types'

// convert_lead raises these tokens (see 20261010110000_crm_convert_lead.sql).
const MESSAGES: Record<string, string> = {
  LEAD_NOT_FOUND: 'That lead no longer exists, or is not yours.',
  LEAD_ARCHIVED: 'This lead is archived and cannot be converted.',
  LEAD_ALREADY_CONVERTED: 'This lead has already been converted.',
  CLIENT_NOT_FOUND: 'That client no longer exists or is archived.',
}

export async function convertLeadAction(leadId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(leadId)) return { error: 'That lead is invalid.' }
  const target = readConvertTarget(form)
  if ('error' in target) return { error: target.error }
  const { db } = await writeContext()
  const { data, error } = await db.rpc('convert_lead', { p_lead_id: leadId, p_client_id: target.clientId })
  if (error) {
    const token = Object.keys(MESSAGES).find((key) => String(error.message).includes(key))
    if (token) return { error: MESSAGES[token] }
    // A blank contact name fails the contacts check after the client was created; the
    // whole conversion rolled back.
    if (error.code === '23514' && String(error.message).includes('contacts')) {
      return { error: "The lead's contact name is blank. Add a contact name to the lead, then convert it. Nothing was changed." }
    }
    return { error: 'The lead could not be converted. Nothing was changed.' }
  }
  revalidateWorkspacePages()
  revalidatePath('/commercial/leads')
  revalidatePath('/commercial/sales')
  revalidatePath('/operations/clients')
  // redirect() throws, so it stays outside any try/catch.
  redirect(`/commercial/sales/${data.opportunity_id}`)
}
```

- [ ] **Step 7: `features/crm-workspace/actions/opportunity-stage.ts`:**

```ts
'use server'

import { isUuid } from '@/lib/utils'
import { readStageChange } from '../fields'
import { revalidateWorkspacePages } from '../revalidate'
import { writeContext } from '../server-context'
import type { ActionState } from '../types'
import { revalidatePath } from 'next/cache'

export async function changeOpportunityStageAction(opportunityId: string, _previous: ActionState, form: FormData): Promise<ActionState> {
  if (!isUuid(opportunityId)) return { error: 'That opportunity is invalid.' }
  const change = readStageChange(form)
  if ('error' in change) return { error: change.error }
  const { organization, db } = await writeContext()
  const { data, error } = await db
    .from('sales_opportunities')
    .update({ stage: change.stage, lost_reason: change.lost_reason })
    .eq('id', opportunityId)
    .eq('organization_id', organization.id)
    .select('id')
    .maybeSingle()
  if (error) {
    return { error: String(error.message).includes('lost_reason') ? 'Say why this opportunity was lost.' : 'The stage could not be changed.' }
  }
  if (!data) return { error: 'That opportunity no longer exists.' }
  revalidateWorkspacePages()
  revalidatePath('/commercial/sales')
  return { success: `Stage changed to ${change.stage}.` }
}
```

- [ ] **Step 8: `features/crm-workspace/queries/find-matching-clients.ts`:**

```ts
import 'server-only'

import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { normalizeCompanyName } from '../fields'

/**
 * Non-archived clients whose name is the same company as `companyName`, ignoring
 * capitals and extra spaces. Compared in code, on the organisation's client names,
 * because a database comparison would have to reproduce the same normalisation.
 */
export async function findMatchingClients(companyName: string): Promise<Array<{ id: string; name: string }>> {
  const { organization } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const wanted = normalizeCompanyName(companyName)
  if (!wanted) return []
  const { data, error } = await db
    .from('clients')
    .select('id, name')
    .eq('organization_id', organization.id)
    .is('archived_at', null)
    .ilike('name', `%${companyName.trim().split(/\s+/)[0].replace(/[\\%_*]/g, (m) => `\\${m}`)}%`)
    .limit(1000)
  if (error) throw error
  return (data ?? []).filter((row: { id: string; name: string }) => normalizeCompanyName(row.name) === wanted)
}
```

- [ ] **Step 9: `features/crm-workspace/queries/get-record-workspace.ts`:**

```ts
import 'server-only'

import { listOrganizationMembers } from '@/features/memberships/queries/list-organization-members'
import { getSessionContext } from '@/lib/auth/get-session-context'
import { createServerSupabase } from '@/lib/supabase/server'
import { LOGGED_ACTIVITY_KINDS } from '../vocabulary'
import type { Contact, FollowUp, ParentKind, RecordWorkspace, TimelinePage } from '../types'

export const TIMELINE_PAGE_SIZE = 20

type Cursor = { at: string; id: string }

async function authorNames(): Promise<Map<string, string>> {
  const members = await listOrganizationMembers()
  return new Map(members.map((member) => [member.userId, member.displayName]))
}

/** One page of a record's timeline, newest first. Asks for one extra row to know whether there is more. */
export async function fetchTimeline(db: any, kind: ParentKind, id: string, cursor?: Cursor): Promise<TimelinePage> {
  const { data, error } = await db.rpc('record_timeline', {
    p_kind: kind,
    p_id: id,
    p_limit: TIMELINE_PAGE_SIZE + 1,
    p_before: cursor?.at ?? null,
    p_before_id: cursor?.id ?? null,
  })
  if (error) throw error
  const rows: any[] = data ?? []
  const names = await authorNames()
  const logged = new Set<string>(LOGGED_ACTIVITY_KINDS)
  return {
    hasMore: rows.length > TIMELINE_PAGE_SIZE,
    entries: rows.slice(0, TIMELINE_PAGE_SIZE).map((row) => ({
      id: row.id,
      kind: row.kind,
      subject: row.subject,
      body: row.body,
      occurredAt: row.occurred_at,
      details: row.details ?? {},
      createdBy: row.created_by,
      author: row.created_by ? names.get(row.created_by) ?? null : null,
      system: !logged.has(row.kind),
    })),
  }
}

const TASK_COLUMN = { lead: 'lead_id', client: 'client_id', opportunity: 'opportunity_id' } as const

export async function getRecordWorkspace(kind: ParentKind, id: string): Promise<RecordWorkspace> {
  const { organization, user, role } = await getSessionContext()
  const db = (await createServerSupabase()) as any
  const orgId = organization.id

  let contactParent: RecordWorkspace['contactParent'] = null
  let contactsNote: string | null = null
  let conversion: RecordWorkspace['conversion'] = null
  const record: RecordWorkspace['record'] = { archived: false, status: null, stage: null, lostReason: null }

  if (kind === 'client') {
    contactParent = { kind: 'client', id }
  } else if (kind === 'lead') {
    const { data, error } = await db
      .from('leads')
      .select('status, archived_at, converted_at, converted_client_id, converted_opportunity_id')
      .eq('id', id).eq('organization_id', orgId).maybeSingle()
    if (error) throw error
    record.archived = Boolean(data?.archived_at)
    record.status = data?.status ?? null
    if (data?.converted_at) {
      conversion = { convertedAt: data.converted_at, clientId: data.converted_client_id, opportunityId: data.converted_opportunity_id }
      contactParent = data.converted_client_id ? { kind: 'client', id: data.converted_client_id } : null
      contactsNote = 'This lead has been converted, so its contacts are now on the client.'
    } else {
      contactParent = { kind: 'lead', id }
    }
  } else if (kind === 'opportunity') {
    const { data, error } = await db
      .from('sales_opportunities')
      .select('client_id, lead_id, stage, lost_reason, archived_at')
      .eq('id', id).eq('organization_id', orgId).maybeSingle()
    if (error) throw error
    record.archived = Boolean(data?.archived_at)
    record.stage = data?.stage ?? null
    record.lostReason = data?.lost_reason ?? null
    if (data?.client_id) {
      contactParent = { kind: 'client', id: data.client_id }
      contactsNote = "Showing the client's contacts."
    } else if (data?.lead_id) {
      contactParent = { kind: 'lead', id: data.lead_id }
      contactsNote = "Showing the lead's contacts."
    }
  }

  const teamMembers = await loadTeamMembers(db, orgId)
  const [contacts, timeline, followUps, ownProfiles] = await Promise.all([
    contactParent ? loadContacts(db, orgId, contactParent) : Promise.resolve([] as Contact[]),
    fetchTimeline(db, kind, id),
    kind === 'quote' ? Promise.resolve([] as FollowUp[]) : loadFollowUps(db, orgId, kind, id, teamMembers),
    db.from('team_members').select('id').eq('organization_id', orgId).eq('user_id', user.id).is('archived_at', null),
  ])
  if (ownProfiles.error) throw ownProfiles.error

  return {
    kind,
    id,
    currentUserId: user.id,
    canModerate: role === 'owner' || role === 'admin',
    contactParent,
    contactsNote,
    contacts,
    timeline,
    followUps,
    teamMembers,
    defaultAssigneeId: (ownProfiles.data ?? [])[0]?.id ?? null,
    conversion,
    record,
  }
}

async function loadContacts(db: any, orgId: string, parent: { kind: 'client' | 'lead'; id: string }): Promise<Contact[]> {
  const { data, error } = await db
    .from('contacts')
    .select('id, full_name, email, phone, job_title, notes, is_primary')
    .eq('organization_id', orgId)
    .eq(parent.kind === 'client' ? 'client_id' : 'lead_id', parent.id)
    .is('archived_at', null)
    .order('is_primary', { ascending: false })
    .order('full_name')
  if (error) throw error
  return (data ?? []).map((row: any) => ({
    id: row.id, fullName: row.full_name, email: row.email, phone: row.phone,
    jobTitle: row.job_title, notes: row.notes, isPrimary: row.is_primary,
  }))
}

async function loadTeamMembers(db: any, orgId: string) {
  const { data, error } = await db
    .from('team_members')
    .select('id, full_name')
    .eq('organization_id', orgId)
    .eq('status', 'Active')
    .is('archived_at', null)
    .order('full_name')
  if (error) throw error
  return (data ?? []).map((row: any) => ({ id: row.id, name: row.full_name }))
}

async function loadFollowUps(
  db: any,
  orgId: string,
  kind: 'lead' | 'client' | 'opportunity',
  id: string,
  members: Array<{ id: string; name: string }>,
): Promise<FollowUp[]> {
  const { data, error } = await db
    .from('tasks')
    .select('id, title, status, priority, due_at, assignee_id')
    .eq('organization_id', orgId)
    .eq(TASK_COLUMN[kind], id)
    .is('archived_at', null)
    .neq('status', 'Cancelled')
    .order('due_at', { ascending: true, nullsFirst: false })
  if (error) throw error
  const names = new Map<string, string>(members.map((member) => [member.id, member.name]))
  return (data ?? []).map((row: any) => ({
    id: row.id, title: row.title, status: row.status, priority: row.priority, dueAt: row.due_at,
    assignee: row.assignee_id ? names.get(row.assignee_id) ?? null : null,
    done: row.status === 'Complete',
  }))
}
```

- [ ] **Step 10: Gates.** `pnpm typecheck` exit 0, `pnpm test` all pass, `pnpm build` exit 0. State plainly that the actions are not exercised at runtime by any test (only the signed-in walk will).

- [ ] **Step 11: Commit** all files from this task by explicit path: `feat(crm): workspace server actions and queries`.

---

### Task 5: The Contacts, Timeline and Follow-ups sections, mounted on the record pages

**Files:**
- Create: `features/crm-workspace/components/{workspace-section,form-parts,action-button,occurred-at-field,contacts-section,timeline-section,follow-ups-section,record-workspace}.tsx`
- Modify: `features/commercial-finance/components/phase-six-detail.tsx`, `features/clients/components/client-detail.tsx`
- Modify: `app/(unison)/commercial/leads/[leadId]/page.tsx`, `app/(unison)/commercial/sales/[opportunityId]/page.tsx`, `app/(unison)/commercial/quotes/[quoteId]/page.tsx`, `app/(unison)/operations/clients/[clientId]/page.tsx`
- Create: `tests/unit/crm-workspace-ui.test.ts`

**Interfaces:**
- Consumes Task 3 types and Task 4 actions and `getRecordWorkspace`.
- Produces `RecordWorkspaceSections({ workspace, sections })` where `sections` is an array of `'contacts' | 'timeline' | 'followups'`. `PhaseSixDetail` gains optional props `actions?: ReactNode` (extra header buttons) and `after?: ReactNode` (rendered below the field list).

- [ ] **Step 1: Small shared pieces.** `components/workspace-section.tsx`:

```tsx
import type { ReactNode } from 'react'

/** The card each workspace section sits in. Square-cornered, as the rest of UNISON is. */
export function WorkspaceSection({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-none border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="unison-section-title text-xs text-foreground">{title}</h2>
          {description ? <p className="mt-1 text-xs text-[var(--briefing-muted)]">{description}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}
```

`components/form-parts.tsx` (no directive):

```tsx
import type { ActionState } from '../types'

export const input = 'h-10 w-full rounded-none border border-border bg-background px-3 text-sm'
export const area = `${input} min-h-20 py-2`

export function Feedback({ state }: { state: ActionState }) {
  if (state?.error) return <p role="alert" className="text-sm text-destructive">{state.error}</p>
  if (state?.success) return <p role="status" className="text-sm text-success">{state.success}</p>
  return null
}
```

`components/action-button.tsx`:

```tsx
'use client'

import { useActionState } from 'react'

import type { ActionState } from '../types'

/** A one-click action (archive, make primary, mark done) with its own error line and an optional confirm. */
export function ActionButton({
  action,
  label,
  confirmText,
  tone,
}: {
  action: (previous: ActionState, form: FormData) => Promise<ActionState>
  label: string
  confirmText?: string
  tone?: 'danger'
}) {
  const [state, run, pending] = useActionState(action, undefined)
  return (
    <form
      action={run}
      onSubmit={(event) => {
        if (confirmText && !window.confirm(confirmText)) event.preventDefault()
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className={`border px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${tone === 'danger' ? 'border-destructive/30 text-destructive' : 'border-border text-foreground'}`}
      >
        {pending ? 'Working…' : label}
      </button>
      {state?.error ? <p role="alert" className="mt-1 text-xs text-destructive">{state.error}</p> : null}
    </form>
  )
}
```

`components/occurred-at-field.tsx` (the browser reads a `datetime-local` in the viewer's timezone; a hidden field carries the exact instant to the server):

```tsx
'use client'

import { useState } from 'react'

import { input } from './form-parts'

/** A date and time the viewer picks in their own timezone, sent to the server as an exact ISO instant. */
export function OccurredAtField({ defaultValue }: { defaultValue?: string | null }) {
  const [iso, setIso] = useState(defaultValue ?? '')
  const local = defaultValue ? toLocalInput(defaultValue) : ''
  return (
    <>
      <input
        type="datetime-local"
        aria-label="When it happened"
        defaultValue={local}
        onChange={(event) => setIso(event.target.value ? new Date(event.target.value).toISOString() : '')}
        className={input}
      />
      <input type="hidden" name="occurredAt" value={iso} />
    </>
  )
}

function toLocalInput(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
```

- [ ] **Step 2: `components/contacts-section.tsx`:**

```tsx
'use client'

import { useActionState, useEffect, useState } from 'react'

import { addContactAction, archiveContactAction, makePrimaryContactAction, updateContactAction } from '../actions/contacts'
import type { Contact } from '../types'
import { ActionButton } from './action-button'
import { area, Feedback, input } from './form-parts'
import { WorkspaceSection } from './workspace-section'

type Parent = { kind: 'client' | 'lead'; id: string }

export function ContactsSection({ parent, contacts, note }: { parent: Parent | null; contacts: Contact[]; note: string | null }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  return (
    <WorkspaceSection title="Contacts" description="The people at this account.">
      {note ? <p className="border-b border-border px-5 py-3 text-xs text-[var(--briefing-muted)]">{note}</p> : null}
      {contacts.length ? (
        <ul className="divide-y divide-border">
          {contacts.map((contact) =>
            editingId === contact.id ? (
              <li key={contact.id}><EditContactForm contact={contact} onDone={() => setEditingId(null)} /></li>
            ) : (
              <li key={contact.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {contact.fullName}
                    {contact.isPrimary ? <span className="ml-2 bg-[var(--brand-soft)] px-1.5 py-0.5 text-[0.6875rem] font-semibold text-brand">Primary</span> : null}
                  </p>
                  <p className="text-xs text-[var(--briefing-muted)]">
                    {[contact.jobTitle, contact.email, contact.phone].filter(Boolean).join(' · ') || 'No details recorded'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEditingId(contact.id)} className="border border-border px-3 py-1.5 text-xs font-semibold">Edit</button>
                  {!contact.isPrimary ? <ActionButton action={makePrimaryContactAction.bind(null, contact.id)} label="Make primary" /> : null}
                  <ActionButton action={archiveContactAction.bind(null, contact.id)} label="Remove" tone="danger" confirmText={`Remove ${contact.fullName} from this account's contacts?`} />
                </div>
              </li>
            ),
          )}
        </ul>
      ) : (
        <p className="px-5 py-6 text-sm text-[var(--briefing-muted)]">No contacts yet.</p>
      )}
      {parent ? <AddContactForm parent={parent} /> : <p className="border-t border-border px-5 py-4 text-xs text-[var(--briefing-muted)]">Link this record to a client or a lead to add contacts.</p>}
    </WorkspaceSection>
  )
}

function ContactFields({ contact }: { contact?: Contact }) {
  return (
    <>
      <input name="fullName" required aria-label="Full name" placeholder="Full name" defaultValue={contact?.fullName ?? ''} className={input} />
      <input name="jobTitle" aria-label="Job title" placeholder="Job title" defaultValue={contact?.jobTitle ?? ''} className={input} />
      <input name="email" type="email" aria-label="Email" placeholder="Email" defaultValue={contact?.email ?? ''} className={input} />
      <input name="phone" type="tel" aria-label="Phone" placeholder="Phone" defaultValue={contact?.phone ?? ''} className={input} />
      <textarea name="notes" aria-label="Notes" placeholder="Notes" defaultValue={contact?.notes ?? ''} className={`${area} md:col-span-2`} />
    </>
  )
}

function AddContactForm({ parent }: { parent: Parent }) {
  const [state, action, pending] = useActionState(addContactAction.bind(null, parent.kind, parent.id), undefined)
  return (
    <form action={action} className="grid gap-3 border-t border-border p-5 md:grid-cols-2">
      <ContactFields />
      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input type="checkbox" name="isPrimary" /> Make this the primary contact
      </label>
      <div className="flex items-center justify-between gap-3 md:col-span-2">
        <Feedback state={state} />
        <button disabled={pending} className="ml-auto bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Add contact</button>
      </div>
    </form>
  )
}

function EditContactForm({ contact, onDone }: { contact: Contact; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateContactAction.bind(null, contact.id), undefined)
  // React resets an action-bound form's uncontrolled fields afterwards, so close on success.
  useEffect(() => {
    if (state?.success) onDone()
  }, [state, onDone])
  return (
    <form action={action} className="grid gap-3 bg-muted/20 p-5 md:grid-cols-2">
      <ContactFields contact={contact} />
      <div className="flex items-center justify-between gap-3 md:col-span-2">
        <Feedback state={state} />
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onDone} className="border border-border px-4 py-2 text-sm font-semibold">Cancel</button>
          <button disabled={pending} className="bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Save changes</button>
        </div>
      </div>
    </form>
  )
}
```

- [ ] **Step 3: `components/timeline-section.tsx`:**

```tsx
'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'

import { RelativeTime } from '@/features/crm-overview/components/local-time'
import { deleteActivityAction, loadMoreTimelineAction, logActivityAction, updateActivityAction } from '../actions/activities'
import type { ParentKind, TimelineEntry, TimelinePage } from '../types'
import { ACTIVITY_LABELS, LOGGED_ACTIVITY_KINDS } from '../vocabulary'
import { ActionButton } from './action-button'
import { area, Feedback, input } from './form-parts'
import { OccurredAtField } from './occurred-at-field'
import { WorkspaceSection } from './workspace-section'

type Props = {
  kind: ParentKind
  id: string
  initial: TimelinePage
  currentUserId: string
  canModerate: boolean
}

export function TimelineSection({ kind, id, initial, currentUserId, canModerate }: Props) {
  const [entries, setEntries] = useState<TimelineEntry[]>(initial.entries)
  const [hasMore, setHasMore] = useState(initial.hasMore)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, startLoading] = useTransition()

  // A save refreshes the page, which hands down a new first page; show it.
  useEffect(() => {
    setEntries(initial.entries)
    setHasMore(initial.hasMore)
  }, [initial])

  function loadMore() {
    const last = entries[entries.length - 1]
    if (!last) return
    setLoadError(null)
    startLoading(async () => {
      const result = await loadMoreTimelineAction(kind, id, last.occurredAt, last.id)
      if ('error' in result) return setLoadError(result.error)
      setEntries((current) => [...current, ...result.entries])
      setHasMore(result.hasMore)
    })
  }

  return (
    <WorkspaceSection title="Timeline" description="Calls, meetings, emails and notes, with the key changes to this record.">
      <LogActivityForm kind={kind} id={id} />
      {entries.length ? (
        <ul className="divide-y divide-border border-t border-border">
          {entries.map((entry) => {
            const canChange = !entry.system && (entry.createdBy === currentUserId || canModerate)
            return (
              <li key={entry.id}>
                {editingId === entry.id ? (
                  <EditEntryForm entry={entry} onDone={() => setEditingId(null)} />
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">
                        <span className={entry.system ? 'mr-2 text-xs font-semibold text-[var(--briefing-muted)] uppercase' : 'mr-2 text-xs font-semibold text-brand uppercase'}>
                          {ACTIVITY_LABELS[entry.kind] ?? entry.kind}
                        </span>
                        {entry.subject}
                      </p>
                      {entry.body ? <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--briefing-muted)]">{entry.body}</p> : null}
                      <p className="mt-1 text-xs text-[var(--briefing-muted)]">
                        {entry.system ? 'System' : entry.author ?? 'Former member'} · <RelativeTime iso={entry.occurredAt} />
                      </p>
                    </div>
                    {canChange ? (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setEditingId(entry.id)} className="border border-border px-3 py-1.5 text-xs font-semibold">Edit</button>
                        <ActionButton action={deleteActivityAction.bind(null, entry.id)} label="Remove" tone="danger" confirmText="Remove this entry? This cannot be undone." />
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="border-t border-border px-5 py-6 text-sm text-[var(--briefing-muted)]">Nothing on the timeline yet.</p>
      )}
      {loadError ? <p role="alert" className="px-5 py-3 text-sm text-destructive">{loadError}</p> : null}
      {hasMore ? (
        <div className="border-t border-border px-5 py-3">
          <button type="button" onClick={loadMore} disabled={loading} className="border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-60">
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      ) : null}
    </WorkspaceSection>
  )
}

function KindSelect({ defaultValue }: { defaultValue?: string }) {
  return (
    <select name="kind" aria-label="Type of activity" defaultValue={defaultValue ?? 'note'} className={input}>
      {LOGGED_ACTIVITY_KINDS.map((kind) => <option key={kind} value={kind}>{ACTIVITY_LABELS[kind]}</option>)}
    </select>
  )
}

function LogActivityForm({ kind, id }: { kind: ParentKind; id: string }) {
  const [state, action, pending] = useActionState(logActivityAction.bind(null, kind, id), undefined)
  return (
    <form action={action} className="grid gap-3 p-5 md:grid-cols-2">
      <KindSelect />
      <OccurredAtField />
      <input name="subject" required aria-label="Subject" placeholder="What happened?" className={`${input} md:col-span-2`} />
      <textarea name="body" aria-label="Notes" placeholder="Notes" className={`${area} md:col-span-2`} />
      <div className="flex items-center justify-between gap-3 md:col-span-2">
        <Feedback state={state} />
        <button disabled={pending} className="ml-auto bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Log activity</button>
      </div>
    </form>
  )
}

function EditEntryForm({ entry, onDone }: { entry: TimelineEntry; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateActivityAction.bind(null, entry.id), undefined)
  useEffect(() => {
    if (state?.success) onDone()
  }, [state, onDone])
  return (
    <form action={action} className="grid gap-3 bg-muted/20 p-5 md:grid-cols-2">
      <KindSelect defaultValue={entry.kind} />
      <OccurredAtField defaultValue={entry.occurredAt} />
      <input name="subject" required aria-label="Subject" defaultValue={entry.subject} className={`${input} md:col-span-2`} />
      <textarea name="body" aria-label="Notes" defaultValue={entry.body ?? ''} className={`${area} md:col-span-2`} />
      <div className="flex items-center justify-between gap-3 md:col-span-2">
        <Feedback state={state} />
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onDone} className="border border-border px-4 py-2 text-sm font-semibold">Cancel</button>
          <button disabled={pending} className="bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Save changes</button>
        </div>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: `components/follow-ups-section.tsx`:**

```tsx
'use client'

import { useActionState } from 'react'

import { DueDate } from '@/features/crm-overview/components/local-time'
import { addFollowUpAction, setFollowUpDoneAction } from '../actions/follow-ups'
import type { FollowUp, TeamMemberOption } from '../types'
import { FOLLOW_UP_PRIORITIES } from '../vocabulary'
import { ActionButton } from './action-button'
import { Feedback, input } from './form-parts'
import { WorkspaceSection } from './workspace-section'

type Parent = { kind: 'lead' | 'client' | 'opportunity'; id: string }

export function FollowUpsSection({
  parent, followUps, teamMembers, defaultAssigneeId,
}: { parent: Parent; followUps: FollowUp[]; teamMembers: TeamMemberOption[]; defaultAssigneeId: string | null }) {
  const open = followUps.filter((item) => !item.done)
  const done = followUps.filter((item) => item.done)
  return (
    <WorkspaceSection title="Follow-ups" description="Things to do next. They also appear in My Tasks for whoever they are assigned to.">
      {open.length ? (
        <ul className="divide-y divide-border">
          {open.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-[var(--briefing-muted)]">
                  {item.assignee ?? 'Unassigned'} · {item.priority} · {item.dueAt ? <DueDate iso={item.dueAt} /> : 'No due date'}
                </p>
              </div>
              <ActionButton action={setFollowUpDoneAction.bind(null, item.id, true)} label="Mark done" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-6 text-sm text-[var(--briefing-muted)]">No open follow-ups.</p>
      )}
      {done.length ? (
        <details className="border-t border-border">
          <summary className="cursor-pointer px-5 py-3 text-xs font-semibold text-[var(--briefing-muted)]">{done.length} completed</summary>
          <ul className="divide-y divide-border">
            {done.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <p className="text-sm text-[var(--briefing-muted)] line-through">{item.title}</p>
                <ActionButton action={setFollowUpDoneAction.bind(null, item.id, false)} label="Reopen" />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <AddFollowUpForm parent={parent} teamMembers={teamMembers} defaultAssigneeId={defaultAssigneeId} />
    </WorkspaceSection>
  )
}

function AddFollowUpForm({ parent, teamMembers, defaultAssigneeId }: { parent: Parent; teamMembers: TeamMemberOption[]; defaultAssigneeId: string | null }) {
  const [state, action, pending] = useActionState(addFollowUpAction.bind(null, parent.kind, parent.id), undefined)
  return (
    <form action={action} className="grid gap-3 border-t border-border p-5 md:grid-cols-2">
      <input name="title" required aria-label="Follow-up title" placeholder="What needs to happen?" className={`${input} md:col-span-2`} />
      <input name="dueDate" type="date" aria-label="Due date" className={input} />
      <select name="priority" aria-label="Priority" defaultValue="Medium" className={input}>
        {FOLLOW_UP_PRIORITIES.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
      </select>
      <select name="assigneeId" aria-label="Assigned to" defaultValue={defaultAssigneeId ?? ''} className={input}>
        <option value="">Unassigned</option>
        {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
      </select>
      <div className="flex items-center justify-between gap-3">
        <Feedback state={state} />
        <button disabled={pending} className="ml-auto bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Add follow-up</button>
      </div>
    </form>
  )
}
```

- [ ] **Step 5: `components/record-workspace.tsx`** (server component; passes only plain data to the client sections):

```tsx
import Link from 'next/link'

import type { RecordWorkspace } from '../types'
import { ContactsSection } from './contacts-section'
import { FollowUpsSection } from './follow-ups-section'
import { TimelineSection } from './timeline-section'

export type WorkspaceSectionId = 'contacts' | 'timeline' | 'followups'

export function RecordWorkspaceSections({ workspace, sections }: { workspace: RecordWorkspace; sections: readonly WorkspaceSectionId[] }) {
  const { kind } = workspace
  return (
    <div className="mt-5 space-y-5">
      {workspace.conversion ? (
        <p className="border border-border bg-[var(--brand-soft)] px-5 py-3 text-sm text-foreground">
          This lead was converted.{' '}
          {workspace.conversion.clientId ? <Link href={`/operations/clients/${workspace.conversion.clientId}`} className="font-semibold text-brand hover:underline">View the client</Link> : null}
          {workspace.conversion.clientId && workspace.conversion.opportunityId ? ' · ' : null}
          {workspace.conversion.opportunityId ? <Link href={`/commercial/sales/${workspace.conversion.opportunityId}`} className="font-semibold text-brand hover:underline">View the opportunity</Link> : null}
        </p>
      ) : null}
      {sections.includes('contacts') ? <ContactsSection parent={workspace.contactParent} contacts={workspace.contacts} note={workspace.contactsNote} /> : null}
      {sections.includes('followups') && kind !== 'quote' ? (
        <FollowUpsSection
          parent={{ kind, id: workspace.id }}
          followUps={workspace.followUps}
          teamMembers={workspace.teamMembers}
          defaultAssigneeId={workspace.defaultAssigneeId}
        />
      ) : null}
      {sections.includes('timeline') ? (
        <TimelineSection kind={kind} id={workspace.id} initial={workspace.timeline} currentUserId={workspace.currentUserId} canModerate={workspace.canModerate} />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 6: Make `PhaseSixDetail` accept extra content.** In `features/commercial-finance/components/phase-six-detail.tsx`: add `import type { ReactNode } from "react";`, change the signature to `export async function PhaseSixDetail({ kind, id, actions, after }: { kind: PhaseSixKind; id: string; actions?: ReactNode; after?: ReactNode })`, render `{actions}` immediately before the existing "Edit record" `<Link>` inside a wrapping `<div className="flex flex-wrap items-center gap-2">` that contains both, and render `{after}` immediately after the closing `</section>` (still inside `<WorkPage>`).

- [ ] **Step 7: Mount the sections.** Replace the page bodies:

`app/(unison)/commercial/leads/[leadId]/page.tsx`:

```tsx
import { PhaseSixDetail } from '@/features/commercial-finance/components/phase-six-detail'
import { RecordWorkspaceSections } from '@/features/crm-workspace/components/record-workspace'
import { getRecordWorkspace } from '@/features/crm-workspace/queries/get-record-workspace'

export default async function Page({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  const workspace = await getRecordWorkspace('lead', leadId)
  return (
    <PhaseSixDetail
      kind="lead"
      id={leadId}
      after={<RecordWorkspaceSections workspace={workspace} sections={['contacts', 'followups', 'timeline']} />}
    />
  )
}
```

The opportunity page is the same with `'opportunity'`, `opportunityId` and the same three sections. The quote page uses `'quote'`, `quoteId` and `sections={['timeline']}`.

`app/(unison)/operations/clients/[clientId]/page.tsx`: add `import { getRecordWorkspace } from '@/features/crm-workspace/queries/get-record-workspace'`, after the `notFound()` check add `const workspace = await getRecordWorkspace('client', clientId)`, and pass `workspace={workspace}` to `<ClientDetail …/>`.

`features/clients/components/client-detail.tsx`: add `import { RecordWorkspaceSections } from '@/features/crm-workspace/components/record-workspace'` and `import type { RecordWorkspace } from '@/features/crm-workspace/types'`, add `workspace` to the props (`workspace: RecordWorkspace`), and render `<RecordWorkspaceSections workspace={workspace} sections={['contacts', 'followups', 'timeline']} />` between the closing `</div>` of the two-column grid and `{!archived ? <ClientDocuments /> : null}`.

- [ ] **Step 8: Source guards** `tests/unit/crm-workspace-ui.test.ts`:

```ts
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const workspace = process.cwd()
const dir = join(workspace, 'features', 'crm-workspace')
const read = (...parts: string[]) => readFileSync(join(dir, ...parts), 'utf8')
const isClient = (source: string) => /^\s*['"]use client['"]/.test(source)
const components = readdirSync(join(dir, 'components')).filter((name) => name.endsWith('.tsx'))
const actions = readdirSync(join(dir, 'actions')).filter((name) => name.endsWith('.ts'))

test('the interactive sections are client modules and the composing section is a server component', () => {
  for (const name of ['contacts-section.tsx', 'timeline-section.tsx', 'follow-ups-section.tsx', 'action-button.tsx', 'occurred-at-field.tsx']) {
    assert.ok(isClient(read('components', name)), `${name} uses hooks and must be a client module`)
  }
  const composer = read('components', 'record-workspace.tsx')
  assert.ok(!isClient(composer), 'record-workspace.tsx is a server component')
  assert.doesNotMatch(composer, /useState\(|useEffect\(|useActionState\(|useTransition\(/)
})

test('modules shared by server and client carry no directive and no server-only import', () => {
  for (const name of ['types.ts', 'vocabulary.ts', 'fields.ts']) {
    const source = read(name)
    assert.ok(!isClient(source), `${name} must not be a client module`)
    assert.doesNotMatch(source, /server-only/, `${name} is imported by tests and client code`)
  }
  for (const name of ['components/form-parts.tsx', 'components/workspace-section.tsx']) {
    assert.ok(!isClient(read(name)), `${name} is shared and must carry no directive`)
  }
})

test("'use server' files export only async functions and types", () => {
  for (const name of actions) {
    const source = read('actions', name)
    assert.match(source, /^'use server'/, `${name} must be a server-action module`)
    for (const line of source.split('\n')) {
      if (!/^export /.test(line)) continue
      assert.match(line, /^export (async function|type) /, `${name} exports something other than an async function or a type: ${line}`)
    }
  }
})

test('every write action scopes by organisation and no action reads audit_events or fixture data', () => {
  for (const name of actions) {
    const source = read('actions', name)
    assert.doesNotMatch(source, /audit_events|fixtures?\/|mocks?\//, name)
  }
  for (const name of ['contacts.ts', 'activities.ts', 'follow-ups.ts', 'opportunity-stage.ts']) {
    assert.match(read('actions', name), /\.eq\('organization_id', organization\.id\)|organization_id: organization\.id/, `${name} must scope by organisation`)
  }
})

test('the section components import no delivery, fixture or mock code', () => {
  for (const name of components) {
    for (const imported of read('components', name).matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(!/features\/delivery|features\/overview\b|\/mocks?\/|fixtures?\//.test(imported[1]), `${name} imports ${imported[1]}`)
    }
  }
})

test('record pages mount the workspace sections', () => {
  const lead = readFileSync(join(workspace, 'app', '(unison)', 'commercial', 'leads', '[leadId]', 'page.tsx'), 'utf8')
  assert.match(lead, /getRecordWorkspace\('lead', leadId\)/)
  assert.match(lead, /sections=\{\['contacts', 'followups', 'timeline'\]\}/)
  const quote = readFileSync(join(workspace, 'app', '(unison)', 'commercial', 'quotes', '[quoteId]', 'page.tsx'), 'utf8')
  assert.match(quote, /sections=\{\['timeline'\]\}/, 'the quote page shows the timeline only')
})
```

- [ ] **Step 9: Render check.** In the scratchpad directory only (never in the repo), write a harness that transpiles the real source with `typescript.transpileModule` and renders `RecordWorkspaceSections` with `react-dom/server`, stubbing only the actions modules, `next/link`, and `@/features/crm-overview/components/local-time`. Render: a lead with 2 contacts (one primary), a mixed timeline (a logged note by the current user, one by someone else, a system entry), 2 follow-ups (one done); a client with the converted-lead banner; an empty record (no contacts, no entries, no follow-ups); hostile text in names and subjects (must render escaped); `contactParent: null`. Confirm: no throw, no literal `null` or `undefined` text, every `input`/`select`/`textarea` has an `aria-label`, Edit/Remove appear only on the current user's logged entries (and on others' when `canModerate`), never on a system entry. Report what you rendered.

- [ ] **Step 10: Gates and commit.** `pnpm typecheck` exit 0, `pnpm test` all pass (including the new guards: prove each bites by breaking its target in a scratch copy, never the repo), `pnpm build` exit 0. Commit the new components, the two modified detail components, the four pages and the test by explicit path: `feat(crm): contacts, timeline and follow-ups on lead, opportunity, client and quote pages`.

---

### Task 6: The Convert page and the lead form rules

**Files:**
- Create: `features/crm-workspace/components/convert-lead-form.tsx`
- Create: `app/(unison)/commercial/leads/[leadId]/convert/page.tsx`
- Modify: `app/(unison)/commercial/leads/[leadId]/page.tsx` (add the Convert button), `features/commercial-finance/components/phase-six-form.tsx` (lead status options), `features/commercial-finance/actions/phase-six.ts` (guards), `app/api/integrations/website-leads/route.ts` (leave a converted lead alone on replay), `features/data-portability/import-records.ts` (skip Converted lead rows)
- Modify: `tests/unit/crm-workspace-ui.test.ts`

**Interfaces:**
- Consumes `convertLeadAction`, `findMatchingClients`, `getRecordWorkspace` (its `record.status`, `record.archived`, `conversion`), `getPhaseSixRecord('lead', id)`.

- [ ] **Step 1: `components/convert-lead-form.tsx`:**

```tsx
'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { convertLeadAction } from '../actions/convert-lead'
import { Feedback } from './form-parts'

export function ConvertLeadForm({
  leadId,
  companyName,
  matches,
}: {
  leadId: string
  companyName: string
  matches: Array<{ id: string; name: string }>
}) {
  const [state, action, pending] = useActionState(convertLeadAction.bind(null, leadId), undefined)
  return (
    <form action={action} className="space-y-5">
      <div className="border border-border bg-card p-5">
        <h2 className="unison-section-title text-xs text-foreground">What will be created</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--briefing-muted)]">
          <li>A client for {companyName}, starting as Onboarding (or the existing client you choose below).</li>
          <li>A primary contact from the lead&apos;s contact details.</li>
          <li>An opportunity at Discovery, with the lead&apos;s owner and estimated value.</li>
          <li>The lead is marked Converted and keeps a link to all three.</li>
        </ul>
      </div>

      {matches.length ? (
        <fieldset className="border border-border bg-card p-5">
          <legend className="px-1 text-sm font-semibold text-foreground">
            {matches.length === 1 ? 'A client with this name already exists' : 'Clients with this name already exist'}
          </legend>
          <div className="mt-2 space-y-2 text-sm">
            {matches.map((match, index) => (
              <label key={match.id} className="flex items-center gap-2">
                <input type="radio" name="clientId" value={match.id} defaultChecked={index === 0} />
                Add to <strong>{match.name}</strong>
              </label>
            ))}
            <label className="flex items-center gap-2">
              <input type="radio" name="clientId" value="new" />
              Create a separate new client
            </label>
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="clientId" value="new" />
      )}

      <div className="flex items-center justify-between gap-3">
        <Feedback state={state} />
        <div className="ml-auto flex gap-2">
          <Link href={`/commercial/leads/${leadId}`} className="border border-border px-4 py-2 text-sm font-semibold">Cancel</Link>
          <button disabled={pending} className="bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {pending ? 'Converting…' : 'Convert lead'}
          </button>
        </div>
      </div>
    </form>
  )
}
```

- [ ] **Step 2: The page** `app/(unison)/commercial/leads/[leadId]/convert/page.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation'

import { WorkPage } from '@/components/shared/work-page'
import { getPhaseSixRecord } from '@/features/commercial-finance/queries/phase-six'
import { ConvertLeadForm } from '@/features/crm-workspace/components/convert-lead-form'
import { findMatchingClients } from '@/features/crm-workspace/queries/find-matching-clients'

export default async function Page({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  const lead = await getPhaseSixRecord('lead', leadId)
  if (!lead) notFound()
  // Already converted or archived: nothing to do here, so go back to the lead.
  if (lead.status === 'Converted' || lead.archivedAt) redirect(`/commercial/leads/${leadId}`)
  const companyName = String(lead.companyName ?? lead.name)
  const matches = await findMatchingClients(companyName)
  return (
    <WorkPage
      category="Commercial"
      title={`Convert ${companyName}`}
      description="Turn this lead into a client, a contact and an opportunity in one step."
      parent={{ label: companyName, href: `/commercial/leads/${leadId}` }}
    >
      <ConvertLeadForm leadId={leadId} companyName={companyName} matches={matches} />
    </WorkPage>
  )
}
```

- [ ] **Step 3: The Convert button.** In `app/(unison)/commercial/leads/[leadId]/page.tsx`, add `import Link from 'next/link'` and pass `actions` to `PhaseSixDetail`:

```tsx
      actions={
        !workspace.conversion && !workspace.record.archived ? (
          <Link href={`/commercial/leads/${leadId}/convert`} className="border border-brand px-4 py-2 text-sm font-semibold text-brand">
            Convert lead
          </Link>
        ) : null
      }
```

- [ ] **Step 4: Stop offering Converted in the lead edit form.** In `features/commercial-finance/components/phase-six-form.tsx`, replace the lead status line (`<Select name="status" label="Qualification status" options={["New", "Contacted", "Qualified", "Disqualified", "Converted"]} value={value("status", "New")} />`) with:

```tsx
      <Select name="status" label="Qualification status" options={value("status") === "Converted" ? ["New", "Contacted", "Qualified", "Disqualified", "Converted"] : ["New", "Contacted", "Qualified", "Disqualified"]} value={value("status", "New")} />
```

(A lead becomes Converted only through the Convert page; an already converted lead keeps showing its status so saving it does not change it.) Also change the opportunity `lostReason` field label to `"Lost reason (required when the stage is Lost)"`.

- [ ] **Step 5: Guards in the save action.** In `features/commercial-finance/actions/phase-six.ts`, inside the `kind === "opportunity"` branch, after `const stage = text(form, "stage") || "Discovery";` add:

```ts
    if (stage === "Lost" && !optional(form, "lostReason")) {
      return { error: "Say why this opportunity was lost." };
    }
```

and inside the `kind === "lead"` branch, directly after `const contactEmail = optional(form, "contactEmail");`, no change; instead, replace the generic failure return at the end of the function (`return { error: result.error?.code === "23505" ? ... }`) with:

```ts
    const message = String(result.error?.message ?? "");
    return {
      error: result.error?.code === "23505"
        ? "That reference or scenario name already exists."
        : message.includes("leads_converted_status_check") || message.includes("leads_conversion_guarded")
          ? "A lead becomes Converted by using Convert lead on its page."
          : message.includes("sales_opportunities_lost_reason_check")
            ? "Say why this opportunity was lost."
            : "The record could not be saved. Check related records, dates and amounts.",
    };
```

- [ ] **Step 5b: Make the website lead intake safe for converted leads.** The website's replays upsert the whole lead on `(organization_id, website_submission_key)`, which would now fail `leads_converted_status_check` (a 502 for the website) once the lead has been converted. In `app/api/integrations/website-leads/route.ts`, replace the block from `const supabase = createAdminSupabase()` through the end of the upsert (`.single()`) with:

```ts
  const supabase = createAdminSupabase()
  const lead = mapWebsiteLead(parsed.data)

  // A replay of a submission whose lead has since been converted must not touch it:
  // the upsert below would reset its status and fail the converted-status check.
  const existing = await supabase
    .from('leads')
    .select('id, converted_at')
    .eq('organization_id', lead.organization_id)
    .eq('website_submission_key', lead.website_submission_key)
    .maybeSingle()
  if (existing.error) {
    console.error('[website-leads] lead lookup failed', { code: existing.error.code })
    return NextResponse.json(
      { message: 'The lead could not be recorded.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  if (existing.data?.converted_at) {
    return NextResponse.json(
      { leadId: existing.data.id },
      { status: 202, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const { data, error } = await supabase
    .from('leads')
    .upsert(lead, { onConflict: 'organization_id,website_submission_key' })
    .select('id')
    .single()
```

Leave the rest of the handler (the `if (error || !data)` branch and the 202 response) as it is. Read `mapWebsiteLead` first and confirm its return value has `organization_id` and `website_submission_key` fields with those exact names; if it names them differently, use its names and say so in the report. Do not change anything else in the file.

- [ ] **Step 5c: Let a lead import skip Converted rows instead of failing the batch.** `features/data-portability/portable-collections.ts` lets a lead import carry a `status` column, and `app/api/records/import/route.ts` inserts the whole batch as the signed-in user, so once any lead is Converted, re-importing an export (which includes "Converted") would hit the conversion guard and fail every row. In `features/data-portability/import-records.ts`, inside `normalizeImportedRows`, in the `rows.forEach` callback, directly before `if (valid) records.push(record);`, add:

```ts
    // A lead becomes Converted only through Convert lead; a database guard refuses it for
    // members, which would fail the whole batch, so skip just this row with a clear message.
    if (valid && definition.table === "leads" && record.status === "Converted") {
      issues.push({ row: index + 2, field: "Status", message: "Status cannot be Converted: a lead becomes Converted by using Convert lead on its page." });
      valid = false;
    }
```

Do not change anything else in the file. `import-records.ts` imports `server-only`, so a unit test cannot import it; add this source guard to `tests/unit/crm-workspace-ui.test.ts` (Step 6):

```ts
test('the lead import skips Converted rows with a message instead of letting the database guard fail the batch', () => {
  const source = readFileSync(join(workspace, 'features', 'data-portability', 'import-records.ts'), 'utf8')
  assert.match(source, /definition\.table === "leads" && record\.status === "Converted"/)
  assert.match(source, /Convert lead on its page/)
  assert.ok(source.indexOf('record.status === "Converted"') < source.indexOf('if (valid) records.push(record)'), 'the check must come before the row is accepted')
})
```

- [ ] **Step 6: Extend the guards** in `tests/unit/crm-workspace-ui.test.ts`:

```ts
test('the lead form no longer offers Converted, and conversion is only reachable through the Convert page', () => {
  const form = readFileSync(join(workspace, 'features', 'commercial-finance', 'components', 'phase-six-form.tsx'), 'utf8')
  assert.match(form, /value\("status"\) === "Converted" \? \["New", "Contacted", "Qualified", "Disqualified", "Converted"\] : \["New", "Contacted", "Qualified", "Disqualified"\]/)
  const page = readFileSync(join(workspace, 'app', '(unison)', 'commercial', 'leads', '[leadId]', 'convert', 'page.tsx'), 'utf8')
  assert.match(page, /findMatchingClients\(companyName\)/)
  assert.match(page, /lead\.status === 'Converted' \|\| lead\.archivedAt/, 'an already converted or archived lead is sent back')
  const leadPage = readFileSync(join(workspace, 'app', '(unison)', 'commercial', 'leads', '[leadId]', 'page.tsx'), 'utf8')
  assert.match(leadPage, /!workspace\.conversion && !workspace\.record\.archived/, 'the button is hidden once converted or archived')
})

test('the save action refuses Lost without a reason and explains the Converted rule', () => {
  const action = readFileSync(join(workspace, 'features', 'commercial-finance', 'actions', 'phase-six.ts'), 'utf8')
  assert.match(action, /stage === "Lost" && !optional\(form, "lostReason"\)/)
  assert.match(action, /leads_converted_status_check/)
  assert.match(action, /leads_conversion_guarded/, 'a member hits the guard trigger first, not the check')
  assert.match(action, /sales_opportunities_lost_reason_check/)
})

test('the website lead intake leaves an already converted lead alone instead of failing on replay', () => {
  const route = readFileSync(join(workspace, 'app', 'api', 'integrations', 'website-leads', 'route.ts'), 'utf8')
  assert.match(route, /converted_at/, 'the intake must check for a converted lead before upserting')
  assert.ok(route.indexOf('converted_at') < route.indexOf('.upsert('), 'the check must come before the upsert')
})
```

- [ ] **Step 7: Render check.** In the scratchpad harness, render `ConvertLeadForm` with zero, one and two matches; confirm the radios, the default selection (first match), the hidden `clientId=new` when there are none, and escaped hostile company names.

- [ ] **Step 8: Gates and commit.** `pnpm typecheck`, `pnpm test`, `pnpm build` all exit 0. Commit the new files and the five modified files by path: `feat(crm): convert a lead from its page, keep Converted reachable only through conversion, and let the website intake replay safely`.

---

### Task 7: Quick stage change on the opportunity page

**Files:**
- Create: `features/crm-workspace/components/stage-control.tsx`
- Modify: `app/(unison)/commercial/sales/[opportunityId]/page.tsx`
- Modify: `tests/unit/crm-workspace-ui.test.ts`

**Interfaces:**
- Consumes `changeOpportunityStageAction`, `OPPORTUNITY_STAGES`, the workspace `record.stage` and `record.lostReason`.

- [ ] **Step 1: `components/stage-control.tsx`:**

```tsx
'use client'

import { useActionState, useState } from 'react'

import { changeOpportunityStageAction } from '../actions/opportunity-stage'
import { OPPORTUNITY_STAGES } from '../vocabulary'
import { Feedback, input } from './form-parts'

/** The opportunity's stage, changed in place. Choosing Lost first asks why. */
export function StageControl({ opportunityId, stage, lostReason }: { opportunityId: string; stage: string; lostReason: string | null }) {
  const [state, action, pending] = useActionState(changeOpportunityStageAction.bind(null, opportunityId), undefined)
  const [chosen, setChosen] = useState(stage)
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="quick-stage">Stage</label>
      <select id="quick-stage" name="stage" value={chosen} onChange={(event) => setChosen(event.target.value)} className={`${input} w-40`}>
        {OPPORTUNITY_STAGES.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      {chosen === 'Lost' ? (
        <input name="lostReason" required aria-label="Why was it lost?" placeholder="Why was it lost?" defaultValue={lostReason ?? ''} className={`${input} w-56`} />
      ) : null}
      <button disabled={pending || chosen === stage && chosen !== 'Lost'} className="border border-brand px-3 py-2 text-sm font-semibold text-brand disabled:opacity-50">
        {pending ? 'Saving…' : 'Change stage'}
      </button>
      <Feedback state={state} />
    </form>
  )
}
```

- [ ] **Step 2: Mount it.** In `app/(unison)/commercial/sales/[opportunityId]/page.tsx`, add `import { StageControl } from '@/features/crm-workspace/components/stage-control'` and pass to `PhaseSixDetail`:

```tsx
      actions={
        workspace.record.stage && !workspace.record.archived ? (
          <StageControl opportunityId={opportunityId} stage={workspace.record.stage} lostReason={workspace.record.lostReason} />
        ) : null
      }
```

- [ ] **Step 3: Guard** in `tests/unit/crm-workspace-ui.test.ts`:

```ts
test('the stage control is a client module, offers every stage, and asks for a reason on Lost', () => {
  const source = read('components', 'stage-control.tsx')
  assert.ok(isClient(source))
  assert.match(source, /OPPORTUNITY_STAGES\.map/)
  assert.match(source, /chosen === 'Lost' \?/)
  assert.match(source, /name="lostReason" required/)
  const page = readFileSync(join(workspace, 'app', '(unison)', 'commercial', 'sales', '[opportunityId]', 'page.tsx'), 'utf8')
  assert.match(page, /<StageControl opportunityId=\{opportunityId\}/)
})
```

- [ ] **Step 4: Render check** in the scratchpad harness: render `StageControl` for stage `Proposal` (button disabled, no reason field) and, by seeding state through a harness-only patch of the transpiled output, for `Lost` (reason field present and required).

- [ ] **Step 5: Gates and commit.** `pnpm typecheck`, `pnpm test`, `pnpm build` exit 0. Commit by path: `feat(crm): change an opportunity's stage in place`.

---

### Task 8: Preview check, follow-ups and roadmap (controller)

**Files:**
- Modify: `docs/follow-ups.md`, `docs/crm-roadmap.md`

- [ ] **Step 1: Look at it.** Create a throwaway preview route at `app/forgot-password/crm-workspace-preview-tmp/page.tsx` (the auth proxy treats `/forgot-password/*` as public) that renders `AppShell` with fake user and organisation and `RecordWorkspaceSections` plus `ConvertLeadForm` and `StageControl` with fixture data, as was done for the dashboard. Check desktop, tablet (768) and mobile (375) widths, the empty state, a long subject and hostile text, no horizontal overflow, every control labelled. **Delete the folder immediately afterwards** and confirm `git status` shows no `app/forgot-password`.

- [ ] **Step 2: Full gates on the finished branch.** `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:rls` (about six minutes). Expected: the only RLS failures are the two known `provision-organization` tests. Read-only leak check afterwards (organisations, `@unison.test` users, orphaned audit rows for every resource this slice touches).

- [ ] **Step 3: Record what remains** in `docs/follow-ups.md`, a new section "From the daily CRM loop slice (2026-10-10)": no email or inbox sync (emails are logged by hand); no reminder emails or notifications for follow-ups (Stage 4); no CRM roles, so any member can log, convert and change stages; contacts are not in global search; removing a primary contact leaves none primary until another is chosen; a converted lead's own contact fields stay on the lead as history; the timeline's "Load more" and the Convert flow are not exercised end to end in a signed-in session; `activities` audits updates and deletes only; the client page's timeline aggregates through `converted_client_id`, so a lead converted before this slice (none exist) would not appear.

- [ ] **Step 4: Tick the roadmap.** In `docs/crm-roadmap.md` tick only what shipped and was verified: lead → client conversion, contacts, activity log, tasks and follow-ups from a record, quick stage change, tests. Leave "verified in a signed-in session" unticked until the user has walked it, and say so.

- [ ] **Step 5: Hand back to the user** with the signed-in checklist: convert a lead (new client, then an existing one); add, edit, make primary and remove a contact; log, edit and remove an activity (and confirm a system entry has no Edit); add and complete a follow-up and see it in My Tasks; change an opportunity's stage including Lost; delete every record created.

- [ ] **Step 6: Commit** `docs/follow-ups.md` and `docs/crm-roadmap.md` by path: `docs: record what the daily CRM loop left, and tick the roadmap`.
