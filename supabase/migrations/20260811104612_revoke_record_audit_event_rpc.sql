-- record_audit_event is a trigger-only function (security definer, called
-- automatically by clients_audit). It must not be directly callable via
-- PostgREST RPC by anon/authenticated; trigger invocation is unaffected by
-- these grants.
revoke execute on function public.record_audit_event() from public;
revoke execute on function public.record_audit_event() from anon;
revoke execute on function public.record_audit_event() from authenticated;
