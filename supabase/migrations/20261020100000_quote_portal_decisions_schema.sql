-- Quote portal, slice 2: the two tables the accept and decline functions build on. Tables, constraints, policies,
-- grants and the append-only triggers only: the functions that use them come in later migrations.
-- Append-only: earlier migrations are applied and are not edited.

-- ---------------------------------------------------------------------------
-- 1. quote_access_codes: the six-digit confirmation code emailed to a link's recipient. Only a salted hash is kept,
--    never the code. A code belongs to one link, expires, allows five attempts and is consumed once. Deleted with its
--    link (and so with its quote or organisation). Row level security is on with no policy and no grant: nobody
--    signed in can read or write a code, and only the definer functions and the service role touch the table.
-- ---------------------------------------------------------------------------
create table public.quote_access_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  link_id uuid not null references public.quote_access_links(id) on delete cascade,
  code_salt text not null,
  code_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  consumed_at timestamptz
);

create index quote_access_codes_link_idx on public.quote_access_codes(link_id, created_at desc);

alter table public.quote_access_codes enable row level security;
revoke all on public.quote_access_codes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. quote_responses: the record of a client's decision, one row per link. Members read their organisation's rows;
--    nobody writes except the decide function that comes later. The link reference is deferred and has no cascade
--    action: deleting a quote removes its links before its responses, and an immediate check would refuse that, while
--    deleting a link on its own is still refused when the statement commits. No audit trigger: this table is the
--    record.
-- ---------------------------------------------------------------------------
create table public.quote_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null,
  link_id uuid not null references public.quote_access_links(id) deferrable initially deferred,
  decision text not null check (decision in ('accepted', 'declined')),
  decided_at timestamptz not null default now(),
  signatory_name text not null,
  signatory_position text not null,
  signatory_organisation text not null,
  verified_email text not null,
  consent_text text not null,
  consent_given boolean not null check (consent_given),
  code_verified_at timestamptz not null,
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  terms_sources jsonb,
  quote_number text not null,
  quote_version integer not null,
  ip_address text check (char_length(ip_address) <= 64),
  user_agent text check (char_length(user_agent) <= 300),
  decline_reason text check (decline_reason in ('Budget considerations', 'Timing is not right', 'Scope does not meet our requirements', 'Internal approval pending', 'Chose another provider', 'Other')),
  decline_comments text,
  constraint quote_responses_link_id_key unique (link_id),
  constraint quote_responses_decline_fields_check check (decision = 'declined' or (decline_reason is null and decline_comments is null)),
  constraint quote_responses_quote_id_organization_id_fkey foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id) on delete cascade
);

alter table public.quote_responses enable row level security;

create policy quote_responses_select on public.quote_responses for select to authenticated
  using (public.is_member_of(organization_id));

-- The schema's convention: revoke everything, then grant only what is meant. There is no insert, update or delete
-- grant and no such policy, so the only writer is the definer function added later.
revoke all on public.quote_responses from anon, authenticated;
grant select on public.quote_responses to authenticated;

-- ---------------------------------------------------------------------------
-- 3. quote_responses is append-only for every role, the service role included. A row is never updated, a direct
--    delete is refused and so is truncate. The one way a row goes is with its quote or organisation: that delete
--    runs inside the referential-integrity trigger of the parent table, one trigger level deeper than a statement
--    issued directly, which is what pg_trigger_depth() > 1 tells apart.
-- ---------------------------------------------------------------------------
create or replace function public.quote_responses_append_only() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'QUOTE_RESPONSE_APPEND_ONLY' using errcode = '23514';
end $$;

create trigger quote_responses_no_update before update on public.quote_responses
  for each row execute function public.quote_responses_append_only();
create trigger quote_responses_no_delete before delete on public.quote_responses
  for each row execute function public.quote_responses_append_only();
create trigger quote_responses_no_truncate before truncate on public.quote_responses
  for each statement execute function public.quote_responses_append_only();
revoke all on function public.quote_responses_append_only() from public, anon, authenticated;
