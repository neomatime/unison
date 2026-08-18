-- Reset unison-uat from the superseded booking schema.
-- Every table was empty at the time of this migration; the prior definitions
-- are archived at docs/reference/legacy-booking-schema.sql.

drop table if exists public.booking_status_history cascade;
drop table if exists public.booking_participants cascade;
drop table if exists public.bookings cascade;
drop table if exists public.service_provider_assignments cascade;
drop table if exists public.service_price_history cascade;
drop table if exists public.services cascade;
drop table if exists public.service_categories cascade;
drop table if exists public.client_addresses cascade;
drop table if exists public.client_contacts cascade;
drop table if exists public.clients cascade;
drop table if exists public.team_leave cascade;
drop table if exists public.team_invites cascade;
drop table if exists public.team_availability cascade;
drop table if exists public.notifications cascade;
drop table if exists public.audit_logs cascade;
drop table if exists public.users cascade;
drop table if exists public.firms cascade;

drop function if exists public.custom_access_token_hook(jsonb) cascade;
