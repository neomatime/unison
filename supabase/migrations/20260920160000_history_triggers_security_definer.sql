-- record_framework_version() and record_delivery_item_phase() were created
-- security invoker (20260910130104_core_delivery_governance.sql), but the two
-- tables they write grant signed-in users SELECT only. The insert therefore ran
-- as the caller and was refused by row-level security (42501) whenever a
-- tracked field genuinely changed: every framework edit and every
-- delivery-item phase change by an app user failed with "The framework could
-- not be saved" / a refused phase change, and both history tables have never
-- held a row.
--
-- The fix is to run the two functions with their owner's rights, deliberately
-- NOT to add INSERT policies: a policy would let any member forge history.
-- As trigger functions they can only fire from an UPDATE the caller was already
-- permitted to make on the base table, they write only values derived from that
-- row, and changed_by still comes from auth.uid() (a request setting, unaffected
-- by the role switch). search_path is already pinned to '' and every reference
-- below is schema-qualified, which is what makes security definer safe here.
-- Bodies are unchanged from the original migration.

create or replace function public.record_framework_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if row(new.name,new.type,new.version,new.archived_at,new.level_1_label,new.level_2_label)
     is distinct from row(old.name,old.type,old.version,old.archived_at,old.level_1_label,old.level_2_label) then
    insert into public.framework_versions(organization_id, framework_id, version, snapshot, changed_by)
    values (new.organization_id, new.id, new.version, to_jsonb(old), auth.uid());
  end if;
  return new;
end $$;

create or replace function public.record_delivery_item_phase() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.current_phase_id is distinct from old.current_phase_id then
    insert into public.delivery_item_phase_history(organization_id, delivery_item_id, from_phase_id, to_phase_id, changed_by)
    values (new.organization_id, new.id, old.current_phase_id, new.current_phase_id, auth.uid());
  end if;
  return new;
end $$;
