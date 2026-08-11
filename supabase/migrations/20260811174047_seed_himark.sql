-- Migrates config/tenants.ts himarkTenant into the database, preserving its
-- stable id and slug exactly as docs/tenancy.md requires.
insert into public.organizations (id, name, slug, status, created_at)
values ('00000000-0000-4000-8000-000000000001', 'HIMARK', 'himark', 'active', '2026-08-10T00:00:00.000Z')
on conflict (id) do nothing;
