-- requirement_delivery_items and requirement_evidence (20260913100000) were
-- missing the anon revoke / to-authenticated convention every other
-- tenant-scoped table in this schema carries -- traced to that migration's
-- own comment mis-citing project_dependencies (which itself lacks this) as
-- its RLS precedent, instead of requirements (the correct, current
-- convention; see 20260912100000_requirements.sql). RLS was already enabled
-- and every policy already gated on is_member_of(), which anon cannot
-- execute -- so this closes a defense-in-depth gap, not a demonstrated leak.
--
-- Also drops two indexes added by 20260913100000 that duplicate the leading
-- column of each table's own unique constraint (requirement_id,
-- delivery_item_id) / (requirement_id, evidence_id) and add nothing Postgres
-- doesn't already have from that constraint's own index. The OTHER two
-- indexes from that migration (on delivery_item_id / evidence_id alone) are
-- NOT touched here -- they are not redundant and are load-bearing for FK
-- cascade lookups.

revoke all on public.requirement_delivery_items from anon;
revoke all on public.requirement_evidence from anon;
grant select, insert, delete on public.requirement_delivery_items to authenticated;
grant select, insert, delete on public.requirement_evidence to authenticated;

drop policy requirement_delivery_items_select on public.requirement_delivery_items;
drop policy requirement_delivery_items_insert on public.requirement_delivery_items;
drop policy requirement_delivery_items_delete on public.requirement_delivery_items;
create policy requirement_delivery_items_select on public.requirement_delivery_items
  for select to authenticated using (public.is_member_of(organization_id));
create policy requirement_delivery_items_insert on public.requirement_delivery_items
  for insert to authenticated with check (public.is_member_of(organization_id));
create policy requirement_delivery_items_delete on public.requirement_delivery_items
  for delete to authenticated using (public.is_member_of(organization_id));

drop policy requirement_evidence_select on public.requirement_evidence;
drop policy requirement_evidence_insert on public.requirement_evidence;
drop policy requirement_evidence_delete on public.requirement_evidence;
create policy requirement_evidence_select on public.requirement_evidence
  for select to authenticated using (public.is_member_of(organization_id));
create policy requirement_evidence_insert on public.requirement_evidence
  for insert to authenticated with check (public.is_member_of(organization_id));
create policy requirement_evidence_delete on public.requirement_evidence
  for delete to authenticated using (public.is_member_of(organization_id));

drop index public.requirement_delivery_items_requirement_idx;
drop index public.requirement_evidence_requirement_idx;
