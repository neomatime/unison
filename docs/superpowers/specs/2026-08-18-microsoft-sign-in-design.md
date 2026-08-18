# Microsoft sign-in — design

**Date:** 2026-08-18
**Status:** Approved
**Scope:** Replace the demo "Continue with Microsoft" button with real Entra ID authentication, and grant HIMARK staff a membership automatically on first sign-in.

## Context

`features/auth-ui/auth-screen.tsx` renders a "Continue with Microsoft" button that sets local state and displays *"Microsoft authentication is represented as a complete UI flow and is ready for identity-provider integration."* It touches nothing.

Everything else in the auth path is real: sign-in, sign-out, the proxy's route gating, per-request tenant resolution through `lib/tenancy`, invitations with hashed tokens, and invited-newcomer signup.

## Decisions

| Question | Decision |
|---|---|
| Whose Microsoft accounts | HIMARK staff only — a single-tenant Entra app |
| First sign-in with no membership | Auto-join HIMARK as `member` |
| Where the auto-join happens | A `security definer` RPC the callback calls |

### Why single-tenant

A single-tenant app registration makes Microsoft reject non-HIMARK accounts before any UNISON code runs. That is a stronger and simpler guarantee than anything enforced in application logic, and it matches the present reality: HIMARK is the only organization, and its staff already have Microsoft accounts. Multi-tenant SSO, where a client signs in from their own directory, is a different system and should wait until a client asks for it.

### Why auto-join

Anyone who authenticates against HIMARK's directory is by definition HIMARK staff, so requiring a separate invitation as well would be a redundant step. Onboarding an employee becomes zero-touch: they sign in.

The consequence must be stated plainly: **the Entra directory becomes the access control for UNISON.** A membership outlives the directory account that created it, so removing someone from Microsoft does not remove them from UNISON. Offboarding must revoke the membership too.

### Why an RPC rather than a trigger

A trigger on `auth.users` would fire for every new user regardless of entry path, and would collide with the invitation flow: an invited user already receives a membership from `accept_invitation`, so a trigger would attempt a second one and violate the unique constraint. An RPC is scoped to exactly the Microsoft path, and keeps authorisation in SQL where the RLS suite can exercise it — matching `accept_invitation` and `delete_organization`.

## 1. Configuration

A **second Entra app registration**, separate from the mail one. That app sends mail as a daemon with no user present; this one authenticates people interactively and needs a redirect URI. Sharing a registration would mean one secret whose compromise costs both capabilities.

- Single tenant
- Redirect URI, platform Web: `https://nwdzpjzllhhqwawmsxjd.supabase.co/auth/v1/callback`

That URI belongs to Supabase, not to UNISON. Microsoft returns the user to Supabase, which then hands off to the app. A wrong value here is the most common cause of a broken OAuth setup and fails with an unhelpful error.

In the Supabase dashboard, **Authentication → Providers → Azure**: enable, set the client ID and secret, and set the Azure Tenant URL to `https://login.microsoftonline.com/fb3fa087-3378-4b7c-be4e-3ecbfbfc0f4b`.

Under **Authentication → URL Configuration**, add `http://localhost:3002/**` to the redirect allow-list. A real domain replaces it at deployment.

No admin consent is required. Signing a user in and reading their basic profile is delegated and consented by the user; nothing resembling `Mail.Send` is involved.

### Proxy exemption

`proxy.ts` sends unauthenticated requests to `/sign-in`. The OAuth return lands on `/auth/callback` *before* a session cookie exists, so without an exemption the proxy bounces the callback and the loop never closes — presenting as a redirect loop that looks like a Microsoft misconfiguration. `/auth/callback` joins the exemption list alongside `/accept-invitation`, `/verify-email` and `/reset-password`.

## 2. Schema

### `organizations.email_domain`

A nullable, unique column holding a bare lowercased domain such as `himark.co.za`. HIMARK's value is set in the same migration.

Nullable is meaningful: an organization without SSO has no domain and the claim function finds nothing for it. This is what prevents HIMARK being a hardcoded special case — a second tenant with Entra is an `update`, not a deploy.

### `claim_directory_membership()`

`security definer`, `set search_path = ''`, fully schema-qualified, `execute` revoked from `public` and `anon` and granted only to `authenticated`. It takes no arguments: every input derives from the caller's own session, so there is nothing to forge.

Order of operations:

1. Require `auth.uid()`; require the caller's email to be confirmed.
2. Require the caller to hold an identity with provider `azure` in `auth.identities`. Without this check, anyone who obtained a `@himark.co.za` address by another route could grant themselves access. The function must do exactly one thing.
3. Derive the domain from the verified email; find an active organization whose `email_domain` matches. No match returns null.
4. If a membership already exists: `active` returns the organization id and changes nothing; `suspended` or `removed` **raises** with a distinct SQLSTATE.
5. Otherwise insert an active `member` membership and write an audit event recording directory sign-in as the origin.

The two rejection modes differ deliberately. No matching organization is an ordinary outcome — an unknown domain, nothing to report — so it returns null. A suspended or removed membership is an *attempt by a revoked account to regain access*, which is worth surfacing distinctly in logs rather than being indistinguishable from a stranger. The **user-facing message is identical in both cases**; only the server-side signal differs. Telling a removed employee that their account exists but is suspended is information they do not need.

**Step 4 is the security-critical branch.** A removed employee's Entra account keeps working, so this function declining to reactivate them is the only thing between them and the data. `accept_invitation` had exactly this defect in its first draft, where an invitation could silently resurrect a revoked membership.

The function only ever inserts, never updates, which also keeps it clear of `enforce_membership_role_change` and the last-owner guard rather than fighting them.

## 3. Application

### Callback route

`app/auth/callback/route.ts` exchanges the code for a session, calls `claim_directory_membership()`, and routes on the result.

### Sign-in button

`MicrosoftSignIn` calls `signInWithOAuth({ provider: 'azure' })` instead of setting local state. Markup, classes and copy are unchanged; this is a behaviour change only.

### Rejection path

A caller who authenticates successfully but receives no membership — wrong domain, or a removed employee — holds a valid session with no access. Left alone every route bounces them to `/join-organization`, which is still a non-functional demo screen, producing a loop with no exit.

The callback therefore **signs them out** and returns to `/sign-in` with a message stating their Microsoft account is not linked to a UNISON organization. Ending the session is the point: a half-authenticated user with nowhere to go is worse than a clean rejection, and a removed employee should not retain a session inside the app.

### Identity linking — verify before building the rest

`neo.matime@himark.co.za` already exists as an email-and-password account. When that person signs in with Microsoft, Supabase should attach the Azure identity to the existing user.

If it instead creates a second user, the result is one human with two accounts — an owner membership on one, a fresh `member` membership on the other — and the symptom is losing owner rights by signing in the "wrong" way. Supabase's linking behaviour depends on whether the existing email is confirmed. **This is verified empirically against the live project first, and the answer gates the rest of the work.** If linking does not happen automatically, the design needs revisiting before the button ships.

## 4. Testing

RLS specs for each branch of the claim function:

- no Azure identity — refused
- unconfirmed email — refused
- matching domain with an Azure identity — membership created
- already active — idempotent, no mutation
- suspended or removed — refused, **not reactivated**
- no organization with a matching domain — returns null

Fixtures cannot perform a real Microsoft sign-in, so they insert an `auth.identities` row with provider `azure` through the service role. That is faithful to what the function reads, but it proves the **authorisation rules, not the OAuth handshake**. The handshake is verified once in a browser by a real sign-in.

Fixtures must clean up everything they create, including `auth.identities` rows and any `audit_events` the claim writes — `tests/integration/rls/helpers.ts` already enforces this discipline for organizations, clients and memberships, and its in-code comment must be extended rather than silently outgrown.

## Definition of done

- `tsc --noEmit` clean, `pnpm build` passing, offline and RLS suites green
- A real Microsoft sign-in from a HIMARK account reaches `/overview` with a membership
- Signing in with an account that has no matching organization ends in a clean rejection, not a loop
- Identity linking confirmed: signing in with Microsoft as an existing email-and-password user does not create a second account

## Out of scope

- Multi-tenant SSO, where a client organization signs in from its own Entra directory
- Per-organization Entra configuration and the admin UI to manage it
- Automatic membership revocation when someone leaves the Entra directory — offboarding stays manual, and is recorded as a risk above
- Role assignment from Entra groups; owners and admins are still promoted deliberately
