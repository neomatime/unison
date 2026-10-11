-- Stage 2, slice B: delivering quotes and invoices. Three timeline kinds, the table that records each
-- email handed to the mail server, the function that writes that record, and quote to invoice.
-- Append-only: earlier migrations are applied and are not edited.

-- ---------------------------------------------------------------------------
-- 1. New timeline kinds. The list is the one from 20261010100000 plus the three new kinds; the code's
--    SYSTEM_ACTIVITY_KINDS is tested against the newest definition of this constraint.
-- ---------------------------------------------------------------------------
alter table public.activities drop constraint activities_kind_check;
alter table public.activities add constraint activities_kind_check check (kind in ('call','meeting','email','note','lead.converted','client.created_from_lead','opportunity.created_from_lead','opportunity.stage_changed','quote.sent','quote.accepted','quote.emailed','invoice.emailed','quote.invoiced'));

-- ---------------------------------------------------------------------------
-- 2. document_emails: one row per email handed to the mail server. Members read; nobody writes except
--    record_document_email, so a "sent" record cannot be forged and cannot be edited afterwards.
-- ---------------------------------------------------------------------------
create table public.document_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid,
  invoice_id uuid,
  to_address text not null check (char_length(to_address) between 3 and 254),
  subject text not null check (char_length(subject) between 1 and 300),
  body text not null default '' check (char_length(body) <= 10000),
  pdf_sha256 text not null check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_bytes integer not null check (pdf_bytes between 1 and 20000000),
  sent_by uuid,
  sent_at timestamptz not null default now(),
  constraint document_emails_one_document check (num_nonnulls(quote_id, invoice_id) = 1),
  constraint document_emails_quote_fkey foreign key (quote_id, organization_id)
    references public.quotes(id, organization_id) on delete cascade,
  constraint document_emails_invoice_fkey foreign key (invoice_id, organization_id)
    references public.invoices(id, organization_id) on delete cascade,
  constraint document_emails_sent_by_fkey foreign key (organization_id, sent_by)
    references public.memberships(organization_id, user_id) on delete set null (sent_by)
);

create index document_emails_quote_idx on public.document_emails(quote_id, sent_at desc) where quote_id is not null;
create index document_emails_invoice_idx on public.document_emails(invoice_id, sent_at desc) where invoice_id is not null;
create index document_emails_org_sent_idx on public.document_emails(organization_id, sent_at desc);

alter table public.document_emails enable row level security;

create policy document_emails_select on public.document_emails for select to authenticated
  using (public.is_member_of(organization_id));

-- The schema's convention: revoke everything, then grant only what is meant. There is no insert, update or
-- delete grant, so the only writer is the definer function below.
revoke all on public.document_emails from public, anon, authenticated;
grant select on public.document_emails to authenticated;

-- ---------------------------------------------------------------------------
-- 3. record_document_email: called by the server action only after the mail server has accepted the message.
--    It checks the caller belongs to the document's organisation and that the document has gone out, validates
--    every field, writes the row, and writes the timeline entry (on the quote, or on an invoice's client: an
--    invoice has no timeline of its own).
-- ---------------------------------------------------------------------------
create or replace function public.record_document_email(
  p_kind text, p_id uuid, p_to text, p_subject text, p_body text, p_sha256 text, p_bytes integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_number text;
  v_draft boolean;
  v_client uuid;
  v_to text := btrim(coalesce(p_to, ''));
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body text := coalesce(p_body, '');
  v_id uuid;
begin
  if p_kind = 'quote' then
    select q.organization_id, q.quote_number, q.status in ('Draft', 'Internal Review')
      into v_org, v_number, v_draft
      from public.quotes q where q.id = p_id;
    if not found or not public.is_member_of(v_org) then
      raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
    end if;
  elsif p_kind = 'invoice' then
    select i.organization_id, i.invoice_number, i.status = 'Draft', i.client_id
      into v_org, v_number, v_draft, v_client
      from public.invoices i where i.id = p_id;
    if not found or not public.is_member_of(v_org) then
      raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
    end if;
  else
    raise exception 'DOCUMENT_KIND_UNKNOWN' using errcode = '22023';
  end if;

  if v_draft then
    raise exception 'DOCUMENT_IS_DRAFT' using errcode = '23514';
  end if;
  -- One plain ASCII address: no display name, no list, no whitespace, no control characters.
  if char_length(v_to) > 254
     or v_to !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?[.])+[A-Za-z]{2,}$'
     or v_to ~ '(^[.]|[.]@|[.][.])' then
    raise exception 'EMAIL_ADDRESS_INVALID' using errcode = '23514';
  end if;
  if char_length(v_subject) not between 1 and 300
     or position(chr(10) in v_subject) > 0 or position(chr(13) in v_subject) > 0 then
    raise exception 'EMAIL_SUBJECT_INVALID' using errcode = '23514';
  end if;
  if char_length(v_body) > 10000 then
    raise exception 'EMAIL_BODY_TOO_LONG' using errcode = '23514';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_bytes is null or p_bytes < 1 or p_bytes > 20000000 then
    raise exception 'EMAIL_RECORD_INVALID' using errcode = '23514';
  end if;

  insert into public.document_emails (organization_id, quote_id, invoice_id, to_address, subject, body, pdf_sha256, pdf_bytes, sent_by)
  values (
    v_org,
    case when p_kind = 'quote' then p_id end,
    case when p_kind = 'invoice' then p_id end,
    v_to, v_subject, v_body, p_sha256, p_bytes, public.activity_actor(v_org))
  returning id into v_id;

  if p_kind = 'quote' then
    insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
    values (v_org, 'quote.emailed', 'Quote ' || v_number || ' emailed to ' || v_to,
            jsonb_build_object('document_id', p_id, 'number', v_number, 'to', v_to),
            public.activity_actor(v_org), p_id);
  elsif v_client is not null then
    insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
    values (v_org, 'invoice.emailed', 'Invoice ' || v_number || ' emailed to ' || v_to,
            jsonb_build_object('document_id', p_id, 'number', v_number, 'to', v_to),
            public.activity_actor(v_org), v_client);
  end if;

  return v_id;
end $$;

revoke all on function public.record_document_email(text, uuid, text, text, text, text, integer) from public, anon;
grant execute on function public.record_document_email(text, uuid, text, text, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. create_invoice_from_quote: a draft invoice from an Accepted quote, copying the header and every line.
--    The quote is not changed. The VAT rate, the totals and the draft reference come from the existing
--    triggers, exactly as for any new draft invoice. Payment terms, the issue date and the due date stay
--    empty: they are filled when the invoice is issued.
-- ---------------------------------------------------------------------------
create or replace function public.create_invoice_from_quote(p_quote_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_quote public.quotes%rowtype;
  v_new uuid;
begin
  select q.organization_id into v_org from public.quotes q where q.id = p_quote_id;
  if not found or not public.is_member_of(v_org) then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  -- The row lock serialises two simultaneous calls on the same quote and stops a status change in between.
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then
    raise exception 'QUOTE_NOT_FOUND' using errcode = '42501';
  end if;
  if v_quote.archived_at is not null then
    raise exception 'QUOTE_ARCHIVED' using errcode = '23514';
  end if;
  if v_quote.status <> 'Accepted' then
    raise exception 'QUOTE_NOT_ACCEPTED' using errcode = '23514';
  end if;

  insert into public.invoices (
    organization_id, client_id, client_name, owner_id, opportunity_id, quote_id, currency, status,
    project_name, project_description, project_ref, client_ref)
  values (
    v_org, v_quote.client_id, v_quote.client_name, v_quote.owner_id, v_quote.opportunity_id, v_quote.id, v_quote.currency, 'Draft',
    v_quote.project_name, v_quote.project_description, v_quote.project_ref, v_quote.client_ref)
  returning id into v_new;

  insert into public.invoice_lines (organization_id, invoice_id, position, title, description, quantity, unit_price, vat_code, price_list_item_id)
  select l.organization_id, v_new, l.position, l.title, l.description, l.quantity, l.unit_price, l.vat_code, l.price_list_item_id
  from public.quote_lines l
  where l.quote_id = p_quote_id and l.organization_id = v_org;

  insert into public.activities (organization_id, kind, subject, details, created_by, quote_id)
  values (v_org, 'quote.invoiced', 'Draft invoice created from quote ' || v_quote.quote_number,
          jsonb_build_object('invoice_id', v_new, 'quote_id', p_quote_id, 'quote_number', v_quote.quote_number),
          public.activity_actor(v_org), p_quote_id);

  return v_new;
end $$;

revoke all on function public.create_invoice_from_quote(uuid) from public, anon;
grant execute on function public.create_invoice_from_quote(uuid) to authenticated;
