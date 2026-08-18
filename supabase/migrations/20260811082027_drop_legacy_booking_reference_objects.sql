-- Fix round 1 for task-2 review finding 1: the original reset migration's
-- DROP list (from the task-2 brief) was incomplete. It missed the booking
-- product's reference-number generator function and its backing sequence,
-- neither of which is owned by pg_trgm or btree_gist. Drop them now so
-- `public` is a genuinely clean schema before later UNISON tasks build on it.

drop function if exists public.generate_booking_reference() cascade;
drop sequence if exists public.booking_reference_seq;
