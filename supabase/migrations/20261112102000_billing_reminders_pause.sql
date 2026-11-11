-- Accept to invoice, stage 3, task 3: pausing and resuming payment reminders on one invoice. A person's recorded decision, with a
-- reason, kept on the invoice's plan item (a table only definer functions write). Additive and inert: nothing reminds until an
-- organisation turns on both billing_plans_enabled and billing_reminders_enabled (both default to false), and nothing is paused until
-- an owner or admin does it.
-- Append-only: earlier migrations are applied and are not edited.
--
-- public.billing_reminders_set_paused(invoice, paused, reason):
--   * the invoice must belong to an organisation the caller is a member of and be linked to a billing plan item, else
--     BILLING_ITEM_NOT_FOUND (42501), which also hides another organisation's invoice;
--   * only an owner or admin, else BILLING_PLAN_ADMIN_ONLY;
--   * pausing needs a reason of 1 to 500 characters once trimmed, else BILLING_REASON_REQUIRED; resuming does not;
--   * pausing a paused invoice, or resuming one that is not paused, changes nothing and writes nothing;
--   * each real change writes billing.reminders_changed on the client's timeline, by the member who made it;
--   * the reminders already sent are untouched, so resuming continues from the next unsent one.

create or replace function public.billing_reminders_set_paused(p_invoice_id uuid, p_paused boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices%rowtype;
  v_item public.billing_plan_items%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into v_invoice from public.invoices i where i.id = p_invoice_id;
  if not found or v_invoice.billing_plan_item_id is null or not public.is_member_of(v_invoice.organization_id) then
    raise exception 'BILLING_ITEM_NOT_FOUND' using errcode = '42501';
  end if;
  if not public.has_role(v_invoice.organization_id, array['owner', 'admin']) then
    raise exception 'BILLING_PLAN_ADMIN_ONLY' using errcode = '23514';
  end if;
  if p_paused is null or char_length(v_reason) > 500 or (p_paused and v_reason = '') then
    raise exception 'BILLING_REASON_REQUIRED' using errcode = '23514';
  end if;

  select * into v_item from public.billing_plan_items i where i.id = v_invoice.billing_plan_item_id for update;
  if not found then
    raise exception 'BILLING_ITEM_NOT_FOUND' using errcode = '42501';
  end if;

  if p_paused then
    if v_item.reminders_paused_at is not null then
      return;
    end if;
    update public.billing_plan_items i set
      reminders_paused_at = now(), reminders_paused_by = (select auth.uid()), reminders_pause_reason = v_reason
    where i.id = v_item.id;
  else
    if v_item.reminders_paused_at is null then
      return;
    end if;
    update public.billing_plan_items i set
      reminders_paused_at = null, reminders_paused_by = null, reminders_pause_reason = null
    where i.id = v_item.id;
  end if;

  if v_invoice.client_id is not null then
    insert into public.activities (organization_id, kind, subject, details, created_by, client_id)
    values (v_invoice.organization_id, 'billing.reminders_changed',
            case when p_paused then 'Reminders paused for invoice ' || v_invoice.invoice_number || ': ' || v_reason
                 when v_reason <> '' then 'Reminders resumed for invoice ' || v_invoice.invoice_number || ': ' || v_reason
                 else 'Reminders resumed for invoice ' || v_invoice.invoice_number end,
            jsonb_build_object('document_id', p_invoice_id, 'number', v_invoice.invoice_number, 'paused', p_paused),
            public.activity_actor(v_invoice.organization_id), v_invoice.client_id);
  end if;
end $$;

revoke all on function public.billing_reminders_set_paused(uuid, boolean, text) from public, anon;
grant execute on function public.billing_reminders_set_paused(uuid, boolean, text) to authenticated;
