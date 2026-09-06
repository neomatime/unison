-- Phases become archivable rather than deletable.
--
-- projects_phase_fkey is ON DELETE SET NULL (phase_id), so deleting a phase
-- would silently blank the current phase of every project sitting in it --
-- the same silent-erasure shape as the owner defect fixed in PR #2. Archiving
-- preserves the record: a project already in the phase keeps pointing at it
-- and still displays it, while pickers hide it. There is deliberately no
-- delete policy on this table, and this migration does not add one.
alter table public.framework_phases
  add column archived_at timestamptz;

comment on column public.framework_phases.archived_at is
  'Set when a phase is retired. Never delete a phase: projects_phase_fkey is ON DELETE SET NULL (phase_id), so a delete blanks the current phase of every project in it.';

create index framework_phases_active_idx
  on public.framework_phases (framework_id, archived_at);

-- Reordering has to happen inside one transaction.
--
-- framework_phases_position_unique (framework_id, position) means a naive swap
-- violates the constraint mid-flight, and every PostgREST .update() is its own
-- transaction, so nothing outside Postgres can hold the intermediate state.
-- This writes negative positions first and then flips them positive; both
-- statements run in this function's single transaction, so the unique
-- constraint is never violated and no intermediate state is observable.
--
-- The array must be exactly the framework's phase set -- archived phases
-- included -- so positions stay contiguous across all of a framework's phases
-- and no phase can be silently dropped from the order.
create or replace function public.reorder_framework_phases(
  p_framework_id uuid,
  p_phase_ids uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path to ''
as $$
declare
  v_org uuid;
  v_total integer;
  v_matched integer;
begin
  select organization_id into v_org
  from public.frameworks
  where id = p_framework_id;

  if v_org is null then
    raise exception 'framework not found' using errcode = '42704';
  end if;

  if not public.is_member_of(v_org) then
    raise exception 'not a member of that organization' using errcode = '42501';
  end if;

  select count(*) into v_total
  from public.framework_phases
  where framework_id = p_framework_id;

  -- Catches a short list and an over-long one.
  if coalesce(array_length(p_phase_ids, 1), 0) is distinct from v_total then
    raise exception 'phase list must contain every phase of the framework exactly once'
      using errcode = '22023';
  end if;

  -- Catches duplicates and ids belonging to another framework: `= any(...)`
  -- matches each row at most once, so either case leaves v_matched short.
  select count(*) into v_matched
  from public.framework_phases
  where framework_id = p_framework_id
    and id = any(p_phase_ids);

  if v_matched is distinct from v_total then
    raise exception 'phase list must contain every phase of the framework exactly once'
      using errcode = '22023';
  end if;

  update public.framework_phases p
  set position = -(sub.new_position::int)
  from unnest(p_phase_ids) with ordinality as sub(id, new_position)
  where p.id = sub.id and p.framework_id = p_framework_id;

  update public.framework_phases
  set position = -position
  where framework_id = p_framework_id and position < 0;
end $$;

-- Grants must be restated on every create or replace -- they do not carry
-- forward. No service_role grant: the only caller is a signed-in member
-- through a server action, and is_member_of() reads auth.uid(), which is null
-- under service_role, so a service_role grant would be a grant to a caller
-- the body would then refuse.
revoke all on function public.reorder_framework_phases(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_framework_phases(uuid, uuid[]) to authenticated;
