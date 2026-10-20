-- Quote portal, slice 2: two new entries on the quote timeline.
--   quote.declined   when a quote becomes Declined, by a person or by the portal.
--   quote.superseded when a revision is sent and replaces its original.
-- Append-only: the migrations that defined the pieces below are applied, so they are changed here.
--
-- 1. The activity vocabulary gains the two kinds. features/crm-workspace/vocabulary.ts lists them in this order and
--    tests/unit/crm-workspace-vocabulary.test.ts fails if the two drift apart.
-- 2. log_quote_milestones() (last defined in 20261010120000_crm_quote_entries_hygiene.sql) is unchanged except for one
--    branch: a quote that becomes Declined writes quote.declined. A quote that is already Declined and is edited writes
--    nothing; one that is reopened and declined again writes a second entry, because that is a second decline.
-- 3. quotes_supersede_original() (last defined in 20261018103000_quote_portal_supersede_same_client.sql) is unchanged,
--    including that it supersedes only a same-client original, except that when it does supersede one it also writes
--    quote.superseded on that original, naming the revision. A revision that supersedes nothing writes nothing.
--
-- activity_actor() gives the signed-in member, or null when there is none (a service-role write such as the portal's
-- decision), and the timeline already shows a null author. The attributes of both functions are kept (plpgsql, security
-- definer, empty search_path) and the revokes are stated again so they stay on the page.

-- ---------------------------------------------------------------------------
-- 1. The activity vocabulary.
-- ---------------------------------------------------------------------------
alter table public.activities drop constraint activities_kind_check;
alter table public.activities add constraint activities_kind_check check (kind in ('call', 'meeting', 'email', 'note', 'lead.converted', 'client.created_from_lead', 'opportunity.created_from_lead', 'opportunity.stage_changed', 'quote.sent', 'quote.accepted', 'quote.emailed', 'invoice.emailed', 'quote.invoiced', 'payment.recorded', 'payment.voided', 'invoice.overdue', 'billing.package_set', 'billing.tier_changed', 'billing.support_added', 'billing.document_built', 'quote.declined', 'quote.superseded'));

-- ---------------------------------------------------------------------------
-- 2. A declined quote writes quote.declined.
-- ---------------------------------------------------------------------------
create or replace function public.log_quote_milestones() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.sent_at is not null and new.status in ('Sent', 'Accepted')
     and (tg_op = 'INSERT' or old.sent_at is null) then
    insert into public.activities(organization_id, kind, subject, occurred_at, created_by, quote_id)
    values (new.organization_id, 'quote.sent', 'Quote ' || new.quote_number || ' sent', least(new.sent_at, now()),
            public.activity_actor(new.organization_id), new.id);
  end if;
  if new.accepted_at is not null and new.status = 'Accepted'
     and (tg_op = 'INSERT' or old.accepted_at is null) then
    insert into public.activities(organization_id, kind, subject, occurred_at, created_by, quote_id)
    values (new.organization_id, 'quote.accepted', 'Quote ' || new.quote_number || ' accepted', least(new.accepted_at, now()),
            public.activity_actor(new.organization_id), new.id);
  end if;
  if new.status = 'Declined' and (tg_op = 'INSERT' or old.status is distinct from 'Declined') then
    insert into public.activities(organization_id, kind, subject, created_by, quote_id)
    values (new.organization_id, 'quote.declined', 'Quote ' || new.quote_number || ' declined',
            public.activity_actor(new.organization_id), new.id);
  end if;
  return new;
end $$;

revoke all on function public.log_quote_milestones() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. A superseded original writes quote.superseded.
-- ---------------------------------------------------------------------------
create or replace function public.quotes_supersede_original() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_client uuid;
  v_number text;
begin
  if old.status in ('Draft', 'Internal Review') and new.status = 'Sent' and new.supersedes_quote_id is not null then
    select q.status, q.client_id, q.quote_number into v_status, v_client, v_number from public.quotes q
     where q.id = new.supersedes_quote_id and q.organization_id = new.organization_id
     for update;
    if found and v_status = 'Sent' and v_client is not distinct from new.client_id then
      update public.quotes set status = 'Superseded'
       where id = new.supersedes_quote_id and organization_id = new.organization_id;
      update public.quote_access_links set revoked_at = now(), revoked_reason = 'superseded'
       where quote_id = new.supersedes_quote_id and organization_id = new.organization_id and revoked_at is null;
      insert into public.activities(organization_id, kind, subject, created_by, quote_id)
      values (new.organization_id, 'quote.superseded', 'Quote ' || v_number || ' replaced by ' || new.quote_number,
              public.activity_actor(new.organization_id), new.supersedes_quote_id);
    end if;
  end if;
  return new;
end $$;

revoke all on function public.quotes_supersede_original() from public, anon, authenticated;
