# Multi-tenancy

UNISON uses organizations as its tenant boundary. HIMARK is the first bootstrap organization and is defined in `config/tenants.ts` with the slug `himark`.

## Current implementation

- Shared organization, membership, invitation, and active-context types live in `types/tenancy.ts`.
- Domain exports live in `features/organizations`, `features/memberships`, and `features/invitations`.
- Pure tenant resolution and active-membership guards live in `lib/tenancy`.
- Roles and permissions live in `config/roles.ts` and `config/permissions.ts`.
- Integration specifications cover cross-tenant access, revoked memberships, role enforcement, and storage prefixes.

HIMARK is configuration-backed, not database-backed. No owner user is assigned because UNISON does not yet have authentication or a user identity to reference.

## Required persistence rules

When persistence is connected, every tenant-owned table must include `organization_id`. Uniqueness, foreign keys, storage paths, caches, jobs, webhooks, audit events, Atlas retrieval, and automation runs must all preserve this boundary.

The server must validate active membership for every request. Browser-provided organization identifiers are routing hints and must never be treated as authorization.

## Bootstrap migration

The first database seed should migrate `himarkTenant` into the organizations table without changing its stable ID or slug. The first verified HIMARK owner membership should be created only after an authenticated user identity exists.

