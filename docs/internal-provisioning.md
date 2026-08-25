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
- Strategic Enterprise: the same full current software entitlement as Enterprise.

All Delivery modules and Team are locked on. Optional entitled modules may be disabled. Modules outside entitlement cannot be activated. Disabled modules are described as hidden without deleting data.

## Persistence boundary

This phase is UI/UX only. No migration, schema, RLS, new Supabase service, or payment integration was added. The dedicated page reuses the existing email/password and Microsoft authentication actions; only destination routing and the existing-membership authorization gate changed. The in-browser provisioning flows reset on refresh. Connecting persistence later must keep the order `Tier Entitlement → Tenant Module Activation → User Permissions` and scope every operation to the target organisation.

Tenant `Operations → Onboarding` is a separate client feature and was not modified or replaced.
