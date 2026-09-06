-- Test-only bridge: lets the RLS test suite temporarily remove and restore
-- project_dependencies_cycle_guard (20260907100500_project_dependency_cycle_guard.sql),
-- to prove that project_dependencies_no_self_check -- the CHECK constraint --
-- is still an independent backstop for self-edges, not merely unreachable
-- dead code that the trigger happens to make redundant.
--
-- Why this is needed: project_dependencies_cycle_guard is a BEFORE ROW
-- trigger, and BEFORE ROW triggers fire before CHECK constraints are
-- evaluated. For a self-edge (dependent_project_id = prerequisite_project_id)
-- the trigger's own cycle walk always catches it first (depth 1), so with the
-- trigger present there is no way to observe the constraint firing at all --
-- see the amended assertion in
-- tests/integration/rls/project-dependencies.test.ts. The only way to prove
-- the constraint alone still rejects self-edges is to remove the trigger,
-- attempt the insert, and put the trigger back.
--
-- supabase-js talks to this project only through PostgREST, which exposes no
-- DDL surface (no raw SQL execution, no ALTER/DROP TRIGGER endpoint) -- so
-- the test's admin client needs a SECURITY DEFINER bridge to do this, the
-- same shape as public.rls_test_give_azure_identity()
-- (20260818171200_rls_test_give_azure_identity.sql /
-- 20260818224500_fence_rls_test_give_azure_identity.sql): restricted to
-- service_role both by grant and by an explicit auth.role() check, so it can
-- never be reached by an authenticated end user, and scoped to this one named
-- trigger rather than accepting arbitrary SQL.
--
-- The trigger function itself (public.project_dependencies_reject_cycle()) is
-- never dropped -- only the trigger binding -- so recreation is the same
-- single `create trigger` statement the migration used.
create or replace function public.rls_test_set_project_dependencies_cycle_guard(enabled boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'rls_test_set_project_dependencies_cycle_guard is for the test suite only' using errcode = '42501';
  end if;

  drop trigger if exists project_dependencies_cycle_guard on public.project_dependencies;

  if enabled then
    create trigger project_dependencies_cycle_guard
      before insert or update on public.project_dependencies
      for each row execute function public.project_dependencies_reject_cycle();
  end if;
end $$;

revoke execute on function public.rls_test_set_project_dependencies_cycle_guard(boolean) from public, anon, authenticated;
grant execute on function public.rls_test_set_project_dependencies_cycle_guard(boolean) to service_role;
