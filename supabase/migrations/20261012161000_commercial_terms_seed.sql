-- Commercial terms: the seed (build 1 of the terms engine). Append-only.
-- public.seed_commercial_terms(org) loads, for one organisation:
--   * the two company templates (quotes, invoices). Their approved version 1 is copied from the organisation's existing
--     default terms (organization_settings.default_quote_terms / default_payment_terms) when those are not empty;
--   * a template for each retainer tier, project category and support service, with approved version 1 for the ones the
--     user's wording covers (effective 2026-10-12). Support services get a template and no version.
-- Idempotent: it never touches a template that already has a version. Service role only.
-- The JSON below is generated from features/terms/seed-wording.ts; tests/unit/terms-seed.test.ts keeps the two equal.

create or replace function public.seed_commercial_terms(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_seed constant jsonb := $terms_seed$[
  {
    "target_kind": "retainer",
    "target_key": "signature",
    "applies_to": "quote",
    "title": "Signature Partner",
    "body": "Signature Partner provides focused strategic advisory and transformation support for up to {{initiative_limit}} agreed active business priorities.\nThe partnership includes a dedicated HIMARK Engagement Lead, an agreed improvement roadmap, applicable TRACE assessments, fortnightly working sessions and monthly executive progress reviews.\nThe {{monthly_fee}} monthly retainer includes {{monthly_credits}} monthly credits for authorised work within the agreed partnership scope.\nThe included monthly credits are not separately invoiced.\nOne-time onboarding or implementation work is scoped, approved and priced separately where applicable.\nAdditional credits or work beyond the agreed scope require prior client approval and separate billing.\nSpecialist access, delivery capacity and priorities remain subject to the agreement.\nUnused-credit treatment, contract duration and termination conditions follow the signed agreement.",
    "inclusions": "Dedicated HIMARK Engagement Lead\nAgreed improvement roadmap\nApplicable TRACE assessments\nFortnightly working sessions\nMonthly executive progress reviews"
  },
  {
    "target_kind": "retainer",
    "target_key": "growth",
    "applies_to": "quote",
    "title": "Growth Partner",
    "body": "Growth Partner provides strategic coordination and transformation support for up to {{initiative_limit}} agreed active initiatives.\nHIMARK provides a dedicated Engagement Lead, a coordinated transformation roadmap, relevant TRACE monitoring, priority specialist access, implementation coordination, weekly working sessions and monthly executive governance.\nThe {{monthly_fee}} monthly retainer includes {{monthly_credits}} monthly credits for authorised work within the agreed partnership scope.\nIncluded monthly credits must not be invoiced again.\nSubstantial implementation and onboarding work is scoped and charged separately where applicable.\nAdditional credits and approved scope changes are billed separately.\nDelivery commitments, credit treatment, contract duration and termination follow the signed agreement.",
    "inclusions": "Dedicated Engagement Lead\nCoordinated transformation roadmap\nRelevant TRACE monitoring\nPriority specialist access\nImplementation coordination\nWeekly working sessions\nMonthly executive governance"
  },
  {
    "target_kind": "retainer",
    "target_key": "private",
    "applies_to": "quote",
    "title": "Private Partner",
    "body": "Private Partner provides embedded strategic transformation support alongside the client's leadership team for up to {{initiative_limit}} agreed active initiatives.\nThe partnership includes a dedicated Account Director, a 12-month transformation agenda, multi-function TRACE assessments, executive reporting, vendor coordination and priority or reserved specialist access as agreed.\nThe {{monthly_fee}} monthly retainer includes {{monthly_credits}} monthly credits for authorised work within the agreed partnership scope.\nIncluded monthly credits are not charged separately.\nMajor implementation, onboarding and specialist projects outside the agreed scope require separate approval and pricing.\nReserved access does not constitute unlimited delivery capacity.\nCredit rules, agreement duration, confidentiality obligations and termination conditions follow the executed agreement.",
    "inclusions": "Dedicated Account Director\n12-month transformation agenda\nMulti-function TRACE assessments\nExecutive reporting\nVendor coordination\nPriority or reserved specialist access as agreed"
  },
  {
    "target_kind": "retainer",
    "target_key": "reserve",
    "applies_to": "quote",
    "title": "HIMARK Reserve",
    "body": "HIMARK Reserve provides enterprise-wide strategic transformation support and access to reserved HIMARK capability.\nThe engagement includes an Account Director, HIMARK Executive Sponsor, enterprise transformation oversight, reserved specialist capacity, relevant TRACE assessments and executive or board-level reporting as agreed.\nThe {{monthly_fee}} monthly retainer includes {{monthly_credits}} monthly credits for authorised work within the agreed partnership scope.\nIncluded credits must not be billed a second time.\nAdditional enterprise initiatives, major implementation and work outside approved capacity require separate scope and commercial approval.\nReserved-priority mobilisation is governed by the agreed capacity and delivery commitments.\nConfidentiality, credit availability, contract duration, service limitations and termination follow the executed agreement.",
    "inclusions": "Account Director\nHIMARK Executive Sponsor\nEnterprise transformation oversight\nReserved specialist capacity\nRelevant TRACE assessments\nExecutive or board-level reporting as agreed"
  },
  {
    "target_kind": "project",
    "target_key": "strategic_consulting",
    "applies_to": "quote",
    "title": "Strategic Consulting",
    "body": "The engagement covers the specific strategic advisory deliverables described in the approved scope of work.\nDiscovery, research, recommendations and agreed strategy documents are delivered according to the approved project plan.\nClient input, access to relevant stakeholders and timely feedback may be required.\nAdditional strategic initiatives or ongoing advisory support are excluded unless contracted separately.",
    "inclusions": ""
  },
  {
    "target_kind": "project",
    "target_key": "operating_model",
    "applies_to": "quote",
    "title": "Operating Model & Operations Transformation",
    "body": "Delivery is limited to the approved operational processes, business functions and improvement objectives.\nThe client provides necessary operational information, system access and stakeholder participation.\nChanges affecting additional departments, systems or agreed requirements are subject to change approval.\nOngoing operational management or improvement support is contracted separately where required.",
    "inclusions": ""
  },
  {
    "target_kind": "project",
    "target_key": "intelligence_ai",
    "applies_to": "quote",
    "title": "Intelligence & AI Transformation",
    "body": "The engagement covers the agreed AI, automation or intelligence solution and its documented scope.\nDeployment, integrations, data access, testing and acceptance requirements must be agreed before implementation.\nThird-party AI usage, hosting, API access and subscription fees are separately identified unless included in the quotation.\nPerformance monitoring, future model changes, maintenance and additional functionality are governed by the applicable support or change agreement.\nClient data handling, security and access requirements must be established in the approved project documentation.",
    "inclusions": ""
  },
  {
    "target_kind": "project",
    "target_key": "digital_experience",
    "applies_to": "quote",
    "title": "Digital Experience",
    "body": "Delivery includes only the agreed digital experience, UX/UI, product design or application deliverables.\nDesign approvals, revision allowances, device coverage and acceptance requirements are defined by the approved scope.\nNew features, additional screens or additional development require separate approval.\nPost-delivery application or interface care is not included unless expressly contracted.",
    "inclusions": ""
  },
  {
    "target_kind": "project",
    "target_key": "digital_presence",
    "applies_to": "quote",
    "title": "Digital Presence",
    "body": "Delivery covers the agreed website, branding or digital presence deliverables.\nThe approved sitemap, pages, features, integrations and content responsibilities define the scope.\nHosting, domain registration, licences and external subscriptions are included only where expressly itemised.\nNew functionality, additional pages and post-launch maintenance require an approved scope or separate care agreement.\nLaunch and handover follow the agreed client acceptance requirements.",
    "inclusions": ""
  },
  {
    "target_kind": "project",
    "target_key": "visual_communication",
    "applies_to": "quote",
    "title": "Visual Communication & Operations",
    "body": "Delivery covers the approved visual communication, podcast, social media or executive communication deliverables.\nThe quotation must identify quantities, formats, platforms, production responsibilities and revision limits.\nStudio hire, travel, recording equipment, external talent, paid media and other production expenses are included only where expressly stated.\nAdditional episodes, content assets, revisions or campaigns require separate approval.\nIntellectual-property usage, publishing permissions and third-party materials are governed by the applicable agreed terms.",
    "inclusions": ""
  },
  {
    "target_kind": "support",
    "target_key": "operations_improvement",
    "applies_to": "quote",
    "title": "Operations Improvement Support",
    "body": "",
    "inclusions": ""
  },
  {
    "target_kind": "support",
    "target_key": "ai_automation_care",
    "applies_to": "quote",
    "title": "AI & Automation Care",
    "body": "",
    "inclusions": ""
  },
  {
    "target_kind": "support",
    "target_key": "digital_experience_management",
    "applies_to": "quote",
    "title": "Digital Experience Management",
    "body": "",
    "inclusions": ""
  },
  {
    "target_kind": "support",
    "target_key": "application_interface_care",
    "applies_to": "quote",
    "title": "Application & Interface Care",
    "body": "",
    "inclusions": ""
  },
  {
    "target_kind": "support",
    "target_key": "digital_presence_management",
    "applies_to": "quote",
    "title": "Digital Presence Management",
    "body": "",
    "inclusions": ""
  },
  {
    "target_kind": "support",
    "target_key": "website_care",
    "applies_to": "quote",
    "title": "Website Care",
    "body": "",
    "inclusions": ""
  },
  {
    "target_kind": "support",
    "target_key": "communication_asset_care",
    "applies_to": "quote",
    "title": "Communication & Asset Care",
    "body": "",
    "inclusions": ""
  },
  {
    "target_kind": "support",
    "target_key": "podcast_content",
    "applies_to": "quote",
    "title": "Podcast Content",
    "body": "",
    "inclusions": ""
  },
  {
    "target_kind": "support",
    "target_key": "integrated_podcast_social",
    "applies_to": "quote",
    "title": "Integrated Podcast & Social Media Content",
    "body": "",
    "inclusions": ""
  },
  {
    "target_kind": "support",
    "target_key": "social_media_content",
    "applies_to": "quote",
    "title": "Social Media Content",
    "body": "",
    "inclusions": ""
  }
]$terms_seed$::jsonb;
begin
  insert into public.terms_templates (organization_id, target_kind, target_key, applies_to, title)
  values
    (p_org, 'company', null, 'quote', 'Company terms: quotes'),
    (p_org, 'company', null, 'invoice', 'Company terms: invoices')
  on conflict do nothing;

  insert into public.terms_templates (organization_id, target_kind, target_key, applies_to, title)
  select p_org, s.target_kind, s.target_key, s.applies_to, s.title
  from jsonb_to_recordset(v_seed) as s(target_kind text, target_key text, applies_to text, title text, body text, inclusions text)
  on conflict do nothing;

  -- Approved version 1 for the offering templates that have wording and no version yet.
  insert into public.terms_template_versions (organization_id, template_id, version, status, body, inclusions, effective_from, change_note, approved_at)
  select p_org, t.id, 1, 'approved', s.body, s.inclusions, date '2026-10-12', 'Loaded from the approved HIMARK wording.', now()
  from jsonb_to_recordset(v_seed) as s(target_kind text, target_key text, applies_to text, title text, body text, inclusions text)
  join public.terms_templates t
    on t.organization_id = p_org and t.target_kind = s.target_kind and t.target_key = s.target_key and t.applies_to = s.applies_to
  where btrim(s.body) <> ''
    and not exists (select 1 from public.terms_template_versions v where v.template_id = t.id);

  -- Approved version 1 for each company template from the organisation's existing default terms, when there are any.
  insert into public.terms_template_versions (organization_id, template_id, version, status, body, inclusions, effective_from, change_note, approved_at)
  select p_org, t.id, 1, 'approved',
         replace(replace(case t.applies_to when 'quote' then s.default_quote_terms else s.default_payment_terms end, E'\r\n', E'\n'), E'\r', E'\n'),
         '', date '2026-10-12', 'Copied from the default terms in the company settings.', now()
  from public.terms_templates t
  join public.organization_settings s on s.organization_id = t.organization_id
  where t.organization_id = p_org and t.target_kind = 'company' and t.applies_to in ('quote', 'invoice')
    and btrim(coalesce(case t.applies_to when 'quote' then s.default_quote_terms else s.default_payment_terms end, '')) <> ''
    and not exists (select 1 from public.terms_template_versions v where v.template_id = t.id);
end $$;

revoke all on function public.seed_commercial_terms(uuid) from public, anon, authenticated;
grant execute on function public.seed_commercial_terms(uuid) to service_role;

-- HIMARK only: other organisations and test fixtures are seeded by calling the function with the service role.
select public.seed_commercial_terms(o.id) from public.organizations o where o.id = '00000000-0000-4000-8000-000000000001';
