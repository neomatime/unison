-- Fix round 1 on delivery_items (20260906150000_delivery_items.sql), which is
-- already applied and is never edited. Three things this migration does:
--
-- 1. Documents, on the constraint itself, why
--    delivery_items_project_framework_fkey has no `on update cascade`.
-- 2. Attaches the status/health documentation to the constraints they each
--    actually describe -- the original migration's inline `--` comment about
--    health sits above delivery_items_status_check, not
--    delivery_items_health_check, because it was written directly above the
--    check it explains the *absence from*, not the one it belongs to. Since
--    that file can't be edited, the correction lives here as real `comment on
--    constraint` (pg_description), which is what a reader actually consults
--    (`\d+ delivery_items`, or pg_constraint), not the frozen source comment.
-- 3. Adds `to authenticated` to the three delivery_items policies, matching
--    the role clause on 23 of the repo's other 26 policies. is_member_of is
--    already revoked from anon (20260811094621_rls_helpers_and_policies.sql),
--    so an anonymous request already failed closed with 42501 rather than
--    returning an empty set -- this is a consistency fix, not a security one.

comment on constraint delivery_items_project_framework_fkey on public.delivery_items is
  'Deliberately no "on update cascade". A delivery item''s current_phase_id belongs to framework_id''s set of phases; re-pointing the project at a different framework would leave those phases meaningless for items still recorded under the old one. So the change is refused (raises 23503) rather than silently cascaded or nulling data out from under the items. updateProjectAction is expected to turn that 23503 into a specific, human refusal rather than the generic save-failed message -- see delivery-items plan Task 4.';

comment on constraint delivery_items_status_check on public.delivery_items is
  'Not Started / In Progress / Blocked / Complete -- where the work stands.';

comment on constraint delivery_items_health_check on public.delivery_items is
  'Healthy / Watch / At Risk / Critical. "On Track" is deliberately absent: status already carries schedule, including Blocked, so allowing both could render an item "Blocked / On Track".';

drop policy delivery_items_select on public.delivery_items;
create policy delivery_items_select on public.delivery_items
  for select to authenticated using (public.is_member_of(organization_id));

drop policy delivery_items_insert on public.delivery_items;
create policy delivery_items_insert on public.delivery_items
  for insert to authenticated with check (public.is_member_of(organization_id));

drop policy delivery_items_update on public.delivery_items;
create policy delivery_items_update on public.delivery_items
  for update to authenticated
  using (public.is_member_of(organization_id))
  with check (public.is_member_of(organization_id));
