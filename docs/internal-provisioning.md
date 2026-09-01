# HIMARK internal client provisioning

The HIMARK internal administration surface is available under `/internal` and is isolated from every tenant workspace. It has a dedicated entry at `/internal/sign-in` while continuing to use the existing Supabase Auth session. Access is restricted server-side to active HIMARK `owner` and `admin` memberships; ordinary HIMARK members and client-tenant users cannot enter provisioning.

An unauthenticated request to any `/internal/*` route is returned to the dedicated internal sign-in page with its complete relative destination preserved in `next`. Email/password and Microsoft sign-in both continue to that destination after authentication. The internal resolver selects the user's HIMARK administrator membership independently of the currently selected client tenant, and internal sign-out returns to `/internal/sign-in`.

## Routes

- `/internal/sign-in` — dedicated HIMARK administrator sign-in.
- `/internal/overview` — cross-tenant operational summary.
- `/internal/organisations` — organisation register and internal metadata actions.
- `/internal/provisioning` — client provisioning register.
- `/internal/provisioning/new` — new six-stage provisioning journey.
- `/internal/provisioning/[provisioningId]` — continue an existing setup.
- `/internal/tenants` — provisioned tenant operations.
- `/internal/subscriptions` — UI-only tier and subscription controls.
- `/internal/support` — support-ticket register.
- `/internal/knowledge` — internal operating guidance.

## Entitlement model

`config/unison-tiers.ts` defines the four tiers and module groups once. The wizard consumes it for tier cards, activation controls, review counts, downgrade reconciliation, and tier-impact previews.

- Core: Delivery plus Team.
- Framework: Core plus Operations.
- Enterprise: Framework plus Commercial and Finance.
- Strategic Enterprise: the client-configured tier. It currently receives the full Enterprise module set until the Strategic tenant-configuration layer is implemented, at which point a Strategic tenant's modules come from its own configuration rather than from a fixed list. The equality is a temporary implementation state, not a product rule.

All Delivery modules and Team are locked on. Optional entitled modules may be disabled. Modules outside entitlement cannot be activated. Disabled modules are described as hidden without deleting data.

## Persistence boundary

Most of this surface is still UI/UX only. This section used to say "No migration, schema, RLS, new Supabase service, or payment integration was added"; two migrations and a schema change later, that is no longer true, and the boundary now runs as follows.

Provisioning persists: `provision_organization()` (a `security definer` RPC, HIMARK owner/admin or `service_role` only) creates the organisation, seeds its six delivery frameworks and their phases, and writes the primary administrator's owner invitation. The tier-entitlement slice then added `organizations.tier` — a `not null text` column defaulting to `'core'`, constrained to the four tier ids — written by the same RPC from the tier the wizard selects, and read per request to decide which modules a tenant's navigation and routes expose. So migrations, a schema change and RLS-governed rows are all part of this feature now.

Still not persisted, and still resetting on refresh: module activation, delivery setup, initial users beyond the primary administrator, access toggles, go-live, Save Draft, subscription changes, and every tier change offered outside the provisioning wizard. No payment integration exists. The success screen names the organisation, its administrator and the stored tier, and explicitly declines to claim the rest.

The dedicated sign-in page reuses the existing email/password and Microsoft authentication actions; only destination routing and the existing-membership authorization gate changed. Connecting persistence later must keep the order `Tier Entitlement → Tenant Module Activation → User Permissions` and scope every operation to the target organisation.

Tenant `Operations → Onboarding` is a separate client feature and was not modified or replaced.
