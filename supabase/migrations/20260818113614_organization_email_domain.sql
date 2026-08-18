-- Which email domain, if any, signs in to this organization via its identity
-- provider. Nullable on purpose: an organization without SSO has no domain and
-- claim_directory_membership() finds nothing for it. This is what keeps HIMARK
-- from being a hardcoded special case — a second tenant with Entra is an
-- update, not a deploy.
alter table public.organizations
  add column email_domain text unique
  check (email_domain is null or email_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$');

comment on column public.organizations.email_domain is
  'Bare lowercased email domain whose verified directory accounts auto-join this organization.';

update public.organizations
  set email_domain = 'himark.co.za'
  where id = '00000000-0000-4000-8000-000000000001';
