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
  -- Membership is checked before anything is locked, so a non-member and a missing
  -- lead get the same answer at the same speed and never wait on another
  -- organisation's conversion.
  select l.organization_id into v_org from public.leads l where l.id = p_lead_id;
  if not found or not public.is_member_of(v_org) then
    raise exception 'LEAD_NOT_FOUND' using errcode = '42501';
  end if;
  -- Locking the lead row serialises two simultaneous conversions of the same lead.
  select * into v_lead from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'LEAD_NOT_FOUND' using errcode = '42501';
  end if;
  -- Checked only after the lock: both may have changed while this call waited.
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

  -- 4. Follow-ups already on the lead now also belong to the client, unless they
  --    were already tied to a client of their own.
  update public.tasks set client_id = v_client_id
    where lead_id = v_lead.id and organization_id = v_org and client_id is null;

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
