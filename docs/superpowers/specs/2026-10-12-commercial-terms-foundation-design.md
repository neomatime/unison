# Commercial terms foundation

**Date:** 2026-10-12
**Status:** Approved, built (build 1)
**Build:** 1 of 3 of the "Dynamic Quotation & Invoice Terms Engine" brief.
Build 2 (offerings on documents, auto-populate, frozen wording on each document, invoice terms from the accepted
quote) and Build 3 (credit allocations) each get their own spec after this one is built.

## Why

Terms and conditions on a quote or invoice are free text typed into each document, plus two default text boxes in the
company settings. HIMARK now sells fixed offerings (four retainer tiers, five project categories, support services),
each with its own standard wording. That wording lives in people's heads and in pasted documents, so it drifts and
cannot be reviewed or approved.

This build creates the single, governed place where that wording lives: versioned, approved templates, layered from
company-wide terms down to a specific offering, with a rendered preview. It does **not** change the quote and invoice
forms. Build 2 connects the templates to documents.

## What the user asked for (agreed in the brainstorm)

- Terms live in the database, not in components. Administrators manage them under settings.
- Layers: company-wide terms, then offering terms, then project-category terms. (Engagement-specific and
  document-specific text are Build 2: they belong to a document, not to a template.)
- Template status draft / approved / archived, a version number, an effective date, a preview, restore of a previous
  approved version, and control over who may approve and publish.
- Only approved templates whose effective date has arrived are ever picked up automatically.
- Changing a template never rewrites a document that already used it (this build has nothing that uses a template yet;
  Build 2 freezes the wording onto each document, and this build makes that possible by making approved versions
  immutable).
- Offerings are identified by a stable key, never by project-name text.
- **Decided in the brainstorm:** owners and admins write, approve and archive; members can only use approved terms.
  Fees and credits inside the wording are **placeholders filled from the rate card**, not typed numbers. The wording
  the user supplied for the four retainer tiers and the project categories is loaded as **approved, effective
  2026-10-12**. Support services (Project Care, Managed Services, Recurring Content) get empty drafts.

## Scope

**In**
- Two new tables: `terms_templates` and `terms_template_versions`, with row-level security, audit, and rules that make
  an approved version immutable.
- Database functions for every change of state: create a template, save a draft, approve, archive, restore.
- Seeded content for the HIMARK organisation (below).
- A pure resolver in TypeScript that combines the layers, removes repeated lines and fills placeholders, plus a server
  query that loads the current approved versions.
- Admin screens under Settings: Commercial terms (list) and a template page (versions, draft editor, actions,
  rendered preview).
- Tests, unit and database.

**Out (explicitly)**
- Any change to the quote or invoice forms, tables, PDF or print. Existing documents and the two default text boxes in
  company settings keep working exactly as today. Build 2 retires those text boxes in favour of the company-wide
  template.
- Offering types, several offerings on one document, conflict detection between clauses (Build 2).
- Credit allocations, the work-size bands and the R2,500 credit rate (Build 3).
- Policies HIMARK has not approved. Nothing is invented for: quote validity beyond the existing company setting,
  late-payment penalty, termination period, intellectual-property transfer, credit expiry or rollover. They are
  absent until an administrator writes and approves them, and the final report lists them as missing policies.

## Data model

All tables carry `organization_id`, row-level security through `public.is_member_of` / `public.has_role`, and the
standard audit trigger (`record_audit_event`).

### `terms_templates`

One row per named set of terms.

| Column | Notes |
|---|---|
| `id` uuid | primary key |
| `organization_id` uuid | references organizations, on delete cascade |
| `target_kind` text | `company`, `retainer`, `project`, `support` (check) |
| `target_key` text | null for `company`. For `retainer` and `project` it is the rate card `package_key` (`signature`, `growth`, `private`, `reserve`, `operating_model`, ...). For `support` it is the service key (`website_care`, ...). Never derived from a title. |
| `applies_to` text | `quote`, `invoice`, `both` (check) |
| `title` text | shown in the admin list |
| `archived_at` timestamptz | a template can be retired as a whole |
| `created_at`, `updated_at` | |

Unique: one template per (`organization_id`, `target_kind`, `coalesce(target_key, '')`, `applies_to`).
`target_key` must be null exactly when `target_kind = 'company'` (check).
A `project` template may name a category that has no rate card row yet (`strategic_consulting`); the key is free text
validated by shape (`^[a-z0-9_]{1,60}$`), not by a foreign key, because the rate card is data and a category can be
terms-only. Build 2 decides how such a category is offered on a document.

### `terms_template_versions`

One row per version of a template's wording.

| Column | Notes |
|---|---|
| `id` uuid | primary key |
| `organization_id` uuid, `template_id` uuid | composite foreign key to the template, same organisation |
| `version` integer | assigned by the database: highest existing + 1, starting at 1 |
| `status` text | `draft`, `approved`, `archived` (check) |
| `body` text | the terms, one clause per line, at most 20,000 characters |
| `inclusions` text | the "service inclusions" list, one per line, at most 10,000 characters; may be empty |
| `effective_from` date | required once approved |
| `change_note` text | why this version exists, at most 500 characters |
| `created_by`, `created_at` | author |
| `approved_by`, `approved_at` | set by the approve function only |
| `archived_at` | set when archived |

Rules, enforced by a trigger and by function-only writes:
- At most **one draft per template** (partial unique index). Saving a draft updates it in place; there is no draft
  history.
- A version that is `approved` or `archived` can never have its `body`, `inclusions`, `effective_from`, `version`,
  `created_by` or approval fields changed. The only permitted change is approved to archived (setting `archived_at`).
  This is what lets Build 2 point a document at a version and know the wording behind it cannot move.
- An approved or archived version cannot be deleted. A draft can be deleted (discard).
- Approving requires a non-empty `body`, `effective_from` set, and a body and inclusions that pass the placeholder
  check below.
- `approved_by` must be the signed-in user and must be an owner or admin of the organisation.

No table writes by signed-in roles. `insert`, `update` and `delete` are revoked; signed-in roles go through the
functions below, which are security definer with an empty search path and check membership first.

### Who can see what (select policy)

- Owners and admins see every version, including drafts.
- Members see only versions with status `approved` or `archived` (they need archived ones to read the wording of an
  old document in Build 2) and never drafts.
- Templates themselves are visible to every member of the organisation.

## Database functions

All are `security definer set search_path = ''`, check `public.is_member_of` before anything else, then
`public.has_role(org, array['owner','admin'])` where noted, and are granted to `authenticated` only.

| Function | Who | What it does |
|---|---|---|
| `create_terms_template(p_org uuid, p_target_kind, p_target_key, p_applies_to, p_title)` | owner, admin | Creates the template. Token `TERMS_TEMPLATE_EXISTS` if the same target and scope already exist. |
| `save_terms_draft(p_template, p_body, p_inclusions, p_effective_from, p_change_note)` | owner, admin | Creates the draft (version = highest + 1) or updates the existing one. |
| `discard_terms_draft(p_template)` | owner, admin | Deletes the draft. |
| `approve_terms_version(p_version)` | owner, admin | Draft to approved; sets approver and time; validates placeholders and `effective_from`. |
| `archive_terms_version(p_version)` | owner, admin | Approved to archived. Always allowed: a template left with no current approved version simply offers no terms, and the admin list warns about it. |
| `restore_terms_version(p_version)` | owner, admin | Copies an approved or archived version into the template's draft (refuses if a draft exists: `TERMS_DRAFT_EXISTS`). The old version stays untouched; the copy must be approved again. |
| `seed_commercial_terms(p_org)` | service role only | Loads the seed content below. Used by the migration for the HIMARK organisation and by the database test fixtures. |

Error tokens (plain messages are added to the existing error map): `TERMS_TEMPLATE_EXISTS`, `TERMS_NOT_FOUND`,
`TERMS_NOT_DRAFT`, `TERMS_NOT_APPROVED`, `TERMS_DRAFT_EXISTS`, `TERMS_EMPTY`, `TERMS_EFFECTIVE_REQUIRED`,
`TERMS_PLACEHOLDER_UNKNOWN`, `TERMS_TOO_LONG`, `TERMS_FORBIDDEN`.

## Placeholders

A placeholder is `{{name}}`. The allowed names are fixed in one place per language and a test asserts the two lists
are identical:

| Placeholder | Filled from | Rendered as |
|---|---|---|
| `{{monthly_fee}}` | rate card `retainer.<key>.monthly` unit price | rand, e.g. `R100 000,00`, excluding VAT |
| `{{monthly_credits}}` | same row's `credits` | whole number |
| `{{initiative_limit}}` | same row's `initiative_limit` | whole number |
| `{{valid_days}}` | company setting `default_quote_valid_days` | whole number |
| `{{payment_days}}` | company setting `default_payment_days` | whole number |

- Approval fails with `TERMS_PLACEHOLDER_UNKNOWN` if the body or inclusions contain a `{{...}}` that is not in the
  list, so an unfilled brace can never be approved. The check is a database function and mirrored in TypeScript.
- If a placeholder has no value when rendering (for example `{{initiative_limit}}` for HIMARK Reserve, which has no
  limit), the resolver returns it in `missing` and the preview shows a warning; it never prints the braces.
- The `{{monthly_*}}` and `{{initiative_limit}}` values come from the retainer the template targets. They are only
  available to `retainer` templates; using them in another kind is a validation warning in the editor and a
  `missing` entry in the preview.

## Resolving the layers

`features/terms/resolve-terms.ts` is a pure module (no imports from the framework), covered by unit tests:

```
resolveTerms({ layers: ResolvedLayer[], values: PlaceholderValues }) =>
  { lines: string[], inclusions: string[], sources: Source[], missing: string[] }
```

- Input layers are given in order: company, then offering, then project category. Each carries the template, the
  version id and number, `body` and `inclusions`.
- A line is a non-empty trimmed line of `body`. Lines are filled, then compared case- and spacing-insensitively; the
  first occurrence wins and later repeats are dropped. `inclusions` are collected the same way and kept separate.
- `sources` lists, in order, the template id, version id and version number that contributed, so Build 2 can store
  them on a document.

`features/terms/queries/` loads the **current approved version** of each applicable template:
`status = 'approved'`, `effective_from <= today in South Africa`, highest `effective_from`, then highest `version`.
A template with no such version contributes nothing. Selection of which templates apply to a given offering is a
small function, `termsTargetsFor(kind, offering)`, that returns the company template for the document kind plus the
offering's own templates; Build 2 calls it from the quote form.

## Admin screens

Route `/settings/terms` (list) and `/settings/terms/[templateId]` (template). Linked from the organisation profile
next to the price list, in the same card style.

- **List:** grouped as Company, Strategic Partnerships, Projects, Care, Managed Services, Recurring Content (support
  services grouped by their rate card title). Each row shows title, applies to (quote / invoice / both), the current
  approved version number and effective date, and a badge: *Approved*, *Draft pending*, *No approved terms* (warning).
  An owner or admin sees a New template action.
- **Template page:**
  - Header with title, target and applies-to.
  - Version history: number, status, effective date, author, approver, change note.
  - Draft editor (owner/admin): body textarea (one clause per line), inclusions textarea, effective date, change
    note. Buttons: Save draft, Approve, Discard draft. A clear note that an approved version cannot be edited.
  - Version actions: Restore (copies into the draft), Archive.
  - **Preview:** renders the resolved terms for this template with its layers (for an offering: company layer plus
    this template) using current rate card values, listing any `missing` placeholders. Shows the body and the
    inclusions separately.
- Members open the same pages read-only and see approved and archived versions only.
- Forms follow the existing pattern: `useActionState`, errors shown from the plain-message map, a failed save keeps
  what was typed.
- Every control does what it says (a control in the UI is a claim the product supports it).

## Seeded content (HIMARK organisation)

Loaded by `seed_commercial_terms` as **approved**, version 1, effective 2026-10-12:

- **Company, quotes:** the organisation's current `default_quote_terms`, if any (copied as written; if empty, no
  version is created). **Company, invoices:** the current `default_payment_terms`, same rule. These two company
  templates sit alongside the existing settings text until Build 2 switches documents over, so for now the settings
  text boxes remain the source for new documents and the templates are the reviewed copy.
- **Retainer tiers** (`signature`, `growth`, `private`, `reserve`): the wording from the brief, with the fee, credits
  and active-initiative numbers replaced by placeholders (for example "The {{monthly_fee}} monthly retainer includes
  {{monthly_credits}} monthly credits ..."; Signature "up to {{initiative_limit}} agreed active business
  priorities"). These match the rate card (2, 4 and 6 initiatives; HIMARK Reserve has no limit and its wording does
  not use the placeholder).
- **Project categories:** Strategic Consulting (`strategic_consulting`), Operating Model & Operations Transformation
  (`operating_model`), Intelligence & AI Transformation (`intelligence_ai`), Digital Experience
  (`digital_experience`), Digital Presence (`digital_presence`), Visual Communication & Operations
  (`visual_communication`): the bullet wording from the brief, applies to quotes. The line "Do not automatically add
  monthly maintenance fees to standalone projects" is an instruction to the builders, not client wording, and is not
  seeded.
- **Support services** (the ten rate card services): an empty template with no version (the brief gives no wording).
  The list shows them as *No approved terms*, ready for an administrator to write.

Service inclusions for the retainer tiers are seeded from the inclusion sentences in the brief (engagement lead,
roadmap, TRACE assessments, working sessions and so on), listed one per line, separate from the terms body.

## Errors and edge cases

- Two admins edit the same draft: last save wins, and the page shows the saved time. (One draft per template; no
  merge.)
- Approving a version whose effective date is in the future: allowed; it becomes current on that date. The list shows
  "Approved, effective <date>" for the pending version.
- Archiving the current version leaves an older approved version current if one exists, otherwise the template offers
  nothing and the list says so.
- A template in another organisation is invisible and its functions refuse with `TERMS_NOT_FOUND`.
- A very long line is allowed (clauses can be long); only the totals are capped.
- Windows line endings in pasted text are normalised to `\n` on save.

## Testing

**Unit** (`node --test`):
- Resolver: layer order, duplicate removal (case, spacing), placeholder filling, `missing` reporting, empty layers,
  inclusions kept separate, sources in order.
- Version selection: effective-date and version tie-breaking, future-dated versions skipped, archived ignored,
  South Africa "today" boundary.
- Placeholder list in TypeScript equals the one in the migration; unknown names are rejected.
- Seed content: every approved retainer body resolves with no `missing` against the rate card values; Reserve's body
  has no `{{initiative_limit}}`; every seeded body passes the placeholder check.
- Admin screen source checks in the repo's existing style (controls present, owner/admin-only actions).

**Database** (RLS suite, against the live project, then cleaned up as the repo's rules require):
- A member can read approved terms and cannot read a draft, cannot call any write function (`TERMS_FORBIDDEN`).
- An outsider in another organisation sees nothing and cannot call anything.
- An approved version cannot be updated or deleted by any signed-in role, and the service role may only archive it.
- Approval sets approver and time, requires effective date and a valid body, and refuses an unknown placeholder.
- One draft per template; restore copies into the draft and refuses when a draft exists; version numbers increase.
- Archive and the "current version" rule with a future-dated version.
- Seed function: loads the expected templates, is service-role only, and is safe to run twice.

I will run both suites and report what actually ran. Database tests run against the production project (the only
environment) with fixture organisations deleted afterwards, including their audit rows, as for earlier builds.

## Files (indicative, finalised in the plan)

- `supabase/migrations/2026101215xxxx_commercial_terms.sql` (tables, rules, functions, seed for HIMARK)
- `features/terms/` (resolver, placeholder list, queries, actions, components)
- `app/(unison)/settings/terms/page.tsx`, `app/(unison)/settings/terms/[templateId]/page.tsx`
- link added on the organisation profile page
- tests under `tests/unit/` and `tests/integration/rls/`, and the cleanup sweep in
  `tests/integration/rls/helpers.ts` extended with the two new tables
- `docs/crm-roadmap.md` and `docs/follow-ups.md` updated

## Rulings made while planning and building

These differ from or add to the text above, and the built code follows them.

1. **`terms_templates.archived_at` is omitted.** No function or screen archives a whole template (versions are archived), so the
   column would claim something the product does not do.
2. **`create_terms_template` takes `p_org` first**, and a new error token `TERMS_TARGET_INVALID` exists for a target kind and key
   that do not fit together.
3. **Placeholders are validated at approval only, not at draft save.** The editor warns as you type; the database refuses at
   approval.
4. **A line with a missing placeholder value is left out** and returned in `skipped`. The result shape is
   `{ lines, inclusions, sources, missing, skipped }`.
5. **Deleting approved or archived versions is blocked for signed-in roles by revoked privileges, not by a row trigger,** because a
   row trigger would break the organisation-delete cascade. The update trigger applies to every role.
6. **A restored draft starts with no effective date.** It must be set before the draft can be approved.
7. **`terms_template_versions` has an `updated_at` column** so the page can show the draft's last saved time.
8. **The approve and discard functions take the template row lock first,** so a save cannot interleave with them.

## Open points carried to Build 2 (not blockers here)

- Strategic Consulting has terms but no rate card row; Build 2 decides how it is offered on a quote.
- The brief names "AI & Automation Operations" (from R35,000); the rate card calls the same R35,000 service
  "Operations Improvement Support". Build 2 needs the user's decision on the name.
- The brief's Project Care / Managed / Content "from" prices equal the rate card's proposed rates; Build 2 must show
  them as proposed, never as approved fixed charges.
