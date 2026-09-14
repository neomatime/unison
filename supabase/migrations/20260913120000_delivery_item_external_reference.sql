-- The other two columns this slice needs already exist, unused since the
-- table's original build (20260906150000_delivery_items.sql): "Plumbing for
-- later external identity mapping. Null throughout the pilot, invisible to
-- users, claims nothing." This is that later. See
-- docs/superpowers/specs/2026-09-13-integrations-design.md.
alter table public.delivery_items
  add column external_url text;

alter table public.delivery_items
  add constraint delivery_items_source_system_check
  check (source_system is null or source_system in ('Azure DevOps', 'Jira'));

comment on column public.delivery_items.source_system is
  'Which external tracker this item maps to, or null. Constrained to (''Azure DevOps'', ''Jira'') -- see delivery_items_source_system_check.';
comment on column public.delivery_items.external_reference is
  'The external tracker''s own id/key for this item (e.g. a work item number or issue key). Free text: no format is enforced.';
comment on column public.delivery_items.external_url is
  'A direct link to the item in its external tracker, or null. All three of source_system/external_reference/external_url are independently optional -- no cross-field requirement.';
