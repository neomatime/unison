-- Public HIMARK prospect engagement, acquisition attribution and versioned form configuration.
-- The public route writes through submit_prospect_engagement as service_role. Anonymous database access remains revoked.

create table public.engagement_form_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version text not null check (version ~ '^[0-9]+\.[0-9]+$'),
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, version),
  check ((status = 'published') = (published_at is not null))
);

create unique index engagement_form_one_published
  on public.engagement_form_versions(organization_id)
  where status = 'published';

create table public.acquisition_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{8,32}$'),
  name text not null check (length(trim(name)) between 2 and 120),
  channel text not null check (channel in (
    'corporate-website', 'qr-code', 'direct-invitation', 'email-signature',
    'marketing-campaign', 'referral', 'business-development'
  )),
  campaign_name text,
  event_name text,
  assigned_to_id uuid,
  referring_employee_id uuid,
  form_version_id uuid,
  active boolean not null default true,
  visit_count bigint not null default 0 check (visit_count >= 0),
  submission_count bigint not null default 0 check (submission_count >= 0),
  disabled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (assigned_to_id, organization_id)
    references public.team_members(id, organization_id) on delete set null (assigned_to_id),
  foreign key (referring_employee_id, organization_id)
    references public.team_members(id, organization_id) on delete set null (referring_employee_id),
  foreign key (form_version_id, organization_id)
    references public.engagement_form_versions(id, organization_id) on delete set null (form_version_id),
  check ((active and disabled_at is null) or (not active and disabled_at is not null))
);

create index acquisition_links_org_active_idx on public.acquisition_links(organization_id, active, created_at desc);

create table public.prospect_engagements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null,
  matched_client_id uuid,
  matched_contact_id uuid,
  acquisition_link_id uuid,
  form_version_id uuid not null,
  submission_key uuid not null,
  selected_services text[] not null check (cardinality(selected_services) between 1 and 5),
  primary_service text not null,
  primary_objective text not null,
  expected_timeline text not null check (expected_timeline in (
    'as-soon-as-possible', 'within-1-3-months', 'within-3-6-months', 'exploring'
  )),
  additional_information text check (additional_information is null or length(additional_information) <= 500),
  organisation_name text not null,
  industry text not null,
  country text,
  full_name text not null,
  email text not null,
  phone text,
  job_title text,
  preferred_contact text not null check (preferred_contact in ('email', 'telephone')),
  acquisition_channel text not null,
  source_name text,
  campaign_name text,
  event_name text,
  referring_employee_id uuid,
  utm_parameters jsonb not null default '{}'::jsonb check (jsonb_typeof(utm_parameters) = 'object'),
  privacy_acknowledged_at timestamptz not null,
  privacy_notice_version text not null,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  submitted_at timestamptz not null default now(),
  retention_review_at timestamptz not null default (now() + interval '24 months'),
  form_version text not null,
  unique (id, organization_id),
  unique (organization_id, submission_key),
  foreign key (lead_id, organization_id)
    references public.leads(id, organization_id) on delete cascade,
  foreign key (matched_client_id, organization_id)
    references public.clients(id, organization_id) on delete set null (matched_client_id),
  foreign key (matched_contact_id, organization_id)
    references public.contacts(id, organization_id) on delete set null (matched_contact_id),
  foreign key (acquisition_link_id, organization_id)
    references public.acquisition_links(id, organization_id) on delete set null (acquisition_link_id),
  foreign key (form_version_id, organization_id)
    references public.engagement_form_versions(id, organization_id) on delete restrict,
  foreign key (referring_employee_id, organization_id)
    references public.team_members(id, organization_id) on delete set null (referring_employee_id),
  check ((marketing_consent and marketing_consent_at is not null) or (not marketing_consent and marketing_consent_at is null))
);

create index prospect_engagements_lead_idx on public.prospect_engagements(lead_id, submitted_at desc);
create index prospect_engagements_org_submitted_idx on public.prospect_engagements(organization_id, submitted_at desc);
create index prospect_engagements_channel_idx on public.prospect_engagements(organization_id, acquisition_channel, submitted_at desc);
create index prospect_engagements_primary_service_idx on public.prospect_engagements(organization_id, primary_service, submitted_at desc);
create index contacts_email_lower_idx on public.contacts(organization_id, lower(email)) where email is not null and archived_at is null;

-- Only a digest of the network identifier is retained. Entries are operational abuse controls, not analytics.
create table private.prospect_rate_limits (
  identifier_hash text primary key check (identifier_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now()
);

alter table public.engagement_form_versions enable row level security;
alter table public.acquisition_links enable row level security;
alter table public.prospect_engagements enable row level security;

create policy engagement_form_versions_select on public.engagement_form_versions for select to authenticated
  using (public.is_member_of(organization_id));
create policy engagement_form_versions_insert on public.engagement_form_versions for insert to authenticated
  with check (public.has_role(organization_id, array['owner','admin']));
create policy engagement_form_versions_update on public.engagement_form_versions for update to authenticated
  using (public.has_role(organization_id, array['owner','admin']))
  with check (public.has_role(organization_id, array['owner','admin']));

create policy acquisition_links_select on public.acquisition_links for select to authenticated
  using (public.is_member_of(organization_id));
create policy acquisition_links_insert on public.acquisition_links for insert to authenticated
  with check (public.has_role(organization_id, array['owner','admin']));
create policy acquisition_links_update on public.acquisition_links for update to authenticated
  using (public.has_role(organization_id, array['owner','admin']))
  with check (public.has_role(organization_id, array['owner','admin']));

create policy prospect_engagements_select on public.prospect_engagements for select to authenticated
  using (public.is_member_of(organization_id));

revoke all on public.engagement_form_versions, public.acquisition_links, public.prospect_engagements from anon, authenticated;
grant select on public.engagement_form_versions, public.acquisition_links, public.prospect_engagements to authenticated;
grant insert, update on public.engagement_form_versions, public.acquisition_links to authenticated;

create trigger engagement_form_versions_set_updated_at before update on public.engagement_form_versions
  for each row execute function public.set_updated_at();
create trigger acquisition_links_set_updated_at before update on public.acquisition_links
  for each row execute function public.set_updated_at();
create trigger engagement_form_versions_audit after insert or update or delete on public.engagement_form_versions
  for each row execute function public.record_audit_event();
create trigger acquisition_links_audit
  after insert or delete or update of name, channel, campaign_name, event_name, assigned_to_id,
    referring_employee_id, form_version_id, active, disabled_at
  on public.acquisition_links
  for each row execute function public.record_audit_event();

-- Public engagement receipts appear on the existing CRM timeline as system events.
alter table public.activities drop constraint activities_kind_check;
alter table public.activities add constraint activities_kind_check check (kind in (
  'call', 'meeting', 'email', 'note', 'lead.converted', 'client.created_from_lead',
  'opportunity.created_from_lead', 'opportunity.stage_changed', 'quote.sent', 'quote.accepted',
  'quote.emailed', 'invoice.emailed', 'quote.invoiced', 'payment.recorded', 'payment.voided',
  'invoice.overdue', 'billing.package_set', 'billing.tier_changed', 'billing.support_added',
  'billing.document_built', 'quote.declined', 'quote.superseded', 'billing.plan_created',
  'billing.invoice_approved', 'billing.plan_changed', 'prospect.engagement_submitted'
));

create or replace function public.consume_prospect_rate_limit(
  p_identifier_hash text,
  p_limit integer default 10,
  p_window_seconds integer default 3600
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_attempts integer;
begin
  if p_identifier_hash !~ '^[0-9a-f]{64}$' or p_limit < 1 or p_window_seconds < 60 then
    return false;
  end if;

  insert into private.prospect_rate_limits(identifier_hash, window_started_at, attempts, updated_at)
  values (p_identifier_hash, now(), 1, now())
  on conflict (identifier_hash) do update set
    window_started_at = case
      when private.prospect_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
        then now()
      else private.prospect_rate_limits.window_started_at
    end,
    attempts = case
      when private.prospect_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
        then 1
      else private.prospect_rate_limits.attempts + 1
    end,
    updated_at = now()
  returning attempts into v_attempts;

  return v_attempts <= p_limit;
end $$;

create or replace function public.record_acquisition_visit(p_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_org constant uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_updated integer;
begin
  update public.acquisition_links
  set visit_count = visit_count + 1
  where organization_id = v_org and token = p_token and active;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end $$;

create or replace function public.publish_engagement_form_version(p_version_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_org uuid;
begin
  select organization_id into v_org
  from public.engagement_form_versions
  where id = p_version_id and status = 'draft'
  for update;
  if not found then raise exception 'FORM_VERSION_NOT_DRAFT' using errcode = 'P0002'; end if;
  if not public.has_role(v_org, array['owner','admin']) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.engagement_form_versions
  set status = 'retired', published_at = null
  where organization_id = v_org and status = 'published';
  update public.engagement_form_versions
  set status = 'published', published_at = now()
  where id = p_version_id;
end $$;

create or replace function public.submit_prospect_engagement(p_submission jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_org constant uuid := '00000000-0000-4000-8000-000000000001'::uuid;
  v_now timestamptz := now();
  v_existing public.prospect_engagements%rowtype;
  v_link public.acquisition_links%rowtype;
  v_version public.engagement_form_versions%rowtype;
  v_lead_id uuid;
  v_owner_id uuid;
  v_notify_user uuid;
  v_contact_id uuid;
  v_client_id uuid;
  v_engagement_id uuid;
  v_services text[];
  v_email text := lower(trim(p_submission ->> 'email'));
  v_channel text;
  v_lead_source text;
  v_priority text;
  v_due_at timestamptz;
begin
  select * into v_existing from public.prospect_engagements
  where organization_id = v_org and submission_key = (p_submission ->> 'submission_key')::uuid;
  if found then
    return jsonb_build_object('accepted', true, 'duplicate', true);
  end if;

  if nullif(p_submission ->> 'source_token', '') is not null then
    select * into v_link from public.acquisition_links
    where token = p_submission ->> 'source_token' and organization_id = v_org and active;
    if not found then raise exception 'SOURCE_UNAVAILABLE' using errcode = 'P0002'; end if;
  end if;

  select * into v_version from public.engagement_form_versions
  where id = (p_submission ->> 'form_version_id')::uuid
    and organization_id = v_org
    and (
      status = 'published'
      or (status = 'retired' and v_link.id is not null and v_link.form_version_id = id)
    );
  if not found then raise exception 'FORM_VERSION_UNAVAILABLE' using errcode = 'P0002'; end if;
  if v_link.id is not null and v_link.form_version_id is not null and v_link.form_version_id <> v_version.id then
    raise exception 'FORM_VERSION_MISMATCH' using errcode = '23514';
  end if;

  select array_agg(value) into v_services
  from jsonb_array_elements_text(p_submission -> 'selected_services') as services(value);
  v_channel := coalesce(v_link.channel, p_submission ->> 'channel', 'corporate-website');
  v_lead_source := case v_channel
    when 'corporate-website' then 'Website'
    when 'qr-code' then 'Event'
    when 'marketing-campaign' then 'Campaign'
    when 'referral' then 'Referral'
    when 'direct-invitation' then 'Outbound'
    when 'email-signature' then 'Outbound'
    when 'business-development' then 'Outbound'
    else 'Other'
  end;

  v_owner_id := v_link.assigned_to_id;
  if v_owner_id is null then
    select tm.id into v_owner_id from public.team_members tm
    where tm.organization_id = v_org and tm.status = 'Active' and tm.archived_at is null
    order by
      (lower(coalesce(tm.job_title, '')) like '%business development%' or lower(coalesce(tm.job_title, '')) like '%commercial%') desc,
      (tm.user_id is not null) desc,
      tm.created_at asc
    limit 1;
  end if;

  select c.id, c.client_id into v_contact_id, v_client_id
  from public.contacts c
  where c.organization_id = v_org and c.archived_at is null and lower(c.email) = v_email
  order by c.updated_at desc limit 1;

  if v_client_id is null then
    select c.id into v_client_id from public.clients c
    where c.organization_id = v_org and c.archived_at is null
      and lower(trim(c.name)) = lower(trim(p_submission ->> 'organisation_name'))
    order by c.updated_at desc limit 1;
  end if;

  select l.id into v_lead_id
  from public.leads l
  left join public.contacts c on c.lead_id = l.id and c.archived_at is null
  where l.organization_id = v_org and l.archived_at is null and l.converted_at is null
    and (lower(l.contact_email) = v_email or lower(c.email) = v_email)
  order by l.updated_at desc limit 1;

  if v_lead_id is null then
    insert into public.leads(
      organization_id, company_name, contact_name, contact_email, contact_phone,
      contact_role, industry, source, owner_id, status, last_activity_at, areas_of_interest,
      primary_challenge, urgency, notes
    ) values (
      v_org, trim(p_submission ->> 'organisation_name'), trim(p_submission ->> 'full_name'),
      v_email, nullif(trim(p_submission ->> 'phone'), ''), nullif(trim(p_submission ->> 'job_title'), ''),
      p_submission ->> 'industry', v_lead_source, v_owner_id, 'New', v_now, v_services,
      p_submission ->> 'primary_objective', p_submission ->> 'expected_timeline',
      'Submitted through the HIMARK prospect engagement experience.'
    ) returning id into v_lead_id;
  else
    update public.leads set
      owner_id = coalesce(owner_id, v_owner_id),
      contact_phone = coalesce(contact_phone, nullif(trim(p_submission ->> 'phone'), '')),
      contact_role = coalesce(contact_role, nullif(trim(p_submission ->> 'job_title'), '')),
      industry = coalesce(industry, p_submission ->> 'industry'),
      last_activity_at = v_now
    where id = v_lead_id;
  end if;

  if v_contact_id is null then
    insert into public.contacts(
      organization_id, lead_id, full_name, email, phone, job_title, is_primary
    ) values (
      v_org, v_lead_id, trim(p_submission ->> 'full_name'), v_email,
      nullif(trim(p_submission ->> 'phone'), ''), nullif(trim(p_submission ->> 'job_title'), ''),
      not exists (select 1 from public.contacts where lead_id = v_lead_id and archived_at is null)
    ) returning id into v_contact_id;
  end if;

  insert into public.prospect_engagements(
    organization_id, lead_id, matched_client_id, matched_contact_id, acquisition_link_id,
    form_version_id, submission_key, selected_services, primary_service, primary_objective,
    expected_timeline, additional_information, organisation_name, industry, country,
    full_name, email, phone, job_title, preferred_contact, acquisition_channel, source_name,
    campaign_name, event_name, referring_employee_id, utm_parameters, privacy_acknowledged_at,
    privacy_notice_version, marketing_consent, marketing_consent_at, submitted_at, form_version
  ) values (
    v_org, v_lead_id, v_client_id, v_contact_id, v_link.id, v_version.id,
    (p_submission ->> 'submission_key')::uuid, v_services, p_submission ->> 'primary_service',
    p_submission ->> 'primary_objective', p_submission ->> 'expected_timeline',
    nullif(trim(p_submission ->> 'additional_information'), ''), trim(p_submission ->> 'organisation_name'),
    p_submission ->> 'industry', nullif(trim(p_submission ->> 'country'), ''),
    trim(p_submission ->> 'full_name'), v_email, nullif(trim(p_submission ->> 'phone'), ''),
    nullif(trim(p_submission ->> 'job_title'), ''), p_submission ->> 'contact_preference', v_channel,
    v_link.name, v_link.campaign_name, v_link.event_name, v_link.referring_employee_id,
    coalesce(p_submission -> 'utm', '{}'::jsonb), v_now, v_version.config ->> 'privacyNoticeVersion',
    (p_submission ->> 'marketing_consent')::boolean,
    case when (p_submission ->> 'marketing_consent')::boolean then v_now else null end,
    v_now, v_version.version
  ) returning id into v_engagement_id;

  insert into public.activities(organization_id, kind, subject, body, occurred_at, details, lead_id)
  values (
    v_org, 'prospect.engagement_submitted', 'New prospect enquiry received',
    nullif(trim(p_submission ->> 'additional_information'), ''), v_now,
    jsonb_build_object(
      'engagement_id', v_engagement_id,
      'primary_service', p_submission ->> 'primary_service',
      'objective', p_submission ->> 'primary_objective',
      'timeline', p_submission ->> 'expected_timeline',
      'channel', v_channel
    ), v_lead_id
  );

  v_priority := case p_submission ->> 'expected_timeline'
    when 'as-soon-as-possible' then 'High'
    when 'within-1-3-months' then 'Medium'
    else 'Low'
  end;
  v_due_at := case p_submission ->> 'expected_timeline'
    when 'as-soon-as-possible' then v_now + interval '1 day'
    when 'within-1-3-months' then v_now + interval '3 days'
    else v_now + interval '7 days'
  end;

  insert into public.tasks(organization_id, title, description, lead_id, assignee_id, priority, status, due_at)
  values (
    v_org, 'Follow up with ' || trim(p_submission ->> 'full_name'),
    'Review the prospect engagement details and make contact using their preferred channel.',
    v_lead_id, v_owner_id, v_priority, 'Planned', v_due_at
  );

  select tm.user_id into v_notify_user from public.team_members tm where tm.id = v_owner_id;
  if v_notify_user is null then
    select m.user_id into v_notify_user from public.memberships m
    where m.organization_id = v_org and m.status = 'active' and m.role_id in ('owner','admin')
    order by case m.role_id when 'owner' then 0 else 1 end, m.created_at asc limit 1;
  end if;
  if v_notify_user is not null then
    insert into public.notifications(organization_id, user_id, title, body, category, href)
    values (
      v_org, v_notify_user, 'New prospect enquiry',
      trim(p_submission ->> 'full_name') || ' from ' || trim(p_submission ->> 'organisation_name') || ' has connected with HIMARK.',
      'Commercial', '/commercial/leads/' || v_lead_id::text
    );
  end if;

  if v_link.id is not null then
    update public.acquisition_links set submission_count = submission_count + 1 where id = v_link.id;
  end if;

  return jsonb_build_object('accepted', true, 'duplicate', false);
end $$;

revoke all on function public.consume_prospect_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.record_acquisition_visit(text) from public, anon, authenticated;
revoke all on function public.publish_engagement_form_version(uuid) from public, anon;
revoke all on function public.submit_prospect_engagement(jsonb) from public, anon, authenticated;
grant execute on function public.publish_engagement_form_version(uuid) to authenticated;
grant execute on function public.consume_prospect_rate_limit(text, integer, integer) to service_role;
grant execute on function public.record_acquisition_visit(text) to service_role;
grant execute on function public.submit_prospect_engagement(jsonb) to service_role;

insert into public.engagement_form_versions(organization_id, version, status, config, published_at)
select
  id,
  '1.0',
  'published',
  jsonb_build_object(
    'headline', 'Let''s explore a partnership.',
    'supportingText', 'Tell us what you''re looking to achieve. A few quick steps will help us understand how HIMARK can support your organisation.',
    'privacyNoticeUrl', 'https://himark.co.za/privacy',
    'privacyNoticeVersion', '2026-11',
    'enabledServices', jsonb_build_array(
      'consulting', 'technology-development', 'vesper', 'multimedia-creative',
      'strategic-partnership', 'not-sure'
    )
  ),
  now()
from public.organizations
where id = '00000000-0000-4000-8000-000000000001'::uuid
on conflict (organization_id, version) do nothing;

