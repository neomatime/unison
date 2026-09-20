alter table public.leads
  add column website_submission_key text,
  add column website_submitted_at timestamptz,
  add column contact_role text,
  add column organization_size text,
  add column industry text,
  add column areas_of_interest text[],
  add column primary_challenge text,
  add column business_impact text[],
  add column impact_severity text,
  add column urgency text,
  add column buying_stage text,
  add column engagement_type text,
  add column qualification_outcome text,
  add column qualification_score smallint,
  add column qualification_signals jsonb,
  add column manual_review_required boolean,
  add column review_override text;

alter table public.leads
  add constraint leads_website_submission_key_format
    check (website_submission_key is null or website_submission_key ~ '^[0-9a-f]{64}$'),
  add constraint leads_website_submission_unique
    unique (organization_id, website_submission_key),
  add constraint leads_qualification_outcome_check
    check (
      qualification_outcome is null
      or qualification_outcome in ('qualified', 'nurture', 'not_a_fit')
    ),
  add constraint leads_qualification_score_check
    check (qualification_score is null or qualification_score between 0 and 5),
  add constraint leads_review_override_check
    check (
      review_override is null
      or review_override in ('qualified', 'nurture', 'not_a_fit')
    );

comment on column public.leads.website_submission_key is
  'Stable SHA-256 delivery key used to make HIMARK website lead ingestion idempotent.';
comment on column public.leads.qualification_signals is
  'Server-assessed website qualification signals; advisory only and always subject to manual review.';

grant select, insert, update on public.leads to service_role;
