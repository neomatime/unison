create or replace function private.index_record_change() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  payload jsonb;
  target_org uuid;
  target_id uuid;
  target_title text;
  target_subtitle text;
  target_href text;
  archived boolean;
begin
  if auth.uid() is null and current_user not in ('postgres', 'service_role') then
    raise insufficient_privilege using message = 'An authenticated database role is required';
  end if;

  payload := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  target_org := (payload ->> 'organization_id')::uuid;
  target_id := (payload ->> 'id')::uuid;
  archived := coalesce(payload ->> 'archived_at', '') <> '';

  case tg_table_name
    when 'clients' then
      target_title := payload ->> 'name';
      target_subtitle := concat_ws(' · ', payload ->> 'industry', payload ->> 'contact_name', payload ->> 'status');
      target_href := '/operations/clients/' || target_id;
    when 'frameworks' then
      target_title := payload ->> 'name';
      target_subtitle := concat_ws(' · ', payload ->> 'type', payload ->> 'version');
      target_href := '/delivery/frameworks/' || target_id;
    when 'projects' then
      target_title := payload ->> 'name';
      target_subtitle := concat_ws(' · ', payload ->> 'status', payload ->> 'health', payload ->> 'next_gate');
      target_href := '/operations/projects/' || target_id;
    when 'portfolios' then
      target_title := payload ->> 'name';
      target_subtitle := concat_ws(' · ', payload ->> 'code', payload ->> 'status');
      target_href := '/delivery/portfolio/' || target_id;
    when 'programmes' then
      target_title := payload ->> 'name';
      target_subtitle := concat_ws(' · ', payload ->> 'code', payload ->> 'status', payload ->> 'health');
      target_href := '/delivery/portfolio/' || (payload ->> 'portfolio_id') || '/programmes/' || target_id;
    when 'approvals' then
      target_title := payload ->> 'title';
      target_subtitle := concat_ws(' · ', payload ->> 'priority', payload ->> 'status', payload ->> 'description');
      target_href := '/delivery/approvals/' || target_id;
    when 'team_members' then
      target_title := payload ->> 'full_name';
      target_subtitle := concat_ws(' · ', payload ->> 'email', payload ->> 'job_title', payload ->> 'delivery_role');
      target_href := '/people/team/' || target_id;
    when 'client_onboardings' then
      target_title := payload ->> 'client_name';
      target_subtitle := concat_ws(' · ', payload ->> 'stage', payload ->> 'health', payload ->> 'status');
      target_href := '/operations/onboarding/' || target_id;
    when 'vendors' then
      target_title := payload ->> 'name';
      target_subtitle := concat_ws(' · ', payload ->> 'vendor_type', payload ->> 'service_category', payload ->> 'status');
      target_href := '/delivery/vendors/' || target_id;
    when 'tasks' then
      target_title := payload ->> 'title';
      target_subtitle := concat_ws(' · ', payload ->> 'priority', payload ->> 'status', payload ->> 'description');
      target_href := '/operations/tasks/' || target_id;
    when 'calendar_events' then
      target_title := payload ->> 'title';
      target_subtitle := concat_ws(' · ', payload ->> 'event_type', payload ->> 'location', payload ->> 'status');
      target_href := '/operations/calendar/' || target_id;
    when 'leads' then
      target_title := payload ->> 'company_name';
      target_subtitle := concat_ws(' · ', payload ->> 'contact_name', payload ->> 'contact_email', payload ->> 'status');
      target_href := '/commercial/leads/' || target_id;
    when 'sales_opportunities' then
      target_title := payload ->> 'name';
      target_subtitle := concat_ws(' · ', payload ->> 'client_name', payload ->> 'stage');
      target_href := '/commercial/sales/' || target_id;
    when 'quotes' then
      target_title := payload ->> 'quote_number';
      target_subtitle := concat_ws(' · ', payload ->> 'client_name', payload ->> 'status');
      target_href := '/commercial/quotes/' || target_id;
    when 'invoices' then
      target_title := payload ->> 'invoice_number';
      target_subtitle := concat_ws(' · ', payload ->> 'client_name', payload ->> 'status');
      target_href := '/finance/invoices/' || target_id;
    when 'expenses' then
      target_title := payload ->> 'description';
      target_subtitle := concat_ws(' · ', payload ->> 'category', payload ->> 'vendor_name', payload ->> 'status');
      target_href := '/finance/expenses/' || target_id;
    when 'financial_forecasts' then
      target_title := payload ->> 'name';
      target_subtitle := concat_ws(' · ', payload ->> 'period_label', payload ->> 'forecast_type', payload ->> 'status');
      target_href := '/finance/forecast/' || target_id;
    when 'documents' then
      target_title := payload ->> 'display_name';
      target_subtitle := concat_ws(' · ', payload ->> 'classification', payload ->> 'confidentiality', payload ->> 'description');
      target_href := '/api/documents/' || target_id || '/download';
    when 'support_tickets' then
      target_title := 'SUP-' || lpad(payload ->> 'ticket_number', 6, '0') || ' · ' || (payload ->> 'subject');
      target_subtitle := concat_ws(' · ', payload ->> 'category', payload ->> 'priority', payload ->> 'status');
      target_href := '/support/' || target_id;
    else
      raise exception 'Unsupported search resource: %', tg_table_name;
  end case;

  if tg_op = 'DELETE' or archived then
    delete from public.record_index
      where organization_id = target_org and resource = tg_table_name and record_id = target_id;
  else
    insert into public.record_index(organization_id, resource, record_id, title, subtitle, href, updated_at)
    values (
      target_org,
      tg_table_name,
      target_id,
      coalesce(target_title, 'Untitled record'),
      coalesce(target_subtitle, ''),
      target_href,
      coalesce((payload ->> 'updated_at')::timestamptz, (payload ->> 'created_at')::timestamptz, now())
    )
    on conflict (organization_id, resource, record_id) do update set
      title = excluded.title,
      subtitle = excluded.subtitle,
      href = excluded.href,
      updated_at = excluded.updated_at;
  end if;

  -- A parent organization can already be absent during ON DELETE CASCADE.
  -- Its index and event rows are cascading too; adding a new event would
  -- violate the foreign key and block the organization deletion.
  if exists (select 1 from public.organizations where id = target_org) then
    insert into public.record_change_events(organization_id, resource, record_id, operation, actor_id)
    values (target_org, tg_table_name, target_id, tg_op, auth.uid());
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
