-- The fourth integrity rule from §6: no cycles. A -> B, B -> A and
-- A -> B, B -> C, C -> A must both be rejected.
--
-- This cannot be a constraint. Postgres has no declarative way to forbid a
-- cycle in a self-referencing edge table, so it is a trigger running a
-- recursive CTE from the new dependent back through its prerequisites.
create or replace function public.project_dependencies_reject_cycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The trigger alone is NOT enough. Two transactions can each insert an edge
  -- that is individually acyclic but jointly forms a cycle, because neither
  -- sees the other's uncommitted row. This lock serialises dependency writes
  -- within one organisation for the rest of the transaction.
  --
  -- Chosen over `serializable` isolation because it is cheaper and scoped: it
  -- blocks only concurrent dependency edits in the same tenant, and those are
  -- rare. A rule that only holds when nobody else is working is not a rule.
  perform pg_advisory_xact_lock(hashtext(new.organization_id::text));

  -- Walk forward from the prerequisite: what does IT ultimately depend on? If
  -- that walk reaches the dependent, adding this edge closes a loop.
  if exists (
    with recursive upstream as (
      select new.prerequisite_project_id as project_id, 1 as depth
      union all
      select d.prerequisite_project_id, u.depth + 1
      from public.project_dependencies d
      join upstream u on d.dependent_project_id = u.project_id
      -- A depth cap is a backstop, not the mechanism: existing data is acyclic
      -- by this same trigger, so the walk terminates. It bounds the damage if
      -- a cycle ever reaches the table another way.
      where u.depth < 100
    )
    select 1 from upstream where project_id = new.dependent_project_id
  ) then
    raise exception
      'This would create a circular dependency between projects.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.project_dependencies_reject_cycle() is
  'Rejects edges that would close a dependency loop. Takes a per-organisation advisory lock first, because two concurrent individually-acyclic inserts can jointly form a cycle.';

create trigger project_dependencies_cycle_guard
  before insert or update on public.project_dependencies
  for each row execute function public.project_dependencies_reject_cycle();
