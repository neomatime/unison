create or replace function public.record_delivery_item_phase() returns trigger
language plpgsql security invoker set search_path = '' as $$
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
