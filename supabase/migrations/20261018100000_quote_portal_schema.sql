-- Quote portal, slice 1: the objects the link functions, the portal and the email build on. Tables, columns,
-- constraints, policies and grants only: the functions and triggers that use them come in later migrations.
-- Append-only: earlier migrations are applied and are not edited.

-- ---------------------------------------------------------------------------
-- 1. Superseded joins the quote statuses. The list is the one from 20260910175724 plus the new status; the
--    code's QUOTE_SENT_STATUSES and REGISTERS.quote.statuses are tested against the newest definition of this
--    constraint, so it stays on one line.
-- ---------------------------------------------------------------------------
alter table public.quotes drop constraint quotes_status_check;
alter table public.quotes add constraint quotes_status_check check (status in ('Draft','Internal Review','Sent','Accepted','Declined','Expired','Superseded'));

-- ---------------------------------------------------------------------------
-- 2. A revision points back at the quote it replaces. Same organisation by construction (the foreign key
--    carries organization_id). Deleting the original clears the pointer and nothing else.
-- ---------------------------------------------------------------------------
alter table public.quotes add column supersedes_quote_id uuid;
alter table public.quotes add constraint quotes_supersedes_quote_fkey foreign key (supersedes_quote_id, organization_id)
  references public.quotes(id, organization_id) on delete set null (supersedes_quote_id);
alter table public.quotes add constraint quotes_supersedes_not_self check (supersedes_quote_id <> id);
create index quotes_supersedes_idx on public.quotes(supersedes_quote_id, organization_id);

-- ---------------------------------------------------------------------------
-- 3. What a line charges for. Nullable on purpose: existing lines stay null, so an old quote shows a flat list
--    rather than a wrong once-off/monthly split.
-- ---------------------------------------------------------------------------
alter table public.quote_lines add column charge_kind text check (charge_kind in ('once_off', 'monthly'));

-- ---------------------------------------------------------------------------
-- 4. The portal switch. organization_settings already has its audit trigger and its policies (members read,
--    owners and admins update), and authenticated holds the table-level privileges, so nothing else changes.
-- ---------------------------------------------------------------------------
alter table public.organization_settings add column quote_portal_enabled boolean not null default false;

-- ---------------------------------------------------------------------------
-- 5. quote_access_links: one row per link sent to a recipient. Only the sha256 of the token is kept, never the
--    token. Members read their organisation's rows; nobody writes except the functions that come later, so a
--    link cannot be forged, extended or un-revoked by a signed-in role. Deleted with its quote or organisation.
--    No audit trigger and no updated_at: the viewed and revoked stamps are the record.
-- ---------------------------------------------------------------------------
create table public.quote_access_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null,
  token_hash text not null unique,
  recipient_email text not null,
  recipient_name text,
  created_by uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_reason text,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  constraint quote_access_links_recipient_email_check
    check (recipient_email = lower(recipient_email) and char_length(recipient_email) - char_length(replace(recipient_email, '@', '')) = 1),
  constraint quote_access_links_quote_fkey foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id) on delete cascade,
  constraint quote_access_links_created_by_fkey foreign key (organization_id, created_by)
    references public.memberships(organization_id, user_id) on delete set null (created_by)
);

create index quote_access_links_quote_idx on public.quote_access_links(quote_id);
create index quote_access_links_org_idx on public.quote_access_links(organization_id);

alter table public.quote_access_links enable row level security;

create policy quote_access_links_select on public.quote_access_links for select to authenticated
  using (public.is_member_of(organization_id));

-- The schema's convention: revoke everything, then grant only what is meant. There is no insert, update or
-- delete grant and no such policy, so the only writers are the definer functions added later.
revoke all on public.quote_access_links from anon, authenticated;
grant select on public.quote_access_links to authenticated;
