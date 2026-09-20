-- Corrects 20260920160000_history_triggers_security_definer.sql, which redefined
-- record_delivery_item_phase() from the ORIGINAL body in
-- 20260910130104_core_delivery_governance.sql and so silently reverted the
-- later fix in 20260910172929_preserve_phase_history_on_phase_delete.sql.
--
-- That fix exists because deleting a framework phase sets every item's
-- current_phase_id to null (ON DELETE SET NULL), which fires this trigger; the
-- history row must not name a phase that has just been deleted, or its own
-- foreign key refuses the insert and the phase can no longer be deleted.
-- The body below is 20260910172929's, unchanged, with security definer as in
-- 20260920160000. (record_framework_version() has a single definition and was
-- reproduced faithfully there.)
create or replace function public.record_delivery_item_phase() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  previous_phase_id uuid;
begin
  if new.current_phase_id is distinct from old.current_phase_id then
    select id
      into previous_phase_id
      from public.framework_phases
     where id = old.current_phase_id;

    insert into public.delivery_item_phase_history(
      organization_id,
      delivery_item_id,
      from_phase_id,
      to_phase_id,
      changed_by
    )
    values (
      new.organization_id,
      new.id,
      previous_phase_id,
      new.current_phase_id,
      auth.uid()
    );
  end if;
  return new;
end $$;
