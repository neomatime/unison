-- Fix round 1 on reorder_framework_phases (20260906120000).
--
-- That migration's comment claimed "no intermediate state is observable"
-- from writing negative positions and then flipping them back. That is
-- false: framework_phases_audit (20260826103710_delivery_frameworks.sql)
-- is an AFTER ROW trigger calling record_audit_event(), which snapshots
-- to_jsonb(new) on every UPDATE. The two-statement reorder therefore
-- writes 2 audit rows per phase touched, including a row recording the
-- negative position -- a state that was never a committed, queryable
-- state of framework_phases, but that IS permanently recorded in the
-- audit trail. This migration corrects that claim below and narrows the
-- first UPDATE so a phase whose position is already correct is not
-- touched at all, which also means it produces no audit rows.
--
-- Scoping is safe: p_phase_ids has already been checked (in the body
-- above, unchanged) to be a permutation of exactly this framework's
-- phase ids. Under a permutation, each final position P is held by
-- exactly one phase. A phase that already holds P and keeps holding P
-- cannot collide with the phase that is moving into P, because that
-- other phase currently holds some other position. Restricting the
-- first UPDATE to rows whose position actually changes therefore cannot
-- reintroduce the mid-flight unique-constraint violation the two-step
-- negative/positive dance exists to avoid.
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

  -- Only rows that actually move get written. A phase already sitting at
  -- its target position is skipped -- see the permutation argument above
  -- for why that can never collide with a phase moving into that spot.
  update public.framework_phases p
  set position = -(sub.new_position::int)
  from unnest(p_phase_ids) with ordinality as sub(id, new_position)
  where p.id = sub.id
    and p.framework_id = p_framework_id
    and p.position is distinct from sub.new_position::int;

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
