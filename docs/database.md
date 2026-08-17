# Database

UNISON is backed by a Supabase Postgres project. Schema changes live as ordered SQL files in `supabase/migrations/`, applied through the Supabase MCP rather than the Supabase CLI. There is no `database/` directory — it was a reserved placeholder before Supabase was introduced and has been removed now that `supabase/migrations/` is real.

## Applying a migration

Each migration file is named `<version>_<name>.sql`, where `<version>` is a UTC timestamp (`YYYYMMDDHHMMSS`). Apply a migration through the MCP `apply_migration` tool rather than editing the database by hand; Supabase assigns the authoritative version when the migration is applied, and the local filename's version prefix must be updated to match exactly. Use `list_migrations` to confirm the applied version before renaming a local file.

## Schema

- `organizations` — tenant boundary. `status` is `active | suspended | archived`. Deletable only through `public.delete_organization(uuid)` (owner-only, or `service_role`); there is no delete RLS policy or generic delete path.
- `memberships` — links `auth.users` to `organizations` with a `role_id` (`owner | admin | member`) and `status` (`invited | active | suspended | removed`). The `enforce_membership_role_change` trigger blocks any `role_id` change unless the caller holds the `owner` role — admins may manage members but may not change roles, including their own.
- `invitations` — pending/accepted/expired/revoked invites, one pending invite per email per organization, consumed by the `accept_invitation` RPC.
- `audit_events` — append-only log written by triggers (`record_audit_event`) and `delete_organization`. `organization_id` is nullable with `on delete set null`: when an organization is deleted, its audit history — including the record of the deletion itself — survives with `organization_id = null` rather than being cascaded away. RLS naturally restricts reading orphaned rows to the service role, since no membership has a null `organization_id`.
- `clients` — the one product-UI table currently backed by the database. Tenant-scoped, audited via the `clients_audit` trigger, indexed on `(organization_id, archived_at)` and a trigram index on `name` for search.

## Row-level security

`public.is_member_of(org)` and `public.has_role(org, roles)` are `security definer` helpers that check `memberships` directly (not JWT claims), so revoking a membership takes effect immediately rather than waiting for token refresh. Policies on `organizations`, `memberships`, `invitations`, `audit_events`, and `clients` are built from these two helpers. See `supabase/migrations/20260811094621_rls_helpers_and_policies.sql` and `supabase/migrations/20260811102640_clients.sql` for the exact policies.

## Seeding

HIMARK is seeded by migration (`supabase/migrations/20260811174047_seed_himark.sql`) with the same stable id and slug as the former `config/tenants.ts` placeholder. The first verified owner membership is granted with `pnpm grant-owner <email>` (see `docs/development.md`), not by migration — it requires a real, email-verified `auth.users` row to reference.
