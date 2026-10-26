-- Accept to invoice, stage 1, task 3, fix round 1: which email addresses count as "a valid email" in private.billing_invoice_blockers.
-- 20261026102000_billing_first_invoice_approval.sql accepted anything shaped like x@y.z, which is looser than the address the
-- application will actually send an invoice to: isValidEmailAddress (features/documents/email.ts) and, with the same pattern, the
-- check in public.record_document_email (20261011130000_documents_delivery.sql). An address such as a..b@client.test, .a@client.test,
-- a@client.c, an accented letter before the @ or a@client.test. passed readiness, so the first invoice could be approved and numbered (irreversibly)
-- and then could not be emailed. The test is now exactly the application's: the value trimmed of whitespace, at most 254
-- characters, the one ASCII pattern, and none of a leading dot, a dot before the @, or two dots in a row.
-- As in getEmailDefaults, the client's billing email counts when it is valid, and otherwise the email of the client's primary
-- unarchived contact counts when that is valid; so an invalid billing email with a valid primary contact email passes.
-- Replaced from 20261026102000_billing_first_invoice_approval.sql; the only change is the email test (two constants, one more
-- variable, and the block that sets CLIENT_EMAIL_MISSING). The order and meaning of every code is as it was.
-- Append-only: earlier migrations are applied and are not edited.

create or replace function private.billing_invoice_blockers(p_invoice_id uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices%rowtype;
  v_settings public.organization_settings%rowtype;
  v_client public.clients%rowtype;
  v_blockers text[] := '{}';
  v_standard boolean;
  v_email_ok boolean;
  -- The same pattern and extra rules as record_document_email and isValidEmailAddress.
  v_email constant text := '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?[.])+[A-Za-z]{2,}$';
  v_email_bad constant text := '(^[.]|[.]@|[.][.])';
begin
  select * into v_invoice from public.invoices i where i.id = p_invoice_id;
  if not found then
    raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
  end if;
  -- No settings row at all leaves every field null, so every company code is raised.
  select * into v_settings from public.organization_settings s where s.organization_id = v_invoice.organization_id;
  select exists (
    select 1 from public.invoice_lines l
    where l.invoice_id = v_invoice.id and l.organization_id = v_invoice.organization_id and l.vat_code = 'standard'
  ) into v_standard;

  if btrim(coalesce(v_settings.legal_name, '')) = '' then
    v_blockers := array_append(v_blockers, 'COMPANY_NAME_MISSING');
  end if;
  if btrim(coalesce(v_settings.document_prefix, '')) = '' then
    v_blockers := array_append(v_blockers, 'COMPANY_PREFIX_MISSING');
  end if;
  if v_standard and btrim(coalesce(v_settings.vat_number, '')) = '' then
    v_blockers := array_append(v_blockers, 'COMPANY_VAT_NUMBER_MISSING');
  end if;
  if btrim(coalesce(v_settings.bank_name, '')) = ''
     or btrim(coalesce(v_settings.bank_account_name, '')) = ''
     or btrim(coalesce(v_settings.bank_account_number, '')) = ''
     or btrim(coalesce(v_settings.bank_branch_code, '')) = '' then
    v_blockers := array_append(v_blockers, 'BANK_DETAILS_MISSING');
  end if;

  select * into v_client from public.clients c where c.id = v_invoice.client_id and c.organization_id = v_invoice.organization_id;
  if v_invoice.client_id is null or not found then
    v_blockers := array_append(v_blockers, 'CLIENT_MISSING');
  else
    select exists (
      select 1
      from (
        select v_client.billing_email as email
        union all
        select c.email from public.contacts c
        where c.client_id = v_client.id and c.organization_id = v_client.organization_id and c.is_primary and c.archived_at is null
      ) as candidates
      cross join lateral (
        select regexp_replace(coalesce(candidates.email, ''), '^[\s\xa0\xfeff]+|[\s\xa0\xfeff]+$', '', 'g') as address
      ) as trimmed
      where char_length(trimmed.address) <= 254 and trimmed.address ~ v_email and trimmed.address !~ v_email_bad
    ) into v_email_ok;
    if not v_email_ok then
      v_blockers := array_append(v_blockers, 'CLIENT_EMAIL_MISSING');
    end if;
    if btrim(coalesce(v_client.address_line1, '')) = '' then
      v_blockers := array_append(v_blockers, 'CLIENT_ADDRESS_MISSING');
    end if;
  end if;

  if not exists (select 1 from public.invoice_lines l where l.invoice_id = v_invoice.id and l.organization_id = v_invoice.organization_id) then
    v_blockers := array_append(v_blockers, 'NO_LINES');
  end if;
  if v_invoice.total_amount <= 0 then
    v_blockers := array_append(v_blockers, 'TOTAL_NOT_POSITIVE');
  end if;
  return v_blockers;
end $$;

revoke all on function private.billing_invoice_blockers(uuid) from public, anon, authenticated;
