-- Accept to invoice, stage 1, task 4, fix round 1: a paused or ended plan no longer bills through the ordinary Issue button.
-- public.issue_invoice (last defined in 20261026102000_billing_first_invoice_approval.sql) stopped only the first invoice of a plan
-- without its approval. After billing_plan_set_state paused a plan, or ended it (ending keeps the items that already have a
-- Draft), any member could still issue an existing monthly Draft, which contradicts "Nothing will be invoiced until an owner or
-- admin resumes it". Replaced from 20261026102000_billing_first_invoice_approval.sql; the body is unchanged except for two
-- declarations and one block, after the draft check and the first-invoice approval block: an invoice that has a billing link is
-- refused with BILLING_ITEM_CANCELLED when its item is cancelled, else with BILLING_PLAN_NOT_ACTIVE when its plan is not active.
-- It applies to first and monthly items alike (approve_first_invoice checks the plan before it issues, so the order for a first
-- item is as before). Unlinked invoices are issued exactly as before, so nothing changes while the switch is off. The reads are
-- plain: no row lock is taken, so there is no new place in the lock order (client, quote, plan, items, invoices) to wait in a
-- circle; a pause that commits just after the read lets that one issue through, which is accepted.
-- Append-only: earlier migrations are applied and are not edited.

create or replace function public.issue_invoice(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_invoice public.invoices%rowtype;
  v_settings public.organization_settings%rowtype;
  v_client public.clients%rowtype;
  v_number text;
  v_issue date;
  v_due date;
  v_kind text;
  v_item_status text;
  v_plan_status text;
begin
  select i.organization_id into v_org from public.invoices i where i.id = p_id;
  if not found or not public.is_member_of(v_org) then
    raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
  end if;
  select * into v_invoice from public.invoices where id = p_id for update;
  if not found then
    raise exception 'INVOICE_NOT_FOUND' using errcode = '42501';
  end if;
  if v_invoice.archived_at is not null or v_invoice.status <> 'Draft' then
    raise exception 'INVOICE_NOT_DRAFT' using errcode = '23514';
  end if;
  if v_invoice.billing_plan_item_id is not null then
    select i.kind into v_kind from public.billing_plan_items i where i.id = v_invoice.billing_plan_item_id;
    if v_kind = 'first' and current_setting('unison.billing_approval', true) is distinct from v_invoice.billing_plan_item_id::text then
      raise exception 'INVOICE_USE_APPROVAL' using errcode = '23514';
    end if;
    -- Nothing is invoiced while the plan is paused or ended, nor for a month that was cancelled: first and monthly invoices alike.
    -- Plain reads, no row locks: a pause that commits just after this read lets this one issue through, and no lock is taken
    -- here that billing_plan_set_state, approve_first_invoice or create_plan_item_invoice could wait on in a circle.
    select i.status, p.status into v_item_status, v_plan_status
    from public.billing_plan_items i join public.billing_plans p on p.id = i.plan_id
    where i.id = v_invoice.billing_plan_item_id;
    if found then
      if v_item_status = 'cancelled' then
        raise exception 'BILLING_ITEM_CANCELLED' using errcode = '23514';
      elsif v_plan_status <> 'active' then
        raise exception 'BILLING_PLAN_NOT_ACTIVE' using errcode = '23514';
      end if;
    end if;
  end if;
  select * into v_client from public.clients where id = v_invoice.client_id and organization_id = v_org;
  if v_invoice.client_id is null or not found then
    raise exception 'INVOICE_NEEDS_CLIENT' using errcode = '23514';
  end if;
  if not exists (select 1 from public.invoice_lines l where l.invoice_id = p_id and l.organization_id = v_org) then
    raise exception 'INVOICE_NEEDS_LINES' using errcode = '23514';
  end if;
  select * into v_settings from public.organization_settings where organization_id = v_org;
  if not found or v_settings.document_prefix is null or btrim(coalesce(v_settings.legal_name, '')) = '' then
    raise exception 'COMPANY_DETAILS_MISSING' using errcode = '23514';
  end if;

  -- An invoice is dated the day it is issued, never a date typed on the draft: the number and the date
  -- always agree, and invoices stay in date order.
  v_issue := (now() at time zone 'Africa/Johannesburg')::date;
  v_due := coalesce(v_invoice.due_date, v_issue + v_settings.default_payment_days);
  if v_due < v_issue then
    raise exception 'INVOICE_DUE_BEFORE_ISSUE' using errcode = '23514';
  end if;
  v_number := public.next_document_number(v_org, 'invoice');

  update public.invoices set
    invoice_number = v_number,
    status = 'Issued',
    vat_rate = v_settings.vat_rate,
    issue_date = v_issue,
    due_date = v_due,
    payment_terms = coalesce(nullif(btrim(v_invoice.payment_terms), ''), v_settings.default_payment_terms),
    client_name = v_client.name,
    bill_to = jsonb_build_object(
      'name', v_client.name, 'address_line1', v_client.address_line1, 'address_line2', v_client.address_line2,
      'city', v_client.city, 'postal_code', v_client.postal_code, 'country', v_client.country,
      'vat_number', v_client.vat_number),
    issuer = jsonb_build_object(
      'legal_name', v_settings.legal_name, 'tagline', v_settings.tagline,
      'address_line1', v_settings.address_line1, 'address_line2', v_settings.address_line2, 'city', v_settings.city,
      'postal_code', v_settings.postal_code, 'country', v_settings.country, 'vat_number', v_settings.vat_number,
      'email', v_settings.email, 'phone', v_settings.phone, 'website', v_settings.website,
      'bank_name', v_settings.bank_name, 'bank_account_name', v_settings.bank_account_name,
      'bank_account_number', v_settings.bank_account_number, 'bank_branch_code', v_settings.bank_branch_code,
      'bank_account_type', v_settings.bank_account_type, 'quote_closing_text', v_settings.quote_closing_text,
      'invoice_closing_text', v_settings.invoice_closing_text, 'logo_path', v_settings.logo_path,
      'header_image_path', v_settings.header_image_path),
    balance_amount = v_invoice.total_amount
  where id = p_id;

  return jsonb_build_object('id', p_id, 'number', v_number);
end $$;

revoke all on function public.issue_invoice(uuid) from public, anon;
grant execute on function public.issue_invoice(uuid) to authenticated;
