-- Five tables predate this schema's convention of `revoke all ... from anon` on
-- every tenant table (see 20260912100000_requirements.sql and
-- 20260913110000_traceability_authenticated_grants.sql) and kept Supabase's
-- default grant of full privileges to anon: SELECT, INSERT, UPDATE, DELETE,
-- TRUNCATE, REFERENCES and TRIGGER.
--
-- This was defence in depth, not an open hole: RLS is enabled on all five and
-- every policy gates on is_member_of(), which anon cannot execute. But it left
-- unauthenticated callers one policy mistake away from tenant data, and
-- TRUNCATE ignores RLS entirely. No unauthenticated code path reads or writes
-- any of these tables (the only anonymous surface is the invitation_preview
-- function, which does not touch them), and the trigger functions that write
-- to them from other tables are security definer and unaffected by this.
--
-- authenticated keeps its existing grants; narrowing those is a separate
-- decision.
revoke all on
  public.frameworks,
  public.framework_phases,
  public.projects,
  public.delivery_items,
  public.project_dependencies
from anon;
